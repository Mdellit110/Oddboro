// A buzz on the owner's phone when something new lands on the desk (Web Push).
//
// The owner turns it on per phone, on the phone desk (`/desk`): the phone asks
// its own push service for an address and the page hands the office that
// address. When an ask, task or report arrives that was not on the desk
// before, the office sends each address an empty push, signed with the
// office's own key (VAPID). Empty, so nothing of the desk leaves: the phone's
// service worker (`static/desk-push.js`) shows a fixed line and opens the
// desk. The key and the addresses live in the system's secret store, never in
// Postgres or a file.
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  type JsonWebKey
} from 'node:crypto';
import { desk } from '@oddboro/ledger';
import { deskKeys } from '#lib/desk.ts';
import { deleteSecret, getSecret, setSecret } from '@oddboro/ledger/secrets';
import { bus, listen, type OfficeEvent } from './events.ts';

const SECRET = 'push';
/** The tables whose change can put something new on the desk. */
const DESK_TABLES = new Set(['asks', 'tasks', 'reports']);
/** Who sends the pushes, as push services ask: the project, never the owner. */
const SUBJECT = 'https://oddboro.com';
/** How long a push service keeps a push for a phone that is off: a day. */
const KEEP_SECONDS = 86_400;

/**
 * The push services a phone's address may be at: Apple's, Google's (Chrome
 * and Android), Mozilla's (Firefox) and Microsoft's (Edge). A host ending in
 * one of these, or equal to it. Any other address is refused, so the office
 * only ever sends to these.
 */
export const PUSH_HOSTS = [
  'web.push.apple.com',
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'notify.windows.com'
];

/** Whether an address is https at one of `PUSH_HOSTS`. */
export function isPushAddress(address: string): boolean {
  const u = URL.parse(address);
  if (!u || u.protocol !== 'https:' || u.username || u.password) return false;
  return PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/** The office's key pair as JWK, made the first time it is asked for. */
function keyPair(): JsonWebKey {
  const kept = getSecret(SECRET, 'vapid');
  if (kept) return JSON.parse(kept) as JsonWebKey;
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  setSecret(SECRET, 'vapid', JSON.stringify(jwk));
  return jwk;
}

/** The public key as the page hands it to the push service: the raw point, base64url. */
export function publicKey(jwk: JsonWebKey = keyPair()): string {
  const pub = createPublicKey({
    key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
    format: 'jwk'
  });
  return b64url(pub.export({ format: 'der', type: 'spki' }).subarray(-65));
}

/**
 * The Authorization header for one push: a token signed with the office's key,
 * for the push service's origin, good for 12 hours.
 */
export function vapidHeader(address: string, jwk: JsonWebKey, now = Date.now()): string {
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64url(
    JSON.stringify({
      aud: new URL(address).origin,
      exp: Math.floor(now / 1000) + 12 * 3600,
      sub: SUBJECT
    })
  );
  const key = createPrivateKey({ key: jwk, format: 'jwk' });
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), {
    key,
    dsaEncoding: 'ieee-p1363'
  });
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${publicKey(jwk)}`;
}

/** The addresses of the phones the owner turned the buzz on for. */
export function phones(): string[] {
  try {
    const list: unknown = JSON.parse(getSecret(SECRET, 'phones') ?? '[]');
    return Array.isArray(list) ? list.filter((a): a is string => typeof a === 'string') : [];
  } catch {
    return [];
  }
}

function keepPhones(list: string[]): void {
  if (list.length) setSecret(SECRET, 'phones', JSON.stringify(list));
  else deleteSecret(SECRET, 'phones');
}

/** Turn the buzz on for a phone. The desk as it stands now is already seen. */
export function addPhone(address: string): void {
  if (!isPushAddress(address)) throw new Error("That is not a phone's push address.");
  if (!phones().includes(address)) keepPhones([...phones(), address]);
  seen = undefined;
  void deskChanged();
}

/** Turn the buzz off for a phone. */
export function removePhone(address: string): void {
  keepPhones(phones().filter((a) => a !== address));
}

/**
 * Send each phone an empty push. A phone its push service no longer knows
 * (404 or 410: the owner turned it off there, or removed the app) is dropped.
 * Returns how many took it.
 */
export async function buzz(): Promise<number> {
  const list = phones();
  if (!list.length) return 0;
  const jwk = keyPair();
  let took = 0;
  for (const address of list) {
    try {
      const res = await fetch(address, {
        method: 'POST',
        headers: {
          authorization: vapidHeader(address, jwk),
          ttl: String(KEEP_SECONDS),
          urgency: 'normal',
          // A newer buzz replaces one the phone has not had yet.
          topic: 'desk'
        }
      });
      if (res.ok) took++;
      else if (res.status === 404 || res.status === 410) removePhone(address);
      else console.error(`[push] a push service answered ${res.status}`);
    } catch (e) {
      console.error('[push] a push service could not be reached', e);
    }
  }
  return took;
}

/** What the office last saw on the desk, while a phone gets the buzz. Unset, the next look only sees. */
let seen: Set<string> | undefined;
let looking: Promise<void> = Promise.resolve();

/** Read the desk, and buzz when it holds anything the last look did not. One look at a time. */
export function deskChanged(): Promise<void> {
  looking = looking.then(async () => {
    if (!phones().length) {
      seen = undefined;
      return;
    }
    try {
      const now = deskKeys(await desk());
      const fresh = seen ? [...now].some((k) => !seen?.has(k)) : false;
      seen = now;
      if (fresh) await buzz();
    } catch (e) {
      console.error('[push] desk', e);
    }
  });
  return looking;
}

const g = globalThis as unknown as { officePush?: boolean };

/** Start once per process, from the server's `init`. A restart buzzes for nothing already there. */
export function startPush(): void {
  if (g.officePush) return;
  g.officePush = true;
  listen();
  bus.on('event', (e: OfficeEvent) => {
    if (e.type === 'change' && DESK_TABLES.has(e.table)) void deskChanged();
  });
  void deskChanged();
}

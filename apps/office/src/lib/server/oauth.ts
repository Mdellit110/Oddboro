// Signing in to hosted MCP servers, and to Google. A headless staffer cannot
// reuse Claude Code's own sign-ins, so the office runs OAuth itself with the
// MCP SDK: it registers as a client, sends the owner to the service's sign-in
// page, takes the code at /connect/callback, and keeps the tokens in the
// system's secret store. The gateway asks `bearer` for a fresh access token.
//
// Google is the same flow with a fixed client: New Altitude's Desktop client,
// so no owner makes one of their own. Its id ships in the code; its secret,
// which Google says a desktop app cannot keep, comes from the build
// (ODDBORO_GOOGLE_CLIENT_SECRET) and never sits in the repo. Each Google
// connector signs in on its own, with its product's scopes, and one Google
// account is one connector: a sign-in to an address another connector of the
// same product holds is not kept.
import { randomUUID } from 'node:crypto';
import { auth, type OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  connector,
  googleAccountHeld,
  OFFICE_URL,
  sayOnSignIn,
  signedInAs,
  tickKey,
  type GoogleProduct
} from '@oddboro/ledger';
import { fixedError } from '@oddboro/ledger/errors';
import { deleteSecret, getSecret, setSecret } from './keychain.ts';

export const REDIRECT = `${OFFICE_URL}/connect/callback`;
/** Refresh a token this long before it runs out. */
const MARGIN_MS = 5 * 60_000;

const GOOGLE_ISSUER = 'https://accounts.google.com';
const GOOGLE_CLIENT_ID = '143017077978-dd33kak7rf2m1praobmbc0olv7kjf5gp.apps.googleusercontent.com';
/**
 * The scopes each Google product asks for, space-separated. Gmail's
 * settings.basic is for the filters the office creates on the owner's click.
 */
export const GOOGLE_SCOPES: Record<GoogleProduct, string> = {
  gmail:
    'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.settings.basic',
  drive: 'https://www.googleapis.com/auth/drive'
};

/** Where each Google product says which account a token reaches. */
const WHO: Record<GoogleProduct, string> = {
  gmail: 'https://gmail.googleapis.com/gmail/v1/users/me/profile',
  drive: 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)'
};

/**
 * Whether a stored sign-in covers every scope asked for. One that does not
 * say counts as covering them.
 */
const covers = (tokens: OAuthTokens | undefined, scopes: string): boolean => {
  if (!tokens?.scope) return true;
  const has = new Set(tokens.scope.split(/\s+/));
  return scopes.split(/\s+/).every((s) => has.has(s));
};

/** New Altitude's Google client, or why this build cannot sign in to Google. */
function googleClient(): OAuthClientInformationMixed {
  const secret = process.env.ODDBORO_GOOGLE_CLIENT_SECRET;
  if (!secret)
    throw new Error(
      'This copy of Oddboro was built without its Google sign-in. Update Oddboro, or in development set ODDBORO_GOOGLE_CLIENT_SECRET in .env.'
    );
  return {
    client_id: GOOGLE_CLIENT_ID,
    client_secret: secret,
    token_endpoint_auth_method: 'client_secret_post'
  };
}

/**
 * fetch, retried once when the network drops a request before any answer
 * comes back. The failure's real cause goes in the error and the service log.
 */
const steadyFetch: FetchLike = async (input, init) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(input, init);
    } catch (e) {
      const cause = (e as { cause?: { code?: string; message?: string } }).cause;
      const why = cause?.code ?? cause?.message ?? (e instanceof Error ? e.message : String(e));
      console.error(`[oauth] ${String(input)} failed (attempt ${attempt}): ${why}`);
      if (attempt >= 2) throw new Error(`Could not reach ${new URL(String(input)).host}: ${why}`);
      await new Promise((r) => setTimeout(r, 800));
    }
  }
};

type Saved = {
  client?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  savedAt?: number;
  verifier?: string;
  discovery?: unknown;
};

/** Sign-ins in flight: the state the service sends back, to the connector it was for. */
const pending = new Map<string, string>();

class KeychainProvider implements OAuthClientProvider {
  url: URL | undefined;
  // Not a parameter property: Node's type stripping, which the office's tests
  // run on, cannot load one.
  readonly id: string;
  /** For a Google connector, the scopes it signs in with; else undefined. */
  readonly google: string | undefined;
  /** Sign in afresh, as if none were stored: the stored one lacks a scope. */
  fresh = false;
  constructor(id: string, google?: string) {
    this.id = id;
    this.google = google;
  }

  private load(): Saved {
    try {
      return JSON.parse(getSecret(this.id, 'oauth') ?? '{}') as Saved;
    } catch {
      return {};
    }
  }
  private save(patch: Saved) {
    setSecret(this.id, 'oauth', JSON.stringify({ ...this.load(), ...patch }));
  }

  get redirectUrl() {
    return REDIRECT;
  }
  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'Oddboro office',
      redirect_uris: [REDIRECT],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      ...(this.google
        ? { scope: this.google, token_endpoint_auth_method: 'client_secret_post' }
        : { token_endpoint_auth_method: 'none' })
    };
  }
  state() {
    const s = randomUUID();
    pending.set(s, this.id);
    return s;
  }
  clientInformation() {
    return this.google ? googleClient() : this.load().client;
  }
  saveClientInformation(client: OAuthClientInformationMixed) {
    // Google's client is fixed and never registered, so nothing to keep.
    if (!this.google) this.save({ client });
  }
  tokens() {
    return this.fresh ? undefined : this.load().tokens;
  }
  saveTokens(tokens: OAuthTokens) {
    this.save({ tokens, savedAt: Date.now() });
  }
  redirectToAuthorization(url: URL) {
    // Google gives a refresh token only when asked for offline access, and
    // again only with a fresh consent. The owner picks which account.
    if (this.google) {
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent select_account');
    }
    this.url = url;
  }
  saveCodeVerifier(verifier: string) {
    this.save({ verifier });
  }
  codeVerifier() {
    const v = this.load().verifier;
    if (!v) throw fixedError('No sign-in is in progress for this tool');
    return v;
  }
  discoveryState() {
    return this.load().discovery as never;
  }
  saveDiscoveryState(discovery: unknown) {
    this.save({ discovery });
  }
  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery') {
    if (scope === 'all') setSecret(this.id, 'oauth', '{}');
    else
      this.save(
        scope === 'client'
          ? { client: undefined }
          : scope === 'tokens'
            ? { tokens: undefined }
            : scope === 'verifier'
              ? { verifier: undefined }
              : { discovery: undefined }
      );
  }
  expiresAt(): number | undefined {
    const s = this.load();
    return s.tokens?.expires_in && s.savedAt ? s.savedAt + s.tokens.expires_in * 1000 : undefined;
  }
}

/** A connector's provider and the address its sign-in is found from. */
async function signInFor(id: string): Promise<{ provider: KeychainProvider; serverUrl: string }> {
  const c = await connector(id);
  if (c?.config.oauth === 'google') {
    const scope = c.config.google && GOOGLE_SCOPES[c.config.google];
    if (!scope) throw new Error(`${c.name} does not say which Google product it is`);
    return { provider: new KeychainProvider(id, scope), serverUrl: GOOGLE_ISSUER };
  }
  if (!c?.config.url) throw new Error(`${id} is not a hosted server`);
  return { provider: new KeychainProvider(id), serverUrl: c.config.url };
}

/**
 * Start signing in. Returns the page to open, or nothing when the tool was
 * already signed in (a stored refresh token still works).
 */
export async function startSignIn(id: string): Promise<{ url?: string }> {
  const { provider, serverUrl } = await signInFor(id);
  // A Google sign-in made before the office asked for a scope would only be
  // renewed, still without it: Google asks for consent again instead. The
  // stored one keeps working until the new one lands.
  if (provider.google && !covers(provider.tokens(), provider.google)) provider.fresh = true;
  const result = await auth(provider, { serverUrl, fetchFn: steadyFetch });
  if (result === 'AUTHORIZED') {
    await tickKey(`oauth:${id}`);
    return {};
  }
  return { url: provider.url?.toString() };
}

/** The service sent the owner back with a code. Trade it for tokens. */
export async function finishSignIn(state: string, code: string): Promise<string> {
  const id = pending.get(state);
  if (!id) throw fixedError('This sign-in link is old. Click Sign in on the task again.');
  pending.delete(state);
  const { provider, serverUrl } = await signInFor(id);
  // What the store held before, to put back if this Google sign-in is not kept.
  const before = getSecret(id, 'oauth');
  await auth(provider, { serverUrl, authorizationCode: code, fetchFn: steadyFetch });
  if (provider.google) await keepGoogleAccount(id, provider.tokens()?.access_token, before);
  await tickKey(`oauth:${id}`);
  return id;
}

/**
 * Show which Google account a connector reaches, as "Gmail (ada@example.com)",
 * so the owner knows whose mail or files an Odd holds. One account is one
 * connector: a sign-in to an address another connector of the same product
 * holds comes out of the secret store, and the store holds what it did
 * before. Google is not told, since cancelling there would end the other
 * connector's sign-in too. The owner reads why on this page and on the task.
 * Best effort: an address that cannot be read leaves the plain name.
 */
async function keepGoogleAccount(
  id: string,
  token: string | undefined,
  before: string | undefined
): Promise<void> {
  const c = await connector(id);
  const address = c?.config.google && token ? await googleAddress(c.config.google, token) : '';
  if (!address) return;
  const held = await googleAccountHeld(id, address);
  if (!held) return signedInAs(id, address);
  if (before && hadTokens(before)) setSecret(id, 'oauth', before);
  else deleteSecret(id, 'oauth');
  const words = `${address} is already connected as ${held.name}.`;
  await sayOnSignIn(id, `${words} Sign in with another Google account.`);
  throw new Error(
    `${words} This sign-in was not kept. Click Sign in on the task again and pick another Google account.`
  );
}

/** Whether a stored sign-in held tokens, rather than only a sign-in under way. */
function hadTokens(saved: string): boolean {
  try {
    return !!(JSON.parse(saved) as Saved).tokens;
  } catch {
    return false;
  }
}

/** The address a Google token reaches, or nothing when Google does not say. */
async function googleAddress(product: GoogleProduct, token: string): Promise<string> {
  try {
    const res = await fetch(WHO[product], { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return '';
    const body = (await res.json()) as { emailAddress?: string; user?: { emailAddress?: string } };
    return body.emailAddress ?? body.user?.emailAddress ?? '';
  } catch {
    return '';
  }
}

/** A live access token, refreshed when it is close to running out. */
export async function bearer(id: string): Promise<string | undefined> {
  const { provider, serverUrl } = await signInFor(id);
  if (!provider.tokens()) return undefined;
  const ends = provider.expiresAt();
  if (ends !== undefined && ends - MARGIN_MS < Date.now()) {
    const result = await auth(provider, { serverUrl, fetchFn: steadyFetch }).catch(() => 'FAILED');
    if (result !== 'AUTHORIZED') return undefined;
  }
  return provider.tokens()?.access_token;
}

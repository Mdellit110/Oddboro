// Gmail through the gateway, as a run reaches it: the office serves the tools
// itself (`builtin` in access.ts), with the owner's Google token from the
// secret store, which never reaches the run. Read only lists the read tools
// alone, and revoking the last grant cancels the sign-in at Google and
// forgets it here. Google itself is a stand-in `fetch`. Run with
// `npm test -w @oddboro/office`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { L, odd, secrets } from './office-under-test.ts';

process.env.ODDBORO_GOOGLE_CLIENT_SECRET = 'a-client-secret-for-tests';
const { closeGateway, gateway, openGateway } = await import('./gateway.ts');
const { listTools } = await import('./access.ts');

const ACCESS = 'ya29.an-access-token-for-tests';
const REFRESH = '1//a-refresh-token-for-tests';
secrets.set(
  'gmail:oauth',
  JSON.stringify({
    tokens: { access_token: ACCESS, refresh_token: REFRESH, expires_in: 3600 },
    savedAt: Date.now()
  })
);

/** What reached Google: each address and the token it carried. */
const google: { url: string; auth: string | null; body?: string }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith('https://accounts.google.com/'))
    return url.endsWith('/.well-known/openid-configuration')
      ? Response.json({
          issuer: 'https://accounts.google.com',
          authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
          token_endpoint: 'https://oauth2.googleapis.com/token',
          response_types_supported: ['code'],
          code_challenge_methods_supported: ['plain', 'S256'],
          token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
          jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256']
        })
      : new Response('', { status: 404 });
  if (!/googleapis\.com/.test(url)) return realFetch(input, init);
  google.push({
    url,
    auth: new Headers(init?.headers).get('Authorization'),
    body: typeof init?.body === 'string' ? init.body : init?.body?.toString()
  });
  const json = url.includes('/threads?')
    ? { threads: [{ id: 't1', snippet: 'hello' }] }
    : url.includes('/threads/t1')
      ? { id: 't1', messages: [] }
      : {};
  return new Response(JSON.stringify(json), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}) as typeof fetch;

const gmail = async () => (await L.connector('gmail'))!;

test("Google's sign-in link carries New Altitude's client, the one scope, and asks for offline access", async () => {
  const { startSignIn } = await import('./oauth.ts');
  const { url } = await startSignIn('google-drive');
  const link = new URL(url!);
  assert.equal(link.origin + link.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.match(link.searchParams.get('client_id')!, /\.apps\.googleusercontent\.com$/);
  assert.equal(link.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive');
  assert.equal(link.searchParams.get('access_type'), 'offline');
  assert.equal(link.searchParams.get('prompt'), 'consent select_account');
  assert.equal(link.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(link.searchParams.get('redirect_uri'), `${L.OFFICE_URL}/connect/callback`);
  // Nothing about the fixed client is kept: only the sign-in in progress.
  assert.equal(JSON.parse(secrets.get('google-drive:oauth') ?? '{}').client, undefined);
});

test("Gmail's sign-in asks for both its scopes, and one made before filters signs in afresh", async () => {
  const { startSignIn } = await import('./oauth.ts');
  const kept = secrets.get('gmail:oauth')!;
  // A sign-in from before filters: Google gave it gmail.modify alone.
  const old = JSON.parse(kept) as { tokens: Record<string, unknown> };
  old.tokens.scope = 'https://www.googleapis.com/auth/gmail.modify';
  secrets.set('gmail:oauth', JSON.stringify(old));
  try {
    const { url } = await startSignIn('gmail');
    assert.ok(url, 'Google asks for consent again, rather than renewing the old sign-in');
    assert.equal(
      new URL(url).searchParams.get('scope'),
      'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.settings.basic'
    );
    const still = JSON.parse(secrets.get('gmail:oauth')!) as { tokens: { access_token: string } };
    assert.equal(
      still.tokens.access_token,
      ACCESS,
      'the old sign-in works until the new one lands'
    );
  } finally {
    secrets.set('gmail:oauth', kept);
  }
});

test('every office has Gmail and Google Drive in its catalog, served by the office', async () => {
  for (const id of ['gmail', 'google-drive']) {
    const c = await L.connector(id);
    assert.equal(c?.kind, 'builtin', id);
    assert.equal(c?.config.oauth, 'google', id);
  }
});

test('connecting Gmail marks only its read tools as Read only', async () => {
  const tools = await listTools('gmail');
  assert.deepEqual(
    tools
      .filter((t) => t.readOnly)
      .map((t) => t.name)
      .sort(),
    ['get_thread', 'list_drafts', 'list_filters', 'list_labels', 'search_threads']
  );
  await L.connectorReady(
    'gmail',
    tools.map((t) => t.name),
    tools.filter((t) => t.readOnly).map((t) => t.name)
  );
});

test('a run at Read reaches the read tools alone, and the token goes to Google, never the run', async () => {
  const { token, servers } = openGateway([{ connector: await gmail(), level: 'read' }], 60_000);
  assert.doesNotMatch(JSON.stringify(servers), new RegExp(ACCESS));
  const client = new Client({ name: 'a-run', version: '1.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${L.OFFICE_URL}/api/gateway/gmail`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
      fetch: (url, init) => gateway(new Request(url, init), 'gmail')
    })
  );
  try {
    const { tools } = await client.listTools();
    assert.ok(!tools.some((t) => t.name === 'send_draft' || t.name === 'trash_thread'));
    google.length = 0;
    const r = (await client.callTool({
      name: 'search_threads',
      arguments: { query: 'is:unread' }
    })) as CallToolResult;
    assert.notEqual(r.isError, true);
    assert.ok(google.length > 0);
    assert.ok(google.every((g) => g.auth === `Bearer ${ACCESS}`));
    const refused = (await client.callTool({
      name: 'trash_thread',
      arguments: { thread_id: 't1' }
    })) as CallToolResult;
    assert.equal(refused.isError, true);
  } finally {
    await client.close();
    await closeGateway(token);
  }
});

test('revoking the last grant cancels the sign-in at Google and forgets it here', async () => {
  await L.pg`insert into staff ${L.pg(odd('gail', 'Gail'))}`;
  await L.pg`insert into grants ${L.pg({ staff_id: 'gail', connector_id: 'gmail', level: 'read' })}`;
  await L.nameConnector('gmail', 'Gmail (gail@example.com)');
  google.length = 0;
  await L.revoke('gail', 'gmail');
  const told = google.find((g) => g.url === 'https://oauth2.googleapis.com/revoke');
  assert.ok(told, 'Google was told');
  assert.equal(new URLSearchParams(told.body).get('token'), REFRESH);
  assert.equal(secrets.has('gmail:oauth'), false);
  const c = await gmail();
  assert.equal(c.name, 'Gmail');
  assert.equal(c.readyAt, null);
  const [line] =
    await L.pg`select body from ledger where title = 'Revoked Gmail (gail@example.com) for Gail'`;
  assert.match(line.body, /Google cancelled the sign-in too/);
});

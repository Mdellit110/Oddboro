// The gateway between a run and its outside tools (gateway.ts), over MCP as a
// run's tool speaks it, in an office under test (office-under-test.ts). A
// stand-in tool server marks its tools the way a careless one might: a
// `create_note` it says only reads, a `capture` it says writes, and a `wipe`
// it says nothing about. Read only reaches `search` alone, whatever the
// connector stored before, and the run never holds the server's key
// (issue #35). Run with `npm test -w @oddboro/office`.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { chatOf, folder, L, odd, secrets } from './office-under-test.ts';

const { closeGateway, gateway, openGateway } = await import('./gateway.ts');

const KEY = 'the-notes-key-for-tests-01';
// The stand-in tool server, on the SDK the office itself uses. `search` says
// whether the office gave it its key, so the test sees the key reach the
// server and never the run.
const sdk = (path: string) =>
  createRequire(import.meta.url).resolve(`@modelcontextprotocol/sdk/${path}`);
const fixture = join(folder, 'notes-server.mjs');
writeFileSync(
  fixture,
  `import { McpServer } from ${JSON.stringify(sdk('server/mcp.js'))};
import { StdioServerTransport } from ${JSON.stringify(sdk('server/stdio.js'))};
const server = new McpServer({ name: 'notes', version: '1.0.0' });
const said = (text) => async () => ({ content: [{ type: 'text', text }] });
server.registerTool('search', { annotations: { readOnlyHint: true } },
  said('found, key ' + (process.env.NOTES_KEY === ${JSON.stringify(KEY)} ? 'given' : 'missing')));
server.registerTool('create_note', { annotations: { readOnlyHint: true } }, said('created'));
server.registerTool('capture', { annotations: { readOnlyHint: false } }, said('captured'));
server.registerTool('wipe', {}, said('wiped'));
await server.connect(new StdioServerTransport());
`
);
secrets.set('notes:NOTES_KEY', KEY);
await L.addConnector({
  id: 'notes',
  name: 'Notes',
  description: 'A stand-in notes server.',
  kind: 'stdio',
  config: { command: process.execPath, args: [fixture], secrets: ['NOTES_KEY'] }
});
// As an owner's ticks before the rule held: a tool that writes among them.
await L.connectorReady(
  'notes',
  ['search', 'create_note', 'capture', 'wipe'],
  ['search', 'create_note']
);
const notes = async () => (await L.connector('notes'))!;

/** An MCP client on `token`'s gateway to Notes, as a run's tool connects to it. */
async function connect(token: string): Promise<Client> {
  const client = new Client({ name: 'a-run', version: '1.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${L.OFFICE_URL}/api/gateway/notes`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
      fetch: (url, init) => gateway(new Request(url, init), 'notes')
    })
  );
  return client;
}
const text = (r: unknown) => (r as CallToolResult).content.map((c) => (c as { text: string }).text);

test('Read only lists and passes on only the tools the server marks as reading', async () => {
  const { token } = openGateway([{ connector: await notes(), level: 'read' }], 60_000);
  const client = await connect(token);
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((t) => t.name),
      ['search']
    );
    assert.deepEqual(text(await client.callTool({ name: 'search' })), ['found, key given']);
    for (const name of ['create_note', 'capture', 'wipe']) {
      const r = (await client.callTool({ name })) as CallToolResult;
      assert.equal(r.isError, true, name);
      assert.match(text(r)[0], /not one you may use.*Read only/, name);
    }
  } finally {
    await client.close();
    await closeGateway(token);
  }
  // The stored list loses the tool that writes, with a line in the Ledger saying so.
  assert.deepEqual((await notes()).readTools, ['search']);
  const [line] = await L.pg`select title from ledger where title like 'Read only for Notes%'`;
  assert.equal(line.title, 'Read only for Notes no longer reaches create_note');
});

test('Read and write reaches every tool', async () => {
  const { token } = openGateway([{ connector: await notes(), level: 'act' }], 60_000);
  const client = await connect(token);
  try {
    assert.deepEqual((await client.listTools()).tools.map((t) => t.name).sort(), [
      'capture',
      'create_note',
      'search',
      'wipe'
    ]);
    assert.deepEqual(text(await client.callTool({ name: 'capture' })), ['captured']);
  } finally {
    await client.close();
    await closeGateway(token);
  }
});

test('a token that ended, or that never was, reaches nothing', async () => {
  const { token } = openGateway([{ connector: await notes(), level: 'act' }], 60_000);
  await closeGateway(token);
  for (const auth of [`Bearer ${token}`, 'Bearer never-a-token', ''])
    assert.equal(
      (
        await gateway(
          new Request(`${L.OFFICE_URL}/api/gateway/notes`, {
            method: 'POST',
            headers: { authorization: auth }
          }),
          'notes'
        )
      ).status,
      401,
      auth
    );
  // A going run's token reaches only the tools that run holds.
  const other = openGateway([], 60_000);
  const r = await gateway(
    new Request(`${L.OFFICE_URL}/api/gateway/notes`, {
      method: 'POST',
      headers: { authorization: `Bearer ${other.token}` }
    }),
    'notes'
  );
  assert.equal(r.status, 403);
  await closeGateway(other.token);
});

test("a run gets the office's gateway for its outside tools, and never their keys", async () => {
  await L.pg`insert into staff ${L.pg(odd('nell', 'Nell'))}`;
  await L.pg`insert into grants ${L.pg({ staff_id: 'nell', connector_id: 'notes', level: 'read' })}`;
  const gave = await chatOf('nell');
  const config = gave.args[gave.args.indexOf('--mcp-config') + 1];
  const { mcpServers } = JSON.parse(config) as {
    mcpServers: Record<string, { type: string; url: string; headers: Record<string, string> }>;
  };
  assert.equal(mcpServers.notes.type, 'http');
  assert.equal(mcpServers.notes.url, `${L.OFFICE_URL}/api/gateway/notes`);
  assert.match(mcpServers.notes.headers.Authorization, /^Bearer \S{40,}$/);
  assert.ok(!gave.args.join('\n').includes(KEY), "the run's arguments hold no key");
  assert.ok(!JSON.stringify(gave.env).includes(KEY), "the run's environment holds no key");
  // Claude Code's own list names the same tools, so either one alone holds.
  assert.ok(gave.args.includes('mcp__notes__search'));
  assert.ok(!gave.args.some((a) => a.startsWith('mcp__notes__create_note')));
  // The run ended, so its token reaches nothing now.
  const after = await gateway(
    new Request(mcpServers.notes.url, {
      method: 'POST',
      headers: mcpServers.notes.headers
    }),
    'notes'
  );
  assert.equal(after.status, 401);
});

test("an outside tool's own server gets only what a run may have of the office's environment, and its own key", async () => {
  // A stand-in server whose one tool says which variables it started with.
  const probe = join(folder, 'env-server.mjs');
  writeFileSync(
    probe,
    `import { McpServer } from ${JSON.stringify(sdk('server/mcp.js'))};
import { StdioServerTransport } from ${JSON.stringify(sdk('server/stdio.js'))};
const server = new McpServer({ name: 'env', version: '1.0.0' });
server.registerTool('names', {}, async () => ({
  content: [{ type: 'text', text: JSON.stringify(Object.keys(process.env)) }]
}));
await server.connect(new StdioServerTransport());
`
  );
  secrets.set('env-probe:PROBE_KEY', KEY);
  await L.addConnector({
    id: 'env-probe',
    name: 'Env probe',
    description: 'A stand-in server that lists its environment.',
    kind: 'stdio',
    config: { command: process.execPath, args: [probe], secrets: ['PROBE_KEY'] }
  });
  await L.connectorReady('env-probe', ['names'], []);
  // The office's own environment holds more than any run may have.
  process.env.OFFICE_ONLY_TOKEN_FOR_TESTS = 'from-the-office';
  const c = (await L.connector('env-probe'))!;
  const { token } = openGateway([{ connector: c, level: 'act' }], 60_000);
  const client = new Client({ name: 'a-run', version: '1.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${L.OFFICE_URL}/api/gateway/env-probe`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
      fetch: (url, init) => gateway(new Request(url, init), 'env-probe')
    })
  );
  try {
    const names = JSON.parse(text(await client.callTool({ name: 'names' }))[0]) as string[];
    assert.ok(names.includes('PROBE_KEY'), 'the server gets its own key');
    assert.ok(names.includes('PATH'));
    for (const name of [
      'OFFICE_ONLY_TOKEN_FOR_TESTS',
      'DATABASE_URL',
      'ODDBORO_HOME',
      'ANTHROPIC_API_KEY'
    ])
      assert.ok(!names.includes(name), `the server got ${name}`);
  } finally {
    delete process.env.OFFICE_ONLY_TOKEN_FOR_TESTS;
    await client.close();
    await closeGateway(token);
  }
});

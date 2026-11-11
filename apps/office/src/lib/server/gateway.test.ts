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

const { closeGateway, gateway, makeCall, openGateway } = await import('./gateway.ts');

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
server.registerTool('capture', { description: 'Capture a note.', annotations: { readOnlyHint: false } }, said('captured'));
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

test('Read and write reaches every tool, and the run keeps what each does for the owner', async () => {
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
  // Connected before descriptions were kept, the run's tool list fills them in.
  const { toolNotes } = await notes();
  assert.equal(toolNotes.capture, 'Capture a note.');
  assert.equal(toolNotes.wipe, '');
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
  // The servers come as a file, never on the command line, where any program could read the token.
  assert.doesNotMatch(gave.args.join(' '), /Bearer/);
  const { mcpServers } = gave.mcp as {
    mcpServers: Record<string, { type: string; url: string; headers: Record<string, string> }>;
  };
  assert.equal(mcpServers.notes.type, 'http');
  assert.equal(mcpServers.notes.url, `${L.OFFICE_URL}/api/gateway/notes`);
  assert.match(mcpServers.notes.headers.Authorization, /^Bearer \S{40,}$/);
  assert.ok(!gave.args.join('\n').includes(KEY), "the run's arguments hold no key");
  assert.ok(!JSON.stringify(gave.claudeSettings).includes(KEY), "the run's settings hold no key");
  assert.ok(!JSON.stringify(gave.env).includes(KEY), "the run's environment holds no key");
  // Claude Code's own list names the same tools, so either one alone holds.
  const allowed = gave.claudeSettings!.permissions.allow;
  assert.ok(allowed.includes('mcp__notes__search'));
  assert.ok(!allowed.some((a) => a.startsWith('mcp__notes__create_note')));
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

test("at Draft, Read and write passes reads on and holds each change for the owner's yes", async () => {
  await L.pg`insert into staff ${L.pg({ ...odd('dora', 'Dora'), permission: 'draft' })}`;
  const place = { staffId: 'dora', run: 'run-dora-1' };
  const { token } = openGateway(
    [{ connector: await notes(), level: 'act', waits: true }],
    60_000,
    place
  );
  const client = await connect(token);
  try {
    // Every tool is listed, so the Odd can ask for a change at all, and each
    // that changes something asks why, for the owner's desk.
    const listed = (await client.listTools()).tools;
    assert.equal(listed.length, 4);
    const asksWhy = listed.filter((t) =>
      ['oddboro_title', 'oddboro_why'].every((k) => t.inputSchema.required?.includes(k))
    );
    assert.deepEqual(asksWhy.map((t) => t.name).sort(), ['capture', 'create_note', 'wipe']);
    assert.deepEqual(text(await client.callTool({ name: 'search' })), ['found, key given']);
    // A change with no title or reason is refused, and nothing goes on the desk.
    const bare = (await client.callTool({
      name: 'capture',
      arguments: { text: 'a thought', oddboro_why: 'No title.' }
    })) as CallToolResult;
    assert.equal(bare.isError, true);
    assert.match(text(bare)[0], /^Nothing was held\. Call capture again with oddboro_title/);
    const why = 'Saves the thought you had about the garden, as you asked.';
    const held = (await client.callTool({
      name: 'capture',
      arguments: { text: 'a thought', oddboro_title: 'Save your garden thought', oddboro_why: why }
    })) as CallToolResult;
    assert.notEqual(held.isError, true);
    assert.match(
      text(held)[0],
      /^Held for .*'s yes as ask \d+\. Nothing has changed in Notes yet\./
    );
    // The same call again finds the one on the desk, and raises no second.
    const again = (await client.callTool({
      name: 'capture',
      arguments: { text: 'a thought', oddboro_title: 'Again', oddboro_why: 'Once more.' }
    })) as CallToolResult;
    assert.match(text(again)[0], /already on .*'s desk/);
  } finally {
    await client.close();
    await closeGateway(token);
  }
  const calls =
    await L.pg`select id, title, why, call from asks where staff_id = 'dora' and kind = 'call'`;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].title, 'Save your garden thought in Notes');
  // The desk shows the Odd's title and reason, and the call itself carries neither.
  assert.equal(calls[0].why, 'Saves the thought you had about the garden, as you asked.');
  assert.deepEqual(calls[0].call, {
    connector: 'notes',
    tool: 'capture',
    arguments: { text: 'a thought' }
  });
  // A plain Approve never makes the call: only the office's own, from the desk.
  await assert.rejects(L.approveAsk(calls[0].id, null, {}), /Approve the call from its card/);
  // On the owner's yes the office makes that exact call, and the Odd carries on with the result.
  const result = await makeCall(calls[0].call, calls[0].staffId);
  assert.deepEqual({ ok: result.ok, text: result.text }, { ok: true, text: 'captured' });
  assert.equal(await L.approveCall(calls[0].id, { ...calls[0].call, result }), true);
  const [carry] = await L.pg`select kind from follow_ups where ask_id = ${calls[0].id}`;
  assert.equal(carry.kind, 'carry_out');
});

test('a run with nowhere to put a change, such as a lesson run, cannot ask for one', async () => {
  const { token } = openGateway([{ connector: await notes(), level: 'act', waits: true }], 60_000);
  const client = await connect(token);
  try {
    const r = (await client.callTool({ name: 'wipe' })) as CallToolResult;
    assert.equal(r.isError, true);
    assert.match(text(r)[0], /only reads/);
  } finally {
    await client.close();
    await closeGateway(token);
  }
});

test('at Draft, a tool the owner lets the Odd use without asking goes through, and the next held call lists it', async () => {
  await L.pg`insert into staff ${L.pg({ ...odd('stan', 'Stan'), permission: 'draft' })}`;
  const place = { staffId: 'stan', run: 'run-stan-1' };
  const { token } = openGateway(
    [{ connector: await notes(), level: 'act', waits: true, standing: ['capture'] }],
    60_000,
    place
  );
  const client = await connect(token);
  try {
    // Only the tools that still wait ask for the owner's title and reason.
    const listed = (await client.listTools()).tools;
    const asksWhy = listed.filter((t) => t.inputSchema.required?.includes('oddboro_why'));
    assert.deepEqual(asksWhy.map((t) => t.name).sort(), ['create_note', 'wipe']);
    // The standing tool reaches the service at once, with no ask.
    assert.deepEqual(
      text(await client.callTool({ name: 'capture', arguments: { text: 'staged' } })),
      ['captured']
    );
    const held = (await client.callTool({
      name: 'wipe',
      arguments: { oddboro_title: 'Apply the change', oddboro_why: 'Makes the staged note real.' }
    })) as CallToolResult;
    assert.match(text(held)[0], /^Held for /);
  } finally {
    await client.close();
    await closeGateway(token);
  }
  const calls = await L.pg`select call from asks where staff_id = 'stan' and kind = 'call'`;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].call.tool, 'wipe');
  assert.deepEqual(calls[0].call.before, [{ tool: 'capture', arguments: { text: 'staged' } }]);
});

test('a run with nowhere to put a change makes no call, standing yes or not', async () => {
  const { token } = openGateway(
    [{ connector: await notes(), level: 'act', waits: true, standing: ['capture'] }],
    60_000
  );
  const client = await connect(token);
  try {
    const r = (await client.callTool({ name: 'capture', arguments: {} })) as CallToolResult;
    assert.equal(r.isError, true);
    assert.match(text(r)[0], /only reads/);
  } finally {
    await client.close();
    await closeGateway(token);
  }
});

test('at Act, a tool the owner set to ask first waits on the desk, and every other change goes through', async () => {
  await L.pg`insert into staff ${L.pg({ ...odd('ace', 'Ace'), permission: 'act' })}`;
  const place = { staffId: 'ace', run: 'run-ace-1' };
  const { token } = openGateway(
    [{ connector: await notes(), level: 'act', waits: false, askFirst: ['wipe'] }],
    60_000,
    place
  );
  const client = await connect(token);
  try {
    // Only the ask-first tool asks for the owner's title and reason.
    const listed = (await client.listTools()).tools;
    const asksWhy = listed.filter((t) => t.inputSchema.required?.includes('oddboro_why'));
    assert.deepEqual(
      asksWhy.map((t) => t.name),
      ['wipe']
    );
    assert.deepEqual(text(await client.callTool({ name: 'capture', arguments: {} })), ['captured']);
    const held = (await client.callTool({
      name: 'wipe',
      arguments: { oddboro_title: 'Clear the notes', oddboro_why: 'Ada asked to start fresh.' }
    })) as CallToolResult;
    assert.match(text(held)[0], /^Held for /);
  } finally {
    await client.close();
    await closeGateway(token);
  }
  const calls = await L.pg`select call from asks where staff_id = 'ace' and kind = 'call'`;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].call.tool, 'wipe');
  assert.deepEqual(calls[0].call.before, [{ tool: 'capture', arguments: {} }]);
});

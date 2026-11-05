// One access profile per Odd: what its own tools reach on each system, what a
// handed-over run keeps, what the Odd and the Office Manager are told of it,
// the words for levels, and when a run hands work on. office_report runs in
// the office tool server (src/mcp.ts) in a process of its own, over the
// office's own database in a throwaway folder (tool-server.ts). Run with
// `npm test -w @oddboro/ledger`.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
// Types only, erased before run, so tool-server.ts still sets the office up first.
import type { Capabilities } from '../src/capabilities.ts';
import type { ConnectorRow } from '../src/office.ts';
import { db, toolServer } from './tool-server.ts';

const W = await import('../src/access-words.ts');
const A = await import('../src/agents.ts');
const C = await import('../src/capabilities.ts');
const { staff, threads } = await import('../src/schema.ts');

const dir = realpathSync(mkdtempSync(join(tmpdir(), 'access-profile-')));
after(() => rmSync(dir, { recursive: true, force: true }));
/** A folder made now, by its real path, as the owner gives one. */
function made(name: string): string {
  const p = join(dir, name);
  mkdirSync(p, { recursive: true });
  return p;
}

const kept = made('kept');
const gone = join(dir, 'gone');
const odd = (agent: (typeof A.AGENTS)[number], commands: boolean, web: boolean) => ({
  agent,
  commands,
  web,
  folders: [
    { path: kept, write: true },
    { path: gone, write: false }
  ]
});

// Every await comes before the first test: the database closes once the tests end.
const person = (id: string, name: string, tools: string[]) => ({
  id,
  name,
  role: 'Tester',
  remit: 'Tests.',
  variant: 'a',
  portrait: 'a',
  desk: `You are ${name}.`,
  tools
});
await db.insert(staff).values([
  {
    ...person('mona', 'Mona', ['office_report']),
    role: 'Office Manager',
    web: true,
    folders: [{ path: kept, write: false }]
  },
  // Codex has a shell on every system, so the report fills in whose developer tools it reads.
  { ...person('cody', 'Cody', []), agent: 'codex' },
  // Lena hands work on, and leads one thread.
  person('lena', 'Lena', ['hand_off'])
]);
const manager = await toolServer('mona', { RUN_KEY: 'k-access-profile' });
const [led] = await db
  .insert(threads)
  .values({ title: 'Count the chairs', hubId: 'lena', holderId: 'lena' })
  .returning({ id: threads.id });
/** The tools Lena's run is offered, with raise_ask's arguments, as the office starts it with `env`. */
async function offered(env: Record<string, string>) {
  const { tools } = await (await toolServer('lena', env)).listTools();
  return {
    handOff: tools.some((t) => t.name === 'hand_off'),
    work: 'work' in (tools.find((t) => t.name === 'raise_ask')?.inputSchema.properties ?? {})
  };
}
const runs = {
  offThread: await offered({ RUN_KEY: 'k-lena-chat' }),
  onThread: await offered({ RUN_KEY: 'k-lena-thread', THREAD_ID: String(led.id) }),
  handedOver: await offered({
    RUN_KEY: 'k-lena-hand-off',
    THREAD_ID: String(led.id),
    HAND_OFF_ID: '1'
  })
};

test('ownTools is what a run reaches: the switch as its tool takes it, the web, the internet only with both, and given folders still on the disk', () => {
  const on = (who: ReturnType<typeof odd>, platform: NodeJS.Platform) => {
    const o = C.ownTools(who, platform);
    return { commands: o.commands, web: o.web, network: o.network };
  };
  assert.deepEqual(on(odd('claude', true, true), 'darwin'), {
    commands: true,
    web: true,
    network: true
  });
  assert.deepEqual(on(odd('claude', true, false), 'darwin'), {
    commands: true,
    web: false,
    network: false
  });
  assert.deepEqual(on(odd('codex', false, true), 'darwin'), {
    commands: true,
    web: true,
    network: true
  });
  // A tool whose walls were not measured holding with the network open keeps its commands off it.
  const measured = { ...A.NETWORK_WITH_WEB };
  A.NETWORK_WITH_WEB.codex = false;
  try {
    assert.equal(on(odd('codex', false, true), 'darwin').network, false);
  } finally {
    Object.assign(A.NETWORK_WITH_WEB, measured);
  }
  assert.deepEqual(on(odd('grok', true, true), 'darwin'), {
    commands: false,
    web: true,
    network: false
  });
  for (const platform of ['linux', 'win32'] as const)
    assert.deepEqual(
      on(odd('claude', true, true), platform),
      { commands: false, web: true, network: false },
      platform
    );
  assert.deepEqual(C.ownTools(odd('claude', false, false), 'darwin').granted, [
    { path: kept, write: true }
  ]);
});

test('a handed-over run keeps its own commands, web and folders; only outside tools come down', () => {
  const caps: Capabilities = {
    level: 'act',
    remit: '',
    office: [],
    outside: [
      {
        connector: { id: 'notion', name: 'Notion', readTools: ['search'] } as ConnectorRow,
        level: 'act'
      }
    ],
    agent: 'claude',
    own: C.ownTools(odd('claude', true, true), 'darwin')
  };
  const run = C.capped(caps, 'draft');
  assert.deepEqual(run.own, caps.own);
  assert.equal(run.outside[0].level, 'read');
});

test('each Odd is told its own tools', () => {
  const shell = "a shell confined to your folders and {owner}'s developer tools (read only)";
  const told = (web: string) => ({
    neither: 'Your own tools work on files only: no shell and no web.',
    commands: `Your own tools work on files, plus ${shell}, with no network. No web.`,
    web: `Your own tools work on files, plus ${web}. No shell.`,
    online: `Your own tools work on files, plus ${shell}, which can reach the internet, and ${web}.`,
    offline: `Your own tools work on files, plus ${shell}, with no network, and ${web}.`
  });
  for (const agent of A.AGENTS) {
    // Gemini's policy allows a write only by its full path, so its Odds are told so.
    const end = agent === 'gemini' ? " Give each file tool the file's full path." : '';
    // Codex's web searches and fetches no page.
    const web = agent === 'codex' ? 'web search' : 'web search and fetch';
    const line = (commands: boolean, web: boolean, network: boolean) =>
      C.ownToolsLine(agent, { commands, web, network });
    assert.deepEqual(
      {
        neither: line(false, false, false),
        commands: line(true, false, false),
        web: line(false, true, false),
        online: line(true, true, true),
        offline: line(true, true, false)
      },
      Object.fromEntries(Object.entries(told(web)).map(([k, v]) => [k, v + end])),
      agent
    );
  }
});

test('the line under Browse the web says what its commands do with it', () => {
  const opens =
    'Search and read web pages. With Run commands on, its commands can reach the internet too.';
  assert.equal(A.webLine('claude', 'darwin', false), opens);
  assert.equal(
    A.webLine('claude', 'darwin', true),
    'Search and read web pages. This version of Claude Code keeps its commands off the internet.'
  );
  assert.equal(A.webLine('claude', 'linux', false), 'Search and read web pages.');
  assert.equal(A.webLine('grok', 'darwin', false), 'Search and read web pages.');
  assert.equal(A.webLine('gemini', 'darwin', false), 'Search and read web pages.');
  assert.equal(
    A.webLine('codex', 'darwin', false),
    'Search the web. Its commands can reach the internet too.'
  );
  // A tool whose walls were not measured open keeps its commands closed, and says so.
  const measured = { ...A.NETWORK_WITH_WEB };
  A.NETWORK_WITH_WEB.codex = false;
  A.NETWORK_WITH_WEB.claude = false;
  try {
    assert.equal(
      A.webLine('codex', 'darwin', false),
      "Search the web. Codex's commands stay off the internet."
    );
    assert.equal(
      A.webLine('claude', 'darwin', false),
      "Search and read web pages. Claude Code's commands stay off the internet."
    );
  } finally {
    Object.assign(A.NETWORK_WITH_WEB, measured);
  }
});

test('the level words, order and parser come from one list', () => {
  assert.deepEqual(W.LEVELS, ['read', 'draft', 'act']);
  assert.equal(W.parseLevel('act'), 'act');
  assert.equal(W.parseLevel('nope'), undefined);
  assert.equal(W.parseLevel(undefined), undefined);
  assert.ok(W.levelAtMost('read', 'draft'));
  assert.ok(W.levelAtMost('act', 'act'));
  assert.ok(!W.levelAtMost('act', 'draft'));
  assert.deepEqual(W.LEVEL_LABEL, {
    read: 'Reads and reports',
    draft: 'Drafts for your yes',
    act: 'Acts on its own'
  });
  assert.deepEqual(W.LEVEL_NAME, { read: 'Read', draft: 'Draft', act: 'Act' });
  assert.deepEqual(W.GRANT_LABEL, { read: 'Read only', act: 'Read and write' });
  assert.deepEqual(W.FOLDER_LABEL, { read: 'Can read', write: 'Can read and change' });
  assert.deepEqual(W.FOLDER_SAID, { read: 'read only', write: 'read and change' });
});

test('a run hands off, and is told the threads it leads, by one rule', () => {
  for (const held of [true, false])
    for (const thread of [true, false])
      for (const handOff of [true, false])
        for (const lesson of [true, false]) {
          const tools = held ? ['hand_off'] : [];
          const tool = held && !handOff && !lesson;
          assert.deepEqual(
            C.handsOff(tools, { thread, handOff, lesson }),
            { tool, leads: tool && !thread },
            JSON.stringify({ held, thread, handOff, lesson })
          );
        }
});

test('a run off its threads hands off and names which thread it raises for, a run on one only hands off there, and a handed-over run hands nothing on', () => {
  assert.deepEqual(runs, {
    offThread: { handOff: true, work: true },
    onThread: { handOff: true, work: false },
    handedOver: { handOff: false, work: false }
  });
});

test("office_report lists each Odd's tool, own tools and folders", async () => {
  const r = await manager.callTool({ name: 'office_report', arguments: {} });
  const text = (r.content as { type: string; text: string }[])[0]?.text ?? '';
  const report = JSON.parse(text) as { staff: Record<string, unknown>[] };
  const mona = report.staff.find((s) => s.id === 'mona');
  assert.ok(mona, text);
  assert.deepEqual(
    [mona.runsOn, mona.ownTools, mona.folders],
    [
      'Claude Code',
      'Your own tools work on files, plus web search and fetch. No shell.',
      [`${kept} (read only)`]
    ]
  );
  const cody = report.staff.find((s) => s.id === 'cody');
  assert.ok(cody, text);
  // With no owner's name set, the office calls them "the owner".
  assert.match(String(cody.ownTools), /the owner's developer tools/);
  assert.doesNotMatch(String(cody.ownTools), /\{owner\}/);
});

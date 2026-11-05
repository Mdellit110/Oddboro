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
const { staff } = await import('../src/schema.ts');

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
await db.insert(staff).values({
  id: 'mona',
  name: 'Mona',
  role: 'Office Manager',
  remit: 'Runs the office.',
  variant: 'a',
  portrait: 'a',
  desk: 'You are Mona.',
  tools: ['office_report'],
  web: true,
  folders: [{ path: kept, write: false }]
});
const manager = await toolServer('mona', { RUN_KEY: 'k-access-profile' });

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
    network: A.NETWORK_WITH_WEB.codex
  });
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
});

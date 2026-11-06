// Which grants accessOf holds back, how an Odd is told about each, what a run
// below the Odd's own level keeps and says (capped, accessInRun), and what
// my_access says of the Odd's tool, its own tools and its folders. That
// access() in apps/office skips a held-back grant is not tested yet (NEW-1617).
// Run with `npm test -w @oddboro/ledger`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEVELS, type Level } from '../src/access-words.ts';
import {
  accessInRun,
  accessOf,
  capped,
  levelLine,
  NETWORK_HELD_LINE,
  outsideLines,
  reachOf,
  type Capabilities
} from '../src/capabilities.ts';
import type { ConnectorRow, GrantRow } from '../src/office.ts';

/** A Claude Code Odd's own tools with both switches off and no folder. */
const noOwnTools = {
  agent: 'claude',
  own: { commands: false, web: false, network: false, granted: [] }
} as const satisfies Pick<Capabilities, 'agent' | 'own'>;

function grant(
  level: Level,
  over: Partial<ConnectorRow> = {}
): GrantRow & { connector: ConnectorRow } {
  const connector = {
    id: 'notion',
    name: 'Notion',
    kind: 'http',
    readTools: ['search'],
    readyAt: new Date(),
    ...over
  } as ConnectorRow;
  return { staffId: 'odd', connectorId: connector.id, level, connector } as GrantRow & {
    connector: ConnectorRow;
  };
}

test('a grant loads only when it is connected and at or below the Odd level', () => {
  for (const permission of LEVELS)
    for (const level of LEVELS)
      for (const ready of [true, false]) {
        const a = accessOf(grant(level, { readyAt: ready ? new Date() : null }), permission);
        const above = LEVELS.indexOf(level) > LEVELS.indexOf(permission);
        const want = above ? 'above its level' : ready ? undefined : 'still connecting';
        assert.equal(a.heldBack, want, `${level} grant, ${permission} Odd, ready ${ready}`);
      }
});

test('a write grant reaches every tool and a read grant counts its read tools', () => {
  assert.equal(reachOf(accessOf(grant('act'), 'act')), 'every tool');
  assert.equal(reachOf(accessOf(grant('read'), 'read')), '1 tool');
  assert.equal(reachOf(accessOf(grant('read', { readTools: ['a', 'b'] }), 'read')), '2 tools');
});

test('each held-back reason tells the Odd what brings the tool back', () => {
  const caps = (a: ReturnType<typeof accessOf>): Capabilities => ({
    level: 'draft',
    remit: '',
    office: [],
    outside: [a],
    ...noOwnTools
  });
  const line = (a: ReturnType<typeof accessOf>) => outsideLines(caps(a), 'Sam')[0];
  assert.equal(
    line(accessOf(grant('act'), 'draft')),
    'Notion (read and write): held back. It needs the Act level, and the current level is Draft. It works again once Sam raises the level.'
  );
  assert.equal(
    line(accessOf(grant('read', { readyAt: null }), 'draft')),
    'Notion (read only): held back until Sam finishes connecting it.'
  );
  assert.equal(
    line({ ...accessOf(grant('read'), 'draft'), heldBack: 'sign-in ran out' }),
    'Notion (read only): held back. Its sign-in ran out, and Sam needs to sign in again.'
  );
  assert.equal(line(accessOf(grant('read'), 'draft')), 'Notion (read only): 1 tool.');
});

test('only the Act level is told it may use a write tool without asking', () => {
  for (const level of LEVELS)
    assert.equal(levelLine(level, 'Sam').includes('without asking'), level === 'act', level);
});

test('a run capped at Draft reads as Draft, and a write grant it still loads comes down to read', () => {
  const own: Capabilities = {
    level: 'act',
    remit: '',
    office: [],
    outside: [accessOf(grant('act'), 'act'), accessOf(grant('read', { id: 'drive' }), 'act')],
    ...noOwnTools
  };
  const run = capped(own, 'draft');
  assert.equal(run.level, 'draft');
  assert.deepEqual(
    run.outside.map((a) => [a.connector.id, a.level, a.heldBack]),
    [
      ['notion', 'read', undefined],
      ['drive', 'read', undefined]
    ]
  );
  assert.equal(outsideLines(run, 'Sam')[0], 'Notion (read only): 1 tool.');
  // The Odd's own access is unchanged: office_report reads it.
  assert.equal(own.level, 'act');
  assert.equal(own.outside[0].level, 'act');
});

test('a write grant a Draft Odd holds stays held back above its level, capped or not', () => {
  const own: Capabilities = {
    level: 'draft',
    remit: '',
    office: [],
    outside: [accessOf(grant('act'), 'draft')],
    ...noOwnTools
  };
  const [a] = capped(own, 'draft').outside;
  assert.equal(a.level, 'act');
  assert.equal(a.heldBack, 'above its level');
});

test("my_access says a capped run's level and why, and an uncapped run's own level", () => {
  const own: Capabilities = {
    level: 'act',
    remit: '',
    office: [],
    outside: [accessOf(grant('act'), 'act')],
    ...noOwnTools
  };
  const draftOnly = accessInRun(own, 'Sam', { CEILING: 'draft' });
  assert.equal(
    draftOnly,
    [
      levelLine('draft', 'Sam'),
      "This run was started by a colleague or by the office, not by Sam's yes, so it works at Draft at most.",
      'Your runs go through Claude Code.',
      'Your own tools work on files only: no shell and no web.',
      'Sam has given you no folders.',
      '- (id: notion) Notion (read only): 1 tool.'
    ].join('\n')
  );
  assert.equal(
    accessInRun(own, 'Sam', {}),
    [
      levelLine('act', 'Sam'),
      'Your runs go through Claude Code.',
      'Your own tools work on files only: no shell and no web.',
      'Sam has given you no folders.',
      '- (id: notion) Notion (read and write): every tool.'
    ].join('\n')
  );
  assert.match(
    accessInRun(own, 'Sam', { SIGNED_OUT: 'notion' }),
    /Its sign-in ran out, and Sam needs to sign in again\./
  );
});

test('my_access says the tool, what its own tools reach and each folder, and a held network', () => {
  const own: Capabilities = {
    level: 'draft',
    remit: '',
    office: [],
    outside: [],
    agent: 'claude',
    own: {
      commands: true,
      web: true,
      network: true,
      granted: [
        { path: '/Users/Shared/p', write: false },
        { path: '/Users/Shared/q', write: true }
      ]
    }
  };
  const shell = "a shell confined to your folders and Sam's developer tools (read only)";
  const said = (env: Record<string, string>) => accessInRun(own, 'Sam', env).split('\n');
  assert.deepEqual(said({}), [
    levelLine('draft', 'Sam'),
    'Your runs go through Claude Code.',
    `Your own tools work on files, plus ${shell}, which can reach the internet, and web search and fetch.`,
    'Folders Sam gave you:',
    '- /Users/Shared/p (read only)',
    '- /Users/Shared/q (read and change)',
    'Sam has connected no outside tools for you yet.'
  ]);
  const held = said({ OFFICE_NETWORK_HELD: '1' });
  assert.equal(
    held[2],
    `Your own tools work on files, plus ${shell}, with no network, and web search and fetch.`
  );
  assert.equal(held[3], NETWORK_HELD_LINE);
  assert.equal(
    NETWORK_HELD_LINE,
    'This version of Claude Code refuses to let your commands reach the internet, so they have none.'
  );
  // A hold takes away only a network the run would have had, so nothing is said without one.
  const offline = { ...own, own: { ...own.own, web: false, network: false } };
  assert.ok(!accessInRun(offline, 'Sam', { OFFICE_NETWORK_HELD: '1' }).includes(NETWORK_HELD_LINE));
  // The refusal is Claude Code's, so a held office leaves another tool's Odd as it is.
  const codex = { ...own, agent: 'codex' as const };
  assert.equal(
    accessInRun(codex, 'Sam', { OFFICE_NETWORK_HELD: '1' }),
    accessInRun(codex, 'Sam', {})
  );
});

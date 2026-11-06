// What the owner can grant (OWNER_GRANTS): each line an Odd hears when it
// lacks a grant, said through each function the list names, and the values a
// hire starts with (HIRE_DEFAULTS). hire() writes rows, so pglite.ts stands in
// for the database. Run with `npm test -w @oddboro/ledger`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import './pglite.ts';

const { getTableColumns } = await import('drizzle-orm');
const { officeSection, settingsTab } = await import('../src/access-words.ts');
const { accessInRun, askAboveLevel, outsideLines, ownToolsLine } =
  await import('../src/capabilities.ts');
const G = await import('../src/grantable.ts');
const { hire, officeAgent } = await import('../src/office.ts');
const { GRANTABLE_TOOLS } = await import('../src/tools.ts');
const { hireManager, MANAGERS } = await import('../src/managers.ts');
const { staff } = await import('../src/schema.ts');
type Capabilities = import('../src/capabilities.ts').Capabilities;
type GrantKind = import('../src/grantable.ts').GrantKind;

const where = officeSection('your');
/** A Claude Code Odd on a Mac with both switches off and no folder. */
const bare = {
  commands: false,
  commandsHow: { state: 'switch' },
  web: false,
  network: false
} as const;
/** A Draft Odd holding a write grant, which its level holds back. */
const heldBack: Capabilities = {
  level: 'draft',
  remit: '',
  office: [],
  agent: 'claude',
  own: { ...bare, granted: [] },
  outside: [
    {
      connector: { id: 'notion', name: 'Notion', readTools: ['search'] },
      level: 'act',
      heldBack: 'above its level'
    } as Capabilities['outside'][number]
  ]
};

/**
 * For each grant, what an Odd lacking it hears through each function the
 * list names, and what one holding it hears instead. Keyed by GrantKind, so a
 * new grant fails the type check here until it says how it is heard.
 */
const HEARD: Record<GrantKind, () => void> = {
  commands: () => {
    const lacks =
      'No shell: {owner} can switch on Run commands in your Settings tab, under Office.';
    assert.equal(
      G.OWNER_GRANTS.commands.missing({ agent: 'claude', how: { state: 'switch' }, where }),
      lacks
    );
    assert.ok(ownToolsLine('claude', bare).includes(lacks));
    // A tool that never follows the switch is never offered it.
    const grok = { ...bare, commandsHow: { state: 'never', why: '' } } as const;
    const never = "No shell: Grok can't run commands here.";
    assert.equal(
      G.OWNER_GRANTS.commands.missing({ agent: 'grok', how: grok.commandsHow, where }),
      never
    );
    assert.ok(ownToolsLine('grok', grok).includes(never));
    assert.doesNotMatch(ownToolsLine('claude', { ...bare, commands: true }), /No shell/);
  },
  web: () => {
    const lacks =
      'No web: {owner} can switch on Browse the web in your Settings tab, under Office.';
    assert.equal(G.OWNER_GRANTS.web.missing({ where }), lacks);
    assert.ok(ownToolsLine('claude', bare).includes(lacks));
    assert.doesNotMatch(ownToolsLine('claude', { ...bare, web: true }), /No web/);
  },
  folders: () => {
    const lacks = 'Sam can give you a folder outside the office in your Settings tab.';
    assert.equal(
      G.OWNER_GRANTS.folders.missing({ owner: 'Sam', where: settingsTab('your') }),
      lacks
    );
    assert.ok(
      accessInRun(heldBack, 'Sam', {})
        .split('\n')
        .includes(`Sam has given you no folders. ${lacks}`)
    );
    const given = {
      ...heldBack,
      own: { ...heldBack.own, granted: [{ path: '/tmp', write: false }] }
    };
    assert.ok(!accessInRun(given, 'Sam', {}).includes(lacks));
  },
  office_tools: () => {
    const lacks =
      'Sam grants other office tools in your Settings tab, under Office; when a job needs one, say which and why in your reply.';
    assert.equal(G.OWNER_GRANTS.office_tools.missing({ owner: 'Sam', where }), lacks);
    assert.ok(accessInRun(heldBack, 'Sam', {}).split('\n').includes(lacks));
    // One office tool still not given is enough to hear it.
    const lacksOne = { ...heldBack, office: GRANTABLE_TOOLS.slice(1) };
    assert.ok(accessInRun(lacksOne, 'Sam', {}).split('\n').includes(lacks));
    const holdsAll = { ...heldBack, office: [...GRANTABLE_TOOLS] };
    assert.ok(!accessInRun(holdsAll, 'Sam', {}).includes('grants other office tools'));
  },
  // house() is in the office, which a ledger test cannot import: its own
  // test holds this line (house.test.ts).
  outside_tools: () => {
    const has = (held: string[]) => (t: string) => held.includes(t);
    const said = (held: string[]) => G.OWNER_GRANTS.outside_tools.missing({ has: has(held) });
    assert.equal(
      said(['ask_for_access', 'find_connectors']),
      ' For more outside tools, call find_connectors, then ask_for_access.'
    );
    assert.equal(said(['ask_for_access']), ' For more outside tools, call ask_for_access.');
    assert.equal(said([]), '');
  },
  level: () => {
    const yours = 'Sam sets your level on your Settings tab, under Model.';
    const rowans = "Sam sets Rowan's level on Rowan's Settings tab, under Model.";
    assert.equal(G.OWNER_GRANTS.level.missing({ owner: 'Sam', whose: 'your' }), yours);
    assert.equal(G.OWNER_GRANTS.level.missing({ owner: 'Sam', whose: "Rowan's" }), rowans);
    assert.ok(outsideLines(heldBack, 'Sam')[0].endsWith(` ${yours}`));
    assert.ok(outsideLines(heldBack, 'Sam', 'Rowan')[0].endsWith(` ${rowans}`));
    assert.ok(askAboveLevel('draft', 'write', 'Sam').includes(` ${yours} `));
    // At its level the grant loads, and no route is said.
    const holds = { ...heldBack, level: 'act' as const };
    holds.outside = [{ ...heldBack.outside[0], heldBack: undefined }];
    assert.doesNotMatch(outsideLines(holds, 'Sam')[0], /sets your level/);
  }
};

test('an Odd lacking each grantable capability hears its line, word for word, through each function that says it, and one holding it does not; a capability with no line names its Linear row', () => {
  for (const kind of G.GRANT_KINDS) {
    const g = G.OWNER_GRANTS[kind];
    // A grant with a line is heard somewhere; one with none is heard nowhere.
    assert.equal(typeof g.missing === 'function', g.heard.length > 0, kind);
    HEARD[kind]();
  }
});

test('every staff PATCH key is the control of the grant it is classed as, a run setting, or a qualifier a control names', () => {
  const named = new Map<string, GrantKind>();
  for (const kind of G.GRANT_KINDS) {
    const c = G.OWNER_GRANTS[kind].control;
    if ('patch' in c) for (const key of c.patch) named.set(key, kind);
  }
  for (const key of G.STAFF_PATCH_KEYS) {
    const is = G.PATCH_KEY[key];
    if (is === 'run setting') assert.ok(!named.has(key), key);
    else if (is === 'qualifier') assert.ok(named.has(key), key);
    else assert.equal(named.get(key), is, key);
  }
});

test('a grant the owner gives through an ask says what approving it does, from the desk answers', () => {
  for (const kind of G.GRANT_KINDS) {
    const g = G.OWNER_GRANTS[kind];
    assert.equal('ask' in g.route, 'approving' in g, kind);
  }
});

test('a hire with nothing picked starts from HIRE_DEFAULTS, and a manager from its own', async () => {
  const columns = getTableColumns(staff);
  for (const key of ['permission', 'tools', 'commands', 'web', 'folders'] as const)
    assert.deepEqual(columns[key].default, G.HIRE_DEFAULTS.staff[key], `${key}'s column default`);

  const row = await hire({
    name: 'Quinn',
    role: 'Tester',
    variant: 'a',
    portrait: 'a',
    room: 'workspace',
    remit: 'Tests.',
    desk: 'You are Quinn.'
  });
  const { permission, tools, commands, web, folders } = G.HIRE_DEFAULTS.staff;
  assert.deepEqual(
    {
      permission: row.permission,
      tools: row.tools,
      commands: row.commands,
      web: row.web,
      folders: row.folders
    },
    { permission, tools, commands, web, folders }
  );
  assert.deepEqual(
    { agent: row.agent, account: row.account, model: row.model, effort: row.effort },
    { agent: officeAgent(), account: null, model: null, effort: null }
  );

  const manager = await hireManager({ preset: MANAGERS[0].id });
  assert.deepEqual(
    { permission: manager.permission, tools: manager.tools },
    G.HIRE_DEFAULTS.manager
  );
});

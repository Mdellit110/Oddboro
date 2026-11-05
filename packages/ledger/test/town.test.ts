// The town's rules: return visits, what an Odd may remember, what each Odd may
// read, how the first visit is counted, and the Main Street preview. The
// database calls around them (town.ts) are not tested here: there is no test
// database.
// Run with `npm test -w @oddboro/ledger`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  answerOf,
  arrive,
  boroName,
  commsOf,
  confidenceOf,
  contextLines,
  enter,
  GUESS_CAP,
  inviteLink,
  readInvite,
  stepFrom,
  stepOfKey,
  meaningful,
  NEW_TOWN,
  proposalProblem,
  QUESTIONS,
  readAgentFile,
  recommended,
  RETURN_AFTER_MS,
  shopOfRoom,
  starterSpec,
  STYLES,
  suggestedAssignment,
  suggest,
  visibleTo,
  type ContextItem,
  type Townsperson
} from '../src/town-rules.ts';

const T0 = new Date('2026-11-03T09:00:00Z');
const later = (ms: number) => new Date(T0.getTime() + ms);

function item(over: Partial<ContextItem>): ContextItem {
  return {
    id: 1,
    kind: 'goal',
    basis: 'said',
    status: 'kept',
    title: 'Open a bakery in the spring',
    body: '',
    source: 'juno',
    forStaffId: null,
    confidence: 1,
    file: null,
    ...over
  };
}

const FOLK: Townsperson[] = [
  { id: 'juno', name: 'Juno', shop: 'coffee', remit: 'Gets to know you.' },
  { id: 'theo', name: 'Theo', shop: 'general', remit: 'Finds a next step.' },
  { id: 'ada', name: 'Ada', shop: 'workshop', remit: 'Makes something real.' }
];

// A new owner with no context

test('a new owner arrives for the first time, with nothing kept', () => {
  const r = arrive(undefined, T0);
  assert.equal(r.firstEver, true);
  assert.equal(r.returning, false);
  assert.equal(r.state.sessions, 1);
  assert.deepEqual(r.state.visited, []);
  const lines = contextLines([], () => '');
  assert.match(lines[0], /has not let the office remember anything/);
});

test('a reload in the same sitting is not a new visit', () => {
  const first = arrive(undefined, T0).state;
  const again = arrive(first, later(60_000));
  assert.equal(again.returning, false);
  assert.equal(again.state.sessions, 1);
});

// A returning owner with memory

test('coming back after a gap counts once, and keeps where they were', () => {
  const s = enter(arrive(undefined, T0).state, 'coffee');
  const back = arrive(s, later(RETURN_AFTER_MS + 1));
  assert.equal(back.returning, true);
  assert.equal(back.state.sessions, 2);
  assert.equal(back.state.at, 'coffee');
  assert.deepEqual(back.state.visited, ['coffee']);
});

test('a returning Odd reads what the owner kept, apart from guesses', () => {
  const lines = contextLines(
    [
      item({}),
      item({
        id: 2,
        kind: 'preference',
        basis: 'inferred',
        confidence: 0.5,
        title: 'Likes short answers'
      })
    ],
    () => ''
  ).join('\n');
  assert.match(lines, /A goal: Open a bakery in the spring$/m);
  assert.match(lines, /Likes short answers \[a guess, 50% sure\]/);
});

// An owner who skips the guide

test('entering shops in any order works without choosing the guide', () => {
  let s = enter(NEW_TOWN, 'workshop');
  s = enter(s, 'coffee');
  s = enter(s, 'workshop');
  assert.equal(s.guide, undefined);
  assert.deepEqual(s.visited, ['workshop', 'coffee']);
  assert.equal(s.at, 'workshop');
});

test('a composed shop room names its shop; other rooms name none', () => {
  assert.equal(shopOfRoom('shop-coffee#2'), 'coffee');
  assert.equal(shopOfRoom('shop-workshop'), 'workshop');
  assert.equal(shopOfRoom('street-town#0'), undefined);
});

// An owner who changes a stated preference

test('a correction is allowed, and the old row stops being read once replaced', () => {
  assert.equal(
    proposalProblem({ kind: 'preference', basis: 'said', title: 'Prefers mornings now' }, true),
    undefined
  );
  const rows = [
    item({ id: 1, kind: 'preference', title: 'Prefers evenings', status: 'replaced' }),
    item({ id: 2, kind: 'preference', title: 'Prefers mornings now' })
  ];
  assert.deepEqual(
    visibleTo(rows, 'ada').map((r) => r.id),
    [2]
  );
});

// An owner who declines memory

test('with memory off, nothing may be proposed', () => {
  assert.match(
    proposalProblem({ kind: 'goal', basis: 'said', title: 'Open a bakery' }, false) ?? '',
    /turned memory off/
  );
});

test('a row waiting on Remember is never read by any Odd', () => {
  assert.deepEqual(visibleTo([item({ status: 'proposed' })], 'ada'), []);
});

test('Odds never guess at private things, and guess only at preferences', () => {
  assert.match(
    proposalProblem(
      { kind: 'preference', basis: 'inferred', title: 'Probably religious, mentioned church' },
      true
    ) ?? '',
    /Never guess/
  );
  assert.match(
    proposalProblem({ kind: 'fact', basis: 'inferred', title: 'Lives alone' }, true) ?? '',
    /Only a preference/
  );
  // The owner saying it themselves is theirs to keep.
  assert.equal(
    proposalProblem(
      { kind: 'fact', basis: 'said', title: 'Training for a marathon after knee surgery' },
      true
    ),
    undefined
  );
  assert.equal(
    confidenceOf({ kind: 'preference', basis: 'inferred', title: 'x', confidence: 0.95 }),
    GUESS_CAP
  );
  assert.equal(confidenceOf({ kind: 'goal', basis: 'said', title: 'x', confidence: 0.2 }), 1);
});

// Handoffs, and when one fails

test('a handoff is read only by the Odd it is for, once the owner says yes', () => {
  const brief = item({
    id: 5,
    kind: 'handoff',
    forStaffId: 'ada',
    title: 'A launch plan for the bakery'
  });
  assert.equal(visibleTo([brief], 'ada').length, 1);
  assert.equal(visibleTo([brief], 'theo').length, 0);
  assert.equal(visibleTo([{ ...brief, status: 'proposed' }], 'ada').length, 0);
  const lines = contextLines(visibleTo([brief], 'ada'), (id) => (id === 'juno' ? 'Juno' : id)).join(
    '\n'
  );
  assert.match(lines, /Juno passed you this, with \{owner\}'s yes: A launch plan for the bakery/);
});

test('remember cannot be used to sneak a handoff past the owner', () => {
  assert.match(
    proposalProblem({ kind: 'handoff', basis: 'said', title: 'x' }, true) ?? '',
    /Use hand_off/
  );
});

test('a lost handoff or failed read leaves an Odd with nothing, so it asks', () => {
  // contextFor returns [] on a database failure; the prompt then says nothing is kept.
  assert.match(contextLines([], () => '')[0], /has not let the office remember anything/);
});

// The first visit's counts

test('a meaningful interaction is something gained, not messages sent', () => {
  assert.equal(meaningful('context_saved'), true);
  assert.equal(meaningful('handoff_completed'), true);
  assert.equal(meaningful('task_completed'), true);
  assert.equal(meaningful('shop_entered'), false);
  assert.equal(meaningful('town_arrived'), false);
});

// The Main Street preview, including straight away

test('an owner who wants Main Street at once gets every Odd offered and none ticked', () => {
  const s = suggest(FOLK, [], []);
  assert.equal(s.length, 3);
  assert.ok(s.every((x) => !x.keep));
  assert.match(s[2].reason, /You have not met Ada yet/);
});

test('suggestions follow what the owner did and said, with a reason each', () => {
  const kept = [
    item({ id: 1, source: 'juno' }),
    item({ id: 2, kind: 'outcome', source: 'ada', title: 'Bakery launch plan', basis: 'observed' })
  ];
  const s = suggest(FOLK, kept, ['coffee', 'workshop']);
  const by = Object.fromEntries(s.map((x) => [x.id, x]));
  assert.equal(by.juno.keep, true);
  assert.match(by.juno.reason, /already knows one thing/);
  // A brief Juno passed on is not something the owner shared.
  assert.match(
    suggest(
      FOLK,
      [...kept, item({ id: 3, kind: 'handoff', source: 'juno', forStaffId: 'ada' })],
      []
    )[0].reason,
    /already knows one thing/
  );
  assert.equal(by.ada.keep, true);
  assert.match(by.ada.reason, /You made "Bakery launch plan" together/);
  assert.equal(by.theo.keep, false);
});

// The invite

const LOOK = {
  hair: 'short-crop',
  top: 'hoodie',
  bottom: 'trousers',
  colours: { hair: 'black', skin: 'brown', top: 'navy', bottom: 'charcoal', shoes: 'black' }
};

test('an invite link carries the friend, their Odd and their note, and reads back', () => {
  const link = inviteLink({ name: 'Zoë', look: LOOK, note: 'Coffee is on me.' });
  assert.match(link, /^https:\/\/oddboro\.com\/invite\/#[A-Za-z0-9_-]+$/);
  assert.deepEqual(readInvite(link), { name: 'Zoë', look: LOOK, note: 'Coffee is on me.' });
  // The code alone works too, pasted without the address.
  assert.equal(readInvite(link.split('#')[1])?.name, 'Zoë');
});

test('anything that is not an invite reads as none', () => {
  assert.equal(readInvite(''), undefined);
  assert.equal(readInvite('https://oddboro.com/invite/'), undefined);
  assert.equal(readInvite('not an invite at all'), undefined);
  const bad = Buffer.from(JSON.stringify({ v: 2, n: 'Sam' })).toString('base64url');
  assert.equal(readInvite(bad), undefined);
});

test('an invite brings only a name, a look and a note, cut to size', () => {
  const code = Buffer.from(
    JSON.stringify({
      v: 1,
      n: 'A'.repeat(80),
      l: { ...LOOK, hair: '<script>' },
      m: 'hi',
      admin: true
    })
  ).toString('base64url');
  const i = readInvite(code)!;
  assert.equal(i.name.length, 30);
  assert.equal(i.look, undefined);
  assert.deepEqual(Object.keys(i).sort(), ['name', 'note']);
});

// Walking

test('the arrow keys and WASD walk one tile', () => {
  assert.equal(stepOfKey('ArrowUp'), 'up');
  assert.equal(stepOfKey('W'), 'up');
  assert.equal(stepOfKey('a'), 'left');
  assert.equal(stepOfKey('Enter'), undefined);
  assert.deepEqual(stepFrom([5, 5], 'right'), [6, 5]);
  assert.deepEqual(stepFrom([5, 5], 'up'), [5, 4]);
});

// Pip's first session: the shops' questions, the boro, the hire, and bringing an agent

test('each shop asks one question, and each answer is something kept as said', () => {
  for (const s of ['coffee', 'general', 'workshop'] as const) {
    const q = QUESTIONS[s];
    assert.ok(q.answers.length >= 3);
    for (const a of q.answers) {
      assert.equal(answerOf(s, a.keep)?.id, a.id);
      assert.equal(
        proposalProblem({ kind: q.kind, basis: 'said', title: a.keep }, true),
        undefined
      );
    }
  }
});

test('a starter boro is small and named, in the style picked', () => {
  const spec = starterSpec(boroName('', 'Sam Rivera'), 'studio');
  assert.equal(spec.name, "Sam's Boro");
  assert.equal(spec.wall, STYLES.studio.spec.wall);
  assert.deepEqual(
    spec.rooms.map((r) => r.kind),
    ['office', 'lobby', 'workspace']
  );
  // The front room carries the boro's name, for its sign.
  assert.equal(spec.rooms[1].name, spec.name);
  assert.equal(boroName('  The   Lab ', 'x'), 'The Lab');
  assert.equal(boroName('', ''), 'My Boro');
});

test('what the owner said in town fills in the hire', () => {
  const short = QUESTIONS.coffee.answers.find((a) => a.id === 'short')!.keep;
  const story = QUESTIONS.coffee.answers.find((a) => a.id === 'story')!.keep;
  assert.equal(commsOf(short), 'short');
  assert.equal(commsOf(story), 'story');
  assert.equal(commsOf(undefined), 'short');
  const tasks = QUESTIONS.general.answers.find((a) => a.id === 'tasks')!.keep;
  assert.deepEqual(recommended(tasks), ['tasks', 'report']);
  assert.deepEqual(recommended(undefined), ['projects', 'report']);
  assert.equal(suggestedAssignment(tasks, undefined), 'tasks');
  const plan = QUESTIONS.workshop.answers.find((a) => a.id === 'plan')!.keep;
  assert.equal(suggestedAssignment(undefined, plan), 'projects');
  assert.equal(suggestedAssignment(undefined, undefined), 'build');
});

test('a Claude Code agent file comes in with its instructions, and names what stays behind', () => {
  const file = [
    '---',
    'name: code-reviewer',
    'description: Reviews pull requests for bugs',
    'tools: Read, Grep, Bash',
    'model: sonnet',
    '---',
    'You review code. Be specific.'
  ].join('\n');
  const a = readAgentFile(file)!;
  assert.equal(a.name, 'code-reviewer');
  assert.equal(a.description, 'Reviews pull requests for bugs');
  assert.deepEqual(a.tools, ['Read', 'Grep', 'Bash']);
  assert.equal(a.model, 'sonnet');
  assert.equal(a.instructions, 'You review code. Be specific.');
});

test('pasted instructions need a name, and nothing empty comes in', () => {
  assert.equal(readAgentFile('Help me plan trips.', '')?.name, undefined);
  assert.equal(
    readAgentFile('Help me plan trips.', 'Trip planner')?.instructions,
    'Help me plan trips.'
  );
  assert.equal(readAgentFile('', 'Empty'), undefined);
  assert.equal(readAgentFile('---\nname: x\n---\n'), undefined);
});

test('the first task finishing is meaningful; the hire starting is not yet', () => {
  assert.equal(meaningful('first_task_completed'), true);
  assert.equal(meaningful('agent_create_attempt'), false);
  assert.equal(meaningful('pip_intro'), false);
});

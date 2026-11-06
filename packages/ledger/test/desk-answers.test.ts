// What reaches the Odd when the owner answers something on the desk, held to
// its row in OWNER_ANSWERS and GOAL_ANSWERS: each ask kind's yes, no and
// send-back through the function the office answers it with, each way a task
// ends, and a goal's change of status. The office's own code on every
// migration, in an in-memory PGlite (pglite.ts). Run with
// `npm test -w @oddboro/ledger`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq, max } from 'drizzle-orm';
import {
  ASK_KINDS,
  asks,
  connectors,
  followUps,
  goals,
  grants,
  staff,
  staffGoals,
  tasks,
  threads,
  type AskKind,
  type Step
} from '../src/schema.ts';
import { db } from './pglite.ts';

process.env.OLLAMA_URL = 'http://127.0.0.1:9';
const { DECISIONS, decideAsk, finishTask, giveTask, hire, raiseAsk } =
  await import('../src/office.ts');
const { approveGoal, approveHire, approvePlan, updateGoal } = await import('../src/goals.ts');
const { handOff } = await import('../src/hand-offs.ts');
const { HAND_OFF_LIMIT } = await import('../src/threads.ts');
const { MANAGER_ROLE } = await import('../src/managers.ts');
const { GOAL_ANSWERS, OWNER_ANSWERS } = await import('../src/desk-answers.ts');
type AskAnswer = import('../src/desk-answers.ts').AskAnswer;
type Effect = import('../src/desk-answers.ts').Effect;
type Decision = import('../src/office.ts').Decision;

const odd = (id: string, name: string, role = 'Tester') => ({
  id,
  name,
  role,
  remit: 'Tests.',
  variant: 'a',
  portrait: 'a',
  permission: 'draft' as const,
  desk: `You are ${name}.`
});
// Ada asks, Ivy is her colleague, and Max manages the office.
await db
  .insert(staff)
  .values([odd('ada', 'Ada'), odd('ivy', 'Ivy'), odd('max', 'Max', MANAGER_ROLE)]);
await db
  .insert(connectors)
  .values({ id: 'gmail', name: 'Gmail', description: 'Gmail', kind: 'http', readyAt: new Date() });

/** A thread Ada leads, with `at` hand-offs used. */
async function thread(at = 0): Promise<number> {
  const [t] = await db
    .insert(threads)
    .values({ title: 'Plan the fair', hubId: 'ada', holderId: 'ada', handOffsUsed: at })
    .returning({ id: threads.id });
  return t.id;
}
async function aGoal(title: string): Promise<number> {
  const [g] = await db.insert(goals).values({ title }).returning({ id: goals.id });
  return g.id;
}

/** Each grant and each Odd serving a goal, keyed by the row, as what it shows an Odd got. */
async function held(): Promise<Map<string, string>> {
  const granted = await db.select().from(grants);
  const served = await db.select().from(staffGoals);
  return new Map([
    ...granted.map((g) => [`${g.staffId} ${g.connectorId}`, `grant:${g.staffId}`] as const),
    ...served.map((s) => [`${s.staffId} goal ${s.goalId}`, `serves:${s.staffId}`] as const)
  ]);
}
type Mark = { followUp: number; held: Map<string, string> };
async function markNow(): Promise<Mark> {
  const [last] = await db.select({ id: max(followUps.id) }).from(followUps);
  return { followUp: last?.id ?? 0, held: await held() };
}
/**
 * What reached an Odd since `mark`: each new follow-up as `<kind>:<odd>`, each
 * new grant as `grant:<odd>`, and each Odd newly serving a goal as `serves:<odd>`.
 */
async function reached(mark: Mark): Promise<string[]> {
  const ups = await db.select().from(followUps);
  const now = await held();
  return [
    ...ups.filter((f) => f.id > mark.followUp).map((f) => `${f.kind}:${f.staffId}`),
    ...[...now].filter(([key]) => !mark.held.has(key)).map(([, shown]) => shown)
  ].sort();
}

/** The effects a cell names, as the office reads them. */
const effectsOf = (cell: AskAnswer[Decision]): readonly Effect[] =>
  cell === 'refused' ? [] : 'by' in cell ? cell.then : cell;
const cellOf = (kind: AskKind, decision: Decision) =>
  (OWNER_ANSWERS.ask[kind] as AskAnswer)[decision];

/**
 * Each answer pinned by hand, so a wrong cell in OWNER_ANSWERS fails here
 * rather than moving the office and its test together: the cell as written,
 * and what reaches an Odd when the ask was raised on a thread and on none
 * (left out for a kind always raised on one). An answer to the usage window's
 * ask changes nothing an Odd sees on a no, so only its cell can hold it.
 */
type Pin = { cell: AskAnswer[Decision]; onThread: string[]; onNone?: string[] };
const OFF_A_THREAD = { none: 'NEW-1715' };
const NO: Pin = {
  cell: ['answer_back', 'denied_lesson', OFF_A_THREAD],
  onThread: ['denied:ada', 'resume:ada'],
  onNone: ['denied:ada']
};
const REWORK: Pin = { cell: ['rework'], onThread: ['rework:ada'], onNone: ['rework:ada'] };
const REFUSED: Pin = { cell: 'refused', onThread: [] };
const PINNED: Record<AskKind, Record<Decision, Pin>> = {
  approval: {
    approve: { cell: ['carry_out'], onThread: ['carry_out:ada'], onNone: ['carry_out:ada'] },
    deny: NO,
    iterate: REWORK
  },
  // Gmail is connected already, so the work that waited on it starts at once.
  access: {
    approve: {
      cell: ['grant_access'],
      onThread: ['carry_out:ada', 'grant:ada'],
      onNone: ['carry_out:ada', 'grant:ada']
    },
    deny: NO,
    iterate: REWORK
  },
  hire: {
    approve: {
      cell: { by: 'hiring', then: ['answer_back', OFF_A_THREAD] },
      onThread: ['resume:ada'],
      onNone: []
    },
    deny: NO,
    iterate: REWORK
  },
  goal: {
    approve: {
      cell: ['approval_work', 'answer_back', OFF_A_THREAD],
      onThread: ['goal:max', 'resume:ada'],
      onNone: ['goal:max']
    },
    deny: NO,
    iterate: REWORK
  },
  // On its goal's thread, which Max leads; the plan's part makes Ivy serve the goal.
  plan: {
    approve: { cell: ['approval_work', 'answer_back'], onThread: ['resume:max', 'serves:ivy'] },
    deny: { cell: ['answer_back', 'denied_lesson'], onThread: ['denied:ada', 'resume:max'] },
    iterate: { cell: ['rework'], onThread: ['rework:ada'] }
  },
  hand_offs: {
    approve: { cell: ['start_held', 'answer_hand_offs'], onThread: ['hand_off:ivy', 'resume:ada'] },
    deny: { cell: ['answer_hand_offs', 'denied_lesson'], onThread: ['denied:ada', 'resume:ada'] },
    iterate: REFUSED
  },
  window: {
    approve: { cell: ['answer_window'], onThread: ['resume:ada'] },
    deny: { cell: ['answer_window'], onThread: [] },
    iterate: REFUSED
  }
};

type Raised = { id: number };
/** An open ask of each kind, raised as the office raises it, on a thread of Ada's or on none. */
const raise: Record<AskKind, (onThread: boolean) => Promise<Raised>> = {
  approval: async (on) => {
    const threadId = on ? await thread() : undefined;
    const { ask } = await raiseAsk('ada', {
      title: 'Book the hall',
      why: 'w',
      ifApproved: 'i',
      threadId
    });
    return { id: ask.id };
  },
  access: async (on) => {
    const threadId = on ? await thread() : undefined;
    const { ask } = await raiseAsk('ada', {
      title: 'Read Gmail',
      why: 'w',
      ifApproved: 'i',
      access: { connector: 'gmail', level: 'read' },
      threadId
    });
    await db.delete(grants);
    return { id: ask.id };
  },
  hire: async (on) => {
    const threadId = on ? await thread() : undefined;
    const { ask } = await raiseAsk('ada', {
      title: 'Hire a baker',
      why: 'w',
      ifApproved: 'i',
      hire: {
        name: 'Bo',
        role: 'Baker',
        permission: 'draft',
        remit: 'Bakes.',
        jobDescriptionFile: 'baker.md'
      },
      threadId
    });
    return { id: ask.id };
  },
  goal: async (on) => {
    const threadId = on ? await thread() : undefined;
    const { ask } = await raiseAsk('ada', {
      title: 'Run the fair',
      why: 'w',
      ifApproved: 'i',
      kind: 'goal',
      goal: { title: `Run the fair ${Math.random()}`, horizon: 'ongoing', area: 'home' },
      threadId
    });
    return { id: ask.id };
  },
  // A plan always goes on its goal's one thread, which the manager leads.
  plan: async () => {
    const goalId = await aGoal(`Bake sale ${Math.random()}`);
    const { ask } = await raiseAsk('ada', {
      title: 'Plan the bake sale',
      why: 'w',
      ifApproved: 'i',
      kind: 'plan',
      plan: { goalId, items: [{ kind: 'assign', staff: 'ivy', part: 'Bake' }] }
    });
    return { id: ask.id };
  },
  // Past the round's limit, Ada's next hand-off to Ivy waits for the owner.
  hand_offs: async () => {
    const id = await thread(HAND_OFF_LIMIT);
    const r = await handOff({
      from: 'ada',
      to: 'ivy',
      work: { title: 'Ice the cakes', brief: 'Ice them.' },
      thread: { id }
    });
    assert.ok('asked' in r, JSON.stringify(r));
    return { id: r.asked };
  },
  // The usage window's ask holds a thread of Ada's until the owner answers.
  window: async () => {
    const [a] = await db
      .insert(asks)
      .values({ staffId: 'max', kind: 'window', title: 'Keep going?', why: 'w', ifApproved: 'i' })
      .returning({ id: asks.id });
    const id = await thread();
    await db.update(threads).set({ heldBy: a.id }).where(eq(threads.id, id));
    return { id: a.id };
  }
};
/** The owner's decision, through the function the office answers each with. */
async function answer(
  kind: AskKind,
  decision: Decision,
  id: number,
  reason: string | null
): Promise<void> {
  const cell = cellOf(kind, decision);
  if (decision === 'approve' && typeof cell === 'object' && 'by' in cell) {
    // As the hire route does: hire the Odd, then approve the ask with it.
    const bo = await hire({
      name: 'Bo',
      role: 'Baker',
      variant: 'a',
      portrait: 'a',
      room: 'workspace',
      permission: 'draft',
      remit: 'Bakes.',
      desk: 'You are Bo.'
    });
    await approveHire(id, bo.id);
  } else if (decision === 'approve' && kind === 'goal') await approveGoal(id, reason);
  else if (decision === 'approve' && kind === 'plan') await approvePlan(id, [0], reason);
  else await decideAsk(id, decision, reason);
}

test("every ask kind's yes, no and send-back has the row pinned here, and reaches the Odd as pinned, on a thread and on none", async () => {
  for (const kind of ASK_KINDS)
    for (const decision of DECISIONS) {
      const pin = PINNED[kind][decision];
      assert.deepEqual(cellOf(kind, decision), pin.cell, `${kind} ${decision}`);
      const places = pin.onNone ? [true, false] : [true];
      for (const onThread of places) {
        const where = `${kind} ${decision} ${onThread ? 'on a thread' : 'on none'}`;
        const want = onThread ? pin.onThread : pin.onNone;
        const { id } = await raise[kind](onThread);
        const mark = await markNow();
        if (pin.cell === 'refused')
          await assert.rejects(answer(kind, decision, id, 'Because.'), /Say yes or no/, where);
        else await answer(kind, decision, id, 'Because.');
        assert.deepEqual(await reached(mark), want, where);
      }
    }
});

/** Each answer that tells the Odd nothing when its ask was raised on no thread. */
const SILENT_OFF_A_THREAD: readonly (readonly [AskKind, Decision])[] = [
  ['hire', 'approve'],
  ['goal', 'approve'],
  ['approval', 'deny'],
  ['access', 'deny'],
  ['hire', 'deny'],
  ['goal', 'deny']
];
const namesNew1715 = (kind: AskKind, decision: Decision) =>
  effectsOf(cellOf(kind, decision)).some((e) => typeof e === 'object' && e.none === 'NEW-1715');

test('a yes to a hire or a goal, or a no with no reason, to an ask raised on no thread tells the Odd nothing, and only those rows name NEW-1715', async () => {
  for (const [kind, decision] of SILENT_OFF_A_THREAD) {
    const where = `${kind} ${decision}`;
    const { id } = await raise[kind](false);
    const mark = await markNow();
    await answer(kind, decision, id, null);
    const toAda = (await reached(mark)).filter((r) => r.endsWith(':ada'));
    assert.deepEqual(toAda, [], where);
  }
  const naming = ASK_KINDS.flatMap((kind) =>
    DECISIONS.filter((d) => namesNew1715(kind, d)).map((d) => `${kind} ${d}`)
  );
  assert.deepEqual(naming.sort(), SILENT_OFF_A_THREAD.map(([k, d]) => `${k} ${d}`).sort());
});

test("a done or dropped task, a done task with no Odd, and a goal's pause, met or drop have the rows pinned here and reach the Odd as pinned, and a none names its Linear row", async () => {
  assert.deepEqual(OWNER_ANSWERS.task, {
    done: { fromAccess: ['carry_out'], other: ['task_done'], noOdd: [] },
    dropped: ['answer_back', { none: 'NEW-1703' }]
  });
  const steps: Step[] = [{ text: 'Do it', done: false }];
  // A connect task from Ada's access ask.
  const { ask: access } = await raiseAsk('ada', {
    title: 'Read Gmail',
    why: 'w',
    ifApproved: 'i',
    access: { connector: 'gmail', level: 'read' }
  });
  const [connect] = await db
    .insert(tasks)
    .values({ staffId: 'ada', askId: access.id, title: 'Connect Gmail', why: 'w', steps })
    .returning();
  let mark = await markNow();
  await finishTask(connect.id, true, null);
  assert.deepEqual(await reached(mark), ['carry_out:ada']);

  const other = await giveTask('ada', { title: 'Pick a blue', why: 'w', steps: ['Pick one'] });
  mark = await markNow();
  await finishTask(other.id, true, 'Navy.');
  assert.deepEqual(await reached(mark), ['task_done:ada']);

  const [nobodys] = await db
    .insert(tasks)
    .values({ title: 'Water the plants', why: 'w', steps })
    .returning();
  mark = await markNow();
  await finishTask(nobodys.id, true, null);
  assert.deepEqual(await reached(mark), []);

  // A dropped task goes back to the thread it was given on, and on none reaches nobody.
  for (const onThread of [true, false]) {
    const threadId = onThread ? await thread() : undefined;
    const t = await giveTask('ada', {
      title: 'Call the baker',
      why: 'w',
      steps: ['Call'],
      threadId
    });
    mark = await markNow();
    await finishTask(t.id, false, 'Not needed.');
    const want = onThread ? ['resume:ada'] : [];
    assert.deepEqual(await reached(mark), want, onThread ? 'on a thread' : 'on none');
  }

  // Ada serves a goal the owner pauses, meets or drops: nothing reaches her.
  for (const status of ['paused', 'met', 'dropped'] as const) {
    const goalId = await aGoal(`Fair ${status}`);
    await db.insert(staffGoals).values({ staffId: 'ada', goalId, part: 'All of it' });
    mark = await markNow();
    await updateGoal(goalId, { status }, { owner: true });
    assert.deepEqual(await reached(mark), [], status);
    assert.ok(
      GOAL_ANSWERS[status].every((e) => /^NEW-\d+$/.test(e.none)),
      status
    );
  }
});

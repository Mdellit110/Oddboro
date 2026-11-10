// Work a lead parked until a task on the owner's desk ends. The task's end is
// the only wake: nothing looks at the clock or goes round a loop for it.
import { and, eq, isNull, or } from 'drizzle-orm';
import { db } from './db.ts';
import { flat, SAID_AS } from './desk-answers.ts';
import { asks, tasks, threads } from './schema.ts';
import { answerThread, taskThread, worksOn } from './threads.ts';

/** Parks work on a task, or says why it cannot. */
export async function parkOnTask(
  hubId: string,
  id: number,
  taskId: number
): Promise<{ title: string } | { problem: string }> {
  return db.transaction(async (tx) => {
    // Locked, so the task cannot end between this look and the park: it would
    // wake nothing, and the work would wait on a task already over.
    const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).for('update');
    const fromAsk = task?.askId
      ? await tx
          .select({ id: asks.id, threadId: asks.threadId })
          .from(asks)
          .where(eq(asks.id, task.askId))
      : [];
    const on = task && taskThread(task, fromAsk);
    // Another Odd's task on work this Odd is not on reads as no task at all, so
    // a park gives away neither its title, its status nor the owner's note on it.
    // Asked inside the transaction: under PGlite a query outside it would wait on it.
    const onItsWork = async (thread: number) =>
      (
        await tx
          .select({ id: threads.id })
          .from(threads)
          .where(and(eq(threads.id, thread), or(eq(threads.hubId, hubId), worksOn(hubId))))
      ).length > 0;
    const seen = !!task && (task.staffId === hubId || (on !== undefined && (await onItsWork(on))));
    if (!task || !seen) return { problem: `There is no task ${taskId}.` };
    if (task.status !== 'open')
      return { problem: `Already ${SAID_AS[task.status]}: do it now, in this run.` };
    if (on === id)
      return {
        problem:
          'That task is on this work, so the answer to it already brings you back. Finish this run with "Outcome: waiting".'
      };
    const [parked] = await tx
      .update(threads)
      .set({ resumeOnTask: taskId, resumeAt: null, heldBy: null })
      .where(and(eq(threads.id, id), eq(threads.hubId, hubId), isNull(threads.endedAt)))
      .returning({ id: threads.id });
    return parked
      ? { title: flat(task.title) }
      : { problem: `Work ${id} has ended, or is not work you lead.` };
  });
}

/** The live threads parked on a task: what its end picks up. */
const parkedOn = (taskId: number) => and(eq(threads.resumeOnTask, taskId), isNull(threads.endedAt));

/**
 * The work parked on a task, read before the task's end wakes it, so the run
 * that hears the task ended can be told that work picks up on its own.
 */
export async function parkedWork(taskId: number): Promise<{ id: number; title: string }[]> {
  return db.select({ id: threads.id, title: threads.title }).from(threads).where(parkedOn(taskId));
}

/**
 * The task ended: every thread parked on it picks up, with what happened.
 * `ownRun` is there when a run on the task's own work picks up too, with the
 * title of the work it is on, or null for a task on no work: each parked
 * thread is told that run carries its own part. `earlier` when that run
 * started before this wake, as the task ended, and was not told of this work:
 * a failed run gave the park back after the task ended (`finishFollowUp`).
 */
export async function wakeOnTask(
  t: { id: number; title: string; note: string | null },
  how: { done: boolean; owner: string; ownRun?: { work: string | null; earlier?: true } }
): Promise<void> {
  const parked = await db
    .update(threads)
    .set({ resumeOnTask: null })
    .where(parkedOn(t.id))
    .returning({ id: threads.id });
  const title = flat(t.title);
  const note = flat(t.note ?? '');
  const ended = how.done
    ? `${how.owner} finished "${title}", the task you parked this work on.`
    : `${how.owner} dropped "${title}", the task you parked this work on, so it will not be finished.`;
  // A task on no work can be parked on only by the Odd that gave it
  // (`parkOnTask`), so its own run is this Odd's.
  const run = how.ownRun;
  const own = !run
    ? ''
    : run.work === null
      ? run.earlier
        ? " Another run of yours started from that task when it ended and carries its own part: do only this work's part here."
        : " Another run of yours picks up from that task too and carries its own part: do only this work's here."
      : run.earlier
        ? ` A run on "${flat(run.work)}", the work that task was given on, started when the task ended, and its lead carries that work's own part: do only this work's part here.`
        : ` "${flat(run.work)}", the work that task was given on, picks up too, and its lead carries that work's own part: do only this work's here.`;
  const next = how.done ? 'Pick it up now' : 'Decide what comes of the work now';
  const said = `${ended}${own} ${next}`;
  for (const { id } of parked) await answerThread(id, note ? `${said}: ${note}` : `${said}.`);
}

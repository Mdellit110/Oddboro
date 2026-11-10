// Work a lead parked until a task on the owner's desk ends. The task's end is
// the only wake: nothing looks at the clock or goes round a loop for it.
import { and, eq, isNull } from 'drizzle-orm';
import { db } from './db.ts';
import { flat, SAID_AS } from './desk-answers.ts';
import { asks, tasks, threads } from './schema.ts';
import { answerThread, taskThread } from './threads.ts';

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
    if (!task) return { problem: `There is no task ${taskId}.` };
    if (task.status !== 'open')
      return { problem: `Already ${SAID_AS[task.status]}: do it now, in this run.` };
    const threadAsks = await tx
      .select({ id: asks.id, threadId: asks.threadId })
      .from(asks)
      .where(eq(asks.threadId, id));
    if (taskThread(task, threadAsks) === id)
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
 * `ownWork` is the work the task was given on, when its own run picks up too:
 * each parked thread is told that work carries its own part.
 */
export async function wakeOnTask(
  t: { id: number; title: string; note: string | null },
  how: { done: boolean; owner: string; ownWork?: string }
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
  const own = how.ownWork
    ? ` "${flat(how.ownWork)}", the work that task was given on, picks up too, and its lead carries that work's own part: do only this work's here.`
    : '';
  const next = how.done ? 'Pick it up now' : 'Decide what comes of the work now';
  const said = `${ended}${own} ${next}`;
  for (const { id } of parked) await answerThread(id, note ? `${said}: ${note}` : `${said}.`);
}

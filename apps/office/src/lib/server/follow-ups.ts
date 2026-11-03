// Work a staffer owes once the owner answers it: carry out an approved ask, rework
// one the owner sent back, act on their feedback on a report, pick up the work
// that waited on a task the owner just finished, plan a goal they set, or get a
// new hire started on its first day. This listens for changes to follow-ups and starts any nobody has started yet. Nothing polls:
// a change to the table is the only thing that looks.
import { closeStaleFollowUps, finishFollowUp, followUpsToDo, startFollowUp } from '@oddboro/ledger';
import { bus, listen, type OfficeEvent } from './events.ts';
import { followThrough } from './staff.ts';
import { held } from './update.ts';

const g = globalThis as unknown as { followUps?: boolean };

async function look(): Promise<void> {
  // An update is about to install. Nothing new starts; the next start looks again.
  if (held()) return;
  for (const { f, ask, report, task, goal } of await followUpsToDo()) {
    // The claim is in the database, so two looks never start the same one.
    if (!(await startFollowUp(f.id))) continue;
    const about =
      ask?.title ??
      report?.title ??
      task?.title ??
      goal?.title ??
      (f.kind === 'first_day' ? 'getting started' : 'a follow-up');
    void followThrough(f, ask, report, task, goal)
      .then((r) => finishFollowUp(f, about, r.outcome, r.text))
      .catch((e: unknown) =>
        finishFollowUp(f, about, 'failed', e instanceof Error ? e.message : String(e))
      );
  }
}

/** Start once per process. */
export function startFollowUps(): void {
  if (g.followUps) return;
  g.followUps = true;
  listen();
  bus.on('event', (e: OfficeEvent) => {
    if (e.type === 'change' && e.table === 'follow_ups') void look();
  });
  void closeStaleFollowUps().then(look);
}

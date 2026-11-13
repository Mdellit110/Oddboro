// What the page and the server share about the owner's desk.
import type { Desk } from '@oddboro/ledger';

/**
 * Each item on the desk by kind and id, such as `ask-12`. The page tells the
 * owner about a key it has not seen, and so does the phone buzz (`push.ts`).
 */
export const deskKeys = (d: Desk): Set<string> =>
  new Set([
    ...d.asks.map((a) => `ask-${a.id}`),
    ...d.tasks.map((t) => `task-${t.id}`),
    ...d.reports.map((r) => `report-${r.id}`)
  ]);

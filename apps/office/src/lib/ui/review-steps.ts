// Where one ask stands among the open asks of its kind on the Desk, oldest
// first, for the reviews that step through them (ReviewNav.svelte).
import type { AskRow } from '@oddboro/ledger';

export type Around = { at: number; prev?: AskRow; next?: AskRow };

export function around(list: AskRow[], id: number): Around {
  const at = list.findIndex((r) => r.id === id);
  return {
    at,
    prev: at > 0 ? list[at - 1] : undefined,
    next: at >= 0 && at < list.length - 1 ? list[at + 1] : undefined
  };
}

/** The ask to open once this one is done: the next, else the one before, else the desk. */
export const after = (list: AskRow[], id: number): number | undefined => {
  const { prev, next } = around(list, id);
  return (next ?? prev)?.id;
};

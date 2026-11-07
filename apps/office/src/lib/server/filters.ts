// Gmail filters an Odd proposed (`propose_filter` in the ledger), as the owner
// creates them from the Desk. The office calls Gmail itself, with its own
// token, and only on the owner's click: no Odd ever makes a filter. The ask
// closes only once Gmail made it, with the owner's final version. Signing in
// and Gmail's refusals are the same as for replies (replies.ts).
import {
  approveFilter,
  ask,
  doesSomething,
  matchesSomething,
  type AskRow,
  type FilterAction,
  type FilterCriteria,
  type GmailFilter
} from '@oddboro/ledger';
import {
  countMatching,
  filterQuery,
  GmailOwnLabel,
  labelChanges,
  labelFor,
  makeFilter,
  tidyMatching
} from './google/gmail.ts';
import { GmailRefusal, gmailFailed, gmailToken } from './replies.ts';

/** What the owner may change before the office creates it. */
export type FilterFields = { criteria: FilterCriteria; action: FilterAction };

/** Filters on their way to Gmail, so a second click cannot make one twice. */
const making = new Set<number>();

/** A filter ask, or a 404. */
async function filterAsk(id: number): Promise<AskRow & { filter: GmailFilter }> {
  const a = await ask(id);
  if (!a || a.kind !== 'filter' || !a.filter) throw new GmailRefusal(404, 'No such filter');
  return { ...a, filter: a.filter };
}

/**
 * About how many emails the filter matches today, by the Gmail search its
 * criteria make: the ask's own, or the owner's changes to them.
 */
export async function previewFilter(
  id: number,
  criteria?: FilterCriteria
): Promise<{ query: string; about: number }> {
  const a = await filterAsk(id);
  const query = filterQuery(criteria ?? a.filter.criteria);
  if (!query) throw new GmailRefusal(400, 'Say which mail it matches first.');
  const nothing = 'The matching mail could not be counted';
  const token = await gmailToken(a.staffId, nothing, 'filter');
  try {
    return { query, about: await countMatching(token, query) };
  } catch (e) {
    throw await gmailFailed(e, a.staffId, nothing, 'filter');
  }
}

/**
 * Create the filter as the owner left it. With `tidy`, the mail it already
 * matches gets the same label and inbox changes first: doing that again is
 * harmless, so a failure after it leaves nothing that a second click would
 * make twice. Only once Gmail made the filter is the ask approved with the
 * owner's version (`approveFilter`, which writes the one ledger line and
 * sends the answer back where the ask came from). If Gmail fails, the ask
 * stays open.
 */
export async function createFilter(
  id: number,
  fields: FilterFields,
  tidy: boolean
): Promise<GmailFilter> {
  const a = await filterAsk(id);
  if (a.status !== 'open') throw new GmailRefusal(409, 'You already answered this filter.');
  if (!matchesSomething(fields.criteria))
    throw new GmailRefusal(400, 'Say which mail it matches: from, to, subject or words.');
  if (!doesSomething(fields.action))
    throw new GmailRefusal(400, 'Say what it does: skip the inbox, mark read, label or star.');
  if (making.has(id)) throw new GmailRefusal(409, 'This filter is already being made.');
  making.add(id);
  try {
    const nothing = 'Nothing was created';
    const token = await gmailToken(a.staffId, nothing, 'filter');
    const query = filterQuery(fields.criteria);
    let created: NonNullable<GmailFilter['created']>;
    let matching: number;
    try {
      const label = fields.action.addLabel
        ? await labelFor(token, fields.action.addLabel)
        : undefined;
      const changes = labelChanges(fields.action, label);
      const tidied = tidy ? await tidyMatching(token, query, changes) : 0;
      matching = tidy ? tidied : await countMatching(token, query);
      const gmailId = await makeFilter(token, fields.criteria, changes);
      created = { at: new Date().toISOString(), gmailId, tidied };
    } catch (e) {
      if (e instanceof GmailOwnLabel) throw new GmailRefusal(400, `${nothing}. ${e.message}`);
      throw await gmailFailed(e, a.staffId, nothing, 'filter');
    }
    const final: GmailFilter = { ...a.filter, ...fields, matching, created };
    if (!(await approveFilter(id, final)))
      console.error(`Filter ${id} was made in Gmail, but the ask was no longer open.`);
    return final;
  } finally {
    making.delete(id);
  }
}

const TEXT = ['from', 'to', 'subject', 'query', 'negatedQuery'] as const;

/**
 * Criteria from what the page sent: each text field trimmed, blanks left
 * out. Undefined when a field is not what it should be.
 */
export function readCriteria(v: unknown): FilterCriteria | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const c: FilterCriteria = {};
  for (const k of TEXT) {
    const x = o[k];
    if (x === undefined || x === null) continue;
    if (typeof x !== 'string' || x.length > 500) return undefined;
    if (x.trim()) c[k] = x.trim();
  }
  if (o.hasAttachment !== undefined && typeof o.hasAttachment !== 'boolean') return undefined;
  if (o.hasAttachment) c.hasAttachment = true;
  return c;
}

/** An action from what the page sent, or undefined when a field is not what it should be. */
export function readAction(v: unknown): FilterAction | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const a: FilterAction = {};
  for (const k of ['skipInbox', 'markRead', 'star'] as const) {
    if (o[k] !== undefined && typeof o[k] !== 'boolean') return undefined;
    if (o[k]) a[k] = true;
  }
  if (o.addLabel !== undefined && o.addLabel !== null) {
    if (typeof o.addLabel !== 'string' || o.addLabel.length > 200) return undefined;
    if (o.addLabel.trim()) a.addLabel = o.addLabel.trim();
  }
  return a;
}

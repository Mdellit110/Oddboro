// Gmail filters an Odd proposes (`propose_filter`), in plain words: what one
// matches and what it does, and when two match the same mail. No imports, so
// the page reads it too (`@oddboro/ledger/filters`).

/** Which mail a filter matches. Every field given must match. */
export type FilterCriteria = {
  from?: string;
  to?: string;
  subject?: string;
  /** Gmail search words the mail has, as typed in Gmail. */
  query?: string;
  /** Gmail search words the mail does not have. */
  negatedQuery?: string;
  hasAttachment?: boolean;
};

/**
 * What a filter does to the mail it matches. Never trash, delete or forward:
 * a proposed filter only files mail.
 */
export type FilterAction = {
  skipInbox?: boolean;
  markRead?: boolean;
  /** A label's name. The office makes it when the owner creates the filter, if it is missing. */
  addLabel?: string;
  star?: boolean;
};

/** One Gmail filter an Odd proposes. The owner may change it before the office creates it. */
export type GmailFilter = {
  criteria: FilterCriteria;
  action: FilterAction;
  /** The Odd's one or two lines on why this mail should be filed this way. */
  summary: string;
  /** The Gmail connector it is made in. */
  connector?: string;
  /** That account's address, as the desk shows it. */
  account?: string;
  /** About how many emails matched when the owner created it. */
  matching?: number;
  /** Set once Gmail made it: when, its Gmail id, and how many emails were tidied with it. */
  created?: { at: string; gmailId: string; tidied: number };
};

const CRITERIA_TEXT = ['from', 'to', 'subject', 'query', 'negatedQuery'] as const;

/** A field as two filters compare it: case and spacing ignored, blank as none. */
const plain = (v: string | undefined) => (v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Whether two filters match the same mail. */
export function sameCriteria(a: FilterCriteria, b: FilterCriteria): boolean {
  return (
    CRITERIA_TEXT.every((k) => plain(a[k]) === plain(b[k])) &&
    !!a.hasAttachment === !!b.hasAttachment
  );
}

/** Whether the criteria match anything narrower than all mail. */
export const matchesSomething = (c: FilterCriteria): boolean =>
  CRITERIA_TEXT.some((k) => plain(c[k])) || !!c.hasAttachment;

/** Whether the action does anything at all. */
export const doesSomething = (a: FilterAction): boolean =>
  !!(a.skipInbox || a.markRead || a.star || a.addLabel?.trim());

/** "and" before the last of a list: "a, b and c". */
export function listed(parts: string[]): string {
  return parts.length < 2
    ? (parts[0] ?? '')
    : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

/** The mail a filter matches, as "mail from ada@example.com with "Weekly" in the subject". */
export function matchWords(c: FilterCriteria): string {
  const t = (v: string | undefined) => v?.trim();
  const parts = [
    t(c.from) && `from ${t(c.from)}`,
    t(c.to) && `to ${t(c.to)}`,
    t(c.subject) && `with "${t(c.subject)}" in the subject`,
    t(c.query) && `matching "${t(c.query)}"`,
    t(c.negatedQuery) && `not matching "${t(c.negatedQuery)}"`,
    c.hasAttachment && 'with an attachment'
  ].filter((p): p is string => !!p);
  return parts.length ? `mail ${parts.join(', ')}` : 'all mail';
}

/** What a filter does, as "skip the inbox and get the label "News"", after "will". */
export function doesWords(a: FilterAction): string {
  const label = a.addLabel?.trim();
  const parts = [
    a.skipInbox && 'skip the inbox',
    a.markRead && 'be marked read',
    label && `get the label "${label}"`,
    a.star && 'be starred'
  ].filter((p): p is string => !!p);
  return parts.length ? listed(parts) : 'stay as it is';
}

/** One filter in a sentence: "mail from ada@example.com will skip the inbox". */
export const filterWords = (f: Pick<GmailFilter, 'criteria' | 'action'>): string =>
  `${matchWords(f.criteria)} will ${doesWords(f.action)}`;

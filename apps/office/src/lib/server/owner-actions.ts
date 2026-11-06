// What each of the owner's routes that changes something leaves in the
// ledger. Every POST, PUT, PATCH and DELETE handler under src/routes has one
// row, keyed `<METHOD> <route id>`; the staff PATCH takes several actions, one
// per body key, so it has a row per key `PATCH_KEY` does not class as a
// qualifier. owner-actions.test.ts fails on a handler with no row, and drives
// each `records` row to check it writes exactly one ledger row of that kind.
import type { LedgerKind } from '@oddboro/ledger';

/** The Linear row that owes a ledger line for each action that writes none today. */
const NO_ROW = 'NEW-1693';
const SETUP = 'Setting up the office, before or beside its records, not an action on them.';

export type OwnerAction =
  /** It writes one ledger row of this kind. */
  | { records: LedgerKind }
  /** It changes the office's records and writes no ledger row: the Linear row that owes one. */
  | { none: string }
  /** It changes none of the office's records, and why. */
  | { notAnAction: string };

export const OWNER_ACTIONS = {
  'POST /api/accounts': { records: 'access' },
  'PATCH /api/accounts': { records: 'access' },
  'DELETE /api/accounts': { records: 'access' },
  'PUT /api/agents': { notAnAction: SETUP },
  'POST /api/agents/[tool]': { notAnAction: SETUP },
  'PUT /api/agents/[tool]': { notAnAction: SETUP },
  'DELETE /api/agents/[tool]': { notAnAction: SETUP },
  'POST /api/asks/[id]': { records: 'decision' },
  'PUT /api/files': { records: 'work' },
  'POST /api/files/open': {
    notAnAction: 'Opens a page the Odd built in the browser; it changes nothing.'
  },
  'POST /api/files/resolve': { notAnAction: 'A read through POST: which names the viewer opens.' },
  'POST /api/folders/pick': {
    notAnAction:
      "Opens the system's folder picker; a picked folder is given through the staff PATCH."
  },
  'POST /api/goals': { records: 'decision' },
  'PUT /api/goals/[id]': { records: 'decision' },
  'POST /api/goals/[id]/staff': { records: 'decision' },
  'DELETE /api/goals/[id]/staff': { records: 'decision' },
  'POST /api/jobs/[id]': { none: NO_ROW },
  'PATCH /api/lessons/[id]': { records: 'decision' },
  'POST /api/looks': {
    notAnAction: 'Draws a look for the hire window; nothing is kept until a hire.'
  },
  'POST /api/looks/parts': {
    notAnAction: 'Builds a look from parts for the hire window; nothing is kept until a hire.'
  },
  'POST /api/office/design': {
    notAnAction: 'Starts drawing an office; nothing changes until Move in, which records.'
  },
  'PUT /api/office/design': { records: 'work' },
  'POST /api/office/layouts/[id]': { records: 'work' },
  'POST /api/office/move-in': { records: 'work' },
  'POST /api/onboarding': { records: 'hire' },
  'POST /api/pokes/[id]': { none: NO_ROW },
  'DELETE /api/pokes/[id]': { none: NO_ROW },
  'POST /api/reports/[id]': { none: NO_ROW },
  'PUT /api/rooms': { records: 'work' },
  'POST /api/setup': { notAnAction: SETUP },
  'POST /api/setup/address': { notAnAction: SETUP },
  'PUT /api/setup/claude': { notAnAction: SETUP },
  'POST /api/setup/claude': { notAnAction: SETUP },
  'DELETE /api/setup/claude': { notAnAction: SETUP },
  'POST /api/setup/notify': { notAnAction: SETUP },
  'POST /api/staff': { records: 'hire' },
  'PATCH /api/staff/[id]#permission': { records: 'access' },
  'PATCH /api/staff/[id]#agent': { records: 'access' },
  'PATCH /api/staff/[id]#tool': { records: 'access' },
  'PATCH /api/staff/[id]#commands': { records: 'access' },
  'PATCH /api/staff/[id]#web': { records: 'access' },
  'PATCH /api/staff/[id]#folder': { records: 'access' },
  'PATCH /api/staff/[id]#effort': { records: 'access' },
  'PATCH /api/staff/[id]#model': { records: 'access' },
  'PATCH /api/staff/[id]#account': { records: 'access' },
  'POST /api/staff/[id]/access': { records: 'access' },
  'DELETE /api/staff/[id]/access': { records: 'access' },
  'POST /api/staff/[id]/chat': {
    notAnAction:
      "The chat's own log keeps it; a decision in it is recorded by the tool the Odd calls."
  },
  'PUT /api/staff/[id]/description': { records: 'work' },
  'POST /api/staff/[id]/jobs': { none: NO_ROW },
  'PUT /api/staff/[id]/look': { records: 'work' },
  'POST /api/staff/[id]/pokes': {
    notAnAction: "Marks the Odd's delivered pokes seen as its chat shows them."
  },
  'POST /api/staff/draft': {
    notAnAction: 'Drafts a job description for the hire window; nothing is kept until a hire.'
  },
  'PUT /api/switches': { none: NO_ROW },
  'POST /api/tasks/[id]': { records: 'work' },
  'POST /api/update': {
    notAnAction: "The app's shell reporting an update, and the owner picking when it installs."
  },
  'PUT /api/update': { notAnAction: "The owner's update window, a setting of the app." }
} as const satisfies Record<string, OwnerAction>;

/** Each action that writes a ledger row. */
export type Recording = {
  [K in keyof typeof OWNER_ACTIONS]: (typeof OWNER_ACTIONS)[K] extends { records: LedgerKind }
    ? K
    : never;
}[keyof typeof OWNER_ACTIONS];

// Every table the office keeps. Staff, what they ask the owner, what the owner has to do,
// the access the owner grants, the jobs they run, and the ledger: one row for every
// thing that was decided or done, searchable by meaning.
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  vector
} from 'drizzle-orm/pg-core';
import type { ArtKind, Place } from '@oddboro/sprites/art';
import type { LookSpec, PartKind } from '@oddboro/sprites/look';
import type { FloorPlan, OfficeSpec, RoomKind, RoomTemplate } from '@oddboro/world';
import { STARTER_TOOLS } from './tools.ts';

const at = (name: string) => timestamp(name, { withTimezone: true });
const created = (name = 'created_at') => at(name).notNull().defaultNow();
const id = () => integer().primaryKey().generatedAlwaysAsIdentity();

export type Level = 'read' | 'draft' | 'act';

export const staff = pgTable('staff', {
  id: text().primaryKey(),
  name: text().notNull(),
  role: text().notNull(),
  office: text().notNull().default('Main Street'),
  sprite: text().notNull().default('staff'),
  variant: text().notNull(),
  portrait: text().notNull(),
  /** The room template it works in. */
  room: text().notNull().default('workspace'),
  permission: text().$type<Level>().notNull().default('read'),
  /** The office tools the owner granted, beyond the ones every staffer has. See tools.ts. */
  tools: text().array().notNull().default(STARTER_TOOLS),
  /** One sentence on what it is for, shown on the card. */
  remit: text().notNull(),
  /** The job description its Claude session runs with. */
  desk: text().notNull(),
  /** A generated look. Null keeps the hand-drawn art named by sprite and variant. */
  look: jsonb().$type<LookSpec>(),
  /** The drawn portrait for a generated look, as .px text. */
  portraitPx: text(),
  hiredAt: created('hired_at'),
  /** Set when the owner lets a staffer go. Its history stays. */
  leftAt: at('left_at')
});

/**
 * `goal` proposes a goal the manager heard in chat; approving sets it. `plan`
 * is how the office meets one goal: hires and work for staff already here.
 */
export type AskKind = 'approval' | 'access' | 'hire' | 'goal' | 'plan';
/** `revise` means the owner sent it back to be reworked. */
export type AskStatus = 'open' | 'approved' | 'denied' | 'revise';
/** What an access ask wants: a connector and a level. */
export type AccessRequest = { connector: string; level: Level };
/** A proposed hire. Approving it opens the hire window filled in with this. */
export type HireProposal = {
  name: string;
  role: string;
  /** A room template id, like `mail-room`. */
  room?: string;
  permission: Level;
  remit: string;
  /** The job description, a file in the proposer's folder, read when the owner opens the hire window. */
  jobDescriptionFile: string;
  /** Office tools beyond the ones every staffer has. */
  tools?: string[];
  job?: { name: string; instructions: string; schedule: Schedule; report?: boolean };
  /** What the person looks like, in words, for drawing their look. */
  appearance?: string;
  /** The owner's intake answers, a file in the proposer's folder. The hire gets a copy as `notes/intake.md`. */
  intakeFile?: string;
  /** The goal this hire serves, and its part in it. Hiring links them. */
  goal?: { id: number; part: string };
};

/** A new job for a staffer. */
export type NewJob = { name: string; instructions: string; schedule: Schedule; report?: boolean };

/** One piece of a goal plan. The owner ticks the ones to go ahead with. */
export type GoalPlanItem =
  | { kind: 'hire'; hire: HireProposal; part: string }
  | {
      kind: 'assign';
      /** A staffer already here. */
      staff: string;
      part: string;
      /** A new job for it. */
      job?: NewJob;
      /** A change to one of its jobs, by name. */
      editJob?: { name: string; instructions?: string; schedule?: Schedule };
    };

/** How the office meets one goal. */
export type GoalPlan = {
  goalId: number;
  items: GoalPlanItem[];
  /** What only the owner can do, as numbered steps. Approving puts them on the desk as a task. */
  ownerSteps?: string[];
};

/** When a goal is for. `date` reads `due`. */
export type GoalHorizon = 'week' | 'quarter' | 'year' | 'date' | 'ongoing';
export type GoalStatus = 'active' | 'paused' | 'met' | 'dropped';

/** A goal as written, before it is one: what the owner or the manager proposes. */
export type GoalDraft = {
  title: string;
  why?: string;
  doneWhen?: string;
  horizon: GoalHorizon;
  /** YYYY-MM-DD, for a `date` horizon. */
  due?: string;
  area: string;
};

/** What the owner wants more of. Staff serve goals; the manager plans them. */
export const goals = pgTable('goals', {
  id: id(),
  title: text().notNull(),
  why: text(),
  doneWhen: text(),
  horizon: text().$type<GoalHorizon>().notNull().default('ongoing'),
  due: text(),
  area: text().notNull().default('work'),
  status: text().$type<GoalStatus>().notNull().default('active'),
  createdAt: created(),
  updatedAt: at('updated_at').notNull().defaultNow()
});

/** Which staffer serves which goal, and its part in it. A staffer sees only these goals. */
export const staffGoals = pgTable(
  'staff_goals',
  {
    staffId: text()
      .notNull()
      .references(() => staff.id),
    goalId: integer()
      .notNull()
      .references(() => goals.id),
    part: text().notNull(),
    createdAt: created()
  },
  (t) => [primaryKey({ columns: [t.staffId, t.goalId] })]
);

export type GoalHealth = 'on_track' | 'slipping' | 'blocked';

/** A staffer's word on how a goal it serves is going, with one line of evidence. */
export const goalProgress = pgTable(
  'goal_progress',
  {
    id: id(),
    goalId: integer()
      .notNull()
      .references(() => goals.id),
    staffId: text()
      .notNull()
      .references(() => staff.id),
    health: text().$type<GoalHealth>().notNull(),
    note: text().notNull(),
    createdAt: created()
  },
  (t) => [index('goal_progress_goal_idx').on(t.goalId, t.createdAt)]
);

export const asks = pgTable('asks', {
  id: id(),
  staffId: text()
    .notNull()
    .references(() => staff.id),
  kind: text().$type<AskKind>().notNull().default('approval'),
  title: text().notNull(),
  why: text().notNull(),
  ifApproved: text().notNull(),
  access: jsonb().$type<AccessRequest>(),
  hire: jsonb().$type<HireProposal>(),
  /** A goal ask's goal, set when the owner approves it. */
  goal: jsonb().$type<GoalDraft>(),
  /** A plan ask's plan. */
  plan: jsonb().$type<GoalPlan>(),
  /** The ask this one reworks, after the owner sent that one back. */
  revises: integer(),
  status: text().$type<AskStatus>().notNull().default('open'),
  reason: text(),
  createdAt: created(),
  decidedAt: at('decided_at')
});

/**
 * One step of a task for the owner. `action` puts a control in the step:
 * a sign-in, a field whose value goes in the keychain, a tool list to
 * confirm, or a choice.
 */
export type StepAction =
  | { kind: 'secret'; connector: string; name: string }
  | { kind: 'oauth'; connector: string }
  | { kind: 'choice'; options: string[] }
  | { kind: 'tools'; connector: string };
/** Steps that share a `key` tick together, e.g. the two steps of one sign-in. */
export type Step = {
  text: string;
  done: boolean;
  action?: StepAction;
  answer?: string;
  key?: string;
};
export type TaskStatus = 'open' | 'done' | 'dropped';

export const tasks = pgTable('tasks', {
  id: id(),
  /** The staffer that gave the owner this task, if any. */
  staffId: text().references(() => staff.id),
  askId: integer().references(() => asks.id),
  title: text().notNull(),
  why: text().notNull(),
  steps: jsonb().$type<Step[]>().notNull(),
  status: text().$type<TaskStatus>().notNull().default('open'),
  note: text(),
  createdAt: created(),
  doneAt: at('done_at')
});

export const reports = pgTable('reports', {
  id: id(),
  staffId: text()
    .notNull()
    .references(() => staff.id),
  title: text().notNull(),
  body: text().notNull(),
  createdAt: created(),
  readAt: at('read_at')
});

/**
 * A file a staffer hands the owner with an ask or a task: a path inside the
 * staffer's own folder. The desk lists them, and a Markdown one opens in the
 * editor right there.
 */
export const attachments = pgTable(
  'attachments',
  {
    id: id(),
    staffId: text()
      .notNull()
      .references(() => staff.id),
    /** Relative to the staffer's folder, e.g. notes/intake.md. */
    path: text().notNull(),
    mediaType: text().notNull(),
    taskId: integer().references(() => tasks.id),
    askId: integer().references(() => asks.id),
    createdAt: created()
  },
  (t) => [
    index('attachments_by_task').on(t.taskId),
    index('attachments_by_ask').on(t.askId),
    // Each one belongs to exactly one ask or one task.
    check('attachments_one_owner', sql`num_nonnulls(${t.taskId}, ${t.askId}) = 1`)
  ]
);

/** `sent` until the owner opens that staffer's chat, then `read`. */
export type PokeStatus = 'waiting' | 'sent' | 'read' | 'missed' | 'cancelled';

/**
 * A message a staffer writes now for the office to deliver to the owner later, once:
 * a check-in, a nudge. It lands in their chat with a Mac notification. Never an
 * ask, never a job.
 */
export const pokes = pgTable('pokes', {
  id: id(),
  staffId: text()
    .notNull()
    .references(() => staff.id),
  at: at('at').notNull(),
  message: text().notNull(),
  status: text().$type<PokeStatus>().notNull().default('waiting'),
  createdAt: created(),
  sentAt: at('sent_at')
});

export type LedgerKind = 'decision' | 'work' | 'report' | 'hire' | 'access';

/** Append-only. Every decision and every piece of finished work, by a staffer or by the owner. */
export const ledger = pgTable(
  'ledger',
  {
    id: id(),
    kind: text().$type<LedgerKind>().notNull(),
    /** A staff id, or `owner`. */
    actor: text().notNull(),
    title: text().notNull(),
    body: text().notNull().default(''),
    reason: text(),
    askId: integer().references(() => asks.id),
    taskId: integer().references(() => tasks.id),
    runId: integer(),
    createdAt: created(),
    embedding: vector({ dimensions: 768 })
  },
  (t) => [
    index('ledger_embedding').using('hnsw', t.embedding.op('vector_cosine_ops')),
    index('ledger_words').using(
      'gin',
      sql`to_tsvector('english', ${t.title} || ' ' || ${t.body} || ' ' || coalesce(${t.reason}, ''))`
    )
  ]
);

/**
 * How a staffer reaches an outside tool: a server it starts (`stdio`) or a
 * hosted one (`http`), found in the MCP Registry or named by its address. A
 * secret named in `secrets` lives in the macOS keychain, never here.
 */
export type ConnectorKind = 'stdio' | 'http';
export type ConnectorConfig = {
  command?: string;
  args?: string[];
  url?: string;
  /** Environment variable names whose values the keychain holds. */
  secrets?: string[];
  /** HTTP header names whose whole values the keychain holds. */
  headers?: string[];
  /** A hosted server the owner signs in to with OAuth. The office keeps the tokens. */
  oauth?: boolean;
};

export const connectors = pgTable('connectors', {
  id: text().primaryKey(),
  name: text().notNull(),
  description: text().notNull(),
  kind: text().$type<ConnectorKind>().notNull(),
  config: jsonb().$type<ConnectorConfig>().notNull().default({}),
  /** The MCP Registry name it came from, if any. */
  registry: text(),
  /** Tools a Read grant may call. */
  readTools: text().array().notNull().default([]),
  /** Every tool, for a Draft or Act grant. Filled in when the owner connects it. */
  tools: text().array().notNull().default([]),
  /** Set once the owner has finished connecting it. */
  readyAt: at('ready_at'),
  createdAt: created()
});

export const grants = pgTable(
  'grants',
  {
    staffId: text()
      .notNull()
      .references(() => staff.id),
    connectorId: text()
      .notNull()
      .references(() => connectors.id),
    level: text().$type<Level>().notNull().default('read'),
    askId: integer().references(() => asks.id),
    grantedAt: created('granted_at')
  },
  (t) => [primaryKey({ columns: [t.staffId, t.connectorId] })]
);

/** How often a job runs, in the office's time zone. */
export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
export type Schedule =
  | { every: 'minutes'; n: number }
  | { every: 'day'; at: string }
  | { every: 'weekday'; at: string }
  | { every: 'week'; day: Weekday; at: string };

export const jobs = pgTable('jobs', {
  id: id(),
  staffId: text()
    .notNull()
    .references(() => staff.id),
  name: text().notNull(),
  instructions: text().notNull(),
  schedule: jsonb().$type<Schedule>().notNull(),
  /** The result goes on the owner's desk as a report. */
  report: boolean().notNull().default(false),
  enabled: boolean().notNull().default(true),
  nextRunAt: at('next_run_at'),
  createdAt: created()
});

/**
 * Work a staffer owes after the owner answers it: carry out an approved ask, rework
 * one the owner sent back, act on their feedback on a report, pick up the work
 * that waited on a task the staffer gave them, or plan a goal the owner set. A
 * new hire's `first_day` gets it started without being asked.
 */
export type FollowUpKind = 'carry_out' | 'rework' | 'feedback' | 'task_done' | 'goal' | 'first_day';
/** `waiting` means the staffer put what it needs on the owner's desk. */
export type Outcome = 'done' | 'failed' | 'waiting';

export const followUps = pgTable('follow_ups', {
  id: id(),
  staffId: text()
    .notNull()
    .references(() => staff.id),
  kind: text().$type<FollowUpKind>().notNull(),
  askId: integer().references(() => asks.id),
  reportId: integer().references(() => reports.id),
  taskId: integer().references(() => tasks.id),
  /** A new goal for the Office Manager to plan. */
  goalId: integer().references(() => goals.id),
  /** The owner's words: their reason, what to change, their feedback, or their note on a task. */
  note: text(),
  /** The owner ticked "Report when done": success goes on their desk too. A failure always does. */
  reportWhenDone: boolean().notNull().default(false),
  createdAt: created(),
  startedAt: at('started_at'),
  outcome: text().$type<Outcome>(),
  /** What the staffer said it did. */
  result: text(),
  doneAt: at('done_at')
});

export type RunStatus = 'running' | 'done' | 'failed';
/** Why a run started: its schedule came due, or the owner pressed Run now. */
export type RunTrigger = 'schedule' | 'manual';

export const runs = pgTable('runs', {
  id: id(),
  jobId: integer()
    .notNull()
    .references(() => jobs.id),
  staffId: text()
    .notNull()
    .references(() => staff.id),
  status: text().$type<RunStatus>().notNull().default('running'),
  trigger: text().$type<RunTrigger>().notNull().default('schedule'),
  summary: text(),
  startedAt: created('started_at'),
  finishedAt: at('finished_at')
});

export type UsageKind = 'chat' | 'job' | 'draft' | 'follow-up' | 'look' | 'office';

/** Hairstyles and clothing Claude drew when the library had nothing that fit. */
export const parts = pgTable(
  'parts',
  {
    kind: text().$type<PartKind>().notNull(),
    name: text().notNull(),
    /** The part as .px text, in the looks palette. */
    px: text().notNull(),
    /** Who it was first drawn for. */
    drawnFor: text().references(() => staff.id),
    createdAt: created()
  },
  (t) => [primaryKey({ columns: [t.kind, t.name] })]
);

/** Tokens one run used, per model. Read from the run's own result. */
export const usage = pgTable(
  'usage',
  {
    id: id(),
    /** Null for a run as the office, like drawing a look before anyone is hired. */
    staffId: text().references(() => staff.id),
    kind: text().$type<UsageKind>().notNull(),
    model: text().notNull(),
    inputTokens: integer().notNull().default(0),
    outputTokens: integer().notNull().default(0),
    cacheReadTokens: integer().notNull().default(0),
    cacheWriteTokens: integer().notNull().default(0),
    /** What the run would cost at API list prices. The owner's plan does not bill it. */
    costUsd: doublePrecision().notNull().default(0),
    createdAt: created()
  },
  (t) => [index('usage_by_staff').on(t.staffId, t.createdAt)]
);

/**
 * The person the office works for, as the staff address them. One row. Each
 * install sets its own, so no name is written into the code.
 */
export const owner = pgTable('owner', {
  id: text().primaryKey().default('owner'),
  name: text().notNull(),
  /** When the owner finished the welcome. Until then the office opens on it. */
  welcomedAt: at('welcomed_at'),
  updatedAt: at('updated_at').notNull().defaultNow()
});

/**
 * The owner's Claude plan windows, as the last run reported them. One row. The
 * windows are the account's, so every staffer shares them.
 */
export const planLimits = pgTable('plan_limits', {
  id: text().primaryKey().default('claude'),
  /** Share of the 5-hour window used, 0 to 1. */
  fiveHour: doublePrecision().notNull(),
  fiveHourResetsAt: at('five_hour_resets_at'),
  /** Share of the weekly window used, 0 to 1. */
  sevenDay: doublePrecision().notNull(),
  sevenDayResetsAt: at('seven_day_resets_at'),
  updatedAt: at('updated_at').notNull().defaultNow()
});

/**
 * Office layouts drawn from the owner's words. The one marked `active` is the
 * office; the rest are earlier layouts the owner can move back to. The plan
 * and its rooms are kept as built, so a change to the generator never moves
 * furniture in an office already lived in. `spec` is what Claude wrote, for
 * redrawing.
 */
export const offices = pgTable('offices', {
  id: id(),
  name: text().notNull(),
  description: text().notNull(),
  spec: jsonb().$type<OfficeSpec>().notNull(),
  plan: jsonb().$type<FloorPlan>().notNull(),
  templates: jsonb().$type<Record<string, RoomTemplate>>().notNull(),
  /** Room template id to the kind of room it is. */
  kinds: jsonb().$type<Record<string, RoomKind>>().notNull(),
  active: boolean().notNull().default(false),
  createdAt: at('created_at').notNull().defaultNow(),
  movedInAt: at('moved_in_at')
});

/**
 * Art the office drew for a layout: props, wall hangings, things for desks,
 * floors and wall styles the library had no sprite for. Kept once the owner
 * moves into the layout that asked for it; every later drawing can use it.
 */
export const art = pgTable('art', {
  /** The name the spec uses: unique across the library and everything drawn. */
  name: text().primaryKey(),
  kind: text().$type<ArtKind>().notNull(),
  /** What it looks like, in a sentence. */
  about: text().notNull(),
  place: text().$type<Place>(),
  /** The library piece a theme's stand-in takes the place of, footprint and spots. */
  replaces: text(),
  /** The piece as .px text, in the house palette. */
  px: text().notNull(),
  /** A wall style's four tones, light to deep. */
  ramp: jsonb().$type<string[]>(),
  /** The layout it was first drawn for. */
  drawnFor: integer().references(() => offices.id, { onDelete: 'set null' }),
  createdAt: created()
});

/**
 * Which room each staffer worked in, per office, as it was when the owner
 * moved out: moving back puts everybody where they were. `office` is the
 * sample's plan id or `office-<id>` for a layout.
 */
export const officeRooms = pgTable('office_rooms', {
  office: text().primaryKey(),
  rooms: jsonb().$type<Record<string, string>>().notNull(),
  updatedAt: at('updated_at').notNull().defaultNow()
});

/**
 * The names the owner gives the office's rooms. A room without a row keeps the
 * name its floor plan starts it with. `room` is the composed room's id, like
 * `lobby#2`.
 */
export const roomNames = pgTable(
  'room_names',
  {
    office: text().notNull(),
    room: text().notNull(),
    name: text().notNull(),
    updatedAt: at('updated_at').notNull().defaultNow()
  },
  (t) => [primaryKey({ columns: [t.office, t.room] })]
);

/**
 * What the owner switched off in an office: a lamp, a screen, a fire. A prop
 * without a row is on. `obj` is the placed prop's id, like `library#3/desk-lamp#2`.
 */
export const switchedOff = pgTable(
  'switched_off',
  {
    office: text().notNull(),
    obj: text().notNull(),
    offAt: at('off_at').notNull().defaultNow()
  },
  (t) => [primaryKey({ columns: [t.office, t.obj] })]
);

/**
 * The app's updates. One row. The owner's window, in office time, is when a
 * new version may install. The shell reports the version it has downloaded
 * (`readyVersion`), and the office picks `installAt`: the next window's start,
 * or now when the owner presses Install now. `downAt` and `upAt` are when the
 * app last went down for an update and came back, so a poke due between them
 * still lands. See `update-window.ts`.
 */
export const appUpdate = pgTable('app_update', {
  id: text().primaryKey().default('app'),
  windowStart: text().notNull().default('02:00'),
  windowEnd: text().notNull().default('04:00'),
  readyVersion: text(),
  readyNotes: text(),
  readyAt: at('ready_at'),
  installAt: at('install_at'),
  downAt: at('down_at'),
  upAt: at('up_at'),
  updatedAt: at('updated_at').notNull().defaultNow()
});

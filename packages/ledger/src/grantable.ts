// What the owner can grant an Odd, in one list: each grant's control on the
// Odd's card, the line an Odd hears when it lacks it, where it hears that
// line, how it gets the grant, and whether a hire starts with it. The staff
// PATCH route's body keys are typed from here, so a new owner control fails
// the type check until it is classed. A hire's starting values live here too.
// The page imports this, so it imports only files the page reads too.
import { levelRoute, SWITCH_NAMES, type Level } from './access-words.ts';
import { AGENT_NAMES, type Agent, type CommandsHow, type GrantedFolder } from './agents.ts';
import { OWNER_ANSWERS, type Effect } from './desk-answers.ts';
import type { AskKind } from './schema.ts';
import { STARTER_TOOLS, type OfficeToolId } from './tools.ts';

/** Every key the staff PATCH route (`/api/staff/[id]`) reads from its body. */
export const STAFF_PATCH_KEYS = [
  'permission',
  'agent',
  'tool',
  'on',
  'commands',
  'web',
  'folder',
  'access',
  'effort',
  'model',
  'account'
] as const;
export type StaffPatchKey = (typeof STAFF_PATCH_KEYS)[number];

/** What the owner can grant an Odd. */
export const GRANT_KINDS = [
  'commands',
  'web',
  'folders',
  'office_tools',
  'outside_tools',
  'level'
] as const;
export type GrantKind = (typeof GRANT_KINDS)[number];

/**
 * What each grant's missing line needs to say its words, and nothing more.
 * A new GrantKind fails the type check at `OWNER_GRANTS` until it has a row
 * here. The Run commands and Browse the web lines keep a literal `{owner}`,
 * which `ownToolsSaid`'s caller fills; the others take the owner's name from
 * their caller.
 */
export type Readers = {
  commands: { agent: Agent; how: CommandsHow; where: string };
  web: { where: string };
  folders: { owner: string; where: string };
  office_tools: { owner: string; where: string };
  // house() knows no tool and no owner's name, so it never offers a switch.
  outside_tools: { has: (tool: string) => boolean };
  level: { owner: string; whose: string };
};

/** A function in `capabilities.ts` or the office's `house.ts` that says a grant's missing line. */
export type Hearer = 'ownToolsLine' | 'outsideLines' | 'askAboveLevel' | 'house' | 'accessInRun';

export type OwnerGrant<K extends GrantKind> = {
  /** The owner's control: PATCH keys on `/api/staff/[id]`, or the desk ask that grants it. */
  control: { patch: readonly StaffPatchKey[] } | { ask: AskKind };
  /** What the Odd hears when it lacks this, or none, with the Linear row that owes it. */
  missing: ((r: Readers[K]) => string) | { none: string };
  /** The functions that say `missing` to an Odd. */
  heard: readonly Hearer[];
  /** How the Odd gets it: an ask, or the owner's own control on its Settings tab. */
  route: { ask: AskKind } | { owner: 'settings' };
  /** What approving the route's ask does (its `OWNER_ANSWERS` cell), when the route is an ask. */
  approving?: readonly Effect[];
  /** Whether a hire starts with it (`HIRE_DEFAULTS`). */
  atHire: boolean;
};

/** Every grant the owner can make, and how an Odd learns it lacks one. */
export const OWNER_GRANTS = {
  commands: {
    // A move to another tool (`agent`) can switch it on too.
    control: { patch: ['commands'] },
    // The switch is offered only when it reaches the tool on this system
    // (`commandsHow`), so an Odd is never told of one the owner cannot move.
    missing: ({ agent, how, where }: Readers['commands']) =>
      how.state === 'switch'
        ? `No shell: {owner} can switch on ${SWITCH_NAMES.commands} in ${where}.`
        : `No shell: ${AGENT_NAMES[agent]} can't run commands here.`,
    heard: ['ownToolsLine'],
    route: { owner: 'settings' },
    atHire: false
  },
  web: {
    control: { patch: ['web'] },
    // Browse the web follows the owner on every tool.
    missing: ({ where }: Readers['web']) =>
      `No web: {owner} can switch on ${SWITCH_NAMES.web} in ${where}.`,
    heard: ['ownToolsLine'],
    route: { owner: 'settings' },
    atHire: false
  },
  folders: {
    control: { patch: ['folder', 'access'] },
    missing: { none: 'NEW-1697' },
    heard: [],
    route: { owner: 'settings' },
    atHire: false
  },
  office_tools: {
    control: { patch: ['tool', 'on'] },
    missing: { none: 'NEW-1697' },
    heard: [],
    route: { owner: 'settings' },
    atHire: true
  },
  outside_tools: {
    control: { ask: 'access' },
    // The leading space joins it to the sentence before it in house().
    missing: ({ has }: Readers['outside_tools']) =>
      !has('ask_for_access')
        ? ''
        : has('find_connectors')
          ? ' For more outside tools, call find_connectors, then ask_for_access.'
          : ' For more outside tools, call ask_for_access.',
    heard: ['house'],
    route: { ask: 'access' },
    approving: OWNER_ANSWERS.ask.access.approve,
    atHire: false
  },
  level: {
    control: { patch: ['permission'] },
    missing: ({ owner, whose }: Readers['level']) => levelRoute(owner, whose),
    heard: ['outsideLines', 'askAboveLevel'],
    route: { owner: 'settings' },
    atHire: true
  }
} as const satisfies { [K in GrantKind]: OwnerGrant<K> };

/**
 * Every PATCH key is the control of a grant, a setting of how the Odd runs,
 * or a qualifier another key needs (`on` for `tool`, `access` for `folder`).
 */
export const PATCH_KEY: Record<StaffPatchKey, GrantKind | 'run setting' | 'qualifier'> = {
  permission: 'level',
  agent: 'run setting',
  tool: 'office_tools',
  on: 'qualifier',
  commands: 'commands',
  web: 'web',
  folder: 'folders',
  access: 'qualifier',
  effort: 'run setting',
  model: 'run setting',
  account: 'run setting'
};

type Starts = { permission: Level; tools: OfficeToolId[] };
/**
 * What a hire starts with when the owner picks nothing: the schema's column
 * defaults, `hire()`, the Office Manager's hire and the hire drawer read it.
 * The rest have homes that work them out: the tool is the office's own
 * (`officeAgent()` in office.ts), the account its Office account and the
 * model the office's (both null), and thinking `DEFAULT_EFFORT`, never below
 * `MANAGER_EFFORT_FLOOR` for the manager (agents.ts).
 */
export const HIRE_DEFAULTS: {
  staff: Starts & { commands: boolean; web: boolean; folders: GrantedFolder[] };
  manager: Starts;
} = {
  staff: { permission: 'read', tools: STARTER_TOOLS, commands: false, web: false, folders: [] },
  manager: {
    permission: 'draft',
    tools: [
      ...STARTER_TOOLS,
      'office_report',
      'propose_hire',
      'list_goals',
      'propose_goal',
      'propose_goal_plan',
      'update_goal'
    ]
  }
};

// The office's own MCP server: how a staffer reaches the ledger, raises an
// ask, gives the owner a task and finds tools. The office app starts one per staff
// run with STAFF_ID set, so a staffer only ever acts as itself. It offers only
// the tools the owner granted that staffer (tools.ts), so the rest do not exist.
//
//   node packages/ledger/src/mcp.ts      (stdio; the office starts it)
import { existsSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  ask,
  asksFor,
  cancelPoke,
  catalog,
  editOwnJob,
  giveTask,
  reconnectTask,
  grantsFor,
  jobsFor,
  levelAtMost,
  officeActivity,
  ownerName,
  raiseAsk,
  schedulePoke,
  searchLedger,
  setDescription,
  staffer,
  type GoAhead,
  record,
  roster,
  waitingPokes,
  type LedgerRow
} from './office.ts';
import {
  allGoals,
  goal,
  goalDraft,
  goalsFor,
  logProgress,
  updateGoal,
  type GoalView
} from './goals.ts';
import { goalWhen, HEALTH_WORDS, HORIZONS, STATUS_WORDS } from './goal-words.ts';
import { ensureConnector, searchRegistry } from './registry.ts';
import type { GoalPlanItem, HireProposal } from './schema.ts';
import { clockTime, describe as describeSchedule, officeAt, WEEKDAYS, zoneName } from './time.ts';
import { hasTool, isGrantable } from './tools.ts';
import { home } from './home.ts';

const ME = process.env.STAFF_ID ?? '';
const me = await staffer(ME);
if (!me) throw new Error(`STAFF_ID "${ME}" names no Odd in this office`);
/** What this office's staff call the owner. */
const OWNER = await ownerName();
/** The office's time zone in words, like "Pacific Time". */
const ZONE = zoneName();
const has = (tool: string) => hasTool(me.tools, tool);
/** This staffer's own folder. Files it names are relative to it. */
const HOME = home('staff', ME);

/**
 * The owner's message, when this run is a chat with them. The office sets it, not
 * the staffer, so a change made "because the owner asked" carries their real words.
 */
const OWNER_SAID = process.env.OWNER_SAID || undefined;
/** The ask the owner approved that this run carries out, set by the office. No other ask counts. */
const APPROVED_ASK = Number(process.env.APPROVED_ASK) || undefined;

const approvedArg = z
  .number()
  .int()
  .optional()
  .describe(
    `Outside a chat with ${OWNER}: the id of the ask they approved, while you carry it out.`
  );

/** The owner's go-ahead for a change to this staffer, or why there is none. */
async function goAhead(askId?: number): Promise<GoAhead | { problem: string }> {
  if (OWNER_SAID) return { said: OWNER_SAID };
  if (askId) {
    const a = await ask(askId);
    if (a?.staffId !== ME || a.status !== 'approved')
      return { problem: `Ask #${askId} is not an ask of yours that ${OWNER} approved.` };
    // Each yes covers the run that carries it out, and no later one.
    if (askId !== APPROVED_ASK)
      return { problem: `Ask #${askId} is not the approved ask this run is carrying out.` };
    return { askId };
  }
  return {
    problem: `Only when ${OWNER} asks for it in chat, or with the id of an ask they approved. To propose it, raise_ask with the exact change first.`
  };
}

/** An optional link from a new ask to the one the owner sent back. */
const revisesArg = z
  .number()
  .int()
  .optional()
  .describe(`When ${OWNER} sent an ask back to rework, its id. Leave out otherwise.`);

const attachArg = z
  .array(z.string())
  .max(5)
  .optional()
  .describe(
    `Files in your folder that go with it, e.g. ['notes/intake.md']. ${OWNER} sees them on their desk and edits a Markdown one right there, so do not tell them where to find it.`
  );

/** The attachments as paths inside this staffer's folder, or why one is not. */
function attachable(paths: string[] = []): { paths: string[] } | { problem: string } {
  const out: string[] = [];
  for (const p of paths) {
    const file = resolve(HOME, p);
    const rel = relative(HOME, file);
    if (rel.startsWith('..') || !existsSync(file) || !statSync(file).isFile())
      return { problem: `No file at ${p} in your folder. Write it first.` };
    out.push(rel);
  }
  return { paths: [...new Set(out)] };
}

const atArg = z.string().regex(/^\d\d:\d\d$/);
const scheduleArg = z.discriminatedUnion('every', [
  z.object({ every: z.literal('minutes'), n: z.number().int().min(15) }),
  z.object({ every: z.literal('day'), at: atArg }),
  z.object({ every: z.literal('weekday'), at: atArg }),
  z
    .object({ every: z.literal('week'), day: z.enum(WEEKDAYS), at: atArg })
    .describe('Once a week, e.g. { every: "week", day: "Fri", at: "16:00" }.')
]);

/** A file in this staffer's folder, as a path inside it, or undefined when there is none. */
function ownFile(path: string): string | undefined {
  const file = resolve(HOME, path);
  const rel = relative(HOME, file);
  return rel.startsWith('..') || !existsSync(file) || !statSync(file).isFile() ? undefined : rel;
}

/** What propose_hire and propose_goal_plan both take to describe one hire. */
const hireFields = {
  name: z.string().max(40).describe('A first name for the Odd.'),
  role: z.string().max(60),
  remit: z.string().max(200).describe('One line for the card: what it is for.'),
  job_description_file: z
    .string()
    .describe('The job description, a file in your folder, e.g. notes/jd-mail-clerk.md.'),
  permission: z
    .enum(['read', 'draft', 'act'])
    .describe('read reads and reports, draft prepares drafts for their yes, act acts alone.'),
  room: z
    .string()
    .optional()
    .describe('Where it works: workspace, workspace-east, mail-room, library or lobby.'),
  office_tools: z
    .array(z.string())
    .optional()
    .describe(
      'Office tools beyond the ones every Odd has: search_ledger, give_owner_a_task, find_connectors, ask_for_access, edit_my_job, edit_my_description, poke_owner, propose_hire, office_report. Leave out for the usual starters.'
    ),
  appearance: z
    .string()
    .max(600)
    .optional()
    .describe(
      'What the person looks like, in a sentence or two: hair, build of clothes, colours, glasses or a beard. The office draws them from it.'
    ),
  first_job: z
    .object({
      name: z.string(),
      instructions: z.string(),
      schedule: scheduleArg,
      report: z
        .boolean()
        .optional()
        .describe(
          `Put each result on ${OWNER}'s desk as a report. True when the job makes something for them to read.`
        )
    })
    .optional(),
  intake_file: z
    .string()
    .optional()
    .describe(
      `An intake ${OWNER} filled in for this hire, a file in your folder. The new Odd gets a copy as notes/intake.md and reads their answers first-hand.`
    )
};
const hireShape = z.object(hireFields);
type HireArgs = z.infer<typeof hireShape>;

/** One hire as a proposal, or why the files it names are not there. */
function hireFrom(a: HireArgs): HireProposal | string {
  const jd = ownFile(a.job_description_file);
  if (!jd) return `No file at ${a.job_description_file} in your folder. Write it first.`;
  const intake = a.intake_file ? ownFile(a.intake_file) : undefined;
  if (a.intake_file && !intake) return `No file at ${a.intake_file} in your folder.`;
  return {
    name: a.name,
    role: a.role,
    remit: a.remit,
    room: a.room,
    permission: a.permission,
    jobDescriptionFile: jd,
    tools: a.office_tools?.filter(isGrantable),
    appearance: a.appearance,
    job: a.first_job,
    intakeFile: intake
  };
}

/** A goal for a staffer to read: what it is, why, what done looks like, and how it is going. */
function goalText(g: GoalView & { part?: string }, others = true): string {
  const head = `## Goal #${g.id}: ${g.title}\n${STATUS_WORDS[g.status]}, ${goalWhen(g)}, ${g.area}`;
  return [
    head,
    g.why && `Why it matters: ${g.why}`,
    g.doneWhen && `Done when: ${g.doneWhen}`,
    g.part && `Your part: ${g.part}`,
    others &&
      (g.staff.length
        ? `Served by: ${g.staff.map((s) => `${s.name} (${s.part})`).join('; ')}`
        : 'Nobody serves it yet.'),
    g.progress.length
      ? `Progress, newest first:\n${g.progress.map((p) => `- ${day(p.createdAt)} ${p.name}: ${HEALTH_WORDS[p.health]}. ${p.note}`).join('\n')}`
      : 'No progress logged yet.'
  ]
    .filter(Boolean)
    .join('\n');
}

const goalFields = {
  title: z
    .string()
    .max(140)
    .describe('The goal in their words, one line: "Answer every client email within a day".'),
  why: z.string().max(1000).optional().describe('Why it matters to them.'),
  done_when: z
    .string()
    .max(1000)
    .optional()
    .describe(
      'What done looks like, measurable when it can be: "a reply to every client email within a day, for a month".'
    ),
  horizon: z.enum(HORIZONS.map((h) => h.id) as [string, ...string[]]),
  due: z.string().optional().describe('YYYY-MM-DD, when horizon is "date".'),
  area: z
    .string()
    .max(40)
    .describe('work, family, health, money, learning or fun, or another word.')
};

const server = new McpServer({ name: 'office', version: '1.0.0' });
const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const json = (v: unknown) => text(JSON.stringify(v, null, 2));
const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const line = (r: LedgerRow) =>
  `- ${day(r.createdAt)} [${r.kind}] ${r.actor}: ${r.title}${r.reason ? ` (reason: ${r.reason})` : r.kind === 'decision' ? ' (no reason given)' : ''}`;

if (has('search_ledger'))
  server.registerTool(
    'search_ledger',
    {
      description: `Search the office ledger: every decision ${OWNER} made, all work done by Odds or by ${OWNER}, and reports. Search by meaning. Check it before raising an ask, so you know how ${OWNER} decided similar things.`,
      inputSchema: {
        query: z
          .string()
          .describe('What you are looking for, in plain words. Empty for the newest rows.'),
        kind: z.enum(['decision', 'work', 'report', 'hire', 'access']).optional(),
        who: z.string().optional().describe('An Odd\'s id, or "owner".'),
        limit: z.number().int().min(1).max(50).optional()
      }
    },
    async ({ query, kind, who, limit }) => {
      const rows = await searchLedger(query, { kind, actor: who, limit });
      return text(
        rows.length
          ? rows.map((r) => `${line(r)}\n  ${r.body.slice(0, 400)}`).join('\n')
          : 'Nothing found.'
      );
    }
  );

server.registerTool(
  'raise_ask',
  {
    description: `Ask ${OWNER} to approve something. It lands on their desk and they approve, deny, or send it back with what to change, maybe with a reason. Use it for anything that needs their yes. One decision per ask, worded as the exact action: if they approve, you carry it out at once in a new run, with only the ask to go on. The reply lists their closest past decisions: if one matches and gave no reason, tell ${OWNER} that a reason would let Odds handle these without asking next time. For tool access use ask_for_access, and for a new Odd use propose_hire.`,
    inputSchema: {
      title: z
        .string()
        .max(140)
        .describe(
          'What you want, as one short line: "Unsubscribe you from the airline sale emails".'
        ),
      why: z.string().describe('Why, in one to three plain sentences.'),
      if_approved: z.string().describe('What happens next if they say yes.'),
      attach: attachArg,
      revises: revisesArg
    }
  },
  async ({ title, why, if_approved, attach, revises }) => {
    const files = attachable(attach);
    if ('problem' in files) return text(files.problem);
    const { ask, precedent } = await raiseAsk(ME, {
      title,
      why,
      ifApproved: if_approved,
      revises,
      attach: files.paths
    });
    return text(
      `Ask ${ask.id} is on ${OWNER}'s desk. Check my_asks later for their decision.\n` +
        (precedent.length
          ? `\n${OWNER}'s closest past decisions:\n${precedent.map(line).join('\n')}`
          : `\n${OWNER} has decided nothing like this before.`)
    );
  }
);

server.registerTool(
  'my_asks',
  {
    description: `Your asks and how ${OWNER} decided each, with their reason when they gave one.`,
    inputSchema: {}
  },
  async () => {
    const rows = await asksFor(ME);
    if (!rows.length) return text('You have raised no asks.');
    return text(
      rows
        .map(
          (a) =>
            `- #${a.id} ${a.status === 'revise' ? 'SENT BACK' : a.status.toUpperCase()}: ${a.title}${a.reason ? ` (${a.status === 'revise' ? 'change' : 'reason'}: ${a.reason})` : a.status === 'open' ? '' : ' (no reason given)'}`
        )
        .join('\n')
    );
  }
);

if (has('give_owner_a_task'))
  server.registerTool(
    'give_owner_a_task',
    {
      description: `Give ${OWNER}, the human operator, a task: something only they can do. Steps are numbered and each is one action, written so anyone can follow them without guessing: name the button, the place, the exact thing. If they must choose, pass choices and the task ends with them, e.g. for 'Should this kind of email reach you?' pass ['Yes, keep sending these', 'No, filter these out']. When they must fill in or read a file, write it in your folder and attach it: a step says 'Answer each question in intake.md below', never where the file lives. Never write steps to connect or reconnect a tool: ask_for_access and reconnect_access give the office's own.`,
      inputSchema: {
        title: z.string().max(140),
        why: z.string().describe('One or two sentences on why this is theirs to do.'),
        steps: z.array(z.string()).min(1).max(12).describe('One action per step. No "and then".'),
        choices: z.array(z.string()).min(2).max(4).optional(),
        attach: attachArg
      }
    },
    async ({ title, why, steps, choices, attach }) => {
      const files = attachable(attach);
      if ('problem' in files) return text(files.problem);
      const all = [
        ...steps.map((s) => ({ text: s, done: false })),
        ...(choices
          ? [
              {
                text: 'Choose one.',
                done: false,
                action: { kind: 'choice' as const, options: choices }
              }
            ]
          : [])
      ];
      const t = await giveTask(ME, { title, why, steps: all, attach: files.paths });
      return text(`Task ${t.id} is on ${OWNER}'s desk. The ledger records it when they finish it.`);
    }
  );

server.registerTool(
  'my_access',
  {
    description: `The tools ${OWNER} has connected for you, with the level for each.`,
    inputSchema: {}
  },
  async () => {
    const rows = await grantsFor(ME);
    if (!rows.length) return text(`${OWNER} has connected no outside tools for you yet.`);
    return text(
      rows
        .map(
          (g) =>
            `- ${g.connector.name} (${g.connectorId}): ${g.level}${g.connector.readyAt ? '' : `, waiting on ${OWNER} to finish connecting it`}`
        )
        .join('\n')
    );
  }
);

if (has('find_connectors'))
  server.registerTool(
    'find_connectors',
    {
      description:
        "Find MCP servers that would give you a tool you need: the office's own catalog first, then the public MCP Registry. Then call ask_for_access with the id or registry name.",
      inputSchema: {
        need: z.string().describe('The service or job, e.g. "Trello cards" or "Notion pages".')
      }
    },
    async ({ need }) => {
      const words = need.toLowerCase().split(/\W+/).filter(Boolean);
      const own = (await catalog()).filter((c) =>
        words.some((w) => `${c.name} ${c.description}`.toLowerCase().includes(w))
      );
      let found: Awaited<ReturnType<typeof searchRegistry>> = [];
      let note = '';
      try {
        found = await searchRegistry(need);
      } catch (e) {
        note = `\nThe MCP Registry did not answer: ${e instanceof Error ? e.message : e}`;
      }
      return json({
        catalog: own.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          ready: !!c.readyAt
        })),
        registry: found.map((c) => ({
          registry: c.registry,
          description: c.description,
          repository: c.repository,
          runsAs: c.kind ?? null,
          needs: [...(c.config?.secrets ?? []), ...(c.config?.headers ?? [])],
          unsupported: c.unsupported
        })),
        note: note || undefined
      });
    }
  );

if (has('ask_for_access'))
  server.registerTool(
    'ask_for_access',
    {
      description: `Ask ${OWNER} to connect a tool for you. Pass a catalog id or registry name from find_connectors, or the https address of a hosted MCP server. Ask for the lowest level that does the job: read to look, write to change things in the tool (needs act permission). If they approve, they get numbered steps to connect it, and it shows up in my_access when done.`,
      inputSchema: {
        connector: z.string(),
        level: z
          .enum(['read', 'write'])
          .describe('read to look, write to change things in the tool.'),
        why: z.string().describe('What job this access is for, in one or two sentences.'),
        revises: revisesArg
      }
    },
    async ({ connector: wanted, level: asked, why, revises }) => {
      const level = asked === 'write' ? 'act' : 'read';
      if (!levelAtMost(level, me.permission))
        return text(
          `You hold ${me.permission}, so you cannot ask for ${asked}. Ask ${OWNER} to raise your level first.`
        );
      const found = await ensureConnector(wanted);
      if (!found.connector) return text(`${found.problem} Use find_connectors.`);
      const conn = found.connector;
      const title = `Connect ${conn.name} (${asked})`;
      const { ask, precedent } = await raiseAsk(ME, {
        title,
        why,
        ifApproved: conn.readyAt
          ? `${me.name} can use ${conn.name} at once: you connected it already, so there are no steps.`
          : `You get numbered steps to connect ${conn.name} for ${me.name}.`,
        revises,
        access: { connector: conn.id, level }
      });
      return text(
        `Ask ${ask.id} is on ${OWNER}'s desk.` +
          (precedent.length
            ? `\n${OWNER}'s closest past decisions:\n${precedent.map(line).join('\n')}`
            : '')
      );
    }
  );

server.registerTool(
  'reconnect_access',
  {
    description: `A tool ${OWNER} already gave you stopped working: its tools fail to load, or it turns down its key or sign-in. This puts the office's own steps to connect it again on ${OWNER}'s desk, with a box for the new key and a Connect button, and no ask, since they said yes once. Never write those steps yourself with give_owner_a_task. Pass get_key only when the tool takes a key: how to get a new one, one action per step, naming the exact page and button.`,
    inputSchema: {
      connector: z.string().describe('The id my_access lists.'),
      problem: z
        .string()
        .max(300)
        .describe('What went wrong and since when, in one or two sentences, with the error.'),
      get_key: z
        .array(z.string().max(200))
        .max(4)
        .optional()
        .describe(
          'How to get a new key, e.g. ["Open https://console.apify.com/settings/integrations.", "Copy your Personal API token. It starts with apify_api_."]'
        )
    }
  },
  async ({ connector: id, problem, get_key = [] }) => {
    const r = await reconnectTask(ME, id, problem, get_key);
    if ('problem' in r) return text(r.problem);
    return text(
      r.already
        ? `Task ${r.task.id} to connect it is already on ${OWNER}'s desk. Point them to it.`
        : `Task ${r.task.id} is on ${OWNER}'s desk. You hear when they finish it.`
    );
  }
);

server.registerTool(
  'my_jobs',
  {
    description: `Your own jobs: name, schedule in ${ZONE}, and the steps each run follows.`,
    inputSchema: {}
  },
  async () => {
    const rows = await jobsFor(ME);
    if (!rows.length) return text('You have no jobs.');
    return text(
      rows
        .map(
          (j) =>
            `## ${j.name}\n${describeSchedule(j.schedule)}${j.enabled ? '' : ', paused'}${j.report ? `, reports to ${OWNER}` : ''}\n\n${j.instructions}`
        )
        .join('\n\n')
    );
  }
);

server.registerTool(
  'my_goals',
  {
    description: `The goals ${OWNER} set that you serve: why each matters, what done looks like, your part, and how it is going. Work toward them. You see only these.`,
    inputSchema: {}
  },
  async () => {
    const rows = (await goalsFor(ME)).filter((g) => g.status === 'active' || g.status === 'paused');
    return text(
      rows.length ? rows.map((g) => goalText(g)).join('\n\n') : 'You serve no goals yet.'
    );
  }
);

server.registerTool(
  'log_progress',
  {
    description: `Say how a goal you serve is going, once per run that moves it or shows it slipping. One line of evidence, with a number when there is one: "inbox at 14 on Friday, down from 40; a deadline pushed Tuesday's sort to Wednesday". ${OWNER}'s daily report reads these.`,
    inputSchema: {
      goal_id: z.number().int(),
      health: z
        .enum(['on_track', 'slipping', 'blocked'])
        .describe('blocked means it cannot move without something from someone.'),
      note: z.string().min(1).max(300)
    }
  },
  async ({ goal_id, health, note }) => {
    const r = await logProgress(ME, goal_id, health, note);
    return text(typeof r === 'string' ? r : `Logged on goal #${goal_id}.`);
  }
);

if (has('list_goals'))
  server.registerTool(
    'list_goals',
    {
      description: `Every goal ${OWNER} set, active first: why, done when, who serves each and their part, and the latest progress.`,
      inputSchema: {}
    },
    async () => {
      const rows = await allGoals();
      return text(rows.length ? rows.map((g) => goalText(g)).join('\n\n') : 'No goals yet.');
    }
  );

if (has('propose_goal'))
  server.registerTool(
    'propose_goal',
    {
      description: `Offer ${OWNER} a goal you heard from them, for their yes. It lands on their desk; approving sets it, and then you plan it. One goal per ask, in their words. Never treat a goal as set before they approve it.`,
      inputSchema: {
        ...goalFields,
        heard: z.string().max(600).describe(`What ${OWNER} said that this comes from.`),
        revises: revisesArg
      }
    },
    async (a) => {
      const d = goalDraft({
        title: a.title,
        why: a.why,
        doneWhen: a.done_when,
        horizon: a.horizon,
        due: a.due,
        area: a.area
      });
      if (typeof d === 'string') return text(d);
      const { ask } = await raiseAsk(ME, {
        kind: 'goal',
        title: `Set a goal: ${d.title}`,
        why: a.heard,
        ifApproved: 'The goal is set. I plan who does what and bring you the plan.',
        goal: d,
        revises: a.revises
      });
      return text(`Ask ${ask.id} is on ${OWNER}'s desk.`);
    }
  );

if (has('propose_goal_plan'))
  server.registerTool(
    'propose_goal_plan',
    {
      description: `Bring ${OWNER} the plan for one goal, in one ask: Odds already here who take on a part (with a new job or a change to one), new hires for work nobody here fits, and the steps only ${OWNER} can do. They tick the parts to go ahead with; each hire then opens in the hire window. Prefer Odds already here. Write each hire's job description to a file in your folder first.`,
      inputSchema: {
        goal_id: z.number().int(),
        why: z
          .string()
          .describe('The plan in two or three plain sentences: who does what, and why this way.'),
        assign: z
          .array(
            z.object({
              staff: z.string().describe("An Odd's id from office_report."),
              part: z.string().max(400).describe('What this Odd does for the goal, one line.'),
              new_job: z
                .object({
                  name: z.string(),
                  instructions: z.string(),
                  schedule: scheduleArg,
                  report: z.boolean().optional()
                })
                .optional(),
              change_job: z
                .object({
                  name: z.string().describe('The job name, exactly as it is now.'),
                  instructions: z.string().optional(),
                  schedule: scheduleArg.optional()
                })
                .optional()
            })
          )
          .max(6)
          .optional(),
        hires: z
          .array(
            z.object({
              ...hireFields,
              part: z.string().max(400).describe('What this hire does for the goal, one line.')
            })
          )
          .max(4)
          .optional(),
        owner_steps: z
          .array(z.string())
          .max(8)
          .optional()
          .describe(`What only ${OWNER} can do, one action per step. They get these as a task.`),
        attach: attachArg,
        revises: revisesArg
      }
    },
    async (a) => {
      const g = await goal(a.goal_id);
      if (!g) return text(`No goal #${a.goal_id}. Check list_goals.`);
      const here = new Set((await roster()).map((s) => s.id));
      const items: GoalPlanItem[] = [];
      for (const x of a.assign ?? []) {
        if (!here.has(x.staff)) return text(`No Odd "${x.staff}". Check office_report.`);
        items.push({
          kind: 'assign',
          staff: x.staff,
          part: x.part,
          job: x.new_job,
          editJob: x.change_job
        });
      }
      for (const h of a.hires ?? []) {
        const hire = hireFrom(h);
        if (typeof hire === 'string') return text(hire);
        items.push({ kind: 'hire', hire, part: h.part });
      }
      if (!items.length) return text('A plan needs at least one Odd or hire.');
      const files = attachable(a.attach);
      if ('problem' in files) return text(files.problem);
      const { ask } = await raiseAsk(ME, {
        kind: 'plan',
        title: `Plan for: ${g.title}`,
        why: a.why,
        ifApproved:
          'Odds already here take on their part at once. Each hire opens in the hire window, and your steps land on your desk.',
        plan: { goalId: g.id, items, ownerSteps: a.owner_steps },
        revises: a.revises,
        attach: files.paths
      });
      return text(`Ask ${ask.id} is on ${OWNER}'s desk.`);
    }
  );

if (has('update_goal'))
  server.registerTool(
    'update_goal',
    {
      description: `Change a goal: mark it met, paused, dropped or active again, or reword it. When ${OWNER} asks in chat, do it at once. Outside a chat, only to carry out an ask they approved, passing its id. To propose it, raise_ask first.`,
      inputSchema: {
        goal_id: z.number().int(),
        status: z.enum(['active', 'paused', 'met', 'dropped']).optional(),
        title: goalFields.title.optional(),
        why: goalFields.why,
        done_when: goalFields.done_when,
        horizon: goalFields.horizon.optional(),
        due: goalFields.due,
        approved_ask: approvedArg
      }
    },
    async (a) => {
      const go = await goAhead(a.approved_ask);
      if ('problem' in go) return text(go.problem);
      const g = await goal(a.goal_id);
      if (!g) return text(`No goal #${a.goal_id}.`);
      const patch = Object.fromEntries(
        Object.entries({
          status: a.status,
          title: a.title,
          why: a.why,
          doneWhen: a.done_when,
          horizon: a.horizon,
          due: a.due
        }).filter(([, v]) => v !== undefined)
      );
      if (!Object.keys(patch).length) return text('Say what to change.');
      if ('said' in go)
        await record({
          kind: 'decision',
          actor: 'owner',
          title: `Asked ${me.name} in chat: change the goal "${g.title}"`,
          body: go.said
        });
      await updateGoal(g.id, patch, { staffId: ME, askId: 'askId' in go ? go.askId : undefined });
      return text(`Goal #${g.id} is changed.`);
    }
  );

if (has('edit_my_job'))
  server.registerTool(
    'edit_my_job',
    {
      description: `Change one of your own jobs: its steps, its schedule, or whether it reports to ${OWNER}. When ${OWNER} asks for a change in chat, make it at once, worded the way they asked, then tell them what changed. Outside a chat, only to carry out an ask they approved, passing its id. To propose a change, raise_ask with the exact new steps first.`,
      inputSchema: {
        job: z.string().describe('The job name, exactly as my_jobs lists it.'),
        instructions: z.string().optional().describe('The full new steps, numbered.'),
        schedule: scheduleArg.optional(),
        report: z.boolean().optional(),
        approved_ask: approvedArg
      }
    },
    async ({ job, instructions, schedule, report, approved_ask }) => {
      const go = await goAhead(approved_ask);
      if ('problem' in go) return text(go.problem);
      const j = await editOwnJob(ME, job, { instructions, schedule, report }, go);
      return text(j ? `Changed "${job}".` : `You have no job named "${job}". Check my_jobs.`);
    }
  );

if (has('edit_my_description'))
  server.registerTool(
    'edit_my_description',
    {
      description: `Rewrite your own job description: the text that tells you who you are and how you work, which every run starts from. When ${OWNER} asks for a change in chat, make it at once, then tell them what changed. Outside a chat, only to carry out an ask they approved, passing its id. Pass the whole new description, keeping every part they did not ask to change. It takes effect from your next run.`,
      inputSchema: {
        description: z.string().min(1).max(20_000).describe('The full new job description.'),
        approved_ask: approvedArg
      }
    },
    async ({ description, approved_ask }) => {
      const go = await goAhead(approved_ask);
      if ('problem' in go) return text(go.problem);
      return text(
        (await setDescription(ME, description, { go }))
          ? 'Your job description is changed. It applies from your next run.'
          : 'That is your job description already. Nothing changed.'
      );
    }
  );

if (has('poke_owner')) {
  server.registerTool(
    'poke_owner',
    {
      description: `Send ${OWNER} a chat message later, once: a check-in after something they planned, or a nudge before it. Write the exact message now, in your voice, short; the office delivers it at that time as a chat from you, with a notification on their Mac. Use it when ${OWNER} asks ("check in on me in an hour"), or when your job says to; in_minutes 0 sends it now. One poke per minute: a new one at the same time replaces the old. Not for anything that needs their yes; that is raise_ask.`,
      inputSchema: {
        message: z.string().min(1).max(500).describe(`Exactly what ${OWNER} reads.`),
        at: z.string().optional().describe(`${ZONE}: "18:50" for today, or "2026-11-02 18:50".`),
        in_minutes: z
          .number()
          .int()
          .min(0)
          .max(10_080)
          .optional()
          .describe('Instead of at: how many minutes from now. 0 is now.')
      }
    },
    async ({ message, at, in_minutes }) => {
      const when =
        in_minutes !== undefined
          ? new Date(Date.now() + in_minutes * 60_000)
          : at
            ? officeAt(at)
            : undefined;
      if (!when)
        return text(`Say when: at as "HH:MM" or "YYYY-MM-DD HH:MM" in ${ZONE}, or in_minutes.`);
      try {
        const p = await schedulePoke(ME, when, message);
        return text(`Poke ${p.id} is set for ${clockTime(p.at)} ${ZONE}.`);
      } catch (e) {
        return text(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.registerTool(
    'my_pokes',
    {
      description: 'Your pokes still to come, with their ids, times and messages.',
      inputSchema: {}
    },
    async () => {
      const rows = await waitingPokes(ME);
      return text(
        rows.length
          ? rows.map((p) => `- #${p.id} ${clockTime(p.at)}: ${p.message}`).join('\n')
          : 'No pokes waiting.'
      );
    }
  );

  server.registerTool(
    'cancel_poke',
    {
      description: 'Cancel one of your pokes still to come, by its id from my_pokes.',
      inputSchema: { id: z.number().int() }
    },
    async ({ id }) =>
      text(
        (await cancelPoke(id, ME)) ? `Poke ${id} is cancelled.` : `No waiting poke #${id} of yours.`
      )
  );
}

if (has('propose_hire'))
  server.registerTool(
    'propose_hire',
    {
      description: `Propose a new Odd to ${OWNER}. Write the job description to a file in your folder first, then pass its path. It lands on their desk as an ask; approving it opens the hire window filled in with this, and they hire from there. They may edit the file before they hire, so the window reads it then. One hire per ask. For a hire that serves a goal, use propose_goal_plan instead.`,
      inputSchema: {
        ...hireFields,
        why: z.string().describe('Why this hire, in one to three sentences.'),
        revises: revisesArg
      }
    },
    async (a) => {
      const hire = hireFrom(a);
      if (typeof hire === 'string') return text(hire);
      const { ask } = await raiseAsk(ME, {
        title: `Hire ${a.name}, ${a.role}`,
        why: a.why,
        ifApproved: 'The hire window opens with this filled in. You hire from there.',
        revises: a.revises,
        hire
      });
      return text(`Ask ${ask.id} is on ${OWNER}'s desk.`);
    }
  );

if (has('office_report'))
  server.registerTool(
    'office_report',
    {
      description: `Everything the office did in a window: each Odd with its jobs and runs, asks open and decided, and tasks for ${OWNER} open and done. For the daily report. followUps is the work owed after ${OWNER} answered: carrying out an approved ask, reworking one they sent back, acting on their feedback on a report, or picking up after a task they finished, each with its outcome (done, failed, waiting on ${OWNER}, or null while still to do). Each run has a trigger: 'schedule' means its timer started it, 'manual' means ${OWNER} pressed Run now. Judge a job's timing by its schedule runs only; a manual run at any hour is expected. Every time is ${ZONE}, like the schedules.`,
      inputSchema: { hours: z.number().int().min(1).max(168).default(24) }
    },
    async ({ hours }) => json(await officeActivity(new Date(Date.now() - hours * 3_600_000)))
  );

await server.connect(new StdioServerTransport());
// The database pool would keep the process alive after Claude Code hangs up.
process.stdin.on('end', () => process.exit(0));

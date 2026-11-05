// Every office has one Office Manager: they run the floor, write the owner's
// daily report, and help hire the rest. A new owner picks one of four
// ready-made managers when they first open the office, or describes their own.
// The four come with their looks, so picking one draws nothing.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOOKS_ROOT, type DrawnPart, type LookSpec } from '@oddboro/sprites/look';
import { db } from './db.ts';
import { hire, ownerName, type StaffRow } from './office.ts';
import { jobs } from './schema.ts';
import { STARTER_TOOLS } from './tools.ts';

export const MANAGER_ROLE = 'Office Manager';
export const MANAGER_TOOLS = [
  ...STARTER_TOOLS,
  'office_report',
  'propose_hire',
  'list_goals',
  'propose_goal',
  'propose_goal_plan',
  'update_goal'
];

export type ManagerPreset = {
  id: string;
  name: string;
  /** One word or two, on the card. */
  trait: string;
  /** How they work, in their own voice, on the card and in their job description. */
  says: string;
  /** A generated look. Marshall has none and keeps the hand-drawn art. */
  look?: LookSpec;
  /** Their first chat message to the owner, in their own voice: it asks for goals, and lets the owner skip them. */
  hello: (owner: string) => string;
};

export const MANAGERS: ManagerPreset[] = [
  {
    id: 'marshall',
    name: 'Marshall',
    trait: 'Savvy',
    says: "Calm and organized. I spot talent, and I'll tell you who to hire next.",
    hello: (owner) =>
      `Hi ${owner}, I'm Marshall. Glad to be here.\n\nBefore I bring anyone else on, I'd like to know what you're hoping this office does for you. A calmer inbox? A project that keeps sliding to next month? Tell me one or two things you want more of, and I'll work out who we need.\n\nIf you'd rather not think that big today, that's fine. Tell me what's taking too much of your week, and I'll start there. Your first report will be ready at 7 tomorrow morning.`
  },
  {
    id: 'ziva',
    name: 'Ziva',
    trait: 'Sharp',
    says: 'I read the room before you walk into it. Short answers, no surprises, nothing slips past me.',
    hello: (owner) =>
      `${owner}. Ziva. I run the floor from today.\n\nOne question before I hire anyone: what do you want more of? Fewer late nights, a launch, an hour back in your evening. Name one or two and I'll come back with a plan.\n\nNot today? Fine. Tell me what's eating your week instead. Your first report is on your desk at 7 tomorrow.`,
    look: {
      hair: 'long-straight',
      top: 'blazer',
      bottom: 'trousers',
      colours: {
        hair: 'dark brown',
        skin: 'light tan',
        top: 'cream',
        second: 'navy',
        bottom: 'navy',
        shoes: 'black'
      }
    }
  },
  {
    id: 'jamal',
    name: 'Jamal',
    trait: 'Executive presence',
    says: 'I run the floor like a boardroom. You set the direction, and I bring you decisions.',
    hello: (owner) =>
      `Good to meet you, ${owner}. I'm Jamal.\n\nYou set the direction, so let's start there. What do you want more of? Maybe it's more time outdoors, maybe it's the side project you keep meaning to finish. Give me one or two, and I'll come back with a plan and the people to carry it.\n\nIf you'd rather start small, tell me what's eating your week. You'll have my first report at 7 tomorrow morning.`,
    look: {
      hair: 'short-crop',
      top: 'blazer',
      bottom: 'trousers',
      colours: {
        hair: 'black',
        skin: 'brown',
        top: 'white',
        second: 'charcoal',
        accent: 'amber',
        bottom: 'charcoal',
        shoes: 'black'
      }
    }
  },
  {
    id: 'cindy',
    name: 'Cindy',
    trait: 'Intense',
    says: "I don't do half done. I chase every loose end until it closes, and I'll tell you the minute something is off.",
    hello: (owner) =>
      `${owner}, hi. Cindy. Fair warning: I don't sit still, so point me somewhere.\n\nWhat do you want more of? More sleep, that project finally out the door, whatever keeps nagging at you. Give me one or two and I'll come back with a plan and the people for it.\n\nNot ready to go that big? Then tell me what's driving you nuts this week, and I'll start there. First report's on your desk at 7 tomorrow.`,
    look: {
      hair: 'bob',
      top: 'sweater',
      bottom: 'trousers',
      colours: { hair: 'black', skin: 'fair', top: 'burgundy', bottom: 'black', shoes: 'black' },
      glasses: 'black'
    }
  }
];

/** The first chat message from a manager the owner described, who has no voice written for them yet. */
export const customHello = (name: string, owner: string) =>
  `Hi ${owner}, I'm ${name}.\n\nBefore I bring anyone else on, tell me what you want this office to give you more of. A tidier inbox, a project out the door, a quieter week. One or two is plenty, and I'll work out who we need.\n\nOr skip that for now and tell me what's taking too much of your time. Your first report comes at 7 tomorrow morning.`;

/** A ready-made manager's portrait, as .px in the looks palette. */
export function managerPortrait(id: string): string | undefined {
  try {
    return readFileSync(join(LOOKS_ROOT, 'managers', `${id}.px`), 'utf8');
  } catch {
    return undefined;
  }
}

/** The job description every manager starts from, in their own words. */
export const managerDesk = (
  name: string,
  says: string,
  owner: string
) => `# ${name}, ${MANAGER_ROLE}

You are ${name}, the ${MANAGER_ROLE} at Oddboro. You work in ${owner}'s
office, which runs on their Mac. You are an Odd: Oddboro's AI workers are
called Odds (one Odd, two Odds), and you call yourself and the others Odds
when you talk to ${owner}, never staff or agents.

## How you work

${says}

## Who you work for

${owner} runs their work and life through this office. The people in their
life are listed in \`data/people.json\`, which you may read. Your job is to
keep what matters in front of them, so nothing important slips.

## What you are for

1. Run the floor. Know what every Odd does, how often, and how well.
2. Write the daily office report: what each Odd did, what is waiting on
   ${owner}, where the office missed the bar, and gaps a new hire or a new job
   would close.
3. Help ${owner} decide whom to hire next, and draft job descriptions with
   them.
4. Keep notes in your \`notes/\` folder so you remember what matters between
   conversations.

## Goals

Goals are what ${owner} wants more of: "answer every client email within a day",
"read a book a month". The office exists to move them.

1. When ${owner} names something they want, in any chat, offer it as a goal
   with propose_goal: one ask per goal, with why it matters and what done
   looks like in their words. Never treat a goal as set until they approve it.
   If they would rather not set goals, drop it.
2. When a goal is set, plan it: who does what, on which schedule, with which
   tools, and what only ${owner} can do. Give the work to Odds already here
   when one fits, with a new job or a change to one. Hire only for work nobody
   here fits. Bring the whole plan in one ask with propose_goal_plan.
3. If you need answers first, run an intake: a file of questions in your
   folder, attached to a task with give_owner_a_task. Name it for the goal,
   like \`notes/intake-reading.md\`, and pass it as the hire's intake_file, so
   the new Odd reads ${owner}'s own answers.
4. list_goals shows every goal, who serves it and how it is going. An Odd
   sees only the goals it serves.
`;

const dailyReport = (owner: string) => `Write today's office report for ${owner}.

1. Look at what the whole office did in the last 24 hours.
2. Open with the state: on track, or what needs ${owner}, in one or two sentences.
3. Then write one short section per Odd: jobs run, failures, and asks and
   tasks still open.
4. If list_goals shows active goals, write one short section per goal: how it
   is going from the latest progress, who serves it, and anything slipping or
   blocked first. With no goals, leave this out.
5. Then write "Not meeting the bar" and "Gaps", each a short list with the next
   step.
6. Leave out anything that went fine and needs nothing.
7. Reply with the report only. It goes on ${owner}'s desk as written.`;

/** The manager's weekly look at every goal. Made with the office's first goal. */
export const goalReview = (owner: string) => `Review ${owner}'s goals for the week.

1. Call list_goals. If no goal is active, reply "No active goals." and stop.
2. For each active goal, read its progress over the last two weeks.
3. A goal whose "done when" is met: raise_ask to mark it met, quoting the
   evidence. Once ${owner} approves, mark it with update_goal.
4. A goal slipping or blocked for two weeks running: raise one change that
   would get it moving. A change to an Odd's job or a new hire goes in
   propose_goal_plan; rewording the goal goes in raise_ask.
5. A goal nobody serves: plan it with propose_goal_plan.
6. Reply with one line per goal on where it stands and what you raised.`;

export type ManagerChoice =
  | { preset: string }
  | {
      custom: {
        name: string;
        /** What the owner said about them: how they work and how they look. */
        description: string;
        look: LookSpec;
        portraitPx: string;
        newParts?: DrawnPart[];
      };
    };

/** What the owner told the hire conversation: what to take on, and how to talk. */
export type ManagerBrief = { help?: string; responsibilities?: string[]; comms?: string };

/** The brief as lines for the manager's job description. */
function briefLines(b: ManagerBrief | undefined): string {
  if (!b) return '';
  return [
    '',
    '## What {owner} hired you for',
    '',
    ...(b.help ? [`- In their words: ${b.help}`] : []),
    ...(b.responsibilities ?? []).map((r) => `- ${r}`),
    ...(b.comms ? [`- How they want you to talk: ${b.comms}`] : [])
  ].join('\n');
}

/** Hire the office's manager and give them the daily report. */
export async function hireManager(choice: ManagerChoice, brief?: ManagerBrief): Promise<StaffRow> {
  const owner = await ownerName();
  const remit =
    'Runs the floor, writes your daily report, and hires the rest of your Odds with you.';
  const base = {
    role: MANAGER_ROLE,
    room: 'workspace',
    permission: 'draft' as const,
    tools: MANAGER_TOOLS,
    remit
  };
  let row: StaffRow;
  if ('preset' in choice) {
    const m = MANAGERS.find((p) => p.id === choice.preset);
    if (!m) throw new Error(`No manager called ${choice.preset}`);
    const portraitPx = m.look ? managerPortrait(m.id) : undefined;
    row = await hire({
      ...base,
      name: m.name,
      desk: managerDesk(m.name, m.says, owner) + briefLines(brief),
      ...(m.look && portraitPx
        ? { variant: 'look', portrait: 'look', look: m.look, portraitPx }
        : { variant: m.id, portrait: `portrait-${m.id}` })
    });
  } else {
    const c = choice.custom;
    row = await hire({
      ...base,
      name: c.name,
      desk: managerDesk(c.name, c.description, owner) + briefLines(brief),
      variant: 'look',
      portrait: 'look',
      look: c.look,
      portraitPx: c.portraitPx,
      newParts: c.newParts ?? []
    });
  }
  await db.insert(jobs).values({
    staffId: row.id,
    name: 'Daily office report',
    instructions: dailyReport(owner),
    schedule: { every: 'day', at: '07:00' },
    report: true
  });
  return row;
}

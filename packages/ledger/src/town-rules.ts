// Main Street, the town a new owner arrives in before they build their own
// place: the invite that brings them, its three shops, where the owner got
// to, what an Odd may remember about them, and who the preview suggests
// bringing along. No database here, so the page may import it and the tests
// run without one.
import type { LookSpec } from '@oddboro/sprites/look';
import type { OfficeSpec } from '@oddboro/world';

// The invite

/** A friend's invite: who they are, how their Odd looks, and a line from them. */
export type Invite = { name: string; look?: LookSpec; note?: string };

/**
 * Where an invite link points. Everything after the # stays in the browser,
 * so the site never sees who invited whom.
 */
export const INVITE_PAGE = 'https://oddboro.com/invite/';

const toB64url = (text: string) => {
  let bin = '';
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (code: string) => {
  const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

/** The link a friend sends. */
export function inviteLink(i: Invite): string {
  const body = {
    v: 1,
    n: i.name.trim().slice(0, 30),
    l: i.look,
    m: i.note?.trim().slice(0, 280) || undefined
  };
  return `${INVITE_PAGE}#${toB64url(JSON.stringify(body))}`;
}

const isWord = (v: unknown, max = 40): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max && /^[a-z0-9 -]+$/i.test(v);

/** A look as an invite carries it, or nothing when it is not the shape of one. */
function lookOf(v: unknown): LookSpec | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const l = v as Record<string, unknown>;
  const c = l.colours as Record<string, unknown> | undefined;
  if (!isWord(l.hair) || !isWord(l.top) || !isWord(l.bottom) || !c || typeof c !== 'object')
    return undefined;
  const roles = ['hair', 'skin', 'top', 'bottom', 'shoes'] as const;
  if (!roles.every((r) => isWord(c[r]))) return undefined;
  const colours: LookSpec['colours'] = {
    hair: c.hair as string,
    skin: c.skin as string,
    top: c.top as string,
    bottom: c.bottom as string,
    shoes: c.shoes as string
  };
  for (const r of ['second', 'accent', 'beard'] as const) if (isWord(c[r])) colours[r] = c[r];
  return {
    hair: l.hair,
    top: l.top,
    bottom: l.bottom,
    colours,
    ...(isWord(l.glasses) ? { glasses: l.glasses } : {}),
    ...(l.beard === true ? { beard: true } : {})
  };
}

/**
 * The invite in a pasted link or code, or nothing when it is not one. Only
 * a name, a look and a short note come through, whatever else it carries.
 */
export function readInvite(text: string): Invite | undefined {
  const code = text.trim().split('#').pop()?.trim() ?? '';
  if (!code || code.length > 4000 || !/^[A-Za-z0-9_-]+$/.test(code)) return undefined;
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(fromB64url(code)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  const name =
    typeof body.n === 'string'
      ? body.n
          .replace(/[\u0000-\u001f]/g, '')
          .trim()
          .slice(0, 30)
      : '';
  if (body.v !== 1 || !name) return undefined;
  const note =
    typeof body.m === 'string'
      ? body.m
          .replace(/[\u0000-\u001f]/g, ' ')
          .trim()
          .slice(0, 280)
      : '';
  const look = lookOf(body.l);
  return { name, ...(look ? { look } : {}), ...(note ? { note } : {}) };
}

// Walking

export type WalkStep = 'up' | 'down' | 'left' | 'right';

/** The arrow keys and WASD, as a step. */
export function stepOfKey(key: string): WalkStep | undefined {
  const k = key.length === 1 ? key.toLowerCase() : key;
  return (
    {
      ArrowUp: 'up',
      w: 'up',
      ArrowDown: 'down',
      s: 'down',
      ArrowLeft: 'left',
      a: 'left',
      ArrowRight: 'right',
      d: 'right'
    } as const
  )[k as 'w'];
}

/** The tile one step away. */
export function stepFrom([x, y]: [number, number], step: WalkStep): [number, number] {
  return step === 'up'
    ? [x, y - 1]
    : step === 'down'
      ? [x, y + 1]
      : step === 'left'
        ? [x - 1, y]
        : [x + 1, y];
}

export type Shop = 'coffee' | 'general' | 'workshop';

/** Each shop, the room it stands in on the town plan, and the one thing it is for. */
export const SHOPS: Record<Shop, { room: string; name: string; does: string }> = {
  coffee: {
    room: 'shop-coffee',
    name: 'Coffee Shop',
    does: 'Get to know each other. The barista learns what you are working on.'
  },
  general: {
    room: 'shop-general',
    name: 'General Store',
    does: 'Find what would make your day easier, and pick one next step.'
  },
  workshop: {
    room: 'shop-workshop',
    name: 'Workshop',
    does: 'Make something real with an Odd: a plan, a draft, a checklist.'
  }
};

export const SHOP_IDS = Object.keys(SHOPS) as Shop[];

/** The shop a town room belongs to, from a composed room id like `shop-coffee#2`. */
export function shopOfRoom(roomId: string): Shop | undefined {
  const room = roomId.split('#')[0];
  return SHOP_IDS.find((s) => SHOPS[s].room === room);
}

/**
 * The first session, in order: meeting Pip on Main Street, their boro
 * standing, their office manager hired (or an agent of their own brought in),
 * and that Odd's first task done.
 */
export type FirstStep = 'street' | 'boro' | 'team' | 'done';

/** Where a new owner got to. Kept on the owner row, so a reload or a return picks up there. */
export type TownState = {
  /** They got past Pip's hello. */
  welcomed?: boolean;
  /** They made their own Odd, the first thing Pip asks of them. */
  made?: boolean;
  /** How far the first session got. Unset is the street. */
  step?: FirstStep;
  /** Their boro: its name and look, once they have one. */
  boro?: { name: string; style: BoroStyle };
  /** The Odd whose first task the session waits on. */
  firstOdd?: string;
  /** How they chose to look around: with the guide, or on their own. Unset until they choose. */
  guide?: 'guided' | 'free';
  /** Shops they went into, in order, each once. */
  visited: Shop[];
  /** The shop they were last in. */
  at?: Shop;
  /** They opened the Main Street preview. */
  previewed?: boolean;
  /** Visits to the town so far. A new one starts after a long enough gap. */
  sessions: number;
  /** When the page last told the server the owner was here. */
  seenAt?: string;
};

export const NEW_TOWN: TownState = { visited: [], sessions: 0 };

/** Away this long, and coming back counts as a return visit. */
export const RETURN_AFTER_MS = 30 * 60_000;

/** The owner opened the town. Says whether it counts as a new visit, and how many came before. */
export function arrive(
  state: TownState | null | undefined,
  now: Date
): { state: TownState; firstEver: boolean; returning: boolean } {
  const s = state ?? NEW_TOWN;
  const firstEver = s.sessions === 0;
  const gap = s.seenAt ? now.getTime() - new Date(s.seenAt).getTime() : Infinity;
  const fresh = firstEver || gap >= RETURN_AFTER_MS;
  return {
    state: { ...s, sessions: fresh ? s.sessions + 1 : s.sessions, seenAt: now.toISOString() },
    firstEver,
    returning: fresh && !firstEver
  };
}

/** The owner walked into a shop. */
export function enter(state: TownState | null | undefined, shop: Shop): TownState {
  const s = state ?? NEW_TOWN;
  return { ...s, at: shop, visited: s.visited.includes(shop) ? s.visited : [...s.visited, shop] };
}

// What the office remembers about the owner

export type ContextKind =
  'fact' | 'goal' | 'preference' | 'project' | 'outcome' | 'feedback' | 'handoff';
export type ContextBasis = 'said' | 'observed' | 'inferred';
/** `proposed` waits on the owner's Remember. `replaced` is an older row a correction took over. */
export type ContextStatus = 'proposed' | 'kept' | 'replaced';

export const KIND_WORDS: Record<ContextKind, string> = {
  fact: 'About you',
  goal: 'A goal',
  preference: 'How you like things',
  project: 'A project',
  outcome: 'Something made',
  feedback: 'Your feedback',
  handoff: 'Passed along'
};

export const BASIS_WORDS: Record<ContextBasis, string> = {
  said: 'You said',
  observed: 'Seen',
  inferred: 'A guess'
};

export type Proposal = {
  kind: ContextKind;
  basis: ContextBasis;
  title: string;
  body?: string;
  confidence?: number;
};

/** A guess never counts for more than this. */
export const GUESS_CAP = 0.6;

/**
 * Things never guessed at. An Odd may keep one only when the owner said it
 * themselves, and even then only with their Remember.
 */
const SENSITIVE =
  /\b(health|medical|diagnos\w*|illness|disab\w*|pregnan\w*|therap\w*|medication|religio\w*|faith|church|mosque|synagogue|sexual\w*|gay|lesbian|transgender|politic\w*|vot(e|ed|er|ing)|ethnic\w*|race|immigra\w*|visa|criminal|arrest\w*|debt|salary|income|bank account|password|social security|ssn)\b/i;

/**
 * Why an Odd may not propose this, or undefined when it may. The owner turned
 * memory off, it is empty or too long, or it guesses at something sensitive.
 */
export function proposalProblem(p: Proposal, memoryOn: boolean): string | undefined {
  if (!memoryOn)
    return 'The owner turned memory off. Remember nothing; ask again when you need it.';
  const title = p.title.trim();
  if (!title) return 'Say what to remember in one line.';
  if (title.length > 160) return 'Keep it to one line, under 160 characters.';
  if ((p.body ?? '').length > 2000) return 'Keep the detail under 2000 characters.';
  if (p.kind === 'handoff') return 'Use hand_off to pass a brief to another Odd.';
  if (p.basis !== 'said' && SENSITIVE.test(`${title} ${p.body ?? ''}`))
    return 'Never guess at health, faith, politics, money, sexuality or other private things. Keep it only if the owner said it, as basis "said".';
  if (p.basis === 'inferred' && p.kind !== 'preference')
    return 'Only a preference may be a guess. Ask the owner instead, then save what they said.';
  return undefined;
}

/** How sure a row is: what the owner said is certain, a guess never more than GUESS_CAP. */
export function confidenceOf(p: Proposal): number {
  if (p.basis === 'said') return 1;
  const c = p.confidence ?? (p.basis === 'observed' ? 0.8 : 0.5);
  return Math.max(0, Math.min(p.basis === 'inferred' ? GUESS_CAP : 1, c));
}

/** A row as the prompt and the preview read it. */
export type ContextItem = {
  id: number;
  kind: ContextKind;
  basis: ContextBasis;
  status: ContextStatus;
  title: string;
  body: string;
  source: string;
  forStaffId: string | null;
  confidence: number;
  file: string | null;
};

/** What one Odd may read: kept rows for every Odd, and handoffs meant for it. */
export function visibleTo(items: ContextItem[], staffId: string): ContextItem[] {
  return items.filter(
    (c) => c.status === 'kept' && (c.forStaffId === null || c.forStaffId === staffId)
  );
}

/** The kept context as lines for an Odd's prompt, the owner's words apart from guesses. */
export function contextLines(items: ContextItem[], nameOf: (id: string) => string): string[] {
  const line = (c: ContextItem) =>
    `  - ${KIND_WORDS[c.kind]}: ${c.title}${c.body ? ` (${c.body})` : ''}${
      c.basis === 'said'
        ? ''
        : ` [${BASIS_WORDS[c.basis].toLowerCase()}, ${Math.round(c.confidence * 100)}% sure]`
    }`;
  const said = items.filter((c) => c.kind !== 'handoff');
  const briefs = items.filter((c) => c.kind === 'handoff');
  return [
    ...(said.length
      ? [`- What {owner} let the office remember:`, ...said.map(line)]
      : ['- {owner} has not let the office remember anything about them yet.']),
    ...briefs.map(
      (b) =>
        `- ${nameOf(b.source)} passed you this, with {owner}'s yes: ${b.title}${b.body ? `. ${b.body}` : ''}`
    )
  ];
}

// Counting the first visit, on this computer only

export type TownEvent =
  | 'pip_intro'
  | 'tour_chosen'
  | 'boro_chosen'
  | 'boro_arrived'
  | 'customized'
  | 'agent_create_attempt'
  | 'agent_import_attempt'
  | 'agent_ready'
  | 'first_task_started'
  | 'first_task_completed'
  | 'onboarding_abandoned'
  | 'town_arrived'
  | 'exploration_started'
  | 'shop_entered'
  | 'meaningful_interaction'
  | 'context_saved'
  | 'context_reused'
  | 'handoff_completed'
  | 'task_completed'
  | 'preview_opened'
  | 'main_street_created'
  | 'return_session';

export const EVENT_WORDS: Record<TownEvent, string> = {
  pip_intro: 'Met Pip',
  tour_chosen: 'Took the tour',
  boro_chosen: 'Went straight to their boro',
  boro_arrived: 'Arrived at their boro',
  customized: 'Made their boro their own',
  agent_create_attempt: 'Started hiring an office manager',
  agent_import_attempt: 'Tried bringing in their own agent',
  agent_ready: 'Got an Odd working',
  first_task_started: 'An Odd started its first task',
  first_task_completed: 'An Odd finished its first task',
  onboarding_abandoned: 'Left before their first Odd was working',
  town_arrived: 'Arrived in town',
  exploration_started: 'Started looking around',
  shop_entered: 'Went into a shop',
  meaningful_interaction: 'Got something useful from an Odd',
  context_saved: 'Let the office remember something',
  context_reused: 'An Odd used what it remembered',
  handoff_completed: 'An Odd passed work to another',
  task_completed: 'An Odd made something',
  preview_opened: 'Looked at their plot',
  main_street_created: 'Built their place',
  return_session: 'Came back'
};

/**
 * A meaningful interaction is one that left the owner with something: a fact
 * kept, a handoff they said yes to, or a thing an Odd made. Never a count of
 * messages.
 */
export function meaningful(e: TownEvent): boolean {
  return (
    e === 'context_saved' ||
    e === 'handoff_completed' ||
    e === 'task_completed' ||
    e === 'first_task_completed'
  );
}

// The Main Street preview

export type Townsperson = { id: string; name: string; shop: Shop; remit: string };

export type Suggestion = {
  id: string;
  name: string;
  shop: Shop;
  /** Bring them to Main Street unless the owner says otherwise. */
  keep: boolean;
  /** Why, in the owner's terms. */
  reason: string;
};

/**
 * Which townsfolk to bring to Main Street, and why: what the owner did with
 * each of them and what they said they are working on. Someone they never met
 * is offered, unticked, so nothing is forced on them.
 */
export function suggest(folk: Townsperson[], kept: ContextItem[], visited: Shop[]): Suggestion[] {
  const aim = kept.find((c) => c.kind === 'goal' || c.kind === 'project');
  return folk.map((p) => {
    const made = kept.find((c) => c.kind === 'outcome' && c.source === p.id);
    const learned = kept.filter(
      (c) => c.source === p.id && c.kind !== 'outcome' && c.kind !== 'handoff'
    ).length;
    const met = visited.includes(p.shop);
    const reason = made
      ? `You made "${made.title}" together. ${p.name} can keep going on it.`
      : p.shop === 'workshop' && aim
        ? `You are working on ${aim.title.replace(/\.$/, '')}. ${p.name} can help make it real.`
        : learned
          ? `${p.name} already knows ${learned === 1 ? 'one thing' : `${learned} things`} you shared, so you will not repeat yourself.`
          : met
            ? `You met ${p.name}. ${p.remit}`
            : `You have not met ${p.name} yet. ${p.remit}`;
    return {
      id: p.id,
      name: p.name,
      shop: p.shop,
      keep: !!(made || learned || (met && aim)),
      reason
    };
  });
}

// What each shop asks: one quick question, answered with a tap. Each answer is
// something the owner said, so it is kept as said, shows in What Oddboro
// knows, and shapes the office manager they hire.

export type Answer = {
  id: string;
  /** The button. */
  label: string;
  /** What is kept, in the owner's terms. */
  keep: string;
  /** What the character says back. */
  reply: string;
};
export type ShopQuestion = {
  shop: Shop;
  /** Who asks, and how they open. */
  who: string;
  hello: string;
  ask: string;
  kind: 'preference' | 'goal' | 'project';
  answers: Answer[];
};

export const QUESTIONS: Record<Shop, ShopQuestion> = {
  coffee: {
    shop: 'coffee',
    who: 'Juno',
    hello: "Oh hi! New in town? I'm Juno. Coffee's on me.",
    ask: 'Quick question. Are you the kind of person who likes the whole story, or do you want people to get straight to the point?',
    kind: 'preference',
    answers: [
      {
        id: 'short',
        label: 'Straight to the point',
        keep: 'Likes it short and straight to the point',
        reply: "Got it. Short and sweet. I'll pass that along to whoever works with you."
      },
      {
        id: 'story',
        label: 'The whole story',
        keep: 'Likes the whole story, with the reasons',
        reply: 'A details person! Me too. Your Odds will walk you through the why.'
      },
      {
        id: 'depends',
        label: 'Depends on the day',
        keep: 'Wants the short version first, with detail on request',
        reply: "Headline first, details if you ask. Smart. I'll remember that."
      }
    ]
  },
  general: {
    shop: 'general',
    who: 'Theo',
    hello: "Welcome to the General Store! I'm Theo. Everything you need, nothing you don't.",
    ask: 'So what would make your day easier?',
    kind: 'goal',
    answers: [
      {
        id: 'projects',
        label: 'Keeping my projects organized',
        keep: 'Wants help keeping projects organized',
        reply: 'An Office Manager is great at that. Keeps a map of everything in flight.'
      },
      {
        id: 'tasks',
        label: 'Not dropping tasks',
        keep: 'Wants help keeping track of tasks',
        reply: 'Nothing slips past a good Odd. They keep the list so you do not have to.'
      },
      {
        id: 'team',
        label: 'Running a team of agents',
        keep: 'Wants help coordinating a team of agents',
        reply: "Then you'll want a manager who hires and coordinates. You came to the right town."
      },
      {
        id: 'build',
        label: 'Building something new',
        keep: 'Is building something new and wants help getting it started',
        reply: 'Oh, a builder! Pop into the Workshop next door. Ada will love you.'
      }
    ]
  },
  workshop: {
    shop: 'workshop',
    who: 'Ada',
    hello:
      "Hey, I'm Ada. This is where Odds make things: plans, drafts, checklists, research notes. Real files you can open and use.",
    ask: "What's the first thing you'd want an Odd to make for you?",
    kind: 'project',
    answers: [
      {
        id: 'plan',
        label: 'A plan for a project',
        keep: 'Wants a plan for a project first',
        reply:
          'Plans are my favorite. Tell your manager what the project is and they will draft one.'
      },
      {
        id: 'draft',
        label: 'A draft I keep putting off',
        keep: 'Wants help drafting something they keep putting off',
        reply: 'The blank page is the worst part. An Odd will get you a first draft to react to.'
      },
      {
        id: 'checklist',
        label: 'A checklist for my week',
        keep: 'Wants a checklist for the week',
        reply: 'A good list is half the work. Your manager can keep it up to date too.'
      },
      {
        id: 'research',
        label: 'Research on a question',
        keep: 'Wants research notes on a question',
        reply:
          'Your Odds read what you give them and write it up. For the web, you connect a tool first.'
      }
    ]
  }
};

/** Where an answer is kept: one per shop, so answering again replaces it. */
export const answerSource = (shop: Shop) => `town:${shop}`;

/** The answer an owner gave in a shop, by its kept words. */
export function answerOf(shop: Shop, kept: string): Answer | undefined {
  return QUESTIONS[shop].answers.find((a) => a.keep === kept);
}

// Their boro

export type BoroStyle = 'village' | 'studio' | 'menlo' | 'campus';

/**
 * The looks a boro can take, each built from the library at once with no
 * drawing. A look the library lacks, like neon or a castle, is a change the
 * owner describes later in the Office window.
 */
export const STYLES: Record<
  BoroStyle,
  { name: string; says: string; spec: Pick<OfficeSpec, 'wall' | 'floor' | 'grounds' | 'plants'> }
> = {
  village: {
    name: 'Cozy village',
    says: 'Brick, oak floors and a garden all around.',
    spec: { wall: 'brick', floor: 'oak', grounds: 'park', plants: 'lots' }
  },
  studio: {
    name: 'Creative studio',
    says: 'Bright teal walls, soft carpet, a wild meadow.',
    spec: { wall: 'teal', floor: 'carpet', grounds: 'meadow', plants: 'some' }
  },
  menlo: {
    name: 'Menlo Park tech',
    says: 'Clean plaster, warm wood, a campus green.',
    spec: { wall: 'plaster', floor: 'oak', grounds: 'park', plants: 'some' }
  },
  campus: {
    name: 'Futuristic campus',
    says: 'Cool tile and rubber floors in the woods.',
    spec: { wall: 'plaster', floor: 'tile', grounds: 'woods', plants: 'few' }
  }
};
export const STYLE_IDS = Object.keys(STYLES) as BoroStyle[];

/** A boro's name: theirs, or one from their own. */
export function boroName(name: string, owner: string): string {
  const n = name.replace(/\s+/g, ' ').trim().slice(0, 40);
  if (n) return n;
  return owner.trim() ? `${owner.trim().split(' ')[0]}'s Boro` : 'My Boro';
}

/**
 * A new boro: one small building, room to grow. Their office, a workroom for
 * the first Odds, and a front room with their name on it.
 */
export function starterSpec(name: string, style: BoroStyle): OfficeSpec {
  return {
    name,
    ...STYLES[style].spec,
    rooms: [
      { kind: 'office', name: 'Your office', size: 'small' },
      { kind: 'lobby', name, size: 'small' },
      { kind: 'workspace', name: 'Workroom', size: 'small', seats: 2 }
    ]
  };
}

// Hiring the office manager

export const RESPONSIBILITIES = [
  {
    id: 'projects',
    label: 'Keep a map of my projects',
    line: 'Keep a running map of every project and where each stands.'
  },
  {
    id: 'tasks',
    label: 'Track tasks I need to finish',
    line: 'Keep the list of what {owner} has to finish, and nudge them about what is due.'
  },
  {
    id: 'report',
    label: 'A short report every morning',
    line: 'Write a short report every morning: what moved, what is stuck, what is next.'
  },
  {
    id: 'team',
    label: 'Hire and coordinate other Odds',
    line: 'Propose new Odds when work needs one, and keep the team pointed at the same goals.'
  },
  {
    id: 'build',
    label: 'Help me start what I am building',
    line: 'Help {owner} get started on what they are building: plans, first drafts, next steps.'
  }
] as const;
export type Responsibility = (typeof RESPONSIBILITIES)[number]['id'];

/** What a General Store answer recommends the manager takes on. */
export function recommended(goal: string | undefined): Responsibility[] {
  const id = goal && QUESTIONS.general.answers.find((a) => a.keep === goal)?.id;
  const first: Responsibility =
    id === 'tasks' ? 'tasks' : id === 'team' ? 'team' : id === 'build' ? 'build' : 'projects';
  return [...new Set<Responsibility>([first, 'report'])];
}

export const COMMS = [
  {
    id: 'short',
    label: 'Short and to the point',
    line: 'Keep every message short: the answer first, then stop.'
  },
  {
    id: 'story',
    label: 'The whole story',
    line: 'Give {owner} the full picture: what, why, and what you considered.'
  },
  {
    id: 'depends',
    label: 'Headline first, details if I ask',
    line: 'Lead with a one-line headline, then offer the detail.'
  }
] as const;
export type Comms = (typeof COMMS)[number]['id'];

/** The way of talking a Coffee Shop answer asked for. */
export function commsOf(pref: string | undefined): Comms {
  const id = pref && QUESTIONS.coffee.answers.find((a) => a.keep === pref)?.id;
  return id === 'story' ? 'story' : id === 'depends' ? 'depends' : 'short';
}

/**
 * First assignments a manager can do on day one with only what every new Odd
 * has: its own folder and the office's tools. Each ends in a file the owner
 * can open.
 */
export const ASSIGNMENTS = [
  {
    id: 'projects',
    label: 'Help me organize my projects',
    task: 'Help {owner} organize their projects. From what the office knows about them, write a project map to made/projects.md: each project, where it stands, and the next step. Mark what you had to guess, and end with the three questions that would make it accurate.'
  },
  {
    id: 'tasks',
    label: 'Keep track of tasks I need to finish',
    task: 'Start a task list for {owner} at made/tasks.md, from what the office knows about them: what to do this week, grouped by project, with what you would do first. End with the questions that would fill it in.'
  },
  {
    id: 'team',
    label: 'Help me coordinate other agents',
    task: 'Plan the team {owner} needs. Write made/team-plan.md: the Odds you would hire first and why, what each would own, and how you would coordinate them. Propose the first hire with propose_hire when it is clear.'
  },
  {
    id: 'build',
    label: "Help me get started on something I'm building",
    task: 'Help {owner} get started on what they are building. Write made/getting-started.md: what you understand they are building, a first plan in steps, and the one thing to do today. End with your questions.'
  }
] as const;
export type AssignmentId = (typeof ASSIGNMENTS)[number]['id'];

/** The first assignment a Workshop or General Store answer points to. */
export function suggestedAssignment(
  goal: string | undefined,
  project: string | undefined
): AssignmentId {
  const g = goal && QUESTIONS.general.answers.find((a) => a.keep === goal)?.id;
  if (g === 'tasks' || g === 'team' || g === 'build' || g === 'projects') return g;
  const p = project && QUESTIONS.workshop.answers.find((a) => a.keep === project)?.id;
  return p === 'checklist' ? 'tasks' : p === 'plan' ? 'projects' : 'build';
}

// Bringing an agent of their own

/** An agent as its definition file describes it, and what Oddboro can take of it. */
export type ImportedAgent = {
  name: string;
  description: string;
  instructions: string;
  /** Tools it names, which Oddboro does not carry over. */
  tools: string[];
  model?: string;
};

/**
 * A Claude Code agent file (front matter with name, description, tools and
 * model, then its instructions), or pasted instructions with a name. Nothing
 * when there is nothing to run on.
 */
export function readAgentFile(text: string, fallbackName = ''): ImportedAgent | undefined {
  const src = text.replace(/\r\n/g, '\n').trim();
  const fm = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(src);
  const field = (k: string) =>
    fm
      ? new RegExp(`^${k}:\\s*(.*)$`, 'm')
          .exec(fm[1])?.[1]
          ?.trim()
          .replace(/^["']|["']$/g, '')
      : undefined;
  const instructions = (fm ? fm[2] : src).trim().slice(0, 20000);
  const name = (field('name') || fallbackName)
    .replace(/[^\p{L}\p{N} ._-]/gu, '')
    .trim()
    .slice(0, 40);
  if (!instructions || !name) return undefined;
  const tools = (field('tools') ?? '')
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((t) => t.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
  const model = field('model');
  return {
    name,
    description: (field('description') ?? '').slice(0, 300),
    instructions,
    tools,
    ...(model ? { model } : {})
  };
}

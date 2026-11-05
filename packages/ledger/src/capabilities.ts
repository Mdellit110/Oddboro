// What one Odd can do: its level, the tool its runs go through, what that
// tool's own tools reach (Run commands, Browse the web, the folders the owner
// gave it), the office tools the owner gave it, and each outside tool it was
// granted, with whether a run gets that tool and why not. A run loads its
// tools from this, my_access shows it, office_report shows it for every Odd,
// and the owner's Access tab shows it, so all of them see the same thing. The
// one gap is a hosted sign-in that ran out: only the run's fresh token shows
// it. The run tells its own my_access (SIGNED_OUT), but office_report and the
// Access tab, read outside any run, cannot know.
import { existsSync } from 'node:fs';
import {
  FOLDER_SAID,
  GRANT_LABEL,
  LEVEL_NAME,
  levelAtMost,
  parseLevel,
  type Level
} from './access-words.ts';
import {
  AGENT_NAMES,
  commandsOnline,
  FETCHES_PAGES,
  runsCommands,
  type Agent,
  type GrantedFolder
} from './agents.ts';
import { grantsFor, type ConnectorRow, type GrantRow, type StaffRow } from './office.ts';
import { hasTool, OFFICE_TOOLS } from './tools.ts';

/**
 * Why a run leaves out a tool the Odd was granted. A run adds
 * 'sign-in ran out' itself, since only a fresh token shows it.
 */
export type HeldBack = 'above its level' | 'still connecting' | 'sign-in ran out';

export type Access = {
  connector: ConnectorRow;
  level: Level;
  heldBack?: HeldBack;
};

/** What a run's own tools reach: worked out from the staff row and the system, never stored. */
export type OwnTools = {
  /** A shell: the Run commands switch as its tool takes it (`runsCommands`). */
  commands: boolean;
  /** The Browse the web switch. */
  web: boolean;
  /** Whether its commands reach the internet (`commandsOnline`). */
  network: boolean;
  /** The folders the owner gave it that are still on the disk. */
  granted: GrantedFolder[];
};

/** The owner's switches and folders as the Odd's tool takes them on `platform`. */
export function ownTools(
  who: Pick<StaffRow, 'agent' | 'commands' | 'web' | 'folders'>,
  platform: NodeJS.Platform
): OwnTools {
  return {
    commands: runsCommands(who.agent, platform, who.commands),
    web: who.web,
    network: commandsOnline(who.agent, platform, who),
    // A folder deleted since the owner gave it reaches no tool.
    granted: who.folders.filter((f) => existsSync(f.path))
  };
}

export type Capabilities = {
  level: Level;
  remit: string;
  /** The office tools held beyond the ones every Odd has, by id. */
  office: string[];
  outside: Access[];
  /** The tool its runs go through. */
  agent: Agent;
  own: OwnTools;
};

export async function capabilities(who: StaffRow): Promise<Capabilities> {
  return {
    level: who.permission,
    remit: who.remit,
    office: OFFICE_TOOLS.filter((t) => !t.always && who.tools.includes(t.id)).map((t) => t.id),
    outside: (await grantsFor(who.id)).map((g) => accessOf(g, who.permission)),
    agent: who.agent,
    own: ownTools(who, process.platform)
  };
}

/** One grant as a run finds it: what it reaches, or why it is held back. */
export function accessOf(g: GrantRow & { connector: ConnectorRow }, permission: Level): Access {
  const heldBack: HeldBack | undefined = !levelAtMost(g.level, permission)
    ? 'above its level'
    : g.connector.readyAt
      ? undefined
      : 'still connecting';
  return { connector: g.connector, level: g.level, heldBack };
}

/**
 * What a run below the Odd's own level can do (a hand-off's, either side, or
 * a hub's pick-up): its level is `ceiling`, and a grant above it that the run
 * still loads comes down to read, since a grant is only read or act. A grant
 * already held back stays as it is. Its own tools stay as they are: a
 * handed-over run keeps the Odd's Run commands, Browse the web and folders,
 * so it can still do the work; only outside tools come down. The run's tools,
 * its prompt and its my_access all read this, so they say the same.
 */
export function capped(caps: Capabilities, ceiling: Level): Capabilities {
  return {
    ...caps,
    level: ceiling,
    outside: caps.outside.map((a) =>
      a.heldBack || levelAtMost(a.level, ceiling) ? a : { ...a, level: 'read' }
    )
  };
}

/** What the Odd reads when this office keeps its commands off the internet (`NETWORK_HELD`). */
export const NETWORK_HELD_LINE =
  'This version of Claude Code refuses to let your commands reach the internet, so they have none.';

/**
 * What my_access says in one run: the Odd's access as that run holds it. Only
 * the run knows three things, so the office passes them in its environment:
 * its ceiling (`CEILING`), set when it is below the Odd's own level, the
 * sign-ins that ran out (`SIGNED_OUT`), and whether a Claude Code that refused
 * the open network keeps its commands off the internet (`NETWORK_HELD`).
 */
export function accessInRun(
  own: Capabilities,
  owner: string,
  env: Record<string, string | undefined>
): string {
  const ceiling = parseLevel(env.CEILING);
  const caps = ceiling ? capped(own, ceiling) : own;
  // Said only when the hold took away a network the run would have had.
  const held = env.NETWORK_HELD === '1' && caps.own.network;
  const tools = held ? { ...caps.own, network: false } : caps.own;
  const folders = folderLines(caps.own);
  const signedOut = (env.SIGNED_OUT ?? '').split(',');
  const outside = caps.outside.map((a) =>
    !a.heldBack && signedOut.includes(a.connector.id)
      ? { ...a, heldBack: 'sign-in ran out' as const }
      : a
  );
  const lines = outsideLines({ ...caps, outside }, owner);
  return [
    levelLine(caps.level, owner),
    ...(ceiling
      ? [
          `This run was started by a colleague or by the office, not by ${owner}'s yes, so it works at ${LEVEL_NAME[ceiling]} at most.`
        ]
      : []),
    `Your runs go through ${AGENT_NAMES[caps.agent]}.`,
    ownToolsLine(caps.agent, tools).replaceAll('{owner}', owner),
    ...(held ? [NETWORK_HELD_LINE] : []),
    ...(folders.length
      ? [`Folders ${owner} gave you:`, ...folders.map((l) => `- ${l}`)]
      : [`${owner} has given you no folders.`]),
    lines.length
      ? lines.map((l, i) => `- (id: ${outside[i].connector.id}) ${l}`).join('\n')
      : `${owner} has connected no outside tools for you yet.`
  ].join('\n');
}

/** How many tools a grant reaches, in words: every tool at write, else the read-only ones. */
export function reachOf(a: Access): string {
  const n = a.connector.readTools.length;
  return a.level === 'act' ? 'every tool' : `${n} ${n === 1 ? 'tool' : 'tools'}`;
}

/** One line per outside tool, in words that suit both the Odd and the Office Manager. */
export function outsideLines(c: Capabilities, owner: string): string[] {
  return c.outside.map((a) => {
    const what = `${a.connector.name} (${GRANT_LABEL[a.level === 'act' ? 'act' : 'read'].toLowerCase()})`;
    switch (a.heldBack) {
      case 'above its level':
        return `${what}: held back. It needs the ${LEVEL_NAME[a.level]} level, and the current level is ${LEVEL_NAME[c.level]}. It works again once ${owner} raises the level.`;
      case 'still connecting':
        return `${what}: held back until ${owner} finishes connecting it.`;
      case 'sign-in ran out':
        return `${what}: held back. Its sign-in ran out, and ${owner} needs to sign in again.`;
      case undefined:
        return `${what}: ${reachOf(a)}.`;
    }
  });
}

/** The Odd's level, said to the Odd. */
export function levelLine(level: Level, owner: string): string {
  return {
    read: 'Your level is Read: you look and report. You change nothing outside the office.',
    draft: `Your level is Draft: you prepare things for ${owner}'s yes, drafts included. Nothing you make goes out until they say yes.`,
    act: `Your level is Act: you do housekeeping inside the office on your own, and use a tool ${owner} connected for you at read and write without asking each time.`
  }[level];
}

/**
 * What a run's own tools reach, as the Odd is told it: file tools always, a
 * shell when the run gets commands, which its tool's sandbox holds to its
 * folders and {owner}'s developer tools, read only, and to the internet only
 * when `network` says so, and the tool's own web search (and page fetch, where
 * it has one) when the owner switched Browse the web on. Gemini's policy
 * allows a write only by its full path. `{owner}` is left for the caller to fill.
 */
export function ownToolsLine(
  agent: Agent,
  own: Pick<OwnTools, 'commands' | 'web' | 'network'>
): string {
  const shell = `a shell confined to your folders and {owner}'s developer tools (read only), ${own.network ? 'which can reach the internet' : 'with no network'}`;
  const plus = [
    ...(own.commands ? [shell] : []),
    ...(own.web ? [FETCHES_PAGES[agent] ? 'web search and fetch' : 'web search'] : [])
  ];
  const line = plus.length
    ? [
        `Your own tools work on files, plus ${plus.join(', and ')}.`,
        ...(own.commands ? [] : ['No shell.']),
        ...(own.web ? [] : ['No web.'])
      ].join(' ')
    : 'Your own tools work on files only: no shell and no web.';
  return agent === 'gemini' ? `${line} Give each file tool the file's full path.` : line;
}

/** One line per folder the owner gave the Odd: its path and what the Odd may do there. */
export function folderLines(own: Pick<OwnTools, 'granted'>): string[] {
  return own.granted.map((f) => `${f.path} (${FOLDER_SAID[f.write ? 'write' : 'read']})`);
}

/**
 * Whether a run may hand work on (`tool`), and whether it is told the threads
 * it leads (`leads`): one rule for the prompt and the tool server. A
 * colleague's run on a hand-off cannot hand on, so a thread stays hub and
 * spoke, and neither can a run that only reads the owner's words for a
 * lesson. A run on a thread hands on in that one, so only a run on none is
 * told the threads it leads.
 */
export function handsOff(
  tools: readonly string[],
  run: { thread: boolean; handOff: boolean; lesson: boolean }
): { tool: boolean; leads: boolean } {
  const tool = hasTool(tools, 'hand_off') && !run.handOff && !run.lesson;
  return { tool, leads: tool && !run.thread };
}

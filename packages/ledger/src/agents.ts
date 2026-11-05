// The coding tools an Odd can run on, the systems each is offered on, and
// whether each may run commands. The hire drawer and the Access tab read it,
// so this file imports nothing: safe to import in the browser.

/** The coding tools an Odd can run on. Each is also the command the office starts. */
export const AGENTS = ['claude', 'grok', 'codex', 'gemini'] as const;
export type Agent = (typeof AGENTS)[number];
/** What the owner reads for each. */
export const AGENT_NAMES: Record<Agent, string> = {
  claude: 'Claude Code',
  grok: 'Grok',
  codex: 'Codex',
  gemini: 'Gemini'
};
/**
 * Per tool, the systems it is offered on (`runs`: only where its sandbox was
 * probed on a made-up home and held) and the systems where its Run commands
 * switch follows the owner (`commands`: only where its sandbox held commands
 * to the Odd's folders). `commands` lies within `runs`. Grok's and Codex's
 * sandboxes were probed on a Mac only, so a Windows office offers Claude Code
 * alone. Gemini's walls are proved against its own policy engine but not yet
 * in a live run, so it is offered nowhere until that run holds on a Mac; then
 * its `runs` gains 'darwin'. Codex's `commands` is empty: it reads files
 * through its commands, so it always has them where it runs, and has no
 * switch to follow.
 */
export const AGENT_PLATFORMS: Record<
  Agent,
  { runs: readonly NodeJS.Platform[]; commands: readonly NodeJS.Platform[] }
> = {
  claude: { runs: ['darwin', 'linux', 'win32'], commands: ['darwin'] },
  grok: { runs: ['darwin'], commands: [] },
  codex: { runs: ['darwin'], commands: [] },
  gemini: { runs: [], commands: [] }
};
/** The tools an Odd may be hired on or moved to on `platform`. */
export const agentsOn = (platform: NodeJS.Platform): Agent[] =>
  AGENTS.filter((a) => AGENT_PLATFORMS[a].runs.includes(platform));
/** `v` when it names a tool offered on `platform`, for a hire or a move the owner asked for. */
export const offeredAgent = (v: unknown, platform: NodeJS.Platform): Agent | undefined =>
  agentsOn(platform).find((a) => a === v);

/**
 * How the Run commands switch reaches each coding tool, on this system:
 * `switch` follows the owner's choice, `always` is on whatever it says, and
 * `never` is off whatever it says. `why` is the line the page shows under a
 * switch the owner cannot move. Under a switch locked off, `offer` is the tool
 * on this system that follows it, when there is one.
 */
export type CommandsHow =
  | { state: 'switch' }
  | { state: 'always'; why: string }
  | { state: 'never'; why: string; offer?: Agent };

/** Why each tool's Run commands is fixed, as the owner reads it. */
export const COMMANDS_WHY: Record<Agent, string> = {
  // Claude Code's sandbox was measured on a Mac only.
  claude: 'Not tested on this system yet.',
  codex: 'Codex reads files through its commands.',
  // Grok's sandbox blocks a command's network on Linux only, so its sign-in could leave the Mac.
  grok: "Grok can't keep commands off the network on a Mac.",
  gemini: 'Not tested with Gemini yet.'
};

/**
 * Whether an Odd on `agent` may run commands on `platform`. A tool follows the
 * switch where `AGENT_PLATFORMS` says its commands do: Claude Code on a Mac,
 * where its sandbox held commands to the Odd's folders. Codex has no file tool
 * but its shell, so it always has one; Grok and Gemini never do. The offer is
 * read from the table, never from this function, so it ends after one pass.
 */
export function commandsHow(agent: Agent, platform: NodeJS.Platform): CommandsHow {
  if (agent === 'codex') return { state: 'always', why: COMMANDS_WHY.codex };
  if (AGENT_PLATFORMS[agent].commands.includes(platform)) return { state: 'switch' };
  const offer = agentsOn(platform).find(
    (a) => a !== agent && AGENT_PLATFORMS[a].commands.includes(platform)
  );
  return { state: 'never', why: COMMANDS_WHY[agent], ...(offer ? { offer } : {}) };
}

/** Whether a run gets a shell: the owner's stored switch, as its tool takes it. */
export function runsCommands(agent: Agent, platform: NodeJS.Platform, stored: boolean): boolean {
  const how = commandsHow(agent, platform);
  return how.state === 'always' || (how.state === 'switch' && stored);
}

/**
 * Whether a tool's commands may reach the internet when Browse the web is on:
 * only where its file walls were measured holding with the network open
 * (Claude Code 2.1.318 and Codex 0.166). Grok and Gemini run no commands.
 */
export const NETWORK_WITH_WEB: Record<Agent, boolean> = {
  claude: true,
  codex: true,
  grok: false,
  gemini: false
};

/** Whether a run's commands reach the internet: commands, Browse the web, and a tool that holds its walls open. */
export function commandsOnline(
  agent: Agent,
  platform: NodeJS.Platform,
  s: { commands: boolean; web: boolean }
): boolean {
  return runsCommands(agent, platform, s.commands) && s.web && NETWORK_WITH_WEB[agent];
}

/**
 * Whether a tool's web reads pages as well as searching. Codex's web search is
 * on or off, with no page fetch beside it, so its Odds are told web search only.
 */
export const FETCHES_PAGES: Record<Agent, boolean> = {
  claude: true,
  grok: true,
  codex: false,
  gemini: true
};

/**
 * The line under Browse the web, by what its commands do with it. `held`: this
 * office met a Claude Code that refused the open network, so its commands
 * stay off the internet until the office restarts.
 */
export function webLine(agent: Agent, platform: NodeJS.Platform, held: boolean): string {
  const how = commandsHow(agent, platform).state;
  const web = FETCHES_PAGES[agent] ? 'Search and read web pages.' : 'Search the web.';
  if (how === 'never') return web;
  if (held) return `${web} This version of Claude Code keeps its commands off the internet.`;
  if (!NETWORK_WITH_WEB[agent])
    return `${web} ${AGENT_NAMES[agent]}'s commands stay off the internet.`;
  return how === 'always'
    ? `${web} Its commands can reach the internet too.`
    : `${web} With Run commands on, its commands can reach the internet too.`;
}

/** A folder outside the office the owner lets an Odd read, or read and change (`write`), by its real path. */
export type GrantedFolder = { path: string; write: boolean };

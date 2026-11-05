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
 * The systems each is offered on: only where its sandbox was probed on a
 * made-up home and held. Grok's and Codex's were probed on a Mac only, so a
 * Windows office offers Claude Code alone.
 * Gemini's walls are proved against its own policy engine but not yet in a
 * live run, so it is offered nowhere until that run holds on a Mac; then its
 * list gains 'darwin'.
 */
export const AGENT_PLATFORMS: Record<Agent, readonly NodeJS.Platform[]> = {
  claude: ['darwin', 'linux', 'win32'],
  grok: ['darwin'],
  codex: ['darwin'],
  gemini: []
};
/** The tools an Odd may be hired on or moved to on `platform`. */
export const agentsOn = (platform: NodeJS.Platform): Agent[] =>
  AGENTS.filter((a) => AGENT_PLATFORMS[a].includes(platform));
/** `v` when it names a tool offered on `platform`, for a hire or a move the owner asked for. */
export const offeredAgent = (v: unknown, platform: NodeJS.Platform): Agent | undefined =>
  agentsOn(platform).find((a) => a === v);

/**
 * How the Run commands switch reaches each coding tool, on this system:
 * `switch` follows the owner's choice, `always` is on whatever it says, and
 * `never` is off whatever it says. `why` is the line the page shows under a
 * switch the owner cannot move.
 */
export type CommandsHow = { state: 'switch' | 'always' | 'never'; why?: string };

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
 * Whether an Odd on `agent` may run commands on `platform`. Only Claude Code
 * on a Mac follows the switch: its sandbox held commands to the Odd's folders
 * with no network there. Codex has no file tool but its shell, so it always
 * has one; Grok and Gemini never do.
 */
export function commandsHow(agent: Agent, platform: NodeJS.Platform): CommandsHow {
  if (agent === 'claude' && platform === 'darwin') return { state: 'switch' };
  return { state: agent === 'codex' ? 'always' : 'never', why: COMMANDS_WHY[agent] };
}

/** A folder outside the office the owner lets an Odd read, or read and change (`write`), by its real path. */
export type GrantedFolder = { path: string; write: boolean };

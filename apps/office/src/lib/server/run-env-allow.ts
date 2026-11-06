// What an Odd's run gets of the office's own environment: only the names
// listed here, never everything less a few. A variable the office picks up
// later (a token, a database's address, a setting of the owner's shell)
// reaches no run until it is listed. Owner-side launches (a sign-in, an
// install, a version check) start from `cleanEnv` or `vendorEnv` instead,
// since the owner's own tools may need what a run never should. What the
// office tells a run's tool server about the run itself is run-env.ts.
import { currentPlatform, type Agent } from '@oddboro/ledger';

type Names = readonly (string | RegExp)[];

/** The proxy settings, in both cases, since tools read either. */
const PROXY = ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY'].flatMap((n) => [
  n,
  n.toLowerCase()
]);

/**
 * The office's variables a run may get. `all` on every system, then the
 * system's own, then the run's tool's own. A name is matched exactly, or by
 * its pattern; on Windows, whose variables ignore case, without regard to case.
 */
export const RUN_ENV_ALLOW: {
  all: Names;
  darwin: Names;
  linux: Names;
  win32: Names;
  tool: Record<Agent, Names>;
} = {
  all: [
    'PATH',
    'HOME',
    'LANG',
    'LANGUAGE',
    /^LC_/,
    ...PROXY,
    // An owner behind a proxy that inspects traffic trusts its certificate through these.
    'NODE_EXTRA_CA_CERTS',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
    // Where an owner who moved them keeps each tool's own files. Every run
    // got them before this list, and Claude Code reads its config from
    // XDG_CONFIG_HOME (`gitEnv` says so), so they stay until a run without
    // them is measured working on each system.
    'XDG_CONFIG_HOME',
    'XDG_DATA_HOME',
    'XDG_STATE_HOME',
    'XDG_CACHE_HOME'
  ],
  darwin: ['USER', 'LOGNAME', 'SHELL', 'TMPDIR'],
  // XDG_RUNTIME_DIR is the owner's own runtime folder on Linux, kept as above.
  linux: ['USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'XDG_RUNTIME_DIR'],
  win32: [
    'SystemRoot',
    'SYSTEMDRIVE',
    'windir',
    'USERPROFILE',
    'HOMEDRIVE',
    'HOMEPATH',
    'APPDATA',
    'LOCALAPPDATA',
    'PATHEXT',
    'ComSpec',
    'TEMP',
    'TMP',
    'ProgramFiles',
    'ProgramFiles(x86)',
    'ProgramData',
    'USERNAME',
    'PROCESSOR_ARCHITECTURE'
  ],
  tool: {
    // The owner's Anthropic settings, as before the list: `staffEnv` then
    // removes the key, or sets the one the owner gave the office.
    claude: [/^ANTHROPIC_/],
    // Each of these gets its own home and settings from its launch, and none
    // of the office's own: those could point it at the owner's home or key.
    codex: [],
    grok: [],
    gemini: []
  }
};

/** Whether `name` is one of `names`, on `platform`. */
function listed(name: string, names: Names, platform: NodeJS.Platform): boolean {
  const anyCase = platform === 'win32';
  return names.some((n) =>
    typeof n !== 'string'
      ? new RegExp(n.source, anyCase ? 'i' : '').test(name)
      : anyCase
        ? n.toLowerCase() === name.toLowerCase()
        : n === name
  );
}

/**
 * The environment an Odd's run of `agent` starts from on this system: the
 * office's own variables that `RUN_ENV_ALLOW` lists, and two that keep the
 * owner's own CLAUDE.md files and Claude Code's auto-memory out of every run
 * (`cleanEnv` says why). Each launch then sets its tool's own variables.
 */
export function runEnv(agent: Agent): NodeJS.ProcessEnv {
  const platform = currentPlatform();
  const allowed = [
    ...RUN_ENV_ALLOW.all,
    ...(platform === 'darwin' || platform === 'linux' || platform === 'win32'
      ? RUN_ENV_ALLOW[platform]
      : []),
    ...RUN_ENV_ALLOW.tool[agent]
  ];
  const env: NodeJS.ProcessEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => listed(k, allowed, platform))
  );
  env.CLAUDE_CODE_DISABLE_CLAUDE_MDS = '1';
  env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = '1';
  return env;
}

/**
 * Every variable the office's tool server (`mcp.ts` in the ledger, and what
 * it imports) reads as it starts, besides those its entry sets for the run:
 * where the office lives, its ports and database, Ollama, the office's own
 * settings from .env, and the folders the system names. The office passes
 * the ones it has on the server's entry, so the server never depends on what
 * the AI tool between them passes on, and never on opening .env, which
 * Grok's sandbox will not. `LOCALAPPDATA` is set on Windows only.
 */
export const TOOL_SERVER_ENV = [
  'ODDBORO_HOME',
  'ODDBORO_CODE',
  'ODDBORO_DB_PORT',
  'ODDBORO_PORT',
  'ODDBORO_APP',
  'ODDBORO_ENV',
  'ODDBORO_LOCAL_DB',
  'OLLAMA_URL',
  'OFFICE_TIME_ZONE',
  'OFFICE_AGENT',
  'XDG_STATE_HOME',
  'XDG_CONFIG_HOME',
  'PATH',
  'HOME',
  'LOCALAPPDATA'
] as const;

/** The `TOOL_SERVER_ENV` variables the office has set, for the tool server's entry. */
export const toolServerEnv = (): Record<string, string> =>
  Object.fromEntries(
    TOOL_SERVER_ENV.flatMap((k) => (process.env[k] ? [[k, process.env[k] as string]] : []))
  );

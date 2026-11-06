// The system's own paths each tool's sandbox names, per system. Only the
// Mac's are measured, so only the Mac has an entry: a tool that sandboxes on
// another system fails `sandbox-paths.test.ts` until that system's paths are
// declared here, instead of running there with a Mac's.
import { currentPlatform } from '@oddboro/ledger/platform';

export type SandboxPaths = {
  /** Where a run's commands get a temp folder of their own. */
  tmpRoot: string;
  /** Every home folder, every other disk and the shared temp folders: shut to Claude Code's commands. */
  denyReadRoots: readonly string[];
  /** What Grok's `strict` profile reads besides the run's folder and Grok's home. */
  strictReads: readonly string[];
  /** What Grok's profile shuts again inside `strictReads`, where they exist. */
  grokShut: readonly string[];
  /** Apple's developer tools, which the shims in /usr/bin run through: read by Codex's profile. */
  codexReads: readonly string[];
  /** The OpenSSL config node reads as it starts: read by Codex's profile. */
  opensslConf: string;
};

export const SANDBOX_PATHS: Partial<Record<NodeJS.Platform, SandboxPaths>> = {
  darwin: {
    // Spelt /private/tmp, since /tmp broke every command (measured).
    tmpRoot: '/private/tmp',
    denyReadRoots: ['/Users', '/Volumes', '/private/tmp', '/tmp', '/private/var/folders'],
    // As Grok 1.0.46 on macOS logged it (ProfileApplied in its sessions'
    // sandbox-events.jsonl).
    strictReads: [
      '/usr',
      '/bin',
      '/sbin',
      '/etc',
      '/dev',
      '/System',
      '/Library',
      '/private',
      '/tmp',
      '/var'
    ],
    grokShut: ['/Library', '/tmp', '/var'],
    // The folder xcode-select uses by default, and the link it reads when the
    // owner switched it elsewhere; /var is itself a link.
    codexReads: ['/Library/Developer/CommandLineTools', '/private/var/db/xcode_select_link'],
    // Fits node from nodejs.org and from nvm (measured on node 24.22.2).
    opensslConf: '/System/Library/OpenSSL/openssl.cnf'
  }
};

/** This system's sandbox paths. A run that sandboxes where none are declared stops here. */
export function sandboxPaths(): SandboxPaths {
  const platform = currentPlatform();
  const paths = SANDBOX_PATHS[platform];
  if (!paths) throw new Error(`No sandbox paths are declared for ${platform}.`);
  return paths;
}

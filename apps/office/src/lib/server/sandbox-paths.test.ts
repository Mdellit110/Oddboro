// Each system a tool sandboxes on has that system's own paths declared, so no
// tool runs on a new system with a Mac's. Run with `npm test -w @oddboro/office`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AGENT_PLATFORMS, AGENTS, type Agent } from '@oddboro/ledger';
import { SANDBOX_PATHS } from './sandbox-paths.ts';

/**
 * Where each tool's walls name the system's own paths: Claude Code's sandbox
 * only where it runs commands, Grok's and Codex's kernel profiles wherever
 * they run. Gemini's walls are its policy file and its include list, which
 * name no system path.
 */
const SANDBOXES_ON: Record<Agent, () => readonly NodeJS.Platform[]> = {
  claude: () => {
    const on = AGENT_PLATFORMS.claude.commands;
    return on === 'always' ? AGENT_PLATFORMS.claude.runs : on;
  },
  grok: () => AGENT_PLATFORMS.grok.runs,
  codex: () => AGENT_PLATFORMS.codex.runs,
  gemini: () => []
};

test('every system a tool sandboxes on has its sandbox paths declared', () => {
  const missing = AGENTS.flatMap((agent) =>
    SANDBOXES_ON[agent]()
      .filter((platform) => !SANDBOX_PATHS[platform])
      .map((platform) => `${agent} on ${platform}`)
  );
  assert.deepEqual(missing, []);
});

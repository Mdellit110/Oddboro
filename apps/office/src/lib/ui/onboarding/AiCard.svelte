<script lang="ts">
  import { drawsLooks } from '@oddboro/ledger/agents';
  import type { AgentTools } from '../agent-tools.svelte.ts';
  import OfficeTools from '../OfficeTools.svelte';

  // Your AI: what the office runs on. A tile for every coding tool, and the
  // owner picks one for the office: its own runs, the Office Manager and every
  // new hire. The picked tool's panel below installs it and signs it in (on
  // Claude Code, its plan or key and its model). Next waits until the picked
  // tool is installed and signed in. A system that offers only Claude Code
  // shows the rest greyed, with why, so this card works the same on a Mac,
  // Linux and Windows (hard rule 14).
  type Props = {
    tools: AgentTools;
    onnext: () => void;
    onback: () => void;
    /**
     * Whether the office can design offices (not on Claude's Sonnet), and
     * whether it draws looks (`drawsLooks`: Claude Code on Opus, Codex on Sol).
     */
    ondraw: (can: boolean, looks: boolean) => void;
  };
  let { tools, onnext, onback, ondraw }: Props = $props();

  let claudeReady = $state(false);
  let model = $state<'opus' | 'sonnet'>('opus');
  const picked = $derived(tools.tools.find((t) => t.id === tools.office));
  const ready = $derived(
    !!picked?.installed &&
      !picked.tooOld &&
      (tools.office === 'claude' ? claudeReady : !!picked.signIn?.signedIn)
  );
  $effect(() =>
    ondraw(
      tools.office !== 'claude' || model !== 'sonnet',
      tools.office === 'claude' ? drawsLooks('claude', model) : tools.drawsLooks
    )
  );
</script>

<p class="text-lg font-semibold">What your office runs on.</p>
<p class="text-sm text-muted">
  Your Office Manager and every new Odd run on it. You can move any Odd to another tool later.
</p>

<div class="mt-3">
  <OfficeTools {tools} onmodel={(m) => (model = m)} onclaudeready={(r) => (claudeReady = r)} />
</div>

<div class="mt-4 flex items-center gap-3">
  <button class="btn ghost" onclick={onback}>Back</button>
  <span class="flex-1 text-end text-xs text-muted">
    {#if tools.loaded && !ready && picked}
      {!picked.installed
        ? `Install ${picked.name} to go on.`
        : picked.tooOld
          ? `Update ${picked.name} to go on.`
          : `Sign in to ${picked.name} to go on.`}
    {/if}
  </span>
  <button class="btn primary" disabled={!ready} onclick={onnext}>Next</button>
</div>

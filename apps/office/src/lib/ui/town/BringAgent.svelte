<script lang="ts">
  // Bringing an agent the owner already has into Oddboro. Oddboro can take an
  // agent's definition (a Claude Code agent file, or pasted instructions) and
  // run it as an Odd on the office's own Claude. It cannot reach an agent
  // running somewhere else, so this says plainly what comes along and what
  // does not, then proves the Odd works with a real reply before it counts.
  import { onMount } from 'svelte';
  import { call } from '../api.ts';
  import ClaudeCard from '../onboarding/ClaudeCard.svelte';
  import type { StaffProfile } from '../../staff/roster.ts';

  type Props = {
    /** The Odd answered its test: it is moved in and working. */
    onready: (odd: StaffProfile) => void;
    oncancel: () => void;
  };
  let { onready, oncancel }: Props = $props();

  type Found = {
    file: string;
    name: string;
    description: string;
    tools: string[];
    model: string | null;
  };
  type Imported = { staff: StaffProfile; kept: string[]; left: string[] };

  let found = $state<Found[]>([]);
  let searched = $state<string[]>([]);
  let dir = $state('');
  let pasting = $state(false);
  let name = $state('');
  let instructions = $state('');
  let busy = $state(false);
  let problem = $state('');
  let claudeReady = $state<boolean | undefined>();
  let imported = $state<Imported | undefined>();
  let testing = $state(false);
  let reply = $state('');

  onMount(() => {
    void scan();
    void checkClaude();
  });

  async function checkClaude() {
    try {
      const s = await call<{ auth: 'plan' | 'key'; account?: object }>('/api/setup/claude');
      claudeReady = s.auth === 'key' || !!s.account;
    } catch {
      claudeReady = false;
    }
  }

  async function scan() {
    problem = '';
    try {
      const r = await call<{ agents: Found[]; searched: string[] }>(
        `/api/agents/import${dir.trim() ? `?dir=${encodeURIComponent(dir.trim())}` : ''}`
      );
      found = r.agents;
      searched = r.searched;
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    }
  }

  async function bring(body: Record<string, unknown>) {
    busy = true;
    problem = '';
    try {
      imported = await call<Imported>('/api/agents/import', body);
      await test();
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  /** A real reply from the new Odd, read off the chat's stream. Nothing counts until it answers. */
  async function test() {
    if (!imported) return;
    testing = true;
    reply = '';
    problem = '';
    try {
      const res = await fetch(`/api/staff/${imported.staff.id}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message:
            'You just moved into Oddboro. In two or three sentences, say who you are, what you can do here, and anything from your instructions you cannot do yet.'
        })
      });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        for (const line of buf.split('\n\n').slice(0, -1)) {
          const data = line.replace(/^data: /, '');
          const e = JSON.parse(data) as { type: string; text?: string; message?: string };
          if (e.type === 'delta') reply += e.text ?? '';
          if (e.type === 'done') reply = e.text ?? reply;
          if (e.type === 'error') throw new Error(e.message ?? 'It did not answer');
        }
        buf = buf.split('\n\n').at(-1) ?? '';
      }
      if (!reply.trim()) throw new Error('It did not answer');
    } catch (e) {
      problem = `${imported.staff.name} did not answer: ${e instanceof Error ? e.message : e}. Check Claude is connected, then try again.`;
      reply = '';
    } finally {
      testing = false;
    }
  }
</script>

<section class="flex flex-col gap-3" aria-label="Bring your own agent">
  <div class="rounded-xl bg-raise p-3">
    <div class="text-[10px] tracking-[0.22em] text-sea uppercase">Pip</div>
    <p class="mt-1 text-sm text-ink">
      Oh, you've already got a team? Perfect. Let's get them moved in.
    </p>
  </div>

  {#if claudeReady === false}
    <p class="text-sm text-ink">Odds here work through Claude. Connect it first.</p>
    <ClaudeCard onnext={checkClaude} onback={oncancel} wantKey={false} onmodel={() => {}} />
  {:else if !imported}
    <p class="text-xs text-muted">
      Oddboro brings in an agent's instructions and runs it here on your Claude. It can't reach an
      agent that is running somewhere else.
    </p>
    {#if found.length}
      <ul class="flex flex-col gap-1.5" aria-label="Agents found on this computer">
        {#each found as a (a.file)}
          <li class="rounded-lg border border-hairline p-2.5">
            <div class="flex items-center gap-2">
              <span class="flex-1 truncate text-sm font-medium text-ink">{a.name}</span>
              <button
                class="rounded-lg bg-sea px-2.5 py-1 text-xs font-medium text-night disabled:opacity-50"
                disabled={busy || testing}
                onclick={() => bring({ file: a.file, dir: dir.trim() || undefined })}
                >Bring in</button
              >
            </div>
            {#if a.description}<p class="text-xs text-muted">{a.description}</p>{/if}
            <p class="truncate text-[11px] text-muted">{a.file}</p>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="text-sm text-ink">
        No Claude Code agents found in {searched.length ? searched.join(', ') : '~/.claude/agents'}.
      </p>
    {/if}
    <form
      class="flex gap-2"
      onsubmit={(e) => {
        e.preventDefault();
        void scan();
      }}
    >
      <input
        class="flex-1 rounded-lg bg-raise px-2.5 py-1.5 text-xs text-ink"
        aria-label="A project folder to look in"
        bind:value={dir}
        placeholder="Also look in a project folder, like ~/code/my-app"
      />
      <button class="rounded-lg bg-raise px-2.5 py-1.5 text-xs text-ink hover:bg-sea/20"
        >Look</button
      >
    </form>

    {#if !pasting}
      <button
        class="self-start text-xs text-muted underline underline-offset-2 hover:text-ink"
        onclick={() => (pasting = true)}
        >Using Codex or something else? Paste its instructions</button
      >
    {:else}
      <div class="flex flex-col gap-2 rounded-xl border border-hairline p-3">
        <input
          class="rounded-lg bg-raise px-2.5 py-1.5 text-sm text-ink"
          maxlength="40"
          aria-label="Its name"
          bind:value={name}
          placeholder="Its name"
        />
        <textarea
          class="rounded-lg bg-raise px-2.5 py-1.5 text-xs text-ink"
          rows="6"
          maxlength="20000"
          aria-label="Its instructions"
          bind:value={instructions}
          placeholder="Paste its system prompt, an AGENTS.md, or an agent file"></textarea>
        <button
          class="self-start rounded-lg bg-sea px-3 py-1.5 text-sm font-medium text-night disabled:opacity-50"
          disabled={busy || !name.trim() || !instructions.trim()}
          onclick={() => bring({ name, instructions })}>Bring them in</button
        >
      </div>
    {/if}
  {:else}
    <div class="rounded-xl border border-hairline p-3 text-sm">
      <div class="font-medium text-ink">{imported.staff.name} moved in</div>
      <div class="mt-2 text-xs text-muted">Came along</div>
      <ul class="list-disc ps-4 text-xs text-ink">
        {#each imported.kept as k (k)}<li>{k}</li>{/each}
      </ul>
      <div class="mt-2 text-xs text-muted">Stayed behind</div>
      <ul class="list-disc ps-4 text-xs text-ink">
        {#each imported.left as l (l)}<li>{l}</li>{/each}
      </ul>
    </div>
    {#if testing}
      <p class="text-sm text-muted">Asking {imported.staff.name} to say hello…</p>
    {/if}
    {#if reply}
      <div class="rounded-xl bg-raise p-3 text-sm text-ink">
        <div class="text-[10px] tracking-[0.22em] text-sea uppercase">{imported.staff.name}</div>
        <p class="mt-1 whitespace-pre-line">{reply}</p>
      </div>
      <button
        class="rounded-lg bg-sea px-3 py-2 text-sm font-medium text-night"
        onclick={() => imported && onready(imported.staff)}>Welcome them to my boro</button
      >
    {:else if !testing && problem}
      <button
        class="self-start rounded-lg bg-raise px-3 py-1.5 text-sm text-ink hover:bg-sea/20"
        onclick={test}>Try again</button
      >
    {/if}
  {/if}

  {#if problem}
    <p class="text-xs text-coral" role="alert">{problem}</p>
  {/if}
  {#if !imported}
    <button class="self-start text-sm text-muted hover:text-ink" onclick={oncancel}>Back</button>
  {/if}
</section>

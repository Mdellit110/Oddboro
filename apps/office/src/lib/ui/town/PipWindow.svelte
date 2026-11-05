<script lang="ts">
  // Pip after the first session: how the first Odd's first task is going, read
  // from the real run (waiting, working, done, failed or waiting on the
  // owner), and what to try next. It changes only when the office does.
  import { onMount } from 'svelte';
  import Markdown from '../Markdown.svelte';
  import { call } from '../api.ts';
  import BringAgent from './BringAgent.svelte';
  import type { StaffProfile } from '../../staff/roster.ts';

  type Props = {
    version: number;
    onoffice: () => void;
    ondesk: () => void;
    onchat: (id: string) => void;
    onhire: () => void;
  };
  let { version, onoffice, ondesk, onchat, onhire }: Props = $props();

  type First = {
    state: 'waiting' | 'working' | 'done' | 'failed' | 'needs-you';
    result: string | null;
    reportId: number | null;
  };
  type View = {
    state: { firstOdd?: string; boro?: { name: string } };
    first?: First;
    profiles: StaffProfile[];
  };
  let view = $state<View | undefined>();
  let who = $state<{ id: string; name: string } | undefined>();
  let bringing = $state(false);
  let problem = $state('');
  let busy = $state(false);

  async function load() {
    try {
      view = await call<View>('/api/town');
      const id = view.state.firstOdd;
      if (id) {
        const staff = await call<{ staff: StaffProfile[] }>('/api/office');
        const p = staff.staff.find((s) => s.id === id);
        who = p ? { id: p.id, name: p.name } : who;
      }
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    }
  }
  onMount(load);
  // The first task moved on (a follow-up started or finished, a report landed).
  let seen = 0;
  $effect(() => {
    const v = version;
    if (v !== seen) {
      seen = v;
      void load();
    }
  });

  async function retry() {
    busy = true;
    problem = '';
    try {
      view = await call<View>('/api/town', { action: 'retry-first' });
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  const name = $derived(who?.name ?? 'Your Odd');
  const first = $derived(view?.first);
</script>

<section class="flex h-full min-h-0 flex-col" aria-label="Pip">
  <header class="border-b border-hairline p-3">
    <div class="font-pixel text-lg leading-none">Pip</div>
    <div class="mt-1 text-xs text-muted">Your guide. Here when you want, never in the way.</div>
  </header>
  <div class="flex flex-1 flex-col gap-3 overflow-y-auto p-3 text-sm">
    {#if bringing}
      <BringAgent
        onready={(odd) => {
          bringing = false;
          onchat(odd.id);
        }}
        oncancel={() => (bringing = false)}
      />
    {:else}
      {#if first}
        <div class="rounded-xl bg-raise p-3" aria-live="polite">
          <div class="text-[10px] tracking-[0.22em] text-sea uppercase">First task</div>
          {#if first.state === 'waiting' || first.state === 'working'}
            <p class="mt-1 text-ink">
              {name} is at their desk, working on it now. You can watch them on the floor. This takes
              a minute or two.
            </p>
          {:else if first.state === 'done'}
            <p class="mt-1 text-ink">{name} finished! Here's what they made:</p>
            {#if first.result}
              <div class="mt-2 max-h-72 overflow-y-auto rounded-lg bg-night/40 p-2 text-xs">
                <Markdown text={first.result} staff={who?.id} />
              </div>
            {/if}
            <div class="mt-2 flex flex-wrap gap-2">
              <button
                class="rounded-lg bg-sea px-3 py-1.5 text-xs font-medium text-night"
                onclick={ondesk}>See it on your Desk</button
              >
              {#if who}
                <button
                  class="rounded-lg bg-night/40 px-3 py-1.5 text-xs text-ink"
                  onclick={() => who && onchat(who.id)}>Reply to {name}</button
                >
              {/if}
            </div>
          {:else if first.state === 'needs-you'}
            <p class="mt-1 text-ink">
              {name} got started and needs something from you first. It's on your Desk.
            </p>
            <button
              class="mt-2 rounded-lg bg-sea px-3 py-1.5 text-xs font-medium text-night"
              onclick={ondesk}>Open your Desk</button
            >
          {:else}
            <p class="mt-1 text-ink">{name}'s first task didn't finish.</p>
            {#if first.result}<p class="mt-1 text-xs text-muted">{first.result}</p>{/if}
            <p class="mt-1 text-xs text-muted">
              Usually that's Claude being busy or signed out. Check Setup, then try again.
            </p>
            <button
              class="mt-2 rounded-lg bg-sea px-3 py-1.5 text-xs font-medium text-night disabled:opacity-50"
              disabled={busy}
              onclick={retry}>Try again</button
            >
          {/if}
        </div>
      {/if}

      <div class="flex flex-col gap-1.5">
        <div class="text-[10px] tracking-[0.22em] text-muted uppercase">What next</div>
        {#if who}
          <button
            class="rounded-lg border border-hairline p-2.5 text-start hover:bg-raise"
            onclick={() => who && onchat(who.id)}
          >
            <div class="text-ink">Ask {name} for something</div>
            <div class="text-xs text-muted">Anything you'd hand a new teammate.</div>
          </button>
        {/if}
        <button
          class="rounded-lg border border-hairline p-2.5 text-start hover:bg-raise"
          onclick={onoffice}
        >
          <div class="text-ink">Make {view?.state.boro?.name ?? 'your boro'} yours</div>
          <div class="text-xs text-muted">Rearrange, decorate, or add a room.</div>
        </button>
        <button
          class="rounded-lg border border-hairline p-2.5 text-start hover:bg-raise"
          onclick={onhire}
        >
          <div class="text-ink">Hire another Odd</div>
          <div class="text-xs text-muted">Describe who you need, and they move in.</div>
        </button>
        <button
          class="rounded-lg border border-hairline p-2.5 text-start hover:bg-raise"
          onclick={() => (bringing = true)}
        >
          <div class="text-ink">Bring an agent you already have</div>
          <div class="text-xs text-muted">From Claude Code, or pasted instructions.</div>
        </button>
      </div>
    {/if}
    {#if problem}<p class="text-xs text-coral" role="alert">{problem}</p>{/if}
  </div>
</section>

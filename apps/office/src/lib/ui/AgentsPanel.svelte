<script lang="ts">
  import { tick } from 'svelte';
  import Pixel from './Pixel.svelte';
  import type { StaffProfile } from '../staff/roster.ts';
  import type { Work } from '../staff/work.ts';

  // Every staffer, one per row, with a search that matches name, role or
  // remit. A row opens that staffer's card; its In progress badge opens the
  // card on that tab. From the search box, the arrow keys pick a row and Enter
  // opens a chat with it.
  type Props = {
    staff: StaffProfile[];
    /** Staffer id to what it is doing now, in words. */
    status: Record<string, string>;
    /** Staffers with something on the owner's desk. */
    waiting: Set<string | null>;
    /** Staffer id to its work in progress. */
    inProgress: Record<string, Work[]>;
    selected?: string;
    /** Changes to put the cursor in the search box, e.g. on Cmd+K. */
    find?: number;
    onselect: (id: string | undefined) => void;
    onwork: (id: string) => void;
    onchat: (id: string) => void;
  };
  let { staff, status, waiting, inProgress, selected, find, onselect, onwork, onchat }: Props =
    $props();

  let query = $state('');
  let box: HTMLInputElement | undefined = $state();
  let list: HTMLUListElement | undefined = $state();
  /** The row the arrow keys are on, shown while the search box has the cursor. */
  let active = $state(0);
  let typing = $state(false);
  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((p) => [p.name, p.role, p.remit].some((s) => s.toLowerCase().includes(q)));
  });

  $effect(() => {
    void query;
    active = 0;
  });

  $effect(() => {
    if (!find) return;
    // The window turns visible in the same update that asks for the cursor.
    void tick().then(() => {
      box?.focus();
      box?.select();
    });
  });

  function move(by: number) {
    if (!shown.length) return;
    active = (active + by + shown.length) % shown.length;
    void tick().then(() => list?.children[active]?.scrollIntoView({ block: 'nearest' }));
  }

  function keys(e: KeyboardEvent) {
    if (e.key === 'Escape') query = '';
    else if (e.key === 'ArrowDown') move(1);
    else if (e.key === 'ArrowUp') move(-1);
    else if (e.key === 'Enter' && shown[active]) onchat(shown[active].id);
    else return;
    e.preventDefault();
  }
</script>

<section class="flex h-full min-h-0 flex-col" aria-label="Odds">
  <div class="relative p-3 pb-2">
    <input
      bind:this={box}
      type="search"
      class="w-full rounded-lg bg-raise py-2 ps-3 pe-11 text-sm outline-none placeholder:text-faint focus:ring-1 focus:ring-sea/60"
      placeholder={`Find one of ${staff.length} by name, role or remit`}
      aria-label="Find an Odd. Arrow keys pick one, Enter opens a chat."
      aria-keyshortcuts="Meta+K"
      bind:value={query}
      onkeydown={keys}
      onfocus={() => (typing = true)}
      onblur={() => (typing = false)}
    />
    <kbd
      class="pointer-events-none absolute end-5 top-1/2 -translate-y-1/2 rounded bg-night/60 px-1.5 py-0.5 font-sans text-[10px] text-faint"
      aria-hidden="true">⌘K</kbd
    >
  </div>
  <p class="sr-only" aria-live="polite">
    {typing && shown[active] ? `${shown[active].name}, ${shown[active].role}` : ''}
  </p>
  <ul bind:this={list} class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3">
    {#each shown as p, i (p.id)}
      {@const busy = inProgress[p.id]?.length ?? 0}
      <li class="relative">
        <button
          class="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-start transition-colors hover:bg-sea/15 {busy
            ? 'pe-28'
            : ''} {selected === p.id ? 'bg-sea/20' : 'bg-raise'} {typing && i === active
            ? 'ring-1 ring-sea/70'
            : ''}"
          aria-pressed={selected === p.id}
          onclick={() => onselect(selected === p.id ? undefined : p.id)}
        >
          <Pixel
            src={p.look?.portrait}
            frame={`${p.portrait}/default`}
            fallback={`${p.sprite}@${p.variant}/idle-down-0`}
            scale={1}
            label={p.name}
            class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sea-deep"
          />
          <span class="min-w-0 flex-1">
            <span class="flex items-baseline gap-2">
              <span class="text-sm font-medium text-ink">{p.name}</span>
              <span class="truncate text-[11px] text-faint">{p.role}</span>
            </span>
            <span class="block truncate text-xs {waiting.has(p.id) ? 'text-ember' : 'text-muted'}"
              >{status[p.id] ?? 'Arriving'}</span
            >
          </span>
        </button>
        {#if busy}
          <button
            class="absolute end-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-full bg-night/60 px-2.5 py-1 text-[11px] text-ink hover:bg-ember/25"
            title={`See what ${p.name} is working on`}
            onclick={() => onwork(p.id)}><span class="dot"></span>{busy} in progress</button
          >
        {/if}
      </li>
    {:else}
      <li class="py-8 text-center text-sm text-muted">Nobody matches “{query.trim()}”.</li>
    {/each}
  </ul>
</section>

<style>
  .dot {
    inline-size: 6px;
    block-size: 6px;
    border-radius: 9999px;
    background: var(--color-ember);
    animation: pulse 1.2s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.3;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .dot {
      animation: none;
    }
  }
</style>

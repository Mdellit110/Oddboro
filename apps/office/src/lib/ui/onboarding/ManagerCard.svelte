<script lang="ts">
  import Pixel from '../Pixel.svelte';

  // Every office has an Office Manager. Four come ready, looks and all, so
  // picking one costs nothing. "Describe your own" takes a name and a line or
  // two, and the office draws them while the owner carries on.
  export type Preset = {
    id: string;
    name: string;
    trait: string;
    says: string;
    frame?: string;
    portrait?: string;
  };
  export type Custom = { name: string; description: string };
  type Props = {
    presets: Preset[];
    pick: string;
    custom: Custom;
    /** The described manager's portrait, once drawn. */
    drawn?: string;
    drawing: boolean;
    /** False on Sonnet, which cannot draw a look: only the ready-made managers. */
    canDraw: boolean;
    onnext: () => void;
    onback: () => void;
  };
  let {
    presets,
    pick = $bindable(),
    custom = $bindable(),
    drawn,
    drawing,
    canDraw,
    onnext,
    onback
  }: Props = $props();

  const ready = $derived(pick !== 'custom' || !!custom.name.trim());
</script>

<p class="text-sm text-muted">
  This is your office. It runs on this computer and works while the computer is on. Every office has
  a manager: they run the floor, write your daily report, and help you hire the rest. Pick yours.
</p>

<!-- One list, in two brackets: the quick way first, then your own. -->
<div class="mt-3 grid gap-3" role="radiogroup" aria-label="Office manager">
  <div class="group-quick">
    <div class="mb-1.5 text-[10px] tracking-[0.14em] text-sea uppercase">Quick</div>
    <div class="grid gap-1.5">
      {#each presets as m (m.id)}
        <button
          class="manager"
          role="radio"
          aria-checked={pick === m.id}
          class:on={pick === m.id}
          onclick={() => (pick = m.id)}
        >
          <Pixel
            src={m.portrait}
            frame={m.frame}
            scale={1}
            label={`${m.name}'s portrait`}
            class="size-12 shrink-0 rounded-md"
          />
          <span class="min-w-0">
            <span class="flex items-baseline gap-2">
              <span class="font-pixel text-base leading-none">{m.name}</span>
              <span class="text-[10px] tracking-[0.08em] text-sea uppercase">{m.trait}</span>
            </span>
            <span class="mt-1 block text-xs leading-snug text-muted">{m.says}</span>
          </span>
        </button>
      {/each}
    </div>
  </div>
  <div class="group-custom">
    <div class="mb-1.5 text-[10px] tracking-[0.14em] text-muted uppercase">Custom</div>
    <button
      class="manager w-full border-dashed"
      role="radio"
      aria-checked={pick === 'custom'}
      class:on={pick === 'custom'}
      disabled={!canDraw}
      onclick={() => (pick = 'custom')}
    >
      {#if drawn}
        <img src={drawn} alt="" class="size-12 shrink-0 rounded-md [image-rendering:pixelated]" />
      {:else}
        <span
          class="grid size-12 shrink-0 place-items-center rounded-md bg-night/40 font-pixel text-2xl text-sea"
          aria-hidden="true">{drawing ? '…' : '+'}</span
        >
      {/if}
      <span class="min-w-0">
        <span class="block font-pixel text-base leading-none">
          {custom.name.trim() && pick === 'custom' ? custom.name : 'Describe your own'}
        </span>
        <span class="mt-1 block text-xs text-muted">
          {!canDraw
            ? 'Needs Opus. Change it on Your Claude.'
            : drawing
              ? 'Drawing them now.'
              : 'A name and a line. The office draws them.'}
        </span>
      </span>
    </button>
  </div>
</div>

{#if pick === 'custom'}
  <div class="mt-3 grid gap-2">
    <label class="sr-only" for="onboarding-manager-name">Their name</label>
    <input
      id="onboarding-manager-name"
      class="field"
      placeholder="Their name"
      maxlength="40"
      autocomplete="off"
      bind:value={custom.name}
    />
    <label class="sr-only" for="onboarding-manager-about">Who they are</label>
    <textarea
      id="onboarding-manager-about"
      class="field min-h-16 resize-none"
      maxlength="1000"
      placeholder="Who are they? A line on how they work, a line on how they look. Dry, exact, never late. Silver hair, round glasses, a green cardigan."
      bind:value={custom.description}></textarea>
  </div>
{/if}

<div class="mt-4 flex items-center gap-3">
  <button class="btn ghost" onclick={onback}>Back</button>
  <span class="flex-1"></span>
  <button class="btn primary" disabled={!ready} onclick={onnext}>Next</button>
</div>

<style>
  .manager {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 0.75rem;
    border: 1px solid var(--color-hairline);
    border-radius: 0.75rem;
    background: var(--color-raise);
    padding: 0.5rem;
    text-align: start;
    transition: transform 160ms;
  }
  /* The bracket: a line down the start side of each group. */
  .group-quick,
  .group-custom {
    border-inline-start: 2px solid var(--color-hairline);
    padding-inline-start: 0.6rem;
  }
  .group-quick {
    border-inline-start-color: color-mix(in srgb, var(--color-sea) 50%, transparent);
  }
  .manager:hover {
    transform: translateX(2px);
  }
  :global([dir='rtl']) .manager:hover {
    transform: translateX(-2px);
  }
  .manager:disabled {
    opacity: 0.5;
    transform: none;
  }
  .manager.on {
    border-color: var(--color-sea);
    background: color-mix(in srgb, var(--color-sea) 12%, transparent);
  }
</style>

<script lang="ts">
  import { onMount } from 'svelte';
  import type { DrawnPart, LookSpec } from '@oddboro/sprites/look';
  import { AGENT_NAMES } from '@oddboro/ledger/agents';
  import Pixel from './Pixel.svelte';
  import PixelDrawing from './PixelDrawing.svelte';
  import OddParts, { type Built } from './OddParts.svelte';
  import { AgentTools } from './agent-tools.svelte.ts';
  import { call } from './api.ts';

  export type Drawn = {
    look: LookSpec;
    portraitPx: string;
    newParts: DrawnPart[];
    sheet: string;
    frames: Record<string, number>;
    portrait: string;
  };

  type Props = {
    name: string;
    role: string;
    /** Set when redrawing someone already on staff. */
    staffId?: string;
    /** Their current look, so a redraw changes it rather than starting over. */
    current?: LookSpec;
    description?: string;
    /** The look the owner kept, if any. */
    kept?: Drawn;
    onkeep: (d: Drawn) => void | Promise<void>;
    /**
     * Keep each look built from parts as it lands, with no Keep button: the
     * hire window's Next is the one click. A look still rendering clears it
     * (`onclear`), so Next never moves on with the one before.
     */
    autoKeep?: boolean;
    onclear?: () => void;
    keepLabel?: string;
    /** Told when a drawing starts and ends, so the window can show it. */
    onbusy?: (busy: boolean) => void;
  };
  let {
    name,
    role,
    staffId,
    current,
    description = $bindable(''),
    kept,
    onkeep,
    autoKeep = false,
    onclear,
    keepLabel = 'Keep',
    onbusy
  }: Props = $props();

  // Two ways to a look: the office draws one from words or a headshot, on
  // the tools and models that draw well (`drawsLooks`), or the owner builds
  // one from parts, at once, on any tool. Where the office does not draw,
  // only parts show.
  const agentTools = new AgentTools();
  let way = $state<'draw' | 'parts' | undefined>();
  // Parts first: it takes no time. Drawing is there for a look made to order.
  const mode = $derived(agentTools.drawsLooks ? (way ?? 'parts') : 'parts');
  /** The look built from parts, as it stands. */
  let built = $state<Built | undefined>();
  let builtKept = $state(false);

  let drawn = $state<Drawn | undefined>();
  let note = $state('');
  /** A headshot to draw them from, shrunk on this page. Never saved. */
  let photo = $state<string | undefined>();
  let picker = $state<HTMLInputElement>();
  let busy = $state(false);
  let drawing = $state(false);
  let problem = $state('');
  $effect(() => onbusy?.(drawing));

  onMount(() => {
    if (kept) drawn = kept;
  });

  /**
   * Shrink a headshot to 512 px on its long side and send it as a JPEG.
   * Drawing it on a canvas also drops its metadata, the location with it.
   */
  async function pick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    problem = '';
    try {
      const img = await createImageBitmap(file);
      const scale = Math.min(1, 512 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.close();
      photo = canvas.toDataURL('image/jpeg', 0.85);
    } catch {
      problem = 'That file is not a picture this browser can open. Try a JPEG or PNG.';
    }
  }

  async function draw() {
    busy = true;
    drawing = true;
    problem = '';
    try {
      const previous =
        drawn ?? (current ? { look: current, portraitPx: '', newParts: [] } : undefined);
      drawn = await call<Drawn>('/api/looks', {
        description,
        name,
        role,
        staffId,
        note: previous ? note : undefined,
        previous,
        photo
      });
      note = '';
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
      drawing = false;
    }
  }

  async function keep() {
    if (!drawn) return;
    busy = true;
    problem = '';
    try {
      await onkeep(drawn);
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function keepBuilt() {
    if (!built) return;
    busy = true;
    problem = '';
    try {
      const { problems: _, ...d } = built;
      await onkeep(d);
      builtKept = true;
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  // The preview walks: down, side, then up, a few steps each. Under reduced
  // motion it stands still.
  const WALK = ['walk-down', 'walk-side', 'walk-up'];
  let tick = $state(0);
  onMount(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => (tick = (tick + 1) % (WALK.length * 8)), 150);
    return () => clearInterval(t);
  });
  const frameX = $derived.by(() => {
    if (!drawn) return 0;
    const anim = WALK[Math.floor(tick / 8)];
    return drawn.frames[`${anim}-${tick % 4}`] ?? drawn.frames['idle-down-0'] ?? 0;
  });
  const isKept = $derived(!!drawn && kept === drawn);
</script>

<div class="flex flex-col gap-2">
  {#if !agentTools.loaded}
    <div class="h-8"></div>
  {:else if agentTools.drawsLooks}
    <div
      class="flex gap-1 rounded-lg bg-raise p-1"
      role="radiogroup"
      aria-label="How to make the look"
    >
      {#each [{ id: 'parts', label: 'Build from parts' }, { id: 'draw', label: 'Draw them' }] as const as w (w.id)}
        <button
          class="flex-1 rounded-md px-2 py-1 text-xs {mode === w.id
            ? 'bg-sea/25 text-ink'
            : 'text-muted hover:text-ink'}"
          role="radio"
          aria-checked={mode === w.id}
          disabled={drawing}
          onclick={() => (way = w.id)}>{w.label}</button
        >
      {/each}
    </div>
  {:else}
    <p class="text-xs text-muted">
      {agentTools.office === 'claude' ? 'On Sonnet, the office' : AGENT_NAMES[agentTools.office]}
      does not draw looks, so build {name.trim() || 'them'} from parts. It takes no time.
    </p>
  {/if}

  {#if agentTools.loaded && mode === 'parts'}
    <OddParts
      {name}
      {staffId}
      start={kept?.look ?? current}
      onlook={(b) => {
        built = b;
        builtKept = false;
        if (!autoKeep) return;
        if (b && !b.problems.length) void keepBuilt();
        else onclear?.();
      }}
    />
    {#if !autoKeep}
      <button
        class="rounded-lg bg-sea px-3 py-2 text-sm font-medium text-night disabled:opacity-40"
        disabled={busy || !built || built.problems.length > 0 || builtKept}
        onclick={keepBuilt}>{builtKept ? 'Kept' : keepLabel}</button
      >
    {/if}
  {:else if agentTools.loaded}
    <label class="flex flex-col gap-1">
      <span class="text-xs text-muted">What do they look like?</span>
      <textarea
        rows="3"
        class="resize-y rounded-lg bg-raise px-3 py-2 text-sm outline-none placeholder:text-faint"
        placeholder={photo
          ? 'Anything to add to the photo, e.g. a green jacket. Optional.'
          : 'Hair, clothes, colours, glasses or a beard. Leave it empty for a surprise.'}
        bind:value={description}></textarea>
    </label>

    <input
      bind:this={picker}
      type="file"
      accept="image/jpeg,image/png,image/webp,image/gif"
      class="hidden"
      onchange={pick}
    />
    {#if photo}
      <div class="flex items-center gap-3 rounded-lg bg-raise p-2">
        <img
          src={photo}
          alt="The headshot to draw them from"
          class="size-12 rounded-md object-cover"
        />
        <span class="min-w-0 flex-1 text-xs text-muted"
          >They will be drawn from this photo, which takes 5 to 7 minutes. It is used for this
          drawing only and never saved.</span
        >
        <button
          class="shrink-0 text-xs text-muted underline underline-offset-2 hover:text-ink disabled:opacity-40"
          disabled={drawing}
          onclick={() => (photo = undefined)}>Remove</button
        >
      </div>
    {:else}
      <button
        class="self-start text-xs text-sea underline underline-offset-2 disabled:opacity-40"
        disabled={drawing}
        onclick={() => picker?.click()}>Draw them from a headshot (5 to 7 minutes)</button
      >
    {/if}

    {#if drawing && !drawn}
      <PixelDrawing {name} photo={!!photo} />
    {:else if !drawn}
      <button
        class="rounded-lg bg-sea px-3 py-2 text-sm font-medium text-night disabled:opacity-40"
        disabled={busy}
        onclick={draw}>Draw them</button
      >
    {/if}

    {#if drawn}
      <div class="flex items-end justify-center gap-6 rounded-xl bg-raise p-3">
        <Pixel
          src={drawn.portrait}
          scale={3}
          label={`${name || 'New hire'}, portrait`}
          class="block overflow-hidden rounded-lg"
        />
        <Pixel
          src={drawn.sheet}
          crop={{ x: frameX, y: 0, w: 16, h: 32 }}
          scale={4}
          label={`${name || 'New hire'}, walking`}
          class="block"
        />
      </div>
      {#if drawn.newParts.length}
        <p class="text-[11px] text-faint">
          New in the library: {drawn.newParts.map((p) => `${p.name} (${p.kind})`).join(', ')}
        </p>
      {/if}
      {#if drawing}
        <PixelDrawing {name} redraw photo={!!photo} />
      {:else}
        <input
          class="rounded-lg bg-raise px-3 py-2 text-sm outline-none placeholder:text-faint"
          placeholder="What to change, e.g. shorter hair, a green jacket"
          aria-label="What to change"
          bind:value={note}
        />
        <div class="flex gap-2">
          <button
            class="flex-1 rounded-lg bg-raise px-3 py-2 text-sm hover:bg-sea/20"
            onclick={draw}>Redraw</button
          >
          <button
            class="flex-1 rounded-lg bg-sea px-3 py-2 text-sm font-medium text-night disabled:opacity-40"
            disabled={isKept}
            onclick={keep}>{isKept ? 'Kept' : keepLabel}</button
          >
        </div>
      {/if}
    {/if}
  {/if}

  {#if problem}
    <p class="rounded-lg bg-coral/15 px-3 py-2 text-xs text-coral">{problem}</p>
  {/if}
</div>

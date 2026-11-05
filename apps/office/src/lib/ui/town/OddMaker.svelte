<script lang="ts">
  // The owner makes their own Odd: who they are in Oddboro. Parts and colours
  // show at once and need nothing else. With Claude connected they can
  // describe themselves instead, and the office draws a look of their own.
  import { onMount } from 'svelte';
  import type { DrawnPart, LookSpec } from '@oddboro/sprites/look';
  import { call } from '../api.ts';

  type Props = {
    name: string;
    look: LookSpec | null;
    /** Whether Claude can draw: describing needs it, picking parts does not. */
    canDraw: boolean;
    onmade: () => void;
  };
  let { name: startName, look: startLook, canDraw, onmade }: Props = $props();

  type Swatch = { name: string; hex: string };
  type Parts = {
    hair: string[];
    top: string[];
    bottom: string[];
    colours: Record<'hair' | 'skin' | 'cloth' | 'shoes' | 'glasses', Swatch[]>;
  };
  type Sheet = { sheet: string; frames: Record<string, number> };

  // svelte-ignore state_referenced_locally
  let name = $state(startName);
  let parts = $state<Parts | undefined>();
  // svelte-ignore state_referenced_locally
  let look = $state<LookSpec | undefined>(startLook ?? undefined);
  let newParts: DrawnPart[] = [];
  let sheet = $state<Sheet | undefined>();
  let problem = $state('');
  let saving = $state(false);
  let describing = $state(false);
  let description = $state('');
  let drawing = $state(false);

  onMount(async () => {
    try {
      parts = await call<Parts>('/api/me/parts');
      look ??= {
        hair: pick(parts.hair, 'short-crop'),
        top: pick(parts.top, 'tee'),
        bottom: pick(parts.bottom, 'trousers'),
        colours: {
          hair: parts.colours.hair[0].name,
          skin: parts.colours.skin[Math.floor(parts.colours.skin.length / 2)].name,
          top: parts.colours.cloth[0].name,
          bottom: parts.colours.cloth[1]?.name ?? parts.colours.cloth[0].name,
          shoes: parts.colours.shoes[0].name
        }
      };
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    }
  });

  const pick = (list: string[], want: string) => (list.includes(want) ? want : list[0]);

  // Draw the look again whenever a part or colour changes, but not for a drawn one.
  let shown = '';
  $effect(() => {
    const l = look;
    if (!l || newParts.length) return;
    const key = JSON.stringify(l);
    if (key === shown) return;
    shown = key;
    call<Sheet>('/api/me/preview', l)
      .then((s) => (sheet = s))
      .catch((e) => (problem = e instanceof Error ? e.message : String(e)));
  });

  function cycle(kind: 'hair' | 'top' | 'bottom', dir: 1 | -1) {
    if (!look || !parts) return;
    const list = parts[kind];
    const i = list.indexOf(look[kind]);
    newParts = [];
    look = { ...look, [kind]: list[(i + dir + list.length) % list.length] };
  }

  function colour(role: keyof LookSpec['colours'], swatch: string) {
    if (!look) return;
    newParts = [];
    look = { ...look, colours: { ...look.colours, [role]: swatch } };
  }

  function glasses(swatch: string | undefined) {
    if (!look) return;
    const { glasses: _, ...rest } = look;
    look = swatch ? { ...rest, glasses: swatch } : rest;
  }

  async function draw() {
    if (!description.trim()) return;
    drawing = true;
    problem = '';
    try {
      const d = await call<{ look: LookSpec; newParts: DrawnPart[] } & Sheet>('/api/looks', {
        description,
        name,
        role: 'The owner of this office'
      });
      newParts = d.newParts ?? [];
      shown = JSON.stringify(d.look);
      look = d.look;
      sheet = { sheet: d.sheet, frames: d.frames };
      describing = false;
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      drawing = false;
    }
  }

  async function save() {
    if (!look || !name.trim()) return;
    saving = true;
    problem = '';
    try {
      await call('/api/me', { name, look, newParts }, 'PUT');
      onmade();
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      saving = false;
    }
  }

  /** Paint one frame of the sheet, big and crisp. */
  function frame(canvas: HTMLCanvasElement, at: { sheet: Sheet; name: string }) {
    const paint = ({ sheet: s, name: f }: { sheet: Sheet; name: string }) => {
      const x = s.frames[f];
      const ctx = canvas.getContext('2d');
      if (x === undefined || !ctx) return;
      const img = new Image();
      img.onload = () => {
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, x, 0, 16, 32, 0, 0, canvas.width, canvas.height);
      };
      img.src = s.sheet;
    };
    paint(at);
    return { update: paint };
  }

  const ROLES = [
    { role: 'skin', group: 'skin', label: 'Skin' },
    { role: 'hair', group: 'hair', label: 'Hair' },
    { role: 'top', group: 'cloth', label: 'Top' },
    { role: 'bottom', group: 'cloth', label: 'Bottom' },
    { role: 'shoes', group: 'shoes', label: 'Shoes' }
  ] as const;
  const words = (s: string) => s.replace(/-/g, ' ');
</script>

<section class="flex flex-col gap-3" aria-label="Make your Odd">
  <div class="flex items-end justify-center gap-4 rounded-xl bg-raise py-3">
    {#if sheet}
      {#each ['idle-down-0', 'idle-side-0', 'idle-up-0'] as f (f)}
        <canvas
          width="64"
          height="128"
          class="h-32 w-16"
          style="image-rendering: pixelated"
          aria-label={f === 'idle-down-0' ? 'Your Odd, from the front' : ''}
          use:frame={{ sheet, name: f }}
        ></canvas>
      {/each}
    {:else}
      <div class="h-32 text-sm text-muted">Drawing you…</div>
    {/if}
  </div>

  <label class="flex flex-col gap-1 text-xs text-muted">
    What should Odds call you?
    <input
      class="rounded-lg bg-raise px-2.5 py-1.5 text-sm text-ink"
      maxlength="30"
      bind:value={name}
      placeholder="Your name"
    />
  </label>

  {#if parts && look}
    {#if !describing}
      <div class="flex flex-col gap-1.5">
        {#each ['hair', 'top', 'bottom'] as const as kind (kind)}
          <div class="flex items-center gap-2 text-sm">
            <span class="w-14 text-xs text-muted capitalize">{kind}</span>
            <button
              class="rounded-full bg-raise px-2 text-ink hover:bg-sea/20"
              aria-label={`Previous ${kind}`}
              onclick={() => cycle(kind, -1)}>‹</button
            >
            <span class="flex-1 text-center text-ink capitalize">{words(look[kind])}</span>
            <button
              class="rounded-full bg-raise px-2 text-ink hover:bg-sea/20"
              aria-label={`Next ${kind}`}
              onclick={() => cycle(kind, 1)}>›</button
            >
          </div>
        {/each}
      </div>

      <div class="flex flex-col gap-1.5">
        {#each ROLES as r (r.role)}
          <div class="flex items-center gap-2">
            <span class="w-14 shrink-0 text-xs text-muted">{r.label}</span>
            <div class="flex flex-wrap gap-1" role="radiogroup" aria-label={`${r.label} colour`}>
              {#each parts.colours[r.group] as s (s.name)}
                <button
                  class="size-5 rounded-full border {look.colours[r.role] === s.name
                    ? 'border-ink ring-1 ring-sea'
                    : 'border-hairline'}"
                  style="background: {s.hex}"
                  role="radio"
                  aria-checked={look.colours[r.role] === s.name}
                  aria-label={words(s.name)}
                  title={words(s.name)}
                  onclick={() => colour(r.role, s.name)}
                ></button>
              {/each}
            </div>
          </div>
        {/each}
        <div class="flex items-center gap-2">
          <span class="w-14 shrink-0 text-xs text-muted">Glasses</span>
          <div class="flex flex-wrap gap-1" role="radiogroup" aria-label="Glasses">
            <button
              class="rounded-full border px-1.5 text-[11px] {look.glasses
                ? 'border-hairline text-muted'
                : 'border-ink text-ink'}"
              role="radio"
              aria-checked={!look.glasses}
              onclick={() => glasses(undefined)}>None</button
            >
            {#each parts.colours.glasses as s (s.name)}
              <button
                class="size-5 rounded-full border {look.glasses === s.name
                  ? 'border-ink ring-1 ring-sea'
                  : 'border-hairline'}"
                style="background: {s.hex}"
                role="radio"
                aria-checked={look.glasses === s.name}
                aria-label={words(s.name)}
                title={words(s.name)}
                onclick={() => glasses(s.name)}
              ></button>
            {/each}
          </div>
        </div>
      </div>
    {:else}
      <label class="flex flex-col gap-1 text-xs text-muted">
        Describe yourself: hair, glasses, what you like to wear.
        <textarea
          class="rounded-lg bg-raise px-2.5 py-1.5 text-sm text-ink"
          rows="3"
          maxlength="1000"
          bind:value={description}
          placeholder="Curly red hair, round glasses, always in a green hoodie"></textarea>
      </label>
      <div class="flex gap-2">
        <button
          class="rounded-lg bg-sea px-3 py-1.5 text-sm font-medium text-night disabled:opacity-50"
          disabled={drawing || !description.trim()}
          onclick={draw}>{drawing ? 'Drawing you, a minute or two…' : 'Draw me'}</button
        >
        <button
          class="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-ink"
          disabled={drawing}
          onclick={() => (describing = false)}>Pick parts instead</button
        >
      </div>
    {/if}

    {#if canDraw && !describing}
      <button
        class="self-start text-xs text-muted underline underline-offset-2 hover:text-ink"
        onclick={() => (describing = true)}>Or describe yourself and Claude draws you</button
      >
    {/if}

    <button
      class="rounded-lg bg-sea px-3 py-2 text-sm font-medium text-night disabled:opacity-50"
      disabled={saving || drawing || !name.trim()}
      onclick={save}>That's me</button
    >
  {/if}

  {#if problem}
    <p class="text-xs text-coral" role="alert">{problem}</p>
  {/if}
</section>

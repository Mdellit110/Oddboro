<script lang="ts">
  // Build an Odd from parts: a face shape, a hairstyle, a top and a bottom, a
  // colour for each, and glasses or none. The plain face is the body's own.
  // Each change shows at once, with a portrait made from the same parts, and
  // costs no drawing: it works on every tool the office runs on. The picker is Michele's from the town arrival (OddMaker),
  // for anyone who would rather pick than wait for a drawing. The parts list
  // is /api/me/parts; each look is rendered and checked by /api/looks/parts.
  import { onMount } from 'svelte';
  import type { LookSpec } from '@oddboro/sprites/look';
  import Pixel from './Pixel.svelte';
  import { call } from './api.ts';
  import type { Drawn } from './LookStudio.svelte';

  export type Built = Drawn & { problems: string[] };

  type Props = {
    name: string;
    /** The look to start from: theirs when changing someone on staff. Otherwise a random one. */
    start?: LookSpec;
    /** Set when changing someone on staff, so their own look is not counted as taken. */
    staffId?: string;
    /** Each look as it is built, or nothing while it renders or when it failed. */
    onlook: (built: Built | undefined) => void;
  };
  let { name, start, staffId, onlook }: Props = $props();

  type Swatch = { name: string; hex: string };
  type Parts = {
    hair: string[];
    top: string[];
    bottom: string[];
    face: string[];
    colours: Record<'hair' | 'skin' | 'cloth' | 'shoes' | 'glasses', Swatch[]>;
  };

  /** The face list's first entry: the body's own face, which a look leaves out. */
  const PLAIN = 'plain';
  const KINDS = ['face', 'hair', 'top', 'bottom'] as const;

  let parts = $state<Parts | undefined>();
  let look = $state<LookSpec | undefined>();
  let built = $state<Built | undefined>();
  let problem = $state('');

  const any = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

  /** A look from random parts and colours, so two hires never start alike. */
  function shuffle() {
    if (!parts) return;
    const p = parts;
    const top = any(p.colours.cloth);
    const face = any([PLAIN, ...p.face]);
    look = {
      ...(face === PLAIN ? {} : { face }),
      hair: any(p.hair),
      top: any(p.top),
      bottom: any(p.bottom),
      colours: {
        hair: any(p.colours.hair).name,
        skin: any(p.colours.skin).name,
        top: top.name,
        bottom: any(p.colours.cloth.filter((c) => c !== top)).name,
        shoes: any(p.colours.shoes).name
      },
      ...(Math.random() < 0.25 ? { glasses: any(p.colours.glasses).name } : {})
    };
  }

  onMount(async () => {
    try {
      parts = await call<Parts>('/api/me/parts');
      if (start) look = start;
      else shuffle();
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    }
  });

  // Render each look as it changes. A reply for an older look is dropped.
  let asked = 0;
  $effect(() => {
    const l = look;
    if (!l) return;
    const n = ++asked;
    onlook(undefined);
    call<Built>('/api/looks/parts', { look: l, staffId }).then(
      (b) => {
        if (n !== asked) return;
        built = b;
        problem = b.problems.join('; ');
        onlook(b);
      },
      (e) => {
        if (n === asked) problem = e instanceof Error ? e.message : String(e);
      }
    );
  });

  const shown = (kind: (typeof KINDS)[number]) =>
    kind === 'face' ? (look?.face ?? PLAIN) : (look?.[kind] ?? '');

  function cycle(kind: (typeof KINDS)[number], dir: 1 | -1) {
    if (!look || !parts) return;
    const list = kind === 'face' ? [PLAIN, ...parts.face] : parts[kind];
    const next = list[(list.indexOf(shown(kind)) + dir + list.length) % list.length];
    if (kind !== 'face') look = { ...look, [kind]: next };
    else {
      const { face: _, ...rest } = look;
      look = next === PLAIN ? rest : { ...rest, face: next };
    }
  }

  function colour(role: 'skin' | 'hair' | 'top' | 'bottom' | 'shoes', swatch: string) {
    if (!look) return;
    look = { ...look, colours: { ...look.colours, [role]: swatch } };
  }

  function glasses(swatch: string | undefined) {
    if (!look) return;
    const { glasses: _, ...rest } = look;
    look = swatch ? { ...rest, glasses: swatch } : rest;
  }

  const ROLES = [
    { role: 'skin', group: 'skin', label: 'Skin' },
    { role: 'hair', group: 'hair', label: 'Hair' },
    { role: 'top', group: 'cloth', label: 'Top' },
    { role: 'bottom', group: 'cloth', label: 'Bottom' },
    { role: 'shoes', group: 'shoes', label: 'Shoes' }
  ] as const;
  const words = (s: string) => s.replace(/-/g, ' ');
  const who = $derived(name.trim() || 'New hire');
</script>

<section class="flex flex-col gap-3" aria-label="Build from parts">
  <div class="flex items-end justify-center gap-4 rounded-xl bg-raise p-3">
    {#if built}
      <Pixel
        src={built.portrait}
        scale={2}
        label={`${who}, portrait`}
        class="block overflow-hidden rounded-lg"
      />
      {#each ['idle-down-0', 'idle-side-0', 'idle-up-0'] as f (f)}
        <Pixel
          src={built.sheet}
          crop={{ x: built.frames[f] ?? 0, y: 0, w: 16, h: 32 }}
          scale={3}
          label={f === 'idle-down-0' ? `${who}, from the front` : ''}
          class="block"
        />
      {/each}
    {:else}
      <div class="grid h-24 place-items-center text-sm text-muted">Putting them together…</div>
    {/if}
  </div>

  {#if parts && look}
    <div class="flex flex-col gap-1.5">
      {#each KINDS as kind (kind)}
        <div class="flex items-center gap-2 text-sm">
          <span class="w-14 text-xs text-muted capitalize">{kind}</span>
          <button
            class="rounded-full bg-raise px-2 text-ink hover:bg-sea/20"
            aria-label={`Previous ${kind}`}
            onclick={() => cycle(kind, -1)}>‹</button
          >
          <span class="flex-1 text-center text-ink capitalize">{words(shown(kind))}</span>
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

    <button
      class="self-start text-xs text-muted underline underline-offset-2 hover:text-ink"
      onclick={shuffle}>Shuffle</button
    >
  {/if}

  {#if problem}
    <p class="rounded-lg bg-coral/15 px-3 py-2 text-xs text-coral" role="alert">{problem}</p>
  {/if}
</section>

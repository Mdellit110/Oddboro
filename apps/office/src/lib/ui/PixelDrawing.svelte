<script lang="ts">
  import { onMount } from 'svelte';

  type Props = { name: string; redraw?: boolean; photo?: boolean };
  let { name, redraw = false, photo = false }: Props = $props();

  // What the office is doing, by how long it has been at it. From words a draw
  // takes one to two minutes; from a headshot, a likeness and a second look
  // take five to seven. The stages are a fair guess at where it is.
  const FROM_WORDS = [
    { at: 0, text: 'Reading the description' },
    { at: 8, text: 'Picking hair and clothes' },
    { at: 20, text: 'Mixing their colours' },
    { at: 35, text: 'Drawing the portrait' },
    { at: 60, text: 'Checking all 57 frames' },
    { at: 80, text: 'Touching up' },
    { at: 120, text: 'A second pass, nearly there' }
  ];
  const FROM_PHOTO = [
    { at: 0, text: 'Studying the photo' },
    { at: 40, text: 'Matching hair and skin' },
    { at: 90, text: 'Picking hair and clothes' },
    { at: 130, text: 'Drawing the portrait' },
    { at: 190, text: 'Comparing it with the photo' },
    { at: 260, text: 'Fixing what differs' },
    { at: 380, text: 'Checking all 57 frames' }
  ];
  const stages = $derived(photo ? FROM_PHOTO : FROM_WORDS);
  const SEGMENTS = 20;
  const SIZE = 32;

  let canvas: HTMLCanvasElement | undefined = $state();
  let seconds = $state(0);
  const stage = $derived(stages.findLast((s) => seconds >= s.at)!.text);
  /** Fills quickly, then slows, and never claims to be finished. */
  const filled = $derived(
    Math.min(SEGMENTS - 1, Math.round(SEGMENTS * (1 - Math.exp(-seconds / (photo ? 200 : 45)))))
  );
  const clock = $derived(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);

  /** A bust on a 32 x 32 grid: which colour role each pixel takes, or none. */
  function bust(): ('bg' | 'hair' | 'skin' | 'top' | 'ink')[][] {
    const g: ('bg' | 'hair' | 'skin' | 'top' | 'ink')[][] = [];
    for (let y = 0; y < SIZE; y++) {
      g.push([]);
      for (let x = 0; x < SIZE; x++) {
        const head = (x - 16) ** 2 / 49 + (y - 13) ** 2 / 64;
        const hair = (x - 16) ** 2 / 64 + (y - 11) ** 2 / 64;
        const shoulders = y > 23 && Math.abs(x - 16) < 6 + (y - 23) * 1.6;
        const eye = (y === 14 && (x === 13 || x === 19)) || (y === 18 && x >= 15 && x <= 17);
        g[y].push(
          eye && head < 1
            ? 'ink'
            : head < 1 && y >= 10
              ? 'skin'
              : hair < 1 && y < 13
                ? 'hair'
                : shoulders
                  ? 'top'
                  : 'bg'
        );
      }
    }
    return g;
  }

  onMount(() => {
    const started = Date.now();
    const timer = setInterval(() => (seconds = Math.floor((Date.now() - started) / 1000)), 1000);
    const c = canvas!;
    c.width = SIZE;
    c.height = SIZE;
    const ctx = c.getContext('2d')!;
    const css = getComputedStyle(c);
    const token = (n: string) => css.getPropertyValue(`--color-${n}`).trim() || '#888';
    const grid = bust();
    const order = grid
      .flatMap((row, y) => row.map((_, x) => [x, y] as const))
      .sort(() => Math.random() - 0.5);
    // Each portrait is painted in a fresh set of the office's colours.
    const sets = [
      { hair: 'ember', skin: 'coral', top: 'sea' },
      { hair: 'ink', skin: 'ember', top: 'moss' },
      { hair: 'moss', skin: 'coral', top: 'ember' },
      { hair: 'coral', skin: 'ember', top: 'sea-deep' }
    ];
    let set = 0;
    let i = 0;
    const paint = (x: number, y: number) => {
      const role = grid[y][x];
      const s = sets[set % sets.length];
      ctx.fillStyle =
        role === 'bg'
          ? (x + y) % 2
            ? token('night')
            : token('raise')
          : token(role === 'ink' ? 'night' : s[role]);
      ctx.fillRect(x, y, 1, 1);
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const [x, y] of order) paint(x, y);
      return () => clearInterval(timer);
    }
    let frame = 0;
    const step = () => {
      // About 24 pixels a beat; a finished bust holds, then a new one starts.
      for (let n = 0; n < 24 && i < order.length; n++, i++) paint(...order[i]);
      if (i >= order.length && ++frame > 20) {
        i = 0;
        frame = 0;
        set++;
      }
      if (i < order.length) {
        // The brush: one bright pixel where the next stroke lands.
        const [bx, by] = order[i];
        ctx.fillStyle = token('ink');
        ctx.fillRect(bx, by, 1, 1);
      }
    };
    const beat = setInterval(step, 70);
    return () => {
      clearInterval(timer);
      clearInterval(beat);
    };
  });
</script>

<div class="flex items-center gap-3 rounded-xl bg-raise p-3" role="status" aria-live="polite">
  <canvas
    bind:this={canvas}
    class="size-24 shrink-0 rounded-lg [image-rendering:pixelated]"
    aria-hidden="true"
  ></canvas>
  <div class="min-w-0 flex-1">
    <div class="font-pixel text-sm text-ink">
      {redraw ? 'Redrawing' : 'Drawing'}
      {name || 'them'}<span class="cursor">_</span>
    </div>
    <div class="mt-1 text-xs text-muted">{stage}</div>
    <div class="mt-2 flex gap-[2px]" aria-hidden="true">
      {#each { length: SEGMENTS } as _, n (n)}
        <span class="h-2 flex-1 {n < filled ? 'bg-sea' : 'bg-night/60'}"></span>
      {/each}
    </div>
    <div class="mt-1 flex justify-between text-[10px] text-faint">
      <span>{photo ? 'From a headshot: 5 to 7 minutes' : 'Usually one to two minutes'}</span>
      <span class="font-pixel">{clock}</span>
    </div>
  </div>
</div>

<style>
  .cursor {
    animation: blink 1s steps(1) infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .cursor {
      animation: none;
    }
  }
</style>

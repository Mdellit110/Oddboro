<script lang="ts">
  // The floor states as six vignettes cut from a real office. Each card
  // reveals, then its Odd steps in and a bubble says what they are doing.
  // While the section is on screen each Odd plays what the office plays
  // there in short bursts, each card on its own random clock, and rests on
  // its still between them. What never stops in a real room, the library
  // fire, loops steadily instead. Off screen, in a hidden tab and under
  // reduced motion nothing runs.
  import SectionHeader from '#lib/components/SectionHeader.svelte';
  import { reducedMotion, reveal, visible } from '#lib/motion/index.ts';
  import vignettes from '#lib/vignettes.json';

  const states = [
    { id: 'desk', title: 'At a desk.', line: 'Working on a task.', bubble: 'working', ask: false },
    {
      id: 'mail',
      title: 'In the mail room.',
      line: 'Sorting new work as it comes in.',
      bubble: 'sorting',
      ask: false
    },
    {
      id: 'library',
      title: 'In the library.',
      line: 'Reading and researching.',
      bubble: 'reading',
      ask: false
    },
    {
      id: 'reception',
      title: 'On its own.',
      line: 'Handling what you cleared it to do.',
      bubble: 'on it',
      ask: false
    },
    {
      id: 'door',
      title: 'Outside your door.',
      line: 'Waiting on a decision only you can make.',
      bubble: 'needs you',
      ask: true
    },
    {
      id: 'chat',
      title: 'At your desk.',
      line: 'Talking it through with you.',
      bubble: 'chatting',
      ask: false
    }
  ];
  const item = (id: string) => vignettes.items.find((v) => v.id === id)!;
  /** How long a burst plays, in seconds: whole loops of each strip. */
  const PLAY = 2.5;
  /** Seconds before a card's first burst, and of rest after each one, rolled each time. */
  const FIRST = [1.5, 6];
  const PAUSE = [3, 8];
  /** The custom properties one strip of `frames` at `fps` plays by. */
  const strip = ({ frames, fps }: { frames: number; fps: number }) => {
    const loop = frames / fps;
    return [
      `width:${frames * 100}%`,
      `--vig-n:${frames}`,
      `--vig-d:${loop.toFixed(3)}s`,
      `--vig-k:${Math.max(1, Math.round(PLAY / loop))}`,
      `--vig-end:${(-((frames - 1) / frames) * 100).toFixed(4)}%`
    ].join(';');
  };

  // Each card's clock is one setTimeout at a time. A burst flips data-play
  // between a and b, which restarts the CSS animation; the strips end on
  // their still by themselves.
  const cards: HTMLElement[] = $state([]);
  const timers: ReturnType<typeof setTimeout>[] = [];
  const roll = ([lo, hi]: number[]) => (lo + Math.random() * (hi - lo)) * 1000;
  const schedule = (i: number, wait: number) => {
    timers[i] = setTimeout(() => {
      const card = cards[i];
      card.dataset.play = card.dataset.play === 'a' ? 'b' : 'a';
      schedule(i, PLAY * 1000 + roll(PAUSE));
    }, wait);
  };
  let list: HTMLElement;
  let onScreen = false;
  const update = () => {
    timers.forEach((t) => clearTimeout(t));
    cards.forEach((c) => delete c.dataset.play);
    const live = onScreen && document.visibilityState === 'visible' && !reducedMotion();
    // data-live runs the steady loops; without it they hold where they are.
    list.toggleAttribute('data-live', live);
    if (!live) return;
    cards.forEach((_, i) => schedule(i, roll(FIRST)));
  };
  $effect(() => () => timers.forEach((t) => clearTimeout(t)));
</script>

<SectionHeader
  eyebrow="How it works"
  title="Watch your AI work."
  lede="Most AI works where you can't see it. Odds work on a floor in front of you, and each one walks to the spot that matches its task. One glance tells you what the whole office is doing."
/>

<svelte:document onvisibilitychange={update} />

<ol
  bind:this={list}
  class="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
  use:visible={(on) => {
    onScreen = on;
    update();
  }}
>
  {#each states as s, i (s.id)}
    {@const v = item(s.id)}
    <li
      bind:this={cards[i]}
      use:reveal={{ delay: i * 120 }}
      class="bg-raise border-hairline rounded-card flex flex-col overflow-hidden border"
    >
      <div
        class="pixel bg-night relative w-full overflow-hidden"
        style:aspect-ratio="{vignettes.w} / {vignettes.h}"
        role="img"
        aria-label="{s.title} An Odd {s.line.toLowerCase().replace(/\.$/, '')}."
      >
        <!-- The room, the prop's changing pixels (a steady loop), the Odd (in bursts), what stands in
             front of the Odd, and the day's dust. Each strip is its frames
             side by side, stepped through by transform. -->
        <div
          class="art absolute inset-0"
          style="background-image:var(--art-vignette-{s.id});background-size:100% 100%"
        ></div>
        {#if 'propAnim' in v && v.propAnim}
          <div
            class="art vignette-loop absolute inset-y-0 start-0"
            style="background-image:var(--art-vignette-{s.id}-prop-anim);background-size:100% 100%;{strip(
              v.propAnim
            )}"
          ></div>
        {/if}
        <div class="vignette-staff absolute inset-0">
          <div
            class="art vignette-strip absolute inset-y-0 start-0"
            style="background-image:var(--art-vignette-{s.id}-staff-anim);background-size:100% 100%;{strip(
              v.staffAnim
            )}"
          ></div>
        </div>
        <div
          class="art absolute inset-0"
          style="background-image:var(--art-vignette-{s.id}-front);background-size:100% 100%"
        ></div>
        {#if 'dust' in v && v.dust}
          <div
            class="art vignette-dust absolute inset-0"
            style="background-image:var(--art-vignette-{s.id}-dust);background-size:100% 100%"
          ></div>
        {/if}
        <span
          class="vignette-bubble glass border-hairline text-ink absolute rounded-full border px-2.5 py-1 font-sans text-xs font-medium whitespace-nowrap {s.ask
            ? 'bubble-ask'
            : ''}"
          style:left="{(v.head.x / vignettes.w) * 100}%"
          style:top="{((v.head.y - 2) / vignettes.h) * 100}%"
          aria-hidden="true"
        >
          {s.bubble}
        </span>
      </div>
      <div class="border-hairline border-t px-5 py-4">
        <p class="text-faint font-pixel text-sm">0{i + 1}</p>
        <h3 class="text-ink mt-1 text-lg font-semibold">{s.title}</h3>
        <p class="text-muted mt-1 text-[15px]">{s.line}</p>
      </div>
    </li>
  {/each}
</ol>

<style>
  .bubble-ask {
    color: var(--color-night);
    background: var(--color-ember);
    border-color: var(--color-ember);
  }
</style>

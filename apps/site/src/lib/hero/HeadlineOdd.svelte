<script lang="ts">
  // A small Odd beside "Odds." in the hero headline, a different one every few
  // seconds. All seven portraits sit stacked in one box from the first paint,
  // so a swap never waits on a fetch and never changes the line's width. The
  // swap runs only while the box is on screen and the tab is visible, and never
  // under reduced motion, where the first Odd simply stays.
  import { onMount } from 'svelte';
  import { reducedMotion, visible } from '#lib/motion/index.ts';

  const ODDS = ['juno', 'ziva', 'theo', 'cindy', 'marshall', 'ada', 'jamal'];
  /** Milliseconds each Odd stays before the next one pops in. */
  const HOLD = 3000;

  let current = $state(0);
  let onScreen = false;
  let reduced = true;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function stop() {
    clearTimeout(timer);
    timer = undefined;
  }

  function start() {
    if (reduced || timer || !onScreen || document.hidden) return;
    timer = setTimeout(() => {
      timer = undefined;
      current = (current + 1) % ODDS.length;
      start();
    }, HOLD);
  }

  function seen(on: boolean) {
    onScreen = on;
    if (on) start();
    else stop();
  }

  onMount(() => {
    reduced = reducedMotion();
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);
    start();
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  });
</script>

<span class="headline-odd pixel" aria-hidden="true" use:visible={seen}>
  {#each ODDS as id, i (id)}
    <img
      src="/art/portrait-{id}.png"
      alt=""
      width="48"
      height="48"
      draggable="false"
      class:is-on={i === current}
    />
  {/each}
</span>

<style>
  .headline-odd {
    position: relative;
    display: inline-block;
    flex: none;
    inline-size: 48px;
    block-size: 48px;
  }

  .headline-odd img {
    position: absolute;
    inset: 0;
    inline-size: 100%;
    block-size: 100%;
    border-radius: 6px;
    opacity: 0;
    transform: scale(0.82);
    transition:
      opacity 0.24s ease,
      transform 0.32s cubic-bezier(0.2, 0.7, 0.2, 1);
  }

  .headline-odd img.is-on {
    opacity: 1;
    transform: scale(1);
  }

  @media (prefers-reduced-motion: reduce) {
    .headline-odd img {
      transition: none;
    }
  }
</style>

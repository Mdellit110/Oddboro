<script lang="ts">
  import {
    back,
    music,
    next,
    seek,
    setVolume,
    titleOf,
    toggleLove,
    toggleMute,
    togglePass,
    togglePlay,
    toggleRepeat
  } from './music.svelte.ts';

  // The bottom of the start panel. The music player on the start side: the
  // track playing; love it, back, play, next, repeat it, pass on it; the seek
  // bar, and the speaker, which opens the volume. Stacked on the end side, the
  // same width: the light on the
  // floor (Auto follows the office's clock, the sun and the moon hold it at
  // midday or at night, for the owner's eyes only), and under it the zoom: Fit
  // shows the whole office in the room the panels leave, and the minus and plus
  // step a level out or in.
  export type Light = 'auto' | 'day' | 'night';
  type Props = { light: Light; onfit: () => void; onzoom: (dir: 1 | -1) => void };
  let { light = $bindable(), onfit, onzoom }: Props = $props();

  const LIGHTS: { id: Light; label: string }[] = [
    { id: 'auto', label: 'Light follows the office clock' },
    { id: 'day', label: 'Always daytime' },
    { id: 'night', label: 'Always nighttime' }
  ];

  const title = $derived(titleOf(music.current));
  const loved = $derived(!!music.current && music.loved.includes(music.current));
  const passed = $derived(!!music.current && music.passed.includes(music.current));

  const clock = (t: number) =>
    `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  // The volume opens over the speaker and closes on a click anywhere else or Escape.
  let volOpen = $state(false);
  let volBox = $state<HTMLElement>();
  let volButton = $state<HTMLButtonElement>();
  $effect(() => {
    if (!volOpen) return;
    const away = (e: PointerEvent) => {
      if (!volBox?.contains(e.target as Node)) volOpen = false;
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      volOpen = false;
      volButton?.focus();
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  });
</script>

{#snippet speaker()}
  <svg viewBox="0 0 16 16" class="size-3.5" aria-hidden="true">
    <path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" />
    {#if music.volume > 0}
      <path
        d="M11 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6 6 0 0 1 0 9"
        stroke="currentColor"
        stroke-width="1.5"
        fill="none"
      />
    {:else}
      <path d="M11 6l4 4M15 6l-4 4" stroke="currentColor" stroke-width="1.5" />
    {/if}
  </svg>
{/snippet}

<div class="flex items-center justify-between gap-3 text-xs">
  <div class="min-w-0 flex-1">
    <div class="flex min-w-0 items-center gap-1.5" {title} aria-live="polite">
      <svg viewBox="0 0 16 16" class="size-3.5 shrink-0 text-sea" aria-hidden="true">
        <path d="M6 12V4.2l7-1.5v7.8" fill="none" stroke="currentColor" stroke-width="1.4" />
        <circle cx="4.3" cy="12" r="1.9" fill="currentColor" />
        <circle cx="11.3" cy="10.5" r="1.9" fill="currentColor" />
      </svg>
      {#if title}
        <span class="truncate font-semibold text-ink"
          ><span class="sr-only">Playing </span>{title}</span
        >
      {:else}
        <span class="truncate text-muted">Music</span>
      {/if}
    </div>
    <div class="mt-1 flex items-center justify-between gap-0.5" role="group" aria-label="Music">
      <button
        class="ctl"
        class:on={loved}
        aria-pressed={loved}
        aria-label="Love this track"
        title="Love this track: it comes up more often"
        disabled={!music.current}
        onclick={toggleLove}
      >
        <svg viewBox="0 0 16 16" class="size-3.5" aria-hidden="true">
          <path
            d="M8 13.5S2.5 10.2 2.5 6.3A2.8 2.8 0 0 1 8 5a2.8 2.8 0 0 1 5.5 1.3c0 3.9-5.5 7.2-5.5 7.2z"
            fill={loved ? 'currentColor' : 'none'}
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <div class="flex items-center gap-0.5">
        <button class="ctl" aria-label="Back" title="Back" onclick={back}>
          <svg viewBox="0 0 16 16" class="size-3.5" aria-hidden="true">
            <path d="M3 3h2v10H3zM13 3v10L6 8z" fill="currentColor" />
          </svg>
        </button>
        <button
          class="ctl play"
          aria-label={music.playing ? 'Pause the music' : 'Play the music'}
          title={music.playing ? 'Pause' : 'Play'}
          onclick={togglePlay}
        >
          <svg viewBox="0 0 16 16" class="size-3.5" aria-hidden="true">
            {#if music.playing}
              <path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor" />
            {:else}
              <path d="M5 3l8 5-8 5z" fill="currentColor" />
            {/if}
          </svg>
        </button>
        <button class="ctl" aria-label="Next track" title="Next" onclick={next}>
          <svg viewBox="0 0 16 16" class="size-3.5" aria-hidden="true">
            <path d="M11 3h2v10h-2zM3 3v10l7-5z" fill="currentColor" />
          </svg>
        </button>
        <button
          class="ctl"
          class:on={music.repeat}
          aria-pressed={music.repeat}
          aria-label="Repeat this track"
          title="Repeat this track"
          onclick={toggleRepeat}
        >
          <svg viewBox="0 0 16 16" class="size-3.5" aria-hidden="true">
            <path
              d="M2.5 7.5V6A2 2 0 0 1 4.5 4H12M10 2l2 2-2 2M13.5 8.5V10a2 2 0 0 1-2 2H4M6 10l-2 2 2 2"
              fill="none"
              stroke="currentColor"
              stroke-width="1.3"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path d="M7.6 6.6L8.6 6v4" fill="none" stroke="currentColor" stroke-width="1.1" />
          </svg>
        </button>
      </div>
      <button
        class="ctl"
        class:on={passed}
        aria-pressed={passed}
        aria-label="Pass on this track"
        title="Pass on this track: it stops coming up"
        disabled={!music.current}
        onclick={togglePass}
      >
        <svg viewBox="0 0 16 16" class="size-3.5" aria-hidden="true">
          <path
            d="M5.5 2.5h5.6a1.4 1.4 0 0 1 1.37 1.1l1 4.6a1.4 1.4 0 0 1-1.37 1.7H9.2l.5 2.4a1.3 1.3 0 0 1-2.4.9L5.5 9.5zM2.5 2.5h1.5v7H2.5z"
            fill={passed ? 'currentColor' : 'none'}
            stroke="currentColor"
            stroke-width="1.3"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>
    <div class="mt-1 flex min-w-0 items-center gap-1.5">
      <span class="w-7 shrink-0 text-end text-[10px] text-faint tabular-nums"
        >{clock(music.time)}</span
      >
      <label class="sr-only" for="floor-seek">Where in the track</label>
      <input
        id="floor-seek"
        class="range min-w-0 flex-1"
        type="range"
        min="0"
        max={music.duration || 1}
        step="1"
        value={music.time}
        aria-valuetext={`${clock(music.time)} of ${clock(music.duration)}`}
        disabled={!music.duration}
        oninput={(e) => seek(Number(e.currentTarget.value))}
      />
      <span class="w-7 shrink-0 text-[10px] text-faint tabular-nums">{clock(music.duration)}</span>
      <div class="relative shrink-0" bind:this={volBox}>
        <button
          class="ctl"
          bind:this={volButton}
          aria-expanded={volOpen}
          aria-controls="floor-volume-pop"
          aria-label="Volume"
          title="Volume"
          onclick={() => (volOpen = !volOpen)}
        >
          {@render speaker()}
        </button>
        {#if volOpen}
          <div class="absolute inset-x-0 bottom-full z-20 mb-2 flex justify-center">
            <!-- Solid, not glass: it opens on the blurred panel, and a blur
                 inside a blur makes newer WebKitGTK (the Linux app) drop the
                 panel's own. -->
            <div
              id="floor-volume-pop"
              class="flex flex-col items-center gap-1.5 rounded-xl bg-panel-solid px-1 py-2 shadow-float"
            >
              <label class="sr-only" for="floor-volume">Music volume</label>
              <div class="upright">
                <input
                  id="floor-volume"
                  class="range"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  aria-orientation="vertical"
                  value={music.volume}
                  oninput={(e) => setVolume(Number(e.currentTarget.value))}
                />
              </div>
              <button
                class="ctl"
                aria-pressed={music.volume === 0}
                aria-label={music.volume === 0 ? 'Unmute the music' : 'Mute the music'}
                title={music.volume === 0 ? 'Unmute' : 'Mute'}
                onclick={toggleMute}
              >
                {@render speaker()}
              </button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
  <div
    class="flex w-40 shrink-0 flex-col justify-center gap-1.5 self-stretch border-s border-hairline ps-3"
  >
    <div class="flex rounded-full bg-raise p-0.5" role="radiogroup" aria-label="Light on the floor">
      {#each LIGHTS as l (l.id)}
        <button
          class="light grid h-6 min-w-7 flex-1 place-items-center rounded-full px-2 text-muted hover:text-ink"
          class:on={light === l.id}
          role="radio"
          aria-checked={light === l.id}
          aria-label={l.label}
          title={l.label}
          onclick={() => (light = l.id)}
        >
          {#if l.id === 'auto'}
            Auto
          {:else if l.id === 'day'}
            <svg viewBox="0 0 16 16" class="size-3.5" aria-hidden="true">
              <circle cx="8" cy="8" r="3" fill="currentColor" />
              <path
                d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3"
                stroke="currentColor"
                stroke-width="1.3"
                stroke-linecap="round"
              />
            </svg>
          {:else}
            <svg viewBox="0 0 16 16" class="size-3.5" aria-hidden="true">
              <path d="M10.5 2.5a5.5 5.5 0 1 0 3 9.5 5 5 0 0 1-3-9.5z" fill="currentColor" />
            </svg>
          {/if}
        </button>
      {/each}
    </div>
    <div class="flex rounded-full bg-raise p-0.5" role="group" aria-label="Zoom">
      <button
        class="grid h-6 flex-1 place-items-center rounded-full px-2 text-muted hover:text-ink"
        title="Fit the whole office"
        onclick={onfit}>Fit</button
      >
      <button
        class="grid h-6 min-w-7 flex-1 place-items-center rounded-full text-muted hover:text-ink"
        aria-label="Zoom out"
        title="Zoom out"
        onclick={() => onzoom(-1)}>−</button
      >
      <button
        class="grid h-6 min-w-7 flex-1 place-items-center rounded-full text-muted hover:text-ink"
        aria-label="Zoom in"
        title="Zoom in"
        onclick={() => onzoom(1)}>+</button
      >
    </div>
  </div>
</div>

<style>
  .light.on {
    background: var(--color-sea);
    color: var(--color-night);
  }
  .ctl {
    display: grid;
    place-items: center;
    inline-size: 1.5rem;
    block-size: 1.5rem;
    border-radius: 9999px;
    color: var(--color-muted);
  }
  .ctl:hover:not(:disabled),
  .ctl:focus-visible {
    color: var(--color-ink);
  }
  .ctl:disabled {
    opacity: 0.4;
  }
  .ctl.on {
    color: var(--color-sea);
  }
  .ctl.play {
    background: var(--color-raise);
    color: var(--color-ink);
  }
  .range {
    accent-color: var(--color-sea);
  }
  .range:disabled {
    opacity: 0.4;
  }
  /* Bottom to top: quiet at the bottom. A plain slider turned upright, since
     WebKitGTK (the Linux app) draws a vertical writing-mode slider as an empty
     box that does not drag. The box holds the upright space. The slider is as
     long as the box is tall, and its margins centre it on the box, since
     WebKitGTK lines up an item wider than its grid cell at the start. */
  .upright {
    display: grid;
    inline-size: 1.25rem;
    block-size: 6rem;
    place-content: center;
  }
  .upright input {
    inline-size: 6rem;
    block-size: 1.25rem;
    margin-inline: calc((1.25rem - 6rem) / 2);
    rotate: -90deg;
  }
</style>

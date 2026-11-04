<script lang="ts">
  // A goal moving through its plan: three steps joined by a line from one
  // number to the next that draws down with the scroll, next to the goal it serves.
  import SectionHeader from '#lib/components/SectionHeader.svelte';
  import { reveal, stagger } from '#lib/motion/index.ts';

  const steps = [
    {
      title: 'You set a goal.',
      text: 'One line, why it matters, and what done looks like. Set it yourself, or approve one your manager heard in chat.'
    },
    {
      title: 'Your manager plans it.',
      text: 'Who does what, on what schedule, with which tools, and what only you can do. Odds already here take a part before you hire a new one.'
    },
    {
      title: 'You approve the parts you want.',
      text: 'Odds start on them at once.'
    }
  ];
  const parts = [
    { who: 'Ada', what: "Pick next month's book from your list, on the 25th." },
    { who: 'Theo', what: 'Poke you at 9 to read, four nights a week.' },
    { who: 'You', what: 'Turn the pages. Only you can.' }
  ];
</script>

<div
  class="grid items-start gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-stretch lg:gap-20"
>
  <!-- At lg the goal card sits at the foot of its column, level with the end of the plan. -->
  <div class="flex flex-col gap-10">
    <SectionHeader
      eyebrow="Goals"
      title="Start with what you want more of."
      lede="Time to read, a launch out the door, an hour back in your evening. Your Office Manager turns each goal into a plan for your yes."
    />
    <div
      use:reveal={{ delay: 120 }}
      class="goal rounded-card border-hairline bg-panel-solid border p-6 lg:mt-auto"
    >
      <p class="text-ember text-xs font-semibold tracking-wide uppercase">Goal</p>
      <p class="font-pixel text-ink mt-2 text-2xl font-semibold">More time to read.</p>
      <dl class="text-muted mt-8 space-y-2 text-[15px]">
        <div class="flex gap-3">
          <dt class="text-faint w-20 shrink-0 text-xs font-semibold tracking-wide uppercase">
            Why
          </dt>
          <dd>It is the first thing to go when the week gets busy.</dd>
        </div>
        <div class="flex gap-3">
          <dt class="text-faint w-20 shrink-0 text-xs font-semibold tracking-wide uppercase">
            Done when
          </dt>
          <dd>A book a month, for three months.</dd>
        </div>
      </dl>
    </div>
  </div>

  <ol use:stagger={{ step: 160 }} class="goal-plan relative lg:pt-12">
    {#each steps as s, i (s.title)}
      <li class="relative ps-14 pb-10 last:pb-0">
        {#if i < steps.length - 1}
          <!-- The line runs from this step's number to the next one's, so it ends at the last. -->
          <span
            class="goal-line bg-sea absolute start-[1.1rem] top-2 -bottom-2 w-0.5 opacity-70"
            data-seg={i}
            aria-hidden="true"
          ></span>
        {/if}
        <!-- An opaque disc, so the line never shows through, with the ring and number
             on top: those dim until the line reaches them. -->
        <span class="bg-night absolute start-0 top-0 size-9 rounded-full" aria-hidden="true">
          <span
            class="goal-step font-pixel text-sea border-sea flex size-full items-center justify-center rounded-full border-2 text-base font-semibold"
            data-step={i}>{i + 1}</span
          >
        </span>
        <h3 class="text-ink pt-1.5 text-lg font-semibold">{s.title}</h3>
        <p class="text-muted mt-1 text-[15px] leading-relaxed">{s.text}</p>
        {#if i === 2}
          <ul
            class="border-hairline bg-raise mt-4 divide-y divide-[var(--color-hairline)] rounded-lg border"
          >
            {#each parts as p (p.who)}
              <li class="flex items-center gap-3 px-4 py-2.5 text-sm">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  class="text-moss shrink-0"
                  aria-hidden="true"
                >
                  <rect
                    x="1"
                    y="1"
                    width="16"
                    height="16"
                    rx="4"
                    fill="var(--color-sea-deep)"
                    stroke="currentColor"
                    stroke-width="1.5"
                  />
                  <path
                    d="M5 9.5l2.5 2.5L13 6.5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                <span class="text-ink w-10 shrink-0 font-semibold">{p.who}</span>
                <span class="text-muted">{p.what}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </li>
    {/each}
  </ol>
</div>

<style>
  .goal {
    box-shadow: var(--shadow-float);
  }
</style>

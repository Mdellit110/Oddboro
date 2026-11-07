<script lang="ts">
  // A connector guide: the header, what to know first, the parts of numbered
  // steps, then the fixes. Wide, so each step's box sits beside its words on
  // a laptop and under them on a phone, and the page runs about half as long.
  import type { Snippet } from 'svelte';
  import CopyBox from '#lib/components/CopyBox.svelte';
  import LinkBox from '#lib/components/LinkBox.svelte';
  import type { Part, Trouble } from '#lib/guides/types.ts';
  import { reveal } from '#lib/motion/index.ts';

  let {
    title,
    lede,
    parts,
    trouble = [],
    intro,
    before,
    after
  }: {
    title: string;
    lede: string;
    parts: Part[];
    trouble?: Trouble[];
    /** What the service is, or why it works the way it does. */
    intro?: Snippet;
    /** What the owner needs before step one. */
    before?: Snippet;
    /** Anything after the parts, such as how to try it. */
    after?: Snippet;
  } = $props();
</script>

<article class="mx-auto max-w-6xl px-4 pt-14 pb-24 sm:px-6 lg:px-8">
  <header use:reveal class="border-hairline border-b pb-8">
    <p class="text-sea mb-3 text-sm font-semibold tracking-wide uppercase">Connectors</p>
    <h1 class="font-pixel text-ink text-4xl leading-[1.05] sm:text-5xl">{title}</h1>
    <p class="text-muted mt-5 max-w-3xl text-lg leading-relaxed">{lede}</p>
  </header>

  {#if intro || before}
    <div class="mt-10 grid gap-8 lg:grid-cols-2">
      {#if intro}
        <section use:reveal>{@render intro()}</section>
      {/if}
      {#if before}
        <section use:reveal class="bg-raise border-hairline rounded-xl border p-5 sm:p-6">
          <h2 class="font-pixel text-ink text-2xl">Before you start</h2>
          {@render before()}
        </section>
      {/if}
    </div>
  {/if}

  {#each parts as part, p (part.title)}
    <section use:reveal class="mt-14">
      <h2 class="font-pixel text-ink text-2xl">
        <span class="text-sea">Part {p + 1}.</span>
        {part.title}
      </h2>
      {#if part.intro}
        <p class="text-muted mt-3 max-w-3xl leading-relaxed">{part.intro}</p>
      {/if}
      <ol class="mt-6 flex flex-col gap-5">
        {#each part.steps as s, i (i)}
          {@const box = s.copy ?? s.link ?? s.example}
          <li class="grid gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-8">
            <div class="flex gap-4 {box ? '' : 'lg:col-span-2'}">
              <span
                class="bg-sea text-night font-pixel grid size-8 shrink-0 place-items-center rounded-lg text-sm"
                aria-hidden="true">{i + 1}</span
              >
              <div class="min-w-0 flex-1 pt-1">
                <p class="text-ink leading-relaxed">{s.text}</p>
                {#if s.detail}
                  <p class="text-muted mt-1 text-sm leading-relaxed">{s.detail}</p>
                {/if}
              </div>
            </div>
            {#if box}
              <div class="min-w-0 ps-12 lg:ps-0">
                {#if s.copy}
                  <CopyBox text={s.copy} />
                {:else if s.link}
                  <LinkBox href={s.link} />
                {:else}
                  <code
                    class="bg-raise border-hairline text-muted block rounded-lg border px-3 py-2 font-mono text-sm break-all"
                    >{s.example}</code
                  >
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ol>
    </section>
  {/each}

  {#if after}
    <section use:reveal class="mt-14 max-w-3xl">{@render after()}</section>
  {/if}

  {#if trouble.length}
    <section use:reveal class="mt-14">
      <h2 class="font-pixel text-ink text-2xl">If something goes wrong</h2>
      <dl class="mt-5 grid gap-x-10 gap-y-6 lg:grid-cols-2">
        {#each trouble as t (t.q)}
          <div>
            <dt class="text-ink font-medium">{t.q}</dt>
            <dd class="text-muted mt-1 leading-relaxed">{t.a}</dd>
          </div>
        {/each}
      </dl>
    </section>
  {/if}
</article>

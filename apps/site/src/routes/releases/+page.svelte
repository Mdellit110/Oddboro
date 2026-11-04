<script lang="ts">
  // Every build of the newest release, then every release, newest first, each
  // with its own art. The art loops; a visitor who asks for reduced motion
  // gets the last frame as a still instead (the 2026-11-03 site ruling). Each
  // piece comes in both themes, and CSS shows the one that matches
  // data-theme. Both images load lazily, so the hidden one never loads.
  import Meta from '#lib/components/Meta.svelte';
  import { BUILDS, latestHref, versionHref } from '#lib/downloads.svelte.ts';
  import { reveal } from '#lib/motion/index.ts';
  import { RELEASES } from '#lib/releases.ts';
  import { SITE } from '#lib/site.ts';

  const latest = RELEASES[0];
  const THEMES = [
    { theme: 'night', dir: '/art/releases' },
    { theme: 'day', dir: '/art/day/releases' }
  ];
  const builds = (ids: readonly string[]) => BUILDS.filter((b) => ids.includes(b.id));
  const day = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC'
    });
</script>

<Meta
  title="Releases · {SITE.name}"
  description="Every release of {SITE.name}, and every build of the newest one: the Mac app and the Linux AppImages."
  path="/releases/"
  image={latest.art ? `/art/releases/${latest.art.name}-share.png` : undefined}
  imageAlt={latest.art?.shareAlt}
/>

<article class="mx-auto max-w-7xl px-4 pt-14 pb-24 sm:px-6 lg:px-8">
  <header use:reveal class="border-hairline max-w-3xl border-b pb-8">
    <p class="text-sea mb-3 text-sm font-semibold tracking-wide uppercase">Releases</p>
    <h1 class="font-pixel text-ink text-4xl leading-[1.05] font-semibold sm:text-5xl">
      Download {SITE.name}
      {latest.version}
    </h1>
  </header>

  <ul use:reveal class="mt-8 grid max-w-3xl gap-3 sm:grid-cols-3" aria-label="Every build">
    {#each BUILDS as b (b.id)}
      <li>
        <a
          href={latestHref(b)}
          class="border-hairline bg-raise hover:border-sea flex h-full flex-col rounded-lg border px-4 py-3"
        >
          <span class="text-ink text-sm font-semibold">{b.label}</span>
          <span class="text-faint mt-1 font-mono text-xs break-all">{b.file}</span>
        </a>
      </li>
    {/each}
  </ul>
  <p class="text-faint mt-4 max-w-3xl text-sm">
    Every file is also on
    <a href={SITE.releases} rel="noopener" class="hover:text-ink underline underline-offset-2"
      >GitHub</a
    >.
  </p>

  <ol class="mt-16 grid max-w-5xl gap-16">
    {#each RELEASES as r (r.version)}
      <li use:reveal id="v{r.version}" class="grid scroll-mt-24 gap-8 md:grid-cols-[auto_1fr]">
        {#if r.art}
          {#each THEMES as t (t.theme)}
            <picture
              data-art-theme={t.theme}
              class="pixel rounded-card border-hairline bg-night block self-start overflow-hidden border"
            >
              <source srcset="{t.dir}/{r.art.name}.png" media="(prefers-reduced-motion: reduce)" />
              <img
                src="{t.dir}/{r.art.name}.gif"
                alt={r.art.alt}
                width="384"
                height="288"
                loading="lazy"
                class="block"
              />
            </picture>
          {/each}
        {/if}
        <div>
          <p class="text-sea font-pixel text-sm font-semibold">
            {r.version} · <time datetime={r.date}>{day(r.date)}</time>
          </p>
          <h2 class="font-pixel text-ink mt-2 text-3xl leading-tight font-semibold">{r.title}</h2>
          <p class="text-muted mt-3 text-[15px] leading-relaxed">{r.summary}</p>
          <ul class="text-muted mt-4 list-disc space-y-1.5 ps-5 text-[15px] leading-relaxed">
            {#each r.notes as n (n)}
              <li>{n}</li>
            {/each}
          </ul>
          <p class="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {#each builds(r.builds) as b (b.id)}
              <a href={versionHref(b, r.version)} class="text-sea underline underline-offset-2"
                >{b.label}</a
              >
            {/each}
            <a
              href="{SITE.releases}/tag/v{r.version}"
              rel="noopener"
              class="text-muted hover:text-ink underline underline-offset-2">On GitHub</a
            >
          </p>
        </div>
      </li>
    {/each}
  </ol>
</article>

<style>
  /* One theme's art at a time. The night set is the default, as on <html>. */
  :global(html[data-theme='day']) [data-art-theme='night'],
  :global(html:not([data-theme='day'])) [data-art-theme='day'] {
    display: none;
  }
</style>

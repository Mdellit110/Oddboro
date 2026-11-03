<script lang="ts">
  // The license, in a terminal-style block beside the words, with the GitHub
  // link.
  import SectionHeader from '#lib/components/SectionHeader.svelte';
  import GitHubMark from '#lib/components/GitHubMark.svelte';
  import { reveal } from '#lib/motion/index.ts';
  import { SITE } from '#lib/site.ts';
</script>

<!-- At lg the terminal spans only the title-to-buttons row, so its top meets the
     title and its bottom meets the GitHub button; the eyebrow sits in a row of
     its own above. -->
<div class="grid lg:grid-cols-2 lg:gap-x-16">
  <p
    class="text-sea mb-3 text-sm font-semibold tracking-wide uppercase lg:col-start-1 lg:row-start-1"
  >
    Open source
  </p>
  <div class="lg:col-start-1 lg:row-start-2">
    <SectionHeader
      title="Read every line that runs your office."
      lede="Oddboro is open source under Apache 2.0. Change what you like, or fork it and take it somewhere new. The code lives on GitHub, and every contribution carries a Developer Certificate of Origin sign-off."
    />
    <div class="mt-8 flex flex-wrap items-center gap-3">
      <a
        href={SITE.github}
        rel="noopener"
        class="bg-ink text-night flex items-center gap-2 rounded-md px-5 py-3 text-base font-semibold transition-opacity hover:opacity-90"
      >
        <GitHubMark class="size-4" />
        Oddboro on GitHub
      </a>
      <a
        href="{SITE.github}/blob/main/LICENSE"
        rel="noopener"
        class="text-muted hover:text-ink rounded-md px-2 py-3 text-sm font-medium underline-offset-4 hover:underline"
      >
        Read the license
      </a>
    </div>
  </div>

  <div
    use:reveal={{ delay: 150 }}
    class="terminal rounded-card border-hairline bg-night mt-12 flex min-w-0 flex-col border lg:col-start-2 lg:row-start-2 lg:mt-0"
  >
    <div class="border-hairline flex items-center gap-2 border-b px-4 py-3" aria-hidden="true">
      <span class="bg-coral size-2.5 rounded-full opacity-80"></span>
      <span class="bg-ember size-2.5 rounded-full opacity-80"></span>
      <span class="bg-moss size-2.5 rounded-full opacity-80"></span>
      <span class="text-faint ms-2 font-mono text-xs">oddboro</span>
    </div>
    <pre class="flex-1 overflow-x-auto p-5 font-mono text-[13px] leading-relaxed sm:text-sm"><code
        ><span class="text-faint">$</span> <span class="text-ink">ls LICENSE*</span>
<span class="text-sea">LICENSE</span>
<span class="text-muted">  Apache License 2.0. Read it, change it, fork it.</span>
<span class="text-sea">LICENSE-ASSETS</span>
<span class="text-muted">  The music, on its own terms.</span>

<span class="text-faint">$</span> <span class="text-ink">git commit -s</span>
<span class="text-muted">Signed-off-by: you</span>
<span class="text-faint">  # the DCO sign-off, on every contribution</span></code
      ></pre>
  </div>
</div>

<style>
  .terminal {
    box-shadow: var(--shadow-float);
  }
</style>

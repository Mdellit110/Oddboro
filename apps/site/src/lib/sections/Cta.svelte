<script lang="ts">
  // The last word before the footer: the lit office at twice the size behind
  // the headline and the two buttons, faded into the night at both edges.
  import DownloadButton from '#lib/components/DownloadButton.svelte';
  import GitHubMark from '#lib/components/GitHubMark.svelte';
  import { reveal } from '#lib/motion/index.ts';
  import { SITE } from '#lib/site.ts';
</script>

<section class="band relative overflow-hidden" aria-labelledby="cta-title">
  <div class="art pixel absolute inset-0" aria-hidden="true"></div>
  <div class="fade absolute inset-0" aria-hidden="true"></div>
  <div
    use:reveal
    class="relative mx-auto flex max-w-3xl flex-col items-center px-4 py-28 text-center sm:px-6 lg:py-36"
  >
    <h2
      id="cta-title"
      class="font-pixel text-ink text-4xl leading-[1.05] font-semibold text-balance sm:text-5xl"
    >
      Hire Odds.
    </h2>
    <p class="text-muted mt-5 max-w-xl text-lg text-pretty">
      Hand off the jobs you don't have time for. Oddboro is open source, runs on a Mac or Linux, and
      lets each Odd do only what you allow.
    </p>
    <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
      <DownloadButton
        class="bg-sea text-night rounded-md px-5 py-3 text-base font-semibold transition-opacity hover:opacity-90"
      />
      <a
        href={SITE.github}
        rel="noopener"
        class="glass border-hairline text-ink flex items-center gap-2 rounded-md border px-5 py-3 text-base font-medium hover:border-[var(--color-muted)]"
      >
        <GitHubMark class="size-4" />
        View on GitHub
      </a>
    </div>
  </div>
</section>

<style>
  .band {
    background: var(--color-night);
  }
  /* The art fades to nothing well inside its own edges, at any viewport width,
     so no edge of the image ever shows. The mask only reads alpha. */
  .art {
    background-image: var(--art-lit);
    background-size: 1280px 1232px;
    background-position: center -620px;
    background-repeat: no-repeat;
    opacity: 0.55;
    mask-image: radial-gradient(
      closest-side at 50% 50%,
      var(--color-night) 0%,
      var(--color-night) 40%,
      transparent 100%
    );
    mask-size: min(100%, 1200px) 100%;
    mask-position: center;
    mask-repeat: no-repeat;
  }
  .fade {
    background: radial-gradient(
      60% 70% at 50% 50%,
      color-mix(in srgb, var(--color-night) 75%, transparent) 0%,
      transparent 100%
    );
  }
</style>

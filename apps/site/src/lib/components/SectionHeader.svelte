<script lang="ts">
  // The heading block every homepage section opens with: an eyebrow in the
  // accent, the title in the display face, and a one-paragraph lede.
  import { reveal } from '#lib/motion/index.ts';

  let {
    eyebrow,
    title,
    lede,
    align = 'start',
    id
  }: {
    eyebrow?: string;
    title: string;
    lede?: string;
    align?: 'start' | 'center';
    /** The heading's id, for a link straight to it. */
    id?: string;
  } = $props();
</script>

<div use:reveal class="max-w-3xl {align === 'center' ? 'mx-auto text-center' : 'text-start'}">
  {#if eyebrow}
    <p class="text-sea mb-3 text-sm font-semibold tracking-wide uppercase">{eyebrow}</p>
  {/if}
  <h2
    {id}
    class="font-pixel text-ink text-4xl leading-[1.05] font-semibold text-balance sm:text-5xl"
  >
    {title}
  </h2>
  {#if lede}
    <p class="text-muted mt-5 text-lg leading-relaxed text-pretty">{lede}</p>
  {/if}
</div>

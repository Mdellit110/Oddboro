<script lang="ts">
  // The download button: the Mac build until the browser says it runs
  // Windows or Linux. Every one on the page reads the same choice.
  import { onMount } from 'svelte';
  import PlatformMark from '#lib/components/PlatformMark.svelte';
  import { detectBuild, download, latestHref } from '#lib/downloads.svelte.ts';

  let { class: className = '' }: { class?: string } = $props();

  onMount(() => void detectBuild());
</script>

<a href={latestHref(download.build)} class="inline-flex items-center gap-2 {className}">
  <PlatformMark system={download.build.mark} class="size-4" />
  Download for {download.build.system}
</a>

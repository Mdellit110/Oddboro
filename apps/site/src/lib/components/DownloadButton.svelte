<script lang="ts">
  // The download button: the Mac build until the browser says it runs Linux.
  // Every one on the page reads the same choice.
  import { onMount } from 'svelte';
  import { detectBuild, download, latestHref } from '#lib/downloads.svelte.ts';

  let { class: className = '' }: { class?: string } = $props();

  onMount(() => void detectBuild());
</script>

<a href={latestHref(download.build)} class={className}>
  Download for {download.build.system}
</a>

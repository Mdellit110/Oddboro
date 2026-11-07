<script lang="ts">
  // Installing uv, which Oddboro starts AWS's tool with: one command for a
  // Mac or Linux, one for Windows, each with its Copy button.
  import CopyBox from '#lib/components/CopyBox.svelte';
  import { UV_MAC_LINUX, UV_WINDOWS } from '#lib/guides/aws.ts';
</script>

<p>Install uv on this computer. Oddboro starts AWS’s tool with it.</p>
<p class="mt-2 text-sm">On a Mac or Linux, in a terminal:</p>
<div class="mt-1"><CopyBox text={UV_MAC_LINUX} /></div>
<p class="mt-2 text-sm">On Windows, in PowerShell:</p>
<div class="mt-1"><CopyBox text={UV_WINDOWS} /></div>

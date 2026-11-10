<script lang="ts">
  // A page to open: its address as a link, and a Go to button on the right.
  // Both open it in a new tab.
  let { href }: { href: string } = $props();
</script>

<div class="bg-raise border-hairline flex items-center gap-2 rounded-lg border">
  <a
    {href}
    target="_blank"
    rel="noopener noreferrer"
    class="text-sea min-w-0 flex-1 px-3 py-2 font-mono text-sm break-all hover:underline">{href}</a
  >
  <a
    {href}
    target="_blank"
    rel="noopener noreferrer"
    class="bg-sea text-night m-1 shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold hover:opacity-90"
    >Go to <span aria-hidden="true">↗</span><span class="sr-only"> (opens in a new tab)</span></a
  >
</div>

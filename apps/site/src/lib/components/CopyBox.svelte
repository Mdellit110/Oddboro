<script lang="ts">
  // Text to copy, with its Copy button on the right: one line in a row, or a
  // block such as a policy with the button above its top right corner. The
  // clipboard write is the only browser API it touches.
  let { text }: { text: string } = $props();

  const block = $derived(text.includes('\n'));
  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    copied = true;
    clearTimeout(timer);
    timer = setTimeout(() => (copied = false), 1600);
  }
</script>

<div class="bg-raise border-hairline relative flex items-start gap-2 rounded-lg border">
  {#if block}
    <pre
      class="text-sea min-w-0 flex-1 overflow-x-auto px-3 py-2.5 font-mono text-xs leading-relaxed"><code
        >{text}</code
      ></pre>
  {:else}
    <code class="text-sea min-w-0 flex-1 px-3 py-2 font-mono text-sm break-all">{text}</code>
  {/if}
  <button
    type="button"
    class="text-muted hover:text-ink hover:bg-night/40 m-1 shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium"
    onclick={copy}
    aria-label="Copy {block ? 'the text' : text}">{copied ? 'Copied' : 'Copy'}</button
  >
  <span class="sr-only" aria-live="polite">{copied ? 'Copied to the clipboard.' : ''}</span>
</div>

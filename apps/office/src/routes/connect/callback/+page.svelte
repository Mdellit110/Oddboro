<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>{data.ok ? 'Connected' : 'Not connected'} · Oddboro</title>
</svelte:head>

<main class="grid h-full place-items-center p-6">
  <div class="glass max-w-md rounded-2xl p-6">
    <div class="font-pixel text-xl">{data.ok ? 'Connected' : 'Not connected'}</div>
    <p class="mt-2 text-sm text-muted">{data.message}</p>
  </div>
</main>

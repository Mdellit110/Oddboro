<script lang="ts">
  import { call } from './api.ts';

  let { start }: { start: string } = $props();
  let address = $state('');
  let busy = $state(false);
  let done = $state(false);
  let problem = $state('');
  const expectedState = $derived(URL.parse(start)?.searchParams.get('state'));

  async function finish() {
    busy = true;
    problem = '';
    try {
      await call('/api/phone/sign-in', { url: address.trim(), state: expectedState });
      done = true;
    } catch (e) {
      problem = e instanceof Error ? e.message : 'Start the sign-in again.';
    } finally {
      address = '';
      busy = false;
    }
  }
</script>

{#if expectedState}
  <details class="mt-2 text-start">
    <summary class="cursor-pointer text-sea">Finish from another device</summary>
    <p class="my-2 text-muted">
      After you authorize, the browser may say it cannot reach the page. Copy that page's address
      and paste it here.
    </p>
    {#if done}
      <p role="status">Sign-in finished.</p>
    {:else}
      <form
        onsubmit={(event) => {
          event.preventDefault();
          void finish();
        }}
      >
        <label class="flex flex-col gap-1"
          >Return address
          <input
            class="min-w-0 rounded-lg bg-night p-2"
            type="password"
            autocomplete="off"
            spellcheck="false"
            bind:value={address}
          />
        </label>
        <button
          class="mt-2 rounded-lg bg-sea px-3 py-2 text-night"
          disabled={busy || !address.trim()}>Finish sign-in</button
        >
        {#if problem}<p role="alert" class="mt-2 text-coral">{problem}</p>{/if}
      </form>
    {/if}
  </details>
{/if}

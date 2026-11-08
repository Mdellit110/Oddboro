<script lang="ts">
  // A key step's other way in, once AWS Secrets Manager is connected: name a
  // secret there instead of pasting the key. The page sees secret names and
  // descriptions, and the names inside a key/value secret, never a value; the
  // office reads the value when a run first uses the tool.
  import { call } from './api.ts';

  let { taskId, index }: { taskId: number; index: number } = $props();

  let connected = $state(false);
  let names = $state<{ name: string; description: string }[] | null>(null);
  let secret = $state('');
  let key = $state('');
  let busy = $state(false);
  let problem = $state('');

  const post = <T,>(body: Record<string, unknown>) =>
    call<T>(`/api/tasks/${taskId}`, { index, ...body });

  $effect(() => {
    post<{ connected: boolean }>({ op: 'aws-secrets-connected' })
      .then((r) => (connected = r.connected))
      .catch(() => {});
  });

  async function open() {
    busy = true;
    problem = '';
    try {
      names = (
        await post<{ secrets: { name: string; description: string }[] }>({
          op: 'aws-secret-names'
        })
      ).secrets;
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  // A key/value secret holds several values by name: list the names to pick
  // from, and pick the only one for the owner. A plain secret has none.
  let keys = $state<string[]>([]);
  async function pickSecret() {
    keys = [];
    key = '';
    problem = '';
    if (!secret) return;
    busy = true;
    try {
      keys = (await post<{ keys: string[] }>({ op: 'aws-secret-keys', secret })).keys;
      if (keys.length === 1) key = keys[0];
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function use() {
    busy = true;
    problem = '';
    try {
      await post({ op: 'aws-secret', secret, key });
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
</script>

{#if !connected}
  <!-- Nothing to offer until AWS Secrets Manager is connected. -->
{:else if !names}
  <button
    class="mt-1.5 text-xs text-muted underline hover:text-ink disabled:opacity-40"
    disabled={busy}
    onclick={open}>Use a secret from AWS instead</button
  >
{:else if !names.length}
  <p class="mt-1.5 text-xs text-muted">No secrets in AWS that the office's role can list.</p>
{:else}
  <div class="mt-2 flex flex-col gap-2 text-xs">
    <select
      class="rounded-lg bg-night/60 px-2.5 py-1.5"
      bind:value={secret}
      onchange={pickSecret}
      disabled={busy}
    >
      <option value="">Pick a secret</option>
      {#each names as n (n.name)}
        <option value={n.name}>{n.name}{n.description ? `: ${n.description}` : ''}</option>
      {/each}
    </select>
    {#if keys.length > 1}
      <label class="flex flex-col gap-1">
        <span class="text-muted">This secret holds several values. Which one is the key?</span>
        <select class="rounded-lg bg-night/60 px-2.5 py-1.5" bind:value={key} disabled={busy}>
          <option value="">Pick one</option>
          {#each keys as k (k)}
            <option value={k}>{k}</option>
          {/each}
        </select>
      </label>
    {:else if keys.length === 1}
      <p class="text-muted">Uses the value named {keys[0]}.</p>
    {/if}
    <button
      class="self-start rounded-lg bg-sea px-3 py-1.5 font-medium text-night disabled:opacity-40"
      disabled={busy || !secret || (keys.length > 1 && !key)}
      onclick={use}>Use it</button
    >
  </div>
{/if}
{#if problem}<p class="mt-1.5 text-xs text-ember">{problem}</p>{/if}

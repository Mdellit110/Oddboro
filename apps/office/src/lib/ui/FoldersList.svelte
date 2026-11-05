<script lang="ts">
  // The folders outside the office the owner gives an Odd, on its Access tab.
  // Each shows with the home folder written `~`, which only the server can
  // work out, so the profile carries it. A level change or Remove sends the
  // path as stored, so a folder gone from the disk can still go.
  import { FOLDER_LABEL, type FolderAccess } from '@oddboro/ledger/access';
  import { call } from './api.ts';
  import type { StaffProfile } from '../staff/roster.ts';

  type Folder = StaffProfile['folders'][number];
  type Props = { profile: StaffProfile };
  let { profile }: Props = $props();

  let typed = $state('');
  let access = $state<FolderAccess>('read');
  /** The server's own line for a folder it refused, or a change that failed. */
  let problem = $state('');

  async function change(folder: string, to: FolderAccess | null): Promise<boolean> {
    problem = '';
    try {
      await call(`/api/staff/${profile.id}`, { folder, access: to }, 'PATCH');
      return true;
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async function setLevel(f: Folder, select: HTMLSelectElement) {
    // Its options are FOLDER_LABEL's keys. On a failure the stored level did not change, so nothing redraws the select.
    if (!(await change(f.path, select.value as FolderAccess)))
      select.value = f.write ? 'write' : 'read';
  }

  async function add() {
    if (!(await change(typed, access))) return;
    typed = '';
    access = 'read';
  }
</script>

<section aria-labelledby="folders">
  <h3 id="folders" class="text-[11px] text-muted">Folders</h3>
  {#if profile.folders.length}
    <ul class="mt-1.5 flex flex-col gap-1 rounded-xl bg-raise p-1.5">
      {#each profile.folders as f (f.path)}
        <li class="flex items-center gap-2 rounded-lg px-2 py-1.5">
          <span class="min-w-0 flex-1 truncate text-sm" title={f.shown}>{f.shown}</span>
          <select
            class="rounded-lg bg-night/60 px-1.5 py-1 text-xs"
            aria-label="What {profile.name} may do in {f.shown}"
            value={f.write ? 'write' : 'read'}
            onchange={(e) => setLevel(f, e.currentTarget)}
          >
            {#each Object.entries(FOLDER_LABEL) as [id, label] (id)}
              <option value={id}>{label}</option>
            {/each}
          </select>
          <button class="text-xs text-muted hover:text-coral" onclick={() => change(f.path, null)}
            >Remove</button
          >
        </li>
      {/each}
    </ul>
  {/if}
  <form
    class="mt-1.5 flex gap-1.5"
    novalidate
    onsubmit={(e) => {
      e.preventDefault();
      if (typed.trim()) void add();
    }}
  >
    <input
      class="min-w-0 flex-1 rounded-lg bg-raise px-2 py-1 text-sm outline-none placeholder:text-faint"
      aria-label="A folder to give {profile.name}"
      placeholder="~/Documents/GitHub/my-game"
      autocomplete="off"
      spellcheck="false"
      bind:value={typed}
    />
    <select
      class="rounded-lg bg-raise px-1.5 py-1 text-xs"
      aria-label="What {profile.name} may do there"
      bind:value={access}
    >
      {#each Object.entries(FOLDER_LABEL) as [id, label] (id)}
        <option value={id}>{label}</option>
      {/each}
    </select>
    <button
      class="rounded-lg bg-raise px-2.5 py-1 text-xs font-medium hover:bg-sea/20 disabled:opacity-40"
      disabled={!typed.trim()}>Add</button
    >
  </form>
  {#if problem}
    <p class="mt-1 text-[11px] text-coral">{problem}</p>
  {/if}
</section>

<script lang="ts">
  // Storage, under an Odd's Knowledge: everything it has kept in its own
  // folder, as a tree of folders that open and close, with each file's size
  // and when it changed. Search filters by path as the owner types, and shows
  // every match flat with its folder. A file opens in the office's viewer
  // (`openFile`), as a file an Odd names in chat does. The list is read when
  // the tab opens, and again when the office says something changed.
  import { call } from './api.ts';
  import { openFile } from './windows.svelte.ts';
  import type { StaffProfile } from '../staff/roster.ts';

  type Entry = { path: string; dir: boolean; size: number; mtime: number };
  type Props = { profile: StaffProfile; version: number };
  let { profile, version }: Props = $props();

  let entries = $state<Entry[]>([]);
  let capped = $state(false);
  let cap = $state(0);
  let loaded = $state(false);
  let problem = $state('');
  let find = $state('');
  /** Folders the owner opened, by path. */
  let open = $state<Record<string, boolean>>({});

  $effect(() => {
    void version;
    const id = profile.id;
    call<{ entries: Entry[]; capped: boolean; cap: number }>(`/api/staff/${id}/storage`).then(
      (r) => {
        entries = r.entries;
        capped = r.capped;
        cap = r.cap;
        loaded = true;
        problem = '';
      },
      (e) => {
        problem = e instanceof Error ? e.message : String(e);
        loaded = true;
      }
    );
  });

  const parentOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')));
  const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);
  /** Each folder's own entries, by the folder's path ('' is the top). */
  const children = $derived.by(() => {
    const by: Record<string, Entry[]> = {};
    for (const e of entries) (by[parentOf(e.path)] ??= []).push(e);
    return by;
  });
  const files = $derived(entries.filter((e) => !e.dir).length);
  const matches = $derived.by(() => {
    const f = find.trim().toLowerCase();
    return f ? entries.filter((e) => !e.dir && e.path.toLowerCase().includes(f)) : [];
  });

  function size(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  const when = (ms: number) =>
    new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const show = (path: string) => openFile({ staff: profile.id, path });
</script>

{#snippet fileRow(e: Entry, label: string, depth: number)}
  <li>
    <button
      class="flex w-full items-center gap-2 rounded-md py-1 pe-2 text-start hover:bg-night/40"
      style="padding-inline-start: {0.5 + depth * 0.9}rem"
      title={e.path}
      onclick={() => show(e.path)}
    >
      <svg
        class="size-3.5 shrink-0 text-muted"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linejoin="round"
        aria-hidden="true"><path d="M4 1.75h5l3 3v9.5H4zM9 1.75v3h3" /></svg
      >
      <span class="min-w-0 flex-1 truncate text-sm">{label}</span>
      <span class="shrink-0 text-[10px] text-faint">{size(e.size)} · {when(e.mtime)}</span>
    </button>
  </li>
{/snippet}

{#snippet folder(path: string, depth: number)}
  {#each children[path] ?? [] as e (e.path)}
    {#if e.dir}
      {@const isOpen = !!open[e.path]}
      <li>
        <button
          class="flex w-full items-center gap-2 rounded-md py-1 pe-2 text-start hover:bg-night/40"
          style="padding-inline-start: {0.5 + depth * 0.9}rem"
          aria-expanded={isOpen}
          onclick={() => (open[e.path] = !isOpen)}
        >
          <span class="w-2.5 shrink-0 text-[10px] text-muted" aria-hidden="true"
            >{isOpen ? '▾' : '▸'}</span
          >
          <svg
            class="size-3.5 shrink-0 text-sea"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linejoin="round"
            aria-hidden="true"><path d="M1.75 4.25v8.5h12.5v-7h-6.5l-1.5-1.5h-4.5z" /></svg
          >
          <span class="min-w-0 flex-1 truncate text-sm">{nameOf(e.path)}</span>
          <span class="shrink-0 text-[10px] text-faint">{(children[e.path] ?? []).length}</span>
        </button>
      </li>
      {#if isOpen}
        {@render folder(e.path, depth + 1)}
      {/if}
    {:else}
      {@render fileRow(e, nameOf(e.path), depth + 1)}
    {/if}
  {/each}
{/snippet}

<section class="flex h-full min-h-0 flex-col p-3" aria-label="Storage">
  <input
    class="mb-2 w-full rounded-lg bg-raise px-2.5 py-1.5 text-sm outline-none placeholder:text-faint"
    type="search"
    aria-label="Find a file"
    placeholder="Find a file"
    autocomplete="off"
    spellcheck="false"
    bind:value={find}
  />
  <p class="mb-1.5 text-[11px] text-muted">
    {#if !loaded}
      Reading {profile.name}'s folder.
    {:else if capped}
      Showing the first {cap.toLocaleString()} entries in {profile.name}'s folder.
    {:else}
      {files}
      {files === 1 ? 'file' : 'files'} in {profile.name}'s folder.
    {/if}
  </p>
  <div class="min-h-0 flex-1 overflow-y-auto">
    {#if problem}
      <p class="rounded-lg bg-coral/15 px-3 py-2 text-xs text-coral">{problem}</p>
    {:else if loaded && !entries.length}
      <p class="py-4 text-center text-sm text-muted">Nothing kept yet.</p>
    {:else if find.trim()}
      {#if matches.length}
        <ul>
          {#each matches as e (e.path)}
            {@render fileRow(e, e.path, 0)}
          {/each}
        </ul>
      {:else}
        <p class="py-4 text-center text-sm text-muted">No file matches "{find.trim()}".</p>
      {/if}
    {:else}
      <ul>{@render folder('', 0)}</ul>
    {/if}
  </div>
</section>

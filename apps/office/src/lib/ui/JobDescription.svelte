<script lang="ts">
  import DocEditor from './DocEditor.svelte';
  import { call } from './api.ts';
  import type { StaffProfile } from '../staff/roster.ts';

  // The staffer's job description, the text every run starts from, in the
  // document editor. Folded until the owner opens it.
  type Props = { profile: StaffProfile; version: number };
  let { profile, version }: Props = $props();

  let shown = $state(false);
  let text = $state<string | undefined>();
  let mode = $state<'view' | 'edit'>('view');
  let dirty = $state(false);
  let problem = $state('');

  // Reload when the staffer changes it, unless the owner is mid-edit.
  $effect(() => {
    void version;
    if (!shown || dirty) return;
    call<{ text: string }>(`/api/staff/${profile.id}/description`)
      .then((r) => (text = r.text))
      .catch((e: unknown) => (problem = e instanceof Error ? e.message : String(e)));
  });

  async function save(draft: string): Promise<string> {
    const r = await call<{ text: string }>(
      `/api/staff/${profile.id}/description`,
      { text: draft, was: text },
      'PUT'
    );
    text = r.text;
    return r.text;
  }
</script>

<section class="mb-3 rounded-xl bg-raise p-3" aria-label="Job description">
  <div class="flex items-center gap-2">
    <button
      class="flex-1 text-start text-sm font-medium"
      aria-expanded={shown}
      onclick={() => (shown = !shown)}>{shown ? '▾' : '▸'} Job description</button
    >
    {#if shown}
      <div
        class="flex gap-0.5 rounded-full bg-night/60 p-0.5"
        role="group"
        aria-label="View or edit"
      >
        {#each [{ id: 'view', label: 'View' }, { id: 'edit', label: 'Edit' }] as const as m (m.id)}
          <button
            class="rounded-full px-2.5 py-0.5 text-xs {mode === m.id
              ? 'bg-sea/30 text-ink'
              : 'text-muted'}"
            aria-pressed={mode === m.id}
            onclick={() => (mode = m.id)}>{m.label}</button
          >
        {/each}
      </div>
    {/if}
  </div>
  {#if shown}
    <p class="mt-1 text-[11px] text-faint">
      Who {profile.name} is and how it works. Every run starts from it, and you can also ask
      {profile.name} to change it in chat.
    </p>
    <div class="mt-2">
      {#if problem}
        <p class="rounded-lg bg-coral/15 px-3 py-2 text-xs text-coral">{problem}</p>
      {:else if text === undefined}
        <p class="py-4 text-center text-sm text-muted">Opening</p>
      {:else}
        <DocEditor
          {text}
          name={`${profile.name}'s job description`}
          staff={profile.id}
          bind:mode
          inline
          ondirty={(d) => (dirty = d)}
          onsave={save}
        />
      {/if}
    </div>
  {/if}
</section>

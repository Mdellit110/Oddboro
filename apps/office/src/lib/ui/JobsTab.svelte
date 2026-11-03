<script lang="ts">
  import type { JobRow, RunRow, Schedule } from '@oddboro/ledger';
  import { describe, zoneName } from '@oddboro/ledger/time';
  import SchedulePicker from './SchedulePicker.svelte';
  import Markdown from './Markdown.svelte';
  import JobDescription from './JobDescription.svelte';
  import { call } from './api.ts';
  import { ago, when } from './format.ts';
  import type { StaffProfile } from '../staff/roster.ts';

  type Job = JobRow & { lastRun?: RunRow };
  type Props = {
    profile: StaffProfile;
    /** Bumps when jobs or runs change, so the list reloads. */
    version: number;
    working: string | undefined;
  };
  let { profile, version, working }: Props = $props();

  let jobs = $state<Job[]>([]);
  /** The job being edited, 'new' for one being added, or nothing. */
  let editing = $state<number | 'new' | undefined>();
  let name = $state('');
  let instructions = $state('');
  let schedule = $state<Schedule>({ every: 'day', at: '07:00' });
  let report = $state(false);
  let problem = $state('');

  $effect(() => {
    void version;
    call<Job[]>(`/api/staff/${profile.id}/jobs`)
      .then((j) => (jobs = j))
      .catch(() => {});
  });

  async function act(fn: () => Promise<unknown>) {
    problem = '';
    try {
      await fn();
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    }
  }

  function open(j?: Job) {
    problem = '';
    name = j?.name ?? '';
    instructions = j?.instructions ?? '';
    schedule = j ? { ...j.schedule } : { every: 'day', at: '07:00' };
    report = j?.report ?? false;
    editing = j ? j.id : 'new';
  }

  async function save() {
    await act(async () => {
      if (editing === 'new')
        await call(`/api/staff/${profile.id}/jobs`, { name, instructions, schedule, report });
      else
        await call(`/api/jobs/${editing}`, { op: 'update', name, instructions, schedule, report });
      editing = undefined;
    });
  }
</script>

<div class="flex h-full min-h-0 flex-col">
  <div class="flex items-center border-b border-hairline p-3">
    <div class="flex-1">
      <div class="text-sm font-medium">{profile.name}'s jobs</div>
      <div class="mt-0.5 text-xs text-muted">
        {working ? `Running ${working} now` : `What it does, and how often, in ${zoneName()}.`}
      </div>
    </div>
    {#if editing === undefined}
      <button
        class="rounded-lg bg-raise px-3 py-1.5 text-xs font-medium hover:bg-sea/20"
        onclick={() => open()}>Add job</button
      >
    {/if}
  </div>
  <div class="flex-1 overflow-y-auto p-3">
    <JobDescription {profile} {version} />
    {#snippet form()}
      <div class="flex flex-col gap-2 rounded-xl bg-raise p-3">
        <input
          class="rounded-lg bg-night/60 px-3 py-2 text-sm outline-none placeholder:text-faint"
          placeholder="Name, e.g. Sort personal mail"
          aria-label="Job name"
          bind:value={name}
        />
        <textarea
          rows="8"
          class="resize-y rounded-lg bg-night/60 px-3 py-2 text-sm outline-none placeholder:text-faint"
          placeholder="What to do each run, as numbered steps"
          aria-label="What to do each run"
          bind:value={instructions}></textarea>
        <SchedulePicker bind:value={schedule} />
        <label class="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" bind:checked={report} /> Put the result on my desk as a report
        </label>
        <div class="flex gap-2">
          <button
            class="rounded-lg px-3 py-1.5 text-xs text-muted hover:text-ink"
            onclick={() => (editing = undefined)}>Cancel</button
          >
          <button
            class="flex-1 rounded-lg bg-sea px-3 py-1.5 text-xs font-medium text-night disabled:opacity-40"
            disabled={!name.trim() || !instructions.trim()}
            onclick={save}>{editing === 'new' ? 'Add job' : 'Save changes'}</button
          >
        </div>
      </div>
    {/snippet}
    {#if editing === 'new'}
      <div class="mb-3">{@render form()}</div>
    {/if}
    {#if !jobs.length && editing !== 'new'}
      <p class="py-8 text-center text-sm text-muted">No jobs yet.</p>
    {/if}
    <ul class="flex flex-col gap-2">
      {#each jobs as j (j.id)}
        {#if editing === j.id}
          <li>{@render form()}</li>
        {:else}
          <li class="rounded-xl bg-raise p-3 text-sm" class:opacity-50={!j.enabled}>
            <div class="flex items-start gap-2">
              <div class="min-w-0 flex-1">
                <div class="font-medium">{j.name}</div>
                <div class="text-xs text-muted">
                  {describe(j.schedule)}{j.report ? ' · report to your desk' : ''}{j.enabled
                    ? ''
                    : ' · paused'}
                </div>
              </div>
              {#if working === j.name}
                <span class="rounded-full bg-moss/20 px-2 py-0.5 text-[11px] text-moss"
                  >Running</span
                >
              {/if}
            </div>
            <div class="mt-2 grid grid-cols-2 gap-1 text-[11px] text-faint">
              <span
                >Last run: {j.lastRun
                  ? `${j.lastRun.status === 'failed' ? 'failed ' : ''}${ago(j.lastRun.startedAt)}${j.lastRun.trigger === 'manual' ? ', by you' : ''}`
                  : 'never'}</span
              >
              <span>Next: {j.enabled && j.nextRunAt ? when(j.nextRunAt) : 'none'}</span>
            </div>
            {#if j.lastRun?.summary}
              <details class="mt-1 text-xs text-muted">
                <summary class="cursor-pointer text-faint">Last result</summary>
                <Markdown text={j.lastRun.summary} staff={profile.id} class="mt-1" />
              </details>
            {/if}
            <div class="mt-2 flex gap-1.5">
              <button
                class="rounded-lg bg-night/60 px-2.5 py-1 text-xs hover:bg-sea/25 disabled:opacity-40"
                disabled={!!working}
                onclick={() => act(() => call(`/api/jobs/${j.id}`, { op: 'run' }))}>Run now</button
              >
              <button
                class="rounded-lg bg-night/60 px-2.5 py-1 text-xs hover:bg-sea/25"
                onclick={() => open(j)}>Edit</button
              >
              <button
                class="rounded-lg bg-night/60 px-2.5 py-1 text-xs hover:bg-sea/25"
                onclick={() =>
                  act(() => call(`/api/jobs/${j.id}`, { op: 'update', enabled: !j.enabled }))}
                >{j.enabled ? 'Pause' : 'Resume'}</button
              >
              {#if !j.enabled && !j.lastRun}
                <button
                  class="rounded-lg px-2.5 py-1 text-xs text-muted hover:text-coral"
                  onclick={() => act(() => call(`/api/jobs/${j.id}`, { op: 'delete' }))}
                  >Remove</button
                >
              {/if}
            </div>
          </li>
        {/if}
      {/each}
    </ul>
    {#if problem}
      <p class="mt-3 rounded-lg bg-coral/15 px-3 py-2 text-xs text-coral">{problem}</p>
    {/if}
  </div>
</div>

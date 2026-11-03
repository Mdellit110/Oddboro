<script lang="ts">
  import type { ReportRow } from '@oddboro/ledger';
  import Markdown from './Markdown.svelte';
  import SelectToChat from './SelectToChat.svelte';
  import { call } from './api.ts';
  import { when } from './format.ts';
  import { replyAbout } from './chat-about.svelte.ts';
  import type { ReportRef } from './windows.svelte.ts';
  import type { StaffProfile } from '../staff/roster.ts';

  // A report opened from a staffer's chat after it left the desk. Reply goes
  // back to that chat.
  type Props = { report: ReportRef; staff: StaffProfile[] };
  let { report, staff }: Props = $props();

  let row = $state<ReportRow | undefined>();
  let problem = $state('');
  const from = $derived(staff.find((p) => p.id === report.staff));

  $effect(() => {
    call<ReportRow>(`/api/reports/${report.id}`)
      .then((r) => (row = r))
      .catch((e: unknown) => (problem = e instanceof Error ? e.message : String(e)));
  });
</script>

<section class="h-full overflow-y-auto p-4" aria-label={report.title}>
  <div class="text-[10px] tracking-[0.16em] text-faint uppercase">
    Report{from ? ` from ${from.name}` : ''}{row ? ` · ${when(row.createdAt)}` : ''}
  </div>
  <h2 class="mt-1 text-base font-medium text-ink">{report.title}</h2>
  {#if row}
    <SelectToChat {staff} author={row.staffId} what={`report "${row.title}"`}>
      <Markdown text={row.body} staff={row.staffId} class="mt-3 text-sm" />
    </SelectToChat>
    <button
      class="mt-4 w-full rounded-lg bg-sea px-3 py-2 text-sm font-medium text-night"
      onclick={() =>
        replyAbout(report.staff, { kind: 'report', id: report.id, title: report.title })}
      >Reply to {from?.name ?? 'them'}</button
    >
  {:else if problem}
    <p class="mt-3 rounded-lg bg-coral/15 px-3 py-2 text-xs text-coral">{problem}</p>
  {:else}
    <p class="mt-3 text-sm text-muted">Opening…</p>
  {/if}
</section>

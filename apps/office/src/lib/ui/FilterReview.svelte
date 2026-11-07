<script lang="ts">
  // One Gmail filter an Odd proposed (a `filter` ask), reviewed on the Desk:
  // the Odd's summary, what it matches and what it does, each field the owner
  // may change, about how many emails match today, and whether to tidy those
  // too. Create filter, Ask for changes or Discard. Back and Next, and the
  // arrow keys outside a field, step through the open filters, oldest first.
  import type { AskRow, GmailFilter } from '@oddboro/ledger';
  import { filterWords, type FilterAction, type FilterCriteria } from '@oddboro/ledger/filters';
  import { untrack } from 'svelte';
  import Markdown from './Markdown.svelte';
  import ReviewNav from './ReviewNav.svelte';
  import { call } from './api.ts';
  import { after } from './review-steps.ts';
  import type { StaffProfile } from '../staff/roster.ts';

  type Props = {
    ask: AskRow & { filter: GmailFilter };
    /** Every open filter on the desk, oldest first. */
    filters: AskRow[];
    staff: StaffProfile[];
    /** The ask this one reworks, when the owner sent that one back. */
    reworks: AskRow | null;
    /** Open another filter by its ask id, or go back to the desk with none. */
    ongo: (id: number | undefined) => void;
    /** Open an Odd's card. */
    onstaff: (id: string) => void;
  };
  let { ask: a, filters, staff, reworks, ongo, onstaff }: Props = $props();

  const from = $derived(staff.find((p) => p.id === a.staffId)?.name ?? 'the Odd');

  // The parent keys this view on the ask, so each filter starts from what the
  // Odd proposed, and a desk reload never undoes the owner's changes.
  const proposed = untrack(() => a.filter);
  let criteria = $state<Required<FilterCriteria>>({
    from: proposed.criteria.from ?? '',
    to: proposed.criteria.to ?? '',
    subject: proposed.criteria.subject ?? '',
    query: proposed.criteria.query ?? '',
    negatedQuery: proposed.criteria.negatedQuery ?? '',
    hasAttachment: !!proposed.criteria.hasAttachment
  });
  let action = $state<Required<FilterAction>>({
    skipInbox: !!proposed.action.skipInbox,
    markRead: !!proposed.action.markRead,
    addLabel: proposed.action.addLabel ?? '',
    star: !!proposed.action.star
  });
  let tidy = $state(true);
  let busy = $state(false);
  let problem = $state('');
  /** Ask for changes or Discard, waiting for its note. */
  let mode = $state<'changes' | 'discard' | undefined>();
  let note = $state('');

  const MATCHES: { key: Exclude<keyof FilterCriteria, 'hasAttachment'>; label: string }[] = [
    { key: 'from', label: 'From' },
    { key: 'to', label: 'To' },
    { key: 'subject', label: 'Subject' },
    { key: 'query', label: 'Has the words' },
    { key: 'negatedQuery', label: "Doesn't have" }
  ];
  const DOES: { key: 'skipInbox' | 'markRead' | 'star'; label: string }[] = [
    { key: 'skipInbox', label: 'Skip the inbox' },
    { key: 'markRead', label: 'Mark as read' },
    { key: 'star', label: 'Star it' }
  ];

  /** About how many emails match today, from Gmail, counted again after a change to what it matches. */
  let about = $state<number | undefined>();
  let counting = $state(false);
  let countProblem = $state('');
  let counted = '';
  async function count() {
    const params = new URLSearchParams();
    for (const { key } of MATCHES) if (criteria[key].trim()) params.set(key, criteria[key].trim());
    if (criteria.hasAttachment) params.set('hasAttachment', 'true');
    const asked = params.toString();
    if (asked === counted) return;
    counted = asked;
    countProblem = '';
    if (!asked) {
      about = undefined;
      countProblem = 'Say which mail it matches.';
      return;
    }
    counting = true;
    try {
      const r = await call<{ about: number }>(`/api/asks/${a.id}/filter-preview?${asked}`);
      if (counted === asked) about = r.about;
    } catch (e) {
      if (counted === asked) countProblem = e instanceof Error ? e.message : String(e);
    } finally {
      if (counted === asked) counting = false;
    }
  }
  $effect(() => {
    untrack(count);
  });

  const emails = (n: number) => `${n} ${n === 1 ? 'email' : 'emails'}`;
  const sentence = $derived(filterWords({ criteria, action }));

  async function act(fn: () => Promise<unknown>) {
    busy = true;
    problem = '';
    try {
      await fn();
      ongo(after(filters, a.id));
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
  const create = () =>
    act(() => call(`/api/asks/${a.id}/filter`, { criteria, action, tidy: tidy && about !== 0 }));
  const decide = (decision: 'iterate' | 'deny') =>
    act(() => call(`/api/asks/${a.id}`, { decision, reason: note.trim() }));
</script>

<ReviewNav label="Filter" ask={a} list={filters} {staff} {busy} {ongo} {onstaff}>
  {#if reworks}
    <div class="mt-3 rounded-lg bg-sea/10 px-2.5 py-2 text-xs">
      <div class="text-muted">Reworks “{reworks.title}”</div>
      {#if reworks.reason}<div class="mt-0.5">You asked: {reworks.reason}</div>{/if}
    </div>
  {/if}

  <div class="mt-3 rounded-xl bg-raise px-3 py-2.5 text-sm">
    <div class="text-xs text-muted">{from}'s summary</div>
    <p class="mt-0.5 leading-relaxed">{a.filter.summary}</p>
  </div>

  <div class="mt-3 text-sm">
    <div class="text-xs text-muted">Why</div>
    <div class="mt-0.5"><Markdown text={a.why} staff={a.staffId} /></div>
  </div>

  <fieldset class="mt-3 flex flex-col gap-2 text-sm" disabled={busy}>
    <legend class="text-xs text-muted">Matches</legend>
    {#each MATCHES as m (m.key)}
      <label class="flex items-center gap-2">
        <span class="w-24 shrink-0 text-xs text-muted">{m.label}</span>
        <input
          class="min-w-0 flex-1 rounded-lg bg-raise px-2.5 py-1.5 outline-none"
          bind:value={criteria[m.key]}
          onchange={count}
        />
      </label>
    {/each}
    <label class="flex items-center gap-2 text-xs">
      <input type="checkbox" bind:checked={criteria.hasAttachment} onchange={count} /> Has an attachment
    </label>
  </fieldset>

  <fieldset class="mt-3 flex flex-col gap-2 text-sm" disabled={busy}>
    <legend class="text-xs text-muted">Does</legend>
    <div class="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
      {#each DOES as d (d.key)}
        <label class="flex items-center gap-2">
          <input type="checkbox" bind:checked={action[d.key]} />
          {d.label}
        </label>
      {/each}
    </div>
    <label class="flex items-center gap-2">
      <span class="w-24 shrink-0 text-xs text-muted">Apply the label</span>
      <input
        class="min-w-0 flex-1 rounded-lg bg-raise px-2.5 py-1.5 outline-none placeholder:text-faint"
        placeholder="None"
        bind:value={action.addLabel}
      />
    </label>
  </fieldset>

  <div class="mt-3 rounded-lg bg-sea/10 px-2.5 py-2 text-xs">
    <p>In words: {sentence}.</p>
    <p class="mt-1 text-muted">
      {#if countProblem}
        <span class="text-coral">{countProblem}</span>
      {:else if counting || about === undefined}
        Counting the mail it matches in Gmail.
      {:else}
        About {emails(about)} match today.
      {/if}
    </p>
  </div>

  {#if about !== 0}
    <label class="mt-2 flex items-center gap-2 text-xs text-muted">
      <input type="checkbox" bind:checked={tidy} disabled={busy} />
      Also tidy the {about === undefined ? 'emails' : emails(about)} it already matches
    </label>
  {/if}

  {#if mode}
    <label class="mt-3 block text-xs text-muted" for="filter-note"
      >{mode === 'changes'
        ? `What should ${from} change?`
        : 'Why, if you want to say (optional)'}</label
    >
    <textarea
      id="filter-note"
      rows="3"
      class="mt-1 w-full resize-y rounded-lg bg-raise px-3 py-2 text-sm outline-none placeholder:text-faint"
      placeholder={mode === 'changes' ? 'Say what to change.' : `${from} reads it for next time.`}
      bind:value={note}></textarea>
    <div class="mt-2 flex gap-2">
      <button
        class="rounded-lg px-3 py-2 text-sm text-muted hover:text-ink disabled:opacity-40"
        disabled={busy}
        onclick={() => ((mode = undefined), (note = ''))}>Cancel</button
      >
      {#if mode === 'changes'}
        <button
          class="flex-1 rounded-lg bg-sea px-3 py-2 text-sm font-medium text-night disabled:opacity-40"
          disabled={busy || !note.trim()}
          onclick={() => decide('iterate')}>Send back to {from}</button
        >
      {:else}
        <button
          class="flex-1 rounded-lg bg-raise px-3 py-2 text-sm font-medium hover:bg-coral/25 disabled:opacity-40"
          disabled={busy}
          onclick={() => decide('deny')}>Discard it</button
        >
      {/if}
    </div>
  {:else}
    <button
      class="mt-3 w-full rounded-lg bg-sea px-3 py-2 text-sm font-medium text-night disabled:opacity-40"
      disabled={busy}
      onclick={create}>{busy ? 'Working' : 'Create filter'}</button
    >
    <div class="mt-2 flex gap-2">
      <button
        class="flex-1 rounded-lg bg-raise px-3 py-1.5 text-xs hover:bg-sea/25 disabled:opacity-40"
        disabled={busy}
        onclick={() => (mode = 'changes')}>Ask for changes</button
      >
      <button
        class="flex-1 rounded-lg bg-raise px-3 py-1.5 text-xs hover:bg-coral/25 disabled:opacity-40"
        disabled={busy}
        onclick={() => (mode = 'discard')}>Discard</button
      >
    </div>
    <p class="mt-1.5 text-[11px] text-faint">
      Nothing changes in your Gmail until you click Create filter.
    </p>
  {/if}
  {#if problem}
    <p class="mt-3 rounded-lg bg-coral/15 px-3 py-2 text-xs text-coral">{problem}</p>
  {/if}
</ReviewNav>

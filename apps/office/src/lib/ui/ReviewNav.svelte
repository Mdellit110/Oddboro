<script lang="ts">
  // The top of a review that steps through the open asks of one kind on the
  // Desk (ReplyReview, FilterReview): "Reply 1 of 3 · from Paige", Back and
  // Next, and the arrow keys outside a field. The review itself goes below.
  import type { AskRow } from '@oddboro/ledger';
  import type { Snippet } from 'svelte';
  import { when } from './format.ts';
  import { chatAbout } from './chat-about.svelte.ts';
  import { around } from './review-steps.ts';
  import type { StaffProfile } from '../staff/roster.ts';

  type Props = {
    /** What one of them is called: "Reply", "Filter". */
    label: string;
    ask: AskRow;
    /** Every open ask of this kind on the desk, oldest first. */
    list: AskRow[];
    staff: StaffProfile[];
    busy: boolean;
    /** Open another by its ask id. */
    ongo: (id: number | undefined) => void;
    /** Open an Odd's card. */
    onstaff: (id: string) => void;
    children: Snippet;
  };
  let { label, ask: a, list, staff, busy, ongo, onstaff, children }: Props = $props();

  const nameOf = (id: string | null) => staff.find((p) => p.id === id)?.name ?? id ?? 'the Odd';
  const here = $derived(around(list, a.id));
  const kind = $derived(label.toLowerCase());

  let view = $state<HTMLElement>();
  /** The arrow keys step through them, unless the cursor is in a field. */
  function onkeydown(e: KeyboardEvent) {
    if (busy || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const focus = document.activeElement;
    // Only while the owner is on this view: the Desk stays mounted behind other windows.
    if (focus && focus !== document.body && !view?.contains(focus)) return;
    if (focus?.closest('input, textarea, select, [contenteditable]')) return;
    if (!view?.checkVisibility()) return;
    const to = e.key === 'ArrowLeft' ? here.prev : here.next;
    if (!to) return;
    e.preventDefault();
    ongo(to.id);
  }
</script>

<svelte:window {onkeydown} />

<div bind:this={view}>
  <div class="flex items-center gap-2">
    <div class="min-w-0 flex-1 text-[10px] tracking-[0.16em] uppercase">
      <span class="text-ember">{label} {here.at + 1} of {list.length}</span>
      <span class="text-faint"
        >· from
        <button
          class="tracking-[0.16em] uppercase hover:text-ink"
          onclick={() => onstaff(a.staffId)}>{nameOf(a.staffId)}</button
        >{#if a.via}, from
          <button
            class="tracking-[0.16em] uppercase hover:text-ink"
            title={`Open ${nameOf(a.via)}'s chat`}
            onclick={() => a.via && chatAbout(a.via, '')}>{nameOf(a.via)}</button
          >'s work{/if} · {when(a.createdAt)}</span
      >
    </div>
    <button
      class="rounded-lg bg-raise px-2 py-1 text-xs text-muted hover:text-ink disabled:opacity-40"
      disabled={!here.prev || busy}
      title={`The ${kind} before (←)`}
      onclick={() => here.prev && ongo(here.prev.id)}>Back</button
    >
    <button
      class="rounded-lg bg-raise px-2 py-1 text-xs text-muted hover:text-ink disabled:opacity-40"
      disabled={!here.next || busy}
      title={`The next ${kind} (→)`}
      onclick={() => here.next && ongo(here.next.id)}>Next</button
    >
  </div>
  {@render children()}
</div>

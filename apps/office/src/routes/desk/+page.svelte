<script lang="ts">
  // The phone desk. The same desk as the office's Desk window
  // (`DeskDrawer.svelte`), shown `away`: what needs the office's computer, a
  // hire window or a chat says to open it at the office. It hears the office's
  // one live line, as the floor does, and reloads the desk on a change and
  // whenever the line opens again, such as when the phone wakes. Nothing polls.
  // Its header holds the switch for a buzz on this phone (`phone-buzz.ts`).
  import { untrack } from 'svelte';
  import type { Desk } from '@oddboro/ledger';
  import { LIVE_TABLES } from '@oddboro/ledger/live-tables';
  import { setZone } from '@oddboro/ledger/time';
  import DeskDrawer from '#lib/ui/DeskDrawer.svelte';
  import FileViewer from '#lib/ui/FileViewer.svelte';
  import { call, type ApiUrl } from '#lib/ui/api.ts';
  import { wins } from '#lib/ui/windows.svelte.ts';
  import { buzzOff, buzzOn, buzzState, type BuzzState } from '#lib/ui/phone-buzz.ts';
  import type { StaffProfile } from '#lib/staff/roster.ts';
  import type { OfficeEvent } from '#lib/server/events.ts';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  setZone(untrack(() => data.zone));
  let staff = $state<StaffProfile[]>(untrack(() => data.staff));
  let desk = $state<Desk>(untrack(() => data.desk));
  const waiting = $derived(desk.asks.length + desk.tasks.length + desk.reports.length);
  /** A file an item opened, shown over the desk, which stays as it was beneath. */
  const file = $derived(wins.list.find((w) => w.id === wins.active && w.kind === 'file'));

  /** The tables whose change the desk shows. */
  const RELOADS = new Set(
    Object.entries(LIVE_TABLES)
      .filter(([, live]) => live.page.includes('refresh') || live.page.includes('reload'))
      .map(([table]) => table)
  );

  async function reload() {
    try {
      const next = await call<{ staff: StaffProfile[]; desk: Desk }>('/api/office');
      staff = next.staff;
      desk = next.desk;
    } catch {
      // The office is out of reach; the next change or reconnect tries again.
    }
  }

  $effect(() => {
    const events = new EventSource('/api/events' satisfies ApiUrl);
    // The line opens again on its own after the phone sleeps: catch up then.
    events.onopen = reload;
    events.onmessage = (m) => {
      const e = JSON.parse(m.data) as OfficeEvent;
      if (e.type === 'change' && RELOADS.has(e.table)) void reload();
    };
    return () => events.close();
  });

  const nothing = () => {};

  /** This phone's buzz, once the page knows it. */
  let buzz = $state<BuzzState | undefined>();
  let buzzBusy = $state(false);
  let buzzProblem = $state('');
  $effect(() => {
    buzzState()
      .then((s) => (buzz = s))
      .catch(() => (buzz = 'cannot'));
  });
  async function flipBuzz() {
    buzzBusy = true;
    buzzProblem = '';
    try {
      buzz = buzz === 'on' ? await buzzOff() : await buzzOn();
    } catch (e) {
      buzzProblem = e instanceof Error ? e.message : String(e);
    } finally {
      buzzBusy = false;
    }
  }
  const BUZZ_LINE: Record<Exclude<BuzzState, 'off' | 'on'>, string> = {
    cannot:
      'To get a buzz when something lands, add the desk to your home screen and open it from there.',
    blocked:
      "Notifications are off for the desk in this phone's settings. Turn them on there to get a buzz."
  };
</script>

<svelte:head>
  <title>{waiting ? `Desk (${waiting})` : 'Desk'}</title>
  <link rel="manifest" href="/desk.webmanifest" />
  <link rel="apple-touch-icon" href="/desk-256.png" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-title" content="Desk" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
</svelte:head>

<main class="phone-desk mx-auto flex h-dvh max-w-xl flex-col">
  <header class="flex items-center gap-2 border-b border-hairline px-4 py-3">
    <h1 class="flex-1 text-base font-medium">Desk</h1>
    <span class="text-sm text-muted">{waiting ? `${waiting} waiting` : 'Clear'}</span>
    {#if buzz === 'on' || buzz === 'off'}
      <button
        class="rounded-lg px-3 text-xs {buzz === 'on'
          ? 'bg-sea/25 text-ink'
          : 'bg-raise text-muted'} disabled:opacity-40"
        aria-pressed={buzz === 'on'}
        disabled={buzzBusy}
        onclick={flipBuzz}>{buzz === 'on' ? 'Buzz on' : 'Buzz me'}</button
      >
    {/if}
  </header>
  {#if buzz === 'cannot' || buzz === 'blocked' || buzzProblem}
    <p class="border-b border-hairline px-4 py-2 text-xs text-muted">
      {buzzProblem || (buzz === 'cannot' || buzz === 'blocked' ? BUZZ_LINE[buzz] : '')}
    </p>
  {/if}
  <div class="min-h-0 flex-1" class:hidden={!!file}>
    <DeskDrawer {desk} {staff} away onhire={nothing} onplan={nothing} onstaff={nothing} />
  </div>
  {#if file?.kind === 'file'}
    <div class="min-h-0 flex-1">
      <FileViewer
        id={file.id}
        file={file.file}
        nameOf={(id) => staff.find((p) => p.id === id)?.name ?? id}
      />
    </div>
  {/if}
</main>

<style>
  /* Room for a thumb: every control on the phone desk is at least 44px tall. */
  .phone-desk :global(button),
  .phone-desk :global(select) {
    min-height: 2.75rem;
  }
  /* 16px text in a field, so a phone does not zoom the page when it gets focus. */
  .phone-desk :global(textarea),
  .phone-desk :global(input:not([type='checkbox'])) {
    font-size: 1rem;
  }
  .phone-desk :global(input[type='checkbox']) {
    width: 1.25rem;
    height: 1.25rem;
  }
  .phone-desk {
    padding-block-start: env(safe-area-inset-top);
    padding-block-end: env(safe-area-inset-bottom);
  }
</style>

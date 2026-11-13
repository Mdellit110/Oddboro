<script lang="ts">
  // The phone desk. Two tabs: Desk, the same desk as the office's Desk window
  // (`DeskDrawer.svelte`) shown `away`, so what needs the office's computer or
  // a hire window says to open it at the office; and Chat, every Odd, each
  // opening its own chat (`ChatPanel.svelte`), as on the computer. A report's
  // Reply and the name on an item open that Odd's chat here too. It hears the
  // office's one live line, as the floor does, and reloads on a change and
  // whenever the line opens again, such as when the phone wakes. Nothing
  // polls. Its header holds the switch for a buzz on this phone
  // (`phone-buzz.ts`).
  import { tick, untrack } from 'svelte';
  import type { Desk } from '@oddboro/ledger';
  import { LIVE_TABLES } from '@oddboro/ledger/live-tables';
  import { setZone } from '@oddboro/ledger/time';
  import ChatPanel from '#lib/ui/ChatPanel.svelte';
  import DeskDrawer from '#lib/ui/DeskDrawer.svelte';
  import FileViewer from '#lib/ui/FileViewer.svelte';
  import Pixel from '#lib/ui/Pixel.svelte';
  import ReportView from '#lib/ui/ReportView.svelte';
  import { call, type ApiUrl } from '#lib/ui/api.ts';
  import { chatRequest, type Delivered } from '#lib/ui/chat-about.svelte.ts';
  import { close, openReport, wins } from '#lib/ui/windows.svelte.ts';
  import { buzzOff, buzzOn, buzzState, type BuzzState } from '#lib/ui/phone-buzz.ts';
  import { waitingKey } from '#lib/desk.ts';
  import type { StaffProfile } from '#lib/staff/roster.ts';
  import type { Work } from '#lib/staff/work.ts';
  import type { OfficeEvent } from '#lib/server/events.ts';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  setZone(untrack(() => data.zone));
  let staff = $state<StaffProfile[]>(untrack(() => data.staff));
  let desk = $state<Desk>(untrack(() => data.desk));
  let inProgress = $state<Record<string, Work[]>>({});
  let toStart = $state<Record<string, Work[]>>({});
  /** Bumps on a change an open chat reloads for, as on the computer. */
  let version = $state(0);
  const waiting = $derived(desk.asks.length + desk.tasks.length + desk.reports.length);

  let tab = $state<'desk' | 'chat'>('desk');
  /** The Odd whose chat is open on the Chat tab, if any. */
  let chatting = $state<string | undefined>();
  const chatWith = $derived(staff.find((p) => p.id === chatting));
  /** The item the desk opens next, as on the computer's Desk. */
  let deskFocus = $state<string | undefined>();

  /** A file or a report an item opened, shown over the page, which stays as it was beneath. */
  const front = $derived(
    wins.list.find((w) => w.id === wins.active && (w.kind === 'file' || w.kind === 'report'))
  );

  const pageOf = (kind: 'refresh' | 'reload' | 'version') =>
    new Set(
      Object.entries(LIVE_TABLES)
        .filter(([, live]) => live.page.includes(kind))
        .map(([table]) => table)
    );
  /** The tables whose change the desk shows, and those an open chat reloads for. */
  const RELOADS = new Set([...pageOf('refresh'), ...pageOf('reload')]);
  const VERSIONS = pageOf('version');

  async function reload() {
    try {
      const next = await call<{
        staff: StaffProfile[];
        desk: Desk;
        inProgress: Record<string, Work[]>;
        toStart: Record<string, Work[]>;
      }>('/api/office');
      staff = next.staff;
      desk = next.desk;
      inProgress = next.inProgress;
      toStart = next.toStart;
    } catch {
      // The office is out of reach; the next change or reconnect tries again.
    }
  }

  $effect(() => {
    const events = new EventSource('/api/events' satisfies ApiUrl);
    // The line opens again on its own after the phone sleeps: catch up then.
    events.onopen = () => {
      version++;
      void reload();
    };
    events.onmessage = (m) => {
      const e = JSON.parse(m.data) as OfficeEvent;
      if (e.type === 'working') {
        inProgress = e.inProgress;
        return;
      }
      if (e.type !== 'change') return;
      if (RELOADS.has(e.table)) void reload();
      if (VERSIONS.has(e.table)) version++;
    };
    return () => events.close();
  });

  function openChat(id: string) {
    chatting = id;
    tab = 'chat';
  }

  // A report's Reply, or a chat about something, opens that Odd's chat here.
  // Opening any item also points the chat at it (`showInChat`), which on the
  // computer selects it beside the desk; on a phone that alone opens nothing.
  $effect(() => {
    const id = chatRequest.staff;
    if (!id) return;
    chatRequest.staff = undefined;
    if (chatRequest.reply?.staff === id || chatRequest.drafts[id] !== undefined) openChat(id);
  });

  /** Something an Odd delivered, tapped in its chat: on the desk while it waits, else a report on its own. */
  async function openItem(staffId: string, d: Delivered) {
    const key = waitingKey(desk, d);
    if (key) {
      tab = 'desk';
      // Cleared first, so asking for the item already open still brings it back.
      deskFocus = undefined;
      await tick();
      deskFocus = key;
    } else if (d.kind === 'report') openReport({ id: d.id, staff: staffId, title: d.title });
  }

  /** How many items each Odd has waiting on the desk. */
  const waitingFrom = $derived(
    [...desk.asks, ...desk.tasks, ...desk.reports].reduce<Record<string, number>>((n, i) => {
      if (i.staffId) n[i.staffId] = (n[i.staffId] ?? 0) + 1;
      return n;
    }, {})
  );

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
  <header class="flex items-center gap-2 border-b border-hairline px-3 py-2">
    <div class="flex flex-1 gap-1" role="tablist" aria-label="Desk or chat">
      {#each [{ id: 'desk', label: waiting ? `Desk (${waiting})` : 'Desk' }, { id: 'chat', label: 'Chat' }] as const as t (t.id)}
        <button
          class="rounded-lg px-3 text-sm {tab === t.id ? 'bg-raise text-ink' : 'text-muted'}"
          role="tab"
          aria-selected={tab === t.id}
          onclick={() => (tab = t.id)}>{t.label}</button
        >
      {/each}
    </div>
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

  <div class="min-h-0 flex-1" class:hidden={!!front || tab !== 'desk'}>
    <DeskDrawer
      {desk}
      {staff}
      away
      focus={deskFocus}
      onhire={nothing}
      onplan={nothing}
      onstaff={openChat}
    />
  </div>

  <div class="flex min-h-0 flex-1 flex-col" class:hidden={!!front || tab !== 'chat'}>
    {#if chatWith}
      <div class="flex items-center gap-2 border-b border-hairline px-3 py-1.5">
        <button
          class="flex items-center gap-1.5 rounded-lg bg-raise px-2.5 text-xs text-ink"
          onclick={() => (chatting = undefined)}
        >
          <svg
            class="size-3 rtl:-scale-x-100"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"><path d="M7.5 2.5 4 6l3.5 3.5" /></svg
          >
          All Odds
        </button>
        <span class="min-w-0 flex-1 truncate text-sm font-medium">{chatWith.name}</span>
      </div>
      {#key chatWith.id}
        <div class="min-h-0 flex-1">
          <ChatPanel
            profile={chatWith}
            {version}
            onstart={nothing}
            onend={nothing}
            visible={tab === 'chat' && !front}
            onitem={(d) => openItem(chatWith.id, d)}
            work={[...(inProgress[chatWith.id] ?? []), ...(toStart[chatWith.id] ?? [])]}
            onwork={nothing}
          />
        </div>
      {/key}
    {:else}
      <ul class="flex flex-col gap-1.5 overflow-y-auto p-3">
        {#each staff as p (p.id)}
          <li>
            <button
              class="flex w-full items-center gap-3 rounded-xl bg-raise px-3 py-2.5 text-start hover:bg-sea/15"
              onclick={() => openChat(p.id)}
            >
              <Pixel
                src={p.look?.portrait}
                frame={`${p.portrait}/default`}
                fallback={`${p.sprite}@${p.variant}/idle-down-0`}
                scale={1}
                label={p.name}
                class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sea-deep"
              />
              <span class="min-w-0 flex-1">
                <span class="block text-sm text-ink">{p.name}</span>
                <span class="block truncate text-xs text-muted">{p.role}</span>
              </span>
              {#if waitingFrom[p.id]}
                <span class="rounded-full bg-ember/20 px-2 py-0.5 text-[11px] text-ember"
                  >{waitingFrom[p.id]} waiting</span
                >
              {/if}
            </button>
          </li>
        {:else}
          <li class="py-10 text-center text-sm text-muted">No Odds in the office yet.</li>
        {/each}
      </ul>
    {/if}
  </div>

  {#if front?.kind === 'file'}
    <div class="min-h-0 flex-1">
      <FileViewer
        id={front.id}
        file={front.file}
        nameOf={(id) => staff.find((p) => p.id === id)?.name ?? id}
      />
    </div>
  {:else if front?.kind === 'report'}
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="border-b border-hairline px-3 py-1.5">
        <button class="rounded-lg bg-raise px-2.5 text-xs text-ink" onclick={() => close(front.id)}
          >Back</button
        >
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <ReportView report={front.report} {staff} />
      </div>
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

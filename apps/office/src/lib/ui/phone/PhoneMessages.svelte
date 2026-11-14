<script lang="ts">
  // The phone's Messages: every Odd, each opening its own chat
  // (`ChatPanel.svelte`), as on the computer. The phone desk's Chat tab
  // until phase 2 gives it a list of its own.
  import ChatPanel from '#lib/ui/ChatPanel.svelte';
  import type { Delivered } from '#lib/ui/chat-about.svelte.ts';
  import type { StaffProfile } from '#lib/staff/roster.ts';
  import type { Work } from '#lib/staff/work.ts';
  import OddFace from './OddFace.svelte';

  type Props = {
    staff: StaffProfile[];
    /** The Odd whose chat is open, if any. */
    chatting: string | undefined;
    onchat: (id: string | undefined) => void;
    version: number;
    visible: boolean;
    inProgress: Record<string, Work[]>;
    toStart: Record<string, Work[]>;
    /** How many items each Odd has waiting on the desk. */
    waitingFrom: Record<string, number>;
    onitem: (staffId: string, d: Delivered) => void;
  };
  let {
    staff,
    chatting,
    onchat,
    version,
    visible,
    inProgress,
    toStart,
    waitingFrom,
    onitem
  }: Props = $props();
  const chatWith = $derived(staff.find((p) => p.id === chatting));
  const nothing = () => {};
</script>

<div class="flex h-full flex-col">
  {#if chatWith}
    <div class="flex items-center gap-2 border-b border-hairline px-3 py-1.5">
      <button
        class="flex items-center gap-1.5 rounded-lg bg-raise px-3 text-sm text-ink"
        onclick={() => onchat(undefined)}
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
        Messages
      </button>
      <span class="min-w-0 flex-1 truncate font-medium">{chatWith.name}</span>
    </div>
    {#key chatWith.id}
      <div class="min-h-0 flex-1">
        <ChatPanel
          profile={chatWith}
          {version}
          onstart={nothing}
          onend={nothing}
          {visible}
          onitem={(d) => onitem(chatWith.id, d)}
          work={[...(inProgress[chatWith.id] ?? []), ...(toStart[chatWith.id] ?? [])]}
          onwork={nothing}
        />
      </div>
    {/key}
  {:else}
    <header class="border-b border-hairline px-5 pt-6 pb-4">
      <h1 class="text-2xl font-semibold text-ink">Messages</h1>
    </header>
    <ul class="flex flex-col gap-2 overflow-y-auto p-4">
      {#each staff as p (p.id)}
        <li>
          <button
            class="flex w-full items-center gap-3 rounded-2xl bg-raise px-4 py-3 text-start"
            onclick={() => onchat(p.id)}
          >
            <OddFace odd={p} />
            <span class="min-w-0 flex-1">
              <span class="block font-medium text-ink">{p.name}</span>
              <span class="block truncate text-sm text-muted">{p.role}</span>
            </span>
            {#if waitingFrom[p.id]}
              <span class="rounded-full bg-ember/20 px-2 py-0.5 text-xs text-ember"
                >{waitingFrom[p.id]} waiting</span
              >
            {/if}
          </button>
        </li>
      {:else}
        <li class="py-10 text-center text-muted">No Odds in the office yet.</li>
      {/each}
    </ul>
  {/if}
</div>

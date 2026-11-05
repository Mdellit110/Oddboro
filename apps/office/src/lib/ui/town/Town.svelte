<script lang="ts" module>
  import type { Shop } from '@oddboro/ledger/town';
  import type { World } from '@oddboro/world';
  import type { StaffProfile } from '../../staff/roster.ts';

  /** What the first session asks of the page around it. */
  export type TownStage = {
    /** The owner's Odd, Pip, and a friend who invited them, onto the floor. */
    people: (opts: { pipWalksUp: boolean }) => Promise<void> | void;
    /** Walk the owner's Odd to a shop, or to their plot. Pip walks with them. */
    walk: (to: Shop | 'plot') => void;
    /** The shops nearest the owner's Odd first. */
    nearest: () => Shop[];
    /** Walk the owner's Odd back out of the shop onto the street. */
    walkOut: () => void;
    /** A shop's Odd was hired: it comes onto the floor behind its counter. */
    shopOdd: (shop: Shop, staffId: string) => Promise<void> | void;
    /** Take the owner to their boro: it goes up on their plot, room by room. */
    toBoro: (world: World, name: string) => Promise<void>;
    /** Their boro changed its look: the floor shows it at once. */
    restyle: (world: World) => void;
    /** Back to Main Street from the boro. */
    toTown: () => void;
    /** A new Odd arrives: the bus, then a walk to the front door and in. */
    arrive: (odd: StaffProfile) => Promise<void>;
    /** The first session is over: the office opens as theirs, with their new Odd's chat. */
    finish: (odd: StaffProfile) => void;
  };
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import {
    answerSource,
    BASIS_WORDS,
    EVENT_WORDS,
    KIND_WORDS,
    QUESTIONS,
    SHOP_IDS,
    SHOPS,
    STYLE_IDS,
    STYLES,
    type BoroStyle,
    type ContextItem,
    type Invite,
    type TownEvent,
    type TownState
  } from '@oddboro/ledger/town';
  import type { LookSpec } from '@oddboro/sprites/look';
  import { call } from '../api.ts';
  import ChatPanel from '../ChatPanel.svelte';
  import ClaudeCard from '../onboarding/ClaudeCard.svelte';
  import BringAgent from './BringAgent.svelte';
  import HireManager from './HireManager.svelte';
  import OddMaker from './OddMaker.svelte';

  type Props = {
    stage: TownStage;
    /** Bumps when the office changes, e.g. an Odd offers to remember something. */
    version: number;
    /** The floor shows their boro, not Main Street. */
    atBoro: boolean;
  };
  let { stage, version, atBoro }: Props = $props();

  type View = {
    state: TownState;
    memory: boolean;
    context: ContextItem[];
    folk: { id: string; name: string; shop: Shop; remit: string }[];
    profiles: StaffProfile[];
    counts: Partial<Record<TownEvent, number>>;
    answers: Partial<Record<Shop, string>>;
  };
  type Me = { name: string; look: LookSpec | null; invite: Invite | null };
  type Page = 'pip' | 'odd' | 'street' | 'shop' | 'boro' | 'hire' | 'bring' | 'knows' | 'stats';

  let view = $state<View | undefined>();
  let mine = $state<Me | undefined>();
  let page = $state<Page>('pip');
  let shop = $state<Shop | undefined>();
  let returning = $state(false);
  let problem = $state('');
  let busy = $state(false);
  let claudeReady = $state<boolean | undefined>();
  let chatting = $state(false);
  let inviting = $state(false);
  let inviteText = $state('');
  let editing = $state<{ id: number; title: string; body: string } | undefined>();
  let restyling = $state(false);
  let lookOpen = $state(false);
  /** The boro as the owner is shaping it: saved on the way to hiring. */
  let boroName = $state('');
  let boroStyle = $state<BoroStyle>('village');
  let boroSaved = '';
  /** What a shopkeeper said back to the owner's answer. */
  let replied = $state<Partial<Record<Shop, string>>>({});

  const here = $derived(shop && view?.folk.find((f) => f.shop === shop));
  const profile = $derived(here && view?.profiles.find((p) => p.id === here.id));
  const kept = $derived(view?.context.filter((c) => c.status === 'kept') ?? []);
  const waiting = $derived(
    view?.context.filter((c) => c.status === 'proposed' && here && c.source === here.id) ?? []
  );
  /** The shops, nearest first, as the owner stood when they last moved on. */
  let order = $state<Shop[]>([...SHOP_IDS]);
  const nextShop = $derived(order.find((s) => !view?.state.visited.includes(s) && s !== shop));
  const reorder = () => {
    const o = stage.nearest();
    if (o.length) order = o;
  };
  const friend = $derived(mine?.invite?.name);
  const first = (n: string) => n.split(' ')[0];

  async function act(body: Record<string, unknown>): Promise<boolean> {
    busy = true;
    problem = '';
    try {
      view = await call<View>('/api/town', body);
      return true;
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
      return false;
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    void (async () => {
      try {
        const r = await call<View & { returning: boolean }>('/api/town', { action: 'arrive' });
        view = r;
        returning = r.returning;
        mine = await call<Me>('/api/me');
        if (!mine.look) await giveDefaultLook();
        boroName = r.state.boro?.name ?? '';
        boroStyle = r.state.boro?.style ?? 'village';
        boroSaved = JSON.stringify(r.state.boro ?? null);
        page = atBoro ? 'boro' : r.state.welcomed ? 'street' : r.state.made ? 'pip' : 'odd';
        await stage.people({ pipWalksUp: !r.state.made && !atBoro });
        reorder();
      } catch {
        // Main Street still works without its memory: nothing is remembered.
        view = {
          state: { visited: [], sessions: 1 },
          memory: false,
          context: [],
          folk: [],
          profiles: [],
          counts: {},
          answers: {}
        };
        problem = 'Oddboro could not load where you left off. You can still look around.';
      }
    })();
    void checkClaude();
  });

  // An Odd offered to remember something, passed a brief, or made a file.
  let seenVersion = 0;
  $effect(() => {
    const v = version;
    if (v === seenVersion || !view) return;
    seenVersion = v;
    void call<View>('/api/town')
      .then((r) => (view = r))
      .catch(() => {});
  });

  async function checkClaude() {
    try {
      const s = await call<{ auth: 'plan' | 'key'; account?: object }>('/api/setup/claude');
      claudeReady = s.auth === 'key' || !!s.account;
    } catch {
      claudeReady = false;
    }
  }

  /** Everyone walks Main Street as someone: a look of their own to start, changed any time. */
  async function giveDefaultLook() {
    try {
      const p = await call<{
        hair: string[];
        top: string[];
        bottom: string[];
        colours: Record<string, { name: string }[]>;
      }>('/api/me/parts');
      const any = <T,>(l: T[]) => l[Math.floor(Math.random() * l.length)];
      const look: LookSpec = {
        hair: any(p.hair.filter((h) => h !== 'bald')),
        top: any(p.top.filter((t) => t !== 'apron')),
        bottom: any(p.bottom),
        colours: {
          hair: any(p.colours.hair).name,
          skin: any(p.colours.skin).name,
          top: any(p.colours.cloth).name,
          bottom: any(p.colours.cloth).name,
          shoes: any(p.colours.shoes).name
        }
      };
      mine = await call<Me>('/api/me', { look }, 'PUT');
    } catch {
      // No look: they walk Main Street in the town's own art.
    }
  }

  // Walking

  /** The owner's Odd walked into a shop. */
  export function visit(s: Shop) {
    if (shop === s && page === 'shop') return;
    shop = s;
    chatting = false;
    page = 'shop';
    void act({ action: 'enter', shop: s });
  }

  /** The owner's Odd walked back out onto the street. */
  export function left() {
    if (page !== 'shop') return;
    reorder();
    page = 'street';
    shop = undefined;
    chatting = false;
    void act({ action: 'leave' });
  }

  /** The owner's Odd stepped onto their plot. */
  export function atPlot() {
    if (page === 'street' || page === 'pip') void goBoro();
  }

  function street() {
    if (page === 'shop') stage.walkOut();
    page = 'street';
    shop = undefined;
    chatting = false;
  }

  // Pip's hello

  async function choose(mode: 'tour' | 'boro') {
    if (!(await act({ action: 'choose', mode }))) return;
    if (mode === 'boro') return goBoro();
    page = 'street';
    reorder();
    stage.walk(order[0]);
  }

  /** They made their Odd: Pip sees them for the first time, then offers the way on. */
  async function oddMade() {
    mine = await call<Me>('/api/me');
    await act({ action: 'made' });
    await stage.people({ pipWalksUp: false });
    page = 'pip';
  }

  async function useInvite() {
    busy = true;
    problem = '';
    try {
      mine = await call<Me>('/api/me', { invite: inviteText });
      inviting = false;
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  // Shops

  async function answer(s: Shop, id: string) {
    const a = QUESTIONS[s].answers.find((x) => x.id === id);
    if (!a || !(await act({ action: 'answer', shop: s, answer: id }))) return;
    replied = { ...replied, [s]: a.reply };
  }

  async function chatWith(s: Shop) {
    busy = true;
    problem = '';
    try {
      const r = await call<View & { staff: StaffProfile }>('/api/town', {
        action: 'meet',
        shop: s
      });
      view = r;
      chatting = true;
      await stage.shopOdd(s, r.staff.id);
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  // Their boro

  async function goBoro() {
    busy = true;
    problem = '';
    try {
      const r = await call<{ name: string; style: BoroStyle; world: World }>('/api/boro', {
        action: 'keep',
        name: boroName,
        style: boroStyle
      });
      boroName = r.name;
      boroStyle = r.style;
      boroSaved = JSON.stringify({ name: r.name, style: r.style });
      page = 'boro';
      await stage.toBoro(r.world, r.name);
      view = await call<View>('/api/town');
    } catch (e) {
      problem = `Your boro could not go up: ${e instanceof Error ? e.message : e}. Try again, or keep exploring Main Street.`;
    } finally {
      busy = false;
    }
  }

  /** A new name or look shows on the floor at once, and is kept. */
  async function preview(style: BoroStyle) {
    boroStyle = style;
    restyling = true;
    problem = '';
    try {
      const r = await call<{ name: string; world: World }>('/api/boro', {
        action: 'keep',
        name: boroName,
        style
      });
      boroName = r.name;
      boroSaved = JSON.stringify({ name: r.name, style });
      stage.restyle(r.world);
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      restyling = false;
    }
  }

  /** Keep the boro as it looks now, if it changed. */
  async function keepBoro() {
    const now = JSON.stringify({ name: boroName.trim(), style: boroStyle });
    if (now === boroSaved) return;
    await call('/api/boro', { action: 'keep', name: boroName, style: boroStyle });
    boroSaved = now;
  }

  async function startHire() {
    try {
      await keepBoro();
    } catch {
      // The boro keeps its last saved look; hiring does not wait on it.
    }
    page = 'hire';
  }

  async function startBring() {
    if (atBoro) {
      try {
        await keepBoro();
      } catch {
        // As above.
      }
    }
    page = 'bring';
  }

  async function hired(m: StaffProfile) {
    await stage.arrive(m);
    stage.finish(m);
  }

  async function brought(odd: StaffProfile) {
    const ok = await act({
      action: 'first-odd',
      id: odd.id,
      zone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
    if (!ok) return;
    if (atBoro) await stage.arrive(odd);
    stage.finish(odd);
  }

  // What Pip says

  const pipLine = $derived.by(() => {
    if (!view) return '';
    if (returning)
      return view.state.boro
        ? `Welcome back! ${view.state.boro.name} is just where you left it.`
        : 'Welcome back! Pick up wherever you like.';
    const v = view.state.visited;
    if (!v.length)
      return 'Walk through any door. Click where you want to go, or use the arrow keys.';
    if (nextShop)
      return `Nice! The ${SHOPS[nextShop].name} is just down the street. Or head to your boro any time.`;
    return "That's Main Street! Your boro is waiting whenever you are.";
  });
</script>

{#snippet back(label = 'Main Street')}
  <button class="rounded-full px-2 py-1 text-sm text-muted hover:text-ink" onclick={street}
    >{label}</button
  >
{/snippet}

<div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
  {#if !view}
    <p class="p-4 text-sm text-muted">Pip is on the way…</p>
  {:else if page === 'odd'}
    <section class="flex flex-col gap-3 p-4" aria-label="Make your Odd">
      <div class="rounded-xl bg-raise p-3">
        <div class="text-[10px] tracking-[0.22em] text-sea uppercase">Pip, city council</div>
        <p class="mt-1 text-sm text-ink">
          Hey! You're new here, aren't you? I'm Pip. I run the city council, so welcoming folks is
          my favorite part of the job. Welcome to Oddboro!
        </p>
        <p class="mt-2 text-sm text-ink">
          First things first: let's make your Odd. That's you, here in Oddboro.
        </p>
      </div>
      {#if mine}
        <OddMaker
          name={mine.name}
          look={mine.look}
          canDraw={claudeReady === true}
          onmade={oddMade}
        />
      {/if}
    </section>
  {:else if page === 'pip'}
    <section class="flex flex-col gap-3 p-4" aria-label="Pip says hello">
      <div class="rounded-xl bg-raise p-3">
        <div class="text-[10px] tracking-[0.22em] text-sea uppercase">Pip, city council</div>
        <p class="mt-1 text-sm text-ink">
          Look at you{mine?.name ? `, ${first(mine.name)}` : ''}! You fit right in.
        </p>
        {#if friend}
          <p class="mt-2 text-sm text-ink">
            {friend} told me you were coming! {friend} will meet you at your boro.
          </p>
        {/if}
        <p class="mt-2 text-sm text-ink">
          Everyone's building something different around here: a little world of AI helpers we call
          Odds, who do real work for you. Want me to walk you around and introduce you, or should we
          head straight to your place?
        </p>
      </div>
      <button
        class="rounded-xl bg-sea px-4 py-3 text-base font-medium text-night disabled:opacity-50"
        disabled={busy}
        onclick={() => choose('tour')}>Show me around!</button
      >
      <button
        class="rounded-xl bg-raise px-4 py-3 text-base font-medium text-ink hover:bg-sea/20 disabled:opacity-50"
        disabled={busy}
        onclick={() => choose('boro')}>Take me to my boro!</button
      >
      <div class="mt-2 flex flex-col gap-1.5 text-xs text-muted">
        {#if !friend}
          {#if inviting}
            <form
              class="flex gap-2"
              onsubmit={(e) => {
                e.preventDefault();
                void useInvite();
              }}
            >
              <input
                class="flex-1 rounded-lg bg-raise px-2 py-1 text-xs text-ink"
                aria-label="Your invite link"
                bind:value={inviteText}
                placeholder="Paste your invite link"
              />
              <button class="rounded-lg bg-raise px-2 py-1 text-ink hover:bg-sea/20">Use it</button>
            </form>
          {:else}
            <button
              class="self-start underline underline-offset-2 hover:text-ink"
              onclick={() => (inviting = true)}>Did a friend invite you?</button
            >
          {/if}
        {/if}
        <button
          class="self-start underline underline-offset-2 hover:text-ink"
          onclick={() => {
            void act({ action: 'choose', mode: 'boro' });
            page = 'bring';
          }}>Already have an agent? Bring them to Oddboro</button
        >
      </div>
    </section>
  {:else if page === 'street'}
    <section class="flex flex-col gap-3 p-4" aria-label="Main Street">
      <div class="rounded-xl bg-raise p-3">
        <div class="text-[10px] tracking-[0.22em] text-sea uppercase">Pip, city council</div>
        <p class="mt-1 text-sm text-ink">{pipLine}</p>
      </div>
      <button
        class="rounded-xl bg-sea px-4 py-2.5 text-sm font-medium text-night disabled:opacity-50"
        disabled={busy}
        onclick={goBoro}
        >{view.state.boro ? `Back to ${view.state.boro.name}` : 'Take me to my boro!'}</button
      >
      <ul class="flex flex-col gap-2" aria-label="Places on Main Street, nearest first">
        {#each order as s (s)}
          {@const been = view.state.visited.includes(s)}
          <li>
            <button
              class="w-full rounded-xl border p-3 text-start hover:bg-raise {s === nextShop &&
              view.state.guide === 'guided'
                ? 'border-sea'
                : 'border-hairline'}"
              onclick={() => stage.walk(s)}
            >
              <div class="flex items-baseline gap-2">
                <span class="font-pixel text-base text-ink">{SHOPS[s].name}</span>
                {#if been}<span class="text-[11px] text-muted">visited</span>{/if}
                <span class="ms-auto text-[11px] text-sea">Walk there</span>
              </div>
              <div class="text-xs text-muted">{SHOPS[s].does}</div>
            </button>
          </li>
        {/each}
      </ul>
      <div class="flex flex-wrap gap-3 text-xs text-muted">
        <button class="underline underline-offset-2 hover:text-ink" onclick={() => (page = 'knows')}
          >What Oddboro knows ({kept.filter((c) => c.kind !== 'handoff').length})</button
        >
        <button class="underline underline-offset-2 hover:text-ink" onclick={() => (page = 'stats')}
          >Town stats</button
        >
      </div>
    </section>
  {:else if page === 'shop' && shop}
    {@const q = QUESTIONS[shop]}
    {@const said = view.answers[shop]}
    <section class="flex min-h-0 flex-1 flex-col" aria-label={SHOPS[shop].name}>
      <header class="flex items-start gap-2 border-b border-hairline p-3">
        {@render back('Walk out')}
        <div class="min-w-0 flex-1">
          <div class="font-pixel text-lg leading-tight text-ink">{SHOPS[shop].name}</div>
          <div class="text-xs text-muted">{SHOPS[shop].does}</div>
        </div>
      </header>

      {#if !chatting}
        <div class="flex flex-col gap-3 p-3">
          {#if !view.state.visited.slice(0, -1).includes(shop) && !replied[shop]}
            <div class="rounded-xl bg-raise/60 p-3">
              <div class="text-[10px] tracking-[0.22em] text-sea uppercase">Pip</div>
              <p class="mt-1 text-sm text-ink">
                {q.who}, meet {mine?.name ? first(mine.name) : 'our newest neighbor'}! Just moved to
                town.
              </p>
            </div>
          {/if}
          <div class="rounded-xl bg-raise p-3">
            <div class="text-[10px] tracking-[0.22em] text-sea uppercase">{q.who}</div>
            <p class="mt-1 text-sm text-ink">{q.hello}</p>
            <p class="mt-2 text-sm text-ink">{replied[shop] ?? q.ask}</p>
          </div>
          {#if !replied[shop]}
            <div class="flex flex-col gap-1.5" role="group" aria-label={q.ask}>
              {#each q.answers as a (a.id)}
                <button
                  class="rounded-lg border px-3 py-2 text-start text-sm text-ink hover:bg-raise disabled:opacity-50 {said ===
                  a.keep
                    ? 'border-sea bg-sea/10'
                    : 'border-hairline'}"
                  disabled={busy}
                  onclick={() => answer(shop!, a.id)}>{a.label}</button
                >
              {/each}
            </div>
          {/if}
          {#if said}
            <p class="text-xs text-muted">
              Saved: {said}.
              <button
                class="underline underline-offset-2 hover:text-ink"
                onclick={() => (replied = { ...replied, [shop!]: undefined })}>Change</button
              >
              {#if !view.memory}(Memory is off, so this lasts only this visit.){/if}
            </p>
          {:else if !view.memory && replied[shop]}
            <p class="text-xs text-muted">Memory is off, so nothing was kept.</p>
          {/if}
          <div class="flex flex-col gap-2">
            {#if nextShop && nextShop !== shop}
              <button
                class="rounded-lg bg-sea px-3 py-2 text-sm font-medium text-night"
                onclick={() => {
                  stage.walk(nextShop!);
                }}>Next stop: the {SHOPS[nextShop].name}</button
              >
            {/if}
            <button
              class="rounded-lg bg-raise px-3 py-2 text-sm text-ink hover:bg-sea/20 disabled:opacity-50"
              disabled={busy}
              onclick={goBoro}>Take me to my boro</button
            >
            <button
              class="self-start text-xs text-muted underline underline-offset-2 hover:text-ink disabled:opacity-50"
              disabled={busy}
              onclick={() => chatWith(shop!)}>Chat with {q.who}</button
            >
          </div>
        </div>
      {:else}
        {#each waiting as c (c.id)}
          <div class="border-b border-hairline bg-sea/10 px-3 py-2">
            {#if c.kind === 'handoff'}
              {@const to = view.folk.find((f) => f.id === c.forStaffId)?.shop}
              <div class="text-xs text-muted">
                {here?.name} would pass this to the {to ? SHOPS[to].name : 'next shop'}:
              </div>
              <div class="text-sm text-ink">{c.title}</div>
              <div class="mt-1.5 flex gap-2">
                <button
                  class="rounded-lg bg-sea px-2.5 py-1 text-xs font-medium text-night"
                  disabled={busy}
                  onclick={async () => {
                    if ((await act({ action: 'keep', id: c.id, shop })) && to) stage.walk(to);
                  }}>Yes, take me there</button
                >
                <button
                  class="rounded-lg bg-raise px-2.5 py-1 text-xs text-muted hover:text-ink"
                  disabled={busy}
                  onclick={() => act({ action: 'drop', id: c.id })}>Not now</button
                >
              </div>
            {:else}
              <div class="text-xs text-muted">Remember this? · {KIND_WORDS[c.kind]}</div>
              <div class="text-sm text-ink">{c.title}</div>
              <div class="mt-1.5 flex gap-2">
                <button
                  class="rounded-lg bg-sea px-2.5 py-1 text-xs font-medium text-night"
                  disabled={busy}
                  onclick={() => act({ action: 'keep', id: c.id, shop })}>Remember</button
                >
                <button
                  class="rounded-lg bg-raise px-2.5 py-1 text-xs text-muted hover:text-ink"
                  disabled={busy}
                  onclick={() => act({ action: 'drop', id: c.id })}>Don't</button
                >
              </div>
            {/if}
          </div>
        {/each}
        {#if claudeReady === false}
          <div class="p-3">
            <p class="mb-2 text-sm text-ink">
              Chatting with {q.who} takes Claude. Connect it once, and every Odd can talk.
            </p>
            <ClaudeCard
              onnext={checkClaude}
              onback={() => (chatting = false)}
              wantKey={false}
              onmodel={() => {}}
            />
          </div>
        {:else if profile}
          <div class="flex min-h-0 flex-1 flex-col">
            <ChatPanel
              {profile}
              {version}
              visible={true}
              onstart={() => {}}
              onend={() => {}}
              onitem={() => {}}
            />
          </div>
        {/if}
      {/if}
    </section>
  {:else if page === 'boro'}
    <section class="flex flex-col gap-3 p-4" aria-label="Your boro">
      <div class="rounded-xl bg-raise p-3">
        <div class="text-[10px] tracking-[0.22em] text-sea uppercase">Pip</div>
        <p class="mt-1 text-sm text-ink">
          {returning
            ? `Welcome back to ${boroName || 'your boro'}!`
            : "Well, here we are. This is your corner of Oddboro. Doesn't look like much yet, but that's the fun part."}
        </p>
        {#if friend && !returning}
          <p class="mt-2 text-sm text-ink">{friend} came to say hi. Look, by your door!</p>
        {/if}
      </div>

      <label class="flex flex-col gap-1 text-xs text-muted">
        What's it called?
        <input
          class="rounded-lg bg-raise px-2.5 py-1.5 font-pixel text-base text-ink"
          maxlength="40"
          bind:value={boroName}
          onchange={() => preview(boroStyle)}
          placeholder={mine?.name ? `${first(mine.name)}'s Boro` : 'My Boro'}
        />
      </label>

      <div class="flex flex-col gap-1 text-xs text-muted">
        What should it feel like?
        <div class="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Style">
          {#each STYLE_IDS as s (s)}
            <button
              class="rounded-lg border p-2 text-start disabled:opacity-60 {boroStyle === s
                ? 'border-sea bg-sea/10'
                : 'border-hairline hover:bg-raise'}"
              role="radio"
              aria-checked={boroStyle === s}
              disabled={restyling}
              onclick={() => preview(s)}
            >
              <div class="text-sm text-ink">{STYLES[s].name}</div>
              <div class="text-[11px] leading-snug text-muted">{STYLES[s].says}</div>
            </button>
          {/each}
        </div>
      </div>

      {#if lookOpen && mine}
        <OddMaker
          name={mine.name}
          look={mine.look}
          canDraw={claudeReady === true}
          onmade={async () => {
            lookOpen = false;
            mine = await call<Me>('/api/me');
            await stage.people({ pipWalksUp: false });
          }}
        />
      {:else}
        <button
          class="self-start text-xs text-muted underline underline-offset-2 hover:text-ink"
          onclick={() => (lookOpen = true)}>Change how you look</button
        >
      {/if}

      <div class="mt-1 rounded-xl border border-sea/50 p-3">
        <p class="text-sm text-ink">
          Every great operation needs someone keeping things running. Want to hire your first office
          manager?
        </p>
        <button
          class="mt-2 w-full rounded-lg bg-sea px-3 py-2.5 text-base font-medium text-night"
          onclick={startHire}>Hire my office manager</button
        >
      </div>
      <div class="flex flex-wrap gap-3 text-xs text-muted">
        <button class="underline underline-offset-2 hover:text-ink" onclick={startBring}
          >Already have an agent? Bring them in</button
        >
        <button
          class="underline underline-offset-2 hover:text-ink"
          onclick={async () => {
            await keepBoro().catch(() => {});
            page = 'street';
            stage.toTown();
          }}>Back to Main Street</button
        >
      </div>
    </section>
  {:else if page === 'hire'}
    <div class="p-4">
      <HireManager
        answers={view.answers}
        owner={mine?.name ?? ''}
        onhired={hired}
        oncancel={() => (page = 'boro')}
      />
    </div>
  {:else if page === 'bring'}
    <div class="p-4">
      <BringAgent onready={brought} oncancel={() => (page = atBoro ? 'boro' : 'pip')} />
    </div>
  {:else if page === 'knows'}
    <section class="flex flex-col gap-3 p-4" aria-label="What Oddboro knows">
      <header class="flex items-center gap-2">
        {@render back('Back')}
        <h2 class="flex-1 font-pixel text-lg text-ink">What Oddboro knows</h2>
      </header>
      <p class="text-xs text-muted">
        Only what you told the town or pressed Remember on. Odds read it so you never repeat
        yourself. It stays on this computer.
      </p>
      <label class="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={view.memory}
          onchange={(e) => act({ action: 'memory', on: e.currentTarget.checked })}
        />
        Let Oddboro remember things about me
      </label>
      {#if !kept.length}<p class="text-sm text-muted">Nothing yet.</p>{/if}
      <ul class="flex flex-col gap-2">
        {#each kept as c (c.id)}
          {@const where = SHOP_IDS.find((s) => answerSource(s) === c.source)}
          <li class="rounded-xl border border-hairline p-3">
            <div class="text-[11px] text-muted">
              {KIND_WORDS[c.kind]} · {c.basis === 'said' ? 'you said it' : BASIS_WORDS[c.basis]} ·
              {where
                ? `at the ${SHOPS[where].name}`
                : c.source === 'owner'
                  ? 'from you'
                  : `from ${view.folk.find((f) => f.id === c.source)?.name ?? c.source}`}
            </div>
            {#if editing?.id === c.id}
              <form
                class="mt-1 flex flex-col gap-1.5"
                onsubmit={async (e) => {
                  e.preventDefault();
                  if (editing && (await act({ action: 'edit', ...editing }))) editing = undefined;
                }}
              >
                <input
                  class="rounded bg-raise px-2 py-1 text-sm text-ink"
                  aria-label="What to remember"
                  maxlength="160"
                  bind:value={editing.title}
                />
                <div class="flex gap-2">
                  <button class="rounded-lg bg-sea px-2.5 py-1 text-xs font-medium text-night"
                    >Save</button
                  >
                  <button
                    type="button"
                    class="rounded-lg px-2.5 py-1 text-xs text-muted hover:text-ink"
                    onclick={() => (editing = undefined)}>Cancel</button
                  >
                </div>
              </form>
            {:else}
              <div class="text-sm text-ink">{c.title}</div>
              <div class="mt-1.5 flex gap-3 text-xs">
                {#if c.kind !== 'outcome'}
                  <button
                    class="text-muted underline underline-offset-2 hover:text-ink"
                    onclick={() => (editing = { id: c.id, title: c.title, body: c.body })}
                    >Correct</button
                  >
                {/if}
                <button
                  class="text-muted underline underline-offset-2 hover:text-coral"
                  onclick={() => act({ action: 'drop', id: c.id })}>Delete</button
                >
              </div>
            {/if}
          </li>
        {/each}
      </ul>
      {#if kept.length}
        <button
          class="self-start rounded-lg bg-raise px-3 py-1.5 text-xs text-muted hover:bg-coral/25 hover:text-ink"
          onclick={() => {
            if (confirm('Forget everything Oddboro remembers about you?'))
              void act({ action: 'forget' });
          }}>Forget everything</button
        >
      {/if}
    </section>
  {:else if page === 'stats'}
    <section class="flex flex-col gap-3 p-4" aria-label="Town stats">
      <header class="flex items-center gap-2">
        {@render back('Back')}
        <h2 class="flex-1 font-pixel text-lg text-ink">Town stats</h2>
      </header>
      <p class="text-xs text-muted">
        Counted on this computer only. Never sent anywhere, and never anything you said.
      </p>
      <ul class="flex flex-col gap-1 text-sm">
        {#each Object.entries(EVENT_WORDS) as [k, words] (k)}
          <li class="flex justify-between gap-3">
            <span class="text-ink">{words}</span>
            <span class="text-muted tabular-nums">{view.counts[k as TownEvent] ?? 0}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if problem}
    <p class="px-4 pb-3 text-xs text-coral" role="alert">{problem}</p>
  {/if}
</div>

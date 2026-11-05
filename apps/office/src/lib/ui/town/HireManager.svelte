<script lang="ts">
  // Hiring the owner's first team member, their office manager, as a short
  // conversation with Pip: who, what to help with, what they take on, how they
  // talk, what they can really do, and their first assignment. Everything
  // starts filled in from what the owner said in town, so a new owner can
  // hire in a few taps. The hire is real: the manager starts the assignment
  // the moment they arrive.
  import { onMount } from 'svelte';
  import {
    ASSIGNMENTS,
    COMMS,
    commsOf,
    RESPONSIBILITIES,
    recommended,
    suggestedAssignment,
    type AssignmentId,
    type Comms,
    type Responsibility
  } from '@oddboro/ledger/town';
  import { OFFICE_TOOLS } from '@oddboro/ledger/tools';
  import { call } from '../api.ts';
  import ClaudeCard from '../onboarding/ClaudeCard.svelte';
  import ManagerCard, { type Custom, type Preset } from '../onboarding/ManagerCard.svelte';
  import type { StaffProfile } from '../../staff/roster.ts';

  type Props = {
    /** What the owner said in the shops, by shop. */
    answers: Partial<Record<'coffee' | 'general' | 'workshop', string>>;
    owner: string;
    onhired: (manager: StaffProfile) => void;
    oncancel: () => void;
  };
  let { answers, owner, onhired, oncancel }: Props = $props();

  const STEPS = ['who', 'help', 'work', 'access', 'first'] as const;
  let step = $state<(typeof STEPS)[number]>('who');
  let presets = $state<Preset[]>([]);
  let pick = $state('marshall');
  let custom = $state<Custom>({ name: '', description: '' });
  let drawn = $state<
    { look: unknown; portraitPx: string; newParts: unknown[]; portrait: string } | undefined
  >();
  let drawing = $state(false);
  let claudeReady = $state<boolean | undefined>();
  let canDraw = $state(true);
  // svelte-ignore state_referenced_locally
  let help = $state(answers.general ?? '');
  // svelte-ignore state_referenced_locally
  let duties = $state<Responsibility[]>(recommended(answers.general));
  // svelte-ignore state_referenced_locally
  let comms = $state<Comms>(commsOf(answers.coffee));
  // svelte-ignore state_referenced_locally
  let assignment = $state<AssignmentId | 'own'>(
    suggestedAssignment(answers.general, answers.workshop)
  );
  let ownAssignment = $state('');
  // svelte-ignore state_referenced_locally
  let myName = $state(owner);
  let hiring = $state(false);
  let problem = $state('');

  const managerName = $derived(
    pick === 'custom'
      ? custom.name.trim() || 'your manager'
      : (presets.find((p) => p.id === pick)?.name ?? 'your manager')
  );
  const examples = [
    'Help me organize my projects.',
    'Keep track of tasks I need to finish.',
    'Help me coordinate other agents.',
    "Help me get started on something I'm building."
  ];
  /** What a new manager can do, from the office's own tool list: no promises beyond it. */
  const officeTools = OFFICE_TOOLS.filter((t) =>
    [
      'raise_ask',
      'give_owner_a_task',
      'propose_hire',
      'office_report',
      'propose_goal',
      'poke_owner'
    ].includes(t.id)
  );

  onMount(async () => {
    try {
      presets = await call<Preset[]>('/api/onboarding');
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    }
    await checkClaude();
  });

  async function checkClaude() {
    try {
      const s = await call<{ auth: 'plan' | 'key'; model: string; account?: object }>(
        '/api/setup/claude'
      );
      claudeReady = s.auth === 'key' || !!s.account;
      canDraw = s.model !== 'sonnet';
    } catch {
      claudeReady = false;
    }
  }

  /** A described manager is drawn while the owner carries on. */
  async function draw() {
    if (pick !== 'custom' || !custom.name.trim() || drawn || drawing) return;
    drawing = true;
    try {
      drawn = await call('/api/looks', {
        description: custom.description,
        name: custom.name,
        role: 'Office Manager'
      });
    } catch (e) {
      problem = `Could not draw ${custom.name}: ${e instanceof Error ? e.message : e}. Pick a ready-made manager, or try again.`;
    } finally {
      drawing = false;
    }
  }

  function next() {
    problem = '';
    if (step === 'who') void draw();
    step = STEPS[Math.min(STEPS.length - 1, STEPS.indexOf(step) + 1)];
  }
  function back() {
    problem = '';
    if (step === 'who') oncancel();
    else step = STEPS[STEPS.indexOf(step) - 1];
  }

  async function hire() {
    hiring = true;
    problem = '';
    const words = (s: string) => s.replace(/\{owner\}/g, owner || 'the owner');
    const task =
      assignment === 'own'
        ? `${ownAssignment.trim()} Write what you make as a Markdown file under made/ in your folder.`
        : ASSIGNMENTS.find((a) => a.id === assignment)!.task;
    try {
      if (pick === 'custom' && !drawn) throw new Error(`${custom.name} is still being drawn.`);
      const r = await call<{ manager: StaffProfile }>('/api/onboarding', {
        name: myName,
        zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        manager:
          pick === 'custom'
            ? { name: custom.name, description: custom.description, drawn }
            : { preset: pick },
        brief: {
          help,
          responsibilities: RESPONSIBILITIES.filter((r) => duties.includes(r.id)).map((r) =>
            words(r.line)
          ),
          comms: words(COMMS.find((c) => c.id === comms)!.line)
        },
        assignment: task
      });
      onhired(r.manager);
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      hiring = false;
    }
  }

  const pipSays: Record<(typeof STEPS)[number], string> = {
    who: 'Every great operation needs someone keeping things running. Who do you want?',
    help: 'What do you want help with? Say it however you like.',
    work: 'Here is what I would have them take on. Change anything.',
    access: 'Good to know before they start: here is what they can really do.',
    first: 'Last thing. What should they do first? They start the moment they walk in.'
  };
</script>

<section class="flex flex-col gap-3" aria-label="Hire your office manager">
  <div class="rounded-xl bg-raise p-3">
    <div class="text-[10px] tracking-[0.22em] text-sea uppercase">Pip</div>
    <p class="mt-1 text-sm text-ink">{pipSays[step]}</p>
  </div>
  <div class="flex gap-1" aria-hidden="true">
    {#each STEPS as s (s)}
      <span
        class="h-1 flex-1 rounded-full {STEPS.indexOf(s) <= STEPS.indexOf(step)
          ? 'bg-sea'
          : 'bg-raise'}"
      ></span>
    {/each}
  </div>

  {#if step === 'who'}
    <ManagerCard
      {presets}
      bind:pick
      bind:custom
      drawn={drawn?.portrait}
      {drawing}
      {canDraw}
      onnext={next}
      onback={back}
    />
  {:else if step === 'help'}
    <textarea
      class="rounded-lg bg-raise px-2.5 py-2 text-sm text-ink"
      rows="3"
      maxlength="600"
      aria-label="What you want help with"
      bind:value={help}
      placeholder="Help me keep my projects moving"></textarea>
    <div class="flex flex-wrap gap-1.5">
      {#each examples as e (e)}
        <button
          class="rounded-full bg-raise px-2.5 py-1 text-xs text-ink hover:bg-sea/20"
          onclick={() => (help = e)}>{e}</button
        >
      {/each}
    </div>
  {:else if step === 'work'}
    <fieldset class="flex flex-col gap-1.5">
      <legend class="mb-1 text-xs text-muted">{managerName} will:</legend>
      {#each RESPONSIBILITIES as r (r.id)}
        <label class="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" bind:group={duties} value={r.id} />
          {r.label}
        </label>
      {/each}
    </fieldset>
    <fieldset class="flex flex-col gap-1.5">
      <legend class="mb-1 text-xs text-muted">How they talk to you:</legend>
      {#each COMMS as c (c.id)}
        <label class="flex items-center gap-2 text-sm text-ink">
          <input type="radio" bind:group={comms} value={c.id} />
          {c.label}
          {#if answers.coffee && commsOf(answers.coffee) === c.id}<span class="text-[11px] text-sea"
              >what you told Juno</span
            >{/if}
        </label>
      {/each}
    </fieldset>
  {:else if step === 'access'}
    <ul class="flex flex-col gap-2 text-sm text-ink">
      <li>
        <span class="font-medium">Drafts, not sends.</span>
        {managerName} writes plans, lists and reports in their own folder. Nothing leaves the office without
        your yes.
      </li>
      <li>
        <span class="font-medium">In the office they can:</span>
        {officeTools.map((t) => t.name.toLowerCase()).join(', ')}.
      </li>
      <li>
        <span class="font-medium">No email, calendar or other apps yet.</span> When they need one, they
        ask, and you connect it.
      </li>
      <li>
        <span class="font-medium">They know</span> only what you kept in What Oddboro knows, and what
        you tell them.
      </li>
    </ul>
  {:else if step === 'first'}
    <div class="flex flex-col gap-1.5" role="radiogroup" aria-label="First assignment">
      {#each ASSIGNMENTS as a (a.id)}
        <label
          class="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm text-ink {assignment ===
          a.id
            ? 'border-sea bg-sea/10'
            : 'border-hairline'}"
        >
          <input type="radio" bind:group={assignment} value={a.id} />
          {a.label}
        </label>
      {/each}
      <label
        class="flex flex-col gap-1.5 rounded-lg border px-2.5 py-2 text-sm text-ink {assignment ===
        'own'
          ? 'border-sea bg-sea/10'
          : 'border-hairline'}"
      >
        <span class="flex items-center gap-2"
          ><input type="radio" bind:group={assignment} value="own" /> Something else</span
        >
        {#if assignment === 'own'}
          <textarea
            class="rounded bg-night px-2 py-1 text-sm text-ink"
            rows="2"
            maxlength="1500"
            aria-label="Your first assignment"
            bind:value={ownAssignment}
            placeholder="Draft a launch checklist for my podcast"></textarea>
        {/if}
      </label>
    </div>
    {#if !owner}
      <label class="flex flex-col gap-1 text-xs text-muted">
        What should {managerName} call you?
        <input
          class="rounded-lg bg-raise px-2.5 py-1.5 text-sm text-ink"
          maxlength="30"
          bind:value={myName}
          placeholder="Your name"
        />
      </label>
    {/if}
    {#if claudeReady === false}
      <p class="text-sm text-ink">
        {managerName} works through Claude. Connect it once, then hire them.
      </p>
      <ClaudeCard onnext={checkClaude} onback={back} wantKey={false} onmodel={() => {}} />
    {/if}
  {/if}

  {#if step !== 'who'}
    <div class="flex items-center gap-2">
      <button class="rounded-lg px-3 py-2 text-sm text-muted hover:text-ink" onclick={back}
        >Back</button
      >
      {#if step === 'first'}
        <button
          class="flex-1 rounded-lg bg-sea px-3 py-2 text-sm font-medium text-night disabled:opacity-50"
          disabled={hiring ||
            claudeReady !== true ||
            !myName.trim() ||
            (assignment === 'own' && !ownAssignment.trim()) ||
            drawing}
          onclick={hire}
          >{hiring
            ? 'Hiring…'
            : drawing
              ? `Drawing ${managerName}…`
              : `Hire ${managerName}`}</button
        >
      {:else}
        <button
          class="flex-1 rounded-lg bg-sea px-3 py-2 text-sm font-medium text-night"
          onclick={next}>Next</button
        >
      {/if}
    </div>
  {/if}

  {#if problem}
    <p class="text-xs text-coral" role="alert">{problem}</p>
  {/if}
</section>

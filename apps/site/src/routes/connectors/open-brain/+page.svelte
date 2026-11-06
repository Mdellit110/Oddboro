<script lang="ts">
  // How to give an Odd your Open Brain. Building the Open Brain stays on its
  // own GitHub guide; this page starts once the owner has one, and walks the
  // office's own steps: the Services tab, Takes a key with x-brain-key, then
  // the connect task on the desk. Keep each label in step with the office
  // (AccessTab.svelte, DeskDrawer.svelte, connectSteps in the ledger).
  import Meta from '#lib/components/Meta.svelte';
  import { reveal } from '#lib/motion/index.ts';
  import { SITE } from '#lib/site.ts';

  const REPO = 'https://github.com/NateBJones-Projects/OB1';
  const GUIDE = `${REPO}/blob/main/docs/01-getting-started.md`;

  type Step = { text: string; detail?: string; code?: string };
  const PARTS: { title: string; steps: Step[] }[] = [
    {
      title: 'Add Open Brain to an Odd',
      steps: [
        {
          text: 'Click the Odd on the strip of Odds at the edge of the screen.',
          detail: 'Its panel opens.'
        },
        { text: 'Click Settings.' },
        { text: 'Click Services.' },
        { text: 'Click + Add service.' },
        {
          text: 'Paste your MCP Server URL into the search box.',
          detail:
            'Use the address that ends in /open-brain-mcp, with no ?key= after it. The key goes in later, somewhere safer.',
          code: 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/open-brain-mcp'
        },
        {
          text: 'Click Connect YOUR_PROJECT_REF.supabase.co, just under the box.'
        },
        { text: 'Click Takes a key.' },
        {
          text: 'In “The header the key goes in”, delete Authorization and type x-brain-key.',
          detail: 'All lowercase, with the dashes.',
          code: 'x-brain-key'
        },
        {
          text: 'Pick how far the Odd can go.',
          detail:
            'Read only lets it search your thoughts. Read and write also lets it save new ones. Read and write is greyed out until the Odd’s Permission level, on the Model tab, is Acts on its own.'
        },
        {
          text: 'Click Grant.',
          detail: 'You see: “A task with the steps to connect … is on your desk.”'
        }
      ]
    },
    {
      title: 'Connect it from your desk',
      steps: [
        { text: 'Click Desk.' },
        { text: 'Open the task named Connect YOUR_PROJECT_REF.supabase.co for your Odd.' },
        {
          text: 'Paste your MCP Access Key into the box.',
          detail:
            'It is the 64-character key from your credential tracker. It goes in this computer’s password store, never the office’s database.'
        },
        { text: 'Click Save.' },
        {
          text: 'Click Connect.',
          detail: 'The office reaches your Open Brain and lists its tools.'
        },
        {
          text: 'Leave the ticks as they are, and click Confirm.',
          detail:
            'The ticked tools only read. capture_thought, the one that saves, stays unticked, so only a Read and write Odd can use it.'
        }
      ]
    }
  ];

  const TROUBLE: { q: string; a: string }[] = [
    {
      q: 'Connect fails, or says 401.',
      a: 'The header or the key is off. The header must be x-brain-key, exactly. The key must match your MCP Access Key, with no space before or after it. Click Revoke on the service and start again.'
    },
    {
      q: 'I pasted the address with ?key= on the end.',
      a: 'Click Revoke on the service, then add it again with the address that ends in /open-brain-mcp. That keeps your key in the password store instead of in the address.'
    },
    {
      q: 'Read and write is greyed out.',
      a: 'On the Odd’s Model tab, set Permission level to Acts on its own first. Read only works at any level.'
    },
    {
      q: 'I want a second Odd to use it too.',
      a: 'On that Odd, click Settings, then Services, then + Add service. Pick YOUR_PROJECT_REF.supabase.co from the list, where it shows “in the office”. Pick a level and click Grant. The office already has the key, so there is nothing to paste and nothing on your desk.'
    }
  ];
</script>

<Meta
  title="Connect Open Brain · {SITE.name}"
  description="Give an Odd your Open Brain, so it can search your thoughts and, if you let it, save new ones. Step by step, in about two minutes."
  path="/connectors/open-brain/"
/>

<article class="mx-auto max-w-3xl px-4 pt-14 pb-24 sm:px-6 lg:px-8">
  <header use:reveal class="border-hairline border-b pb-8">
    <p class="text-sea mb-3 text-sm font-semibold tracking-wide uppercase">Connectors</p>
    <h1 class="font-pixel text-ink text-4xl leading-[1.05] sm:text-5xl">Open Brain</h1>
    <p class="text-muted mt-5 text-lg leading-relaxed">
      Give an Odd your Open Brain, and it can search everything you have saved there. Let it, and it
      saves new thoughts too. It takes about two minutes.
    </p>
  </header>

  <section use:reveal class="mt-10">
    <h2 class="font-pixel text-ink text-2xl">What Open Brain is</h2>
    <p class="text-muted mt-3 leading-relaxed">
      Open Brain is a memory you own. It is a database of your thoughts, notes and ideas that any AI
      tool can search and add to, so they all remember the same things about you. You run it
      yourself, on your own Supabase project. Nate B. Jones made it, and it lives on GitHub.
    </p>
    <a
      href={REPO}
      target="_blank"
      rel="noopener noreferrer"
      class="text-sea mt-4 inline-flex items-center gap-1.5 font-medium hover:underline"
      >Open Brain on GitHub <span aria-hidden="true">↗</span></a
    >
  </section>

  <section use:reveal class="bg-raise border-hairline mt-10 rounded-xl border p-5 sm:p-6">
    <h2 class="font-pixel text-ink text-2xl">Before you start</h2>
    <ol class="text-muted mt-4 flex list-decimal flex-col gap-3 ps-5 leading-relaxed">
      <li>
        Build your Open Brain with
        <a
          href={GUIDE}
          target="_blank"
          rel="noopener noreferrer"
          class="text-sea font-medium hover:underline">its setup guide</a
        >. Come back when it says you are done.
      </li>
      <li>
        Open your credential tracker from that guide. You need two things from it:
        <ul class="mt-2 flex list-disc flex-col gap-1 ps-5">
          <li>
            <span class="text-ink font-medium">MCP Server URL</span>, the address of your brain.
          </li>
          <li>
            <span class="text-ink font-medium">MCP Access Key</span>, the key that lets you in.
          </li>
        </ul>
      </li>
      <li>Open {SITE.name}, with the Odd you want to give it to already hired.</li>
    </ol>
  </section>

  {#each PARTS as part, p (part.title)}
    <section use:reveal class="mt-12">
      <h2 class="font-pixel text-ink text-2xl">
        <span class="text-sea">Part {p + 1}.</span>
        {part.title}
      </h2>
      <ol class="mt-5 flex flex-col gap-4">
        {#each part.steps as s, i (s.text)}
          <li class="flex gap-4">
            <span
              class="bg-sea text-night font-pixel grid size-8 shrink-0 place-items-center rounded-lg text-sm"
              aria-hidden="true">{i + 1}</span
            >
            <div class="min-w-0 flex-1 pt-1">
              <p class="text-ink leading-relaxed">{s.text}</p>
              {#if s.detail}
                <p class="text-muted mt-1 text-sm leading-relaxed">{s.detail}</p>
              {/if}
              {#if s.code}
                <code
                  class="bg-raise border-hairline text-sea mt-2 block overflow-x-auto rounded-lg border px-3 py-2 font-mono text-sm break-all"
                  >{s.code}</code
                >
              {/if}
            </div>
          </li>
        {/each}
      </ol>
    </section>
  {/each}

  <section use:reveal class="mt-12">
    <h2 class="font-pixel text-ink text-2xl">Try it</h2>
    <p class="text-muted mt-3 leading-relaxed">
      Open a chat with the Odd and ask, “What have I saved about this week?” It searches your Open
      Brain and answers from it.
    </p>
  </section>

  <section use:reveal class="mt-12">
    <h2 class="font-pixel text-ink text-2xl">If something goes wrong</h2>
    <dl class="mt-5 flex flex-col gap-5">
      {#each TROUBLE as t (t.q)}
        <div>
          <dt class="text-ink font-medium">{t.q}</dt>
          <dd class="text-muted mt-1 leading-relaxed">{t.a}</dd>
        </div>
      {/each}
    </dl>
    <p class="text-muted mt-8 text-sm leading-relaxed">
      For problems with Open Brain itself, see
      <a
        href={GUIDE}
        target="_blank"
        rel="noopener noreferrer"
        class="text-sea font-medium hover:underline">its setup guide</a
      >.
    </p>
  </section>
</article>

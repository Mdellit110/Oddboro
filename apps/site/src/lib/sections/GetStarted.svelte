<script lang="ts">
  // The download first: one button, the requirements above it, and the three
  // things a person does with the disk image. Building from source stays for
  // developers, folded under the download: three commands in a terminal card,
  // each with a copy button. Then what happens once Oddboro opens.
  import SectionHeader from '#lib/components/SectionHeader.svelte';
  import { reducedMotion, reveal, stagger, visible } from '#lib/motion/index.ts';
  import { SITE } from '#lib/site.ts';

  const requirements = [
    'A Mac with Apple silicon',
    'macOS 13 or later',
    'A Claude plan, or an Anthropic API key'
  ];
  const install = [
    'Open Oddboro.dmg.',
    'Drag Oddboro to Applications.',
    'Open Oddboro from Applications.'
  ];
  const steps = [
    {
      label: 'Clone the repo.',
      cmd: 'git clone https://github.com/New-Altitude/Oddboro.git oddboro'
    },
    { label: 'Go into it.', cmd: 'cd oddboro' },
    { label: 'Run setup.', cmd: 'npm run setup' }
  ];

  let copied = $state<number | undefined>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function copy(i: number) {
    try {
      await navigator.clipboard.writeText(steps[i].cmd);
    } catch {
      return;
    }
    copied = i;
    clearTimeout(timer);
    timer = setTimeout(() => (copied = undefined), 1600);
  }

  // The bus turns its wheels while it is on screen and the tab shows, and
  // goes over a bump every 1.5 to 3.5 s; the bump's end schedules the next one.
  let inView = false;
  let busOn = $state(false);
  let bumping = $state(false);
  function busUpdate() {
    busOn = inView && !document.hidden && !reducedMotion();
    if (!busOn) bumping = false;
  }
  $effect(() => {
    if (!busOn || bumping) return;
    const t = setTimeout(() => (bumping = true), 1500 + Math.random() * 2000);
    return () => clearTimeout(t);
  });
</script>

<svelte:document onvisibilitychange={busUpdate} />

<SectionHeader eyebrow="Get started" title="Download Oddboro for your Mac." align="center" />

<ul use:stagger class="mt-8 flex flex-wrap justify-center gap-2" aria-label="Requirements">
  {#each requirements as r (r)}
    <li class="border-hairline bg-raise text-muted rounded-full border px-3.5 py-1.5 text-sm">
      {r}
    </li>
  {/each}
</ul>

<div use:reveal={{ delay: 120 }} class="mx-auto mt-10 flex max-w-3xl flex-col items-center">
  <div class="flex flex-wrap items-center justify-center gap-3">
    <a
      href={SITE.download}
      class="bg-sea text-night rounded-md px-6 py-3.5 text-base font-semibold transition-opacity hover:opacity-90"
    >
      Download for Mac
    </a>
    <a
      href={SITE.releases}
      rel="noopener"
      class="border-hairline text-ink hover:bg-raise rounded-md border px-6 py-3.5 text-base font-medium"
    >
      Release notes
    </a>
  </div>
  <ol class="mt-8 grid w-full gap-3 sm:grid-cols-3">
    {#each install as step, i (step)}
      <li class="border-hairline bg-raise flex items-center gap-3 rounded-lg border px-4 py-3">
        <span
          class="font-pixel text-sea border-hairline flex size-8 shrink-0 items-center justify-center rounded-md border text-sm font-semibold"
          aria-hidden="true">{i + 1}</span
        >
        <span class="text-ink text-sm">{step}</span>
      </li>
    {/each}
  </ol>
</div>

<details use:reveal={{ delay: 180 }} class="source mx-auto mt-8 max-w-3xl">
  <summary class="text-muted hover:text-ink cursor-pointer text-center text-sm font-medium">
    Build it from source instead (needs Node 24 or later)
  </summary>
  <div class="terminal rounded-card border-hairline bg-night mt-4 border">
    <div class="border-hairline flex items-center gap-2 border-b px-4 py-3" aria-hidden="true">
      <span class="bg-coral size-2.5 rounded-full opacity-80"></span>
      <span class="bg-ember size-2.5 rounded-full opacity-80"></span>
      <span class="bg-moss size-2.5 rounded-full opacity-80"></span>
      <span class="text-faint ms-2 font-mono text-xs">Terminal</span>
    </div>
    <ol class="divide-y divide-[var(--color-hairline)]">
      {#each steps as s, i (s.cmd)}
        <li class="flex items-center gap-4 px-4 py-4 sm:px-5">
          <span
            class="font-pixel text-sea border-hairline flex size-8 shrink-0 items-center justify-center rounded-md border text-sm font-semibold"
            aria-hidden="true">{i + 1}</span
          >
          <div class="min-w-0 flex-1">
            <p class="text-muted text-xs font-medium">{s.label}</p>
            <p class="mt-1 font-mono text-[13px] break-all sm:text-sm sm:break-normal">
              <span class="text-faint select-none">$ </span><code class="text-ink">{s.cmd}</code>
            </p>
          </div>
          <button
            type="button"
            class="text-muted hover:text-ink hover:bg-raise shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium"
            onclick={() => copy(i)}
            aria-label="Copy: {s.cmd}"
          >
            {copied === i ? 'Copied' : 'Copy'}
          </button>
        </li>
      {/each}
    </ol>
    <p class="sr-only" aria-live="polite">
      {copied === undefined ? '' : 'Copied to the clipboard.'}
    </p>
  </div>
</details>

<div use:reveal={{ delay: 240 }} class="mx-auto mt-10 flex max-w-3xl items-center gap-6">
  <div
    use:visible={(on) => {
      inView = on;
      busUpdate();
    }}
    data-on={busOn || undefined}
    data-bump={bumping || undefined}
    class="pixel relative hidden h-20 w-40 shrink-0 overflow-hidden sm:block"
    aria-hidden="true"
  >
    <div
      class="bus-wheels art absolute inset-y-0 start-0 w-80"
      style="background-image:var(--art-bus-wheels);background-size:320px 80px"
    ></div>
    <div
      class="bus-body art absolute inset-0"
      style="background-image:var(--art-bus-body);background-size:160px 80px"
      onanimationend={() => (bumping = false)}
    ></div>
  </div>
  <div>
    <h3 class="text-ink font-semibold">What happens next</h3>
    <p class="text-muted mt-1 text-[15px] leading-relaxed">
      Oddboro opens straight into your office. You give it your name, connect your Claude account,
      and pick your Office Manager and your space. Then you watch the office go up and your manager
      step off the bus.
    </p>
  </div>
</div>

<style>
  .source summary {
    list-style: none;
  }
  .source summary::-webkit-details-marker {
    display: none;
  }
  .terminal {
    box-shadow: var(--shadow-float), var(--shadow-glow);
  }
</style>

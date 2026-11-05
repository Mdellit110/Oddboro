<script lang="ts">
  // A friend's invite to Oddboro. The invite rides after the # in the link,
  // which browsers never send, so this page reads it here and the site never
  // learns who invited whom. It says who invited the visitor, then how to
  // join: download Oddboro, open it, paste the invite.
  import { onMount } from 'svelte';
  import { readInvite, type Invite } from '@oddboro/ledger/town';
  import Meta from '#lib/components/Meta.svelte';
  import { detectBuild, download, latestHref } from '#lib/downloads.svelte.ts';
  import { SITE } from '#lib/site.ts';

  let invite = $state<Invite | undefined>();
  let read = $state(false);
  let copied = $state(false);

  onMount(() => {
    void detectBuild();
    invite = readInvite(location.hash);
    read = true;
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(location.href);
      copied = true;
    } catch {
      copied = false;
    }
  }
</script>

<Meta
  title="You're invited · {SITE.name}"
  description="A friend invited you to {SITE.name}: a town of AI helpers, called Odds, on your own computer."
  path="/invite/"
/>

<article class="mx-auto max-w-2xl px-4 pt-14 pb-24 sm:px-6">
  {#if !read}
    <p class="text-muted">Opening your invite…</p>
  {:else}
    <p class="text-sea mb-3 text-sm font-semibold tracking-wide uppercase">You're invited</p>
    <h1 class="font-pixel text-ink text-4xl leading-[1.05] font-semibold sm:text-5xl">
      {invite ? `${invite.name} invited you to ${SITE.name}` : `Come live in ${SITE.name}`}
    </h1>
    {#if invite?.note}
      <blockquote class="border-sea text-ink mt-6 border-s-4 ps-4 text-lg">
        "{invite.note}"
      </blockquote>
    {/if}
    <p class="text-muted mt-6 text-lg">
      Make your own Odd, walk Main Street, and build a place of your own where Odds take work off
      your plate.{invite ? ` ${invite.name} will meet you when you arrive.` : ''}
    </p>

    <ol class="mt-10 flex flex-col gap-6">
      <li class="border-hairline bg-raise rounded-lg border p-5">
        <div class="text-ink font-semibold">1. Download {SITE.name}</div>
        <a
          href={latestHref(download.build)}
          class="bg-sea text-night mt-3 inline-block rounded-lg px-4 py-2 font-semibold"
          >Download for {download.build.label}</a
        >
      </li>
      <li class="border-hairline bg-raise rounded-lg border p-5">
        <div class="text-ink font-semibold">2. Open it and paste this invite</div>
        <p class="text-muted mt-1">
          The first screen asks whether a friend invited you. Paste this page's link there.
        </p>
        {#if invite}
          <button
            class="border-sea text-ink hover:bg-sea-deep/40 mt-3 rounded-lg border px-4 py-2 font-semibold"
            onclick={copy}>{copied ? 'Invite copied' : 'Copy my invite'}</button
          >
        {:else}
          <p class="text-ink mt-3">
            This link is missing its invite. Ask your friend to send it again, or come in without
            one.
          </p>
        {/if}
      </li>
    </ol>
  {/if}
</article>

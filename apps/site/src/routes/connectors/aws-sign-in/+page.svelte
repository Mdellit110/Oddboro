<script lang="ts">
  // The AWS sign-in every AWS tool shares: the portal URL, the Identity
  // Center Region and a user for Oddboro. The parts live in lib/guides/aws.ts.
  import Guide from '#lib/components/Guide.svelte';
  import Meta from '#lib/components/Meta.svelte';
  import {
    ENABLE_IDENTITY_CENTER,
    GUIDES,
    SIGN_IN_PARTS,
    SIGN_IN_TROUBLE
  } from '#lib/guides/aws.ts';
  import { SITE } from '#lib/site.ts';

  const NEXT = [
    { href: GUIDES.secrets, name: 'AWS Secrets Manager', does: 'Use your secrets' },
    { href: GUIDES.read, name: 'AWS, read only', does: 'Read your data' },
    { href: GUIDES.build, name: 'AWS, builder', does: 'Build in your account' }
  ];
</script>

<Meta
  title="AWS sign-in · {SITE.name}"
  description="Get your AWS account ready for Oddboro: the sign-in details it needs and a user of its own. Every AWS tool starts here."
  path={GUIDES.signIn}
/>

<Guide
  title="AWS sign-in"
  lede="Every AWS tool in Oddboro uses one sign-in to your AWS account. This guide finds the two details it needs and makes Oddboro a user of its own. It takes about five minutes, once."
  parts={SIGN_IN_PARTS}
  trouble={SIGN_IN_TROUBLE}
>
  {#snippet intro()}
    <h2 class="font-pixel text-ink text-2xl">How Oddboro signs in</h2>
    <p class="text-muted mt-3 leading-relaxed">
      Oddboro signs in through IAM Identity Center, on AWS’s own page, and keeps the sign-in on this
      computer. Each AWS tool then uses one role you make for it, so your Odds get only the access
      you choose.
    </p>
  {/snippet}
  {#snippet before()}
    <ol class="text-muted mt-4 flex list-decimal flex-col gap-3 ps-5 leading-relaxed">
      <li>
        You need administrator access to an AWS account with IAM Identity Center turned on. If it is
        off,
        <a
          href={ENABLE_IDENTITY_CENTER}
          target="_blank"
          rel="noopener noreferrer"
          class="text-sea font-medium hover:underline">AWS’s guide</a
        > turns it on.
      </li>
      <li>
        If your account belongs to an AWS organization, as AWS’s projects sign-up makes, do every
        AWS part in the organization’s management account, not the project’s account.
      </li>
    </ol>
  {/snippet}
  {#snippet after()}
    <h2 class="font-pixel text-ink text-2xl">Next: the tool you want</h2>
    <ul class="mt-5 grid gap-3 sm:grid-cols-3">
      {#each NEXT as n (n.href)}
        <li>
          <a
            href={n.href}
            class="bg-raise border-hairline hover:border-sea block h-full rounded-xl border p-4"
          >
            <span class="text-muted block text-sm">{n.does}</span>
            <span class="text-ink mt-1 block font-medium">{n.name} →</span>
          </a>
        </li>
      {/each}
    </ul>
  {/snippet}
</Guide>

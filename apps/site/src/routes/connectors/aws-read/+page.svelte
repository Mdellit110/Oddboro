<script lang="ts">
  // AWS, read only: AWS's MCP Server for the Odds, as a role with AWS's own
  // read-only access and a Deny on secret values. The parts live in
  // lib/guides/aws.ts.
  import Guide from '#lib/components/Guide.svelte';
  import Meta from '#lib/components/Meta.svelte';
  import UvSteps from '#lib/components/UvSteps.svelte';
  import { GUIDES, READ_PARTS, READ_TROUBLE } from '#lib/guides/aws.ts';
  import { SITE } from '#lib/site.ts';
</script>

<Meta
  title="Connect AWS, read only · {SITE.name}"
  description="Let your Odds read your AWS account: logs, files, functions and the rest, with a role that cannot change anything or read a secret value."
  path={GUIDES.read}
/>

<Guide
  title="AWS, read only"
  lede="Your Odds read your AWS account: CloudWatch logs, S3 files, Lambda functions and the rest. They cannot change anything, and they never see a secret’s value. It takes about five minutes."
  parts={READ_PARTS}
  trouble={READ_TROUBLE}
>
  {#snippet intro()}
    <h2 class="font-pixel text-ink text-2xl">How it stays safe</h2>
    <p class="text-muted mt-3 leading-relaxed">
      Your Odds work in AWS as a role you make, and AWS itself holds them to it. The role is AWS’s
      own read-only access, with a Deny on secret values. Before it connects, the office tries to
      read a secret as that role, and refuses to connect if AWS answers with a value.
    </p>
  {/snippet}
  {#snippet before()}
    <ol class="text-muted mt-4 flex list-decimal flex-col gap-3 ps-5 leading-relaxed">
      <li>
        Do the <a href={GUIDES.signIn} class="text-sea font-medium hover:underline"
          >AWS sign-in guide</a
        > first, if you have not for another AWS tool.
      </li>
      <li><UvSteps /></li>
      <li>
        Have an Odd ask you for AWS, read only, and approve it. Its connect task lands on your desk.
      </li>
    </ol>
  {/snippet}
  {#snippet after()}
    <h2 class="font-pixel text-ink text-2xl">Try it</h2>
    <p class="text-muted mt-3 leading-relaxed">
      Ask the Odd, “What Lambda functions do I have?” It lists them. Ask it to change one, and AWS
      refuses it.
    </p>
  {/snippet}
</Guide>

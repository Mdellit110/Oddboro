<script lang="ts">
  // AWS, builder: AWS's MCP Server for the Odds, as a role with AWS's own
  // power-user access (no IAM) and a Deny on secret values. The parts live in
  // lib/guides/aws.ts.
  import Guide from '#lib/components/Guide.svelte';
  import Meta from '#lib/components/Meta.svelte';
  import UvSteps from '#lib/components/UvSteps.svelte';
  import { BUILD_PARTS, BUILD_TROUBLE, GUIDES } from '#lib/guides/aws.ts';
  import { SITE } from '#lib/site.ts';
</script>

<Meta
  title="Connect AWS, builder · {SITE.name}"
  description="Let your Odds build in your AWS account: create and change functions, buckets, servers and the rest, with a role that cannot change IAM or read a secret value."
  path={GUIDES.build}
/>

<Guide
  title="AWS, builder"
  lede="Your Odds build in your AWS account: they create and change Lambda functions, S3 buckets, EC2 servers and the rest. They cannot change who has access, and they never see a secret’s value. It takes about five minutes."
  parts={BUILD_PARTS}
  trouble={BUILD_TROUBLE}
>
  {#snippet intro()}
    <h2 class="font-pixel text-ink text-2xl">How it stays safe</h2>
    <p class="text-muted mt-3 leading-relaxed">
      Your Odds work in AWS as a role you make, and AWS itself holds them to it. The role is AWS’s
      own power-user access, which leaves out IAM, with a Deny on secret values. Before it connects,
      the office tries to read a secret as that role, and refuses to connect if AWS answers with a
      value.
    </p>
    <p class="text-muted mt-3 leading-relaxed">
      An Odd with Read and write acts without asking each time. What it creates costs what AWS
      charges, so keep an eye on your bill.
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
        Have an Odd ask you for AWS, builder, and approve it with Read and write. Its connect task
        lands on your desk.
      </li>
    </ol>
  {/snippet}
  {#snippet after()}
    <h2 class="font-pixel text-ink text-2xl">Try it</h2>
    <p class="text-muted mt-3 leading-relaxed">
      Ask the Odd, “Make me an S3 bucket called oddboro-test.” It makes it. Ask it to delete the
      bucket when you are done.
    </p>
  {/snippet}
</Guide>

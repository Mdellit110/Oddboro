<script lang="ts">
  // AWS Secrets Manager: the office's role, which lists names for the Odds
  // and reads a value only for another tool's key. The parts live in
  // lib/guides/aws.ts.
  import Guide from '#lib/components/Guide.svelte';
  import Meta from '#lib/components/Meta.svelte';
  import { GUIDES, SECRETS_PARTS, SECRETS_TROUBLE } from '#lib/guides/aws.ts';
  import { SITE } from '#lib/site.ts';
</script>

<Meta
  title="Connect AWS Secrets Manager · {SITE.name}"
  description="Let your Odds see which secrets you keep in AWS Secrets Manager, never their values, and let other tools take their keys from it."
  path={GUIDES.secrets}
/>

<Guide
  title="AWS Secrets Manager"
  lede="Your Odds see the names of the secrets you keep in AWS, never their values. Other tools can take their keys straight from AWS, so you never paste one into Oddboro. It takes about five minutes."
  parts={SECRETS_PARTS}
  trouble={SECRETS_TROUBLE}
>
  {#snippet intro()}
    <h2 class="font-pixel text-ink text-2xl">How it stays safe</h2>
    <p class="text-muted mt-3 leading-relaxed">
      Anything an Odd reads goes to its AI model, so Odds never get a secret’s value. The office
      reads secrets itself, with a role you make for it. It gives your Odds only the names, and it
      reads a value only to hand a key straight to the tool that needs it.
    </p>
  {/snippet}
  {#snippet before()}
    <ol class="text-muted mt-4 flex list-decimal flex-col gap-3 ps-5 leading-relaxed">
      <li>
        Do the <a href={GUIDES.signIn} class="text-sea font-medium hover:underline"
          >AWS sign-in guide</a
        > first, if you have not for another AWS tool.
      </li>
      <li>
        Have an Odd ask you for AWS Secrets Manager, and approve it. Its connect task lands on your
        desk.
      </li>
    </ol>
  {/snippet}
  {#snippet after()}
    <h2 class="font-pixel text-ink text-2xl">Take another tool’s key from AWS</h2>
    <p class="text-muted mt-3 leading-relaxed">
      When a tool’s connect task asks for a key, name a secret instead of pasting it.
    </p>
    <ol class="text-muted mt-4 flex list-decimal flex-col gap-2 ps-5 leading-relaxed">
      <li>On the key step, click Use a secret from AWS instead.</li>
      <li>Pick the secret.</li>
      <li>If it holds JSON, type the key inside it, such as api_key.</li>
      <li>Click Use it.</li>
    </ol>
    <h2 class="font-pixel text-ink mt-10 text-2xl">Try it</h2>
    <p class="text-muted mt-3 leading-relaxed">
      Ask the Odd, “Which secrets do I have in AWS?” It lists their names.
    </p>
  {/snippet}
</Guide>

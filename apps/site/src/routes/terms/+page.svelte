<script lang="ts">
  import LegalDoc from '#lib/components/LegalDoc.svelte';
  import Meta from '#lib/components/Meta.svelte';
  import { SITE } from '#lib/site.ts';

  let { data } = $props();
</script>

<Meta
  title="{data.doc.title} · {SITE.name}"
  description="The terms for using {SITE.name} and this site."
  path="/terms/"
/>

<LegalDoc doc={data.doc} />

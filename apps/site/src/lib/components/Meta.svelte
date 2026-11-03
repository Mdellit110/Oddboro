<script lang="ts">
  // Everything a page says about itself in <head>. Every page renders one.
  import { SITE } from '#lib/site.ts';

  let {
    title = SITE.title,
    description = SITE.description,
    ogTitle = title,
    ogDescription = description,
    path = '/'
  }: {
    title?: string;
    description?: string;
    /** What a link preview shows, when it should differ from the tab. */
    ogTitle?: string;
    ogDescription?: string;
    path?: string;
  } = $props();

  const canonical = $derived(`${SITE.url}${path}`);
  const image = $derived(`${SITE.url}${SITE.ogImage}`);
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonical} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content={SITE.name} />
  <meta property="og:title" content={ogTitle} />
  <meta property="og:description" content={ogDescription} />
  <meta property="og:url" content={canonical} />
  <meta property="og:image" content={image} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="The front of a pixel-art office at night, lamps on" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={ogTitle} />
  <meta name="twitter:description" content={ogDescription} />
  <meta name="twitter:image" content={image} />
</svelte:head>

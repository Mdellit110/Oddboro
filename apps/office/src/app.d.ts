// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
  namespace App {}
  /** The public site's address, set by `siteUrl` in vite.config.ts. */
  const __SITE_URL__: string;
}

export {};

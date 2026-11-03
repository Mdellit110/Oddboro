// The web is Svelte and SvelteKit only. Fails if any package depends on
// another UI framework.
import { read, repoFiles, report } from './lib/files.ts';

const FORBIDDEN =
  /^(react|react-dom|preact|vue|nuxt|next|solid-js|@angular\/.+|lit|qwik|@builder\.io\/qwik|htmx\.org|alpinejs|ember-source)$/;

const failures: string[] = [];
for (const file of repoFiles().filter((f) => f.endsWith('package.json'))) {
  const pkg = JSON.parse(read(file)) as Record<string, Record<string, string> | undefined>;
  for (const field of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies'
  ])
    for (const name of Object.keys(pkg[field] ?? {}))
      if (FORBIDDEN.test(name))
        failures.push(`${file}: ${field} has "${name}". The web is Svelte only.`);
}
report('stack', failures);

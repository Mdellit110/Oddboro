import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Port 4500 unless ODDBORO_PORT says otherwise, to run a second office beside
// the owner's. A build leaves the workspace packages out: they find their own
// files (migrations, sprites, rooms) beside their code, so a release ships them
// whole (apps/desktop/scripts/stage.ts). In dev Vite keeps loading them, so
// they reload on save.
const port = Number(process.env.ODDBORO_PORT) || 4500;
export default defineConfig(({ command }) => ({
  plugins: [tailwindcss(), sveltekit({ adapter: adapter() })],
  // The office's addresses through Caddy (lib/server/address.ts).
  server: {
    port,
    strictPort: true,
    host: '127.0.0.1',
    allowedHosts: ['local.oddboro.com', 'oddboro.localhost']
  },
  // Rolldown, not ssr.external: the adapter bundles every dependency, and only
  // this keeps a workspace package and its subpaths out.
  environments:
    command === 'build'
      ? { ssr: { build: { rolldownOptions: { external: [/^@oddboro\//] } } } }
      : undefined,
  preview: { port, strictPort: true }
}));

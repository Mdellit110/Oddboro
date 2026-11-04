import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

/**
 * Vite's dev server has a route, `/__open-in-editor`, that opens a file in an
 * editor, and it runs before the office's own check (`guardOffice`). Nothing
 * in the office uses it; only Vite's error overlay links there. So it is
 * refused outright, rather than through the office's check, which would bring
 * the server's modules into this config.
 */
export function noEditorLaunch(): Plugin {
  return {
    name: 'oddboro:no-editor-launch',
    apply: 'serve',
    // Middleware added here runs before Vite's own, its editor route included.
    configureServer(server) {
      server.middlewares.use('/__open-in-editor', (_req, res) => {
        res.statusCode = 403;
        res.end('The office opens no editor');
      });
    }
  };
}

// Port 4500 unless ODDBORO_PORT says otherwise, to run a second office beside
// the owner's. A build leaves the workspace packages out: they find their own
// files (migrations, sprites, rooms) beside their code, so a release ships them
// whole (apps/desktop/scripts/stage.ts). In dev Vite keeps loading them, so
// they reload on save.
const port = Number(process.env.ODDBORO_PORT) || 4500;
export default defineConfig(({ command }) => ({
  plugins: [noEditorLaunch(), tailwindcss(), sveltekit({ adapter: adapter() })],
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

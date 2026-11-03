import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Port 4501 is fixed. Every page prerenders to build/, so any static host
// serves the site as plain files.
export default defineConfig({
  plugins: [tailwindcss(), sveltekit({ adapter: adapter({ strict: true }) })],
  server: { port: 4501, strictPort: true },
  preview: { port: 4501, strictPort: true }
});

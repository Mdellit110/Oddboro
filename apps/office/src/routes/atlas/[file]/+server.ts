import { error } from '@sveltejs/kit';
import { atlasFile } from '#lib/server/space.ts';
import type { RequestHandler } from './$types';

const TYPES = { 'atlas.png': 'image/png', 'atlas.json': 'application/json' } as const;

export const GET: RequestHandler = ({ params }) => {
  const name = params.file;
  if (name !== 'atlas.png' && name !== 'atlas.json') error(404, 'Not found');
  return new Response(new Uint8Array(atlasFile(name)), {
    headers: { 'content-type': TYPES[name], 'cache-control': 'no-store' }
  });
};

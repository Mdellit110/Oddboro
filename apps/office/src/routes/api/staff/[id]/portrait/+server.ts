// A staffer's drawn portrait, as a PNG. The URL carries a version stamp, so it
// caches for good and a redraw gets a new URL.
import { error } from '@sveltejs/kit';
import { staffer } from '@oddboro/ledger';
import { staffArt } from '#lib/server/looks.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  const row = await staffer(params.id);
  const art = row && (await staffArt(row));
  if (!art) error(404, 'No drawn portrait');
  return new Response(Buffer.from(art.portrait), {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'private, max-age=31536000, immutable'
    }
  });
};

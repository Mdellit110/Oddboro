// The frames the floor draws the owner's Odd with (`?who=me`), or the friend
// who invited them (`?who=friend`).
import { error, json } from '@sveltejs/kit';
import { me } from '@oddboro/ledger';
import { checkSpec, renderLook } from '@oddboro/sprites/look';
import { library } from '#lib/server/looks.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const m = await me();
  const look = url.searchParams.get('who') === 'friend' ? m.invite?.look : m.look;
  const lib = await library();
  if (!look || checkSpec(lib, look).length) error(404, 'No look');
  const sheet = renderLook(lib, look);
  return json({
    sheet: `data:image/png;base64,${Buffer.from(sheet.png).toString('base64')}`,
    frames: sheet.frames
  });
};

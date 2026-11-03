// A staffer's generated look. GET is its 57 frames as one strip with a frame
// map, for the floor. PUT saves a redraw the owner kept.
import { error, json } from '@sveltejs/kit';
import { setLook, staffer } from '@oddboro/ledger';
import { drawnFrom, problemsWith, staffArt } from '#lib/server/looks.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  const row = await staffer(params.id);
  const art = row && (await staffArt(row));
  if (!art) error(404, 'No generated look');
  return json(
    {
      sheet: `data:image/png;base64,${Buffer.from(art.sheet).toString('base64')}`,
      frames: art.frames
    },
    { headers: { 'cache-control': 'private, max-age=31536000, immutable' } }
  );
};

export const PUT: RequestHandler = async ({ params, request }) => {
  if (!(await staffer(params.id))) error(404, 'No such Odd');
  const d = drawnFrom((await request.json().catch(() => ({}))) as Record<string, unknown>);
  if (!d) error(400, 'Send the look and the portrait');
  const problems = await problemsWith(d, params.id);
  if (problems.length) error(400, problems.join('; '));
  try {
    await setLook(params.id, d.look, d.portraitPx, d.newParts);
  } catch (e) {
    error(400, e instanceof Error ? e.message : String(e));
  }
  return json({ ok: true });
};

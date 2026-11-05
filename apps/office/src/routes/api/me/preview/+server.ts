// A look as the owner builds it, drawn at once from parts: its frames as one
// strip with a frame map, the shape the floor loads.
import { error, json } from '@sveltejs/kit';
import { checkSpec, renderLook, type LookSpec } from '@oddboro/sprites/look';
import { library } from '#lib/server/looks.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const look = (await request.json().catch(() => undefined)) as LookSpec | undefined;
  const lib = await library();
  const problems = look ? checkSpec(lib, look) : ['Send a look'];
  if (problems.length) error(400, problems.join('; '));
  const sheet = renderLook(lib, look!);
  return json({
    sheet: `data:image/png;base64,${Buffer.from(sheet.png).toString('base64')}`,
    frames: sheet.frames
  });
};

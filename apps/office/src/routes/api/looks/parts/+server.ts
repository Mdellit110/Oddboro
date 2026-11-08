// A look built from parts as the owner picks them: rendered at once with a
// portrait made from the same parts, on any tool the office runs on, since
// nothing is drawn. `staffId` is set when changing someone already on staff,
// so their own look is not counted as taken. Nothing is saved until the owner
// keeps it. The parts and colours to pick from are at /api/me/parts.
import { error, json } from '@sveltejs/kit';
import type { LookSpec } from '@oddboro/sprites/look';
import { buildLook } from '#lib/server/looks.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const b = (await request.json().catch(() => ({}))) as { look?: unknown; staffId?: unknown };
  const look = b.look;
  if (!look || typeof look !== 'object' || typeof (look as LookSpec).colours !== 'object')
    error(400, 'Send a look');
  const staffId = typeof b.staffId === 'string' ? b.staffId.slice(0, 60) : undefined;
  try {
    return json(await buildLook(look as LookSpec, staffId));
  } catch (e) {
    error(400, e instanceof Error ? e.message : String(e));
  }
};

// Who serves a goal. POST links a staffer with its part in it; DELETE unlinks
// one. A staffer sees only the goals it serves.
import { error, json } from '@sveltejs/kit';
import { goal, serveGoal, stopServing } from '@oddboro/ledger';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
  const g = await goal(Number(params.id));
  if (!g) error(404, 'No such goal');
  const b = (await request.json().catch(() => ({}))) as { staff?: unknown; part?: unknown };
  if (typeof b.staff !== 'string' || typeof b.part !== 'string')
    error(400, 'Say who, and what they do for it');
  await serveGoal(b.staff, g.id, b.part).catch((e: Error) => error(400, e.message));
  return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params, url }) => {
  const staff = url.searchParams.get('staff');
  if (!staff) error(400, 'Say who');
  await stopServing(staff, Number(params.id));
  return json({ ok: true });
};

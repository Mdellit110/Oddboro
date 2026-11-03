// The owner's goals. GET lists every one, with who serves it and how it is
// going. POST sets a new one, and the Office Manager starts planning it.
import { error, json } from '@sveltejs/kit';
import { addGoal, allGoals, goalDraft } from '@oddboro/ledger';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => json(await allGoals());

export const POST: RequestHandler = async ({ request }) => {
  const d = goalDraft((await request.json().catch(() => ({}))) as Record<string, unknown>);
  if (typeof d === 'string') error(400, d);
  return json(await addGoal(d));
};

// A staffer's job description, for the Jobs tab: GET reads it, PUT saves
// the owner's edit. The ledger keeps the old and new versions.
import { error, json } from '@sveltejs/kit';
import { setDescription, staffer } from '@oddboro/ledger';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  const who = await staffer(params.id);
  if (!who) error(404, 'No such Odd');
  return json({ text: who.desk });
};

export const PUT: RequestHandler = async ({ params, request }) => {
  const b = (await request.json().catch(() => ({}))) as { text?: unknown; was?: unknown };
  if (typeof b.text !== 'string' || typeof b.was !== 'string') error(400, 'Nothing to save');
  try {
    await setDescription(params.id, b.text, { owner: true, was: b.was });
  } catch (e) {
    error(409, e instanceof Error ? e.message : String(e));
  }
  const who = await staffer(params.id);
  return json({ text: who?.desk ?? b.text });
};

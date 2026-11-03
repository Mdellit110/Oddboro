// One report. GET reads it, e.g. to open from a staffer's chat after it left the
// desk. POST marks it read, which takes it off the desk; the ledger keeps it.
// Feedback goes back to the staffer as a reply in their chat.
import { error, json } from '@sveltejs/kit';
import { readReport, report } from '@oddboro/ledger';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  const r = await report(Number(params.id));
  if (!r) error(404, 'No such report');
  return json(r);
};

export const POST: RequestHandler = async ({ params }) => {
  await readReport(Number(params.id));
  return json({ ok: true });
};

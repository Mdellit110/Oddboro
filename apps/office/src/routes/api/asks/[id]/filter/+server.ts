// The owner creates a Gmail filter an Odd proposed, as they left it:
// `{ criteria, action, tidy }`. The office calls Gmail itself (`createFilter`
// in filters.ts): it makes the label if it is missing, with `tidy` gives the
// mail the filter already matches the same changes, then makes the filter. A
// Gmail failure leaves the ask open and answers with what went wrong, in
// plain words.
import { error, json } from '@sveltejs/kit';
import { createFilter, readAction, readCriteria } from '#lib/server/filters.ts';
import { GmailRefusal } from '#lib/server/replies.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const criteria = readCriteria(body.criteria);
  if (!criteria) error(400, 'Say which mail it matches, each field as text');
  const action = readAction(body.action);
  if (!action) error(400, 'Say what it does, each choice as yes or no and the label as text');
  if (typeof body.tidy !== 'boolean') error(400, 'Say whether to tidy the mail it already matches');
  try {
    const filter = await createFilter(Number(params.id), { criteria, action }, body.tidy);
    return json({ ok: true, filter });
  } catch (e) {
    if (e instanceof GmailRefusal) error(e.status, e.message);
    throw e;
  }
};

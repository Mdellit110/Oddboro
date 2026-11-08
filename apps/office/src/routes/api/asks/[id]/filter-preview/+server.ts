// How many emails a proposed Gmail filter matches today, for its card:
// `{ query, about, more }`. The office counts them page by page with the
// Gmail search the criteria make, read with its own token, and `more` says
// it stopped at the cap. Criteria in the address (from, to, subject, query,
// negatedQuery, hasAttachment=true) stand for the owner's changes; with
// none, the ask's own are counted.
import { error, json } from '@sveltejs/kit';
import { previewFilter, readCriteria } from '#lib/server/filters.ts';
import { GmailRefusal } from '#lib/server/replies.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
  const q = url.searchParams;
  const changed = q.size > 0;
  const criteria = changed
    ? readCriteria({ ...Object.fromEntries(q), hasAttachment: q.get('hasAttachment') === 'true' })
    : undefined;
  if (changed && !criteria) error(400, 'Say which mail it matches, each field as text');
  try {
    return json(await previewFilter(Number(params.id), criteria));
  } catch (e) {
    if (e instanceof GmailRefusal) error(e.status, e.message);
    throw e;
  }
};

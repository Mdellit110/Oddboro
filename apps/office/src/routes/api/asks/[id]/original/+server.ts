// The email a reply ask answers, read from Gmail with the office's token when
// the owner unfolds it: its sender, date, subject and body as plain text.
// The page shows it as text, never as HTML.
import { error, json } from '@sveltejs/kit';
import { original, GmailRefusal } from '#lib/server/replies.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  try {
    return json(await original(Number(params.id)));
  } catch (e) {
    if (e instanceof GmailRefusal) error(e.status, e.message);
    throw e;
  }
};

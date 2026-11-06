// Open the system's own folder picker on the owner's screen and return the
// folder they picked (`folder-picker.ts`). It grants nothing: the page then
// gives the folder to the Odd through the staff PATCH, whose checks a typed
// path also meets. A cancel is `{ cancelled: true }`; where no picker can open,
// `{ unavailable }` says why and the page offers the typed path. Like every
// route, only the office's own page reaches it (`guardOffice`).
import { error, json } from '@sveltejs/kit';
import { pickerOpen, pickFolder } from '#lib/server/folder-picker.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const b = (await request.json().catch(() => ({}))) as { for?: unknown };
  if (pickerOpen()) error(409, 'A folder picker is already open. Pick there, or cancel it.');
  const who = typeof b.for === 'string' ? b.for.trim().slice(0, 40) : '';
  return json(await pickFolder(who ? `Pick a folder for ${who}` : 'Pick a folder'));
};

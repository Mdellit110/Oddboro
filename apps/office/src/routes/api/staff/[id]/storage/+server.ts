// Everything an Odd has kept in its own folder, for its Storage tab
// (`listStorage`): files and folders with sizes and times, never the office's
// own files there, hidden ones or links. Read only when the tab opens.
import { error, json } from '@sveltejs/kit';
import { home, staffer } from '@oddboro/ledger';
import { listStorage, STORAGE_CAP } from '#lib/server/storage.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  if (!/^[a-z0-9-]+$/.test(params.id) || !(await staffer(params.id))) error(404, 'No such Odd');
  return json({ ...listStorage(home('staff', params.id)), cap: STORAGE_CAP });
};

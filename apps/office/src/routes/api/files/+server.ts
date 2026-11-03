// A staffer's file, for the viewer: GET reads it, PUT saves the owner's edit.
import { error, json } from '@sveltejs/kit';
import { readStaffFile, writeStaffFile } from '#lib/server/files.ts';
import type { RequestHandler } from './$types';

const fail = (e: unknown, status = 400): never =>
  error(status, e instanceof Error ? e.message : String(e));

export const GET: RequestHandler = async ({ url }) => {
  try {
    return json(
      await readStaffFile(url.searchParams.get('staff') ?? '', url.searchParams.get('path') ?? '')
    );
  } catch (e) {
    return fail(e, 404);
  }
};

export const PUT: RequestHandler = async ({ request }) => {
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof b.staff !== 'string' || typeof b.path !== 'string') error(400, 'Name the file');
  if (typeof b.content !== 'string' || typeof b.mtime !== 'number') error(400, 'Nothing to save');
  try {
    return json(await writeStaffFile(b.staff, b.path, b.content, b.mtime));
  } catch (e) {
    return fail(e, 409);
  }
};

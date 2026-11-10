// One service: the owner renames it, or puts an AWS tool's role and Region
// step on the desk again to change them.
import { error, json } from '@sveltejs/kit';
import { changeAwsTask, renameConnector } from '@oddboro/ledger';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request }) => {
  const b = (await request.json().catch(() => ({}))) as { name?: unknown };
  if (typeof b.name !== 'string') error(400, 'Give it a name');
  try {
    await renameConnector(params.id, b.name);
  } catch (e) {
    error(400, e instanceof Error ? e.message : String(e));
  }
  return json({ ok: true });
};

export const POST: RequestHandler = async ({ params }) => {
  let taskId: number;
  try {
    taskId = (await changeAwsTask(params.id)).id;
  } catch (e) {
    error(400, e instanceof Error ? e.message : String(e));
  }
  return json({ taskId });
};

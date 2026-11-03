// A staffer's access: what the owner granted, grant more directly, or revoke.
// Granting creates the task with the steps to connect it.
import { error, json } from '@sveltejs/kit';
import { ensureConnector, grantAccess, grantsFor, revoke, type Level } from '@oddboro/ledger';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) =>
  json(
    (await grantsFor(params.id)).map((g) => ({
      connector: g.connectorId,
      name: g.connector.name,
      level: g.level,
      ready: !!g.connector.readyAt,
      tools: g.connector.readTools.length
    }))
  );

export const POST: RequestHandler = async ({ params, request }) => {
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const level = (['read', 'act'] as Level[]).find((l) => l === b.level);
  if (typeof b.connector !== 'string' || !level) error(400, 'Pick a tool and a level');
  const found = await ensureConnector(b.connector);
  if (!found.connector) error(400, found.problem ?? 'No such tool');
  try {
    await grantAccess(params.id, { connector: found.connector.id, level });
  } catch (e) {
    error(400, e instanceof Error ? e.message : String(e));
  }
  return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params, url }) => {
  await revoke(params.id, url.searchParams.get('connector') ?? '');
  return json({ ok: true });
};

// A staffer's access: what the owner granted, grant more directly, or revoke.
// Granting creates the task with the steps to connect it.
import { error, json } from '@sveltejs/kit';
import {
  capabilities,
  ensureConnector,
  grantAccess,
  reachOf,
  revoke,
  staffer,
  type Level
} from '@oddboro/ledger';
import type { RequestHandler } from './$types';

/** Each grant as the Odd's runs find it, from the same `capabilities` the runs load from. */
export const GET: RequestHandler = async ({ params }) => {
  const who = await staffer(params.id);
  if (!who) error(404, 'No such Odd');
  return json(
    (await capabilities(who)).outside.map((a) => ({
      connector: a.connector.id,
      name: a.connector.name,
      level: a.level,
      reach: reachOf(a),
      heldBack: a.heldBack ?? null
    }))
  );
};

export const POST: RequestHandler = async ({ params, request }) => {
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const level = (['read', 'act'] as Level[]).find((l) => l === b.level);
  if (typeof b.connector !== 'string' || !level) error(400, 'Pick a tool and a level');
  // A hosted server named by its address: sent only when the owner chose how it lets the office in.
  const way = b.way as { keyHeader?: unknown } | undefined;
  const found = await ensureConnector(
    b.connector,
    way && typeof way === 'object'
      ? { keyHeader: typeof way.keyHeader === 'string' ? way.keyHeader.trim() : undefined }
      : undefined
  );
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

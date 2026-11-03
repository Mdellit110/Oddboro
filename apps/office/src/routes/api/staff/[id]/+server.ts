// Change a staffer's permission level, or grant or remove one office tool.
// Only the owner does this, from the card.
import { error, json } from '@sveltejs/kit';
import { setPermission, setTool, staffer, type Level } from '@oddboro/ledger';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request }) => {
  if (!(await staffer(params.id))) error(404, 'No such Odd');
  const b = (await request.json().catch(() => ({}))) as {
    permission?: unknown;
    tool?: unknown;
    on?: unknown;
  };
  if (typeof b.tool === 'string') {
    if (typeof b.on !== 'boolean') error(400, 'Say whether to grant or remove it');
    try {
      await setTool(params.id, b.tool, b.on);
    } catch (e) {
      error(400, e instanceof Error ? e.message : String(e));
    }
    return json({ ok: true });
  }
  const permission = (['read', 'draft', 'act'] as Level[]).find((l) => l === b.permission);
  if (!permission) error(400, 'Pick read, draft or act');
  await setPermission(params.id, permission);
  return json({ ok: true });
};

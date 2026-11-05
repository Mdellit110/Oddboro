// Change a staffer's permission level or coding tool, grant or remove one
// office tool, switch Run commands or Browse the web, or give or take back a
// folder outside the office. Only the owner does this, from the card.
import { error, json } from '@sveltejs/kit';
import {
  agentsOn,
  checkFolder,
  commandsHow,
  offeredAgent,
  setAgent,
  setFolder,
  setOwnTool,
  setPermission,
  setTool,
  shownFolder,
  staffer,
  type Level
} from '@oddboro/ledger';
import { isBusy } from '#lib/server/staff.ts';
import type { RequestHandler } from './$types';

/**
 * The folders the owner gave the Odd, each as stored and as the owner reads
 * it, the home folder written `~`. The page cannot work that out itself.
 */
export const GET: RequestHandler = async ({ params }) => {
  const who = await staffer(params.id);
  if (!who) error(404, 'No such Odd');
  return json({ folders: who.folders.map((f) => ({ ...f, shown: shownFolder(f.path) })) });
};

export const PATCH: RequestHandler = async ({ params, request }) => {
  const who = await staffer(params.id);
  if (!who) error(404, 'No such Odd');
  const b = (await request.json().catch(() => ({}))) as {
    permission?: unknown;
    agent?: unknown;
    tool?: unknown;
    on?: unknown;
    commands?: unknown;
    web?: unknown;
    folder?: unknown;
    access?: unknown;
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
  // Like a tool, each of these takes effect on the Odd's next run, so none waits for a reply.
  if (typeof b.commands === 'boolean') {
    // Only a tool that follows the switch: a stored yes must be the owner's own
    // choice, or it would turn commands on unasked after a move to such a tool.
    const how = commandsHow(who.agent, process.platform);
    if (how.state !== 'switch') error(400, how.why);
    await setOwnTool(params.id, 'commands', b.commands);
    return json({ ok: true });
  }
  if (typeof b.web === 'boolean') {
    await setOwnTool(params.id, 'web', b.web);
    return json({ ok: true });
  }
  if (typeof b.folder === 'string') {
    // Taken back by the path as stored, so a folder deleted from the disk can still go.
    if (b.access === null) {
      await setFolder(params.id, b.folder, null);
      return json({ ok: true });
    }
    if (b.access !== 'read' && b.access !== 'write') error(400, 'Pick read or write');
    const checked = checkFolder(b.folder);
    if ('refused' in checked) error(400, checked.refused);
    await setFolder(params.id, checked.real, b.access);
    return json({ ok: true });
  }
  if (b.agent !== undefined) {
    // Only a tool whose sandbox held on this system (`AGENT_PLATFORMS`).
    const agent = offeredAgent(b.agent, process.platform);
    if (!agent) error(400, `Pick ${agentsOn(process.platform).join(' or ')}`);
    // A chat still replying would save its session after the move, for a tool that cannot resume it.
    if (isBusy(params.id)) error(409, 'Wait for the reply to finish, then switch.');
    await setAgent(params.id, agent);
    return json({ ok: true });
  }
  const permission = (['read', 'draft', 'act'] as Level[]).find((l) => l === b.permission);
  if (!permission) error(400, 'Pick read, draft or act');
  await setPermission(params.id, permission);
  return json({ ok: true });
};

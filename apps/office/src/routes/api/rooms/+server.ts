// The owner renames a room from the floor. A blank name puts back the one the
// floor plan starts it with. The ledger records the change.
import { error, json } from '@sveltejs/kit';
import { renameRoom, roomNamesFor } from '@oddboro/ledger';
import { currentOffice } from '#lib/server/space.ts';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ request }) => {
  const b = (await request.json().catch(() => ({}))) as { room?: unknown; name?: unknown };
  if (typeof b.room !== 'string' || typeof b.name !== 'string') error(400, 'Nothing to save');
  const office = await currentOffice();
  const room = office.world.rooms.find((r) => r.id === b.room);
  if (!room || room.sign === false) error(404, 'No such room');
  const was = (await roomNamesFor(office.id))[room.id] ?? room.name;
  try {
    return json({ name: await renameRoom(office.id, room.id, b.name, { was, start: room.name }) });
  } catch (e) {
    error(400, e instanceof Error ? e.message : String(e));
  }
};

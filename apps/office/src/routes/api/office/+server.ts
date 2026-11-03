// Everything the page shows that can change: the staff, the owner's desk, who is
// working and on what, the names the owner gave the rooms, what the owner switched off,
// and the pokes that landed and wait unread.
// The page fetches it once, then
// again on each change event.
import { json } from '@sveltejs/kit';
import { desk, roomNamesFor, roster, switchedOffIn, unreadPokes } from '@oddboro/ledger';
import { currentOffice } from '#lib/server/space.ts';
import { inProgress, working } from '#lib/server/staff.ts';
import { toProfile } from '#lib/staff/roster.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const office = (await currentOffice()).id;
  return json({
    staff: (await roster()).map(toProfile),
    desk: await desk(),
    working: { ...working },
    inProgress: structuredClone(inProgress),
    roomNames: await roomNamesFor(office),
    switchedOff: await switchedOffIn(office),
    messages: await unreadPokes()
  });
};

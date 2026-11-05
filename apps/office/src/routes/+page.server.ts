import {
  activeOffice,
  desk,
  roomNamesFor,
  roster,
  switchedOffIn,
  unreadPokes,
  welcomed,
  zone
} from '@oddboro/ledger';
import { keepAddress } from '#lib/server/address.ts';
import { townOffice, currentOffice } from '#lib/server/space.ts';
import { toProfile } from '#lib/staff/roster.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  // The owner's Caddy may have dropped the office's site since: put it back.
  void keepAddress();
  const first = !(await welcomed());
  // A new owner arrives on Main Street. Once their boro stands, the page opens
  // on it, and the town stays a walk away until their first Odd is working.
  const office = first && !(await activeOffice()) ? await townOffice() : await currentOffice();
  return {
    office,
    // Main Street, for a new owner to walk back to from their boro.
    town: first ? (await townOffice()).world : undefined,
    staff: (await roster()).map(toProfile),
    desk: await desk(),
    roomNames: await roomNamesFor(office.id),
    switchedOff: await switchedOffIn(office.id),
    messages: await unreadPokes(),
    zone: zone(),
    welcomed: !first
  };
};

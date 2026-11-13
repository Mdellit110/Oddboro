// The phone desk: the owner's desk on its own page, for a phone on the
// owner's tailnet (docs/remote-desk.md). It loads only what the desk shows:
// the Odds, for who sent each item, and the desk itself.
import { desk, guessesWaiting, roster, zone } from '@oddboro/ledger';
import { toProfile } from '#lib/server/profile.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const staff = await roster();
  const guesses = await guessesWaiting(staff.map((s) => s.id));
  return {
    staff: staff.map((s) => toProfile(s, guesses[s.id])),
    desk: await desk(),
    zone: zone()
  };
};

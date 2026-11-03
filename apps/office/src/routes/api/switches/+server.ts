// The owner switches a lamp, a screen or a fire on or off from the floor. Only
// a prop that gives off light can be switched: one with a light or glowing
// pixels. The change reaches every open page through the table's trigger.
import { error, json } from '@sveltejs/kit';
import { setSwitch } from '@oddboro/ledger';
import { currentOffice } from '#lib/server/space.ts';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ request }) => {
  const b = (await request.json().catch(() => ({}))) as { obj?: unknown; on?: unknown };
  if (typeof b.obj !== 'string' || typeof b.on !== 'boolean') error(400, 'Nothing to switch');
  const office = await currentOffice();
  const { world, catalog } = office;
  const obj = b.obj;
  const switchable =
    world.lights.some((l) => l.obj === obj) ||
    world.draws.some((d) => d.obj === obj && catalog[d.sprite]?.emissive);
  if (!switchable) error(404, 'Nothing there to switch');
  await setSwitch(office.id, obj, b.on);
  return json({ obj, on: b.on });
};

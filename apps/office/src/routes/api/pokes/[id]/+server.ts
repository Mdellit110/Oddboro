// The owner cancels a poke before it lands, or POSTs to have it now.
import { error, json } from '@sveltejs/kit';
import { cancelPoke, pokeNow } from '@oddboro/ledger';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params }) => {
  if (!(await cancelPoke(Number(params.id)))) error(404, 'No such poke waiting');
  return json({ ok: true });
};

export const POST: RequestHandler = async ({ params }) => {
  if (!(await pokeNow(Number(params.id)))) error(404, 'No such poke waiting');
  return json({ ok: true });
};

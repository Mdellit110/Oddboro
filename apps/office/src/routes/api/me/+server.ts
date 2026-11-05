// The owner's own Odd. GET is their name, their look and the friend who
// invited them. PUT keeps a name and a look. POST reads an invite they pasted,
// or clears it with `invite: null`.
import { error, json } from '@sveltejs/kit';
import { me, readInvite, saveParts, setInvite, setMe } from '@oddboro/ledger';
import { checkSpec, type DrawnPart, type LookSpec } from '@oddboro/sprites/look';
import { library } from '#lib/server/looks.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => json(await me());

export const PUT: RequestHandler = async ({ request }) => {
  const b = (await request.json().catch(() => ({}))) as {
    name?: unknown;
    look?: LookSpec;
    newParts?: DrawnPart[];
  };
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 30) : undefined;
  if (b.name !== undefined && !name) error(400, 'Say what Odds should call you');
  if (b.look) {
    const parts = Array.isArray(b.newParts) ? b.newParts : [];
    const problems = checkSpec(await library(parts), b.look);
    if (problems.length) error(400, problems.join('; '));
    // Parts Claude drew for the owner join the library, as a hire's do.
    await saveParts(parts, null);
  }
  await setMe({ name, look: b.look });
  return json(await me());
};

export const POST: RequestHandler = async ({ request }) => {
  const b = (await request.json().catch(() => ({}))) as { invite?: unknown };
  if (b.invite === null) {
    await setInvite(null);
    return json(await me());
  }
  const invite = typeof b.invite === 'string' ? readInvite(b.invite) : undefined;
  if (!invite) error(400, 'That is not an Oddboro invite. Paste the whole link your friend sent.');
  // A look made of parts this office lacks comes through without it: the friend still greets them.
  if (invite.look && checkSpec(await library(), invite.look).length) delete invite.look;
  await setInvite(invite);
  return json(await me());
};

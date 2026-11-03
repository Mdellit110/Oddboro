// What the office needs and whether it has it, for the welcome and the Setup
// window: the same checks `npm run setup` runs, with the owner's name and zone.
// POST finishes the welcome under the name the owner gives.
import { execFile } from 'node:child_process';
import { error, json } from '@sveltejs/kit';
import {
  activeOffice,
  DATABASE_URL,
  finishWelcome,
  IN_APP,
  LOCAL,
  ownerName,
  roster,
  welcomed,
  zone,
  zoneName
} from '@oddboro/ledger';
import { checkDatabase, checkMachine, type Check } from '@oddboro/ledger/checks';
import type { RequestHandler } from './$types';

const BUILT_IN: Check = {
  id: 'database',
  name: 'Database',
  state: 'ok',
  found: 'Postgres, on this Mac'
};

export const GET: RequestHandler = async () => {
  const [machine, database] = await Promise.all([
    checkMachine(),
    // The office's own database is up whenever this server is, with pgvector
    // and live updates built in.
    LOCAL ? { checks: [BUILT_IN] } : checkDatabase(DATABASE_URL)
  ]);
  const name = await ownerName();
  // The Mac's own name for its owner, to offer before they type one.
  const full = await new Promise<string>((done) =>
    execFile('id', ['-F'], (_e, out) => done(String(out ?? '').trim()))
  );
  return json({
    app: IN_APP,
    suggested: full.split(' ')[0] ?? '',
    checks: [...machine.filter((c) => c.id !== 'docker'), ...database.checks],
    owner: name === 'the owner' ? '' : name,
    zone: zone(),
    zoneName: zoneName(),
    welcomed: await welcomed(),
    sample: !(await activeOffice()),
    staff: (await roster()).map((p) => ({ id: p.id, name: p.name, role: p.role }))
  });
};

export const POST: RequestHandler = async ({ request }) => {
  const b = (await request.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name) error(400, 'Say what your Odds should call you');
  await finishWelcome(name);
  return json({ ok: true });
};

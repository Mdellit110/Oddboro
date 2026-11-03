// Hire a staffer, in the look drawn for them. The new row reaches the page
// through the change stream, and the staffer walks in from the lobby. Hiring
// from a proposed hire approves that ask, gives the hire its copy of the
// owner's intake, and links it to the goal it was proposed for. The first job
// comes with the hire, so the new staffer knows it when it says hello in its
// chat and gets started on its first day (`firstDay`).
import { error, json } from '@sveltejs/kit';
import { addJob, ask, decideAsk, hire, serveGoal, type Level } from '@oddboro/ledger';
import { parseSchedule } from '#lib/server/schedule.ts';
import { firstDay } from '#lib/server/staff.ts';
import { giveIntake } from '#lib/server/files.ts';
import { currentOffice } from '#lib/server/space.ts';
import { drawnFrom, problemsWith } from '#lib/server/looks.ts';
import { toProfile } from '#lib/staff/roster.ts';
import type { RequestHandler } from './$types';

type Body = Partial<Record<'name' | 'role' | 'room' | 'permission' | 'remit' | 'desk', string>> & {
  tools?: unknown;
  askId?: unknown;
  look?: unknown;
  portraitPx?: unknown;
  newParts?: unknown;
  job?: { name?: unknown; instructions?: unknown; schedule?: unknown; report?: unknown };
};

export const POST: RequestHandler = async ({ request }) => {
  const b = (await request.json().catch(() => ({}))) as Body;
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const name = text(b.name, 40);
  const role = text(b.role, 60);
  const remit = text(b.remit, 200);
  const desk = text(b.desk, 20_000);
  const drawn = drawnFrom(b);
  const office = await currentOffice();
  const rooms = new Set(office.world.rooms.map((r) => r.id.split('#')[0]));
  const room = text(b.room, 60);
  const permission = (['read', 'draft', 'act'] as Level[]).find((l) => l === b.permission);
  if (!name || !role || !remit || !desk)
    error(400, 'Fill in the name, role, remit and job description');
  if (!drawn) error(400, 'Draw them first');
  const problems = await problemsWith(drawn);
  if (problems.length) error(400, problems.join('; '));
  if (!rooms.has(room)) error(400, 'Pick a room on the floor');
  if (!permission) error(400, 'Pick read, draft or act');
  const jobName = text(b.job?.name, 80);
  const jobSteps = text(b.job?.instructions, 8000);
  const jobSchedule = b.job ? parseSchedule(b.job.schedule) : null;
  if (b.job && (!jobName || !jobSteps)) error(400, 'Give the first job a name and say what to do');
  if (b.job && !jobSchedule) error(400, 'Say how often the first job runs');
  const from = typeof b.askId === 'number' ? await ask(b.askId) : undefined;
  if (from && (from.kind !== 'hire' || from.status !== 'open'))
    error(400, 'That proposal is no longer open');
  const tools = Array.isArray(b.tools)
    ? b.tools.filter((t): t is string => typeof t === 'string')
    : undefined;
  let row;
  try {
    // The atlas names stay as a fallback; the drawn look is what shows.
    row = await hire({
      name,
      office: office.name,
      role,
      remit,
      desk,
      room,
      permission,
      sprite: 'staff',
      variant: 'look',
      portrait: 'look',
      tools,
      look: drawn.look,
      portraitPx: drawn.portraitPx,
      newParts: drawn.newParts
    });
  } catch (e) {
    error(400, e instanceof Error ? e.message : String(e));
  }
  if (b.job && jobSchedule)
    await addJob({
      staffId: row.id,
      name: jobName,
      instructions: jobSteps,
      schedule: jobSchedule,
      report: b.job.report === true
    });
  if (from) await decideAsk(from.id, 'approve', null);
  const proposal = from?.hire;
  // The hire is made: a missing intake or a goal gone since is logged, not a failed hire.
  if (from && proposal?.intakeFile)
    await giveIntake(from.staffId, proposal.intakeFile, row.id).catch((e: unknown) =>
      console.error(`[hire] intake for ${row.id}: ${e instanceof Error ? e.message : e}`)
    );
  if (proposal?.goal)
    await serveGoal(row.id, proposal.goal.id, proposal.goal.part).catch((e: unknown) =>
      console.error(`[hire] goal for ${row.id}: ${e instanceof Error ? e.message : e}`)
    );
  // Not awaited: the hire window closes now, and the hello lands in the chat it opens.
  void firstDay(row.id).catch((e: unknown) =>
    console.error(`[hire] first day for ${row.id}: ${e instanceof Error ? e.message : e}`)
  );
  return json(toProfile(row));
};

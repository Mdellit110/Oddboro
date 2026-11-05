// Hiring a new owner's first Odd, their office manager. GET lists the
// ready-made managers to pick from. POST hires the one they picked
// (ready-made, or described and drawn) with what they asked of them, keeps
// their time zone, finishes the welcome, has the manager say hello in chat,
// and starts their first assignment at once: real work, whose result lands on
// the owner's desk.
import { error, json } from '@sveltejs/kit';
import {
  customHello,
  finishWelcome,
  activeOffice,
  boroName,
  hireManager,
  logEvent,
  me,
  saveTown,
  startFirstDay,
  starterSpec,
  townState,
  managerPortrait,
  MANAGERS
} from '@oddboro/ledger';
import { isZone, setZone } from '@oddboro/ledger/time';
import { writeEnv } from '@oddboro/ledger/env';
import { currentDesign, moveInWhenDone } from '#lib/server/design-job.ts';
import { moveInto } from '#lib/server/move-in.ts';
import { drawnFrom, preview, problemsWith } from '#lib/server/looks.ts';
import { sayInChat } from '#lib/server/staff.ts';
import { toProfile } from '#lib/staff/roster.ts';
import type { RequestHandler } from './$types';

/** The four ready-made managers, each with a portrait and a walk to show on the lot. */
export const GET: RequestHandler = async () =>
  json(
    await Promise.all(
      MANAGERS.map(async (m) => {
        const px = m.look && managerPortrait(m.id);
        const art =
          m.look && px ? await preview({ look: m.look, portraitPx: px, newParts: [] }) : undefined;
        return {
          id: m.id,
          name: m.name,
          trait: m.trait,
          says: m.says,
          // Marshall's portrait is in the atlas; the others are drawn looks.
          frame: art ? undefined : `portrait-${m.id}/default`,
          portrait: art?.portrait
        };
      })
    )
  );

export const POST: RequestHandler = async ({ request }) => {
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = (typeof b.name === 'string' ? b.name.trim().slice(0, 30) : '') || (await me()).name;
  if (!name) error(400, 'Say what your Odds should call you');
  const zone = typeof b.zone === 'string' ? b.zone : '';
  if (!isZone(zone)) error(400, 'Pick a time zone from the list');

  const m = (b.manager ?? {}) as Record<string, unknown>;
  let choice: Parameters<typeof hireManager>[0];
  if (typeof m.preset === 'string' && MANAGERS.some((p) => p.id === m.preset))
    choice = { preset: m.preset };
  else if (typeof m.name === 'string' && m.name.trim() && m.drawn) {
    const drawn = drawnFrom(m.drawn as Record<string, unknown>);
    if (!drawn) error(400, 'Draw the manager first');
    const problems = await problemsWith(drawn);
    if (problems.length) error(400, problems.join('; '));
    choice = {
      custom: {
        name: m.name.trim().slice(0, 40),
        description: typeof m.description === 'string' ? m.description.trim().slice(0, 1000) : '',
        ...drawn
      }
    };
  } else error(400, 'Pick an office manager');

  const brief = (b.brief ?? {}) as Record<string, unknown>;
  const words = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const managerBrief = {
    help: words(brief.help, 600) || undefined,
    responsibilities: Array.isArray(brief.responsibilities)
      ? brief.responsibilities
          .map((r) => words(r, 300))
          .filter(Boolean)
          .slice(0, 6)
      : [],
    comms: words(brief.comms, 300) || undefined
  };
  const assignment = words(b.assignment, 2000);
  if (!assignment) error(400, 'Give your manager a first assignment');
  await logEvent('agent_create_attempt');

  writeEnv({ OFFICE_TIME_ZONE: zone });
  process.env.OFFICE_TIME_ZONE = zone;
  setZone(zone);
  await finishWelcome(name);
  let row;
  try {
    row = await hireManager(choice, managerBrief);
  } catch (e) {
    error(400, e instanceof Error ? e.message : String(e));
  }
  const preset = 'preset' in choice ? MANAGERS.find((p) => p.id === choice.preset) : undefined;
  sayInChat(row.id, preset ? preset.hello(name) : customHello(row.name, name));
  // Their boro is the office they move into. With none yet (they skipped
  // straight here), a starter goes up, so nobody lands in an empty lot.
  if (!(await activeOffice())) {
    const { state } = await townState();
    const style = state.boro?.style ?? 'village';
    await moveInto(starterSpec(boroName(state.boro?.name ?? '', name), style), [], 'Starter boro');
  }
  const job = currentDesign();
  if (job) await moveInWhenDone(job);
  // The first assignment starts now: the manager walks to their desk while it runs.
  await startFirstDay(row.id, assignment);
  const { state } = await townState();
  await saveTown({ ...state, step: 'team', firstOdd: row.id });
  await logEvent('agent_ready');
  await logEvent('first_task_started');
  await logEvent('main_street_created');
  return json({ manager: toProfile(row) });
};

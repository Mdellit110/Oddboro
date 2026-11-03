// One ask. GET adds the owner's closest past decisions, and the ask it reworks. POST
// is their decision: approve, deny, or iterate (send it back with what to
// change), with a reason, and whether a success should reach their desk too.
// Approving a goal ask sets the goal. Approving a plan takes the parts the owner ticked
// (`picks`) and answers with the hire asks it made, for the page to open.
import { error, json } from '@sveltejs/kit';
import {
  approveGoal,
  approvePlan,
  ask,
  decideAsk,
  precedent,
  type Decision
} from '@oddboro/ledger';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  const a = await ask(Number(params.id));
  if (!a) error(404, 'No such ask');
  return json({
    ask: a,
    precedent: await precedent(`${a.title}\n${a.why}`),
    revises: a.revises ? ((await ask(a.revises)) ?? null) : null
  });
};

export const POST: RequestHandler = async ({ params, request }) => {
  const body = (await request.json().catch(() => ({}))) as {
    decision?: unknown;
    reason?: unknown;
    report?: unknown;
    picks?: unknown;
  };
  const decision = (['approve', 'deny', 'iterate'] as Decision[]).find((d) => d === body.decision);
  if (!decision) error(400, 'Say approve, deny or iterate');
  const a = await ask(Number(params.id));
  if (!a) error(404, 'No such ask');
  if (a.kind === 'hire' && decision === 'approve') error(400, 'Approve a hire by hiring');
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 2000) : '';
  if (decision === 'approve' && a.kind === 'goal') {
    await approveGoal(a.id, reason || null).catch((e: Error) => error(400, e.message));
    return json({ ok: true });
  }
  if (decision === 'approve' && a.kind === 'plan') {
    const picks = Array.isArray(body.picks)
      ? body.picks.filter((p): p is number => Number.isInteger(p))
      : [];
    const done = await approvePlan(a.id, picks, reason || null).catch((e: Error) =>
      error(400, e.message)
    );
    return json({ ok: true, hires: done.hires });
  }
  try {
    await decideAsk(a.id, decision, reason || null, body.report === true);
  } catch (e) {
    error(400, e instanceof Error ? e.message : String(e));
  }
  return json({ ok: true });
};

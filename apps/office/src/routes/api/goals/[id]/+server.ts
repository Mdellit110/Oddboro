// One goal: the owner rewords it, or marks it paused, met, dropped or active.
import { error, json } from '@sveltejs/kit';
import { goal, goalDraft, updateGoal, type GoalStatus } from '@oddboro/ledger';
import type { RequestHandler } from './$types';

const STATUSES: GoalStatus[] = ['active', 'paused', 'met', 'dropped'];

export const PUT: RequestHandler = async ({ params, request }) => {
  const g = await goal(Number(params.id));
  if (!g) error(404, 'No such goal');
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const status = STATUSES.find((s) => s === b.status);
  if (b.status !== undefined && !status) error(400, 'Say active, paused, met or dropped');
  const words = b.title === undefined ? undefined : goalDraft({ ...g, ...b });
  if (typeof words === 'string') error(400, words);
  const row = await updateGoal(g.id, { ...words, ...(status ? { status } : {}) }, { owner: true });
  return json(row);
};

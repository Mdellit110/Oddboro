// The owner works a task: tick a step or all of them, undo one, answer a choice,
// run a step's action, or finish it. Finishing writes the ledger row that credits the owner.
import { error, json } from '@sveltejs/kit';
import { finishTask, task, tickAll, tickStep, untickStep } from '@oddboro/ledger';
import { confirmTools, hostedSignIn, listTools } from '#lib/server/access.ts';
import { setSecret } from '#lib/server/keychain.ts';
import type { RequestHandler } from './$types';

type Body = {
  op?: string;
  index?: number;
  answer?: string;
  value?: string;
  done?: boolean;
  note?: string;
  readTools?: string[];
  tools?: string[];
};

export const POST: RequestHandler = async ({ params, request }) => {
  const id = Number(params.id);
  const t = await task(id);
  if (!t) error(404, 'No such task');
  const b = (await request.json().catch(() => ({}))) as Body;
  if (b.op === 'finish') {
    await finishTask(id, b.done !== false, typeof b.note === 'string' ? b.note.trim() : null);
    return json({ ok: true });
  }
  if (b.op === 'tick-all') {
    await tickAll(id);
    return json({ ok: true });
  }
  const step = typeof b.index === 'number' ? t.steps[b.index] : undefined;
  if (!step) error(400, 'No such step');
  const action = step.action;
  try {
    if (b.op === 'tick') await tickStep(id, b.index!);
    else if (b.op === 'untick') await untickStep(id, b.index!);
    else if (
      b.op === 'choose' &&
      action?.kind === 'choice' &&
      action.options.includes(b.answer ?? '')
    )
      await tickStep(id, b.index!, b.answer);
    else if (b.op === 'oauth' && action?.kind === 'oauth')
      return json(await hostedSignIn(action.connector));
    else if (b.op === 'secret' && action?.kind === 'secret' && b.value?.trim()) {
      setSecret(action.connector, action.name, b.value.trim());
      await tickStep(id, b.index!);
    } else if (b.op === 'tools' && action?.kind === 'tools')
      return json({ tools: await listTools(action.connector) });
    else if (b.op === 'confirm-tools' && action?.kind === 'tools' && Array.isArray(b.tools)) {
      await confirmTools(action.connector, b.tools, b.readTools ?? []);
      await tickStep(id, b.index!);
    } else error(400, 'That step does not take that');
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e) throw e;
    error(400, e instanceof Error ? e.message : String(e));
  }
  return json({ ok: true });
};

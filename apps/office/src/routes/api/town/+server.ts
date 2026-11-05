// The town a new owner arrives in. GET is everything the town panel shows:
// where they got to, what the office remembers, the Odds they met, the Main
// Street suggestions and the visit's counts. POST is one thing they did.
import { error, json } from '@sveltejs/kit';
import {
  allContext,
  answers,
  arrive,
  finishWelcome,
  firstTask,
  ownerName,
  saveAnswer,
  startFirstDay,
  dropContext,
  editContext,
  enter,
  eventCounts,
  forgetAll,
  keepContext,
  logEvent,
  meetTownsperson,
  saveTown,
  setMemory,
  settleTownsfolk,
  SHOP_IDS,
  suggest,
  townsfolk,
  townState,
  TOWNSFOLK,
  welcomed,
  type Shop
} from '@oddboro/ledger';
import { isZone, setZone } from '@oddboro/ledger/time';
import { writeEnv } from '@oddboro/ledger/env';
import { history, sayInChat } from '#lib/server/staff.ts';
import { toProfile } from '#lib/staff/roster.ts';
import type { RequestHandler } from './$types';

/** The first visit is over: keep their time zone, and open the office as theirs. */
async function welcome(zone: unknown) {
  if (typeof zone === 'string' && isZone(zone)) {
    writeEnv({ OFFICE_TIME_ZONE: zone });
    process.env.OFFICE_TIME_ZONE = zone;
    setZone(zone);
  }
  if (!(await welcomed())) await finishWelcome(await ownerName());
}

async function view() {
  const { state, memory } = await townState();
  // A broken read still shows the town, just with nothing remembered.
  const context = await allContext().catch(() => []);
  const met = await townsfolk();
  const folk = met.map(({ row, preset }) => ({
    id: row.id,
    name: row.name,
    shop: preset.shop,
    remit: row.remit
  }));
  // The preview offers everyone in town, the ones not met yet unticked.
  const everyone = [
    ...folk,
    ...TOWNSFOLK.filter((t) => !folk.some((f) => f.shop === t.shop)).map((t) => ({
      id: `shop:${t.shop}`,
      name: t.name,
      shop: t.shop,
      remit: t.remit
    }))
  ];
  return {
    state,
    memory,
    context,
    folk,
    profiles: met.map(({ row }) => toProfile(row)),
    suggestions: suggest(
      everyone,
      context.filter((c) => c.status === 'kept'),
      state.visited
    ),
    counts: await eventCounts().catch(() => ({})),
    answers: await answers().catch(() => ({})),
    first: state.firstOdd ? await firstTask(state.firstOdd) : undefined
  };
}

/**
 * The first Odd finished its first task: the first session is done. Counted
 * once, whenever the town is next read.
 */
async function noticeFirstTask() {
  const { state } = await townState();
  if (!state.firstOdd || state.step === 'done') return;
  const t = await firstTask(state.firstOdd);
  if (t?.state !== 'done' && t?.state !== 'needs-you') return;
  await saveTown({ ...state, step: 'done' });
  await logEvent('first_task_completed');
}

export const GET: RequestHandler = async () => {
  await noticeFirstTask().catch(() => {});
  return json(await view());
};

const isShop = (s: unknown): s is Shop => SHOP_IDS.includes(s as Shop);
const idOf = (b: Record<string, unknown>) => {
  const id = Number(b.id);
  if (!Number.isInteger(id) || id < 1) error(400, 'Name the row');
  return id;
};

export const POST: RequestHandler = async ({ request }) => {
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { state } = await townState();
  const shop = isShop(b.shop) ? b.shop : undefined;
  switch (b.action) {
    case 'arrive': {
      const r = arrive(state, new Date());
      await saveTown(r.state);
      if (r.firstEver) {
        await logEvent('town_arrived');
        await logEvent('pip_intro');
      } else if (r.returning) {
        await logEvent('return_session');
        // They left last time before their first Odd was working.
        if (!state.firstOdd) await logEvent('onboarding_abandoned');
      }
      return json({ ...(await view()), returning: r.returning });
    }
    case 'guide': {
      const mode = b.mode === 'guided' ? 'guided' : 'free';
      if (!state.guide) await logEvent('exploration_started');
      await saveTown({ ...state, guide: mode });
      break;
    }
    case 'enter': {
      // Walking in only says where they are. The shopkeeper is hired, as a real
      // Odd, the first time the owner chooses to chat (`meet`).
      if (!shop) error(400, 'Name a shop');
      await saveTown(enter(state, shop));
      await logEvent('shop_entered', shop);
      break;
    }
    case 'meet': {
      if (!shop) error(400, 'Name a shop');
      const { row } = await meetTownsperson(shop);
      if (!history(row.id).length) sayInChat(row.id, TOWNSFOLK.find((t) => t.shop === shop)!.hello);
      return json({ ...(await view()), staff: toProfile(row) });
    }
    case 'made':
      if (!state.made) await logEvent('customized');
      await saveTown({ ...state, made: true });
      break;
    case 'welcome':
      await saveTown({ ...state, welcomed: true });
      break;
    case 'choose':
      if (!state.guide) await logEvent(b.mode === 'tour' ? 'tour_chosen' : 'boro_chosen');
      await saveTown({ ...state, welcomed: true, guide: b.mode === 'tour' ? 'guided' : 'free' });
      break;
    case 'answer': {
      if (!shop || typeof b.answer !== 'string') error(400, 'Pick an answer');
      try {
        await saveAnswer(shop, b.answer);
      } catch (e) {
        error(400, e instanceof Error ? e.message : String(e));
      }
      break;
    }
    case 'retry-first': {
      // The first task failed: run it again, with the same assignment.
      if (!state.firstOdd) error(400, 'No Odd is starting yet');
      const last = await firstTask(state.firstOdd);
      if (last?.state === 'working' || last?.state === 'waiting') error(409, 'It is still working');
      await startFirstDay(state.firstOdd, last?.note ?? undefined);
      await logEvent('first_task_started');
      break;
    }
    case 'first-odd': {
      // An Odd they brought in answered its test: their first Odd is working.
      if (typeof b.id !== 'string') error(400, 'Name the Odd');
      await saveTown({ ...state, step: 'done', firstOdd: state.firstOdd ?? b.id });
      await logEvent('agent_ready');
      await welcome(b.zone);
      break;
    }
    case 'leave':
      await saveTown({ ...state, at: undefined });
      break;
    case 'keep':
      if (!(await keepContext(idOf(b), shop))) error(409, 'That is no longer waiting on you');
      break;
    case 'drop':
      await dropContext(idOf(b));
      break;
    case 'edit': {
      if (typeof b.title !== 'string') error(400, 'Say it in a line');
      try {
        await editContext(idOf(b), {
          title: b.title,
          body: typeof b.body === 'string' ? b.body : ''
        });
      } catch (e) {
        error(400, e instanceof Error ? e.message : String(e));
      }
      break;
    }
    case 'memory':
      await setMemory(b.on === true);
      break;
    case 'forget':
      await forgetAll();
      break;
    case 'preview':
      if (!state.previewed) await logEvent('preview_opened');
      await saveTown({ ...state, previewed: true });
      break;
    case 'settle': {
      const choices = Array.isArray(b.choices) ? b.choices : [];
      await settleTownsfolk(
        choices
          .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
          .map((c) => ({
            id: String(c.id),
            keep: c.keep === true,
            name: typeof c.name === 'string' ? c.name : undefined
          }))
      );
      break;
    }
    default:
      error(400, 'Say what to do');
  }
  return json(await view());
};

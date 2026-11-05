// The town in the database: where the owner got to, what they let the office
// remember, the briefs Odds pass each other, and the first visit's counts.
// The rules themselves are in town-rules.ts.
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { LookSpec } from '@oddboro/sprites/look';
import { db } from './db.ts';
import { record, type StaffRow } from './office.ts';
import { meetTownsperson } from './townsfolk.ts';
import { context, followUps, owner, reports, townEvents } from './schema.ts';
import {
  answerSource,
  confidenceOf,
  QUESTIONS,
  meaningful,
  NEW_TOWN,
  proposalProblem,
  visibleTo,
  type ContextItem,
  type Invite,
  type Proposal,
  type Shop,
  type TownEvent,
  type TownState
} from './town-rules.ts';

export type ContextRow = typeof context.$inferSelect;

/** The owner row, made with no name yet if the town comes first. */
async function ensureOwner(): Promise<void> {
  await db.insert(owner).values({ id: 'owner', name: '' }).onConflictDoNothing();
}

export async function townState(): Promise<{ state: TownState; memory: boolean }> {
  const [row] = await db
    .select({ town: owner.town, memory: owner.memory })
    .from(owner)
    .where(eq(owner.id, 'owner'));
  return { state: row?.town ?? NEW_TOWN, memory: row?.memory ?? true };
}

export async function saveTown(state: TownState): Promise<void> {
  await ensureOwner();
  await db.update(owner).set({ town: state, updatedAt: new Date() }).where(eq(owner.id, 'owner'));
}

/**
 * Turn memory on or off. Off drops everything still waiting on a Remember,
 * and Odds stop proposing; what the owner already kept stays until they delete it.
 */
export async function setMemory(on: boolean): Promise<void> {
  await ensureOwner();
  await db.update(owner).set({ memory: on, updatedAt: new Date() }).where(eq(owner.id, 'owner'));
  if (!on) await db.delete(context).where(eq(context.status, 'proposed'));
}

/**
 * Count one moment of the first visit, here on this computer. It carries a
 * name and a shop, never anything anyone said. Counting never gets in the
 * owner's way: a failure is logged and dropped.
 */
export async function logEvent(name: TownEvent, shop?: Shop | null): Promise<void> {
  try {
    await db.insert(townEvents).values({ name, shop: shop ?? null });
    if (meaningful(name))
      await db.insert(townEvents).values({ name: 'meaningful_interaction', shop: shop ?? null });
  } catch (e) {
    console.error(`[town] could not count ${name}: ${e instanceof Error ? e.message : e}`);
  }
}

/** How many times each moment happened, for the Town stats panel. */
export async function eventCounts(): Promise<Partial<Record<TownEvent, number>>> {
  const rows = await db
    .select({ name: townEvents.name, n: sql<number>`count(*)::int` })
    .from(townEvents)
    .groupBy(townEvents.name);
  return Object.fromEntries(rows.map((r) => [r.name, r.n]));
}

const asItem = (r: ContextRow): ContextItem => ({
  id: r.id,
  kind: r.kind,
  basis: r.basis,
  status: r.status,
  title: r.title,
  body: r.body,
  source: r.source,
  forStaffId: r.forStaffId,
  confidence: r.confidence,
  file: r.file
});

/** Everything the owner can see and change: kept rows and those waiting on them. */
export async function allContext(): Promise<ContextItem[]> {
  const rows = await db
    .select()
    .from(context)
    .where(ne(context.status, 'replaced'))
    .orderBy(asc(context.createdAt));
  return rows.map(asItem);
}

/**
 * What one Odd may read about the owner. A failure reads as nothing kept, so
 * the Odd asks the owner instead of stopping.
 */
export async function contextFor(staffId: string): Promise<ContextItem[]> {
  try {
    const rows = await db
      .select()
      .from(context)
      .where(
        and(
          eq(context.status, 'kept'),
          or(isNull(context.forStaffId), eq(context.forStaffId, staffId))
        )
      )
      .orderBy(asc(context.createdAt));
    return visibleTo(rows.map(asItem), staffId);
  } catch (e) {
    console.error(`[town] context for ${staffId}: ${e instanceof Error ? e.message : e}`);
    return [];
  }
}

/** An Odd proposes something to remember. It waits on the owner's Remember. */
export async function proposeContext(
  source: string,
  p: Proposal & { replaces?: number }
): Promise<{ row: ContextRow } | { problem: string }> {
  const { memory } = await townState();
  const problem = proposalProblem(p, memory);
  if (problem) return { problem };
  if (p.replaces) {
    const [old] = await db.select().from(context).where(eq(context.id, p.replaces));
    if (!old || old.status === 'replaced')
      return { problem: `Nothing kept as #${p.replaces} to correct.` };
  }
  const [row] = await db
    .insert(context)
    .values({
      kind: p.kind,
      basis: p.basis,
      title: p.title.trim(),
      body: p.body?.trim() ?? '',
      source,
      confidence: confidenceOf(p),
      replaces: p.replaces ?? null
    })
    .returning();
  return { row };
}

/**
 * One Odd passes a shop a brief. The shop's Odd is met now if the owner has
 * not been in yet, so the brief is waiting when they walk in. It goes only
 * when the owner says yes.
 */
export async function handOff(
  source: string,
  to: Shop,
  brief: { title: string; body?: string }
): Promise<{ row: ContextRow; to: StaffRow } | { problem: string }> {
  const { memory } = await townState();
  if (!memory)
    return {
      problem:
        'The owner turned memory off, so nothing can be passed along. Tell them which shop to visit instead.'
    };
  const title = brief.title.trim();
  if (!title || title.length > 160)
    return { problem: 'Say what they want in one line, under 160 characters.' };
  const { row: them } = await meetTownsperson(to);
  if (them.id === source) return { problem: 'That is your own shop. Help them here.' };
  const [row] = await db
    .insert(context)
    .values({
      kind: 'handoff',
      basis: 'said',
      title,
      body: brief.body?.trim().slice(0, 2000) ?? '',
      source,
      forStaffId: them.id
    })
    .returning();
  return { row, to: them };
}

/** An Odd made something. It is kept at once: it names a file, not anything about the owner. */
export async function deliver(
  source: string,
  made: { title: string; file: string; shop?: Shop }
): Promise<ContextRow> {
  const [row] = await db
    .insert(context)
    .values({
      kind: 'outcome',
      basis: 'observed',
      status: 'kept',
      title: made.title.trim().slice(0, 160),
      source,
      file: made.file
    })
    .returning();
  await record({ kind: 'work', actor: source, title: `Made ${row.title}`, body: made.file });
  await logEvent('task_completed', made.shop);
  return row;
}

/** The owner said Remember, or yes to a handoff. A correction retires what it replaces. */
export async function keepContext(id: number, shop?: Shop | null): Promise<ContextRow | undefined> {
  const [row] = await db
    .update(context)
    .set({ status: 'kept', updatedAt: new Date() })
    .where(and(eq(context.id, id), eq(context.status, 'proposed')))
    .returning();
  if (!row) return undefined;
  if (row.replaces)
    await db
      .update(context)
      .set({ status: 'replaced', updatedAt: new Date() })
      .where(eq(context.id, row.replaces));
  if (row.kind === 'handoff') {
    await record({
      kind: 'handoff',
      actor: row.source,
      title: `Passed ${row.forStaffId} a brief: ${row.title}`,
      body: row.body,
      reason: 'The owner said yes to passing it along.'
    });
    await logEvent('handoff_completed', shop);
  } else await logEvent('context_saved', shop);
  return row;
}

/** The owner fixed a row's words. What they wrote is theirs, so it counts as said. */
export async function editContext(
  id: number,
  edit: { title: string; body?: string }
): Promise<void> {
  const title = edit.title.trim().slice(0, 160);
  if (!title) throw new Error('Say it in a line, or delete it.');
  await db
    .update(context)
    .set({
      title,
      body: edit.body?.trim() ?? '',
      basis: 'said',
      confidence: 1,
      updatedAt: new Date()
    })
    .where(eq(context.id, id));
}

/** The owner said no, or deleted it. Gone for good, with what it replaced. */
export async function dropContext(id: number): Promise<void> {
  const [row] = await db.select().from(context).where(eq(context.id, id));
  if (!row) return;
  const chain = [row.id];
  // A kept row takes its history with it. Saying no to a correction leaves the original alone.
  for (let r = row.status === 'kept' ? row.replaces : null; r;) {
    chain.push(r);
    const [older] = await db
      .select({ replaces: context.replaces })
      .from(context)
      .where(eq(context.id, r));
    r = older?.replaces ?? null;
  }
  await db.delete(context).where(inArray(context.id, chain));
}

/** Forget everything about the owner. Things Odds made stay in their folders. */
export async function forgetAll(): Promise<void> {
  await db.delete(context);
}

/** The owner's own Odd, the friend who invited them, and their name. */
export async function me(): Promise<{
  name: string;
  look: LookSpec | null;
  invite: Invite | null;
}> {
  const [row] = await db
    .select({ name: owner.name, look: owner.look, invite: owner.invitedBy })
    .from(owner)
    .where(eq(owner.id, 'owner'));
  return { name: row?.name.trim() ?? '', look: row?.look ?? null, invite: row?.invite ?? null };
}

/** The owner made their Odd: how they look, and what Odds call them. */
export async function setMe(change: { name?: string; look?: LookSpec }): Promise<void> {
  await ensureOwner();
  const name = change.name?.trim().slice(0, 30);
  await db
    .update(owner)
    .set({
      ...(name ? { name } : {}),
      ...(change.look ? { look: change.look } : {}),
      updatedAt: new Date()
    })
    .where(eq(owner.id, 'owner'));
}

/** Keep the invite that brought the owner here, or none. */
export async function setInvite(invite: Invite | null): Promise<void> {
  await ensureOwner();
  await db
    .update(owner)
    .set({ invitedBy: invite, updatedAt: new Date() })
    .where(eq(owner.id, 'owner'));
}

/**
 * The owner answered a shop's question with a tap. What they picked is theirs,
 * so it is kept as said, and answering again replaces it. With memory off it
 * is not kept, and the town goes on without it.
 */
export async function saveAnswer(shop: Shop, answer: string): Promise<ContextRow | undefined> {
  const q = QUESTIONS[shop];
  const a = q.answers.find((x) => x.id === answer);
  if (!a) throw new Error('Pick one of the answers');
  const { memory } = await townState();
  if (!memory) return undefined;
  const source = answerSource(shop);
  const [old] = await db
    .select()
    .from(context)
    .where(and(eq(context.source, source), eq(context.status, 'kept')));
  const [row] = await db
    .insert(context)
    .values({ kind: q.kind, basis: 'said', status: 'kept', title: a.keep, source })
    .returning();
  if (old) await db.update(context).set({ status: 'replaced' }).where(eq(context.id, old.id));
  await logEvent('context_saved', shop);
  return row;
}

/** What the owner said in each shop, for the hire conversation's suggestions. */
export async function answers(): Promise<Partial<Record<Shop, string>>> {
  const rows = await db
    .select({ source: context.source, title: context.title })
    .from(context)
    .where(and(eq(context.status, 'kept'), sql`${context.source} like 'town:%'`));
  return Object.fromEntries(rows.map((r) => [r.source.slice(5), r.title]));
}

/** An Odd's first task: its first-day run, where it stands, and what it said. */
export async function firstTask(staffId: string): Promise<
  | {
      state: 'waiting' | 'working' | 'done' | 'failed' | 'needs-you';
      result: string | null;
      reportId: number | null;
      /** The assignment it was given. */
      note: string | null;
    }
  | undefined
> {
  const [f] = await db
    .select()
    .from(followUps)
    .where(and(eq(followUps.staffId, staffId), eq(followUps.kind, 'first_day')))
    .orderBy(desc(followUps.createdAt))
    .limit(1);
  if (!f) return undefined;
  const [report] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(eq(reports.staffId, staffId))
    .orderBy(desc(reports.createdAt))
    .limit(1);
  const state = !f.startedAt
    ? 'waiting'
    : !f.outcome
      ? 'working'
      : f.outcome === 'done'
        ? 'done'
        : f.outcome === 'waiting'
          ? 'needs-you'
          : 'failed';
  return {
    state,
    result: f.result,
    reportId: f.outcome ? (report?.id ?? null) : null,
    note: f.note
  };
}

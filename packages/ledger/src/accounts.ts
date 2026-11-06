// Accounts: named sign-ins for one coding tool, each in a folder of its own
// (`accountHome`), which Odds share. Every tool has an Office account with no
// row, the one each Odd starts on and setup signs in; the owner adds others
// and moves an Odd to one on its Model tab. A run points its tool at its
// account's folder, so two Odds can use two Grok, Codex or Claude logins.
// The office's own chat record carries a conversation across a move
// (replay.ts in the office), so moving clears the Odd's session and nothing
// else.
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { db } from './db.ts';
import { AGENT_NAMES, OFFICE_ACCOUNT, type Agent } from './agents.ts';
import { accountHome, chatSession, home } from './home.ts';
import { record, staffer } from './office.ts';
import { accounts, staff, type AccountRow } from './schema.ts';

/**
 * The folder a tool runs with for `account`. The Office account of Grok or
 * Codex still at its old place (`~/.oddboro/grok`), before the office's start
 * moved it (`moveToolHomes`), is found there, so a run never misses its
 * sign-in in between.
 */
export function toolHome(tool: Agent, account: string): string {
  const office = accountHome(tool, account);
  if (account !== OFFICE_ACCOUNT || tool === 'claude' || existsSync(office)) return office;
  return existsSync(home(tool)) ? home(tool) : office;
}

/** Every account the owner added, oldest first. The Office accounts have no row. */
export const listAccounts = (): Promise<AccountRow[]> =>
  db.select().from(accounts).orderBy(accounts.createdAt);

/** An account the owner added, by id. */
export async function account(id: string): Promise<AccountRow | undefined> {
  const [row] = await db.select().from(accounts).where(eq(accounts.id, id));
  return row;
}

/** The account an Odd's runs use on its tool: its own when that is still one of the tool's, else Office. */
export async function accountOf(who: { agent: Agent; account: string | null }): Promise<string> {
  if (!who.account || who.account === OFFICE_ACCOUNT) return OFFICE_ACCOUNT;
  const row = await account(who.account);
  return row?.agent === who.agent ? row.id : OFFICE_ACCOUNT;
}

/** Add an account for `agent`, named `label`, with its folder made and nothing signed in yet. */
export async function addAccount(agent: Agent, label: string): Promise<AccountRow> {
  const name = label.trim().slice(0, 40);
  if (!name) throw new Error('Name the account, like Work or Personal.');
  const id = randomBytes(4).toString('hex');
  mkdirSync(accountHome(agent, id), { recursive: true, mode: 0o700 });
  const [row] = await db.insert(accounts).values({ id, agent, label: name }).returning();
  await record({
    kind: 'access',
    actor: 'owner',
    title: `Added a ${AGENT_NAMES[agent]} account, ${name}`
  });
  return row;
}

/** Rename an account the owner added. The Office accounts keep their name. */
export async function renameAccount(id: string, label: string): Promise<AccountRow> {
  const name = label.trim().slice(0, 40);
  if (!name) throw new Error('Name the account, like Work or Personal.');
  const before = await account(id);
  if (!before) throw new Error('No such account.');
  if (before.label === name) return before;
  const [row] = await db
    .update(accounts)
    .set({ label: name })
    .where(eq(accounts.id, id))
    .returning();
  await record({
    kind: 'access',
    actor: 'owner',
    title: `Renamed the ${AGENT_NAMES[before.agent]} account ${before.label} to ${name}`
  });
  return row;
}

/**
 * Take an account away: the Odds on it go back to the Office account, each
 * starting a new session, and its folder goes with the sign-in kept in it.
 * The office signs it out first (its tool may keep the login elsewhere too).
 */
export async function removeAccount(id: string): Promise<void> {
  const row = await account(id);
  if (!row) return;
  const on = await db.select({ id: staff.id }).from(staff).where(eq(staff.account, id));
  if (on.length)
    await db
      .update(staff)
      .set({ account: null })
      .where(
        inArray(
          staff.id,
          on.map((o) => o.id)
        )
      );
  for (const o of on) rmSync(chatSession(o.id), { force: true });
  await db.delete(accounts).where(eq(accounts.id, id));
  rmSync(accountHome(row.agent, id), { recursive: true, force: true });
  await record({
    kind: 'access',
    actor: 'owner',
    title: `Removed the ${AGENT_NAMES[row.agent]} account ${row.label}${on.length ? `; ${on.length === 1 ? 'its Odd' : `its ${on.length} Odds`} went back to Office` : ''}`
  });
}

/**
 * Move an Odd to one of its tool's accounts, or `null` for Office. The new
 * account cannot resume the old one's session, so the Odd starts a new one,
 * which hears the chat so far.
 */
export async function setAccount(
  staffId: string,
  id: string | null
): Promise<{ refused: string } | undefined> {
  const before = await staffer(staffId);
  if (!before) return { refused: 'No such Odd' };
  const next = id === OFFICE_ACCOUNT ? null : id;
  const row = next ? await account(next) : undefined;
  if (next && row?.agent !== before.agent)
    return { refused: `That is not one of ${AGENT_NAMES[before.agent]}'s accounts` };
  if ((before.account ?? null) === next) return;
  await db.update(staff).set({ account: next }).where(eq(staff.id, staffId));
  rmSync(chatSession(staffId), { force: true });
  await record({
    kind: 'access',
    actor: 'owner',
    title: `Moved ${before.name} to the ${AGENT_NAMES[before.agent]} account ${row?.label ?? 'Office'}`
  });
}

/**
 * Before accounts, Grok and Codex each had one home, `~/.oddboro/grok` and
 * `~/.oddboro/codex`. At start each becomes its tool's Office account, renamed
 * in place with the sign-in in it, so nothing needs signing in again. The
 * Odds on it start new sessions, since a tool may keep a session's path.
 * Runs once: a home already moved, or never made, is left alone.
 */
export async function moveToolHomes(): Promise<void> {
  for (const tool of ['grok', 'codex'] as const) {
    const old = home(tool);
    const office = accountHome(tool, OFFICE_ACCOUNT);
    if (!existsSync(old) || existsSync(office)) continue;
    mkdirSync(accountHome(tool, ''), { recursive: true, mode: 0o700 });
    renameSync(old, office);
    const on = await db.select({ id: staff.id }).from(staff).where(eq(staff.agent, tool));
    for (const o of on) rmSync(chatSession(o.id), { force: true });
  }
}

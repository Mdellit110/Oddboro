// What a chat message tells the staffer's chat session before the owner's
// words: the lines in its chat that no run of the session wrote, the owner's
// messages whose run failed, the work it put on the desk, and the asks the
// owner decided and tasks they ended, since the session last heard. Without
// it, an answer to a new manager's hello, or "How did the call go?" after a
// poke, means nothing to the session.
import { flat, SAID_AS } from '@oddboro/ledger/desk-answers';
import type { ChatEntry } from '../staff/chat.ts';
import { cut } from './run-env.ts';

/** A line the session never saw: a poke the office delivered, a line it said in the staffer's name, or a failed run's error. */
const unseen = (e: ChatEntry) => e.poke || e.told || e.failed;

/** Something the staffer put on the desk, as the chat lists it, and when the owner decided an ask or ended a task. */
type Landed = { kind: string; title: string; at: Date; status?: string; decidedAt?: Date | null };

// Any desk item's status reaches here as text, and one with no word keeps its own.
const said: Partial<Record<string, string>> = SAID_AS;
const howItEnded = (d: Landed) => `"${d.title}" ${said[d.status ?? ''] ?? d.status}`;

/**
 * The chat resumes the session saved last, or starts a new one that hears the
 * lines of `past` at `replayed` word for word (`replay` in replay.ts).
 */
export type Session = 'resumed' | { replayed: Set<number> };

/** The most of one chat line `lastExchange` carries, in UTF-16 units. */
const EXCHANGE_LINE_MAX = 300;

/**
 * The last Odd line before the owner's message and the owner line before it,
 * as one line, each cut to `EXCHANGE_LINE_MAX`, for tell_lead. A told or poke
 * line counts as the Odd's: the owner read it just before replying, whichever
 * way it was written. Without an owner line before it (a hello, a first
 * question) it is the Odd's half alone.
 */
export function lastExchange(
  past: ChatEntry[],
  who: { owner: string; odd: string }
): string | undefined {
  const spoken = past.filter((e) => !e.failed && flat(e.text));
  const odd = spoken.findLastIndex((e) => e.from === 'staff');
  if (odd < 0) return undefined;
  const quoted = (e: ChatEntry) => `"${cut(flat(e.text), EXCHANGE_LINE_MAX)}"`;
  const owner = spoken.slice(0, odd).findLast((e) => e.from === 'owner');
  return owner
    ? `Just before, ${who.owner} said: ${quoted(owner)}. ${who.odd} replied: ${quoted(spoken[odd])}.`
    : `Just before, ${who.odd} said: ${quoted(spoken[odd])}.`;
}

/**
 * Each told, poke and failed run's owner line since the owner last wrote is
 * said once: here only when the session does not hold it already.
 */
export function chatPreface(past: ChatEntry[], landed: Landed[], session: Session): string[] {
  // The office saves a failed run's error right after the owner's line (`chat` in staff.ts).
  const failedOn = (i: number) => past[i].from === 'owner' && past[i + 1]?.failed === true;
  // The last failed run whose tool named a session (`inSession`): the session
  // a resumed chat takes up is the one it saved.
  const saved = past.findLastIndex((_, i) => failedOn(i) && past[i + 1].inSession === true);
  // A new session holds what its replay keeps. A resumed one holds every
  // failed run's owner line up to that run's: the run took its own line, and
  // its preface carried each earlier one the session did not hold. It never
  // holds a told or poke line, which no run of it wrote.
  const holds = (i: number) =>
    session === 'resumed' ? failedOn(i) && i <= saved : session.replayed.has(i);
  const heard = past.findLastIndex((e, i) => e.from === 'owner' && !failedOn(i)) + 1;
  const since = past.flatMap((e, i) => (i >= heard && !holds(i) ? [e] : []));
  const told = since.filter((e) => e.told);
  const poked = since.filter((e) => e.poke);
  const failed = past.flatMap((_, i) => (i >= heard && failedOn(i) ? [i] : []));
  const missed = failed.filter((i) => !holds(i)).map((i) => past[i]);
  const ran = failed.filter(holds).length;
  // The session saw what it delivered up to the end of its last reply.
  const last = past.findLast((e, i) => !unseen(e) && !failedOn(i))?.at ?? '';
  const put = landed.filter((d) => d.at.toISOString() > last);
  // Without these, a resumed session says an ask or a task still waits after the owner ended it.
  const ended = landed.filter((d) => d.decidedAt && d.decidedAt.toISOString() > last);
  const decided = ended.filter((d) => d.kind !== 'task');
  const endedTasks = ended.filter((d) => d.kind === 'task');
  return [
    ...(told.length
      ? [
          `(Before this, you said to {owner} in chat: ${told.map((e) => `"${e.text}"`).join(', ')}.)`
        ]
      : []),
    ...(poked.length
      ? [
          `(Since {owner} last wrote, the office delivered your pokes to them: ${poked.map((e) => `"${e.text}"`).join(', ')}.)`
        ]
      : []),
    // The session holds these messages, but not that its run on them failed.
    ...(ran
      ? [
          ran === 1
            ? "(Your run on {owner}'s last message you saw before this one failed, so they have no reply from you to it.)"
            : `(Your runs on {owner}'s last ${ran} messages you saw before this one failed, so they have no reply from you to them.)`
        ]
      : []),
    ...(missed.length
      ? [
          `({owner} wrote to you before this, but your run failed each time, so you never saw it: ${missed.map((e) => `"${e.text}"`).join(', ')}.)`
        ]
      : []),
    ...(put.length
      ? [
          `(Since {owner} last wrote, you put these on their desk: ${put.map((d) => `${d.kind} "${d.title}"`).join(', ')}.)`
        ]
      : []),
    ...(decided.length
      ? [
          `(Since your last reply, {owner} decided your asks: ${decided.map(howItEnded).join(', ')}. my_asks has their reasons.)`
        ]
      : []),
    ...(endedTasks.length
      ? [
          `(Since your last reply, {owner} ended your tasks: ${endedTasks.map(howItEnded).join(', ')}. my_tasks has what they said.)`
        ]
      : [])
  ];
}

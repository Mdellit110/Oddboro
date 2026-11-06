// What a chat message tells the staffer's chat session before the owner's
// words: the lines in its chat that no run of the session wrote, the owner's
// messages whose run failed, the work it put on the desk, and the asks the
// owner decided, since the session last heard. Without it, an answer to a
// new manager's hello, or "How did the call go?" after a poke, means nothing
// to the session.
import type { ChatEntry } from '../staff/chat.ts';

/** A line the session never saw: a poke the office delivered, a line it said in the staffer's name, or a failed run's error. */
const unseen = (e: ChatEntry) => e.poke || e.told || e.failed;

/** Something the staffer put on the desk, as the chat lists it, and when the owner decided an ask. */
type Landed = { kind: string; title: string; at: Date; status?: string; decidedAt?: Date | null };

/** How the session hears each decision on an ask (`AskStatus`). */
const DECIDED: Record<string, string> = {
  approved: 'approved',
  denied: 'turned down',
  revise: 'sent back'
};

/**
 * The chat resumes the session saved last, or starts a new one that hears the
 * lines of `past` at `replayed` word for word (`replay` in replay.ts).
 */
export type Session = 'resumed' | { replayed: Set<number> };

/**
 * Each told, poke and failed run's owner line since the owner last wrote is
 * said once: here only when the session does not hold it already.
 */
export function chatPreface(past: ChatEntry[], landed: Landed[], session: Session): string[] {
  // The office saves a failed run's error right after the owner's line (`chat` in staff.ts).
  const failedOn = (i: number) => past[i].from === 'owner' && past[i + 1]?.failed === true;
  // A new session holds what its replay keeps. A resumed one holds a failed
  // run's owner line when the run's tool named a session (`inSession`): the
  // run saved it, and a later run that saved one resumed it. It never holds a
  // told or poke line, which no run of it wrote.
  const holds = (i: number) =>
    session === 'resumed'
      ? failedOn(i) && past[i + 1]?.inSession === true
      : session.replayed.has(i);
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
  // Without this, a resumed session says an ask still waits after the owner decided it.
  const decided = landed.filter((d) => d.decidedAt && d.decidedAt.toISOString() > last);
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
          `(Since your last reply, {owner} decided your asks: ${decided.map((d) => `"${d.title}" ${DECIDED[d.status ?? ''] ?? d.status}`).join(', ')}. my_asks has their reasons.)`
        ]
      : [])
  ];
}

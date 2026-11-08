// How a chat dates its messages: the line under each one, the day breaks
// between them, and the full date on hover. All in the office's time zone.
import { officeDay, zone } from '@oddboro/ledger/time';

const MINUTE = 60_000;

const clock = (d: Date) =>
  d.toLocaleTimeString('en-US', { timeZone: zone(), hour: 'numeric', minute: '2-digit' });

/** When a message was sent: "just now", "4 min ago" under an hour old, else the clock time. */
export function stamp(at: string | Date, now = new Date()): string {
  const d = new Date(at);
  const min = Math.floor((now.getTime() - d.getTime()) / MINUTE);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  return clock(d);
}

/** True while a message is young enough that its stamp still counts minutes. */
export const counting = (at: string | Date, now = new Date()): boolean =>
  now.getTime() - new Date(at).getTime() < 60 * MINUTE;

/** How long a run took, from its milliseconds: "took 45 s", "took 1 min 20 s", "took 1 h 5 min". */
export function took(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `took ${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return s % 60 ? `took ${min} min ${s % 60} s` : `took ${min} min`;
  return min % 60 ? `took ${Math.floor(min / 60)} h ${min % 60} min` : `took ${min / 60} h`;
}

/** The day before an office day ("2026-11-07" gives "2026-11-06"), whatever the clocks did. */
function dayBefore(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/** A day break's words: "Today", "Yesterday", else "Friday, November 6", with the year when not this one. */
export function dayLabel(at: string | Date, now = new Date()): string {
  const d = new Date(at);
  const day = officeDay(d);
  const today = officeDay(now);
  if (day === today) return 'Today';
  if (day === dayBefore(today)) return 'Yesterday';
  return d.toLocaleDateString('en-US', {
    timeZone: zone(),
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' })
  });
}

/** The full date and time, for the tooltip on a stamp: "Friday, November 6, 2026 at 3:05 PM". */
export function fullDate(at: string | Date): string {
  const d = new Date(at);
  const date = d.toLocaleDateString('en-US', {
    timeZone: zone(),
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  return `${date} at ${clock(d)}`;
}

/**
 * The day break above each line, if any: the first dated line, and each one
 * on another office day than the dated line before it. A line with no date
 * yet never starts a day.
 */
export function dayBreaks(ats: (string | undefined)[], now = new Date()): (string | undefined)[] {
  let last: string | undefined;
  return ats.map((at) => {
    if (!at) return undefined;
    const day = officeDay(new Date(at));
    if (day === last) return undefined;
    last = day;
    return dayLabel(at, now);
  });
}

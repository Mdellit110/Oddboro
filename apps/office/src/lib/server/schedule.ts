// Checks a schedule sent from the page.
import type { Schedule } from '@oddboro/ledger';
import { WEEKDAYS } from '@oddboro/ledger/time';

const AT = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseSchedule(v: unknown): Schedule | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as Record<string, unknown>;
  if (s.every === 'minutes' && typeof s.n === 'number' && s.n >= 5 && s.n <= 1440)
    return { every: 'minutes', n: Math.round(s.n) };
  if (typeof s.at !== 'string' || !AT.test(s.at)) return null;
  if (s.every === 'day' || s.every === 'weekday') return { every: s.every, at: s.at };
  const day = WEEKDAYS.find((d) => d === s.day);
  if (s.every === 'week' && day) return { every: 'week', day, at: s.at };
  return null;
}

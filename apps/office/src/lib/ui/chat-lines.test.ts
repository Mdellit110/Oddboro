// How a chat dates its messages: the stamp under each, how long a reply
// took, and the day breaks. Run with `npm test -w @oddboro/office`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setZone } from '@oddboro/ledger/time';
import { counting, dayBreaks, dayLabel, fullDate, stamp, took } from './chat-lines.ts';

setZone('America/Los_Angeles');
// Saturday, November 7, 2026, 10:00 AM in Los Angeles.
const now = new Date('2026-11-07T18:00:00Z');
const before = (min: number) => new Date(now.getTime() - min * 60_000);

test('a stamp counts minutes for the first hour, then gives the clock time', () => {
  assert.equal(stamp(before(0), now), 'just now');
  assert.equal(stamp(before(4), now), '4 min ago');
  assert.equal(stamp(before(59), now), '59 min ago');
  assert.equal(stamp(before(60), now), '9:00 AM');
  assert.equal(stamp(before(15 * 60), now), '7:00 PM');
});

test('a message from a clock running ahead reads as just now, never as minus minutes', () => {
  assert.equal(stamp(before(-2), now), 'just now');
});

test('only a stamp still counting minutes needs the minute tick', () => {
  assert.equal(counting(before(59), now), true);
  assert.equal(counting(before(60), now), false);
});

test('how long a reply took reads in seconds, then minutes and seconds, then hours', () => {
  assert.equal(took(300), 'took 1 s');
  assert.equal(took(45_000), 'took 45 s');
  assert.equal(took(80_000), 'took 1 min 20 s');
  assert.equal(took(120_000), 'took 2 min');
  assert.equal(took(65 * 60_000), 'took 1 h 5 min');
  assert.equal(took(2 * 3_600_000), 'took 2 h');
});

test('a day break says Today, Yesterday, else the weekday and date', () => {
  assert.equal(dayLabel(before(60), now), 'Today');
  assert.equal(dayLabel(new Date('2026-11-06T20:00:00Z'), now), 'Yesterday');
  assert.equal(dayLabel(new Date('2026-11-05T20:00:00Z'), now), 'Thursday, November 5');
  assert.equal(dayLabel(new Date('2025-12-31T20:00:00Z'), now), 'Wednesday, December 31, 2025');
});

test("days follow the office's time zone, not UTC", () => {
  // 7:00 AM UTC on the 7th is 11:00 PM on the 6th in Los Angeles.
  assert.equal(dayLabel(new Date('2026-11-07T07:00:00Z'), now), 'Yesterday');
});

test('yesterday is the day before even across a clock change', () => {
  // Clocks went back on Sunday, November 1, 2026: a 25-hour day.
  const monday = new Date('2026-11-02T08:30:00Z'); // 12:30 AM Monday
  assert.equal(dayLabel(new Date('2026-11-01T07:30:00Z'), monday), 'Yesterday'); // 12:30 AM Sunday
});

test('the tooltip gives the full date and time', () => {
  assert.equal(fullDate(before(60)), 'Saturday, November 7, 2026 at 9:00 AM');
});

test('a day break goes above the first line and each line on a new day only', () => {
  const ats = [
    '2026-11-05T20:00:00Z',
    '2026-11-05T21:00:00Z',
    undefined,
    '2026-11-06T20:00:00Z',
    '2026-11-07T17:00:00Z',
    '2026-11-07T17:30:00Z',
    undefined
  ];
  assert.deepEqual(dayBreaks(ats, now), [
    'Thursday, November 5',
    undefined,
    undefined,
    'Yesterday',
    'Today',
    undefined,
    undefined
  ]);
});

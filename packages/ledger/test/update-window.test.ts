// When an update installs, when the Odds are held, and when a poke still
// lands. Run with `npm test -w @oddboro/ledger`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setZone } from '../src/time.ts';
import {
  holding,
  inWindow,
  isClock,
  newer,
  nextWindowStart,
  pokeMissed,
  timeToInstall
} from '../src/update-window.ts';

const at = (iso: string) => new Date(iso);
const MIN = 60_000;

test('the window start is tonight before it, and now inside it', () => {
  setZone('America/New_York');
  // 3:00 PM in New York (EDT, UTC-4) on 1 Oct 2026.
  assert.deepEqual(
    nextWindowStart(at('2026-10-01T19:00:00Z'), '02:00', '04:00'),
    at('2026-10-02T06:00:00Z')
  );
  // 1:59 AM: one minute to go.
  assert.deepEqual(
    nextWindowStart(at('2026-10-02T05:59:00Z'), '02:00', '04:00'),
    at('2026-10-02T06:00:00Z')
  );
  // 2:30 AM: inside it, so now.
  const inside = at('2026-10-02T06:30:00Z');
  assert.deepEqual(nextWindowStart(inside, '02:00', '04:00'), inside);
  // 4:00 AM: the window just closed, so tomorrow night.
  assert.deepEqual(
    nextWindowStart(at('2026-10-02T08:00:00Z'), '02:00', '04:00'),
    at('2026-10-03T06:00:00Z')
  );
});

test('a window that runs past midnight', () => {
  setZone('Europe/London');
  // 22:00 in London (BST, UTC+1) on 1 Oct, window 23:30 to 01:00.
  assert.deepEqual(
    nextWindowStart(at('2026-10-01T21:00:00Z'), '23:30', '01:00'),
    at('2026-10-01T22:30:00Z')
  );
  // 00:30: inside the part after midnight.
  assert.equal(inWindow(at('2026-10-01T23:30:00Z'), '23:30', '01:00'), true);
  // 01:00: closed until 23:30 that night.
  assert.equal(inWindow(at('2026-10-02T00:00:00Z'), '23:30', '01:00'), false);
  assert.deepEqual(
    nextWindowStart(at('2026-10-02T00:00:00Z'), '23:30', '01:00'),
    at('2026-10-02T22:30:00Z')
  );
});

test('the window follows the office zone, not the Mac', () => {
  setZone('Asia/Tokyo');
  // 12:00 UTC is 21:00 in Tokyo, so 02:00 Tokyo is 17:00 UTC.
  assert.deepEqual(
    nextWindowStart(at('2026-10-01T12:00:00Z'), '02:00', '04:00'),
    at('2026-10-01T17:00:00Z')
  );
  setZone('America/Los_Angeles');
  // Across the end of daylight time (1 Nov 2026): 02:00 PST is 10:00 UTC.
  assert.deepEqual(
    nextWindowStart(at('2026-11-01T06:00:00Z'), '02:00', '04:00'),
    at('2026-11-01T10:00:00Z')
  );
});

test('the hold starts 15 minutes before the install', () => {
  const installAt = at('2026-10-02T06:00:00Z');
  assert.equal(holding(installAt, new Date(installAt.getTime() - 16 * MIN)), false);
  assert.equal(holding(installAt, new Date(installAt.getTime() - 15 * MIN)), true);
  assert.equal(holding(installAt, installAt), true);
  assert.equal(holding(null, installAt), false);
});

test('it installs when nothing runs, or 20 minutes over', () => {
  const installAt = at('2026-10-02T06:00:00Z');
  assert.equal(timeToInstall(installAt, new Date(installAt.getTime() - MIN), false), false);
  assert.equal(timeToInstall(installAt, installAt, false), true);
  assert.equal(timeToInstall(installAt, new Date(installAt.getTime() + 19 * MIN), true), false);
  assert.equal(timeToInstall(installAt, new Date(installAt.getTime() + 20 * MIN), true), true);
  assert.equal(timeToInstall(undefined, installAt, false), false);
});

test('a poke due while the app updated still lands', () => {
  const due = at('2026-10-02T06:05:00Z');
  // 40 minutes late with no update: missed.
  assert.equal(pokeMissed(due, new Date(due.getTime() + 40 * MIN)), true);
  // 10 minutes late: lands.
  assert.equal(pokeMissed(due, new Date(due.getTime() + 10 * MIN)), false);
  // Down from 06:00 to 06:45, delivered at 06:46: one minute late after the downtime.
  const down = { from: at('2026-10-02T06:00:00Z'), to: at('2026-10-02T06:45:00Z') };
  assert.equal(pokeMissed(due, at('2026-10-02T06:46:00Z'), down), false);
  // The same downtime, but delivered at 07:05: 20 minutes late after it.
  assert.equal(pokeMissed(due, at('2026-10-02T07:05:00Z'), down), true);
  // A downtime long before the poke changes nothing.
  const earlier = { from: at('2026-10-01T06:00:00Z'), to: at('2026-10-01T06:30:00Z') };
  assert.equal(pokeMissed(due, new Date(due.getTime() + 40 * MIN), earlier), true);
});

test('versions and clocks', () => {
  assert.equal(newer('0.0.10', '0.0.9'), true);
  assert.equal(newer('0.0.9', '0.0.9'), false);
  assert.equal(newer('0.1.0', '0.0.99'), true);
  assert.equal(isClock('02:00'), true);
  assert.equal(isClock('2:00'), false);
  assert.equal(isClock('24:00'), false);
});

// What a new chat session hears of the chat it never saw: the newest lines
// within the budget, word for word, and the files in the Odd's folder that
// changed during them. Run with `npm test -w @oddboro/office`.
import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { changedSince, REPLAY_CHARS, REPLAY_FILES, replay } from './replay.ts';
import type { ChatEntry } from './staff.ts';

const owner = (text: string): ChatEntry => ({
  at: '2026-11-04T09:00:00.000Z',
  from: 'owner',
  text
});
const reply = (text: string): ChatEntry => ({
  at: '2026-11-04T09:00:01.000Z',
  from: 'staff',
  text
});
const told = (text: string): ChatEntry => ({ ...reply(text), told: true });
const poke = (text: string): ChatEntry => ({ ...reply(text), poke: true });
/** A desk item's line, which has no text of its own. */
const item: ChatEntry = { ...reply(''), item: { kind: 'ask', id: 1, title: 'A', status: 'open' } };
const HEAD =
  '(This is a new session, so you do not remember your chat with {owner} so far. Here is the latest of it, word for word, oldest first:)';

test('replay keeps the newest whole lines within the budget', () => {
  const chat = [owner('aaaa'), reply('bbbbbb'), item, told('cc'), poke('dd')];
  // Every line's text fits in 14 characters: each is kept, oldest first, by who said it.
  assert.equal(replay(chat, [], 14), `${HEAD}\n\n{owner}: aaaa\nYou: bbbbbb\nYou: cc\nYou: dd`);
  // At exactly the budget the oldest line that fits is kept whole; one short of it, it goes.
  assert.equal(replay(chat, [], 10), `${HEAD}\n\nYou: bbbbbb\nYou: cc\nYou: dd`);
  assert.equal(replay(chat, [], 9), `${HEAD}\n\nYou: cc\nYou: dd`);
  // An older short line never fills in behind a longer one that did not fit.
  assert.equal(replay([owner('x'), reply('yyyyyy'), owner('zz')], [], 4), `${HEAD}\n\n{owner}: zz`);
  // A newest line over the budget alone keeps its end.
  assert.equal(replay([owner('x'), reply('abcdefghij')], [], 4), `${HEAD}\n\nYou: …ghij`);
  assert.equal(REPLAY_CHARS, 24_000);
  const long = 'w'.repeat(REPLAY_CHARS + 5);
  assert.equal(replay([reply(long)], []), `${HEAD}\n\nYou: …${'w'.repeat(REPLAY_CHARS)}`);
});

/** A file under `dir`, last changed at `at`. */
function put(dir: string, path: string, at: Date): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), 'x');
  utimesSync(join(dir, path), at, at);
}
const since = new Date('2026-11-04T09:00:00.000Z');
const later = (minutes: number) => new Date(since.getTime() + minutes * 60_000);

test("changedSince lists the Odd's files changed since a time", () => {
  const dir = mkdtempSync(join(tmpdir(), 'oddboro-replay-'));
  const outside = mkdtempSync(join(tmpdir(), 'oddboro-replay-out-'));
  try {
    put(dir, 'old.md', later(-60));
    put(dir, 'at-the-time.md', since);
    put(dir, 'site/index.html', later(2));
    put(dir, 'notes/intake.md', later(3));
    // The Odd's own file of that name, deeper down, is the Odd's.
    put(dir, 'site/chat.jsonl', later(1));
    for (const office of ['chat.jsonl', 'session.json', '.hidden.md', '.codex/config.toml'])
      put(dir, office, later(4));
    put(outside, 'far.md', later(4));
    symlinkSync(join(outside, 'far.md'), join(dir, 'link.md'));
    assert.deepEqual(changedSince(dir, since.toISOString()), [
      'notes/intake.md',
      'site/index.html',
      'site/chat.jsonl',
      'at-the-time.md'
    ]);

    // Past the file cap, the rest are counted.
    const many = mkdtempSync(join(dir, 'many-'));
    for (let i = 0; i < REPLAY_FILES + 2; i++) put(many, `f${i}.md`, later(10 + i));
    const told = replay([owner('Make the files.')], changedSince(many, since.toISOString()));
    assert.match(told, /\(Files in your folder that changed during it: f31\.md, f30\.md, /);
    assert.match(told, /, f2\.md, and 2 more\.\)$/);
    assert.doesNotMatch(told, /f1\.md|f0\.md/);
    assert.equal(REPLAY_FILES, 30);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("changedSince looks at no more than 2,000 entries of the Odd's folder", () => {
  const dir = mkdtempSync(join(tmpdir(), 'oddboro-replay-'));
  try {
    for (let i = 0; i < 2_001; i++) writeFileSync(join(dir, `f${i}.md`), 'x');
    assert.equal(changedSince(dir, since.toISOString()).length, 2_000);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a folder in the walk that cannot be read is passed over, and the rest is still listed', (t) => {
  if (process.getuid?.() === 0) return t.skip('root reads a shut folder');
  const dir = mkdtempSync(join(tmpdir(), 'oddboro-replay-'));
  try {
    put(dir, 'shut/inside.md', later(1));
    put(dir, 'open.md', later(1));
    chmodSync(join(dir, 'shut'), 0o000);
    assert.deepEqual(changedSince(dir, since.toISOString()), ['open.md']);
    // Nothing to walk at all is no change, not a failed chat.
    assert.deepEqual(changedSince(join(dir, 'gone'), since.toISOString()), []);
  } finally {
    chmodSync(join(dir, 'shut'), 0o700);
    rmSync(dir, { recursive: true, force: true });
  }
});

// A chat after a new session starts, in an office under test
// (office-under-test.ts): the session hears the chat so far once, and the
// files the Odd changed during it, and resumed chats hear nothing again.
// Run with `npm test -w @oddboro/office`.
import assert from 'node:assert/strict';
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { L, PATCH, chatOf, odd, onPlatform } from './office-under-test.ts';
import { REPLAY_CHARS } from './replay.ts';

await L.pg`insert into staff ${L.pg([odd('rory', 'Rory')])}`;

const own = (path: string) => L.home('staff', 'rory', path);
const times = (text: string, part: string) => text.split(part).length - 1;

test('the first chat after a tool switch replays the chat; the next does not', async () => {
  mkdirSync(own(''), { recursive: true });
  // Plain lines, so no stand-in acts on words in them.
  const first = new Date(Date.now() - 60 * 60_000);
  const at = (minutes: number) => new Date(first.getTime() + minutes * 60_000).toISOString();
  writeFileSync(
    own('chat.jsonl'),
    [
      // Too long to fit beside the rest, so the replay starts after it.
      { at: at(-30), from: 'owner', text: `Long ago. ${'x'.repeat(REPLAY_CHARS)}` },
      { at: at(0), from: 'owner', text: 'Plant the tulips.' },
      { at: at(1), from: 'staff', text: 'Tulips planted.' },
      { at: at(2), from: 'staff', text: 'I watered them too.', told: true }
    ]
      .map((l) => JSON.stringify(l) + '\n')
      .join('')
  );
  writeFileSync(own('tulips.md'), 'Six rows.');
  writeFileSync(own('before.md'), 'From last week.');
  const lastWeek = new Date(first.getTime() - 7 * 86_400_000);
  utimesSync(own('before.md'), lastWeek, lastWeek);
  // Changed after the long line and before the first one replayed.
  writeFileSync(own('between.md'), 'Old.');
  utimesSync(own('between.md'), new Date(at(-15)), new Date(at(-15)));

  const moved = await onPlatform('darwin', () =>
    PATCH({
      params: { id: 'rory' },
      request: new Request('http://office/api/staff/rory', {
        method: 'PATCH',
        body: JSON.stringify({ agent: 'codex' })
      })
    } as unknown as Parameters<typeof PATCH>[0])
  );
  assert.equal(moved.status, 200);

  const one = await chatOf('rory', 'What did I just ask you?');
  assert.ok(
    one.message.startsWith('(This is a new session, so you do not remember your chat with '),
    one.message
  );
  assert.ok(!one.message.includes('Long ago.'), 'a line past the budget was replayed');
  for (const line of ['Plant the tulips.', 'Tulips planted.', 'I watered them too.'])
    assert.equal(times(one.message, line), 1, `"${line}" is not in the replay once`);
  assert.ok(
    one.message.includes('(Files in your folder that changed during it: tulips.md.)'),
    one.message
  );
  assert.ok(one.message.endsWith('What did I just ask you?'), one.message);

  const two = await chatOf('rory', 'And now?');
  assert.ok(two.args.includes('resume'), 'the second chat started another session');
  assert.ok(!two.message.includes('This is a new session'), two.message);
  assert.ok(!two.message.includes('Plant the tulips.'), two.message);
});

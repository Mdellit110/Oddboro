// What a chat message tells the session before the owner's words. Run with
// `npm test -w @oddboro/office`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answered, chatPreface } from './chat-preface.ts';
import type { ChatEntry } from './staff.ts';

const owner = (at: string, text: string): ChatEntry => ({ at, from: 'owner', text });
const reply = (at: string, text: string): ChatEntry => ({ at, from: 'staff', text });
const told = (at: string, text: string): ChatEntry => ({ at, from: 'staff', text, told: true });
const poke = (at: string, text: string): ChatEntry => ({ at, from: 'staff', text, poke: true });
const failed = (at: string, text: string): ChatEntry => ({ at, from: 'staff', text, failed: true });

test("a line the office said in the staffer's name since the owner last wrote is told to the session", () => {
  const lines = chatPreface([told('2026-11-03T09:00:00Z', 'Three questions?')], []);
  assert.deepEqual(lines, ['(Before this, you said to {owner} in chat: "Three questions?".)']);
});

test('a told line from before the owner last wrote is not told again', () => {
  const past = [
    told('2026-11-03T09:00:00Z', 'Three questions?'),
    owner('2026-11-03T09:05:00Z', 'Check with me first.'),
    reply('2026-11-03T09:06:00Z', 'Got it.')
  ];
  assert.deepEqual(chatPreface(past, []), []);
});

test('only the told lines since the owner last wrote are told, beside the pokes delivered', () => {
  const past = [
    told('2026-11-03T09:00:00Z', 'old hello'),
    owner('2026-11-03T09:05:00Z', 'hi'),
    reply('2026-11-03T09:06:00Z', 'hello'),
    told('2026-11-03T10:00:00Z', 'new line'),
    poke('2026-11-03T11:00:00Z', 'How did the call go?')
  ];
  assert.deepEqual(chatPreface(past, []), [
    '(Before this, you said to {owner} in chat: "new line".)',
    '(Since {owner} last wrote, the office delivered your pokes to them: "How did the call go?".)'
  ]);
});

test('work put on the desk since the last reply is told, even with a told line after it', () => {
  const past = [
    owner('2026-11-03T09:00:00Z', 'hi'),
    reply('2026-11-03T09:01:00Z', 'hello'),
    told('2026-11-03T10:00:00Z', 'a line')
  ];
  const landed = [
    { kind: 'ask', title: 'Before the reply', at: new Date('2026-11-03T09:00:30Z') },
    { kind: 'task', title: 'After the reply', at: new Date('2026-11-03T09:30:00Z') }
  ];
  assert.deepEqual(chatPreface(past, landed), [
    '(Before this, you said to {owner} in chat: "a line".)',
    '(Since {owner} last wrote, you put these on their desk: task "After the reply".)'
  ]);
});

test('an ask the owner decided since the last reply is told, and one decided before it is not', () => {
  const past = [owner('2026-11-03T09:00:00Z', 'hi'), reply('2026-11-03T09:01:00Z', 'hello')];
  const at = new Date('2026-11-03T08:00:00Z');
  const landed = [
    {
      kind: 'ask',
      title: 'Book the hall',
      at,
      status: 'approved',
      decidedAt: new Date('2026-11-03T09:30:00Z')
    },
    {
      kind: 'ask',
      title: 'Call the band',
      at,
      status: 'revise',
      decidedAt: new Date('2026-11-03T09:40:00Z')
    },
    {
      kind: 'ask',
      title: 'Old news',
      at,
      status: 'denied',
      decidedAt: new Date('2026-11-03T08:30:00Z')
    },
    { kind: 'ask', title: 'Still open', at, status: 'open', decidedAt: null }
  ];
  assert.deepEqual(chatPreface(past, landed), [
    '(Since your last reply, {owner} decided your asks: "Book the hall" approved, "Call the band" sent back. my_asks has their reasons.)'
  ]);
});

test('a message that got no reply is told to the session, with the lines since the owner last got a reply', () => {
  const past = [
    owner('2026-11-03T09:00:00Z', 'Hi'),
    reply('2026-11-03T09:00:05Z', 'Hello.'),
    told('2026-11-03T09:01:00Z', 'The call moved to 3pm.'),
    owner('2026-11-03T09:02:00Z', 'Book the room'),
    failed('2026-11-03T09:07:00Z', 'No reply after 5 minutes.')
  ];
  assert.deepEqual(chatPreface(past, []), [
    '(Before this, you said to {owner} in chat: "The call moved to 3pm.".)',
    '({owner} wrote to you before this and got no reply, because the office stopped that run: "Book the room". If you did any of it, say so.)'
  ]);
  // Only the exchanges that happened: the failed one is left out.
  assert.deepEqual(answered(past), past.slice(0, 3));
});

test('work put on the desk during a run that got no reply is still told', () => {
  const lines = chatPreface(
    [
      owner('2026-11-03T09:00:00Z', 'Hi'),
      reply('2026-11-03T09:00:05Z', 'Hello.'),
      owner('2026-11-03T09:02:00Z', 'Draft the note'),
      failed('2026-11-03T09:07:00Z', 'No reply after 5 minutes.')
    ],
    [{ kind: 'task', title: 'Draft the note', at: new Date('2026-11-03T09:03:00Z') }]
  );
  assert.ok(
    lines.includes(
      '(Since {owner} last wrote, you put these on their desk: task "Draft the note".)'
    ),
    lines.join('\n')
  );
});

// What every Office Manager's first chat message asks a new owner, and the
// three first questions it starts. Run with
// `npm test -w @oddboro/ledger`. managers.ts imports db.ts, so pglite.ts stands
// in for it, though nothing here reads the database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import './pglite.ts';

const M = await import('../src/managers.ts');
const F = await import('../src/first-questions.ts');

/** Every hello the office can write: each ready-made manager's, and a described one's. */
const hellos = [
  ...M.MANAGERS.map((m) => ({ who: m.name, text: m.hello('Ada') })),
  { who: 'a described manager', text: M.customHello('Rosa', 'Ada') }
];

test('every hello greets the owner by name, says how to answer, and ends with the first question', () => {
  for (const { who, text } of hellos) {
    assert.match(text, /\bAda\b/, `${who} greets the owner by name`);
    assert.match(text, /Tap an answer, or type your own\./, `${who} says how to answer`);
    assert.equal(F.firstQuestionIn(text), 0, `${who} ends with the first question`);
    assert.ok(text.length < 300, `${who}'s hello is short: ${text.length} characters`);
  }
});

test('three first questions, each one short line with three to five answers to tap, and each found only at the end of a line', () => {
  assert.equal(F.FIRST_QUESTIONS.length, 3);
  for (const [i, q] of F.FIRST_QUESTIONS.entries()) {
    assert.doesNotMatch(q.ask, /\n/, q.ask);
    assert.ok(q.ask.length <= 90, q.ask);
    assert.ok(q.answers.length >= 3 && q.answers.length <= 5, q.ask);
    assert.equal(F.firstQuestionIn(`Got it.\n\n${q.ask}`), i);
    assert.equal(F.firstQuestionIn(`${q.ask} Then we start.`), -1);
  }
  // No answer may promise sending without the owner's yes (hard rule 4): the question says so.
  assert.match(F.FIRST_QUESTIONS[1].ask, /^Nothing leaves the office without your yes\./);
  for (const a of F.FIRST_QUESTIONS[1].answers) assert.doesNotMatch(a, /send|post|big things/i, a);
});

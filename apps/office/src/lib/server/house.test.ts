// The section of the system prompt every run gets. Run with
// `npm test -w @oddboro/office`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OFFICE_SECTION, SETTINGS_TAB } from '@oddboro/ledger/access';
import { house } from './house.ts';

const section = house({ has: () => false, now: '9:00', zone: 'London time' });

test('every run is told that only its reply and its tool calls reach the owner', () => {
  assert.match(
    section,
    /- What reaches \{owner\} is only your reply, and what a tool call put on their desk or in their chat\./
  );
});

test('every run is told that the owner reads every reply, so work goes by its title and a file by its name', () => {
  assert.match(
    section,
    /- \{owner\} reads every reply you write, in any run, even one that goes back to a colleague\./
  );
  assert.match(
    section,
    /never by a number, and a file by its name alone \(plan\.md\), never by its folder or path\./
  );
});

test('every run is told never to claim it sent, gave, brought or handed something no tool call did', () => {
  assert.match(
    section,
    /- Never say you sent, gave, brought or handed something unless a tool call in this run did it and succeeded\./
  );
});

test('every run is told never to promise the owner a later step that no tool call in it set up', () => {
  assert.match(
    section,
    /- Never promise \{owner\} a later step, such as "I'll send you" or "when it's ready", unless a tool call in this run set up what brings you back to do it, such as a hand_off, or an ask or task on their desk\./
  );
});

test('every run speaks of the owner by name or as "they" unless the owner said otherwise', () => {
  assert.match(
    section,
    /- Speak of \{owner\} by name or as "they", unless they have told you otherwise\./
  );
});

test('every run is told Run commands and Browse the web are its own tools, which my_access says how to get, never outside tools to find', () => {
  assert.ok(
    section.includes(
      '- my_access lists your outside tools and your own. Run commands and Browse the web are your own tools, not outside tools: my_access says whether you have each, and if not, whether {owner} can switch it on in your Settings tab, under Office. When a job needs one they can switch on, say which and why in your reply. When an outside tool stops working'
    ),
    section
  );
  // The tab and its section are named as the card names them.
  assert.ok(section.includes(`in your ${SETTINGS_TAB} tab, under ${OFFICE_SECTION}.`), section);
});

test('a run that can ask for access is told where more outside tools come from', () => {
  const at = (held: string[]) =>
    house({ has: (t) => held.includes(t), now: '9:00', zone: 'London time' });
  assert.match(
    at(['ask_for_access', 'find_connectors']),
    /reply\. For more outside tools, call find_connectors, then ask_for_access\. When an outside tool/
  );
  assert.match(
    at(['ask_for_access']),
    /reply\. For more outside tools, call ask_for_access\. When an outside tool/
  );
  assert.doesNotMatch(section, /For more outside tools/);
});

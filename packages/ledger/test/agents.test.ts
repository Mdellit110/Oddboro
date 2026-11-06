// Which coding tools the office offers on each system. Run with
// `npm test -w @oddboro/ledger`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agentsOn, EFFORTS, effortFor, MODELS, modelFor, offeredAgent } from '../src/agents.ts';

test('a Windows office offers Claude Code and no other tool', () => {
  assert.deepEqual(agentsOn('win32'), ['claude']);
  for (const tool of ['grok', 'codex', 'gemini'])
    assert.equal(offeredAgent(tool, 'win32'), undefined, tool);
  assert.equal(offeredAgent('claude', 'win32'), 'claude');
});

test("an Odd's level is its own pick on its tool, Medium when none, the nearest below when its tool lacks it, and never below Medium for the Office Manager", () => {
  assert.equal(effortFor('claude', null, false), 'medium');
  assert.equal(effortFor('claude', 'low', false), 'low');
  assert.equal(effortFor('codex', 'ultra', false), 'ultra');
  assert.equal(effortFor('claude', 'ultra', false), 'max');
  assert.equal(effortFor('grok', 'xhigh', false), 'high');
  assert.equal(effortFor('claude', 'nonsense', false), 'medium');
  assert.equal(effortFor('claude', 'low', true), 'medium');
  assert.equal(effortFor('codex', 'high', true), 'high');
  assert.equal(effortFor('gemini', 'high', false), undefined);
  // Every tool that takes levels takes Medium, so the default and the floor always fit.
  for (const [tool, menu] of Object.entries(EFFORTS))
    if (menu.length) assert.ok(menu.includes('medium'), tool);
});

test("an Odd's model is one its tool lists, or the office's, and its levels follow the model", () => {
  assert.equal(modelFor('codex', 'gpt-6-astra'), 'gpt-6-astra');
  assert.equal(modelFor('claude', 'gpt-6-astra'), undefined);
  assert.equal(modelFor('grok', null), undefined);
  // Luna stops at Max, so an Ultra kept from Sol becomes Max.
  assert.equal(effortFor('codex', 'ultra', false, 'gpt-6-luna'), 'max');
  assert.equal(effortFor('codex', 'ultra', false, 'gpt-6.1-sol'), 'ultra');
  for (const [tool, list] of Object.entries(MODELS))
    for (const m of list)
      assert.ok((m.efforts ?? EFFORTS[tool as keyof typeof EFFORTS]).includes('medium'), m.id);
});

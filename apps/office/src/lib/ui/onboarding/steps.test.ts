// The first visit's cards. Run with `npm test -w @oddboro/office`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STEPS, TITLE } from './steps.ts';

test('the first visit runs six cards and asks nothing about error reports', () => {
  assert.deepEqual(STEPS, ['mac', 'you', 'ai', 'manager', 'space', 'go']);
  assert.ok(!Object.values(TITLE).includes('Help improve Oddboro'));
});

// The Settings tab's office tools: every tool an Odd always has is listed,
// and the search filters both lists. Run with `npm test -w @oddboro/office`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OFFICE_TOOLS } from '@oddboro/ledger/tools';
import { toolGroups } from './tool-groups.ts';

const names = (tools: readonly { name: string }[]) => tools.map((t) => t.name);

test('with no search, Always on lists every tool every Odd has, and only those', () => {
  const { grantable, alwaysOn } = toolGroups('');
  assert.deepEqual(names(alwaysOn), names(OFFICE_TOOLS.filter((t) => t.always)));
  assert.deepEqual(names(grantable), names(OFFICE_TOOLS.filter((t) => !t.always)));
});

test('a search for tasks keeps Its tasks under Always on and drops what does not say it', () => {
  const { grantable, alwaysOn } = toolGroups('  Tasks ');
  assert.ok(names(alwaysOn).includes('Its tasks'));
  assert.ok(!names(alwaysOn).includes('Ask you'));
  assert.ok(names(grantable).includes('Give you tasks'));
  assert.ok(!names(grantable).includes('Find tools'));
});

test('a search that matches no tool leaves both lists empty', () => {
  assert.deepEqual(toolGroups('zzz no such tool'), { grantable: [], alwaysOn: [] });
});

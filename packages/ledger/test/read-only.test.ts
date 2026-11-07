// Which tools a Read only grant reaches (`readsOnly`): only a tool the server
// marks as reading, not destructive, and whose name says nothing about
// changing anything. The owner cannot add one (issue #35). Run with
// `npm test -w @oddboro/ledger`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nameWords, readsOnly } from '../src/read-only.ts';

const marked = (name: string, annotations?: Record<string, boolean>) => ({ name, annotations });

test('a tool the server marks as reading is Read only', () => {
  assert.equal(readsOnly(marked('search_thoughts', { readOnlyHint: true })), true);
  assert.equal(readsOnly(marked('listIssues', { readOnlyHint: true })), true);
});

test('a tool the server leaves unmarked, or marks as writing, is not', () => {
  assert.equal(readsOnly(marked('search_thoughts')), false);
  assert.equal(readsOnly(marked('search_thoughts', {})), false);
  assert.equal(readsOnly(marked('capture_thought', { readOnlyHint: false })), false);
  assert.equal(
    readsOnly(marked('lookup', { readOnlyHint: true, destructiveHint: true })),
    false,
    'a destructive mark wins over a reading one'
  );
});

test('a name that says it changes something is never Read only, whatever the server says', () => {
  for (const name of [
    'multica_create_issue',
    'multica_add_comment',
    'multica_update_issue',
    'createIssue',
    'send-message',
    'DeleteFile',
    'post'
  ])
    assert.equal(readsOnly(marked(name, { readOnlyHint: true })), false, name);
});

test('a word only counts whole, so reading names that hold one stay Read only', () => {
  for (const name of ['list_updates', 'get_settings', 'search_posts', 'list_runs', 'preset_list'])
    assert.equal(readsOnly(marked(name, { readOnlyHint: true })), true, name);
});

test('a name splits on underscores, dashes and capitals', () => {
  assert.deepEqual(nameWords('multica_createIssue-v2'), ['multica', 'create', 'issue', 'v2']);
});

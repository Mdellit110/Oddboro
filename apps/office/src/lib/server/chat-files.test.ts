// Files the owner attaches in a chat, kept in the Odd's attachments folder (`chat-files.ts`).
// Run with `npm test -w @oddboro/office`.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { home } from '@oddboro/ledger/home';
import { attachedFiles, attachmentPath, keepAttachment } from './chat-files.ts';

const bytes = new TextEncoder().encode('picture');

test('a file is kept in the Odd attachments folder under a new safe name with its type', () => {
  const kept = keepAttachment('ada', 'My Screen Shot [1].PNG', '', bytes);
  assert.match(kept.name, /^\d{8}-\d{6}-[0-9a-f]{4}-My-Screen-Shot-1\.png$/);
  assert.equal(kept.mediaType, 'image/png');
  assert.equal(kept.size, bytes.byteLength);
  const path = attachmentPath('ada', kept.name);
  assert.equal(path, join(home('staff'), 'ada', 'attachments', kept.name));
  assert.equal(readFileSync(path!, 'utf8'), 'picture');
});

test('a pasted picture with no name keeps its type as its extension', () => {
  const kept = keepAttachment('ada', '', 'image/jpeg', bytes);
  assert.match(kept.name, /-file\.jpg$/);
  assert.equal(kept.mediaType, 'image/jpeg');
});

test('a file the office does not take is refused', () => {
  assert.throws(() => keepAttachment('ada', 'tool.exe', 'application/octet-stream', bytes));
  assert.throws(() => keepAttachment('ada', 'page.html', 'text/html', bytes));
  assert.throws(() => keepAttachment('ada', 'art.svg', 'image/svg+xml', bytes));
});

test('only a plain file in the attachments folder is found, by a bare name', () => {
  const kept = keepAttachment('ada', 'notes.md', 'text/markdown', bytes);
  assert.ok(attachmentPath('ada', kept.name));
  assert.equal(attachmentPath('grace', kept.name), undefined, "another Odd's attachments folder");
  assert.equal(attachmentPath('ada', `../attachments/${kept.name}`), undefined);
  assert.equal(attachmentPath('ada', '.hidden'), undefined);
  assert.equal(attachmentPath('ada', 'missing.md'), undefined);
  const dir = join(home('staff'), 'ada', 'attachments');
  writeFileSync(join(home('staff'), 'ada', 'secret.md'), 'x');
  symlinkSync(join(home('staff'), 'ada', 'secret.md'), join(dir, 'link.md'));
  assert.equal(attachmentPath('ada', 'link.md'), undefined, 'a link');
  mkdirSync(join(dir, 'folder.md'));
  assert.equal(attachmentPath('ada', 'folder.md'), undefined, 'a folder');
});

test('a message names only files in its Odd attachments folder, each with a tag', () => {
  const kept = keepAttachment('ada', 'plan.pdf', 'application/pdf', bytes);
  const [f] = attachedFiles('ada', [{ tag: ' plan.pdf ', name: kept.name }]);
  assert.equal(f.tag, 'plan.pdf');
  assert.equal(f.mediaType, 'application/pdf');
  assert.equal(f.path, join(home('staff'), 'ada', 'attachments', kept.name));
  assert.deepEqual(attachedFiles('ada', undefined), []);
  assert.throws(() => attachedFiles('ada', [{ tag: 'x', name: 'nope.pdf' }]));
  assert.throws(() => attachedFiles('ada', [{ tag: '', name: kept.name }]));
  assert.throws(() => attachedFiles('grace', [{ tag: 'x', name: kept.name }]));
  assert.throws(() => attachedFiles('ada', 'not a list'));
});

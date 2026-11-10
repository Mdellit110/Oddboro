// Which file in an Odd's folder an email may carry (`mailAttachment`): never one
// of the office's own files at the top of the folder, however the Odd names
// it, and a file of the same name below the top goes. The folders are fake,
// in the test's own home. Run with `npm test -w @oddboro/ledger`.
import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { home, OFFICE_FILES } from '../src/home.ts';
import { mailAttachment } from '../src/mail-attachments.ts';

const refused = (named: string) => ({ problem: `${named} is not a file in your folder.` });

// Mia's `notes` is a link back to her own folder, so each office file there is
// reachable under another path. A junction on Windows, which needs no admin.
const mia = home('staff', 'mia');
mkdirSync(mia, { recursive: true });
for (const name of Object.values(OFFICE_FILES)) writeFileSync(join(mia, name), '{}');
symlinkSync(mia, join(mia, 'notes'), process.platform === 'win32' ? 'junction' : 'dir');

// Noa's `notes` is a real folder, with files of her own.
const noa = home('staff', 'noa');
mkdirSync(join(noa, 'notes'), { recursive: true });
writeFileSync(join(noa, OFFICE_FILES.chat), '{}');
writeFileSync(join(noa, 'notes', OFFICE_FILES.chat), 'her own notes');
writeFileSync(join(noa, 'notes', 'intake.md'), 'intake');

test("an office file named at the top of the Odd's folder is refused", () => {
  assert.deepEqual(mailAttachment('mia', OFFICE_FILES.chat), refused(OFFICE_FILES.chat));
});

test('an office file named in another letter case is refused', () => {
  // On a Mac's disk this name opens the office's file. On Linux no file has
  // this name, so it is refused as missing: refused either way.
  const named = 'Chat.JSONL';
  assert.deepEqual(mailAttachment('mia', named), refused(named));
});

test("the chat log named through a folder linked to the Odd's own is refused", () => {
  const named = `notes/${OFFICE_FILES.chat}`;
  assert.deepEqual(mailAttachment('mia', named), refused(named));
});

test("the sessions named through a folder linked to the Odd's own are refused", () => {
  for (const name of [OFFICE_FILES.session, OFFICE_FILES.personaSession]) {
    const named = `notes/${name}`;
    assert.deepEqual(mailAttachment('mia', named), refused(named), named);
  }
});

test("an office file named by its full path in the Odd's folder is refused", () => {
  const named = join(mia, OFFICE_FILES.chat);
  assert.deepEqual(mailAttachment('mia', named), refused(named));
});

test("a real file below the top that shares an office file's name attaches", () => {
  assert.deepEqual(mailAttachment('noa', `notes/${OFFICE_FILES.chat}`), {
    path: `notes/${OFFICE_FILES.chat}`,
    name: OFFICE_FILES.chat,
    mediaType: 'application/octet-stream',
    size: 'her own notes'.length
  });
});

test('an ordinary file below the top attaches', () => {
  assert.deepEqual(mailAttachment('noa', 'notes/intake.md'), {
    path: 'notes/intake.md',
    name: 'intake.md',
    mediaType: 'text/markdown',
    size: 'intake'.length
  });
});

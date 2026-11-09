// The Storage tab's list of an Odd's folder (`listStorage` and its route).
// Run with `npm test -w @oddboro/office`.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { L } from './office-under-test.ts';

const { listStorage } = await import('./storage.ts');
const route = await import('../../routes/api/staff/[id]/storage/+server.ts');
const outside = mkdtempSync(join(tmpdir(), 'oddboro-storage-outside-'));
after(() => rmSync(outside, { recursive: true, force: true }));

/** An Odd's folder with what it made, the office's own files, hidden ones and links out. */
function oddFolder(): string {
  const root = mkdtempSync(join(tmpdir(), 'oddboro-storage-'));
  mkdirSync(join(root, 'notes'));
  mkdirSync(join(root, 'made', 'drafts'), { recursive: true });
  writeFileSync(join(root, 'notes', 'intake.md'), 'Hello');
  writeFileSync(join(root, 'made', 'plan.md'), 'A plan');
  writeFileSync(join(root, 'made', 'drafts', 'one.md'), 'One');
  // The office's own, the instruction files and hidden ones never show.
  writeFileSync(join(root, 'chat.jsonl'), '{}');
  writeFileSync(join(root, 'session.json'), '{}');
  writeFileSync(join(root, 'CLAUDE.md'), 'Instructions');
  mkdirSync(join(root, '.claude'));
  writeFileSync(join(root, '.claude', 'settings.json'), '{}');
  mkdirSync(join(root, '.git'));
  writeFileSync(join(root, '.env'), 'SECRET=1');
  // A link leads out of the folder: neither listed nor followed.
  writeFileSync(join(outside, 'private.txt'), 'Outside the folder');
  symlinkSync(outside, join(root, 'away'));
  symlinkSync(join(outside, 'private.txt'), join(root, 'notes', 'private.txt'));
  return root;
}

test("Storage lists what an Odd kept in its own folder, folders first, and never the office's own files, hidden ones or a link out", () => {
  const root = oddFolder();
  try {
    const { entries, capped } = listStorage(root);
    assert.equal(capped, false);
    assert.deepEqual(
      entries.map((e) => `${e.dir ? 'dir ' : ''}${e.path}`),
      [
        'dir made',
        'dir made/drafts',
        'made/drafts/one.md',
        'made/plan.md',
        'dir notes',
        'notes/intake.md'
      ]
    );
    assert.equal(entries.find((e) => e.path === 'made/plan.md')?.size, 6);
    // A same-named file further in is the Odd's own, not the office's.
    writeFileSync(join(root, 'notes', 'chat.jsonl'), '{}');
    assert.ok(listStorage(root).entries.some((e) => e.path === 'notes/chat.jsonl'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Storage stops at its cap and says so, and a folder that is not there lists nothing', () => {
  const root = oddFolder();
  try {
    const { entries, capped } = listStorage(root, 3);
    assert.equal(entries.length, 3);
    assert.equal(capped, true);
    assert.deepEqual(listStorage(join(root, 'nowhere')), { entries: [], capped: false });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the Storage route lists an Odd's own folder, and names no folder for an Odd that is not there", async () => {
  const dir = L.home('staff', 'cleo');
  mkdirSync(join(dir, 'made'), { recursive: true });
  writeFileSync(join(dir, 'made', 'storage-test.md'), 'Kept');
  try {
    const res = await route.GET({ params: { id: 'cleo' } } as Parameters<typeof route.GET>[0]);
    const body = (await res.json()) as {
      entries: { path: string }[];
      capped: boolean;
      cap: number;
    };
    assert.ok(body.entries.some((e) => e.path === 'made/storage-test.md'));
    assert.equal(body.cap, 5000);
    for (const id of ['nobody', '../cleo', 'Cleo'])
      await assert.rejects(
        async () => route.GET({ params: { id } } as Parameters<typeof route.GET>[0]),
        (e: unknown) => (e as { status?: number }).status === 404
      );
  } finally {
    rmSync(join(dir, 'made', 'storage-test.md'), { force: true });
  }
});

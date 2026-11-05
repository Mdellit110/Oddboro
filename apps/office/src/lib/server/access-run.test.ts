// What an Odd's own tools reach in a run, in an office under test
// (office-under-test.ts): which launch holds a shell, and which of the
// owner's developer tool folders commands may read. Run with
// `npm test -w @oddboro/office`.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { folder, L } from './office-under-test.ts';

const { LAUNCHES } = await import('./cli.ts');
const { DEV_FOLDERS, DEV_SECRETS } = await import('./sandbox.ts');

/** A run on another tool, with `commands` as given and nothing else switched on. */
const run = (commands: boolean) => {
  const dir = join(folder, 'staff', 'nobody');
  return {
    key: 'refused',
    staffId: 'nobody',
    dir,
    reads: [],
    writes: [dir],
    granted: [],
    system: 'You are nobody.',
    input: 'Hello.',
    servers: {},
    allowed: [],
    timeoutMs: 60_000,
    web: false,
    commands,
    network: false
  };
};

// No tool's sign-in check refuses in the office under test, so a launch that
// got past its refusal would start.
test('a launch handed a run its tool cannot hold refuses it: Grok and Gemini with commands, Codex without', async () => {
  assert.deepEqual(await LAUNCHES.grok(run(true)), { refused: L.COMMANDS_WHY.grok });
  assert.deepEqual(await LAUNCHES.gemini(run(true)), { refused: L.COMMANDS_WHY.gemini });
  assert.deepEqual(await LAUNCHES.codex(run(false)), {
    refused: 'Codex reads files through its commands, so it cannot run without them.'
  });
});

test('every developer tool credential file sits in a listed folder, and no listed folder is in or holds a secret store', () => {
  // Any folder stands for the home: the lists name paths inside it.
  const at = (p: string) => join('/home', p);
  for (const s of DEV_SECRETS)
    assert.ok(
      DEV_FOLDERS.some((f) => L.within(at(s), at(f))),
      `${s} is in no listed folder`
    );
  for (const f of DEV_FOLDERS)
    for (const s of L.SECRET_STORES)
      assert.ok(
        !L.within(at(f), at(s)) && !L.within(at(s), at(f)),
        `${f} and the secret store ${s}`
      );
  assert.ok(!DEV_FOLDERS.some((f) => L.within(at(f), at('.docker'))), '~/.docker is listed');
});

// Development saves secrets through `security -i`, one command a line on its
// stdin, so no value is ever on a command line. This runs the real `security`
// against a throwaway keychain file, never the owner's: every awkward value
// goes in and comes back the same. Mac only. Run with `npm test -w @oddboro/ledger`.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { readPassword, saveLines, securityWord } from '../src/secrets.ts';

const mac = process.platform === 'darwin';
const dir = mkdtempSync(join(tmpdir(), 'oddboro-keychain-'));
const keychain = join(dir, 'test.keychain');
after(() => {
  if (mac) spawnSync('security', ['delete-keychain', keychain], { stdio: 'ignore' });
  rmSync(dir, { recursive: true, force: true });
});

test('every awkward value goes through security -i and comes back the same', { skip: !mac }, () => {
  execFileSync('security', ['create-keychain', '-p', 'test', keychain]);
  execFileSync('security', ['unlock-keychain', '-p', 'test', keychain]);
  const values = [
    'plain',
    'with "double" quotes',
    "with 'single' quotes",
    'back\\slash and \\" both',
    'trailing backslash\\',
    'tab\there',
    '  spaces  around  ',
    '$HOME `id` #hash ;semi | pipe',
    'unicode é ü 日本 🙂',
    '-w starts with a dash',
    JSON.stringify({ a: 'b"c', d: 'e\\f', n: 1 }),
    JSON.stringify({ discovery: '"é\\'.repeat(2000), tokens: 'x'.repeat(4000) }),
    ''
  ];
  values.forEach((value, n) => {
    const account = `test:${n} "x"`;
    const lines = saveLines(account, value).map((l) => `${l} ${securityWord(keychain)}`);
    execFileSync('security', ['-i'], {
      input: `${lines.join('\n')}\n`,
      stdio: ['pipe', 'ignore', 'pipe']
    });
    let back = '';
    lines.forEach((_, i) => {
      const read = spawnSync(
        'security',
        [
          'find-generic-password',
          '-s',
          'oddboro',
          '-a',
          i ? `${account}#${i}` : account,
          '-g',
          keychain
        ],
        { encoding: 'utf8' }
      );
      assert.equal(read.status, 0, read.stderr);
      back += readPassword(read.stderr);
    });
    assert.equal(back, value);
  });
});

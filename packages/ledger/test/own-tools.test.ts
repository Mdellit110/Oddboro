// Run commands, Browse the web and folders the owner gives an Odd: which tool
// follows the switch, what each owner change records, and which folders are
// refused at the door. Run with `npm test -w @oddboro/ledger`.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, beforeEach, test } from 'node:test';
import { AGENTS, COMMANDS_WHY, commandsHow, type Agent } from '../src/agents.ts';
import { staff } from '../src/schema.ts';
import { db, sql } from './pglite.ts';

// A home of the test's own, with the office's home and code inside it, set
// before office.ts loads: home.ts fixes both at import.
const HOME = realpathSync(mkdtempSync(join(tmpdir(), 'own-tools-')));
process.env.HOME = HOME;
process.env.ODDBORO_HOME = join(HOME, '.oddboro');
process.env.ODDBORO_CODE = join(HOME, 'code', 'oddboro');
process.env.OLLAMA_URL = 'http://127.0.0.1:9';
after(() => rmSync(HOME, { recursive: true, force: true }));
const O = await import('../src/office.ts');

/** Makes a folder under the test's home, and gives back its path. */
function folder(...parts: string[]): string {
  const p = join(HOME, ...parts);
  mkdirSync(p, { recursive: true });
  return p;
}

// Every await comes before the first test: the database closes once the tests end.
await db.insert(staff).values({
  id: 'ziva',
  name: 'Ziva',
  role: 'r',
  variant: 'v',
  portrait: 'p',
  remit: 'r',
  desk: 'd'
});

beforeEach(async () => {
  await sql`delete from ledger`;
});

test('commandsHow per tool and system', () => {
  const want: Record<Agent, Record<'darwin' | 'linux' | 'win32', string>> = {
    claude: { darwin: 'switch', linux: 'never', win32: 'never' },
    codex: { darwin: 'always', linux: 'always', win32: 'always' },
    grok: { darwin: 'never', linux: 'never', win32: 'never' },
    gemini: { darwin: 'never', linux: 'never', win32: 'never' }
  };
  for (const agent of AGENTS)
    for (const platform of ['darwin', 'linux', 'win32'] as const) {
      const how = commandsHow(agent, platform);
      assert.equal(how.state, want[agent][platform], `${agent} on ${platform}`);
      assert.equal(
        'why' in how ? how.why : undefined,
        how.state === 'switch' ? undefined : COMMANDS_WHY[agent]
      );
    }
  assert.deepEqual(COMMANDS_WHY, {
    claude: 'Not tested on this system yet.',
    codex: 'Codex reads files through its commands.',
    grok: "Grok can't keep commands off the network on a Mac.",
    gemini: 'Not tested with Gemini yet.'
  });
});

const titles = async () =>
  (await sql<{ title: string }>`select title from ledger order by id`).map((r) => r.title);

test('setOwnTool and setFolder record one line each', async () => {
  await O.setOwnTool('ziva', 'commands', true);
  await O.setOwnTool('ziva', 'commands', true);
  await O.setOwnTool('ziva', 'commands', false);
  await O.setOwnTool('ziva', 'web', true);
  await O.setOwnTool('ziva', 'web', true);
  await O.setOwnTool('ziva', 'web', false);
  const game = folder('Documents', 'GitHub', 'my-game');
  await O.setFolder('ziva', game, 'read');
  await O.setFolder('ziva', game, 'read');
  await O.setFolder('ziva', game, 'write');
  assert.deepEqual((await O.staffer('ziva'))?.folders, [{ path: game, write: true }]);
  await O.setFolder('ziva', game, null);
  await O.setFolder('ziva', game, null);
  assert.deepEqual(await titles(), [
    'Let Ziva run commands',
    'Stopped Ziva running commands',
    'Let Ziva browse the web',
    'Stopped Ziva browsing the web',
    'Let Ziva read ~/Documents/GitHub/my-game',
    'Let Ziva read and change ~/Documents/GitHub/my-game',
    'Took ~/Documents/GitHub/my-game from Ziva'
  ]);
  const row = await O.staffer('ziva');
  assert.deepEqual([row?.commands, row?.web, row?.folders], [false, false, []]);
});

test('checkFolder refuses what holds keys, the home, the office and its code', () => {
  const R = O.FOLDER_REFUSED;
  assert.deepEqual(R, {
    missing: 'No such folder.',
    home: 'Pick a folder inside your home, not the whole home.',
    secrets: 'That folder holds your keys or sign-ins.',
    code: "That folder holds Oddboro's own code."
  });
  const refused = (path: string) => O.checkFolder(path);
  for (const s of O.SECRET_STORES) folder(s);
  folder('.ssh', 'keys');
  folder('.oddboro', 'staff');
  folder('code', 'oddboro', 'apps');
  writeFileSync(join(HOME, 'notes.txt'), 'x');

  assert.deepEqual(refused('~/nowhere'), { refused: R.missing });
  assert.deepEqual(refused('~/notes.txt'), { refused: R.missing });
  assert.deepEqual(refused('relative/path'), { refused: R.missing });
  assert.deepEqual(refused('~'), { refused: R.home });
  assert.deepEqual(refused(HOME), { refused: R.home });
  assert.deepEqual(refused(tmpdir()), { refused: R.home });
  for (const s of O.SECRET_STORES) assert.deepEqual(refused(`~/${s}`), { refused: R.secrets }, s);
  assert.deepEqual(refused('~/.ssh/keys'), { refused: R.secrets });
  assert.deepEqual(refused('~/.oddboro/staff'), { refused: R.secrets });
  assert.deepEqual(refused('~/code'), { refused: R.code });
  assert.deepEqual(refused('~/code/oddboro/apps'), { refused: R.code });

  // A name that only starts like a secret store is not one.
  const sshx = folder('.sshx');
  assert.deepEqual(refused('~/.sshx'), { real: sshx });
  assert.deepEqual(refused(' ~/.sshx/ '), { real: sshx });
});

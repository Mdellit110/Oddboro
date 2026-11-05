// Run commands, Browse the web and folders the owner gives an Odd: which tool
// follows the switch, what each owner change records, and which folders are
// refused at the door. Run with `npm test -w @oddboro/ledger`.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
  // The glob line names its character: the next test reads it.
  const { glob: _glob, ...fixed } = R;
  assert.deepEqual(fixed, {
    missing: 'No such folder.',
    home: 'Pick a folder inside your home, not the whole home.',
    secrets: 'That folder holds your keys or sign-ins.',
    code: "That folder holds Oddboro's own code.",
    nested: 'That folder is inside one this Odd already has, or holds one.'
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

test('checkFolder refuses a folder whose real path holds a character Codex reads as a glob, naming it, and takes { and }', () => {
  const R = O.FOLDER_REFUSED;
  assert.equal(R.glob('['), "That folder's path has a character an Odd's tool can't take: [");
  folder('Photos [2024]');
  assert.deepEqual(O.checkFolder('~/Photos [2024]'), { refused: R.glob('[') });
  folder('a*b', 'inner');
  assert.deepEqual(O.checkFolder('~/a*b/inner'), { refused: R.glob('*') });
  const braces = folder('x{y}');
  assert.deepEqual(O.checkFolder('~/x{y}'), { real: braces });
  // A typed path with no such character, whose real path has one.
  symlinkSync(folder('pics [old]'), join(HOME, 'pics'));
  assert.deepEqual(O.checkFolder('~/pics'), { refused: R.glob('[') });
});

test('the secret stores are the ones the office keeps shut', () => {
  assert.deepEqual(O.SECRET_STORES, [
    '.ssh',
    '.aws',
    '.gnupg',
    '.config',
    'Library',
    'AppData',
    '.claude',
    '.claude.json',
    '.google_workspace_mcp',
    '.grok',
    '.codex',
    '.gemini'
  ]);
});

test(
  'on a Mac, checkFolder refuses a secret store or the office typed in another case',
  { skip: process.platform !== 'darwin' && "only a Mac's disk ignores case" },
  () => {
    folder('.ssh');
    folder('.claude');
    folder('.oddboro');
    folder('Library', 'Keychains');
    for (const typed of ['~/.SSH', '~/LIBRARY', '~/library/Keychains', '~/.CLAUDE', '~/.Oddboro'])
      assert.deepEqual(O.checkFolder(typed), { refused: O.FOLDER_REFUSED.secrets }, typed);
  }
);

test('checkFolder refuses a link into a secret store, and a folder holding where one leads', () => {
  folder('.ssh');
  symlinkSync(join(HOME, '.ssh'), join(HOME, 'x'));
  assert.deepEqual(O.checkFolder('~/x'), { refused: O.FOLDER_REFUSED.secrets });
  // A secret store that is itself a link, as a dotfiles folder makes one.
  rmSync(join(HOME, '.gnupg'), { recursive: true, force: true });
  symlinkSync(folder('dots', 'gnupg'), join(HOME, '.gnupg'));
  assert.deepEqual(O.checkFolder('~/dots'), { refused: O.FOLDER_REFUSED.secrets });
  // A folder that only holds a `.ssh` of its own is not a secret store.
  const project = folder('project');
  folder('project', '.ssh');
  assert.deepEqual(O.checkFolder('~/project'), { real: project });
});

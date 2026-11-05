// What the owner's Run commands, Browse the web and the folders they give an
// Odd reach in a run as the office starts it, on each tool, in an office under
// test (office-under-test.ts), and the staff route that sets them: the
// arguments and environment each tool gets, Claude Code's sandbox for
// commands, and what the Odd is told. Run with `npm test -w @oddboro/office`.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { test } from 'node:test';
import {
  L,
  PATCH,
  awayFromHome,
  chatOf,
  folder,
  gave,
  odd,
  onPlatform,
  ownerData,
  runOf,
  writeRule,
  type Gave
} from './office-under-test.ts';

// After the office under test set its home, as the office's own imports are.
const { deniedEdits } = await import('./files.ts');

await L.pg`insert into staff ${L.pg([
  odd('otto', 'Otto'),
  odd('wes', 'Wes'),
  odd('fern', 'Fern'),
  odd('cal', 'Cal'),
  { ...odd('gwen', 'Gwen'), agent: 'grok' },
  { ...odd('cato', 'Cato'), agent: 'codex' },
  { ...odd('gem', 'Gem'), agent: 'gemini' }
])}`;

/** Run commands is on only on a Mac (`commandsHow`), where Claude Code's sandbox was measured. */
const onMac = { skip: process.platform !== 'darwin' && 'Run commands runs on a Mac only' };
const staffDir = (id: string) => join(folder, 'staff', id);

/** An Odd's switches and folders as the owner left them; anything not named is off. */
async function setOwn(
  id: string,
  o: { commands?: boolean; web?: boolean; folders?: { path: string; write: boolean }[] }
): Promise<void> {
  await L.pg`
    update staff set commands = ${o.commands ?? false}, web = ${o.web ?? false},
      folders = ${JSON.stringify(o.folders ?? [])}::jsonb where id = ${id}`;
}
/** A folder outside the office made now, by its real path, as `checkFolder` stores one. */
function made(...parts: string[]): string {
  const p = join(folder, 'given', ...parts);
  mkdirSync(p, { recursive: true });
  return realpathSync(p);
}
/** The value after `flag`. */
const after = (args: string[], flag: string) => args[args.indexOf(flag) + 1];
/** Every value given with `flag`, which may come more than once. */
const each = (args: string[], flag: string) => args.filter((_, i) => args[i - 1] === flag);
/** The values after `flag`, up to the next flag. */
function listAfter(args: string[], flag: string): string[] {
  const from = args.indexOf(flag) + 1;
  const end = args.findIndex((a, i) => i >= from && a.startsWith('--'));
  return args.slice(from, end);
}
type Sandbox = {
  filesystem: { denyRead: string[]; allowRead: string[]; denyWrite: string[] };
  [k: string]: unknown;
};
const settingsOf = (run: Gave) =>
  JSON.parse(after(run.args, '--settings')) as { sandbox?: Sandbox; enabledPlugins: unknown };
/** The owner's PATCH of an Odd from its card. */
const patch = (id: string, body: unknown) =>
  PATCH({
    params: { id },
    request: new Request(`http://office/api/staff/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body)
    })
  } as unknown as Parameters<typeof PATCH>[0]);
/** What the route said when it refused a PATCH. */
async function refusal(
  body: ReturnType<typeof patch>
): Promise<{ status: number; message: string }> {
  try {
    await body;
  } catch (e) {
    const h = e as { status: number; body: { message: string } };
    return { status: h.status, message: h.body.message };
  }
  assert.fail('the route took it');
}
/** Whether the ledger holds a line with this title. */
const recorded = async (title: string) =>
  (await L.pg`select 1 from ledger where title = ${title}`).length === 1;

test('a Claude run with Run commands gets Bash in its sandbox', onMac, async () => {
  assert.ok(!existsSync(ownerData), 'this office has a data folder, which the sandbox would read');
  await setOwn('otto', { commands: true });
  const run = await chatOf('otto');
  assert.equal(after(run.args, '--tools'), 'Read,Glob,Grep,Write,Edit,Bash');
  assert.ok(listAfter(run.args, '--allowedTools').includes('Bash'));
  const tmp = `/private/tmp/ob-${run.env.RUN_KEY.slice(0, 8)}`;
  assert.match(run.tmpdir ?? '', /^\/private\/tmp\/ob-[0-9a-f]{8}$/);
  assert.equal(run.tmpdir, tmp);
  assert.equal(run.gitConfig, '/dev/null');
  assert.equal(run.nodeOptions, null, "the office's node options reached the run");
  assert.ok(!existsSync(tmp), "the commands' temp folder outlived the run");
  const dir = staffDir('otto');
  const sandbox = settingsOf(run).sandbox;
  // Claude Code names the sessions folder after the Odd's folder, which differs from Mac to Mac.
  const sessions = sandbox?.filesystem.allowRead.find((p) => p.includes('/.claude/projects/'));
  assert.equal(dirname(sessions ?? ''), join(homedir(), '.claude', 'projects'));
  const node = dirname(dirname(process.execPath));
  assert.deepEqual(sandbox, {
    enabled: true,
    failIfUnavailable: true,
    allowUnsandboxedCommands: false,
    filesystem: {
      denyRead: ['~/', '/private/tmp', '/tmp', '/private/var/folders'],
      // No data folder: there is none to read.
      allowRead: [dir, sessions, tmp, ...(node.startsWith(homedir() + sep) ? [node] : [])],
      denyWrite: deniedEdits(dir, [dir])
    },
    network: { allowedDomains: [] }
  });
});

test('a Claude run with Browse the web gets WebSearch and WebFetch', async () => {
  await setOwn('wes', { web: true });
  const run = await chatOf('wes');
  assert.equal(after(run.args, '--tools'), 'Read,Glob,Grep,Write,Edit,WebSearch,WebFetch');
  const allowed = listAfter(run.args, '--allowedTools');
  assert.ok(allowed.includes('WebSearch') && allowed.includes('WebFetch'), allowed.join(' '));
  assert.ok(!allowed.includes('Bash'));
  assert.equal(settingsOf(run).sandbox, undefined);
  assert.equal(run.tmpdir, null);
});

test('Grok gets the web but never a shell', async () => {
  // A stored yes, as one moved from Claude Code would keep it.
  await setOwn('gwen', { commands: true });
  const off = await chatOf('gwen');
  assert.equal(after(off.args, '--tools'), 'read_file,list_dir,grep,write,search_replace');
  // Off in every grok the office starts (`grokEnv`).
  assert.equal(off.grokEnv?.GROK_WEB_FETCH, '0');
  assert.ok(off.system.includes('no shell and no web'), off.system);
  await setOwn('gwen', { commands: true, web: true });
  const on = await chatOf('gwen');
  assert.equal(
    after(on.args, '--tools'),
    'read_file,list_dir,grep,write,search_replace,web_search,web_fetch'
  );
  assert.equal(on.grokEnv?.GROK_WEB_FETCH, '1');
});

test('the system prompt says what the Odd reaches', async () => {
  const owner = await L.ownerName();
  const w = made('reach');
  await setOwn('fern', { web: true, folders: [{ path: w, write: true }] });
  const { system } = await chatOf('fern');
  assert.ok(
    system.includes(
      `You write files only in your folder, on work you share with colleagues in your part of its folder, and in the folders ${owner} gave you to change.`
    ),
    system
  );
  assert.ok(system.includes('Your own tools work on files, plus web search and fetch. No shell.'));
  assert.ok(
    system.includes(
      `Beyond the office, you reach only the outside tools below, the web and the folders ${owner} gave you.`
    ),
    system
  );
});

test('Run commands refuses a tool that cannot hold it, and survives a tool switch', async () => {
  for (const id of ['gwen', 'cato'] as const) {
    await setOwn(id, {});
    const agent = id === 'gwen' ? 'grok' : 'codex';
    assert.deepEqual(await refusal(patch(id, { commands: true })), {
      status: 400,
      message: L.COMMANDS_WHY[agent]
    });
    assert.equal((await L.staffer(id))?.commands, false);
  }
  await setOwn('cal', {});
  await onPlatform('darwin', async () => {
    assert.equal((await patch('cal', { commands: true })).status, 200);
    assert.equal((await L.staffer('cal'))?.commands, true);
    assert.ok(await recorded('Let Cal run commands'));
    await patch('cal', { agent: 'codex' });
    await patch('cal', { agent: 'claude' });
  });
  const cal = await L.staffer('cal');
  assert.equal(cal?.agent, 'claude');
  assert.equal(cal?.commands, true, "a tool switch dropped the owner's Run commands");
});

test('a granted folder reaches every tool at its level', async () => {
  const r = made('level', 'read');
  const w = made('level', 'write');
  const folders = [
    { path: r, write: false },
    { path: w, write: true }
  ];
  for (const id of ['fern', 'gwen', 'cato', 'gem']) await setOwn(id, { folders });

  const claude = await chatOf('fern');
  const allowed = listAfter(claude.args, '--allowedTools');
  const denied = listAfter(claude.args, '--disallowedTools');
  const rule = (tool: string, p: string) => `${tool}(${L.rulePath(p)})`;
  assert.ok(allowed.includes(rule('Read', `${r}/**`)) && allowed.includes(rule('Read', `${w}/**`)));
  assert.ok(allowed.includes(rule('Edit', `${w}/**`)));
  assert.ok(!allowed.includes(rule('Edit', `${r}/**`)), 'a read-only folder is writable');
  assert.ok(denied.includes(rule('Edit', `${w}/CLAUDE.md`)));
  assert.ok(!denied.some((d) => d.includes(r)), 'a read-only folder is denied a read');
  const dirs = each(claude.args, '--add-dir');
  assert.ok(dirs.includes(r) && dirs.includes(w), dirs.join(' '));

  const codex = (await chatOf('cato')).permissions?.filesystem ?? {};
  assert.equal(codex[r], 'read');
  assert.equal(codex[w], 'write');

  const grok = await chatOf('gwen');
  const grokAllows = each(grok.args, '--allow');
  assert.ok(grokAllows.includes(`Edit(${w}/**)`) && grokAllows.includes(`Write(${w}/**)`));
  assert.ok(!grokAllows.some((a) => a.includes(r)), 'a read-only folder is writable');
  const line = (key: string) =>
    JSON.parse(
      (grok.profile ?? '')
        .split('\n')
        .find((l) => l.startsWith(`${key} = `))
        ?.slice(key.length + 3) ?? '[]'
    ) as string[];
  assert.ok(line('read_only').includes(r) && line('read_only').includes(w), grok.profile);
  assert.ok(line('read_write').includes(w) && !line('read_write').includes(r), grok.profile);

  const gemini = await chatOf('gem');
  const included = each(gemini.args, '--include-directories');
  assert.ok(included.includes(r) && included.includes(w), included.join(' '));
  const policy = gemini.policy ?? '';
  assert.ok(writeRule(policy, 'allow', join(w, 'notes.md')));
  assert.ok(!writeRule(policy, 'allow', join(r, 'notes.md')), 'a read-only folder is writable');
  assert.ok(writeRule(policy, 'deny', join(w, 'GEMINI.md')));
});

test('the Odd is told the folders it was given', async () => {
  const owner = await L.ownerName();
  const r = made('told', 'read');
  const w = made('told', 'write');
  await setOwn('fern', {
    folders: [
      { path: r, write: false },
      { path: w, write: true }
    ]
  });
  const { system } = await chatOf('fern');
  assert.ok(
    system.includes(
      `- Folders ${owner} gave you:\n  - ${r} (read only)\n  - ${w} (read and change)\n`
    ),
    system
  );
});

test('a folder that was deleted can still be removed, and reaches no run', async () => {
  const gone = made('gone');
  await setOwn('fern', { folders: [{ path: gone, write: true }] });
  rmSync(gone, { recursive: true });
  const run = await chatOf('fern');
  assert.ok(!each(run.args, '--add-dir').includes(gone), 'a deleted folder was added');
  assert.ok(!run.args.some((a) => a.includes(gone)), 'a deleted folder reached the run');
  assert.ok(!run.system.includes(gone), 'the Odd was told of a deleted folder');
  assert.equal((await patch('fern', { folder: gone, access: null })).status, 200);
  assert.deepEqual((await L.staffer('fern'))?.folders, []);
  assert.ok(await recorded(`Took ${L.shownFolder(gone)} from Fern`));
});

test('the folder route says each refusal and records each change', async () => {
  await setOwn('wes', {});
  await awayFromHome(async (home) => {
    mkdirSync(join(home, '.ssh'));
    assert.deepEqual(await refusal(patch('wes', { folder: '~/.ssh', access: 'read' })), {
      status: 400,
      message: L.FOLDER_REFUSED.secrets
    });
    assert.deepEqual(await refusal(patch('wes', { folder: '~/nowhere', access: 'read' })), {
      status: 400,
      message: L.FOLDER_REFUSED.missing
    });
    assert.deepEqual(await refusal(patch('wes', { folder: '~', access: 'write' })), {
      status: 400,
      message: L.FOLDER_REFUSED.home
    });
    assert.deepEqual(await refusal(patch('wes', { folder: '~', access: 'all' })), {
      status: 400,
      message: 'Pick read or write'
    });
    assert.deepEqual((await L.staffer('wes'))?.folders, []);
    assert.equal((await patch('wes', { web: true })).status, 200);
    assert.equal((await L.staffer('wes'))?.web, true);
    assert.ok(await recorded('Let Wes browse the web'));
  });
});

test("with Run commands, Bash can write only the run's write folders", onMac, async () => {
  const madeData = !existsSync(ownerData);
  mkdirSync(ownerData, { recursive: true });
  try {
    const p = made('bash', 'p');
    const sub = made('bash', 'p', 'sub');
    await setOwn('otto', {
      commands: true,
      folders: [
        { path: p, write: false },
        { path: sub, write: true }
      ]
    });
    const dir = staffDir('otto');

    const h = await gave('lead', 'otto', { title: 'Sort the shelf' });
    const onThread = await runOf(h.id);
    const thread = L.threadFolder(h.thread);
    const part = join(thread, 'otto');
    assert.deepEqual(each(onThread.args, '--add-dir'), [ownerData, part, sub]);
    const denyWrite = settingsOf(onThread).sandbox?.filesystem.denyWrite ?? [];
    assert.deepEqual(denyWrite, [ownerData, ...deniedEdits(dir, [dir, part, sub])]);
    for (const open of [thread, p, '/private/tmp'])
      assert.ok(!denyWrite.includes(open), `${open} is denied a write, which beats every allow`);

    mkdirSync(join(dir, 'notes'), { recursive: true });
    writeFileSync(join(dir, 'notes', 'plan.md'), 'The owner wrote this.');
    assert.ok(
      await L.learnFromEdit('otto', { path: 'notes/plan.md', before: 'Otto wrote this.' }, 'x')
    );
    const [f] = await L.pg<{ id: number }[]>`
      select id from follow_ups where staff_id = 'otto' and kind = 'edited' and outcome is null`;
    const edited = await runOf(f.id);
    assert.ok(
      settingsOf(edited).sandbox?.filesystem.denyWrite.includes(join(dir, 'notes', 'plan.md')),
      'the edited file is writable by Bash'
    );
  } finally {
    if (madeData) rmSync(ownerData, { recursive: true, force: true });
  }
});

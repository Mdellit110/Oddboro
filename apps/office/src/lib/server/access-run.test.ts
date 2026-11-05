// What an Odd's own tools reach in a run, in an office under test
// (office-under-test.ts): which launch holds a shell, whether commands reach
// the internet and what happens when Claude Code refuses that, which of the
// owner's developer tool folders commands may read, and that the run, its
// prompt and its my_access read one profile. Run with
// `npm test -w @oddboro/office`.
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  chat,
  chatOf,
  folder,
  gave,
  L,
  odd,
  onPlatform,
  ownerHome,
  runOf,
  setOwn,
  withEnv,
  type Gave
} from './office-under-test.ts';

const { LAUNCHES } = await import('./cli.ts');
const { DEV_FOLDERS, DEV_SECRETS, LOOPBACK, networkHeld, resetHeldNetwork } =
  await import('./sandbox.ts');
const { shellEnv } = await import('./launch.ts');
const { runJob } = await import('./staff.ts');

await L.pg`insert into staff ${L.pg([
  odd('ava', 'Ava'),
  odd('bo', 'Bo'),
  odd('cy', 'Cy'),
  odd('dee', 'Dee'),
  odd('eli', 'Eli'),
  { ...odd('kit', 'Kit'), agent: 'grok' },
  { ...odd('cole', 'Cole'), agent: 'codex' }
])}`;

/** Run commands is on only on a Mac (`commandsHow`), where Claude Code's sandbox was measured. */
const onMac = { skip: process.platform !== 'darwin' && 'Run commands runs on a Mac only' };

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
  network: { allowedDomains: string[]; deniedDomains?: string[] };
  credentials: { envVars: { name: string; mode: string }[] };
};
const sandboxOf = (run: Gave) =>
  (JSON.parse(after(run.args, '--settings')) as { sandbox?: Sandbox }).sandbox;
/** The run's temp folder, where Run commands puts its commands' own files. */
const tmpOf = (run: Gave) => `/private/tmp/ob-${run.env.RUN_KEY.slice(0, 8)}`;
/** The paths of a Claude Code run's Read allows, in order. */
const readAllows = (run: Gave) =>
  listAfter(run.args, '--allowedTools')
    .filter((a) => a.startsWith('Read(/'))
    .map((a) => a.slice('Read(/'.length, -'/**)'.length));

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
test("each tool's launch gives a shell exactly when commandsHow says, on every system, and refuses a run it cannot hold", async () => {
  // Every Odd here has Run commands stored on, so only its tool decides.
  for (const [id, agent] of [
    ['bo', 'claude'],
    ['kit', 'grok'],
    ['cole', 'codex']
  ] as const) {
    await setOwn(id, { commands: true });
    for (const platform of ['darwin', 'linux', 'win32'] as const) {
      if (!L.AGENT_PLATFORMS[agent].runs.includes(platform)) continue;
      const run = await onPlatform(platform, () => chatOf(id));
      const shell = L.runsCommands(agent, platform, true);
      const tools = after(run.args, '--tools');
      if (agent === 'claude')
        assert.equal(tools.split(',').includes('Bash'), shell, `${agent} on ${platform}`);
      // Grok's five file tools, never a shell.
      if (agent === 'grok') assert.equal(tools, 'read_file,list_dir,grep,write,search_replace');
      // Codex reads files through its shell, held by its permission profile.
      if (agent === 'codex') assert.ok(shell && run.permissions, `${agent} on ${platform}`);
    }
  }
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

test(
  "a handed-over run keeps the Odd's own Run commands, Browse the web and given folders; only its outside tools come down to Draft",
  onMac,
  async () => {
    await L.addConnector({
      id: 'notes',
      name: 'Notes',
      description: 'Notes for tests.',
      kind: 'http',
      config: { url: 'http://127.0.0.1:9/mcp' },
      readTools: ['read_note'],
      tools: ['read_note', 'write_note'],
      readyAt: new Date()
    });
    await L.pg`insert into grants (staff_id, connector_id, level) values ('ava', 'notes', 'act')`;
    const w = made('handed', 'write');
    await setOwn('ava', { commands: true, web: true, folders: [{ path: w, write: true }] });
    const h = await gave('lead', 'ava', { title: 'Handed over' });
    const run = await runOf(h.id);
    assert.equal(after(run.args, '--tools'), 'Read,Glob,Grep,Write,Edit,Bash,WebSearch,WebFetch');
    assert.ok(sandboxOf(run), 'the handed-over run lost its sandbox');
    const allowed = listAfter(run.args, '--allowedTools');
    assert.ok(allowed.includes(`Edit(${L.rulePath(w)}/**)`), allowed.join(' '));
    assert.equal(run.env.CEILING, 'draft');
    assert.ok(allowed.includes('mcp__notes__read_note'), allowed.join(' '));
    assert.ok(!allowed.some((a) => a === 'mcp__notes' || a === 'mcp__notes__write_note'));
  }
);

test(
  "Claude's commands reach the internet only with Browse the web on, and never the office's five loopback names",
  onMac,
  async () => {
    await setOwn('bo', { commands: true, web: true });
    assert.deepEqual(sandboxOf(await chatOf('bo'))?.network, {
      allowedDomains: ['*'],
      deniedDomains: ['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']
    });
    // Closed, the network keeps its exact settings: no deny list beside it.
    await setOwn('bo', { commands: true });
    assert.deepEqual(sandboxOf(await chatOf('bo'))?.network, { allowedDomains: [] });
  }
);

test(
  'a Claude Code that refuses the open network fails that run in plain words, and later runs keep commands off the internet and say so',
  onMac,
  async () => {
    const owner = await L.ownerName();
    const title = "Kept Odds' commands off the internet";
    await setOwn('cy', { commands: true, web: true });
    await setOwn('eli', { commands: true, web: true });
    try {
      // Two runs refused at once, both started before either ended.
      const release = join(folder, 'release-refusals');
      const errors: Record<string, string> = {};
      const refused = ['cy', 'eli'].map((id) =>
        chat(id, `Hold until ${release} exists. Refuse the open network.`, (e) => {
          if (e.type === 'error') errors[id] = e.message;
        })
      );
      for (let i = 0; L.runsGoing.size < 2; i++) {
        assert.ok(i < 500, 'both runs never started');
        await new Promise((r) => setTimeout(r, 10));
      }
      writeFileSync(release, '');
      await Promise.all(refused);
      // The owner sent each message, and the chat dropped it, so they send it again.
      assert.deepEqual(errors, {
        cy: "This version of Claude Code will not let commands reach the internet, so Cy's commands now run with no network. Send your message again.",
        eli: "This version of Claude Code will not let commands reach the internet, so Eli's commands now run with no network. Send your message again."
      });
      // The Ledger line is written after the run ends, without holding it up.
      // The hold lives in memory, so a restart lifts it, and the line says so.
      let lines: { actor: string; body: string }[] = [];
      for (let i = 0; i < 100 && !lines.length; i++) {
        lines = await L.pg<
          { actor: string; body: string }[]
        >`select actor, body from ledger where title = ${title}`;
        if (!lines.length) await new Promise((r) => setTimeout(r, 20));
      }
      assert.deepEqual(
        lines.map((l) => ({ ...l })),
        [
          {
            actor: 'office',
            body: 'This version of Claude Code refuses to let commands reach the whole internet. Commands keep working, with no network. Restarting the office lifts this.'
          }
        ]
      );
      const next = await chatOf('cy', 'Refuse the open network.');
      assert.deepEqual(sandboxOf(next)?.network, { allowedDomains: [] });
      assert.equal(next.env.NETWORK_HELD, '1');
      assert.ok(next.system.includes(L.NETWORK_HELD_LINE), next.system);
      // The prompt and my_access say the same of the held network.
      const told = L.accessInRun(await L.capabilities((await L.staffer('cy'))!), owner, next.env);
      assert.ok(told.includes(L.NETWORK_HELD_LINE), told);
      const tools = told.split('\n').find((l) => l.startsWith('Your own tools'));
      assert.ok(tools && next.system.includes(tools), `${tools}\n${next.system}`);
      assert.equal(
        (await L.pg`select 1 from ledger where title = ${title}`).length,
        1,
        'a held network was recorded twice'
      );
      // An Odd with commands and no web lost no network to the hold, so is told nothing of it.
      await setOwn('eli', { commands: true });
      const offline = await chatOf('eli');
      assert.equal(offline.env.NETWORK_HELD, undefined);
      assert.ok(!offline.system.includes(L.NETWORK_HELD_LINE), offline.system);
    } finally {
      resetHeldNetwork();
    }
  }
);

test(
  'a refused job run says it stopped and is not tried again, never to send a message the owner never sent',
  onMac,
  async () => {
    await setOwn('dee', { commands: true, web: true });
    const job = await L.addJob({
      staffId: 'dee',
      name: 'Count the chairs',
      instructions: 'Refuse the open network.',
      schedule: { every: 'day', at: '07:00' }
    });
    try {
      const r = await runJob(job, 'manual');
      assert.deepEqual(r, {
        ok: false,
        text: "This version of Claude Code will not let commands reach the internet, so Dee's commands now run with no network. This run stopped and is not tried again."
      });
    } finally {
      resetHeldNetwork();
    }
  }
);

test(
  "a run with its network closed that fails with Claude Code's refusal words keeps its own words and holds no network",
  onMac,
  async () => {
    // A Claude Code that fails every run with the refusal words. The network
    // was never opened, so they cannot be a refusal of it.
    const bin = join(folder, 'refusal-words-bin');
    mkdirSync(bin, { recursive: true });
    const claude = join(bin, 'claude');
    writeFileSync(
      claude,
      `#!/usr/bin/env node
process.stdin.resume();
process.stdin.on('end', () => {
  process.stderr.write('Overly broad patterns like "*" are not allowed\\n');
  process.exit(1);
});
`
    );
    chmodSync(claude, 0o755);
    await setOwn('eli', { commands: true });
    try {
      const errors: string[] = [];
      await withEnv({ PATH: `${bin}:${process.env.PATH}` }, () =>
        chat('eli', 'Hello.', (e) => {
          if (e.type === 'error') errors.push(e.message);
        })
      );
      assert.deepEqual(errors, [
        'Claude Code stopped (exit 1). Overly broad patterns like "*" are not allowed'
      ]);
      assert.equal(networkHeld(), false);
    } finally {
      // A run held by mistake would hold every later test's network.
      resetHeldNetwork();
    }
  }
);

test(
  "a run that succeeds and quotes Claude Code's refusal words keeps the network open",
  onMac,
  async () => {
    await setOwn('eli', { commands: true, web: true });
    const quoted = await chatOf('eli', 'It said: Overly broad patterns like "*" are not allowed.');
    assert.ok(quoted.message.includes('Overly broad patterns'), quoted.message);
    assert.equal(networkHeld(), false);
    assert.deepEqual(sandboxOf(await chatOf('eli'))?.network?.allowedDomains, ['*']);
  }
);

test(
  "with Run commands, Claude reads the owner's developer tool folders that exist, never their credential files, and npm caches in the run's temp",
  onMac,
  () =>
    ownerHome(async (home) => {
      const h = realpathSync(home);
      const at = (...p: string[]) => join(h, ...p);
      for (const d of [
        '.npm',
        '.cargo',
        '.local/bin',
        '.local/share/x/bin',
        '.config/y',
        '.local/share/z[1]/bin'
      ])
        mkdirSync(at(d), { recursive: true });
      for (const [name, target] of [
        ['x', at('.local/share/x/bin/x')],
        ['y', at('.config/y/y')],
        ['z', at('.local/share/z[1]/bin/z')]
      ]) {
        writeFileSync(target, '');
        symlinkSync(target, at('.local/bin', name));
      }
      await setOwn('dee', { commands: true });
      const run = await chatOf('dee');
      const fs = sandboxOf(run)?.filesystem;
      for (const read of [at('.npm'), at('.cargo'), at('.local/bin'), at('.local/share/x/bin')])
        assert.ok(fs?.allowRead.includes(read), `${read} is not read`);
      for (const shut of [at('.config/y'), at('.local/share/z[1]/bin'), at('.pyenv')])
        assert.ok(!fs?.allowRead.some((p) => p.startsWith(shut)), `${shut} is read`);
      assert.ok(fs?.denyRead.includes(at('.cargo', 'credentials')));
      assert.ok(fs?.denyRead.includes(at('.cargo', 'credentials.toml')));
      const tmp = tmpOf(run);
      assert.deepEqual(run.npm, {
        npm_config_cache: join(tmp, 'npm'),
        npm_config_userconfig: join(tmp, 'npmrc')
      });
      // Only commands read them: the file tools' Read allows name none.
      assert.ok(!readAllows(run).some((p) => p.startsWith(h)), readAllows(run).join(' '));
    })
);

test(
  "the Odd's prompt and its my_access say the same about its own tools and the tool its runs go through",
  onMac,
  async () => {
    const owner = await L.ownerName();
    await setOwn('dee', {
      commands: true,
      web: true,
      folders: [
        { path: made('same', 'read'), write: false },
        { path: made('same', 'write'), write: true }
      ]
    });
    const run = await chatOf('dee');
    const dee = (await L.staffer('dee'))!;
    const told = L.accessInRun(await L.capabilities(dee), owner, run.env);
    const lines = told.split('\n');
    const runsOn = L.runsOnLine(dee.agent);
    assert.ok(lines.includes(runsOn), told);
    assert.ok(run.system.includes(`- ${runsOn}\n`), `${runsOn}\n${run.system}`);
    const tools = lines.find((l) => l.startsWith('Your own tools'));
    assert.ok(tools && run.system.includes(tools), `${tools}\n${run.system}`);
    const folders = lines.slice(lines.indexOf(`Folders ${owner} gave you:`) + 1, -1);
    assert.equal(folders.length, 2, told);
    for (const l of folders) assert.ok(run.system.includes(`  ${l}\n`), `${l}\n${run.system}`);
  }
);

test("a chat's replay walks the given write folders the profile lists", async () => {
  const gone = made('replay', 'gone');
  await setOwn('ava', { folders: [{ path: gone, write: true }] });
  await chatOf('ava');
  rmSync(gone, { recursive: true });
  // A file the Odd's own folder gained since, which the replay names.
  const notes = join(folder, 'staff', 'ava', 'notes');
  mkdirSync(notes, { recursive: true });
  writeFileSync(join(notes, 'since.md'), 'New.');
  // The stand-in keeps no session, so each chat starts a new one, with the replay.
  const { message } = await chatOf('ava');
  assert.ok(message.includes('(Files in your folder that changed during it: '), message);
  assert.ok(!message.includes('in your folder and the folders'), message);
});

test(
  "every tool reads one list: what a Codex run reads is what a Claude run reads, less its own folder and Claude Code's sessions folder",
  onMac,
  () =>
    ownerHome(async () => {
      const r = made('one-list', 'read');
      await setOwn('bo', { folders: [{ path: r, write: false }] });
      const onClaude = await runOf((await gave('lead', 'bo', { title: 'On Claude' })).id);
      const claudeThread = L.threadFolder(
        (
          await L.pg<{ id: number }[]>`
      select id from threads where title = 'On Claude'`
        )[0].id
      );
      const dir = join(folder, 'staff', 'bo');
      const sessions = join(homedir(), '.claude', 'projects', dir.replace(/[^a-zA-Z0-9]/g, '-'));
      const claude = readAllows(onClaude)
        .filter((p) => p !== dir && p !== sessions)
        .map((p) => (p === claudeThread ? '<thread>' : p));
      await L.pg`update staff set agent = 'codex' where id = 'bo'`;
      try {
        const h = await gave('lead', 'bo', { title: 'On Codex' });
        const onCodex = await runOf(h.id);
        const fs = Object.entries(onCodex.permissions?.filesystem ?? {});
        // The run's reads come after node's OpenSSL config; this empty home has no developer tool folders.
        const from = fs.findIndex(([p]) => p.endsWith('/openssl.cnf')) + 1;
        const codex = fs
          .slice(from)
          .filter(([, v]) => v === 'read')
          .map(([p]) => (p === L.threadFolder(h.thread) ? '<thread>' : p));
        assert.deepEqual(codex, claude);
        assert.equal(claude.length, 3, claude.join(' '));
      } finally {
        await L.pg`update staff set agent = 'claude' where id = 'bo'`;
      }
    })
);

test(
  "with Run commands and Browse the web both on, the office's secrets stay hidden from commands that reach the internet",
  onMac,
  () =>
    withEnv({ FAKE_OWNER_API_TOKEN: 'x' }, async () => {
      await setOwn('bo', { commands: true, web: true });
      const sandbox = sandboxOf(await chatOf('bo'));
      assert.deepEqual(sandbox?.network, { allowedDomains: ['*'], deniedDomains: LOOPBACK });
      const hidden = sandbox?.credentials.envVars ?? [];
      for (const name of ['FAKE_OWNER_API_TOKEN', 'ANTHROPIC_API_KEY'])
        assert.ok(
          hidden.some((v) => v.name === name && v.mode === 'deny'),
          `${name} reaches commands: ${JSON.stringify(hidden)}`
        );
    })
);

test("--add-dir holds the run's temp only with Run commands on", onMac, async () => {
  await setOwn('bo', { commands: true });
  const on = await chatOf('bo');
  assert.equal(each(on.args, '--add-dir').at(-1), tmpOf(on));
  await setOwn('bo', { web: true });
  const off = await chatOf('bo');
  assert.ok(
    !each(off.args, '--add-dir').some((p) => p.startsWith('/private/tmp/')),
    each(off.args, '--add-dir').join(' ')
  );
});

test('npm_config_cache is the same <tmp>/npm for Claude and Codex', onMac, async () => {
  await setOwn('bo', { commands: true });
  const claude = await chatOf('bo');
  const npm = (env: Record<string, string>) => ({
    npm_config_cache: env.npm_config_cache,
    npm_config_userconfig: env.npm_config_userconfig
  });
  assert.deepEqual(claude.npm, npm(shellEnv(tmpOf(claude))));
  const codex = await chatOf('cole');
  assert.deepEqual(
    npm(codex.git ?? {}),
    npm(shellEnv(join(folder, 'codex-tmp', codex.env.RUN_KEY)))
  );
  assert.equal(claude.npm?.npm_config_cache, join(tmpOf(claude), 'npm'));
});

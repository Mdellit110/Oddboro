// The system's own folder picker (`folder-picker.ts`, `/api/folders/pick`),
// with stand-in dialogs on PATH for a Mac, Windows and Linux: each records
// what it was given and answers as the test says. Run with
// `npm test -w @oddboro/office`.
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { pickFolder } from './folder-picker.ts';

const route = await import('../../routes/api/folders/pick/+server.ts');

const bin = mkdtempSync(join(tmpdir(), 'oddboro-picker-'));
after(() => rmSync(bin, { recursive: true, force: true }));
const said = join(bin, 'said.json');
const answer = join(bin, 'answer');
const hold = join(bin, 'hold');

/** A stand-in dialog: it writes its arguments and prompt to said.json, waits while `hold` exists, then prints `answer` or, when there is none, exits 1 as a cancel does. */
function standIn(name: string) {
  const file = join(bin, name);
  writeFileSync(
    file,
    `#!${process.execPath}
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(said)}, JSON.stringify({ name: ${JSON.stringify(name)}, args: process.argv.slice(2), prompt: process.env.ODDBORO_PICK_PROMPT }));
const end = () => {
  if (fs.existsSync(${JSON.stringify(hold)})) return setTimeout(end, 20);
  if (!fs.existsSync(${JSON.stringify(answer)})) { process.stderr.write('User canceled. (-128)\\n'); process.exit(1); }
  process.stdout.write(fs.readFileSync(${JSON.stringify(answer)}, 'utf8'));
};
end();
`
  );
  chmodSync(file, 0o755);
}
const remove = (name: string) => rmSync(join(bin, name), { force: true });
const heard = () =>
  JSON.parse(readFileSync(said, 'utf8')) as { name: string; args: string[]; prompt?: string };

/** `fn` as on `platform`, with only the stand-ins on PATH and `env` set. */
async function on<T>(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
  fn: () => Promise<T>
): Promise<T> {
  const real = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const was: Record<string, string | undefined> = {};
  for (const k of ['PATH', ...Object.keys(env)]) was[k] = process.env[k];
  Object.defineProperty(process, 'platform', { value: platform });
  process.env.PATH = bin;
  for (const [k, v] of Object.entries(env))
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  try {
    return await fn();
  } finally {
    Object.defineProperty(process, 'platform', real);
    for (const [k, v] of Object.entries(was))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    rmSync(said, { force: true });
    rmSync(answer, { force: true });
  }
}

test("on a Mac the picker is AppleScript's choose folder, with the prompt as an argument, the folder without its last slash, and a cancel picks nothing", async () => {
  standIn('osascript');
  await on('darwin', {}, async () => {
    writeFileSync(answer, '/Volumes/work/my "game"/\n');
    assert.deepEqual(await pickFolder('Pick a folder for Sam'), {
      path: '/Volumes/work/my "game"'
    });
    const h = heard();
    assert.equal(h.args.at(-1), 'Pick a folder for Sam');
    assert.ok(h.args.some((a) => a.includes('choose folder')));
    assert.ok(
      !h.args.slice(0, -1).some((a) => a.includes('Sam')),
      'the prompt is never in the script'
    );
    rmSync(answer);
    assert.deepEqual(await pickFolder('Pick a folder'), { cancelled: true });
  });
  remove('osascript');
});

test('on Windows the picker is the Forms folder dialog in PowerShell, single-threaded, with the prompt through the environment', async () => {
  standIn('powershell.exe');
  await on('win32', {}, async () => {
    writeFileSync(answer, 'D:\\work\\game');
    assert.deepEqual(await pickFolder('Pick a folder for Sam'), { path: 'D:\\work\\game' });
    const h = heard();
    assert.ok(h.args.includes('-STA'));
    assert.ok(h.args.at(-1)!.includes('FolderBrowserDialog'));
    assert.ok(!h.args.at(-1)!.includes('Sam'), 'the prompt is never in the script');
    assert.equal(h.prompt, 'Pick a folder for Sam');
    // Cancel prints nothing.
    writeFileSync(answer, '');
    assert.deepEqual(await pickFolder('Pick a folder'), { cancelled: true });
  });
  remove('powershell.exe');
});

test('on Linux the picker is zenity, else kdialog, and with neither or no screen it says why so the owner types the path', async () => {
  await on('linux', { DISPLAY: undefined, WAYLAND_DISPLAY: undefined }, async () => {
    standIn('zenity');
    const none = await pickFolder('Pick a folder');
    assert.ok('unavailable' in none && /no screen/.test(none.unavailable));
  });
  await on('linux', { DISPLAY: ':0', WAYLAND_DISPLAY: undefined }, async () => {
    writeFileSync(answer, '/srv/work/game\n');
    assert.deepEqual(await pickFolder('Pick a folder'), { path: '/srv/work/game' });
    assert.equal(heard().name, 'zenity');
    assert.ok(heard().args.includes('--directory'));
  });
  remove('zenity');
  standIn('kdialog');
  await on('linux', { DISPLAY: undefined, WAYLAND_DISPLAY: 'wayland-0' }, async () => {
    writeFileSync(answer, '/srv/work/notes\n');
    assert.deepEqual(await pickFolder('Pick a folder'), { path: '/srv/work/notes' });
    assert.equal(heard().name, 'kdialog');
    assert.equal(heard().args[0], '--getexistingdirectory');
  });
  remove('kdialog');
  await on('linux', { DISPLAY: ':0' }, async () => {
    const none = await pickFolder('Pick a folder');
    assert.ok('unavailable' in none && /zenity or kdialog/.test(none.unavailable));
  });
});

test('the route opens one picker at a time, names the Odd in its prompt, and grants nothing itself', async () => {
  standIn('osascript');
  const post = (body: unknown) =>
    route.POST({
      request: new Request('http://office/api/folders/pick', {
        method: 'POST',
        body: JSON.stringify(body)
      })
    } as never);
  await on('darwin', {}, async () => {
    writeFileSync(hold, '');
    writeFileSync(answer, '/Volumes/work/game/\n');
    const first = post({ for: 'Sam' });
    for (let i = 0; i < 200 && !existsSync(said); i++) await new Promise((r) => setTimeout(r, 10));
    await assert.rejects(
      async () => post({}),
      (e: { status?: number }) => e.status === 409
    );
    rmSync(hold);
    assert.deepEqual(await (await first).json(), { path: '/Volumes/work/game' });
    assert.equal(heard().args.at(-1), 'Pick a folder for Sam');
  });
  remove('osascript');
});

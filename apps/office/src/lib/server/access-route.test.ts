// The staff route's one click under a Run commands switch the Odd's tool
// cannot follow: the move to the tool that follows it, with the switch on, in
// an office under test (office-under-test.ts). Run with `npm test -w @oddboro/office`.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  L,
  chat,
  folder,
  isBusy,
  odd,
  onPlatform,
  patch,
  recorded,
  refusal
} from './office-under-test.ts';

await L.pg`insert into staff ${L.pg([
  { ...odd('gia', 'Gia'), agent: 'grok' },
  odd('gil', 'Gil'),
  odd('cora', 'Cora')
])}`;

/** How many Ledger lines name this Odd. Each one here starts with none. */
const linesAbout = async (name: string) =>
  (await L.pg`select 1 from ledger where title like ${`%${name}%`}`).length;
const switches = async (id: string) => {
  const s = await L.staffer(id);
  return { agent: s?.agent, commands: s?.commands };
};

test('one click moves a Grok Odd to Claude Code with Run commands on and records both; a busy Odd or a tool that cannot hold it changes nothing', async () => {
  await onPlatform('darwin', async () => {
    assert.equal((await patch('gia', { agent: 'claude', commands: true })).status, 200);
    assert.deepEqual(await switches('gia'), { agent: 'claude', commands: true });
    assert.ok(await recorded('Moved Gia from Grok to Claude Code'));
    assert.ok(await recorded('Let Gia run commands'));

    // The Grok stand-in cannot hold a reply, so Gil's chat starts on Claude
    // Code and its row moves to Grok while the reply is held.
    const release = join(folder, 'release-gil');
    const replied = chat('gil', `Hold until ${release} exists.`, () => {});
    try {
      for (let i = 0; !isBusy('gil'); i++) {
        assert.ok(i < 200, 'the chat never started');
        await new Promise((r) => setTimeout(r, 10));
      }
      await L.pg`update staff set agent = 'grok' where id = 'gil'`;
      assert.deepEqual(await refusal(patch('gil', { agent: 'claude', commands: true })), {
        status: 409,
        message: 'Wait for the reply to finish, then switch.'
      });
      assert.deepEqual(await switches('gil'), { agent: 'grok', commands: false });
      assert.equal(await linesAbout('Gil'), 0);
    } finally {
      writeFileSync(release, '');
      await replied;
    }

    assert.deepEqual(await refusal(patch('cora', { agent: 'grok', commands: true })), {
      status: 400,
      message: L.COMMANDS_WHY.grok
    });
    assert.deepEqual(await switches('cora'), { agent: 'claude', commands: false });
    assert.equal(await linesAbout('Cora'), 0);
  });
});

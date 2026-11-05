// What a line of a tool's own stream tells the floor about the tool in use,
// and what each Odd is told its own tools reach. Run with `npm test -w @oddboro/office`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AGENTS } from '@oddboro/ledger/agents';
import { ownToolsLine, streamTools } from './cli.ts';
import { codexReader } from './codex.ts';
import { toolWords } from '../staff/work.ts';

/** A tool call starting, as Claude Code and Grok stream it. */
const started = (name: string) => ({
  type: 'stream_event',
  event: { type: 'content_block_start', content_block: { type: 'tool_use', name } }
});

test('a Codex file change and a Grok edit reach the floor and the chat as a Claude Code Edit, in the same words', () => {
  const claude = streamTools('claude', started('Edit'));
  const grok = streamTools('grok', started('search_replace'));
  const codex = codexReader('codex')({
    type: 'item.completed',
    item: { id: 'i1', type: 'file_change', changes: [], status: 'completed' }
  }).flatMap((e) => (e.type === 'tool' ? [e.name] : []));
  assert.deepEqual([claude, grok, codex], [['Edit'], ['Edit'], ['Edit']]);
  assert.equal(toolWords(grok[0]), 'Editing files');
});

test("a Codex shell command reaches the floor as Claude Code's Bash, and Grok looking for a tool as ToolSearch", () => {
  const codex = codexReader('codex')({
    type: 'item.started',
    item: { id: 'i2', type: 'command_execution', command: 'ls', status: 'in_progress' }
  });
  assert.deepEqual(codex, [{ type: 'tool', name: 'Bash' }]);
  assert.deepEqual(streamTools('grok', started('search_tool')), ['ToolSearch']);
});

test('each Odd is told its own tools', () => {
  const told = {
    neither: 'Your own tools work on files only: no shell and no web.',
    commands:
      'Your own tools work on files, plus a shell confined to your folders, with no network. No web.',
    web: 'Your own tools work on files, plus web search and fetch. No shell.',
    both: 'Your own tools work on files, plus a shell confined to your folders, with no network, and web search and fetch.'
  };
  for (const agent of AGENTS) {
    // Gemini's policy allows a write only by its full path, so its Odds are told so.
    const end = agent === 'gemini' ? " Give each file tool the file's full path." : '';
    assert.deepEqual(
      {
        neither: ownToolsLine(agent, { commands: false, web: false }),
        commands: ownToolsLine(agent, { commands: true, web: false }),
        web: ownToolsLine(agent, { commands: false, web: true }),
        both: ownToolsLine(agent, { commands: true, web: true })
      },
      Object.fromEntries(Object.entries(told).map(([k, v]) => [k, v + end])),
      agent
    );
  }
});

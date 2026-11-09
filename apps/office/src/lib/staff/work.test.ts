// How the floor and the chat name the tool an Odd is using. Run with
// `npm test -w @oddboro/office`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GEMINI_FILE_TOOLS, GROK_FILE_TOOLS, runningFor, toolWords } from './work.ts';

test('how long work has run reads in whole minutes, so nothing redraws every second', () => {
  const since = '2026-11-07T18:00:00Z';
  const at = (min: number) => Date.parse(since) + min * 60_000;
  assert.equal(runningFor(since, at(0.9)), 'just started');
  assert.equal(runningFor(since, at(4.5)), '4 min');
  assert.equal(runningFor(since, at(65)), '1 h 5 min');
  assert.equal(runningFor(since, at(-1)), 'just started');
});

test("each of Claude Code's tools an Odd's run uses reads in plain words", () => {
  const names = ['Read', 'Glob', 'Grep', 'Edit', 'Write', 'Bash', 'ToolSearch'];
  assert.deepEqual(Object.fromEntries(names.map((n) => [n, toolWords(n)])), {
    Read: 'Reading files',
    Glob: 'Looking for files',
    Grep: 'Searching files',
    Edit: 'Editing files',
    Write: 'Writing a file',
    Bash: 'Running a command',
    ToolSearch: 'Looking for a tool'
  });
});

test("every Claude Code name Grok's and Gemini's file tools stand for reads in words, never as the name", () => {
  for (const claude of [...Object.values(GROK_FILE_TOOLS), ...Object.values(GEMINI_FILE_TOOLS)])
    assert.notEqual(toolWords(claude), claude, claude);
});

test('an MCP call reads as the tool it names, with its server', () => {
  assert.equal(toolWords('mcp__office__my_access'), 'my access (office)');
});

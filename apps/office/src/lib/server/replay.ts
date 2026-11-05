// What a new chat session hears of the chat it never saw. A session is new
// after the owner moves an Odd to another coding tool, or when its session
// file is gone, and without this "What did I just ask you?" means nothing to
// it. It gets the latest of the chat word for word, from `chat.jsonl` (the
// record the owner sees, never written back), and the files in the Odd's own
// folder that changed during it. A chat run writes only there. Server only.
import { readdirSync, statSync, type Dirent } from 'node:fs';
import { join, relative } from 'node:path';
import type { ChatEntry } from './staff.ts';

/** At most this many characters of chat text go into one replay. */
export const REPLAY_CHARS = 24_000;
/** At most this many changed files are named; the rest are counted. */
export const REPLAY_FILES = 30;
/** At most this many entries of the Odd's folder are looked at, so a big folder costs no more. */
const WALK_ENTRIES = 2_000;
/**
 * The files the office keeps in an Odd's folder, which the Odd never made:
 * its chat (`chatFile` in staff.ts) and its chat session (`chatSession`).
 */
const OFFICE_FILES = new Set(['chat.jsonl', 'session.json']);

/**
 * The lines a replay holds, oldest first: the newest lines with text whose
 * text fits the budget together. A newest line over the budget alone keeps
 * its end, after a `…`.
 */
export function replayed(entries: ChatEntry[], budget = REPLAY_CHARS): ChatEntry[] {
  const said = entries.filter((e) => e.text);
  let total = 0;
  let from = said.length;
  while (from > 0 && total + said[from - 1].text.length <= budget)
    total += said[--from].text.length;
  const newest = said.at(-1);
  if (from === said.length && newest)
    return [{ ...newest, text: `…${newest.text.slice(-budget)}` }];
  return said.slice(from);
}

/** The earlier chat, word for word, for a session that never saw it. Pure. */
export function replay(entries: ChatEntry[], changed: string[], budget = REPLAY_CHARS): string {
  const lines = replayed(entries, budget).map(
    (e) => `${e.from === 'owner' ? '{owner}' : 'You'}: ${e.text}`
  );
  const more = changed.length - REPLAY_FILES;
  const files = changed.slice(0, REPLAY_FILES).join(', ') + (more > 0 ? `, and ${more} more` : '');
  return [
    '(This is a new session, so you do not remember your chat with {owner} so far. Here is the latest of it, word for word, oldest first:)',
    lines.join('\n'),
    ...(changed.length ? [`(Files in your folder that changed during it: ${files}.)`] : [])
  ].join('\n\n');
}

/** A folder's entries, or none when it cannot be read: the replay is a help, and never stops the chat. */
function entriesOf(folder: string): Dirent[] {
  try {
    return readdirSync(folder, { withFileTypes: true });
  } catch {
    // A folder the Odd shut, or one a job removed mid-walk: its files go unnamed.
    return [];
  }
}

/** Files in the Odd's own folder changed at or after `since`, newest first, as paths relative to it. */
export function changedSince(dir: string, since: string): string[] {
  const from = Date.parse(since);
  const found: { path: string; at: number }[] = [];
  const folders = [dir];
  let looked = 0;
  for (let i = 0; i < folders.length && looked < WALK_ENTRIES; i++) {
    for (const e of entriesOf(folders[i])) {
      if (++looked > WALK_ENTRIES) break;
      if (e.name.startsWith('.')) continue;
      const path = join(folders[i], e.name);
      // Links are skipped: one may point out of the folder, and the Odd made nothing there.
      if (e.isDirectory()) folders.push(path);
      else if (e.isFile() && !(folders[i] === dir && OFFICE_FILES.has(e.name))) {
        // A file a job removed since the folder was read is not there to name.
        const at = statSync(path, { throwIfNoEntry: false })?.mtimeMs;
        if (at !== undefined && at >= from) found.push({ path: relative(dir, path), at });
      }
    }
  }
  return found.sort((a, b) => b.at - a.at).map((f) => f.path);
}

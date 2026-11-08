// What an Odd has kept in its own folder, for the Storage tab: every file and
// folder in it, with sizes and when each changed. Never the office's own files
// there (the chat log and the run session), never an instruction file or a
// hidden one (`.claude`, `.grok`, `.git` and the rest), and never through a
// link, so the list stays inside the folder. It stops at `STORAGE_CAP`
// entries and says so. Read when the tab opens; nothing watches the folder.
import { type Dirent, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { join, relative } from 'node:path';
import { INSTRUCTIONS } from './files.ts';

/** The most entries the tab lists. */
export const STORAGE_CAP = 5000;
/** The office's own files at the top of an Odd's folder: its chat log and its run session. */
const OFFICE_FILES = ['chat.jsonl', 'session.json'];

export type StoredEntry = {
  /** From the Odd's folder, with `/` between folders. */
  path: string;
  dir: boolean;
  /** Bytes; 0 for a folder. */
  size: number;
  /** When it last changed, in milliseconds. */
  mtime: number;
};

/** Whether the tab shows `name`, at `depth` (0 is the top of the folder). */
const shown = (name: string, depth: number): boolean =>
  !name.startsWith('.') &&
  !INSTRUCTIONS.includes(name) &&
  !(depth === 0 && OFFICE_FILES.includes(name));

/** Every entry under `root`, folders before files, by name; `capped` when it stopped at `cap`. */
export function listStorage(
  root: string,
  cap = STORAGE_CAP
): { entries: StoredEntry[]; capped: boolean } {
  const entries: StoredEntry[] = [];
  let capped = false;
  let real: string;
  try {
    real = realpathSync(root);
  } catch {
    return { entries, capped };
  }
  const walk = (dir: string, depth: number): void => {
    let list: Dirent[];
    try {
      list = readdirSync(dir, { withFileTypes: true });
    } catch {
      // A folder the office may not read hides only what is in it.
      return;
    }
    list.sort((a, b) =>
      a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1
    );
    for (const e of list) {
      if (capped) return;
      // A link may lead anywhere on the computer, so it is not listed or followed.
      if (e.isSymbolicLink() || !shown(e.name, depth)) continue;
      if (!e.isDirectory() && !e.isFile()) continue;
      if (entries.length >= cap) {
        capped = true;
        return;
      }
      const at = join(dir, e.name);
      const st = lstatSync(at, { throwIfNoEntry: false });
      if (!st) continue;
      entries.push({
        path: relative(real, at).split('\\').join('/'),
        dir: e.isDirectory(),
        size: e.isDirectory() ? 0 : st.size,
        mtime: st.mtimeMs
      });
      if (e.isDirectory()) walk(at, depth + 1);
    }
  };
  walk(real, 0);
  return { entries, capped };
}

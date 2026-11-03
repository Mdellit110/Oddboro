// The decisions ledger: one decision per file, named for its date and area,
// under 4,000 bytes, never provisional, never duplicated.
import { read, repoFiles, report } from './lib/files.ts';

const DIR = 'docs/decisions/';
const NAME = /^(\d{4}-\d{2}-\d{2})_([a-z0-9.-]+)_([a-z0-9-]+)\.md$/;
const ENTRY = /^- \[([a-z0-9/-]+)\] \*\*Decision \((\d{4}-\d{2}-\d{2})[^)]*\)[:.]? ?(.+?)\*\*/;
const PROVISIONAL = /\b(TBD|TODO|pending|to be decided|revisit|for now|probably|tentative)\b/i;

const failures: string[] = [];
const headlines = new Map<string, string>();
for (const file of repoFiles().filter((f) => f.startsWith(DIR) && f.endsWith('.md'))) {
  const base = file.slice(DIR.length);
  if (base === 'CLAUDE.md') continue;
  const name = NAME.exec(base);
  if (!name) {
    failures.push(`${file}: name must be <YYYY-MM-DD>_<area>_<slug>.md`);
    continue;
  }
  const text = read(file);
  if (Buffer.byteLength(text) > 4000)
    failures.push(`${file}: over 4,000 bytes. Move detail to a doc and point to it.`);
  const lines = text.trim().split('\n');
  if (lines.length !== 1) failures.push(`${file}: one entry, one line`);
  const entry = ENTRY.exec(lines[0]);
  if (!entry) {
    failures.push(`${file}: must open "- [area] **Decision (YYYY-MM-DD) headline**"`);
    continue;
  }
  const [, area, date, headline] = entry;
  if (date !== name[1])
    failures.push(`${file}: file date ${name[1]} does not match entry date ${date}`);
  if (area.replace(/\//g, '.') !== name[2])
    failures.push(`${file}: file area ${name[2]} does not match [${area}]`);
  if (PROVISIONAL.test(text))
    failures.push(`${file}: reads as provisional. Decide it, or keep it out of the repo.`);
  const prior = headlines.get(headline.toLowerCase());
  if (prior)
    failures.push(`${file}: same headline as ${prior}. A supersede replaces the old file.`);
  headlines.set(headline.toLowerCase(), file);
}
report('ledger', failures);

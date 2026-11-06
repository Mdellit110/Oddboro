// Hard rule 4: nothing leaves the office without the owner's yes. Every place
// the office's own code calls out is declared in scripts/outbound.ts, with
// whose yes covers it. Fails when a file's calls differ from its entry, when an
// entry's file has none, and when no call is found at all (nothing to check).
// Matches call names in text, with comments taken out, because the guards take
// no dependencies. It cannot see inside a library whose own calls start from a
// name not listed here.
import { read, repoFiles, report, withoutComments } from './lib/files.ts';
import { OUTBOUND } from './outbound.ts';

const OFFICE =
  /^(apps\/office\/src\/(lib\/server\/.+|routes\/.+|hooks\.(server|client)|instrumentation\.server|lib\/diagnostics)|packages\/[^/]+\/src\/.+)\.ts$/;
const DESKTOP = /^apps\/desktop\/src-tauri\/src\/.+\.rs$/;

// `fetch(` not after a dot or a name, so `globalThis.fetch(` counts once.
const TS_CALLS =
  /(?<![.\w$])fetch\(|\bglobalThis\.fetch\(|\bnew (?:StreamableHTTPClientTransport|SSEClientTransport|WebSocket)\(|\bhttps?\.(?:request|get)\(|\bSentry\.init\(/g;
const RS_CALLS = /\bsentry::init\(|\breqwest::|\.updater_builder\(/g;

/** Each call site in the file, as `file:line`. */
function callsIn(file: string): string[] {
  const calls = file.endsWith('.rs') ? RS_CALLS : TS_CALLS;
  return withoutComments(read(file))
    .split('\n')
    .flatMap((line, i) => (line.match(calls) ?? []).map(() => `${file}:${i + 1}`));
}

const found = new Map<string, string[]>();
for (const file of repoFiles()) {
  if (!(OFFICE.test(file) || DESKTOP.test(file)) || file.endsWith('.test.ts')) continue;
  const sites = callsIn(file);
  if (sites.length) found.set(file, sites);
}

const failures: string[] = [];
if (!found.size) failures.push('found no outbound call anywhere: nothing to check');
for (const [file, sites] of found) {
  const entry = OUTBOUND.find((o) => o.file === file);
  if (!entry)
    failures.push(
      `${sites.join(', ')}: calls out with no entry in scripts/outbound.ts. Add one saying where it goes, what it sends and whose yes covers it.`
    );
  else if (entry.calls !== sites.length)
    failures.push(
      `${file}: has ${sites.length} outbound call(s) (${sites.join(', ')}), scripts/outbound.ts says ${entry.calls}. Update its entry.`
    );
}
for (const entry of OUTBOUND)
  if (!found.has(entry.file))
    failures.push(
      `${entry.file}: has no outbound call, but scripts/outbound.ts declares ${entry.calls}. Remove its entry.`
    );
report('outbound', failures);

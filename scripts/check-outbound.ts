// Hard rule 4: nothing leaves the office without the owner's yes. Each call the
// office's own code makes in its own process, by a name counted here, is
// declared in scripts/outbound.ts with whose yes covers it. Fails when a file's
// calls differ from its entry, when an entry's file has none, and when no call
// is found at all (nothing to check).
//
// It counts, with comments taken out: `fetch(`, the connector transports,
// `WebSocket` and `EventSource`, `Sentry.init(`, and the calls that open a
// connection from Node's http, https, http2, tls and net modules, however the
// file imports them (named, default or `* as`). In the desktop app: the
// updater, `reqwest` and Sentry. It matches names in text because the guards
// take no dependencies, so it does not count:
// - child processes, such as `npm install -g`, `grok update --check` and each
//   AI tool's run, which sends the owner's words to that tool's maker;
// - what the desktop updater does after `updater_builder`;
// - a module loaded with `require` or `import()`;
// - a library's own calls that start from a name not listed here.
import { read, repoFiles, report, withoutComments } from './lib/files.ts';
import { OUTBOUND } from './outbound.ts';

const OFFICE = /^(apps\/office\/src\/.+\.(ts|svelte)|packages\/[^/]+\/src\/.+\.ts)$/;
const DESKTOP = /^apps\/desktop\/src-tauri\/src\/.+\.rs$/;

// `fetch(` not after a dot or a name, so `globalThis.fetch(` counts once.
const TS_CALLS =
  /(?<![.\w$])fetch\s*\(|\b(?:globalThis|window|self)\.fetch\s*\(|\bnew\s+(?:StreamableHTTPClientTransport|SSEClientTransport|WebSocket|EventSource)\s*\(|\bSentry\.init\s*\(/
    .source;
const RS_CALLS = /\bsentry::init\(|\breqwest::|\.updater_builder\(|\.updater\s*\(/g;

/** Node's network modules, and the functions on each that open a connection. */
const NODE_NET: Record<string, string[]> = {
  http: ['request', 'get'],
  https: ['request', 'get'],
  http2: ['connect'],
  tls: ['connect'],
  net: ['connect', 'createConnection']
};
const NODE_IMPORT = new RegExp(
  `\\bimport\\s+(?!type\\s)([^'";]*?)\\s*from\\s*['"](?:node:)?(${Object.keys(NODE_NET).join('|')})['"]`,
  'g'
);

/**
 * The calls a file makes through Node's network modules, as patterns: a
 * default or `* as` import's name before `.request(` and the like, and a named
 * import's own local name, such as `request(` or `tlsConnect(`.
 */
function nodeCalls(text: string): string[] {
  return [...text.matchAll(NODE_IMPORT)].flatMap(([, clause, module]) => {
    const opens = NODE_NET[module];
    const whole = [...clause.matchAll(/^\s*([\w$]+)\s*(?:,|$)|\*\s*as\s+([\w$]+)/g)].flatMap(
      (m) => m[1] ?? m[2] ?? []
    );
    const named = (clause.match(/\{([^}]*)\}/)?.[1] ?? '')
      .split(',')
      .map((item) => item.trim().split(/\s+as\s+/))
      .flatMap(([name, local]) => (opens.includes(name) ? [local ?? name] : []));
    return [
      ...whole.map((n) => `\\b${n.replaceAll('$', '\\$')}\\.(?:${opens.join('|')})\\s*\\(`),
      ...named.map((n) => `(?<![.\\w$])${n.replaceAll('$', '\\$')}\\s*\\(`)
    ];
  });
}

/** Each call site in the file, as `file:line`. */
function callsIn(file: string): string[] {
  let text = withoutComments(read(file));
  // A Svelte file's markup comments, kept as blank lines.
  if (file.endsWith('.svelte'))
    text = text.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ''));
  const calls = file.endsWith('.rs')
    ? RS_CALLS
    : new RegExp([TS_CALLS, ...nodeCalls(text)].join('|'), 'g');
  return text
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

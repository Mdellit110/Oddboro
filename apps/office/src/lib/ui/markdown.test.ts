// What an Odd's text links, in the office and outside it. Run with
// `npm test -w @oddboro/office`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { askAbout } from './file-links.ts';
import { renderMarkdown } from './markdown.ts';

const refused = new Set<string>();
// The page's one call: the office says every name opens, but those in `refused`.
globalThis.fetch = (async (_url: string, init: RequestInit) => {
  const { files } = JSON.parse(String(init.body)) as { files: { path: string }[] };
  return Response.json(files.map((f) => (refused.has(f.path) ? null : f.path)));
}) as typeof fetch;

/** `text` as the page shows it once the office has answered about its names. */
async function shown(text: string, staff?: string): Promise<string> {
  await askAbout(renderMarkdown(text, staff).unknown);
  return renderMarkdown(text, staff).html.trim();
}
/** What the owner reads of `html`. */
const visible = (html: string): string => html.replace(/<[^>]*>/g, '');

const FULL_PAGE = '/Users/Shared/.oddboro/threads/1/vera/m/index.html';
const PAGE_NAME = 'vera:threads/1/vera/m/index.html';
const LINK = `<a href="#" data-file="${PAGE_NAME}">`;
const NAMED = `<a href="#" data-file="${PAGE_NAME}" title="Open index.html">`;
const BUTTON = `<button type="button" data-page="${PAGE_NAME}" class="open-page">Open in browser</button>`;

test('a bare file name stays text, and only a written-out address links', () => {
  assert.equal(renderMarkdown('plan.md').html.trim(), '<p>plan.md</p>');
  assert.equal(renderMarkdown('www.example.com').html.trim(), '<p>www.example.com</p>');
  assert.equal(
    renderMarkdown('https://x.y').html.trim(),
    '<p><a href="https://x.y" target="_blank" rel="noopener noreferrer">https://x.y</a></p>'
  );
});

for (const [row, text, html, staff] of [
  [
    'a full path into a thread, in plain text, is a link by its bare name with its button',
    `Built ${FULL_PAGE} today`,
    `<p>Built ${NAMED}index.html</a>${BUTTON} today</p>`
  ],
  [
    'the same path in backticks shows its bare name in code',
    `\`${FULL_PAGE}\``,
    `<p>${NAMED}<code>index.html</code></a>${BUTTON}</p>`
  ],
  [
    'a file: link to a thread file keeps the words the Odd wrote, with no brackets and no file: href',
    `[a](file://${FULL_PAGE})`,
    `<p>${LINK}a</a>${BUTTON}</p>`
  ],
  [
    'an autolink to a thread file shows its bare name',
    `<file://${FULL_PAGE}>`,
    `<p>${LINK}index.html</a>${BUTTON}</p>`
  ],
  [
    'a link whose label is the full path shows the bare name',
    `[${FULL_PAGE}](file://${FULL_PAGE})`,
    `<p>${LINK}index.html</a>${BUTTON}</p>`
  ],
  [
    'a link whose label is the full path in backticks shows the bare name in code',
    `[\`${FULL_PAGE}\`](file://${FULL_PAGE})`,
    `<p>${LINK}<code>index.html</code></a>${BUTTON}</p>`
  ],
  [
    'a link whose label is the full path in bold shows the bare name in bold',
    `[**${FULL_PAGE}**](file://${FULL_PAGE})`,
    `<p>${LINK}<strong>index.html</strong></a>${BUTTON}</p>`
  ],
  [
    'a link labelled with a bare name keeps that label',
    '[draft.md](file:///Users/Shared/.oddboro/threads/1/vera/draft.md)',
    '<p><a href="#" data-file="vera:threads/1/vera/draft.md">draft.md</a></p>'
  ],
  [
    'a full path on a Linux home is a name',
    '`/home/runner/.oddboro/threads/2/vera/a.md`',
    '<p><a href="#" data-file="vera:threads/2/vera/a.md" title="Open a.md"><code>a.md</code></a></p>'
  ],
  [
    'a full path under a dev home is a name, in plain text too',
    'See /Users/Shared/.oddboro-dev/threads/3/vera/b.md.',
    '<p>See <a href="#" data-file="vera:threads/3/vera/b.md" title="Open b.md">b.md</a>.</p>'
  ],
  [
    "a colleague's full path names the colleague's file, whoever wrote the text",
    `\`${FULL_PAGE}\``,
    `<p>${NAMED}<code>index.html</code></a>${BUTTON}</p>`,
    'jax'
  ],
  [
    "a full path in plain text into an Odd's own folder still shows its path there",
    '/Users/Shared/.oddboro/staff/vera/notes/a.md',
    '<p><a href="#" data-file="vera:notes/a.md" title="Open notes/a.md">notes/a.md</a></p>'
  ],
  [
    "a file: link to an Odd's own folder opens that file",
    '[a](file:///Users/Shared/.oddboro/staff/vera/notes/a.md)',
    '<p><a href="#" data-file="vera:notes/a.md">a</a></p>'
  ]
] as const satisfies readonly (readonly [string, string, string, string?])[])
  test(row, async () => {
    const out = await shown(text, staff);
    assert.equal(out, html);
    assert.doesNotMatch(out, /href="file:/);
    assert.doesNotMatch(visible(out), /threads|\.oddboro/);
  });

for (const [row, text, html] of [
  ['a file: link to no office file stays text', '[a](file:///etc/passwd)'],
  ['a javascript: link stays text', '[a](javascript:alert(1))'],
  ['a data: link stays text', '[a](data:text/html;base64,eA==)'],
  ['a file: link outside any office folder stays text', '[a](file:///Users/Shared/notes/a.md)'],
  [
    'a file: autolink to no office file stays text',
    '<file:///etc/passwd>',
    '<p>&lt;file:///etc/passwd&gt;</p>'
  ],
  ['a thread path with .. steps stays text', '~/.oddboro/threads/1/vera/../../x.md'],
  [
    'a thread path with .. steps in a file: link stays text',
    '[a](file:///Users/Shared/.oddboro/threads/1/vera/../../x.md)'
  ],
  [
    'a thread number past what a thread can have stays text',
    '/Users/Shared/.oddboro/threads/99999999999/vera/a.md'
  ],
  [
    'a thread number with leading zeros stays text, so it never reads another thread',
    '/Users/Shared/.oddboro/threads/007/vera/a.md'
  ],
  ['a full path that is only a thread folder stays text', '/Users/Shared/.oddboro/threads/1/a.md'],
  ['a path without a home stays as it is', '.oddboro/staff/vera/sims/a/index.html']
] as readonly (readonly [string, string, string?])[])
  test(row, async () => {
    const before = renderMarkdown(text, 'vera');
    assert.deepEqual(before.unknown, [], 'the office is asked about nothing');
    assert.equal(before.html.trim(), html ?? `<p>${text}</p>`);
    assert.doesNotMatch(before.html, /<a |<button/);
  });

test("a .. path in backticks asks the office nothing, so it never falls through to the Odd's own folder", () => {
  const { html, unknown } = renderMarkdown('`~/.oddboro/threads/1/vera/../../x.md`', 'vera');
  assert.deepEqual(unknown, []);
  assert.equal(html.trim(), '<p><code>~/.oddboro/threads/1/vera/../../x.md</code></p>');
});

test('a file: image shows its alt text, with no image and no file: anywhere', async () => {
  for (const src of [
    'file:///Users/Shared/.oddboro/threads/1/vera/p.png',
    'file:///Users/Shared/.oddboro/staff/vera/p.png'
  ]) {
    const out = await shown(`![a](${src})`, 'vera');
    assert.equal(out, '<p>a</p>');
    assert.doesNotMatch(out, /<img|file:/);
  }
  // Inside a link it is still only the words.
  const inLink = await shown(
    `[![a](file:///Users/Shared/.oddboro/threads/1/vera/p.png)](https://x.y)`
  );
  assert.doesNotMatch(inLink, /<img|file:/);
  assert.match(inLink, />a<\/a>/);
});

test('a thread path shows as written until the office answers, and stays so when it opens nothing', async () => {
  const path = '/Users/Shared/.oddboro/threads/7/vera/gone.md';
  refused.add('threads/7/vera/gone.md');
  const first = renderMarkdown(`See ${path}`, 'vera');
  assert.deepEqual(first.unknown, [{ staff: 'vera', path: 'threads/7/vera/gone.md' }]);
  assert.equal(first.html.trim(), `<p>See ${path}</p>`);
  const out = await shown(`See ${path}`, 'vera');
  assert.equal(out, `<p>See ${path}</p>`);
  // A file: link to a name that opens nothing keeps its words and loses the link.
  assert.equal(await shown(`[a](file://${path})`, 'vera'), '<p>a</p>');
});

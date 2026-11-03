<script lang="ts">
  import MarkdownIt from 'markdown-it';
  import type Token from 'markdown-it/lib/token.mjs';
  import { openFile } from './windows.svelte.ts';

  // Raw HTML stays escaped, and markdown-it refuses javascript: links, so a
  // staffer's text can format but never inject anything into the page.
  const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
  const defaultLink =
    md.renderer.rules.link_open ??
    ((tokens, i, options, _env, self) => self.renderToken(tokens, i, options));
  md.renderer.rules.link_open = (tokens, i, options, env, self) => {
    if (!tokens[i].attrGet('data-file')) {
      tokens[i].attrSet('target', '_blank');
      tokens[i].attrSet('rel', 'noopener noreferrer');
    }
    return defaultLink(tokens, i, options, env, self);
  };

  // A staffer's own files open in the office's viewer. A full path anywhere in
  // the text links; a path inside its folder, like notes/x.md, links when it
  // is code or a link and the text says which staffer wrote it.
  const FULL =
    /(?:file:\/\/)?(?:~|\/(?:Users|home)\/[^/\s]+)\/\.oddboro[^/\s]*\/staff\/([a-z0-9-]+)\/([^\s`'"<>()[\]]+?\.[A-Za-z0-9]+)(?=[\s`'"<>()[\],;:]|\.(?:\s|$)|$)/g;
  const INSIDE = /^(?:\.\/)?(?:[\w.-]+\/)*[\w-][\w.-]*\.(?:md|txt|json|csv|ya?ml)$/;

  type Env = { staff?: string };
  function fileOf(target: string, env: Env): { staff: string; path: string } | undefined {
    const t = decodeURI(target.trim());
    FULL.lastIndex = 0;
    const m = FULL.exec(t);
    if (m && m.index === 0 && m[0].length === t.length) return { staff: m[1], path: m[2] };
    if (env.staff && INSIDE.test(t)) return { staff: env.staff, path: t.replace(/^\.\//, '') };
    return undefined;
  }

  function linkTokens(state: { Token: typeof Token }, f: { staff: string; path: string }) {
    const open = new state.Token('link_open', 'a', 1);
    open.attrs = [
      ['href', '#'],
      ['data-file', `${f.staff}:${f.path}`],
      ['title', `Open ${f.path}`]
    ];
    return { open, close: new state.Token('link_close', 'a', -1) };
  }

  md.core.ruler.push('staff_files', (state) => {
    const env = state.env as Env;
    for (const block of state.tokens) {
      if (block.type !== 'inline' || !block.children) continue;
      const out: Token[] = [];
      let inLink = 0;
      for (const t of block.children) {
        if (t.type === 'link_open') {
          inLink++;
          const f = fileOf(t.attrGet('href') ?? '', env);
          if (f) {
            t.attrSet('href', '#');
            t.attrSet('data-file', `${f.staff}:${f.path}`);
          }
        } else if (t.type === 'link_close') inLink--;
        const f = !inLink && t.type === 'code_inline' ? fileOf(t.content, env) : undefined;
        if (f) {
          const { open, close } = linkTokens(state, f);
          t.content = f.path;
          out.push(open, t, close);
          continue;
        }
        if (inLink || t.type !== 'text' || !/\.oddboro[^/\s]*\/staff\//.test(t.content)) {
          out.push(t);
          continue;
        }
        // Split plain text around each full path, linking the path.
        let at = 0;
        FULL.lastIndex = 0;
        for (let m = FULL.exec(t.content); m; m = FULL.exec(t.content)) {
          const before = new state.Token('text', '', 0);
          before.content = t.content.slice(at, m.index);
          const label = new state.Token('text', '', 0);
          label.content = m[2];
          const { open, close } = linkTokens(state, { staff: m[1], path: m[2] });
          out.push(before, open, label, close);
          at = m.index + m[0].length;
        }
        const rest = new state.Token('text', '', 0);
        rest.content = t.content.slice(at);
        out.push(rest);
      }
      block.children = out;
    }
  });

  /** Clicks on a file link open the viewer instead of following it. */
  function fileLinks(node: HTMLElement) {
    const click = (e: MouseEvent) => {
      const a = (e.target as Element).closest('a[data-file]');
      if (!a) return;
      e.preventDefault();
      const [staff, ...rest] = (a.getAttribute('data-file') ?? '').split(':');
      openFile({ staff, path: rest.join(':') });
    };
    node.addEventListener('click', click);
    return () => node.removeEventListener('click', click);
  }

  let {
    text,
    staff,
    class: cls = ''
  }: {
    text: string;
    /** Who wrote it, so a path inside its folder links. */
    staff?: string;
    class?: string;
  } = $props();
  const html = $derived(md.render(text, { staff } satisfies Env));
</script>

<!-- Safe: markdown-it runs with html off, so every tag here is one it made. -->
<div class="md {cls}" {@attach fileLinks}>{@html html}</div>

<style>
  .md {
    line-height: 1.55;
    overflow-wrap: anywhere;
  }
  .md :global(:where(p, ul, ol, pre, blockquote, table, h1, h2, h3, h4)) {
    margin-block: 0 0.6em;
  }
  .md :global(:where(p, ul, ol, pre, blockquote, table):last-child) {
    margin-block-end: 0;
  }
  .md :global(:where(h1, h2, h3, h4)) {
    font-weight: 600;
    color: var(--color-ink);
    margin-block-start: 0.9em;
  }
  .md :global(:where(h1, h2, h3, h4):first-child) {
    margin-block-start: 0;
  }
  .md :global(h1) {
    font-size: 1.15em;
  }
  .md :global(h2) {
    font-size: 1.05em;
  }
  .md :global(:where(h3, h4)) {
    font-size: 1em;
  }
  .md :global(:where(ul, ol)) {
    padding-inline-start: 1.25em;
  }
  .md :global(ul) {
    list-style: disc;
  }
  .md :global(ol) {
    list-style: decimal;
  }
  .md :global(li + li) {
    margin-block-start: 0.2em;
  }
  .md :global(li::marker) {
    color: var(--color-muted);
  }
  .md :global(strong) {
    font-weight: 600;
    color: var(--color-ink);
  }
  .md :global(a) {
    color: var(--color-sea);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .md :global(code) {
    font-size: 0.9em;
    padding: 0.1em 0.35em;
    border-radius: 4px;
    background: rgb(0 0 0 / 0.3);
  }
  .md :global(pre) {
    padding: 0.6em 0.75em;
    border-radius: 8px;
    background: rgb(0 0 0 / 0.3);
    overflow-x: auto;
  }
  .md :global(pre code) {
    padding: 0;
    background: none;
  }
  .md :global(blockquote) {
    padding-inline-start: 0.75em;
    border-inline-start: 2px solid var(--color-hairline);
    color: var(--color-muted);
  }
  .md :global(hr) {
    border: 0;
    border-block-start: 1px solid var(--color-hairline);
    margin-block: 0.8em;
  }
  .md :global(table) {
    border-collapse: collapse;
    font-size: 0.92em;
  }
  .md :global(:where(th, td)) {
    padding: 0.25em 0.6em;
    border-block-end: 1px solid var(--color-hairline);
    text-align: start;
  }
</style>

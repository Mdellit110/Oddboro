// The office's own Gmail tools, as an MCP server inside the office process.
// The gateway reaches it in memory, so the owner's Google token never leaves
// the office. Gmail's scopes here are gmail.modify, so nothing can be deleted
// for good, only moved to the trash, and gmail.settings.basic for filters,
// which only the office creates, on the owner's click (filters.ts).
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { linkFooter, withFooter } from '@oddboro/ledger';
import { z } from 'zod';
import {
  doesWords,
  listed,
  matchWords,
  type FilterAction,
  type FilterCriteria
} from '@oddboro/ledger/filters';
import {
  base64url,
  DATA_NOTE,
  decodeEntities,
  google,
  htmlToText,
  id,
  inTurn,
  run,
  send,
  untrusted,
  type Token
} from './http.ts';

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';

type Header = { name: string; value: string };
type Part = {
  mimeType?: string;
  filename?: string;
  headers?: Header[];
  body?: { data?: string; size?: number };
  parts?: Part[];
};
type Message = {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  payload?: Part;
};
type Thread = { id: string; snippet?: string; messages?: Message[] };
type Label = { id: string; name: string; type?: string };

const header = (m: Message | undefined, name: string) =>
  m?.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

/** A part's text, in the charset it says it is in. */
function decode(p: Part): string {
  const bytes = Buffer.from(p.body!.data!, 'base64url');
  const charset = /charset="?([\w-]+)/i.exec(
    p.headers?.find((h) => h.name.toLowerCase() === 'content-type')?.value ?? ''
  )?.[1];
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

/** A message's body as plain text, and its attachments by name and size. */
function contents(m: Message): { body: string; files: string[] } {
  const found: { plain?: string; html?: string; files: string[] } = { files: [] };
  const walk = (p: Part) => {
    if (p.filename) found.files.push(`${p.filename} (${p.body?.size ?? 0} bytes)`);
    else if (p.body?.data && p.mimeType === 'text/plain') found.plain ??= decode(p);
    else if (p.body?.data && p.mimeType === 'text/html') found.html ??= decode(p);
    p.parts?.forEach(walk);
  };
  if (m.payload) walk(m.payload);
  return { body: found.plain ?? htmlToText(found.html ?? ''), files: found.files };
}

/** A header value with no line breaks, so nothing typed can add a header of its own. */
const oneLine = (v: string) => v.replace(/[\r\n]+/g, ' ').trim();
/** A subject in RFC 2047's form when it is not plain ASCII. */
const encoded = (v: string) =>
  /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v).toString('base64')}?=`;

/** One plain text email, a reply when it names a Gmail thread. */
export type Outgoing = {
  /** Addresses, separated by commas. */
  to: string;
  cc?: string;
  bcc?: string;
  /** The thread's own, as "Re: ...", when a reply gives none. */
  subject?: string;
  body: string;
  /** The Gmail thread it replies in. */
  threadId?: string;
  /** The Gmail message id it answers, else the thread's latest. */
  inReplyTo?: string;
};

/** A Markdown link to an https address, the only kind an email's HTML part makes a link. */
const LINK = /\[([^\]\n]+)\]\((https:\/\/[^\s()<>"]+)\)/g;

const escape = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The body as plain text, each https Markdown link as "text (address)". */
const plainText = (body: string) => body.replace(LINK, '$1 ($2)');

/** The body as HTML: every character escaped, line breaks kept, each https Markdown link a link. */
function html(body: string): string {
  let out = '';
  let at = 0;
  for (const m of body.matchAll(LINK)) {
    out += escape(body.slice(at, m.index));
    out += `<a href="${escape(m[2])}">${escape(m[1])}</a>`;
    at = m.index + m[0].length;
  }
  out += escape(body.slice(at));
  return `<div>${out.replace(/\r?\n/g, '<br>\n')}</div>`;
}

/** One MIME part's header and its text in base64, CRLF lines of 76. */
function part(type: string, text: string): string[] {
  const b64 = Buffer.from(text.replace(/\r?\n/g, '\r\n')).toString('base64');
  return [
    `Content-Type: ${type}; charset="UTF-8"`,
    'Content-Transfer-Encoding: base64',
    '',
    ...(b64.match(/.{1,76}/g) ?? [])
  ];
}

/**
 * The body as MIME: plain text alone, or, when it holds an https Markdown
 * link (such as the footer), plain text and HTML side by side, so the link
 * is a link in mail programs that show HTML.
 */
function bodyParts(written: string): string[] {
  // The footer goes as plain words in the editor and links only here.
  const body = linkFooter(written);
  if (!body.match(LINK)) return part('text/plain', body);
  const boundary = `oddboro-${randomUUID()}`;
  return [
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    ...part('text/plain', plainText(body)),
    `--${boundary}`,
    ...part('text/html', html(body)),
    `--${boundary}--`
  ];
}

const metadata = (names: string[]) =>
  `format=metadata${names.map((n) => `&metadataHeaders=${n}`).join('')}`;

/**
 * The message as Gmail takes it: `raw`, and the thread it goes in. A reply
 * carries In-Reply-To and References from the message it answers, so mail
 * programs keep it in the conversation.
 */
export async function message(
  token: Token,
  m: Outgoing
): Promise<{ raw: string; threadId?: string }> {
  const headers: Record<string, string> = { To: m.to };
  if (m.cc) headers.Cc = m.cc;
  if (m.bcc) headers.Bcc = m.bcc;
  let subject = m.subject;
  if (m.threadId) {
    const names = metadata(['Subject', 'Message-ID', 'References']);
    const answers = m.inReplyTo
      ? await google<Message>(token, `${GMAIL}/messages/${m.inReplyTo}?${names}`)
      : (await google<Thread>(token, `${GMAIL}/threads/${m.threadId}?${names}`)).messages?.at(-1);
    const was = header(answers, 'Subject');
    subject ??= /^re:/i.test(was) ? was : `Re: ${was}`;
    const parent = header(answers, 'Message-ID');
    if (parent) {
      headers['In-Reply-To'] = parent;
      headers.References = `${header(answers, 'References')} ${parent}`.trim();
    }
  }
  headers.Subject = encoded(oneLine(subject ?? ''));
  const raw = [
    ...Object.entries(headers).map(([k, v]) => `${k}: ${oneLine(v)}`),
    'MIME-Version: 1.0',
    ...bodyParts(m.body)
  ].join('\r\n');
  return { raw: base64url(raw), ...(m.threadId ? { threadId: m.threadId } : {}) };
}

/** Save an email as a Gmail draft. Nothing is sent. Gives the draft's id. */
export async function saveDraft(token: Token, m: Outgoing): Promise<string> {
  const draft = await google<{ id: string }>(
    token,
    `${GMAIL}/drafts`,
    send('POST', { message: await message(token, m) })
  );
  return draft.id;
}

/** Send an email. Only the office calls this, on the owner's click. Gives the sent message's id. */
export async function sendMail(token: Token, m: Outgoing): Promise<string> {
  const sent = await google<Message>(
    token,
    `${GMAIL}/messages/send`,
    send('POST', await message(token, m))
  );
  return sent.id;
}

/** One email as the owner reads it: who sent it, when, its subject and its body as plain text. */
export type Received = { from: string; date: string; subject: string; body: string };

/**
 * The email a reply answers: the message `inReplyTo` names in the thread,
 * else its latest that is not a draft. Undefined when the thread has none.
 */
export async function answered(
  token: Token,
  threadId: string,
  inReplyTo?: string
): Promise<Received | undefined> {
  const t = await google<Thread>(token, `${GMAIL}/threads/${threadId}?format=full`);
  const all = (t.messages ?? []).filter((m) => !m.labelIds?.includes('DRAFT'));
  const m = all.find((x) => x.id === inReplyTo) ?? all.at(-1);
  if (!m) return undefined;
  return {
    from: header(m, 'From'),
    date: header(m, 'Date'),
    subject: header(m, 'Subject'),
    body: contents(m).body
  };
}

/** One filter as Gmail keeps it. */
type Filter = {
  id: string;
  criteria?: FilterCriteria & { excludeChats?: boolean; size?: number; sizeComparison?: string };
  action?: { addLabelIds?: string[]; removeLabelIds?: string[]; forward?: string };
};

/** Gmail's own labels a filter adds or takes off, in the words after "will". */
const SYSTEM_ADDS: Record<string, string> = {
  STARRED: 'be starred',
  TRASH: 'go to the trash',
  IMPORTANT: 'be marked important',
  SPAM: 'go to spam'
};
const SYSTEM_REMOVES: Record<string, string> = {
  INBOX: 'skip the inbox',
  UNREAD: 'be marked read',
  IMPORTANT: 'never be marked important',
  SPAM: 'never go to spam'
};

/** A Gmail filter in plain words, its label ids turned into names. */
function filterLine(f: Filter, labelName: (id: string) => string): string {
  const c = f.criteria ?? {};
  const extra = [
    c.size && `${c.sizeComparison === 'smaller' ? 'smaller' : 'larger'} than ${c.size} bytes`,
    c.excludeChats && 'not chats'
  ].filter((p): p is string => !!p);
  const what = matchWords(c);
  const matches = extra.length ? `${what}, ${extra.join(', ')}` : what;
  const a = f.action ?? {};
  const does = [
    ...(a.removeLabelIds ?? []).map((l) => SYSTEM_REMOVES[l] ?? `lose the label "${labelName(l)}"`),
    ...(a.addLabelIds ?? []).map((l) =>
      l.startsWith('CATEGORY_')
        ? `go under ${l.slice(9).toLowerCase()}`
        : (SYSTEM_ADDS[l] ?? `get the label "${labelName(l)}"`)
    ),
    ...(a.forward ? [`be forwarded to ${a.forward}`] : [])
  ];
  return `Filter ${f.id}: ${matches} will ${does.length ? listed(does) : 'stay as it is'}.`;
}

/**
 * The Gmail search that finds what a filter matches, as Gmail itself reads
 * the filter: every field must match.
 */
export function filterQuery(c: FilterCriteria): string {
  const t = (v: string | undefined) => v?.replace(/[()]/g, ' ').trim();
  return [
    t(c.from) && `from:(${t(c.from)})`,
    t(c.to) && `to:(${t(c.to)})`,
    t(c.subject) && `subject:(${t(c.subject)})`,
    t(c.query) && `(${t(c.query)})`,
    t(c.negatedQuery) && `-(${t(c.negatedQuery)})`,
    c.hasAttachment && 'has:attachment'
  ]
    .filter(Boolean)
    .join(' ');
}

/** About how many emails a Gmail search finds today: Gmail's own estimate. */
export async function countMatching(token: Token, query: string): Promise<number> {
  const r = await google<{ resultSizeEstimate?: number }>(
    token,
    `${GMAIL}/messages?q=${encodeURIComponent(query)}&maxResults=1`
  );
  return r.resultSizeEstimate ?? 0;
}

/** A label name that is one of Gmail's own (Inbox, Trash, Spam and the rest), which a filter may not add. */
export class GmailOwnLabel extends Error {}

/**
 * The id of the owner's label with this name, matched without regard to
 * case, made first when there is none. Never one of Gmail's own labels, so
 * a label named "Trash" cannot send mail to the trash.
 */
export async function labelFor(token: Token, name: string): Promise<string> {
  const { labels = [] } = await google<{ labels?: Label[] }>(token, `${GMAIL}/labels`);
  const same = labels.filter((l) => l.name.toLowerCase() === name.toLowerCase());
  if (same.some((l) => l.type === 'system'))
    throw new GmailOwnLabel(`"${name}" is one of Gmail's own labels. Pick another name.`);
  if (same[0]) return same[0].id;
  const made = await google<Label>(
    token,
    `${GMAIL}/labels`,
    send('POST', { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' })
  );
  return made.id;
}

/** The label changes a filter's action makes, as Gmail takes them. */
export function labelChanges(
  a: FilterAction,
  labelId?: string
): { addLabelIds: string[]; removeLabelIds: string[] } {
  return {
    addLabelIds: [...(labelId ? [labelId] : []), ...(a.star ? ['STARRED'] : [])],
    removeLabelIds: [...(a.skipInbox ? ['INBOX'] : []), ...(a.markRead ? ['UNREAD'] : [])]
  };
}

/** Make a Gmail filter. Only the office calls this, on the owner's click. Gives the filter's id. */
export async function makeFilter(
  token: Token,
  criteria: FilterCriteria,
  changes: { addLabelIds: string[]; removeLabelIds: string[] }
): Promise<string> {
  const made = await google<{ id: string }>(
    token,
    `${GMAIL}/settings/filters`,
    send('POST', { criteria, action: changes })
  );
  return made.id;
}

/**
 * Make the same label changes to every email a search finds now: Gmail's
 * list a page at a time, then its batch change 1,000 at a time. Gives how
 * many emails it changed. Mail in the trash and spam is left alone.
 */
export async function tidyMatching(
  token: Token,
  query: string,
  changes: { addLabelIds: string[]; removeLabelIds: string[] }
): Promise<number> {
  const ids: string[] = [];
  let page: string | undefined;
  do {
    const r = await google<{ messages?: { id: string }[]; nextPageToken?: string }>(
      token,
      `${GMAIL}/messages?q=${encodeURIComponent(query)}&maxResults=500${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`
    );
    ids.push(...(r.messages ?? []).map((m) => m.id));
    page = r.nextPageToken;
  } while (page);
  for (let i = 0; i < ids.length; i += 1000)
    await google(
      token,
      `${GMAIL}/messages/batchModify`,
      send('POST', { ids: ids.slice(i, i + 1000), ...changes })
    );
  return ids.length;
}

export function gmailServer(token: Token): McpServer {
  const server = new McpServer({ name: 'gmail', version: '1.0.0' });
  const get = <T>(path: string) => google<T>(token, `${GMAIL}${path}`);
  const post = <T>(path: string, body: unknown = {}) =>
    google<T>(token, `${GMAIL}${path}`, send('POST', body));

  /** Label ids for ids or names, matched without regard to case. */
  async function labelIds(given: string[]): Promise<string[]> {
    if (!given.length) return [];
    const { labels = [] } = await get<{ labels?: Label[] }>('/labels');
    return given.map((g) => {
      const l =
        labels.find((l) => l.id === g) ??
        labels.find((l) => l.name.toLowerCase() === g.toLowerCase());
      if (!l) throw new Error(`no label is called "${g}". list_labels gives every label.`);
      return l.id;
    });
  }
  const modify = (thread: string, add: string[], remove: string[]) =>
    post(`/threads/${thread}/modify`, { addLabelIds: add, removeLabelIds: remove });

  const READ = { readOnlyHint: true };
  const WRITE = { readOnlyHint: false };
  const DESTROY = { readOnlyHint: false, destructiveHint: true };
  const thread = { thread_id: id.describe('The thread id, from search_threads.') };
  const max = z
    .number()
    .int()
    .positive()
    .optional()
    .describe('How many to return: 10 unless given, 50 at most.');

  server.registerTool(
    'search_threads',
    {
      description: `Search the owner's Gmail with Gmail's own query words (from:, is:unread, after:2026/01/01, label:, and plain words). Gives each thread's id, subject, sender, date of its latest message, snippet and labels. ${DATA_NOTE}`,
      inputSchema: {
        query: z.string().describe('A Gmail search, as typed in Gmail.'),
        max_results: max
      },
      annotations: READ
    },
    run(async ({ query, max_results = 10 }) => {
      const n = Math.min(max_results, 50);
      const { threads = [] } = await get<{ threads?: Thread[] }>(
        `/threads?q=${encodeURIComponent(query)}&maxResults=${n}`
      );
      if (!threads.length) return 'No thread matches that search.';
      const found = await inTurn(threads, async (t) => {
        const full = await get<Thread>(`/threads/${t.id}?${metadata(['Subject', 'From', 'Date'])}`);
        const first = full.messages?.[0];
        const last = full.messages?.at(-1);
        return {
          id: t.id,
          subject: header(first, 'Subject'),
          from: header(first, 'From'),
          date: header(last, 'Date'),
          snippet: decodeEntities(t.snippet ?? ''),
          labels: [...new Set(full.messages?.flatMap((m) => m.labelIds ?? []))]
        };
      });
      return untrusted('gmail', JSON.stringify(found, null, 2), 'search results');
    })
  );

  server.registerTool(
    'get_thread',
    {
      description: `Read a whole Gmail thread: each message's sender, recipients, date, subject, label ids and body as plain text, and the names and sizes of its attachments (never their content). ${DATA_NOTE}`,
      inputSchema: thread,
      annotations: READ
    },
    run(async ({ thread_id }) => {
      const t = await get<Thread>(`/threads/${thread_id}?format=full`);
      const messages = (t.messages ?? []).map((m) => {
        const { body, files } = contents(m);
        const lines = [
          ...['From', 'To', 'Cc', 'Date', 'Subject'].flatMap((h) =>
            header(m, h) ? [`${h}: ${header(m, h)}`] : []
          ),
          `Labels: ${(m.labelIds ?? []).join(', ')}`,
          ...(files.length ? [`Attachments: ${files.join('; ')}`] : []),
          '',
          body
        ];
        return untrusted('gmail', lines.join('\n'), m.id);
      });
      return [`Thread ${t.id}, ${messages.length} messages, oldest first.`, ...messages].join(
        '\n\n'
      );
    })
  );

  server.registerTool(
    'list_labels',
    {
      description: `List the owner's Gmail labels with their ids, Gmail's own (INBOX, UNREAD, STARRED) and the owner's. ${DATA_NOTE}`,
      annotations: READ
    },
    run(async () => {
      const { labels = [] } = await get<{ labels?: Label[] }>('/labels');
      const lines = labels.map((l) => `${l.id}: ${l.name}${l.type === 'system' ? ' (Gmail)' : ''}`);
      return untrusted('gmail', lines.join('\n'), 'labels');
    })
  );

  server.registerTool(
    'list_filters',
    {
      description: `List the owner's Gmail filters in plain words: what mail each one matches and what it does to it, with label names. Read it before propose_filter, so you never propose a filter the owner already has. ${DATA_NOTE}`,
      annotations: READ
    },
    run(async () => {
      const [{ filter = [] }, { labels = [] }] = await Promise.all([
        get<{ filter?: Filter[] }>('/settings/filters'),
        get<{ labels?: Label[] }>('/labels')
      ]);
      if (!filter.length) return 'There are no filters.';
      const name = (id: string) => labels.find((l) => l.id === id)?.name ?? id;
      return untrusted('gmail', filter.map((f) => filterLine(f, name)).join('\n'), 'filters');
    })
  );

  server.registerTool(
    'list_drafts',
    {
      description: `List the owner's Gmail drafts, newest first: draft id, thread id, recipients and subject. ${DATA_NOTE}`,
      inputSchema: { max_results: max },
      annotations: READ
    },
    run(async ({ max_results = 10 }) => {
      const n = Math.min(max_results, 50);
      const { drafts = [] } = await get<{ drafts?: { id: string }[] }>(`/drafts?maxResults=${n}`);
      if (!drafts.length) return 'There are no drafts.';
      const found = await inTurn(drafts, async (d) => {
        const { message } = await get<{ message: Message }>(
          `/drafts/${d.id}?${metadata(['To', 'Subject'])}`
        );
        return {
          id: d.id,
          thread_id: message.threadId,
          to: header(message, 'To'),
          subject: header(message, 'Subject')
        };
      });
      return untrusted('gmail', JSON.stringify(found, null, 2), 'drafts');
    })
  );

  server.registerTool(
    'update_labels',
    {
      description:
        'Add and remove labels on every message in a thread, by label id or name. This is how mail is marked read (remove UNREAD), marked unread (add UNREAD), archived (remove INBOX), moved back to the inbox (add INBOX) and starred (add STARRED).',
      inputSchema: {
        ...thread,
        add: z.array(z.string()).optional().describe('Label ids or names to add.'),
        remove: z.array(z.string()).optional().describe('Label ids or names to take off.')
      },
      annotations: WRITE
    },
    run(async ({ thread_id, add = [], remove = [] }) => {
      await modify(thread_id, await labelIds(add), await labelIds(remove));
      return `Thread ${thread_id}: added ${add.join(', ') || 'nothing'}, removed ${remove.join(', ') || 'nothing'}.`;
    })
  );

  server.registerTool(
    'create_draft',
    {
      description:
        'Write a draft in the owner\'s Gmail. Nothing is sent: the draft waits in Drafts. Give thread_id to draft a reply in that thread; the subject then defaults to the thread\'s. The office ends the body with a line "Sent from Oddboro", which the owner may delete: never write it yourself.',
      inputSchema: {
        to: z.string().describe('Addresses, separated by commas.'),
        cc: z.string().optional(),
        bcc: z.string().optional(),
        subject: z.string().optional(),
        body: z.string().describe('The message, as plain text.'),
        thread_id: id.optional().describe('The thread this replies to.')
      },
      annotations: WRITE
    },
    run(async ({ to, cc, bcc, subject, body, thread_id }) => {
      // The footer goes in now, where the owner sees it in Drafts and may delete it.
      const draft = await saveDraft(token, {
        to,
        cc,
        bcc,
        subject,
        body: withFooter(body),
        threadId: thread_id
      });
      return `Draft ${draft} is saved in Drafts. Nothing was sent.`;
    })
  );

  server.registerTool(
    'send_draft',
    {
      description:
        'Send a draft that already exists, by its draft id. It cannot write or change a message.',
      inputSchema: { draft_id: id.describe('The draft id, from create_draft or list_drafts.') },
      annotations: WRITE
    },
    run(async ({ draft_id }) => {
      const sent = await post<Message>('/drafts/send', { id: draft_id });
      return `Sent. Message ${sent.id} in thread ${sent.threadId}.`;
    })
  );

  /** A tool that does one thing to one thread. */
  const threadTool = (
    name: string,
    description: string,
    annotations: { readOnlyHint: boolean; destructiveHint?: boolean },
    act: (thread: string) => Promise<unknown>,
    done: string
  ) =>
    server.registerTool(
      name,
      { description, inputSchema: thread, annotations },
      run(async ({ thread_id }) => {
        await act(thread_id);
        return `Thread ${thread_id} ${done}.`;
      })
    );
  threadTool(
    'trash_thread',
    'Move a thread to the trash, where Gmail keeps it 30 days.',
    DESTROY,
    (t) => post(`/threads/${t}/trash`),
    'is in the trash'
  );
  threadTool(
    'untrash_thread',
    'Take a thread back out of the trash.',
    WRITE,
    (t) => post(`/threads/${t}/untrash`),
    'is out of the trash'
  );
  threadTool(
    'mark_thread_spam',
    'Report a thread as spam: it leaves the inbox for Spam.',
    DESTROY,
    (t) => modify(t, ['SPAM'], ['INBOX']),
    'is in Spam'
  );
  threadTool(
    'unmark_thread_spam',
    'Take a thread out of Spam and back to the inbox.',
    WRITE,
    (t) => modify(t, ['INBOX'], ['SPAM']),
    'is back in the inbox'
  );

  return server;
}

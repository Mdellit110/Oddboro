// The office's own Google Drive tools, as an MCP server inside the office
// process: find and read files, write new Docs and Sheets, and change a
// Doc's text or a Sheet's cells. The gateway reaches it in memory, so the
// owner's Google token never leaves the office. There is no tool to delete
// or trash a file.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { call, cap, DATA_NOTE, google, id, run, send, untrusted, type Token } from './http.ts';

const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const DOCS = 'https://docs.googleapis.com/v1/documents';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const ALL_DRIVES = 'supportsAllDrives=true';
const LISTED = 'id,name,mimeType,modifiedTime,owners(displayName,emailAddress),webViewLink';
const DETAILS = `${LISTED},createdTime,size,parents,description,shared,lastModifyingUser(displayName,emailAddress)`;

const DOC = 'application/vnd.google-apps.document';
const SHEET = 'application/vnd.google-apps.spreadsheet';
const SLIDES = 'application/vnd.google-apps.presentation';

type File = { id: string; name: string; mimeType: string; webViewLink?: string };

/** Drive's own query words. Anything without one is plain words to search for. */
const DRIVE_QUERY = /[=<>]|\b(contains|in\s+(parents|owners|writers|readers)|has\s*\{)\b/i;
const quoted = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** Files read as text when downloaded as they are. */
const textLike = (mime: string) =>
  mime.startsWith('text/') ||
  /^application\/(json|xml|javascript|x-yaml|yaml|x-sh|sql|csv|x-ndjson)$|\+(json|xml)$/.test(mime);

/** A grid of cells as CSV. */
const csv = (rows: unknown[][]) =>
  rows
    .map((r) =>
      r
        .map((c) => {
          const s = String(c ?? '');
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(',')
    )
    .join('\n');

/** An A1 range. A path of dots alone would step out of the address. */
const range = z
  .string()
  .min(1)
  .refine((r) => !/^\.+$/.test(r), 'That is not an A1 range.');

export function driveServer(token: Token): McpServer {
  const server = new McpServer({ name: 'google-drive', version: '1.0.0' });
  const READ = { readOnlyHint: true };
  const WRITE = { readOnlyHint: false };
  const file = { file_id: id.describe('The file id, from search_files.') };

  server.registerTool(
    'search_files',
    {
      description: `Search the owner's Google Drive. Takes Drive's own query (name contains 'budget' and mimeType = 'application/vnd.google-apps.spreadsheet') or plain words, which search file names and contents. Gives each file's name, id, type, last change, owners and link. ${DATA_NOTE}`,
      inputSchema: {
        query: z.string().describe('A Drive query, or plain words to look for.'),
        max_results: z.number().int().positive().optional().describe('10 unless given, 50 at most.')
      },
      annotations: READ
    },
    run(async ({ query, max_results = 10 }) => {
      const q = DRIVE_QUERY.test(query)
        ? query
        : `fullText contains ${quoted(query)} and trashed = false`;
      const params = new URLSearchParams({
        q,
        pageSize: String(Math.min(max_results, 50)),
        fields: `files(${LISTED})`,
        includeItemsFromAllDrives: 'true',
        supportsAllDrives: 'true'
      });
      const { files = [] } = await google<{ files?: File[] }>(token, `${DRIVE}?${params}`);
      if (!files.length) return 'No file matches that search.';
      return untrusted('drive', JSON.stringify(files, null, 2), 'search results');
    })
  );

  server.registerTool(
    'get_file_metadata',
    {
      description: `A Drive file's details: name, type, size, owners, who changed it last and when, its folders and its link. ${DATA_NOTE}`,
      inputSchema: file,
      annotations: READ
    },
    run(async ({ file_id }) => {
      const meta = await google(token, `${DRIVE}/${file_id}?fields=${DETAILS}&${ALL_DRIVES}`);
      return untrusted('drive', JSON.stringify(meta, null, 2), file_id);
    })
  );

  server.registerTool(
    'read_file_content',
    {
      description: `Read a Drive file as text: a Google Doc as Markdown, a Sheet as CSV (its first sheet, or the sheet or A1 range given), Slides as plain text, and text files as they are. Other files, such as PDFs and images, are refused. Text past 200,000 characters is cut, and says so. ${DATA_NOTE}`,
      inputSchema: {
        ...file,
        range: range
          .optional()
          .describe("For a Sheet: a sheet's name or an A1 range, such as 'Q3!A1:F40'.")
      },
      annotations: READ
    },
    run(async ({ file_id, range }) => {
      const meta = await google<File>(
        token,
        `${DRIVE}/${file_id}?fields=id,name,mimeType&${ALL_DRIVES}`
      );
      const exported = async (mime: string) =>
        (
          await call(token, `${DRIVE}/${file_id}/export?mimeType=${encodeURIComponent(mime)}`)
        ).text();
      let text: string;
      if (meta.mimeType === SHEET && range) {
        const { values = [] } = await google<{ values?: unknown[][] }>(
          token,
          `${SHEETS}/${file_id}/values/${encodeURIComponent(range)}`
        );
        text = csv(values);
      } else if (meta.mimeType === DOC) text = await exported('text/markdown');
      else if (meta.mimeType === SHEET) text = await exported('text/csv');
      else if (meta.mimeType === SLIDES) text = await exported('text/plain');
      else if (textLike(meta.mimeType))
        text = await (await call(token, `${DRIVE}/${file_id}?alt=media&${ALL_DRIVES}`)).text();
      else return `This file is ${meta.mimeType}, which cannot be read as text.`;
      return untrusted('drive', cap(text), file_id);
    })
  );

  server.registerTool(
    'create_file',
    {
      description:
        "Make a new file in the owner's Drive: a Google Doc from Markdown or plain text, or a Google Sheet from CSV. Gives back its id and link.",
      inputSchema: {
        name: z.string().min(1),
        kind: z
          .enum(['doc', 'sheet'])
          .describe('doc takes Markdown or plain text; sheet takes CSV.'),
        content: z.string(),
        folder_id: id.optional().describe('The folder to put it in. My Drive unless given.')
      },
      annotations: WRITE
    },
    run(async ({ name, kind, content, folder_id }) => {
      const meta = {
        name,
        mimeType: kind === 'doc' ? DOC : SHEET,
        ...(folder_id ? { parents: [folder_id] } : {})
      };
      const boundary = `oddboro-${crypto.randomUUID()}`;
      const body = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        JSON.stringify(meta),
        `--${boundary}`,
        `Content-Type: ${kind === 'doc' ? 'text/markdown' : 'text/csv'}; charset=UTF-8`,
        '',
        content,
        `--${boundary}--`
      ].join('\r\n');
      const made = await google<File>(
        token,
        `${UPLOAD}?uploadType=multipart&fields=id,name,webViewLink&${ALL_DRIVES}`,
        {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
          body
        }
      );
      return `Made "${made.name}", id ${made.id}: ${made.webViewLink}`;
    })
  );

  server.registerTool(
    'update_doc',
    {
      description:
        "Change a Google Doc's text: add to the end, or replace everything in it. The text goes in as plain text, without Markdown formatting.",
      inputSchema: {
        doc_id: id.describe("The Doc's file id."),
        mode: z.enum(['append', 'replace']),
        text: z.string()
      },
      annotations: WRITE
    },
    run(async ({ doc_id, mode, text }) => {
      const requests: unknown[] = [];
      if (mode === 'append') requests.push({ insertText: { endOfSegmentLocation: {}, text } });
      else {
        const doc = await google<{ body?: { content?: { endIndex?: number }[] } }>(
          token,
          `${DOCS}/${doc_id}?fields=body(content(endIndex))`
        );
        // A Doc always ends in a newline it will not let go, so the last index stays.
        const end = (doc.body?.content?.at(-1)?.endIndex ?? 1) - 1;
        if (end > 1)
          requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: end } } });
        requests.push({ insertText: { location: { index: 1 }, text } });
      }
      await google(token, `${DOCS}/${doc_id}:batchUpdate`, send('POST', { requests }));
      return mode === 'append'
        ? `Added the text to the end of ${doc_id}.`
        : `Replaced the text of ${doc_id}.`;
    })
  );

  server.registerTool(
    'update_values',
    {
      description:
        "Write cells in a Google Sheet. Values go in as if typed, so '=SUM(A1:A3)' becomes a formula and '3/4' may become a date.",
      inputSchema: {
        spreadsheet_id: id,
        range: range.describe("An A1 range, such as 'Sheet1!A1:C2'."),
        values: z
          .array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
          .describe('Rows of cells, top row first.')
      },
      annotations: WRITE
    },
    run(async ({ spreadsheet_id, range, values }) => {
      const done = await google<{ updatedRange?: string; updatedCells?: number }>(
        token,
        `${SHEETS}/${spreadsheet_id}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
        send('PUT', { range, majorDimension: 'ROWS', values })
      );
      return `Wrote ${done.updatedCells ?? 0} cells in ${done.updatedRange ?? range}.`;
    })
  );

  return server;
}

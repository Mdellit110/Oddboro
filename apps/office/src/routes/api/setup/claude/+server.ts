// How the office reaches Claude. GET says which login and model staff use, and
// on the Claude plan, which account it is signed in to. PUT
// changes them: a model, an API key (tried, then kept in the keychain), or back
// to the Claude plan. POST fixes a missing piece from the browser: `install`
// installs Claude Code and `sign-in` starts its login (or a switch to another
// account), each streaming the command's output a line at a time.
import { spawn } from 'node:child_process';
import { error, json } from '@sveltejs/kit';
import {
  claudeAccount,
  claudeSettings,
  cleanEnv,
  MODELS,
  setClaude,
  type Model
} from '#lib/server/claude.ts';
import type { RequestHandler } from './$types';

const withAccount = async () => {
  const settings = claudeSettings();
  return { ...settings, account: settings.auth === 'plan' ? await claudeAccount() : undefined };
};

export const GET: RequestHandler = async () => json(await withAccount());

export const PUT: RequestHandler = async ({ request }) => {
  const b = (await request.json().catch(() => ({}))) as {
    model?: unknown;
    key?: unknown;
    auth?: unknown;
  };
  const model = MODELS.includes(b.model as Model) ? (b.model as Model) : undefined;
  const r = await setClaude({
    ...(model !== undefined ? { model } : {}),
    ...(typeof b.key === 'string' ? { key: b.key } : {}),
    ...(b.auth === 'plan' ? { auth: 'plan' as const } : {})
  });
  if (!r.ok) error(400, r.problem);
  return json(await withAccount());
};

const COMMANDS = {
  install: ['npm', ['install', '-g', '@anthropic-ai/claude-code']],
  // Opens the sign-in page in the browser; the command ends when the owner finishes there.
  'sign-in': ['claude', ['auth', 'login', '--claudeai']]
} as const;

let running = false;

export const POST: RequestHandler = async ({ request }) => {
  const b = (await request.json().catch(() => ({}))) as { action?: unknown };
  const command = COMMANDS[b.action as keyof typeof COMMANDS];
  if (!command) error(400, 'Say install or sign-in');
  if (running) error(409, 'One is already running');
  running = true;
  const [cmd, args] = command;
  const encoder = new TextEncoder();
  // The page can leave before the command ends; the command still finishes.
  let open = true;
  const body = new ReadableStream<Uint8Array>({
    start(out) {
      const send = (o: unknown) => {
        if (open) out.enqueue(encoder.encode(`${JSON.stringify(o)}\n`));
      };
      const child = spawn(cmd, [...args], { stdio: ['ignore', 'pipe', 'pipe'], env: cleanEnv() });
      const lines = (chunk: Buffer) =>
        chunk
          .toString()
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .forEach((line) => send({ line }));
      child.stdout.on('data', lines);
      child.stderr.on('data', lines);
      // Five minutes is long enough for a slow install or for the owner to sign in.
      const timer = setTimeout(() => child.kill(), 5 * 60_000);
      let finished = false;
      const finish = (ok: boolean, line?: string) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        running = false;
        if (line) send({ line });
        send({ done: true, ok });
        if (open) out.close();
        open = false;
      };
      child.on('error', (e) => finish(false, e.message));
      child.on('close', (code) => finish(code === 0));
    },
    cancel() {
      open = false;
    }
  });
  return new Response(body, { headers: { 'content-type': 'application/x-ndjson' } });
};

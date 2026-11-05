// Bringing an agent the owner already has into Oddboro. GET lists the Claude
// Code agent files on this computer (~/.claude/agents, and `dir`'s
// .claude/agents when given). POST makes one an Odd: from a file it listed,
// or from pasted instructions with a name. The Odd runs on the office's own
// Claude with the agent's instructions. Its tools, memory and connections do
// not come along, and the answer says so for each.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { error, json } from '@sveltejs/kit';
import { hire, logEvent, readAgentFile, type ImportedAgent } from '@oddboro/ledger';
import { toProfile } from '#lib/staff/roster.ts';
import type { RequestHandler } from './$types';

/** Where agent files live: the home folder's, and one project folder's if named. Only under home. */
function folders(dir: string | null): string[] {
  const home = homedir();
  const out = [join(home, '.claude', 'agents')];
  if (dir) {
    const d = resolve(dir.replace(/^~(?=$|\/)/, home));
    const rel = relative(home, d);
    if (isAbsolute(rel) || rel.startsWith('..'))
      error(400, 'Pick a folder inside your home folder');
    out.push(join(d, '.claude', 'agents'));
  }
  return out.filter((f) => existsSync(f) && statSync(f).isDirectory());
}

function agentFiles(dir: string | null): { file: string; agent: ImportedAgent }[] {
  const found: { file: string; agent: ImportedAgent }[] = [];
  for (const folder of folders(dir))
    for (const name of readdirSync(folder)
      .filter((f) => f.endsWith('.md'))
      .slice(0, 50)) {
      const file = join(folder, name);
      if (statSync(file).size > 200_000) continue;
      const agent = readAgentFile(readFileSync(file, 'utf8'), name.replace(/\.md$/, ''));
      if (agent) found.push({ file, agent });
    }
  return found;
}

export const GET: RequestHandler = ({ url }) => {
  const list = agentFiles(url.searchParams.get('dir'));
  return json({
    searched: folders(url.searchParams.get('dir')),
    agents: list.map(({ file, agent }) => ({
      file,
      name: agent.name,
      description: agent.description,
      tools: agent.tools,
      model: agent.model ?? null
    }))
  });
};

/** The hand-drawn looks an imported Odd can wear, so none needs drawing. */
const LOOKS = ['ada', 'theo', 'juno', 'marshall'];

export const POST: RequestHandler = async ({ request }) => {
  const b = (await request.json().catch(() => ({}))) as {
    file?: unknown;
    dir?: unknown;
    name?: unknown;
    instructions?: unknown;
  };
  await logEvent('agent_import_attempt');
  let agent: ImportedAgent | undefined;
  let from: string;
  if (typeof b.file === 'string') {
    // Only a file the scan found, never a path the page made up.
    const hit = agentFiles(typeof b.dir === 'string' ? b.dir : null).find((a) => a.file === b.file);
    if (!hit) error(404, 'That agent file is not in the folders Oddboro looks in');
    agent = hit.agent;
    from = `Claude Code agent file ${hit.file}`;
  } else {
    const name = typeof b.name === 'string' ? b.name : '';
    const text = typeof b.instructions === 'string' ? b.instructions : '';
    agent = readAgentFile(text, name);
    from = 'instructions pasted by the owner';
    if (!agent) error(400, 'Give the agent a name and paste its instructions');
  }
  const desk = [
    `You are ${agent.name}, an agent ${'{owner}'} brought into Oddboro. Below are your own instructions, as they were written for you elsewhere (${from}).`,
    '',
    'In Oddboro you work in your own folder, with the office tools you are given. Tools, memory and connections you had elsewhere did not come with you. When your instructions name one you do not have here, say so plainly, and ask for access with ask_for_access if you need it.',
    '',
    '## Your instructions',
    '',
    agent.instructions
  ].join('\n');
  const look = LOOKS[Math.floor(Math.random() * LOOKS.length)];
  let row;
  try {
    row = await hire({
      name: agent.name,
      role: 'Brought in',
      room: 'workspace',
      permission: 'draft',
      remit:
        agent.description || `An agent you brought to Oddboro, running on its own instructions.`,
      desk,
      variant: look,
      portrait: `portrait-${look}`
    });
  } catch (e) {
    error(400, e instanceof Error ? e.message : String(e));
  }
  return json({
    staff: toProfile(row),
    kept: ['Its name and description', 'Its instructions, word for word'],
    left: [
      ...(agent.tools.length
        ? [
            `The tools it names (${agent.tools.join(', ')}): it works in its own folder here, and asks you for anything more`
          ]
        : []),
      ...(agent.model ? [`Its model (${agent.model}): it runs on the model your office uses`] : []),
      'Its memory and past conversations: it starts fresh',
      'Its outside connections: connect each one from its Access tab'
    ]
  });
};

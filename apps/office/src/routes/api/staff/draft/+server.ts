// Draft a job description for a new hire from a one-line brief. It runs as the
// office, not as a staffer, so an office with nobody on staff can hire.
import { error, json } from '@sveltejs/kit';
import { runAsOffice } from '#lib/server/office-run.ts';
import type { RequestHandler } from './$types';

const SYSTEM = `You write job descriptions for Odds, the Claude agents that
work for {owner} in Oddboro, a virtual office. A job description is the
Odd's standing instructions: every run it does starts from it. Call the
workers Odds (one Odd, two Odds), never staff or agents.`;

export const POST: RequestHandler = async ({ request }) => {
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const field = (k: string) =>
    typeof b[k] === 'string' ? (b[k] as string).trim().slice(0, 2000) : '';
  const brief = field('brief');
  if (!brief) error(400, 'Say in a sentence what the job is');
  const r = await runAsOffice(
    `Draft the job description for a new hire. {owner} will edit it before hiring.

Name: ${field('name') || 'not chosen yet'}
Role: ${field('role') || 'not chosen yet'}
Works in: ${field('room') || 'not chosen yet'}
Permission level: ${field('permission') || 'read'}
What {owner} wants: ${brief}

Use these sections, in this order:
1. A title line: "# <Name>, <Role>".
2. Who they work for: {owner}, in a sentence or two.
3. What they are for, as a numbered list.
4. What they may do, and what they never do, in this job. Leave out what
   may leave the office and when to ask first: every run states that rule
   from the Odd's level at the time, and a job description outlives a level.
5. Which asks and tasks they bring to {owner}'s desk, and when.
6. How they write to {owner}: the answer first, active voice, plain words,
   short numbered steps, no em-dashes.

Reply with the job description only, in Markdown.`,
    { system: SYSTEM, kind: 'draft', timeoutMs: 5 * 60_000 }
  );
  if (!r.ok) error(502, r.text);
  return json({ desk: r.text });
};

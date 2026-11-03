// A staffer's work in progress, as the office tools track it and the page
// shows it: a job, a follow-up (an approved ask, a rework, feedback) or a
// draft. Safe to import in the browser.

export type Work = {
  /** Unique while the office runs. */
  id: number;
  kind: 'job' | 'follow-up' | 'draft';
  /** The job's name or the ask's title. */
  label: string;
  /** What kind of work it is, in a few words: "Carrying out ask #20". */
  detail: string;
  /** When it started, or joined the line for a slot. */
  since: string;
  /** True while it waits for a free slot. */
  queued: boolean;
  askId?: number;
  /** The tool the staffer is using now, as Claude Code names it. */
  doing?: string;
  /** Tool calls so far. */
  steps: number;
};

/** A tool's name in plain words. */
export function toolWords(name: string): string {
  const built: Record<string, string> = {
    Read: 'Reading files',
    Glob: 'Looking for files',
    Grep: 'Searching files',
    Edit: 'Editing files',
    Write: 'Writing a file'
  };
  if (built[name]) return built[name];
  const m = /^mcp__(.+?)__(.+)$/.exec(name);
  return m ? `${m[2].replace(/_/g, ' ')} (${m[1]})` : name;
}

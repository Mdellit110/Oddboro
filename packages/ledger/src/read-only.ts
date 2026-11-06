// Which of an outside tool's tools a Read only grant reaches. One rule, the
// same every time for the same server: the server must mark the tool as only
// reading (MCP's `readOnlyHint`), must not mark it destructive, and its name
// must not say it changes something. The office cannot see what a tool on
// someone else's server does, so the server's own mark is the most it has;
// the name check only ever takes tools away, for a server that marks its
// tools wrong. The owner does not tick tools: a tool the server leaves
// unmarked is never Read only. The desk shows the result when a tool
// connects, and the office's gateway applies it again on every run
// (apps/office/src/lib/server/gateway.ts), so a server that changes its
// marks later loses the tool at once.

/** What a server says about one of its tools, as MCP's tools/list gives it. */
export type ToolMarks = {
  name: string;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
};

/**
 * Words that, anywhere in a tool's name, say it changes something. A read
 * tool with one of them in its name (`get_post`) is left out too: the rule
 * errs toward less.
 */
const CHANGES = new Set([
  'add',
  'append',
  'approve',
  'archive',
  'assign',
  'cancel',
  'capture',
  'clear',
  'close',
  'comment',
  'create',
  'delete',
  'destroy',
  'drop',
  'edit',
  'exec',
  'execute',
  'forward',
  'insert',
  'invite',
  'merge',
  'modify',
  'move',
  'patch',
  'post',
  'publish',
  'put',
  'remove',
  'rename',
  'reply',
  'reset',
  'run',
  'save',
  'send',
  'set',
  'share',
  'store',
  'submit',
  'update',
  'upload',
  'upsert',
  'write'
]);

/** A tool name's words: `multica_create_issue`, `createIssue` and `create-issue` all give create and issue. */
export function nameWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Whether a Read only grant reaches this tool. */
export function readsOnly(t: ToolMarks): boolean {
  return (
    t.annotations?.readOnlyHint === true &&
    t.annotations.destructiveHint !== true &&
    !nameWords(t.name).some((w) => CHANGES.has(w))
  );
}

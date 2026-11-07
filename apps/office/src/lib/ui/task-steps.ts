// Which of a task's steps hold up Mark done. Safe to import in the browser.
import type { Step } from '@oddboro/ledger';

/**
 * A step the office does something for: a sign-in, a secret, a tool list or
 * a choice, and the sign-in's step that ticks itself when it lands (it shares
 * the sign-in's `oauth:` key). The task cannot be done without these. Every
 * other step is a checklist the owner may tick or not.
 */
export const mustDo = (s: Step): boolean => !!s.action || !!s.key?.startsWith('oauth:');

/** How many steps still hold up Mark done. */
export const stepsToGo = (steps: Step[]): number =>
  steps.filter((s) => mustDo(s) && !s.done).length;

/**
 * A step's text as the desk renders it: a bare email address becomes inline
 * code, which copies on a click, instead of a mail link. A step says to type an
 * address far more often than to write to it. Addresses already in code or
 * inside a link stay as they are.
 */
export function stepText(text: string): string {
  // Code spans and Markdown links first, so the address inside one is skipped.
  return text.replace(
    /(`[^`]*`|\[[^\]]*\]\([^)]*\)|<[^>]*>)|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g,
    (all, kept: string | undefined, email: string | undefined) => (kept ? kept : `\`${email}\``)
  );
}

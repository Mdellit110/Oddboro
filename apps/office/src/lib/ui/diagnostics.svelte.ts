// The page's view of reports: whether the office can send them, whether they
// need a New Altitude sign-in, and the owner's answer. Set from the page data
// and after each answer; the page's trace sampler reads it.
import { reportsOffered, type Answer, type ReportsState } from '#lib/diagnostics.ts';
import { account } from './account.svelte.ts';
import { call } from './api.ts';

export const diagnostics = $state<ReportsState>({
  possible: false,
  account: false,
  answer: 'unasked'
});

/** Whether the page offers reports: the first-visit card, the Setup switch and the Desk's ask. */
export const shown = (): boolean => reportsOffered(diagnostics, account.status.state === 'in');

/** The answer the page's own traces follow: no while the page offers no reports. */
export const pageAnswer = (): Answer => (shown() ? diagnostics.answer : 'no');

/**
 * What a report never carries, in the words the owner approved. The ask and
 * the Setup switch both say it, so the two cannot drift apart.
 */
export const NEVER_CARRIED =
  "Reports never carry your chats, your Odds' work, your files, your family's details or your name. An error's message is included only when it comes from Oddboro's code.";

/** Keep the owner's answer in the office, then show it here. Throws with the server's message. */
export async function answerDiagnostics(answer: 'yes' | 'no'): Promise<void> {
  const kept = await call<{ answer: Answer }>('/api/diagnostics', { answer }, 'PUT');
  diagnostics.answer = kept.answer;
}

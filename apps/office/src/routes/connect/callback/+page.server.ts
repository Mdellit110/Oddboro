// Where a hosted server's sign-in page sends the owner back. Trades the code for
// tokens; the steps on their desk tick themselves.
import { finishSignIn } from '#lib/server/oauth.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const denied = url.searchParams.get('error');
  if (denied) return { ok: false, message: `The service said: ${denied}. Try Sign in again.` };
  if (!code || !state)
    return { ok: false, message: 'The sign-in came back without a code. Try Sign in again.' };
  try {
    await finishSignIn(state, code);
    return { ok: true, message: 'You can close this tab. The step on your desk ticked itself.' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
};

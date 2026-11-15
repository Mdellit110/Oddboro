// The return on a phone belongs to the computer that started the sign-in.
import { error, json } from '@sveltejs/kit';
import { ACCOUNT_PLACE, pendingSignIn } from '#lib/server/account.ts';
import { accountReturn } from '#lib/server/account-return.ts';
import { finishSignIn, REDIRECT } from '#lib/server/oauth.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => null);
  if (typeof body?.url !== 'string' || body.url.length > 8192 || typeof body.state !== 'string')
    error(400, 'Paste the return address from the sign-in you just opened.');
  const url = URL.parse(body.url);
  const state = url?.searchParams.get('state');
  const code = url?.searchParams.get('code');
  if (
    !url ||
    url.username ||
    url.password ||
    url.hash ||
    !state ||
    state !== body.state ||
    url.searchParams.getAll('state').length !== 1
  )
    error(400, 'This address does not match the open sign-in.');
  const redirect = url.origin + url.pathname;
  if (redirect !== REDIRECT && redirect !== ACCOUNT_PLACE.redirect)
    error(400, 'Paste the return address for this office.');
  if (!code || url.searchParams.has('error') || url.searchParams.getAll('code').length !== 1)
    error(400, 'The service did not authorize this sign-in. Start again.');
  // Use the saved verifier and one-use state. Never fetch the pasted address
  // or include its text or the provider's response in an error or log.
  try {
    if (redirect === REDIRECT) await finishSignIn(state, code);
    else {
      if (!pendingSignIn(state) || !(await accountReturn(url)).ok)
        error(400, 'Start this sign-in again.');
    }
  } catch {
    error(400, 'The office could not finish this sign-in. Start it again.');
  }
  return json({ ok: true });
};

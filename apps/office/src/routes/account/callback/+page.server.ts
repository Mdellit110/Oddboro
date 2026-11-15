import { accountReturn } from '#lib/server/account-return.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => accountReturn(url);

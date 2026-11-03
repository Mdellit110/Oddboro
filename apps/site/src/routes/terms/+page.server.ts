import { legal } from '#lib/server/legal.ts';

export const load = () => ({ doc: legal('terms', 'Terms of Use') });

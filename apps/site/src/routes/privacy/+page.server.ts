import { legal } from '#lib/server/legal.ts';

export const load = () => ({ doc: legal('privacy', 'Privacy Policy') });

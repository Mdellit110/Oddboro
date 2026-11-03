// Notifications, from the first card: `test` sends one to the Mac the way a
// staffer's ping does, and `settings` opens System Settings at Notifications.
import { error, json } from '@sveltejs/kit';
import { notifyMac, openNotificationSettings } from '#lib/server/notify.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const b = (await request.json().catch(() => ({}))) as { action?: unknown };
  if (b.action === 'test')
    return json({
      ok: await notifyMac('Oddboro', 'Notifications work. Your Odds ping you here.')
    });
  if (b.action === 'settings') return json({ ok: await openNotificationSettings() });
  error(400, 'Say test or settings');
};

// A notification on the owner's computer, for pings that should reach them
// with the office closed: a staffer's ping, or the setup test. While the tab
// is open the browser shows its own (Notification API), on every system.
//
// In the Mac app the server asks the app on stdout, one line each, and macOS
// shows it as Oddboro's (apps/desktop/src-tauri/src/server.rs). Run from the
// repo, each system has its own way, in the table below: osascript on a Mac
// (which macOS shows as Script Editor's, so Script Editor has to be allowed in
// System Settings, Notifications), and notify-send on Linux, which every
// desktop that follows the freedesktop notification spec shows. Windows has
// none yet: its entry is the place to add a toast.
import { execFile } from 'node:child_process';
import { IN_APP, SYSTEM, openUrl, type System } from '@oddboro/ledger';

/** One line: no tab or line break may reach the app inside the words. */
const flat = (s: string) => s.replace(/[\t\r\n]+/g, ' ');

const run = (cmd: string, args: string[]) =>
  new Promise<boolean>((done) => execFile(cmd, args, (e) => done(!e)));

const NOTIFY: Record<System, ((title: string, message: string) => Promise<boolean>) | undefined> = {
  // Arguments, not a script string, so the words need no escaping.
  mac: (title, message) =>
    run('osascript', [
      '-e',
      'on run argv',
      '-e',
      'display notification (item 1 of argv) with title (item 2 of argv) sound name "Glass"',
      '-e',
      'end run',
      message,
      title
    ]),
  linux: (title, message) => run('notify-send', ['--app-name', 'Oddboro', title, message]),
  windows: undefined
};

/** Where each system lets the owner allow notifications. Linux has no one place, so none. */
const SETTINGS: Record<System, string | undefined> = {
  mac: 'x-apple.systempreferences:com.apple.Notifications-Settings.extension',
  linux: undefined,
  windows: 'ms-settings:notifications'
};

/** Whether this computer can show the office's own notifications. */
export const CAN_NOTIFY = IN_APP || !!(SYSTEM && NOTIFY[SYSTEM]);

export function notifyMac(title: string, message: string): Promise<boolean> {
  if (IN_APP) {
    process.stdout.write(`oddboro:notify ${flat(title)}\t${flat(message)}\n`);
    return Promise.resolve(true);
  }
  const notify = SYSTEM && NOTIFY[SYSTEM];
  return notify ? notify(title, message) : Promise.resolve(false);
}

/** Open the system's notification settings, where it has one place for them. */
export function openNotificationSettings(): Promise<boolean> {
  const url = SYSTEM && SETTINGS[SYSTEM];
  return url ? openUrl(url) : Promise.resolve(false);
}

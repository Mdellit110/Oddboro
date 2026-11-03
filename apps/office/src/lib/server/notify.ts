// A notification on the owner's Mac: a staffer's ping, or the setup test.
// In the Mac app the server asks the app on stdout, one line each, and macOS
// shows it as Oddboro's (apps/desktop/src-tauri/src/server.rs). Run from the
// repo, it goes through `osascript`, which macOS shows as Script Editor's, so
// Script Editor has to be allowed in System Settings, Notifications.
import { execFile } from 'node:child_process';
import { IN_APP } from '@oddboro/ledger';

/** One line: no tab or line break may reach the app inside the words. */
const flat = (s: string) => s.replace(/[\t\r\n]+/g, ' ');

export function notifyMac(title: string, message: string): Promise<boolean> {
  if (IN_APP) {
    process.stdout.write(`oddboro:notify ${flat(title)}\t${flat(message)}\n`);
    return Promise.resolve(true);
  }
  return new Promise((done) =>
    // Arguments, not a script string, so the words need no escaping.
    execFile(
      'osascript',
      [
        '-e',
        'on run argv',
        '-e',
        'display notification (item 1 of argv) with title (item 2 of argv) sound name "Glass"',
        '-e',
        'end run',
        message,
        title
      ],
      (e) => done(!e)
    )
  );
}

/** Open System Settings at Notifications, where Oddboro or Script Editor is allowed. */
export function openNotificationSettings(): Promise<boolean> {
  return new Promise((done) =>
    execFile(
      'open',
      ['x-apple.systempreferences:com.apple.Notifications-Settings.extension'],
      (e) => done(!e)
    )
  );
}

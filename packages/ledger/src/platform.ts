// What differs between operating systems, in one place: where logs go, how a
// page opens in the browser, and how a login service runs. Each system gets
// one entry in the tables below. A Mac uses launchd and ~/Library/Logs, and
// Linux a systemd user unit and the XDG state folder. Windows has its paths
// and browser opener, and no login service yet: its entry is the one place to
// add Task Scheduler. Everything else in the office is the same code on each.
import { execFile, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type System = 'mac' | 'linux' | 'windows';

/** The system the office runs on, or undefined for one it does not know. */
export const SYSTEM: System | undefined = (
  { darwin: 'mac', linux: 'linux', win32: 'windows' } as const
)[process.platform as 'darwin' | 'linux' | 'win32'];
export const MAC = SYSTEM === 'mac';
export const LINUX = SYSTEM === 'linux';
export const WINDOWS = SYSTEM === 'windows';

/**
 * Where the office's logs go. XDG_STATE_HOME wins wherever it is set;
 * otherwise each system's own place for them.
 */
export const LOGS = process.env.XDG_STATE_HOME
  ? join(process.env.XDG_STATE_HOME, 'oddboro')
  : MAC
    ? join(homedir(), 'Library', 'Logs')
    : WINDOWS
      ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Oddboro', 'Logs')
      : join(homedir(), '.local', 'state', 'oddboro');

/** The office service's log. */
export const OFFICE_LOG = join(
  LOGS,
  MAC && !process.env.XDG_STATE_HOME ? 'oddboro-office.log' : 'office.log'
);

const run = (cmd: string, args: string[]) =>
  new Promise<boolean>((done) => execFile(cmd, args, (e) => done(!e)));

/**
 * Open a URL in the owner's browser. Windows goes through rundll32, not
 * `cmd /c start`, so the & in a query string is not read as a command.
 */
export function openUrl(url: string): Promise<boolean> {
  if (MAC) return run('open', [url]);
  if (WINDOWS) return run('rundll32', ['url.dll,FileProtocolHandler', url]);
  return run('xdg-open', [url]);
}

/**
 * An absolute path as Claude Code's permission rules write one: `//` and the
 * path in POSIX form. On Windows, C:\Users\ada becomes //c/Users/ada.
 */
export function rulePath(path: string): string {
  return `/${path.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, d: string) => `/${d.toLowerCase()}`)}`;
}

/**
 * How Claude Code starts a tool server's command. On Windows `npx` is a batch
 * file, which only cmd can run, so it goes through `cmd /c` there.
 */
export function toolCommand(command: string, args: string[]): { command: string; args: string[] } {
  return WINDOWS && command === 'npx'
    ? { command: 'cmd', args: ['/c', command, ...args] }
    : { command, args };
}

/** A program kept running at login, with its output in one log file. */
export type Service = {
  label: string;
  args: string[];
  log: string;
  cwd?: string;
  env?: Record<string, string>;
  /** Seconds to wait before starting it again after it stops. */
  throttle?: number;
};

/** How one system keeps a program running at login. */
type ServiceManager = {
  install(s: Service): Promise<boolean>;
  remove(label: string): Promise<void>;
  installed(label: string): Promise<boolean>;
  restart(label: string): Promise<boolean>;
  stopSync(label: string): void;
};

const xml = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const quoted = (s: string) => `"${s.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
const quietly = (cmd: string, args: string[]) => {
  try {
    execFileSync(cmd, args, { stdio: 'ignore' });
  } catch {
    // Not running.
  }
};

export function launchdPlist(s: Service): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    `  <key>Label</key><string>${xml(s.label)}</string>`
  ];
  if (s.cwd) lines.push(`  <key>WorkingDirectory</key><string>${xml(s.cwd)}</string>`);
  lines.push('  <key>ProgramArguments</key>', '  <array>');
  for (const a of s.args) lines.push(`    <string>${xml(a)}</string>`);
  lines.push('  </array>');
  if (s.env) {
    lines.push('  <key>EnvironmentVariables</key>', '  <dict>');
    for (const [k, v] of Object.entries(s.env))
      lines.push(`    <key>${xml(k)}</key><string>${xml(v)}</string>`);
    lines.push('  </dict>');
  }
  lines.push('  <key>RunAtLoad</key><true/>', '  <key>KeepAlive</key><true/>');
  if (s.throttle) lines.push(`  <key>ThrottleInterval</key><integer>${s.throttle}</integer>`);
  lines.push(
    `  <key>StandardOutPath</key><string>${xml(s.log)}</string>`,
    `  <key>StandardErrorPath</key><string>${xml(s.log)}</string>`,
    '</dict>',
    '</plist>',
    ''
  );
  return lines.join('\n');
}

// A user unit started from default.target runs before the desktop exists, so
// it never learns WAYLAND_DISPLAY or DISPLAY, and nothing it runs can open a
// window (Claude Code's sign-in among them). Starting with the graphical
// session gives it the desktop's environment, as launchd does on a Mac.
export function systemdUnit(s: Service): string {
  const lines = [
    '[Unit]',
    `Description=Oddboro (${s.label})`,
    'After=graphical-session.target',
    '',
    '[Service]',
    `ExecStart=${s.args.map(quoted).join(' ')}`
  ];
  if (s.cwd) lines.push(`WorkingDirectory=${s.cwd}`);
  for (const [k, v] of Object.entries(s.env ?? {}))
    lines.push(`Environment=${quoted(`${k}=${v}`)}`);
  lines.push(
    'Restart=always',
    `RestartSec=${s.throttle ?? 5}`,
    `StandardOutput=append:${s.log}`,
    `StandardError=append:${s.log}`,
    '',
    '[Install]',
    'WantedBy=graphical-session.target',
    ''
  );
  return lines.join('\n');
}

const uid = () => process.getuid?.() ?? 501;
const plist = (label: string) => join(homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
const launchd: ServiceManager = {
  async install(s) {
    writeFileSync(plist(s.label), launchdPlist(s));
    await run('launchctl', ['bootout', `gui/${uid()}/${s.label}`]);
    return run('launchctl', ['bootstrap', `gui/${uid()}`, plist(s.label)]);
  },
  async remove(label) {
    await run('launchctl', ['bootout', `gui/${uid()}/${label}`]);
    rmSync(plist(label), { force: true });
  },
  installed: (label) => run('launchctl', ['print', `gui/${uid()}/${label}`]),
  restart: (label) => run('launchctl', ['kickstart', '-k', `gui/${uid()}/${label}`]),
  stopSync: (label) => quietly('launchctl', ['bootout', `gui/${uid()}/${label}`])
};

const unitFile = (label: string) =>
  join(
    process.env.XDG_CONFIG_HOME || join(homedir(), '.config'),
    'systemd',
    'user',
    `${label}.service`
  );
const systemd: ServiceManager = {
  async install(s) {
    mkdirSync(join(unitFile(s.label), '..'), { recursive: true });
    writeFileSync(unitFile(s.label), systemdUnit(s));
    await run('systemctl', ['--user', 'daemon-reload']);
    // reenable drops a link an older unit left under default.target.
    await run('systemctl', ['--user', 'reenable', `${s.label}.service`]);
    return run('systemctl', ['--user', 'restart', `${s.label}.service`]);
  },
  async remove(label) {
    await run('systemctl', ['--user', 'disable', '--now', `${label}.service`]);
    rmSync(unitFile(label), { force: true });
    await run('systemctl', ['--user', 'daemon-reload']);
  },
  installed: (label) => run('systemctl', ['--user', 'is-enabled', '--quiet', `${label}.service`]),
  restart: (label) => run('systemctl', ['--user', 'restart', `${label}.service`]),
  stopSync: (label) => quietly('systemctl', ['--user', 'stop', `${label}.service`])
};

/** Each system's login services. Windows (Task Scheduler) is not written yet. */
const SERVICES: Record<System, ServiceManager | undefined> = {
  mac: launchd,
  linux: systemd,
  windows: undefined
};
const services = SYSTEM && SERVICES[SYSTEM];

/** Whether this system can keep the office running at login. */
export const CAN_RUN_AT_LOGIN = !!services;

/** Start a service now and at every login, replacing any older one under its label. */
export async function installService(s: Service): Promise<boolean> {
  if (!services) return false;
  mkdirSync(LOGS, { recursive: true });
  return services.install(s);
}

/** Stop a service and take it off the login list. */
export async function removeService(label: string): Promise<void> {
  await services?.remove(label);
}

/** Whether a service is set to start at login. */
export async function serviceInstalled(label: string): Promise<boolean> {
  return (await services?.installed(label)) ?? false;
}

/** Start a service again, now. */
export async function restartService(label: string): Promise<boolean> {
  return (await services?.restart(label)) ?? false;
}

/** Stop a service now and wait for it, so its files are free. It starts again at login. */
export function stopServiceSync(label: string): void {
  services?.stopSync(label);
}

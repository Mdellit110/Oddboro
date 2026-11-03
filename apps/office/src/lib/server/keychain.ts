// Connector secrets live in the macOS keychain, never in Postgres or a file.
// Each is a generic password under the service "oddboro", named
// "<connector>:<NAME>".
import { execFileSync } from 'node:child_process';

const SERVICE = 'oddboro';

export function setSecret(connector: string, name: string, value: string): void {
  execFileSync('security', [
    'add-generic-password',
    '-U',
    '-s',
    SERVICE,
    '-a',
    `${connector}:${name}`,
    '-w',
    value
  ]);
}

export function getSecret(connector: string, name: string): string | undefined {
  try {
    return execFileSync(
      'security',
      ['find-generic-password', '-s', SERVICE, '-a', `${connector}:${name}`, '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trimEnd();
  } catch {
    return undefined;
  }
}

/**
 * A secret as the header it goes in. An Authorization value pasted without its
 * scheme is a bare key, so it gets the Bearer every API we connect to expects.
 */
export function headerSecret(connector: string, name: string): string {
  const value = getSecret(connector, name) ?? '';
  return name.toLowerCase() === 'authorization' && value && !/\s/.test(value)
    ? `Bearer ${value}`
    : value;
}

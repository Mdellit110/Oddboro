// Connector secrets, kept in the system's own secret store
// (@oddboro/ledger/secrets): the Keychain on a Mac, the desktop keyring on
// Linux. Never in Postgres or a file.
import { getSecret } from '@oddboro/ledger/secrets';

export { deleteSecret, getSecret, setSecret } from '@oddboro/ledger/secrets';

/**
 * A secret as the header it goes in. An Authorization value pasted without its
 * scheme is a bare key, so it gets the Bearer every API we connect to expects.
 */
export function headerSecret(connector: string, name: string): string {
  return asHeader(name, getSecret(connector, name) ?? '');
}

/** A key as the header named `name` carries it. */
export function asHeader(name: string, value: string): string {
  return name.toLowerCase() === 'authorization' && value && !/\s/.test(value)
    ? `Bearer ${value}`
    : value;
}

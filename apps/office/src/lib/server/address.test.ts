// The office's own Caddyfile (`ownCaddyfile` in address.ts) on each system.
// Run with `npm test -w @oddboro/office`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ownCaddyfile } from './address.ts';

const binds = (system: Parameters<typeof ownCaddyfile>[0]) =>
  ownCaddyfile(system)
    .split('\n')
    .filter((l) => /^\s*(default_)?bind\b/.test(l));

test("the office's own Caddy listens on the loopback addresses only on Windows; on a Mac, where a user binds a low port only on every address, and on Linux, unmeasured, it names no address", () => {
  assert.deepEqual(binds('windows'), ['\tdefault_bind 127.0.0.1 [::1]']);
  assert.deepEqual(binds('mac'), []);
  assert.deepEqual(binds('linux'), []);
});

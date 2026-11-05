// The office's own Caddyfile (`OWN_CADDYFILE` in address.ts). Run with
// `npm test -w @oddboro/office`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OWN_CADDYFILE } from './address.ts';

test("the office's own Caddy listens on this computer's loopback addresses only, on every system", () => {
  const binds = OWN_CADDYFILE.split('\n').filter((l) => /^\s*(default_)?bind\b/.test(l));
  assert.deepEqual(binds, ['\tdefault_bind 127.0.0.1 [::1]']);
});

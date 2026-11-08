// Text from an HTML email, as the Odd reads it. Run with `npm test -w @oddboro/office`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { htmlToText } from './http.ts';

test('no tag survives, even one hidden inside another', () => {
  const text = htmlToText(
    '<p>Hi</p><scr<script>x</script>ipt>alert(1)</script><!-<!-- a -->- b --><b>Ann</b>'
  );
  assert.doesNotMatch(text, /<script|<!--/i);
  assert.match(text, /Hi/);
  assert.match(text, /Ann/);
});

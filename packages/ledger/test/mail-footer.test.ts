// The footer every email Oddboro writes ends with: plain words where the owner
// edits, a link only as the email goes. Run with `npm test -w @oddboro/ledger`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { linkFooter, MAIL_FOOTER, withFooter } from '../src/mail-footer.ts';

test('the footer is plain words, added once', () => {
  assert.equal(MAIL_FOOTER, 'Sent from Oddboro');
  assert.equal(withFooter('Friday works.\n\n'), 'Friday works.\n\nSent from Oddboro');
  assert.equal(withFooter('Hi.\n\nSent from Oddboro'), 'Hi.\n\nSent from Oddboro');
  assert.equal(
    withFooter('Hi.\n\nSent from [Oddboro](https://oddboro.com)'),
    'Hi.\n\nSent from [Oddboro](https://oddboro.com)'
  );
});

test('only a last line that is the footer links, as the email goes', () => {
  assert.equal(
    linkFooter('Hi.\n\nSent from Oddboro\n'),
    'Hi.\n\nSent from [Oddboro](https://oddboro.com)'
  );
  // The owner deleted it, or wrote the words elsewhere: nothing changes.
  assert.equal(linkFooter('Hi.'), 'Hi.');
  assert.equal(linkFooter('Sent from Oddboro\n\nThanks'), 'Sent from Oddboro\n\nThanks');
});

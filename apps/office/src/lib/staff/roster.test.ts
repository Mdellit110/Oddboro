// The words the floor shows for an Odd. Run with `npm test -w @oddboro/office`.
import { test } from 'node:test';
import { ownerWords } from '../../../../../packages/ledger/test/owner-words.ts';
import { ACTIVITY_LABEL } from './roster.ts';

test('no floor label names a thread or a hand-off', () => {
  ownerWords(...Object.values(ACTIVITY_LABEL));
});

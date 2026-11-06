# scripts/

Lint guards. Plain Node running TypeScript directly, no dependencies. All run
first in `npm run lint` through `lint:guards`.

- `check-voice.ts`. Fails on em-dashes and stock machine-written phrases in any text file. Add a phrase when one slips through.
- `check-stack.ts`. Fails if any package depends on a UI framework other than Svelte.
- `check-directions.ts`. Fails on physical left and right in Svelte classes, style blocks and CSS.
- `check-context-index.ts`. Fails if a `CLAUDE.md` is missing from its nearest ancestor's index, or if one names a file that does not exist.
- `check-ledger.ts`. Fails if a decision file is misnamed, holds more than one entry, runs over 4,000 bytes, repeats a headline, or reads as provisional.
- `check-private.ts`. Fails if a word from `data/private-words.txt` (the owner's name, family, accounts; git ignores the list) appears in any tracked file or file name. Fails when the list is missing, and skips with a notice when `CI` is set. `ODDBORO_PRIVATE_WORDS` points it at another list.
- `check-secrets.ts`. Fails if a tracked file is a key, certificate or `.env` file, holds a private key or an API token in a provider's published shape (Anthropic, OpenAI, GitHub, AWS, Google, Slack, Stripe, Apify, the updater's signing key), or names a home folder (`/Users/<name>/`, `/home/<name>/`; `/Users/Shared` and CI's `runner` pass). It needs no list, so it runs the same in CI.
- `check-platform.ts`. Fails if a `.ts` or `.svelte` source file under `apps/office/src` or `packages/*/src` reads `process.platform` anywhere but `packages/ledger/src/platform.ts`; every other reader calls `currentPlatform()`, so a test that fakes the system reaches it. Tests and comments are left out. So is `apps/desktop/scripts`: those build the app, they are not the office. Fails when `platform.ts` has no read, since then there is nothing to check.
- `lib/files.ts`. The shared file list and reporter.

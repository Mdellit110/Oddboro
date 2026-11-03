# docs/decisions/

The ledger: every live decision, one file each. Grep it before planning a
change.

## Find one

1. `grep -ril <keyword> docs/decisions/` lists file names. Read the two or
   three that matter.
2. `ls docs/decisions/*_office_*` lists one area.
3. `ls docs/decisions | tail` lists the newest.

## Record one

1. Create `docs/decisions/<YYYY-MM-DD>_<area>_<slug>.md`. The slug is a few
   lowercase hyphenated words from the headline. A sub-area like `art/rooms`
   writes `/` as `.` in the file name.
2. Write one line: `- [area] **Decision (YYYY-MM-DD): the ruling.** The
reason in a sentence or two. Where the detail lives.`
3. Keep it under 4,000 bytes. Move detail to a doc and point to it.

## Supersede one

Edit the old file in place and add "supersedes the <date> ruling" as a short
trailing clause. Rename the file if the date or area changed. Delete a retired
decision's file. Only live decisions stay here.

## Never

- Never write a provisional entry. If it is not decided, it stays out of
  the repo.
- Never put a decision in a `CLAUDE.md`.

`scripts/check-ledger.ts` enforces the name, the one-line shape, the size cap,
unique headlines, and the provisional words.

## Areas

`[arch]` structure and stack · `[office]` how the office works · `[staff]`
staff, roles and permissions · `[art]` sprites, palette and rooms · `[data]`
personal data · `[deploy]` ports, hosting, offices · `[site]` the public
website · `[meta]` process and docs

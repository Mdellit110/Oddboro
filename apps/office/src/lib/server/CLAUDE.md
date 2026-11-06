# apps/office/src/lib/server

The office's server side: each Odd's runs and the AI tools they go through,
office runs, the job clock, events and the keychain. How it all works is in
`apps/office/CLAUDE.md`; this file says where to start a change here.

## Where to touch

Each kind of thing starts at its one declaration; the type checker or a test
then names every other place.

- To let a run have a variable from the office's own environment, add its
  name to `RUN_ENV_ALLOW` in `run-env-allow.ts`, for every system, one system
  or one tool, with a comment saying which tool needs it and why. A run gets
  nothing else of the office's environment (`runEnv`).
- A variable the office's tool server reads as it starts goes in
  `TOOL_SERVER_ENV` in `run-env-allow.ts`. The tool server's entry, which
  every tool's launch reads, sets it by name (`toolServerEnv`), so the server
  never depends on the AI tool passing it on.
- To sandbox a tool on a new system, start at `SANDBOX_PATHS` in
  `sandbox-paths.ts`. `sandbox-paths.test.ts` fails until that system's paths
  are declared for every tool that sandboxes there.
- To add an AI tool, or a system a tool runs on, start at `AGENTS` and
  `AGENT_PLATFORMS` in the ledger's `agents.ts`. `launch-contract.test.ts`
  then starts every tool on every system it runs on, from an office whose
  environment holds things no run should get, and fails its type check until
  the new tool has an Odd there and a reader of its walls (`WALLS`).
- To call out of the computer from new code (a door to an outside service,
  such as a persona's, an error report, or a new connector kind), add or
  update the file's entry in `OUTBOUND` in the repo's `scripts/outbound.ts`:
  how many calls, where they go, what they send and whose yes covers them.
  `npm run lint` fails until the entry matches the code. A kind of call the
  guard does not name yet (a new client library's constructor or init) goes
  in `scripts/check-outbound.ts` too.

## Later

Each line says what to do when its trigger comes.

- Building Stop for a run (NEW-1701), or any new kind of run: first make the
  run registers one registry with a stop handle. Today they are `slots`,
  `chatting` and `inProgress` in `staff.ts` and `runsGoing` in the ledger's
  `office.ts`, and `runsActive` in `staff.ts` reads two of them. The job
  clock's `running` in `jobs.ts` stays its own.
- Building NEW-1651 or NEW-1654, whichever comes first: give each run one
  row of its own, with `runs.jobId` optional, usage pointing at the run, and
  one reader per tool of that tool's stream.
- Building NEW-1657 (Claude Code's commands on Linux): first make one run
  plan every tool's launch reads, and move Claude Code's launch out of
  `staff.ts` into a file of its own beside `codex.ts`, `grok.ts` and
  `gemini.ts`.
- Before any change to what Odds are told (`house.ts`, a run's brief, or the
  lines in the ledger's `capabilities.ts`): add snapshot tests of each kind of
  run's prompt, so the change shows as a diff in review.

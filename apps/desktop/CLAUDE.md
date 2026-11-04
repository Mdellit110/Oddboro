# apps/desktop

Oddboro for the Mac. A Tauri v2 shell in Rust that runs the office server
(`apps/office`, built with adapter-node) on a bundled Node and shows it in a
window. Apple Silicon only, macOS 13 or later. No UI framework: the only page
of its own is `loading/index.html`.

## What the shell does

1. Checks for a newer version before anything else (`update::on_launch`,
   5 second timeout). If there is one, the loading window says "Updating
   Oddboro to X.Y.Z", and the shell downloads it, checks its signature,
   installs it and opens the new version. Offline or any error, it logs the
   problem and starts as it is. See "Updates" below.
2. Checks the port. If anything answers on it, shows "another office is
   already running" and quits. It never attaches to that office.
3. Reads the owner's login-shell PATH once (`$SHELL -l -c`, 5 second
   timeout), then adds `/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin`
   and `~/.claude/local` if missing.
4. Starts Node, shows the small loading window, and asks `GET /` every half
   second for up to 90 seconds. When it answers, the main window opens the
   office and the loading window closes. On timeout, a dialog shows the last
   lines of the log and the app quits.
5. Writes Node's stdout and stderr to `~/Library/Logs/Oddboro/office.log`,
   with its own lines prefixed `oddboro:`. Past 10 MB the log moves to
   `office.log.1` when Node next starts.
6. Restarts Node when it dies: after 1s, 5s, then 30s, at most 5 times in 10
   minutes. Then it shows the log tail and quits. After a restart the main
   window reloads.
7. Runs `/usr/bin/caffeinate -s -w <node pid>` beside Node, so the Mac stays
   awake on AC power while the office runs.
8. Closing the main window hides it. The Dock icon and the menu bar item
   (Open Oddboro, Open at login, Quit Oddboro) bring it back. Open at login
   uses `tauri-plugin-autostart` in LaunchAgent mode.
9. On quit, sends Node SIGTERM, waits up to 10 seconds, then SIGKILL. A
   SIGTERM, SIGINT or SIGHUP to the shell itself quits the same way. A second
   one kills the shell at once.
10. Keeps links to the office's own origin in the window. Links to any other
    origin, `mailto:` and `tel:`, and every `target="_blank"` or
    `window.open`, open in the default browser.

The page gets no Tauri IPC: there are no capability files, and remote pages
never get IPC without one.

## The contract with the server

- Entry: `<resources>/server/apps/office/build/index.js`, run with cwd
  `<resources>/server/apps/office`.
- Node: the sidecar `Contents/MacOS/node`, from
  `src-tauri/binaries/node-aarch64-apple-darwin`.
- Env Node gets:

| Variable               | Value                                                     |
| ---------------------- | --------------------------------------------------------- |
| `PORT`                 | the port, 4500 unless the shell's env sets `ODDBORO_PORT` |
| `ODDBORO_PORT`         | the same                                                  |
| `HOST`                 | `127.0.0.1`                                               |
| `ORIGIN`               | `http://127.0.0.1:<port>`                                 |
| `ODDBORO_HOME`         | `~/.oddboro`, unless the shell's env sets it              |
| `ODDBORO_CODE`         | `<resources>/server`                                      |
| `ODDBORO_DB_PORT`      | passed through when the shell's env sets it               |
| `PATH`                 | the login-shell PATH from step 3                          |
| `ODDBORO_VERSION`      | the app's version, like `0.0.4`                           |
| `ODDBORO_UPDATE_TOKEN` | a fresh secret per run, release builds only               |

- `ODDBORO_APP=1`. With it the server quits on SIGTERM once its HTTP server
  closes, and when its stdin closes (`apps/office/src/hooks.server.ts`). It
  also has no web address: onboarding skips the address step and the office
  never touches Caddy.
- Node's stdout is a pipe too. A line `oddboro:notify <title>\t<text>` is a
  notification, which the shell shows as Oddboro's (`mac-notification-sys`,
  with the Glass sound). A line `oddboro:update-check` is the owner's Check
  now. Every other line goes to the log.
- Node's stdin is a pipe the shell holds open. It closes when the shell dies
  by any means, Force Quit included, so a force-quit shell never leaves Node
  running on the port.
- `ODDBORO_SERVER_URL`, when set, skips Node and opens that URL. Use it to run
  the shell against `vite dev`.

## Updates

Every update is required. `src-tauri/src/update.rs` runs them with
`tauri-plugin-updater`, in release builds only.

1. The app checks
   `https://github.com/New-Altitude/Oddboro/releases/latest/download/latest.json`.
   A draft release is invisible there, so nothing updates until the owner
   publishes one. `ODDBORO_UPDATE_URL` replaces the address, for testing on
   this Mac only.
2. On launch it installs a newer version before the server starts (step 1
   above).
3. While the office runs it checks every 4 hours, and when the server writes
   `oddboro:update-check` (Check now in Setup). It downloads a new version in
   the background and checks its signature against the public key in
   `tauri.conf.json`, then `POST`s `{ version, notes }` to
   `http://127.0.0.1:<port>/api/update` with the header
   `X-Oddboro-Update-Token`. A check that finds nothing posts
   `{ checked: true }`; one that fails posts `{ failed }`.
4. Then it asks `GET /api/update` every 30 seconds. When the answer has
   `install: true` (the server decides, see `apps/office/CLAUDE.md`), it stops
   Node the usual way (`server::stop`), installs, and opens the new version.
5. It reopens itself with `open -n` and passes every `ODDBORO_*` variable on
   with `--env`, since launchd drops the old process's environment. Tauri's
   own `restart()` would lose them.
6. The private key that signs updates lives outside the repo, in
   `~/.tauri/oddboro-updater.key` on the owner's Mac, its password in the
   keychain (`security find-generic-password -s oddboro-updater-key -a password -w`),
   and both in the GitHub secrets below. Losing it means no installed app can
   update again.

## Files

- `src-tauri/src/main.rs`. Windows, the menu bar item, links, and the
  startup steps.
- `src-tauri/src/server.rs`. Starting, watching, restarting and stopping Node.
- `src-tauri/src/env.rs`. Port, home, log path and the login-shell PATH.
- `src-tauri/src/update.rs`. Checking, downloading and installing updates,
  and asking the server when.
- `src-tauri/tauri.conf.json`. The app, with no sidecar or resources, so
  `cargo check` and `cargo clippy` work before anything is staged.
- `src-tauri/tauri.bundle.conf.json`. Adds `externalBin` and the
  `../stage/` to `server/` resource map. `npm run bundle` and `release.ts`
  merge it.
- `src-tauri/tauri.release.conf.json`. Turns on `createUpdaterArtifacts`.
  Only `release.ts` merges it, since it needs the updater key.
- `loading/loading.js`. The loading window's words: "Opening the office", or
  "Updating Oddboro to X.Y.Z" when the shell sets `window.oddboroUpdating`.
- `src-tauri/Entitlements.plist`. `allow-jit` and
  `allow-unsigned-executable-memory`, which V8 in Node needs under the
  hardened runtime. No App Sandbox: the server spawns `claude` and reads
  `~/.claude`.
- `scripts/stage.ts`. Builds the office and the sprites, then lays out
  `stage/`: the office build, production `node_modules` at the versions
  installed in the repo, and the ledger, sprites and world as plain
  JavaScript (types stripped, `.ts` imports rewritten) in
  `node_modules/@oddboro/`, with their files beside them. It fetches the Node
  binary for this machine's Node version and checks it against nodejs.org's
  sums. `--smoke` starts the stage on port 4590 with a throwaway home, waits
  for it to answer, and checks it quits on SIGTERM:
  `node apps/desktop/scripts/stage.ts --smoke`.
- `stage/` must hold no folder symlinks. The bundler walks it without
  following them, so a linked folder never reaches the app.
- `stage/`, `src-tauri/binaries/`, `src-tauri/target/` and `src-tauri/gen/`
  are gitignored.

## Releases come from GitHub only

Public releases are built, signed and notarized on GitHub's Mac runners, never
on a developer's Mac: Tauri writes the source folder's full path into the app,
and on a developer's Mac that path names them. `scripts/release.ts` maps Rust's
own source paths to neutral ones and refuses to sign a build that still holds
the builder's home folder. Local builds stay for testing: `npm run bundle`, or
a signed `tauri build --bundles app` run beside the owner's office on 4510.

`.github/workflows/release.yml` runs on every push to `main` and by hand:

1. Picks the next patch version from the highest release tag, drafts
   included (none gives `0.0.1`). The committed version never changes; the
   build sets it (`release.ts --version`).
2. Installs Node from `.nvmrc`, Rust stable with `aarch64-apple-darwin`, and
   the repo's packages, with caches.
3. Imports the Developer ID certificate into a temporary keychain.
4. Runs `release.ts`: build, sign, notarize with the API key, staple, the
   updater archive and its signature, and `latest.json` pointing at the
   release's own assets.
5. Creates a DRAFT release `vX.Y.Z` on the merge commit, with GitHub's
   generated notes and these assets: `Oddboro.dmg` (the site's Download button
   links to `releases/latest/download/Oddboro.dmg`, so every release carries
   that name), `Oddboro_X.Y.Z_aarch64.dmg`, `Oddboro_X.Y.Z_aarch64.app.tar.gz`,
   its `.sig`, and `latest.json`.
6. The owner reads the draft and presses Publish. Installed apps pick it up at
   their next check.

The repo must be public for installed apps to reach the release. While it is
private, `latest.json` answers 404 to them.

### Secrets

Set each as a secret of the `release` environment (the repo's Settings,
Environments, release), never as a repo secret. Only `main` may use that
environment, so a workflow run from any other branch, or a pull request, never
sees the keys. Set one with `gh secret set <NAME> -R New-Altitude/Oddboro --env
release`. Never commit a value.

| Secret                               | What it is                                                  | How to make it                                                                                                                                         |
| ------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `APPLE_CERTIFICATE`                  | The Developer ID Application certificate and key, as base64 | Keychain Access, export "Developer ID Application: New Altitude, Inc." as `cert.p12` with a password, then `base64 -i cert.p12 \| pbcopy`              |
| `APPLE_CERTIFICATE_PASSWORD`         | The password set on that export                             | Chosen at export                                                                                                                                       |
| `APPLE_API_KEY`                      | The App Store Connect API key, the `.p8` file's contents    | App Store Connect, Users and Access, Integrations, Team Keys, a key with Developer access. Download `AuthKey_<id>.p8`, then `pbcopy < AuthKey_<id>.p8` |
| `APPLE_API_KEY_ID`                   | That key's ID                                               | The Key ID column on the same page                                                                                                                     |
| `APPLE_API_ISSUER`                   | The team's issuer ID                                        | The Issuer ID above the keys on the same page                                                                                                          |
| `TAURI_SIGNING_PRIVATE_KEY`          | The updater signing key                                     | `pbcopy < ~/.tauri/oddboro-updater.key`                                                                                                                |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Its password                                                | `security find-generic-password -s oddboro-updater-key -a password -w \| pbcopy`                                                                       |
| `KEYCHAIN_PASSWORD`                  | Any random string, for the runner's temporary keychain      | `openssl rand -hex 24 \| pbcopy`                                                                                                                       |

### A test build on this Mac

`release.ts --test` signs with the Developer ID in this keychain, skips
notarizing, and lets the app take an `http://` `ODDBORO_UPDATE_URL`. Never ship
one.

```sh
export TAURI_SIGNING_PRIVATE_KEY=~/.tauri/oddboro-updater.key
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(security find-generic-password -s oddboro-updater-key -a password -w)"
ODDBORO_RELEASE_URL=http://127.0.0.1:4598 \
  node apps/desktop/scripts/release.ts --version 0.0.91 --test --out /tmp/oddboro-0.0.91
```

## Placeholders

- The icons. A night rounded square with an ember ring, drawn as a stand-in
  until Oddboro has a mark. Regenerate with
  `npm run tauri -w @oddboro/desktop -- icon <1024px png> -o src-tauri/icons`,
  then delete the `android/`, `ios/`, `Square*`, `StoreLogo.png`,
  `64x64.png` and `icon.ico` files it also writes. `icons/tray.png` is the
  menu bar ring, a template image macOS tints.
- No `signingIdentity` in the config: `release.ts` passes the Developer ID
  as `APPLE_SIGNING_IDENTITY`.

## Commands

Run from the repo root.

```sh
npm run shell -w @oddboro/desktop     # tauri dev against ODDBORO_SERVER_URL, default http://127.0.0.1:4500
npm run bundle -w @oddboro/desktop    # tauri build: Oddboro.app and the .dmg, aarch64
npm run check-types -w @oddboro/desktop   # cargo check
npm run lint -w @oddboro/desktop      # cargo clippy -D warnings, cargo fmt --check, prettier
```

`npm run bundle` writes to `src-tauri/target/aarch64-apple-darwin/release/bundle/`.

`shell` and `bundle` are not named `dev` and `build`, so the root
`npm run dev` and `npm run build` never start a Rust build or a window.
Bundling needs `stage/` and the Node binary first.

A debug binary (`cargo build` in `src-tauri/`) has no bundle. It falls back
to `src-tauri/binaries/node-aarch64-apple-darwin` and `stage/`. Its error
dialogs never show: without a parent window they go through
`CFUserNotification`, which needs a bundle. To run it beside the owner's
office:

```sh
ODDBORO_PORT=4510 ODDBORO_DB_PORT=54510 ODDBORO_HOME=/tmp/oddboro-test-home \
  src-tauri/target/aarch64-apple-darwin/debug/oddboro
```

## Pinned versions

- `@tauri-apps/cli` 2.12.4
- `tauri` 2.12.5, `tauri-build` 2.7.4
- `tauri-plugin-autostart` 2.7.0, `tauri-plugin-dialog` 2.8.4
- `tauri-plugin-updater` 2.14.1, `serde_json` 1.0.154
- `libc` 0.2.191
- `mac-notification-sys` 0.6.15

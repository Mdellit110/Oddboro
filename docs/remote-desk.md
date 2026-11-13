# Reaching the office from your phone

Run Oddboro on a computer at home that stays on, and open it from your phone
anywhere, over Tailscale. Only your own devices can reach it. Nobody else on
the internet can.

How it works: the office still listens on 127.0.0.1 only. Tailscale gives the
home computer a private https name that only devices signed in to your
Tailscale account can reach, and forwards that name to the office. The office
answers the name once you list it in `.env`.

These steps are for a Mac or a Linux computer. Where they differ, each step
says so. They take about 15 minutes.

## 1. Run the office on the home computer

1. Install Oddboro from the repo and run `npm run setup`. Finish the first
   visit in the browser on that computer.
2. **Linux only.** Set the computer to log in to its desktop by itself when
   it starts. On Ubuntu: Settings, Users, Automatic Login. The office's login
   service starts with the desktop, so it needs a desktop session.
3. Run `npm run service:install -w apps/office`. The office now starts at
   every login and restarts if it stops. On a Mac it also keeps the Mac awake
   while it is on power.
4. Set the computer never to sleep.
   - **Mac:** System Settings, Energy (Battery on a laptop), and turn on
     "Prevent automatic sleeping when the display is off".
   - **Linux:** on Ubuntu, Settings, Power, Automatic Suspend, Off.

## 2. Put the computer on your tailnet

1. Install Tailscale.
   - **Mac:** the Tailscale app from tailscale.com/download or the App Store.
   - **Linux:** `curl -fsSL https://tailscale.com/install.sh | sh`
2. Sign in.
   - **Mac:** open the Tailscale app from the menu bar and log in.
   - **Linux:** `sudo tailscale up`, then open the link it prints.
3. In the Tailscale admin console (login.tailscale.com), open DNS and turn on
   MagicDNS and HTTPS Certificates.
4. Forward the computer's Tailscale name to the office.
   - **Mac:** `tailscale serve --bg http://127.0.0.1:4500`, with no `sudo`.
     If the `tailscale` command is missing, turn on the CLI in the Tailscale
     app's settings.
   - **Linux:** `sudo tailscale serve --bg http://127.0.0.1:4500`
5. Run `tailscale serve status` and note the name it shows, such as
   `home-pc.tail1234.ts.net`.

Use `tailscale serve`, never `tailscale funnel`. Funnel puts the name on the
open internet, and the office has no login of its own.

## 3. Let the office answer that name

1. Open `.env` at the top of the repo.
2. Add a line with the name from step 2.5, with no `https://`:
   `ODDBORO_EXTRA_HOSTS=home-pc.tail1234.ts.net`
3. Restart the office.
   - **Mac:** `launchctl kickstart -k gui/$(id -u)/com.oddboro.office`
   - **Linux:** `systemctl --user restart com.oddboro.office`

To list more than one name, separate them with commas.

## 4. Open the desk on your phone

1. Install the Tailscale app on your phone and sign in to the same account.
2. Open `https://home-pc.tail1234.ts.net/desk` in the phone's browser.
3. Approve or deny something to check that it works.

The whole office is at the same address without `/desk`, but it is made for
a bigger screen.

## 5. Add the desk to your home screen

It then opens like an app, straight to the desk.

- **iPhone:** in Safari, tap Share, then Add to Home Screen.
- **Android:** in Chrome, tap the menu, then Add to home screen or Install
  app.

Some things need the computer: a hire, a sign-in to a service, and picking a
different folder. The desk says "Open this at the office" for those. Replying
to a report also happens at the office, in the Odd's chat.

## 6. Get a buzz when something lands

1. Open the desk from its home screen icon. On an iPhone this is the only
   way it can buzz.
2. Tap **Buzz me** at the top.
3. Allow notifications when the phone asks.

The button now reads **Buzz on**. Tap it again to turn the buzz off for this
phone. Each phone is turned on by itself.

The buzz says only "Something is waiting on your desk." Nothing from the desk
is in it. It goes through your phone's own push service (Apple's or
Google's), which sees only that a message arrived.

## Check that it is closed to everyone else

1. Turn Tailscale off on your phone.
2. Open the same address. It should not load.
3. Turn Tailscale back on.

The office on the home computer itself still works at
`http://127.0.0.1:4500` as before.

Check the Tailscale name from the phone, not from the home computer. A Mac
may not open its own tailnet name: the browser or `curl` fails with an error
about TLS, while the phone opens it fine. That is Tailscale's, not the
office's.

## If something goes wrong

- **"This office answers only at its own address".** The name in `.env` does
  not match the one you opened, or the office was not restarted after the
  change.
- **"Blocked request. This host is not allowed".** Same cause: the office has
  not read the new name yet. Restart it.
- **The page does not load at all.** Check `tailscale serve status` on the
  home computer, and that Tailscale is on in the phone.
- **The office does not start after a reboot.** On Linux, the desktop did
  not log in by itself: check step 1.2. The office's log is in
  `~/Library/Logs/oddboro-office.log` on a Mac and
  `~/.local/state/oddboro/office.log` on Linux.
- **Buzz me fails with a message about the secret store.** The office keeps
  its push key in the Keychain on a Mac and in the desktop keyring on Linux.
  On Linux with automatic login, the keyring can stay locked: unlock it once
  after each start, or give it no password.
- **No buzz arrives.** Look for `[push]` lines in the office's log. They give
  the push service's answer.

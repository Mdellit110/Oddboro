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

1. In the office, open **Setup** and find **Your phone**. It shows this
   computer's Tailscale name, such as `home-pc.tail1234.ts.net`. If it says
   Tailscale is missing or off, finish section 2 and press **Check again**.
2. If it shows a `tailscale serve` command, you skipped step 2.4: run that
   command, then press **Check again**.
3. Press **Let my phone in**. The office answers that name from now on.
4. If Setup says to restart the office, restart it once. Only an office run
   with `npm run dev` or the login service needs this.
   - **Mac:** `launchctl kickstart -k gui/$(id -u)/com.oddboro.office`
   - **Linux:** `systemctl --user restart com.oddboro.office`

Setup then shows the desk's link and a QR code. Scan it with your phone's
camera in section 4.

Setup writes the name into `.env` as `ODDBORO_EXTRA_HOSTS`. You can also add
it there by hand, with no `https://`, and separate more than one name with
commas.

## 4. Put the desk on your phone

Each phone needs the Tailscale app, signed in to the same Tailscale account
as the home computer. Then follow the steps for your phone.

### iPhone

You need iOS 16.4 or later for the buzz. Check in Settings, General, About.

1. Install Tailscale from the App Store.
2. Open it, sign in, and allow it to add a VPN configuration when iOS asks.
3. Scan the QR code in Setup with the Camera app, or open
   `https://home-pc.tail1234.ts.net/desk` in Safari.
4. Approve or deny something to check that it works.
5. Tap the Share button, then **Add to Home Screen**, then **Add**. On iOS 17
   and later, Chrome and other browsers can do this too, from their own
   Share button.
6. Close Safari and open the desk from its new **Desk** icon. It opens with no
   address bar.
7. Tap **Buzz me** at the top, then **Allow** when iOS asks.

An iPhone can buzz only for a desk opened from its home screen icon. In
Safari itself the desk says to add it first.

If the buzz stops, check Settings, Notifications, Desk, and that no Focus
is hiding it.

### Android

1. Install Tailscale from the Play Store.
2. Open it, sign in, and allow the VPN connection when Android asks.
3. Scan the QR code in Setup with the camera, or open
   `https://home-pc.tail1234.ts.net/desk` in Chrome.
4. Approve or deny something to check that it works.
5. Tap the menu, then **Add to home screen** or **Install app**.
6. Open the desk from its new **Desk** icon.
7. Tap **Buzz me** at the top, then **Allow** when Android asks.

If the buzz stops, check Settings, Apps, Chrome, Notifications.

### What the desk does

- **Desk** shows what is waiting. New items arrive live, with no reload.
  Approve, deny or send back an ask, work through a task's steps, and read a
  report.
- **Chat** lists your Odds. Tap one to talk to it, as in the office. A
  report's **Reply** opens that Odd's chat too.
- Some things need the computer: a hire, a sign-in to a service, and picking
  a different folder. The desk says "Open this at the office" for those.
- **Buzz on** at the top turns the buzz off again for that phone. Each phone
  is turned on by itself.

The buzz says only "Something is waiting on your desk." Nothing from the desk
is in it. It goes through your phone's own push service, Apple's or
Google's, which sees only that a message arrived.

The whole office is at the same address without `/desk`, but it is made for
a bigger screen.

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

- **"This office answers only at its own address".** The office does not
  answer that name yet. Press **Let my phone in** in Setup, or check the name
  in `.env`.
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

// Every published release, newest first, for /releases/. Add one when its
// draft on GitHub is published, with the same version as its tag. A release
// may carry art: a name from scripts/release-art.ts, whose looping GIF and
// still `npm run art` writes for night (static/art/releases/) and for day
// (static/art/day/releases/). The page shows the theme's pair. The newest
// release's art is also the page's link preview, from the frame named as
// `share` in release-art.ts.
import type { BuildId } from '#lib/downloads.svelte.ts';

export type Release = {
  version: string;
  /** The day it was published on GitHub, in Pacific time, as YYYY-MM-DD. */
  date: string;
  title: string;
  summary: string;
  notes: string[];
  /** The builds this release carries. */
  builds: BuildId[];
  art?: {
    name: string;
    alt: string;
    /** What the link preview's frame shows. */
    shareAlt: string;
  };
};

export const RELEASES: Release[] = [
  {
    version: '0.0.7',
    date: '2026-11-06',
    title: 'Updating on Windows no longer starts over.',
    summary:
      'On Windows, the update to 0.0.6 installed 0.0.5 again and started over, with no way to stop it. We shipped the wrong installer. Windows now updates straight to 0.0.7.',
    notes: [
      'Each try left a copy of the installer behind. To get the space back, delete the Oddboro-0.0.6-updater folders in %TEMP%.',
      'When you give an Odd a service that is already connected, Oddboro now says the Odd can use it. It no longer points you to a task that is not there.'
    ],
    builds: ['mac', 'windows-x64', 'windows-arm64', 'linux-x86_64', 'linux-aarch64'],
    art: {
      name: 'loop',
      alt: 'An Odd walks along the office hallway, off its end and back in at its start, three times, saying "UPDATING!", then "AGAIN?", then "AND AGAIN?". The fourth time, it stops halfway, turns to face you and says "OUT OF THE LOOP!"',
      shareAlt:
        'An Odd stands in a pixel-art office hallway, facing out, and says "OUT OF THE LOOP!"'
    }
  },
  {
    version: '0.0.6',
    date: '2026-11-05',
    title: 'Odds pass the work along.',
    summary:
      'Your Office Manager hands pieces of a goal to the Odds you hired, and their work comes back to your Desk.',
    notes: [
      "Your office and each Odd can run on Claude Code, Codex or Grok. You pick the office's at setup.",
      'Each Odd can have its own sign-in, model and thinking level.',
      'Tell an Odd something once, and it keeps it as a lesson.',
      'You can give an Odd folders on your computer to read or change. It can also run commands and browse the web, once you turn those on.',
      "Build an Odd's look from parts, or have it drawn.",
      "Odds can use hosted tools that take a key instead of a sign-in, like Open Brain. The key stays in your computer's password store.",
      'Fixed a bug that was preventing Revoke access for an Odd from working.'
    ],
    builds: ['mac', 'windows-x64', 'windows-arm64', 'linux-x86_64', 'linux-aarch64'],
    art: {
      name: 'hand-off',
      alt: 'Two Odds pass things back and forth in a hallway, a speech bubble for each: a folder ("HAND-OFF!", "HANDS ON!", "FOLDER AND WISER"), a book with an X on it ("CODEX MARKS THE SPOT"), a hop ("GROK ON!"), a sticky note slapped on the wall ("LESSON? IT STUCK."), a key into a brain that lights up ("NO BRAINER!"), and the key taken back ("BACKSIES!").',
      shareAlt:
        'In a pixel-art hallway, an Odd holds a glowing brain with a key in it and says "NO BRAINER!", while another Odd watches.'
    }
  },
  {
    version: '0.0.5',
    date: '2026-11-04',
    title: 'Windows, on Windows, on Windows.',
    summary: 'Oddboro runs on Windows. Download the installer for your chip, x64 or arm64.',
    notes: [
      'Windows warns before the installer runs while it is not signed. Select More info, then Run anyway. This will be solved as soon as we get our Notarization Approval.',
      'Closing the window pauses the music. Opening it again plays on.',
      'The volume slider works on Linux.'
    ],
    builds: ['mac', 'windows-x64', 'windows-arm64', 'linux-x86_64', 'linux-aarch64'],
    art: {
      name: 'windows',
      alt: 'An Odd walks along an endless office hallway, past a window in every other square of the wall and a lamp now and then, and the hallway never ends.',
      shareAlt:
        'An Odd walks along a pixel-art office hallway with a window in every other square of the wall.'
    }
  },
  {
    version: '0.0.4',
    date: '2026-11-04',
    title: 'We closed a gap that could let other websites reach your office.',
    summary:
      'A page open in your browser could send your office requests, like approving an ask. That was our mistake. Now the office takes changes only from its own window.',
    notes: [],
    builds: ['mac', 'linux-x86_64', 'linux-aarch64'],
    art: {
      name: 'locked-door',
      alt: 'The office front door stands open. An Odd walks up, its two doors slide shut together, and it locks them with a CLICK, then steps back, a padlock on the door, and turns to face the street.',
      shareAlt:
        'An Odd stands on the sidewalk facing out, beside the shut front door of a pixel-art office with a padlock on it.'
    }
  },
  {
    version: '0.0.3',
    date: '2026-11-03',
    title: 'Oddboro runs on Linux.',
    summary:
      'Download the AppImage for your chip, x86_64 or arm64, and open it. It does what the Mac app does.',
    notes: [
      'It needs systemd, a keyring and notifications. GNOME and KDE have all three.',
      'On a desktop with no tray, like stock GNOME, closing the window quits Oddboro.'
    ],
    builds: ['mac', 'linux-x86_64', 'linux-aarch64'],
    art: {
      name: 'linux',
      alt: 'An Odd types at a desk. A penguin jumps out of the monitor, arcs over the desk and lands on the floor.',
      shareAlt: 'A pixel-art penguin stands on the office floor beside an Odd typing at its desk.'
    }
  },
  {
    version: '0.0.2',
    date: '2026-11-03',
    title: 'A stuck sign-in starts over.',
    summary:
      'If you close the Claude sign-in page too soon, open it again or cancel. You no longer wait five minutes to try again.',
    notes: [],
    builds: ['mac'],
    art: {
      name: 'stuck-sign-in',
      alt: 'An Odd walks up to the office front door and bumps into it, three times, then backs away with a question mark over its head.',
      shareAlt:
        'An Odd stands outside the shut front door of a pixel-art office with a question mark over its head.'
    }
  },
  {
    version: '0.0.1',
    date: '2026-11-02',
    title: 'Hello, world.',
    summary:
      'The first Oddboro: a pixel office on your Mac, where AI workers called Odds take jobs off your hands.',
    notes: [
      'You pick your Office Manager, your first Odd. It runs the floor and helps you hire the rest.',
      'Odds work on your Claude plan or an Anthropic API key.',
      'Each Odd gets only the access its job needs.',
      'It runs on Macs with Apple silicon.'
    ],
    builds: ['mac'],
    art: {
      name: 'hello-world',
      alt: 'An Odd types at a desk, and a speech bubble above it spells out "Hello, world!" one letter at a time.',
      shareAlt: 'An Odd types at a desk under a speech bubble that says "Hello, world!"'
    }
  }
];

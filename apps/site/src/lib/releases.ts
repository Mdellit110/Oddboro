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
  /** The day it was published, as YYYY-MM-DD. */
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
    version: '0.0.3',
    date: '2026-11-04',
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
    date: '2026-11-03',
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

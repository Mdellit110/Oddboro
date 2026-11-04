// Every published release, newest first, for /releases/. Add one when its
// draft on GitHub is published, with the same version as its tag. A release
// may carry art: a name from scripts/release-art.ts, whose looping GIF and
// still `npm run art` writes for night (static/art/releases/) and for day
// (static/art/day/releases/). The page shows the theme's pair.
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
  art?: { name: string; alt: string };
};

export const RELEASES: Release[] = [
  {
    version: '0.0.2',
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
      alt: 'An Odd types at a desk. A penguin jumps out of the monitor, arcs over the desk and lands on the floor.'
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
      alt: 'An Odd types at a desk, and a speech bubble above it spells out "Hello, world!" one letter at a time.'
    }
  }
];

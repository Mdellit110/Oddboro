// The builds Oddboro ships, and which one this visitor's computer wants. The
// page renders the Mac build first, so it is whole with no script; in the
// browser, `detectBuild` switches to the Linux build on Linux. The answer
// stays in this page and goes nowhere.
import { SITE } from '#lib/site.ts';

export type BuildId = 'mac' | 'linux-x86_64' | 'linux-aarch64';

export type Build = {
  id: BuildId;
  /** What the button says after "Download for". */
  system: string;
  /** Who Get started's heading names: "Download Oddboro for ...". */
  audience: string;
  /** The build named in full, for the list of every build. */
  label: string;
  /** The file every release carries under this name, so the newest one has a fixed link. */
  file: string;
  /** The file in one version's release. */
  versioned: (version: string) => string;
  requirements: string[];
  install: string[];
};

export const BUILDS: Build[] = [
  {
    id: 'mac',
    system: 'Mac',
    audience: 'your Mac',
    label: 'Mac, Apple silicon',
    file: 'Oddboro.dmg',
    versioned: (v) => `Oddboro_${v}_aarch64.dmg`,
    requirements: [
      'A Mac with Apple silicon',
      'macOS 13 or later',
      'A Claude plan, or an Anthropic API key'
    ],
    install: [
      'Open Oddboro.dmg.',
      'Drag Oddboro to Applications.',
      'Open Oddboro from Applications.'
    ]
  },
  {
    id: 'linux-x86_64',
    system: 'Linux',
    audience: 'Linux',
    label: 'Linux, x86_64',
    file: 'Oddboro-x86_64.AppImage',
    versioned: (v) => `Oddboro_${v}_x86_64.AppImage`,
    requirements: [
      'Linux on x86_64, with systemd and a desktop',
      'A keyring and notifications (GNOME, KDE and most others)',
      'A Claude plan, or an Anthropic API key'
    ],
    install: [
      'Move Oddboro-x86_64.AppImage to ~/Applications.',
      'Allow it to run: chmod +x ~/Applications/Oddboro-x86_64.AppImage',
      'Open it.'
    ]
  },
  {
    id: 'linux-aarch64',
    system: 'Linux',
    audience: 'Linux',
    label: 'Linux, arm64',
    file: 'Oddboro-aarch64.AppImage',
    versioned: (v) => `Oddboro_${v}_aarch64.AppImage`,
    requirements: [
      'Linux on arm64, with systemd and a desktop',
      'A keyring and notifications (GNOME, KDE and most others)',
      'A Claude plan, or an Anthropic API key'
    ],
    install: [
      'Move Oddboro-aarch64.AppImage to ~/Applications.',
      'Allow it to run: chmod +x ~/Applications/Oddboro-aarch64.AppImage',
      'Open it.'
    ]
  }
];

/** The newest published release's copy of a build. */
export const latestHref = (b: Build) => `${SITE.releases}/latest/download/${b.file}`;

/** One version's copy of a build. */
export const versionHref = (b: Build, version: string) =>
  `${SITE.releases}/download/v${version}/${b.versioned(version)}`;

const byId = (id: BuildId) => BUILDS.find((b) => b.id === id)!;

/** The build this visitor gets first. Every download button reads it. */
export const download = $state({ build: byId('mac') });

let detected = false;

type UAData = {
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>;
};

/**
 * Picks the build for this computer, once per page load. Linux gets an
 * AppImage for its chip; anything else keeps the Mac build, and the list of
 * every build is one link away. Chromium reports x86_64 in its user agent on
 * every Linux machine, so its own hint decides the chip there.
 */
export async function detectBuild(): Promise<void> {
  if (detected || typeof navigator === 'undefined') return;
  detected = true;
  const ua = navigator.userAgent;
  const data = (navigator as Navigator & { userAgentData?: UAData }).userAgentData;
  const platform = data?.platform ?? navigator.platform ?? '';
  const linux = /linux/i.test(platform) || (/linux|x11/i.test(ua) && !/android/i.test(ua));
  if (!linux || /android|cros/i.test(ua)) return;
  let arm = /aarch64|arm64|armv8/i.test(`${ua} ${platform}`);
  try {
    const hints = await data?.getHighEntropyValues?.(['architecture']);
    if (hints?.architecture) arm = hints.architecture === 'arm';
  } catch {
    // No hint: the user agent's answer stands.
  }
  download.build = byId(arm ? 'linux-aarch64' : 'linux-x86_64');
}

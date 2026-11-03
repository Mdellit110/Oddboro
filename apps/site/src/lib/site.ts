// One place for the site's facts: its address, its name, where the code lives.

export const SITE = {
  url: 'https://oddboro.com',
  name: 'Oddboro',
  title: 'Oddboro: Hire Odds.',
  description:
    'Too much on your plate? Hire Odds: AI workers in a pixel office on your Mac. You decide what each one can touch. Open source, Apache 2.0.',
  ogTitle: 'Oddboro. Hire Odds.',
  ogDescription:
    'An open source pixel office on your Mac where AI workers, called Odds, take on your jobs. Pick an Office Manager, watch the floor, and set how far each Odd can go.',
  tagline: 'Hire Odds.',
  github: 'https://github.com/New-Altitude/Oddboro',
  /** The newest published release's disk image. Every release carries it under this name. */
  download: 'https://github.com/New-Altitude/Oddboro/releases/latest/download/Oddboro.dmg',
  releases: 'https://github.com/New-Altitude/Oddboro/releases',
  company: 'New Altitude, Inc.',
  ogImage: '/art/og.png'
} as const;

/** The homepage sections, in page order. The header's nav and the footer read this. */
export const SECTIONS = [
  { id: 'hire', label: 'Hire an Odd' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'managers', label: 'Managers' },
  { id: 'access', label: 'Access' },
  { id: 'goals', label: 'Goals' },
  { id: 'on-your-mac', label: 'On your Mac' },
  { id: 'open-source', label: 'Open source' },
  { id: 'get-started', label: 'Get started' },
  { id: 'faq', label: 'FAQ' }
] as const;

/** The pages the sitemap lists. Paths end in a slash, the way the build writes them. */
export const PAGES = ['/', '/privacy/', '/terms/'] as const;

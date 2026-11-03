// The theme: night or day, following the visitor's system setting unless they
// picked one in the header. The pick lives in this browser's localStorage and
// goes nowhere else. The inline script in app.html reads the same key before
// first paint and sets data-theme on <html>, so the page and its art never
// show the wrong theme; this module keeps it up to date from then on.
export type Pick = 'auto' | 'day' | 'night';
export type Theme = 'day' | 'night';

export const KEY = 'oddboro.theme';

export const theme = $state({ pick: 'auto' as Pick, current: 'night' as Theme });

const query = () =>
  typeof window === 'undefined' ? undefined : window.matchMedia('(prefers-color-scheme: dark)');

function readPick(): Pick {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'day' || v === 'night' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function apply() {
  const dark = theme.pick === 'night' || (theme.pick === 'auto' && (query()?.matches ?? true));
  theme.current = dark ? 'night' : 'day';
  const html = document.documentElement;
  html.dataset.theme = theme.current;
  const colour = getComputedStyle(html).getPropertyValue('--color-night').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colour);
}

/** Record the visitor's pick and apply it. Auto clears the stored pick. */
export function setPick(pick: Pick) {
  theme.pick = pick;
  try {
    if (pick === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pick);
  } catch {
    // Storage can be off. The pick still holds for this page.
  }
  apply();
}

/** Read the pick, apply it, and follow the system setting while on Auto. */
export function startTheme(): () => void {
  theme.pick = readPick();
  apply();
  const mq = query();
  const follow = () => {
    if (theme.pick === 'auto') apply();
  };
  mq?.addEventListener('change', follow);
  return () => mq?.removeEventListener('change', follow);
}

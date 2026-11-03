// The site's motion helpers. Three rules, from the repo's hard rule 13: only
// transform and opacity animate, nothing runs while the screen is still, and
// every effect switches off under prefers-reduced-motion. The classes these
// add are styled in src/app.css.
//
//   <div use:reveal>                         fades up once, when it scrolls into view
//   <div use:reveal={{ delay: 120 }}>        the same, a beat later
//   <ul use:stagger={{ step: 80 }}>          each child reveals in turn
//   <div use:visible={(on) => ...}>          tells you when it is on screen, for pausing work
//   <li use:awake>                           while pointed at or keyboard focused: data-awake, and blinks
//   <div use:blinks>                         while on screen: data-blink comes and goes every 2 to 5 s
import type { Action } from 'svelte/action';

/** True when the viewer asked for less motion. Always false on the server. */
export const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type RevealOptions = {
  /** Milliseconds before the transition starts, once in view. */
  delay?: number;
  /** How much of the element has to show first, 0 to 1. */
  threshold?: number;
};

/** Watch one element and call back once when it first shows. */
function once(node: Element, threshold: number, fn: () => void): () => void {
  if (reducedMotion() || typeof IntersectionObserver === 'undefined') {
    fn();
    return () => {};
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      fn();
      io.disconnect();
    },
    { threshold, rootMargin: '0px 0px -8% 0px' }
  );
  io.observe(node);
  return () => io.disconnect();
}

/** Fade and rise once, the first time the element enters the viewport. */
export const reveal: Action<HTMLElement, RevealOptions | undefined> = (node, options) => {
  const { delay = 0, threshold = 0.15 } = options ?? {};
  node.classList.add('reveal');
  if (delay) node.style.setProperty('--reveal-delay', `${delay}ms`);
  const stop = once(node, threshold, () => node.classList.add('is-in'));
  return { destroy: stop };
};

type StaggerOptions = {
  /** Milliseconds between one child and the next. */
  step?: number;
  /** Which children take part. Every direct child by default. */
  selector?: string;
  threshold?: number;
};

/** Reveal the children one after another, when the parent enters the viewport. */
export const stagger: Action<HTMLElement, StaggerOptions | undefined> = (node, options) => {
  const { step = 80, selector = ':scope > *', threshold = 0.1 } = options ?? {};
  const children = [...node.querySelectorAll<HTMLElement>(selector)];
  children.forEach((child, i) => {
    child.classList.add('reveal');
    child.style.setProperty('--reveal-delay', `${i * step}ms`);
  });
  const stop = once(node, threshold, () => children.forEach((c) => c.classList.add('is-in')));
  return { destroy: stop };
};

/** Call back with true when the element is on screen and false when it leaves. */
export const visible: Action<HTMLElement, (on: boolean) => void> = (node, onChange) => {
  if (typeof IntersectionObserver === 'undefined') {
    onChange(true);
    return;
  }
  const io = new IntersectionObserver(
    (entries) => onChange(entries.some((e) => e.isIntersecting)),
    { threshold: 0 }
  );
  io.observe(node);
  return { destroy: () => io.disconnect() };
};

/** Milliseconds from `lo` to `hi`, at random. */
const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/**
 * While a mouse is over the element, or keyboard focus is inside it, it
 * carries `data-awake`, and `data-blink` comes and goes on a natural cadence:
 * a first blink soon after, then one of 120 to 160 ms every 2 to 4 s. Leaving
 * clears both and the timer, so nothing runs while nobody is there. A tap is
 * not a hover, so touch never wakes it, and nothing wakes under reduced motion.
 */
export const awake: Action<HTMLElement> = (node) => {
  let pointed = false;
  let focused = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const blink = (wait: number) => {
    timer = setTimeout(() => {
      node.dataset.blink = '';
      timer = setTimeout(
        () => {
          delete node.dataset.blink;
          blink(between(2000, 4000));
        },
        between(120, 160)
      );
    }, wait);
  };
  const update = () => {
    const on = (pointed || focused) && !reducedMotion();
    if (on === 'awake' in node.dataset) return;
    clearTimeout(timer);
    delete node.dataset.blink;
    if (on) {
      node.dataset.awake = '';
      blink(between(300, 700));
    } else delete node.dataset.awake;
  };
  const enter = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    pointed = true;
    update();
  };
  const leave = () => {
    pointed = false;
    update();
  };
  const focus = () => {
    focused = node.matches(':has(:focus-visible)');
    update();
  };
  // Focus has not settled when focusout fires, so look a moment later.
  const blur = () => setTimeout(focus);
  node.addEventListener('pointerenter', enter);
  node.addEventListener('pointerleave', leave);
  node.addEventListener('focusin', focus);
  node.addEventListener('focusout', blur);
  return {
    destroy: () => {
      clearTimeout(timer);
      node.removeEventListener('pointerenter', enter);
      node.removeEventListener('pointerleave', leave);
      node.removeEventListener('focusin', focus);
      node.removeEventListener('focusout', blur);
    }
  };
};

/**
 * A portrait that blinks on its own: while the element is on screen, the tab
 * shows and the viewer has not asked for less motion, `data-blink` comes on
 * for 120 to 160 ms every 2 to 5 s, one timer at a time. Leaving, hiding or
 * destroying clears it, so nothing runs while nobody can see it.
 */
export const blinks: Action<HTMLElement> = (node) => {
  let inView = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const next = () => {
    timer = setTimeout(
      () => {
        node.dataset.blink = '';
        timer = setTimeout(
          () => {
            delete node.dataset.blink;
            next();
          },
          between(120, 160)
        );
      },
      between(2000, 5000)
    );
  };
  const stop = () => {
    clearTimeout(timer);
    timer = undefined;
    delete node.dataset.blink;
  };
  const update = () => {
    const on = inView && !document.hidden && !reducedMotion();
    if (!on) stop();
    else if (timer === undefined) next();
  };
  const io =
    typeof IntersectionObserver === 'undefined'
      ? undefined
      : new IntersectionObserver((entries) => {
          inView = entries.some((e) => e.isIntersecting);
          update();
        });
  io?.observe(node);
  document.addEventListener('visibilitychange', update);
  return {
    destroy: () => {
      stop();
      io?.disconnect();
      document.removeEventListener('visibilitychange', update);
    }
  };
};

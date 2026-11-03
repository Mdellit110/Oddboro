// A small timeline for the hero. Every track is a pure function of time, so
// the scene at any moment is `render(t)`: the start, the end for reduced
// motion, or wherever the viewer paused. The player steps `t` on
// requestAnimationFrame and stops at the end, so nothing runs once the
// sequence has settled.

export type Ease = (t: number) => number;
export const linear: Ease = (t) => t;
export const easeOut: Ease = (t) => 1 - (1 - t) ** 3;
export const easeInOut: Ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const clamp = (t: number) => Math.min(1, Math.max(0, t));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

type Track = { at: number; dur: number; ease: Ease; apply: (k: number, t: number) => void };

export class Timeline {
  tracks: Track[] = [];
  end = 0;

  /** Run `apply` with eased progress 0 to 1 over `dur` ms from `at`. It also gets the raw time. */
  add(at: number, dur: number, apply: Track['apply'], ease: Ease = easeOut): this {
    this.tracks.push({ at, dur, ease, apply });
    this.end = Math.max(this.end, at + dur);
    return this;
  }

  /** Draw the scene as it is at `t` ms. */
  render(t: number): void {
    for (const tr of this.tracks) {
      const k = tr.dur <= 0 ? (t >= tr.at ? 1 : 0) : clamp((t - tr.at) / tr.dur);
      tr.apply(tr.ease(k), t);
    }
  }
}

/** Plays a timeline forward and stops at its end, or when paused. */
export class Player {
  t = 0;
  playing = false;
  private raf = 0;

  constructor(
    private tl: Timeline,
    private onFrame: (t: number) => void = () => {},
    private onDone: () => void = () => {}
  ) {}

  play(): void {
    if (this.playing || this.t >= this.tl.end) return;
    this.playing = true;
    let last = performance.now();
    const step = (now: number) => {
      if (!this.playing) return;
      // A long gap (a hidden tab) steps the scene on, never jumps it to the end.
      this.t = Math.min(this.tl.end, this.t + Math.min(250, now - last));
      last = now;
      this.tl.render(this.t);
      this.onFrame(this.t);
      if (this.t >= this.tl.end) {
        this.playing = false;
        this.onDone();
        return;
      }
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  pause(): void {
    this.playing = false;
    cancelAnimationFrame(this.raf);
  }

  seek(t: number): void {
    this.t = t;
    this.tl.render(t);
    this.onFrame(t);
  }

  restart(): void {
    this.pause();
    this.seek(0);
    this.play();
  }
}

export type Path = [number, number][];
export type Dir = 'up' | 'down' | 'left' | 'right';

/** Where a walker is `d` pixels along a path of adjacent tiles, and which way it faces. */
export function along(
  path: Path,
  d: number,
  tile = 16
): { x: number; y: number; dir: Dir; frame: number; done: boolean } {
  const segments = path.length - 1;
  const total = segments * tile;
  if (segments <= 0 || d >= total) {
    const [x, y] = path[path.length - 1];
    const [px, py] = path[Math.max(0, path.length - 2)];
    return { x, y, dir: dirOf(px, py, x, y), frame: 0, done: true };
  }
  const i = Math.floor(Math.max(0, d) / tile);
  const k = (Math.max(0, d) - i * tile) / tile;
  const [ax, ay] = path[i];
  const [bx, by] = path[i + 1];
  return {
    x: Math.round(lerp(ax, bx, k)),
    y: Math.round(lerp(ay, by, k)),
    dir: dirOf(ax, ay, bx, by),
    frame: Math.floor(Math.max(0, d) / (tile / 2)) % 4,
    done: false
  };
}

function dirOf(ax: number, ay: number, bx: number, by: number): Dir {
  if (by < ay) return 'up';
  if (by > ay) return 'down';
  return bx < ax ? 'left' : 'right';
}

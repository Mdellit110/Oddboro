// Ambient light by hour of day. The office and the renderer share it so a
// preview at 9 PM looks the way the floor will at 9 PM.
export type Ambient = { strength: number; tint: [number, number, number] };

const KEYS: [number, Ambient][] = [
  [0, { strength: 0.32, tint: [0.55, 0.62, 1.0] }],
  [5, { strength: 0.36, tint: [0.6, 0.62, 0.95] }],
  [7, { strength: 0.8, tint: [1.0, 0.86, 0.78] }],
  [9, { strength: 1.0, tint: [1.0, 1.0, 1.0] }],
  [16, { strength: 1.0, tint: [1.0, 0.98, 0.94] }],
  [18.5, { strength: 0.72, tint: [1.0, 0.78, 0.66] }],
  [20.5, { strength: 0.42, tint: [0.62, 0.62, 0.95] }],
  [24, { strength: 0.32, tint: [0.55, 0.62, 1.0] }]
];

export function ambientAt(hour: number): Ambient {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [h0, a] = KEYS[i];
    const [h1, b] = KEYS[i + 1];
    if (h >= h0 && h <= h1) {
      const t = (h - h0) / (h1 - h0);
      const mix = (p: number, q: number) => p + (q - p) * t;
      return {
        strength: mix(a.strength, b.strength),
        tint: [mix(a.tint[0], b.tint[0]), mix(a.tint[1], b.tint[1]), mix(a.tint[2], b.tint[2])]
      };
    }
  }
  return KEYS[0][1];
}

type RGB = [number, number, number];
const SKY: [number, RGB, RGB][] = [
  [0, [10, 14, 38], [22, 28, 64]],
  [5.5, [28, 30, 70], [120, 80, 110]],
  [7, [110, 150, 210], [250, 190, 150]],
  [10, [96, 170, 240], [180, 222, 250]],
  [16, [100, 165, 235], [200, 225, 245]],
  [18.5, [70, 80, 160], [250, 150, 110]],
  [20.5, [24, 26, 70], [70, 50, 100]],
  [24, [10, 14, 38], [22, 28, 64]]
];

/** Sky colour at the top and bottom of a window, by hour. */
export function skyAt(hour: number): [RGB, RGB] {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 0; i < SKY.length - 1; i++) {
    const [h0, a0, a1] = SKY[i];
    const [h1, b0, b1] = SKY[i + 1];
    if (h >= h0 && h <= h1) {
      const t = (h - h0) / (h1 - h0);
      const mix = (p: RGB, q: RGB): RGB => [0, 1, 2].map((k) => p[k] + (q[k] - p[k]) * t) as RGB;
      return [mix(a0, b0), mix(a1, b1)];
    }
  }
  return [SKY[0][1], SKY[0][2]];
}

// How the office lights the floor at night. The office and the preview
// renderer both use these, so a render looks like the office.

/** The tint every sprite wears: the ambient colour, never fully black. */
export function nightTint(hour: number): RGB {
  const a = ambientAt(hour);
  return a.tint.map((v) => Math.min(1, Math.max(0.16, v * a.strength))) as RGB;
}

/** Indoor lamps glow at half strength: a room is small, and full strength washed it out. */
export const INDOOR_GLOW = 0.5;
/** Street and garden lamps at 70%, so the night outside stays dark around them. */
export const OUTDOOR_GLOW = 0.7;

/** How strongly a lamp of this intensity glows at this hour, 0 to 1. */
export function glowAlpha(intensity: number, hour: number, outdoor = true): number {
  const room = outdoor ? OUTDOOR_GLOW : INDOOR_GLOW;
  return Math.min(1, intensity * (1 - ambientAt(hour).strength * 0.85) * 0.55 * room);
}

/** The tighter bloom around each lamp, as a fraction of its radius, and its strength. */
export const BLOOM_REACH = 0.7;
export function bloomAlpha(hour: number): number {
  return Math.max(0, (1 - ambientAt(hour).strength) * 0.35);
}

/** Glow falloff across a light's radius, t from 0 (centre) to 1 (edge). */
export const GLOW_STOPS: [number, number][] = [
  [0, 1],
  [0.35, 0.45],
  [1, 0]
];
export function glowFalloff(t: number): number {
  if (t >= 1) return 0;
  for (let i = 0; i < GLOW_STOPS.length - 1; i++) {
    const [t0, v0] = GLOW_STOPS[i];
    const [t1, v1] = GLOW_STOPS[i + 1];
    if (t <= t1) return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return 0;
}

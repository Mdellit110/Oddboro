// Paints the office's art from its sprites and lights it for an hour of the
// day, the way scripts/render.ts in the world package does. art.ts makes the
// site's art with it, and office-gif.ts the README's office.
import { createImage, drawImage, type Image } from '@oddboro/sprites/png';
import { loadSprites } from '@oddboro/sprites/load';
import { hexToRgba, renderFrame, spriteMeta, type SpriteDef } from '@oddboro/sprites/px';
import {
  BLOOM_REACH,
  bloomAlpha,
  glowAlpha,
  glowFalloff,
  INDOOR_GLOW,
  nightTint,
  skyAt,
  type DrawCmd,
  type SpriteCatalog,
  type World
} from '@oddboro/world';

/** The hours the art is lit for: lamps on, and midday. */
export const NIGHT = 21;
export const DAY = 13;

export type Rect = { x: number; y: number; w: number; h: number };

const loaded = loadSprites();
if (loaded.errors.length) {
  console.error(loaded.errors.join('\n'));
  process.exit(1);
}
export const { palette, sprites } = loaded;
export const catalog: SpriteCatalog = Object.fromEntries(
  [...sprites.values()].map((d) => [d.name, spriteMeta(d, palette)])
);

export const frameImage = (() => {
  const cache = new Map<string, Image>();
  return (def: SpriteDef, frame: string, variant?: string, emissiveOnly = false): Image => {
    const key = `${def.name}@${variant ?? ''}/${frame}${emissiveOnly ? '~e' : ''}`;
    let img = cache.get(key);
    if (!img) {
      const f = def.frames.find((x) => x.name === frame) ?? def.frames[0];
      const v = variant ? def.variants.find((x) => x.name === variant)?.map : undefined;
      img = renderFrame(def, f, palette, v, emissiveOnly);
      cache.set(key, img);
    }
    return img;
  };
})();

export function cropTo(img: Image, r: Rect): Image {
  const out = createImage(r.w, r.h);
  for (let y = 0; y < r.h; y++) {
    const sy = r.y + y;
    if (sy < 0 || sy >= img.height) continue;
    const x0 = Math.max(0, r.x);
    const x1 = Math.min(img.width, r.x + r.w);
    if (x1 <= x0) continue;
    out.data.set(
      img.data.subarray((sy * img.width + x0) * 4, (sy * img.width + x1) * 4),
      (y * r.w + (x0 - r.x)) * 4
    );
  }
  return out;
}

/** Painting and lighting at one hour of the day. */
export function lighting(hour: number, W: number, H: number) {
  const tint = nightTint(hour);
  const mean = (t: number[]) => (t[0] + t[1] + t[2]) / 3;
  // How much of a lamp's warmth a thing above the lit layer should catch:
  // all of it at night, none at midday, when the lamps are off.
  const warmth = Math.max(0, 1 - mean(tint)) / (1 - mean(nightTint(NIGHT)));

  /** Paint a list of draws on a transparent canvas, with the sky behind each window. */
  function paint(draws: DrawCmd[], opaque: boolean, width = W, height = H): Image {
    const canvas = createImage(width, height);
    if (opaque)
      for (let i = 0; i < width * height; i++) canvas.data.set(hexToRgba('#0d0f1a'), i * 4);
    const [skyTop, skyBottom] = skyAt(hour);
    for (const d of draws) {
      const def = sprites.get(d.sprite)!;
      if (def.tags.includes('window'))
        for (let y = 0; y < def.height; y++) {
          const t = y / def.height;
          const c = skyTop.map((v, i) => Math.round(v + (skyBottom[i] - v) * t));
          for (let x = 0; x < def.width; x++)
            canvas.data.set([c[0], c[1], c[2], 255], ((d.y + y) * width + d.x + x) * 4);
        }
      drawImage(canvas, frameImage(def, d.frame, d.variant), d.x, d.y, d.flip);
    }
    return canvas;
  }

  /**
   * Every pixel wears the hour's tint. Alpha stays as it was. `lamp` adds the
   * warm light a thing standing under a lamp would catch, since the Odds and
   * the bus sit above the lit layer and get none of its glow.
   */
  function shade(img: Image, lamp = 0): Image {
    const warm = [0.2, 0.17, 0.1];
    for (let i = 0; i < img.width * img.height; i++)
      for (let ch = 0; ch < 3; ch++)
        img.data[i * 4 + ch] = Math.round(
          Math.min(255, img.data[i * 4 + ch] * (tint[ch] + lamp * warmth * warm[ch]))
        );
    return img;
  }

  /** The tint, then each lamp's glow and bloom cut to its room, then the emissive pixels. */
  function light(img: Image, w: World, draws: DrawCmd[]): Image {
    const { width: iw, height: ih } = img;
    const add = new Float32Array(iw * ih * 3);
    const bloom = bloomAlpha(hour);
    for (const l of w.lights) {
      const [lr, lg, lb] = hexToRgba(l.color);
      const glow = glowAlpha(l.intensity, hour, l.outdoor);
      const lampBloom = bloom * (l.outdoor ? 1 : INDOOR_GLOW);
      const r = l.radius;
      const c = l.clip ?? { x: 0, y: 0, w: iw, h: ih };
      const y0 = Math.max(c.y, Math.floor(l.y - r));
      const y1 = Math.min(c.y + c.h, ih, l.y + r);
      const x0 = Math.max(c.x, Math.floor(l.x - r));
      const x1 = Math.min(c.x + c.w, iw, l.x + r);
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const d = Math.hypot(x + 0.5 - l.x, y + 0.5 - l.y);
          const f = glow * glowFalloff(d / r) + lampBloom * glowFalloff(d / (r * BLOOM_REACH));
          if (f <= 0) continue;
          const i = (y * iw + x) * 3;
          add[i] += (lr / 255) * f;
          add[i + 1] += (lg / 255) * f;
          add[i + 2] += (lb / 255) * f;
        }
    }
    for (let i = 0; i < iw * ih; i++)
      for (let ch = 0; ch < 3; ch++) {
        const base = img.data[i * 4 + ch] / 255;
        img.data[i * 4 + ch] = Math.round(Math.min(1, base * tint[ch] + add[i * 3 + ch]) * 255);
      }
    for (const d of draws) {
      if (!catalog[d.sprite].emissive) continue;
      drawImage(
        img,
        frameImage(sprites.get(d.sprite)!, d.frame, d.variant, true),
        d.x,
        d.y,
        d.flip
      );
    }
    return img;
  }

  return { paint, shade, light };
}

// Paints a composed world straight from its sprites, for a look at it from
// code: the render script, and the office checking a room it furnished. Node
// only (the PNG encoder uses zlib), so it is not in the package index.
import { createImage, drawImage, type Image } from '@oddboro/sprites/png';
import { hexToRgba, renderFrame, type Palette, type SpriteDef } from '@oddboro/sprites/px';
import { skyAt } from './light.ts';
import { TILE, type World } from './types.ts';

/** Every draw at its place, with the sky behind each window, before any lighting. */
export function paintWorld(
  world: World,
  sprites: Map<string, SpriteDef>,
  palette: Palette,
  hour = 13
): Image {
  const cache = new Map<string, Image>();
  const image = (def: SpriteDef, frame: string, variant?: string): Image => {
    const key = `${def.name}@${variant ?? ''}/${frame}`;
    let img = cache.get(key);
    if (!img) {
      const f = def.frames.find((x) => x.name === frame) ?? def.frames[0];
      const v = variant ? def.variants.find((x) => x.name === variant)?.map : undefined;
      img = renderFrame(def, f, palette, v);
      cache.set(key, img);
    }
    return img;
  };
  const W = world.width * TILE;
  const H = world.height * TILE;
  const canvas = createImage(W, H);
  for (let i = 0; i < W * H; i++) canvas.data.set(hexToRgba('#0d0f1a'), i * 4);
  const [skyTop, skyBottom] = skyAt(hour);
  for (const d of world.draws) {
    const def = sprites.get(d.sprite);
    if (!def) continue;
    // Windows show the sky through their glass, so paint it behind them first.
    if (def.tags.includes('window'))
      for (let y = 0; y < def.height; y++) {
        const t = y / def.height;
        const c = skyTop.map((v, i) => Math.round(v + (skyBottom[i] - v) * t));
        for (let x = 0; x < def.width; x++)
          canvas.data.set([c[0], c[1], c[2], 255], ((d.y + y) * W + d.x + x) * 4);
      }
    drawImage(canvas, image(def, d.frame, d.variant), d.x, d.y, d.flip);
  }
  return canvas;
}

/** A rectangle of an image, clamped to its edges. */
export function cropImage(img: Image, x: number, y: number, w: number, h: number): Image {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const out = createImage(Math.min(img.width, x + w) - x0, Math.min(img.height, y + h) - y0);
  for (let row = 0; row < out.height; row++)
    out.data.set(
      img.data.subarray(
        ((y0 + row) * img.width + x0) * 4,
        ((y0 + row) * img.width + x0 + out.width) * 4
      ),
      row * out.width * 4
    );
  return out;
}

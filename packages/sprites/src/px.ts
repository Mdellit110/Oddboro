// The .px sprite format: a text file of directives and pixel rows, one
// character per pixel, every colour drawn from the shared palette. The format
// is documented for artists in ../FORMAT.md.
import { createImage, type Image } from './png.ts';

export const TILE = 16;

export type Facing = 'up' | 'down' | 'left' | 'right';
export type Pose = 'sit' | 'stand' | 'lie';
export type Layer = 'floor' | 'wall' | 'object' | 'overlay' | 'character';

export type Spot = {
  name: string;
  dx: number;
  dy: number;
  facing: Facing;
  activity: string;
  pose: Pose;
};

export type Light = { x: number; y: number; radius: number; color: string; intensity: number };

export type Frame = { name: string; rows: string[]; line: number };

export type SpriteDef = {
  name: string;
  file: string;
  width: number;
  height: number;
  layer: Layer;
  origin: [number, number];
  footprint: [number, number];
  walkable: boolean;
  zbias: number;
  fps: number;
  tags: string[];
  spots: Spot[];
  lights: Light[];
  variants: { name: string; map: Record<string, string> }[];
  frames: Frame[];
};

/** `emissive` colours give off their own light: the night pass never darkens them. */
export type PaletteColor = {
  hex: string;
  name: string;
  emissive?: boolean;
  /** For an emissive colour: the key it shows when its prop is switched off. */
  off?: string;
};
export type Palette = { name: string; colors: Record<string, PaletteColor> };

export class PxError extends Error {}

const FACINGS = new Set(['up', 'down', 'left', 'right']);
const POSES = new Set(['sit', 'stand', 'lie']);
const LAYERS = new Set(['floor', 'wall', 'object', 'overlay', 'character']);
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function hexToRgba(hex: string): [number, number, number, number] {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex);
  if (!m) throw new PxError(`bad colour ${hex}: use #rrggbb or #rrggbbaa`);
  const n = parseInt(m[1], 16);
  const a = m[2] ? parseInt(m[2], 16) : 255;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

export function parsePx(text: string, file: string, palette: Palette): SpriteDef {
  const lines = text.split(/\r?\n/);
  const fail = (line: number, msg: string): never => {
    throw new PxError(`${file}:${line + 1}: ${msg}`);
  };
  const def: Partial<SpriteDef> & { frames: Frame[] } = {
    file,
    frames: [],
    tags: [],
    spots: [],
    lights: [],
    variants: [],
    walkable: false,
    zbias: 0,
    fps: 0,
    layer: 'object'
  };
  let origin: [number, number] | undefined;
  let footprint: [number, number] | undefined;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const [word, ...args] = line.split(/\s+/);
    const num = (s: string | undefined, what: string): number => {
      const n = Number(s);
      if (s === undefined || !Number.isFinite(n)) fail(i, `${word}: ${what} must be a number`);
      return n;
    };
    switch (word) {
      case 'sprite':
        if (!args[0] || !NAME.test(args[0])) fail(i, 'sprite name must be lowercase-hyphenated');
        def.name = args[0];
        break;
      case 'size':
        def.width = num(args[0], 'width');
        def.height = num(args[1], 'height');
        break;
      case 'layer':
        if (!LAYERS.has(args[0])) fail(i, `layer must be one of ${[...LAYERS].join(', ')}`);
        def.layer = args[0] as Layer;
        break;
      case 'origin':
        origin = [num(args[0], 'x'), num(args[1], 'y')];
        break;
      case 'footprint':
        footprint = [num(args[0], 'width in tiles'), num(args[1], 'height in tiles')];
        break;
      case 'walkable':
        def.walkable = true;
        break;
      case 'zbias':
        def.zbias = num(args[0], 'zbias');
        break;
      case 'fps':
        def.fps = num(args[0], 'fps');
        break;
      case 'tag':
        def.tags!.push(...args);
        break;
      case 'spot': {
        const [name, dx, dy, facing, activity, pose = 'stand'] = args;
        if (!name || !FACINGS.has(facing) || !activity || !POSES.has(pose))
          fail(i, 'spot <name> <dx> <dy> <up|down|left|right> <activity> [sit|stand|lie]');
        def.spots!.push({
          name,
          dx: num(dx, 'dx'),
          dy: num(dy, 'dy'),
          facing: facing as Facing,
          activity,
          pose: pose as Pose
        });
        break;
      }
      case 'light': {
        const [x, y, radius, color, intensity = '1'] = args;
        hexToRgba(color ?? '');
        def.lights!.push({
          x: num(x, 'x'),
          y: num(y, 'y'),
          radius: num(radius, 'radius'),
          color,
          intensity: num(intensity, 'intensity')
        });
        break;
      }
      case 'variant': {
        const [name, ...pairs] = args;
        if (!name || !NAME.test(name)) fail(i, 'variant <name> <from>=<to> ...');
        const map: Record<string, string> = {};
        for (const p of pairs) {
          const m = /^(.)=(.)$/.exec(p);
          if (!m) fail(i, `variant pair "${p}" must look like a=b`);
          for (const ch of [m![1], m![2]])
            if (!palette.colors[ch]) fail(i, `variant uses "${ch}", which is not in the palette`);
          map[m![1]] = m![2];
        }
        def.variants!.push({ name, map });
        break;
      }
      case 'frame': {
        if (def.width === undefined || def.height === undefined) fail(i, 'size must come first');
        const name = args[0];
        if (!name || !NAME.test(name)) fail(i, 'frame name must be lowercase-hyphenated');
        if (def.frames.some((f) => f.name === name)) fail(i, `duplicate frame ${name}`);
        const rows: string[] = [];
        const start = i;
        while (rows.length < def.height!) {
          i++;
          if (i >= lines.length) fail(start, `frame ${name} needs ${def.height} rows`);
          const row = lines[i].trim();
          if (row.startsWith('#')) continue;
          if ([...row].length !== def.width)
            fail(i, `row is ${[...row].length} pixels wide, expected ${def.width}`);
          for (const ch of row)
            if (ch !== '.' && !palette.colors[ch])
              fail(i, `"${ch}" is not in the palette (use "." for transparent)`);
          rows.push(row);
        }
        def.frames.push({ name, rows, line: start + 1 });
        break;
      }
      default:
        fail(i, `unknown directive "${word}"`);
    }
  }

  if (!def.name) throw new PxError(`${file}: missing "sprite <name>"`);
  if (def.width === undefined) throw new PxError(`${file}: missing "size <w> <h>"`);
  if (def.frames.length === 0) throw new PxError(`${file}: no frames`);
  const fp = footprint ?? [Math.max(1, Math.ceil(def.width / TILE)), 1];
  def.footprint = fp;
  def.origin = origin ?? [0, Math.max(0, def.height! - fp[1] * TILE)];
  return def as SpriteDef;
}

/** Rasterise one frame, applying a variant's colour swaps if given. */
export function renderFrame(
  def: SpriteDef,
  frame: Frame,
  palette: Palette,
  variant?: Record<string, string>,
  emissiveOnly = false
): Image {
  const img = createImage(def.width, def.height);
  frame.rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const c = palette.colors[variant?.[ch] ?? ch];
      if (emissiveOnly && !c.emissive) return;
      img.data.set(hexToRgba(c.hex), (y * def.width + x) * 4);
    });
  });
  return img;
}

/** The palette with every emissive colour showing its off colour, for a switched-off prop. */
export function offPalette(palette: Palette): Palette {
  const colors = Object.fromEntries(
    Object.entries(palette.colors).map(([k, c]) => {
      if (!c.emissive) return [k, c];
      const off = c.off && palette.colors[c.off];
      if (!off) throw new PxError(`emissive colour ${k} names no off colour`);
      return [k, { hex: off.hex, name: c.name }];
    })
  );
  return { ...palette, colors };
}

/** True when any frame of the sprite uses an emissive colour. */
export function hasEmissive(def: SpriteDef, palette: Palette): boolean {
  return def.frames.some((f) =>
    f.rows.some((r) => [...r].some((ch) => palette.colors[ch]?.emissive))
  );
}

/** What the office needs to place a sprite, as compiled into dist/meta.json. */
export function spriteMeta(d: SpriteDef, palette: Palette) {
  return {
    width: d.width,
    height: d.height,
    layer: d.layer,
    origin: d.origin,
    footprint: d.footprint,
    walkable: d.walkable,
    zbias: d.zbias,
    fps: d.fps,
    tags: d.tags,
    emissive: hasEmissive(d, palette),
    spots: d.spots,
    lights: d.lights,
    variants: d.variants.map((v) => v.name),
    frames: d.frames.map((f) => f.name)
  };
}

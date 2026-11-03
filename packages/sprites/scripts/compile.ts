// Compiles every .px sprite into a texture atlas the office loads, plus
// enlarged previews you can open to check the art.
//
//   node scripts/compile.ts                 atlas + every preview
//   node scripts/compile.ts --only desk     previews for sprites whose name contains "desk"
//
// Writes:
//   dist/atlas.png, dist/atlas.json   PixiJS spritesheet (frames and animations)
//   dist/meta.json                    footprint, origin, spots and lights per sprite
//   out/<sprite>.png                  every frame and variant side by side, 4x, on a checkerboard
//   out/_contact.png                  every sprite's first frame on one sheet, 3x
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadSprites, SPRITES_ROOT } from '../src/load.ts';
import { hasEmissive, offPalette, renderFrame, spriteMeta, type SpriteDef } from '../src/px.ts';
import {
  checkerboard,
  createImage,
  drawImage,
  encodePng,
  extrude,
  scaleImage,
  type Image
} from '../src/png.ts';

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;

const { palette, sprites, errors } = loadSprites();
if (errors.length) {
  console.error(`${errors.length} sprite error(s):\n` + errors.map((e) => `  ${e}`).join('\n'));
  process.exit(1);
}

type Cell = { key: string; img: Image; sprite: SpriteDef; frame: string; variant?: string };
const unlit = offPalette(palette);
const cells: Cell[] = [];
for (const def of sprites.values()) {
  const variants = [undefined, ...def.variants];
  const glow = hasEmissive(def, palette);
  const hasOffFrame = def.frames.some((f) => f.name === 'off');
  for (const v of variants) {
    for (const f of def.frames) {
      const key = v ? `${def.name}@${v.name}/${f.name}` : `${def.name}/${f.name}`;
      cells.push({
        key,
        img: renderFrame(def, f, palette, v?.map),
        sprite: def,
        frame: f.name,
        variant: v?.name
      });
      // The emissive pixels alone, which the office paints above the night shade.
      if (glow)
        cells.push({
          key: `${key}~e`,
          img: renderFrame(def, f, palette, v?.map, true),
          sprite: def,
          frame: `${f.name}~e`,
          variant: v?.name
        });
      // Switched off: every emissive pixel in its off colour. A sprite that
      // draws its own off frame, like a fireplace gone cold, needs none.
      if (glow && !hasOffFrame)
        cells.push({
          key: `${key}~off`,
          img: renderFrame(def, f, unlit, v?.map),
          sprite: def,
          frame: `${f.name}~off`,
          variant: v?.name
        });
    }
  }
}

// Shelf packing with 2px gutters, widest power of two that keeps it square-ish.
// Each frame's edge pixels fill the gutter around it (`extrude`).
const PAD = 2;
const area = cells.reduce((n, c) => n + (c.img.width + PAD) * (c.img.height + PAD), 0);
let atlasW = 256;
while (atlasW * atlasW < area * 1.3) atlasW *= 2;
const sorted = [...cells].sort((a, b) => b.img.height - a.img.height);
const placed = new Map<string, { x: number; y: number }>();
let x = PAD;
let y = PAD;
let shelf = 0;
for (const c of sorted) {
  if (x + c.img.width + PAD > atlasW) {
    x = PAD;
    y += shelf + PAD;
    shelf = 0;
  }
  placed.set(c.key, { x, y });
  x += c.img.width + PAD;
  shelf = Math.max(shelf, c.img.height);
}
const atlasH = y + shelf + PAD;
const atlas = createImage(atlasW, atlasH);
for (const c of cells) {
  const p = placed.get(c.key)!;
  drawImage(atlas, c.img, p.x, p.y);
  extrude(atlas, p.x, p.y, c.img.width, c.img.height);
}

const frames: Record<string, unknown> = {};
const animations: Record<string, string[]> = {};
for (const c of cells) {
  const p = placed.get(c.key)!;
  const size = { w: c.img.width, h: c.img.height };
  frames[c.key] = {
    frame: { x: p.x, y: p.y, ...size },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, ...size },
    sourceSize: size
  };
  const m = /^(.*)-(\d+)(~e)?$/.exec(c.frame);
  if (m) {
    const prefix = c.variant ? `${c.sprite.name}@${c.variant}` : c.sprite.name;
    (animations[`${prefix}/${m[1]}${m[3] ?? ''}`] ??= []).push(c.key);
  }
}
for (const list of Object.values(animations))
  list.sort((a, b) => Number(/(\d+)(~e)?$/.exec(a)![1]) - Number(/(\d+)(~e)?$/.exec(b)![1]));

const meta = Object.fromEntries([...sprites.values()].map((d) => [d.name, spriteMeta(d, palette)]));

const dist = join(SPRITES_ROOT, 'dist');
const out = join(SPRITES_ROOT, 'out');
mkdirSync(dist, { recursive: true });
if (!only) rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

writeFileSync(join(dist, 'atlas.png'), encodePng(atlas));
writeFileSync(
  join(dist, 'atlas.json'),
  JSON.stringify(
    {
      frames,
      animations,
      meta: {
        image: 'atlas.png',
        format: 'RGBA8888',
        size: { w: atlasW, h: atlasH },
        scale: '1'
      }
    },
    null,
    1
  )
);
writeFileSync(join(dist, 'meta.json'), JSON.stringify({ palette, sprites: meta }, null, 1));

// Previews: one strip per sprite, every variant on its own row.
const SCALE = 4;
let previews = 0;
for (const def of sprites.values()) {
  if (only && !def.name.includes(only)) continue;
  const rows = [undefined, ...def.variants];
  const w = def.frames.length * (def.width + 2) + 2;
  const h = rows.length * (def.height + 2) + 2;
  const sheet = checkerboard(w, h, 4);
  rows.forEach((v, r) => {
    def.frames.forEach((f, i) => {
      const img = renderFrame(def, f, palette, v?.map);
      drawImage(sheet, img, 2 + i * (def.width + 2), 2 + r * (def.height + 2));
    });
  });
  writeFileSync(join(out, `${def.name}.png`), encodePng(scaleImage(sheet, SCALE)));
  previews++;
}

if (!only) {
  const list = [...sprites.values()];
  const cols = Math.ceil(Math.sqrt(list.length));
  const cw = Math.max(...list.map((d) => d.width)) + 4;
  const ch = Math.max(...list.map((d) => d.height)) + 4;
  const sheet = checkerboard(cols * cw, Math.ceil(list.length / cols) * ch, 4);
  list.forEach((d, i) => {
    const img = renderFrame(d, d.frames[0], palette);
    drawImage(sheet, img, (i % cols) * cw + 2, Math.floor(i / cols) * ch + 2);
  });
  writeFileSync(join(out, '_contact.png'), encodePng(scaleImage(sheet, 3)));
}

console.log(
  `${sprites.size} sprites, ${cells.length} frames, atlas ${atlasW}x${atlasH}, ${previews} previews in out/`
);

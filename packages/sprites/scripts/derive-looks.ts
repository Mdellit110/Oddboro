// Derives the generated-looks base from the hand-drawn staff bodies: two bald
// bodies with every pixel keyed by what it is, the per-frame anchors, and the
// two hairstyles the old bodies wore. Run it again only if staff.px or
// staff-b.px change; it overwrites what it writes.
//
//   node scripts/derive-looks.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPalette, SPRITES_ROOT } from '../src/load.ts';
import { parsePx, type Frame } from '../src/px.ts';

const SRC = join(SPRITES_ROOT, 'src', 'characters');
const LOOKS = join(SPRITES_ROOT, 'looks');
const palette = loadPalette();
const read = (name: string) => parsePx(readFileSync(join(SRC, name), 'utf8'), name, palette).frames;
const short = read('staff.px');
const long = read('staff-b.px');

type Grid = string[][];
const grid = (f: Frame): Grid => f.rows.map((r) => [...r]);
const W = 16;
const H = 32;
const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];
const at = (g: Grid, x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? '.' : g[y][x]);

/** Which way a frame looks. Exercise frames are named for the move, not the facing. */
export function facing(name: string): 'down' | 'up' | 'side' {
  const m = /-(down|up|side)-\d+$/.exec(name);
  if (m) return m[1] as 'down' | 'up' | 'side';
  if (/^exercise-(lift|stretch)/.test(name)) return 'down';
  return 'side';
}

function bbox(g: Grid, keys: string, maxY = H) {
  let x0 = W,
    y0 = H,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < Math.min(H, maxY); y++)
    for (let x = 0; x < W; x++)
      if (keys.includes(g[y][x])) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  return { x0, y0, x1, y1, empty: x1 < 0 };
}

/** 4-connected groups of the given keys. */
function components(g: Grid, keys: string): [number, number][][] {
  const seen = new Set<string>();
  const out: [number, number][][] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!keys.includes(g[y][x]) || seen.has(`${x},${y}`)) continue;
      const group: [number, number][] = [];
      const todo: [number, number][] = [[x, y]];
      seen.add(`${x},${y}`);
      while (todo.length) {
        const [cx, cy] = todo.pop()!;
        group.push([cx, cy]);
        for (const [dx, dy] of N4) {
          const nx = cx + dx,
            ny = cy + dy;
          if (keys.includes(at(g, nx, ny)) && !seen.has(`${nx},${ny}`)) {
            seen.add(`${nx},${ny}`);
            todo.push([nx, ny]);
          }
        }
      }
      out.push(group);
    }
  return out;
}

/** The hair turned to skull, and the shirt and trousers split into regions. */
function bald(f: Frame): { g: Grid; torso: { x0: number; y0: number } } {
  const src = grid(f);
  const g = src.map((r) => [...r]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = src[y][x];
      if (c === 'n') g[y][x] = 'h';
      else if (c === 'N') g[y][x] = 'H';
      else if (c === 'k' && N4.some(([dx, dy]) => 'nN'.includes(at(src, x + dx, y + dy))))
        g[y][x] = 'q';
    }
  // The torso starts at the first row below the head with shirt in the
  // middle columns; raised arms beside the head do not count.
  const head = bbox(src, 'nN', 20);
  let ty0 = H;
  for (let y = head.y1 + 1; y < H && ty0 === H; y++)
    if ('zZ'.includes(src[y][7]) || 'zZ'.includes(src[y][8])) ty0 = y;
  // Arms run from a hand to the shoulders: trace shirt from beside each hand,
  // moving up or down a row at a time, never straight across, and stop at the
  // shoulder rows. The half nearest the hand is the lower sleeve.
  const HAND = 'fFRMyYV=';
  const shoulder = (y: number) => y >= ty0 && y <= ty0 + 1;
  const dist = new Map<string, number>();
  const todo: [number, number][] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!'zZ'.includes(src[y][x]) || shoulder(y)) continue;
      const nearHand = N4.some(([dx, dy]) => {
        const hx = x + dx,
          hy = y + dy;
        // Face and neck skin are not hands.
        const face = hy <= ty0 && hx >= head.x0 - 1 && hx <= head.x1 + 1;
        return HAND.includes(at(src, hx, hy)) && !face;
      });
      if (nearHand) {
        dist.set(`${x},${y}`, 0);
        todo.push([x, y]);
      }
    }
  while (todo.length) {
    const [cx, cy] = todo.shift()!;
    const d = dist.get(`${cx},${cy}`)!;
    for (const dy of [-1, 1])
      for (const dx of [-1, 0, 1]) {
        const nx = cx + dx,
          ny = cy + dy;
        const k = `${nx},${ny}`;
        // An arm is about four pixels long; stopping there keeps a sleeve
        // from spreading into a chest it swings across.
        if (!'zZ'.includes(at(src, nx, ny)) || shoulder(ny) || dist.has(k) || d >= 3) continue;
        // Moving away from the hand only: an arm does not double back.
        dist.set(k, d + 1);
        todo.push([nx, ny]);
      }
  }
  const armLength = new Map<number, number>();
  for (const [k, d] of dist) {
    const x = Number(k.split(',')[0]);
    const side = x < 8 ? 0 : 1;
    armLength.set(side, Math.max(armLength.get(side) ?? 0, d));
  }
  for (const [k, d] of dist) {
    const [x, y] = k.split(',').map(Number);
    const far = armLength.get(x < 8 ? 0 : 1) ?? 0;
    const lower = d < Math.ceil((far + 1) / 2);
    const shade = src[y][x] === 'Z';
    g[y][x] = lower ? (shade ? 'L' : 'l') : shade ? 'U' : 'u';
  }
  const tx0 = 0;
  // Trousers: below the knee is the lower leg.
  const legs = bbox(src, '^&');
  if (!legs.empty) {
    const knee = legs.y0 + Math.ceil((legs.y1 - legs.y0 + 1) / 2);
    for (let y = knee; y < H; y++)
      for (let x = 0; x < W; x++)
        if (src[y][x] === '^') g[y][x] = 'j';
        else if (src[y][x] === '&') g[y][x] = 'J';
  }
  return { g, torso: { x0: tx0, y0: ty0 } };
}

const trousers: Record<string, Grid> = {};
const skirt: Record<string, Grid> = {};
const anchors: Record<string, { dir: string; head: [number, number]; torso: [number, number] }> =
  {};
const torsoAt: Record<string, { x0: number; y0: number }> = {};
const hairAt: Record<string, { x0: number; y0: number }> = {};

for (const f of short) {
  const { g, torso } = bald(f);
  trousers[f.name] = g;
  torsoAt[f.name] = torso;
  hairAt[f.name] = bbox(grid(f), 'nN', 20);
  // The skirt body is the same person below the waist from staff-b.
  const b = grid(long.find((x) => x.name === f.name)!);
  const s = g.map((r) => [...r]);
  const src = grid(f);
  let cut = H;
  for (let y = 21; y < H && cut === H; y++) if (b[y].some((c, x) => c !== src[y][x])) cut = y;
  for (let y = cut; y < H; y++) s[y] = [...b[y]];
  skirt[f.name] = s;
}
for (const f of short) {
  const dir = facing(f.name);
  const ref = `idle-${dir}-0`;
  anchors[f.name] = {
    dir,
    head: [hairAt[f.name].x0 - hairAt[ref].x0, hairAt[f.name].y0 - hairAt[ref].y0],
    // Spread arms widen the torso's box, but the body never moves sideways.
    torso: [0, torsoAt[f.name].y0 - torsoAt[ref].y0]
  };
}

function writePx(file: string, head: string[], frames: [string, Grid][]) {
  const body = frames.map(([name, g]) => `frame ${name}\n${g.map((r) => r.join('')).join('\n')}\n`);
  writeFileSync(file, `${head.join('\n')}\n\n${body.join('\n')}`);
}

const BODY_HEAD = (name: string, about: string) => [
  `# ${about}`,
  '# Made by scripts/derive-looks.ts from the hand-drawn staff bodies. Keys are',
  '# regions, coloured per person: h H skull, q skull outline, z Z torso, u U',
  '# upper sleeve, l L lower sleeve, ^ & upper leg, j J lower leg, 3 W shoes.',
  `sprite look-body-${name}`,
  'size 16 32',
  'layer character',
  'footprint 1 1',
  'origin 0 16',
  'fps 4'
];
writePx(
  join(LOOKS, 'bodies', 'trousers.px'),
  BODY_HEAD('trousers', 'The bald body in trousers.'),
  Object.entries(trousers)
);
writePx(
  join(LOOKS, 'bodies', 'skirt.px'),
  BODY_HEAD('skirt', 'The bald body in a skirt, bare legs below it.'),
  Object.entries(skirt)
);
writeFileSync(join(LOOKS, 'anchors.json'), JSON.stringify(anchors, null, 1) + '\n');

/** A hairstyle the old bodies wore: what differs from the bald head. */
function hairFrom(frames: Frame[], dir: string): Grid {
  const f = frames.find((x) => x.name === `idle-${dir}-0`)!;
  const src = grid(f);
  const base = trousers[f.name];
  return src.map((r, y) =>
    r.map((c, x) => (y < 21 && c !== base[y][x] && 'nNk['.includes(c) ? c : '.'))
  );
}
const HAIR_HEAD = (name: string, about: string) => [
  `# ${about}`,
  '# Drawn as it sits on the idle frame for each facing; the office moves it',
  '# with the head in every other frame.',
  `sprite hair-${name}`,
  'size 16 32',
  'layer character',
  'tag hair'
];
for (const [name, about, frames] of [
  ['short-crop', 'Short crop: the original staff haircut.', short],
  ['long-tied', 'Long hair tied back: the original staff-b hair.', long]
] as const)
  writePx(
    join(LOOKS, 'hair', `${name}.px`),
    HAIR_HEAD(name, about),
    (['down', 'up', 'side'] as const).map((d) => [d, hairFrom(frames, d)])
  );
console.log('looks: bodies, anchors and 2 hairstyles written');

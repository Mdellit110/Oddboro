// Art the office draws for itself: a prop, a wall hanging, something for a
// desk, a floor or a wall style the owner asked for that the library has no
// sprite for. Claude writes it as .px in the house palette. This checks it,
// derives the parts of a wall style Claude does not draw (its cap and door,
// and its window unless drawn), and packs everything into one sheet the
// floor loads beside the atlas.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SRC } from './load.ts';
import { createImage, drawImage, encodePng, extrude, type Image } from './png.ts';
import {
  hasEmissive,
  parsePx,
  PxError,
  renderFrame,
  spriteMeta,
  type Palette,
  type SpriteDef
} from './px.ts';

export const ART_KINDS = ['prop', 'wall-prop', 'desk-prop', 'floor', 'wall'] as const;
export type ArtKind = (typeof ART_KINDS)[number];

/** Where a prop stands: against the back wall, out on the floor, or in a free corner. */
export const PLACES = ['back', 'floor', 'corner'] as const;
export type Place = (typeof PLACES)[number];

/** What the office asks to have drawn. */
export type ArtRequest = {
  name: string;
  kind: ArtKind;
  /** What it looks like, in a sentence. */
  about: string;
  place?: Place;
  /**
   * A library sprite this stands in for everywhere the office places one, for
   * a theme: a torch for every floor lamp. It keeps that sprite's footprint,
   * origin and spots, so staff still use it the same way.
   */
  replaces?: string;
};

/** A drawn piece. A wall style also names its four tones, light to deep. */
export type DrawnArt = ArtRequest & { px: string; ramp?: string[] };

// `pieces` is one drawing round. `office` is every piece one office keeps: its first
// round, the look-over's, and what later changes add.
export const ART_LIMITS = { pieces: 12, office: 48, name: 24, width: 64, height: 64, frames: 8 };
const FOOTPRINT = { prop: [4, 3], 'wall-prop': [3, 1], 'desk-prop': [1, 1] } as const;

/** What a drawn seat can be for. Work seats come from desks, never drawn art. */
const ACTIVITIES = new Set(['rest', 'play', 'eat', 'read']);
const NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** The catalog name of a drawn floor or wall style's face, or of a prop. */
export const artSprite = (a: Pick<ArtRequest, 'name' | 'kind'>): string =>
  a.kind === 'floor' ? `floor-${a.name}` : a.kind === 'wall' ? `wall-${a.name}-face` : a.name;

/** Where the generator puts a drawn prop: a `place-` tag on its sprite. */
const placeOf = (a: ArtRequest): string =>
  a.kind === 'wall-prop' ? 'wall' : a.kind === 'desk-prop' ? 'desk' : (a.place ?? 'back');

/** A request is well formed and its name is free. Returns what is wrong. */
export function checkRequest(a: ArtRequest, taken: (sprite: string) => boolean): string[] {
  const at = `art "${a?.name}"`;
  if (!a || typeof a !== 'object') return ['an art request is not an object'];
  const out: string[] = [];
  if (typeof a.name !== 'string' || !NAME.test(a.name) || a.name.length > ART_LIMITS.name)
    out.push(`${at}: a name is lowercase words joined by hyphens, at most ${ART_LIMITS.name}`);
  else if (taken(artSprite(a))) out.push(`${at}: that name is taken; pick another`);
  if (!ART_KINDS.includes(a.kind)) out.push(`${at}: kind must be one of ${ART_KINDS.join(', ')}`);
  if (typeof a.about !== 'string' || !a.about.trim()) out.push(`${at}: say what it looks like`);
  if (a.place !== undefined && !PLACES.includes(a.place))
    out.push(`${at}: place must be one of ${PLACES.join(', ')}`);
  if (a.replaces !== undefined && typeof a.replaces !== 'string')
    out.push(`${at}: replaces names the library sprite it stands in for`);
  return out;
}

/** Several sprites in one text: each starts at its own `sprite` line. */
function splitPx(text: string): string[] {
  const out: string[] = [];
  let head: string[] = [];
  let cur: string[] | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (/^sprite\s/.test(line)) {
      if (cur) out.push(cur.join('\n'));
      cur = [...head, line];
      head = [];
    } else if (cur) cur.push(line);
    else head.push(line);
  }
  if (cur) out.push(cur.join('\n'));
  return out;
}

/**
 * Mend the slip a drawn piece makes most: a row a pixel or three too wide or
 * narrow. The row's longest run of one colour grows or shrinks, which keeps
 * its outline where it was. Blank lines inside a frame go too.
 */
export function mend(text: string): string {
  const lines = text.split(/\r?\n/);
  let w = 0;
  let h = 0;
  for (let i = 0; i < lines.length; i++) {
    const size = /^size\s+(\d+)\s+(\d+)/.exec(lines[i].trim());
    if (size) [w, h] = [Number(size[1]), Number(size[2])];
    if (!w || !/^frame\s/.test(lines[i].trim())) continue;
    for (let n = 0; n < h && i + 1 < lines.length;) {
      const row = lines[++i].trim();
      if (row.startsWith('#')) continue;
      if (!row) {
        lines.splice(i--, 1);
        continue;
      }
      // A directive: this frame is short, and parsing will say so.
      if (/\s/.test(row)) {
        i--;
        break;
      }
      n++;
      // A row a few pixels off is a slip in counting: widen or narrow its
      // longest run, usually clear edge or flat fill, so it reads the same.
      const off = [...row].length - w;
      if (off && Math.abs(off) <= 6) lines[i] = fit(row, w);
    }
  }
  return lines.join('\n');
}

function fit(row: string, w: number): string {
  const cs = [...row];
  while (cs.length !== w) {
    let at = 0;
    let len = 0;
    for (let s = 0, e = 0; s < cs.length; s = e) {
      while (e < cs.length && cs[e] === cs[s]) e++;
      if (e - s > len) [at, len] = [s, e - s];
    }
    const mid = at + (len >> 1);
    if (cs.length > w) cs.splice(mid, 1);
    else cs.splice(mid, 0, cs[mid]);
  }
  return cs.join('');
}

/** A plaster wall sprite in another wall style's four tones. */
function fromPlaster(
  part: 'cap' | 'door' | 'window',
  name: string,
  ramp: string[],
  palette: Palette
) {
  const file = `tiles/wall-plaster-${part}.px`;
  const base = parsePx(readFileSync(join(SRC, file), 'utf8'), file, palette);
  const map: Record<string, string> = { P: ramp[0], p: ramp[1], q: ramp[2], Q: ramp[3] };
  return {
    ...base,
    name: `wall-${name}-${part}`,
    file: name,
    frames: base.frames.map((f) => ({
      ...f,
      rows: f.rows.map((r) => r.replace(/[PpqQ]/g, (c) => map[c]))
    }))
  };
}

/**
 * Check a drawn piece and turn it into sprites. Every sprite comes out tagged
 * `drawn`; a prop also carries `place-<where>`.
 */
export function checkArt(
  art: DrawnArt,
  palette: Palette,
  taken: (sprite: string) => boolean = () => false
): { sprites: SpriteDef[]; problems: string[]; px: string } {
  const px = mend(String(art.px ?? ''));
  const problems = checkRequest(art, taken);
  if (problems.length) return { sprites: [], problems, px };
  const at = `art "${art.name}"`;
  let defs: SpriteDef[];
  try {
    defs = splitPx(px).map((t) => parsePx(t, art.name, palette));
  } catch (e) {
    return {
      sprites: [],
      problems: [`${at}: ${e instanceof PxError ? e.message : String(e)}`],
      px
    };
  }
  const say = (msg: string) => problems.push(`${at}: ${msg}`);
  const want = artSprite(art);
  const main = defs.find((d) => d.name === want);
  if (!main) return { sprites: [], problems: [`${at}: there is no "sprite ${want}"`], px };
  const window =
    art.kind === 'wall' ? defs.find((d) => d.name === `wall-${art.name}-window`) : undefined;
  for (const d of defs)
    if (d !== main && d !== window) say(`"sprite ${d.name}" is not part of this piece`);

  for (const d of defs) {
    if (d.frames.length > ART_LIMITS.frames)
      say(`${d.name} has ${d.frames.length} frames, over ${ART_LIMITS.frames}`);
    if (d.lights.length && !hasEmissive(d, palette))
      say(`${d.name} has a light but no emissive pixels under it`);
  }

  if (art.kind === 'floor' || art.kind === 'wall') {
    const [w, h, layer] = art.kind === 'floor' ? [16, 16, 'floor'] : [16, 32, 'wall'];
    for (const d of defs) {
      if (d.width !== w || d.height !== h) say(`${d.name} must be ${w} x ${h}`);
      if (d.layer !== layer) say(`${d.name} must be layer ${layer}`);
      if (d.spots.length) say(`${d.name} cannot have spots`);
    }
    if (!main.frames.some((f) => f.name === '0')) say(`${main.name} needs a frame 0`);
    if (main.frames.some((f) => !/^\d+$/.test(f.name)))
      say(`${main.name}'s frames are numbered 0, 1, 2, for variety`);
    if (window && !window.tags.includes('window')) say(`${window.name} needs "tag window"`);
  } else {
    const [fw, fh] = FOOTPRINT[art.kind];
    const layer = art.kind === 'wall-prop' ? 'wall' : 'object';
    // A stand-in takes its original's layer: a rug's is floor, a door's wall.
    // A new rug or mat lies flat on the floor too.
    const flat = art.kind === 'prop' && main.layer === 'floor';
    if (
      main.layer !== layer &&
      !flat &&
      !(art.replaces && ['object', 'floor', 'wall'].includes(main.layer))
    )
      say(`it must be layer ${layer}`);
    // Staff walk over whatever lies flat, and the office lets the owner put it in a doorway.
    if (main.layer === 'floor' && !main.walkable) say('a rug or mat is walkable, like rug');
    if (main.layer === 'floor' && main.spots.length) say('a rug or mat has no spots');
    if (main.width > ART_LIMITS.width || main.height > ART_LIMITS.height)
      say(`it is ${main.width} x ${main.height}, over ${ART_LIMITS.width} x ${ART_LIMITS.height}`);
    if (main.footprint[0] > fw || main.footprint[1] > fh)
      say(`its footprint is over ${fw} x ${fh} tiles`);
    if (art.kind === 'desk-prop' && !main.walkable) say('a desk prop is walkable, like desk-lamp');
    if (art.kind !== 'prop' && main.spots.length) say('only a prop on the floor can have spots');
    for (const s of main.spots) {
      // A stand-in keeps its original's spots, whatever they are for (a desk's
      // work seat, the bus stop's home); the swap check holds it to them.
      if (!ACTIVITIES.has(s.activity) && !art.replaces)
        say(`spot ${s.name}: activity must be one of ${[...ACTIVITIES].join(', ')}`);
      if (s.pose === 'lie') say(`spot ${s.name}: Odds sit or stand on drawn art`);
      if (s.dx < -1 || s.dy < -1 || s.dx > main.footprint[0] || s.dy > main.footprint[1])
        say(`spot ${s.name} is more than a tile from the footprint`);
    }
  }

  let ramp: string[] = [];
  if (art.kind === 'wall') {
    ramp = Array.isArray(art.ramp) ? art.ramp : [];
    if (ramp.length !== 4 || ramp.some((k) => !palette.colors[k]))
      say('a wall style needs "ramp": four palette keys, light to deep');
  }
  if (problems.length) return { sprites: [], problems, px };

  const sprites: SpriteDef[] = [main];
  if (art.kind === 'wall') {
    sprites.push(window ?? fromPlaster('window', art.name, ramp, palette));
    sprites.push(fromPlaster('cap', art.name, ramp, palette));
    sprites.push(fromPlaster('door', art.name, ramp, palette));
  }
  const place = art.kind === 'floor' || art.kind === 'wall' ? [] : [`place-${placeOf(art)}`];
  for (const s of sprites) s.tags = [...new Set([...s.tags, 'drawn', ...place])];
  return { sprites, problems: [], px };
}

/** The catalog entries for drawn sprites, shaped like the compiled atlas's. */
export function artCatalog(sprites: SpriteDef[], palette: Palette) {
  return Object.fromEntries(sprites.map((d) => [d.name, spriteMeta(d, palette)]));
}

/** Every frame of the drawn sprites in one PNG, with each frame's box by atlas key. */
export type ArtSheet = {
  png: Uint8Array;
  frames: Record<string, [number, number, number, number]>;
};

export function artSheet(sprites: SpriteDef[], palette: Palette): ArtSheet {
  const cells: { key: string; img: Image }[] = [];
  for (const d of sprites) {
    const glow = hasEmissive(d, palette);
    for (const f of d.frames) {
      cells.push({ key: `${d.name}/${f.name}`, img: renderFrame(d, f, palette) });
      // The emissive pixels alone, which the floor paints above the night shade.
      if (glow)
        cells.push({
          key: `${d.name}/${f.name}~e`,
          img: renderFrame(d, f, palette, undefined, true)
        });
    }
  }
  // 2px gutters, each filled with its frame's edge pixels (`extrude`).
  const MAX = 1024;
  const PAD = 2;
  const frames: ArtSheet['frames'] = {};
  let x = PAD;
  let y = PAD;
  let shelf = 0;
  let width = 1;
  for (const c of cells) {
    if (x + c.img.width + PAD > MAX) {
      x = PAD;
      y += shelf + PAD;
      shelf = 0;
    }
    frames[c.key] = [x, y, c.img.width, c.img.height];
    x += c.img.width + PAD;
    width = Math.max(width, x);
    shelf = Math.max(shelf, c.img.height);
  }
  const img = createImage(width, y + shelf + PAD);
  for (const c of cells) {
    const [fx, fy, fw, fh] = frames[c.key];
    drawImage(img, c.img, fx, fy);
    extrude(img, fx, fy, fw, fh);
  }
  return { png: encodePng(img), frames };
}

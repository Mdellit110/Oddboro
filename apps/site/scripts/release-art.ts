// The art on /releases/: one looping GIF per release that has one, built on
// the desk vignette (an Odd typing at its desk) or the office's front door,
// and a still of its last frame for visitors who ask for reduced motion. art.ts calls this once per
// theme, with the vignette's layers lit for night or for day, so every
// animation added here comes in both. Every colour added here is the house
// palette's, and `shade` lights it the way the room is lit.
//
//   hello-world   the screen answers the Odd's typing: "HELLO, WORLD!" fills
//                 a speech bubble one letter at a time (0.0.1)
//   stuck-sign-in Ada walks into the shut front door, three times, backs off
//                 and wonders why (0.0.2, the stuck sign-in fix)
//   linux         the screen flashes and a penguin jumps out of it, arcs over
//                 the desk and lands on the floor (0.0.3)
//   locked-door   the open front door's two leaves slide shut together in
//                 front of Ada, she locks it, CLICK, steps back with a
//                 padlock on it and faces the street (0.0.4, the office
//                 takes actions only from its own page)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createImage, drawImage, encodePng, scaleImage, type Image } from '@oddboro/sprites/png';
import { hexToRgba } from '@oddboro/sprites/px';
import { encodeGif, type GifFrame } from './gif.ts';

export type DeskLayers = {
  /** The room, lit, without the Odd. */
  room: Image;
  /** What stands in front of the Odd. */
  front: Image;
  /** The Odd typing, one image per frame, already lit and placed. */
  odd: Image[];
  /** Lights an added sprite the way the room's lamp lights the Odd. */
  shade: (img: Image) => Image;
};

const PALETTE = JSON.parse(
  readFileSync(new URL('../../../packages/sprites/src/palette.json', import.meta.url), 'utf8')
).colors as Record<string, { hex: string }>;

/** The office's front door, shut, and the sidewalk below it. */
export type DoorLayers = {
  /** The street and the building's front, lit, with no Odd. */
  room: Image;
  /** The door, in the room's pixels. */
  door: { x: number; y: number; w: number; h: number };
  /** The door open, lit, the size of `door`, to draw over the shut one. */
  open: Image;
  /** Ada in one sprite frame, like `walk-up-2`, lit, 16 by 32. */
  odd: (frame: string) => Image;
};

export type Layers = { desk: DeskLayers; door: DoorLayers };

/** A sprite drawn in palette keys, one character per pixel, `.` see-through. */
function sprite(rows: string[]): Image {
  const img = createImage(rows[0].length, rows.length);
  rows.forEach((row, y) =>
    [...row].forEach((key, x) => {
      if (key !== '.') img.data.set(hexToRgba(PALETTE[key].hex), (y * img.width + x) * 4);
    })
  );
  return img;
}

// The penguin: ink body, paper belly and eyes, amber beak and feet. Wings up
// in the air, at its sides on the ground, and its eyes shut for a blink.
const PENGUIN = [
  '...kkkk...',
  '..kkkkkk..',
  '..k=kk=k..',
  '..kkkkkk..',
  '..kkyykk..',
  '.kk=yy=kk.',
  '.k======k.',
  'kk======kk',
  'kk======kk',
  '.k======k.',
  '.kk====kk.',
  '..kkkkkk..',
  '.yyy..yyy.'
];
const PENGUIN_FLY = PENGUIN.map((r, y) =>
  y === 5 ? 'kkk=yy=kkk' : y === 7 || y === 8 ? '.k======k.' : r
);
const PENGUIN_BLINK = PENGUIN.map((r, y) => (y === 2 ? '..kkkkkk..' : r));

// The screen of the left desk's monitor, in the vignette's pixels.
const SCREEN = { x: 58, y: 22, w: 10, h: 6 };
const FLASH = 'g';

/** A 5-pixel-high capital font, enough for the hello. */
const GLYPHS: Record<string, string[]> = {
  H: ['x.x', 'x.x', 'xxx', 'x.x', 'x.x'],
  E: ['xxx', 'x..', 'xx.', 'x..', 'xxx'],
  L: ['x..', 'x..', 'x..', 'x..', 'xxx'],
  O: ['.x.', 'x.x', 'x.x', 'x.x', '.x.'],
  W: ['x...x', 'x...x', 'x.x.x', 'x.x.x', '.x.x.'],
  R: ['xx.', 'x.x', 'xx.', 'x.x', 'x.x'],
  D: ['xx.', 'x.x', 'x.x', 'x.x', 'xx.'],
  ',': ['.', '.', '.', 'x', 'x'],
  '!': ['x', 'x', 'x', '.', 'x'],
  '?': ['xx.', '..x', '.x.', '...', '.x.'],
  C: ['.xx', 'x..', 'x..', 'x..', '.xx'],
  I: ['xxx', '.x.', '.x.', '.x.', 'xxx'],
  K: ['x.x', 'x.x', 'xx.', 'x.x', 'x.x'],
  ' ': ['..', '..', '..', '..', '..']
};
const HELLO = 'HELLO, WORLD!';

const width = (text: string) =>
  [...text].reduce((w, ch, i) => w + GLYPHS[ch][0].length + (i ? 1 : 0), 0);

/** A bubble with the first `shown` letters of `text`, its tail down at its start. */
function bubble(shown: number, text = HELLO): Image {
  const w = width(text) + 6;
  const h = 11;
  const rows: string[] = [];
  for (let y = 0; y < h + 3; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const corner = (x === 0 || x === w - 1) && (y === 0 || y === h - 1);
      const edge = x === 0 || x === w - 1 || y === 0 || y === h - 1;
      if (y < h) row += corner ? '.' : edge ? 'k' : '=';
      // The tail: three rows narrowing toward the bubble's start.
      else if (y === h) row += x === 3 ? 'k' : x === 4 || x === 5 ? '=' : x === 6 ? 'k' : '.';
      else if (y === h + 1) row += x === 3 ? 'k' : x === 4 ? '=' : x === 5 ? 'k' : '.';
      else row += x === 3 || x === 4 ? 'k' : '.';
    }
    rows.push(row);
  }
  // Opening the bubble's bottom edge over the tail.
  rows[h - 1] = rows[h - 1].slice(0, 4) + '==' + rows[h - 1].slice(6);
  const img = sprite(rows);
  let x = 3;
  [...text].slice(0, shown).forEach((ch) => {
    const glyph = GLYPHS[ch];
    glyph.forEach((row, gy) =>
      [...row].forEach((on, gx) => {
        if (on === 'x') img.data.set(hexToRgba(PALETTE.k.hex), ((3 + gy) * img.width + x + gx) * 4);
      })
    );
    x += glyph[0].length + 1;
  });
  return img;
}

/** One frame: the room, the Odd at frame `t`, what stands in front, then `extra` on top. */
function frame(layers: DeskLayers, t: number, extra: (img: Image) => void): Image {
  const img = createImage(layers.room.width, layers.room.height);
  drawImage(img, layers.room, 0, 0);
  // The Odd types at about 3.7 frames a second: a new pose every third GIF frame.
  drawImage(img, layers.odd[Math.floor(t / 3) % layers.odd.length], 0, 0);
  drawImage(img, layers.front, 0, 0);
  extra(img);
  return img;
}

const DELAY = 9;

function helloWorld(layers: DeskLayers): GifFrame[] {
  const tip = bubble(0);
  const at = { x: SCREEN.x - 2, y: SCREEN.y - tip.height - 1 };
  const frames: GifFrame[] = [];
  // Typing, then a letter a frame, a long hold, and a pause before it loops.
  const shown = [
    ...Array(8).fill(-1),
    ...[...HELLO].map((_, i) => i + 1),
    ...Array(26).fill(HELLO.length),
    ...Array(6).fill(-1)
  ];
  shown.forEach((n, t) =>
    frames.push({
      image: frame(layers, t, (img) => {
        if (n >= 0) drawImage(img, bubble(n), at.x, at.y);
      }),
      delay: DELAY
    })
  );
  // The still: the whole hello.
  frames.push({
    image: frame(layers, 0, (img) => drawImage(img, bubble(HELLO.length), at.x, at.y)),
    delay: 0
  });
  return frames;
}

function linux(layers: DeskLayers): GifFrame[] {
  const stand = layers.shade(sprite(PENGUIN));
  const fly = layers.shade(sprite(PENGUIN_FLY));
  const blink = layers.shade(sprite(PENGUIN_BLINK));
  const flash = sprite(Array(SCREEN.h).fill(FLASH.repeat(SCREEN.w)));
  const from = { x: SCREEN.x, y: SCREEN.y - 4 };
  const to = { x: 80, y: 64 };
  const frames: GifFrame[] = [];
  let t = 0;
  const add = (extra: (img: Image) => void, delay = DELAY) =>
    frames.push({ image: frame(layers, t++, extra), delay });

  for (let i = 0; i < 9; i++) add(() => {});
  // The screen flashes twice.
  for (const on of [true, false, true])
    add((img) => on && drawImage(img, flash, SCREEN.x, SCREEN.y));
  // Out of the screen, up, and over: a parabola from the screen to the floor.
  const STEPS = 11;
  for (let i = 1; i <= STEPS; i++) {
    const s = i / STEPS;
    const x = Math.round(from.x + (to.x - from.x) * s);
    const y = Math.round(from.y + (to.y - from.y) * s - 28 * Math.sin(Math.PI * s));
    add((img) => {
      if (i === 1) drawImage(img, flash, SCREEN.x, SCREEN.y);
      drawImage(img, i % 2 ? fly : stand, x, y);
    });
  }
  // The landing: a squash for a frame, then standing, with one blink.
  const squash = createImage(stand.width, stand.height);
  drawImage(squash, stand, 0, 1);
  add((img) => drawImage(img, squash, to.x, to.y));
  for (let i = 0; i < 28; i++)
    add((img) => drawImage(img, i === 12 || i === 13 ? blink : stand, to.x, to.y));
  // The still: the penguin on the floor beside the desk.
  frames.push({ image: frame(layers, 0, (img) => drawImage(img, stand, to.x, to.y)), delay: 0 });
  return frames;
}

// The bonk: a paper burst, outlined in ink so it shows on a lit door by
// night and on a sunny one by day.
const BONK = sprite(['...k...', '.k.=.k.', '..k=k..', 'k==.==k', '..k=k..', '.k.=.k.', '...k...']);

function stuckSignIn({ room, door, odd }: DoorLayers): GifFrame[] {
  const x = Math.round(door.x + door.w / 2 - 8);
  // Ada's sprite top: at the door, standing on the row below it, and where
  // she starts and ends, a tile and a half back on the sidewalk.
  const at = door.y + door.h - 16;
  const start = at + 24;
  const frames: GifFrame[] = [];
  const add = (pose: string, y: number, extra?: (img: Image) => void) => {
    const img = createImage(room.width, room.height);
    drawImage(img, room, 0, 0);
    drawImage(img, odd(pose), x, y);
    extra?.(img);
    frames.push({ image: img, delay: DELAY });
  };
  const walk = (from: number, to: number) => {
    const steps = Math.ceil(Math.abs(to - from) / 2);
    for (let i = 1; i <= steps; i++)
      add(`walk-up-${Math.floor(i / 2) % 4}`, Math.round(from + ((to - from) * i) / steps));
  };
  const ouch = bubble(1, '!');
  const huh = bubble(1, '?');
  const over = (b: Image, y: number) => (img: Image) => drawImage(img, b, x + 4, y - b.height + 2);
  const bonk = () => {
    add('idle-up-0', at + 4, (img) => drawImage(img, BONK, x + 5, at + 1));
    for (let i = 0; i < 4; i++) add('idle-up-0', at + 4, over(ouch, at + 4));
  };

  for (let i = 0; i < 6; i++) add('idle-up-0', start);
  walk(start, at);
  bonk();
  walk(at + 4, at);
  bonk();
  walk(at + 4, at);
  bonk();
  // Backing off, still facing the door, to where she began.
  walk(at + 4, start);
  for (let i = 0; i < 12; i++) add('idle-up-0', start, over(huh, start));
  // The still: Ada on the sidewalk, wondering.
  const still = createImage(room.width, room.height);
  drawImage(still, room, 0, 0);
  drawImage(still, odd('idle-up-0'), x, start);
  over(huh, start)(still);
  frames.push({ image: still, delay: 0 });
  return frames;
}

// The padlock, hung through both brass pulls: an amber body with a keyhole,
// outlined in ink so it shows on the lit glass by night and by day.
const PADLOCK = sprite([
  '.kkkk.',
  '.k..k.',
  '.k..k.',
  'kkkkkk',
  'kYYYYk',
  'kYkkYk',
  'kYYYYk',
  'kkkkkk'
]);

// The two leaves of the front door, in the door sprite's pixels: the full
// height of the doorway, rows 13 to 30, inside the jamb from column 11 to 36,
// meeting in the middle. Each is 13 columns wide.
const LEAF = { top: 13, bottom: 30, left: 11, right: 36, w: 13 };

// The sprite's doorway has a transom, two panes and a bar over shorter
// leaves (rows 13 to 17). Here the leaves run its full height instead: each
// row listed copies another row of the sprite's own, already lit, between its
// frame's columns 8 and 39. Shut, the leaf's top rail moves up under the frame
// and the glass grows, with the pulls where they were. Open, the dark
// doorway does the same. Rows not listed stay as they are.
const FULL_HEIGHT = {
  shut: { 13: 18, 14: 19, 15: 20, 16: 21, 17: 21, 18: 21, 19: 21, 20: 21 },
  open: { 13: 18, 14: 19, 15: 20, 16: 20, 17: 20, 18: 20, 19: 20 }
} satisfies Record<string, Record<number, number>>;

/** The door's pixels from `src` at (x, y), with its rows moved as `rows` says. */
function fullHeight(src: Image, x: number, y: number, rows: Record<number, number>): Image {
  const w = 48;
  const h = 32;
  const img = createImage(w, h);
  const at = (r: number, c: number) => ((y + r) * src.width + x + c) * 4;
  for (let r = 0; r < h; r++) {
    const from = rows[r as keyof typeof rows] ?? r;
    for (let c = 0; c < w; c++) {
      const s = at(c >= 8 && c <= 39 ? from : r, c);
      img.data.set(src.data.subarray(s, s + 4), (r * w + c) * 4);
    }
  }
  return img;
}

function lockedDoor({ room, door, open, odd }: DoorLayers): GifFrame[] {
  const x = Math.round(door.x + door.w / 2 - 8);
  // Ada's sprite top: at the door, half a step back where she waits while it
  // shuts, a step back where the padlock shows over her head, and where she
  // starts, a tile and a half back on the sidewalk.
  const at = door.y + door.h - 16;
  const near = at + 8;
  const back = at + 12;
  const start = at + 24;
  // The pulls sit in the door's columns 21 and 26, rows 22 to 24.
  const lock = { x: door.x + 21, y: door.y + 19 };
  const frames: GifFrame[] = [];
  // The door shut and open, its leaves the doorway's full height.
  const shut = fullHeight(room, door.x, door.y, FULL_HEIGHT.shut);
  const opened = fullHeight(open, 0, 0, FULL_HEIGHT.open);
  // How far the leaves have slid shut, 0 open to 1 shut.
  let slid = 0;
  let locked = false;
  const scene = (pose: string, y: number, extra?: (img: Image) => void) => {
    const img = createImage(room.width, room.height);
    drawImage(img, room, 0, 0);
    drawImage(img, slid < 1 ? leaves() : shut, door.x, door.y);
    if (locked) drawImage(img, PADLOCK, lock.x, lock.y);
    drawImage(img, odd(pose), x, y);
    extra?.(img);
    return img;
  };
  const add = (pose: string, y: number, extra?: (img: Image) => void) =>
    frames.push({ image: scene(pose, y, extra), delay: DELAY });
  const walk = (from: number, to: number) => {
    const steps = Math.ceil(Math.abs(to - from) / 2);
    for (let i = 1; i <= steps; i++)
      add(`walk-up-${Math.floor(i / 2) % 4}`, Math.round(from + ((to - from) * i) / steps));
  };
  const click = bubble(6, 'CLICK!');
  const over = (b: Image, y: number) => (img: Image) => drawImage(img, b, x + 4, y - b.height + 2);

  /**
   * The door part way shut, over the open doorway: each leaf, whole and full
   * height, slid in from its side of the jamb. The part still in the wall
   * does not show.
   */
  function leaves(): Image {
    const img = createImage(opened.width, opened.height);
    drawImage(img, opened, 0, 0);
    const off = Math.round(LEAF.w * (1 - slid));
    for (let i = 0; i < LEAF.w - off; i++) {
      // The leaf's inner edge leads: column i from the jamb shows the shut
      // leaf's column i + off.
      for (const [dx, sx] of [
        [LEAF.left + i, LEAF.left + i + off],
        [LEAF.right - i, LEAF.right - i - off]
      ])
        for (let y = LEAF.top; y <= LEAF.bottom; y++) {
          const src = (y * shut.width + sx) * 4;
          img.data.set(shut.data.subarray(src, src + 4), (y * img.width + dx) * 4);
        }
    }
    return img;
  }

  for (let i = 0; i < 6; i++) add('idle-up-0', start);
  walk(start, near);
  for (let i = 0; i < 2; i++) add('idle-up-0', near);
  // Both leaves slide together and meet in the middle, quick at first and
  // slowing as they meet.
  for (const s of [0.15, 0.35, 0.55, 0.72, 0.86, 0.95, 1]) {
    slid = s;
    add('idle-up-0', near);
  }
  for (let i = 0; i < 2; i++) add('idle-up-0', near);
  // She steps up and turns the key.
  walk(near, at);
  add('idle-up-0', at);
  locked = true;
  for (let i = 0; i < 8; i++) add('idle-up-0', at, over(click, at));
  // A step back, still facing the door, so the padlock shows.
  walk(at, back);
  for (let i = 0; i < 4; i++) add('idle-up-0', back);
  // Then she turns to face the street and stands by the locked door.
  add('idle-side-0', back);
  for (let i = 0; i < 24; i++) add(`idle-down-${Math.floor(i / 3) % 4}`, back);
  // The still: the door locked, Ada facing the street.
  frames.push({ image: scene('idle-down-0', back), delay: 0 });
  return frames;
}

/**
 * Every release's art. `share` is the GIF frame, counted from 0, that becomes
 * the link preview while that release is the newest one, and `shareLight` is
 * whether that frame is drawn by night or by day. The owner picks both when
 * the art is made; there is no default.
 */
const ART: {
  name: string;
  frames: (layers: Layers) => GifFrame[];
  share: number;
  shareLight: 'night' | 'day';
}[] = [
  // The whole hello in its bubble.
  { name: 'hello-world', frames: (l) => helloWorld(l.desk), share: 30, shareLight: 'night' },
  // Ada backed off on the sidewalk, wondering.
  { name: 'stuck-sign-in', frames: (l) => stuckSignIn(l.door), share: 55, shareLight: 'night' },
  // The penguin standing on the floor, by day, where his ink shows.
  { name: 'linux', frames: (l) => linux(l.desk), share: 30, shareLight: 'day' },
  // Ada facing the street beside the locked door, by night, where the glass glows.
  { name: 'locked-door', frames: (l) => lockedDoor(l.door), share: 60, shareLight: 'night' }
];

// The link preview's size, and the ink it sits on.
const CARD = { w: 1200, h: 630 };

/** One frame, scaled up by whole pixels and centred on ink, at the preview's size. */
function shareCard(img: Image): Image {
  const scale = Math.min(Math.floor(CARD.w / img.width), Math.floor(CARD.h / img.height));
  const card = createImage(CARD.w, CARD.h);
  const ink = hexToRgba(PALETTE.k.hex);
  for (let p = 0; p < CARD.w * CARD.h; p++) card.data.set(ink, p * 4);
  const big = scaleImage(img, scale);
  drawImage(card, big, (CARD.w - big.width) >> 1, (CARD.h - big.height) >> 1);
  return card;
}

/**
 * Writes <name>.gif and its still, <name>.png, into `dir`, for one theme. In
 * the light an animation picks for its link preview, it also writes
 * <name>-share.png into `shareDir`, the same folder in both themes.
 */
export function writeReleaseArt(
  layers: Layers,
  dir: string,
  theme: 'night' | 'day',
  shareDir: string
): void {
  mkdirSync(dir, { recursive: true });
  for (const art of ART) {
    const frames = art.frames(layers);
    const gif = frames.slice(0, -1);
    if (!Number.isInteger(art.share) || art.share < 0 || art.share >= gif.length)
      throw new Error(`${art.name}: share frame ${art.share} is not one of its ${gif.length}`);
    writeFileSync(join(dir, `${art.name}.gif`), encodeGif(gif));
    writeFileSync(join(dir, `${art.name}.png`), encodePng(frames.at(-1)!.image));
    if (theme === art.shareLight) {
      mkdirSync(shareDir, { recursive: true });
      writeFileSync(
        join(shareDir, `${art.name}-share.png`),
        encodePng(shareCard(gif[art.share].image))
      );
    }
    console.log(`${relative(process.cwd(), join(dir, art.name))}.gif: ${gif.length} frames`);
  }
}

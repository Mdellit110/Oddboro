// The looping GIF at the top of the repo's README: the Main Street office,
// the one a new owner's office starts as, by day, with eight Odds at work in
// it. Five stay put: typing, at reception, reading, on the treadmill, eating.
// Three walk between rooms and back, so the loop ends where it starts. The
// office's sign sits over it all as the title.
//
//   node scripts/office-gif.ts           writes docs/office.gif
//   node scripts/office-gif.ts --night   writes docs/office-night.gif, lamps on
//
// Everything moves the way the office moves it: Odds walk the office's own
// paths at about its pace, play the pose each spot asks for at their own
// tempo, and stand behind what stands in front of them. The props animate at
// their own speeds. The loop's length is a whole number of turns of every
// animation in it, so nothing jumps when it starts again.
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createImage, drawImage, scaleImage, type Image } from '@oddboro/sprites/png';
import { loadLibrary, lookFrame, type LookSpec } from '@oddboro/sprites/look';
import { composeWorld, findPath, TILE, type DrawCmd, type PlacedSpot } from '@oddboro/world';
import { loadSpaces } from '@oddboro/world/load';
import { encodeGifChanges } from './gif.ts';
import { catalog, cropTo, DAY, frameImage, lighting, NIGHT, sprites, type Rect } from './paint.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const night = process.argv.includes('--night');
const OUT = join(ROOT, 'docs', night ? 'office-night.gif' : 'office.gif');

/** Ten frames a second. */
const FPS = 10;
/** The loop: 48 seconds, a whole number of turns of every animation in it. */
const LOOP = 480;
/** Pixels a walking Odd covers each frame: a tile in four frames, about the office's pace. */
const STRIDE = 4;
/** The office plays a walk at 8 frames a second. */
const WALK_FPS = 8;
/** The sign over the office, this many times its size, this far from the top. */
const SIGN = { scale: 3, margin: 4 };

const { rooms, plans } = loadSpaces();
// The office's sample, as apps/office's space.ts builds it.
const world = composeWorld(plans['main-street'], rooms, catalog, { actors: false });
const W = world.width * TILE;
const H = world.height * TILE;
const { paint, shade, light } = lighting(night ? NIGHT : DAY, W, H);

// The view: the building from wall to wall, a band of lawn above it for the
// sign, and the sidewalk below it with the bus stop.
const signDef = sprites.get('lobby-sign')!;
const indoors = [...world.rooms, ...world.halls].filter((a) => !a.outdoor);
const left = Math.min(...indoors.map((a) => a.x));
const right = Math.max(...indoors.map((a) => a.x + a.w));
const top = Math.min(...indoors.map((a) => a.y));
const street = world.rooms.find((r) => r.outdoor)!;
const band = signDef.height * SIGN.scale + 2 * SIGN.margin;
const view: Rect = {
  x: left * TILE - TILE / 2,
  y: top * TILE - band,
  w: (right - left + 1) * TILE,
  h: (street.y + 3) * TILE - (top * TILE - band)
};

/** An Odd's look: its frame names, and one frame as an image. */
type Look = { frames: Set<string>; image: (frame: string) => Image };

const staff = (sprite: string, variant: string): Look => {
  const def = sprites.get(sprite)!;
  return {
    frames: new Set(def.frames.map((f) => f.name)),
    image: (frame) => frameImage(def, frame, variant)
  };
};
const lib = loadLibrary();
const looks = JSON.parse(
  readFileSync(join(ROOT, 'apps', 'site', 'scripts', 'manager-looks.json'), 'utf8')
) as Record<string, LookSpec>;
const drawn = (name: string): Look => ({
  frames: new Set(lib.bodies.trousers.frames.map((f) => f.name)),
  image: (frame) => lookFrame(lib, looks[name], frame)
});

/**
 * Who is in the office and where they go. Each Odd starts at its first stop,
 * walks to the next, and after the last walks back to the first. `stay` is
 * how many frames it spends at a stop; the first stop takes what the loop
 * has left. `from` is the frame of its round the loop opens on, so the
 * walkers are not in step.
 */
const CAST: { name: string; look: Look; stops: { at: string; stay?: number }[]; from?: number }[] =
  [
    { name: 'ada', look: staff('staff-b', 'ada'), stops: [{ at: 'workspace#1/desk#21/seat' }] },
    {
      name: 'marshall',
      look: staff('staff', 'marshall'),
      stops: [{ at: 'lobby#2/lobby-reception#40/seat' }]
    },
    {
      name: 'juno',
      look: staff('staff', 'juno'),
      stops: [{ at: 'library#7/library-armchair#133/read' }]
    },
    { name: 'theo', look: staff('staff', 'theo'), stops: [{ at: 'gym#8/gym-treadmill#152/run' }] },
    { name: 'ziva', look: drawn('ziva'), stops: [{ at: 'kitchen#6/kitchen-table#116/seat-1' }] },
    // From the mail to the bench outside the owner's door, to wait on a yes.
    {
      name: 'wren',
      look: staff('staff-b', 'wren'),
      stops: [
        { at: 'mail-room#3/mail-sort-table#51/sort' },
        { at: 'lobby#2/owner-bench#37/right', stay: 130 }
      ],
      from: 300
    },
    // From a desk in Workspace East down to the gym's bike.
    {
      name: 'jamal',
      look: drawn('jamal'),
      stops: [
        { at: 'workspace-east#4/desk@ash#70/seat' },
        { at: 'gym#8/gym-bike#159/cycle', stay: 50 }
      ],
      from: 20
    },
    // From the arcade in the break room next door to the kitchen table, beside Ziva.
    {
      name: 'cindy',
      look: drawn('cindy'),
      stops: [
        { at: 'break-room#5/break-arcade#82/play' },
        { at: 'kitchen#6/kitchen-table#116/seat-3', stay: 100 }
      ],
      from: 60
    }
  ];

const spotById = (id: string): PlacedSpot => {
  const s = world.spots.find((x) => x.id === id);
  if (!s) throw new Error(`Main Street has no spot ${id}`);
  return s;
};

/**
 * The pose an Odd plays at a spot, as the office picks it in
 * apps/office/src/lib/staff/places.ts: the activity's own pose when the look
 * has it and it faces the spot's way, else sitting or standing that way.
 */
const ACTIVITY_POSE: Record<string, string> = {
  work: 'sit-up',
  read: 'read-down',
  play: 'play-up',
  rest: 'sit-down',
  eat: 'eat-down'
};
function poseAt(s: PlacedSpot, look: Look): string {
  const dir = s.facing === 'left' || s.facing === 'right' ? 'side' : s.facing;
  const own = ACTIVITY_POSE[s.activity];
  const options = [
    ...(s.activity === 'exercise' ? [`exercise-${s.name}`] : []),
    ...(own && own.endsWith(`-${dir}`) && !(s.pose === 'sit' && own === 'play-up') ? [own] : []),
    `${s.pose === 'sit' ? 'sit' : 'idle'}-${dir}`,
    `idle-${dir}`
  ];
  return options.find((p) => look.frames.has(`${p}-0`))!;
}
const framesOf = (pose: string, look: Look) => {
  const out: string[] = [];
  while (look.frames.has(`${pose}-${out.length}`)) out.push(`${pose}-${out.length}`);
  return out;
};

/** The same hash the office gives an Odd's id, for its tempo and where in its pose it starts. */
const hash = (s: string) => {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};

/** Fails when an animation of `count` frames at `fps` would not come round at the loop's end. */
const closes = (what: string, fps: number, count: number) => {
  const turns = (LOOP * fps) / FPS;
  if (!Number.isInteger(turns) || turns % count)
    throw new Error(`${what} does not loop in ${LOOP} frames at ${fps} fps`);
};

/** Where an Odd is on one frame: its feet (bottom centre), its frame, and which way. */
type Pose = { x: number; y: number; frame: string; flip: boolean; still: boolean };

/** Every Odd's round as one function of the frame. */
const cast = CAST.map((c) => {
  const spots = c.stops.map((s) => spotById(s.at));
  const h = hash(c.name);
  // The office's tempo, 4 frames a second times 0.8 to 1.2, to the nearest
  // quarter, so a whole number of poses fits in the loop.
  const fps = Math.round(4 * (0.8 + (h % 401) / 1000) * 4) / 4;
  const phase = (h >>> 12) % 1000;
  const segments: ((t: number) => Pose)[] = [];
  const lengths: number[] = [];
  const feet = ([tx, ty]: [number, number]) => ({ x: tx * TILE + TILE / 2, y: (ty + 1) * TILE });
  spots.forEach((s, i) => {
    const pose = poseAt(s, c.look);
    const frames = framesOf(pose, c.look);
    closes(`${c.name}'s ${pose}`, fps, frames.length);
    lengths.push(c.stops[i].stay ?? 0);
    segments.push((t) => ({
      ...feet(s.tile),
      frame: frames[(Math.floor((t * fps) / FPS) + phase) % frames.length],
      flip: s.facing === 'left',
      still: true
    }));
    if (spots.length === 1) return;
    // The walk on, up from this spot the way the office leaves it and onto
    // the next from its approach.
    const next = spots[(i + 1) % spots.length];
    const path = findPath(world.walkable, world.width, s.tile, next.tile, {
      leave: s.approach,
      enter: next.approach
    });
    if (!path) throw new Error(`${c.name} has no way from ${s.id} to ${next.id}`);
    lengths.push((path.length - 1) * (TILE / STRIDE));
    segments.push((t) => {
      const step = Math.floor((t * STRIDE) / TILE);
      const [a, b] = [feet(path[step]), feet(path[step + 1])];
      const f = ((t * STRIDE) % TILE) / TILE;
      const facing = b.x !== a.x ? (b.x > a.x ? 'right' : 'left') : b.y > a.y ? 'down' : 'up';
      const dir = facing === 'left' || facing === 'right' ? 'side' : facing;
      return {
        x: a.x + (b.x - a.x) * f,
        y: a.y + (b.y - a.y) * f,
        frame: `walk-${dir}-${Math.floor((t * WALK_FPS) / FPS) % 4}`,
        flip: facing === 'left',
        still: false
      };
    });
  });
  const spare = LOOP - lengths.reduce((a, b) => a + b, 0);
  if (spare < 0)
    throw new Error(`${c.name}'s round is ${LOOP - spare} frames, longer than the loop`);
  lengths[0] += spare;
  return {
    look: c.look,
    at: (i: number): Pose => {
      let t = (i + (c.from ?? 0)) % LOOP;
      let k = 0;
      while (t >= lengths[k]) t -= lengths[k++];
      const p = segments[k](t);
      // A pose keeps the loop's clock, so it carries on where it was when the Odd sat down.
      return p.still ? segments[k](i) : p;
    }
  };
});

// The props that animate in view, each on its own clock from the frame the
// office starts it on.
const inView = (r: Rect) =>
  r.x < view.x + view.w && r.x + r.w > view.x && r.y < view.y + view.h && r.y + r.h > view.y;
const rectOf = (d: DrawCmd): Rect => ({
  x: d.x,
  y: d.y,
  w: catalog[d.sprite].width,
  h: catalog[d.sprite].height
});
const anims = world.draws.flatMap((d) => {
  const meta = catalog[d.sprite];
  const m = /^(.*)-(\d+)$/.exec(d.frame);
  if (!m || meta.fps <= 0 || !inView(rectOf(d))) return [];
  const frames = meta.frames.filter(
    (f) => f.startsWith(`${m[1]}-`) && /^\d+$/.test(f.slice(m[1].length + 1))
  );
  if (frames.length < 2) return [];
  closes(d.sprite, meta.fps, frames.length);
  return [{ d, frames, fps: meta.fps, start: (Math.abs(d.x * 7 + d.y * 13) >> 4) % frames.length }];
});
const longest = Math.max(1, ...anims.map((a) => a.frames.length));
// The office lit once for each frame of the animations, cut to the view.
// Each animated prop takes its own rectangle from the render of its frame.
const renders = Array.from({ length: longest }, (_, k) => {
  const draws = world.draws.map((d) => {
    const a = anims.find((x) => x.d === d);
    return a ? { ...d, frame: a.frames[k % a.frames.length] } : d;
  });
  return cropTo(light(paint(draws, true), world, draws), view);
});
const frameAt = (a: (typeof anims)[number], i: number) =>
  (a.start + Math.floor((i * a.fps) / FPS)) % a.frames.length;

/** Pixels that something standing covers: an Odd's shadow falls only on the floor. */
const standing = world.draws.filter((d) => d.pass >= 2);
const covered = cropTo(paint(standing, false), view);

/** One frame of an Odd, lit for the hour. */
const litFrames = new Map<Look, Map<string, Image>>();
function lit(look: Look, frame: string): Image {
  const cache = litFrames.get(look) ?? new Map<string, Image>();
  litFrames.set(look, cache);
  let img = cache.get(frame);
  if (!img) {
    const src = look.image(frame);
    img = createImage(src.width, src.height);
    drawImage(img, src, 0, 0);
    cache.set(frame, shade(img, 1));
  }
  return img;
}

// The sign as the title: unlit, so at full brightness whatever the hour.
const sign = scaleImage(frameImage(signDef, 'default'), SIGN.scale);

/** Pixel `(x, y)` of the view, or -1 off it. */
const at = (x: number, y: number) =>
  x < 0 || y < 0 || x >= view.w || y >= view.h ? -1 : (y * view.w + x) * 4;

function shot(i: number): Image {
  const room = createImage(view.w, view.h);
  room.data.set(renders[0].data);
  for (const a of anims) {
    const f = frameAt(a, i);
    const r = rectOf(a.d);
    const src = renders[f];
    for (let y = r.y - view.y; y < r.y - view.y + r.h; y++)
      for (let x = r.x - view.x; x < r.x - view.x + r.w; x++) {
        const p = at(x, y);
        if (p >= 0) room.data.set(src.data.subarray(p, p + 4), p);
      }
  }
  const img = createImage(view.w, view.h);
  img.data.set(room.data);
  const odds = cast
    .map((c) => ({ c, p: c.at(i) }))
    .map(({ c, p }) => ({ c, p, x: Math.round(p.x) - view.x, y: Math.round(p.y) - view.y }));
  // Shadows first, on the floor under everything standing: the office's
  // ellipse under each Odd's feet, ten pixels wide and three high.
  for (const { x, y } of odds)
    for (let dy = -2; dy <= 1; dy++)
      for (let dx = -5; dx <= 4; dx++) {
        const ex = (dx + 0.5) / 5;
        const ey = (dy + 0.5) / 1.6;
        if (ex * ex + ey * ey > 1) continue;
        const p = at(x + dx, y - 1 + dy);
        if (p < 0 || covered.data[p + 3]) continue;
        for (let ch = 0; ch < 3; ch++) img.data[p + ch] = Math.round(img.data[p + ch] * 0.72);
      }
  // Then the Odds back to front, each with what stands in front of it drawn
  // back over it, from the room. A seated Odd sorts a row up, so a chair's
  // back covers it.
  const depth = (o: (typeof odds)[number]) => o.y + view.y - (o.p.still ? 1 : 0);
  for (const o of odds.sort((a, b) => depth(a) - depth(b))) {
    const sprite = lit(o.c.look, o.p.frame);
    const body: Rect = {
      x: o.x - TILE / 2,
      y: o.y - sprite.height,
      w: sprite.width,
      h: sprite.height
    };
    drawImage(img, sprite, body.x, body.y, o.p.flip);
    const z = depth(o);
    for (const d of standing) {
      if (d.z <= z) continue;
      const r = rectOf(d);
      const rx = r.x - view.x;
      const ry = r.y - view.y;
      if (
        rx >= body.x + body.w ||
        rx + r.w <= body.x ||
        ry >= body.y + body.h ||
        ry + r.h <= body.y
      )
        continue;
      const a = anims.find((x) => x.d === d);
      const mask = frameImage(
        sprites.get(d.sprite)!,
        a ? a.frames[frameAt(a, i)] : d.frame,
        d.variant
      );
      for (let y = Math.max(ry, body.y); y < Math.min(ry + r.h, body.y + body.h); y++)
        for (let x = Math.max(rx, body.x); x < Math.min(rx + r.w, body.x + body.w); x++) {
          const mx = d.flip ? r.w - 1 - (x - rx) : x - rx;
          if (!mask.data[((y - ry) * r.w + mx) * 4 + 3]) continue;
          const p = at(x, y);
          if (p >= 0) img.data.set(room.data.subarray(p, p + 4), p);
        }
    }
  }
  drawImage(img, sign, (view.w - sign.width) >> 1, SIGN.margin);
  return img;
}

const gif = encodeGifChanges(LOOP, (i) => ({ image: shot(i), delay: 100 / FPS }));
writeFileSync(OUT, gif);
console.log(
  `${relative(ROOT, OUT)}: ${view.w}x${view.h}, ${LOOP} frames, ${cast.length} Odds, ${(gif.length / 1e6).toFixed(2)} MB`
);

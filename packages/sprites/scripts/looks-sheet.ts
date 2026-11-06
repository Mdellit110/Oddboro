// A contact sheet of every look part, to check them by eye: each hairstyle,
// top and bottom on a sample person, in the poses that stretch a part most.
//
//   node scripts/looks-sheet.ts          writes out/looks.png at 4x
//   node scripts/looks-sheet.ts hair     only the hairstyles (or top, bottom)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SPRITES_ROOT } from '../src/load.ts';
import { loadLibrary, lookFrame, partNames, type LookSpec, type PartKind } from '../src/look.ts';
import { checkerboard, drawImage, encodePng, scaleImage } from '../src/png.ts';

const POSES = [
  'idle-down-0',
  'idle-side-0',
  'idle-up-0',
  'walk-down-1',
  'walk-side-1',
  'sit-down-0',
  'sit-up-0',
  'exercise-lift-2',
  'exercise-run-0'
];
const lib = loadLibrary();
const c = lib.colours;
const rows: LookSpec[] = [];
const only = process.argv[2] as PartKind | undefined;
const kinds: PartKind[] = (['hair', 'top', 'bottom', 'face'] as const).filter(
  (k) => !only || k === only
);
let n = 0;
for (const kind of kinds)
  for (const name of partNames(lib, kind)) {
    n++;
    rows.push({
      ...(kind === 'face' ? { face: name } : {}),
      hair: kind === 'hair' ? name : 'short-crop',
      top: kind === 'top' ? name : 'long-sleeve',
      bottom: kind === 'bottom' ? name : 'trousers',
      colours: {
        hair: c.hair[n % c.hair.length].name,
        skin: c.skin[n % c.skin.length].name,
        top: c.cloth[n % c.cloth.length].name,
        second: c.cloth[(n + 5) % c.cloth.length].name,
        accent: c.cloth[(n + 9) % c.cloth.length].name,
        bottom: c.cloth[(n + 3) % c.cloth.length].name,
        shoes: c.shoes[n % c.shoes.length].name
      },
      beard: n % 4 === 0,
      glasses: n % 3 === 0 ? c.glasses[n % c.glasses.length].name : undefined
    });
  }
const cw = 18;
const ch = 34;
const sheet = checkerboard(cw * POSES.length, ch * rows.length, 4);
rows.forEach((spec, r) =>
  POSES.forEach((pose, i) => drawImage(sheet, lookFrame(lib, spec, pose), i * cw + 1, r * ch + 1))
);
const out = join(SPRITES_ROOT, 'out');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, only ? `looks-${only}.png` : 'looks.png'), encodePng(scaleImage(sheet, 4)));
console.log(
  `looks: ${rows.length} rows (${kinds.map((k) => `${partNames(lib, k).length} ${k}`).join(', ')}) in out/looks.png`
);

// Drawing a piece the office asked for and the library lacks: a boot bench,
// felt panels, a slate floor, shiplap walls. Claude draws it as .px in the
// house palette, from the format, the style guide and two pieces of the same
// kind. The sprites package checks it; a piece with problems goes back once
// with the problems listed. It runs as the office, like the drawing itself.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkArt, type ArtKind, type ArtRequest, type DrawnArt } from '@oddboro/sprites/art';
import { SPRITES_ROOT, SRC } from '@oddboro/sprites/load';
import type { Palette, SpriteDef } from '@oddboro/sprites/px';
import { runAsOffice } from './office-run.ts';

const SYSTEM = `You draw pixel art for an office floor that {owner}'s Odds, the AI workers, walk around in. You write it as .px text, one character per pixel, from one fixed palette. Reply with one px block and nothing else.`;

/** Two library pieces to draw from, by kind and where a prop stands. */
const EXAMPLES: Record<string, string[]> = {
  back: ['bookshelf', 'library-fireplace'],
  floor: ['break-couch', 'library-globe'],
  corner: ['plant-tall', 'floor-lamp'],
  'wall-prop': ['art-frame', 'whiteboard'],
  'desk-prop': ['desk-lamp', 'plant-small'],
  'kind-floor': ['floor-oak', 'floor-tile'],
  wall: ['wall-plaster-face', 'wall-brick-face', 'wall-plaster-window']
};

const RULES: Record<ArtKind, (name: string) => string> = {
  prop: (n) =>
    `One \`sprite ${n}\`, layer object, at most 64 x 64 pixels and a footprint of at most 4 x 3 tiles. It may have spots where Odds sit or stand: activity rest, play, eat or read, pose sit or stand. A seat follows the zbias convention. Say how it is used on its tag line: \`clear-1\` (or 2) if something stands in front of it to use it, like a shelf, a cabinet or a screen; \`any-side\` if it looks right against any wall, like a plant, a lamp or a barrel. Anything else faces the room, and may add a \`frame side\` facing right for when it stands against a side wall. A rug, a mat or anything else lying flat that Odds walk over is layer floor and \`walkable\`, with no spots, like rug.`,
  'wall-prop': (n) =>
    `One \`sprite ${n}\`, layer wall, hung on a back wall like art-frame: footprint 1 to 3 tiles wide and 1 deep, with an origin that lifts it onto the wall face. No spots.`,
  'desk-prop': (n) =>
    `One \`sprite ${n}\` that stands on a desk top like desk-lamp: 16 pixels wide, at most 24 tall, footprint 1 1, walkable, zbias 1, and an origin that drops it onto the desk. No spots.`,
  floor: (n) =>
    `One \`sprite floor-${n}\`, 16 x 16, layer floor. Frames 0, 1, 2 and so on are variety: frame 0 covers about 70% of the floor, so keep it plain, and put knots, cracks or wear in the others. Every frame tiles seamlessly with every other in all four directions.`,
  wall: (n) =>
    `\`sprite wall-${n}-face\`, 16 x 32, layer wall: the two-tile back wall face. The top two rows are the shadow under the cap, as in the examples, and the bottom rows a baseboard. Frames 0, 1, 2 for variety, frame 0 the plainest; each tiles seamlessly side by side. You may add \`sprite wall-${n}-window\`, 16 x 32, layer wall, \`tag window\`, with glass in \`/\` and \`(\` so the sky shows through. Put \`# ramp: <light> <body> <shade> <deep>\` as the first line: four palette keys the office paints this wall's cap and door in (the plaster wall's are P p q Q).`
};

let sources: Map<string, string> | undefined;
/** Every library .px by sprite name, read once. */
function source(name: string): string | undefined {
  if (!sources) {
    sources = new Map();
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true }))
        if (e.isDirectory()) walk(join(dir, e.name));
        else if (e.name.endsWith('.px'))
          sources!.set(e.name.slice(0, -3), readFileSync(join(dir, e.name), 'utf8'));
    };
    walk(SRC);
  }
  return sources.get(name);
}

/** The format's file sections, which are all a drawn piece needs. */
function format(): string {
  const text = readFileSync(join(SPRITES_ROOT, 'FORMAT.md'), 'utf8');
  return text.slice(text.indexOf('## The grid'), text.indexOf('## Staff sprites')).trim();
}

function paletteList(palette: Palette): string {
  return Object.entries(palette.colors)
    .map(([k, c]) => `- \`${k}\` ${c.hex} ${c.name}${c.emissive ? ' (emissive)' : ''}`)
    .join('\n');
}

function parse(text: string): { px: string; ramp?: string[] } {
  const blocks = [...text.matchAll(/```(?:px)?\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const px = blocks.length ? blocks.join('\n') : text;
  const ramp = /#\s*ramp:?\s+(\S)\s+(\S)\s+(\S)\s+(\S)/.exec(px)?.slice(1);
  return { px, ...(ramp ? { ramp } : {}) };
}

/**
 * Draw one piece. `office` is what the owner said about the whole place, for
 * the feel. `taken` says which sprite names are already in use.
 */
export async function drawArt(
  req: ArtRequest,
  office: string,
  palette: Palette,
  taken: (sprite: string) => boolean
): Promise<{ art: DrawnArt; sprites: SpriteDef[] }> {
  const examples = EXAMPLES[
    req.kind === 'prop' ? (req.place ?? 'back') : req.kind === 'floor' ? 'kind-floor' : req.kind
  ]
    .map((n) => source(n))
    .filter(Boolean)
    .map((px) => `\`\`\`px\n${px!.trim()}\n\`\`\``)
    .join('\n\n');
  // A stand-in for a library piece is drawn over that piece: same size, same use.
  const original = req.replaces ? source(req.replaces) : undefined;
  const standIn = original
    ? `\n\n## What it stands in for\n\nIt replaces \`${req.replaces}\` everywhere the office would place one. Keep its size, layer, footprint, origin, walkable, zbias, tags and every spot exactly as they are, and redraw only how it looks, in the new style:\n\n\`\`\`px\n${original.trim()}\n\`\`\``
    : '';
  const ask = `# Draw ${req.name.replaceAll('-', ' ')}

{owner} described their office, and it needs a piece the library does not have.

- What to draw: ${req.about}
- Name: ${req.name}
- What {owner} wants the office to feel like: ${office}

## What this piece is

${RULES[req.kind](req.name)}${standIn}

## The format

${format()}

## The style

${readFileSync(join(SPRITES_ROOT, 'ART.md'), 'utf8').trim()}

## The palette

Use only these keys, and \`.\` for transparent.

${paletteList(palette)}

## Two pieces from the library, to match

${examples}

## Answer

One \`\`\`px block holding the whole piece. Make it read at a glance at 1x, in the house style: ink outline, light from the upper left, shade on the right and bottom.`;

  let message = ask;
  for (let attempt = 1; ; attempt++) {
    const r = await runAsOffice(message, {
      system: SYSTEM,
      kind: 'office',
      timeoutMs: 6 * 60_000,
      effort: 'medium'
    });
    if (!r.ok) throw new Error(r.text);
    const art: DrawnArt = { ...req, ...parse(r.text) };
    const checked = checkArt(art, palette, taken);
    if (!checked.problems.length)
      return { art: { ...art, px: checked.px }, sprites: checked.sprites };
    console.error(`[art] ${req.name} attempt ${attempt}: ${checked.problems.join('; ')}`);
    if (attempt >= 2) throw new Error(checked.problems.join('; '));
    message = `${ask}\n\n## Your last answer\n\n${r.text}\n\n## What was wrong with it\n\n${checked.problems.map((p) => `- ${p}`).join('\n')}\n\nAnswer again in full, with every problem fixed.`;
  }
}

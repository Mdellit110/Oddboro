// Drawn looks on the floor. A staffer with a generated look has its own strip
// of 57 frames; this cuts it into textures and files them in the atlas under
// a variant name of its own, so StaffActor finds them like any other art.
import { Rectangle, Texture } from 'pixi.js';
import type { Atlas } from './engine.ts';
import type { StaffProfile } from '../staff/roster.ts';

const W = 16;
const H = 32;

/** Load a staffer's drawn look once per version. Returns the variant to wear. */
export async function loadLook(atlas: Atlas, p: StaffProfile): Promise<string | undefined> {
  if (!p.look) return undefined;
  const variant = `look-${p.id}-${p.look.version}`;
  const anims = atlas.sheet.animations;
  if (anims[`staff@${variant}/idle-down`]) return variant;
  const { sheet, frames } = (await fetch(p.look.sheet).then((r) => r.json())) as {
    sheet: string;
    frames: Record<string, number>;
  };
  const img = new Image();
  img.src = sheet;
  await img.decode();
  const base = Texture.from(img);
  const groups: Record<string, [number, Texture][]> = {};
  for (const [name, x] of Object.entries(frames)) {
    const m = /^(.*)-(\d+)$/.exec(name);
    if (!m) continue;
    const tex = new Texture({ source: base.source, frame: new Rectangle(x, 0, W, H) });
    (groups[m[1]] ??= []).push([Number(m[2]), tex]);
  }
  for (const [anim, list] of Object.entries(groups))
    anims[`staff@${variant}/${anim}`] = list.sort((a, b) => a[0] - b[0]).map(([, t]) => t);
  return variant;
}

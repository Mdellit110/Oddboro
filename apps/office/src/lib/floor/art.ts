// Art the office drew for itself, on the floor. The server packs it into one
// sheet; this cuts the sheet into textures and files them in the atlas beside
// the compiled art, with their catalog entries, so the floor draws them like
// any other sprite.
import { Rectangle, Texture } from 'pixi.js';
import type { SpriteCatalog } from '@oddboro/world';
import type { Atlas } from './engine.ts';

export type ArtSheet = { png: string; frames: Record<string, [number, number, number, number]> };

export async function addArt(
  atlas: Atlas,
  sheet: ArtSheet | undefined,
  catalog: SpriteCatalog = {}
): Promise<void> {
  Object.assign(atlas.catalog, catalog);
  if (!sheet) return;
  const img = new Image();
  img.src = sheet.png;
  await img.decode();
  const base = Texture.from(img);
  const anims: Record<string, [number, Texture][]> = {};
  for (const [key, [x, y, w, h]] of Object.entries(sheet.frames)) {
    const tex = new Texture({ source: base.source, frame: new Rectangle(x, y, w, h) });
    atlas.sheet.textures[key] = tex;
    const m = /^(.*)-(\d+)(~e)?$/.exec(key);
    if (m) (anims[`${m[1]}${m[3] ?? ''}`] ??= []).push([Number(m[2]), tex]);
  }
  for (const [key, list] of Object.entries(anims))
    atlas.sheet.animations[key] = list.sort((a, b) => a[0] - b[0]).map(([, t]) => t);
}

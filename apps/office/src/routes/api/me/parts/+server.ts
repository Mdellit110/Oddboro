// What the owner can build their Odd from: every hairstyle, top, bottom and
// face shape, and the colours for each, with the hex a swatch shows.
import { json } from '@sveltejs/kit';
import { partNames } from '@oddboro/sprites/look';
import { library } from '#lib/server/looks.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const lib = await library();
  const swatches = (g: keyof typeof lib.colours) =>
    lib.colours[g].map((s) => ({ name: s.name, hex: s.body }));
  return json({
    hair: partNames(lib, 'hair'),
    top: partNames(lib, 'top'),
    bottom: partNames(lib, 'bottom'),
    face: partNames(lib, 'face'),
    colours: {
      hair: swatches('hair'),
      skin: swatches('skin'),
      cloth: swatches('cloth'),
      shoes: swatches('shoes'),
      glasses: swatches('glasses')
    }
  });
};

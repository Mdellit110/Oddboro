// Moving into a drawn office. The server checks the art and builds the spec
// again rather than trusting a copy from the page, keeps the layout and the art
// it drew, makes it the office, and moves any staffer whose room is gone. Every
// open page hears the change. The move-in route and the design job share this.
import { moveIn, roster, saveArt, saveOffice } from '@oddboro/ledger';
import { ART_LIMITS, artCatalog, type DrawnArt } from '@oddboro/sprites/art';
import { LIMITS, type OfficeSpec } from '@oddboro/world';
import { build, destination } from './office-design.ts';
import { artSprites, currentOffice, housePalette, officeLibrary } from './space.ts';

export async function moveInto(spec: OfficeSpec, sent: DrawnArt[], description: string) {
  const lib = await officeLibrary();
  const palette = housePalette();
  const sprites = artSprites(sent.slice(0, ART_LIMITS.office), (n) => n in lib.catalog, palette);
  const art = sent.filter((a) => sprites.some((d) => d.file === a.name));
  const catalog = { ...lib.catalog, ...artCatalog(sprites, palette) };
  const { office, problems } = build(spec, (await roster()).length, catalog);
  if (!office) throw new Error(problems.join('; '));
  const row = await saveOffice({
    description: description.slice(0, LIMITS.description),
    spec: office.spec,
    plan: office.plan,
    templates: office.templates,
    kinds: office.kinds
  });
  await saveArt(art, row.id);
  const from = (await currentOffice()).id;
  return moveIn(from, destination(row.id, row.name, office.world, office.kinds));
}

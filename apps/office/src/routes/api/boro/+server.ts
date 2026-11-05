// A new owner's boro: their small first building on their plot. POST with
// `preview` builds a name and a style at once, with no Claude run, so the
// floor can show it; with `keep` it is saved as their office and they move in.
// Their name and look can change any time after, here or in the Office window.
import { error, json } from '@sveltejs/kit';
import {
  boroName,
  logEvent,
  me,
  roster,
  saveTown,
  starterSpec,
  STYLE_IDS,
  townState,
  type BoroStyle
} from '@oddboro/ledger';
import { build } from '#lib/server/office-design.ts';
import { moveInto } from '#lib/server/move-in.ts';
import { officeLibrary } from '#lib/server/space.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const style = STYLE_IDS.includes(b.style as BoroStyle) ? (b.style as BoroStyle) : 'village';
  const name = boroName(typeof b.name === 'string' ? b.name : '', (await me()).name);
  const spec = starterSpec(name, style);
  const { catalog } = await officeLibrary();
  const built = build(spec, (await roster()).length, catalog);
  if (!built.office) error(500, `Your boro could not be built: ${built.problems.join('; ')}`);
  if (b.action === 'keep') {
    const { state } = await townState();
    const first = !state.boro;
    try {
      await moveInto(spec, [], `${name}, a ${style} starter boro`);
    } catch (e) {
      error(500, e instanceof Error ? e.message : String(e));
    }
    await saveTown({
      ...state,
      boro: { name, style },
      step: state.step === 'street' || !state.step ? 'boro' : state.step
    });
    await logEvent(first ? 'boro_arrived' : 'customized');
  }
  return json({ name, style, world: built.office.world });
};

<script lang="ts">
  import type { ArtKind, ArtRequest, DrawnArt } from '@oddboro/sprites/art';
  import {
    drawnIn,
    EXTRAS,
    libraryPieces,
    LIMITS,
    type Area,
    type OfficeSpec,
    type RoomEdit,
    type SpriteCatalog,
    type World
  } from '@oddboro/world';
  import { untrack } from 'svelte';
  import type { Attachment } from 'svelte/attachments';
  import { addArt, type ArtSheet } from '../floor/art.ts';
  import { Floor, sharedAtlas } from '../floor/engine.ts';
  import { call, follow } from './api.ts';
  import { wins } from './windows.svelte.ts';

  // The owner describes the office they want and the office draws it: the
  // spec first, then each piece the library lacks, then a preview to pan
  // around. Redraw with a note until it is right, then move in. The office
  // the owner is in changes the same way: a note redraws it from its spec.
  // In the large view the owner can also arrange a room by hand: pick a thing
  // to move or remove, or add one. Each change is an edit on its room in the
  // spec, built at once with no Claude run. Earlier layouts stay, to move back to.
  type Props = {
    id: string;
    catalog: SpriteCatalog;
    staffCount: number;
    current: string;
    /** Just moved in: say how to make the place their own. */
    welcome?: boolean;
  };
  let { id, catalog, staffCount, current, welcome = false }: Props = $props();
  // svelte-ignore state_referenced_locally
  let showWelcome = $state(welcome);

  type Drawn = {
    spec: OfficeSpec;
    world: World;
    notes: string[];
    missing: string[];
    seats: number;
    /** Drawn for this office; kept when the owner moves in. */
    art: DrawnArt[];
    artSheet?: ArtSheet;
    artCatalog: SpriteCatalog;
  };
  type Line =
    | { step: 'spec'; name: string; drawing: ArtRequest[] }
    | { step: 'art'; name: string; ok: boolean }
    | { step: 'check' }
    | { step: 'more'; drawing: ArtRequest[] }
    | { step: 'plan'; world: World }
    | ({ step: 'done' } & Drawn)
    | { step: 'moved'; name: string }
    | { step: 'error'; message: string };
  type Piece = { name: string; kind: ArtKind; state: 'drawing' | 'done' | 'failed' };
  type Layout = {
    id: number;
    name: string;
    description: string;
    active: boolean;
    movedInAt: string | null;
  };

  /** The words for a new office. */
  let description = $state('');
  /** The words the drawing came from, then each change asked of it since. */
  let basis = $state('');
  let changes = $state<string[]>([]);
  let note = $state('');
  /** The layout the owner is in, to change with a note. */
  let here = $state<{ spec: OfficeSpec; description: string } | undefined>();
  let drawn = $state<Drawn | undefined>();
  let drawing = $state(false);
  /** While drawing: the office's name once the spec is in, and each piece being drawn. */
  let progress = $state<
    { name: string; pieces: Piece[]; checking?: boolean; more?: boolean } | undefined
  >();
  let moving = $state(false);
  let problem = $state('');
  let layouts = $state<Layout[]>([]);
  let sample = $state<{ name: string; active: boolean } | undefined>();
  let big = $state<HTMLDialogElement>();
  let bigOpen = $state(false);
  /** Arranging by hand: what is picked, and what the next tap does. */
  let arranging = $state(false);
  /**
   * Where a thing stands: one of the office's rooms, or the halls, the street
   * or the grounds. `x` and `y` are its top-left on the floor, which an edit's
   * tiles count from.
   */
  type Place = { name: string; area?: Area; x: number; y: number };
  let picked = $state<{ obj: string; item: string; place: Place } | undefined>();
  let next = $state<{ move: string; place: Place } | { add: string } | undefined>();
  let building = $state(false);
  /** The spec before each change made by hand, to undo it. */
  let undo = $state<OfficeSpec[]>([]);
  /** The large view's floor, for picking and outlining. */
  let bigFloor: Floor | undefined;

  const KIND: Record<string, string> = {
    office: 'your office',
    workspace: 'desks',
    lobby: 'lobby',
    kitchen: 'kitchen',
    break: 'break room',
    library: 'library',
    gym: 'gym',
    mail: 'mail room'
  };

  $effect(() => {
    void call<{
      layouts: Layout[];
      current?: { spec: OfficeSpec; description: string };
      sample: { name: string; active: boolean };
    }>('/api/office/layouts').then((r) => {
      layouts = r.layouts;
      here = r.current;
      sample = r.sample;
    });
  });

  $effect(() => {
    wins.busy[id] = drawing || moving;
    wins.dirty[id] = !!drawn;
    wins.titles[id] = drawn ? `Office: ${drawn.spec.name}` : 'Office';
  });

  /** The preview: the real floor, built from the drawing, at midday. */
  /**
   * The preview: one floor for as long as it shows. A rebuilt drawing swaps
   * into it rather than making a new floor, so nothing flashes and the camera
   * stays where the owner had it.
   */
  const preview =
    (world: () => World, onFloor?: (f: Floor | undefined) => void): Attachment<HTMLDivElement> =>
    (el) => {
      let floor: Floor | undefined;
      let gone = false;
      void sharedAtlas(catalog).then(async (atlas) => {
        if (gone) return;
        floor = await Floor.create(el, untrack(world), atlas, { preview: true });
        if (gone) return floor.destroy();
        floor.setHour(13);
        floors.add(floor);
        onFloor?.(floor);
      });
      return () => {
        gone = true;
        onFloor?.(undefined);
        if (floor) floors.delete(floor);
        floor?.destroy();
      };
    };
  /** The previews showing now, to swap a new drawing into. */
  const floors = new Set<Floor>();
  $effect(() => {
    const w = drawn?.world;
    if (!w) return;
    // A new size (a redraw, not a change by hand) glides out to show all of it.
    untrack(() => {
      for (const f of floors)
        if (f.world !== w)
          f.swap(w, { fit: w.width !== f.world.width || w.height !== f.world.height });
    });
  });

  const bigReady = (f: Floor | undefined) => {
    bigFloor = f;
    if (!f) return;
    f.onPick = arranging ? (hit) => void pick(hit) : undefined;
    f.onMove = arranging ? (hit, tile) => void carry(hit, tile) : undefined;
    f.highlight(picked?.obj);
  };
  $effect(() => {
    const on = arranging;
    if (!bigFloor) return;
    bigFloor.onPick = on ? (hit) => void pick(hit) : undefined;
    bigFloor.onMove = on ? (hit, tile) => void carry(hit, tile) : undefined;
  });
  $effect(() => {
    bigFloor?.highlight(picked?.obj);
  });

  /**
   * Everything that can be added, in groups: what the office drew for itself
   * (kept, or drawn for this drawing), then every library piece by the room
   * kind or hall the office uses it in.
   */
  const addable = $derived.by(() => {
    const words = (n: string) => EXTRAS[n] ?? n.replaceAll('-', ' ');
    const own = [
      ...new Set([
        ...drawnIn(catalog).extras,
        // Floors and wall styles are not things to place.
        ...(drawn?.art ?? [])
          .filter((a) => a.kind !== 'floor' && a.kind !== 'wall')
          .map((a) => a.name)
      ])
    ];
    const groups: [string, [string, string][]][] = [];
    if (own.length) groups.push(['Drawn for this office', own.map((n) => [n, words(n)])]);
    // Floors are not things to place, so the ground materials are not offered.
    const label: Record<string, string> = {
      ...KIND,
      office: 'Your office',
      halls: 'Halls',
      street: 'Street',
      grounds: 'Grounds'
    };
    for (const [part, names] of Object.entries(libraryPieces()))
      if (part in label)
        groups.push([
          label[part][0].toUpperCase() + label[part].slice(1),
          names.map((n) => [n, words(n)] as [string, string])
        ]);
    return groups;
  });
  const thing = (item: string) => item.split('#')[0].replaceAll('-', ' ');

  /** A place in words: a room by its name, an area as "the street". */
  const inWords = (p: Place) => (p.area ? `the ${p.area}` : p.name);
  const inside = ([x, y]: [number, number], b: { x: number; y: number; w: number; h: number }) =>
    x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h;

  /** The place a tile is in: a room, the street, the halls, or else the grounds. */
  function placeAt(tile: [number, number]): Place | undefined {
    if (!drawn) return undefined;
    const w = drawn.world;
    const room = w.rooms.find(
      (r) => inside(tile, r) && drawn!.spec.rooms.some((s) => s.name.trim() === r.name)
    );
    if (room) return { name: room.name, x: room.x, y: room.y };
    const street = w.rooms.find((r) => r.id.startsWith('street') && inside(tile, r));
    if (street) return { name: 'Street', area: 'street', x: street.x, y: street.y };
    if (w.halls.some((h) => inside(tile, h)))
      return { name: 'Halls', area: 'halls', x: w.site.x, y: w.site.y };
    if (inside(tile, { x: 0, y: 0, w: w.width, h: w.height }))
      return { name: 'Grounds', area: 'grounds', x: 0, y: 0 };
    return undefined;
  }

  /** The place a placed thing belongs to, from its id: its room, or the area it stands in. */
  function placeOf(obj: string): Place | undefined {
    if (!drawn) return undefined;
    const w = drawn.world;
    const at = obj.split('/')[0];
    if (at === 'plan') return { name: 'Halls', area: 'halls', x: w.site.x, y: w.site.y };
    if (at === 'grounds') return { name: 'Grounds', area: 'grounds', x: 0, y: 0 };
    const room = w.rooms.find((r) => r.id === at);
    if (!room) return undefined;
    if (room.id.startsWith('street'))
      return { name: 'Street', area: 'street', x: room.x, y: room.y };
    return drawn.spec.rooms.some((s) => s.name.trim() === room.name)
      ? { name: room.name, x: room.x, y: room.y }
      : undefined;
  }

  const same = (a: Place, b: Place) => a.name === b.name && a.area === b.area;
  const from = (p: Place, tile: [number, number]): [number, number] => [
    tile[0] - p.x,
    tile[1] - p.y
  ];

  /** A tap while arranging: the second half of a move or an add, or a pick. */
  async function pick(hit: { obj?: string; item?: string; tile: [number, number] }) {
    if (!drawn || building) return;
    const place = placeAt(hit.tile);
    if (next) {
      if (!place) return void (problem = 'Pick a tile on the office.');
      if ('move' in next) {
        if (!same(place, next.place))
          return void (problem = `It moves within ${inWords(next.place)}.`);
        return change(place, { move: next.move, to: from(place, hit.tile), hand: true });
      }
      return change(place, { add: next.add, at: from(place, hit.tile), hand: true });
    }
    const own = hit.obj ? placeOf(hit.obj) : undefined;
    picked = hit.obj && hit.item && own ? { obj: hit.obj, item: hit.item, place: own } : undefined;
    problem = '';
  }

  /** A placed thing dragged to a new tile: it moves there, within its own room or area. */
  function carry(hit: { obj: string; item: string }, tile: [number, number]) {
    if (!drawn || building) return;
    const own = placeOf(hit.obj);
    const place = placeAt(tile);
    if (!own) return;
    if (!place || !same(place, own))
      return void (problem = `The ${thing(hit.item)} moves within ${inWords(own)}.`);
    return change(own, { move: hit.item, to: from(own, tile), hand: true });
  }

  /** Something dragged out of the library and let go over the floor. */
  const PIECE = 'text/x-oddboro-piece';
  let carried = $state<string | undefined>();
  function dropPiece(e: DragEvent) {
    e.preventDefault();
    bigFloor?.showDrop(undefined);
    const piece = carried ?? e.dataTransfer?.getData(PIECE);
    carried = undefined;
    if (!piece || !bigFloor) return;
    const tile = bigFloor.tileAt(e.clientX, e.clientY);
    const place = placeAt(tile);
    if (!place) return void (problem = 'Let go over the office.');
    return change(place, { add: piece, at: from(place, tile), hand: true });
  }
  function overFloor(e: DragEvent) {
    if (!carried || !bigFloor) return;
    e.preventDefault();
    const size = catalog[carried]?.footprint ?? [1, 1];
    bigFloor.showDrop(bigFloor.tileAt(e.clientX, e.clientY), size);
  }

  /**
   * A library piece's picture, from the floor's own atlas, which holds the
   * office's drawn art as well as the house's.
   */
  const thumb =
    (name: string): Attachment<HTMLCanvasElement> =>
    (c) => {
      void sharedAtlas(catalog).then((atlas) => {
        const meta = atlas.catalog[name];
        const frame = meta?.frames.includes('default') ? 'default' : meta?.frames[0];
        const tex = frame ? atlas.sheet.textures[`${name}/${frame}`] : undefined;
        const g = c.getContext('2d');
        if (!tex || !g) return;
        const { x, y, width, height } = tex.frame;
        c.width = width;
        c.height = height;
        g.imageSmoothingEnabled = false;
        g.drawImage(
          tex.source.resource as CanvasImageSource,
          x,
          y,
          width,
          height,
          0,
          0,
          width,
          height
        );
      });
    };

  /**
   * Delete or Backspace removes the thing picked while arranging. It listens
   * on the window: a tap on the floor's canvas focuses nothing, so the key
   * would never reach the large view itself.
   */
  function arrangeKey(e: KeyboardEvent) {
    if (!bigOpen || !arranging || !picked || building) return;
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    const t = e.target as HTMLElement | null;
    if (t?.closest('input, textarea, select')) return;
    e.preventDefault();
    void change(picked.place, { remove: picked.item });
  }

  /** The library, searched by name or by the room kind it belongs to. */
  let find = $state('');
  const shelves = $derived.by(() => {
    const q = find.trim().toLowerCase();
    if (!q) return addable;
    return addable
      .map(([group, items]) => {
        const hit = group.toLowerCase().includes(q);
        return [
          group,
          items.filter(([k, about]) => hit || k.includes(q) || about.toLowerCase().includes(q))
        ] as [string, [string, string][]];
      })
      .filter(([, items]) => items.length);
  });

  /** Add an edit to a room or an area and build the office again. */
  async function change(place: Place, e: RoomEdit) {
    if (!drawn) return;
    const before = $state.snapshot(drawn.spec) as OfficeSpec;
    const spec = structuredClone(before);
    const room = place.name;
    // Every change stays, in the order it was made: the office replays them as
    // they happened, so each lands where it did on the floor the owner saw.
    if (place.area) {
      const areas = (spec.areas ??= {});
      areas[place.area] = [...(areas[place.area] ?? []), e];
    } else {
      const r = spec.rooms.find((s) => s.name.trim() === room);
      if (!r) return;
      r.edits = [...(r.edits ?? []), e];
    }
    picked = undefined;
    next = undefined;
    const had = drawn.notes;
    const done = await build(spec);
    if (!done) return;
    // A change the room refuses is not kept: the floor stays as it was, and says why.
    const refused = done.notes.find((n) => !had.includes(n) && n.startsWith(`${room}:`));
    if (refused) {
      const why = refused.slice(room.length + 2);
      return void (problem = why[0].toUpperCase() + why.slice(1));
    }
    drawn = done;
    undo = [...undo, before];
  }

  /** Build a spec as it stands, with no Claude run. */
  async function build(spec: OfficeSpec): Promise<Drawn | undefined> {
    building = true;
    problem = '';
    try {
      const done = await call<Drawn>('/api/office/build', { spec, art: drawn?.art ?? [] });
      await addArt(await sharedAtlas(catalog), done.artSheet, done.artCatalog);
      return done;
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
      return undefined;
    } finally {
      building = false;
    }
  }

  /** Build a spec as it stands, and show it. */
  async function rebuild(spec: OfficeSpec): Promise<boolean> {
    const done = await build(spec);
    if (done) drawn = done;
    return !!done;
  }

  async function undoLast() {
    const spec = undo.at(-1);
    if (spec && (await rebuild(spec))) undo = undo.slice(0, -1);
  }

  /** Furnish the office the owner is in again, by the latest rules, to look at or arrange. */
  async function refurnish(arrange: boolean) {
    if (!here) return;
    basis = here.description || here.spec.name;
    changes = [];
    undo = [];
    if (!(await rebuild(here.spec))) return;
    if (arrange) {
      arranging = true;
      openBig();
    }
  }

  function openBig() {
    bigOpen = true;
    big?.showModal();
  }

  /** The words to save with the office: where it started, then each change. */
  const words = (from: string, more: string[]) =>
    [from, ...more.map((c) => `Then: ${c}`)].join('\n').slice(0, LIMITS.description);

  /**
   * `new` draws the owner's words from scratch, `again` redraws this drawing
   * with the note, and `change` redraws the office the owner is in with it.
   */
  async function draw(how: 'new' | 'again' | 'change') {
    const from =
      how === 'new'
        ? description.trim()
        : how === 'change'
          ? here?.description || (here?.spec.name ?? '')
          : basis;
    const asked = how === 'again' ? changes : [];
    const ask = note.trim();
    const previous = how === 'again' ? drawn?.spec : how === 'change' ? here?.spec : undefined;
    big?.close();
    problem = '';
    drawing = true;
    progress = undefined;
    try {
      let done: Drawn | undefined;
      // The drawing runs on the server; this follows it until it is done.
      const job = await call<{ id: number }>('/api/office/design', {
        description: words(from, asked),
        ...(previous ? { note: ask, previous, art: how === 'again' ? drawn?.art : [] } : {})
      });
      await follow<Line>(`/api/office/design?id=${job.id}`, (l) => {
        if (l.step === 'spec')
          progress = {
            name: l.name,
            pieces: l.drawing.map((d) => ({ name: d.name, kind: d.kind, state: 'drawing' }))
          };
        else if (l.step === 'art') {
          const p = progress?.pieces.find((x) => x.name === l.name);
          if (p) p.state = l.ok ? 'done' : 'failed';
        } else if (l.step === 'check') {
          if (progress) progress.checking = true;
        } else if (l.step === 'more') {
          // The look-over asked for more pieces: they draw now, after it.
          if (progress) {
            progress.checking = false;
            progress.more = true;
            progress.pieces.push(
              ...l.drawing.map((d) => ({ name: d.name, kind: d.kind, state: 'drawing' as const }))
            );
          }
        } else if (l.step === 'done') done = l;
        else if (l.step === 'error') throw new Error(l.message);
      });
      if (!done) throw new Error('The drawing stopped before it finished. Try again.');
      // The new pieces go in the atlas before the preview asks for them.
      await addArt(await sharedAtlas(catalog), done.artSheet, done.artCatalog);
      drawn = done;
      basis = from;
      changes = previous && ask ? [...asked, ask] : asked;
      note = '';
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    } finally {
      drawing = false;
    }
  }

  async function moveIn() {
    if (!drawn) return;
    problem = '';
    moving = true;
    try {
      await call('/api/office/move-in', {
        spec: drawn.spec,
        description: words(basis, changes),
        art: drawn.art
      });
      location.reload();
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
      moving = false;
    }
  }

  async function moveBack(l: { id: number | 'sample' }) {
    problem = '';
    moving = true;
    try {
      await call(`/api/office/layouts/${l.id}`, {});
      location.reload();
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
      moving = false;
    }
  }

  const ART_KIND: Record<ArtKind, string> = {
    prop: 'furniture',
    'wall-prop': 'on the wall',
    'desk-prop': 'on every desk',
    floor: 'floor',
    wall: 'walls'
  };
  const MARK = { drawing: '·', done: '✓', failed: '✗' } as const;
  const TONE = { drawing: 'text-faint', done: 'text-moss', failed: 'text-coral' } as const;
  const spaced = (name: string) => name.replaceAll('-', ' ');
  const field = 'w-full rounded-lg bg-raise px-3 py-2 text-sm outline-none placeholder:text-faint';
</script>

<svelte:window onkeydown={arrangeKey} />

<section class="flex h-full min-h-0 flex-col" aria-label="Design the office">
  <header class="border-b border-hairline p-3">
    <div class="font-pixel text-lg leading-none">Office</div>
    <div class="mt-1 text-xs text-muted">
      Say what you want and the office draws it. Nothing changes until you move in.
    </div>
  </header>

  {#if wins.confirm?.id === id}
    <div class="flex flex-wrap items-center gap-2 border-b border-hairline bg-ember/10 px-3 py-2">
      <span class="flex-1 text-xs text-ink"
        >{drawing ? 'Still drawing the office.' : 'You have not moved into this drawing.'} Close anyway?</span
      >
      <button
        class="rounded-lg bg-raise px-2.5 py-1 text-xs hover:bg-coral/25"
        onclick={() => wins.confirm?.go()}>Close it</button
      >
      <button
        class="rounded-lg px-2.5 py-1 text-xs text-muted hover:text-ink"
        onclick={() => (wins.confirm = undefined)}>Keep it open</button
      >
    </div>
  {/if}

  <div class="flex flex-1 flex-col gap-3 overflow-y-auto p-3 text-sm">
    {#if showWelcome && here && !drawn}
      <section class="flex flex-col gap-2 rounded-xl bg-sea/10 p-3" aria-label="Make it yours">
        <div class="font-pixel text-base text-ink">Make it yours</div>
        <p class="text-xs text-ink">
          {current} is yours now. Change anything, the way you would a new place.
        </p>
        <ul class="flex flex-col gap-1 text-xs text-ink">
          <li>
            <span class="font-medium">Rearrange and decorate:</span> Arrange by hand, then drag furniture
            around, or drag pieces in from the Library.
          </li>
          <li>
            <span class="font-medium">Expand it:</span> say what you want below, like "add a studio wing"
            or "a garden out back", and the office builds it.
          </li>
        </ul>
        <div class="flex gap-2">
          <button
            class="rounded-lg bg-sea px-3 py-1.5 text-xs font-medium text-night disabled:opacity-40"
            disabled={drawing || moving || building}
            onclick={() => {
              showWelcome = false;
              void refurnish(true);
            }}>Arrange by hand</button
          >
          <button
            class="rounded-lg px-3 py-1.5 text-xs text-muted hover:text-ink"
            onclick={() => (showWelcome = false)}>Later</button
          >
        </div>
      </section>
    {/if}
    {#if !drawn}
      {#if here}
        <div class="flex flex-col gap-1">
          <span class="text-xs text-muted">What should change in {current}?</span>
          <div class="flex gap-2">
            <input
              class={field}
              placeholder="e.g. a bigger kitchen, a reading loft off the lounge"
              bind:value={note}
              disabled={drawing || moving}
              onkeydown={(e) => e.key === 'Enter' && note.trim() && !drawing && draw('change')}
            />
            <button
              class="shrink-0 rounded-lg bg-sea px-3 py-2 text-xs font-medium text-night disabled:opacity-40"
              disabled={!note.trim() || drawing || moving}
              onclick={() => draw('change')}>Change it</button
            >
          </div>
          <div class="flex flex-wrap gap-x-3 text-xs">
            <button
              class="text-sea underline underline-offset-2 disabled:opacity-40"
              disabled={drawing || moving || building}
              onclick={() => refurnish(true)}>Arrange by hand</button
            >
            <button
              class="text-sea underline underline-offset-2 disabled:opacity-40"
              disabled={drawing || moving || building}
              onclick={() => refurnish(false)}>Refurnish by the latest rules</button
            >
          </div>
          <details class="text-xs text-muted">
            <summary class="cursor-pointer hover:text-ink">The words {current} came from</summary>
            <p class="mt-1 whitespace-pre-line">{here.description}</p>
          </details>
        </div>
      {/if}
      <label class="flex flex-col gap-1">
        <span class="text-xs text-muted"
          >{here
            ? 'Or describe a new office from scratch'
            : `What should ${current} look like?`}</span
        >
        <textarea
          rows="5"
          class={field}
          maxlength={LIMITS.description}
          placeholder="e.g. A warm old library feel: wood floors, lots of plants, a reading room with a fireplace, a big kitchen where everyone eats together, a small gym, and desks for about ten."
          bind:value={description}
          disabled={drawing || moving}></textarea>
      </label>
      <button
        class="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-40 {here
          ? 'bg-raise hover:bg-sea/20'
          : 'bg-sea text-night'}"
        disabled={!description.trim() || drawing || moving}
        onclick={() => draw('new')}>{drawing ? 'Drawing the office' : 'Draw it'}</button
      >
    {/if}
    {#if drawing}
      <div class="flex flex-col gap-1 text-xs text-muted">
        <p class="flex items-center gap-2">
          <span class="busy"></span>{progress?.checking
            ? `Looking over ${progress.name}, inside and out, the way someone walking in would.`
            : progress?.more
              ? `Drawing what the look-over asked for, to finish the look.`
              : progress
                ? `Drawing ${progress.name}.`
                : 'Planning the office. This takes about a minute.'}
        </p>
        {#if progress?.pieces.length}
          <p>
            It needs {progress.pieces.length === 1 ? 'a piece' : `${progress.pieces.length} pieces`}
            the office has no art for, so it is drawing {progress.pieces.length === 1
              ? 'it'
              : 'them'} now. A minute or two.
          </p>
          <ul class="flex flex-col gap-1">
            {#each progress.pieces as p (p.name)}
              <li class="flex gap-2 rounded-lg bg-raise px-2.5 py-1.5">
                <span class="w-3 {TONE[p.state]}" aria-label={p.state}>{MARK[p.state]}</span>
                <span class="min-w-0 flex-1 truncate text-ink">{spaced(p.name)}</span>
                <span class="text-faint">{ART_KIND[p.kind]}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
    {#if problem}
      <p class="rounded-lg bg-coral/15 px-3 py-2 text-xs text-coral">{problem}</p>
    {/if}

    {#if drawn}
      <div>
        <div class="flex items-baseline gap-2">
          <span class="font-pixel text-base">{drawn.spec.name}</span>
          <span class="min-w-0 flex-1 text-xs text-muted"
            >{drawn.spec.rooms.length} rooms · {drawn.seats} work seats for {staffCount} staff</span
          >
          <button class="shrink-0 text-xs text-sea underline underline-offset-2" onclick={openBig}
            >View larger</button
          >
        </div>
        <div
          {@attach preview(() => drawn!.world)}
          class="mt-2 h-96 overflow-hidden rounded-xl bg-night"
          aria-label="A preview of the office. Drag to look around; scroll to zoom."
        ></div>
      </div>
      <ul class="flex flex-col gap-1 text-xs">
        {#each drawn.spec.rooms as r, i (i)}
          <li class="flex gap-2 rounded-lg bg-raise px-2.5 py-1.5">
            <span class="min-w-0 flex-1 truncate text-ink">{r.name}</span>
            <span class="text-faint"
              >{r.kind === 'workspace' ? `${r.seats} desks` : KIND[r.kind]}{r.size
                ? ` · ${r.size}`
                : ''}</span
            >
          </li>
        {/each}
      </ul>
      {#each drawn.notes as n (n)}
        <p class="text-xs text-muted">{n}</p>
      {/each}
      {#if drawn.art.length}
        <p class="text-xs text-muted">
          Drawn for this office: {drawn.art.map((a) => spaced(a.name)).join(', ')}. They join the
          library when you move in.
        </p>
      {/if}
      {#if drawn.missing.length}
        <p class="text-xs text-muted">
          What a floor seen from above cannot show: {drawn.missing.join('; ')}.
        </p>
      {/if}
      <div class="flex gap-2">
        <input
          class={field}
          placeholder="What to change, e.g. a bigger gym, no break room"
          bind:value={note}
          disabled={drawing || moving}
          onkeydown={(e) => e.key === 'Enter' && !drawing && draw('again')}
        />
        <button
          class="shrink-0 rounded-lg bg-raise px-3 py-2 text-xs font-medium hover:bg-sea/20 disabled:opacity-40"
          disabled={drawing || moving}
          onclick={() => draw('again')}>Redraw</button
        >
      </div>
      <button
        class="rounded-lg bg-sea px-3 py-2 text-sm font-medium text-night disabled:opacity-40"
        disabled={drawing || moving}
        onclick={moveIn}>{moving ? 'Moving in' : `Move into ${drawn.spec.name}`}</button
      >
      <p class="text-[11px] text-faint">
        Odds whose room is gone move to the workspace with the most free desks. Your old layout
        stays below, to move back to.
        <button
          class="text-muted underline underline-offset-2 hover:text-ink disabled:opacity-40"
          disabled={drawing || moving}
          onclick={() => {
            drawn = undefined;
            undo = [];
            arranging = false;
          }}>Start over</button
        >
      </p>

      <dialog
        bind:this={big}
        class="m-auto h-[calc(100dvh-2rem)] max-h-none w-[calc(100vw-2rem)] max-w-none flex-col overflow-hidden rounded-2xl bg-panel-solid p-0 text-ink backdrop:bg-night/70 open:flex"
        aria-label={`${drawn.spec.name}, larger`}
        onclose={() => (bigOpen = false)}
      >
        <div class="flex items-baseline gap-2 border-b border-hairline px-4 py-3">
          <span class="font-pixel text-lg">{drawn.spec.name}</span>
          <span class="min-w-0 flex-1 text-xs text-muted"
            >{drawn.spec.rooms.map((r) => r.name).join(' · ')}</span
          >
          <button
            class="shrink-0 rounded-lg px-2.5 py-1 text-xs {arranging
              ? 'bg-ember/25 text-ink'
              : 'bg-raise hover:bg-sea/20'}"
            onclick={() => {
              arranging = !arranging;
              picked = undefined;
              next = undefined;
            }}>{arranging ? 'Done arranging' : 'Arrange by hand'}</button
          >
          <button
            class="shrink-0 rounded-lg bg-sea px-2.5 py-1 text-xs font-medium text-night disabled:opacity-40"
            disabled={moving || building}
            onclick={moveIn}>{moving ? 'Saving' : 'Save to the office'}</button
          >
          <button
            class="shrink-0 rounded-lg bg-raise px-2.5 py-1 text-xs hover:bg-sea/20"
            onclick={() => big?.close()}>Close</button
          >
        </div>
        <div class="flex min-h-0 flex-1">
          {#if bigOpen}
            <div class="relative min-h-0 min-w-0 flex-1">
              <div
                {@attach preview(() => drawn!.world, bigReady)}
                class="absolute inset-0 overflow-hidden bg-night"
                role="application"
                aria-label={arranging
                  ? 'The office, larger. Drag a thing to move it, or drag empty floor to look around; scroll to zoom.'
                  : 'The office, larger. Drag to look around; scroll to zoom.'}
                ondragover={overFloor}
                ondragleave={() => bigFloor?.showDrop(undefined)}
                ondrop={dropPiece}
              ></div>
              {#if arranging && problem}
                <p
                  class="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit max-w-[90%] rounded-full bg-panel-solid/95 px-4 py-2 text-xs text-coral shadow-lg"
                  role="alert"
                >
                  {problem}
                </p>
              {/if}
            </div>
          {/if}
          {#if arranging}
            <aside
              class="flex w-72 shrink-0 flex-col border-s border-hairline max-sm:hidden"
              aria-label="Library"
            >
              <div class="border-b border-hairline p-3">
                <div class="font-pixel text-sm">Library</div>
                <p class="mt-0.5 text-xs text-muted">
                  Drag a thing onto a room, or pick one and tap where it goes.
                </p>
                <label class="sr-only" for="library-find">Search the library</label>
                <input
                  id="library-find"
                  class="mt-2 w-full rounded-lg bg-raise px-3 py-1.5 text-sm outline-none placeholder:text-faint"
                  placeholder="Search: desk, lamp, kitchen"
                  autocomplete="off"
                  bind:value={find}
                />
              </div>
              <div class="min-h-0 flex-1 overflow-y-auto p-2">
                {#each shelves as [group, items] (group)}
                  <div class="px-1 pt-2 pb-1 text-[10px] tracking-[0.14em] text-muted uppercase">
                    {group}
                  </div>
                  <div class="grid gap-0.5">
                    {#each items as [k, about] (k)}
                      <button
                        class="flex items-center gap-2 rounded-lg px-1.5 py-1 text-start text-xs hover:bg-raise {next &&
                        'add' in next &&
                        next.add === k
                          ? 'bg-sea/20'
                          : ''}"
                        draggable="true"
                        ondragstart={(e) => {
                          carried = k;
                          e.dataTransfer?.setData(PIECE, k);
                          if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
                        }}
                        ondragend={() => {
                          carried = undefined;
                          bigFloor?.showDrop(undefined);
                        }}
                        onclick={() => (next = { add: k })}
                      >
                        <span class="grid size-9 shrink-0 place-items-center overflow-hidden">
                          <canvas
                            {@attach thumb(k)}
                            class="max-h-9 max-w-9 [image-rendering:pixelated]"
                            aria-hidden="true"
                          ></canvas>
                        </span>
                        <span class="min-w-0 flex-1 truncate">{about}</span>
                      </button>
                    {/each}
                  </div>
                {:else}
                  <p class="p-2 text-xs text-muted">Nothing called that.</p>
                {/each}
              </div>
            </aside>
          {/if}
        </div>
        {#if arranging}
          <div class="flex flex-wrap items-center gap-2 border-t border-hairline p-3 text-xs">
            <!-- One height whatever it says, so the floor above never jumps while a change builds. -->
            <div class="flex min-h-8 basis-full items-center gap-2">
              {#if building}
                <span class="busy"></span><span class="flex-1 text-muted">Building it again.</span>
              {:else if next}
                <span class="flex-1 text-ink"
                  >{'move' in next
                    ? `Tap where the ${thing(next.move)} goes in ${inWords(next.place)}.`
                    : `Tap where the ${thing(next.add)} goes.`}</span
                >
                <button class="rounded-lg bg-raise px-2.5 py-1" onclick={() => (next = undefined)}
                  >Cancel</button
                >
              {:else if picked}
                {@const p = picked}
                <span class="flex-1 text-ink">The {thing(p.item)} in {inWords(p.place)}.</span>
                <button
                  class="rounded-lg bg-raise px-2.5 py-1 hover:bg-sea/20"
                  onclick={() => (next = { move: p.item, place: p.place })}>Move</button
                >
                <button
                  class="rounded-lg bg-raise px-2.5 py-1 hover:bg-coral/25"
                  onclick={() => change(p.place, { remove: p.item })}>Remove</button
                >
                <button
                  class="rounded-lg px-2.5 py-1 text-muted"
                  onclick={() => (picked = undefined)}>Cancel</button
                >
              {:else}
                <span class="flex-1 text-muted"
                  >Drag a thing to move it. Tap one to move or remove it.</span
                >
                <select
                  class="rounded-lg bg-raise px-2.5 py-1 text-ink"
                  aria-label="Add something"
                  value=""
                  onchange={(e) => {
                    const v = e.currentTarget.value;
                    e.currentTarget.value = '';
                    if (v) next = { add: v };
                  }}
                >
                  <option value="">Add something</option>
                  {#each addable as [group, items] (group)}
                    <optgroup label={group}>
                      {#each items as [k, about] (k)}
                        <option value={k}>{about}</option>
                      {/each}
                    </optgroup>
                  {/each}
                </select>
                <button
                  class="rounded-lg bg-raise px-2.5 py-1 disabled:opacity-40"
                  disabled={!undo.length}
                  onclick={undoLast}>Undo</button
                >
              {/if}
            </div>
            {#each drawn.notes as n (n)}
              <p class="basis-full text-muted">{n}</p>
            {/each}
          </div>
        {:else}
          <div class="flex gap-2 border-t border-hairline p-3">
            <input
              class={field}
              placeholder="What to change, e.g. a bigger gym, no break room"
              bind:value={note}
              disabled={drawing || moving}
              onkeydown={(e) => e.key === 'Enter' && !drawing && draw('again')}
            />
            <button
              class="shrink-0 rounded-lg bg-sea px-3 py-2 text-xs font-medium text-night disabled:opacity-40"
              disabled={drawing || moving}
              onclick={() => draw('again')}>Redraw</button
            >
          </div>
        {/if}
      </dialog>
    {/if}

    {#if layouts.length || sample}
      <div class="mt-2 flex flex-col gap-1">
        <div class="text-xs text-muted">Your layouts</div>
        {#each layouts as l (l.id)}
          <div class="flex items-center gap-2 rounded-lg bg-raise px-2.5 py-1.5 text-xs">
            <span class="min-w-0 flex-1 truncate text-ink" title={l.description}>{l.name}</span>
            {#if l.active}
              <span class="text-faint">You are here</span>
            {:else}
              <button
                class="text-sea underline underline-offset-2 disabled:opacity-40"
                disabled={drawing || moving}
                onclick={() => moveBack(l)}>Move back</button
              >
            {/if}
          </div>
        {/each}
        {#if sample}
          <div class="flex items-center gap-2 rounded-lg bg-raise px-2.5 py-1.5 text-xs">
            <span class="min-w-0 flex-1 truncate text-ink">{sample.name}, the sample office</span>
            {#if sample.active}
              <span class="text-faint">You are here</span>
            {:else}
              <button
                class="text-sea underline underline-offset-2 disabled:opacity-40"
                disabled={drawing || moving}
                onclick={() => moveBack({ id: 'sample' })}>Move back</button
              >
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</section>

<style>
  .busy {
    inline-size: 6px;
    block-size: 6px;
    border-radius: 9999px;
    background: var(--color-ember);
    animation: pulse 1.2s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.3;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .busy {
      animation: none;
    }
  }
</style>

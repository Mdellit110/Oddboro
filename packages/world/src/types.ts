// The shapes every space is built from. A room template is a reusable stamp;
// a floor plan places stamps to make one office. Rooms and plans are JSON so a
// new space is a data change, not a code change.

export const TILE = 16;

export type Facing = 'up' | 'down' | 'left' | 'right';
export type Pose = 'sit' | 'stand' | 'lie';
export type Layer = 'floor' | 'wall' | 'object' | 'overlay' | 'character';

/** What the sprite compiler writes to dist/meta.json for each sprite. */
export type SpriteMeta = {
  width: number;
  height: number;
  layer: Layer;
  origin: [number, number];
  footprint: [number, number];
  walkable: boolean;
  zbias: number;
  fps: number;
  tags: string[];
  /** Has pixels that give off their own light. */
  emissive?: boolean;
  spots: { name: string; dx: number; dy: number; facing: Facing; activity: string; pose: Pose }[];
  lights: { x: number; y: number; radius: number; color: string; intensity: number }[];
  variants: string[];
  frames: string[];
};

export type SpriteCatalog = Record<string, SpriteMeta>;

export type PropPlacement = {
  sprite: string;
  /** Tile of the footprint's top-left corner, relative to the room. */
  at: [number, number];
  variant?: string;
  frame?: string;
  flip?: boolean;
  /** Its id in the room, `sprite#n`, which a room edit names. */
  id?: string;
  /** The id of the first prop it was placed with, like a desk for its chair: they move together. */
  group?: string;
};

/**
 * A room stamp. Map characters:
 *   W  wall. Three rows across the top make a back wall (cap, then a 2-tile face).
 *   N  window in a back wall face (both face rows).
 *   D  doorway through a back wall (all three rows). Walkable.
 *   .  floor in the room's default material.
 *   (space) nothing. Leaves whatever another room put there.
 *   any other character: floor in the material `materials` names for it.
 */
export type RoomTemplate = {
  id: string;
  name: string;
  /** Wall style prefix, e.g. "wall-plaster" uses wall-plaster-face, -cap, -door, -window. */
  wall: string;
  /** Floor material for ".", e.g. "oak" uses floor-oak. */
  floor: string;
  materials?: Record<string, string>;
  map: string[];
  props: PropPlacement[];
  /** Open air, like the street. Its lamps glow at full strength; indoor ones are softer. */
  outdoor?: boolean;
  /** False for a place that is not a room, like the street: the floor shows no name over it. */
  sign?: false;
};

export type FloorPlan = {
  id: string;
  name: string;
  /**
   * Corridors: a floor rectangle edged in wall, stamped before the rooms so a
   * room's own walls and entrances win where they overlap. `at` and `size`
   * include the edge.
   */
  halls?: { at: [number, number]; size: [number, number]; floor: string; wall: string }[];
  rooms: { room: string; at: [number, number]; label?: string }[];
  props?: PropPlacement[];
  /**
   * The land around the building. `margin` adds tiles on each side first,
   * [left, top, right, bottom], and moves everything above in by left and top.
   * Then `room`, a template in world coordinates, fills every cell nothing else
   * claimed. Grounds are scenery: staff never walk them.
   */
  grounds?: { room: string; margin: [number, number, number, number] };
  /** Preview-only figures, so a render can show people in the space. */
  actors?: {
    sprite: string;
    variant?: string;
    frame?: string;
    at: [number, number];
    flip?: boolean;
  }[];
};

export type Cell =
  | { kind: 'void' }
  | { kind: 'floor'; material: string }
  | { kind: 'wall'; style: string; feature: 'plain' | 'window' | 'door' };

export type DrawPass = 0 | 1 | 2 | 3;
export const PASS = { floor: 0, wall: 1, object: 2, overlay: 3 } as const;

export type DrawCmd = {
  sprite: string;
  frame: string;
  variant?: string;
  /** Top-left pixel. */
  x: number;
  y: number;
  /** Sort key within a pass: the pixel row the thing stands on. */
  z: number;
  pass: DrawPass;
  flip?: boolean;
  /** The placed prop it draws, `room/sprite#i`, which a switch names. */
  obj?: string;
  /** The prop's id in its room template, `sprite#n`, which a room edit names. */
  item?: string;
};

export type PlacedSpot = {
  id: string;
  /** The prop the spot belongs to, e.g. "break-arcade". */
  prop: string;
  /** The placed prop, `room/sprite#i`: switching it off takes the spot. */
  obj: string;
  /** The spot's own name on its prop, e.g. "seat" or "run". */
  name: string;
  room: string;
  activity: string;
  facing: Facing;
  pose: Pose;
  tile: [number, number];
  /**
   * The one tile a staffer steps in from and out to: the open side the spot
   * faces, or failing that the side behind it. Undefined when no side is open.
   */
  approach?: [number, number];
};

export type PlacedLight = {
  x: number;
  y: number;
  radius: number;
  color: string;
  intensity: number;
  /** The room or hall the light is in, in pixels. Glow stops at its walls. */
  clip?: { x: number; y: number; w: number; h: number };
  /** In an outdoor room or on the grounds. */
  outdoor?: boolean;
  /** The placed prop that gives it off: switching that off puts it out. */
  obj?: string;
};

export type RoomBounds = {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  outdoor?: boolean;
  sign?: false;
};

export type World = {
  width: number;
  height: number;
  cells: Cell[];
  walkable: boolean[];
  draws: DrawCmd[];
  spots: PlacedSpot[];
  lights: PlacedLight[];
  rooms: RoomBounds[];
  halls: RoomBounds[];
  /** The plan's own area in tiles, inside the grounds margin. */
  site: { x: number; y: number; w: number; h: number };
  missing: string[];
};

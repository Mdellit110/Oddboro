// Staff on the floor. Each one walks to a spot that matches what it is doing
// and plays the pose for it. Where a staffer stands is its status.
import { Graphics, Sprite, type Texture } from 'pixi.js';
import { findPath, TILE, type Facing, type PathRules, type PlacedSpot } from '@oddboro/world';
import type { Floor } from './engine.ts';
import type { Activity, StaffProfile } from '../staff/roster.ts';
import { posesFor } from '../staff/places.ts';

const SPEED = 46; // pixels per second, about three tiles
/** Activities a staffer does in its own room when it can. */
const WORK: Activity[] = ['work', 'intake', 'read'];

const dirOf = (f: Facing) => (f === 'left' || f === 'right' ? 'side' : f);

export class StaffActor {
  readonly profile: StaffProfile;
  readonly sprite: Sprite;
  private shadow = new Graphics().ellipse(0, 0, 5, 1.6).fill({ color: 0x000000, alpha: 0.28 });
  activity: Activity = 'home';
  since = Date.now();
  /** Feet position in world pixels: the centre-bottom of the tile it stands on. */
  x = 0;
  y = 0;
  private tile: [number, number];
  private path: [number, number][] = [];
  private spot: PlacedSpot | undefined;
  private facing: Facing = 'down';
  private current = '';
  private frameList: Texture[] = [];
  private fps = 6;
  /**
   * Each staffer's own tempo and starting point, from its id, so people sitting
   * or standing about never breathe and type in step with each other.
   */
  private beat = 1;
  private phase = 0;
  private clock = 0;
  private floor: Floor;

  constructor(floor: Floor, profile: StaffProfile, start: [number, number]) {
    this.floor = floor;
    this.profile = profile;
    this.tile = start;
    this.x = start[0] * TILE + TILE / 2;
    this.y = (start[1] + 1) * TILE;
    let h = 2166136261;
    for (const ch of profile.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    this.beat = 0.8 + ((h >>> 0) % 401) / 1000;
    this.phase = ((h >>> 12) % 1000) / 1000;
    this.frameList = this.frames('idle-down');
    this.sprite = new Sprite(this.frameList[0]);
    this.sprite.eventMode = 'static';
    this.sprite.cursor = 'pointer';
    floor.objects.addChild(this.sprite);
    floor.shadows.addChild(this.shadow);
    this.place();
  }

  /** A drawn look's variant, worn over the profile's own. */
  private look: string | undefined;

  /** Wear a drawn look's frames. The next frame drawn uses them. */
  wear(variant: string | undefined) {
    if (variant === this.look) return;
    this.look = variant;
    this.current = '';
  }

  private key(anim: string) {
    return `${this.profile.sprite}@${this.look ?? this.profile.variant}/${anim}`;
  }

  private frames(anim: string): Texture[] {
    const a = this.floor.atlas.sheet.animations;
    return a[this.key(anim)] ?? a[`${this.profile.sprite}/${anim}`] ?? a[this.key('idle-down')];
  }

  private has(anim: string) {
    const a = this.floor.atlas.sheet.animations;
    return !!(a[this.key(anim)] ?? a[`${this.profile.sprite}/${anim}`]);
  }

  private play(anim: string, flip: boolean) {
    const id = `${anim}:${flip}`;
    if (this.current !== id) {
      this.current = id;
      this.frameList = this.frames(anim);
      // A walk keeps its pace with the steps; anything else runs at the
      // staffer's own tempo, from its own point in the loop.
      const walking = anim.startsWith('walk');
      this.fps = walking ? 8 : 4 * this.beat;
      this.clock = walking ? 0 : this.phase * (this.frameList.length / this.fps);
    }
    this.sprite.scale.x = flip ? -1 : 1;
  }

  /** Send the staffer somewhere that fits the activity. Returns false if no spot fits. */
  assign(activity: Activity, spots: PlacedSpot[], taken: Set<string>): boolean {
    this.activity = activity;
    this.since = Date.now();
    const exit = spots.find((s) => s.activity === 'home');
    if (activity === 'home' && !exit) {
      this.hide();
      return true;
    }
    this.sprite.visible = true;
    this.shadow.visible = true;
    this.floor.invalidate();
    let options = spots.filter((s) => s.activity === activity && !taken.has(s.id));
    // Work happens in the staffer's own room when that room has a spot for it.
    const home = this.profile.room;
    const inRoom = (s: PlacedSpot) => s.room.startsWith(`${home}#`);
    if (WORK.includes(activity) && options.some(inRoom)) options = options.filter(inRoom);
    if (!options.length) return false;
    const w = this.floor.world;
    let best: { spot: PlacedSpot; path: [number, number][] } | undefined;
    for (const spot of options) {
      const path = findPath(w.walkable, w.width, this.tile, spot.tile, this.rules(spot));
      if (path && (!best || path.length < best.path.length)) best = { spot, path };
    }
    if (!best) return false;
    this.spot = best.spot;
    this.path = best.path.slice(1);
    return true;
  }

  private hide() {
    this.sprite.visible = false;
    this.shadow.visible = false;
    this.spot = undefined;
    this.floor.invalidate();
  }

  /** The tile the staffer stands on and the next two it will step to. */
  get steps(): [number, number][] {
    return [this.tile, ...this.path.slice(0, 2)];
  }

  /** True while walking somewhere. */
  get moving() {
    return this.path.length > 0;
  }

  get visible() {
    return this.sprite.visible;
  }

  /** Enter the target spot from its approach, and stand up from the current one the way we sat down. */
  private rules(target: PlacedSpot): PathRules {
    const here =
      this.spot && this.spot.tile[0] === this.tile[0] && this.spot.tile[1] === this.tile[1];
    return { enter: target.approach, leave: here ? this.spot!.approach : undefined };
  }

  /** Walk to one particular spot and do what it is for. False if no path reaches it. */
  sendTo(spot: PlacedSpot): boolean {
    const w = this.floor.world;
    this.sprite.visible = true;
    this.shadow.visible = true;
    this.floor.invalidate();
    const path = findPath(w.walkable, w.width, this.tile, spot.tile, this.rules(spot));
    if (!path) return false;
    this.activity = spot.activity as Activity;
    this.since = Date.now();
    this.spot = spot;
    this.path = path.slice(1);
    if (!this.path.length && this.activity === 'home') this.hide();
    return true;
  }

  /** Be where the current walk ends, without walking it: for a staffer already there when the office opens. */
  arrive() {
    const end = this.path.at(-1);
    if (!end) return;
    this.path = [];
    this.tile = end;
    this.x = end[0] * TILE + TILE / 2;
    this.y = (end[1] + 1) * TILE;
    if (this.activity === 'home') this.hide();
    this.place();
  }

  get spotId() {
    return this.spot?.id;
  }

  /** The spot it is walking to, while it walks. */
  get destination(): PlacedSpot | undefined {
    return this.path.length ? this.spot : undefined;
  }

  update(dt: number) {
    if (!this.sprite.visible) return;
    const next = this.path[0];
    if (next) {
      const tx = next[0] * TILE + TILE / 2;
      const ty = (next[1] + 1) * TILE;
      const dx = tx - this.x;
      const dy = ty - this.y;
      const dist = Math.hypot(dx, dy);
      const step = SPEED * dt;
      if (Math.abs(dx) > Math.abs(dy)) this.facing = dx > 0 ? 'right' : 'left';
      else this.facing = dy > 0 ? 'down' : 'up';
      if (dist <= step) {
        this.x = tx;
        this.y = ty;
        this.tile = next;
        this.path.shift();
        // Going home ends at the exit: step out of sight.
        if (!this.path.length && this.activity === 'home') this.hide();
      } else {
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
      }
      this.play(`walk-${dirOf(this.facing)}`, this.facing === 'left');
    } else {
      const facing = this.spot?.facing ?? 'down';
      const dir = dirOf(facing);
      const pose = posesFor(this.activity, this.spot).find((p) => this.has(p)) ?? `idle-${dir}`;
      this.play(pose, facing === 'left');
    }
    this.clock += dt;
    this.place();
  }

  /** Put the sprite where the staffer is, and ask for a draw only if that changed what shows. */
  private place() {
    const s = this.sprite;
    const meta = this.floor.atlas.catalog[this.profile.sprite];
    const left = Math.round(this.x - TILE / 2);
    const x = s.scale.x < 0 ? left + meta.width : left;
    const y = Math.round(this.y) - meta.height;
    const tex = this.frameList[Math.floor(this.clock * this.fps) % this.frameList.length];
    // Sitting on a chair that faces away paints the chair back over the body.
    const z = Math.round(this.y) - (this.path.length === 0 ? 1 : 0);
    if (
      s.x === x &&
      s.y === y &&
      s.zIndex === z &&
      s.texture === tex &&
      s.tint === this.floor.nightTint
    )
      return;
    s.texture = tex;
    s.position.set(x, y);
    s.tint = this.floor.nightTint;
    this.shadow.position.set(Math.round(this.x), Math.round(this.y) - 1);
    s.zIndex = z;
    this.floor.invalidate();
  }

  /** Top-centre of the head, for the name tag. */
  get head(): { x: number; y: number } {
    const meta = this.floor.atlas.catalog[this.profile.sprite];
    return { x: this.x, y: this.y - meta.height + 2 };
  }

  destroy() {
    this.sprite.destroy();
    this.shadow.destroy();
  }
}

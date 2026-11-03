import { CutTrail, strokeWidth, type CutPoint, type Span, type TrailOptions } from './cut';
import type { PointerInput } from './physics';
import type { Rgb } from './renderer';

/** The parts of a liquid body a press needs to read and tug on */
export interface Anchor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: Rgb;
}

/** Dough drawn out of a blob: a tapered capsule from inside the body to the fingertip */
export interface Pull {
  root: CutPoint;
  tip: CutPoint;
  color: Rgb;
}

interface Point {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Fingertip dents ooze back over a few seconds, like soft dough */
const DENT_TRAIL: TrailOptions = { lifetime: 3, width: { min: 0.045, max: 0.08 } };
/** Fingertip-wide arm: fast drags draw it thin, slow ones thick */
const PULL_WIDTH: Span = { min: 0.06, max: 0.11 };
/** 1/s — width eases toward the drag speed so a jittery stroke doesn't ripple */
const WIDTH_RATE = 6;
/** Root sits wider than the tip so the arm flares into the body */
const ROOT_SCALE = 1.4;
// Root starts inside the source so the arm grows out of the surface, not beside it
const ROOT_DEPTH = 0.6;
/** Furthest the arm reaches out of the blob's surface, short-side units */
const MAX_REACH = 0.4;
/** 1/s² — tip follow; low intensity is stiff dough that lags, high snaps to the pointer */
const TIP_STIFFNESS: Span = { min: 40, max: 120 };
const TIP_DAMPING_RATIO = 0.8;
/** 1/s² — recoil after release; slightly underdamped so it settles with a soft wobble */
const RECOIL_STIFFNESS: Span = { min: 12, max: 30 };
const RECOIL_DAMPING_RATIO = 0.6;
/** 1/s² — how hard the grabbed blob is tugged toward the pointer, per unit of reach */
const SOURCE_PULL = 3;
/** Recoil ends once the tip has sunk this deep and nearly stopped */
const SETTLE_DEPTH = 0.3;
const SETTLE_SPEED = 0.05;

const lerp = (span: Span, t: number) => span.min + (span.max - span.min) * t;

function springTo(point: Point, x: number, y: number, stiffness: number, dampingRatio: number, dt: number) {
  const damping = 2 * Math.sqrt(stiffness) * dampingRatio;
  point.vx += ((x - point.x) * stiffness - point.vx * damping) * dt;
  point.vy += ((y - point.y) * stiffness - point.vy * damping) * dt;
  point.x += point.vx * dt;
  point.y += point.vy * dt;
}

/**
 * One gesture, decided by where the press lands: outside the liquid it cuts,
 * on a blob it dents the surface under the fingertip and draws the dough out past the edge.
 */
export class MoldGesture {
  private cutTrail = new CutTrail();
  private dentTrail = new CutTrail(DENT_TRAIL);
  private source: Anchor | null = null;
  private pressing = false;
  private width = 0;
  private tip: Point = { x: 0, y: 0, vx: 0, vy: 0 };

  /** True while a stroke that started outside the liquid is cutting */
  cutting = false;

  update(
    dt: number,
    pointer: PointerInput,
    isMolding: boolean,
    intensity: number,
    bodies: Anchor[],
    scaleX: number,
    scaleY: number,
  ) {
    if (isMolding && pointer.tapped) this.begin(pointer, bodies, scaleX, scaleY);
    const held = isMolding && pointer.active;
    if (!held) {
      this.cutting = false;
      this.pressing = false;
    }

    this.cutTrail.update(dt, pointer, held && this.cutting, intensity, scaleX, scaleY);
    const inside = !!this.source && this.depthOf(pointer, this.source, scaleX, scaleY) < this.source.radius;
    this.dentTrail.update(dt, pointer, held && this.pressing && inside, intensity, scaleX, scaleY);

    if (!this.source) return;
    if (this.pressing) this.follow(dt, pointer, intensity, this.source, scaleX, scaleY);
    else this.recoil(dt, intensity, this.source, scaleX, scaleY);
  }

  getCuts(): CutPoint[] {
    return this.cutTrail.getPoints();
  }

  getDents(): CutPoint[] {
    return this.dentTrail.getPoints();
  }

  getPull(): Pull | null {
    const source = this.source;
    if (!source) return null;
    const dx = this.tip.x - source.x;
    const dy = this.tip.y - source.y;
    const distance = Math.hypot(dx, dy);
    // Root is a share of the way to the tip, measured in the source's own radius
    const depth = distance > 0 ? Math.min(source.radius * ROOT_DEPTH, distance) / distance : 0;
    return {
      root: { x: source.x + dx * depth, y: source.y + dy * depth, width: this.width * ROOT_SCALE },
      tip: { x: this.tip.x, y: this.tip.y, width: this.width },
      color: source.color,
    };
  }

  private begin(pointer: PointerInput, bodies: Anchor[], scaleX: number, scaleY: number) {
    const hit = bodies.find((body) => this.depthOf(pointer, body, scaleX, scaleY) < body.radius);
    this.cutting = !hit;
    this.pressing = !!hit;
    if (!hit) return;

    // Pressing the same blob mid-recoil keeps the arm where it is instead of popping it back in
    if (this.source !== hit) {
      this.tip = { x: pointer.x, y: pointer.y, vx: 0, vy: 0 };
      this.width = 0;
    }
    this.source = hit;
  }

  private depthOf(point: { x: number; y: number }, body: Anchor, scaleX: number, scaleY: number) {
    return Math.hypot((point.x - body.x) * scaleX, (point.y - body.y) * scaleY);
  }

  private follow(
    dt: number,
    pointer: PointerInput,
    intensity: number,
    source: Anchor,
    scaleX: number,
    scaleY: number,
  ) {
    // Work in short-side units so the reach limit is round on any aspect
    const dx = (pointer.x - source.x) * scaleX;
    const dy = (pointer.y - source.y) * scaleY;
    const distance = Math.hypot(dx, dy);
    const limit = source.radius + MAX_REACH;
    const keep = distance > limit ? limit / distance : 1;
    springTo(
      this.tip,
      source.x + (dx * keep) / scaleX,
      source.y + (dy * keep) / scaleY,
      lerp(TIP_STIFFNESS, intensity),
      TIP_DAMPING_RATIO,
      dt,
    );
    const target = strokeWidth(PULL_WIDTH, pointer, scaleX, scaleY);
    this.width += (target - this.width) * (1 - Math.exp(-WIDTH_RATE * dt));

    const reach = Math.max(this.depthOf(this.tip, source, scaleX, scaleY) - source.radius, 0);
    if (distance > 0) {
      source.vx += ((dx / distance) * SOURCE_PULL * reach * dt) / scaleX;
      source.vy += ((dy / distance) * SOURCE_PULL * reach * dt) / scaleY;
    }
  }

  private recoil(dt: number, intensity: number, source: Anchor, scaleX: number, scaleY: number) {
    springTo(this.tip, source.x, source.y, lerp(RECOIL_STIFFNESS, intensity), RECOIL_DAMPING_RATIO, dt);
    const depth = this.depthOf(this.tip, source, scaleX, scaleY);
    const speed = Math.hypot(this.tip.vx * scaleX, this.tip.vy * scaleY);
    if (depth < source.radius * SETTLE_DEPTH && speed < SETTLE_SPEED) this.source = null;
  }
}

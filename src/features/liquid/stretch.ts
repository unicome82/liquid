import type { PointerInput } from './physics';
import type { Blob, Rgb } from './renderer';

/** The parts of a liquid body a stretch needs to read and tug on */
export interface Anchor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: Rgb;
}

interface Point {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Span {
  min: number;
  max: number;
}

// Spacing must stay under the finger radius at full reach, or the tube turns into beads
const FINGER_BLOBS = 14;
/** Shader slots needed on top of the layout blobs (finger + its tip) */
export const EXTRA_BLOBS = FINGER_BLOBS + 1;

/** How close to a blob's edge a press must land to grab it, short-side units */
const GRAB_REACH = 0.1;
/** Finger width follows the grabbed blob, within a fingertip-sized range */
const FINGER_SCALE = 0.35;
const FINGER_RADIUS: Span = { min: 0.03, max: 0.04 };
/** Furthest the finger reaches out of the blob's surface, short-side units */
const MAX_REACH = 0.4;
/** Slime thins a little as it stretches, so it still reads as the same amount of goo */
const REACH_THINNING = 0.2;
/** Root flares into the body instead of meeting it at a hard joint */
const ROOT_FLARE = 0.6;
// Finger starts inside the source so it grows out of the surface, not beside it
const ATTACH_DEPTH = 0.6;
/** 1/s² — tip follow; low intensity is thick slime that lags, high snaps to the pointer */
const TIP_STIFFNESS: Span = { min: 40, max: 120 };
const TIP_DAMPING_RATIO = 0.7;
/** 1/s² — recoil after release; underdamped so it overshoots and jiggles like slime */
const RECOIL_STIFFNESS: Span = { min: 30, max: 70 };
const RECOIL_DAMPING_RATIO = 0.35;
/** 1/s² — body segments trail their line a beat behind, so a swing bends the finger */
const SEGMENT_STIFFNESS = 220;
const SEGMENT_DAMPING_RATIO = 0.45;
/** 1/s² — how hard the grabbed blob is tugged toward the pointer, per unit of stretch */
const SOURCE_PULL = 3;
/** Recoil ends once the tip has sunk this deep and nearly stopped */
const SETTLE_DEPTH = 0.3;
const SETTLE_SPEED = 0.05;
// Keep the slime blobs in one smooth tube without swelling into the body's wide merge range
const FINGER_MERGE = 0.16;
// Tiny blobs inside the liquid leave pinpoint dimples in the shading; stop drawing them early
const MIN_VISIBLE_RADIUS = 0.012;

const lerp = (span: Span, t: number) => span.min + (span.max - span.min) * t;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const emptyPoint = (): Point => ({ x: 0, y: 0, vx: 0, vy: 0 });

function springTo(point: Point, x: number, y: number, stiffness: number, dampingRatio: number, dt: number) {
  const damping = 2 * Math.sqrt(stiffness) * dampingRatio;
  point.vx += ((x - point.x) * stiffness - point.vx * damping) * dt;
  point.vy += ((y - point.y) * stiffness - point.vy * damping) * dt;
  point.x += point.vx * dt;
  point.y += point.vy * dt;
}

/** Grab a blob's edge and pull out a finger-wide slime arm that springs back on release. */
export class StretchGesture {
  private source: Anchor | null = null;
  private holding = false;
  private fingerRadius = 0;
  private reach = 0;
  private tip = emptyPoint();
  private segments: Point[] = Array.from({ length: FINGER_BLOBS }, emptyPoint);

  update(
    dt: number,
    pointer: PointerInput,
    isStretching: boolean,
    intensity: number,
    bodies: Anchor[],
    scaleX: number,
    scaleY: number,
  ) {
    if (isStretching && pointer.tapped) this.tryGrab(pointer, bodies, scaleX, scaleY);
    if (!isStretching || !pointer.active) this.holding = false;
    if (!this.source) return;

    if (this.holding) this.followPointer(dt, pointer, intensity, this.source, scaleX, scaleY);
    else this.recoil(dt, intensity, this.source, scaleX, scaleY);
    if (this.source) this.stepSegments(dt, this.source, scaleX, scaleY);
  }

  getBlobs(): Blob[] {
    const source = this.source;
    if (!source) return [];
    const thickness = 1 - REACH_THINNING * clamp(this.reach / MAX_REACH, 0, 1);
    const radius = this.fingerRadius * thickness;
    const blobs = this.segments.map((point, i) => {
      const fromRoot = 1 - (i + 1) / (FINGER_BLOBS + 1);
      return { x: point.x, y: point.y, radius: radius * (1 + ROOT_FLARE * fromRoot * fromRoot) };
    });
    blobs.push({ x: this.tip.x, y: this.tip.y, radius });
    return blobs
      .filter((blob) => blob.radius > MIN_VISIBLE_RADIUS)
      .map((blob) => ({ ...blob, color: source.color, merge: FINGER_MERGE }));
  }

  private tryGrab(pointer: PointerInput, bodies: Anchor[], scaleX: number, scaleY: number) {
    let nearest: Anchor | null = null;
    let bestEdge = GRAB_REACH;
    for (const body of bodies) {
      const edge =
        Math.hypot((body.x - pointer.x) * scaleX, (body.y - pointer.y) * scaleY) - body.radius;
      if (edge < bestEdge) {
        bestEdge = edge;
        nearest = body;
      }
    }
    if (!nearest) return;

    // Re-grabbing mid-recoil keeps the finger where it is instead of popping it back in
    if (this.source !== nearest) {
      this.tip = { x: nearest.x, y: nearest.y, vx: 0, vy: 0 };
      this.segments.forEach((point) => Object.assign(point, this.tip));
    }
    this.source = nearest;
    this.holding = true;
    this.fingerRadius = clamp(nearest.radius * FINGER_SCALE, FINGER_RADIUS.min, FINGER_RADIUS.max);
  }

  private followPointer(
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

    const reach = this.measureReach(source, scaleX, scaleY);
    if (distance > 0) {
      source.vx += ((dx / distance) * SOURCE_PULL * reach * dt) / scaleX;
      source.vy += ((dy / distance) * SOURCE_PULL * reach * dt) / scaleY;
    }
  }

  private recoil(dt: number, intensity: number, source: Anchor, scaleX: number, scaleY: number) {
    springTo(this.tip, source.x, source.y, lerp(RECOIL_STIFFNESS, intensity), RECOIL_DAMPING_RATIO, dt);
    this.measureReach(source, scaleX, scaleY);

    const depth = Math.hypot((this.tip.x - source.x) * scaleX, (this.tip.y - source.y) * scaleY);
    const speed = Math.hypot(this.tip.vx * scaleX, this.tip.vy * scaleY);
    if (depth < source.radius * SETTLE_DEPTH && speed < SETTLE_SPEED) this.source = null;
  }

  private measureReach(source: Anchor, scaleX: number, scaleY: number) {
    const distance = Math.hypot((this.tip.x - source.x) * scaleX, (this.tip.y - source.y) * scaleY);
    this.reach = Math.max(distance - source.radius, 0);
    return this.reach;
  }

  // Segments sit on the root→tip line but chase it on springs, giving the arm its wobble
  private stepSegments(dt: number, source: Anchor, scaleX: number, scaleY: number) {
    const dx = (this.tip.x - source.x) * scaleX;
    const dy = (this.tip.y - source.y) * scaleY;
    const distance = Math.hypot(dx, dy);
    const depth = Math.min(source.radius * ATTACH_DEPTH, distance);
    const rootX = distance > 0 ? source.x + (dx / distance) * depth / scaleX : source.x;
    const rootY = distance > 0 ? source.y + (dy / distance) * depth / scaleY : source.y;

    this.segments.forEach((point, i) => {
      const t = (i + 1) / (FINGER_BLOBS + 1);
      const x = rootX + (this.tip.x - rootX) * t;
      const y = rootY + (this.tip.y - rootY) * t;
      springTo(point, x, y, SEGMENT_STIFFNESS, SEGMENT_DAMPING_RATIO, dt);
    });
  }
}

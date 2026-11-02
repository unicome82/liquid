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

interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  targetRadius: number;
  color: Rgb;
  host: Anchor | null;
  /** 1/s² — rubber-band recoil on release, slower ooze after a snap */
  returnStiffness: number;
  age: number;
}

interface Span {
  min: number;
  max: number;
}

const STRAND_BLOBS = 6;
const TIP_BLOBS = 1;
const MAX_LOOSE = 2;
/** Shader slots needed on top of the layout blobs */
export const EXTRA_BLOBS = STRAND_BLOBS + TIP_BLOBS + MAX_LOOSE;

/** How close to a blob's edge a press must land to grab it, short-side units */
const GRAB_REACH = 0.1;
const TIP_SCALE = 0.35;
const TIP_RADIUS: Span = { min: 0.04, max: 0.09 };
const TIP_STIFFNESS = 80;
const TIP_DAMPING_RATIO = 0.9;
// Strand starts inside the source so the neck grows out of the surface, not beside it
const ATTACH_DEPTH = 0.6;
const ATTACH_SCALE = 0.3;
/** Middle of the strand pinches thinner than its ends */
const NECK_PINCH = 0.45;
/** Floor for how thin the strand gets just before it snaps */
const MIN_THICKNESS = 0.25;
/** Honey-like droop of the strand's middle, as a share of its length */
const SAG = 0.12;
/** Low intensity (thick honey) stretches further before snapping */
const SNAP_LENGTH: Span = { min: 0.6, max: 0.35 };
/** 1/s² — how hard the grabbed blob is tugged toward the pointer, per unit of stretch */
const SOURCE_PULL = 3;
const RECOIL_STIFFNESS = 8;
const OOZE_STIFFNESS = 2.5;
const LOOSE_DAMPING_RATIO = 0.8;
/** 1/s — strand thickness follows quickly so it never lags the pointer */
const STRAND_RADIUS_RATE = 12;
const DROP_RADIUS_RATE = 4;
// A just-released drop overlaps its host; give it time to travel before it can be absorbed
const ABSORB_MIN_AGE = 0.2;
const ABSORB_DEPTH = 0.6;
const LOOSE_LIFETIME = 4;
const RADIUS_EPSILON = 1e-3;
// The liquid's wide merge range would swell the strand into a thick neck; keep it thread-thin
const STRAND_MERGE = 0.08;
// Tiny blobs inside the liquid leave pinpoint dimples in the shading; stop drawing them early
const MIN_VISIBLE_RADIUS = 0.012;

const lerp = (span: Span, t: number) => span.min + (span.max - span.min) * t;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function emptyDrop(): Drop {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 0,
    targetRadius: 0,
    color: [1, 1, 1],
    host: null,
    returnStiffness: OOZE_STIFFNESS,
    age: 0,
  };
}

/** Grab a blob's edge and pull out a viscous strand that snaps or springs back. */
export class StretchGesture {
  private source: Anchor | null = null;
  private tip = emptyDrop();
  private strand: Drop[] = Array.from({ length: STRAND_BLOBS }, emptyDrop);
  private loose: Drop[] = [];

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

    if (this.source && (!isStretching || !pointer.active)) {
      this.release(RECOIL_STIFFNESS);
    } else if (this.source) {
      this.stepGrab(dt, pointer, intensity, this.source, scaleX, scaleY);
    }

    if (!this.source) this.retractStrand(dt);
    this.stepLoose(dt, scaleX, scaleY);
  }

  getBlobs(): Blob[] {
    const parts = this.source ? [...this.strand, this.tip] : this.strand;
    return [...parts, ...this.loose]
      .filter((drop) => drop.radius > MIN_VISIBLE_RADIUS)
      .map(({ x, y, radius, color }) => ({ x, y, radius, color, merge: STRAND_MERGE }));
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

    this.source = nearest;
    const tipRadius = clamp(nearest.radius * TIP_SCALE, TIP_RADIUS.min, TIP_RADIUS.max);
    this.tip = {
      ...emptyDrop(),
      x: pointer.x,
      y: pointer.y,
      radius: tipRadius,
      targetRadius: tipRadius,
      color: nearest.color,
    };
    for (const drop of this.strand) {
      Object.assign(drop, { x: nearest.x, y: nearest.y, vx: 0, vy: 0, color: nearest.color });
    }
  }

  private stepGrab(
    dt: number,
    pointer: PointerInput,
    intensity: number,
    source: Anchor,
    scaleX: number,
    scaleY: number,
  ) {
    const tip = this.tip;
    const damping = 2 * Math.sqrt(TIP_STIFFNESS) * TIP_DAMPING_RATIO;
    tip.vx += ((pointer.x - tip.x) * TIP_STIFFNESS - tip.vx * damping) * dt;
    tip.vy += ((pointer.y - tip.y) * TIP_STIFFNESS - tip.vy * damping) * dt;
    tip.x += tip.vx * dt;
    tip.y += tip.vy * dt;

    // Work in short-side units so the strand is straight on any aspect
    const dx = (tip.x - source.x) * scaleX;
    const dy = (tip.y - source.y) * scaleY;
    const distance = Math.hypot(dx, dy);
    const length = Math.max(distance - source.radius, 0);
    const snapLength = lerp(SNAP_LENGTH, intensity);
    if (length > snapLength) {
      this.release(OOZE_STIFFNESS);
      return;
    }

    const nx = distance > 0 ? dx / distance : 0;
    const ny = distance > 0 ? dy / distance : 0;
    source.vx += (nx * SOURCE_PULL * length * dt) / scaleX;
    source.vy += (ny * SOURCE_PULL * length * dt) / scaleY;

    const attachX = source.x + (nx * source.radius * ATTACH_DEPTH) / scaleX;
    const attachY = source.y + (ny * source.radius * ATTACH_DEPTH) / scaleY;
    const thickness = Math.max(1 - length / snapLength, MIN_THICKNESS);
    const radiusBlend = 1 - Math.exp(-STRAND_RADIUS_RATE * dt);

    this.strand.forEach((drop, i) => {
      const t = (i + 1) / (STRAND_BLOBS + 1);
      const bulge = Math.sin(Math.PI * t);
      drop.x = attachX + (tip.x - attachX) * t;
      drop.y = attachY + (tip.y - attachY) * t + (bulge * length * SAG) / scaleY;
      drop.color = source.color;
      const endRadius = source.radius * ATTACH_SCALE + (tip.radius - source.radius * ATTACH_SCALE) * t;
      drop.targetRadius = endRadius * (1 - NECK_PINCH * bulge) * thickness;
      drop.radius += (drop.targetRadius - drop.radius) * radiusBlend;
    });
  }

  // Tip becomes a free drop heading home; the thread itself thins away toward the source
  private release(returnStiffness: number) {
    if (this.loose.length >= MAX_LOOSE) this.loose.shift();
    this.loose.push({ ...this.tip, host: this.source, returnStiffness, age: 0 });
    for (const drop of this.strand) {
      drop.host = this.source;
      drop.targetRadius = 0;
    }
    this.source = null;
  }

  private retractStrand(dt: number) {
    const radiusBlend = 1 - Math.exp(-DROP_RADIUS_RATE * dt);
    for (const drop of this.strand) {
      if (drop.host) {
        drop.x += (drop.host.x - drop.x) * radiusBlend;
        drop.y += (drop.host.y - drop.y) * radiusBlend;
      }
      drop.radius += (drop.targetRadius - drop.radius) * radiusBlend;
    }
  }

  private stepLoose(dt: number, scaleX: number, scaleY: number) {
    const radiusBlend = 1 - Math.exp(-DROP_RADIUS_RATE * dt);
    for (const drop of this.loose) {
      drop.age += dt;
      const host = drop.host;
      if (host) {
        const damping = 2 * Math.sqrt(drop.returnStiffness) * LOOSE_DAMPING_RATIO;
        drop.vx += ((host.x - drop.x) * drop.returnStiffness - drop.vx * damping) * dt;
        drop.vy += ((host.y - drop.y) * drop.returnStiffness - drop.vy * damping) * dt;
        const distance = Math.hypot((host.x - drop.x) * scaleX, (host.y - drop.y) * scaleY);
        if (drop.age > ABSORB_MIN_AGE && distance < host.radius * ABSORB_DEPTH) drop.targetRadius = 0;
      }
      if (drop.age > LOOSE_LIFETIME) drop.targetRadius = 0;
      drop.x += drop.vx * dt;
      drop.y += drop.vy * dt;
      drop.radius += (drop.targetRadius - drop.radius) * radiusBlend;
    }
    this.loose = this.loose.filter((d) => d.targetRadius > 0 || d.radius > RADIUS_EPSILON);
  }
}

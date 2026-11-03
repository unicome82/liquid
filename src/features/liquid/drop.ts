import type { PointerInput } from './physics';
import type { Rgb } from './renderer';

/** The parts of a liquid body a drop needs to find, chase and swell */
export interface Pool {
  x: number;
  y: number;
  radius: number;
  color: Rgb;
}

export interface DropBlob {
  /** 0–1 across the viewport */
  x: number;
  y: number;
  /** Short-side units */
  radius: number;
  color: Rgb;
  /** Smooth-union range: tight while the drop is apart, the liquid's own once it touches */
  merge: number;
  /** Body it is falling into; its colour and liquid group are the drop's too */
  target: Pool;
}

interface Span {
  min: number;
  max: number;
}

interface Drop extends DropBlob {
  vx: number;
  vy: number;
  targetRadius: number;
  /** Full-grown radius, kept for the swell even if absorbed before growing in */
  size: number;
  absorbed: boolean;
}

/** Fixed shader slots on top of the layout blobs; the oldest drop is dropped beyond this */
export const MAX_DROPS = 4;
/** Short-side units; low intensity lays bigger, heavier drops */
const DROP_RADIUS: Span = { min: 0.06, max: 0.04 };
/** 1/s² — pull toward the target; high intensity is runnier and quicker */
const PULL_STIFFNESS: Span = { min: 0.8, max: 1.6 };
// Critically damped so it creeps in without overshooting into the body
const PULL_DAMPING_RATIO = 1;
/** 1/s — how fast a drop swells in after the tap, and sinks away once absorbed */
const GROW_RATE = 3;
const SINK_RATE = 2;
/** Absorbed once its centre is this far inside the target, as a share of the target radius */
const ABSORB_DEPTH = 0.7;
/** The target swells by the drop's share of volume, scaled so the bump reads */
const SWELL_GAIN = 1.5;
// While dragging, another drop every this much travel
const SPAWN_SPACING = 0.12;
const RADIUS_EPSILON = 1e-3;
// The liquid's wide merge range would bridge a fresh drop to every neighbour at once;
// keep it a separate bead until it nears its target, then blend into the shader default
const MERGE_APART = 0.12;
const MERGE_JOINED = 0.28;
/** Edge gap over which the merge range opens up, short-side units */
const MERGE_APPROACH = 0.15;

const lerp = (span: Span, t: number) => span.min + (span.max - span.min) * t;

/** Called when a drop sinks into its target, so the body can swell and ripple */
export type OnAbsorb = (target: Pool, x: number, y: number) => void;

/** Drops laid by touch that slide into the nearest body of liquid and merge. */
export class DropRain {
  private drops: Drop[] = [];
  private lastSpawn = { x: 0, y: 0 };

  update(
    dt: number,
    pointer: PointerInput,
    isDropping: boolean,
    intensity: number,
    bodies: Pool[],
    scaleX: number,
    scaleY: number,
    onAbsorb: OnAbsorb,
  ) {
    if (isDropping && pointer.active) {
      const travel = Math.hypot(
        (pointer.x - this.lastSpawn.x) * scaleX,
        (pointer.y - this.lastSpawn.y) * scaleY,
      );
      if (pointer.tapped || travel >= SPAWN_SPACING) this.spawn(pointer, bodies, intensity, scaleX, scaleY);
    }

    const stiffness = lerp(PULL_STIFFNESS, intensity);
    const damping = 2 * Math.sqrt(stiffness) * PULL_DAMPING_RATIO;
    for (const drop of this.drops) {
      const { target } = drop;
      // Target shrank out (amount lowered): just fade where it is
      if (!bodies.includes(target)) drop.targetRadius = 0;
      drop.vx += ((target.x - drop.x) * stiffness - drop.vx * damping) * dt;
      drop.vy += ((target.y - drop.y) * stiffness - drop.vy * damping) * dt;
      drop.x += drop.vx * dt;
      drop.y += drop.vy * dt;

      const depth = Math.hypot((target.x - drop.x) * scaleX, (target.y - drop.y) * scaleY);
      const gap = Math.max(depth - target.radius - drop.radius, 0);
      drop.merge = MERGE_JOINED + (MERGE_APART - MERGE_JOINED) * Math.min(gap / MERGE_APPROACH, 1);
      if (!drop.absorbed && depth < target.radius * ABSORB_DEPTH) {
        drop.absorbed = true;
        drop.targetRadius = 0;
        target.radius *= 1 + SWELL_GAIN * (drop.size / target.radius) ** 2;
        onAbsorb(target, drop.x, drop.y);
      }
      const rate = drop.targetRadius > drop.radius ? GROW_RATE : SINK_RATE;
      drop.radius += (drop.targetRadius - drop.radius) * (1 - Math.exp(-rate * dt));
    }
    this.drops = this.drops.filter((d) => d.targetRadius > 0 || d.radius > RADIUS_EPSILON);
  }

  getDrops(): DropBlob[] {
    return this.drops.map(({ x, y, radius, color, merge, target }) => ({ x, y, radius, color, merge, target }));
  }

  private spawn(
    pointer: PointerInput,
    bodies: Pool[],
    intensity: number,
    scaleX: number,
    scaleY: number,
  ) {
    this.lastSpawn = { x: pointer.x, y: pointer.y };
    const target = nearestBody(pointer, bodies, scaleX, scaleY);
    if (!target) return;
    const size = lerp(DROP_RADIUS, intensity);
    this.drops.push({
      x: pointer.x,
      y: pointer.y,
      vx: 0,
      vy: 0,
      radius: 0,
      targetRadius: size,
      size,
      merge: MERGE_APART,
      color: target.color,
      target,
      absorbed: false,
    });
    if (this.drops.length > MAX_DROPS) this.drops.shift();
  }
}

/** Body whose edge is closest to the point */
function nearestBody(point: { x: number; y: number }, bodies: Pool[], scaleX: number, scaleY: number) {
  let nearest: Pool | null = null;
  let bestEdge = Infinity;
  for (const body of bodies) {
    const edge = Math.hypot((body.x - point.x) * scaleX, (body.y - point.y) * scaleY) - body.radius;
    if (edge < bestEdge) {
      bestEdge = edge;
      nearest = body;
    }
  }
  return nearest;
}

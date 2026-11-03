import type { InteractionMode } from '../../shared/settings';
import { CutTrail, type CutPoint } from './cut';
import type { Blob, Rgb } from './renderer';
import { RippleField, type GroupOf, type Ripple } from './ripple';

interface Body {
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  targetRadius: number;
  color: Rgb;
  phase: number;
  /** Elongation along its motion, short-side units (direction = long axis, length = share) */
  stretchX: number;
  stretchY: number;
  stretchVx: number;
  stretchVy: number;
}


export interface PointerInput {
  /** 0–1 across the viewport */
  x: number;
  y: number;
  /** Viewport fractions per second */
  vx: number;
  vy: number;
  active: boolean;
  /** True for the single frame after a press */
  tapped: boolean;
}

interface Span {
  min: number;
  max: number;
}

// Golden angle spreads per-blob phases so neighbours never drift in sync
const GOLDEN_ANGLE = 2.39996;
/** Drift reach, in short-side units */
const DRIFT_AMPLITUDE = 0.05;
const DRIFT_SECONDARY_FREQ = 1.7;
const DRIFT_SECONDARY_WEIGHT = 0.4;
// Different x/y rates keep the path elliptical rather than diagonal
const DRIFT_Y_FREQ = 0.83;
/** Radians per second of drift clock */
const DRIFT_SPEED: Span = { min: 0.15, max: 0.5 };
const STIFFNESS: Span = { min: 3, max: 14 };
// >1 is overdamped (honey-like ooze), <1 lets the blob wobble like water
const DAMPING_RATIO: Span = { min: 1.4, max: 0.6 };
/** 1/s — how fast blobs grow in or shrink out when the amount changes */
const RADIUS_RATE = 3;
const RADIUS_PULSE = 0.04;
const RADIUS_PULSE_FREQ = 1.3;
const RADIUS_EPSILON = 1e-3;

/** Reach of the pointer, in short-side units measured from the blob's edge */
const INFLUENCE_RADIUS = 0.3;
/** Continuous pointer acceleration, short-side units/s² */
const FORCE: Span = { min: 1, max: 4 };
/** Extra one-off kick on press, short-side units/s */
const TAP_IMPULSE = 0.6;
/** 1/s — how strongly blobs are dragged along with the pointer's motion */
const STIR = 2;
/** A press this close to a drop's edge still picks it up, short-side units */
const DRAG_REACH = 0.05;
/** 1/s² — a held drop follows the finger tightly but still lags a touch, like liquid */
const DRAG_STIFFNESS = 120;
const DRAG_DAMPING_RATIO = 0.9;

/** Elongation share per short-side unit/s of speed, and the most a drop stretches */
const STRETCH_PER_SPEED = 0.35;
const MAX_STRETCH = 0.7;
/** 1/s² — shape spring; underdamped so a released drop wobbles back to round */
const STRETCH_STIFFNESS = 90;
const STRETCH_DAMPING_RATIO = 0.3;
/** Move mode, pressing off a drop: drops give way until their edge is this far from the pointer */
const PUSH_CLEARANCE: Span = { min: 0.14, max: 0.24 };

/** Pointer-repel share applied along a cut so the liquid visibly parts */
const CUT_PUSH = 0.3;
// Two drops read as one body while their gap is under half the shader's smooth-union
// range (MERGE_K = 0.28); a ripple crosses only such joined drops
const MERGE_GAP = 0.14;

/** Gentle outward nudge so the touch that starts a ripple also stirs the liquid */
const RIPPLE_PUSH = 0.4;


const lerp = (span: Span, t: number) => span.min + (span.max - span.min) * t;

function wave(t: number, phase: number): number {
  const primary = Math.sin(t);
  const secondary = Math.sin(t * DRIFT_SECONDARY_FREQ + phase) * DRIFT_SECONDARY_WEIGHT;
  return (primary + secondary) / (1 + DRIFT_SECONDARY_WEIGHT);
}

export class LiquidSimulation {
  private bodies: Body[] = [];
  private cutTrail = new CutTrail();
  private rippleField = new RippleField();
  /** Connected body of liquid per blob, refreshed every step */
  private groups = new Map<Body, number>();
  private groupOf: GroupOf = (body) => this.groups.get(body as Body) ?? -1;
  /** Drop being moved by hand, and where on it the finger landed */
  private dragged: Body | null = null;
  private grabOffset = { x: 0, y: 0 };
  /** Drop just let go; it settles at its new spot instead of springing back */
  private dropped: Body | null = null;
  // Advanced by speed × dt so changing intensity never makes phases jump
  private driftClock = 0;
  /** Freezes the idle drift and pulse; touch still moves the liquid */
  reduceMotion = false;

  /** Existing bodies flow to their new home; extras fade in, missing ones shrink out. */
  setLayout(layout: Blob[]) {
    layout.forEach((blob, i) => {
      const body = this.bodies[i];
      if (body) {
        body.homeX = blob.x;
        body.homeY = blob.y;
        body.targetRadius = blob.radius;
        body.color = blob.color;
        return;
      }
      this.bodies.push({
        homeX: blob.x,
        homeY: blob.y,
        x: blob.x,
        y: blob.y,
        vx: 0,
        vy: 0,
        radius: 0,
        targetRadius: blob.radius,
        color: blob.color,
        phase: i * GOLDEN_ANGLE,
        stretchX: 0,
        stretchY: 0,
        stretchVx: 0,
        stretchVy: 0,
      });
    });

    for (let i = layout.length; i < this.bodies.length; i++) {
      this.bodies[i].targetRadius = 0;
    }
  }

  /** @param intensity 0–1 */
  step(dt: number, aspect: number, intensity: number, pointer: PointerInput, mode: InteractionMode) {
    if (dt <= 0) return;

    // Convert viewport fractions to short-side units so forces are round on any aspect
    const scaleX = Math.max(aspect, 1);
    const scaleY = Math.max(1 / aspect, 1);
    const force = lerp(FORCE, intensity);

    if (!this.reduceMotion) this.driftClock += dt * lerp(DRIFT_SPEED, intensity);
    const stiffness = lerp(STIFFNESS, intensity);
    const damping = 2 * Math.sqrt(stiffness) * lerp(DAMPING_RATIO, intensity);
    // Layout is in viewport fractions; convert so drift is the same distance on both axes
    const ampX = DRIFT_AMPLITUDE * Math.min(1, 1 / aspect);
    const ampY = DRIFT_AMPLITUDE * Math.min(1, aspect);
    const radiusBlend = 1 - Math.exp(-RADIUS_RATE * dt);
    this.updateDrag(pointer, mode === 'move', scaleX, scaleY);
    const dragDamping = 2 * Math.sqrt(DRAG_STIFFNESS) * DRAG_DAMPING_RATIO;
    const isPushing = mode === 'move' && pointer.active && !this.dragged;
    const clearance = lerp(PUSH_CLEARANCE, intensity);

    for (const body of this.bodies) {
      const t = this.driftClock + body.phase;
      const driftX = ampX * wave(t, body.phase);
      const driftY = ampY * wave(t * DRIFT_Y_FREQ, body.phase + GOLDEN_ANGLE);
      // Home moves to wherever the drop was let go, minus its drift, so it doesn't jump
      if (body === this.dropped) {
        body.homeX = body.x - driftX;
        body.homeY = body.y - driftY;
      }

      if (pointer.active && isFieldMode(mode)) applyPointer(body, pointer, mode, force, scaleX, scaleY, dt);
      this.rippleField.push(body, this.groupOf, scaleX, scaleY, dt);
      if (body === this.dragged) {
        const targetX = pointer.x - this.grabOffset.x;
        const targetY = pointer.y - this.grabOffset.y;
        body.vx += ((targetX - body.x) * DRAG_STIFFNESS - body.vx * dragDamping) * dt;
        body.vy += ((targetY - body.y) * DRAG_STIFFNESS - body.vy * dragDamping) * dt;
      } else {
        const restX = body.homeX + driftX;
        const restY = body.homeY + driftY;
        const [pushX, pushY] = isPushing
          ? pushOffset(restX, restY, body.radius, pointer, clearance, scaleX, scaleY)
          : [0, 0];
        body.vx += ((restX + pushX - body.x) * stiffness - body.vx * damping) * dt;
        body.vy += ((restY + pushY - body.y) * stiffness - body.vy * damping) * dt;
      }
      body.x += body.vx * dt;
      body.y += body.vy * dt;
      updateStretch(body, scaleX, scaleY, dt);
      body.radius += (body.targetRadius - body.radius) * radiusBlend;
    }

    this.dropped = null;
    this.bodies = this.bodies.filter((b) => b.targetRadius > 0 || b.radius > RADIUS_EPSILON);

    this.cutTrail.update(dt, pointer, mode === 'cut', intensity, scaleX, scaleY);
    this.groups = findGroups(this.bodies, scaleX, scaleY);
    this.rippleField.update(dt, pointer, mode === 'ripple', intensity, this.bodies, scaleX, scaleY);
  }


  /** Picks up the drop under a fresh press; lets it go when the press ends or the mode changes. */
  private updateDrag(pointer: PointerInput, isMoving: boolean, scaleX: number, scaleY: number) {
    if (this.dragged && (!isMoving || !pointer.active)) {
      this.dropped = this.dragged;
      this.dragged = null;
    }
    if (!isMoving || !pointer.tapped) return;

    let nearest: Body | null = null;
    let bestEdge = DRAG_REACH;
    for (const body of this.bodies) {
      const edge =
        Math.hypot((body.x - pointer.x) * scaleX, (body.y - pointer.y) * scaleY) - body.radius;
      if (edge < bestEdge) {
        bestEdge = edge;
        nearest = body;
      }
    }
    this.dragged = nearest;
    if (nearest) this.grabOffset = { x: pointer.x - nearest.x, y: pointer.y - nearest.y };
  }

  getBlobs(): Blob[] {
    return this.bodies.map((body) => ({
      x: body.x,
      y: body.y,
      radius:
        body.radius *
        (1 + RADIUS_PULSE * Math.sin(this.driftClock * RADIUS_PULSE_FREQ + body.phase)),
      color: body.color,
      group: this.groupOf(body),
      stretch: [body.stretchX, body.stretchY] as [number, number],
    }));
  }

  getCuts(): CutPoint[] {
    return this.cutTrail.getPoints();
  }

  getRipples(): Ripple[] {
    return this.rippleField.getRipples(this.groupOf);
  }


}

/** Springs the drop's shape toward an ellipse drawn out along its velocity. */
function updateStretch(body: Body, scaleX: number, scaleY: number, dt: number) {
  const vx = body.vx * scaleX;
  const vy = body.vy * scaleY;
  const speed = Math.hypot(vx, vy);
  const share = Math.min(speed * STRETCH_PER_SPEED, MAX_STRETCH);
  const targetX = speed > 0 ? (vx / speed) * share : 0;
  const targetY = speed > 0 ? (vy / speed) * share : 0;
  const damping = 2 * Math.sqrt(STRETCH_STIFFNESS) * STRETCH_DAMPING_RATIO;
  body.stretchVx += ((targetX - body.stretchX) * STRETCH_STIFFNESS - body.stretchVx * damping) * dt;
  body.stretchVy += ((targetY - body.stretchY) * STRETCH_STIFFNESS - body.stretchVy * damping) * dt;
  body.stretchX += body.stretchVx * dt;
  body.stretchY += body.stretchVy * dt;
}

/**
 * Offset (viewport fractions) that moves a drop's rest spot out of the pointer's way.
 * Measured from the rest spot, not the current position, so the shove doesn't fade
 * as the drop gives way.
 */
function pushOffset(
  restX: number,
  restY: number,
  radius: number,
  pointer: PointerInput,
  clearance: number,
  scaleX: number,
  scaleY: number,
) {
  const dx = (restX - pointer.x) * scaleX;
  const dy = (restY - pointer.y) * scaleY;
  const centre = Math.hypot(dx, dy);
  const shove = clearance + radius - centre;
  if (shove <= 0 || centre === 0) return [0, 0];
  return [((dx / centre) * shove) / scaleX, ((dy / centre) * shove) / scaleY];
}

/** Labels each blob with its connected body of liquid (flood fill over touching drops). */
function findGroups(bodies: Body[], scaleX: number, scaleY: number): Map<Body, number> {
  const groups = new Map<Body, number>();
  const touching = (a: Body, b: Body) =>
    Math.hypot((a.x - b.x) * scaleX, (a.y - b.y) * scaleY) - a.radius - b.radius < MERGE_GAP;

  let next = 0;
  for (const start of bodies) {
    if (groups.has(start)) continue;
    const queue = [start];
    groups.set(start, next);
    while (queue.length) {
      const body = queue.pop()!;
      for (const other of bodies) {
        if (groups.has(other) || !touching(body, other)) continue;
        groups.set(other, next);
        queue.push(other);
      }
    }
    next++;
  }
  return groups;
}

/** Pointer field forces; a moved drop is handled by the drag instead */
type FieldMode = Exclude<InteractionMode, 'move'>;

const isFieldMode = (mode: InteractionMode): mode is FieldMode => mode !== 'move';

function modeDirection(mode: FieldMode, nx: number, ny: number): [number, number] {
  switch (mode) {
    case 'cut':
      return [nx * CUT_PUSH, ny * CUT_PUSH];
    case 'ripple':
      return [nx * RIPPLE_PUSH, ny * RIPPLE_PUSH];
  }
}

function applyPointer(
  body: Body,
  pointer: PointerInput,
  mode: FieldMode,
  force: number,
  scaleX: number,
  scaleY: number,
  dt: number,
) {
  const dx = (body.x - pointer.x) * scaleX;
  const dy = (body.y - pointer.y) * scaleY;
  const distance = Math.hypot(dx, dy);
  const edge = Math.max(distance - body.radius, 0);
  if (edge >= INFLUENCE_RADIUS || distance === 0) return;

  const falloff = (1 - edge / INFLUENCE_RADIUS) ** 2;
  const [dirX, dirY] = modeDirection(mode, dx / distance, dy / distance);

  let dvx = dirX * force * falloff * dt;
  let dvy = dirY * force * falloff * dt;
  if (pointer.tapped) {
    dvx += dirX * TAP_IMPULSE * falloff;
    dvy += dirY * TAP_IMPULSE * falloff;
  }
  dvx += (pointer.vx - body.vx) * scaleX * STIR * falloff * dt;
  dvy += (pointer.vy - body.vy) * scaleY * STIR * falloff * dt;

  body.vx += dvx / scaleX;
  body.vy += dvy / scaleY;
}

import type { InteractionMode } from '../../shared/settings';
import { CutTrail, type CutPoint } from './cut';
import type { Blob, Rgb } from './renderer';

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
}

interface Droplet extends Body {
  age: number;
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
// Inside this distance attract eases off so the direction can't flip-flop at the center
const CORE_RADIUS = 0.08;

/** Pointer-repel share applied along a cut so the liquid visibly parts */
const CUT_PUSH = 0.3;

export const MAX_DROPLETS = 4;
/** Shader slots needed on top of the layout blobs */
export const EXTRA_BLOBS = MAX_DROPLETS;

/** Seconds between drips while the pointer hovers a blob in melt mode */
const MELT_INTERVAL = 0.35;
// Drips start just inside the bottom edge so they peel off with a neck
const MELT_SPAWN_DEPTH = 0.85;
const MELT_SPAWN_JITTER = 0.5;
/** Drip size relative to its source blob */
const MELT_DROP_SCALE: Span = { min: 0.25, max: 0.4 };
/** Short-side units/s² */
const MELT_GRAVITY = 0.8;
/** 1/s — viscous drag so drips ooze rather than free-fall */
const MELT_DRAG = 1.5;
const MELT_LIFETIME = 2.5;

const lerp = (span: Span, t: number) => span.min + (span.max - span.min) * t;

function wave(t: number, phase: number): number {
  const primary = Math.sin(t);
  const secondary = Math.sin(t * DRIFT_SECONDARY_FREQ + phase) * DRIFT_SECONDARY_WEIGHT;
  return (primary + secondary) / (1 + DRIFT_SECONDARY_WEIGHT);
}

export class LiquidSimulation {
  private bodies: Body[] = [];
  private droplets: Droplet[] = [];
  private meltCooldown = 0;
  private dropCount = 0;
  private cutTrail = new CutTrail();
  // Advanced by speed × dt so changing intensity never makes phases jump
  private driftClock = 0;

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

    this.driftClock += dt * lerp(DRIFT_SPEED, intensity);
    const stiffness = lerp(STIFFNESS, intensity);
    const damping = 2 * Math.sqrt(stiffness) * lerp(DAMPING_RATIO, intensity);
    // Layout is in viewport fractions; convert so drift is the same distance on both axes
    const ampX = DRIFT_AMPLITUDE * Math.min(1, 1 / aspect);
    const ampY = DRIFT_AMPLITUDE * Math.min(1, aspect);
    const radiusBlend = 1 - Math.exp(-RADIUS_RATE * dt);

    for (const body of this.bodies) {
      const t = this.driftClock + body.phase;
      const targetX = body.homeX + ampX * wave(t, body.phase);
      const targetY = body.homeY + ampY * wave(t * DRIFT_Y_FREQ, body.phase + GOLDEN_ANGLE);

      if (pointer.active) applyPointer(body, pointer, mode, force, scaleX, scaleY, dt);
      body.vx += ((targetX - body.x) * stiffness - body.vx * damping) * dt;
      body.vy += ((targetY - body.y) * stiffness - body.vy * damping) * dt;
      body.x += body.vx * dt;
      body.y += body.vy * dt;
      body.radius += (body.targetRadius - body.radius) * radiusBlend;
    }

    this.bodies = this.bodies.filter((b) => b.targetRadius > 0 || b.radius > RADIUS_EPSILON);

    if (mode === 'melt') this.shedDrips(dt, pointer, intensity, scaleX, scaleY);
    this.stepDrips(dt, radiusBlend, scaleY);
    this.cutTrail.update(dt, pointer, mode === 'cut', intensity, scaleX, scaleY);
  }

  // Peels a drip off the bottom of the blob under the pointer
  private shedDrips(
    dt: number,
    pointer: PointerInput,
    intensity: number,
    scaleX: number,
    scaleY: number,
  ) {
    this.meltCooldown -= dt;
    if (pointer.tapped) this.meltCooldown = 0;
    if (!pointer.active || this.meltCooldown > 0 || this.droplets.length >= MAX_DROPLETS) return;

    const source = this.nearestBody(pointer.x, pointer.y, scaleX, scaleY);
    if (!source) return;
    const edge =
      Math.hypot((source.x - pointer.x) * scaleX, (source.y - pointer.y) * scaleY) - source.radius;
    if (edge > INFLUENCE_RADIUS) return;

    const jitter = Math.sin(this.dropCount * GOLDEN_ANGLE) * source.radius * MELT_SPAWN_JITTER;
    this.droplets.push({
      homeX: 0,
      homeY: 0,
      x: source.x + jitter / scaleX,
      y: source.y + (source.radius * MELT_SPAWN_DEPTH) / scaleY,
      vx: source.vx,
      vy: source.vy,
      radius: 0,
      targetRadius: source.radius * lerp(MELT_DROP_SCALE, intensity),
      color: source.color,
      phase: 0,
      age: 0,
    });
    this.dropCount++;
    this.meltCooldown = MELT_INTERVAL;
  }

  // Drips fall under gravity and taper away; anything below the screen is dropped
  private stepDrips(dt: number, radiusBlend: number, scaleY: number) {
    for (const drop of this.droplets) {
      drop.age += dt;
      drop.vy += (MELT_GRAVITY / scaleY - drop.vy * MELT_DRAG) * dt;
      drop.vx -= drop.vx * MELT_DRAG * dt;
      drop.x += drop.vx * dt;
      drop.y += drop.vy * dt;
      if (drop.age > MELT_LIFETIME) drop.targetRadius = 0;
      drop.radius += (drop.targetRadius - drop.radius) * radiusBlend;
    }
    this.droplets = this.droplets.filter(
      (d) => (d.targetRadius > 0 || d.radius > RADIUS_EPSILON) && d.y - d.radius / scaleY < 1,
    );
  }

  private nearestBody(x: number, y: number, scaleX: number, scaleY: number): Body | undefined {
    let nearest: Body | undefined;
    let best = Infinity;
    for (const body of this.bodies) {
      if (body.targetRadius <= 0) continue;
      const distance = Math.hypot((body.x - x) * scaleX, (body.y - y) * scaleY) - body.radius;
      if (distance < best) {
        best = distance;
        nearest = body;
      }
    }
    return nearest;
  }

  getBlobs(): Blob[] {
    const bodies = this.bodies.map((body) => ({
      x: body.x,
      y: body.y,
      radius:
        body.radius *
        (1 + RADIUS_PULSE * Math.sin(this.driftClock * RADIUS_PULSE_FREQ + body.phase)),
      color: body.color,
    }));
    const droplets = this.droplets.map(({ x, y, radius, color }) => ({ x, y, radius, color }));
    return [...bodies, ...droplets];
  }

  getCuts(): CutPoint[] {
    return this.cutTrail.getPoints();
  }
}

function modeDirection(mode: InteractionMode, nx: number, ny: number): [number, number] {
  switch (mode) {
    case 'attract':
      return [-nx, -ny];
    case 'repel':
      return [nx, ny];
    case 'cut':
      return [nx * CUT_PUSH, ny * CUT_PUSH];
    case 'melt':
      // Short-side space has y pointing down the screen, so this is gravity
      return [0, 1];
  }
}

function applyPointer(
  body: Body,
  pointer: PointerInput,
  mode: InteractionMode,
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
  const core = mode === 'attract' ? Math.min(distance / CORE_RADIUS, 1) : 1;
  const [dirX, dirY] = modeDirection(mode, dx / distance, dy / distance);

  let dvx = dirX * force * falloff * core * dt;
  let dvy = dirY * force * falloff * core * dt;
  if (pointer.tapped) {
    dvx += dirX * TAP_IMPULSE * falloff;
    dvy += dirY * TAP_IMPULSE * falloff;
  }
  dvx += (pointer.vx - body.vx) * scaleX * STIR * falloff * dt;
  dvy += (pointer.vy - body.vy) * scaleY * STIR * falloff * dt;

  body.vx += dvx / scaleX;
  body.vy += dvy / scaleY;
}

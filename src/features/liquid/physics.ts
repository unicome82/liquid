import type { InteractionMode } from '../../shared/settings';
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
// Inside this distance attract/swirl ease off so the direction can't flip-flop at the center
const CORE_RADIUS = 0.08;

export const MAX_DROPLETS = 4;
const DRIP_INTERVAL = 0.1;
/** Short-side units/s the pointer must move before droplets shed */
const DRIP_MIN_SPEED = 0.3;
const DRIP_FULL_SPEED = 2;
const DROPLET_RADIUS: Span = { min: 0.025, max: 0.05 };
/** Share of the pointer's velocity a droplet inherits when flung off */
const DROPLET_FLING = 0.6;
// Weaker than body springs so droplets ooze back rather than snap
const DROPLET_RETURN_STIFFNESS = 2;
const DROPLET_LIFETIME = 3;
// Droplets usually spawn over liquid; without a grace period they'd be absorbed instantly
const DROPLET_MIN_AGE = 0.6;

const lerp = (span: Span, t: number) => span.min + (span.max - span.min) * t;

function wave(t: number, phase: number): number {
  const primary = Math.sin(t);
  const secondary = Math.sin(t * DRIFT_SECONDARY_FREQ + phase) * DRIFT_SECONDARY_WEIGHT;
  return (primary + secondary) / (1 + DRIFT_SECONDARY_WEIGHT);
}

export class LiquidSimulation {
  private bodies: Body[] = [];
  private droplets: Droplet[] = [];
  private dripCooldown = 0;
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

    if (mode === 'drip') this.shedDroplets(dt, pointer, scaleX, scaleY);
    this.stepDroplets(dt, radiusBlend, damping, scaleX, scaleY);
  }

  private shedDroplets(dt: number, pointer: PointerInput, scaleX: number, scaleY: number) {
    this.dripCooldown -= dt;
    if (!pointer.active || this.dripCooldown > 0 || this.droplets.length >= MAX_DROPLETS) return;

    const speed = Math.hypot(pointer.vx * scaleX, pointer.vy * scaleY);
    if (!pointer.tapped && speed < DRIP_MIN_SPEED) return;

    const source = this.nearestBody(pointer.x, pointer.y, scaleX, scaleY);
    if (!source) return;

    const speedRatio = Math.min(speed / DRIP_FULL_SPEED, 1);
    this.droplets.push({
      homeX: pointer.x,
      homeY: pointer.y,
      x: pointer.x,
      y: pointer.y,
      vx: pointer.vx * DROPLET_FLING,
      vy: pointer.vy * DROPLET_FLING,
      radius: 0,
      targetRadius: lerp(DROPLET_RADIUS, speedRatio),
      color: source.color,
      phase: 0,
      age: 0,
    });
    this.dripCooldown = DRIP_INTERVAL;
  }

  // Droplets ooze back to the nearest blob and shrink away once absorbed
  private stepDroplets(dt: number, radiusBlend: number, damping: number, scaleX: number, scaleY: number) {
    for (const drop of this.droplets) {
      drop.age += dt;
      const host = this.nearestBody(drop.x, drop.y, scaleX, scaleY);
      if (host) {
        drop.vx += ((host.x - drop.x) * DROPLET_RETURN_STIFFNESS - drop.vx * damping) * dt;
        drop.vy += ((host.y - drop.y) * DROPLET_RETURN_STIFFNESS - drop.vy * damping) * dt;
        const distance = Math.hypot((host.x - drop.x) * scaleX, (host.y - drop.y) * scaleY);
        if (drop.age > DROPLET_MIN_AGE && distance < host.radius) drop.targetRadius = 0;
      }
      if (drop.age > DROPLET_LIFETIME) drop.targetRadius = 0;

      drop.x += drop.vx * dt;
      drop.y += drop.vy * dt;
      drop.radius += (drop.targetRadius - drop.radius) * radiusBlend;
    }
    this.droplets = this.droplets.filter((d) => d.targetRadius > 0 || d.radius > RADIUS_EPSILON);
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
}

function modeDirection(mode: InteractionMode, nx: number, ny: number): [number, number] {
  switch (mode) {
    case 'attract':
      return [-nx, -ny];
    case 'repel':
      return [nx, ny];
    case 'swirl':
      return [-ny, nx];
    case 'drip':
      // Drip only stirs and sheds droplets; no radial force
      return [0, 0];
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
  const core = mode === 'repel' ? 1 : Math.min(distance / CORE_RADIUS, 1);
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

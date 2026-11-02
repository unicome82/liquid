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
  /** The blob's own colour, which it drifts back to after being mixed */
  baseColor: Rgb;
  phase: number;
}

export interface Swirl {
  /** 0–1 across the viewport */
  x: number;
  y: number;
  /** Twist at the centre, radians; positive turns the colours clockwise on screen */
  angle: number;
  /** Short-side units */
  radius: number;
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
// Inside this distance attract/mix ease off so the direction can't flip-flop at the center
const CORE_RADIUS = 0.08;

/** Pointer-repel share applied along a cut so the liquid visibly parts */
const CUT_PUSH = 0.3;

/** 1/s — how fast colours under the pointer blend toward their shared average */
const MIX_RATE = 1.5;
/** 1/s — mixed colours drift back slowly so the marbling lingers */
const COLOR_RECOVER_RATE = 0.08;
/** Reach of the colour twist, short-side units */
const SWIRL_RADIUS = 0.35;
/** Radians of twist per short-side unit the pointer travels */
const SWIRL_GAIN: Span = { min: 2, max: 6 };
const SWIRL_MAX_ANGLE = 12;
/** 1/s */
const SWIRL_DECAY = 0.5;
// Below this the stroke is effectively straight, so keep the previous twist direction
const TURN_EPSILON = 1e-4;

const lerp = (span: Span, t: number) => span.min + (span.max - span.min) * t;

function wave(t: number, phase: number): number {
  const primary = Math.sin(t);
  const secondary = Math.sin(t * DRIFT_SECONDARY_FREQ + phase) * DRIFT_SECONDARY_WEIGHT;
  return (primary + secondary) / (1 + DRIFT_SECONDARY_WEIGHT);
}

export class LiquidSimulation {
  private bodies: Body[] = [];
  private cutTrail = new CutTrail();
  private swirl: Swirl = { x: 0.5, y: 0.5, angle: 0, radius: SWIRL_RADIUS };
  private turnSign = 1;
  private lastVx = 0;
  private lastVy = 0;
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
        body.baseColor = blob.color;
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
        baseColor: blob.color,
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

    this.cutTrail.update(dt, pointer, mode === 'cut', intensity, scaleX, scaleY);
    const isMixing = mode === 'mix' && pointer.active;
    this.mixColors(dt, pointer, isMixing, scaleX, scaleY);
    this.updateSwirl(dt, pointer, isMixing, intensity, scaleX, scaleY);
  }

  // Blends the colours of blobs being stirred; every blob slowly un-mixes back to its own hue
  private mixColors(
    dt: number,
    pointer: PointerInput,
    isMixing: boolean,
    scaleX: number,
    scaleY: number,
  ) {
    const weights = this.bodies.map((body) =>
      isMixing ? pointerFalloff(body, pointer, scaleX, scaleY) : 0,
    );
    const total = weights.reduce((sum, w) => sum + w, 0);
    const average: Rgb = [0, 0, 0];
    if (total > 0) {
      this.bodies.forEach((body, i) => {
        body.color.forEach((c, ch) => (average[ch] += (c * weights[i]) / total));
      });
    }

    const recover = 1 - Math.exp(-COLOR_RECOVER_RATE * dt);
    this.bodies.forEach((body, i) => {
      const mix = total > 0 ? 1 - Math.exp(-MIX_RATE * weights[i] * dt) : 0;
      body.color = body.color.map((c, ch) => {
        const mixed = c + (average[ch] - c) * mix;
        return mixed + (body.baseColor[ch] - mixed) * recover;
      }) as Rgb;
    });
  }

  // The stroke's turning direction decides which way the colours twist
  private updateSwirl(
    dt: number,
    pointer: PointerInput,
    isMixing: boolean,
    intensity: number,
    scaleX: number,
    scaleY: number,
  ) {
    this.swirl.angle *= Math.exp(-SWIRL_DECAY * dt);
    if (!isMixing) return;

    const vx = pointer.vx * scaleX;
    const vy = pointer.vy * scaleY;
    const turn = this.lastVx * vy - this.lastVy * vx;
    if (Math.abs(turn) > TURN_EPSILON) this.turnSign = Math.sign(turn);
    this.lastVx = vx;
    this.lastVy = vy;

    this.swirl.x = pointer.x;
    this.swirl.y = pointer.y;
    const angle =
      this.swirl.angle + this.turnSign * Math.hypot(vx, vy) * lerp(SWIRL_GAIN, intensity) * dt;
    this.swirl.angle = Math.max(-SWIRL_MAX_ANGLE, Math.min(SWIRL_MAX_ANGLE, angle));
  }

  getBlobs(): Blob[] {
    return this.bodies.map((body) => ({
      x: body.x,
      y: body.y,
      radius:
        body.radius *
        (1 + RADIUS_PULSE * Math.sin(this.driftClock * RADIUS_PULSE_FREQ + body.phase)),
      color: body.color,
    }));
  }

  getCuts(): CutPoint[] {
    return this.cutTrail.getPoints();
  }

  getSwirl(): Swirl {
    return { ...this.swirl };
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
    case 'mix':
      return [-ny, nx];
  }
}

/** 0–1 weight of the pointer's influence on a blob, measured from the blob's edge */
function pointerFalloff(body: Body, pointer: PointerInput, scaleX: number, scaleY: number): number {
  const distance = Math.hypot((body.x - pointer.x) * scaleX, (body.y - pointer.y) * scaleY);
  const edge = Math.max(distance - body.radius, 0);
  return edge >= INFLUENCE_RADIUS ? 0 : (1 - edge / INFLUENCE_RADIUS) ** 2;
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
  const core = mode === 'attract' || mode === 'mix' ? Math.min(distance / CORE_RADIUS, 1) : 1;
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

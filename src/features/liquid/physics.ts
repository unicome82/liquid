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

const lerp = (span: Span, t: number) => span.min + (span.max - span.min) * t;

function wave(t: number, phase: number): number {
  const primary = Math.sin(t);
  const secondary = Math.sin(t * DRIFT_SECONDARY_FREQ + phase) * DRIFT_SECONDARY_WEIGHT;
  return (primary + secondary) / (1 + DRIFT_SECONDARY_WEIGHT);
}

export class LiquidSimulation {
  private bodies: Body[] = [];
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
  step(dt: number, aspect: number, intensity: number) {
    if (dt <= 0) return;

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

      body.vx += ((targetX - body.x) * stiffness - body.vx * damping) * dt;
      body.vy += ((targetY - body.y) * stiffness - body.vy * damping) * dt;
      body.x += body.vx * dt;
      body.y += body.vy * dt;
      body.radius += (body.targetRadius - body.radius) * radiusBlend;
    }

    this.bodies = this.bodies.filter((b) => b.targetRadius > 0 || b.radius > RADIUS_EPSILON);
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
}

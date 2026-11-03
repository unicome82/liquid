import type { PointerInput } from './physics';

export interface Ripple {
  /** 0–1 across the viewport */
  x: number;
  y: number;
  /** Ring radius, short-side units */
  radius: number;
  /** Wave height on the liquid surface, in the shader's height units */
  amplitude: number;
}

interface Span {
  min: number;
  max: number;
}

interface LiveRipple {
  x: number;
  y: number;
  age: number;
  speed: number;
  amplitude: number;
}

/** Fixed shader array size; the oldest ring is dropped beyond this */
export const MAX_RIPPLES = 6;
/** Seconds until a ring has fully faded */
const LIFETIME = 2.4;
/** Ring growth, short-side units/s; low intensity is thick liquid with slower waves */
const SPEED: Span = { min: 0.35, max: 0.6 };
const AMPLITUDE: Span = { min: 0.008, max: 0.016 };
// While dragging, a new ring every this much travel or time, whichever comes first
const SPAWN_SPACING = 0.12;
const SPAWN_INTERVAL = 0.6;

const lerp = (span: Span, t: number) => span.min + (span.max - span.min) * t;

/** Rings that spread from where the liquid is touched and fade as they travel. */
export class RippleField {
  private ripples: LiveRipple[] = [];
  private lastSpawn = { x: 0, y: 0, time: 0 };
  private clock = 0;

  update(
    dt: number,
    pointer: PointerInput,
    isRippling: boolean,
    intensity: number,
    scaleX: number,
    scaleY: number,
  ) {
    this.clock += dt;
    for (const ripple of this.ripples) ripple.age += dt;
    this.ripples = this.ripples.filter((ripple) => ripple.age < LIFETIME);
    if (!isRippling || !pointer.active) return;

    const travel = Math.hypot(
      (pointer.x - this.lastSpawn.x) * scaleX,
      (pointer.y - this.lastSpawn.y) * scaleY,
    );
    const waited = this.clock - this.lastSpawn.time;
    if (pointer.tapped || travel >= SPAWN_SPACING || waited >= SPAWN_INTERVAL) {
      this.spawn(pointer, intensity);
    }
  }

  getRipples(): Ripple[] {
    // Ease-out fade so a ring is strongest right after the touch, then dies away softly
    return this.ripples.map(({ x, y, age, speed, amplitude }) => ({
      x,
      y,
      radius: age * speed,
      amplitude: amplitude * (1 - age / LIFETIME) ** 2,
    }));
  }

  private spawn(pointer: PointerInput, intensity: number) {
    this.ripples.push({
      x: pointer.x,
      y: pointer.y,
      age: 0,
      speed: lerp(SPEED, intensity),
      amplitude: lerp(AMPLITUDE, intensity),
    });
    if (this.ripples.length > MAX_RIPPLES) this.ripples.shift();
    this.lastSpawn = { x: pointer.x, y: pointer.y, time: this.clock };
  }
}

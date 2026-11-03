import type { PointerInput } from './physics';

export interface Ripple {
  /** 0–1 across the viewport */
  x: number;
  y: number;
  /** Ring radius, short-side units */
  radius: number;
  /** Wave height on the liquid surface, in the shader's height units */
  amplitude: number;
  /** Connected body of liquid the ring travels through; other drops stay still */
  group: number;
}

interface Span {
  min: number;
  max: number;
}

/** What a ring needs to shove a blob as it rolls past */
export interface Floater {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

/** Which connected body of liquid a blob belongs to this frame */
export type GroupOf = (body: Floater) => number;

interface LiveRipple {
  /** Blob the ring started in; its body of liquid is the only one the wave reaches */
  source: Floater;
  x: number;
  y: number;
  age: number;
  speed: number;
  amplitude: number;
}

/** Fixed shader array size; the oldest ring is dropped beyond this */
export const MAX_RIPPLES = 6;
/** Seconds until a ring has fully faded */
const LIFETIME = 3.2;
/** Ring growth, short-side units/s; low intensity is thick liquid with slower waves */
const SPEED: Span = { min: 0.2, max: 0.35 };
const AMPLITUDE: Span = { min: 0.006, max: 0.011 };
/** Short-side units/s² a full-strength ring pushes a blob outward as it passes */
const RING_PUSH = 0.8;
// While dragging, a new ring every this much travel or time, whichever comes first
const SPAWN_SPACING = 0.2;
const SPAWN_INTERVAL = 1;
/** A press this close to a drop's edge still starts a ring in it, short-side units */
const TOUCH_REACH = 0.1;

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
    bodies: Floater[],
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
      // Recorded even with no drop under the press so a drag keeps its spacing
      this.lastSpawn = { x: pointer.x, y: pointer.y, time: this.clock };
      const source = touchedBody(pointer, bodies, scaleX, scaleY);
      if (source) this.spawn(pointer, source, intensity);
    }
  }

  getRipples(groupOf: GroupOf): Ripple[] {
    // Ease-out fade so a ring is strongest right after the touch, then dies away softly
    return this.ripples.map(({ source, x, y, age, speed, amplitude }) => ({
      x,
      y,
      radius: age * speed,
      amplitude: amplitude * (1 - age / LIFETIME) ** 2,
      group: groupOf(source),
    }));
  }

  /** Rolls the blob outward while a ring's crest sweeps across it, so it bobs on the wave. */
  push(body: Floater, groupOf: GroupOf, scaleX: number, scaleY: number, dt: number) {
    const group = groupOf(body);
    for (const ripple of this.getRipples(groupOf)) {
      if (ripple.group < 0 || ripple.group !== group) continue;
      const dx = (body.x - ripple.x) * scaleX;
      const dy = (body.y - ripple.y) * scaleY;
      const distance = Math.hypot(dx, dy);
      if (distance === 0) continue;
      const offset = (distance - ripple.radius) / body.radius;
      const strength = RING_PUSH * (ripple.amplitude / AMPLITUDE.max) * Math.exp(-offset * offset);
      body.vx += ((dx / distance) * strength * dt) / scaleX;
      body.vy += ((dy / distance) * strength * dt) / scaleY;
    }
  }

  private spawn(pointer: PointerInput, source: Floater, intensity: number) {
    this.ripples.push({
      source,
      x: pointer.x,
      y: pointer.y,
      age: 0,
      speed: lerp(SPEED, intensity),
      amplitude: lerp(AMPLITUDE, intensity),
    });
    if (this.ripples.length > MAX_RIPPLES) this.ripples.shift();
  }
}

/** Drop under the press, or the nearest one whose edge is within reach */
function touchedBody(pointer: PointerInput, bodies: Floater[], scaleX: number, scaleY: number) {
  let nearest: Floater | null = null;
  let bestEdge = TOUCH_REACH;
  for (const body of bodies) {
    const edge = Math.hypot((body.x - pointer.x) * scaleX, (body.y - pointer.y) * scaleY) - body.radius;
    if (edge < bestEdge) {
      bestEdge = edge;
      nearest = body;
    }
  }
  return nearest;
}

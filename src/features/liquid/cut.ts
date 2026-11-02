import type { PointerInput } from './physics';

export interface CutPoint {
  /** 0–1 across the viewport */
  x: number;
  y: number;
  /** Half-width of the carved groove, in short-side units */
  width: number;
}

interface TrailPoint extends CutPoint {
  age: number;
}

interface Span {
  min: number;
  max: number;
}

/** Fixed shader array size; the oldest point is dropped beyond this */
export const CUT_POINTS = 12;
/** Short-side units the pointer must travel before a new point is laid */
const SPACING = 0.04;
// A larger jump means a new stroke (e.g. a second finger); don't bridge it with a groove
const MAX_JUMP = 0.3;
/** Seconds until the groove has fully closed up */
const LIFETIME = 0.9;
const WIDTH: Span = { min: 0.012, max: 0.04 };
const WIDTH_INTENSITY: Span = { min: 0.6, max: 1.4 };
const FULL_SPEED = 2;

const lerp = (span: Span, t: number) => span.min + (span.max - span.min) * t;

/** Records the pointer's path as a tapering groove that heals over time. */
export class CutTrail {
  private points: TrailPoint[] = [];

  update(
    dt: number,
    pointer: PointerInput,
    isCutting: boolean,
    intensity: number,
    scaleX: number,
    scaleY: number,
  ) {
    for (const point of this.points) point.age += dt;
    this.points = this.points.filter((point) => point.age < LIFETIME);
    if (!isCutting || !pointer.active) return;
    if (pointer.tapped) this.points = [];

    const last = this.points[this.points.length - 1];
    const distance = last
      ? Math.hypot((pointer.x - last.x) * scaleX, (pointer.y - last.y) * scaleY)
      : Infinity;
    if (distance < SPACING) return;
    if (last && distance > MAX_JUMP) this.points = [];

    const speed = Math.hypot(pointer.vx * scaleX, pointer.vy * scaleY);
    const width =
      lerp(WIDTH, Math.min(speed / FULL_SPEED, 1)) * lerp(WIDTH_INTENSITY, intensity);
    this.points.push({ x: pointer.x, y: pointer.y, width, age: 0 });
    if (this.points.length > CUT_POINTS) this.points.shift();
  }

  getPoints(): CutPoint[] {
    return this.points.map(({ x, y, width, age }) => ({ x, y, width: width * (1 - age / LIFETIME) }));
  }
}

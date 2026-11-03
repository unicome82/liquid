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

export interface Span {
  min: number;
  max: number;
}

/** Recorded points; the oldest is dropped beyond this */
const TRAIL_POINTS = 12;
/** Curve samples per recorded segment; smooths the polyline's corners away */
const SUBDIVISIONS = 2;
/** Fixed shader array size: recorded points plus the live tip, after subdivision */
export const CUT_POINTS = TRAIL_POINTS * SUBDIVISIONS + 1;
/** Short-side units the pointer must travel before a new point is laid */
const SPACING = 0.04;
// A larger jump means a new stroke (e.g. a second finger); don't bridge it with a groove
const MAX_JUMP = 0.3;
export interface TrailOptions {
  /** Seconds until a point has fully healed */
  lifetime: number;
  /** Half-width from fast (min) to slow (max) strokes, short-side units */
  width: Span;
}

export const CUT_TRAIL: TrailOptions = {
  lifetime: 0.9,
  // Wider than the visible groove: the rounded lips (CUT_SMOOTH in the shader) eat into it
  width: { min: 0.02, max: 0.06 },
};
const WIDTH_INTENSITY: Span = { min: 0.6, max: 1.4 };
const FULL_SPEED = 2;

const lerp = (span: Span, t: number) => span.min + (span.max - span.min) * t;

/** Wide when the pointer moves slowly, thin when it moves fast */
export function strokeWidth(width: Span, pointer: PointerInput, scaleX: number, scaleY: number) {
  const speed = Math.hypot(pointer.vx * scaleX, pointer.vy * scaleY);
  return lerp(width, 1 - Math.min(speed / FULL_SPEED, 1));
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

// Catmull-Rom: passes through p1 and p2 with tangents from their neighbours
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3)
  );
}

/** Averages each width with its neighbours so speed changes don't leave bulges. */
function smoothWidths(points: CutPoint[]): CutPoint[] {
  return points.map((point, i) => {
    const prev = points[i - 1] ?? point;
    const next = points[i + 1] ?? point;
    return { ...point, width: (prev.width + point.width * 2 + next.width) / 4 };
  });
}

function subdivide(points: CutPoint[]): CutPoint[] {
  if (points.length < 2) return points;
  const out: CutPoint[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    for (let k = 0; k < SUBDIVISIONS; k++) {
      const t = k / SUBDIVISIONS;
      out.push({
        x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
        y: catmullRom(p0.y, p1.y, p2.y, p3.y, t),
        width: mix(p1.width, p2.width, t),
      });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Records the pointer's path as a tapering trail that heals over time. */
export class CutTrail {
  private points: TrailPoint[] = [];

  constructor(private options: TrailOptions = CUT_TRAIL) {}
  /** Follows the pointer between recorded points so the groove grows smoothly, not in steps */
  private tip: CutPoint | null = null;

  update(
    dt: number,
    pointer: PointerInput,
    isCutting: boolean,
    intensity: number,
    scaleX: number,
    scaleY: number,
  ) {
    for (const point of this.points) point.age += dt;
    this.points = this.points.filter((point) => point.age < this.options.lifetime);
    if (!isCutting || !pointer.active) {
      // Keep where the stroke actually ended instead of snapping back to the last point
      if (this.tip) this.record(this.tip);
      this.tip = null;
      return;
    }
    if (pointer.tapped) this.points = [];

    // Slow strokes press in wide, quick flicks leave a thin line, like a brush
    const width =
      strokeWidth(this.options.width, pointer, scaleX, scaleY) * lerp(WIDTH_INTENSITY, intensity);
    this.tip = { x: pointer.x, y: pointer.y, width };

    const last = this.points[this.points.length - 1];
    const distance = last
      ? Math.hypot((pointer.x - last.x) * scaleX, (pointer.y - last.y) * scaleY)
      : Infinity;
    if (distance < SPACING) return;
    if (last && distance > MAX_JUMP) this.points = [];
    this.record(this.tip);
  }

  private record(point: CutPoint) {
    this.points.push({ ...point, age: 0 });
    if (this.points.length > TRAIL_POINTS) this.points.shift();
  }

  getPoints(): CutPoint[] {
    // Ease-out: the groove closes quickly at first, then oozes shut
    const points: CutPoint[] = this.points.map(({ x, y, width, age }) => ({
      x,
      y,
      width: width * (1 - age / this.options.lifetime) ** 2,
    }));
    if (this.tip) points.push(this.tip);
    return subdivide(smoothWidths(points));
  }
}

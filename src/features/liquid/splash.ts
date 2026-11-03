import type { PointerInput } from './physics';
import type { Rgb } from './renderer';

/** The parts of a liquid body a splash needs to break off from and return to */
export interface Pool {
  x: number;
  y: number;
  radius: number;
  color: Rgb;
}

export interface SplashBlob {
  /** 0–1 across the viewport */
  x: number;
  y: number;
  /** Short-side units */
  radius: number;
  color: Rgb;
  /** Smooth-union range: the liquid's own near the host, tight once flung apart */
  merge: number;
  /** Body it broke off from; its colour and liquid group are the droplet's too */
  host: Pool;
}

/** A punched opening in a body where it was tapped; closes as the droplets come home */
export interface SplashHole {
  /** 0–1 across the viewport */
  x: number;
  y: number;
  /** Short-side units */
  radius: number;
}

interface Hole extends SplashHole {
  host: Pool;
  /** Tap point relative to the host centre, so the opening rides along with it */
  offsetX: number;
  offsetY: number;
  targetRadius: number;
  age: number;
}

interface Span {
  min: number;
  max: number;
}

interface Droplet extends SplashBlob {
  vx: number;
  vy: number;
  targetRadius: number;
  /** Seconds since it broke off */
  age: number;
  absorbed: boolean;
}

/** Fixed shader slots on top of the layout blobs; the oldest droplet is dropped beyond this */
export const MAX_SPLASH_DROPLETS = 10;
/** Openings punched at once; the oldest closes instantly beyond this */
export const MAX_SPLASH_HOLES = 3;
/** Droplets per tap; high intensity shatters into more */
const COUNT: Span = { min: 7, max: 10 };
/** Short-side units */
const DROPLET_RADIUS: Span = { min: 0.026, max: 0.045 };
/** How far past the host's edge a droplet lands, short-side units; high intensity flings further */
const FLING_DISTANCE: Span = { min: 0.18, max: 0.34 };
/** Random spread of each droplet's reach and size, as a share of it */
const JITTER = 0.4;
/** Most of a body's area one tap may fling out, so small bodies don't vanish */
const MAX_AREA_SHARE = 0.5;
/** 1/s — air drag; high so the launch is a sharp burst that settles quickly */
const FLIGHT_DRAG = 4.5;
/** Hole radius as a share of the host's; high intensity tears a wider one */
const HOLE_SHARE: Span = { min: 0.4, max: 0.6 };
/** 1/s — the hole tears open almost at once, then knits back slowly */
const HOLE_OPEN_RATE = 25;
const HOLE_CLOSE_RATE = 1.6;
/** Seconds a droplet floats free before it starts heading home */
const REST_TIME = 0.8;
/** Seconds over which the pull home eases in, so it doesn't snap back */
const PULL_EASE_TIME = 1.2;
/** 1/s² — pull back to the host once resting */
const PULL_STIFFNESS = 1.4;
// Critically damped so it creeps back without overshooting into the body
const PULL_DAMPING_RATIO = 1;
/** 1/s — how fast a droplet swells out of the body, and sinks away once home */
const GROW_RATE = 10;
const SINK_RATE = 3;
/** Back home once its centre is this far inside the host, as a share of the host radius */
const ABSORB_DEPTH = 0.6;
/** A press this close to a body's edge still splashes it, short-side units */
const TOUCH_REACH = 0.02;
// Joined to the host while near it so it pulls out and back in like a neck;
// tight once apart so neighbouring droplets read as separate beads
const MERGE_APART = 0.04;
const MERGE_JOINED = 0.28;
/** Edge gap over which the merge range closes, short-side units */
const MERGE_APPROACH = 0.1;
const RADIUS_EPSILON = 1e-3;

const lerp = (span: Span, t: number) => span.min + (span.max - span.min) * t;

/** Tapping a body breaks it into small droplets that fly out, rest, and flow back in. */
export class SplashField {
  private droplets: Droplet[] = [];
  private holes: Hole[] = [];

  update(
    dt: number,
    pointer: PointerInput,
    isSplashing: boolean,
    intensity: number,
    bodies: Pool[],
    scaleX: number,
    scaleY: number,
  ) {
    if (isSplashing && pointer.tapped) {
      const host = touchedBody(pointer, bodies, scaleX, scaleY);
      if (host) this.burst(pointer, host, intensity, scaleX, scaleY);
    }

    const damping = 2 * Math.sqrt(PULL_STIFFNESS) * PULL_DAMPING_RATIO;
    const drag = Math.exp(-FLIGHT_DRAG * dt);
    for (const drop of this.droplets) {
      drop.age += dt;
      const { host } = drop;
      // Host shrank out (amount lowered): just fade where it is
      if (!bodies.includes(host)) drop.targetRadius = 0;

      const homing = smoothstep((drop.age - REST_TIME) / PULL_EASE_TIME);
      drop.vx = drop.vx * drag + ((host.x - drop.x) * PULL_STIFFNESS - drop.vx * damping) * homing * dt;
      drop.vy = drop.vy * drag + ((host.y - drop.y) * PULL_STIFFNESS - drop.vy * damping) * homing * dt;
      drop.x += drop.vx * dt;
      drop.y += drop.vy * dt;

      const depth = Math.hypot((host.x - drop.x) * scaleX, (host.y - drop.y) * scaleY);
      const gap = Math.max(depth - host.radius - drop.radius, 0);
      // Kept apart on the way out so the burst reads as separate beads, not stretched necks
      const joined = MERGE_APART + (MERGE_JOINED - MERGE_APART) * homing;
      drop.merge = joined + (MERGE_APART - joined) * Math.min(gap / MERGE_APPROACH, 1);
      if (!drop.absorbed && drop.age > REST_TIME && depth < host.radius * ABSORB_DEPTH) {
        drop.absorbed = true;
        drop.targetRadius = 0;
      }
      const rate = drop.targetRadius > drop.radius ? GROW_RATE : SINK_RATE;
      drop.radius += (drop.targetRadius - drop.radius) * (1 - Math.exp(-rate * dt));
    }
    this.droplets = this.droplets.filter((d) => d.targetRadius > 0 || d.radius > RADIUS_EPSILON);
    this.updateHoles(dt, bodies);
  }

  getHoles(): SplashHole[] {
    return this.holes.map(({ x, y, radius }) => ({ x, y, radius }));
  }

  private updateHoles(dt: number, bodies: Pool[]) {
    for (const hole of this.holes) {
      hole.age += dt;
      if (hole.age > REST_TIME || !bodies.includes(hole.host)) hole.targetRadius = 0;
      hole.x = hole.host.x + hole.offsetX;
      hole.y = hole.host.y + hole.offsetY;
      const rate = hole.targetRadius > hole.radius ? HOLE_OPEN_RATE : HOLE_CLOSE_RATE;
      hole.radius += (hole.targetRadius - hole.radius) * (1 - Math.exp(-rate * dt));
    }
    this.holes = this.holes.filter((h) => h.targetRadius > 0 || h.radius > RADIUS_EPSILON);
  }

  getDroplets(): SplashBlob[] {
    return this.droplets.map(({ x, y, radius, color, merge, host }) => ({ x, y, radius, color, merge, host }));
  }

  /** Radius factor for a body so the liquid out in droplets is taken from it (area kept). */
  radiusScale(body: Pool, radius: number) {
    let lent = 0;
    for (const drop of this.droplets) if (drop.host === body) lent += drop.radius ** 2;
    return lent > 0 ? Math.sqrt(Math.max(1 - lent / radius ** 2, 0)) : 1;
  }

  private burst(pointer: PointerInput, host: Pool, intensity: number, scaleX: number, scaleY: number) {
    const count = Math.round(lerp(COUNT, intensity));
    const fling = lerp(FLING_DISTANCE, intensity);
    const offsetX = (pointer.x - host.x) * scaleX;
    const offsetY = (pointer.y - host.y) * scaleY;
    const size = Math.min(lerp(DROPLET_RADIUS, intensity), host.radius * Math.sqrt(MAX_AREA_SHARE / count));
    // Random start angle so repeated taps don't spray the same star
    const offset = Math.random() * Math.PI * 2;
    this.holes.push({
      x: pointer.x,
      y: pointer.y,
      radius: 0,
      targetRadius: host.radius * lerp(HOLE_SHARE, intensity),
      host,
      offsetX: pointer.x - host.x,
      offsetY: pointer.y - host.y,
      age: 0,
    });
    this.holes.splice(0, Math.max(this.holes.length - MAX_SPLASH_HOLES, 0));
    for (let i = 0; i < count; i++) {
      const angle = offset + (i / count) * Math.PI * 2;
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      // Drag stops a droplet after speed / drag, so aim that to clear the host's edge
      const spread = 1 + JITTER * (Math.random() - 0.5) * 2;
      const reach = exitDistance(offsetX, offsetY, dirX, dirY, host.radius) + fling * spread;
      const launch = reach * FLIGHT_DRAG;
      this.droplets.push({
        x: pointer.x,
        y: pointer.y,
        vx: (dirX * launch) / scaleX,
        vy: (dirY * launch) / scaleY,
        radius: 0,
        targetRadius: size * (1 + JITTER * (Math.random() - 0.5)),
        merge: MERGE_APART,
        color: host.color,
        host,
        age: 0,
        absorbed: false,
      });
    }
    this.droplets.splice(0, Math.max(this.droplets.length - MAX_SPLASH_DROPLETS, 0));
  }
}

/** Distance from a point inside a circle (offset from its centre) to its edge along a unit direction */
function exitDistance(offsetX: number, offsetY: number, dirX: number, dirY: number, radius: number) {
  const along = offsetX * dirX + offsetY * dirY;
  const inside = along * along - (offsetX * offsetX + offsetY * offsetY) + radius * radius;
  return Math.max(-along + Math.sqrt(Math.max(inside, 0)), 0);
}

function smoothstep(t: number) {
  const x = Math.min(Math.max(t, 0), 1);
  return x * x * (3 - 2 * x);
}

/** Body under the press, or the nearest one whose edge is within reach */
function touchedBody(point: { x: number; y: number }, bodies: Pool[], scaleX: number, scaleY: number) {
  let nearest: Pool | null = null;
  let bestEdge = TOUCH_REACH;
  for (const body of bodies) {
    const edge = Math.hypot((body.x - point.x) * scaleX, (body.y - point.y) * scaleY) - body.radius;
    if (edge < bestEdge) {
      bestEdge = edge;
      nearest = body;
    }
  }
  return nearest;
}

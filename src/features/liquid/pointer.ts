import type { PointerInput } from './physics';

const MS_PER_SECOND = 1000;
// Blend toward each new sample so jittery events don't spike the velocity
const VELOCITY_SMOOTHING = 0.5;
/** 1/s — velocity fades once the pointer stops moving */
const VELOCITY_DECAY = 8;
// Events can land ~1ms apart; cap speed so one burst can't fling blobs off-screen
const MAX_SPEED = 3;

/** Tracks mouse hover and touch drags on an element in 0–1 element-relative units. */
export class PointerTracker {
  private state: PointerInput = { x: 0.5, y: 0.5, vx: 0, vy: 0, active: false, tapped: false };
  private lastTime = 0;

  constructor(private element: HTMLElement) {
    element.addEventListener('pointermove', this.onMove);
    element.addEventListener('pointerdown', this.onDown);
    element.addEventListener('pointerup', this.onUp);
    element.addEventListener('pointercancel', this.onRelease);
    element.addEventListener('pointerleave', this.onRelease);
  }

  /** Returns this frame's input; a tap is reported once, then cleared. */
  snapshot(dt: number): PointerInput {
    const decay = Math.exp(-VELOCITY_DECAY * dt);
    this.state.vx *= decay;
    this.state.vy *= decay;
    const snapshot = { ...this.state };
    this.state.tapped = false;
    return snapshot;
  }

  dispose() {
    this.element.removeEventListener('pointermove', this.onMove);
    this.element.removeEventListener('pointerdown', this.onDown);
    this.element.removeEventListener('pointerup', this.onUp);
    this.element.removeEventListener('pointercancel', this.onRelease);
    this.element.removeEventListener('pointerleave', this.onRelease);
  }

  private toLocal(e: PointerEvent) {
    const rect = this.element.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  private onMove = (e: PointerEvent) => {
    const { x, y } = this.toLocal(e);
    const dt = (e.timeStamp - this.lastTime) / MS_PER_SECOND;

    // Skip velocity on the first sample so entering the window doesn't fling blobs
    if (this.state.active && dt > 0) {
      this.state.vx += ((x - this.state.x) / dt - this.state.vx) * VELOCITY_SMOOTHING;
      this.state.vy += ((y - this.state.y) / dt - this.state.vy) * VELOCITY_SMOOTHING;
      this.clampSpeed();
    }
    this.state.x = x;
    this.state.y = y;
    this.lastTime = e.timeStamp;
    if (e.pointerType === 'mouse') this.state.active = true;
  };

  private clampSpeed() {
    const speed = Math.hypot(this.state.vx, this.state.vy);
    if (speed <= MAX_SPEED) return;
    this.state.vx *= MAX_SPEED / speed;
    this.state.vy *= MAX_SPEED / speed;
  }

  private onDown = (e: PointerEvent) => {
    const { x, y } = this.toLocal(e);
    this.state = { x, y, vx: 0, vy: 0, active: true, tapped: true };
    this.lastTime = e.timeStamp;
  };

  // Mouse keeps hovering after a click; touch ends when the finger lifts
  private onUp = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') this.state.active = false;
  };

  private onRelease = () => {
    this.state.active = false;
  };
}

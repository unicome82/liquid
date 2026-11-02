const MS_PER_SECOND = 1000;
// Below ~50fps we trade resolution for smoothness; the soft gradients hide the loss
const DEGRADE_FRAME_MS = MS_PER_SECOND / 50;
const RECOVER_FRAME_MS = MS_PER_SECOND / 58;
const SMOOTHING = 0.1;
const SCALE_STEP = 0.1;
const MIN_SCALE = 0.5;
const MAX_SCALE = 1;
// Wait for the average to settle after each change so the scale doesn't oscillate
const DEGRADE_COOLDOWN_FRAMES = 60;
const RECOVER_COOLDOWN_FRAMES = 180;
const INITIAL_FRAME_MS = MS_PER_SECOND / 60;

export class AdaptiveQuality {
  scale = MAX_SCALE;
  private averageMs = INITIAL_FRAME_MS;
  private cooldown = DEGRADE_COOLDOWN_FRAMES;

  sample(frameMs: number) {
    this.averageMs += (frameMs - this.averageMs) * SMOOTHING;
    if (this.cooldown > 0) {
      this.cooldown--;
      return;
    }

    if (this.averageMs > DEGRADE_FRAME_MS && this.scale > MIN_SCALE) {
      this.scale = Math.max(MIN_SCALE, this.scale - SCALE_STEP);
      this.cooldown = DEGRADE_COOLDOWN_FRAMES;
    } else if (this.averageMs < RECOVER_FRAME_MS && this.scale < MAX_SCALE) {
      this.scale = Math.min(MAX_SCALE, this.scale + SCALE_STEP);
      this.cooldown = RECOVER_COOLDOWN_FRAMES;
    }
  }
}

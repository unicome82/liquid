import { INTENSITY_RANGE, type ColorTheme, type LiquidSettings } from '../../shared/settings';
import { LiquidSimulation } from './physics';
import { PointerTracker } from './pointer';
import { AdaptiveQuality } from './quality';
import { createLiquidRenderer } from './renderer';
import { buildScene, fitScale, type Scene } from './scene';

const MS_PER_SECOND = 1000;
// Clamp so a stalled frame can't fling the springs off-screen
const MAX_STEP_SECONDS = 1 / 30;
const PERCENT = 100;
const SCALE_KEY_DIGITS = 2;

/** Starts rendering; returns a stop function. Throws if WebGL or the scene can't be set up. */
export function startLiquidLoop(
  canvas: HTMLCanvasElement,
  getSettings: () => LiquidSettings,
): () => void {
  const renderer = createLiquidRenderer(canvas);
  let scene: Scene;
  try {
    scene = buildScene();
  } catch (error) {
    renderer.dispose();
    throw error;
  }

  const simulation = new LiquidSimulation();
  const quality = new AdaptiveQuality();
  const pointer = new PointerTracker(canvas);
  let frameId = 0;
  let lastTime = 0;
  let layoutKey = '';

  // Size only rescales target radii; the simulation eases blobs to the new size
  const syncLayout = (aspect: number, amount: number, size: number, theme: ColorTheme) => {
    const scale = (size / PERCENT) * fitScale(aspect);
    // Rounded so continuous window resizes don't reset the layout every frame
    const key = `${aspect < 1}-${amount}-${scale.toFixed(SCALE_KEY_DIGITS)}-${theme}`;
    if (key === layoutKey) return;
    layoutKey = key;
    simulation.setLayout(
      scene.getBlobs(aspect, amount, theme).map((blob) => ({ ...blob, radius: blob.radius * scale })),
    );
  };

  const frame = (now: number) => {
    frameId = requestAnimationFrame(frame);
    const frameMs = lastTime ? now - lastTime : 0;
    lastTime = now;
    if (frameMs > 0) quality.sample(frameMs);

    if (canvas.clientWidth === 0 || canvas.clientHeight === 0) return;

    const { amount, intensity, mode, size, theme } = getSettings();
    const dt = Math.min(frameMs / MS_PER_SECOND, MAX_STEP_SECONDS);
    const aspect = canvas.clientWidth / canvas.clientHeight;
    const normalizedIntensity =
      (intensity - INTENSITY_RANGE.min) / (INTENSITY_RANGE.max - INTENSITY_RANGE.min);

    renderer.resize(quality.scale);
    syncLayout(aspect, amount, size, theme);
    simulation.step(dt, aspect, normalizedIntensity, pointer.snapshot(dt), mode);
    renderer.render(simulation.getBlobs(), simulation.getCuts(), scene.getPalette(theme));
  };

  const start = () => {
    lastTime = 0;
    frameId = requestAnimationFrame(frame);
  };
  const stop = () => cancelAnimationFrame(frameId);
  const onVisibilityChange = () => (document.hidden ? stop() : start());

  document.addEventListener('visibilitychange', onVisibilityChange);
  start();

  return () => {
    stop();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    pointer.dispose();
    renderer.dispose();
  };
}

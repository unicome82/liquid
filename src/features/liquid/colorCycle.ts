import type { Blob, Rgb } from './renderer';

// Seconds each colour takes to flow into the next; slow enough to read as drifting
const STEP_SECONDS = 15;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (t: number) => t * t * (3 - 2 * t);
const distanceSq = (a: Rgb, b: Rgb) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/**
 * Shifts every blob along a loop of palette colours, so hues drift but never leave the palette.
 * Blob colours are matched to their nearest loop entry, which also covers strand blobs that copy a source colour.
 */
export function createColorCycle(loop: Rgb[]) {
  const nearestIndex = (color: Rgb) =>
    loop.reduce((best, entry, i) => (distanceSq(entry, color) < distanceSq(loop[best], color) ? i : best), 0);

  return (blobs: Blob[], time: number): Blob[] => {
    const phase = time / STEP_SECONDS;
    const step = Math.floor(phase);
    // Eased so each colour lingers briefly before moving on
    const t = smoothstep(phase - step);

    return blobs.map((blob) => {
      const index = nearestIndex(blob.color) + step;
      const from = loop[index % loop.length];
      const to = loop[(index + 1) % loop.length];
      const color: Rgb = [lerp(from[0], to[0], t), lerp(from[1], to[1], t), lerp(from[2], to[2], t)];
      return { ...blob, color };
    });
  };
}

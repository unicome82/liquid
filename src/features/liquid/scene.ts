import { createColorCycle } from './colorCycle';
import type { Blob, Palette, Rgb } from './renderer';

type ColorToken = 'sky' | 'butter' | 'peach' | 'pink' | 'lavender' | 'cream';

interface BlobSpec {
  /** Fraction of the viewport's shorter side */
  radius: number;
  color: ColorToken;
}

// Sizes and colours follow the reference; positions are scattered fresh on every load.
// Roughly largest first: the amount setting takes the first N, and big blobs placed
// first claim space so the small ones fill the gaps.
const LANDSCAPE_BLOBS: BlobSpec[] = [
  { radius: 0.3, color: 'sky' },
  { radius: 0.22, color: 'peach' },
  { radius: 0.22, color: 'sky' },
  { radius: 0.13, color: 'sky' },
  { radius: 0.17, color: 'pink' },
  { radius: 0.17, color: 'sky' },
  { radius: 0.13, color: 'pink' },
  { radius: 0.1, color: 'lavender' },
  { radius: 0.07, color: 'lavender' },
  { radius: 0.06, color: 'peach' },
  { radius: 0.08, color: 'pink' },
  { radius: 0.045, color: 'sky' },
];

const PORTRAIT_BLOBS: BlobSpec[] = [
  { radius: 0.42, color: 'sky' },
  { radius: 0.28, color: 'peach' },
  { radius: 0.32, color: 'sky' },
  { radius: 0.2, color: 'sky' },
  { radius: 0.26, color: 'pink' },
  { radius: 0.2, color: 'sky' },
  { radius: 0.16, color: 'pink' },
  { radius: 0.12, color: 'lavender' },
  { radius: 0.08, color: 'lavender' },
  { radius: 0.08, color: 'peach' },
  { radius: 0.06, color: 'pink' },
  { radius: 0.05, color: 'sky' },
];

// Representative screen shapes, used only to judge spacing while scattering
const LANDSCAPE_ASPECT = 16 / 10;
const PORTRAIT_ASPECT = 9 / 19.5;
/** Lets blobs sit partly off-screen, like the reference's cropped edges */
const EDGE_OVERFLOW = 0.05;
/** More candidates = more even spread (best-candidate sampling) */
const PLACEMENT_CANDIDATES = 16;

const HEX_PATTERN = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const CHANNEL_MAX = 255;

function readColorToken(token: ColorToken): Rgb {
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--color-${token}`).trim();
  const match = HEX_PATTERN.exec(value);
  if (!match) throw new Error(`Invalid color token --color-${token}: "${value}"`);

  return [
    parseInt(match[1], 16) / CHANNEL_MAX,
    parseInt(match[2], 16) / CHANNEL_MAX,
    parseInt(match[3], 16) / CHANNEL_MAX,
  ];
}

const randomCoord = () => -EDGE_OVERFLOW + Math.random() * (1 + EDGE_OVERFLOW * 2);

/** Picks, from a few random spots, the one with the most room between it and placed blobs. */
function scatter(specs: BlobSpec[], aspect: number): Blob[] {
  const scaleX = Math.max(aspect, 1);
  const scaleY = Math.max(1 / aspect, 1);
  const placed: Blob[] = [];

  for (const spec of specs) {
    let best = { x: randomCoord(), y: randomCoord() };
    let bestGap = -Infinity;
    for (let i = 0; i < PLACEMENT_CANDIDATES && placed.length > 0; i++) {
      const candidate = { x: randomCoord(), y: randomCoord() };
      const gap = Math.min(
        ...placed.map(
          (blob) =>
            Math.hypot((blob.x - candidate.x) * scaleX, (blob.y - candidate.y) * scaleY) -
            blob.radius -
            spec.radius,
        ),
      );
      if (gap > bestGap) {
        bestGap = gap;
        best = candidate;
      }
    }
    placed.push({ ...best, radius: spec.radius, color: readColorToken(spec.color) });
  }
  return placed;
}

export interface Scene {
  palette: Palette;
  getBlobs: (aspect: number, count: number) => Blob[];
  /** Returns copies of the blobs with colours shifted along the palette loop at `time` seconds */
  cycleColors: (blobs: Blob[], time: number) => Blob[];
}

// Order of the colour drift; neighbours are close hues so blends stay clean
const COLOR_LOOP: ColorToken[] = ['sky', 'lavender', 'pink', 'peach'];

export function buildScene(): Scene {
  const landscape = scatter(LANDSCAPE_BLOBS, LANDSCAPE_ASPECT);
  const portrait = scatter(PORTRAIT_BLOBS, PORTRAIT_ASPECT);
  const palette: Palette = {
    bgTop: readColorToken('cream'),
    bgBottom: readColorToken('butter'),
    bgAccent: readColorToken('pink'),
    shadowTint: readColorToken('lavender'),
    transition: readColorToken('butter'),
  };
  return {
    palette,
    getBlobs: (aspect, count) => (aspect < 1 ? portrait : landscape).slice(0, count),
    cycleColors: createColorCycle(COLOR_LOOP.map(readColorToken)),
  };
}

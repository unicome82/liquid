import type { Blob, Palette, Rgb } from './renderer';

type ColorToken = 'sky' | 'butter' | 'peach' | 'pink' | 'lavender' | 'cream' | 'mint' | 'coral';

// Liquid colours; butter and cream are left out because they sit on the background
const LIQUID_COLORS: ColorToken[] = ['sky', 'mint', 'lavender', 'pink', 'peach', 'coral'];

interface BlobSpec {
  /** Fraction of the viewport's shorter side */
  radius: number;
}

// Sizes follow the reference; positions and colours are randomised on every load.
// Roughly largest first: the amount setting takes the first N, and big blobs placed
// first claim space so the small ones fill the gaps.
const LANDSCAPE_BLOBS: BlobSpec[] = [
  { radius: 0.3 },
  { radius: 0.22 },
  { radius: 0.22 },
  { radius: 0.13 },
  { radius: 0.17 },
  { radius: 0.17 },
  { radius: 0.13 },
  { radius: 0.1 },
  { radius: 0.07 },
  { radius: 0.06 },
  { radius: 0.08 },
  { radius: 0.045 },
];

const PORTRAIT_BLOBS: BlobSpec[] = [
  { radius: 0.42 },
  { radius: 0.28 },
  { radius: 0.32 },
  { radius: 0.2 },
  { radius: 0.26 },
  { radius: 0.2 },
  { radius: 0.16 },
  { radius: 0.12 },
  { radius: 0.08 },
  { radius: 0.08 },
  { radius: 0.06 },
  { radius: 0.05 },
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

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Cycles a shuffled palette by blob order, so any first-N slice (the amount setting)
 * uses every colour about equally, and the biggest blobs never share a colour.
 */
function pickColors(count: number): Rgb[] {
  const palette = shuffle(LIQUID_COLORS).map(readColorToken);
  return Array.from({ length: count }, (_, i) => palette[i % palette.length]);
}

const randomCoord = () => -EDGE_OVERFLOW + Math.random() * (1 + EDGE_OVERFLOW * 2);

/** Picks, from a few random spots, the one with the most room between it and placed blobs. */
function scatter(specs: BlobSpec[], aspect: number, colors: Rgb[]): Blob[] {
  const scaleX = Math.max(aspect, 1);
  const scaleY = Math.max(1 / aspect, 1);
  const placed: Blob[] = [];

  for (const [index, spec] of specs.entries()) {
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
    placed.push({ ...best, radius: spec.radius, color: colors[index] });
  }
  return placed;
}

export interface Scene {
  palette: Palette;
  getBlobs: (aspect: number, count: number) => Blob[];
}

export function buildScene(): Scene {
  // Shared so a blob keeps its colour when the screen rotates
  const colors = pickColors(LANDSCAPE_BLOBS.length);
  const landscape = scatter(LANDSCAPE_BLOBS, LANDSCAPE_ASPECT, colors);
  const portrait = scatter(PORTRAIT_BLOBS, PORTRAIT_ASPECT, colors);
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
  };
}

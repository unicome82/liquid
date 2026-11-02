import type { Blob, Palette, Rgb } from './renderer';

type ColorToken = 'sky' | 'butter' | 'peach' | 'pink' | 'lavender' | 'cream';

interface BlobLayout extends Omit<Blob, 'color'> {
  color: ColorToken;
}

// Compositions modelled on the reference. Ordered by importance:
// the amount setting takes the first N, so early entries must stand on their own.
const LANDSCAPE_LAYOUT: BlobLayout[] = [
  { x: 0.18, y: 0.1, radius: 0.3, color: 'sky' },
  { x: 0.82, y: 0.22, radius: 0.22, color: 'peach' },
  { x: 0.82, y: 0.9, radius: 0.22, color: 'sky' },
  { x: 0.45, y: 0.55, radius: 0.13, color: 'sky' },
  { x: 0.12, y: 0.92, radius: 0.17, color: 'pink' },
  { x: 0.5, y: 0.12, radius: 0.17, color: 'sky' },
  { x: 0.84, y: 0.55, radius: 0.13, color: 'pink' },
  { x: 0.36, y: 0.8, radius: 0.1, color: 'lavender' },
  { x: 0.03, y: 0.5, radius: 0.07, color: 'lavender' },
  { x: 0.6, y: 0.99, radius: 0.06, color: 'peach' },
  { x: 0.99, y: 0.03, radius: 0.08, color: 'pink' },
  { x: 0.64, y: 0.42, radius: 0.045, color: 'sky' },
];

const PORTRAIT_LAYOUT: BlobLayout[] = [
  { x: 0.1, y: 0.06, radius: 0.42, color: 'sky' },
  { x: 1.0, y: 0.28, radius: 0.28, color: 'peach' },
  { x: 0.88, y: 0.88, radius: 0.32, color: 'sky' },
  { x: 0.36, y: 0.5, radius: 0.2, color: 'sky' },
  { x: 0.0, y: 0.9, radius: 0.26, color: 'pink' },
  { x: 0.72, y: 0.1, radius: 0.2, color: 'sky' },
  { x: 0.92, y: 0.52, radius: 0.16, color: 'pink' },
  { x: 0.26, y: 0.7, radius: 0.12, color: 'lavender' },
  { x: 0.03, y: 0.38, radius: 0.08, color: 'lavender' },
  { x: 0.5, y: 0.99, radius: 0.08, color: 'peach' },
  { x: 0.64, y: 0.66, radius: 0.06, color: 'pink' },
  { x: 0.62, y: 0.32, radius: 0.05, color: 'sky' },
];

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

function resolveLayout(layout: BlobLayout[]): Blob[] {
  return layout.map((blob) => ({ ...blob, color: readColorToken(blob.color) }));
}

export interface Scene {
  palette: Palette;
  getBlobs: (aspect: number, count: number) => Blob[];
}

export function buildScene(): Scene {
  const landscape = resolveLayout(LANDSCAPE_LAYOUT);
  const portrait = resolveLayout(PORTRAIT_LAYOUT);
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

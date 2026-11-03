import { COLOR_THEMES, isMetalTheme, type ColorTheme } from '../../shared/settings';
import type { Blob, Palette, Rgb } from './renderer';

type ColorToken =
  | 'butter'
  | 'cream'
  | 'offwhite'
  | 'night'
  | 'night-soft'
  | 'ink';

// Matches the length of each theme list in `$liquid-themes`
const THEME_COLOR_COUNT = 6;
// Single-hue themes skip the butter lift between colours, which would tint them yellow
const MONO_THEMES: ColorTheme[] = ['water', 'silver', 'gold'];

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
// Keeps very wide or tall windows from blowing blobs up or shrinking them away
const FIT_SCALE_MIN = 0.75;
const FIT_SCALE_MAX = 1.5;
/** Lets blobs sit partly off-screen, like the reference's cropped edges */
const EDGE_OVERFLOW = 0.05;
/** More candidates = more even spread (best-candidate sampling) */
const PLACEMENT_CANDIDATES = 16;

const HEX_PATTERN = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const SHORT_HEX_PATTERN = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;

// Sass minifies colours like #ffffff to #fff, so expand them before parsing
const expandShortHex = (value: string) => value.replace(SHORT_HEX_PATTERN, '#$1$1$2$2$3$3');
const CHANNEL_MAX = 255;

function readCssColor(name: string): Rgb {
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  const match = HEX_PATTERN.exec(expandShortHex(value));
  if (!match) throw new Error(`Invalid color token --${name}: "${value}"`);

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
 * Cycles shuffled colour slots by blob order, so any first-N slice (the amount setting)
 * uses every colour about equally, and the biggest blobs never share a colour.
 * Slots (not colours) are stored so switching theme recolours without reshuffling.
 */
function pickColorSlots(count: number): number[] {
  const slots = shuffle(Array.from({ length: THEME_COLOR_COUNT }, (_, i) => i));
  return Array.from({ length: count }, (_, i) => slots[i % slots.length]);
}

const readColorToken = (token: ColorToken) => readCssColor(`color-${token}`);

function readThemeColors(theme: ColorTheme): Rgb[] {
  return Array.from({ length: THEME_COLOR_COUNT }, (_, i) => readCssColor(`liquid-${theme}-${i + 1}`));
}

const randomCoord = () => -EDGE_OVERFLOW + Math.random() * (1 + EDGE_OVERFLOW * 2);

/** Picks, from a few random spots, the one with the most room between it and placed blobs. */
interface PlacedBlob extends Omit<Blob, 'color'> {
  colorSlot: number;
}

function scatter(specs: BlobSpec[], aspect: number, colorSlots: number[]): PlacedBlob[] {
  const scaleX = Math.max(aspect, 1);
  const scaleY = Math.max(1 / aspect, 1);
  const placed: PlacedBlob[] = [];

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
    placed.push({ ...best, radius: spec.radius, colorSlot: colorSlots[index] });
  }
  return placed;
}

const longOverShort = (aspect: number) => Math.max(aspect, 1 / aspect);

/**
 * Radii are fractions of the short side, so widening a window alone wouldn't grow them.
 * Scaling by sqrt(long / short) makes blob size follow the viewport's area instead,
 * normalised so the reference screen shapes keep their designed sizes.
 */
export function fitScale(aspect: number): number {
  const reference = aspect < 1 ? PORTRAIT_ASPECT : LANDSCAPE_ASPECT;
  const scale = Math.sqrt(longOverShort(aspect) / longOverShort(reference));
  return Math.min(Math.max(scale, FIT_SCALE_MIN), FIT_SCALE_MAX);
}

export interface Scene {
  getPalette: (theme: ColorTheme) => Palette;
  getBlobs: (aspect: number, count: number, theme: ColorTheme) => Blob[];
}

export function buildScene(): Scene {
  // Shared so a blob keeps its colour when the screen rotates
  const colorSlots = pickColorSlots(LANDSCAPE_BLOBS.length);
  const landscape = scatter(LANDSCAPE_BLOBS, LANDSCAPE_ASPECT, colorSlots);
  const portrait = scatter(PORTRAIT_BLOBS, PORTRAIT_ASPECT, colorSlots);
  const themeColors = Object.fromEntries(
    COLOR_THEMES.map(({ value }) => [value, readThemeColors(value)]),
  ) as Record<ColorTheme, Rgb[]>;
  const basePalette = {
    // One flat colour: top, bottom and accent match so the backdrop has no gradient
    bgTop: readColorToken('offwhite'),
    bgBottom: readColorToken('offwhite'),
    bgAccent: readColorToken('offwhite'),
    transition: readColorToken('butter'),
    text: readColorToken('ink'),
  };
  // Chrome needs a dark stage so its reflections read
  const darkPalette = {
    bgTop: readColorToken('night-soft'),
    bgBottom: readColorToken('night'),
    bgAccent: readColorToken('night-soft'),
    transition: basePalette.transition,
    text: readColorToken('cream'),
  };
  return {
    getPalette: (theme) => ({
      ...(isMetalTheme(theme) ? darkPalette : basePalette),
      transition: MONO_THEMES.includes(theme) ? themeColors[theme][0] : basePalette.transition,
      metal: isMetalTheme(theme) ? 1 : 0,
      water: theme === 'water' ? 1 : 0,
    }),
    getBlobs: (aspect, count, theme) =>
      (aspect < 1 ? portrait : landscape)
        .slice(0, count)
        .map(({ colorSlot, ...blob }) => ({ ...blob, color: themeColors[theme][colorSlot] })),
  };
}

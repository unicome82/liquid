export type InteractionMode = 'attract' | 'repel' | 'cut' | 'stretch';
export type BackdropFont = 'dm-sans' | 'instrument-serif' | 'fraunces' | 'bricolage' | 'unbounded';
export type ColorTheme = 'pastel' | 'vivid' | 'water' | 'silver' | 'gold';

export interface LiquidSettings {
  /** Cursor force + inverse viscosity, in percent */
  intensity: number;
  /** Number of blobs on screen */
  amount: number;
  /** Blob size multiplier, in percent */
  size: number;
  mode: InteractionMode;
  theme: ColorTheme;
  /** Temporary: typeface trial for the backdrop copy */
  font: BackdropFont;
}

export interface Range {
  min: number;
  max: number;
  step: number;
}

export const INTENSITY_RANGE: Range = { min: 0, max: 100, step: 1 };
export const AMOUNT_RANGE: Range = { min: 4, max: 12, step: 1 };
export const SIZE_RANGE: Range = { min: 50, max: 150, step: 5 };

export const DEFAULT_SETTINGS: LiquidSettings = {
  intensity: 50,
  amount: 8,
  size: 100,
  mode: 'attract',
  theme: 'pastel',
  font: 'dm-sans',
};

export const INTERACTION_MODES: { value: InteractionMode; label: string; icon: string }[] = [
  { value: 'attract', label: 'Attract', icon: 'compress' },
  { value: 'repel', label: 'Repel', icon: 'expand' },
  { value: 'cut', label: 'Cut', icon: 'content_cut' },
  { value: 'stretch', label: 'Stretch', icon: 'open_in_full' },
];

export const COLOR_THEMES: { value: ColorTheme; label: string }[] = [
  { value: 'pastel', label: 'Pastel' },
  { value: 'vivid', label: 'Vivid' },
  { value: 'water', label: 'Water' },
  { value: 'silver', label: 'Silver' },
  { value: 'gold', label: 'Gold' },
];

/** Chrome themes, which sit on a dark background */
export const isMetalTheme = (theme: ColorTheme) => theme === 'silver' || theme === 'gold';

// Temporary typeface trial for the backdrop copy; families are loaded in index.html
export const BACKDROP_FONTS: { value: BackdropFont; label: string; family: string; weight: number }[] = [
  { value: 'dm-sans', label: 'DM Sans', family: "'DM Sans', sans-serif", weight: 500 },
  { value: 'instrument-serif', label: 'Instrument Serif', family: "'Instrument Serif', serif", weight: 400 },
  { value: 'fraunces', label: 'Fraunces', family: "'Fraunces', serif", weight: 400 },
  { value: 'bricolage', label: 'Bricolage Grotesque', family: "'Bricolage Grotesque', sans-serif", weight: 500 },
  { value: 'unbounded', label: 'Unbounded', family: "'Unbounded', sans-serif", weight: 500 },
];

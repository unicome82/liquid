export type InteractionMode = 'move' | 'cut' | 'ripple' | 'splash';
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
  mode: 'move',
  theme: 'pastel',
};

export const INTERACTION_MODES: { value: InteractionMode; label: string; icon: string }[] = [
  { value: 'move', label: 'Move', icon: 'drag_pan' },
  { value: 'cut', label: 'Cut', icon: 'content_cut' },
  { value: 'ripple', label: 'Ripple', icon: 'waves' },
  { value: 'splash', label: 'Splash', icon: 'bubble_chart' },
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

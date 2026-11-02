export type InteractionMode = 'attract' | 'repel' | 'cut' | 'stretch';

export interface LiquidSettings {
  /** Cursor force + inverse viscosity, in percent */
  intensity: number;
  /** Number of blobs on screen */
  amount: number;
  mode: InteractionMode;
}

export interface Range {
  min: number;
  max: number;
  step: number;
}

export const INTENSITY_RANGE: Range = { min: 0, max: 100, step: 1 };
export const AMOUNT_RANGE: Range = { min: 4, max: 12, step: 1 };

export const DEFAULT_SETTINGS: LiquidSettings = {
  intensity: 50,
  amount: 8,
  mode: 'attract',
};

export const INTERACTION_MODES: {
  value: InteractionMode;
  label: string;
  icon: string;
  /** Shown as the on-screen guide while this mode is active */
  hint: string;
}[] = [
  { value: 'attract', label: 'Attract', icon: 'compress', hint: 'Press and drag to gather the liquid' },
  { value: 'repel', label: 'Repel', icon: 'expand', hint: 'Press and drag to push the liquid away' },
  { value: 'cut', label: 'Cut', icon: 'content_cut', hint: 'Press and drag across the liquid to cut it' },
  { value: 'stretch', label: 'Stretch', icon: 'open_in_full', hint: 'Grab an edge and pull to stretch a strand' },
];

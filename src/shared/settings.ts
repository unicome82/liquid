export type InteractionMode = 'attract' | 'repel' | 'cut' | 'mix';

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

export const INTERACTION_MODES: { value: InteractionMode; label: string; icon: string }[] = [
  { value: 'attract', label: 'Attract', icon: 'compress' },
  { value: 'repel', label: 'Repel', icon: 'expand' },
  { value: 'cut', label: 'Cut', icon: 'content_cut' },
  { value: 'mix', label: 'Mix', icon: 'blender' },
];

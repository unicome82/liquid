import { useEffect, useId, useState } from 'react';
import {
  AMOUNT_RANGE,
  COLOR_THEMES,
  INTENSITY_RANGE,
  INTERACTION_MODES,
  SIZE_RANGE,
  type LiquidSettings,
} from '../../shared/settings';
import OptionGroup from './OptionGroup';
import RangeField from './RangeField';

const MODE_ICONS = Object.fromEntries(INTERACTION_MODES.map((mode) => [mode.value, mode.icon]));

interface ControlPanelProps {
  settings: LiquidSettings;
  onChange: (settings: LiquidSettings) => void;
}

function ControlPanel({ settings, onChange }: ControlPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen]);

  const update = <K extends keyof LiquidSettings>(key: K, value: LiquidSettings[K]) =>
    onChange({ ...settings, [key]: value });

  return (
    <div className={`control${isOpen ? ' is-open' : ''}`}>
      <div className="panel" id={panelId} inert={!isOpen}>
        <h2 className="tit">Controls</h2>
        <RangeField
          label="Intensity"
          value={settings.intensity}
          range={INTENSITY_RANGE}
          unit="%"
          onChange={(value) => update('intensity', value)}
        />
        <RangeField
          label="Amount"
          value={settings.amount}
          range={AMOUNT_RANGE}
          onChange={(value) => update('amount', value)}
        />
        <RangeField
          label="Size"
          value={settings.size}
          range={SIZE_RANGE}
          unit="%"
          onChange={(value) => update('size', value)}
        />
        <OptionGroup
          label="Mode"
          value={settings.mode}
          options={INTERACTION_MODES}
          renderVisual={(mode) => (
            <span className="material-symbols-outlined icon" aria-hidden="true">
              {MODE_ICONS[mode]}
            </span>
          )}
          onChange={(mode) => update('mode', mode)}
        />
        <OptionGroup
          label="Color"
          value={settings.theme}
          options={COLOR_THEMES}
          renderVisual={(theme) => <span className={`swatch is-${theme}`} aria-hidden="true" />}
          onChange={(theme) => update('theme', theme)}
        />
      </div>
      <button
        type="button"
        className="btn"
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={isOpen ? 'Close controls' : 'Open controls'}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="material-symbols-outlined icon" aria-hidden="true">
          {isOpen ? 'close' : 'tune'}
        </span>
      </button>
    </div>
  );
}

export default ControlPanel;

import { useEffect, useId, useState } from 'react';
import {
  AMOUNT_RANGE,
  INTENSITY_RANGE,
  INTERACTION_MODES,
  SIZE_RANGE,
  type LiquidSettings,
} from '../../shared/settings';
import RangeField from './RangeField';

interface ControlPanelProps {
  settings: LiquidSettings;
  onChange: (settings: LiquidSettings) => void;
}

function ControlPanel({ settings, onChange }: ControlPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const modeName = useId();

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
        <fieldset className="mode">
          <legend className="label">Mode</legend>
          <div className="list">
            {INTERACTION_MODES.map((mode) => (
              <label
                key={mode.value}
                className={`item${settings.mode === mode.value ? ' is-active' : ''}`}
              >
                <input
                  className="radio"
                  type="radio"
                  name={modeName}
                  value={mode.value}
                  checked={settings.mode === mode.value}
                  onChange={() => update('mode', mode.value)}
                />
                <span className="material-symbols-outlined icon" aria-hidden="true">
                  {mode.icon}
                </span>
                <span className="txt">{mode.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
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

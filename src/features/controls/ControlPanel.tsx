import { useEffect, useId, useRef, useState } from 'react';
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
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const hasOpened = useRef(false);

  // The toggle hides while open, so move focus with it instead of losing it
  useEffect(() => {
    if (isOpen) {
      hasOpened.current = true;
      closeRef.current?.focus();
    } else if (hasOpened.current) {
      toggleRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    // Any press outside the sheet closes it, including on the liquid
    const closeOnOutsidePress = (e: PointerEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('pointerdown', closeOnOutsidePress);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('pointerdown', closeOnOutsidePress);
    };
  }, [isOpen]);

  const update = <K extends keyof LiquidSettings>(key: K, value: LiquidSettings[K]) =>
    onChange({ ...settings, [key]: value });

  return (
    <div className={`control${isOpen ? ' is-open' : ''}`}>
      <div ref={panelRef} className="panel" id={panelId} inert={!isOpen}>
        <div className="tit-wrap">
          <h2 className="tit">Controls</h2>
          <button
            ref={closeRef}
            type="button"
            className="close"
            aria-label="Close controls"
            onClick={() => setIsOpen(false)}
          >
            <span className="material-symbols-outlined icon" aria-hidden="true">
              close
            </span>
          </button>
        </div>
        <div className="fields">
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
            isSwatch
          />
        </div>
      </div>
      <button
        ref={toggleRef}
        type="button"
        className="btn"
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label="Open controls"
        inert={isOpen}
        onClick={() => setIsOpen(true)}
      >
        <span className="material-symbols-outlined icon" aria-hidden="true">
          tune
        </span>
      </button>
    </div>
  );
}

export default ControlPanel;

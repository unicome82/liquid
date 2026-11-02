import { useId, type CSSProperties } from 'react';
import type { Range } from '../../shared/settings';

interface RangeFieldProps {
  label: string;
  value: number;
  range: Range;
  unit?: string;
  onChange: (value: number) => void;
}

function RangeField({ label, value, range, unit = '', onChange }: RangeFieldProps) {
  const id = useId();
  const progress = ((value - range.min) / (range.max - range.min)) * 100;

  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="range"
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        style={{ '--progress': `${progress}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output className="value" htmlFor={id}>
        {value}
        {unit}
      </output>
    </div>
  );
}

export default RangeField;

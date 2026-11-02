import { useId, type ReactNode } from 'react';

interface OptionGroupProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  /** Leading visual for each option (icon, swatch) */
  renderVisual: (value: T) => ReactNode;
  onChange: (value: T) => void;
}

/** Radio group styled as a grid of toggle buttons. */
function OptionGroup<T extends string>({ label, value, options, renderVisual, onChange }: OptionGroupProps<T>) {
  const name = useId();

  return (
    <fieldset className="options">
      <legend className="label">{label}</legend>
      <div className="list">
        {options.map((option) => (
          <label key={option.value} className={`item${value === option.value ? ' is-active' : ''}`}>
            <input
              className="radio"
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            {renderVisual(option.value)}
            <span className="txt">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default OptionGroup;

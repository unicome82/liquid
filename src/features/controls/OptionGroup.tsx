import { useId, type ReactNode } from 'react';

interface OptionGroupProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  /** Leading visual for each option (icon, swatch) */
  renderVisual: (value: T) => ReactNode;
  onChange: (value: T) => void;
  /** Swatch-only buttons; the option name stays for screen readers */
  isSwatch?: boolean;
}

/** Radio group styled as a grid of toggle buttons. */
function OptionGroup<T extends string>({
  label,
  value,
  options,
  renderVisual,
  onChange,
  isSwatch = false,
}: OptionGroupProps<T>) {
  const name = useId();
  const labelId = useId();

  return (
    // A div, not fieldset: legends can't sit in a grid row beside their options
    <div className={`options${isSwatch ? ' is-swatch' : ''}`} role="radiogroup" aria-labelledby={labelId}>
      <span className="label" id={labelId}>
        {label}
      </span>
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
            <span className={isSwatch ? 'is-hidden' : 'txt'}>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default OptionGroup;

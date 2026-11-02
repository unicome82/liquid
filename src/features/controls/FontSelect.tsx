import { useId } from 'react';
import { BACKDROP_FONTS, type BackdropFont } from '../../shared/settings';

interface FontSelectProps {
  value: BackdropFont;
  onChange: (font: BackdropFont) => void;
}

/** Temporary picker for trying typefaces on the backdrop copy. */
function FontSelect({ value, onChange }: FontSelectProps) {
  const id = useId();

  return (
    <div className="font-select">
      <label className="label" htmlFor={id}>
        Font
      </label>
      <select
        id={id}
        className="select"
        aria-label="Font"
        value={value}
        onChange={(e) => onChange(e.target.value as BackdropFont)}
      >
        {BACKDROP_FONTS.map((font) => (
          <option key={font.value} value={font.value}>
            {font.label}
          </option>
        ))}
      </select>
      <span className="material-symbols-outlined icon" aria-hidden="true">
        expand_more
      </span>
    </div>
  );
}

export default FontSelect;

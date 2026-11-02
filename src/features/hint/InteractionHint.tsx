import { useEffect, useState } from 'react';
import { INTERACTION_MODES, type InteractionMode } from '../../shared/settings';

interface InteractionHintProps {
  mode: InteractionMode;
}

/** Explains the active mode until the user first presses on the liquid; returns on mode change. */
function InteractionHint({ mode }: InteractionHintProps) {
  const [isVisible, setIsVisible] = useState(true);
  const hint = INTERACTION_MODES.find((item) => item.value === mode)?.hint ?? '';

  useEffect(() => {
    setIsVisible(true);
  }, [mode]);

  useEffect(() => {
    if (!isVisible) return;
    // Only presses on the liquid count; using the control panel shouldn't dismiss the guide
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof HTMLCanvasElement) setIsVisible(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [isVisible]);

  return (
    <p className={`hint${isVisible ? ' is-visible' : ''}`} aria-live="polite">
      <span className="material-symbols-outlined icon" aria-hidden="true">
        touch_app
      </span>
      <span className="txt">{hint}</span>
    </p>
  );
}

export default InteractionHint;

import { useEffect, useRef, useState } from 'react';
import type { LiquidSettings } from '../../shared/settings';
import { startLiquidLoop } from './loop';

interface LiquidCanvasProps {
  settings: LiquidSettings;
}

function LiquidCanvas({ settings }: LiquidCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Read every frame so the loop isn't restarted on each settings change
  const settingsRef = useRef(settings);
  const [isSupported, setIsSupported] = useState(true);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      return startLiquidLoop(canvas, () => settingsRef.current);
    } catch {
      setIsSupported(false);
    }
  }, []);

  if (!isSupported) return <div className="fallback" aria-hidden="true" />;
  return <canvas ref={canvasRef} className="canvas" aria-hidden="true" />;
}

export default LiquidCanvas;

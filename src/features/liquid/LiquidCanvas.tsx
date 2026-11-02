import { useEffect, useRef, useState } from 'react';
import type { LiquidSettings } from '../../shared/settings';
import { createLiquidRenderer } from './renderer';
import { buildScene, type Scene } from './scene';

interface LiquidCanvasProps {
  settings: LiquidSettings;
}

function LiquidCanvas({ settings }: LiquidCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<(() => void) | null>(null);
  // Read inside draw so the renderer isn't rebuilt on every settings change
  const amountRef = useRef(settings.amount);
  const [isSupported, setIsSupported] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: ReturnType<typeof createLiquidRenderer>;
    let scene: Scene;
    try {
      renderer = createLiquidRenderer(canvas);
      scene = buildScene();
    } catch {
      setIsSupported(false);
      return;
    }

    const draw = () => {
      renderer.resize();
      const aspect = canvas.clientWidth / canvas.clientHeight;
      renderer.render(scene.getBlobs(aspect, amountRef.current), scene.palette);
    };
    drawRef.current = draw;
    draw();

    const observer = new ResizeObserver(draw);
    observer.observe(canvas);

    return () => {
      observer.disconnect();
      drawRef.current = null;
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    amountRef.current = settings.amount;
    drawRef.current?.();
  }, [settings.amount]);

  if (!isSupported) return <div className="fallback" aria-hidden="true" />;
  return <canvas ref={canvasRef} className="canvas" aria-hidden="true" />;
}

export default LiquidCanvas;

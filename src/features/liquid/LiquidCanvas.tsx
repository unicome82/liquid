import { useEffect, useRef, useState } from 'react';
import { createLiquidRenderer } from './renderer';
import { buildScene, type Scene } from './scene';

function LiquidCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
      renderer.render(scene.getBlobs(aspect), scene.palette);
    };
    draw();

    const observer = new ResizeObserver(draw);
    observer.observe(canvas);

    return () => {
      observer.disconnect();
      renderer.dispose();
    };
  }, []);

  if (!isSupported) return <div className="fallback" aria-hidden="true" />;
  return <canvas ref={canvasRef} className="canvas" aria-hidden="true" />;
}

export default LiquidCanvas;

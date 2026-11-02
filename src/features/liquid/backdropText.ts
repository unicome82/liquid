// Sample poster copy behind the liquid; water drops refract it
const COPY = 'Touch the surface and watch it move, merge and split';
const FONT_FAMILY = "'DM Sans', sans-serif";
const FONT_WEIGHT = 500;
/** Font size as a fraction of the viewport width; portrait screens need relatively larger type */
const FONT_SCALE_LANDSCAPE = 0.105;
const FONT_SCALE_PORTRAIT = 0.17;
const LINE_HEIGHT = 1.02;
/** Side margin as a fraction of the width */
const MARGIN = 0.05;
// Text is rendered once per size, so cap the backing resolution to keep uploads light
const MAX_DPR = 2;

const fontFor = (size: number) => `${FONT_WEIGHT} ${size}px ${FONT_FAMILY}`;

function wrapLines(ctx: CanvasRenderingContext2D, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of COPY.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Draws the copy as a white alpha mask; the shader colours it per theme. */
export function drawBackdropText(target: HTMLCanvasElement, cssWidth: number, cssHeight: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  target.width = Math.round(cssWidth * dpr);
  target.height = Math.round(cssHeight * dpr);
  const ctx = target.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable for backdrop text');

  const { width, height } = target;
  const fontSize = width * (width >= height ? FONT_SCALE_LANDSCAPE : FONT_SCALE_PORTRAIT);
  const margin = width * MARGIN;
  ctx.clearRect(0, 0, width, height);
  ctx.font = fontFor(fontSize);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';

  const lines = wrapLines(ctx, width - margin * 2);
  const lineStep = fontSize * LINE_HEIGHT;
  const top = (height - lineStep * (lines.length - 1)) / 2;
  lines.forEach((line, i) => ctx.fillText(line, margin, top + i * lineStep));
}

/** Resolves once the backdrop font is usable, so the copy isn't drawn in a fallback face. */
export const backdropFontReady = () => document.fonts.load(fontFor(FONT_SCALE_LANDSCAPE * 1000));

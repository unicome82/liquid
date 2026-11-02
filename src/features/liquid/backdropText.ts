import { BACKDROP_FONTS, DEFAULT_SETTINGS, type BackdropFont } from '../../shared/settings';

// Sample poster copy behind the liquid; water drops refract it
const COPY = 'Touch the surface and watch it move, merge and split';
/** Font size as a fraction of the viewport width; portrait screens need relatively larger type */
const FONT_SCALE_LANDSCAPE = 0.105;
const FONT_SCALE_PORTRAIT = 0.17;
const LINE_HEIGHT = 1.02;
/** Side margin as a fraction of the width */
const MARGIN = 0.05;
/** Share of the height the copy may fill */
const MAX_BLOCK_HEIGHT = 0.7;
const SHRINK_STEP = 0.92;
const MIN_FONT_PX = 12;
// Text is rendered once per size, so cap the backing resolution to keep uploads light
const MAX_DPR = 2;

function fontFor(font: BackdropFont, size: number): string {
  const face = BACKDROP_FONTS.find((item) => item.value === font) ?? BACKDROP_FONTS[0];
  return `${face.weight} ${size}px ${face.family}`;
}

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
export function drawBackdropText(
  target: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
  font: BackdropFont = DEFAULT_SETTINGS.font,
) {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  target.width = Math.round(cssWidth * dpr);
  target.height = Math.round(cssHeight * dpr);
  const ctx = target.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable for backdrop text');

  const { width, height } = target;
  const margin = width * MARGIN;
  let fontSize = width * (width >= height ? FONT_SCALE_LANDSCAPE : FONT_SCALE_PORTRAIT);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';

  // Wide faces wrap into more lines; shrink until the block clears the logo and edges
  let lines: string[];
  do {
    ctx.font = fontFor(font, fontSize);
    lines = wrapLines(ctx, width - margin * 2);
    if (lines.length * fontSize * LINE_HEIGHT <= height * MAX_BLOCK_HEIGHT) break;
    fontSize *= SHRINK_STEP;
  } while (fontSize > MIN_FONT_PX);
  const lineStep = fontSize * LINE_HEIGHT;
  const top = (height - lineStep * (lines.length - 1)) / 2;
  lines.forEach((line, i) => ctx.fillText(line, margin, top + i * lineStep));
}

/** Resolves once the backdrop font is usable, so the copy isn't drawn in a fallback face. */
export const backdropFontReady = (font: BackdropFont) =>
  document.fonts.load(fontFor(font, FONT_SCALE_LANDSCAPE * 1000));

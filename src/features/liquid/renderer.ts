import { backdropFontReady, drawBackdropText } from './backdropText';
import { CUT_POINTS, type CutPoint } from './cut';
import { isTouchDevice } from './quality';
import { MAX_RIPPLES, type Ripple } from './ripple';
import { BLOB_COUNT, FRAGMENT_SHADER, VERTEX_SHADER } from './shaders';

export type Rgb = [number, number, number];

export interface Blob {
  /** 0–1 across the viewport width */
  x: number;
  /** 0–1 down the viewport height */
  y: number;
  /** Fraction of the viewport's shorter side */
  radius: number;
  color: Rgb;
  /** Smooth-union range for this blob; omitted uses the shader's default */
  merge?: number;
  /** Connected body of liquid it belongs to; ripples stay within one */
  group?: number;
  /** Long axis in short-side units (y down); its length is the elongation share */
  stretch?: [number, number];
}

export interface Palette {
  bgTop: Rgb;
  bgBottom: Rgb;
  bgAccent: Rgb;
  transition: Rgb;
  /** 0–1 blend toward chrome */
  metal: number;
  /** 0–1 blend toward clear water */
  water: number;
  /** Colour of the backdrop copy */
  text: Rgb;
}

export interface LiquidRenderer {
  /** @param scale 0–1 resolution multiplier from adaptive quality */
  resize: (scale: number) => void;
  render: (blobs: Blob[], cuts: CutPoint[], ripples: Ripple[], palette: Palette) => void;
  dispose: () => void;
}

// Caps fill-rate cost. Phones keep 2 too: at 1.5 the drop edges and copy looked soft
const MAX_DPR_DESKTOP = 2;
const MAX_DPR_TOUCH = 2;
// Parks unused blob slots far off-screen so they never contribute
const OFFSCREEN = 1e4;
const FULLSCREEN_TRIANGLE = new Float32Array([-1, -1, 3, -1, -1, 3]);
const STRIDE = 3;
// Blobs carry x, y, radius and merge range
const BLOB_STRIDE = 4;
const STRETCH_STRIDE = 2;
// Tells the shader to fall back to its default merge range
const DEFAULT_MERGE = 0;
// Matches no ripple, whose groups start at 0
const NO_GROUP = -2;

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create shader');

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error('Failed to create program');

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${log}`);
  }
  return program;
}

export function createLiquidRenderer(canvas: HTMLCanvasElement): LiquidRenderer {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) throw new Error('WebGL is not supported');

  const program = createProgram(gl);
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, FULLSCREEN_TRIANGLE, gl.STATIC_DRAW);
  const positionLoc = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(positionLoc);
  gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {
    resolution: gl.getUniformLocation(program, 'uResolution'),
    blobs: gl.getUniformLocation(program, 'uBlobs'),
    colors: gl.getUniformLocation(program, 'uColors'),
    cuts: gl.getUniformLocation(program, 'uCuts'),
    cutCount: gl.getUniformLocation(program, 'uCutCount'),
    blobCount: gl.getUniformLocation(program, 'uBlobCount'),
    ripples: gl.getUniformLocation(program, 'uRipples'),
    rippleCount: gl.getUniformLocation(program, 'uRippleCount'),
    blobGroups: gl.getUniformLocation(program, 'uBlobGroups'),
    stretch: gl.getUniformLocation(program, 'uStretch'),
    rippleGroups: gl.getUniformLocation(program, 'uRippleGroups'),
    bgTop: gl.getUniformLocation(program, 'uBgTop'),
    bgBottom: gl.getUniformLocation(program, 'uBgBottom'),
    bgAccent: gl.getUniformLocation(program, 'uBgAccent'),
    transition: gl.getUniformLocation(program, 'uTransition'),
    metal: gl.getUniformLocation(program, 'uMetal'),
    water: gl.getUniformLocation(program, 'uWater'),
    text: gl.getUniformLocation(program, 'uText'),
    textColor: gl.getUniformLocation(program, 'uTextColor'),
  };

  const blobData = new Float32Array(BLOB_COUNT * BLOB_STRIDE);
  const colorData = new Float32Array(BLOB_COUNT * STRIDE);
  const cutData = new Float32Array(CUT_POINTS * STRIDE);
  const rippleData = new Float32Array(MAX_RIPPLES * BLOB_STRIDE);
  const blobGroupData = new Float32Array(BLOB_COUNT);
  const stretchData = new Float32Array(BLOB_COUNT * STRETCH_STRIDE);
  const rippleGroupData = new Float32Array(MAX_RIPPLES);

  // Backdrop copy: drawn on a 2D canvas, uploaded as a texture, redrawn only when the
  // CSS size changes (adaptive quality rescales the GL canvas far more often)
  const textCanvas = document.createElement('canvas');
  const textTexture = gl.createTexture();
  let textSizeKey = '';
  gl.bindTexture(gl.TEXTURE_2D, textTexture);
  // Non-power-of-two textures in WebGL 1 need clamping and no mipmaps
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.uniform1i(uniforms.text, 0);

  function updateText(force = false) {
    const key = `${canvas.clientWidth}x${canvas.clientHeight}`;
    if (!force && key === textSizeKey) return;
    textSizeKey = key;
    drawBackdropText(textCanvas, canvas.clientWidth, canvas.clientHeight);
    gl!.bindTexture(gl!.TEXTURE_2D, textTexture);
    // Canvas rows run top-down, GL texture rows bottom-up
    gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, true);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, textCanvas);
  }

  backdropFontReady()
    .then(() => updateText(true))
    // Fallback face is already drawn; nothing else to do
    .catch(() => {});

  const maxDpr = isTouchDevice() ? MAX_DPR_TOUCH : MAX_DPR_DESKTOP;

  function resize(scale: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr) * scale;
    const width = Math.round(canvas.clientWidth * dpr);
    const height = Math.round(canvas.clientHeight * dpr);
    updateText();
    if (canvas.width === width && canvas.height === height) return;

    canvas.width = width;
    canvas.height = height;
    gl!.viewport(0, 0, width, height);
  }

  // Converts viewport fractions into the shader's centered, short-side-normalized space
  function toScene(x: number, y: number): [number, number] {
    const { width, height } = canvas;
    const minSide = Math.min(width, height);
    return [((x - 0.5) * width) / minSide, ((0.5 - y) * height) / minSide];
  }

  function packBlobs(blobs: Blob[]) {
    stretchData.fill(0);
    for (let i = 0; i < BLOB_COUNT; i++) {
      const blob = blobs[i];
      if (!blob) {
        blobData.set([OFFSCREEN, OFFSCREEN, 0, DEFAULT_MERGE], i * BLOB_STRIDE);
        continue;
      }
      blobData.set(
        [...toScene(blob.x, blob.y), blob.radius, blob.merge ?? DEFAULT_MERGE],
        i * BLOB_STRIDE,
      );
      colorData.set(blob.color, i * STRIDE);
      blobGroupData[i] = blob.group ?? NO_GROUP;
      // Short-side units already match scene units; only y flips to point up
      if (blob.stretch) stretchData.set([blob.stretch[0], -blob.stretch[1]], i * STRETCH_STRIDE);
    }
  }

  // Unused slots get zero width, which the shader skips
  function packCuts(cuts: CutPoint[]) {
    cutData.fill(0);
    cuts.slice(0, CUT_POINTS).forEach((cut, i) => {
      cutData.set([...toScene(cut.x, cut.y), cut.width], i * STRIDE);
    });
  }

  function packRipples(ripples: Ripple[]) {
    rippleData.fill(0);
    ripples.slice(0, MAX_RIPPLES).forEach((ripple, i) => {
      rippleData.set(
        [...toScene(ripple.x, ripple.y), ripple.radius, ripple.amplitude],
        i * BLOB_STRIDE,
      );
      rippleGroupData[i] = ripple.group;
    });
  }

  function render(blobs: Blob[], cuts: CutPoint[], ripples: Ripple[], palette: Palette) {
    packBlobs(blobs);
    packCuts(cuts);
    packRipples(ripples);
    gl!.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl!.uniform4fv(uniforms.blobs, blobData);
    gl!.uniform3fv(uniforms.colors, colorData);
    gl!.uniform3fv(uniforms.cuts, cutData);
    gl!.uniform1i(uniforms.cutCount, Math.min(cuts.length, CUT_POINTS));
    gl!.uniform1i(uniforms.blobCount, Math.min(blobs.length, BLOB_COUNT));
    gl!.uniform4fv(uniforms.ripples, rippleData);
    gl!.uniform1i(uniforms.rippleCount, Math.min(ripples.length, MAX_RIPPLES));
    gl!.uniform1fv(uniforms.blobGroups, blobGroupData);
    gl!.uniform2fv(uniforms.stretch, stretchData);
    gl!.uniform1fv(uniforms.rippleGroups, rippleGroupData);
    gl!.uniform3fv(uniforms.bgTop, palette.bgTop);
    gl!.uniform3fv(uniforms.bgBottom, palette.bgBottom);
    gl!.uniform3fv(uniforms.bgAccent, palette.bgAccent);
    gl!.uniform3fv(uniforms.transition, palette.transition);
    gl!.uniform1f(uniforms.metal, palette.metal);
    gl!.uniform1f(uniforms.water, palette.water);
    gl!.uniform3fv(uniforms.textColor, palette.text);
    gl!.drawArrays(gl!.TRIANGLES, 0, FULLSCREEN_TRIANGLE.length / 2);
  }

  // Context is kept alive: StrictMode remounts reuse the same canvas
  function dispose() {
    gl!.deleteBuffer(buffer);
    gl!.deleteTexture(textTexture);
    gl!.deleteProgram(program);
  }

  return { resize, render, dispose };
}

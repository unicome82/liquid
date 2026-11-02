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
}

export interface Palette {
  bgTop: Rgb;
  bgBottom: Rgb;
  bgAccent: Rgb;
  shadowTint: Rgb;
  transition: Rgb;
}

export interface LiquidRenderer {
  /** @param scale 0–1 resolution multiplier from adaptive quality */
  resize: (scale: number) => void;
  render: (blobs: Blob[], palette: Palette) => void;
  dispose: () => void;
}

// Caps fill-rate cost; touch devices get a lower cap since their GPUs are weaker
const MAX_DPR_DESKTOP = 2;
const MAX_DPR_TOUCH = 1.5;
// Parks unused blob slots far off-screen so they never contribute
const OFFSCREEN = 1e4;
const FULLSCREEN_TRIANGLE = new Float32Array([-1, -1, 3, -1, -1, 3]);
const STRIDE = 3;

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
    bgTop: gl.getUniformLocation(program, 'uBgTop'),
    bgBottom: gl.getUniformLocation(program, 'uBgBottom'),
    bgAccent: gl.getUniformLocation(program, 'uBgAccent'),
    shadowTint: gl.getUniformLocation(program, 'uShadowTint'),
    transition: gl.getUniformLocation(program, 'uTransition'),
  };

  const blobData = new Float32Array(BLOB_COUNT * STRIDE);
  const colorData = new Float32Array(BLOB_COUNT * STRIDE);

  const maxDpr = window.matchMedia('(pointer: coarse)').matches ? MAX_DPR_TOUCH : MAX_DPR_DESKTOP;

  function resize(scale: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr) * scale;
    const width = Math.round(canvas.clientWidth * dpr);
    const height = Math.round(canvas.clientHeight * dpr);
    if (canvas.width === width && canvas.height === height) return;

    canvas.width = width;
    canvas.height = height;
    gl!.viewport(0, 0, width, height);
  }

  // Converts viewport-relative layout into the shader's centered, short-side-normalized space
  function packBlobs(blobs: Blob[]) {
    const { width, height } = canvas;
    const minSide = Math.min(width, height);

    for (let i = 0; i < BLOB_COUNT; i++) {
      const offset = i * STRIDE;
      const blob = blobs[i];
      if (!blob) {
        blobData.set([OFFSCREEN, OFFSCREEN, 0], offset);
        continue;
      }
      blobData.set(
        [((blob.x - 0.5) * width) / minSide, ((0.5 - blob.y) * height) / minSide, blob.radius],
        offset,
      );
      colorData.set(blob.color, offset);
    }
  }

  function render(blobs: Blob[], palette: Palette) {
    packBlobs(blobs);
    gl!.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl!.uniform3fv(uniforms.blobs, blobData);
    gl!.uniform3fv(uniforms.colors, colorData);
    gl!.uniform3fv(uniforms.bgTop, palette.bgTop);
    gl!.uniform3fv(uniforms.bgBottom, palette.bgBottom);
    gl!.uniform3fv(uniforms.bgAccent, palette.bgAccent);
    gl!.uniform3fv(uniforms.shadowTint, palette.shadowTint);
    gl!.uniform3fv(uniforms.transition, palette.transition);
    gl!.drawArrays(gl!.TRIANGLES, 0, FULLSCREEN_TRIANGLE.length / 2);
  }

  // Context is kept alive: StrictMode remounts reuse the same canvas
  function dispose() {
    gl!.deleteBuffer(buffer);
    gl!.deleteProgram(program);
  }

  return { resize, render, dispose };
}

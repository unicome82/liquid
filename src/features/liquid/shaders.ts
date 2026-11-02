import { AMOUNT_RANGE } from '../../shared/settings';
import { CUT_POINTS } from './cut';
import { EXTRA_BLOBS } from './stretch';

// Shader arrays are fixed-size, so allocate for the largest amount plus the stretch strand
export const BLOB_COUNT = AMOUNT_RANGE.max + EXTRA_BLOBS;

export const VERTEX_SHADER = `
attribute vec2 aPosition;

void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER = `
precision highp float;

#define BLOB_COUNT ${BLOB_COUNT}
#define CUT_POINTS ${CUT_POINTS}

uniform vec2 uResolution;
uniform vec4 uBlobs[BLOB_COUNT];   // xy: center (scene units), z: radius, w: merge range (0 = default)
uniform vec3 uColors[BLOB_COUNT];
uniform vec3 uCuts[CUT_POINTS];    // xy: trail point (scene units), z: groove half-width
uniform vec3 uBgTop;
uniform vec3 uBgBottom;
uniform vec3 uBgAccent;
uniform vec3 uShadowTint;
uniform vec3 uTransition;

// Larger k = fatter necks where blobs meet, which reads as viscous
const float MERGE_K = 0.28;
// Rounds the lips of a cut so it reads as parted liquid, not a hard slice
const float CUT_SMOOTH = 0.1;
// Depth of the rounded rim; smaller = flatter, larger = puffier
const float BEVEL = 0.12;
// How quickly neighbouring blob colours fade into each other
const float COLOR_SHARPNESS = 6.0;
// Lifts the zone between two hues toward a light tone so blue→peach doesn't go grey
const float TRANSITION_LIFT = 0.65;

const vec2 SHADOW_OFFSET = vec2(0.025, -0.045);
const float SHADOW_BLUR = 0.14;
const float SHADOW_STRENGTH = 0.2;
const float ACCENT_AMOUNT = 0.2;

const vec3 LIGHT_DIR = vec3(-0.45, 0.6, 0.66);
const float SHADE_MIN = 0.9;
const float SPECULAR_POWER = 90.0;
const float SPECULAR_STRENGTH = 0.4;
const float SHEEN_POWER = 6.0;
const float SHEEN_STRENGTH = 0.12;
const float RIM_STRENGTH = 0.45;
const float NORMAL_SAMPLE_PX = 2.0;

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

// Takes the blob itself: GLSL ES 1.0 forbids indexing arrays with function params
float blobSdf(vec2 p, vec4 blob) {
  return length(p - blob.xy) - blob.z;
}

float smax(float a, float b, float k) {
  return -smin(-a, -b, k);
}

// Capsule whose radius blends from a.z to b.z, so the groove tapers without steps
float taperedSegmentSdf(vec2 p, vec3 a, vec3 b) {
  vec2 pa = p - a.xy;
  vec2 ba = b.xy - a.xy;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h) - mix(a.z, b.z, h);
}

float cutSdf(vec2 p) {
  float d = 1e5;
  for (int i = 0; i < CUT_POINTS - 1; i++) {
    // Zero width marks an unused slot (or a fully healed point)
    if (min(uCuts[i].z, uCuts[i + 1].z) <= 0.0) continue;
    // Plain min is seamless here: tapered neighbours share the same radius at each joint
    d = min(d, taperedSegmentSdf(p, uCuts[i], uCuts[i + 1]));
  }
  return d;
}

float sceneSdf(vec2 p) {
  float d = 1e5;
  for (int i = 0; i < BLOB_COUNT; i++) {
    float k = uBlobs[i].w > 0.0 ? uBlobs[i].w : MERGE_K;
    d = smin(d, blobSdf(p, uBlobs[i]), k);
  }
  return smax(d, -cutSdf(p), CUT_SMOOTH);
}

// Circular profile so the rim curves down like a droplet edge
float heightFromSdf(float d) {
  float inside = clamp(-d / BEVEL, 0.0, 1.0);
  float t = 1.0 - inside;
  return sqrt(1.0 - t * t) * BEVEL;
}

vec3 liquidColor(vec2 p) {
  vec3 sum = vec3(0.0);
  float total = 0.0;
  float maxW = 0.0;
  for (int i = 0; i < BLOB_COUNT; i++) {
    float w = exp(-blobSdf(p, uBlobs[i]) * COLOR_SHARPNESS);
    sum += uColors[i] * w;
    total += w;
    maxW = max(maxW, w);
  }
  float mixAmount = 1.0 - maxW / total;
  return mix(sum / total, uTransition, mixAmount * TRANSITION_LIFT);
}

vec3 background(vec2 uv, vec2 p, float d) {
  vec3 bg = mix(uBgBottom, uBgTop, uv.y);
  float accent = smoothstep(0.7, 0.0, uv.y) * smoothstep(0.0, 1.0, uv.x);
  bg = mix(bg, uBgAccent, accent * ACCENT_AMOUNT);

  // Beyond this distance the offset shadow is fully transparent, so skip its SDF pass
  float shadowReach = SHADOW_BLUR + length(SHADOW_OFFSET);
  if (d > shadowReach) return bg;

  float shadowD = sceneSdf(p - SHADOW_OFFSET);
  float shadow = 1.0 - smoothstep(-SHADOW_BLUR * 0.5, SHADOW_BLUR, shadowD);
  return mix(bg, bg * uShadowTint, shadow * SHADOW_STRENGTH);
}

vec3 shadeLiquid(vec2 p, float d, float px) {
  float eps = NORMAL_SAMPLE_PX * px;
  float h = heightFromSdf(d);
  float hx = heightFromSdf(sceneSdf(p + vec2(eps, 0.0)));
  float hy = heightFromSdf(sceneSdf(p + vec2(0.0, eps)));
  vec3 n = normalize(vec3(-(hx - h) / eps, -(hy - h) / eps, 1.0));

  vec3 l = normalize(LIGHT_DIR);
  vec3 halfVec = normalize(l + vec3(0.0, 0.0, 1.0));
  float diffuse = clamp(dot(n, l), 0.0, 1.0);
  float nh = max(dot(n, halfVec), 0.0);
  float fresnel = pow(1.0 - n.z, 3.0);

  vec3 base = liquidColor(p);
  vec3 col = base * mix(SHADE_MIN, 1.0, diffuse);
  col += mix(base, vec3(1.0), 0.6) * fresnel * RIM_STRENGTH * diffuse;
  col += pow(nh, SHEEN_POWER) * SHEEN_STRENGTH;
  col += pow(nh, SPECULAR_POWER) * SPECULAR_STRENGTH;
  return col;
}

void main() {
  float minSide = min(uResolution.x, uResolution.y);
  float px = 1.0 / minSide;
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) * px;

  float d = sceneSdf(p);
  vec3 bg = background(uv, p, d);
  float coverage = 1.0 - smoothstep(-px, px, d);

  if (coverage <= 0.0) {
    gl_FragColor = vec4(bg, 1.0);
    return;
  }

  gl_FragColor = vec4(mix(bg, shadeLiquid(p, d, px), coverage), 1.0);
}
`;

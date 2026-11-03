import { AMOUNT_RANGE } from '../../shared/settings';
import { CUT_POINTS } from './cut';

// Shader arrays are fixed-size, so allocate for the largest amount
export const BLOB_COUNT = AMOUNT_RANGE.max;

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
uniform int uCutCount;             // live points; the rest of uCuts is unused
uniform vec3 uDents[CUT_POINTS];   // fingertip press trail, same layout as uCuts
uniform int uDentCount;
uniform vec3 uPullRoot;            // xy: dough pulled out of a blob (scene units), z: radius
uniform vec3 uPullTip;             // z = 0 means nothing is pulled
uniform vec3 uPullColor;
uniform vec3 uBgTop;
uniform vec3 uBgBottom;
uniform vec3 uBgAccent;
uniform vec3 uShadowTint;
uniform vec3 uTransition;
uniform float uMetal;              // 0–1 blend toward chrome
uniform float uWater;              // 0–1 blend toward clear water
uniform sampler2D uText;           // alpha mask of the backdrop copy
uniform vec3 uTextColor;

// Larger k = fatter necks where blobs meet, which reads as viscous
const float MERGE_K = 0.28;
// Rounds the lips of a cut so it reads as parted liquid, not a hard slice
const float CUT_SMOOTH = 0.1;
// Fillet where pulled dough meets its blob; tighter than MERGE_K so it reads as an arm
const float PULL_MERGE = 0.12;
// Fingertip dent: full depth this far inside the press, fading out just past its edge
const float DENT_DEPTH = 0.02;
const float DENT_BOWL = 0.06;
const float DENT_RIM = 0.02;
const float DENT_SMOOTH = 0.03;
// Colours closer than this count as one hue, so a blob and its own dough don't read as a seam
const float COLOR_MATCH = 0.02;
const float SOLE_HUE = 0.999;
// Layout blobs plus the pulled dough
#define COLOR_PARTS ${BLOB_COUNT + 1}
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
const float TEXT_OPACITY = 0.85;

const vec3 LIGHT_DIR = vec3(-0.45, 0.6, 0.66);
const float SHADE_MIN = 0.9;
const float SPECULAR_POWER = 90.0;
const float SPECULAR_STRENGTH = 0.4;
const float SHEEN_POWER = 6.0;
const float SHEEN_STRENGTH = 0.12;
const float RIM_STRENGTH = 0.45;
const float NORMAL_SAMPLE_PX = 2.0;

// Chrome reflects a fake studio: bright sky, dark horizon band, dim floor, one softbox
const float ENV_FACING = 0.9;
const float ENV_SKY = 0.35;
const float ENV_FLOOR = 0.45;
// Stacked dark bands (reflection height, width, darkness), like a studio's window frames;
// each one repeats along the rim, which gives the layered contour lines of liquid chrome
const vec3 ENV_BAND_1 = vec3(-0.3, 0.07, 0.9);
const vec3 ENV_BAND_2 = vec3(0.32, 0.045, 0.65);
const vec3 ENV_BAND_3 = vec3(-0.58, 0.05, 0.6);
const vec3 ENV_BAND_4 = vec3(0.62, 0.035, 0.5);
const vec3 ENV_BAND_5 = vec3(-0.82, 0.04, 0.45);
const vec2 ENV_SOFTBOX = vec2(-0.45, 0.55);
const float ENV_SOFTBOX_SHARPNESS = 18.0;
const float ENV_SOFTBOX_STRENGTH = 1.3;
// Caps how tall chrome swells, so it sits flatter like the pastel liquid
const float METAL_HEIGHT_CEILING = 0.12;
const float METAL_WHITE_START = 0.85;
const float METAL_WHITE_END = 1.2;
const float METAL_EDGE_LIFT = 0.12;
// Second, softer band left of centre so wide surfaces don't read as one flat grey
const float ENV_STREAK_X = -0.35;
const float ENV_STREAK_WIDTH = 0.4;
const float ENV_STREAK_DARK = 0.3;

// Water bends the background through the drop and catches a sharp highlight
// A thin film lying on the text: the flat middle shows it undistorted, only the
// curved rim bends it
const float WATER_REFRACTION = 0.06;
const float WATER_HEIGHT_CEILING = 0.05;
const float WATER_TINT = 0.5;
const float WATER_CAUSTIC = 0.18;
const float WATER_EDGE_DARK = 0.35;
const float WATER_RIM_LIGHT = 0.35;
const float WATER_SPECULAR_POWER = 220.0;
const float WATER_SPECULAR_STRENGTH = 1.1;

// Brightness reflected along r (r.z > 0 points back toward the viewer)
float envBand(float y, vec3 band) {
  float t = (y - band.x) / band.y;
  return 1.0 - band.z * exp(-t * t);
}

float envLight(vec3 r) {
  float v = ENV_FACING + ENV_SKY * smoothstep(0.0, 0.8, r.y);
  v = mix(v, ENV_FLOOR, smoothstep(-0.2, -0.9, r.y));
  v *= envBand(r.y, ENV_BAND_1) * envBand(r.y, ENV_BAND_2) * envBand(r.y, ENV_BAND_3);
  v *= envBand(r.y, ENV_BAND_4) * envBand(r.y, ENV_BAND_5);
  float streak = (r.x - ENV_STREAK_X) / ENV_STREAK_WIDTH;
  v *= 1.0 - ENV_STREAK_DARK * exp(-streak * streak);
  vec2 toBox = r.xy - ENV_SOFTBOX;
  v += ENV_SOFTBOX_STRENGTH * exp(-dot(toBox, toBox) * ENV_SOFTBOX_SHARPNESS);
  return v;
}

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

// smoothing 0 = plain min; above 0 blends the segments so their joints leave no crease
float trailSdf(vec2 p, vec3 points[CUT_POINTS], int count, float smoothing) {
  // A press that hasn't moved yet is a single round fingertip
  if (count == 1) return length(p - points[0].xy) - points[0].z;
  float d = 1e5;
  for (int i = 0; i < CUT_POINTS - 1; i++) {
    // GLSL ES 1.0 needs a constant bound, so stop at the live count instead
    if (i + 1 >= count) break;
    // Zero width marks an unused slot (or a fully healed point)
    if (min(points[i].z, points[i + 1].z) <= 0.0) continue;
    // Plain min keeps the outline seamless (tapered neighbours share radii at each joint),
    // but its inner ridges catch the light, so shading-only trails blend instead
    float segment = taperedSegmentSdf(p, points[i], points[i + 1]);
    d = smoothing > 0.0 ? smin(d, segment, smoothing) : min(d, segment);
  }
  return d;
}

float pullSdf(vec2 p) {
  return taperedSegmentSdf(p, uPullRoot, uPullTip);
}

float sceneSdf(vec2 p) {
  float d = 1e5;
  for (int i = 0; i < BLOB_COUNT; i++) {
    float k = uBlobs[i].w > 0.0 ? uBlobs[i].w : MERGE_K;
    d = smin(d, blobSdf(p, uBlobs[i]), k);
  }
  if (uPullTip.z > 0.0) d = smin(d, pullSdf(p), PULL_MERGE);
  // No groove: skip the carve entirely, it runs for every normal/shadow sample
  if (uCutCount < 2) return d;
  return smax(d, -trailSdf(p, uCuts, uCutCount, 0.0), CUT_SMOOTH);
}

// Surface pushed down under the fingertip trail; only shading reads it, the outline stays
float dentDepth(vec2 p) {
  if (uDentCount < 1) return 0.0;
  return DENT_DEPTH * smoothstep(DENT_RIM, -DENT_BOWL, trailSdf(p, uDents, uDentCount, DENT_SMOOTH));
}

// Circular profile so the rim curves down like a droplet edge
float heightFromSdf(float d) {
  float inside = clamp(-d / BEVEL, 0.0, 1.0);
  float t = 1.0 - inside;
  return sqrt(1.0 - t * t) * BEVEL;
}

// Blob radius around p, blended like the colours, for the dome profile below
float localRadius(vec2 p) {
  float sum = 0.0;
  float total = 0.0;
  for (int i = 0; i < BLOB_COUNT; i++) {
    float w = exp(-blobSdf(p, uBlobs[i]) * COLOR_SHARPNESS);
    sum += uBlobs[i].z * w;
    total += w;
  }
  return sum / max(total, 1e-6);
}

// Full rounded body for chrome and water: for a lone circle this is an exact hemisphere
// (sqrt(r² - |q|²) rewritten in terms of the SDF), and it stays smooth across necks.
// A plain deep bevel instead peaks in a cone at each centre.
float domeHeight(vec2 p) {
  float r = localRadius(p);
  float d = max(sceneSdf(p), -r);
  return sqrt(max(-d * (2.0 * r + d), 0.0));
}

vec3 liquidColor(vec2 p) {
  float weights[COLOR_PARTS];
  vec3 colors[COLOR_PARTS];
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < BLOB_COUNT; i++) {
    weights[i] = exp(-blobSdf(p, uBlobs[i]) * COLOR_SHARPNESS);
    colors[i] = uColors[i];
  }
  weights[BLOB_COUNT] = uPullTip.z > 0.0 ? exp(-pullSdf(p) * COLOR_SHARPNESS) : 0.0;
  colors[BLOB_COUNT] = uPullColor;
  float maxW = 0.0;
  for (int i = 0; i < COLOR_PARTS; i++) {
    sum += colors[i] * weights[i];
    total += weights[i];
    maxW = max(maxW, weights[i]);
  }
  // Deep inside a single blob nothing else contributes; skip the pairwise pass below
  if (maxW / total > SOLE_HUE) return sum / total;

  // Share of weight from a different hue (Gini impurity): 0 inside one colour, 0.5 midway
  // between two. Overlapping parts of one colour, like a blob and its own dough, stay 0
  float sameHue = 0.0;
  for (int i = 0; i < COLOR_PARTS; i++) {
    for (int j = 0; j < COLOR_PARTS; j++) {
      if (distance(colors[i], colors[j]) < COLOR_MATCH) sameHue += weights[i] * weights[j];
    }
  }
  float mixAmount = 1.0 - sameHue / (total * total);
  return mix(sum / total, uTransition, mixAmount * TRANSITION_LIFT);
}

vec3 backdrop(vec2 uv) {
  vec3 bg = mix(uBgBottom, uBgTop, uv.y);
  float accent = smoothstep(0.7, 0.0, uv.y) * smoothstep(0.0, 1.0, uv.x);
  bg = mix(bg, uBgAccent, accent * ACCENT_AMOUNT);
  return mix(bg, uTextColor, texture2D(uText, uv).a * TEXT_OPACITY);
}

vec3 background(vec2 uv, vec2 p, float d) {
  vec3 bg = backdrop(uv);

  // Beyond this distance the offset shadow is fully transparent, so skip its SDF pass
  float shadowReach = SHADOW_BLUR + length(SHADOW_OFFSET);
  if (d > shadowReach) return bg;

  float shadowD = sceneSdf(p - SHADOW_OFFSET);
  float shadow = 1.0 - smoothstep(-SHADOW_BLUR * 0.5, SHADOW_BLUR, shadowD);
  return mix(bg, bg * uShadowTint, shadow * SHADOW_STRENGTH);
}

// Soft ceiling on dome height: rims stay round but tops level out like a puddle.
// 0 disables it (full hemisphere)
float flatten(float h, float ceiling) {
  return ceiling > 0.0 ? h / (1.0 + h / ceiling) : h;
}

vec3 domeNormal(vec2 p, float eps, float ceiling) {
  vec2 ex = vec2(eps, 0.0);
  vec2 ey = vec2(0.0, eps);
  float h = flatten(domeHeight(p), ceiling) - dentDepth(p);
  float hx = flatten(domeHeight(p + ex), ceiling) - dentDepth(p + ex);
  float hy = flatten(domeHeight(p + ey), ceiling) - dentDepth(p + ey);
  return normalize(vec3(-(hx - h) / eps, -(hy - h) / eps, 1.0));
}

vec3 shadeChrome(vec3 base, vec3 n) {
  vec3 r = reflect(vec3(0.0, 0.0, -1.0), n);
  float light = envLight(r);
  // Bright reflections wash out the metal's tint, so gold's highlights read white, not cream
  float whiten = smoothstep(METAL_WHITE_START, METAL_WHITE_END, light);
  vec3 col = mix(base * light, vec3(light), whiten);
  // Grazing angles reflect more, so rims brighten toward white
  return col + (1.0 - n.z) * METAL_EDGE_LIFT;
}

vec3 shadeWater(vec2 uv, vec3 tint, vec3 n, vec3 l, vec3 halfVec) {
  vec3 seen = backdrop(uv + n.xy * WATER_REFRACTION) * mix(vec3(1.0), tint, WATER_TINT);
  float edge = 1.0 - n.z;
  // Thin dark outline where light reflects away at the drop's edge
  seen *= 1.0 - smoothstep(0.4, 0.95, edge) * WATER_EDGE_DARK;
  // Light focused through the drop lands on the side opposite the highlight
  seen += max(dot(normalize(n.xy + 1e-4), -l.xy), 0.0) * edge * WATER_CAUSTIC;
  seen += pow(edge, 3.0) * WATER_RIM_LIGHT;
  return seen + pow(max(dot(n, halfVec), 0.0), WATER_SPECULAR_POWER) * WATER_SPECULAR_STRENGTH;
}

vec3 shadeLiquid(vec2 uv, vec2 p, float d, float px) {
  float eps = NORMAL_SAMPLE_PX * px;
  vec2 ex = vec2(eps, 0.0);
  vec2 ey = vec2(0.0, eps);
  float h = heightFromSdf(d) - dentDepth(p);
  float hx = heightFromSdf(sceneSdf(p + ex)) - dentDepth(p + ex);
  float hy = heightFromSdf(sceneSdf(p + ey)) - dentDepth(p + ey);
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

  // Only pay for the dome normal when a material actually uses it
  if (uMetal + uWater <= 0.0) return col;
  if (uMetal > 0.0) col = mix(col, shadeChrome(base, domeNormal(p, eps, METAL_HEIGHT_CEILING)), uMetal);
  if (uWater > 0.0) col = mix(col, shadeWater(uv, base, domeNormal(p, eps, WATER_HEIGHT_CEILING), l, halfVec), uWater);
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

  gl_FragColor = vec4(mix(bg, shadeLiquid(uv, p, d, px), coverage), 1.0);
}
`;

import { AMOUNT_RANGE } from '../../shared/settings';
import { CUT_POINTS } from './cut';
import { MAX_RIPPLES } from './ripple';

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
#define MAX_RIPPLES ${MAX_RIPPLES}

uniform vec2 uResolution;
uniform vec4 uBlobs[BLOB_COUNT];   // xy: center (scene units), z: radius, w: merge range (0 = default)
uniform int uBlobCount;            // live blobs; loops stop here instead of walking empty slots
uniform vec3 uColors[BLOB_COUNT];
uniform vec3 uCuts[CUT_POINTS];    // xy: trail point (scene units), z: groove half-width
uniform int uCutCount;             // live points; the rest of uCuts is unused
uniform vec4 uRipples[MAX_RIPPLES]; // xy: centre (scene units), z: ring radius, w: amplitude
uniform int uRippleCount;
uniform vec2 uStretch[BLOB_COUNT]; // long axis (scene units); its length is the elongation share
uniform float uBlobGroups[BLOB_COUNT];   // connected body of liquid per blob
uniform float uRippleGroups[MAX_RIPPLES]; // the body each ring travels through
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
const float STRETCH_EPSILON = 1e-3;
// Ripple ring: a short wave packet this wide, with crests this far apart
const float RIPPLE_WIDTH = 0.15;
const float RIPPLE_WAVELENGTH = 0.14;
const float TAU = 6.28318;
// Edge displacement per unit of wave height
const float RIPPLE_OUTLINE = 0.8;
const float RIPPLE_EDGE_REACH = 0.025;
// Depth of the rounded rim; smaller = flatter, larger = puffier
const float BEVEL = 0.12;
// Small beads get a rim this share of their radius, so they keep a flat top instead of a peak
const float BEVEL_RADIUS_SHARE = 0.5;
// How quickly neighbouring blob colours fade into each other
const float COLOR_SHARPNESS = 6.0;
// Lifts the zone between two hues toward a light tone so blue→peach doesn't go grey
const float TRANSITION_LIFT = 0.65;

// Light from almost straight above, so the contact shadow sits just under the drop
const vec2 SHADOW_OFFSET = vec2(0.002, -0.008);
const float SHADOW_BLUR = 0.03;
const float SHADOW_STRENGTH = 0.16;
const float ACCENT_AMOUNT = 0.2;
const float TEXT_OPACITY = 0.85;

const vec3 LIGHT_DIR = vec3(-0.18, 0.75, 0.64);
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
// Matches LIGHT_DIR so chrome's highlight sits where the pastel one does
const vec2 ENV_SOFTBOX = vec2(-0.18, 0.65);
const float ENV_SOFTBOX_SHARPNESS = 18.0;
const float ENV_SOFTBOX_STRENGTH = 1.3;
// Caps how tall chrome swells, so it sits flatter like the pastel liquid
const float METAL_HEIGHT_CEILING = 0.04;
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
// Refraction magnifies every slope; full-height ripples would shred the text beneath
const float WATER_RIPPLE_GAIN = 0.3;
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
// Ellipse drawn out along uStretch with its area kept, so a moving drop thins as it lengthens
float blobSdf(vec2 p, vec4 blob, vec2 stretch) {
  vec2 q = p - blob.xy;
  float share = length(stretch);
  if (share < STRETCH_EPSILON) return length(q) - blob.z;
  vec2 axis = stretch / share;
  float along = dot(q, axis);
  float longScale = 1.0 + share;
  float shortScale = inversesqrt(longScale);
  q = axis * (along / longScale) + (q - axis * along) / shortScale;
  // Scaled-circle distance, shrunk by the tighter axis so it never overshoots the edge
  return (length(q) - blob.z) * shortScale;
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
    // GLSL ES 1.0 needs a constant bound, so stop at the live count instead
    if (i + 1 >= uCutCount) break;
    // Zero width marks an unused slot (or a fully healed point)
    if (min(uCuts[i].z, uCuts[i + 1].z) <= 0.0) continue;
    // Plain min is seamless here: tapered neighbours share the same radius at each joint
    d = min(d, taperedSegmentSdf(p, uCuts[i], uCuts[i + 1]));
  }
  return d;
}

// Surface waves from touches, as a height; sceneSdf also bulges the outline with it
// Body of liquid at p, taken from the nearest blob; joined drops share one
float nearestGroup(vec2 p) {
  float best = 1e5;
  float group = -1.0;
  for (int i = 0; i < BLOB_COUNT; i++) {
    if (i >= uBlobCount) break;
    float d = blobSdf(p, uBlobs[i], uStretch[i]);
    if (d < best) {
      best = d;
      group = uBlobGroups[i];
    }
  }
  return group;
}

float rippleHeight(vec2 p) {
  // Spares the nearest-group pass, which walks every blob
  if (uRippleCount == 0) return 0.0;
  float h = 0.0;
  float group = nearestGroup(p);
  for (int i = 0; i < MAX_RIPPLES; i++) {
    if (i >= uRippleCount) break;
    // Separate drops don't carry the wave across the gap
    if (abs(uRippleGroups[i] - group) > 0.5) continue;
    float offset = length(p - uRipples[i].xy) - uRipples[i].z;
    float envelope = exp(-(offset * offset) / (RIPPLE_WIDTH * RIPPLE_WIDTH));
    h += uRipples[i].w * envelope * cos(offset * TAU / RIPPLE_WAVELENGTH);
  }
  return h;
}

float sceneSdf(vec2 p) {
  float d = 1e5;
  for (int i = 0; i < BLOB_COUNT; i++) {
    if (i >= uBlobCount) break;
    float k = uBlobs[i].w > 0.0 ? uBlobs[i].w : MERGE_K;
    d = smin(d, blobSdf(p, uBlobs[i], uStretch[i]), k);
  }
  // A passing ring swells and dents the edge too, so the drop moves with the wave
  // Fades out away from the edge, or a crest in open space would raise a stray speck
  if (uRippleCount > 0) d -= rippleHeight(p) * RIPPLE_OUTLINE * smoothstep(RIPPLE_EDGE_REACH, 0.0, d);
  // No groove: skip the carve entirely, it runs for every normal/shadow sample
  if (uCutCount < 2) return d;
  return smax(d, -cutSdf(p), CUT_SMOOTH);
}

// Circular profile so the rim curves down like a droplet edge
float heightFromSdf(float d, float bevel) {
  float inside = clamp(-d / bevel, 0.0, 1.0);
  float t = 1.0 - inside;
  return sqrt(1.0 - t * t) * bevel;
}

// Full rounded body for chrome and water: for a lone circle this is an exact hemisphere
// (sqrt(r² - |q|²) rewritten in terms of the SDF), and it stays smooth across necks.
// A plain deep bevel instead peaks in a cone at each centre.
float domeHeight(float d, float r) {
  d = max(d, -r);
  return sqrt(max(-d * (2.0 * r + d), 0.0));
}

// Colour and radius share the same per-blob weights, so one pass yields both
// Returns the blended blob radius around p (for the dome profile); colour goes to color
float blendBlobs(vec2 p, out vec3 color) {
  vec3 colorSum = vec3(0.0);
  float radiusSum = 0.0;
  float total = 0.0;
  float maxW = 0.0;
  for (int i = 0; i < BLOB_COUNT; i++) {
    if (i >= uBlobCount) break;
    float w = exp(-blobSdf(p, uBlobs[i], uStretch[i]) * COLOR_SHARPNESS);
    colorSum += uColors[i] * w;
    radiusSum += uBlobs[i].z * w;
    total += w;
    maxW = max(maxW, w);
  }
  total = max(total, 1e-6);
  float mixAmount = 1.0 - maxW / total;
  color = mix(colorSum / total, uTransition, mixAmount * TRANSITION_LIFT);
  return radiusSum / total;
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

// Reuses the SDF and ripple samples shadeLiquid already took at p, p+x and p+y
// (one radius for all three: it barely changes over a couple of pixels)
vec3 domeNormal(vec3 dist, vec3 ripple, float r, float eps, float ceiling, float rippleGain) {
  float h = flatten(domeHeight(dist.x, r), ceiling) + ripple.x * rippleGain;
  float hx = flatten(domeHeight(dist.y, r), ceiling) + ripple.y * rippleGain;
  float hy = flatten(domeHeight(dist.z, r), ceiling) + ripple.z * rippleGain;
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
  vec3 dist = vec3(d, sceneSdf(p + ex), sceneSdf(p + ey));
  vec3 ripple = vec3(rippleHeight(p), rippleHeight(p + ex), rippleHeight(p + ey));
  vec3 base;
  float radius = blendBlobs(p, base);
  float bevel = min(BEVEL, radius * BEVEL_RADIUS_SHARE);
  float h = heightFromSdf(dist.x, bevel) + ripple.x;
  float hx = heightFromSdf(dist.y, bevel) + ripple.y;
  float hy = heightFromSdf(dist.z, bevel) + ripple.z;
  vec3 n = normalize(vec3(-(hx - h) / eps, -(hy - h) / eps, 1.0));

  vec3 l = normalize(LIGHT_DIR);
  vec3 halfVec = normalize(l + vec3(0.0, 0.0, 1.0));
  float diffuse = clamp(dot(n, l), 0.0, 1.0);
  float nh = max(dot(n, halfVec), 0.0);
  float fresnel = pow(1.0 - n.z, 3.0);

  vec3 col = base * mix(SHADE_MIN, 1.0, diffuse);
  col += mix(base, vec3(1.0), 0.6) * fresnel * RIM_STRENGTH * diffuse;
  col += pow(nh, SHEEN_POWER) * SHEEN_STRENGTH;
  col += pow(nh, SPECULAR_POWER) * SPECULAR_STRENGTH;

  // Only pay for the dome normal when a material actually uses it
  if (uMetal + uWater <= 0.0) return col;
  if (uMetal > 0.0) col = mix(col, shadeChrome(base, domeNormal(dist, ripple, radius, eps, METAL_HEIGHT_CEILING, 1.0)), uMetal);
  if (uWater > 0.0) col = mix(col, shadeWater(uv, base, domeNormal(dist, ripple, radius, eps, WATER_HEIGHT_CEILING, WATER_RIPPLE_GAIN), l, halfVec), uWater);
  return col;
}

void main() {
  float minSide = min(uResolution.x, uResolution.y);
  float px = 1.0 / minSide;
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) * px;

  float d = sceneSdf(p);
  // Fully inside the liquid: the backdrop and its shadow would be painted over anyway
  if (d <= -px) {
    gl_FragColor = vec4(shadeLiquid(uv, p, d, px), 1.0);
    return;
  }
  vec3 bg = background(uv, p, d);
  float coverage = 1.0 - smoothstep(-px, px, d);

  if (coverage <= 0.0) {
    gl_FragColor = vec4(bg, 1.0);
    return;
  }

  gl_FragColor = vec4(mix(bg, shadeLiquid(uv, p, d, px), coverage), 1.0);
}
`;

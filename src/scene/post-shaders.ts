import { GRADE_LUT_SIZE } from './grade.ts';

/**
 * The vertex shader of each full-screen pass: one triangle that covers the view (design 4.5,
 * post effects).
 */
export const FULL_SCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * The GLSL clamp of a sample to the part of its source that the frame wrote: `uClamp` holds the
 * lowest and the highest texture coordinates (design 2.5, 4.5). In Cinematic mode, each pass
 * writes only the letterbox, so a sample outside it would read an old frame.
 */
const SOURCE_CLAMP = /* glsl */ `
uniform vec4 uClamp;

vec2 inSource(vec2 uv) {
  return clamp(uv, uClamp.xy, uClamp.zw);
}
`;

/**
 * The downsample of the bloom: 13 samples in five boxes, as in the bloom of "Next generation post
 * processing in Call of Duty: Advanced Warfare" (Jimenez, 2014). With `PREFILTER`, the first pass
 * also keeps the bright parts, with a soft knee, and weights each box by its brightness, so that
 * a single bright pixel does not flicker. It adds a part of all the light (`uDiffusion`), so the
 * bloom also gives the soft glow of a diffusion filter around each light part of the image.
 */
export const BLOOM_DOWN_FRAGMENT = /* glsl */ `
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
uniform float uDiffusion;
${SOURCE_CLAMP}
varying vec2 vUv;

vec3 tap(float x, float y) {
  return texture(uSource, inSource(vUv + uTexel * vec2(x, y))).rgb;
}

float brightness(vec3 c) {
  return max(c.r, max(c.g, c.b));
}

void main() {
  vec3 a = tap(-2.0, 2.0);
  vec3 b = tap(0.0, 2.0);
  vec3 c = tap(2.0, 2.0);
  vec3 d = tap(-2.0, 0.0);
  vec3 e = tap(0.0, 0.0);
  vec3 f = tap(2.0, 0.0);
  vec3 g = tap(-2.0, -2.0);
  vec3 h = tap(0.0, -2.0);
  vec3 i = tap(2.0, -2.0);
  vec3 j = tap(-1.0, 1.0);
  vec3 k = tap(1.0, 1.0);
  vec3 l = tap(-1.0, -1.0);
  vec3 m = tap(1.0, -1.0);
  vec3 inner = (j + k + l + m) * 0.25;
  vec3 topLeft = (a + b + d + e) * 0.25;
  vec3 topRight = (b + c + e + f) * 0.25;
  vec3 bottomLeft = (d + e + g + h) * 0.25;
  vec3 bottomRight = (e + f + h + i) * 0.25;
#ifdef PREFILTER
  // Each box gets the weight 1 / (1 + brightness), so that a single bright pixel does not flicker.
  float w0 = 0.5 / (1.0 + brightness(inner));
  float w1 = 0.125 / (1.0 + brightness(topLeft));
  float w2 = 0.125 / (1.0 + brightness(topRight));
  float w3 = 0.125 / (1.0 + brightness(bottomLeft));
  float w4 = 0.125 / (1.0 + brightness(bottomRight));
  vec3 sum = inner * w0 + topLeft * w1 + topRight * w2 + bottomLeft * w3 + bottomRight * w4;
  sum /= w0 + w1 + w2 + w3 + w4;
  // Keep the light above the threshold, with a soft knee.
  float bright = brightness(sum);
  float soft = clamp(bright - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-5);
  sum *= max(soft, bright - uThreshold) / max(bright, 1e-5) + uDiffusion;
#else
  vec3 sum = inner * 0.5 + (topLeft + topRight + bottomLeft + bottomRight) * 0.125;
#endif
  gl_FragColor = vec4(sum, 1.0);
}
`;

/**
 * The upsample of the bloom: a 3 × 3 tent filter of the smaller level, plus the downsample of this
 * level. Each level of the upsample has its own target, so that no pass writes a target that the
 * frame already wrote. A second write cost 0.4 ms for each level on the development Mac.
 */
export const BLOOM_UP_FRAGMENT = /* glsl */ `
uniform sampler2D uSource;
uniform sampler2D uBase;
uniform vec2 uTexel;
${SOURCE_CLAMP}
varying vec2 vUv;

vec3 tap(float x, float y) {
  return texture(uSource, inSource(vUv + uTexel * vec2(x, y))).rgb;
}

void main() {
  vec3 sum = tap(0.0, 0.0) * 4.0;
  sum += (tap(-1.0, 0.0) + tap(1.0, 0.0) + tap(0.0, -1.0) + tap(0.0, 1.0)) * 2.0;
  sum += tap(-1.0, -1.0) + tap(1.0, -1.0) + tap(-1.0, 1.0) + tap(1.0, 1.0);
  gl_FragColor = vec4(texture(uBase, vUv).rgb + sum / 16.0, 1.0);
}
`;

/** The GLSL function that converts a value of the depth texture to the view depth. */
const VIEW_DEPTH = /* glsl */ `
#include <packing>
uniform sampler2D uDepth;
uniform float uNear;
uniform float uFar;
uniform float uFocus;
uniform float uBlurScale;
uniform float uMaxBlur;
uniform float uMaxNearBlur;

float viewDepth(vec2 uv) {
  return -perspectiveDepthToViewZ(texture(uDepth, uv).x, uNear, uFar);
}

// The signed diameter of the blur disc, as a part of the image height (scene/focus.ts).
float blurAt(vec2 uv) {
  return clamp(uBlurScale * (1.0 - uFocus / viewDepth(uv)), -uMaxNearBlur, uMaxBlur);
}
`;

/**
 * The first pass of the depth of field, at half size: the color of the scene, and the signed blur
 * of each pixel in the alpha channel (scene/focus.ts).
 */
export const BLUR_PREPARE_FRAGMENT = /* glsl */ `
uniform sampler2D uColor;
${VIEW_DEPTH}
${SOURCE_CLAMP}
varying vec2 vUv;

void main() {
  // The half-size pixel center lies between four pixels of the scene, so the linear filter
  // gives their mean. A limit keeps a single bright pixel from a large bright disc.
  vec3 color = min(texture(uColor, inSource(vUv)).rgb, vec3(32.0));
  gl_FragColor = vec4(color, blurAt(vUv));
}
`;

/**
 * The second pass of the depth of field, at half size: a gather of `SAMPLES` samples on a golden
 * angle spiral over the blur disc of the pixel. A sample counts when its own disc covers the
 * pixel. A sample behind the pixel blurs at most as much as the pixel, so a sharp subject keeps
 * its outline in front of a soft background. The equal weights inside the disc make the warm
 * lamps of the hall into round discs (bokeh).
 */
export const BLUR_GATHER_FRAGMENT = /* glsl */ `
uniform sampler2D uSource;
uniform vec2 uTexel;
// The pixels of this pass for a blur of 1 (the full image height), times one half (a radius).
uniform float uPixelsPerBlur;
${SOURCE_CLAMP}
varying vec2 vUv;

const float GOLDEN_ANGLE = 2.39996323;

void main() {
  vec4 center = texture(uSource, vUv);
  float radius = abs(center.a) * uPixelsPerBlur;
  vec3 sum = center.rgb;
  float total = 1.0;
  for (int i = 0; i < SAMPLES; i++) {
    float r = sqrt((float(i) + 0.5) / float(SAMPLES)) * radius;
    float angle = float(i) * GOLDEN_ANGLE;
    vec4 tap = texture(uSource, inSource(vUv + vec2(cos(angle), sin(angle)) * r * uTexel));
    float reach = abs(tap.a) * uPixelsPerBlur;
    if (tap.a > center.a) {
      reach = min(reach, radius);
    }
    float weight = clamp(reach - r + 1.0, 0.0, 1.0);
    sum += tap.rgb * weight;
    total += weight;
  }
  gl_FragColor = vec4(sum / total, center.a);
}
`;

/**
 * The color grade of the final pass on the display values (design 4.5, post effects): a lookup in
 * the 3D table of `scene/grade.ts`. The views page adds the same grade after the tone mapping of
 * its materials, so that its colors read as on the stage (design 7.1).
 */
export const GRADE_FUNCTION = /* glsl */ `
uniform sampler3D uGradeLut;

vec3 grade(vec3 color) {
  // The middle of the first entry and of the last entry hold the grade of 0 and of 1.
  vec3 c = clamp(color, 0.0, 1.0) * ${((GRADE_LUT_SIZE - 1) / GRADE_LUT_SIZE).toFixed(8)} + ${(0.5 / GRADE_LUT_SIZE).toFixed(8)};
  return texture(uGradeLut, c).rgb;
}
`;

/**
 * The final pass to the canvas (design 4.5, post effects): the depth of field, the room haze, the
 * bloom, the tone mapping of the renderer, the color grade, the vignette, and the film grain. One
 * pass does all of them, so each pixel of the canvas reads the scene one time. Outside the frame
 * `uFrame` (left, bottom, right, top), the pass writes the black of the letterbox bars of
 * Cinematic mode (design 2.5), and reads no texture.
 */
export const FINAL_FRAGMENT = /* glsl */ `
uniform vec4 uFrame;
// The part of the half-size bloom and blur that the frame wrote.
uniform vec4 uHalfClamp;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uBlur;
uniform float uBlurOn;
uniform float uBloomStrength;
uniform vec3 uHalation;
uniform sampler2D uSceneDepth;
uniform float uHazeOn;
uniform mat4 uHazeInverse;
uniform vec3 uHazeCamera;
uniform vec3 uHazeLight;
uniform vec3 uHazeColor;
uniform vec4 uHaze;
uniform float uPixelsPerBlur;
${GRADE_FUNCTION}
uniform float uVignette;
uniform float uAspect;
// The share of the vignette of the letterbox, from 0 (Free mode) to 1 (Cinematic mode).
uniform float uCinema;
// The vignette of the letterbox: the start and the end of its fall, in the distance from the
// middle of the frame, with 1 at the middle of each edge.
uniform vec2 uFrameVignette;
uniform float uGrain;
uniform float uSeed;
#ifdef DEPTH_OF_FIELD
${VIEW_DEPTH}
#endif
varying vec2 vUv;

// The room haze (design 4.5): the light of the air between the camera and the point of the
// pixel. It starts behind the subject of the camera (uHaze.x, in meters) and grows with the
// distance (uHaze.y, the density for each meter). Its light grows toward the rim light, by the
// Henyey-Greenstein phase with g = uHaze.z. The depth pass has no hall, so a pixel of the hall
// gets the distance to the hall floor (y = uHaze.w) or, above the floor, the far plane.
vec3 hazed(vec3 color) {
  float depth = texture(uSceneDepth, vUv).x;
  vec4 world = uHazeInverse * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec3 ray = world.xyz / world.w - uHazeCamera;
  float distance = length(ray);
  vec3 direction = ray / max(distance, 1e-4);
  if (depth >= 0.99999 && direction.y < -1e-4) {
    distance = min(distance, (uHaze.w - uHazeCamera.y) / direction.y);
  }
  float amount = 1.0 - exp(-uHaze.y * max(distance - uHaze.x, 0.0));
  float g = uHaze.z;
  float c = dot(direction, uHazeLight);
  float phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5);
  return mix(color, uHazeColor * phase, amount * uHazeOn);
}

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

void main() {
  if (vUv.x < uFrame.x || vUv.y < uFrame.y || vUv.x > uFrame.z || vUv.y > uFrame.w) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec2 halfUv = clamp(vUv, uHalfClamp.xy, uHalfClamp.zw);
  vec3 color = texture(uScene, vUv).rgb;
#ifdef DEPTH_OF_FIELD
  // The blur of this pixel at full size decides how much of the soft image it takes, so the
  // outline of a sharp subject stays sharp.
  if (uBlurOn > 0.5) {
    float radius = abs(blurAt(vUv)) * uPixelsPerBlur;
    color = mix(color, texture(uBlur, halfUv).rgb, smoothstep(0.5, 2.0, radius));
  }
#endif
  color = hazed(color);
#ifdef BLOOM
  // The halation: the glow is warmer than the light, as the red glow around a light on film.
  color += texture(uBloom, halfUv).rgb * uBloomStrength * uHalation;
#endif
#ifdef TONE_MAPPING
  color = toneMapping(color);
#endif
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
  // The grade works on the display values (sRGB).
  vec3 c = grade(gl_FragColor.rgb);
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // The vignette of Free mode darkens the corners. The distance keeps the aspect, so the shape is
  // round.
  vec2 fromCenter = (vUv - 0.5) * vec2(uAspect, 1.0);
  float edge = length(fromCenter) / length(vec2(uAspect, 1.0) * 0.5);
  float shade = smoothstep(0.3, 1.0, edge);
  // The vignette of the letterbox is an oval with the shape of the frame, so the top and the
  // bottom edges darken as much as the sides.
  if (uCinema > 0.0) {
    vec2 inFrame = (vUv - uFrame.xy) / (uFrame.zw - uFrame.xy) * 2.0 - 1.0;
    shade = mix(shade, smoothstep(uFrameVignette.x, uFrameVignette.y, length(inFrame)), uCinema);
  }
  c *= 1.0 - uVignette * shade;
  // The grain changes in each frame. It is strongest in the middle tones, as on film, and it also
  // breaks the bands of the dark gradients.
  float grain = hash(gl_FragCoord.xy + uSeed) - 0.5;
  c += grain * uGrain * (0.5 + 2.0 * luma * (1.0 - luma));
  gl_FragColor = vec4(c, 1.0);
}
`;

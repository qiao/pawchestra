import { Matrix4, Vector2, Vector4 } from 'three';
import type { PerspectiveCamera, ShaderMaterial } from 'three';

/**
 * The contact shade (design 4.5, post effects): a soft dark where two surfaces meet, such as under
 * the feet, the chairs, and the stands, and in the crease between an arm and the trunk. A pass at
 * half size (a quarter on the medium tier) finds it from the depth of the scene, as the ambient
 * occlusion of a film render. The final pass multiplies the scene by it.
 */
export const CONTACT_SHADE = {
  /** The reach of the shade from a surface, in meters. */
  radius: 0.28,
  /** The part of the light that a fully closed point loses. */
  strength: 0.7,
  /**
   * The cosine of the smallest angle above the surface that a sample needs to count. It keeps the
   * flat faces of a low-poly body free of shade.
   */
  bias: 0.12,
} as const;

/**
 * The gloss of the stage floor (design 4.5, post effects): the lacquered planks show a soft
 * reflection of the players, the chairs, and the stands. The pass of the contact shade traces
 * each floor pixel along its mirror ray through the depth of the scene, at half size, and reads
 * the mean of a small box of the scene color at the hit. The ray takes a jitter in a small cone.
 * A blur in two passes over only the floor pixels (`SURFACE_ROWS_FRAGMENT`,
 * `SURFACE_BLUR_FRAGMENT`) joins the rays of a wide tent, so the reflection is soft, and one ray
 * that hits or misses as the camera moves changes only a faint spot. The final pass adds the
 * reflection only on the floor pixels at full size, so it does not spread onto the feet.
 */
export const FLOOR_GLOSS = {
  /**
   * The factor of the reflection. 0 turns it off. The lacquer of a real stage reflects about 5% at
   * the angle of the default view, and the players in the dark hall are not bright, so the
   * physical reflection did not show. The factor is the middle of a lineup of three factors.
   */
  strength: 3,
  /** The reflection of the lacquer at a right angle (Schlick). It grows to 1 at a flat angle. */
  f0: 0.04,
  /** The longest mirror ray, in meters. The reflection fades along it. */
  reach: 1.6,
  /** The half angle of the cone of the jitter of the mirror ray, in radians: the blur. */
  spread: 0.09,
} as const;

/**
 * The uniforms of the surface pass that change with each frame.
 *
 * @returns New uniforms.
 */
export function surfaceUniforms() {
  return {
    uDepth: { value: null },
    uScene: { value: null },
    uDepthTexel: { value: new Vector2(1, 1) },
    uProjection: { value: new Matrix4() },
    uProjectionInverse: { value: new Matrix4() },
    uFloor: { value: new Vector4(0, 1, 0, 0) },
    uContact: { value: new Vector4() },
    uGloss: { value: new Vector4() },
    uClamp: { value: new Vector4(0, 0, 1, 1) },
  };
}

/**
 * Sets the uniforms of the surface pass for the camera of a frame and the current look values.
 *
 * @param material The surface pass.
 * @param camera The camera of the frame. Its world matrix is current.
 */
export function setSurfaceCamera(material: ShaderMaterial, camera: PerspectiveCamera): void {
  const uniforms = material.uniforms;
  const projection = uniforms['uProjection']?.value;
  if (projection instanceof Matrix4) {
    projection.copy(camera.projectionMatrix);
  }
  const inverse = uniforms['uProjectionInverse']?.value;
  if (inverse instanceof Matrix4) {
    inverse.copy(camera.projectionMatrixInverse);
  }
  // The world height of a point of the view space: the second row of the world matrix of the
  // camera.
  const floor = uniforms['uFloor']?.value;
  if (floor instanceof Vector4) {
    const e = camera.matrixWorld.elements;
    floor.set(e[1] ?? 0, e[5] ?? 1, e[9] ?? 0, e[13] ?? 0);
  }
  const contact = uniforms['uContact']?.value;
  if (contact instanceof Vector4) {
    contact.set(CONTACT_SHADE.radius, CONTACT_SHADE.strength, CONTACT_SHADE.bias, 0);
  }
  const gloss = uniforms['uGloss']?.value;
  if (gloss instanceof Vector4) {
    gloss.set(FLOOR_GLOSS.strength, FLOOR_GLOSS.f0, FLOOR_GLOSS.reach, FLOOR_GLOSS.spread);
  }
}

/** The number of steps of the mirror ray of the floor gloss, before the refine. */
const GLOSS_STEPS = 14;

/**
 * The surface pass at half size (design 4.5, post effects): the contact shade in the alpha
 * channel, as the factor of the scene light, and the reflection of the floor gloss in the color.
 * `CONTACT_SAMPLES` sets the samples of the shade, and `FLOOR_GLOSS` turns the gloss on. Each
 * pixel takes a turn of its samples and a jitter of its ray from a 4 × 4 Bayer pattern, which the
 * blur removes: a box of 4 × 4 pixels for the shade, and a tent for the gloss. With the gloss, a pixel that is not on the floor gets the color
 * `NO_FLOOR`, so that the blur mixes no such pixel into the reflection.
 */
export const SURFACE_FRAGMENT = /* glsl */ `
uniform sampler2D uDepth;
uniform sampler2D uScene;
uniform vec2 uDepthTexel;
uniform mat4 uProjection;
uniform mat4 uProjectionInverse;
// The world height of a view point p: dot(uFloor.xyz, p) + uFloor.w.
uniform vec4 uFloor;
// The radius, the strength, and the bias of the contact shade.
uniform vec4 uContact;
// The strength, the f0, the reach, and the spread of the floor gloss.
uniform vec4 uGloss;
uniform vec4 uClamp;
varying vec2 vUv;

// The color of a pixel that is not on the floor. A reflection is never below 0.
const float NO_FLOOR = -1.0;

const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0,
  15.0, 7.0, 13.0, 5.0);

vec2 inSource(vec2 uv) {
  return clamp(uv, uClamp.xy, uClamp.zw);
}

vec3 viewAt(vec2 uv, float depth) {
  vec4 p = uProjectionInverse * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}

vec3 viewAt(vec2 uv) {
  return viewAt(uv, texture(uDepth, uv).x);
}

// The view depth of the scene at a point of the texture: a positive distance along the view axis.
float sceneDepthAt(vec2 uv) {
  return -viewAt(uv).z;
}

void main() {
  float depth = texture(uDepth, vUv).x;
  if (depth >= 0.99999) {
#ifdef FLOOR_GLOSS
    gl_FragColor = vec4(vec3(NO_FLOOR), 1.0);
#else
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
#endif
    return;
  }
  vec3 p = viewAt(vUv, depth);
  // The normal of the face from the neighbor on each axis with the smaller step, so that an edge
  // does not bend it.
  vec3 right = viewAt(vUv + vec2(uDepthTexel.x, 0.0)) - p;
  vec3 left = p - viewAt(vUv - vec2(uDepthTexel.x, 0.0));
  vec3 up = viewAt(vUv + vec2(0.0, uDepthTexel.y)) - p;
  vec3 down = p - viewAt(vUv - vec2(0.0, uDepthTexel.y));
  vec3 dx = abs(right.z) < abs(left.z) ? right : left;
  vec3 dy = abs(up.z) < abs(down.z) ? up : down;
  vec3 n = normalize(cross(dx, dy));
  ivec2 cell = ivec2(gl_FragCoord.xy) & 3;
  float noise = (BAYER[cell.y * 4 + cell.x] + 0.5) / 16.0;
  float light = 1.0;
#ifdef CONTACT_SAMPLES
  float radius = uContact.x;
  vec2 radiusUv = radius * 0.5 / -p.z * vec2(uProjection[0][0], uProjection[1][1]);
  float closed = 0.0;
  for (int i = 0; i < CONTACT_SAMPLES; i++) {
    float angle = (float(i) + noise) * 2.39996323 + noise * 6.2831853;
    float r = sqrt((float(i) + noise) / float(CONTACT_SAMPLES));
    vec2 uv = inSource(vUv + vec2(cos(angle), sin(angle)) * r * radiusUv);
    vec3 v = viewAt(uv) - p;
    float vv = dot(v, v);
    float fall = max(1.0 - vv / (radius * radius), 0.0);
    closed += max(dot(v, n) * inversesqrt(vv + 1e-6) - uContact.z, 0.0) * fall;
  }
  // A point beside a wall sees about one third of its samples on the wall, so three times the
  // mean gives a full shade there.
  light = 1.0 - uContact.y * min(3.0 * closed / float(CONTACT_SAMPLES) / (1.0 - uContact.z), 1.0);
#endif
  vec3 reflection = vec3(0.0);
#ifdef FLOOR_GLOSS
  reflection = vec3(NO_FLOOR);
  float height = dot(uFloor.xyz, p) + uFloor.w;
  if (uGloss.x > 0.0 && abs(height) < 0.01 && dot(n, uFloor.xyz) > 0.97) {
    reflection = vec3(0.0);
    vec3 eye = normalize(p);
    // A jitter of the normal in a cone, from the same pattern, for a soft reflection.
    vec3 side = normalize(cross(uFloor.xyz, eye));
    vec3 ahead = cross(side, uFloor.xyz);
    float turn = noise * 6.2831853 * 3.0;
    float tilt = uGloss.w * sqrt(fract(noise * 7.0));
    vec3 normal = normalize(uFloor.xyz + (side * cos(turn) + ahead * sin(turn)) * tilt);
    vec3 ray = reflect(eye, normal);
    float cosine = max(dot(-eye, uFloor.xyz), 0.0);
    float fresnel = uGloss.y + (1.0 - uGloss.y) * pow(1.0 - cosine, 5.0);
    float reach = uGloss.z;
    float before = 0.02;
    for (int i = 0; i < ${GLOSS_STEPS}; i++) {
      // The steps grow along the ray, so the contact with the floor gets the short steps.
      float s = (float(i) + noise) / float(${GLOSS_STEPS});
      float t = 0.02 + reach * s * s;
      vec3 q = p + ray * t;
      vec4 clip = uProjection * vec4(q, 1.0);
      vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
      if (any(lessThan(uv, uClamp.xy)) || any(greaterThan(uv, uClamp.zw))) {
        break;
      }
      float behind = -q.z - sceneDepthAt(uv);
      // The thickness of a surface follows the step, so that a ray that passes behind a thin leg
      // goes on, and does not draw a streak of the leg.
      if (behind > 0.0 && behind < max(0.06, 1.5 * (t - before))) {
        // Three halvings between the last step in front and this step.
        float a = before;
        float b = t;
        for (int k = 0; k < 3; k++) {
          float m = (a + b) * 0.5;
          vec3 h = p + ray * m;
          vec4 c = uProjection * vec4(h, 1.0);
          vec2 hu = c.xy / c.w * 0.5 + 0.5;
          if (-h.z - sceneDepthAt(hu) > 0.0) {
            b = m;
          } else {
            a = m;
          }
        }
        vec3 hit = p + ray * b;
        vec4 c = uProjection * vec4(hit, 1.0);
        vec2 hu = c.xy / c.w * 0.5 + 0.5;
        vec2 edge = min(hu - uClamp.xy, uClamp.zw - hu);
        float fade = (1.0 - b / reach) * smoothstep(0.0, 0.05, min(edge.x, edge.y));
        // The mean of a box of 4 × 4 pixels of the scene, so that a single bright pixel does not
        // sparkle.
        vec2 d = uDepthTexel;
        vec3 color = texture(uScene, inSource(hu + d * vec2(-1.0, -1.0))).rgb;
        color += texture(uScene, inSource(hu + d * vec2(1.0, -1.0))).rgb;
        color += texture(uScene, inSource(hu + d * vec2(-1.0, 1.0))).rgb;
        color += texture(uScene, inSource(hu + d * vec2(1.0, 1.0))).rgb;
        reflection = min(color * 0.25, vec3(8.0)) * fresnel * uGloss.x * fade;
        break;
      }
      before = t;
    }
  }
#endif
  gl_FragColor = vec4(reflection, light);
}
`;

/**
 * The first half of the blur of the floor gloss, at half size: a tent along each row of 16 pixels,
 * with the weights 1 to 8 and 8 to 1. It takes only the floor pixels, so that a body beside the
 * floor does not darken the reflection. The color is their mean, and the alpha is their share of
 * the weight. Each value of the 4 × 4 pattern of the surface pass gets the same weight, so the
 * pattern does not show. Each tap is at the middle of a pixel, so it reads that pixel alone.
 */
export const SURFACE_ROWS_FRAGMENT = /* glsl */ `
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform vec4 uClamp;
varying vec2 vUv;

void main() {
  vec3 sum = vec3(0.0);
  float weight = 0.0;
  for (int x = -8; x < 8; x++) {
    vec2 uv = clamp(vUv + vec2(uTexel.x * float(x), 0.0), uClamp.xy, uClamp.zw);
    vec3 c = texture(uSource, uv).rgb;
    float w = (8.5 - abs(float(x) + 0.5)) * step(-0.5, c.r);
    sum += c * w;
    weight += w;
  }
  // 72 is the sum of the weights of the tent.
  gl_FragColor = vec4(sum / max(weight, 1e-3), weight / 72.0);
}
`;

/**
 * The blur of the surface pass at half size. The contact shade is the mean of a box of 4 × 4
 * pixels, with four linear samples. The box holds each value of the 4 × 4 pattern of the surface
 * pass one time, so the pattern does not show. With `FLOOR_GLOSS`, the reflection is the second
 * half of the tent of `SURFACE_ROWS_FRAGMENT`, along each column, with the floor share of each
 * row as a weight. Thus one ray that hits or misses changes a soft spot and not a square. A pixel
 * with no floor in its tent gets no reflection.
 */
export const SURFACE_BLUR_FRAGMENT = /* glsl */ `
uniform sampler2D uSource;
uniform sampler2D uRows;
uniform vec2 uTexel;
uniform vec4 uClamp;
varying vec2 vUv;

vec4 tap(float x, float y) {
  return texture(uSource, clamp(vUv + uTexel * vec2(x, y), uClamp.xy, uClamp.zw));
}

void main() {
  vec4 box = (tap(-1.5, -1.5) + tap(0.5, -1.5) + tap(-1.5, 0.5) + tap(0.5, 0.5)) * 0.25;
#ifdef FLOOR_GLOSS
  vec3 sum = vec3(0.0);
  float weight = 0.0;
  for (int y = -8; y < 8; y++) {
    vec2 uv = clamp(vUv + vec2(0.0, uTexel.y * float(y)), uClamp.xy, uClamp.zw);
    vec4 row = texture(uRows, uv);
    float w = (8.5 - abs(float(y) + 0.5)) * row.a;
    sum += row.rgb * w;
    weight += w;
  }
  box.rgb = sum / max(weight, 1e-3);
#endif
  gl_FragColor = box;
}
`;

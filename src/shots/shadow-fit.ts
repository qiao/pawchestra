import type { Shot, ShotKind } from './types.ts';

/**
 * The fit of the shadow map of the key light to a close shot (design 4.5). The map of the whole
 * stage has texels of about 12 mm on a large stage, so a paw or a bow casts no shadow in a close
 * shot. A shot of players fits the map to a sphere around its target instead. The sphere comes
 * from the shot, so it is constant in the shot and the shadows do not swim.
 */
export const SHADOW_FIT = {
  /**
   * The radius of the sphere, in half heights of the frame of the shot at its target
   * (`Shot.halfHeight`, times the larger zoom of its keys). A frame of 21:9 has a half diagonal of
   * about 2.5 half heights, and the composition moves the target up to about 0.8 half heights
   * from the middle of the frame. Thus the sphere holds the frame at the distance of the target.
   */
  frames: 4,
  /**
   * The kinds of shot that fit the map: the shots from the front of a player or a group. The
   * players outside the sphere get no shadow of the key light, so a shot that shows a large part
   * of the orchestra keeps the map of the stage: a side shot showed the back rows with no form
   * shadows. A conductor shot looks past the bear at the players behind it.
   */
  kinds: {
    wide: false,
    high: false,
    conductor: false,
    side: false,
    section: true,
    solo: true,
    insert: true,
  },
} as const satisfies { frames: number; kinds: Record<ShotKind, boolean> };

/**
 * Writes the sphere of the shadow map of a shot ({@link SHADOW_FIT}).
 *
 * @param shot The shot.
 * @param out The center and the radius, in meters. A radius of 0 holds the whole stage.
 */
function writeShotSphere(shot: Shot, out: [number, number, number, number]): void {
  out[0] = shot.target[0];
  out[1] = shot.target[1];
  out[2] = shot.target[2];
  const zoom = Math.max(shot.from.zoom, shot.to.zoom);
  out[3] = SHADOW_FIT.kinds[shot.kind] ? shot.halfHeight * zoom * SHADOW_FIT.frames : 0;
}

/** The sphere of the previous shot of a blend, which {@link writeShadowFit} reuses. */
const previousSphere: [number, number, number, number] = [0, 0, 0, 0];

/**
 * Writes the sphere that the shadow map of the key light holds in a frame of a shot (design 4.5):
 * the sphere of the shot, or during a blend the smallest sphere that holds the spheres of both
 * shots. When one of the shots keeps the map of the stage, the frame keeps it too.
 *
 * @param current The shot of the frame.
 * @param previous The shot that the frame blends from, or `null` after the blend.
 * @param out The center and the radius, in meters. A radius of 0 holds the whole stage.
 */
export function writeShadowFit(
  current: Shot,
  previous: Shot | null,
  out: [number, number, number, number],
): void {
  writeShotSphere(current, out);
  if (!previous || out[3] === 0) {
    return;
  }

  const other = previousSphere;
  writeShotSphere(previous, other);
  if (other[3] === 0) {
    out[3] = 0;
    return;
  }
  const dx = other[0] - out[0];
  const dy = other[1] - out[1];
  const dz = other[2] - out[2];
  const distance = Math.hypot(dx, dy, dz);
  if (distance + other[3] <= out[3]) {
    return;
  }
  if (distance + out[3] <= other[3]) {
    out[0] = other[0];
    out[1] = other[1];
    out[2] = other[2];
    out[3] = other[3];
    return;
  }
  const radius = (distance + out[3] + other[3]) / 2;
  const move = (radius - out[3]) / distance;
  out[0] += dx * move;
  out[1] += dy * move;
  out[2] += dz * move;
  out[3] = radius;
}

import { Quaternion, Vector3 } from 'three';
import { toQuat, toVec3 } from '../tuples.ts';
import { transform } from '../mesh.ts';
import type { Vec3 } from '../tuples.ts';
import type { Finish, Rgb } from '../mesh.ts';
import { lathe, sweep } from '../primitives.ts';
import type { ProfilePoint } from '../primitives.ts';
import type { PieceBuilder } from './piece.ts';

/**
 * Gives the rings of a round tube along a path, for `sweep()`. Each ring is normal to the mean
 * direction of the path at its point, and the frames follow the path with no twist (parallel
 * transport), so a bent tube keeps even faces.
 *
 * @param points The points of the path. At least 2, with no two equal neighbors.
 * @param radius The radius at each point. A shorter list keeps its last radius for the other
 *   points, so one radius serves the whole tube.
 * @param segments The number of faces around the tube.
 * @returns One ring for each point, counterclockwise when seen from the last end.
 */
function tubeRings(points: readonly Vec3[], radius: readonly number[], segments: number): Vec3[][] {
  const at = points.map((p) => new Vector3(...p));
  const tangents = at.map((p, i) => {
    const before = at[Math.max(0, i - 1)] ?? p;
    const after = at[Math.min(at.length - 1, i + 1)] ?? p;
    const into = p.clone().sub(before).normalize();
    const out = after.clone().sub(p).normalize();
    return into.add(out).normalize();
  });
  const first = tangents[0] ?? new Vector3(1, 0, 0);
  const helper = Math.abs(first.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  let normal = helper.clone().projectOnPlane(first).normalize();
  let previous = first;
  return at.map((p, i) => {
    const tangent = tangents[i] ?? previous;
    normal.applyQuaternion(new Quaternion().setFromUnitVectors(previous, tangent));
    normal = normal.projectOnPlane(tangent).normalize();
    previous = tangent;
    const binormal = new Vector3().crossVectors(tangent, normal);
    const r = radius[i] ?? radius.at(-1) ?? 0;
    const ring: Vec3[] = [];
    for (let k = 0; k < segments; k++) {
      const angle = (k / segments) * 2 * Math.PI;
      ring.push(
        toVec3(
          p
            .clone()
            .addScaledVector(normal, r * Math.cos(angle))
            .addScaledVector(binormal, r * Math.sin(angle)),
        ),
      );
    }
    return ring;
  });
}

/**
 * Adds a round tube along a path: one smooth solid in place of a rod for each step, so that a
 * bent brass tube shows no seams at its bends (design 4.6). The tube has the metal finish.
 *
 * @param piece The piece.
 * @param points The points of the path. At least 2, with no two equal neighbors.
 * @param radius The radius at each point. A shorter list keeps its last radius for the other
 *   points.
 * @param segments The number of faces around the tube.
 * @param color The color.
 */
export function tubeAlong(
  piece: PieceBuilder,
  points: readonly Vec3[],
  radius: readonly number[],
  segments: number,
  color: Rgb,
): void {
  piece.add(sweep(tubeRings(points, radius, segments)), color, transform(), 'metal');
}

/**
 * The largest turn of a corner that {@link rounded} keeps as one point, in radians. A ring at a
 * gentle corner shows no kink, and it costs no curve.
 */
const GENTLE_TURN = 35 * (Math.PI / 180);

/**
 * Rounds each inner corner of a path with a curve, as a tube maker bends a tube around a form.
 * The curve starts and ends on the two legs of the corner, at most at the half of each leg. A
 * corner with a turn below {@link GENTLE_TURN} stays one point.
 *
 * @param points The corners of the path.
 * @param radius The distance from each corner at which its curve starts, in meters.
 * @param steps The number of steps of each curve.
 * @returns The path with the curves in place of the corners.
 */
export function rounded(points: readonly Vec3[], radius: number, steps: number): Vec3[] {
  const out: Vec3[] = [];
  const first = points[0];
  if (first) {
    out.push(first);
  }
  for (let i = 1; i + 1 < points.length; i++) {
    const a = new Vector3(...(points[i - 1] ?? [0, 0, 0]));
    const p = new Vector3(...(points[i] ?? [0, 0, 0]));
    const b = new Vector3(...(points[i + 1] ?? [0, 0, 0]));
    const toA = a.clone().sub(p);
    const toB = b.clone().sub(p);
    if (Math.PI - toA.angleTo(toB) < GENTLE_TURN) {
      out.push(toVec3(p));
      continue;
    }
    const cut = Math.min(radius, toA.length() / 2, toB.length() / 2);
    const start = p.clone().addScaledVector(toA.normalize(), cut);
    const end = p.clone().addScaledVector(toB.normalize(), cut);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      // A quadratic curve from the start through the pull of the corner to the end.
      out.push(
        toVec3(
          start
            .clone()
            .multiplyScalar((1 - t) * (1 - t))
            .addScaledVector(p, 2 * t * (1 - t))
            .addScaledVector(end, t * t),
        ),
      );
    }
  }
  const last = points.at(-1);
  if (last && points.length > 1) {
    out.push(last);
  }
  return out;
}

/**
 * Gives points on an arc of a circle.
 *
 * @param center The center of the circle.
 * @param u The direction of the angle 0, a unit vector.
 * @param v The direction of the angle π/2, a unit vector normal to `u`.
 * @param radius The radius.
 * @param from The angle of the first point, in radians.
 * @param to The angle of the last point, in radians.
 * @param steps The number of steps from the first point to the last point.
 * @returns `steps + 1` points.
 */
export function arc(
  center: Vec3,
  u: Vec3,
  v: Vec3,
  radius: number,
  from: number,
  to: number,
  steps: number,
): Vec3[] {
  const out: Vec3[] = [];
  for (let s = 0; s <= steps; s++) {
    const angle = from + ((to - from) * s) / steps;
    const c = radius * Math.cos(angle);
    const d = radius * Math.sin(angle);
    out.push([
      center[0] + u[0] * c + v[0] * d,
      center[1] + u[1] * c + v[1] * d,
      center[2] + u[2] * c + v[2] * d,
    ]);
  }
  return out;
}

/**
 * Adds a solid of revolution along an axis.
 *
 * @param piece The piece.
 * @param from The point on the axis where the profile height is 0.
 * @param axis The direction of the axis.
 * @param profile The radius at each distance along the axis.
 * @param segments The number of faces around the axis.
 * @param color The color.
 * @param finish The finish.
 */
export function turned(
  piece: PieceBuilder,
  from: Vec3,
  axis: Vec3,
  profile: readonly ProfilePoint[],
  segments: number,
  color: Rgb,
  finish: Finish = 'metal',
): void {
  const turn = new Quaternion().setFromUnitVectors(
    new Vector3(0, 1, 0),
    new Vector3(...axis).normalize(),
  );
  piece.add(lathe(profile, segments), color, transform(from, toQuat(turn)), finish);
}

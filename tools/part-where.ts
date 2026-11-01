import { Quaternion, Vector3 } from 'three';

import type { DemoFile } from './patch-demos.ts';
import type { WhereRequest } from './pose-depth.ts';
import { boneIndex } from '../src/models/rig.ts';
import type { BoneName } from '../src/models/rig.ts';
import type { Vec3 } from '../src/models/tuples.ts';
import { closedDepth } from '../src/pose/test-clearance.ts';
import { poseSkeleton, posedPoint } from '../src/pose/test-kinematics.ts';
import type { PosedSkeleton } from '../src/pose/test-kinematics.ts';
import { recastSceneOf } from '../src/pose/test-scene.ts';
import { posedCorner } from '../src/pose/test-skin.ts';
import type { RoleSweep } from '../src/pose/test-sweep.ts';
import { playSample } from '../src/pose/test-sweep-roles.ts';

/** The most corners that `--where` writes for each obstacle, the deepest first. */
const WHERE_CORNERS = 12;

/** The next joint of each arm bone, for the place of a corner along its bone. */
const NEXT_JOINT: Partial<Record<BoneName, BoneName>> = {
  upperArmL: 'forearmL',
  upperArmR: 'forearmR',
  forearmL: 'handL',
  forearmR: 'handR',
  handL: 'fingersL',
  handR: 'fingersR',
};

/** The frame of the strings of a bowed instrument in its bind pose, in the model axes. */
interface StringFrame {
  /** The contact point of the bow. */
  readonly contact: Vector3;
  /** The unit direction along the strings, from the bridge to the nut. */
  readonly axis: Vector3;
  /** The unit normal of the top plate. */
  readonly top: Vector3;
  /** The unit direction across the strings: `top × axis`, the bass side. */
  readonly across: Vector3;
}

/**
 * Writes a point as text.
 *
 * @param v The point.
 * @returns The text, such as `[0.120, -0.050, 0.003]`.
 */
function pointText(v: Vector3): string {
  return `[${v
    .toArray()
    .map((x) => x.toFixed(3))
    .join(', ')}]`;
}

/**
 * Writes a point in the frame of the strings.
 *
 * @param v The point in the bind axes of the instrument.
 * @param frame The frame of the strings, or `null` for an instrument with no strings.
 * @returns The text, such as ` strings [0.21, -0.15, 0.14]`, or empty with no frame.
 */
function stringsText(v: Vector3, frame: StringFrame | null): string {
  if (!frame) {
    return '';
  }
  const d = v.clone().sub(frame.contact);
  const values = [d.dot(frame.axis), d.dot(frame.top), d.dot(frame.across)];
  return ` strings [${values.map((x) => x.toFixed(2)).join(', ')}]`;
}

/**
 * Gives the posed place of the bind point of a bone.
 *
 * @param posed The posed skeleton.
 * @param bone The bone.
 * @returns The posed joint.
 */
function jointOf(posed: PosedSkeleton, bone: BoneName): Vector3 {
  const bind = posed.model.skeleton.positions[boneIndex(bone)] ?? [0, 0, 0];
  return new Vector3(...posedPoint(posed, bone, bind));
}

/**
 * Gives the corners of one bone and its joints at one play sample (`pnpm pose-depth --where`): the
 * first player of the role in the demo, each joint of the arm of the bone, and each corner of the
 * bone in each obstacle of the role, the deepest first. Each place is in the axes of the
 * instrument in its bind pose (the model axes of the `instrument` bone), and for a bowed
 * instrument also along the strings from the contact point, toward the top plate, and across
 * (`top × axis`).
 *
 * @param role The role.
 * @param where The bone, the demo, and the song time.
 * @param demos The demo of the request, with the role, or none.
 * @returns The lines of the text.
 * @throws Error if the demo has no player of the role.
 */
export function whereLines(
  role: RoleSweep,
  where: WhereRequest,
  demos: readonly DemoFile[],
): string[] {
  const [demo] = demos;
  const scene = demo ? recastSceneOf(demo.bytes, role.recast) : null;
  const [player] = scene ? role.players(scene) : [];
  if (!scene || !player) {
    throw new Error(`The demo "${where.demo}" has no player of the ${role.role}.`);
  }
  const posed = poseSkeleton(player.model, player.poseAt(playSample(scene, where.song)));
  const instrument = boneIndex('instrument');
  const frame = posed.frames[instrument];
  const pivot = new Vector3(...(player.model.skeleton.positions[instrument] ?? [0, 0, 0]));
  const inverse = frame ? frame.rotation.clone().invert() : new Quaternion();
  const toBind = (p: Vector3): Vector3 =>
    frame ? p.clone().sub(frame.position).applyQuaternion(inverse).add(pivot) : p.clone();

  const index = Number(/^\S+ (\d+)/.exec(player.name)?.[1] ?? -1);
  const note = scene.plan.players[index]?.note;
  let strings: StringFrame | null = null;
  if (note?.family === 'bowed') {
    const { rig } = note;
    const top = new Vector3(...rig.top);
    const axis = new Vector3(...rig.axis);
    strings = {
      contact: new Vector3(...rig.contact),
      axis,
      top,
      across: new Vector3().crossVectors(top, axis),
    };
  }

  const species = scene.layout.players[index]?.cast.species;
  const lines = [
    `The ${where.bone} of ${player.name}${species ? `, ${species},` : ''} in ${where.demo} at song ${where.song.toFixed(2)} s (play), in the axes of the instrument in m${strings ? ', and along the strings, to the top, and across from the contact point' : ''}:`,
  ];
  const side = where.bone.endsWith('L') ? 'L' : where.bone.endsWith('R') ? 'R' : null;
  const chain: readonly BoneName[] = side
    ? [`upperArm${side}`, `forearm${side}`, `hand${side}`, `fingers${side}`]
    : [where.bone];
  for (const bone of chain) {
    const place = toBind(jointOf(posed, bone));
    lines.push(`  joint ${bone}: ${pointText(place)}${stringsText(place, strings)}`);
  }

  const start = jointOf(posed, where.bone);
  const next = NEXT_JOINT[where.bone];
  const end = next ? jointOf(posed, next) : null;
  const along = (p: Vector3): string => {
    if (!end) {
      return '';
    }
    const span = end.clone().sub(start);
    return ` along ${(p.clone().sub(start).dot(span) / Math.max(span.lengthSq(), 1e-12)).toFixed(2)}`;
  };
  const wanted = boneIndex(where.bone);
  const corners: Vector3[] = [];
  const seen = new Set<string>();
  const { positions, bones } = player.model.mesh;
  for (let c = 0; c < bones.length; c++) {
    const key = `${positions[3 * c]} ${positions[3 * c + 1]} ${positions[3 * c + 2]}`;
    if (bones[c] === wanted && !seen.has(key)) {
      seen.add(key);
      corners.push(new Vector3(...posedCorner(posed, c)));
    }
  }
  for (const obstacle of role.obstacles) {
    const surface = obstacle.surface(posed);
    const inside = corners
      .map((p) => ({ p, depth: closedDepth([p], surface).depth }))
      .filter(({ depth }) => depth > 0)
      .toSorted((a, b) => b.depth - a.depth);
    lines.push(
      `  in ${obstacle.name}: ${inside.length} of ${corners.length} corners${inside.length > 0 ? `, the deepest ${((inside[0]?.depth ?? 0) * 100).toFixed(1)} cm` : ''}`,
    );
    for (const { p, depth } of inside.slice(0, WHERE_CORNERS)) {
      const place: Vec3 = toBind(p).toArray();
      const v = new Vector3(...place);
      lines.push(
        `    ${(depth * 100).toFixed(1)} cm at ${pointText(v)}${stringsText(v, strings)}${along(p)}`,
      );
    }
  }
  return lines;
}

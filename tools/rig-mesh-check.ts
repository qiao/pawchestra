/**
 * Measures a rig of `pnpm rig-mesh <animal> --check` (`docs/agents/rigging.md`, "The asset
 * chain"): the triangles, the size of the module, the seat, the head height, the reach, the lowest
 * point of each leg and of the tail above the floor, the standing body against the long-armed
 * source, and the thin faces near the joints of the limbs. It reads the GLB file of the rig and
 * writes no file.
 */
import { Matrix4, Quaternion, Vector3 } from 'three';

import { STUDIO_BONES, STUDIO_PARENTS, unpackStudioMesh } from '../src/models/studio-format.ts';
import type { StudioBody, StudioBone, StudioMesh } from '../src/models/studio-format.ts';
import {
  UPPER_TWIST_BONES,
  createStudioPose,
  skinStudioMesh,
  standingBody,
  studioRig,
  upperTwistTurn,
} from '../src/models/studio-rig.ts';
import type { Vec3 } from '../src/models/tuples.ts';
import { STUDIO_MESH_GZIP_BUDGET, STUDIO_TRIANGLE_BUDGET, gzipSize } from './studio-budgets.ts';
import {
  NOSE_WARNING,
  firstKeys,
  inspectStudioGlb,
  readGlb,
  readSkeleton,
  studioBody,
  worldMatrices,
} from './studio-body.ts';
import type { AnimalSettings } from './studio-body.ts';
import { clamp01 } from '../src/math.ts';

/** The largest error of the standing body against the long-armed source, in meters. */
const STANDING_LIMIT = 0.001;

/**
 * The joints of the limbs that the check of the thin faces looks at: the bone that starts at the
 * joint, and the name of the joint.
 */
export const LIMB_JOINTS = [
  ['upper_arm', 'shoulder'],
  ['forearm', 'elbow'],
  ['hand', 'wrist'],
  ['thigh', 'hip'],
  ['shin', 'knee'],
  ['foot', 'ankle'],
] as const;

/**
 * The rule of the thin faces that `--check` lists as candidates for a ring (`check.thin` of the
 * config of the mesh rig). A long thin face across a joint folds when the joint bends.
 */
export interface ThinRule {
  /** The largest smallest corner angle of a thin face, in degrees. */
  readonly angle: number;
  /** The shortest longest edge of a listed face, in the units of the studio. */
  readonly length: number;
  /** The largest distance from the joint to the longest edge, in the units of the studio. */
  readonly near: number;
}

/** A thin face near a joint of a limb. */
interface ThinFace {
  /** The index of the triangle in the packed mesh, as `pnpm fold-probe` counts the faces. */
  readonly face: number;
  /** The bone that starts at the nearest joint, such as `forearm_L`. */
  readonly bone: string;
  /** The smallest corner angle, in degrees. */
  readonly angle: number;
  /** The longest edge, in meters. */
  readonly length: number;
  /** The distance from the joint to the longest edge, in meters. */
  readonly distance: number;
}

/**
 * Gives the distance from a point to a segment.
 *
 * @param p The point.
 * @param a The start of the segment.
 * @param b The end of the segment.
 * @returns The distance.
 */
function segmentDistance(p: Vector3, a: Vector3, b: Vector3): number {
  const ab = b.clone().sub(a);
  const t = clamp01(p.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-12));
  return a.clone().addScaledVector(ab, t).distanceTo(p);
}

/**
 * Finds the thin faces near the joints of the limbs in the bind mesh of a studio body: each face
 * with a smallest corner angle below the angle of the rule, a longest edge of at least the length
 * of the rule, and a joint of {@link LIMB_JOINTS} within the distance of the rule of that edge.
 * A face goes to its nearest joint.
 *
 * @param mesh The places and the triangles of the mesh, in meters.
 * @param heads The head of each bone, in meters.
 * @param rule The rule. Its lengths are in the units of the studio.
 * @param scale The meters for each unit of the studio.
 * @returns The faces, by joint in the order of {@link LIMB_JOINTS} and the left side first.
 */
export function thinFaces(
  mesh: Pick<StudioMesh, 'positions' | 'corners'>,
  heads: Readonly<Record<string, Vec3>>,
  rule: ThinRule,
  scale: number,
): ThinFace[] {
  const joints = LIMB_JOINTS.flatMap(([bone]) =>
    (['L', 'R'] as const).flatMap((side) => {
      const head = heads[`${bone}_${side}`];
      return head ? [{ bone: `${bone}_${side}`, head: new Vector3(...head) }] : [];
    }),
  );
  const point = (v: number): Vector3 => new Vector3().fromArray(mesh.positions, v * 3);
  const found: ThinFace[] = [];
  for (let t = 0; t < mesh.corners.length / 3; t++) {
    const corners = [0, 1, 2].map((k) => point(mesh.corners[t * 3 + k] ?? 0));
    const angles = corners.map((p, k) => {
      const a = (corners[(k + 1) % 3] ?? p).clone().sub(p);
      const b = (corners[(k + 2) % 3] ?? p).clone().sub(p);
      return a.angleTo(b) * (180 / Math.PI);
    });
    const smallest = Math.min(...angles);
    // The longest edge lies across the largest corner.
    const wide = angles.indexOf(Math.max(...angles));
    const a = corners[(wide + 1) % 3] ?? new Vector3();
    const b = corners[(wide + 2) % 3] ?? new Vector3();
    const length = a.distanceTo(b);
    if (smallest >= rule.angle || length < rule.length * scale) {
      continue;
    }

    const [nearest] = joints
      .map((joint) => ({ bone: joint.bone, distance: segmentDistance(joint.head, a, b) }))
      .toSorted((x, y) => x.distance - y.distance);
    if (nearest && nearest.distance <= rule.near * scale) {
      found.push({
        face: t,
        bone: nearest.bone,
        angle: smallest,
        length,
        distance: nearest.distance,
      });
    }
  }
  const order = joints.map((joint) => joint.bone);
  return found.toSorted((x, y) => order.indexOf(x.bone) - order.indexOf(y.bone) || x.face - y.face);
}

/** The bone chains whose lowest point above the floor `--check` gives: each leg, and the tail. */
const FLOOR_CHAINS = [
  ['leg L', ['thigh_L', 'shin_L', 'foot_L', 'toes_L']],
  ['leg R', ['thigh_R', 'shin_R', 'foot_R', 'toes_R']],
  ['tail', ['tail', 'tail_tip']],
] as const satisfies readonly (readonly [string, readonly StudioBone[]])[];

/** The lowest point of a bone chain above the floor. */
interface ChainLow {
  /** The name of the chain, such as `leg L`. */
  readonly chain: string;
  /** The height of the lowest point above the floor, in meters. */
  readonly low: number;
}

/**
 * Finds the lowest point of each chain of {@link FLOOR_CHAINS} above the floor, the plane y = 0 of
 * a studio body: the lowest vertex whose largest weight is on a bone of the chain. A chain with no
 * such vertex is left out, such as the tail of a body with no tail.
 *
 * @param mesh The places and the skin of the mesh, in meters.
 * @returns The lowest point of each chain, in the order of {@link FLOOR_CHAINS}.
 */
export function chainLows(mesh: Pick<StudioMesh, 'positions' | 'joints' | 'weights'>): ChainLow[] {
  const chainOf = new Map<number, string>(
    FLOOR_CHAINS.flatMap(([chain, bones]) =>
      bones.map((bone) => [STUDIO_BONES.indexOf(bone), chain] as const),
    ),
  );
  const lows = new Map<string, number>();
  for (let v = 0; v < mesh.positions.length / 3; v++) {
    let main = 0;
    for (let k = 1; k < 4; k++) {
      if ((mesh.weights[v * 4 + k] ?? 0) > (mesh.weights[v * 4 + main] ?? 0)) {
        main = k;
      }
    }
    const chain = chainOf.get(mesh.joints[v * 4 + main] ?? -1);
    const y = mesh.positions[v * 3 + 1] ?? 0;
    if (chain !== undefined && y < (lows.get(chain) ?? Infinity)) {
      lows.set(chain, y);
    }
  }
  return FLOOR_CHAINS.flatMap(([chain]) => {
    const low = lows.get(chain);
    return low === undefined ? [] : [{ chain, low }];
  });
}

/** The posed vertex of the standing body with the largest error against the source. */
interface WorstVertex {
  /** The index of the vertex in the packed mesh of the studio body. */
  readonly index: number;
  /** The distance of the vertex from the nearest vertex of the source, in meters. */
  readonly error: number;
  /** The bones of the skin of the vertex with their weights, the largest weight first. */
  readonly bones: readonly (readonly [StudioBone, number])[];
}

/** The error of the standing body of the app against the long-armed source of the rig. */
interface StandingError {
  /** The largest distance of a posed vertex from the nearest vertex of the source, in meters. */
  readonly worst: number;
  /**
   * The posed vertex with the largest error, so that a probe of the cause starts at it, or `null`
   * with no posed vertex.
   */
  readonly worstVertex: WorstVertex | null;
  /** The largest distance of a vertex of the source from the nearest posed vertex, in meters. */
  readonly back: number;
  /** The posed vertices that count. */
  readonly vertices: number;
  /** The vertices of the eye shells, which do not count: the source has no eye shells. */
  readonly shells: number;
}

/**
 * Reads the vertices of an OBJ file of the long-armed source in the model axes, in meters.
 *
 * @param obj The text of the file, in the units and the axes of the studio.
 * @param scale The meters for each unit.
 * @returns The vertices.
 */
export function objVertices(obj: string, scale: number): Vector3[] {
  return obj.split('\n').flatMap((line) => {
    const [kind, x, y, z] = line.split(' ');
    // The studio animal faces +z, and the model faces -z.
    return kind === 'v'
      ? [new Vector3(-Number(x), Number(y), -Number(z)).multiplyScalar(scale)]
      : [];
  });
}

/**
 * Measures the standing body of the app against the long-armed source of a rig: the standing body
 * of `studioRig(body, true)`, with each arm bone turned to the arm of the clip `reference` and both
 * arm corrective shapes at the weight 1.
 *
 * @param bytes The GLB file of the rig.
 * @param body The studio body of the file, exported as a seated body that also stands.
 * @param obj The text of the OBJ file of the long-armed source (`rig_mesh.py --obj`).
 * @returns The error.
 * @throws Error if the body does not stand.
 */
export function standingError(bytes: Uint8Array, body: StudioBody, obj: string): StandingError {
  if (!body.standing) {
    throw new Error('The body does not stand, so the standing check does not apply.');
  }
  const rig = studioRig(body, true);

  // The world turn of each arm bone from the bind pose to the clip reference, in the model axes.
  const glb = readGlb(bytes);
  const skeleton = readSkeleton(glb);
  const posed = worldMatrices(glb.json, firstKeys(glb, 'reference').nodes);
  const turnOf = (bone: string): Quaternion => {
    const world = posed[skeleton.nodes.get(bone) ?? -1] ?? new Matrix4();
    const bind = skeleton.binds.get(bone) ?? new Matrix4();
    const q = new Quaternion()
      .setFromRotationMatrix(world)
      .multiply(new Quaternion().setFromRotationMatrix(bind).invert());
    return new Quaternion(-q.x, q.y, -q.z, q.w);
  };
  const arm = (bone: string): boolean =>
    /^(clavicle|upper_arm|upper_arm_seg\d|forearm|forearm_twist|forearm_seg\d|elbow|wrist|hand|fingers)_/.test(
      bone,
    );
  // The arms of the standing body turn with a reclined chest (`StudioStanding.trunkTurns`), so the
  // turn to the clip starts after the turn of the chest.
  const chest = body.standing.trunkTurns?.chest;
  const undo = chest ? new Quaternion(...chest).invert() : new Quaternion();

  // Each arm bone turns around its head, and its children follow it from the chest out.
  const pose = createStudioPose();
  const heads = new Map<StudioBone, Vector3>();
  const turns = new Map<StudioBone, Quaternion>();
  for (const [index, bone] of STUDIO_BONES.entries()) {
    const place = rig.body.heads[bone];
    if (!place) {
      continue;
    }
    const from = new Vector3(...place);
    const parent = STUDIO_PARENTS[bone];
    const parentTurn = parent ? turns.get(parent) : undefined;
    const parentHead = parent ? heads.get(parent) : undefined;
    const to =
      parent && parentTurn && parentHead
        ? from
            .clone()
            .sub(new Vector3(...rig.body.heads[parent]))
            .applyQuaternion(parentTurn)
            .add(parentHead)
        : from.clone();
    const turn = arm(bone) ? turnOf(bone).multiply(undo) : new Quaternion();
    heads.set(bone, to);
    turns.set(bone, turn);
    const matrix = new Matrix4().makeRotationFromQuaternion(turn);
    const offset = from.clone().applyQuaternion(turn);
    matrix.setPosition(to.x - offset.x, to.y - offset.y, to.z - offset.z);
    matrix.toArray(pose.matrices, index * 16);
  }
  // The twist bone of each upper arm turns with its upper arm, less the rest of its roll from the
  // chest, which keeps its bind turn here (`StudioBody.upperTwist`).
  const share = rig.body.upperTwist;
  for (const side of share === undefined ? [] : (['L', 'R'] as const)) {
    const upperTurn = turns.get(`upper_arm_${side}`) ?? new Quaternion();
    const from = new Vector3(...rig.body.heads[`upper_arm_${side}`]);
    const to = heads.get(`upper_arm_${side}`) ?? from;
    const upperBind = new Vector3(...rig.body.heads[`forearm_${side}`]).sub(from).normalize();
    const turn = upperTwistTurn(
      upperTurn,
      new Quaternion(),
      upperBind,
      share ?? 1,
      new Quaternion(),
    );
    const offset = from.clone().applyQuaternion(turn);
    new Matrix4()
      .makeRotationFromQuaternion(turn)
      .setPosition(to.x - offset.x, to.y - offset.y, to.z - offset.z)
      .toArray(pose.matrices, UPPER_TWIST_BONES[side] * 16);
  }
  pose.correctives.fill(1, 0, 2);
  const positions = skinStudioMesh(rig.mesh, pose);

  // The vertices of the eye shells follow the eye bones.
  const eyes = new Set([STUDIO_BONES.indexOf('eye_L'), STUDIO_BONES.indexOf('eye_R')]);
  const mine: Vector3[] = [];
  const indices: number[] = [];
  let shells = 0;
  for (let v = 0; v < positions.length / 3; v++) {
    if (eyes.has(rig.mesh.joints[v * 4] ?? -1) && (rig.mesh.weights[v * 4] ?? 0) > 0.5) {
      shells++;
    } else {
      mine.push(new Vector3().fromArray(positions, v * 3));
      indices.push(v);
    }
  }

  const target = objVertices(obj, body.scale);
  const nearest = (p: Vector3, set: readonly Vector3[]): number =>
    set.reduce((best, q) => Math.min(best, p.distanceToSquared(q)), Infinity);
  let worst = 0;
  let worstAt = -1;
  for (const [k, p] of mine.entries()) {
    const error = Math.sqrt(nearest(p, target));
    if (error > worst || worstAt < 0) {
      worst = error;
      worstAt = k;
    }
  }
  const back = Math.sqrt(target.reduce((m, q) => Math.max(m, nearest(q, mine)), 0));
  const index = indices[worstAt];
  const worstVertex =
    index === undefined ? null : { index, error: worst, bones: skinOf(rig.mesh, index) };
  return { worst, worstVertex, back, vertices: mine.length, shells };
}

/**
 * Gives the bones of the skin of a vertex with their weights.
 *
 * @param mesh The skin of the mesh.
 * @param v The index of the vertex.
 * @returns The bones with a weight above 0, the largest weight first.
 */
function skinOf(
  mesh: Pick<StudioMesh, 'joints' | 'weights'>,
  v: number,
): (readonly [StudioBone, number])[] {
  const bones: (readonly [StudioBone, number])[] = [];
  for (let k = 0; k < 4; k++) {
    const bone = STUDIO_BONES[mesh.joints[v * 4 + k] ?? -1];
    const weight = mesh.weights[v * 4 + k] ?? 0;
    if (bone && weight > 0) {
      bones.push([bone, weight]);
    }
  }
  return bones.toSorted((a, b) => b[1] - a[1]);
}

/**
 * Gives the warning of a tip of the nose off the middle plane: the tip and the mouth below it lie
 * more than `NOSE_WARNING` of `tools/studio-body.ts` from the plane, so a hold at the mouth, such
 * as a reed or a mouthpiece, moves to the side.
 *
 * @param body The studio body.
 * @returns The text of the warning, or `null` for a tip near the plane.
 */
export function noseWarning(body: Pick<StudioBody, 'nose'>): string | null {
  const off = Math.abs(body.nose[0]);
  if (off <= NOSE_WARNING) {
    return null;
  }
  return `the tip of the nose and the mouth lie ${(off * 100).toFixed(1)} cm from the middle plane (more than ${NOSE_WARNING * 100} cm), so a hold at the mouth moves to the side.`;
}

/** The measures of a rig for `--check`. */
interface RigMeasures {
  /** The triangles of the packed mesh. */
  readonly triangles: number;
  /** The studio body with the settings of the animal. */
  readonly body: StudioBody;
  /**
   * The seat that fits the legs of a seated body, in meters: the seat height of the export with no
   * seat of `ANIMALS` ({@link legSettings}), or `null` for a body that stands.
   */
  readonly legSeat: number | null;
  /** The arm of each side from the shoulder joint to the middle of the palm, in meters. */
  readonly arms: Readonly<Record<'L' | 'R', number | null>>;
  /** The error of the standing body against the long-armed source. */
  readonly standing: StandingError;
  /** The lowest point of each bone chain above the floor in the seated bind and standing. */
  readonly floor: {
    /** The chains of the seated bind, with the soles on the floor. */
    readonly seated: readonly ChainLow[];
    /** The chains of the standing body of the app. */
    readonly standing: readonly ChainLow[];
  };
  /** The thin faces near the joints of the limbs. */
  readonly thin: readonly ThinFace[];
}

/**
 * Measures a rig with the settings of its animal.
 *
 * @param bytes The GLB file of the rig.
 * @param source The name of the file in the module.
 * @param settings The settings of the animal.
 * @param obj The text of the OBJ file of the long-armed source.
 * @param rule The rule of the thin faces.
 * @returns The measures.
 */
export function measureRig(
  bytes: Uint8Array,
  source: string,
  settings: AnimalSettings,
  obj: string,
  rule: ThinRule,
): RigMeasures {
  const { body } = studioBody(bytes, source, settings);
  const mesh = unpackStudioMesh(body.mesh);
  const standing =
    settings.seated && settings.soloist ? body : standingExport(bytes, source, settings);
  const facts = inspectStudioGlb(bytes, settings);
  const meters = (value: number | null): number | null =>
    value === null ? null : value * facts.scale;
  const seated = settings.seated ? body : standingExport(bytes, source, settings);
  return {
    triangles: mesh.corners.length / 3,
    body,
    legSeat: settings.seated
      ? studioBody(bytes, source, legSettings(settings)).body.seatHeight
      : null,
    arms: { L: meters(facts.arms.L), R: meters(facts.arms.R) },
    standing: standingError(bytes, standing, obj),
    floor: {
      seated: chainLows(unpackStudioMesh(seated.mesh)),
      standing: chainLows(standingBody(standing, unpackStudioMesh(standing.mesh)).mesh),
    },
    thin: thinFaces(mesh, body.heads, rule, body.scale),
  };
}

/**
 * Gives the settings of an animal with no seat height. The export then drops the seated body until
 * its lowest point is on the floor, and the seat fits its legs (design 4.4), as the seat of a
 * form change before the seat of `ANIMALS`.
 *
 * @param settings The settings of the animal.
 * @returns The settings with no `seat`.
 */
export function legSettings(settings: AnimalSettings): AnimalSettings {
  const { seat, ...legs } = settings;
  return seat === undefined ? settings : legs;
}

/**
 * Exports a rig as a seated body that also stands, for the standing check of a role that only
 * sits.
 *
 * @param bytes The GLB file of the rig.
 * @param source The name of the file in the module.
 * @param settings The settings of the animal.
 * @returns The body.
 */
function standingExport(bytes: Uint8Array, source: string, settings: AnimalSettings): StudioBody {
  return studioBody(bytes, source, { ...settings, seated: true, soloist: true }).body;
}

/**
 * Writes the lowest point of each bone chain.
 *
 * @param lows The lowest points.
 * @returns The text, such as `leg L 0.000 m, leg R 0.000 m, tail 0.044 m`.
 */
function chainText(lows: readonly ChainLow[]): string {
  return lows.map(({ chain, low }) => `${chain} ${low.toFixed(3)} m`).join(', ') || 'none';
}

/**
 * Writes the measures of a rig as lines.
 *
 * @param measures The measures.
 * @param module The text of the module that `pnpm studio-body` would write.
 * @param rule The rule of the thin faces.
 * @returns The lines.
 */
export function measureLines(measures: RigMeasures, module: string, rule: ThinRule): string[] {
  const { body, standing } = measures;
  const m = (value: number | null): string => (value === null ? 'none' : `${value.toFixed(3)} m`);
  const mm = (value: number): string => `${(value * 1000).toFixed(3)} mm`;
  const bytes = (value: number): string => `${value.toLocaleString('en-US')} B`;
  const lines = [
    `Module: ${bytes(module.length)}, ${bytes(gzipSize(module))} after gzip. Packed mesh: ${bytes(gzipSize(body.mesh))} after gzip, budget ${bytes(STUDIO_MESH_GZIP_BUDGET)} (src/models/studio-size.test.ts).`,
    `Scale ${body.scale} m for each unit. Head height H ${m(body.headHeight)}. Seat height ${m(body.seatHeight)}, ${m(measures.legSeat)} with no seat of ANIMALS (the seat of the legs). Chair depth ${m(body.chairDepth)}.`,
    `Arm from the shoulder joint to the middle of the palm: L ${m(measures.arms.L)}, R ${m(measures.arms.R)}.`,
    `Lowest point above the floor, seated bind (seat height ${m(body.seatHeight)}): ${chainText(measures.floor.seated)}. Standing body: ${chainText(measures.floor.standing)}.`,
    `Standing body against the long-armed source: ${mm(standing.worst)} at most (limit ${mm(STANDING_LIMIT)}), ${mm(standing.back)} back, ${standing.vertices} vertices, ${standing.shells} eye vertices left out.${standing.worst > STANDING_LIMIT ? ' ABOVE THE LIMIT.' : ''}`,
    `Worst standing vertex: ${worstText(standing.worstVertex)}.`,
    `Tip of the nose: ${body.nose.map((x) => x.toFixed(3)).join(', ')} m, ${(Math.abs(body.nose[0]) * 100).toFixed(1)} cm from the middle plane.`,
    `Thin faces near the joints of the limbs (corner below ${rule.angle}°, longest edge from ${rule.length} u, joint within ${rule.near} u), candidates for a ring:`,
  ];
  for (const [bone, joint] of LIMB_JOINTS) {
    for (const side of ['L', 'R'] as const) {
      const faces = measures.thin.filter((face) => face.bone === `${bone}_${side}`);
      if (faces.length > 0) {
        const list = faces.map(
          (face) =>
            `${face.face} (${face.angle.toFixed(1)}°, ${m(face.length)}, ${m(face.distance)} from the joint)`,
        );
        lines.push(`  ${joint} ${side}: ${list.join(', ')}`);
      }
    }
  }
  if (measures.thin.length === 0) {
    lines.push('  none');
  }
  const nose = noseWarning(body);
  if (nose) {
    lines.push(`Warning: ${nose}`);
  }
  return lines;
}

/**
 * Writes the posed vertex of the standing body with the largest error.
 *
 * @param vertex The vertex, or `null`.
 * @returns The text, such as `4021, 0.312 mm, bones spine1 0.620, chest 0.380`.
 */
function worstText(vertex: WorstVertex | null): string {
  if (!vertex) {
    return 'none';
  }
  const bones = vertex.bones.map(([bone, weight]) => `${bone} ${weight.toFixed(3)}`).join(', ');
  return `${vertex.index}, ${(vertex.error * 1000).toFixed(3)} mm, bones ${bones}`;
}

/**
 * Writes the line of the triangles against the budget of a studio body.
 *
 * @param triangles The triangles of the rig.
 * @returns The line.
 * @throws Error above the budget, with the line.
 */
export function triangleLine(triangles: number): string {
  const line = `Triangles: ${triangles} of the budget of ${STUDIO_TRIANGLE_BUDGET} of a studio body.`;
  if (triangles > STUDIO_TRIANGLE_BUDGET) {
    throw new Error(`${line} The rig is above the budget, so the check stops.`);
  }
  return line;
}

/**
 * Measures how each arm of a mesh rig meets the trunk in the stance of the long-armed source mesh
 * (`standingBody()`), the intake check of `pnpm rig-mesh <animal> --check`. An arm that joins the
 * trunk far down, or that touches it, hides trunk faces that a raised arm then shows as flaps,
 * shards, or dents. A new mesh in an A-pose, with a gap between each arm and the trunk, has none.
 *
 * - An arm vertex holds {@link GAP_SHARE} or more of its weight on the arm bones of its side, from
 *   the upper arm to the fingers. Its place along the arm is 0 at the shoulder joint, 1 at the
 *   elbow, and 2 at the wrist (the nearest of the two bones). Only the vertices from
 *   {@link GAP_FROM} on count, because the root of each arm joins the trunk.
 * - A trunk vertex of an arm holds less than {@link GAP_SHARE} of its weight on the arm, and
 *   {@link GAP_SHARE} or more on the arm, the hips, the spine, the chest, the neck, and the
 *   clavicles. Thus the skin of the shoulder that the arm moves in part counts as trunk. A trunk face
 *   has three trunk corners.
 * - The join of an arm is the range of the places of the counted arm vertices with an edge to a
 *   trunk vertex: the skin goes on from the arm into the trunk there. Its end is the depth of the
 *   armpit. The arm joins the trunk when the end is past {@link JOIN_LIMIT}.
 * - The gap of an arm is the smallest distance from a counted arm vertex below the join (from its
 *   end plus {@link GAP_BELOW}) to a trunk face. The arm touches the trunk below {@link TOUCH_GAP}.
 *
 * Usage: node tools/arm-gap.ts [<animal>...]: the values of the rig of each config of
 * `tools/mesh-rigs/` (all with no animal), from the GLB file of the rig in `assets/models/`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join as joinPath } from 'node:path';

import { Triangle, Vector3 } from 'three';

import { STUDIO_BONES, unpackStudioMesh } from '../src/models/studio-format.ts';
import { sideSegmentBones } from './arm-segments.ts';
import type { Side, StudioBody } from '../src/models/studio-format.ts';
import { UPPER_TWIST_BONES, standingBody } from '../src/models/studio-rig.ts';
import { weightOn } from './skin-weight.ts';
import { clamp01 } from '../src/math.ts';

/** The smallest share of the weight of a vertex on a group of bones that puts it in the group. */
const GAP_SHARE = 0.5;

/** The first place along the arm that counts: 0.35 of the upper arm, below the root. */
const GAP_FROM = 0.35;

/**
 * The deepest end of the join of a good armpit, as a place along the arm. The arms of the known good
 * roles end their join at 0.52 to 0.78 of the upper arm, and the deer and the dog, whose seams
 * show shards, at 0.80 to 0.94.
 */
const JOIN_LIMIT = 0.79;

/** The part of the upper arm below the end of the join from which the gap counts. */
const GAP_BELOW = 0.1;

/** The gap below which an arm touches the trunk, in meters. */
const TOUCH_GAP = 0.005;

/** How one arm meets the trunk. */
interface ArmGap {
  /** The side. */
  readonly side: Side;
  /** The places along the arm of the join, as the first and the last, or `null` for none. */
  readonly join: readonly [number, number] | null;
  /** The smallest gap from the arm below the join to the trunk, in meters, or `null` for none. */
  readonly gap: number | null;
  /** The place along the arm of the smallest gap. */
  readonly at: number;
}

/** The bones of the trunk. */
const TRUNK_BONES: ReadonlySet<number> = new Set(
  (['hips', 'spine', 'spine1', 'chest', 'neck', 'clavicle_L', 'clavicle_R'] as const).map((bone) =>
    STUDIO_BONES.indexOf(bone),
  ),
);

/**
 * Gives the place of a point along an arm, on the nearest of the two bones: 0 at the shoulder, 1 at
 * the elbow, and 2 at the wrist.
 *
 * @param p The point.
 * @param joints The shoulder, the elbow, and the wrist.
 * @returns The place.
 */
function armPlace(p: Vector3, joints: readonly [Vector3, Vector3, Vector3]): number {
  const [shoulder, elbow, wrist] = joints;
  const along = (a: Vector3, b: Vector3) => {
    const ab = b.clone().sub(a);
    const t = clamp01(p.clone().sub(a).dot(ab) / Math.max(1e-12, ab.lengthSq()));
    return { t, d: a.clone().addScaledVector(ab, t).distanceTo(p) };
  };
  const upper = along(shoulder, elbow);
  const fore = along(elbow, wrist);
  return upper.d <= fore.d ? upper.t : 1 + fore.t;
}

/**
 * Measures how each arm of a studio body meets the trunk in the stance of its source mesh.
 *
 * @param body The studio body, with its standing pose.
 * @returns The join and the gap of each arm.
 * @throws Error if the body has no standing pose.
 */
export function armGaps(body: StudioBody): ArmGap[] {
  const posed = standingBody(body, unpackStudioMesh(body.mesh));
  const mesh = posed.mesh;
  const { positions, corners } = mesh;
  const point = (v: number): Vector3 => new Vector3().fromArray(positions, v * 3);
  const count = positions.length / 3;

  return (['L', 'R'] as const).map((side): ArmGap => {
    const bones = [
      ...(['upper_arm', 'forearm', 'forearm_twist', 'hand', 'fingers'] as const).map((bone) =>
        STUDIO_BONES.indexOf(`${bone}_${side}`),
      ),
      ...sideSegmentBones(side).map((bone) => STUDIO_BONES.indexOf(bone)),
    ];
    const arm = new Set([...bones, UPPER_TWIST_BONES[side]]);
    const near = new Set([...arm, ...TRUNK_BONES]);
    const trunk = Array.from(
      { length: count },
      (...[, v]) => weightOn(mesh, v, arm) < GAP_SHARE && weightOn(mesh, v, near) >= GAP_SHARE,
    );
    const trunkFaces: Triangle[] = [];
    for (let f = 0; f < corners.length / 3; f++) {
      const [a = 0, b = 0, c = 0] = [0, 1, 2].map((k) => corners[f * 3 + k] ?? 0);
      if (trunk[a] && trunk[b] && trunk[c]) {
        trunkFaces.push(new Triangle(point(a), point(b), point(c)));
      }
    }
    const h = posed.body.heads;
    const [shoulder, elbow, wrist] = [
      h[`upper_arm_${side}`],
      h[`forearm_${side}`],
      h[`hand_${side}`],
    ].map((head) => new Vector3(...head));
    if (!shoulder || !elbow || !wrist) {
      throw new Error(`The body has no joints of the ${side} arm.`);
    }
    const place = new Map<number, number>();
    for (let v = 0; v < count; v++) {
      if (weightOn(mesh, v, arm) >= GAP_SHARE) {
        const t = armPlace(point(v), [shoulder, elbow, wrist]);
        if (t >= GAP_FROM) {
          place.set(v, t);
        }
      }
    }

    const joined: number[] = [];
    for (let f = 0; f < corners.length / 3; f++) {
      for (let k = 0; k < 3; k++) {
        const a = corners[f * 3 + k] ?? 0;
        const b = corners[f * 3 + ((k + 1) % 3)] ?? 0;
        const t = place.get(a) ?? place.get(b);
        if (t !== undefined && (trunk[a] || trunk[b])) {
          joined.push(t);
        }
      }
    }
    const join: readonly [number, number] | null =
      joined.length === 0 ? null : [Math.min(...joined), Math.max(...joined)];

    const from = Math.max(GAP_FROM, (join?.[1] ?? 0) + GAP_BELOW);
    let gap: number | null = null;
    let at = 0;
    const closest = new Vector3();
    for (const [v, t] of place) {
      if (t < from) {
        continue;
      }
      const p = point(v);
      for (const face of trunkFaces) {
        const meters = face.closestPointToPoint(p, closest).distanceTo(p) * body.scale;
        if (gap === null || meters < gap) {
          gap = meters;
          at = t;
        }
      }
    }
    return { side, join, gap, at };
  });
}

/**
 * Writes how the arms of an animal meet the trunk, with a warning for an arm that joins the trunk
 * past {@link JOIN_LIMIT} or touches it.
 *
 * @param animal The animal.
 * @param gaps The values of {@link armGaps}.
 * @returns The lines.
 */
export function gapLines(animal: string, gaps: readonly ArmGap[]): string[] {
  const cell = (g: ArmGap): string => {
    const join = g.join ? `${g.join[0].toFixed(2)} to ${g.join[1].toFixed(2)}` : 'none';
    const gap = g.gap === null ? 'none' : `${(g.gap * 100).toFixed(1)} cm at ${g.at.toFixed(2)}`;
    return `${g.side} join ${join}, gap ${gap}`;
  };
  const lines = [
    `Arms and trunk in the stance of the source (place along the arm: 1 the elbow, 2 the wrist; join limit ${JOIN_LIMIT}, touch below ${TOUCH_GAP * 100} cm): ${gaps.map(cell).join('; ')}.`,
  ];
  for (const g of gaps) {
    const deep = (g.join?.[1] ?? 0) > JOIN_LIMIT;
    const touch = g.gap !== null && g.gap < TOUCH_GAP;
    if (deep || touch) {
      lines.push(
        `WARNING: the ${g.side} arm of ${animal} ${deep ? 'joins the trunk down to' : 'touches the trunk at'} ${(deep ? (g.join?.[1] ?? 0) : g.at).toFixed(2)} of the arm. A raised arm then shows the hidden trunk faces as flaps, shards, or dents. Ask for a new mesh in an A-pose, with a gap between each arm and the trunk. Else plan a cut and a remodel of the arm (docs/agents/rigging.md).`,
      );
    }
  }
  return lines;
}

if (import.meta.main) {
  // The tool reads the config and the settings itself, because `tools/rig-mesh.ts` imports it.
  const { ANIMALS, studioBody } = await import('./studio-body.ts');
  const root = joinPath(import.meta.dirname, '..');
  const given = process.argv.slice(2);
  const animals =
    given.length > 0
      ? given
      : readdirSync(joinPath(root, 'tools', 'mesh-rigs'))
          .filter((file) => file.endsWith('.json'))
          .map((file) => file.replace(/\.json$/, ''));
  for (const animal of animals) {
    const text = readFileSync(joinPath(root, 'tools', 'mesh-rigs', `${animal}.json`), 'utf8');
    // SAFETY: each config of tools/mesh-rigs/ names its rig in `output` (`MeshRigConfig`).
    const config = JSON.parse(text) as { readonly output: string };
    const settings = ANIMALS.get(animal);
    if (!settings) {
      console.log(`${animal}: ANIMALS has no settings, so the tool skips it.`);
      continue;
    }
    const bytes = new Uint8Array(readFileSync(joinPath(root, config.output)));
    // A role that only sits gets the standing pose of the export, as the standing check does.
    const { body } = studioBody(bytes, config.output, { ...settings, seated: true, soloist: true });
    console.log([`${animal}:`, ...gapLines(animal, armGaps(body))].join('\n  '));
  }
}

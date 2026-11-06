/**
 * Measures the seated tail of the studio body of a role against its chair and the floor, for
 * `pnpm rig-mesh --check` (`docs/agents/rigging.md`, "The asset chain"): the lowest point of the
 * tail, and the smallest gap from a corner of the tail to the seat, the two back posts, and the top
 * rail of the chair of the app ({@link chairParts}), with a negative gap for a corner inside a
 * part.
 * The samples are the rest pose before the first play over one sway period of the tail
 * (`IDLE_MOTION.tailSec`), from the wall time {@link TAIL_FROM_SEC} at steps of
 * {@link TAIL_STEP_SEC}, in the first demo with the role. A body with no chair, such as a body with
 * `noChair` or a standing body, gives the gap to the floor only. The check runs it as a child in
 * the copy of `tools/glb-swap.ts` with the body of each variant.
 *
 * Usage: node tools/tail-gap.ts <role>
 */
import { Vector3 } from 'three';

import type { Bounds } from '../src/models/bounds.ts';
import { CHAIR, chairBack, chairSeat, seatHeights } from '../src/models/props.ts';
import type { Support } from '../src/models/props.ts';
import { SPECIES } from '../src/models/species.ts';
import { countInAt } from '../src/pose/count-in.ts';
import { IDLE_MOTION } from '../src/pose/idle.ts';
import { createScenePose, poseAt } from '../src/pose/pose-at.ts';
import { posedPart } from '../src/pose/test-clearance.ts';
import { poseSkeleton } from '../src/pose/test-kinematics.ts';
import { NOT_STARTED, allAudible, sceneOf } from '../src/pose/test-scene.ts';
import { FOLD_ROLES, roleBodies } from './fold-probe.ts';
import { probeDemos } from './probe-demos.ts';

/** The first wall time of the samples, in seconds, after the start of the idle motion. */
const TAIL_FROM_SEC = 10;

/** The step of the wall time of the samples, in seconds. */
const TAIL_STEP_SEC = 0.25;

/** One part of the chair, with its name. */
interface ChairPart {
  /** The name of the part, such as `seat` or `top rail`. */
  readonly name: string;
  /** The box of the part, in meters, in the axes of the model. */
  readonly box: Bounds;
}

/**
 * Gives the parts of the chair of the app that a tail can touch: the seat, the two back posts,
 * and the top rail, as `buildChair()` of `src/models/props.ts` builds them.
 *
 * @param seatHeight The height of the seat, in meters.
 * @param seatDepth The depth of the seat, in meters.
 * @param seatWidth The width of the seat, in meters.
 * @returns The parts.
 */
function chairParts(seatHeight: number, seatDepth: number, seatWidth: number): ChairPart[] {
  const back = chairBack(seatHeight, seatWidth);
  return [
    { name: 'seat', box: chairSeat(seatHeight, seatDepth, seatWidth) },
    ...back.map((box, k) => ({ name: ['left post', 'right post', 'top rail'][k] ?? 'back', box })),
  ];
}

/**
 * Gives the gap from a point to a box: the distance outside the box, or the negative depth inside
 * it.
 *
 * @param p The point.
 * @param box The box.
 * @returns The gap, in meters.
 */
function boxGap(p: Vector3, box: Bounds): number {
  const { min, max } = box;
  const outside = Math.hypot(
    Math.max(min[0] - p.x, 0, p.x - max[0]),
    Math.max(min[1] - p.y, 0, p.y - max[1]),
    Math.max(min[2] - p.z, 0, p.z - max[2]),
  );
  if (outside > 0) {
    return outside;
  }
  return -Math.min(
    p.x - min[0],
    max[0] - p.x,
    p.y - min[1],
    max[1] - p.y,
    p.z - min[2],
    max[2] - p.z,
  );
}

/** The tail of a role over one sway period. */
interface TailGaps {
  /** The demo of the samples. */
  readonly demo: string;
  /** The species of the body. */
  readonly species: string;
  /** The support of the body. */
  readonly support: Support;
  /** The seat height, in meters, or `null` with no chair. */
  readonly seat: number | null;
  /** The lowest point of the tail above the floor, in meters, with its sample. */
  readonly lowest: { readonly gap: number; readonly at: string };
  /** The smallest gap to each part of the chair, in the order of {@link chairParts}. */
  readonly parts: readonly { readonly name: string; readonly gap: number; readonly at: string }[];
}

/**
 * Measures the tail of the first body of a role in the first demo with the role.
 *
 * @param role The name of a role of `FOLD_ROLES`.
 * @returns The gaps, or `null` when no demo has the role or the body has no tail.
 * @throws Error if the role is not a role of `FOLD_ROLES`.
 */
async function tailGaps(role: string): Promise<TailGaps | null> {
  const source = FOLD_ROLES.get(role);
  if (!source) {
    throw new Error(`No role ${role}. The roles: ${[...FOLD_ROLES.keys()].join(', ')}.`);
  }

  for (const demo of await probeDemos()) {
    const scene = sceneOf(demo.bytes);
    const [body] = roleBodies(source, scene);
    if (!body) {
      continue;
    }
    const place = body.index === null ? null : scene.layout.players[body.index];
    const support: Support = place ? place.cast.support : 'stand';
    const species = place ? place.cast.species : null;
    const seat = species ? seatHeights(support, SPECIES[species]) : null;
    const chair = support === 'chair' && seat && !seat.noChair ? seat : null;
    const parts = chair
      ? chairParts(
          chair.seatHeight,
          chair.seatDepth ?? CHAIR.seatDepth,
          chair.seatWidth ?? CHAIR.seatWidth,
        )
      : [];
    const buffer = createScenePose(scene.plan);
    const audible = allAudible(scene.score);
    const song = -countInAt(scene.plan.beats, 0).lengthSec;
    let lowest = { gap: Infinity, at: '' };
    const worst = parts.map((part) => ({ name: part.name, gap: Infinity, at: '' }));
    const steps = Math.round(IDLE_MOTION.tailSec / TAIL_STEP_SEC);
    for (let k = 0; k <= steps; k++) {
      const wall = TAIL_FROM_SEC + k * TAIL_STEP_SEC;
      const at = `rest, wall ${wall.toFixed(2)} s`;
      const scenePose = poseAt(scene.plan, song, wall, NOT_STARTED, audible, buffer);
      const pose = body.index === null ? scenePose.conductor : scenePose.players[body.index];
      if (!pose) {
        continue;
      }
      const tail = posedPart(poseSkeleton(body.model, pose), ['tail1', 'tail2']);
      for (const triangle of tail.triangles) {
        for (const p of [triangle.a, triangle.b, triangle.c]) {
          if (p.y < lowest.gap) {
            lowest = { gap: p.y, at };
          }
          for (const [i, part] of parts.entries()) {
            const gap = boxGap(p, part.box);
            const old = worst[i];
            if (old && gap < old.gap) {
              worst[i] = { name: part.name, gap, at };
            }
          }
        }
      }
    }
    if (lowest.gap === Infinity) {
      return null;
    }
    return {
      demo: demo.file,
      species: species ?? 'conductor',
      support,
      seat: chair ? chair.seatHeight : null,
      lowest,
      parts: worst,
    };
  }
  return null;
}

/**
 * Writes the gaps of a role as lines of text.
 *
 * @param role The role.
 * @param gaps The gaps ({@link tailGaps}), or `null`.
 * @returns The lines.
 */
function tailLines(role: string, gaps: TailGaps | null): string[] {
  if (!gaps) {
    return [`The ${role} has no tail in a demo.`];
  }
  const cm = (meters: number): string => `${(meters * 100).toFixed(1)} cm`;
  const others: Readonly<Record<Support, string>> = {
    chair: 'seated with no chair',
    stool: 'on the stool',
    bench: 'on the bench',
    stand: 'standing',
    riser: 'on a riser',
  };
  const where =
    gaps.seat === null ? others[gaps.support] : `on the chair, seat ${gaps.seat.toFixed(3)} m`;
  return [
    `Tail of the ${role} (${gaps.species}, ${where}) in the rest of ${gaps.demo} over one sway period of ${IDLE_MOTION.tailSec} s, at steps of ${TAIL_STEP_SEC} s. A negative gap is a depth inside the part.`,
    `  floor: ${cm(gaps.lowest.gap)} (${gaps.lowest.at})`,
    ...gaps.parts.map((part) => `  ${part.name}: ${cm(part.gap)} (${part.at})`),
  ];
}

if (import.meta.main) {
  try {
    const [role] = process.argv.slice(2);
    if (!role) {
      throw new Error('Usage: node tools/tail-gap.ts <role>');
    }
    console.log(tailLines(role, await tailGaps(role)).join('\n'));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

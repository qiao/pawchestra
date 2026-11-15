/**
 * Measures the reach of the strikes of a percussion player (design 5.3): for each demo in which
 * the species plays the instrument, the distance of the piece of each hand from the point of each
 * of its strikes at the note start. The piece is the head of a mallet, or the inner face of a
 * cymbal. `pnpm hold-reach --instrument` and `pnpm mesh-options --instrument` give the share of the
 * strikes within `TARGET_REACH` of `tools/pose-depth.ts` and the worst error.
 */
import { Vector3 } from 'three';

import { SECTION_INSTRUMENTS } from '../src/models/cast.ts';
import type { SpeciesId } from '../src/models/species.ts';
import { countInAt } from '../src/pose/count-in.ts';
import { PERCUSSION_HOLDS } from '../src/pose/percussion-rig.ts';
import type { PercussionInstrument } from '../src/pose/percussion-rig.ts';
import { createScenePose, poseAt } from '../src/pose/pose-at.ts';
import { poseSkeleton, posedPiecePoint } from '../src/pose/test-kinematics.ts';
import { PLAYING, allAudible, sceneOf } from '../src/pose/test-scene.ts';
import { scoreOf } from '../src/score/test-score.ts';
import type { DemoFile } from './patch-demos.ts';
import { TARGET_REACH } from './pose-depth.ts';

/** The percussion instruments, in the order of `PERCUSSION_HOLDS`. */
export const PERCUSSION_INSTRUMENTS: readonly PercussionInstrument[] = Object.keys(
  PERCUSSION_HOLDS,
).filter((id): id is PercussionInstrument => Object.hasOwn(PERCUSSION_HOLDS, id));

/**
 * Tells if an instrument is a percussion instrument.
 *
 * @param instrument The instrument.
 * @returns True for a key of `PERCUSSION_HOLDS`.
 */
export function isPercussion(instrument: string): instrument is PercussionInstrument {
  return Object.hasOwn(PERCUSSION_HOLDS, instrument);
}

/** The strikes of the players of one species on one percussion instrument over the demos. */
interface StrikeReach {
  /** The demos with a player of the species on the instrument. */
  readonly demos: readonly string[];
  /** The number of strikes of both hands. */
  readonly strikes: number;
  /** The number of strikes within `TARGET_REACH`. */
  readonly within: number;
  /** The largest distance of a piece from its strike point, in meters, or 0 with no strike. */
  readonly worst: number;
}

/**
 * Measures each strike of each player of a species on a percussion instrument in the demos: the
 * distance of the piece of the hand from the strike point at the note start, in a play that
 * started at the count-in.
 *
 * @param species The species.
 * @param instrument The percussion instrument.
 * @param demos The demos. A demo whose score has no seat of a section with the instrument builds
 *   no scene, so that a run of the timpani takes about 6 s in place of 11 s.
 * @returns The strikes over the demos.
 */
export function strikeReach(
  species: SpeciesId,
  instrument: PercussionInstrument,
  demos: readonly DemoFile[],
): StrikeReach {
  const found: string[] = [];
  let strikes = 0;
  let within = 0;
  let worst = 0;
  const sections = new Set(
    Object.entries(SECTION_INSTRUMENTS).flatMap(([section, instruments]) =>
      instruments.some((id) => id === instrument) ? [section] : [],
    ),
  );
  for (const demo of demos) {
    if (!scoreOf(demo.bytes).seats.some((seat) => sections.has(seat.section))) {
      continue;
    }
    const scene = sceneOf(demo.bytes);
    const countIn = countInAt(scene.plan.beats, 0).lengthSec;
    for (const [index, place] of scene.layout.players.entries()) {
      const plan = scene.plan.players[index];
      const { cast } = place;
      if (cast.species !== species || cast.instrument !== instrument) {
        continue;
      }
      if (plan?.note.family !== 'percussion') {
        continue;
      }
      found.push(demo.id);
      const model = scene.models.get(cast.species, cast.instrument, cast.kettles, cast.support);
      const buffer = createScenePose(scene.plan);
      const audible = allAudible(scene.score);
      for (const side of ['L', 'R'] as const) {
        const track = side === 'L' ? plan.note.left : plan.note.right;
        const bone = side === 'L' ? 'malletL' : 'malletR';
        const piece = model.instrument.targets.find(
          (t) => (t.kind === 'mallet-head' || t.kind === 'plate') && t.bone === bone,
        );
        if (!track || !piece) {
          continue;
        }
        for (const [i, start] of track.starts.entries()) {
          const song = start + plan.timeOffset;
          const frame = poseAt(scene.plan, song, 10 + song + countIn, PLAYING, audible, buffer);
          const pose = frame.players[index];
          if (!pose) {
            continue;
          }
          const point = new Vector3(
            track.points[3 * i] ?? 0,
            track.points[3 * i + 1] ?? 0,
            track.points[3 * i + 2] ?? 0,
          );
          const at = posedPiecePoint(poseSkeleton(model, pose), { bone, at: piece.from });
          const error = new Vector3(...at).distanceTo(point);
          strikes += 1;
          within += error <= TARGET_REACH ? 1 : 0;
          worst = Math.max(worst, error);
        }
      }
    }
  }
  return { demos: found, strikes, within, worst };
}

/**
 * Writes the reach of the strikes in a short form, for a cell of a table.
 *
 * @param reach The strikes.
 * @returns The text, such as `strikes 98.2% within 5 mm, worst 7.1 mm`, or `no strike` with none.
 */
export function strikeCell(reach: StrikeReach): string {
  if (reach.strikes === 0) {
    return 'no strike';
  }
  const share = ((100 * reach.within) / reach.strikes).toFixed(1);
  return `strikes ${share}% within ${TARGET_REACH * 1000} mm, worst ${(reach.worst * 1000).toFixed(1)} mm`;
}

/**
 * Writes the reach of the strikes of a species on a percussion instrument, as
 * `pnpm hold-reach --instrument` prints it.
 *
 * @param species The species.
 * @param instrument The percussion instrument.
 * @param reach The strikes.
 * @returns The lines.
 */
export function strikeReachLines(
  species: SpeciesId,
  instrument: PercussionInstrument,
  reach: StrikeReach,
): string[] {
  if (reach.demos.length === 0) {
    return [`No demo has a ${species} on the ${instrument}, so the tool measures no strike.`];
  }
  return [
    `${species} on the ${instrument} in ${reach.demos.join(', ')}: ${reach.strikes} strikes, ${strikeCell(reach)}.`,
  ];
}

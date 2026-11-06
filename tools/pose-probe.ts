import { Vector3 } from 'three';

import { SHEET_MOMENTS, sheetPose } from '../src/gallery/sheet-poses.ts';
import { VIEW_SHEETS, isSheetId } from '../src/gallery/sheets.ts';
import type { SheetId } from '../src/gallery/sheets.ts';
import { buildPlayer } from '../src/models/player.ts';
import type { PlayerModel } from '../src/models/player.ts';
import { boneIndex } from '../src/models/rig.ts';
import type { BoneName } from '../src/models/rig.ts';
import { poseSkeleton, posedPiecePoint, posedPoint } from '../src/pose/test-kinematics.ts';
import type { PosedSkeleton } from '../src/pose/test-kinematics.ts';
import type { AnimalPose } from '../src/pose/types.ts';
import { setHolds } from './hold-sets.ts';

/** A place from a shoulder joint, in head heights `H`: out to the side, up, and forward. */
type ArmPlace = readonly [out: number, up: number, forward: number];

/** The posed joints of one arm, from its shoulder joint. */
interface ArmProbe {
  /** The elbow: the `forearm` bone. */
  readonly elbow: ArmPlace;
  /** The wrist: the `hand` bone. */
  readonly wrist: ArmPlace;
  /** The middle of the palm. */
  readonly palm: ArmPlace;
}

/**
 * Gives the posed elbow, wrist, and palm of each arm from its shoulder joint, in head heights.
 *
 * @param model The player model.
 * @param pose The pose.
 * @returns The joints of the left and the right arm.
 */
export function armProbes(model: PlayerModel, pose: AnimalPose): Record<'L' | 'R', ArmProbe> {
  const posed = poseSkeleton(model, pose);
  const h = model.body.headHeight;
  const arm = (side: 'L' | 'R'): ArmProbe => {
    const shoulder = boneAt(posed, `upperArm${side}`);
    const outward = side === 'R' ? 1 : -1;
    const place = (point: Vector3): ArmPlace => {
      const d = point.sub(shoulder).divideScalar(h);
      return [outward * d.x, d.y, -d.z];
    };
    const palm = side === 'R' ? model.body.palmR : model.body.palmL;
    return {
      elbow: place(boneAt(posed, `forearm${side}`)),
      wrist: place(boneAt(posed, `hand${side}`)),
      palm: place(new Vector3(...posedPoint(posed, `hand${side}`, palm))),
    };
  };
  return { L: arm('L'), R: arm('R') };
}

/**
 * Gives the posed place of the bind position of a bone.
 *
 * @param posed The posed skeleton.
 * @param bone The bone.
 * @returns The place, in the axes of the model.
 */
function boneAt(posed: PosedSkeleton, bone: BoneName): Vector3 {
  const bind = posed.model.skeleton.positions[boneIndex(bone)] ?? [0, 0, 0];
  return new Vector3(...posedPoint(posed, bone, bind));
}

/**
 * Writes a place with two digits.
 *
 * @param place The place.
 * @returns The text, such as `(0.84 0.63 1.16)`.
 */
function placeText(place: ArmPlace): string {
  return `(${place.map((v) => v.toFixed(2)).join(' ')})`;
}

function main(): void {
  const args = process.argv.slice(2);
  const name = args.shift();
  if (!isSheetId(name)) {
    console.error(
      `Usage: pnpm pose-probe <${Object.keys(VIEW_SHEETS).join(' | ')}> [--time <s>]... [--set <path>=<value>[;<path>=<value>]...]...`,
    );
    process.exit(1);
  }
  const times: number[] = [];
  const variants = [''];
  for (let i = 0; i < args.length; i += 2) {
    const value = args[i + 1] ?? '';
    if (args[i] === '--time') {
      times.push(Number(value));
    } else if (args[i] === '--set') {
      setHolds(value).undo();
      variants.push(value);
    } else {
      throw new Error(`The option "${args[i]}" is not known.`);
    }
  }
  for (const variant of variants) {
    const { undo, text } = setHolds(variant);
    if (variants.length > 1) {
      console.log(`${text || 'base'}:`);
    }
    try {
      probeSheet(name, times);
    } finally {
      undo();
    }
  }
}

/**
 * Prints the arms of the sheet pose of a model sheet at some times.
 *
 * @param name The sheet.
 * @param times The song times, or none for the time of the sheet.
 */
function probeSheet(name: SheetId, times: readonly number[]): void {
  const sheet = VIEW_SHEETS[name];

  const model = buildPlayer(sheet.species, sheet.instrument);
  const moment = SHEET_MOMENTS[sheet.instrument];
  for (const time of times.length > 0 ? times : [moment.time]) {
    const pose = sheetPose(model, sheet, { ...moment, time });
    const arms = armProbes(model, pose);
    const lines = (['R', 'L'] as const).map(
      (side) =>
        `${side} elbow ${placeText(arms[side].elbow)} wrist ${placeText(arms[side].wrist)} palm ${placeText(arms[side].palm)}`,
    );
    const tip = model.instrument.targets.find((target) => target.kind === 'tip');
    if (tip) {
      const posed = poseSkeleton(model, pose);
      const from = new Vector3(...posedPoint(posed, 'handR', model.body.palmR));
      const to = new Vector3(...posedPiecePoint(posed, { bone: tip.bone, at: tip.from }));
      const d = to.sub(from).normalize();
      lines.push(
        `tip direction (out up forward) (${[d.x, d.y, -d.z].map((v) => v.toFixed(2)).join(' ')})`,
      );
    }
    console.log(`time ${time} s, in H from each shoulder joint (out up forward):`);
    for (const line of lines) {
      console.log(`  ${line}`);
    }
  }
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * The warning of the probe tools about a bowed player whose bow arm reaches no part of the bow
 * hair, or only a short part (`bowRangeOf()` of `src/pose/bowed-rig.ts`, design 5.3). Such a
 * player shows nearly no bow stroke. `pnpm pose-depth`, `pnpm hold-fit`, `pnpm hold-scan`, and
 * `pnpm pair-scan` print it.
 */
import type { BowedRig } from '../src/pose/bowed-rig.ts';
import type { TestScene } from '../src/pose/test-scene.ts';
import type { RoleSweep } from '../src/pose/test-sweep.ts';

/**
 * The shortest reached part of the bow hair that shows a clear stroke, in meters. A whole bow of
 * a long note takes 0.8 of the reached part (`BOW_MOTION.length`), so a shorter part moves the
 * bow paw less than 8 cm.
 */
const SHORT_BOW = 0.1;

/** The values of a rig that the warning reads. */
type BowReach = Pick<BowedRig, 'bowRange' | 'bowReached' | 'hairLength'>;

/**
 * Gives the mark of the reached part of the bow hair of a rig.
 *
 * @param rig The rig.
 * @returns `no reach` when the bow arm reaches no place of the hair, `short` for a part below
 *   {@link SHORT_BOW}, else `null`.
 */
export function bowMark(rig: BowReach): 'no reach' | 'short' | null {
  if (!rig.bowReached) {
    return 'no reach';
  }
  return rig.bowRange[1] - rig.bowRange[0] < SHORT_BOW ? 'short' : null;
}

/**
 * Writes the warning of a rig with a mark ({@link bowMark}).
 *
 * @param rig The rig.
 * @param name The name of the player.
 * @returns The warning, or `null` for a rig with no mark.
 */
export function bowWarning(rig: BowReach, name: string): string | null {
  const mark = bowMark(rig);
  if (mark === null) {
    return null;
  }
  const [low, high] = rig.bowRange;
  const part = `${low.toFixed(3)} m to ${high.toFixed(3)} m of a hair of ${rig.hairLength.toFixed(3)} m`;
  return mark === 'no reach'
    ? `WARNING: the bow arm of the ${name} reaches no place of the bow hair on all strings. The bow range is the fallback of bowRangeOf(), ${part}, and the player shows no bow stroke.`
    : `WARNING: the bow arm of the ${name} reaches only ${(high - low).toFixed(3)} m of the bow hair (${part}, less than ${SHORT_BOW} m), and the player shows nearly no bow stroke.`;
}

/**
 * Gives the warnings of the bowed players of a role in a scene, one for each different rig.
 *
 * @param scene The scene.
 * @param role The role.
 * @returns The warnings: none for a role with no bowed player and for rigs with no mark.
 */
export function bowWarnings(scene: TestScene, role: RoleSweep): string[] {
  const seen = new Set<BowedRig>();
  const lines: string[] = [];
  for (const player of role.players(scene)) {
    const index = /^\S+ (\d+)(?: \(|$)/.exec(player.name)?.[1];
    const note = index === undefined ? undefined : scene.plan.players[Number(index)]?.note;
    if (note?.family !== 'bowed' || seen.has(note.rig)) {
      continue;
    }
    seen.add(note.rig);
    const line = bowWarning(note.rig, role.role);
    if (line) {
      lines.push(line);
    }
  }
  return lines;
}

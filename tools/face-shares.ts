/**
 * Gives the share of the samples in which each named face of a body skin folds, for `--watch`
 * of `pnpm rig-mesh --check` and `--faces-of` of `pnpm hold-fit`. The face indices are those of
 * `pnpm fold-probe --faces`.
 */
import type { SampleSet } from './fold-probe.ts';

/** The share of the samples of each set in which one face folds. */
export interface FaceShare {
  /** The index of the triangle in the packed mesh, as `pnpm fold-probe` counts the faces. */
  readonly face: number;
  /**
   * The share of the samples of each set in which the face folds, from 0 to 1, or `null` for a set
   * with no sample.
   */
  readonly shares: Readonly<Record<SampleSet, number | null>>;
}

/**
 * Gives the share of the samples of each set in which each named face folds. A face that folds in
 * no sample has the share 0.
 *
 * @param samples The number of samples of each set.
 * @param folds Gives the number of samples of each set in which a face folds, or `undefined` for
 *   a face that folds in no sample.
 * @param faces The indices of the faces.
 * @returns The shares of each face, in the order of the faces.
 */
export function faceShares(
  samples: Readonly<Record<SampleSet, number>>,
  folds: (face: number) => Readonly<Record<SampleSet, number>> | undefined,
  faces: readonly number[],
): FaceShare[] {
  return faces.map((face) => {
    const own = folds(face);
    const share = (set: SampleSet): number | null =>
      samples[set] > 0 ? (own?.[set] ?? 0) / samples[set] : null;
    return { face, shares: { rest: share('rest'), play: share('play'), lift: share('lift') } };
  });
}

/**
 * Writes a share of samples as a percent.
 *
 * @param share The share, from 0 to 1, or `null` for a set with no sample.
 * @returns The text, such as `93.2%`, or `-` with no sample.
 */
export function foldShareText(share: number | null): string {
  return share === null ? '-' : `${(100 * share).toFixed(1)}%`;
}

/**
 * Reads a list of face indices of the command line, such as `617,618`.
 *
 * @param value The text of the option.
 * @param option The name of the option, for the message, such as `--watch`.
 * @returns The indices, in their order.
 * @throws Error if an item is not a whole number of 0 or more.
 */
export function faceList(value: string, option: string): number[] {
  return value.split(',').map((text) => {
    const face = Number(text);
    if (text.trim() === '' || !Number.isInteger(face) || face < 0) {
      throw new Error(
        `The option ${option} takes the indices of faces, such as 617,618, and not "${value}".`,
      );
    }
    return face;
  });
}

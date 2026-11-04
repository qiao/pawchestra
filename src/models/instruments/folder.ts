import { MathUtils, Quaternion, Vector3 } from 'three';
import { INSTRUMENT_COLORS, SCENE_COLORS } from '../colors.ts';
import { transform } from '../mesh.ts';
import { toQuat, toVec3 } from '../tuples.ts';
import type { Vec3 } from '../tuples.ts';
import { box } from '../primitives.ts';
import { PieceBuilder, hold, pieceSize } from './piece.ts';
import type { InstrumentModel } from './types.ts';

/**
 * The sizes and the place of the choir folder (design 4.6). In the folder axes, the spine runs
 * along y through the origin, and the two covers open to the singer at +z. The tools change the
 * place in memory with `--set folder.<key>=<value>` (`tools/hold-sets.ts`).
 */
export const CHOIR_FOLDER = {
  /**
   * The width of one cover, in meters. The grips lie at the outer edges, so a narrow folder puts
   * the upper flippers of the penguin into the sides of the body. With 0.22 m and the elbows
   * (1.2, -1, 0.1), the round rebuilt flippers go 2.7 cm into the chest, and 1.5 cm with 0.26 m.
   */
  width: 0.26,
  /** The height of one cover, in meters. */
  height: 0.27,
  /** The angle between each cover and the plane x-y. The open folder is a flat V. */
  open: 15 * MathUtils.DEG2RAD,
  /**
   * The distance of the middle of the spine below the head center, in head heights H. The flippers
   * of the penguin mesh reach the grips in front of the round belly only this high: the middle
   * shows 0.37 of the body height below the crown, above the 0.51 to 0.56 of the penguins of
   * `orchestra-latest.png` and `orchestra-side.png`.
   */
  drop: 1.25,
  /**
   * The distance of the middle of the spine in front of the head center, in head heights H, so
   * that the folder keeps off the belly and the throat.
   */
  forward: 1.1,
  /** The angle by which the folder leans back, so that the pages face the eyes. */
  tilt: 35 * MathUtils.DEG2RAD,
};

/**
 * Builds the choir folder (design 4.6). The singer holds it open in both hands in front of the
 * chest. The pages have the color of the sheet music on the stands.
 *
 * @returns The model.
 */
export function buildChoirFolder(): InstrumentModel {
  const f = CHOIR_FOLDER;
  const piece = new PieceBuilder();
  const outer: Vec3[] = [];
  for (const side of [-1, 1]) {
    // Each cover turns around the spine, so that its outer edge comes to the singer.
    const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -side * f.open);
    const rotation = toQuat(turn);
    const middle = new Vector3((side * f.width) / 2, 0, 0).applyQuaternion(turn);
    piece.add(
      box(f.width, f.height, 0.006),
      INSTRUMENT_COLORS.folder,
      transform(toVec3(middle), rotation),
    );
    const page = new Vector3((side * (f.width - 0.02)) / 2, 0, 0.005).applyQuaternion(turn);
    piece.add(
      box(f.width - 0.03, f.height - 0.03, 0.004),
      SCENE_COLORS.sheet,
      transform(toVec3(page), rotation),
    );
    outer.push(
      toVec3(new Vector3(side * (f.width - 0.03), -f.height / 4, -0.02).applyQuaternion(turn)),
    );
  }
  const instrument = piece.build(
    'instrument',
    hold(
      'head',
      [0, -f.drop, -f.forward],
      toQuat(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -f.tilt)),
    ),
  );
  const [left = [0, 0, 0], right = [0, 0, 0]] = outer;
  return {
    id: 'choir-folder',
    parent: 'chest',
    pieces: [instrument],
    grips: {
      palmL: { bone: 'instrument', at: left },
      palmR: { bone: 'instrument', at: right },
      mouth: null,
      chin: null,
    },
    targets: [],
    size: pieceSize(instrument),
  };
}

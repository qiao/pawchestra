/**
 * Measures the sight line of each player to the conductor, and the view of the audience on each
 * player, over each demo (design 4.5, seat geometry). The probe builds the score, the layout, the
 * pose plan, and the shot plan as the app does, with no render. About 20 s for all demos.
 *
 * - Conductor: a segment goes from the eyes of each player (the middle of its eye bones, in the
 *   bind pose) to points on the head, the right paw with the baton, and the left paw of the
 *   posed conductor, at {@link CONDUCTOR_TIMES} shares of the song. The probe gives the share of
 *   the points of each part that the triangles of another item hide: a body, an instrument, a
 *   piano case, a harp, or a music stand. A music stand counts only for the head.
 * - Audience: a segment goes from the camera of the default view and of each Cinematic wide shot
 *   to points on the head of each player. The probe gives the share of the points that hide.
 *
 * The count of blocked players is a report. A round has no goal count (design 4.5, sight lines).
 *
 * Usage: pnpm sight-lines [--demo <id>]... [--json <file>] [--all]
 *
 * With no `--all`, the tool prints only the blocked players ({@link isBlocked}) and the players
 * that the audience does not see ({@link isHidden}). To probe a commit, run the tool in
 * the folder of `tools/base-tree.sh <ref>`.
 */
import { writeFile } from 'node:fs/promises';

import type { Bounds } from '../src/models/bounds.ts';
import { CONDUCTOR } from '../src/models/cast.ts';
import { boundsAround, cornerBounds } from '../src/models/footprint.ts';
import { layoutScene } from '../src/models/layout-scene.ts';
import type { MeshData } from '../src/models/mesh.ts';
import type { SceneLayout } from '../src/models/layout.ts';
import { ModelCache } from '../src/models/model-cache.ts';
import type { PlayerModel } from '../src/models/player.ts';
import { buildMusicStand } from '../src/models/props.ts';
import { boneIndex } from '../src/models/rig.ts';
import type { BoneName } from '../src/models/rig.ts';
import { eyesOf, pointOnStage, rayHitsBox, rayHitsTriangle } from '../src/models/sight.ts';
import type { Vec3 } from '../src/models/tuples.ts';
import { preparePoses } from '../src/pose/plan.ts';
import { createScenePose, poseAt } from '../src/pose/pose-at.ts';
import { poseSkeleton } from '../src/pose/test-kinematics.ts';
import { PLAYING, allAudible } from '../src/pose/test-scene.ts';
import { posedCorner } from '../src/pose/test-skin.ts';
import type { Score } from '../src/score/types.ts';
import { cameraAt, createCameraPose } from '../src/shots/camera-at.ts';
import { SHOT_SEED, prepareShots } from '../src/shots/prepare.ts';
import { CINEMA_ASPECT, defaultView } from '../src/shots/view.ts';
import { demoLayout } from './demo-layout.ts';
import { patchedDemos } from './patch-demos.ts';

/** The shares of the song at which the probe poses the conductor. */
const CONDUCTOR_TIMES = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7];

/** The number of target points on each part of the conductor and on each head. */
const TARGET_POINTS = 40;

/** The canvas of the default view, in CSS pixels, as `close-views play`. */
const VIEW_SIZE = [1600, 1000] as const;

/** The shares from which a player counts as blocked (design 4.5, seat geometry). */
const BLOCKED = { head: 0.1, baton: 0.25, audience: 0.25 } as const;

/** The bones of the head of an animal. */
const HEAD_BONES: readonly BoneName[] = ['head', 'jaw', 'eyeL', 'eyeR', 'earL', 'earR'];

/** The bones of the right paw of the conductor, which holds the baton. */
const BATON_BONES: readonly BoneName[] = ['handR', 'fingersR', 'baton'];

/** The bones of the left paw of the conductor. */
const CUE_BONES: readonly BoneName[] = ['handL', 'fingersL'];

/** The first bone of an instrument in `BONE_NAMES`. */
const FIRST_INSTRUMENT_BONE = boneIndex('instrument');

/** The kind of a blocker. */
type BlockerKind = 'body' | 'instrument' | 'piano' | 'harp' | 'stand' | 'conductor';

/** A group of triangles with its box, for the ray test. */
interface TriangleGroup extends Bounds {
  /** 9 numbers for each triangle, in the stage axes. */
  readonly corners: Float64Array;
}

/** One item that can hide a target, with the box of all its groups. */
interface Blocker extends Bounds {
  readonly label: string;
  readonly kind: BlockerKind;
  /** The index of the player of the item, or -1. */
  readonly player: number;
  readonly groups: readonly TriangleGroup[];
}

/** The size of a group of triangles. */
const GROUP_SIZE = 64;

/**
 * Makes a blocker from the triangles of an item in the stage axes.
 *
 * @param label The name of the item.
 * @param kind The kind of the item.
 * @param player The index of the player, or -1.
 * @param corners 9 numbers for each triangle.
 * @returns The blocker, or `null` with no triangles.
 */
function blockerOf(
  label: string,
  kind: BlockerKind,
  player: number,
  corners: readonly number[],
): Blocker | null {
  const count = corners.length / 9;
  if (count === 0) {
    return null;
  }
  // Sort the triangles by x, then group them, so that each group is small in space.
  const order = Array.from({ length: count }, (_, t) => t).toSorted(
    (a, b) =>
      (corners[a * 9] ?? 0) +
      (corners[a * 9 + 2] ?? 0) * 0.37 -
      (corners[b * 9] ?? 0) -
      (corners[b * 9 + 2] ?? 0) * 0.37,
  );
  const groups: TriangleGroup[] = [];
  for (let g = 0; g < count; g += GROUP_SIZE) {
    const ids = order.slice(g, g + GROUP_SIZE);
    const out = new Float64Array(ids.length * 9);
    ids.forEach((t, k) => {
      for (let i = 0; i < 9; i++) {
        out[k * 9 + i] = corners[t * 9 + i] ?? 0;
      }
    });
    groups.push({ ...cornerBounds(out), corners: out });
  }
  return { label, kind, player, ...boundsAround(groups), groups };
}

/**
 * Gives the triangles of a mesh in the stage axes, split by a test of the bone of each triangle.
 *
 * @param mesh The mesh.
 * @param position The place.
 * @param facing The turn.
 * @param keep Tells if a triangle with this bone goes into the list. By default, each triangle
 *   goes into it.
 * @returns 9 numbers for each triangle.
 */
function meshCorners(
  mesh: MeshData,
  position: Vec3,
  facing: number,
  keep: (bone: number) => boolean = () => true,
): number[] {
  const p = mesh.positions;
  const out: number[] = [];
  for (let t = 0; t < p.length / 9; t++) {
    if (!keep(mesh.bones[t * 3] ?? 0)) {
      continue;
    }
    for (let k = 0; k < 3; k++) {
      const i = t * 9 + k * 3;
      out.push(...pointOnStage([p[i] ?? 0, p[i + 1] ?? 0, p[i + 2] ?? 0], position, facing));
    }
  }
  return out;
}

/** The label of a player of a layout. */
function playerLabel(layout: SceneLayout, i: number): string {
  const c = layout.players[i]?.cast;
  return c ? `${c.species} ${c.instrument} s${c.seatIndex}p${c.player}` : `player ${i}`;
}

/**
 * Lists the blockers of a layout: each player (its body and its instrument), each music stand,
 * and the conductor in the bind pose when `withConductor` is true.
 *
 * @param layout The layout.
 * @param models The models of the score.
 * @param withConductor True to add the conductor.
 * @returns The blockers.
 */
function blockersOf(layout: SceneLayout, models: ModelCache, withConductor: boolean): Blocker[] {
  const out: Blocker[] = [];
  const add = (b: Blocker | null): void => {
    if (b) {
      out.push(b);
    }
  };
  layout.players.forEach((p, i) => {
    const { species, instrument, kettles, support } = p.cast;
    const model = models.get(species, instrument, kettles, support);
    const label = playerLabel(layout, i);
    add(
      blockerOf(
        label,
        'body',
        i,
        meshCorners(model.mesh, p.position, p.facing, (b) => b < FIRST_INSTRUMENT_BONE),
      ),
    );
    let kind: BlockerKind = 'instrument';
    if (instrument === 'piano') {
      kind = 'piano';
    } else if (instrument === 'harp') {
      kind = 'harp';
    }
    add(
      blockerOf(
        `${label} (${instrument})`,
        kind,
        i,
        meshCorners(model.mesh, p.position, p.facing, (b) => b >= FIRST_INSTRUMENT_BONE),
      ),
    );
  });
  const stands = new Map<number, MeshData>();
  layout.stands.forEach((stand, i) => {
    const mesh = stands.get(stand.deskHeight) ?? buildMusicStand(stand.deskHeight);
    stands.set(stand.deskHeight, mesh);
    add(blockerOf(`stand ${i}`, 'stand', -1, meshCorners(mesh, stand.position, stand.facing)));
  });
  if (withConductor && layout.conductor) {
    const { mesh } = models.get(CONDUCTOR.species, CONDUCTOR.instrument);
    const { position, facing } = layout.conductor;
    add(blockerOf('conductor', 'conductor', -1, meshCorners(mesh, position, facing)));
  }
  return out;
}

/**
 * Finds the first blocker of a segment.
 *
 * @param from The start.
 * @param to The end.
 * @param blockers The blockers.
 * @param skip Tells if a blocker does not count.
 * @returns The blocker, or `null` for a clear line.
 */
function blockerOn(
  from: Vec3,
  to: Vec3,
  blockers: readonly Blocker[],
  skip: (b: Blocker) => boolean,
): Blocker | null {
  const d: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  for (const b of blockers) {
    if (skip(b) || !rayHitsBox(from, d, b.min, b.max)) {
      continue;
    }
    for (const g of b.groups) {
      if (!rayHitsBox(from, d, g.min, g.max)) {
        continue;
      }
      for (let i = 0; i < g.corners.length; i += 9) {
        if (rayHitsTriangle(from, d, g.corners, i)) {
          return b;
        }
      }
    }
  }
  return null;
}

/**
 * Picks about {@link TARGET_POINTS} corners of a model whose bones are in a list.
 *
 * @param model The model.
 * @param bones The bones.
 * @returns The corner indices.
 */
function pickCorners(model: PlayerModel, bones: readonly BoneName[]): number[] {
  const ids = new Set(bones.map(boneIndex));
  const all: number[] = [];
  for (let c = 0; c < model.mesh.bones.length; c++) {
    if (ids.has(model.mesh.bones[c] ?? -1)) {
      all.push(c);
    }
  }
  const step = Math.max(1, Math.floor(all.length / TARGET_POINTS));
  return all.filter((_, k) => k % step === 0);
}

/** The head points of a player in the stage axes, in the bind pose. */
function headPoints(model: PlayerModel, position: Vec3, facing: number): Vec3[] {
  const p = model.mesh.positions;
  return pickCorners(model, HEAD_BONES).map((c) =>
    pointOnStage([p[c * 3] ?? 0, p[c * 3 + 1] ?? 0, p[c * 3 + 2] ?? 0], position, facing),
  );
}

/** The sight of one player to the conductor. */
export interface PlayerSight {
  readonly player: string;
  /** The share of the head points that hide, over the times. */
  readonly head: number;
  /** The share of the points of the right paw and the baton that hide, over the times. */
  readonly baton: number;
  /** The share of the points of the left paw that hide, over the times. */
  readonly cue: number;
  /** The blockers, with the share of all rays that each one hides. */
  readonly blockers: Readonly<Record<string, number>>;
}

/** The view of the audience on one player. */
export interface PlayerView {
  readonly player: string;
  /** The share of the head that hides in the default view. */
  readonly view: number;
  /** The mean share of the head that hides in the Cinematic wide shots. */
  readonly wide: number;
  /** The main blocker in the default view. */
  readonly by: string;
}

/** The probe of one demo. */
export interface DemoSight {
  readonly demo: string;
  readonly players: number;
  readonly conductor: boolean;
  readonly sights: readonly PlayerSight[];
  readonly views: readonly PlayerView[];
}

/**
 * Probes the sight lines of one score.
 *
 * @param demo The name of the demo.
 * @param score The score.
 * @param models The models of the score.
 * @param layout The layout of the score.
 * @returns The probe.
 */
export function probeSight(
  demo: string,
  score: Score,
  models = new ModelCache(),
  layout: SceneLayout = layoutScene(score, models),
): DemoSight {
  const blockers = blockersOf(layout, models, false);
  const sights: PlayerSight[] = [];
  if (layout.conductor) {
    const plan = preparePoses(score, layout, 1, models);
    const model = models.get(CONDUCTOR.species, CONDUCTOR.instrument);
    const parts = {
      head: pickCorners(model, HEAD_BONES),
      baton: pickCorners(model, BATON_BONES),
      cue: pickCorners(model, CUE_BONES),
    };
    const buffer = createScenePose(plan);
    const audible = allAudible(score);
    const conductor = layout.conductor;
    const targets = CONDUCTOR_TIMES.map((share) => {
      const pose = poseAt(plan, share * score.durationSec, 10, PLAYING, audible, buffer).conductor;
      if (!pose) {
        throw new Error('The conductor has no pose.');
      }
      const posed = poseSkeleton(model, pose);
      const at = (c: number): Vec3 =>
        pointOnStage(posedCorner(posed, c), conductor.position, conductor.facing);
      return { head: parts.head.map(at), baton: parts.baton.map(at), cue: parts.cue.map(at) };
    });
    layout.players.forEach((p, i) => {
      const { species, instrument, kettles, support } = p.cast;
      const player = models.get(species, instrument, kettles, support);
      const eye = pointOnStage(eyesOf(player), p.position, p.facing);
      const by: Record<string, number> = {};
      const hidden = { head: 0, baton: 0, cue: 0 };
      const counts = { head: 0, baton: 0, cue: 0 };
      let total = 0;
      for (const t of targets) {
        for (const part of ['head', 'baton', 'cue'] as const) {
          for (const point of t[part]) {
            total++;
            counts[part]++;
            const b = blockerOn(
              eye,
              point,
              blockers,
              (x) => x.player === i || (x.kind === 'stand' && part !== 'head'),
            );
            if (b) {
              const key = `${b.label} [${b.kind}]`;
              by[key] = (by[key] ?? 0) + 1;
              hidden[part]++;
            }
          }
        }
      }
      sights.push({
        player: playerLabel(layout, i),
        head: hidden.head / counts.head,
        baton: hidden.baton / counts.baton,
        cue: hidden.cue / counts.cue,
        blockers: Object.fromEntries(
          Object.entries(by)
            .toSorted((a, b) => b[1] - a[1])
            .map(([k, v]) => [k, v / total]),
        ),
      });
    });
  }

  const all = blockersOf(layout, models, true);
  const cameras: Vec3[] = [];
  const shots = prepareShots(score, layout, SHOT_SEED, models);
  const buffer = createCameraPose();
  for (const shot of shots.shots) {
    if (shot.kind !== 'wide') {
      continue;
    }
    const from = Math.max(0, shot.startSec);
    const to = Math.min(score.durationSec, shot.endSec);
    const camera = cameraAt(
      shots,
      (from + to) / 2,
      PLAYING,
      { aspect: CINEMA_ASPECT, still: false },
      buffer,
    );
    cameras.push([...camera.position]);
  }
  const front = defaultView(layout.stageSide, VIEW_SIZE[0], VIEW_SIZE[1]).position;
  const views = layout.players.map((p, i): PlayerView => {
    const { species, instrument, kettles, support } = p.cast;
    const points = headPoints(
      models.get(species, instrument, kettles, support),
      p.position,
      p.facing,
    );
    const by: Record<string, number> = {};
    const share = (camera: Vec3, count: boolean): number => {
      let hidden = 0;
      for (const point of points) {
        const b = blockerOn(camera, point, all, (x) => x.player === i);
        if (b) {
          hidden++;
          if (count) {
            by[b.label] = (by[b.label] ?? 0) + 1;
          }
        }
      }
      return hidden / points.length;
    };
    const view = share(front, true);
    const wide =
      cameras.length > 0
        ? cameras.reduce((sum, c) => sum + share(c, false), 0) / cameras.length
        : 0;
    const top = Object.entries(by).toSorted((a, b) => b[1] - a[1])[0];
    return { player: playerLabel(layout, i), view, wide, by: top ? top[0] : '' };
  });
  return {
    demo,
    players: layout.players.length,
    conductor: layout.conductor !== null,
    sights,
    views,
  };
}

/**
 * Finds if a player counts as blocked from the conductor: an item hides at least
 * {@link BLOCKED}.head of the head or {@link BLOCKED}.baton of the baton paw.
 *
 * @param sight The sight of the player.
 * @returns True if the player is blocked.
 */
export function isBlocked(sight: PlayerSight): boolean {
  return sight.head >= BLOCKED.head || sight.baton >= BLOCKED.baton;
}

/**
 * Finds if the audience does not see a player: the items hide at least {@link BLOCKED}.audience
 * of its head in the default view or in the Cinematic wide shots.
 *
 * @param view The view of the audience on the player.
 * @returns True if the player is hidden.
 */
function isHidden(view: PlayerView): boolean {
  return view.view >= BLOCKED.audience || view.wide >= BLOCKED.audience;
}

/** Gives a share as a percent with no decimals. */
function percent(share: number): string {
  return `${(share * 100).toFixed(0)}%`;
}

/** Runs the probe from the command line. */
export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const demos = args.flatMap((a, i) => (args[i - 1] === '--demo' ? [a] : []));
  const jsonAt = args.indexOf('--json');
  const showAll = args.includes('--all');
  const results: DemoSight[] = [];
  for (const file of await patchedDemos()) {
    const id = file.id;
    if (demos.length > 0 && !demos.includes(id)) {
      continue;
    }
    const { score, layout, models } = demoLayout(file.bytes, `buildScore() refused ${id}`);
    const result = probeSight(id, score, models, layout);
    results.push(result);
    const blocked = result.sights
      .filter((s) => showAll || isBlocked(s))
      .toSorted((a, b) => b.head + b.baton - a.head - a.baton);
    const hidden = result.views
      .filter((v) => showAll || isHidden(v))
      .toSorted((a, b) => b.view + b.wide - a.view - a.wide);
    // With --all, the lists hold each player, but the counts hold only the faults.
    const blockedCount = result.sights.filter(isBlocked).length;
    const hiddenCount = result.views.filter(isHidden).length;
    console.log(
      `${id}: ${result.players} players, ${result.conductor ? `${blockedCount} blocked from the conductor` : 'no conductor'}, ${hiddenCount} hidden from the audience`,
    );
    for (const s of blocked) {
      const top = Object.entries(s.blockers)
        .slice(0, 2)
        .map(([k, v]) => `${k} ${percent(v)}`)
        .join(', ');
      console.log(
        `  sight  ${s.player.padEnd(30)} head ${percent(s.head).padStart(4)}  baton ${percent(s.baton).padStart(4)}  left paw ${percent(s.cue).padStart(4)}  ${top}`,
      );
    }
    for (const v of hidden) {
      console.log(
        `  view   ${v.player.padEnd(30)} default ${percent(v.view).padStart(4)}  wide ${percent(v.wide).padStart(4)}  ${v.by}`,
      );
    }
  }
  const players = results.reduce((n, r) => n + r.players, 0);
  const blocked = results.reduce((n, r) => n + r.sights.filter(isBlocked).length, 0);
  const hidden = results.reduce((n, r) => n + r.views.filter(isHidden).length, 0);
  console.log(
    `total: ${blocked} of ${players} players blocked from the conductor, ${hidden} hidden from the audience`,
  );
  const out = jsonAt >= 0 ? args[jsonAt + 1] : undefined;
  if (out) {
    await writeFile(out, `${JSON.stringify(results, null, 1)}\n`);
  }
}

if (import.meta.main) {
  await main();
}

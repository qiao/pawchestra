/**
 * Measures how deep each region of the body of a player goes into each closed part of its
 * instrument and into its seat, over the whole play and the other sample sets. `pnpm clip-probe`
 * tests only the paws in the instrument, and the sweep of a role (`pnpm pose-depth`) tests only
 * its own parts and obstacles. This tool tests the trunk, the head, the arms, and the legs too.
 *
 * - **Regions.** The upper arm (with the shoulder), the forearm, and the paw of each side, the
 *   chest, the belly, the neck, the head, the thigh, the shin, and the foot of each side, and the
 *   tail ({@link REGIONS}). A corner of the body belongs to the region of its main bone. The probe
 *   tests one corner for each distinct bind point.
 * - **Parts.** The closed shells of the instrument mesh, one part for each instrument bone, such as
 *   the `violin` and the `bow` ({@link INSTRUMENT_BONES}). The harp has named parts
 *   ({@link harpPart}). An open sheet, such as a string, is no part. The seat of the player, from
 *   `buildSupport()`, is one more part. Each part gets a fan cap on each open loop, and a corner is
 *   in a part when the winding number of the part around it is more than 0.5 (`closedDepth()`).
 *   The depth is the distance to the nearest triangle of the part.
 * - **Samples.** `play`: each song time from 0 to the song end at steps of `--step` seconds. A role
 *   adds the other sample sets of its sweep (`src/pose/test-sweep-roles.ts`), such as `lift`,
 *   `rest`, and `lower`. A `<species>:<instrument>` player and each player of a demo with no
 *   target add the general sets ({@link generalSets}).
 * - **Limit.** The limit is a share of the head height H of the species, so that it grows with the
 *   body. The default {@link DEFAULT_LIMIT} is 1.0 cm at the H 0.221 m of the old deer.
 *
 * Each row gives the deepest point of one region in one part in one sample set: the depth in cm
 * and in H, the share of the samples over the limit, and the song time and the wall time of the
 * deepest point. A row clips when its depth is over the limit. The rows go from the deepest. The
 * exit code is 1 when a row clips. One player over a song of about 5 minutes takes 15 to 50 s, so
 * the probe tests each distinct bind point, with no sampling of the corners.
 *
 * Usage: pnpm body-clip <role|species:instrument> [--demo <id>]... [--step <s>]
 *        [--limit <H share>] [--json <file>] [--set <changes>]..., or pnpm body-clip --demo
 *        <id>... for each player of each demo. A role is a role of `pnpm pose-depth`, also a
 *        recast role `<role>@<species>`. With no `--demo`, a target runs on the first demo that has
 *        it. `--set` changes the holds in memory before the run (`tools/hold-sets.ts`), as one
 *        variant, so that a hold change can be measured with no edit of a source file.
 */
import { writeFileSync } from 'node:fs';

import { Box3, Quaternion, Triangle, Vector3 } from 'three';

import { findRole, findSweep, roleScene } from './fold-probe.ts';
import { setHolds } from './hold-sets.ts';
import { probeDemos } from './probe-demos.ts';
import type { DemoFile } from './patch-demos.ts';
import { CONDUCTOR } from '../src/models/cast.ts';
import { INSTRUMENT_IDS } from '../src/models/instruments/catalog.ts';
import type { InstrumentId } from '../src/models/instruments/types.ts';
import type { PlayerModel } from '../src/models/player.ts';
import { buildSupport } from '../src/models/props.ts';
import { boneIndex } from '../src/models/rig.ts';
import type { BoneName } from '../src/models/rig.ts';
import { SPECIES, instrumentScale, isSpeciesId } from '../src/models/species.ts';
import type { SpeciesId } from '../src/models/species.ts';
import { countInAt } from '../src/pose/count-in.ts';
import { createScenePose, poseAt } from '../src/pose/pose-at.ts';
import { LOWER_MAX_SEC } from '../src/pose/rest.ts';
import { closeSurface, closedDepth, openLoops } from '../src/pose/test-clearance.ts';
import type { ClosedSurface } from '../src/pose/test-clearance.ts';
import { cornerShown, poseSkeleton } from '../src/pose/test-kinematics.ts';
import type { PosedSkeleton } from '../src/pose/test-kinematics.ts';
import { NOT_STARTED, PLAYING, allAudible, sceneOf } from '../src/pose/test-scene.ts';
import type { TestScene } from '../src/pose/test-scene.ts';
import { posedCorner } from '../src/pose/test-skin.ts';
import { playSample } from '../src/pose/test-sweep-roles.ts';
import type { SampleSet, SweepSample } from '../src/pose/test-sweep.ts';
import type { AnimalPose, Transport } from '../src/pose/types.ts';
import { scoreOf } from '../src/score/test-score.ts';

/** The usage text of `pnpm body-clip`. */
const USAGE = `Usage: pnpm body-clip <role|species:instrument> [--demo <id>]... [--step <s>] [--limit <H share>] [--json <file>] [--set <changes>]...
       pnpm body-clip --demo <id>... [--step <s>] [--limit <H share>] [--json <file>]

Measures how deep each body region of a player (the upper arms, forearms, and paws L and R, the
chest, belly, neck, head, thighs, shins, feet, and tail) goes into each closed part of its
instrument and into its seat, over the play, and the lift, the rest, and the lowering.

  <role>                A role of pnpm pose-depth, such as harpist, or <role>@<species>.
  <species>:<instrument> Each player of the species with the instrument, such as deer:harp.
  --demo <id>           A demo. With no target, each player of the demo. With a target and no
                        --demo, the first demo that has the target.
  --step <s>            The step of the song time of the play samples. Default 0.1 s.
  --limit <H share>     The clip limit, as a share of the head height H of the species. Default
                        0.045 H: 1.0 cm at the H 0.221 m of the old deer.
  --json <file>         Also writes the rows as JSON.
  --set <changes>       Changes the holds in memory, such as 'viola@cat.tiltL=45deg'. Several
                        --set options make one variant (tools/hold-sets.ts).

A row clips when its depth is over the limit. The exit code is 1 when a row clips.`;

/** The format version of the JSON of `--json`. */
const FORMAT = 1;

/** The step of the song time between two play samples with no `--step`, in seconds. */
const DEFAULT_STEP = 0.1;

/**
 * The clip limit with no `--limit`, as a share of the head height H: 1.0 cm at the H 0.221 m of
 * the deer before its growth to 1.3 times its size (1.0 / 22.1 = 0.045).
 */
const DEFAULT_LIMIT = 0.045;

/**
 * The regions of the body, by their bones. The chest has the spine and the chest bones. The belly
 * is the hips bone: the lower belly and the haunch.
 */
const REGIONS: readonly (readonly [string, readonly BoneName[]])[] = [
  ['upper arm L', ['shoulderL', 'upperArmL']],
  ['upper arm R', ['shoulderR', 'upperArmR']],
  ['forearm L', ['forearmL']],
  ['forearm R', ['forearmR']],
  ['paw L', ['handL', 'fingersL']],
  ['paw R', ['handR', 'fingersR']],
  ['chest', ['spine', 'chest']],
  ['belly', ['hips']],
  ['neck', ['neck']],
  ['head', ['head', 'jaw', 'eyeL', 'eyeR', 'earL', 'earR', 'trunk1', 'trunk2', 'trunk3']],
  ['thigh L', ['thighL']],
  ['thigh R', ['thighR']],
  ['shin L', ['shinL']],
  ['shin R', ['shinR']],
  ['foot L', ['footL']],
  ['foot R', ['footR']],
  ['tail', ['tail1', 'tail2']],
];

/** The bones of the instrument and of the held parts, with the name of each in the rows. */
const INSTRUMENT_BONES: ReadonlyMap<number, string> = new Map(
  (
    [
      ['instrument', ''],
      ['slide', 'slide'],
      ['bow', 'bow'],
      ['malletL', 'mallet L'],
      ['malletR', 'mallet R'],
      ['baton', 'baton'],
    ] as const satisfies readonly (readonly [BoneName, string])[]
  ).map(([bone, label]) => [boneIndex(bone), label]),
);

/** The smallest ratio of the area of a closed shell to the diagonal of its box, in meters. */
const SHEET_RATIO = 0.05;

/** The transport of a stop at the wall time 10 s, after a play. */
const STOPPED: Transport = { ...PLAYING, playing: false, changedAtWall: 10, before: PLAYING };

/** The steps of the wall time between two samples of a lowering, in seconds. */
const LOWER_STEP = { hold: 0.5, move: 0.1 } as const;

/** The options of a run. */
interface ClipOptions {
  /** The role or the `<species>:<instrument>` target, or `null` for each player of the demos. */
  readonly target: string | null;
  /** The demos of `--demo`, with no `.mid`. */
  readonly demos: readonly string[];
  /** The step of the play samples, in seconds. */
  readonly step: number;
  /** The clip limit, as a share of H. */
  readonly limit: number;
  /** The file of `--json`, or `null`. */
  readonly json: string | null;
  /** The hold changes of each `--set`, separated by `;`, or `null` for the holds of the source. */
  readonly holds: string | null;
}

/** A player to measure. */
interface ClipPlayer {
  /** The name in the report, such as `harpist 12`. */
  readonly name: string;
  /** The species of the body. */
  readonly species: SpeciesId;
  /** The instrument. */
  readonly instrument: InstrumentId;
  /** The model, with its mesh. */
  readonly model: PlayerModel;
  /** Gives the pose of the player at a sample. */
  readonly poseAt: (sample: SweepSample) => AnimalPose;
  /** The sample sets after the play: the lift, the rest, and the lowering. */
  readonly sets: readonly SampleSet[];
}

/** The scene of a demo and the players of the target in it. */
interface DemoPlayers {
  /** The scene. */
  readonly scene: TestScene;
  /** The players. */
  readonly players: readonly ClipPlayer[];
}

/** One closed shell of the instrument mesh. */
interface Shell {
  /** The first corner of each triangle. */
  readonly firsts: readonly number[];
  /** The number of open loops of the shell in the bind pose. */
  readonly loops: number;
}

/** A part that the body must not enter: a group of closed shells of one bone, or the seat. */
interface ClipPart {
  /** The name in the rows, such as `violin` or `stool`. */
  readonly name: string;
  /** The number of triangles. */
  readonly triangles: number;
  /** Gives the surface of the part in a pose. */
  readonly surface: (posed: PosedSkeleton) => ClosedSurface | null;
}

/** The deepest point of one region in one part over one sample set. */
interface ClipRow {
  /** The sample set. */
  readonly set: string;
  /** The region of the body. */
  readonly region: string;
  /** The part. */
  readonly part: string;
  /** The largest depth, in meters. */
  depth: number;
  /** The song time of the deepest point, in seconds. */
  song: number;
  /** The wall time of the deepest point, in seconds. */
  wall: number;
  /** The number of samples over the limit. */
  over: number;
  /** The number of samples. */
  samples: number;
}

/** The result of one player. */
interface PlayerResult {
  /** The demo, with no `.mid`. */
  readonly demo: string;
  /** The name of the player. */
  readonly name: string;
  /** The species. */
  readonly species: SpeciesId;
  /** The head height H of the species, in meters. */
  readonly headHeight: number;
  /** The clip limit, in meters. */
  readonly limit: number;
  /** The number of body points that the probe tests in each region. */
  readonly points: Readonly<Record<string, number>>;
  /** The number of triangles of each part. */
  readonly parts: Readonly<Record<string, number>>;
  /** The number of samples of each set. */
  readonly samples: Readonly<Record<string, number>>;
  /** The rows with a depth, from the deepest. */
  readonly rows: readonly ClipRow[];
  /** The run time, in seconds. */
  readonly seconds: number;
}

/**
 * Reads the options of the command line.
 *
 * @param args The arguments.
 * @returns The options.
 * @throws Error if an option is unknown or has a wrong value, or if no target and no demo is given.
 */
function readOptions(args: readonly string[]): ClipOptions {
  let target: string | null = null;
  const demos: string[] = [];
  let step = DEFAULT_STEP;
  let limit = DEFAULT_LIMIT;
  let json: string | null = null;
  const sets: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    const value = (): string => {
      const next = args[++i];
      if (next === undefined) {
        throw new Error(`The option ${arg} needs a value.\n${USAGE}`);
      }
      return next;
    };
    if (arg === '--demo') {
      demos.push(value().replace(/\.mid$/, ''));
    } else if (arg === '--step') {
      step = Number(value());
    } else if (arg === '--limit') {
      limit = Number(value());
    } else if (arg === '--json') {
      json = value();
    } else if (arg === '--set') {
      sets.push(value());
    } else if (arg.startsWith('--') || target !== null) {
      throw new Error(`The argument ${arg} is unknown.\n${USAGE}`);
    } else {
      target = arg;
    }
  }
  if (!(step > 0) || !(limit > 0)) {
    throw new Error(`The step and the limit must be more than 0.\n${USAGE}`);
  }
  if (target === null && demos.length === 0) {
    throw new Error(`Give a role, a <species>:<instrument>, or a --demo.\n${USAGE}`);
  }
  return { target, demos, step, limit, json, holds: sets.length > 0 ? sets.join(';') : null };
}

/**
 * Gives the general sample sets after the play: the lift of 3 s at the play start, the rest
 * before the first play, and the lowering after a stop at the song end, as the sweep of the
 * violinist makes them.
 *
 * @param scene The scene.
 * @returns The sets.
 */
function generalSets(scene: TestScene): SampleSet[] {
  const start = -countInAt(scene.plan.beats, 0).lengthSec;
  const play: Transport = { ...PLAYING, changedAtWall: 10 };
  const lift: SweepSample[] = [];
  for (let wall = 10; wall < 13; wall += 0.1) {
    lift.push([Math.min(0, start + wall - 10), wall, play]);
  }
  const lower: SweepSample[] = [];
  const end = STOPPED.holdSec + LOWER_MAX_SEC;
  for (let t = 0; t < end; t += t < STOPPED.holdSec ? LOWER_STEP.hold : LOWER_STEP.move) {
    lower.push([scene.score.durationSec, 10 + t, STOPPED]);
  }
  return [
    { name: 'lift', samples: lift },
    { name: 'rest', samples: [[start, 10, NOT_STARTED]] },
    { name: 'lower', samples: lower },
  ];
}

/**
 * Gives the player of the scene at a layout index, or the conductor at the index -1, with the
 * general sample sets.
 *
 * @param scene The scene.
 * @param index The index of the player in the layout, or -1 for the conductor.
 * @returns The player.
 */
function scenePlayer(scene: TestScene, index: number): ClipPlayer {
  const buffer = createScenePose(scene.plan);
  const audible = allAudible(scene.score);
  const cast = index < 0 ? CONDUCTOR : scene.layout.players[index]?.cast;
  if (!cast) {
    throw new Error(`The scene has no player ${index}.`);
  }
  const model =
    'support' in cast
      ? scene.models.get(cast.species, cast.instrument, cast.kettles, cast.support)
      : scene.models.get(CONDUCTOR.species, CONDUCTOR.instrument, 4);
  return {
    name: index < 0 ? 'conductor' : `${cast.species} ${cast.instrument} ${index}`,
    species: cast.species,
    instrument: cast.instrument,
    model,
    poseAt: ([song, wall, transport]) => {
      const all = poseAt(scene.plan, song, wall, transport, audible, buffer);
      const pose = index < 0 ? all.conductor : all.players[index];
      if (!pose) {
        throw new Error(`The pose has no player ${index}.`);
      }
      return pose;
    },
    sets: generalSets(scene),
  };
}

/**
 * Finds the species and the instrument of a model of a scene.
 *
 * @param scene The scene.
 * @param model The model.
 * @returns The species and the instrument: the conductor when no player of the layout has it.
 */
function castOf(
  scene: TestScene,
  model: PlayerModel,
): { readonly species: SpeciesId; readonly instrument: InstrumentId } {
  for (const { cast } of scene.layout.players) {
    if (scene.models.get(cast.species, cast.instrument, cast.kettles, cast.support) === model) {
      return cast;
    }
  }
  return CONDUCTOR;
}

/**
 * Reads a `<species>:<instrument>` target.
 *
 * @param target The target.
 * @returns The species and the instrument, or `null` for another text.
 */
function speciesTarget(
  target: string,
): { readonly species: SpeciesId; readonly instrument: InstrumentId } | null {
  const [species = '', instrument = ''] = target.split(':');
  const id = INSTRUMENT_IDS.find((i) => i === instrument);
  return isSpeciesId(species) && id ? { species, instrument: id } : null;
}

/**
 * Gives the scene of a demo and the players of the target in it.
 *
 * @param target The target, or `null` for each player and the conductor.
 * @param demo The demo file.
 * @returns The scene and the players, or `null` when the demo does not have the target.
 * @throws Error if the target is no role and no `<species>:<instrument>`.
 */
function demoPlayers(target: string | null, demo: DemoFile): DemoPlayers | null {
  if (target === null) {
    const scene = sceneOf(demo.bytes);
    const players = scene.layout.players.map((_, index) => scenePlayer(scene, index));
    return {
      scene,
      players: scene.plan.conductor ? [scenePlayer(scene, -1), ...players] : players,
    };
  }

  const pair = speciesTarget(target);
  if (pair) {
    const scene = sceneOf(demo.bytes);
    const players = scene.layout.players.flatMap(({ cast }, index) =>
      cast.species === pair.species && cast.instrument === pair.instrument
        ? [scenePlayer(scene, index)]
        : [],
    );
    return players.length > 0 ? { scene, players } : null;
  }

  const sweep = findSweep(target);
  const role = findRole(target);
  if (!sweep || !role) {
    throw new Error(`No role and no <species>:<instrument> has the name ${target}.\n${USAGE}`);
  }
  if (!sweep.hasRole(scoreOf(demo.bytes))) {
    return null;
  }
  const scene = roleScene(role, demo.bytes);
  const sets = sweep.sampleSets(scene).filter((set) => set.name !== 'play');
  const players = sweep.players(scene).map((player): ClipPlayer => {
    const { species, instrument } = castOf(scene, player.model);
    return {
      name: player.name,
      species,
      instrument,
      model: player.model,
      poseAt: player.poseAt,
      sets,
    };
  });
  return players.length > 0 ? { scene, players } : null;
}

/**
 * Tells the part of the harp of a closed shell from its place in the harp axes, before the scale:
 * the base and the pedals at the floor, the column at the front, the neck at the top, and the
 * soundbox.
 *
 * @param model The model of the harp player.
 * @param scale The scale of the harp of the species.
 * @param triangles The triangles of the shell, in the bind pose.
 * @param loops The open loops of the shell.
 * @returns The name of the part, or `null` for an open sheet, such as a string or a plate.
 */
function harpPart(
  model: PlayerModel,
  scale: number,
  triangles: readonly Triangle[],
  loops: number,
): string | null {
  const at = model.pieces.find((p) => p.piece.bone === 'instrument')?.at;
  if (!at) {
    return null;
  }
  const inverse = new Quaternion(...at.rotation).invert();
  const origin = new Vector3(...at.position);
  const local = (v: Vector3): Vector3 =>
    v.clone().sub(origin).applyQuaternion(inverse).divideScalar(scale);
  const box = new Box3();
  const world = new Box3();
  let area = 0;
  for (const t of triangles) {
    box.expandByPoint(local(t.a)).expandByPoint(local(t.b)).expandByPoint(local(t.c));
    world.expandByPoint(t.a).expandByPoint(t.b).expandByPoint(t.c);
    area += t.getArea();
  }

  const mid = box.getCenter(new Vector3());
  const solid = area / world.getSize(new Vector3()).length() > SHEET_RATIO;
  if (mid.y < 0.1 && box.max.y - box.min.y < 0.12) {
    if (loops === 0 && solid) {
      return 'base';
    }
    return loops === 1 && triangles.length <= 12 ? 'pedals' : null;
  }
  if (loops !== 0 || !solid) {
    return null;
  }
  if (mid.z < -0.33) {
    return 'column';
  }
  return box.min.y > 0.9 ? 'neck' : 'soundbox';
}

/**
 * Gives the bind triangles of some first corners.
 *
 * @param model The model.
 * @param firsts The first corner of each triangle.
 * @returns The triangles.
 */
function bindTriangles(model: PlayerModel, firsts: readonly number[]): Triangle[] {
  const p = model.mesh.positions;
  const corner = (c: number): Vector3 =>
    new Vector3(p[c * 3] ?? 0, p[c * 3 + 1] ?? 0, p[c * 3 + 2] ?? 0);
  return firsts.map((v) => new Triangle(corner(v), corner(v + 1), corner(v + 2)));
}

/**
 * Finds the shells of the instrument bones of a model: the triangles that share an edge in the
 * bind pose are in the same shell.
 *
 * @param model The model.
 * @returns The first corners of the triangles of each shell, by the bone of its first triangle.
 */
function instrumentShells(model: PlayerModel): Map<number, number[][]> {
  const { mesh } = model;
  const firsts: number[] = [];
  for (let v = 0; v < mesh.bones.length; v += 3) {
    if (INSTRUMENT_BONES.has(mesh.bones[v] ?? -1)) {
      firsts.push(v);
    }
  }

  // Each triangle starts as its own shell. An edge joins the shells of its two triangles.
  const parent = firsts.map((_, i) => i);
  const rootOf = (i: number): number => {
    let r = i;
    while (parent[r] !== r) {
      r = parent[r] ?? r;
    }
    parent[i] = r;
    return r;
  };
  const owner = new Map<string, number>();
  const p = mesh.positions;
  const placeOf = (c: number): string => `${p[c * 3]} ${p[c * 3 + 1]} ${p[c * 3 + 2]}`;
  for (const [t, v] of firsts.entries()) {
    for (let k = 0; k < 3; k++) {
      const a = placeOf(v + k);
      const b = placeOf(v + ((k + 1) % 3));
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const other = owner.get(key);
      if (other === undefined) {
        owner.set(key, t);
      } else {
        parent[rootOf(t)] = rootOf(other);
      }
    }
  }

  const shells = new Map<number, number[]>();
  for (const [t, v] of firsts.entries()) {
    const r = rootOf(t);
    const shell = shells.get(r) ?? [];
    shell.push(v);
    shells.set(r, shell);
  }
  const byBone = new Map<number, number[][]>();
  for (const shell of shells.values()) {
    const bone = mesh.bones[shell[0] ?? 0] ?? 0;
    byBone.set(bone, [...(byBone.get(bone) ?? []), shell]);
  }
  return byBone;
}

/**
 * Makes the surface of a part in a pose: its shown shells, posed, with a cap on each open loop.
 * The surface of the last pose stays when the frame of the bone and the shown shells are the same.
 *
 * @param bone The bone of the part.
 * @param shells The shells.
 * @returns The function that gives the surface, or `null` when no shell shows.
 */
function movingSurface(
  bone: number,
  shells: readonly Shell[],
): (posed: PosedSkeleton) => ClosedSurface | null {
  let lastKey = '';
  let last: ClosedSurface | null = null;
  return (posed) => {
    const shown = shells.filter((s) => cornerShown(posed, s.firsts[0] ?? 0));
    const frame = posed.frames[bone];
    const key = `${frame?.position.toArray().join(' ')} ${frame?.rotation.toArray().join(' ')} ${shown.length}`;
    if (key === lastKey) {
      return last;
    }
    lastKey = key;
    const triangles: Triangle[] = [];
    for (const shell of shown) {
      for (const v of shell.firsts) {
        const [a, b, c] = [0, 1, 2].map((k) => new Vector3(...posedCorner(posed, v + k)));
        if (a && b && c) {
          triangles.push(new Triangle(a, b, c));
        }
      }
    }
    const loops = shown.reduce((sum, s) => sum + s.loops, 0);
    last = triangles.length > 0 ? closeSurface(triangles, loops) : null;
    return last;
  };
}

/**
 * Finds the parts of a player: the closed shells of each instrument bone (the named parts of a
 * harp), and the seat.
 *
 * @param player The player.
 * @returns The parts.
 */
function playerParts(player: ClipPlayer): ClipPart[] {
  const { model } = player;
  const groups = new Map<string, { bone: number; shells: Shell[] }>();
  const scale = instrumentScale(SPECIES[player.species], 'harp');
  for (const [bone, shells] of instrumentShells(model)) {
    const label = INSTRUMENT_BONES.get(bone) ?? '';
    for (const firsts of shells) {
      const triangles = bindTriangles(model, firsts);
      const loops = openLoops(triangles);
      const box = new Box3();
      for (const t of triangles) {
        box.expandByPoint(t.a).expandByPoint(t.b).expandByPoint(t.c);
      }
      const area = triangles.reduce((sum, t) => sum + t.getArea(), 0);
      let name: string | null = label || player.instrument;
      if (player.instrument === 'harp' && label === '') {
        name = harpPart(model, scale, triangles, loops);
      } else if (loops !== 0 || area / box.getSize(new Vector3()).length() <= SHEET_RATIO) {
        name = null;
      }
      if (name !== null) {
        const group = groups.get(name) ?? { bone, shells: [] };
        group.shells.push({ firsts, loops });
        groups.set(name, group);
      }
    }
  }

  const parts: ClipPart[] = [...groups].map(([name, { bone, shells }]) => ({
    name,
    triangles: shells.reduce((sum, s) => sum + s.firsts.length, 0),
    surface: movingSurface(bone, shells),
  }));
  const seat = buildSupport(model.support, model.seat);
  if (seat) {
    const m = seat.positions;
    const corner = (k: number): Vector3 => new Vector3(m[k * 3], m[k * 3 + 1], m[k * 3 + 2]);
    const triangles: Triangle[] = [];
    for (let k = 0; k + 2 < m.length / 3; k += 3) {
      triangles.push(new Triangle(corner(k), corner(k + 1), corner(k + 2)));
    }
    const surface = closeSurface(triangles, openLoops(triangles));
    parts.push({
      name: model.support,
      triangles: triangles.length,
      surface: () => surface,
    });
  }
  return parts;
}

/**
 * Gives the body corners of each region: one corner for each distinct bind point.
 *
 * @param model The model.
 * @returns The corners of each region that has some.
 */
function regionCorners(model: PlayerModel): Map<string, number[]> {
  const regionOf = new Map<number, string>();
  for (const [region, bones] of REGIONS) {
    for (const bone of bones) {
      regionOf.set(boneIndex(bone), region);
    }
  }
  const corners = new Map<string, number[]>();
  const seen = new Set<string>();
  const p = model.mesh.positions;
  for (let c = 0; c < model.mesh.bones.length; c++) {
    const region = regionOf.get(model.mesh.bones[c] ?? -1);
    const key = `${p[c * 3]} ${p[c * 3 + 1]} ${p[c * 3 + 2]}`;
    if (!region || seen.has(key)) {
      continue;
    }
    seen.add(key);
    corners.set(region, [...(corners.get(region) ?? []), c]);
  }
  return corners;
}

/**
 * Measures one player over the play and its other sample sets.
 *
 * @param demo The demo, with no `.mid`.
 * @param scene The scene of the player.
 * @param player The player.
 * @param options The options.
 * @returns The result.
 */
function measurePlayer(
  demo: string,
  scene: TestScene,
  player: ClipPlayer,
  options: ClipOptions,
): PlayerResult {
  const started = performance.now();
  const { model } = player;
  const headHeight = SPECIES[player.species].headHeight;
  const limit = options.limit * headHeight;
  const parts = playerParts(player);
  const corners = regionCorners(model);

  // The play samples, from the song start, then the other sets of the player.
  const play: SweepSample[] = [];
  for (let song = 0; song <= scene.score.durationSec; song += options.step) {
    play.push(playSample(scene, song));
  }
  const sets = [{ name: 'play', samples: play }, ...player.sets];

  const rows: ClipRow[] = [];
  const samples: Record<string, number> = {};
  for (const set of sets) {
    const cells = new Map<string, ClipRow>();
    let count = 0;
    for (const sample of set.samples) {
      count++;
      const posed = poseSkeleton(model, player.poseAt(sample));
      const surfaces = parts.map((part) => part.surface(posed));
      for (const [region, list] of corners) {
        const points = list.map((c) => new Vector3(...posedCorner(posed, c)));
        for (const [i, part] of parts.entries()) {
          const surface = surfaces[i];
          const key = `${region}|${part.name}`;
          const row = cells.get(key) ?? {
            set: set.name,
            region,
            part: part.name,
            depth: 0,
            song: 0,
            wall: 0,
            over: 0,
            samples: 0,
          };
          cells.set(key, row);
          row.samples++;
          const { depth } = surface ? closedDepth(points, surface) : { depth: 0 };
          if (depth > row.depth) {
            row.depth = depth;
            [row.song, row.wall] = sample;
          }
          if (depth > limit) {
            row.over++;
          }
        }
      }
    }
    samples[set.name] = count;
    rows.push(...[...cells.values()].filter((row) => row.depth > 0));
  }

  return {
    demo,
    name: player.name,
    species: player.species,
    headHeight,
    limit,
    points: Object.fromEntries([...corners].map(([r, c]) => [r, c.length])),
    parts: Object.fromEntries(parts.map((p) => [p.name, p.triangles])),
    samples,
    rows: rows.toSorted((a, b) => b.depth - a.depth || b.over / b.samples - a.over / a.samples),
    seconds: (performance.now() - started) / 1000,
  };
}

/**
 * Writes the table of one player.
 *
 * @param result The result.
 * @param step The step of the play samples, in seconds.
 * @returns The lines.
 */
function resultLines(result: PlayerResult, step: number): string[] {
  const cm = (m: number): string => (m * 100).toFixed(1);
  const points = Object.values(result.points).reduce((a, b) => a + b, 0);
  const clips = result.rows.filter((r) => r.depth > result.limit);
  const lines = [
    `${result.demo}: ${result.name} (${result.species}), H ${result.headHeight.toFixed(3)} m, limit ${cm(result.limit)} cm`,
    `  body points: ${points}, each distinct bind point of each region (no sampling)`,
    `  parts (triangles): ${Object.entries(result.parts)
      .map(([n, t]) => `${n} ${t}`)
      .join(', ')}`,
    `  samples: ${Object.entries(result.samples)
      .map(([n, c]) => `${n} ${c}`)
      .join(', ')} (play every ${step} s), ${result.seconds.toFixed(1)} s`,
    `  ${'verdict'.padEnd(8)}${'set'.padEnd(7)}${'region'.padEnd(13)}${'into'.padEnd(10)}${'cm'.padStart(6)}${'H'.padStart(8)}${'over %'.padStart(8)}  worst song/wall s`,
  ];
  for (const row of result.rows) {
    const verdict = row.depth > result.limit ? 'CLIP' : 'PASS';
    lines.push(
      `  ${verdict.padEnd(8)}${row.set.padEnd(7)}${row.region.padEnd(13)}${row.part.padEnd(10)}${cm(row.depth).padStart(6)}${(row.depth / result.headHeight).toFixed(3).padStart(8)}${((100 * row.over) / row.samples).toFixed(1).padStart(8)}  ${row.song.toFixed(2)}/${row.wall.toFixed(2)}`,
    );
  }
  if (result.rows.length === 0) {
    lines.push('  no body point enters a part');
  }
  lines.push(
    `  ${clips.length > 0 ? 'CLIP' : 'PASS'}: ${clips.length} of ${result.rows.length} rows over the limit`,
  );
  return lines;
}

/**
 * Runs the probe: each player of the target in each demo.
 *
 * @param options The options.
 * @returns The results.
 * @throws Error if a demo is unknown or no demo has the target.
 */
async function runProbe(options: ClipOptions): Promise<PlayerResult[]> {
  const all = await probeDemos();
  const idOf = (demo: DemoFile): string => demo.file.replace(/\.mid$/, '');
  for (const id of options.demos) {
    if (!all.some((demo) => idOf(demo) === id)) {
      throw new Error(`No demo has the id ${id}.`);
    }
  }
  const demos =
    options.demos.length > 0 ? all.filter((demo) => options.demos.includes(idOf(demo))) : all;

  const results: PlayerResult[] = [];
  for (const demo of demos) {
    const found = demoPlayers(options.target, demo);
    if (!found) {
      continue;
    }
    for (const player of found.players) {
      const result = measurePlayer(idOf(demo), found.scene, player, options);
      console.log(resultLines(result, options.step).join('\n'));
      results.push(result);
    }
    if (options.demos.length === 0) {
      break;
    }
  }
  if (results.length === 0) {
    throw new Error(`No demo has a player of ${options.target ?? 'the run'}.`);
  }
  return results;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(USAGE);
  } else {
    const options = readOptions(args);
    if (options.holds !== null) {
      console.log(`holds: ${setHolds(options.holds).text}`);
    }
    const results = await runProbe(options);
    if (options.json) {
      writeFileSync(
        options.json,
        `${JSON.stringify({ version: FORMAT, step: options.step, limit: options.limit, players: results }, null, 1)}\n`,
      );
    }
    if (results.some((r) => r.rows.some((row) => row.depth > r.limit))) {
      process.exitCode = 1;
    }
  }
}

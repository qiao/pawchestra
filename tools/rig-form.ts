/**
 * Measures the form of the players of a studio body in the app of a source tree, for the table of
 * `pnpm rig-mesh --check` (`docs/agents/rigging.md`, "The asset chain"): for each player, the
 * visible head, the standing and the seated head tops, the footprint, and the hold anchors (the
 * head center, the head height, the nose, and the box of the instrument), and the stage side of
 * each demo. The check runs it as a child in the copy of `tools/glb-swap.ts` with the body of each
 * variant, and in a probe tree of `main` (`tools/ref-tree.ts`). It imports only the code of the app
 * and the demo patches, so the check runs this script of the working tree also on the source of
 * `main`.
 *
 * Usage: node tools/rig-form.ts --player <species>:<instrument>... --json <file>
 */
import { writeFileSync } from 'node:fs';

import type { Bounds } from '../src/models/bounds.ts';
import { playerFootprint } from '../src/models/footprint.ts';
import { INSTRUMENT_SUPPORTS, buildPlayer } from '../src/models/player.ts';
import type { PlayerModel } from '../src/models/player.ts';
import { boneIndex } from '../src/models/rig.ts';
import type { Vec3 } from '../src/models/tuples.ts';
import { isSpeciesId } from '../src/models/species.ts';
import type { SpeciesId } from '../src/models/species.ts';
import { INSTRUMENT_IDS } from '../src/models/instruments/catalog.ts';
import type { InstrumentBone, InstrumentId } from '../src/models/instruments/types.ts';
import { demoLayout } from './demo-layout.ts';
import { patchedDemos } from './patch-demos.ts';

/**
 * Tells if a text names an instrument of the catalog.
 *
 * @param text The text.
 * @returns True for an id of `INSTRUMENT_IDS`.
 */
function isInstrument(text: string): text is InstrumentId {
  return INSTRUMENT_IDS.some((id) => id === text);
}

/** A player of `--player`: a species with an instrument. */
interface FormPlayer {
  /** The species. */
  readonly species: SpeciesId;
  /** The instrument. */
  readonly instrument: InstrumentId;
}

/** The form of one player in the app. */
export interface PlayerForm {
  /** The species. */
  readonly species: string;
  /** The instrument. */
  readonly instrument: string;
  /** The seat height of the player on the support of its instrument, in meters, or 0 standing. */
  readonly seat: number;
  /**
   * The visible head of the seated player: the height from the lowest to the highest corner of the
   * head bone, in meters. The head height H of the holds can differ, as for a grown head.
   */
  readonly visibleHead: number;
  /** The highest corner of the head bone of the standing player, in meters above the floor. */
  readonly standingTop: number;
  /** The highest corner of the head bone of the seated player, in meters above the floor. */
  readonly seatedTop: number;
  /** The size of the footprint of the seated player across, in meters. */
  readonly width: number;
  /** The size of the footprint of the seated player from the front to the back, in meters. */
  readonly depth: number;
  /**
   * The center of the head of the seated player, in meters (`BodyBones.headCenter`). The holds of
   * the instruments under the chin and of the winds take their places from it.
   */
  readonly headCenter: Vec3;
  /** The head height H of the holds of the seated player, in meters. */
  readonly headHeight: number;
  /** The tip of the nose of the studio body of the seated player, or `null` with no studio body. */
  readonly nose: Vec3 | null;
  /**
   * The box of the instrument of the seated player in its bind pose: the corners of the mesh on
   * the bones of the instrument ({@link INSTRUMENT_BONES}), in meters. It is `null` when no corner
   * is on these bones. The footprint and the layout take the instrument from the same corners.
   */
  readonly instrumentBox: Bounds | null;
}

/** The stage side of one demo. */
interface DemoStage {
  /** The file of the demo, such as `mozart-k525.mid`. */
  readonly demo: string;
  /** The side of the square stage of the layout, in meters. */
  readonly side: number;
}

/**
 * The format version of the JSON text of `--json` (`formatVersion()` of `tools/ref-tree.ts`). A
 * change of the format takes the next version, so that the form tables of `pnpm rig-mesh --check`
 * stop on two formats.
 */
export const FORM_FORMAT = 2;

/** The bones that carry the pieces of an instrument (design 4.7). */
const INSTRUMENT_BONES = [
  'instrument',
  'slide',
  'bow',
  'malletL',
  'malletR',
  'baton',
] as const satisfies readonly InstrumentBone[];

/**
 * Finds the box of the corners of a mesh on some bones.
 *
 * @param mesh The places and the bone of each corner of the mesh.
 * @param bones The indices of the bones.
 * @returns The box, or `null` when no corner is on the bones.
 */
export function boneBox(
  mesh: Pick<PlayerModel['mesh'], 'positions' | 'bones'>,
  bones: ReadonlySet<number>,
): Bounds | null {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let found = false;
  for (let c = 0; c < mesh.bones.length; c++) {
    if (!bones.has(mesh.bones[c] ?? -1)) {
      continue;
    }
    found = true;
    for (let k = 0; k < 3; k++) {
      const value = mesh.positions[c * 3 + k] ?? 0;
      min[k] = Math.min(min[k] ?? Infinity, value);
      max[k] = Math.max(max[k] ?? -Infinity, value);
    }
  }
  const [x0 = 0, y0 = 0, z0 = 0] = min;
  const [x1 = 0, y1 = 0, z1 = 0] = max;
  return found ? { min: [x0, y0, z0], max: [x1, y1, z1] } : null;
}

/** The form of the players and the stages of a source tree, as `--json` writes it. */
export interface FormJson {
  /** The form of each player of `--player`, in their order. */
  readonly players: readonly PlayerForm[];
  /** The stage side of each demo, in the order of the files. */
  readonly stages: readonly DemoStage[];
}

/** The top and the chin of the head of a player. */
interface HeadExtent {
  /** The highest corner of the head bone, in meters above the floor. */
  readonly top: number;
  /** The lowest corner of the head bone, in meters above the floor. */
  readonly chin: number;
}

/**
 * Finds the highest and the lowest corner of the head bone of the mesh of a player.
 *
 * @param mesh The places and the bone of each corner of the mesh.
 * @param head The index of the head bone.
 * @returns The top and the chin.
 * @throws Error if no corner is on the head bone.
 */
export function headExtent(
  mesh: Pick<PlayerModel['mesh'], 'positions' | 'bones'>,
  head: number,
): HeadExtent {
  let top = -Infinity;
  let chin = Infinity;
  for (let c = 0; c < mesh.bones.length; c++) {
    if (mesh.bones[c] === head) {
      const y = mesh.positions[c * 3 + 1] ?? 0;
      top = Math.max(top, y);
      chin = Math.min(chin, y);
    }
  }
  if (top < chin) {
    throw new Error('The mesh has no corner on the head bone.');
  }
  return { top, chin };
}

/**
 * Measures the form of one player: the seat, the visible head, the head tops, the footprint, and
 * the hold anchors.
 *
 * @param player The species and the instrument.
 * @returns The form.
 */
export function playerForm(player: FormPlayer): PlayerForm {
  const { species, instrument } = player;
  const head = boneIndex('head');
  const seated = buildPlayer(species, instrument, 4, INSTRUMENT_SUPPORTS[instrument]);
  const standing = buildPlayer(species, instrument, 4, 'stand');
  const sitting = headExtent(seated.mesh, head);
  const { bounds } = playerFootprint(seated);
  return {
    species,
    instrument,
    seat: seated.seat?.seatHeight ?? 0,
    visibleHead: sitting.top - sitting.chin,
    standingTop: headExtent(standing.mesh, head).top,
    seatedTop: sitting.top,
    width: (bounds.max[0] ?? 0) - (bounds.min[0] ?? 0),
    depth: (bounds.max[2] ?? 0) - (bounds.min[2] ?? 0),
    headCenter: seated.body.headCenter,
    headHeight: seated.body.headHeight,
    nose: seated.studio.body.nose ?? null,
    instrumentBox: boneBox(seated.mesh, new Set(INSTRUMENT_BONES.map((bone) => boneIndex(bone)))),
  };
}

/**
 * Reads a player of `--player`.
 *
 * @param text The text, such as `fox-red:violin`.
 * @returns The player.
 * @throws Error if the text does not name a species and an instrument.
 */
export function parsePlayer(text: string): FormPlayer {
  const [species = '', instrument = '', ...rest] = text.split(':');
  if (!isSpeciesId(species) || !isInstrument(instrument) || rest.length > 0) {
    throw new Error(`The player "${text}" is not <species>:<instrument>.`);
  }
  return { species, instrument };
}

/**
 * Writes the form as the JSON text of `--json`, with the format version {@link FORM_FORMAT}.
 *
 * @param form The form.
 * @returns The text.
 */
export function formJson(form: FormJson): string {
  return JSON.stringify({ version: FORM_FORMAT, ...form });
}

/**
 * Reads the JSON text of `--json`.
 *
 * @param text The JSON text.
 * @returns The form.
 * @throws Error if the text has no list of players or of stages.
 */
export function readFormJson(text: string): FormJson {
  // SAFETY: the text comes from this tool in a child process, and the check below reads the lists.
  const parsed = JSON.parse(text) as Partial<FormJson>;
  if (!Array.isArray(parsed.players) || !Array.isArray(parsed.stages)) {
    throw new Error('The form has no list of players or of stages.');
  }
  return { players: parsed.players, stages: parsed.stages };
}

/**
 * Runs the tool: `node tools/rig-form.ts --player <species>:<instrument>... --json <file>`.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const players: FormPlayer[] = [];
  let json = '';
  for (let i = 0; i < args.length; i += 2) {
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`The option ${args[i] ?? ''} has no value.`);
    }
    if (args[i] === '--player') {
      players.push(parsePlayer(value));
    } else if (args[i] === '--json') {
      json = value;
    } else {
      throw new Error(`The option ${args[i] ?? ''} is not known.`);
    }
  }
  if (!json) {
    throw new Error(
      'Usage: node tools/rig-form.ts --player <species>:<instrument>... --json <file>',
    );
  }

  const stages = (await patchedDemos()).map((demo) => ({
    demo: demo.file,
    side: demoLayout(demo.bytes).layout.stageSide,
  }));
  const form: FormJson = { players: players.map(playerForm), stages };
  writeFileSync(json, formJson(form));
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

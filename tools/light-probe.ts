/**
 * Probes the direct light of the stage lights on the players (design 4.5), with no render.
 *
 * Usage: `pnpm light-probe [--demo <id>]... [--look <JSON>] [--grid <path>=<a>:<b>:<step>]...
 * [--grid <path>=<v>,<v>,...]... [--goal <ratio> [--solve <path>]] [--tier <tier>] [--no-hot]`
 *
 * For each demo (by default Beethoven 9, Brahms 2, and Boulanger), it gives the light on the front
 * of each player at the height of the chest, with the pool factor, by row around the podium, as a
 * part of the first row. It gives each kind of light (the side lights, the back-row lights, the key
 * light, and the rim lights), the mean of the back row, the second row from the back, and the
 * choir, the light of the back-row lights and of the rim lights on the floor behind the back row
 * against the key light, and the spill of the back-row lights on the first row.
 *
 * - `--look <JSON>` changes the values first, as the query `look` of the dev server
 *   (`LOOK_ROOTS` of `src/scene/look-values.ts`), such as `{"BACK_ROW_LIGHT.illuminance": 2.81}`.
 * - `--grid` gives one cell for each value of a path, and the product of the grids. Each cell
 *   prints one line. An angle takes degrees, such as `8deg,10deg,12deg`.
 * - `--goal <ratio>` solves the value of `--solve` (`BACK_ROW_LIGHT.illuminance` by default) from
 *   0 to 50 that gives the back row this part of the first row, as the mean of the demos.
 * - `--tier` sets the tier of `createLights()`: `high` by default. The shader multiplies each
 *   spotlight with a shadow map by the hot spot of the key light (`SPOT_POOL_GLSL` of
 *   `src/scene/light-pool.ts`): the key light on each tier, and the side lights on the high and
 *   the medium tier. The players take a narrower hot spot (`LIGHT_POOL.playerSpot`). `--no-hot`
 *   leaves the hot spot out.
 *
 * The math comes from the scene: `createLights()`, `defaultAim()`, `poolFactor()`,
 * `hotSpotFactor()`, and `spotIlluminance()`. The light on the face of the conductor is not in
 * the sums.
 */
import { SpotLight } from 'three';

import { ROW_STEP, layoutScene } from '../src/models/layout-scene.ts';
import type { SceneLayout } from '../src/models/layout.ts';
import { ModelCache } from '../src/models/model-cache.ts';
import type { Vec3 } from '../src/models/tuples.ts';
import { defaultAim, hotSpotFactor, poolFactor } from '../src/scene/light-pool.ts';
import { LIGHT_NAMES, createLights, spotIlluminance } from '../src/scene/lights.ts';
import { applyLook, lookValueAt, parseLook } from '../src/scene/look-values.ts';
import type { LookChanges, LookValue } from '../src/scene/look-values.ts';
import type { QualityTier } from '../src/scene/quality.ts';
import { scoreOf } from '../src/score/test-score.ts';
import { patchedDemo } from './patch-demos.ts';

/** The height of the chest above the seat floor, in meters: the point of the light of a player. */
export const CHEST = 0.8;

/** The demos of the probe with no `--demo`. */
export const PROBE_DEMOS = ['beethoven-9', 'brahms-2', 'boulanger-matin'] as const;

/** The light of the stage lights on the front of one player, in lux, with the pool factor. */
export interface PlayerLight {
  /** The row: the distance to the podium center in steps of `ROW_STEP`, rounded. */
  readonly row: number;
  /** The light of the key light. */
  readonly key: number;
  /** The light of the two side lights. */
  readonly side: number;
  /** The light of the two back-row lights. */
  readonly back: number;
  /** The light of the rim lights. */
  readonly rim: number;
  /** The species of the player. */
  readonly species: string;
  /** True for a singer on the risers. */
  readonly riser: boolean;
}

/** The options of the light of the probe. */
export interface ProbeLight {
  /** The tier of `createLights()`. */
  readonly tier: QualityTier;
  /** True to multiply each spotlight with a shadow map by the hot spot of the key light. */
  readonly hot: boolean;
}

/** The light of the kinds of lights at a point, in lux. */
interface KindLight {
  /** The key light. */
  readonly key: number;
  /** The side lights. */
  readonly side: number;
  /** The back-row lights. */
  readonly back: number;
  /** The rim lights. */
  readonly rim: number;
}

/**
 * Gives the light of each kind of stage light at a point, with the pool factor and the hot spot.
 *
 * @param spots The spotlights of `createLights()`.
 * @param point The point.
 * @param normal The unit normal of the face.
 * @param pool The pool factor of the point.
 * @param hot The factor of the hot spot of the point, for each spotlight with a shadow map.
 * @returns The light of each kind.
 */
function kindLight(
  spots: readonly SpotLight[],
  point: Vec3,
  normal: Vec3,
  pool: number,
  hot: number,
): KindLight {
  let [key, side, back, rim] = [0, 0, 0, 0];
  for (const spot of spots) {
    const light = pool * (spot.castShadow ? hot : 1) * spotIlluminance(spot, point, normal);
    if (spot.name === LIGHT_NAMES.key) {
      key += light;
    } else if (spot.name === LIGHT_NAMES.side) {
      side += light;
    } else if (spot.name === LIGHT_NAMES.backRow) {
      back += light;
    } else if (spot.name === LIGHT_NAMES.rim) {
      rim += light;
    }
  }
  return { key, side, back, rim };
}

/**
 * Gives the stage lights of a layout and the aim of their pool.
 *
 * @param layout The layout.
 * @param options The tier and the hot spot.
 * @returns The spotlights, the aim, and a function that gives the hot spot factor of a place.
 */
function stageLights(layout: SceneLayout, options: ProbeLight) {
  const group = createLights(layout.stageSide, options.tier, layout.conductor, { beam: false });
  const spots = group.children.filter((child): child is SpotLight => child instanceof SpotLight);
  const aim = defaultAim(layout.stageSide, layout.conductor ? layout.podium : null);
  const hot = (x: number, z: number, surface: 'stage' | 'players' = 'stage'): number =>
    options.hot ? hotSpotFactor(aim, x, z, surface) : 1;
  return { spots, aim, hot };
}

/**
 * Calculates the light on the front of each player at the height of the chest.
 *
 * @param layout The layout.
 * @param options The tier and the hot spot.
 * @returns The light of each player, in the order of `layout.players`.
 */
export function playerLights(layout: SceneLayout, options: ProbeLight): PlayerLight[] {
  const { spots, aim, hot } = stageLights(layout, options);
  const [px, , pz] = layout.podium;
  return layout.players.map((player) => {
    const [x, y, z] = player.position;
    const front: Vec3 = [-Math.sin(player.facing), 0, -Math.cos(player.facing)];
    const light = kindLight(
      spots,
      [x, y + CHEST, z],
      front,
      poolFactor(aim, x, z, 'players'),
      hot(x, z, 'players'),
    );
    return {
      row: Math.round(Math.hypot(x - px, z - pz) / ROW_STEP),
      ...light,
      species: player.cast.species,
      riser: player.cast.support === 'riser',
    };
  });
}

/**
 * Calculates the mean light on the stage top behind the back row: points every 0.5 m across the
 * middle 0.8 of the stage, and every 0.25 m from 0.2 m in front of the back edge to 0.6 m in front
 * of the last player. The stage takes the round pool.
 *
 * @param layout The layout.
 * @param options The tier and the hot spot.
 * @returns The mean light of each kind, in lux, and the number of points.
 */
export function floorLight(
  layout: SceneLayout,
  options: ProbeLight,
): KindLight & { readonly points: number } {
  const { spots, aim, hot } = stageLights(layout, options);
  const side = layout.stageSide;
  const lastZ = Math.min(...layout.players.map((p) => p.position[2]));
  const sum = { key: 0, side: 0, back: 0, rim: 0, points: 0 };
  for (let x = -0.4 * side; x <= 0.4 * side; x += 0.5) {
    for (let z = -side / 2 + 0.2; z < lastZ - 0.6; z += 0.25) {
      const light = kindLight(
        spots,
        [x, 0, z],
        [0, 1, 0],
        poolFactor(aim, x, z, 'stage'),
        hot(x, z),
      );
      sum.key += light.key;
      sum.side += light.side;
      sum.back += light.back;
      sum.rim += light.rim;
      sum.points += 1;
    }
  }
  const n = Math.max(1, sum.points);
  return {
    key: sum.key / n,
    side: sum.side / n,
    back: sum.back / n,
    rim: sum.rim / n,
    points: sum.points,
  };
}

/** The players of one row, with the mean light of each kind. */
export interface RowLight {
  /** The row index. */
  readonly row: number;
  /** The players of the row. */
  readonly players: readonly PlayerLight[];
  /** The mean light of each kind, in lux. */
  readonly mean: KindLight;
  /** True when each player of the row stands on the risers. */
  readonly choir: boolean;
}

/**
 * Groups the players by row, from the podium out.
 *
 * @param players The light of each player.
 * @returns The rows.
 */
export function rowLights(players: readonly PlayerLight[]): RowLight[] {
  const rows = new Map<number, PlayerLight[]>();
  for (const player of players) {
    rows.set(player.row, [...(rows.get(player.row) ?? []), player]);
  }
  const mean = (list: readonly PlayerLight[], kind: keyof KindLight): number =>
    list.reduce((sum, p) => sum + p[kind], 0) / list.length;
  return [...rows.entries()]
    .toSorted(([a], [b]) => a - b)
    .map(([row, list]) => ({
      row,
      players: list,
      mean: {
        key: mean(list, 'key'),
        side: mean(list, 'side'),
        back: mean(list, 'back'),
        rim: mean(list, 'rim'),
      },
      choir: list.every((p) => p.riser),
    }));
}

/** The total light of a kind light. */
const total = (light: KindLight): number => light.key + light.side + light.back + light.rim;

/** The measures of one demo that decide the back-row lights. */
export interface DemoMeasures {
  /** The mean light of the first row, in lux. */
  readonly first: number;
  /** The back row: the last row with no choir, as a part of the first row. */
  readonly back: number;
  /** The darkest player of the back row, as a part of the first row. */
  readonly backMin: number;
  /** The second row from the back, as a part of the first row, or `null` with one row. */
  readonly second: number | null;
  /** The choir, as a part of the first row, or `null` with no choir. */
  readonly choir: number | null;
  /** The light of the back-row lights on the first row, as a part of the other lights. */
  readonly spill: number;
  /** The light of the back-row lights on the floor behind the back row, as a part of the key. */
  readonly floor: number;
  /** The light of the rim lights on the floor behind the back row, as a part of the key. */
  readonly rimFloor: number;
}

/**
 * Measures one demo.
 *
 * @param rows The rows of {@link rowLights}.
 * @param floor The light on the floor behind the back row, from {@link floorLight}.
 * @returns The measures.
 * @throws Error if the layout has no row with no choir.
 */
export function demoMeasures(rows: readonly RowLight[], floor: KindLight): DemoMeasures {
  const seated = rows.filter((r) => !r.choir);
  const [first] = rows;
  const backRow = seated.at(-1);
  if (!first || !backRow) {
    throw new Error('The layout has no row of seated players.');
  }
  const base = total(first.mean);
  const second = seated.at(-2);
  const choir = rows.filter((r) => r.choir).flatMap((r) => r.players);
  return {
    first: base,
    back: total(backRow.mean) / base,
    backMin: Math.min(...backRow.players.map((p) => total(p))) / base,
    second: second ? total(second.mean) / base : null,
    choir: choir.length > 0 ? choir.reduce((s, p) => s + total(p), 0) / choir.length / base : null,
    spill: first.mean.back / (first.mean.key + first.mean.side),
    floor: floor.key > 0 ? floor.back / floor.key : 0,
    rimFloor: floor.key > 0 ? floor.rim / floor.key : 0,
  };
}

/**
 * Writes the rows of one demo as lines.
 *
 * @param file The demo file.
 * @param layout The layout.
 * @param rows The rows.
 * @param hot The text of the hot spot for the head line.
 * @returns The lines.
 */
export function rowLines(
  file: string,
  layout: SceneLayout,
  rows: readonly RowLight[],
  hot: string,
): string[] {
  const base = total(rows[0]?.mean ?? { key: 0, side: 0, back: 0, rim: 0 });
  const lines = [
    `${file}: S ${layout.stageSide.toFixed(2)} m, ${layout.players.length} players, first row ${base.toFixed(3)} lux, ${hot}`,
  ];
  for (const r of rows) {
    const { key, side, back, rim } = r.mean;
    const species = [...new Set(r.players.map((p) => p.species))].join(',');
    lines.push(
      `radius ~${(r.row * ROW_STEP).toFixed(1)} m  n ${String(r.players.length).padStart(2)}  side ${(side / base).toFixed(2)}  back-row ${(back / base).toFixed(2)}  key ${(key / base).toFixed(2)}  rim ${(rim / base).toFixed(2)}  total ${(total(r.mean) / base).toFixed(2)}  ${total(r.mean).toFixed(3)} lux  ${species}`,
    );
  }
  return lines;
}

/**
 * Writes the measures of the demos in one line.
 *
 * @param names The short name of each demo.
 * @param measures The measures of each demo.
 * @returns The line.
 */
export function measuresLine(names: readonly string[], measures: readonly DemoMeasures[]): string {
  const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;
  const spill = Math.max(...measures.map((m) => m.spill));
  const floor = Math.max(...measures.map((m) => m.floor));
  const rimFloor = Math.max(...measures.map((m) => m.rimFloor));
  const demos = measures.map((m, i) => {
    const second = m.second === null ? '' : ` 2nd ${m.second.toFixed(2)}`;
    const choir = m.choir === null ? '' : ` choir ${m.choir.toFixed(2)}`;
    return `${names[i]} spill ${pct(m.spill)}${second} back ${m.back.toFixed(2)} (min ${m.backMin.toFixed(2)})${choir}`;
  });
  return `spill ${pct(spill)} back floor +${(floor * 100).toFixed(0)}% of key, rim floor +${(rimFloor * 100).toFixed(0)}% of key | ${demos.join(' | ')}`;
}

/** The command line. */
interface ProbeArgs {
  /** The demo files. */
  readonly demos: readonly string[];
  /** The changes of `--look`. */
  readonly look: LookChanges;
  /** The values of each path of `--grid`. */
  readonly grid: readonly (readonly [path: string, values: readonly LookValue[]])[];
  /** The goal of `--goal`, or `null`. */
  readonly goal: number | null;
  /** The path of `--solve`. */
  readonly solve: string;
  /** The light options. */
  readonly light: ProbeLight;
}

/** The tiers of `--tier`. */
const TIERS: readonly QualityTier[] = ['high', 'medium', 'low'];

/** The largest number of cells of the grids. */
const MAX_CELLS = 5000;

/**
 * Reads the values of one `--grid`: `<path>=<a>:<b>:<step>`, or `<path>=<v>,<v>,...`.
 *
 * @param text The text after `--grid`.
 * @returns The path and its values.
 * @throws Error for a text of another form.
 */
export function gridValues(text: string): [string, LookValue[]] {
  const equals = text.indexOf('=');
  const path = text.slice(0, equals);
  const values = text.slice(equals + 1);
  const range = /^(-?[\d.]+):(-?[\d.]+):([\d.]+)$/.exec(values);
  if (equals < 1 || !values) {
    throw new Error(`The grid "${text}" is not <path>=<a>:<b>:<step> or <path>=<v>,<v>,...`);
  }
  if (range) {
    const [a, b, step] = [Number(range[1]), Number(range[2]), Number(range[3])];
    if (!(step > 0) || b < a) {
      throw new Error(`The grid "${text}" needs a step above 0 and an end at or after its start.`);
    }
    const count = Math.floor((b - a) / step + 1e-9) + 1;
    return [path, Array.from({ length: count }, (_, i) => Number((a + i * step).toFixed(10)))];
  }
  return [path, values.split(',').map((v) => (/^-?\d+(?:\.\d+)?$/.test(v) ? Number(v) : v))];
}

/**
 * Reads the command line.
 *
 * @param args The arguments after the script.
 * @returns The command line.
 * @throws Error for an unknown option, a missing value, or a wrong value.
 */
export function probeArgs(args: readonly string[]): ProbeArgs {
  const demos: string[] = [];
  const grid: [string, LookValue[]][] = [];
  let look: LookChanges = new Map();
  let goal: number | null = null;
  let solve = 'BACK_ROW_LIGHT.illuminance';
  let tier: QualityTier = 'high';
  let hot = true;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const value = (): string => {
      const next = args[i + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new Error(`The option ${arg} needs a value.`);
      }
      i++;
      return next;
    };
    if (arg === '--demo') {
      const demo = value();
      demos.push(demo.endsWith('.mid') ? demo : `${demo}.mid`);
    } else if (arg === '--look') {
      look = parseLook(value());
    } else if (arg === '--grid') {
      grid.push(gridValues(value()));
    } else if (arg === '--goal') {
      goal = Number(value());
      if (!(goal > 0)) {
        throw new Error('The goal is a part of the first row above 0, such as 0.85.');
      }
    } else if (arg === '--solve') {
      solve = value();
    } else if (arg === '--tier') {
      const text = value();
      const found = TIERS.find((t) => t === text);
      if (!found) {
        throw new Error(`The tier "${text}" is not known. The tiers are ${TIERS.join(', ')}.`);
      }
      tier = found;
    } else if (arg === '--no-hot') {
      hot = false;
    } else {
      throw new Error(
        `The option "${arg}" is not known. See the head comment of tools/light-probe.ts.`,
      );
    }
  }
  const cells = grid.reduce((n, [, values]) => n * values.length, 1);
  if (cells > MAX_CELLS) {
    throw new Error(`The grids give ${cells} cells, more than ${MAX_CELLS}.`);
  }
  return {
    demos: demos.length > 0 ? demos : PROBE_DEMOS.map((d) => `${d}.mid`),
    look,
    grid,
    goal,
    solve,
    light: { tier, hot },
  };
}

/**
 * Gives each cell of the grids: one value for each path.
 *
 * @param grid The values of each path.
 * @returns The cells. With no grid, one empty cell.
 */
export function gridCells(
  grid: readonly (readonly [string, readonly LookValue[]])[],
): Map<string, LookValue>[] {
  let cells: Map<string, LookValue>[] = [new Map()];
  for (const [path, values] of grid) {
    cells = cells.flatMap((cell) => values.map((v) => new Map([...cell, [path, v]])));
  }
  return cells;
}

/**
 * Solves the value of a path that gives the back row the goal part of the first row, as the mean
 * of the demos, by bisection from 0 to 50.
 *
 * @param path The path, such as `BACK_ROW_LIGHT.illuminance`.
 * @param goal The goal.
 * @param ratio The mean part of the back row with the current values.
 * @returns The value, or `null` when no value from 0 to 50 gives the goal. The path keeps the
 *   value.
 */
function solveGoal(path: string, goal: number, ratio: () => number): number | null {
  const at = (v: number): number => {
    applyLook(new Map([[path, v]]));
    return ratio() - goal;
  };
  let [lo, hi] = [0, 50];
  const [low, high] = [at(lo), at(hi)];
  if (Math.sign(low) === Math.sign(high)) {
    return null;
  }
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (Math.sign(at(mid)) === Math.sign(low)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  at(hi);
  return hi;
}

/**
 * Runs the probe: the rows of each demo for one cell, or one line for each cell of the grids.
 */
async function main(): Promise<void> {
  const args = probeArgs(process.argv.slice(2));
  for (const change of applyLook(args.look)) {
    console.log(`look ${change.path}: ${change.before} -> ${change.after}`);
  }
  if (!Number.isFinite(lookValueAt(args.solve))) {
    throw new Error(`The path ${args.solve} of --solve names no number.`);
  }
  const solveValue = (): string => JSON.stringify(lookValueAt(args.solve));
  const hotText = args.light.hot
    ? `hot spot on each spotlight with a shadow map (tier ${args.light.tier})`
    : `no hot spot (tier ${args.light.tier})`;

  const demos = await Promise.all(
    args.demos.map(async (file) => {
      const layout = layoutScene(scoreOf((await patchedDemo(file)).bytes), new ModelCache());
      return { file, name: file.replace(/\.mid$/, ''), layout };
    }),
  );
  const measure = () => {
    const rows = demos.map((d) => rowLights(playerLights(d.layout, args.light)));
    const measures = demos.map((d, i) =>
      demoMeasures(rows[i] ?? [], floorLight(d.layout, args.light)),
    );
    return { rows, measures };
  };
  const ratio = (): number => {
    const { measures } = measure();
    return measures.reduce((s, m) => s + m.back, 0) / measures.length;
  };
  const names = demos.map((d) => d.name);

  const cells = gridCells(args.grid);
  for (const cell of cells) {
    applyLook(cell);
    let solved = '';
    if (args.goal !== null) {
      const value = solveGoal(args.solve, args.goal, ratio);
      solved =
        value === null
          ? `no ${args.solve} from 0 to 50 gives the back row ${args.goal} of the first row`
          : `${args.solve} ${value.toFixed(2)} gives the back row ${args.goal} of the first row`;
    }
    const { rows, measures } = measure();
    const head = args.grid.length > 0 ? `${JSON.stringify(Object.fromEntries(cell))} ` : '';
    if (cells.length === 1) {
      for (const [i, demo] of demos.entries()) {
        console.log(rowLines(demo.file, demo.layout, rows[i] ?? [], hotText).join('\n'));
      }
      console.log(`${head}${solved || `${args.solve} ${solveValue()}`}`);
      console.log(`   ${measuresLine(names, measures)}`);
    } else {
      console.log(`${head}${solved || `${args.solve} ${solveValue()}`}`);
      console.log(`   ${measuresLine(names, measures)}`);
    }
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

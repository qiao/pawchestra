/**
 * Runs one trial of a hand rig (design 4.4, "Hand rig") on a copy of its `.blend`, and shows the
 * result in the app. The stages:
 *
 * 1. Copy the base into `scratch/trials/<animal>/<tag>.blend`. The base is the `.blend` of the
 *    animal, an earlier trial (`--base <tag>`), the `.blend` of a commit (`--base <ref>`), or a
 *    file (`--base <file.blend>`). The tool never writes the `.blend` of the animal in a trial.
 * 2. Run the step on the copy in headless Blender (`tools/blender/rig_trial.py`, which gives the
 *    contract of a step). `-` runs no step.
 * 3. Export `<tag>.rig.glb` and `<tag>.rig.json` beside the copy (`tools/blender/export_rig.py`).
 * 4. Render the close views of the role with the GLB file into `reports/trials/<animal>/<tag>/`
 *    (`tools/close-views.ts --glb`). The tool skips the `pnpm build` of `pnpm close-views`,
 *    because a close view with `--glb` builds a site of its own and does not read `dist/`.
 * 5. With `--probes`, run `pnpm fold-probe --glb` and `pnpm pose-depth --glb` at the same time as
 *    the views, and print one line for each. The probes are short: the fold probe takes a play
 *    step of 1 s, and the sweep takes every 4th sample of the first demo with the role. `--demo`
 *    gives the demos of both probes. `--full` gives each probe its own default.
 * 6. With `--pair <tag>`, write `pair-<tag>.png`: for each moment, the views of the other trial in
 *    a row, and the views of this trial in the row below. `--crop` crops each cell.
 *
 * The tool prints the time and the output paths of each stage, and writes the record of the trial
 * as `scratch/trials/<animal>/<tag>.json`. `--apply <tag>` runs the steps of a trial on the
 * `.blend` of the animal: each step of the chain of bases, in order, with the same arguments. It
 * refuses when the `.blend` or a step file changed after the trial. Then it exports the rig, and
 * keeps the result only when the GLB file is the same as the GLB file of the trial. Else it puts
 * the `.blend`, the GLB file, and the summary of before back, and stops with the exit code 1.
 *
 * Usage: pnpm rig-trial <animal> <role> <tag> <step.py|-> [--base <tag|ref|file.blend>]
 *   [--moments <list>] [--views <list>] [--scale <n>] [--elevation <deg>] [--probes fold,depth]
 *   [--demo <id,...>] [--full] [--pair <tag> [--crop <x0,y0,x1,y1>]] [-- <step args>...]
 * Usage: pnpm rig-trial <animal> --apply <tag>
 */
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';

/** The root of the repository. */
const ROOT = join(import.meta.dirname, '..');

/** The headless Blender of the rig tools: the variable `BLENDER`, or `blender` on the path. */
const BLENDER = process.env['BLENDER'] ?? 'blender';

/** The options of the stages that take a value. */
const VALUE_OPTIONS: ReadonlySet<string> = new Set([
  '--base',
  '--moments',
  '--views',
  '--scale',
  '--elevation',
  '--probes',
  '--pair',
  '--crop',
  '--demo',
]);

/** The probes of `--probes`. */
type ProbeName = 'fold' | 'depth';

/** The probe names of `--probes`. */
const PROBES: readonly ProbeName[] = ['fold', 'depth'];

/** The usage text. */
const USAGE = [
  'Usage: pnpm rig-trial <animal> <role> <tag> <step.py|-> [--base <tag|ref|file.blend>]',
  '  [--moments <list>] [--views <list>] [--scale <n>] [--elevation <deg>] [--probes fold,depth]',
  '  [--demo <id,...>] [--full] [--pair <tag> [--crop <x0,y0,x1,y1>]] [-- <step args>...]',
  '   or: pnpm rig-trial <animal> --apply <tag>',
].join('\n');

/** The kind of the base of a trial. */
type BaseKind = 'rig' | 'trial' | 'ref' | 'file';

/** The base of a trial: the file that the trial copies before its step. */
interface TrialBase {
  /**
   * `rig` for the `.blend` of the animal, `trial` for an earlier trial, `ref` for the `.blend` of a
   * commit, and `file` for another file.
   */
  readonly kind: BaseKind;
  /** The tag of the trial, the commit, or the path of the file from the root. */
  readonly name: string;
  /** The SHA-256 of the bytes that the trial copied. */
  readonly sha256: string;
}

/** The record of a trial, in `scratch/trials/<animal>/<tag>.json`. */
interface TrialRecord {
  /** The animal of the hand rig, the name of its folder in `assets/models/`. */
  readonly animal: string;
  /** The role of the close views and the probes. */
  readonly role: string;
  /** The tag of the trial. */
  readonly tag: string;
  /** The base of the trial. */
  readonly base: TrialBase;
  /** The step file from the root, or `null` for no step. */
  readonly step: string | null;
  /** The SHA-256 of the step file, or `null` for no step. */
  readonly stepSha256: string | null;
  /** The arguments of the step. */
  readonly args: readonly string[];
  /** The SHA-256 of the GLB file of the export. */
  readonly glbSha256: string;
}

/** The command line of a trial. */
interface TrialArgs {
  /** The animal. */
  readonly animal: string;
  /** The role. */
  readonly role: string;
  /** The tag. */
  readonly tag: string;
  /** The step file as an absolute path, or `null` for `-`. */
  readonly step: string | null;
  /** The arguments after `--`. */
  readonly stepArgs: readonly string[];
  /** The value of each option of {@link VALUE_OPTIONS} that the command line gives. */
  readonly options: ReadonlyMap<string, string>;
  /** The probes of `--probes`. */
  readonly probes: readonly ProbeName[];
  /** True for `--full`. */
  readonly full: boolean;
}

/** The end of a child process of {@link runLogged}. */
interface Ended {
  /** The exit code, or `null` after a signal. */
  readonly code: number | null;
  /** The time of the child, in seconds. */
  readonly seconds: number;
  /** The output and the error output of the child. */
  readonly text: string;
}

/**
 * Gives the folder of the trials of an animal.
 *
 * @param animal The animal.
 * @returns The absolute path.
 */
function trialDir(animal: string): string {
  return join(ROOT, 'scratch', 'trials', animal);
}

/**
 * Gives the `.blend` of the hand rig of an animal.
 *
 * @param animal The animal.
 * @returns The absolute path.
 */
function rigBlend(animal: string): string {
  return join(ROOT, 'assets', 'models', animal, `${animal}.blend`);
}

/**
 * Gives a path from the root, for the output.
 *
 * @param path The absolute path.
 * @returns The path from the root.
 */
function shown(path: string): string {
  return relative(ROOT, path);
}

/**
 * Gives the SHA-256 of bytes.
 *
 * @param bytes The bytes.
 * @returns The hash in hexadecimal.
 */
function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Gives the SHA-256 of a file.
 *
 * @param path The file.
 * @returns The hash in hexadecimal.
 */
function fileSha256(path: string): string {
  return sha256(readFileSync(path));
}

/**
 * Stops the tool with a message and the exit code 1.
 *
 * @param text The message.
 * @returns Never.
 */
function stop(text: string): never {
  console.error(`rig-trial: ${text}`);
  process.exit(1);
}

/**
 * Prints the time of a stage.
 *
 * @param stage The name of the stage.
 * @param seconds The time, in seconds.
 * @param text The result, such as an output path.
 */
function report(stage: string, seconds: number, text: string): void {
  console.log(`${stage.padEnd(7)} ${seconds.toFixed(1).padStart(6)} s  ${text}`);
}

/**
 * Runs a child process with its output into a log file.
 *
 * @param command The command.
 * @param args The arguments.
 * @param log The log file, or `null` for no log.
 * @returns The end of the child.
 */
function runLogged(command: string, args: readonly string[], log: string | null): Promise<Ended> {
  const start = performance.now();
  return new Promise((done) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    const parts: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => parts.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => parts.push(chunk));
    const end = (code: number | null): void => {
      const text = Buffer.concat(parts).toString('utf8');
      if (log) {
        writeFileSync(log, text);
      }
      done({ code, seconds: (performance.now() - start) / 1000, text });
    };
    child.on('error', (error) => {
      parts.push(Buffer.from(`${error.message}\n`));
      end(null);
    });
    child.on('close', end);
  });
}

/**
 * Gives the lines of a text that start with one of the prefixes.
 *
 * @param text The text.
 * @param prefixes The prefixes.
 * @returns The lines.
 */
function linesOf(text: string, prefixes: readonly string[]): string[] {
  return text.split('\n').filter((line) => prefixes.some((prefix) => line.startsWith(prefix)));
}

/**
 * Runs a script of `tools/blender/` in headless Blender.
 *
 * @param script The file name of the script.
 * @param args The arguments after `--`.
 * @param log The log file.
 * @returns The end of Blender.
 */
function blender(script: string, args: readonly string[], log: string): Promise<Ended> {
  const path = join(ROOT, 'tools', 'blender', script);
  return runLogged(
    BLENDER,
    ['-b', '--factory-startup', '--python-exit-code', '1', '--python', path, '--', ...args],
    log,
  );
}

/**
 * Reads the command line of a trial.
 *
 * @param argv The arguments.
 * @returns The command line.
 */
function trialArgs(argv: readonly string[]): TrialArgs {
  const split = argv.indexOf('--');
  const own = split >= 0 ? argv.slice(0, split) : [...argv];
  const stepArgs = split >= 0 ? argv.slice(split + 1) : [];
  const words: string[] = [];
  const options = new Map<string, string>();
  let full = false;
  for (let i = 0; i < own.length; i += 1) {
    const word = own[i] ?? '';
    if (word === '--full') {
      full = true;
    } else if (VALUE_OPTIONS.has(word)) {
      const value = own[i + 1];
      if (value === undefined || value.startsWith('--')) {
        stop(`The option ${word} has no value.\n${USAGE}`);
      }
      options.set(word, value);
      i += 1;
    } else if (word.startsWith('--')) {
      stop(`The option ${word} is unknown.\n${USAGE}`);
    } else {
      words.push(word);
    }
  }
  const [animal, role, tag, step] = words;
  if (!animal || !role || !tag || !step || words.length !== 4) {
    stop(USAGE);
  }
  if (!/^[\w.-]+$/.test(tag)) {
    stop(`The tag ${tag} must have only letters, digits, ".", "_", and "-".`);
  }
  if (!existsSync(rigBlend(animal))) {
    stop(`The animal ${animal} has no hand rig ${shown(rigBlend(animal))}.`);
  }
  if (step !== '-' && !existsSync(resolve(step))) {
    stop(`The step ${step} does not exist.`);
  }
  const probes = (options.get('--probes') ?? '').split(',').filter((name) => name !== '');
  const unknown = probes.find((name) => !PROBES.some((probe) => probe === name));
  if (unknown) {
    stop(`The probe ${unknown} is unknown. The probes are ${PROBES.join(', ')}.`);
  }
  if (options.has('--crop') && !options.has('--pair')) {
    stop('The option --crop needs --pair.');
  }
  return {
    animal,
    role,
    tag,
    step: step === '-' ? null : resolve(step),
    stepArgs,
    options,
    probes: PROBES.filter((probe) => probes.includes(probe)),
    full,
  };
}

/**
 * Gives the base of a trial and its bytes.
 *
 * @param args The command line.
 * @returns The base and its bytes.
 */
function baseOf(args: TrialArgs): { readonly base: TrialBase; readonly bytes: Buffer } {
  const name = args.options.get('--base');
  if (name === undefined) {
    const bytes = readFileSync(rigBlend(args.animal));
    return {
      base: { kind: 'rig', name: shown(rigBlend(args.animal)), sha256: sha256(bytes) },
      bytes,
    };
  }
  if (name === args.tag) {
    stop(`The trial ${args.tag} cannot be its own base.`);
  }
  const trial = join(trialDir(args.animal), `${name}.blend`);
  if (existsSync(trial) && existsSync(join(trialDir(args.animal), `${name}.json`))) {
    const bytes = readFileSync(trial);
    return { base: { kind: 'trial', name, sha256: sha256(bytes) }, bytes };
  }
  if (name.endsWith('.blend')) {
    if (!existsSync(resolve(name))) {
      stop(`The base ${name} does not exist.`);
    }
    const bytes = readFileSync(resolve(name));
    return { base: { kind: 'file', name: shown(resolve(name)), sha256: sha256(bytes) }, bytes };
  }
  try {
    const commit = execFileSync('git', ['rev-parse', '--verify', '--quiet', `${name}^{commit}`], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
    const path = `assets/models/${args.animal}/${args.animal}.blend`;
    const bytes = execFileSync('git', ['show', `${commit}:${path}`], {
      cwd: ROOT,
      maxBuffer: 1 << 30,
    });
    return { base: { kind: 'ref', name: commit.slice(0, 12), sha256: sha256(bytes) }, bytes };
  } catch {
    return stop(`The base ${name} is no trial, no .blend file, and no commit with the hand rig.`);
  }
}

/**
 * Reads the record of a trial.
 *
 * @param animal The animal.
 * @param tag The tag.
 * @returns The record.
 */
function readRecord(animal: string, tag: string): TrialRecord {
  const path = join(trialDir(animal), `${tag}.json`);
  if (!existsSync(path)) {
    stop(`The trial ${tag} has no record ${shown(path)}.`);
  }
  // SAFETY: the tool writes each record from a TrialRecord (runTrial()).
  return JSON.parse(readFileSync(path, 'utf8')) as TrialRecord;
}

/**
 * Gives the first demo with a player of a role, in the order of `pnpm pose-depth`.
 *
 * @param role The role.
 * @returns The id of the demo.
 */
async function firstDemo(role: string): Promise<string> {
  const { findSweep } = await import('./fold-probe.ts');
  const { roleDemos } = await import('./pose-depth.ts');
  const sweep = findSweep(role);
  const [demo] = sweep ? await roleDemos([], [], sweep) : [];
  return demo ? demo.file.replace(/\.mid$/, '') : stop(`The role ${role} has no sweep or no demo.`);
}

/**
 * Gives the arguments of a probe of the trial.
 *
 * @param probe The probe.
 * @param args The command line.
 * @param glb The GLB file.
 * @returns The command and its arguments.
 */
async function probeCommand(probe: ProbeName, args: TrialArgs, glb: string): Promise<string[]> {
  const given = args.options.get('--demo')?.split(',') ?? [];
  if (probe === 'fold') {
    return ['tools/fold-probe.ts', args.role, '--glb', glb, '--faces', '8']
      .concat(given.flatMap((id) => ['--demo', id]))
      .concat(args.full ? [] : ['--step', '1']);
  }
  const demos = given.length > 0 || args.full ? given : [await firstDemo(args.role)];
  return ['tools/pose-depth.ts', args.role, '--glb', glb]
    .concat(demos.flatMap((id) => ['--demo', id]))
    .concat(args.full ? [] : ['--every', '4']);
}

/**
 * Gives the summary line of the log of a fold probe: the share of the samples with a fold in each
 * set.
 *
 * @param text The log.
 * @returns The line.
 */
function foldSummary(text: string): string {
  const rows = new Map<string, string[]>();
  for (const line of text.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim());
    const set = cells[1];
    if (set && ['rest', 'play', 'lift', 'all'].includes(set) && !rows.has(set)) {
      rows.set(set, cells);
    }
  }
  const all = rows.get('all');
  if (!all) {
    return 'no table';
  }
  const sets = ['rest', 'play', 'lift'].map((set) => `${set} ${rows.get(set)?.[4] ?? '?'}`);
  return `all ${all[4]} (${all[3]} of ${all[2]} samples), ${sets.join(', ')}`;
}

/**
 * Gives the summary line of the log of a clearance sweep: the rows over their limit of the players
 * of the species of the animal, and the deepest row.
 *
 * @param text The log.
 * @param animal The animal.
 * @returns The line.
 */
function depthSummary(text: string, animal: string): string {
  let own = false;
  let rows = 0;
  let over = 0;
  let deepest = { depth: -1, text: '' };
  for (const line of text.split('\n')) {
    const player = /^ {2}\S+ \S+ \d+ \(([\w-]+),/.exec(line);
    if (player) {
      own = (player[1] ?? '').replace(/-/g, '_').startsWith(animal.replace(/-/g, '_'));
      continue;
    }
    const row = /^ {4}(\w+): (.+?): ([\d.]+) cm .*limit [\d.]+ cm( OVER)?/.exec(line);
    if (!own || !row) {
      continue;
    }
    rows += 1;
    over += row[4] ? 1 : 0;
    const depth = Number(row[3]);
    if (depth > deepest.depth) {
      deepest = { depth, text: `${row[1]}: ${row[2]}` };
    }
  }
  if (rows === 0) {
    return `no row of a player of the ${animal}`;
  }
  return `${over} of ${rows} rows over the limit, deepest ${deepest.depth.toFixed(1)} cm (${deepest.text})`;
}

/**
 * Gives the summary line of a probe log.
 *
 * @param probe The probe.
 * @param text The log.
 * @param animal The animal.
 * @returns The line.
 */
function probeSummary(probe: ProbeName, text: string, animal: string): string {
  return probe === 'fold' ? foldSummary(text) : depthSummary(text, animal);
}

/**
 * Gives the cells of a folder of close views in the order of the moments and the views: the order
 * of `--moments` and `--views` when the command line gives them, else the order of the files.
 *
 * @param dir The folder.
 * @param role The role.
 * @param args The command line.
 * @returns The moments, the views, and the file of each moment and view.
 */
function cellsOf(
  dir: string,
  role: string,
  args: TrialArgs,
): { moments: string[]; views: string[]; files: Map<string, string> } {
  const pattern = new RegExp(`^${role.replace(/[-.]/g, '\\$&')}-(.+)-(az-?\\d+|[a-z]+)\\.png$`);
  const found = readdirSync(dir)
    .flatMap((name) => {
      const match = pattern.exec(name);
      return match?.[1] && match[2] && !name.endsWith('-views.png') && !name.startsWith('pair-')
        ? [{ moment: match[1], view: match[2], path: join(dir, name) }]
        : [];
    })
    .toSorted((a, b) => statSync(a.path).mtimeMs - statSync(b.path).mtimeMs);
  const files = new Map(found.map((cell) => [`${cell.moment}|${cell.view}`, cell.path]));
  const asView = (name: string): string => (/^-?\d+$/.test(name) ? `az${name}` : name);
  const moments = args.options.get('--moments')?.split(',') ?? [
    ...new Set(found.map((c) => c.moment)),
  ];
  const views = args.options.get('--views')?.split(',').map(asView) ?? [
    ...new Set(found.map((c) => c.view)),
  ];
  return { moments, views, files };
}

/**
 * Writes the pair image of two trials: for each moment, the views of the other trial in a row,
 * and the views of this trial in the row below, each cell with its label. The cells keep their
 * pixels, so `--scale 2` with `--crop` gives a close crop.
 *
 * @param args The command line.
 * @param other The tag of the other trial.
 * @param out The image file.
 */
async function writePair(args: TrialArgs, other: string, out: string): Promise<void> {
  const own = join(ROOT, 'reports', 'trials', args.animal, args.tag);
  const theirs = join(ROOT, 'reports', 'trials', args.animal, other);
  if (!existsSync(theirs)) {
    stop(`The trial ${other} has no views in ${shown(theirs)}.`);
  }
  const mine = cellsOf(own, args.role, args);
  const them = cellsOf(theirs, args.role, args);
  const rows: { label: string; cells: (string | null)[] }[] = [];
  for (const moment of mine.moments) {
    for (const [tag, cells] of [
      [other, them],
      [args.tag, mine],
    ] as const) {
      const files = mine.views.map((view) => cells.files.get(`${moment}|${view}`) ?? null);
      rows.push({ label: `${tag} ${moment}`, cells: files });
    }
  }
  const crop = (args.options.get('--crop') ?? '0,0,1,1').split(',').map(Number);
  if (crop.length !== 4 || crop.some((v) => !(v >= 0 && v <= 1))) {
    stop('The option --crop takes x0,y0,x1,y1 as shares of a cell from 0 to 1.');
  }

  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const images = rows.map((row) =>
      row.cells.map((file) =>
        file ? `data:image/png;base64,${readFileSync(file).toString('base64')}` : null,
      ),
    );
    const dataUrl = await page.evaluate(
      async ({ images, labels, views, box }) => {
        const loaded = await Promise.all(
          images.map((row) =>
            Promise.all(
              row.map(async (source) => {
                if (!source) {
                  return null;
                }
                const image = new Image();
                image.src = source;
                await image.decode();
                return image;
              }),
            ),
          ),
        );
        const first = loaded.flat().find((image) => image);
        if (!first) {
          throw new Error('The pair has no cell.');
        }
        const [x0 = 0, y0 = 0, x1 = 1, y1 = 1] = box;
        const sw = (x1 - x0) * first.naturalWidth;
        const sh = (y1 - y0) * first.naturalHeight;
        const width = Math.round(sw);
        const height = Math.round(sh);
        const gap = 6;
        const canvas = document.createElement('canvas');
        canvas.width = views.length * width + (views.length - 1) * gap;
        canvas.height = loaded.length * height + (loaded.length / 2 - 1) * gap * 3;
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('The canvas has no 2D context.');
        }
        context.fillStyle = '#1b1b1f';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.font = '15px sans-serif';
        for (const [r, row] of loaded.entries()) {
          const y = r * height + Math.floor(r / 2) * gap * 3;
          for (const [c, image] of row.entries()) {
            const x = c * (width + gap);
            if (image) {
              const sx = x0 * image.naturalWidth;
              const sy = y0 * image.naturalHeight;
              context.drawImage(image, sx, sy, sw, sh, x, y, width, height);
            }
            const text = `${labels[r] ?? ''} ${views[c] ?? ''}${image ? '' : ' (none)'}`;
            context.fillStyle = 'rgba(0, 0, 0, 0.7)';
            context.fillRect(x, y, context.measureText(text).width + 12, 24);
            context.fillStyle = r % 2 === 0 ? '#9fd3ff' : '#ffe14d';
            context.fillText(text, x + 6, y + 17);
          }
        }
        return canvas.toDataURL('image/png');
      },
      {
        images,
        labels: rows.map((row) => row.label),
        views: mine.views,
        box: crop,
      },
    );
    writeFileSync(out, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
  } finally {
    await browser.close();
  }
}

/**
 * Runs a trial.
 *
 * @param args The command line.
 */
async function runTrial(args: TrialArgs): Promise<void> {
  const dir = trialDir(args.animal);
  const blend = join(dir, `${args.tag}.blend`);
  const glb = join(dir, `${args.tag}.rig.glb`);
  const views = join(ROOT, 'reports', 'trials', args.animal, args.tag);
  const start = performance.now();
  mkdirSync(dir, { recursive: true });
  // A failed trial leaves no record, so that no later trial or apply reads an old one.
  rmSync(join(dir, `${args.tag}.json`), { force: true });

  let time = performance.now();
  const { base, bytes } = baseOf(args);
  writeFileSync(blend, bytes);
  report('copy', (performance.now() - time) / 1000, `${base.kind} ${base.name} -> ${shown(blend)}`);

  if (args.step) {
    const step = await blender(
      'rig_trial.py',
      [blend, args.step, ...args.stepArgs],
      join(dir, `${args.tag}.step.log`),
    );
    for (const line of linesOf(step.text, ['step: ', 'rig_trial: error'])) {
      console.log(`  ${line}`);
    }
    if (step.code !== 0) {
      stop(`The step failed. Log: ${shown(join(dir, `${args.tag}.step.log`))}`);
    }
    report('step', step.seconds, `${shown(args.step)} ${args.stepArgs.join(' ')}`);
  }

  const exported = await blender(
    'export_rig.py',
    [args.animal, '--blend', blend, '--out', glb],
    join(dir, `${args.tag}.export.log`),
  );
  if (exported.code !== 0) {
    console.log(linesOf(exported.text, ['export_rig: error']).join('\n'));
    stop(`The export failed. Log: ${shown(join(dir, `${args.tag}.export.log`))}`);
  }
  report('export', exported.seconds, `${shown(glb)}, ${shown(glb.replace(/\.glb$/, '.json'))}`);

  rmSync(views, { recursive: true, force: true });
  mkdirSync(views, { recursive: true });
  const viewArgs = [args.role, views, '--glb', glb];
  for (const name of ['--moments', '--views', '--scale', '--elevation']) {
    const value = args.options.get(name);
    if (value !== undefined) {
      viewArgs.push(name, value);
    }
  }
  // The views and the probes run at the same time. A failure stops the tool after each child
  // ends, so that no child keeps running.
  let failed = '';
  const jobs: Promise<void>[] = [
    runLogged('node', ['tools/close-views.ts', ...viewArgs], join(views, 'views.log')).then(
      (ended) => {
        if (ended.code === 0) {
          report('views', ended.seconds, `${shown(views)}/`);
        } else {
          failed = `The close views failed. Log: ${shown(join(views, 'views.log'))}`;
        }
      },
    ),
  ];
  for (const probe of args.probes) {
    const command = await probeCommand(probe, args, glb);
    const log = join(views, `${probe}.log`);
    jobs.push(
      runLogged('node', command, log).then((ended) => {
        const text = ended.code === 0 ? probeSummary(probe, ended.text, args.animal) : 'failed';
        report(probe, ended.seconds, `${text} (${shown(log)})`);
      }),
    );
  }
  await Promise.all(jobs);
  if (failed) {
    stop(failed);
  }

  const other = args.options.get('--pair');
  if (other !== undefined) {
    time = performance.now();
    const out = join(views, `pair-${other}.png`);
    await writePair(args, other, out);
    report('pair', (performance.now() - time) / 1000, shown(out));
    for (const probe of args.probes) {
      const log = join(ROOT, 'reports', 'trials', args.animal, other, `${probe}.log`);
      if (existsSync(log)) {
        const text = probeSummary(probe, readFileSync(log, 'utf8'), args.animal);
        console.log(`        ${probe} of ${other}: ${text}`);
      }
    }
  }

  const record: TrialRecord = {
    animal: args.animal,
    role: args.role,
    tag: args.tag,
    base,
    step: args.step ? shown(args.step) : null,
    stepSha256: args.step ? fileSha256(args.step) : null,
    args: args.stepArgs,
    glbSha256: fileSha256(glb),
  };
  writeFileSync(join(dir, `${args.tag}.json`), `${JSON.stringify(record, null, 1)}\n`);
  report(
    'total',
    (performance.now() - start) / 1000,
    `apply: pnpm rig-trial ${args.animal} --apply ${args.tag}`,
  );
}

/**
 * Gives the chain of a trial: the records from the first trial on the `.blend` of the animal to
 * the trial.
 *
 * @param animal The animal.
 * @param tag The tag of the last trial.
 * @returns The records, the first trial first.
 */
function chainOf(animal: string, tag: string): TrialRecord[] {
  const chain: TrialRecord[] = [];
  let record = readRecord(animal, tag);
  for (;;) {
    if (chain.some((seen) => seen.tag === record.tag)) {
      stop(`The bases of the trial ${tag} make a loop.`);
    }
    chain.unshift(record);
    if (record.base.kind === 'rig') {
      return chain;
    }
    if (record.base.kind !== 'trial') {
      stop(
        `The trial ${record.tag} starts from the ${record.base.kind} ${record.base.name}, and not from ${shown(rigBlend(animal))}. Only a trial on the hand rig can apply.`,
      );
    }
    record = readRecord(animal, record.base.name);
  }
}

/**
 * Runs the steps of the chain of a trial on the `.blend` of the animal, exports it, and keeps the
 * result only when the GLB file is the same as the GLB file of the trial.
 *
 * @param animal The animal.
 * @param tag The tag of the trial.
 */
async function applyTrial(animal: string, tag: string): Promise<void> {
  const chain = chainOf(animal, tag);
  const blend = rigBlend(animal);
  const [first] = chain;
  if (!first || fileSha256(blend) !== first.base.sha256) {
    stop(`${shown(blend)} changed after the trial ${first?.tag ?? tag}. Run the trials again.`);
  }
  for (const record of chain) {
    if (record.step && fileSha256(join(ROOT, record.step)) !== record.stepSha256) {
      stop(`The step ${record.step} changed after the trial ${record.tag}. Run the trials again.`);
    }
  }
  const glb = join(ROOT, 'assets', 'models', animal, `${animal}.rig.glb`);
  const summary = glb.replace(/\.glb$/, '.json');
  const keep = join(trialDir(animal), 'apply-backup');
  mkdirSync(keep, { recursive: true });
  const files = [blend, glb, summary].filter((file) => existsSync(file));
  for (const file of files) {
    copyFileSync(file, join(keep, relative(join(ROOT, 'assets', 'models', animal), file)));
  }
  const putBack = (why: string): never => {
    for (const file of files) {
      copyFileSync(join(keep, relative(join(ROOT, 'assets', 'models', animal), file)), file);
    }
    return stop(`${why} The .blend, the GLB file, and the summary of before are back.`);
  };

  for (const record of chain) {
    if (!record.step) {
      continue;
    }
    const log = join(trialDir(animal), `${tag}.apply.log`);
    const step = await blender(
      'rig_trial.py',
      [blend, join(ROOT, record.step), ...record.args],
      log,
    );
    if (step.code !== 0) {
      putBack(`The step of ${record.tag} failed. Log: ${shown(log)}.`);
    }
    report('step', step.seconds, `${record.tag}: ${record.step} ${record.args.join(' ')}`);
  }
  const exported = await blender(
    'export_rig.py',
    [animal],
    join(trialDir(animal), `${tag}.apply.log`),
  );
  if (exported.code !== 0) {
    putBack('The export failed.');
  }
  const last = chain[chain.length - 1];
  if (!last || fileSha256(glb) !== last.glbSha256) {
    putBack(`The GLB file differs from the GLB file of the trial ${tag}.`);
  }
  report('export', exported.seconds, `${shown(glb)}: the same bytes as the trial ${tag}`);
  console.log(`Next: pnpm studio-body ${animal}, and add each call to the rows of the README.md:`);
  for (const record of chain.filter((r) => r.step)) {
    console.log(`  ${record.step} ${record.args.join(' ')}`);
  }
}

/** Runs the command line. */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--apply');
  if (at >= 0) {
    const [animal] = argv;
    const tag = argv[at + 1];
    if (!animal || !tag || argv.length !== 3 || at !== 1) {
      stop(USAGE);
    }
    await applyTrial(animal, tag);
    return;
  }
  await runTrial(trialArgs(argv));
}

if (import.meta.main) {
  await main();
}

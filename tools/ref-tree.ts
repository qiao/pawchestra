/**
 * Puts the tree of a commit into a temporary folder, so that a tool can compare the working tree
 * with a commit, a branch, or a tag (`--base <ref>` of `pnpm body-probe`, `pnpm pose-depth`,
 * `pnpm hold-fit`, `pnpm size`, and `pnpm close-views`). The probes of `pnpm hold-fit`,
 * `pnpm pose-depth`, and `pnpm fold-probe` keep the JSON text of the commit in a cache by tree
 * (`baseCacheFile()`).
 */
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve as resolvePath,
  sep,
} from 'node:path';

/** The repository root. */
export const ROOT = join(import.meta.dirname, '..');

/**
 * Gives the cause of a failure from the error output of a command: the lines before the first
 * line of the stack, such as the place, the line of code, and the message of a `SyntaxError`.
 *
 * @param errors The error output.
 * @returns The lines before the stack, or all lines when there is no stack.
 */
export function errorCause(errors: string): string {
  const lines = errors.trim().split('\n');
  const stack = lines.findIndex((line) => /^\s+at /.test(line));
  return (stack > 0 ? lines.slice(0, stack) : lines).join('\n').trim();
}

/**
 * Runs a command, and stops on a failure.
 *
 * @param command The command.
 * @param args The arguments.
 * @param cwd The folder of the command.
 * @throws Error if the command fails, with the cause from its error output. After INT or TERM, the
 *   tool removes each temporary folder and exits.
 */
export function run(command: string, args: readonly string[], cwd: string): void {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.signal === 'SIGINT' || result.signal === 'SIGTERM') {
    // The signal of a stop reached the command too. The stop listener of withRefTree() waits for
    // the event loop, so the tool stops here.
    stopNow(result.signal);
  }
  if (result.status !== 0) {
    const reason = result.error?.message ?? errorCause(result.stderr);
    throw new Error(`${command} ${args.join(' ')} failed: ${reason}`);
  }
}

/** The child processes of {@link runChild} that run now. A stop ends them first. */
const running = new Set<ChildProcess>();

/** The end of a child process of {@link runChildren}. */
export interface ChildEnd {
  /** The exit code, or `null` when a signal ended the child. */
  readonly status: number | null;
  /** The error output of the child. */
  readonly errors: string;
}

/** A child process of {@link spawnTracked} and the promise of its end. */
interface TrackedChild {
  /** The child process. */
  readonly child: ChildProcess;
  /** A promise of the end of the child, which rejects only when the command cannot start. */
  readonly ended: Promise<ChildEnd>;
}

/**
 * Starts a command in a process group of its own, and keeps the child in the set that a stop ends
 * until the child ends.
 *
 * @param command The command.
 * @param args The arguments.
 * @param cwd The folder of the command.
 * @returns The child and the promise of its end.
 */
function spawnTracked(command: string, args: readonly string[], cwd: string): TrackedChild {
  const child = spawn(command, args, {
    cwd,
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  running.add(child);
  const ended = new Promise<ChildEnd>((resolve, reject) => {
    let errors = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (text: string) => {
      errors += text;
    });
    child.on('error', (error) => {
      running.delete(child);
      reject(error);
    });
    child.on('close', (status) => {
      running.delete(child);
      resolve({ status, errors });
    });
  });
  return { child, ended };
}

/** A child process of {@link startChild} and the promise of its end. */
interface StartedChild {
  /** The child process. */
  readonly child: ChildProcess;
  /** A promise that resolves when the command ends with no failure. */
  readonly done: Promise<void>;
}

/**
 * Starts a command in a process group of its own, as {@link runChild} does, and gives the child
 * with the promise of its end. A failure gives the exit code, or the end by a signal, and the
 * cause from the error output, or `no error output`.
 *
 * @param command The command.
 * @param args The arguments.
 * @param cwd The folder of the command.
 * @returns The child and the promise of its end.
 */
function startChild(command: string, args: readonly string[], cwd: string): StartedChild {
  const { child, ended } = spawnTracked(command, args, cwd);
  const done = ended.then(({ status, errors }) => {
    if (status !== 0) {
      const end = status === null ? 'a signal ended it' : `exit code ${status}`;
      const cause = errorCause(errors) || 'no error output';
      throw new Error(`${command} ${args.join(' ')} failed (${end}):\n${cause}`);
    }
  });
  return { child, done };
}

/** A promise that never settles: the end of a child that a stop ended, for its caller. */
const NEVER = new Promise<never>(() => undefined);

/** One command of {@link runChildren}. */
interface ChildRun {
  /** The command. */
  readonly command: string;
  /** The arguments. */
  readonly args: readonly string[];
  /** The folder of the command. */
  readonly cwd: string;
}

/**
 * Starts commands at the same time, each in a process group of its own as {@link runChild} does,
 * and gives a promise of the exit code and the error output of each. An exit code other than 0 is
 * no failure, such as the code of a test run with a failed test. All children start before the
 * first `await`. When one command cannot start, the other children end first, and the promise
 * rejects, so that no child stays as an orphan. A stop of {@link withRefTree} ends the group of
 * each child first. Then the promise never settles, so the caller starts no work after the stop,
 * and the stop ends the tool.
 *
 * @param runs The commands.
 * @returns A promise of the end of each child, in the order of the commands.
 * @throws Error if a command cannot start, after the other children end.
 */
export async function runChildren(runs: readonly ChildRun[]): Promise<ChildEnd[]> {
  const started = runs.map(({ command, args, cwd }) => spawnTracked(command, args, cwd));
  const ends = await Promise.allSettled(
    started.map(({ child, ended }) =>
      ended.catch(async (error: Error) => {
        await Promise.all(
          started.filter((other) => other.child !== child).map((other) => endChild(other.child)),
        );
        throw error;
      }),
    ),
  );
  if (stopping) {
    return NEVER;
  }
  return ends.map((end) => {
    if (end.status === 'rejected') {
      throw end.reason;
    }
    return end.value;
  });
}

/**
 * Starts a command, and gives a promise of its end. The command runs beside the code of the
 * caller, in a process group of its own. Thus Ctrl-C does not stop it in the middle of a write
 * into a temporary folder. The stop of {@link withRefTree} ends its group first.
 *
 * @param command The command.
 * @param args The arguments.
 * @param cwd The folder of the command.
 * @returns A promise that resolves when the command ends with no failure.
 */
export function runChild(command: string, args: readonly string[], cwd: string): Promise<void> {
  return startChild(command, args, cwd).done;
}

/**
 * Ends the process group of a child, and waits for the end of the child: TERM first, and KILL
 * after 5 s.
 *
 * @param child The child process of {@link runChild}.
 * @returns A promise that resolves when the child has ended.
 */
function endChild(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (child.exitCode !== null || child.signalCode !== null || pid === undefined) {
    return Promise.resolve();
  }

  const signal = (name: NodeJS.Signals): void => {
    try {
      process.kill(-pid, name);
    } catch {
      // The group has ended.
    }
  };
  return new Promise((resolve) => {
    const kill = setTimeout(() => signal('SIGKILL'), 5000);
    child.once('close', () => {
      clearTimeout(kill);
      resolve();
    });
    signal('SIGTERM');
  });
}

/** The temporary folders of {@link withRefTree} that exist now. */
const held = new Set<string>();

/**
 * Removes each temporary folder of {@link withRefTree} that exists now. The exit of the process
 * calls it too, also after an error.
 */
function removeHeld(): void {
  for (const dir of held) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  held.clear();
}

process.on('exit', removeHeld);

/** The stop that runs, or `null`. A second signal during a stop starts no second stop. */
let stopping: Promise<void> | null = null;

/**
 * Stops the tool after INT or TERM: ends the process group of each child of {@link runChild},
 * waits for them, removes each temporary folder, and exits with 128 plus the number of the
 * signal. The listener stays during the stop, because `pnpm` sends a second INT to the tool after
 * the INT of the terminal, and with no listener that INT ends the process at once.
 *
 * @param signal The signal.
 */
function stopAfter(signal: NodeJS.Signals): void {
  stopping ??= (async (): Promise<void> => {
    await Promise.all([...running].map(endChild));
    removeHeld();
    process.exit(signal === 'SIGINT' ? 130 : 143);
  })();
}

/**
 * Stops the tool at once after INT or TERM during a synchronous command: sends TERM to the group
 * of each child of {@link runChild}, removes each temporary folder, and exits with 128 plus the
 * number of the signal.
 *
 * @param signal The signal.
 */
function stopNow(signal: NodeJS.Signals): never {
  for (const child of running) {
    if (child.pid !== undefined) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        // The group has ended.
      }
    }
  }
  removeHeld();
  process.exit(signal === 'SIGINT' ? 130 : 143);
}

/** The options of {@link withRefTree}. */
interface RefTreeOptions extends TempFolderOptions {
  /** The paths of the commit to extract. The default is the whole tree. */
  readonly paths?: readonly string[];
}

/** The options of {@link withTempFolder}. */
interface TempFolderOptions {
  /** The folder that holds the temporary folder. The default is the temporary folder of the OS. */
  readonly parent?: string;
  /** The start of the name of the temporary folder, such as `body-probe-`. */
  readonly prefix?: string;
}

/**
 * Makes a new temporary folder, and gives it to a function. The start of the function runs before
 * the first `await`, so a child process that the function starts at once runs beside the code of
 * the caller. The folder goes away at the end, also after a failure or a stop (INT or TERM). A
 * stop first ends each child of {@link runChild} and waits for it, so that no child writes into
 * the folder during its removal.
 *
 * @param use The function that reads the folder.
 * @param options The parent folder and the start of the name.
 * @returns The result of the function.
 * @throws Error if the function fails.
 */
export async function withTempFolder<T>(
  use: (dir: string) => Promise<T>,
  options: TempFolderOptions = {},
): Promise<T> {
  const dir = mkdtempSync(join(options.parent ?? tmpdir(), options.prefix ?? 'ref-'));
  held.add(dir);
  const stop = (signal: NodeJS.Signals): void => {
    stopAfter(signal);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    return await use(dir);
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    held.delete(dir);
  }
}

/**
 * Extracts the tree of a commit into a new temporary folder of {@link withTempFolder}, and gives
 * the folder to a function. The extraction and the start of the function run before the first
 * `await`. The folder goes away at the end, also after a failure or a stop (INT or TERM).
 *
 * @param ref The commit, a branch, or a tag.
 * @param use The function that reads the folder.
 * @param options The parent folder, the start of the name, and the paths.
 * @returns The result of the function.
 * @throws Error if git does not know the ref, or the function fails.
 */
export function withRefTree<T>(
  ref: string,
  use: (dir: string) => Promise<T>,
  options: RefTreeOptions = {},
): Promise<T> {
  return withTempFolder(
    (dir) => {
      run(
        'git',
        ['archive', '--output', join(dir, 'ref.tar'), ref, ...(options.paths ?? [])],
        ROOT,
      );
      run('tar', ['-xf', 'ref.tar'], dir);
      rmSync(join(dir, 'ref.tar'));
      return use(dir);
    },
    { prefix: 'ref-', ...options },
  );
}

/**
 * The paths of a commit that a probe of the code of the commit reads: the source, the demos, the
 * rules of the demo patches, and the tools. The tools of the commit fit its source, such as the
 * export of the bodies of `tools/body-module.ts`, which a newer tool can import from a
 * newer source.
 */
const PROBE_PATHS: readonly string[] = [
  'src',
  'package.json',
  'demos/src',
  'demos/patches.json',
  'demos/README.md',
  'tools',
];

/**
 * Gives the scripts of `tools/` of the working tree that a probe of a commit copies: each script
 * that is not a test and that the commit does not have, such as a new probe of the working tree.
 *
 * @param files The names of the files of `tools/` of the working tree.
 * @param own The names of the files of `tools/` of the commit.
 * @returns The names of the scripts to copy, in their order.
 */
export function probeScripts(files: readonly string[], own: readonly string[]): string[] {
  return files.filter(
    (file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && !own.includes(file),
  );
}

/** A table of roles of a tool, which a probe of a commit checks for its role. */
export interface RefRole {
  /** The role of the probe, such as `flutist`. */
  readonly name: string;
  /** The module of the table, relative to the tree, such as `tools/fold-probe.ts`. */
  readonly module: string;
  /** The exported table of the roles: a `Map` or an object with a key for each role. */
  readonly table: string;
}

/** The options of {@link withProbeTree}. */
interface ProbeTreeOptions {
  /** The folder that holds the temporary folder. The default is the temporary folder of the OS. */
  readonly parent?: string;
  /** The start of the name of the temporary folder, such as `body-probe-`. */
  readonly prefix: string;
  /** The role of the probe, which the commit must have ({@link checkRefRole}). */
  readonly role?: RefRole;
  /**
   * True to keep the JSON text of the probe of the commit in the cache of {@link baseCacheFile},
   * and to read it in place of a new probe of the commit when the key is the same.
   */
  readonly cache?: boolean;
  /**
   * The cache file of the JSON text of the probe of the working tree ({@link treeCacheFile}), or
   * none. {@link probeBeside} reads the file in place of a new probe of the working tree, and
   * writes a new text into it.
   */
  readonly treeCache?: string | null;
  /**
   * The scripts of `tools/` of the working tree that replace the scripts of the commit in the
   * folder of {@link withProbeTree}, such as the gate of `pnpm arm-check --states`, or none.
   */
  readonly scripts?: readonly string[];
}

/**
 * Reads the keys of a table of roles of a tree in a child process, so that the code of the commit
 * stays out of the process of the tool.
 *
 * @param dir The folder of the tree.
 * @param role The module and the table.
 * @returns The keys, or `null` when the tree has no such module or table, or the import fails.
 *   After INT or TERM, the tool removes each temporary folder and exits, as {@link run} does.
 */
export function refRoleKeys(dir: string, role: RefRole): string[] | null {
  const code = [
    `const table = (await import(${JSON.stringify(`./${role.module}`)}))[${JSON.stringify(role.table)}];`,
    'if (!table) { process.exit(2); }',
    'process.stdout.write(JSON.stringify(table instanceof Map ? [...table.keys()] : Object.keys(table)));',
  ].join('\n');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: dir,
    encoding: 'utf8',
  });
  if (result.signal === 'SIGINT' || result.signal === 'SIGTERM') {
    // The signal of a stop reached the child too, as in run(). The tool stops here, so that no
    // probe starts after the stop.
    stopNow(result.signal);
  }
  if (result.status !== 0) {
    return null;
  }
  // SAFETY: the child writes a JSON list of the keys of the table.
  const keys = JSON.parse(result.stdout) as unknown[];
  return keys.map(String);
}

/**
 * Checks that the tree of a commit has the role of a probe, before the probe starts.
 *
 * @param dir The folder of the tree of the commit.
 * @param ref The commit, a branch, or a tag, for the message.
 * @param role The role and its table.
 * @throws Error if the table of the commit has no such role. A tree with no such table passes,
 *   and the probe of the commit gives its own failure.
 */
function checkRefRole(dir: string, ref: string, role: RefRole): void {
  const keys = refRoleKeys(dir, role);
  if (keys && !keys.includes(role.name)) {
    throw new Error(
      `The ref ${ref} has no role ${role.name}. Its roles are: ${keys.join(', ') || 'none'}.`,
    );
  }
}

/**
 * Extracts {@link PROBE_PATHS} of a commit into a new temporary folder with {@link withRefTree},
 * and gives the folder to a function. The tools come from the commit, so that each tool runs on
 * the source that it fits. The folder also gets a copy of each script of `tools/` of the working
 * tree that the commit does not have ({@link probeScripts}) and of each script of `options.scripts`, and a
 * link to the `node_modules` of the repository. The folder is also an empty git repository (`git init`), so that a git command
 * of a tool of the commit works there, such as {@link probeCacheDir}. The caches and the times
 * that such a tool writes go away with the folder. With a role, the commit must have it
 * ({@link checkRefRole}). Thus a tool runs there, in a child process of {@link runChild}, on the
 * code and the demos of the commit. The copy and the start of the function run before the first
 * `await`, so the child runs beside the code of the caller. The folder goes away at the end, also
 * after a failure or a stop (INT or TERM).
 *
 * @param ref The commit, a branch, or a tag.
 * @param use The function that runs the probe in the folder.
 * @param options The parent folder, the start of the name, and the role.
 * @returns The result of the function.
 * @throws Error if git does not know the ref, if the commit has no role of the options, or if the
 *   function fails.
 */
export function withProbeTree<T>(
  ref: string,
  use: (dir: string) => Promise<T>,
  options: ProbeTreeOptions,
): Promise<T> {
  const tree: RefTreeOptions = options.parent
    ? { parent: options.parent, prefix: options.prefix, paths: PROBE_PATHS }
    : { prefix: options.prefix, paths: PROBE_PATHS };
  return withRefTree(
    ref,
    (dir) => {
      const own = readdirSync(join(dir, 'tools'));
      for (const file of probeScripts(readdirSync(join(ROOT, 'tools')), own)) {
        copyFileSync(join(ROOT, 'tools', file), join(dir, 'tools', file));
      }
      for (const file of options.scripts ?? []) {
        copyFileSync(join(ROOT, 'tools', file), join(dir, 'tools', file));
      }
      symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
      run('git', ['init', '--quiet'], dir);
      if (options.role) {
        checkRefRole(dir, ref, options.role);
      }
      return use(dir);
    },
    tree,
  );
}

/** The arguments of the two children of {@link probeBeside}. */
interface BesideArgs {
  /** The arguments of the script on the code of the commit. */
  readonly base: readonly string[];
  /** The arguments of the script on the working tree. */
  readonly tree: readonly string[];
}

/** The output files of the two children of {@link probeBeside}. */
interface BesideTexts {
  /** The text of the file of the script on the code of the commit. */
  readonly base: string;
  /** The text of the file of the script on the working tree. */
  readonly tree: string;
}

/**
 * The format of the JSON text of a probe that a `--base` compare reads. The rule of the versions:
 *
 * - A change that removes a field, renames it, or changes its meaning or its unit takes the next
 *   version, and sets `since` to that new version.
 * - A change that only adds fields, also inside a nested object, takes the next version, and keeps
 *   `since`.
 * - Thus each version from `since` to `version` holds the fields of the version `since`, with the
 *   same meaning. A reader ignores each field that it does not know, and gives `-` for a field of
 *   its version that an older text does not have.
 */
interface ProbeFormat {
  /** The format version: the field `version`, or 1 for a text with no field. */
  readonly version: number;
  /**
   * The oldest format version that this version only adds fields to: the field `since`, or the
   * version for a text with no field `since`, such as the text of a commit before the field.
   */
  readonly since: number;
}

/**
 * Gives the format of the JSON text of a probe: its fields `version` and `since`
 * ({@link ProbeFormat}).
 *
 * @param text The JSON text of one object.
 * @returns The format.
 * @throws Error if the text holds no object, a version that is not a whole number above 0, or a
 *   `since` that is not a whole number from 1 to the version.
 */
function probeFormat(text: string): ProbeFormat {
  // SAFETY: the text comes from the --json output of a probe, and the checks below read the fields.
  const parsed = JSON.parse(text) as {
    readonly version?: unknown;
    readonly since?: unknown;
  } | null;
  if (!(parsed instanceof Object)) {
    throw new Error('The JSON text of the probe holds no object.');
  }
  const version = parsed.version ?? 1;
  if (!Number.isInteger(version) || Number(version) < 1) {
    throw new Error(`The JSON text of the probe has the version ${String(version)}.`);
  }
  const since = parsed.since ?? version;
  if (!Number.isInteger(since) || Number(since) < 1 || Number(since) > Number(version)) {
    throw new Error(
      `The JSON text of the probe has the version ${String(version)} and the field since ${String(since)}, which must be a whole number from 1 to the version.`,
    );
  }
  return { version: Number(version), since: Number(since) };
}

/**
 * Gives the format version of the JSON text of a probe: its field `version` ({@link probeFormat}).
 * Each probe that a `--base` compare reads writes the version of its format.
 *
 * @param text The JSON text of one object.
 * @returns The version.
 * @throws Error if the text holds no object, or a version or a `since` that does not fit.
 */
export function formatVersion(text: string): number {
  return probeFormat(text).version;
}

/**
 * Checks that the JSON texts of a probe on a commit and on the working tree can compare, and gives
 * a note when their versions differ. Since 94c6ace9, each side runs its own tool, so a branch that
 * changes a field of a probe would give false differences. Two versions compare when the newer
 * version only adds fields to the older version: its `since` is the older version or lower
 * ({@link ProbeFormat}). When the working tree is newer, its reader gives `-` for each field that
 * the commit does not have. When the commit is newer, the reader of the working tree ignores the
 * fields that it does not know, and the compare shows the fields of the older version.
 *
 * @param script The script of the probe, such as `hold-fit.ts`.
 * @param ref The commit, the branch, or the tag, for the messages.
 * @param base The format of the text of the commit ({@link probeFormat}).
 * @param tree The format of the text of the working tree.
 * @returns A note on the two versions when they differ and compare, or `null` for one version.
 * @throws Error if the newer version changes or removes a field of the older version, with both
 *   versions.
 */
function formatNote(
  script: string,
  ref: string,
  base: ProbeFormat,
  tree: ProbeFormat,
): string | null {
  if (base.version === tree.version) {
    return null;
  }
  const treeNewer = tree.version > base.version;
  const [older, newer] = treeNewer ? [base, tree] : [tree, base];
  if (newer.since > older.version) {
    const range =
      newer.since === newer.version
        ? `the format version ${newer.version}`
        : `a format version from ${newer.since} to ${newer.version}`;
    const fix = treeNewer
      ? `compare with a commit whose tools/${script} writes ${range}`
      : `rebase the working tree onto ${ref}`;
    throw new Error(
      `The JSON of tools/${script} on ${ref} has the format version ${base.version}, and the working tree has the format version ${tree.version}. The field since of the version ${newer.version} is ${newer.since}, so the version ${newer.version} can change or remove a field of the version ${older.version}, and a compare can give false differences. To fix it, ${fix}.`,
    );
  }
  return treeNewer
    ? `The JSON of tools/${script} on the working tree has the format version ${tree.version}, which only adds fields to the version ${base.version} of ${ref}. The compare gives - for each new field on ${ref}.`
    : `The JSON of tools/${script} on ${ref} has the format version ${base.version}, which only adds fields to the version ${tree.version} of the working tree. The compare shows the fields of the version ${tree.version}.`;
}

/**
 * Checks that the JSON texts of a probe on a commit and on the working tree have one format
 * version, for a probe whose texts give no `since` ({@link formatNote} with `since` equal to each
 * version).
 *
 * @param script The script of the probe, such as `body-probe.ts`.
 * @param ref The commit, the branch, or the tag, for the message.
 * @param base The format version of the text of the commit ({@link formatVersion}).
 * @param tree The format version of the text of the working tree.
 * @throws Error if the versions differ, with both versions.
 */
export function checkFormat(script: string, ref: string, base: number, tree: number): void {
  formatNote(script, ref, { version: base, since: base }, { version: tree, since: tree });
}

/**
 * The parts of the cache key of the probe of a commit ({@link baseCacheKey}). The probe of the
 * commit reads only these inputs, so a change of one part gives a new key.
 */
interface BaseKeyParts {
  /** The script of the probe, such as `hold-fit.ts`. */
  readonly script: string;
  /**
   * The entry of each path of {@link PROBE_PATHS} in the commit, as `git ls-tree` writes it: the
   * mode, the kind, and the hash of each path. It holds the tree of the tools of the commit.
   */
  readonly trees: string;
  /**
   * The name and the SHA-256 of each script of the working tree that the probe tree of the commit
   * copies ({@link probeScripts}).
   */
  readonly copies: readonly (readonly [name: string, hash: string])[];
  /** The arguments of the probe of the commit, with no `--json`. */
  readonly args: readonly string[];
  /** The version, the platform, and the architecture of Node. */
  readonly node: string;
  /** The SHA-256 of the lockfile of the installed `node_modules`, or `none` with no install. */
  readonly modules: string;
}

/**
 * Gives the cache key of the probe of a commit: the SHA-256 of its parts.
 *
 * @param parts The parts.
 * @returns The key, in hex.
 */
function baseCacheKey(parts: BaseKeyParts): string {
  const fields = [
    'probe-cache 1',
    parts.script,
    parts.trees,
    parts.copies,
    parts.args,
    parts.node,
    parts.modules,
  ];
  return sha256(JSON.stringify(fields));
}

/** The environment variable that turns off the cache of {@link baseCacheFile} when it is `1`. */
export const PROBE_NO_CACHE = 'PROBE_NO_CACHE';

/**
 * Runs git in the repository, and gives its output.
 *
 * @param args The arguments of git.
 * @returns The output, with no newline at the end.
 * @throws Error if git fails, with its error output.
 */
function gitText(args: readonly string[]): string {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trimEnd();
}

/**
 * Gives the SHA-256 of a text or of bytes.
 *
 * @param data The text or the bytes.
 * @returns The hash, in hex.
 */
export function sha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Gives the SHA-256 of a file.
 *
 * @param path The path of the file.
 * @returns The hash, in hex.
 */
function fileHash(path: string): string {
  return sha256(readFileSync(path));
}

/**
 * Gives the arguments of a probe for its cache key: the arguments, then the SHA-256 of each MIDI
 * file of a `--midi` option. The key then changes when the file at a path changes. A command line
 * with no `--midi` keeps its arguments, and thus its key.
 *
 * @param args The arguments of the probe.
 * @returns The arguments of the key.
 */
function keyArgs(args: readonly string[]): readonly string[] {
  const files = args.filter((...[, i]) => args[i - 1] === '--midi');
  if (files.length === 0) {
    return args;
  }
  return [...args, ...files.map((file) => `midi ${existsSync(file) ? fileHash(file) : 'none'}`)];
}

/**
 * Gives the folder of the caches of the probes: `probe-cache/` in the common folder of git, which
 * each worktree shares.
 *
 * @returns The path of the folder.
 * @throws Error if git fails.
 */
export function probeCacheDir(): string {
  return join(gitText(['rev-parse', '--path-format=absolute', '--git-common-dir']), 'probe-cache');
}

/**
 * Gives the file of the cache of the probe of a commit: `probe-cache/<key>.json` in the common
 * folder of git, which each worktree shares, as the cache of `tools/check-commits.sh` does. The
 * key ({@link baseCacheKey}) holds the trees of {@link PROBE_PATHS} of the commit, the scripts of
 * the working tree that the probe copies, the arguments of the probe with the hash of each MIDI file
 * ({@link keyArgs}), Node, and the lockfile of `node_modules`. A branch that moves to a new commit with new code thus gets a new key, and a
 * commit with a change outside these paths, such as a docs commit, keeps the key.
 *
 * @param ref The commit, a branch, or a tag.
 * @param script The script of the probe, such as `hold-fit.ts`.
 * @param args The arguments of the probe of the commit, with no `--json`.
 * @param scripts The scripts of the working tree that replace the scripts of the commit
 *   (`ProbeTreeOptions.scripts`), which the probe also copies.
 * @returns The path of the file.
 * @throws Error if git does not know the ref.
 */
function baseCacheFile(
  ref: string,
  script: string,
  args: readonly string[],
  scripts: readonly string[] = [],
): string {
  const commit = `${ref}^{commit}`;
  const own = gitText(['ls-tree', '--name-only', commit, 'tools/'])
    .split('\n')
    .map((path) => path.slice('tools/'.length));
  const added = probeScripts(readdirSync(join(ROOT, 'tools')), own);
  const copied = [...added, ...scripts.filter((name) => !added.includes(name))];
  const copies = copied.map((name): readonly [string, string] => [
    name,
    fileHash(join(ROOT, 'tools', name)),
  ]);
  const lock = join(ROOT, 'node_modules', '.pnpm', 'lock.yaml');
  const key = baseCacheKey({
    script,
    trees: gitText(['ls-tree', commit, '--', ...PROBE_PATHS]),
    copies,
    args: keyArgs(args),
    node: `${process.version} ${process.platform} ${process.arch}`,
    modules: existsSync(lock) ? fileHash(lock) : 'none',
  });
  return join(probeCacheDir(), `${key}.json`);
}

/**
 * Gives the trees of the working tree at {@link PROBE_PATHS}, as git would commit them, in the
 * form of `git ls-tree`: git adds the files into a copy of the index, so the index of the
 * repository does not change. Ignored files do not count, and files that git does not track yet
 * count. A change outside these paths, such as a docs commit, keeps the text.
 *
 * @returns The entry of each path, as `git ls-tree` writes it.
 * @throws Error if git fails.
 */
function workingTrees(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tree-key-'));
  try {
    const index = join(dir, 'index');
    copyFileSync(gitText(['rev-parse', '--path-format=absolute', '--git-path', 'index']), index);
    const env = { ...process.env, GIT_INDEX_FILE: index };
    const git = (args: readonly string[]): string => {
      const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', env });
      if (result.status !== 0) {
        throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
      }
      return result.stdout.trim();
    };
    git(['add', '-A', '--', ...PROBE_PATHS]);
    return git(['ls-tree', git(['write-tree']), '--', ...PROBE_PATHS]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Gives the file of the cache of a probe of the working tree: `probe-cache/tree-<key>.json` in the
 * common folder of git, beside the cache of {@link baseCacheFile}. The key holds the trees of the
 * working tree ({@link workingTrees}), the arguments of the probe with the hash of each MIDI file
 * ({@link keyArgs}), Node, and the lockfile of `node_modules`, so each change of a file of {@link PROBE_PATHS} gives a new key.
 *
 * @param script The script of the probe, such as `pose-depth.ts`.
 * @param args The arguments of the probe that its result depends on.
 * @returns The path of the file.
 * @throws Error if git fails.
 */
export function treeCacheFile(script: string, args: readonly string[]): string {
  const lock = join(ROOT, 'node_modules', '.pnpm', 'lock.yaml');
  const fields = [
    'tree-cache 1',
    script,
    workingTrees(),
    keyArgs(args),
    `${process.version} ${process.platform} ${process.arch}`,
    existsSync(lock) ? fileHash(lock) : 'none',
  ];
  const key = sha256(JSON.stringify(fields));
  return join(probeCacheDir(), `tree-${key}.json`);
}

/**
 * Writes the text of a probe into its cache file ({@link baseCacheFile}, {@link treeCacheFile}).
 * The text goes into a part file first, so that a stop or a second run at the same time leaves no
 * half file.
 *
 * @param file The cache file.
 * @param text The JSON text of the probe.
 */
export function storeBase(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const part = `${file}.${process.pid}.part`;
  writeFileSync(part, text);
  renameSync(part, file);
}

/**
 * Runs a script of `tools/` on the code of a commit and on the working tree at the same time,
 * each in a child process of {@link runChild}. The first child runs in the folder of
 * {@link withProbeTree}, and the second child runs in the repository. Each child writes its
 * results into a file of the folder, which the option `--json <file>` names. The caller only
 * waits, so a stop (INT or TERM) ends both children at once, and removes the folder. A failure of
 * one child ends the other child at once, and the error names the child that failed first, with
 * its error output.
 *
 * @param ref The commit, a branch, or a tag.
 * @param script The script, such as `pose-depth.ts`.
 * @param args The arguments of each child, with no `--json`.
 * @param options The parent folder, the start of the name of the folder, and the role.
 * @returns The text of the file of each child.
 * @throws Error if git does not know the ref, or if a child fails. Both children end first.
 */
function probeBoth(
  ref: string,
  script: string,
  args: BesideArgs,
  options: ProbeTreeOptions,
): Promise<BesideTexts> {
  return withProbeTree(
    ref,
    async (dir) => {
      const files = { base: join(dir, 'base.json'), tree: join(dir, 'tree.json') };
      const children = {
        base: startChild(
          process.execPath,
          [join('tools', script), ...args.base, '--json', files.base],
          dir,
        ),
        tree: startChild(
          process.execPath,
          [join('tools', script), ...args.tree, '--json', files.tree],
          ROOT,
        ),
      };
      // A failure of one child ends the other at once, so the report of the failure comes early.
      // The other child then ends with no error output, so the report names the child that
      // failed first.
      const failed: (keyof BesideTexts)[] = [];
      const endOther =
        (own: keyof BesideTexts, other: StartedChild) =>
        async (error: Error): Promise<void> => {
          failed.push(own);
          await endChild(other.child);
          throw error;
        };
      const [base, tree] = await Promise.allSettled([
        children.base.done.catch(endOther('base', children.tree)),
        children.tree.done.catch(endOther('tree', children.base)),
      ]);
      if (base.status === 'rejected' && failed[0] !== 'tree') {
        const reason: unknown = base.reason;
        throw new Error(
          `The probe of ${ref} failed: ${reason instanceof Error ? reason.message : String(reason)}`,
        );
      }
      if (tree.status === 'rejected') {
        const reason: unknown = tree.reason;
        throw new Error(
          `The probe of the working tree failed: ${reason instanceof Error ? reason.message : String(reason)}`,
        );
      }
      return {
        base: await readFile(files.base, 'utf8'),
        tree: await readFile(files.tree, 'utf8'),
      };
    },
    options,
  );
}

/**
 * Runs a script of `tools/` on the working tree alone, in a child process of {@link runChild},
 * which writes its results into a file of a temporary folder ({@link withTempFolder}).
 *
 * @param script The script, such as `pose-depth.ts`.
 * @param args The arguments of the child, with no `--json`.
 * @param options The parent folder and the start of the name of the folder.
 * @returns The text of the file of the child.
 * @throws Error if the child fails.
 */
function probeTree(
  script: string,
  args: readonly string[],
  options: ProbeTreeOptions,
): Promise<string> {
  const folder: TempFolderOptions = options.parent
    ? { parent: options.parent, prefix: options.prefix }
    : { prefix: options.prefix };
  return withTempFolder(async (dir) => {
    const file = join(dir, 'tree.json');
    await runChild(process.execPath, [join('tools', script), ...args, '--json', file], ROOT);
    return await readFile(file, 'utf8');
  }, folder);
}

/**
 * Runs a script of `tools/` on the code of a commit alone, in a child process of {@link runChild}
 * in the folder of {@link withProbeTree}, which writes its results into a file of the folder.
 *
 * @param ref The commit, a branch, or a tag.
 * @param script The script, such as `arm-check.ts`.
 * @param args The arguments of the child, with no `--json`.
 * @param options The parent folder, the start of the name of the folder, and the role.
 * @returns The text of the file of the child.
 * @throws Error if git does not know the ref, or if the child fails.
 */
export function probeRef(
  ref: string,
  script: string,
  args: readonly string[],
  options: ProbeTreeOptions,
): Promise<string> {
  return withProbeTree(
    ref,
    async (dir) => {
      const file = join(dir, 'base.json');
      try {
        await runChild(process.execPath, [join('tools', script), ...args, '--json', file], dir);
      } catch (error) {
        throw new Error(
          `The probe of ${ref} failed: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
      return await readFile(file, 'utf8');
    },
    options,
  );
}

/**
 * Runs a script of `tools/` on the code of a commit and on the working tree at the same time,
 * each in a child process, and gives the JSON text of each (`--json <file>` of the script). A stop
 * (INT or TERM) ends both children at once, and removes the temporary folder. A failure of one
 * child ends the other child at once.
 *
 * With `options.cache`, the text of the commit goes into its cache file ({@link baseCacheFile}),
 * and a run with the same key reads that file, prints `base: cached`, and runs only the working
 * tree. With `options.treeCache`, the text of the working tree goes into that file in the same
 * way, and a run that finds the file prints `tree: cached` and runs only the commit. The variable
 * {@link PROBE_NO_CACHE} set to `1` runs both trees again.
 *
 * The two texts must have one format version, or a newer version that only adds fields to the
 * older version. Then the tool prints the note of {@link formatNote}.
 *
 * @param ref The commit, a branch, or a tag.
 * @param script The script, such as `pose-depth.ts`.
 * @param args The arguments of each child, with no `--json`.
 * @param options The parent folder, the start of the name of the folder, the role, and the cache.
 * @returns The text of the file of each child.
 * @throws Error if git does not know the ref, if a child fails, or if the newer format version
 *   of the two texts changes or removes a field of the older version. Both children end first.
 */
export async function probeBeside(
  ref: string,
  script: string,
  args: BesideArgs,
  options: ProbeTreeOptions,
): Promise<BesideTexts> {
  const cache =
    options.cache && process.env[PROBE_NO_CACHE] !== '1'
      ? baseCacheFile(ref, script, args.base, options.scripts)
      : null;
  const cached = cache && existsSync(cache) ? readFileSync(cache, 'utf8') : null;
  const treeFile = process.env[PROBE_NO_CACHE] === '1' ? null : (options.treeCache ?? null);
  const treeCached = treeFile && existsSync(treeFile) ? readFileSync(treeFile, 'utf8') : null;
  if (cache && cached !== null) {
    console.log(`base: cached (${ref}, ${basename(cache, '.json').slice(0, 12)})`);
  }
  if (treeFile && treeCached !== null) {
    console.log(`tree: cached (${basename(treeFile, '.json').slice(5, 17)})`);
  }
  let texts: BesideTexts;
  if (cached !== null) {
    texts = { base: cached, tree: treeCached ?? (await probeTree(script, args.tree, options)) };
  } else if (treeCached !== null) {
    texts = { base: await probeRef(ref, script, args.base, options), tree: treeCached };
  } else {
    texts = await probeBoth(ref, script, args, options);
  }
  if (cache && cached === null) {
    storeBase(cache, texts.base);
  }
  if (treeFile && treeCached === null) {
    storeBase(treeFile, texts.tree);
  }

  const note = formatNote(script, ref, probeFormat(texts.base), probeFormat(texts.tree));
  if (note !== null) {
    console.log(note);
  }
  return texts;
}

/**
 * Removes options from the arguments of a command line, such as `--base <ref>` from the arguments
 * of a child.
 *
 * @param args The arguments.
 * @param valued The options to remove with their values.
 * @param flags The options with no value to remove.
 * @returns The other arguments, in their order.
 */
export function withoutOptions(
  args: readonly string[],
  valued: readonly string[],
  flags: readonly string[] = [],
): string[] {
  const kept: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (valued.includes(arg)) {
      i++;
    } else if (!flags.includes(arg)) {
      kept.push(arg);
    }
  }
  return kept;
}

/**
 * Checks the paths of an overlay before any removal: each path is relative, names a part of the
 * folder of the tree and not the whole folder, and is not under `node_modules`. A removal of
 * another path could reach a file next to the folder, or the real `node_modules` through its link.
 *
 * @param dir The folder of the tree of the commit.
 * @param paths The paths, such as `src/gallery`.
 * @returns The paths, relative to the folder, with no `.` or `..` part.
 * @throws Error for the first path that breaks a rule.
 */
export function overlayPaths(dir: string, paths: readonly string[]): string[] {
  return paths.map((path) => {
    if (isAbsolute(path)) {
      throw new Error(`The overlay path "${path}" is absolute.`);
    }
    const inside = relative(dir, resolvePath(dir, path));
    if (inside === '' || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
      throw new Error(`The overlay path "${path}" is not inside the tree of the commit.`);
    }
    if (inside.split(sep)[0] === 'node_modules') {
      throw new Error(`The overlay path "${path}" is under node_modules.`);
    }
    return inside;
  });
}

/**
 * Replaces paths of the tree of a commit with the paths of the working tree. A file that only the
 * commit has under such a path goes away. Each path must pass {@link overlayPaths} before the
 * first removal, and the tree must have no `node_modules` yet.
 *
 * @param dir The folder of the tree of the commit.
 * @param paths The paths, such as `src/gallery`.
 * @throws Error if a path breaks a rule of {@link overlayPaths}, or if the tree already has
 *   `node_modules`, such as the link of {@link withRefBuild}. Then nothing goes away.
 */
export function overlayTree(dir: string, paths: readonly string[]): void {
  const checked = overlayPaths(dir, paths);
  if (lstatSync(join(dir, 'node_modules'), { throwIfNoEntry: false })) {
    throw new Error('The tree of the commit has node_modules. Put the overlay in before the link.');
  }
  for (const path of checked) {
    rmSync(join(dir, path), { recursive: true, force: true });
    cpSync(join(ROOT, path), join(dir, path), { recursive: true });
  }
}

/**
 * Builds the site of a commit in a temporary folder, and gives the folder to a function. The
 * folder gets the whole tree of the commit and a link to the `node_modules` of the repository.
 * The paths of `overlay` come from the working tree in place of the commit, such as the gallery
 * page of a tool that needs the camera code of the working tree. They go in before the link
 * ({@link overlayTree}). Then `pnpm build` writes `dist/` there. The folder goes away at the end, also after a failure or a stop.
 *
 * @param ref The commit, a branch, or a tag.
 * @param use The function that reads the folder and its `dist/`.
 * @param parent The folder that holds the temporary folder.
 * @param overlay The paths of the working tree, such as `src/gallery`, that replace the paths of
 *   the commit.
 * @returns The result of the function.
 * @throws Error if git does not know the ref, the build fails, or the function fails.
 */
export function withRefBuild<T>(
  ref: string,
  use: (dir: string) => Promise<T>,
  parent?: string,
  overlay: readonly string[] = [],
): Promise<T> {
  const options: RefTreeOptions = parent
    ? { parent, prefix: 'ref-build-' }
    : { prefix: 'ref-build-' };
  return withRefTree(
    ref,
    async (dir) => {
      // The overlay comes before the link, so that no removal can follow the link.
      overlayTree(dir, overlay);
      symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
      await runChild('pnpm', ['run', 'build'], dir);
      return await use(dir);
    },
    options,
  );
}

/**
 * Gives the short hash of a commit.
 *
 * @param ref The commit, a branch, or a tag.
 * @returns The short hash.
 * @throws Error if git does not know the ref.
 */
export function shortHash(ref: string): string {
  const result = spawnSync('git', ['rev-parse', '--short', '--verify', `${ref}^{commit}`], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`git does not know the commit "${ref}".`);
  }
  return result.stdout.trim();
}

/**
 * Gives the value of an option of the command line.
 *
 * @param args The arguments.
 * @param name The option, such as `--base`.
 * @returns The value, `null` when the option is not there, or `undefined` when it has no value.
 */
export function optionValue(args: readonly string[], name: string): string | null | undefined {
  const at = args.indexOf(name);
  if (at < 0) {
    return null;
  }
  const value = args[at + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

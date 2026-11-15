/**
 * The parts that `pnpm body-probe` and `pnpm camera-probe` share: the JSON of `--out`, the probe of
 * a commit, and the compare modes `--base <ref>` and `--compare <base.json> <new.json>`.
 * `camera-probe.ts` copies this file into the tree of each commit that it probes, so this file
 * imports only exports that old commits have.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { checkFormat, formatVersion, runChild, withProbeTree } from './ref-tree.ts';

/** The result of a compare of two probes. */
export interface ProbeComparison {
  /** The counts of the equal and the changed parts. */
  readonly counts: readonly string[];
  /** One line for each difference. */
  readonly differences: readonly string[];
}

/** A probe file and the format version of its JSON. */
interface ProbeFile<P> {
  /** The probe. */
  readonly probe: P;
  /** The format version of the JSON. */
  readonly version: number;
}

/**
 * Writes a probe as the JSON of `--out`, with its format version first. The JSON of the same code
 * is the same, byte for byte.
 *
 * @param version The format version (`formatVersion()` of `tools/ref-tree.ts`).
 * @param probe The probe.
 * @returns The text, with a line end at the end.
 */
export function probeJson<P extends object>(version: number, probe: P): string {
  return `${JSON.stringify({ version, ...probe }, null, 1)}\n`;
}

/**
 * Reads a probe file that a probe tool wrote with {@link probeJson}.
 *
 * @param file The path of the file.
 * @returns The probe and the format version of its JSON.
 */
async function readProbe<P>(file: string): Promise<ProbeFile<P>> {
  const text = await readFile(file, 'utf8');
  // SAFETY: the file is the output of the probe tool of the caller, which writes a P as JSON.
  return { probe: JSON.parse(text) as P, version: formatVersion(text) };
}

/** The options of {@link probeCommit}. */
export interface CommitProbe {
  /** The script of `tools/`, such as `body-probe.ts`. */
  readonly script: string;
  /** The arguments of the script after `--out <file>`. */
  readonly args: readonly string[];
  /** The format version that the JSON of the commit must have. */
  readonly format: number;
  /** The folder that holds the temporary folder. */
  readonly parent: string;
  /** The start of the name of the temporary folder, such as `body-probe-`. */
  readonly prefix: string;
  /** The scripts of the working tree that replace the scripts of the commit, or none. */
  readonly scripts: readonly string[];
}

/**
 * Probes a commit. The folder of `withProbeTree()` holds the code, the demos, and the tools of the
 * commit, with each script of `probe.scripts` of the working tree in place of its own. The script
 * runs there in a child process, so that the caller can probe the working tree at the same time.
 * The folder goes away at the end, also after a failure or a stop (INT or TERM).
 *
 * @param ref The commit, a branch, or a tag.
 * @param probe The script, its arguments, its format version, and the folder.
 * @returns The probe of the commit.
 * @throws Error if git does not know the ref, if the probe fails on the code of the commit, or if
 *   its JSON has another format version than `probe.format`.
 */
export function probeCommit<P>(ref: string, probe: CommitProbe): Promise<P> {
  return withProbeTree(
    ref,
    async (dir) => {
      // The child starts before the first await, so it runs beside a probe of the caller.
      const out = join(dir, 'probe.json');
      await runChild(
        process.execPath,
        [join('tools', probe.script), '--out', out, ...probe.args],
        dir,
      );
      const { probe: result, version } = await readProbe<P>(out);
      checkFormat(probe.script, ref, version, probe.format);
      return result;
    },
    { parent: probe.parent, prefix: probe.prefix, scripts: probe.scripts },
  );
}

/**
 * Prints a comparison, and ends the process: with 1 when there is a difference.
 *
 * @param title The first line, or `null` for none.
 * @param comparison The comparison.
 */
function printComparison(title: string | null, comparison: ProbeComparison): never {
  const lines = [...comparison.counts, ...comparison.differences];
  console.log((title ? [title, ...lines] : lines).join('\n'));
  process.exit(comparison.differences.length > 0 ? 1 : 0);
}

/** The parts of a probe tool that the compare modes run ({@link runCompareModes}). */
export interface CompareTool<P> {
  /** The name of the command, such as `body-probe`, for the usage messages. */
  readonly name: string;
  /**
   * Probes a commit.
   *
   * @param ref The commit, a branch, or a tag.
   * @returns The probe of the commit.
   */
  readonly probeRef: (ref: string) => Promise<P>;
  /**
   * Probes the working tree.
   *
   * @returns The probe.
   */
  readonly runProbe: () => Promise<P>;
  /**
   * Compares two probes.
   *
   * @param base The probe of the base.
   * @param next The new probe.
   * @returns The comparison.
   */
  readonly compare: (base: P, next: P) => ProbeComparison;
}

/**
 * Runs the compare mode of a command line, prints the comparison, and ends the process: with 1
 * when there is a difference. `--base <ref>` probes the commit and the working tree at the same
 * time. `--compare <base.json> <new.json>` compares two files of `--out`. With neither option, it
 * returns.
 *
 * @param args The arguments of the command line.
 * @param tool The name, the probes, and the compare of the tool.
 * @throws Error if an option has no value, if a probe fails, or if the two files have different
 *   format versions.
 */
export async function runCompareModes<P>(
  args: readonly string[],
  tool: CompareTool<P>,
): Promise<void> {
  const baseAt = args.indexOf('--base');
  if (baseAt >= 0) {
    const ref = args[baseAt + 1];
    if (!ref || ref.startsWith('--')) {
      throw new Error(`Usage: pnpm ${tool.name} --base <ref>`);
    }
    // Both probes end before a failure stops the process, so the temporary folder goes away.
    const [base, next] = await Promise.allSettled([tool.probeRef(ref), tool.runProbe()]);
    if (base.status === 'rejected') {
      throw base.reason;
    }
    if (next.status === 'rejected') {
      throw next.reason;
    }
    printComparison(`base ${ref}, new: the working tree`, tool.compare(base.value, next.value));
  }

  const compare = args.indexOf('--compare');
  if (compare >= 0) {
    const [baseFile, nextFile] = [args[compare + 1], args[compare + 2]];
    if (!baseFile || !nextFile) {
      throw new Error(`Usage: pnpm ${tool.name} --compare <base.json> <new.json>`);
    }
    const [base, next] = [await readProbe<P>(baseFile), await readProbe<P>(nextFile)];
    if (base.version !== next.version) {
      throw new Error(
        `The probe file ${baseFile} has the format version ${base.version}, and ${nextFile} has the format version ${next.version}. A compare of two formats gives false differences.`,
      );
    }
    printComparison(null, tool.compare(base.probe, next.probe));
  }
}

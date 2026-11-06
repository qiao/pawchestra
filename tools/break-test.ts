/**
 * Reads the JSON report of the Vitest run of `tools/break-test.sh`, and prints the tests that
 * fail: `node tools/break-test.ts <report.json> [<root>]`. It exits with 0 when a test fails, with
 * 1 when no test fails, and with 2 when no test ran.
 */
import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';

/** The result of one test in the JSON report of Vitest. */
interface VitestAssertion {
  /** The titles of the `describe` blocks around the test, from the outside in. */
  readonly ancestorTitles: readonly string[];
  /** The title of the test. */
  readonly title: string;
  /** The result, such as `passed`, `failed`, or `skipped`. */
  readonly status: string;
}

/** The result of one test file in the JSON report of Vitest. */
export interface VitestFileResult {
  /** The absolute path of the test file. */
  readonly name: string;
  /** `failed` when a test of the file fails or the file does not load. */
  readonly status: string;
  /** The error of a file that does not load, or an empty text. */
  readonly message: string;
  /** The result of each test of the file. */
  readonly assertionResults: readonly VitestAssertion[];
}

/** The parts of the JSON report of Vitest (`--reporter=json`) that the tool reads. */
interface VitestReport {
  /** The result of each test file. */
  readonly testResults: readonly VitestFileResult[];
}

/** The lines that the tool prints, and its exit code. */
interface BreakVerdict {
  /** One line for each test that fails, or one line that says why no test fails. */
  readonly lines: readonly string[];
  /** 0 when a test fails, 1 when no test fails, and 2 when no test ran. */
  readonly exitCode: 0 | 1 | 2;
}

/**
 * Gives the tests that fail in a report: one line for each failed test, as `<file> > <describe>
 * > <test>`, and one line for each test file that does not load, with the first line of its
 * error. A file that does not load counts as a failure, because the break can stop the import.
 *
 * @param report The JSON report of Vitest.
 * @param root The folder of the run, for the relative paths of the files.
 * @returns The lines and the exit code.
 */
export function breakVerdict(report: VitestReport, root: string): BreakVerdict {
  const files = report.testResults;
  const tests = files.reduce((sum, file) => sum + file.assertionResults.length, 0);
  const lines: string[] = [];
  for (const file of files) {
    const path = relative(root, file.name);
    const failed = file.assertionResults.filter((test) => test.status === 'failed');
    for (const test of failed) {
      lines.push([path, ...test.ancestorTitles, test.title].join(' > '));
    }
    if (file.status === 'failed' && failed.length === 0) {
      const cause = file.message.split('\n')[0] ?? '';
      lines.push(`${path}: the file fails before its tests: ${cause}`);
    }
  }

  if (lines.length > 0) {
    return { lines: [`Tests that fail (${lines.length}):`, ...lines], exitCode: 0 };
  }
  if (tests === 0) {
    return { lines: ['No test ran. Check the paths of the test files.'], exitCode: 2 };
  }
  return { lines: [`No test fails (${tests} tests in ${files.length} files).`], exitCode: 1 };
}

async function main(): Promise<void> {
  const [file, root = process.cwd()] = process.argv.slice(2);
  if (!file) {
    console.error('Usage: node tools/break-test.ts <report.json> [<root>]');
    process.exitCode = 2;
    return;
  }

  // SAFETY: Vitest writes this file with its JSON reporter, which has the fields of VitestReport.
  const report = JSON.parse(await readFile(file, 'utf8')) as VitestReport;
  const verdict = breakVerdict(report, root);
  console.log(verdict.lines.join('\n'));
  process.exitCode = verdict.exitCode;
}

if (import.meta.main) {
  await main();
}

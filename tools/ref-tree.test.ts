import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ROOT,
  checkFormat,
  errorCause,
  formatVersion,
  optionValue,
  overlayPaths,
  overlayTree,
  probeBeside,
  probeScripts,
  refRoleKeys,
  runChildren,
  shortHash,
  withProbeTree,
  withRefBuild,
  withRefTree,
  withoutOptions,
} from './ref-tree.ts';

describe('errorCause', () => {
  it('keeps the lines before the stack of an error', () => {
    const errors = [
      'file:///tmp/body-probe-x/tools/body-probe.ts:37',
      "import { LOWER_MAX_SEC } from '../src/pose/rest.ts';",
      "SyntaxError: The requested module '../src/pose/rest.ts' does not provide an export named 'LOWER_MAX_SEC'",
      '    at ModuleJob._instantiate (node:internal/modules/esm/module_job:180:21)',
      '    at async ModuleJob.run (node:internal/modules/esm/module_job:369:5)',
      '',
      'Node.js v24.10.0',
    ].join('\n');
    expect(errorCause(errors).split('\n')).toEqual([
      'file:///tmp/body-probe-x/tools/body-probe.ts:37',
      "import { LOWER_MAX_SEC } from '../src/pose/rest.ts';",
      "SyntaxError: The requested module '../src/pose/rest.ts' does not provide an export named 'LOWER_MAX_SEC'",
    ]);
  });

  it('keeps all lines when there is no stack', () => {
    expect(errorCause('fatal: not a valid object name no-such-ref\n')).toBe(
      'fatal: not a valid object name no-such-ref',
    );
  });
});

describe('withRefTree', () => {
  it('extracts the paths of a commit, and removes the folder also after a failure', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'ref-tree-test-'));
    try {
      const text = await withRefTree(
        'HEAD',
        async (dir) => {
          // The folder holds only the extracted paths while the function runs.
          expect(readdirSync(parent)).toHaveLength(1);
          expect(existsSync(join(dir, 'src'))).toBe(false);
          return readFileSync(join(dir, 'package.json'), 'utf8');
        },
        { parent, paths: ['package.json'] },
      );
      expect(JSON.parse(text)).toHaveProperty('name', 'pawchestra');
      expect(await readdir(parent)).toEqual([]);

      const failing = withRefTree('HEAD', () => Promise.reject(new Error('the reader fails')), {
        parent,
        paths: ['package.json'],
      });
      await expect(failing).rejects.toThrow('the reader fails');
      expect(await readdir(parent)).toEqual([]);

      const unknown = withRefTree('no-such-ref', () => Promise.resolve(0), { parent });
      await expect(unknown).rejects.toThrow('no-such-ref');
      expect(await readdir(parent)).toEqual([]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});

describe('probeScripts', () => {
  it('copies each script of the working tree that the commit does not have, with no test', () => {
    const files = [
      'body-probe.ts',
      'body-probe.test.ts',
      'blender',
      'rig-form.ts',
      'rig-form.test.ts',
      'studio-body.ts',
    ];
    const own = ['blender', 'body-probe.ts', 'body-probe.test.ts', 'studio-body.ts'];
    expect(probeScripts(files, own)).toEqual(['rig-form.ts']);
  });
});

describe('withProbeTree', () => {
  it('gives the code and the tools of a commit with the node_modules of the working tree', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'probe-tree-test-'));
    try {
      await withProbeTree(
        'HEAD',
        async (dir) => {
          expect(existsSync(join(dir, 'src', 'pose', 'pose-at.ts'))).toBe(true);
          expect(existsSync(join(dir, 'demos', 'patches.json'))).toBe(true);
          expect(existsSync(join(dir, 'tools', 'patch-demos.ts'))).toBe(true);
          expect(existsSync(join(dir, 'tools', 'pose-depth.ts'))).toBe(true);
          // Only the tree of the commit has the tests and the rig configs of tools/.
          expect(existsSync(join(dir, 'tools', 'ref-tree.test.ts'))).toBe(true);
          expect(existsSync(join(dir, 'tools', 'mesh-rigs', 'fox.json'))).toBe(true);
          expect(existsSync(join(dir, 'node_modules', 'three', 'package.json'))).toBe(true);
          return Promise.resolve();
        },
        { parent, prefix: 'probe-tree-' },
      );
      expect(await readdir(parent)).toEqual([]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('stops before the probe when the commit has no role of the probe', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'probe-tree-test-'));
    const role = { module: 'tools/fold-probe.ts', table: 'FOLD_ROLES' };
    try {
      let ran = false;
      const missing = withProbeTree(
        'HEAD',
        () => {
          ran = true;
          return Promise.resolve();
        },
        { parent, prefix: 'probe-tree-', role: { ...role, name: 'kazoo-player' } },
      );
      await expect(missing).rejects.toThrow(/^The ref HEAD has no role kazoo-player\. Its roles/);
      expect(ran).toBe(false);

      const keys = await withProbeTree(
        'HEAD',
        (dir) => Promise.resolve(refRoleKeys(dir, { ...role, name: 'flutist' })),
        { parent, prefix: 'probe-tree-', role: { ...role, name: 'flutist' } },
      );
      expect(keys).toContain('flutist');
      expect(await readdir(parent)).toEqual([]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  }, 20_000);

  it('gives no keys of a module or a table that the tree does not have', () => {
    expect(refRoleKeys(ROOT, { name: 'x', module: 'tools/no-such.ts', table: 'X' })).toBeNull();
    expect(
      refRoleKeys(ROOT, { name: 'x', module: 'tools/fold-probe.ts', table: 'NO_SUCH' }),
    ).toBeNull();
  });
});

describe('overlayPaths', () => {
  it('refuses an absolute path, a path outside the tree, and a path under node_modules', () => {
    const dir = join(tmpdir(), 'ref-build-x');
    expect(overlayPaths(dir, ['src/gallery', './src/../gallery.html'])).toEqual([
      join('src', 'gallery'),
      'gallery.html',
    ]);
    expect(() => overlayPaths(dir, ['/etc'])).toThrow('is absolute');
    expect(() => overlayPaths(dir, [join(dir, 'src')])).toThrow('is absolute');
    for (const path of ['..', '../x', 'src/../../x', '', '.']) {
      expect(() => overlayPaths(dir, [path])).toThrow('is not inside the tree');
    }
    for (const path of ['node_modules', 'node_modules/three', 'src/../node_modules/three']) {
      expect(() => overlayPaths(dir, [path])).toThrow('is under node_modules');
    }
  });
});

describe('withRefBuild', () => {
  it('puts the overlay into the tree before the link of node_modules', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'ref-build-test-'));
    const bin = join(parent, 'bin');
    const path = process.env['PATH'];
    try {
      // A pnpm that builds nothing, so the test reads only the tree of the build.
      mkdirSync(bin);
      writeFileSync(join(bin, 'pnpm'), '#!/bin/sh\nexit 0\n');
      chmodSync(join(bin, 'pnpm'), 0o755);
      process.env['PATH'] = `${bin}:${path ?? ''}`;
      const items = join('src', 'gallery', 'items.ts');
      const seen = await withRefBuild(
        'HEAD',
        (dir) =>
          Promise.resolve({
            items: readFileSync(join(dir, items), 'utf8'),
            linked: lstatSync(join(dir, 'node_modules')).isSymbolicLink(),
          }),
        parent,
        ['src/gallery'],
      );
      expect(seen.items).toBe(readFileSync(join(import.meta.dirname, '..', items), 'utf8'));
      expect(seen.linked).toBe(true);
      expect(await readdir(parent)).toEqual(['bin']);

      // The overlay refuses a tree that has node_modules already.
      await withRefTree(
        'HEAD',
        (dir) => {
          symlinkSync(join(import.meta.dirname, '..', 'node_modules'), join(dir, 'node_modules'));
          expect(() => overlayTree(dir, ['src/gallery'])).toThrow('has node_modules');
          return Promise.resolve();
        },
        { parent, paths: ['src/gallery'] },
      );
    } finally {
      if (path === undefined) {
        delete process.env['PATH'];
      } else {
        process.env['PATH'] = path;
      }
      await rm(parent, { recursive: true, force: true });
    }
  }, 30_000);
});

describe('probeBeside', () => {
  it('runs a script on a commit and on the working tree, and removes the folder', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'probe-beside-test-'));
    try {
      const args = ['pianist', '--demo', 'bach-bwv1048', '--bones', 'handL', '--times', '10'];
      const texts = await probeBeside(
        'HEAD',
        'pose-depth.ts',
        { base: args, tree: [...args, '--set', 'piano.lean=16deg'] },
        { parent, prefix: 'probe-beside-' },
      );
      // The tree of the test is the commit, so both sides give the same base.
      // SAFETY: rowsJson() of pnpm pose-depth wrote the text.
      const base = JSON.parse(texts.base) as { rows: { variant: string }[] };
      // SAFETY: rowsJson() of pnpm pose-depth wrote the text.
      const tree = JSON.parse(texts.tree) as { rows: { variant: string }[] };
      expect(base.rows.map((row) => row.variant)).toEqual(['']);
      expect(tree.rows.map((row) => row.variant)).toEqual(['', 'piano.lean=16deg']);
      expect(await readdir(parent)).toEqual([]);

      // The failure of the commit ends the sweep of the working tree at once. The full sweep of
      // the violinist takes minutes.
      const started = Date.now();
      const failing = probeBeside(
        'HEAD',
        'pose-depth.ts',
        { base: ['no-such-role'], tree: ['violinist'] },
        { parent, prefix: 'probe-beside-' },
      );
      await expect(failing).rejects.toThrow('The probe of HEAD failed');
      expect(Date.now() - started).toBeLessThan(20_000);
      expect(await readdir(parent)).toEqual([]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  }, 30_000);
});

describe('formatVersion', () => {
  it('gives the field version, and 1 for a text with no version', () => {
    expect(formatVersion('{"version":3,"rows":[]}')).toBe(3);
    expect(formatVersion('{"rows":[]}')).toBe(1);
  });

  it('refuses a text with no object, and a version that is not a whole number above 0', () => {
    expect(() => formatVersion('[1]')).not.toThrow();
    expect(() => formatVersion('null')).toThrow('holds no object');
    expect(() => formatVersion('{"version":0}')).toThrow('has the version 0');
    expect(() => formatVersion('{"version":1.5}')).toThrow('has the version 1.5');
    expect(() => formatVersion('{"version":"2"}')).toThrow('has the version 2');
  });
});

describe('checkFormat', () => {
  it('passes one version, and stops on two versions with both in the message', () => {
    expect(() => checkFormat('hold-fit.ts', 'main', 2, 2)).not.toThrow();
    expect(() => checkFormat('hold-fit.ts', 'main', 1, 2)).toThrow(
      'The JSON of tools/hold-fit.ts on main has the format version 1, and the working tree has the format version 2.',
    );
  });
});

describe('runChildren', () => {
  it('gives the exit code and the error output of each child, also for a code other than 0', async () => {
    const ends = await runChildren([
      {
        command: process.execPath,
        args: ['-e', 'console.error("one test failed"); process.exit(3)'],
        cwd: ROOT,
      },
      { command: process.execPath, args: ['-e', ''], cwd: ROOT },
    ]);
    expect(ends).toEqual([
      { status: 3, errors: 'one test failed\n' },
      { status: 0, errors: '' },
    ]);
  });

  it('ends the other children when one command cannot start, and rejects', async () => {
    const marker = `ref-tree-orphan-${process.pid}-${Date.now()}`;
    const started = Date.now();
    const ending = runChildren([
      {
        command: process.execPath,
        args: ['-e', `setTimeout(() => {}, 20000) // ${marker}`],
        cwd: ROOT,
      },
      { command: join(ROOT, 'no-such-command'), args: [], cwd: ROOT },
    ]);
    await expect(ending).rejects.toThrow(/ENOENT/);
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(runs(marker)).toBe(false);
  });
});

describe('withoutOptions', () => {
  it('removes each option with its value and each flag, and keeps the other arguments', () => {
    const args = ['violinist', '--set', 'a=1', '--gaps', '--demo', 'x', '--base', 'main'];
    expect(withoutOptions(args, ['--set', '--base'], ['--gaps'])).toEqual([
      'violinist',
      '--demo',
      'x',
    ]);
    expect(withoutOptions(args, ['--base'])).toEqual(args.slice(0, 6));
  });
});

describe('overlayTree', () => {
  it('replaces a path of the tree of a commit with the path of the working tree', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'overlay-test-'));
    try {
      await withRefTree(
        'HEAD',
        async (dir) => {
          writeFileSync(join(dir, 'src', 'gallery', 'only-in-commit.ts'), '');
          writeFileSync(join(dir, 'src', 'gallery', 'items.ts'), '// the commit');
          overlayTree(dir, ['src/gallery']);
          expect(existsSync(join(dir, 'src', 'gallery', 'only-in-commit.ts'))).toBe(false);
          const items = join('src', 'gallery', 'items.ts');
          expect(readFileSync(join(dir, items), 'utf8')).toBe(
            readFileSync(join(import.meta.dirname, '..', items), 'utf8'),
          );

          // A refused path stops the overlay before its first removal.
          writeFileSync(join(dir, 'src', 'gallery', 'only-in-commit.ts'), '');
          expect(() => overlayTree(dir, ['src/gallery', '../outside'])).toThrow('not inside');
          expect(existsSync(join(dir, 'src', 'gallery', 'only-in-commit.ts'))).toBe(true);
          return Promise.resolve();
        },
        { parent, paths: ['src/gallery'] },
      );
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});

describe('shortHash', () => {
  it('gives the short hash of a commit, and stops on an unknown ref', () => {
    expect(shortHash('HEAD')).toMatch(/^[0-9a-f]{7,}$/);
    expect(() => shortHash('no-such-ref')).toThrow('no-such-ref');
  });
});

describe('optionValue', () => {
  it('gives the value of an option, null with no option, and undefined with no value', () => {
    expect(optionValue(['--base', 'main'], '--base')).toBe('main');
    expect(optionValue([], '--base')).toBeNull();
    expect(optionValue(['--base'], '--base')).toBeUndefined();
    expect(optionValue(['--base', '--url', 'x'], '--base')).toBeUndefined();
  });
});

/** A child process of a test that holds a tree of a commit, and its end. */
interface Holder {
  /** The child process, which leads a process group of its own, as a tool in a terminal. */
  readonly child: ChildProcess;
  /** The exit code of the child, or `null` when a signal stopped it. */
  readonly closed: Promise<number | null>;
  /** The output of the child so far. */
  readonly output: () => string;
}

/**
 * Starts a Node child that runs a script with `withRefTree()`, `runChild()`, `runChildren()`, and
 * `refRoleKeys()` of this module.
 *
 * @param script The body of the script. It reads the parent folder from `REF_TREE_PARENT`.
 * @param parent The folder that holds the temporary folder.
 * @param path The value of `PATH`.
 * @returns The child.
 */
function hold(script: string, parent: string, path = process.env['PATH'] ?? ''): Holder {
  const module = JSON.stringify(join(import.meta.dirname, 'ref-tree.ts'));
  const code = `import { refRoleKeys, runChild, runChildren, withRefTree } from ${module};\n${script}`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
    cwd: join(import.meta.dirname, '..'),
    env: { ...process.env, PATH: path, REF_TREE_PARENT: parent },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout?.setEncoding('utf8').on('data', (text: string) => {
    output += text;
  });
  child.stderr?.setEncoding('utf8').on('data', (text: string) => {
    output += text;
  });
  const closed = new Promise<number | null>((resolve) => {
    child.on('close', (status) => resolve(status));
  });
  return { child, closed, output: () => output };
}

/**
 * Waits until a condition holds, for at most 10 s.
 *
 * @param condition The condition.
 */
async function waitFor(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !condition(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  expect(condition()).toBe(true);
}

/**
 * Tells if a process with a text in its command line runs.
 *
 * @param text The text.
 * @returns True if such a process runs.
 */
function runs(text: string): boolean {
  return spawnSync('pgrep', ['-f', text]).status === 0;
}

describe('withRefTree after Ctrl-C', () => {
  it('ends a child of runChild, removes the folder, and exits with 130, also after a second INT', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'ref-tree-stop-'));
    const marker = `ref-tree-wait-${process.pid}-${Date.now()}`;
    try {
      // The child waits in the folder, as the build of a commit does. After TERM, it takes 300 ms
      // to end, as a build that writes a file.
      const wait = `process.on("SIGTERM", () => setTimeout(() => process.exit(0), 300)); setTimeout(() => {}, 20000) // ${marker}`;
      const holder = hold(
        [
          "await withRefTree('HEAD', async (dir) => {",
          `  const waiting = runChild(process.execPath, ['-e', '${wait}'], dir);`,
          '  console.log(dir);',
          '  await waiting;',
          "}, { parent: process.env.REF_TREE_PARENT, paths: ['package.json'] });",
        ].join('\n'),
        parent,
      );
      await waitFor(() => holder.output().includes(parent) && runs(marker));
      const dir = holder.output().trim();
      expect(existsSync(dir)).toBe(true);

      // Ctrl-C sends INT to each process of the group of the terminal. Then pnpm sends a second
      // INT to its child, the tool, during the stop.
      process.kill(-(holder.child.pid ?? 0), 'SIGINT');
      await new Promise((resolve) => setTimeout(resolve, 100));
      process.kill(holder.child.pid ?? 0, 'SIGINT');
      expect(await holder.closed).toBe(130);
      expect(existsSync(dir)).toBe(false);
      expect(runs(marker)).toBe(false);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('removes the folder and exits with 130 after Ctrl-C during git archive', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'ref-tree-stop-'));
    const bin = join(parent, 'bin');
    try {
      mkdirSync(bin);
      // A git that waits, so that the stop comes during the extraction.
      writeFileSync(
        join(bin, 'git'),
        `#!/bin/sh\necho started > "${bin}/started"\nexec sleep 20\n`,
      );
      chmodSync(join(bin, 'git'), 0o755);
      const holder = hold(
        "await withRefTree('HEAD', async () => 0, { parent: process.env.REF_TREE_PARENT });",
        parent,
        `${bin}:${process.env['PATH'] ?? ''}`,
      );
      await waitFor(() => existsSync(join(bin, 'started')));
      expect(readdirSync(parent).filter((name) => name.startsWith('ref-'))).toHaveLength(1);

      process.kill(-(holder.child.pid ?? 0), 'SIGINT');
      expect(await holder.closed).toBe(130);
      expect(holder.output()).toBe('');
      expect(readdirSync(parent).filter((name) => name.startsWith('ref-'))).toEqual([]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('ends a child of runChildren, removes the folder, and exits with 130', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'ref-tree-stop-'));
    const marker = `ref-tree-status-${process.pid}-${Date.now()}`;
    try {
      const wait = `setTimeout(() => {}, 20000) // ${marker}`;
      const holder = hold(
        [
          "await withRefTree('HEAD', async (dir) => {",
          `  const waiting = runChildren([{ command: process.execPath, args: ['-e', '${wait}'], cwd: dir }]);`,
          '  console.log(dir);',
          '  await waiting;',
          "  console.log('ended');",
          "}, { parent: process.env.REF_TREE_PARENT, paths: ['package.json'] });",
        ].join('\n'),
        parent,
      );
      await waitFor(() => holder.output().includes(parent) && runs(marker));
      const dir = holder.output().trim();
      expect(existsSync(dir)).toBe(true);

      process.kill(-(holder.child.pid ?? 0), 'SIGINT');
      expect(await holder.closed).toBe(130);
      expect(holder.output()).not.toContain('ended');
      expect(existsSync(dir)).toBe(false);
      expect(runs(marker)).toBe(false);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('starts no probe after Ctrl-C during the read of the roles of a commit', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'ref-tree-stop-'));
    const roles = join(parent, 'roles');
    try {
      // A module of roles whose import waits, so that the stop comes during the read of its keys.
      mkdirSync(roles);
      writeFileSync(
        join(roles, 'slow.mjs'),
        `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(join(roles, 'started'))}, 'started');\nawait new Promise((resolve) => setTimeout(resolve, 20000));\nexport const ROLES = { flutist: 1 };\n`,
      );
      const holder = hold(
        [
          "await withRefTree('HEAD', async (dir) => {",
          `  refRoleKeys(${JSON.stringify(roles)}, { name: 'flutist', module: 'slow.mjs', table: 'ROLES' });`,
          "  console.log('probe started');",
          "}, { parent: process.env.REF_TREE_PARENT, paths: ['package.json'] });",
        ].join('\n'),
        parent,
      );
      await waitFor(() => existsSync(join(roles, 'started')));
      expect(readdirSync(parent).filter((name) => name.startsWith('ref-'))).toHaveLength(1);

      process.kill(-(holder.child.pid ?? 0), 'SIGINT');
      expect(await holder.closed).toBe(130);
      expect(holder.output()).toBe('');
      expect(readdirSync(parent).filter((name) => name.startsWith('ref-'))).toEqual([]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});

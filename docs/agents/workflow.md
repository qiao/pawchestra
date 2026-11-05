# Workflow

This module of `AGENTS.md` gives the rules of the work: the docs, the commits, the place of the
work and the merges, the tests, the probes, the images, and the end of a turn.

## Simplicity over compatibility

Nobody depends on this code yet, so simplicity outranks compatibility. Rename, move, and delete
symbols freely, and update all call sites in the same commit. Add no deprecation shims, legacy
branches, or compatibility aliases.

## Keep the docs true

- A change that alters behavior updates its file in `docs/design/` in the same session.
- A new decision goes into its design section, with its reason and no history. There are no
  decision files. The git history keeps the old records.
- A research result goes into the design, or into a technique reference of `docs/reference/`, with
  a source for each fact.
- A design section holds the current state, the rules, and the reasons. It names the constant of a
  tuned value, such as a color, a size, or a test result, in place of the value.
  [`writing.md`](writing.md) gives the length limits.
- When you move or delete code, update all pointers, comments, and TSDoc references. Grep for the
  old names before you finish.
- A commit that changes a setting or its reason updates its design text and its TSDoc in the same
  commit. Before the commit, grep `docs/`, `src/`, and `tools/` for the words of the old reason.
- `AGENTS.md` and its modules in `docs/agents/` are in scope. Update them when one of their
  statements becomes wrong.

## Commits

Make one logical change in each commit, and keep every commit green: each commit passes
`pnpm lint`, `pnpm typecheck`, and `pnpm format:check`.

- Commit each verified change. Leave no verified work in the working tree.
- Write the subject as a Conventional Commit: `type(scope): subject`, in the imperative mood, in
  lower case, and with no full stop. Wrap the body at 75 characters.
- The types are `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `style`, `build`, and `ci`.
- The scope names the area: a module (`midi`, `score`, `pose`, `models`, `scene`, `audio`, `ui`,
  `app`), or `demos`, `tools`, `ci`, `design`, or `agents`. Reuse the spelling of the log.
- Split a refactor of several steps into separate commits. For example, add the new path first,
  then remove the old code.
- Commit each change before the next edit. Never stage zero-context hunks
  (`git apply --unidiff-zero`), because a hunk can land at the wrong line. Join a check and its
  commit with `&&`, because a `;` commits after a failed check.

### The check script

- Before your report, run `tools/check-commits.sh --tip <base>` one time, with a clean tree.
  `<base>` is `main` on a branch. On `main`, `<base>` is the parent of your first commit.
- The script checks each commit in a temporary worktree, and caches each passed result by tree, so
  the merge gets a `hit` for each commit.
- Run it in the background, because a run with no cache can take more than 10 minutes. A new commit
  during the run gives the exit code 4: run it again.
- Wait for the exit notice of the background run. Do not wait in a loop on
  `pgrep -f "check-commits.sh"`, because the loop shell matches itself.
- After a commit that moves code between files, run `tools/check-commits.sh HEAD~1` before the next
  commit.

## Where to work

An agent that works alone commits on `main` in the main checkout, so that each commit shows at once
in the running app. It needs no merge, and it pushes nothing. An agent uses its own branch and
worktree only when another agent works on the repository at the same time. Then these rules hold:

- At the start, check the base of your worktree. A new worktree can start at an old `origin/main`.
  When `git merge-base HEAD main` differs from `git rev-parse main`, run `git reset --hard main`
  before your first change.
- Give the start commit of your branch to each `--base` option. The other agent commits on `main`
  during your round, so `--base main` also shows its changes as false differences.
- Stage each path by its name: `git add <path>`. `git add -A` and `git add .` also stage the files
  of the other agents.
- Merge a branch with `tools/merge-branch.sh <branch> [worktree]`. It rebases, checks each commit,
  and stops at the first failure. Run `git merge --ff-only` only in a script with
  `set -euo pipefail`, because a pipe such as `| tail` hides a failed merge.
- A rebase is finished when the folder `$(git rev-parse --git-path rebase-merge)` does not exist.
- Let the agent that wrote a branch do a long rebase, because it knows the intent of each commit.
- A rebase with `--exec` runs in the tree of each commit, which has an old copy of a script or
  none. Copy a script of the branch to a temporary path first.
- After a merge or a rebase, make each generated file again with its tool. Do not merge its
  conflict lines by hand. A fitted table, such as `DEMO_LOUDNESS` (`pnpm loudness --fit --write`),
  is such a file. Make its commit the last code commit of the branch, after a rebase on `main`,
  because a new demo on `main` needs a fit too.

In both cases:

- Run `pnpm test:e2e e2e/smoke.e2e.ts --project=chromium` with `ZOOPHONY_E2E_PORT` set to a free
  port, because the merge script and other agents use port 4182. A change of `src/ui/` runs
  `pnpm e2e-base <base>`: the Chromium tests on the tree and on the base, with the failures of the
  tree that pass on the base. It runs Firefox and WebKit too only when it changes code that one
  browser alone uses, because the three browsers gave the same result for the other UI changes. A
  failure is a fault of the change only when the same test passes on the base.
- Stop each dev server, preview server, and browser that you start, before you end your turn.
  `pgrep -fl 'vite|playwright|chrome-headless'` shows the processes that remain.

## Tests

All tests are paused, because they took too long while the project changes fast. `pnpm test` runs
no test, and no check runs a test. Until the pause ends:

- A change adds no test and runs no break test.
- A change that needs a check runs one file with `pnpm test:paused <path>`.
- A change that breaks the typecheck or the lint of a test file fixes that file, because both
  checks still read it.
- Remove the tests and the test helpers of a body or a part that no species uses.

These rules hold for each test:

- A test checks behavior, such as the same pose after a seek. It pins no tuned value, hash, or
  geometry of a look, and it tests each body against its own rule.
- A unit test goes beside its module, as `<name>.test.ts`. Build its inputs with the real `midi/`
  and `score/` modules.
- The lint refuses `vi.mock`. Move the logic under test into a function with plain values, as
  `renderScenePass()` of `scene/stage-scene.ts` does.

## Probes and the shell

- In an isolated worktree, the guard of the shell refuses a heredoc, a `$VAR` operand, and several
  git calls in one line. Write a command of many steps as a script in `scratch/` and run it, and
  keep each git call plain.
- Put a probe script in `scratch/` of your worktree. Git ignores the folder, and the checks skip
  it. Run it with `node scratch/<name>.ts`, with relative imports such as
  `../src/models/species.ts`.
- Run an image probe in Python with
  `uv run --no-project --with pillow --with numpy --with scipy python -I <script>`. The other
  Pythons of the machine have no numpy or no Pillow.
- Read the text of a PDF with `uv run --no-project --with pypdf python -I <script>`, because the
  machine has no `pdftotext`.
- Start each long job in the background: a render, a measure, a sweep, or a check script. Wait for
  its exit notice, and write the docs during the wait.
- Never wait in a loop such as `until ! pgrep -f '<name>'`. The shell of the loop has `<name>` in
  its own command line, so `pgrep` always finds it, and the loop never ends. A round left six such
  loops of `frame-compare.ts` running after its end.
- A sweep, such as `pnpm pose-depth` or `pnpm fold-probe`, reads the modules at its start. Do not
  edit or commit a module that it reads while it runs.
- The probe cache keys each result by the tree. A commit during a run that you will read again
  from the cache changes the key, and the next run starts cold. The key has no environment
  variable, so run a variant that only the environment sets with `PROBE_NO_CACHE=1`.
- In the shell of an agent, `grep` is a shell function that runs ugrep with `--ignore-files`, so it
  skips `scratch/` and `node_modules/`. `command grep` runs the grep of the system.
- Make a temporary edit with `perl -0pi -e`, because the `sed -i` of macOS needs a suffix. Make a
  lasting edit of code with the Edit tool, because a `|` or a `/` in TypeScript text can break a
  `perl` substitution.

## Performance rounds

- Run each timed measure through `tools/measure-lock.sh run --owner <name> -- <cmd>`: a trace,
  `pnpm load-probe`, `pnpm frame`, and each timed probe. The lock serves the tickets in order, so
  two agents do not measure at the same time. `--gate <load>` also waits for a quiet CPU.
- Run a long `pnpm loudness` fit through `tools/measure-lock.sh run --owner <name> -- <cmd>` when
  another agent measures. Two runs at the same time make each run about 3 times slower.
- Run a headless Blender build or render through the same lock when another agent measures. A
  Blender job at about 500% CPU made the gates of `pnpm frame` refuse runs, and it changed a
  shot of `pnpm frozen`.
- A load round measures the times of the app with `pnpm load-probe`, and the scores and the metrics
  of Lighthouse with `pnpm lighthouse`. Use the saved tool, because the Lighthouse of the
  chrome-devtools MCP server has no performance category. `--url https://www.zoophony.com/` audits
  the live site. Use `--quick` while you change the page, and the default runs for a report.
- A round runs no frame measure unless the user or the manager asks for one (design 9.7). A speed
  change still gives its own table in its commit message.
- An ablation of a GPU cost reads the Metal trace of `pnpm frame`. With no frame cap, the main
  thread limits the frame rate, so the frame time alone does not show a GPU change.
- A change of the material IDs can change the order of the draws, and thus the pixels. Run
  `pnpm frozen` after such a change.

These traps make a load measure wrong:

- Start each preload after the first contentful paint, and keep the link of the site server at
  40 Mbit/s. Lighthouse adds each request that ends before the observed paint to the simulated
  LCP, and each high-priority one, such as a module preload, to FCP.
- Make each body of a Node server before the first request. A synchronous compression in a
  request handler stops all other answers, so the first preset of a run gets wrong times.
- To see the static HTML in a Playwright probe, hold `**/*.js` and wait for `commit`. A module
  script runs before `DOMContentLoaded`, so a probe at that event sees the page after the script.
- Skip each CSS file of the Vite manifest that the page does not link, as `tools/size.ts` does.
  The build puts the CSS inline, and the manifest still names the removed file.
- Commit or set aside each later edit before a build for a measure. The build reads the working
  tree, so the edit goes into the measure.
- Check the chunks of the build after a new dynamic import. The top-level await of
  `src/gallery/views-main.ts` turns off the chunk merge of Rolldown, so a lazy chunk that imports
  a module of the first download makes a common chunk (design 7.2).

These traps make a task of the main thread long:

- Compile each pass with its render target set (`compileInto()` of `src/scene/programs.ts`).
  `renderer.compile()` with no target makes the programs of the canvas, and a pass into a target
  needs other programs.
- With `KHR_parallel_shader_compile`, poll `isReady()` of each program in steps, then call
  `getUniforms()` before the first frame. The first draw with a new program waits for the link.
- Keep one `PMREMGenerator`, because a disposed generator frees its programs. three.js r187 makes
  the blur, GGX, and integration materials only in the first draw. Make them with no draw, and
  compile them with `_compileMaterial()` (`createMaterials()` of `src/scene/pmrem-steps.ts`).
- Wait on a fence at the end of each long GPU step, such as the bake. With no wait, the next buffer
  upload blocked the main thread for about 100 ms.
- Call `navigator.mediaDevices.enumerateDevices()` at the start of the app
  (`src/app/audio-session.ts`). It starts the audio service of Chrome, so the first `AudioContext`
  takes about 1 ms in place of about 145 ms.
- Read no layout value, such as `clientWidth`, in the start task, and make no throwaway WebGL2
  context. A layout read puts the first layout into that task (about 10 ms), and each context
  costs about 4 ms.
- Yield with `scheduler.yield()` or a `MessageChannel` message, as `runSliced()` of
  `src/app/slices.ts` does. The browser clamps nested `setTimeout` calls to 4 ms.
- Let a step poll a fence or a program status, and never wait on a promise. `runAll()` runs the
  steps with no yield, so a promise wait stops it.

## Report images

Write the images of a report into `reports/<date>-<topic>/` of your checkout. Git ignores this
folder, and the manager reads the images there before the merge. `tools/merge-branch.sh` copies
the folder into the main checkout before it removes the worktree, and the try files of
`scratch/` into `scratch/merged/<branch>/`. Commit no report image. The hook
`tools/git-hooks/pre-commit` stops a commit that adds an image or a video outside the folders of
the product images, such as `src/`, `public/`, and `docs/reference/`. Report images made most of
the size of the git history.

## Images of a mesh

Each image set that checks a mesh, a hold, or a clip shows the front, the back, the left side, and
the right side (azimuth 0, 180, -90, and 90). This rule applies to a lineup, a crop set, and the
crop pairs of a report. Add other views only after these four. A clip, a fold, or a dark line that
shows only from one direction is a fail.

Render each moment of the role (`--moments` with each name of `ROLE_VIEWS`) at `--elevation 20`
and `--elevation 40`, and add az150 and az-150. The stage camera looks from behind and above, so a
defect can show only from there. A measure that says that no view shows a defect is no proof. Show
the images.

When a change has a side effect on the look that you cannot explain, render one pair of the base
and the change with only the suspected cause removed. Report the side effect as an open problem
with the images, and add it to `TODO.md`.

## Ending a turn

When work remains open, end the turn with the next concrete step. Give one recommendation, or two
for different goals, with its cost and scope, from the work order of design 9.5. When the task is
finished, or when you answer a direct question, give no next step.

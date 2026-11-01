# Commands

This module of `AGENTS.md` lists the commands and the steps of CI. Use Node 24 or later, and the
pnpm of the `packageManager` field of `package.json`.

A row gives the main options. The tool file gives the details and each option, in its head comment
or its usage text: `tools/<name>.ts` for `pnpm <name>`, unless the row names another file.
`--help` prints only the usage line.

## Shared options

- **`--set <changes>`.** One variant of a hold in memory, with its changes separated by `;`, such
  as `piano.lean=16deg`. The root `<instrument>@<species>` changes the own hold of one species
  (`violin@rabbit.lean=12deg`). The root `<instrument>` changes the shared hold, and the tool
  names the other paths that move. The root `<species>` changes an instrument scale, a cymbal
  form, or a tuba pipe (`mouse.oboeScale=0.62`), and `choir`, `choirMotion`, and `folder` change
  the singer. A list takes `-1,0,0`, a wind hold turn `holdTurn(<x>,<z>)`, and an object or
  `null` JSON text. Code: `tools/hold-sets.ts`.
- **`--base <ref>`.** Runs a commit, a branch, or a tag in a child process with its own tools
  (`probeBeside()` of `tools/ref-tree.ts`), and compares it with the working tree. A role that
  the commit does not have stops the run. A cache by tree (`probe-cache/` in the common folder of
  git) keeps the JSON of the commit: a hit prints `base: cached`, and `PROBE_NO_CACHE=1` runs the
  commit again.
- **`--glb <file>`.** Gives the animal the studio body of another GLB file, in a copy of `src/`
  (`tools/glb-swap.ts`). `ANIMALS`, `assets/`, and `src/` do not change, also after Ctrl-C, so a
  file of `rig-mesh --check --keep` needs no copy and no `pnpm studio-body`.
- **Recast role `<role>@<species>`.** The role tools (`fold-probe`, `arm-check`, `pose-depth`,
  `hold-fit`, `close-views`, `arm-look`, `carry-check`) take a role with another species, such as
  `violinist@wolf`. The species gets the seats and the instrument of the role in each demo scene
  (`findRole()` of `tools/fold-probe.ts`), and keeps the body sweep of its own role. The gallery
  shows it with `?only=violin@wolf`. `--base` needs a commit with the same recast, and
  `arm-check --views` and `close-views batch` take no recast role.
- **`--midi <path>`.** A MIDI file of the user, read from its path and never copied into the
  repository. In `pose-depth`, `hold-fit`, `arm-check`, and `clip-probe`, it is one more `--demo`.
- **Image tools.** The tools of the table "Images" build the site or start a dev server, and use
  headless Chromium with ANGLE on Metal (`pnpm exec playwright install chromium` one time). They
  stop their servers and browsers. Do not edit the working tree while they build.

## Build and site

| Command | Action |
|---|---|
| `pnpm install` | Installs the dependencies. |
| `pnpm prepare-site` | Writes the SF3 presets into `public/sf/` and the changed demos into `public/demos/` (design 8.3). `pnpm dev`, `pnpm build`, `pnpm smoke`, `pnpm frame`, and `pnpm frozen` run it first. |
| `pnpm dev` | Writes `perf/perf-60.mid`, and starts the Vite dev server: the gallery at `/gallery.html`, the animal views at `/views.html` (design 7.1), and a demo at `/#demo=<id>`. |
| `pnpm build` | Builds the site into `dist/` with the third-party license file (design 7.3). It gzips the preset and demo files in place, and writes their gzip sizes into `dist/sf/index.json` (design 7.2). `ZOOPHONY_BASE` sets the base path (`/` by default), and `ZOOPHONY_ANALYTICS=1` adds Vercel Web Analytics (design 2.7). `pnpm vite preview` serves `dist/`. |
| `pnpm size [--base <ref>]` | Prints the gzip size of the first download after `pnpm build`, and fails above 1 MB (design 7.2). `--base` also builds the commit, and prints both totals and the difference. |
| `pnpm deploy:vercel [--preview]` | Builds the site with Vercel Web Analytics, and deploys `dist/` to the Vercel project `zoophony` (design 9.2). It needs a logged-in Vercel CLI. Code: `tools/deploy-vercel.sh`. About 2 minutes. |
| `pnpm load-probe [--phone] [--repeat] [--base <ref>]` | Measures the load of the default demo after `pnpm build`, through `tools/measure-lock.sh`: FCP, LCP, the first frame, the time until play is ready, and the bytes. About 10 s for each desktop run. |
| `pnpm lighthouse [--quick] [--desktop] [--url <url>]` | Audits the page with the pinned Lighthouse after `pnpm build`, with the mobile and the desktop preset, through `tools/measure-lock.sh`. About 15 s for each run. |
| `pnpm typecheck` | Runs `tsc` with no output files. |
| `pnpm lint` | Runs `oxlint --type-aware .` with the anti-slop plugin. |
| `pnpm format`, `pnpm format:check` | Formats the source paths with oxfmt, or checks their format. |

## Images

| Command | Action |
|---|---|
| `pnpm screenshots <dir> [--sheet] [--play] [--ui] [--drawer] [--load] [--shots]` | Writes the review screenshots of design 9.8 as WebP files of at most 300 kB: each demo at 1440 × 900 and 390 × 844, the gallery, the animal views, and the sheets. The flags add close views, play frames, UI states, and camera shots. |
| `pnpm share-image [--out <file>]` | Writes `public/share.jpg` (design 7.4) from `SHARE_CAMERA` at 1200 × 630 and at most 200 kB. Run it after a change of the look. About 15 s. |
| `pnpm snapshot` | Saves the play frame of the default demo and a close view of each gallery model into `scratch/snapshots/<date>-<hash>/`. |
| `pnpm sheet-check <sheet> <dir>` | Compares a sheet page of `views.html` with its sheet in `docs/reference/` (design 7.1). A matte of `tools/sheet-mattes/` adds the silhouette IoU of each view. |
| `pnpm choir-check <dir>` | Puts the gallery penguin beside a penguin of each of the two newest reference images. |
| `pnpm close-views <role> <dir> [--moments <list>] [--views <list>] [--lineup] [--base <ref>] [--set <changes>]...` | Writes the moments and the views of `ROLE_VIEWS` of a role, and a grid. `--moments` takes a share of a move, such as `lift30`. `--lineup` gives a row of the base, the tree, and each `--with` role for each of the four views. 25 s to 45 s. |
| `pnpm close-views <mode> <dir> ...` | The other modes: `lineup <species,...>`, `species <species,...>`, `batch` (the image set of a round, 90 s to 260 s), and `play`. `play` renders `--demo` or `--midi` at each `--time` or `--strip <from>:<step>:<count>`, from `--camera`, `--cinematic`, `--shot <seat>`, or `--at <seat>`. Each frame shows the exact song time, except with `--pause` or `--url`. `--base` adds the commit. |
| `pnpm close-views audit <dir> [--roles <role,...>] [--base <ref>]` | The audit sheet of the seams: 2x crops of the arms and the upper trunk in each moment of each role, with the commit above the tree. All roles with no base: about 27 minutes. |
| `pnpm clip-views <dir> --clip <file>[:<animation>] [--species <list>] [--times <list>] [--aim pawL\|pawR]` | Shows a clip of `scratch/clips/<file>.glb` on each species (wolf and rabbit by default) from the four sides at three times, with the gallery query `clip` on a dev server (design 4.4). `--aim` aims at a posed paw. It prints the floor depth before the floor rule and the depth of each arm part in the closed body, in `H`. `--no-images` prints only the depths. About 40 s for two species. |
| `pnpm look-lab <dir> [--url <url>]`, `pnpm look-variants <file> --out <dir>` | Measure frames of `close-views play` against `orchestra-latest.png`: one tree, or each variant. 40 s each. |
| `pnpm keyboard` | Checks each control with the keyboard alone at 1440 × 900 and 390 × 844. |

## Sound

| Command | Action |
|---|---|
| `pnpm loudness [--mix <name>] [--demo <id>]... [--fit [--write]] [--check] [--wav <dir>]` | Measures the loudness of each demo at the output of the app, with the mix bus of `--mix` (design 6.8). `--fit --write` writes `DEMO_LOUDNESS`, `--check` fails a demo off `TARGET_LOUDNESS`, and `--wav` writes the output. About 25 s for each demo. |

## Pose and body probes

These probes need no build and change no source file. They read the demos and the percussion test
score of `tools/probe-demos.ts`. [`rigging.md`](rigging.md) gives the roles.

| Command | Action |
|---|---|
| `pnpm pose-probe <sheet> [--time <s>]... [--set <changes>]...` | Prints the posed elbow, wrist, and palm of each arm of a sheet pose (design 7.1), and the tip direction of the instrument. About 1 s. |
| `pnpm pose-depth <role> [--demo <id>]... [--base <ref>]`, or `<role> --where <bone> <demo>:<time>` | The clearance sweep of a role (design 9.3): the deepest point and the share over the limit of each moving part in each obstacle, and of a held instrument in the body. `--base` marks `GROWS`. `--where` gives the corners of a bone in the axes of the instrument. 10 s to 5 minutes. |
| `pnpm hold-scan <role> [--grid <path>=<a>:<b>:<step>]... [--move <axis>=<a>:<b>:<step>]...` | Scores the grids and the moves of a bowed instrument around its end, on 12 play samples and the rest of one demo. 0.15 s for each variant. |
| `pnpm pair-scan <role> --pairs <set>:<part>:<obstacle>,... [--variant <name>=<changes>]...` | Scores the base and named variants on chosen pairs, such as `lower:upper arms:body`: the deepest point, the share over the limit, and its sample. About 10 s for each demo and row with `--every 4`. |
| `pnpm trunk-form <role> [--sets <set>,...] [--base <ref>]` | Measures the form of the trunk of the first player in the bind and in the worst pose of each set, such as the gap to the convex hull. 1 s. |
| `pnpm hold-reach <species> [--instrument <id>] [--set <changes>]...` | Measures the reach of the arms to the instrument (design 4.6), such as the fingerboard of a violin or the grip of a wind. Less than 1 s. |
| `pnpm hold-fit <role> [--set <changes>]... [--grid <path>=<a>:<b>:<step>]... [--base <ref>]`, or `--scan` | Fits a hold of a role, one row for each variant: the folds, the depth of each sample set, the note-target errors, and the play turns of the arms. |
| `pnpm wind-grip <role>... [--lines]` | Measures each paw on its tube over the play, the lift, the rest, and the lowering. It tells if each paw grasps its tube. About 3 s each. |
| `pnpm fold-probe <role> [--faces <n>] [--base <ref>]` | Gives the share of the samples of each set in which a face of the studio skin folds: its normal turns more than 90° from the bind. 10 s to 40 s. |
| `pnpm arm-look <role>... \| --all` | Measures the arm skin against the source mesh over the play: a crumpled skin and a flat plank of the upper arm. About 50 s for each role. |
| `pnpm arm-shape <role> [--rings]` | Measures the twist along the upper arm, the flat and girth shares of four rings, and the shoulder spikes in the samples of `pnpm fold-probe`. 25 s to 55 s. |
| `pnpm arm-check <role>... \| --all [--base <ref>] [--views <dir>] [--states <ref>,...]`, or `<role> --trace` or `--explain` | The arm gate (design 4.4): the `ARM_LIMITS` of each arm over the fold samples and the moves, with `FAIL` (exit code 1), `OPEN`, or `PASS`. All roles: 5 to 7 minutes cold, 2 s from the cache. |
| `pnpm carry-check <role,...> [--base <ref>]` | Measures the carry of the violin or the viola in the left paw over each lift and lowering: the turns of the instrument against the paw. Three roles: 45 s. |
| `pnpm raise-fit <role> --faces <list> --side L\|R [--json <file>]` | Fits one `raise` rule of a mesh rig to the folds of the faces. `--json` writes the entry for `rig-mesh --set 'raise+=@<file>'`. 15 s. |
| `pnpm body-probe [--out <file>]`, `--compare <base.json> <new.json>`, or `--base <ref>` | Probes the rest joints and a mesh hash of each species and player, and a hash of the poses of each player of each demo. `--compare` and `--base` print each difference, and fail on it. About 6 s. |
| `pnpm camera-probe [--out <file>]`, `--compare <base.json> <new.json>`, or `--base <ref>` | Prints a hash of the camera of `cameraAt()` for each demo and the total (design 5.6). `--compare` and `--base` print each difference, with the changed samples of each demo and of all demos. About 8 s. |
| `pnpm beat-rates [--demo <id>]... [--limit <bpm>]`, or `--trace <from>-<to>` | Prints the rate of each beat or note motion over a song (design 5.1, 5.4), and fails above the limit. 3 s for each demo. |
| `pnpm clip-probe [--demo <id>]... [--base <ref>]` | Finds the clips of all players over the whole song, such as overlapped seats, a paw in the other paw, or an instrument under the floor. One file of 1 minute: 6 s. All demos with `--base`: about 8 minutes. |
| `pnpm shot-trace <demo> [--from <s>] [--to <s>] [--base <ref>]`, or `--rules [--list] [--base <ref>]` | Prints the choice of the shot planner at each cut (design 5.6). Less than 1 s. `--rules` counts the breaks of the rules of film grammar over all demos (`tools/shot-rules.ts`). It also gives the camera heights and the nearest animals. 5 s, 9 s with `--base`. |
| `pnpm plan-time [--base <ref>]... [--demo <id>]... [--no-tree]` | Times `prepareShots()` on each demo (design 5.6) on the working tree and on each `--base`, in turns, with the ratio to the first tree. It takes the measure lock itself, so do not run it inside `tools/measure-lock.sh`. About 1 minute for 3 trees. |
| `pnpm light-probe [--look <JSON>] [--grid <spec>] [--goal <r>]` | Light on the players by row, and the lux for a goal. 1 s. |

## Rig tools

Blender 5.2 or later comes from the variable `BLENDER`, or from the path.

| Command | Action |
|---|---|
| `pnpm rig-mesh <animal> [--preview <dir>] [--check [--set <changes>]... [--keep <dir>]]` | Rigs a textured mesh into a studio body GLB file from `tools/mesh-rigs/<animal>.json` (design 4.4). `--check` rigs into a temporary folder, and prints the measures and the faults of each role. Run `pnpm studio-body <animal>` after each write. 20 s to 75 s. |
| `blender -b --factory-startup --python tools/blender/arm_root.py -- tools/arm-roots/<species>.json [--out <file.glb>] [--edits <JSON list>]` | Writes a copy of a source mesh with local edits at the arm root, at the welded vertex indices of `dump_mesh.py`. Rig the copy with `pnpm rig-mesh <animal> --check --set source=<path> --keep <dir>`. A run gives the same bytes. 5 s. |
| `blender -b --factory-startup --python tools/blender/dump_mesh.py -- <mesh.glb> <out.npz>` | Writes the welded vertices (studio units and axes) and the triangles of a mesh into an npz file. |
| `pnpm mesh-options <animal> <dir> --size <label>=<head top>...` | Makes the mid-report of a mesh: it rigs each size, leg factor, and arm factor as `rig-mesh --check` does, and writes `<dir>/options.md`. About 7 s for each variant. |
| `pnpm mixamo-import <file.fbx\|file.glb> --out <dir>` | Converts a Mixamo file with headless Blender into `<dir>/<name>.glb` in meters, with no `mixamorig:` prefix and one animation for each take (design 4.4). It prints the bones with their player bones, the rest pose, the clips, and the bones that the map misses. It refuses a folder that git does not ignore, because a Mixamo file stays out of git (design 8.1). About 3 s. |
| `pnpm mixamo-model <file.fbx\|file.glb> --out <dir>` | Reads a Mixamo-rigged mesh, and writes `<name>.glb` (the mesh alone, for `source`), `<name>-joints.json` (the `joints` and the `palm` of a rig config, with the missing ears and tail), and `<name>-weights.json` (a `paintedWeights` file from the skin) (design 4.4). The folder must be one that git ignores (design 8.1). About 6 s. |
| `pnpm studio-body <animal> [--inspect [--glb <file>]]` | Writes `src/models/studio/<animal>.ts` from `glb` of `ANIMALS`, with no Blender. `--inspect` prints the joints, the clips, and the arm lengths, and writes no file. |
| `pnpm view-point [<x>,<y>,<z>]... [--pixel <u>,<v>,<y>]...` | Projects each point into the default view of "Reset view" with no render, and prints its pixel and its depth. Use it to place a part in a box of a reference image. About 1 s. |

## Tests and scripts

All tests are paused ([`workflow.md`](workflow.md), "Tests").

| Command | Action |
|---|---|
| `pnpm test` | Runs the Vitest project `unit` (design 9.3). During the pause, it runs no test. |
| `pnpm test:paused [--base <ref>] [<path>]...` | Runs the paused tests, or only the file of each path. `--base <ref>` also runs the commit, and prints only the failures of the working tree. |
| `pnpm test:perf` | Runs the speed tests (`*-speed.test.ts`) one file at a time. A heavy load can make it fail. |
| `pnpm test:e2e [--project=chromium]` | Runs the Playwright tests of `e2e/*.e2e.ts` on the built site. Set `ZOOPHONY_E2E_PORT` to a free port (4182 by default, as in CI). |
| `pnpm e2e-base <ref> [--no-cache] [-- <args of playwright test>]` | Runs the Chromium e2e tests on the working tree, then on `<ref>`, and prints the failures of the tree that pass on the base. It caches the base result by tree, and keeps the log of each run in `scratch/e2e-base/`. About 1.5 minutes, and 4 minutes with no cache hit. |
| `pnpm smoke` | Runs the smoke test on the Vite dev server, with the checks that need the dev hook: the bow arm of a violin and the camera modes. |
| `pnpm frame [--demo=<id>] [--free] [--max-cpu=<percent>] [--gpu-only] [--keep=<dir>]` | Measures the frame target of design 9.7 on the development Mac: `perf-60.mid` in Google Chrome with a Metal System Trace. About 3 minutes. Code: `tools/measure-frame.ts`. |
| `pnpm frozen [--base <ref>] [--shots <list>] [--out <dir>] [--canvas-only]` | Renders the four frozen shots (song time and wall time held). `--base` also renders the commit, prints the difference of each shot, and exits with 1 when a pixel changed. `--canvas-only` compares only the scene, for a round that changes the UI. About 2 minutes. |
| `pnpm cpu-profile [--demo <id>] [--seek <s>] [--callers <function>[:<line>]]` | Profiles the main thread during play, and prints the self time and the total time of the top functions for each frame. About 20 s. |
| `pnpm frame-compare <ref\|patch>... [--runs <n>] [--gate <load>] [-- <flags of pnpm frame>]` | Measures `pnpm frame` in turns on each commit, or on `HEAD` with each `.patch` file, and compares the frozen shots with the first item. It takes the measure lock itself, so a run inside `tools/measure-lock.sh` waits for itself. When the load average is above 8, `frame-compare <base> HEAD` shows whether a failed `pnpm frame` comes from the load. About 5 minutes for each run of an item. |
| `tools/check-commits.sh [--tip] [--no-cache] <base>` | Checks each commit of `<base>..HEAD` ([`workflow.md`](workflow.md), "The check script"): the lint, the typecheck, the format, and the tests that a code commit reaches. `--tip` adds the full `pnpm test` on the last commit. |
| `tools/measure-lock.sh run --owner <name> [--gate <load>] [--max <s>] -- <cmd>`, `tools/measure-lock.sh status` | The fair lock of the timed measures ([`workflow.md`](workflow.md), "Performance rounds"): a queue of tickets, a CPU gate, and a stop after `--max` seconds. |
| `tools/merge-branch.sh [--check-only] [--no-arm-check] <branch> [worktree]` | Rebases `<branch>` onto `main`, and checks each commit. It runs the full `pnpm test`, the arm gate of [`rigging.md`](rigging.md), `pnpm build`, and `pnpm size`, then fast-forwards `main` and removes the worktree and the branch. `--check-only` does not merge. Run it from `main`. |
| `tools/break-test.sh '<perl expr>' <file> <test files>...` | Applies one temporary break to a tracked file, and prints each test that fails. |

## CI

CI (`.github/workflows/ci.yml`) runs the checks of design 9.2 on each push: the typecheck, the
lint, the format, `pnpm test`, the build, and the size, with no deploy.

## Checks for each kind of change

These checks compare the working tree with `main`. Each one prints the differences, so an equal
result proves that the change kept the behavior.

```text
comments or docs only        ->  body-probe --base main equal, dist/ of both builds equal
dead code removal            ->  + size --base main, camera-probe --base main, smoke, frozen --base main
asset or rig cleanup         ->  + rig-mesh <a> --check for each animal, studio-body output equal
performance change           ->  + frame-compare main <patch>, camera-probe --base main, frozen --base main
```

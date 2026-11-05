# Commands

This module of `AGENTS.md` lists the commands and the steps of CI. Use Node 24 or later, and the
pnpm of the `packageManager` field of `package.json`.

A row gives the main options. The head comment of `tools/<name>.ts` gives each option of
`pnpm <name>`, unless the row names another file.

## Shared options

- **`--set <changes>`.** One variant of a hold in memory, with its changes separated by `;`, such
  as `piano.lean=16deg`. The root `<instrument>@<species>` changes the own hold of one species
  (`violin@rabbit.lean=12deg`), and `<instrument>` the shared hold. The root `<species>` changes
  an instrument scale, a cymbal form, or a tuba pipe (`mouse.oboeScale=0.62`). Code:
  `tools/hold-sets.ts`.
- **`--base <ref>`.** Runs a commit in a child process (`probeBeside()` of `tools/ref-tree.ts`),
  and compares it with the working tree. A cache by tree keeps the JSON of the commit
  (`base: cached`). `PROBE_NO_CACHE=1` runs the commit again.
- **`--glb <file>`.** Gives the animal the studio body of another GLB file, in a copy of `src/`
  (`tools/glb-swap.ts`), so a file of `rig-mesh --check --keep` needs no `pnpm studio-body`. With
  `--base`, only the working tree takes it. `arm-check` takes each role of its animal, also a
  recast role.
- **Recast role `<role>@<species>`.** The role tools take a role with another species, such as
  `violinist@wolf`, in the seats of the role (`findRole()` of `tools/fold-probe.ts`), with the size
  rule of the matrix (`tools/recast-scale.ts`). A test species takes `TEST_BODY_OBSTACLES`.
  `close-views play --recast` puts it into the app.
- **`--midi <path>`.** A MIDI file of the user, read from its path and never copied into the
  repository. In `pose-depth`, `hold-fit`, `arm-check`, and `clip-probe`, it is one more `--demo`.
- **Image tools.** The tools of the table "Images" build the site or start a dev server, and use
  headless Chromium with ANGLE on Metal (`pnpm exec playwright install chromium` one time). Do not
  edit the working tree while they build.

## Build and site

| Command | Action |
|---|---|
| `pnpm install` | Installs the dependencies. |
| `pnpm prepare-site` | Writes the SF3 presets into `public/sf/` and the changed demos into `public/demos/` (design 8.3). `pnpm dev`, `build`, `smoke`, `frame`, and `frozen` run it first. |
| `pnpm dev` | Starts the Vite dev server: the gallery at `/gallery.html`, the animal views at `/views.html` (design 7.1), and a demo at `/#demo=<id>`. |
| `pnpm build` | Builds the site into `dist/` with the license file (design 7.3) and the gzipped presets and demos (design 7.2). `ZOOPHONY_ANALYTICS=1` adds Vercel Web Analytics (design 2.7). `pnpm vite preview` serves `dist/`. |
| `pnpm size [--base <ref>]` | Prints the gzip size of the first download after `pnpm build`, and fails above 1 MB (design 7.2). `--base` also builds the commit, and prints the difference. |
| `pnpm deploy:vercel [--preview]` | Builds the site with analytics, and deploys `dist/` to the Vercel project `zoophony` (design 9.2). Code: `tools/deploy-vercel.sh`. About 2 minutes. |
| `pnpm load-probe [--phone] [--repeat] [--base <ref>]` | Measures the load of the default demo after `pnpm build`: FCP, LCP, the first frame, the time until play is ready, and the bytes. About 10 s. |
| `pnpm lighthouse [--quick] [--desktop] [--url <url>]` | Audits the page with the pinned Lighthouse after `pnpm build`. About 15 s for each run. |
| `pnpm typecheck` | Runs `tsc` with no output files. |
| `pnpm lint` | Runs `oxlint --type-aware .` with the anti-slop plugin. |
| `pnpm format`, `pnpm format:check` | Formats the source paths with oxfmt, or checks their format. |

## Images

| Command | Action |
|---|---|
| `pnpm screenshots <dir> [--sheet] [--play] [--ui] [--drawer] [--load] [--shots]` | Writes the review screenshots of design 9.8: each demo at 1440 × 900 and 390 × 844, the gallery, and the animal views. |
| `pnpm share-image [--out <file>]` | Writes `public/share.jpg` (design 7.4) from `SHARE_CAMERA`. Run it after a change of the look. About 15 s. |
| `pnpm snapshot` | Saves the play frame of the default demo and a close view of each gallery model into `scratch/snapshots/<date>-<hash>/`. |
| `pnpm sheet-check <sheet> <dir>` | Compares a sheet page of `views.html` with its sheet in `docs/reference/` (design 7.1). A matte of `tools/sheet-mattes/` adds the silhouette IoU of each view. |
| `pnpm choir-check <dir>` | Puts the gallery penguin beside a penguin of each of the two newest reference images. |
| `pnpm close-views <role> <dir> [--moments <list>] [--views <list>] [--lineup] [--base <ref>] [--set <changes>]...` | Writes the moments and the views of `ROLE_VIEWS` of a role, and a grid. `--lineup` puts the base, the tree, and each `--with` role in a row. 25 s to 45 s. |
| `pnpm close-views <mode> <dir> ...` | The other modes: `lineup <species,...>`, `species <species,...>`, `batch` (the image set of a round, 90 s to 260 s), and `play`. `play` renders a demo at chosen times from a chosen camera or seat. |
| `pnpm close-views audit <dir> [--roles <role,...>] [--base <ref>]` | The audit sheet of the seams: 2x crops of the arms and the upper trunk in each moment of each role, the commit above the tree. All roles: about 27 minutes. |
| `pnpm clip-views <dir> --clip <file>[:<animation>] [--species <list>] [--aim pawL\|pawR]` | Shows a clip of `scratch/clips/<file>.glb` on each species from the four sides (design 4.4), with the depth of each arm part in the body. About 40 s. |
| `pnpm look-lab <dir> [--url <url>]`, `pnpm look-variants <file> --out <dir>` | Measure frames of `close-views play` against `orchestra-latest.png`: one tree, or each variant. 40 s each. |
| `pnpm keyboard` | Checks each control with the keyboard alone at 1440 × 900 and 390 × 844. |

## Sound

| Command | Action |
|---|---|
| `pnpm loudness [--mix <name>] [--demo <id>]... [--fit [--write]] [--check] [--wav <dir>]` | Measures the loudness of each demo at the output of the app (design 6.8). `--fit --write` writes `DEMO_LOUDNESS`, and `--check` fails a demo off `TARGET_LOUDNESS`. About 25 s for each demo. |

## Pose and body probes

These probes need no build and change no source file. [`rigging.md`](rigging.md) gives the roles.

| Command | Action |
|---|---|
| `pnpm pose-probe <sheet> [--time <s>]... [--set <changes>]...` | Prints the posed elbow, wrist, and palm of each arm of a sheet pose (design 7.1), and the tip direction of the instrument. About 1 s. |
| `pnpm pose-depth <role> [--demo <id>]... [--every <n>] [--base <ref>]`, or `<role> --where <bone> <demo>:<time>` | The clearance sweep of a role (design 9.3): the deepest point and the share over the limit of each moving part in each obstacle. `--where` gives the corners of a bone in the axes of the instrument. 10 s to 5 minutes. |
| `pnpm hold-scan <role> [--grid <path>=<a>:<b>:<step>]... [--move <axis>=<a>:<b>:<step>]...` | Scores the grids and the moves of a bowed instrument around its end, on 12 play samples of one demo. 0.15 s for each variant. |
| `pnpm pair-scan <role> --pairs <set>:<part>:<obstacle>,... [--variant <name>=<changes>]...` | Scores the base and named variants on chosen pairs of parts. About 10 s for each demo and row. |
| `pnpm trunk-form <role> [--sets <set>,...] [--base <ref>]` | Measures the form of the trunk of the first player in the bind and in the worst pose of each set. 1 s. |
| `pnpm body-shape <role> [--base <ref>]` | Measures the body form of design 4.4 ("Replacing body") and the rest pose of a role. 2 s. |
| `pnpm hold-reach <species> [--instrument <id>] [--set <changes>]...` | Measures the reach of the arms to the instrument (design 4.6). Less than 1 s. |
| `pnpm hold-fit <role> [--set <changes>]... [--grid <path>=<a>:<b>:<step>]... [--base <ref>]`, or `--scan` | Fits a hold of a role, one row for each variant: the folds, the depths, the note-target errors, and the play turns of the arms. |
| `pnpm wind-grip <role>... [--lines]` | Measures each paw on its tube over each sample set, and tells if it grasps the tube. About 3 s each. |
| `pnpm fold-probe <role> [--faces <n>] [--base <ref>]` | Gives the share of the samples of each set in which a face of the studio skin folds. 10 s to 40 s. |
| `pnpm arm-look <role>... \| --all` | Measures the arm skin against the source mesh over the play: a crumpled skin and a flat upper arm. About 50 s for each role. |
| `pnpm arm-shape <role> [--rings]` | Measures the twist along the upper arm, the flat and girth shares of four rings, and the shoulder spikes. 25 s to 55 s. |
| `pnpm arm-check <role>... \| --all [--base <ref>] [--views <dir>] [--states <ref>,...] [--json <file>] [--compare <file>]`, or `<role> --trace` or `--explain` | The arm gate (design 4.4): the `ARM_LIMITS` of each arm over the fold samples and the moves, with `FAIL` (exit code 1), `OPEN`, `REBIND` (a new bind), or `PASS`. All roles: 5 to 7 minutes cold, 2 s from the cache. |
| `pnpm arm-check <role>... --world --base <ref> [--set <changes>]... [--glb <file>]` | Prints the largest move of the posed arm joints and the largest turn of the palms against the commit at the samples of the gate, with `SAME` or `MOVED` (exit code 1). One role: about 1 minute. |
| `pnpm cast-matrix [--roles <list>] [--species <list>] [--out <file>] [--quick] [--set <changes>]... [--variant <name>=<changes>]... [--base <ref>]` | Recasts each species into each role with the shared hold and the size rule (design 4.4), and writes a table of `PASS`, `OPEN`, or `FAIL` with the worst arm gate value and the deepest clip. `--base` runs the tools of the commit for its column, and keeps that column in a cache by commit. Six roles: about 3 minutes cold, or 25 s for one role with `--quick`. |
| `pnpm bind-supination <species> [--glb <file>] [--from <L>,<R>] [--summary <file>]` | Gives the bind supination of each paw by the rule of design 4.4, with the signed paw twists of each cast role and own role. For a hand rig, the value of now comes from the export summary `<file>.json` beside the GLB file (`bindSupination`), and the last line says to key the values in the Action `bind` of its `.blend`. About 12 s. |
| `pnpm carry-check <role,...> [--base <ref>]` | Measures the turns of the violin or the viola against the left paw over each lift and lowering. Three roles: 45 s. |
| `pnpm raise-fit <role> --faces <list> --side L\|R [--bone forearm\|hand] [--further <degrees>] [--json <file>]` | Fits one `raise` rule of a mesh rig to the folds of the faces, also of a recast role. `--further` turns a rule of a bent elbow or a bent wrist further than the mean turn. `--json` writes the entry for `rig-mesh --set 'raise+=@<file>'`. 15 s. |
| `pnpm body-probe [--out <file>]`, `--compare <base.json> <new.json>`, or `--base <ref>` | Probes the rest joints and a mesh hash of each species, and a hash of the poses of each player of each demo. `--compare` and `--base` fail on a difference. About 6 s. |
| `pnpm camera-probe [--out <file>]`, `--compare <base.json> <new.json>`, or `--base <ref>` | Prints a hash of the camera of `cameraAt()` for each demo (design 5.6). `--compare` and `--base` print the changed samples. About 8 s. |
| `pnpm beat-rates [--demo <id>]... [--limit <bpm>]`, or `--trace <from>-<to>` | Prints the rate of each beat or note motion over a song (design 5.1, 5.4), and fails above the limit. 3 s for each demo. |
| `pnpm clip-probe [--demo <id>]... [--base <ref>]` | Finds the clips of all players over the whole song. 6 s for one file. |
| `pnpm shot-trace <demo> [--from <s>] [--to <s>] [--base <ref>]`, or `--rules [--list] [--base <ref>]` | Prints the choice of the shot planner at each cut (design 5.6). 5 s. |
| `pnpm plan-time [--base <ref>]... [--demo <id>]... [--no-tree]` | Times `prepareShots()` on each demo (design 5.6) on each tree, in turns. About 1 minute for 3 trees. |
| `pnpm light-probe [--look <JSON>] [--grid <spec>] [--goal <r>]` | Light on the players by row, and the lux for a goal. 1 s. |

## Rig tools

Blender 5.2 or later comes from the variable `BLENDER`, or from the path.

| Command | Action |
|---|---|
| `pnpm rig-mesh <animal> [--preview <dir>] [--check [--set <changes>]... [--no-base] [--keep <dir>]]` | Rigs a textured mesh into a studio body GLB file from `tools/mesh-rigs/<animal>.json` (design 4.4). It stops for an animal with a hand rig (`<animal>.blend` beside its GLB file). `--check` rigs into a temporary folder, and prints the measures and the faults of each role. `--set` can add an optional rule, such as `studio.bindSupination.L=57` or `sitPose=@<file>`, and `--no-base` checks only the variants, in about half of the time. 20 s to 75 s. |
| `pnpm rig-export <animal> [--blend <file>] [--out <file.glb>]` | Exports the hand rig `assets/models/<animal>/<animal>.blend` (design 4.4, "Hand rig") into `<animal>.rig.glb` and the text summary `<animal>.rig.json`, with headless Blender. It checks the layout, and stops at the first fault with the exit code 1. About 1 s. |
| `blender -b --factory-startup --python tools/blender/studio_armature.py -- <animal> --out <file.blend> [--source <glb>] [--auto-weights]` | Starts the hand rig of a new species: the source mesh with `add_surface()`, the armature at the joints of `tools/mesh-rigs/<animal>.json`, and the Action `bind` of its seat rules. About 2 s. |
| `blender ... studio_armature.py -- --drive <file.blend>`, or `--rolls <file.blend>` | Keys the arm segments and the helpers of the Action `bind` by the rule of the app, or gives each bone the roll of its hint. About 1 s. |
| `pnpm mesh-intake <mesh.glb> --config <config> [--factor <f>]` | Checks a mesh against the intake spec (design 4.4), and gives `keep faces` or `needs rebuild` (exit code 1). 2 s. |
| `blender -b --factory-startup --python tools/blender/arm_rebuild.py -- <animal> [--source <glb>] [--factor <f>] [--spec <JSON>] [--out <dir>]` | Rebuilds the arms from the joints of `tools/mesh-rigs/<animal>.json` ([`rigging.md`](rigging.md)) into `<animal>-arms.glb` and `<animal>-weights.json`. Test them with `rig-mesh --check --set 'source=<glb>;paintedWeights=<json>'`. 10 s. |
| `blender ... arm_rebuild.py -- <animal> --keep-faces [--out <dir>]` | Adds only the arm segments and the weights to a mesh with `keep faces`. The GLB file is a copy of the source. 5 s. |
| `blender -b --factory-startup --python tools/blender/wind_arms_try.py -- <animal> <out dir> '<JSON>'` | Runs the session of `wind_arms.py` with changes of the weights or of the elbow rings, for a weight try. |
| `blender -b --factory-startup --python tools/blender/arm_root.py -- tools/arm-roots/<species>.json [--out <file.glb>]` | Writes a copy of a source mesh with local edits at the arm root. Rig the copy with `pnpm rig-mesh <animal> --check --set source=<path> --keep <dir>`. 5 s. |
| `blender -b --factory-startup --python tools/blender/mannequin.py -- <human\|animal> --out <dir>` | Writes the test mannequin of a preset (design 4.4) as GLB and FBX files, with the test clips (`assets/models/mannequin/README.md`). 3 s. |
| `blender -b --factory-startup --python tools/blender/dump_mesh.py -- <mesh.glb> <out.npz>` | Writes the welded vertices and the triangles of a mesh into an npz file. |
| `pnpm mesh-options <animal> <dir> --size <label>=<head top>...` | Makes the mid-report of a mesh: it rigs each size, leg factor, and arm factor, and writes `<dir>/options.md`. About 7 s for each variant. |
| `pnpm mixamo-import <file.fbx\|file.glb> --out <dir>` | Converts a Mixamo file into `<dir>/<name>.glb` in meters, with one animation for each take (design 4.4). The folder must be one that git ignores (design 8.1). About 3 s. |
| `pnpm mixamo-model <file.fbx\|file.glb> --out <dir>` | Writes the inputs of `rig-mesh` from a Mixamo-rigged mesh (design 4.4) into a folder that git ignores. About 6 s. |
| `pnpm studio-body <animal> [--inspect [--glb <file>]]` | Writes `src/models/studio/<animal>.ts` from `glb` of `ANIMALS`, with no Blender. `--inspect` prints the joints, the clips, and the arm lengths. |
| `pnpm view-point [<x>,<y>,<z>]... [--pixel <u>,<v>,<y>]...` | Projects each point into the default view with no render, and prints its pixel and its depth. About 1 s. |

## Tests and scripts

All tests are paused ([`workflow.md`](workflow.md), "Tests").

| Command | Action |
|---|---|
| `pnpm test` | Runs the Vitest project `unit` (design 9.3). During the pause, it runs no test. |
| `pnpm test:paused [--base <ref>] [<path>]...` | Runs the paused tests, or only the file of each path. `--base <ref>` prints only the failures of the working tree. |
| `pnpm test:perf` | Runs the speed tests (`*-speed.test.ts`) one file at a time. |
| `pnpm test:e2e [--project=chromium]` | Runs the Playwright tests of `e2e/*.e2e.ts` on the built site. Set `ZOOPHONY_E2E_PORT` to a free port (4182 by default). |
| `pnpm e2e-base <ref> [--no-cache] [-- <args of playwright test>]` | Runs the Chromium e2e tests on the working tree and on `<ref>`, and prints the failures of the tree that pass on the base. About 1.5 minutes. |
| `pnpm smoke` | Runs the smoke test on the Vite dev server: the bow arm of a violin and the camera modes. |
| `pnpm frame [--demo=<id>] [--free] [--gpu-only] [--keep=<dir>]` | Measures the frame target of design 9.7 in Google Chrome with a Metal System Trace. About 3 minutes. Code: `tools/measure-frame.ts`. |
| `pnpm frozen [--base <ref>] [--shots <list>] [--out <dir>] [--canvas-only]` | Renders the four frozen shots. `--base` also renders the commit, and exits with 1 when a pixel changed. About 2 minutes. |
| `pnpm cpu-profile [--demo <id>] [--seek <s>] [--callers <function>[:<line>]]` | Profiles the main thread during play, and prints the top functions for each frame. About 20 s. |
| `pnpm frame-compare <ref\|patch>... [--runs <n>] [-- <flags of pnpm frame>]` | Measures `pnpm frame` in turns on each commit, or on `HEAD` with each `.patch` file, and compares the frozen shots. About 5 minutes for each run of an item. |
| `tools/check-commits.sh [--tip] [--no-cache] <base>` | Checks each commit of `<base>..HEAD` ([`workflow.md`](workflow.md), "The check script"): the lint, the typecheck, the format, and the tests that a commit reaches. |
| `tools/measure-lock.sh run --owner <name> [--gate <load>] [--max <s>] -- <cmd>`, or `status` | The fair lock of the timed measures ([`workflow.md`](workflow.md), "Performance rounds"). |
| `tools/merge-branch.sh [--check-only] [--no-arm-check] <branch> [worktree]` | Rebases `<branch>` onto `main`, checks each commit, and runs the arm gate, `pnpm build`, and `pnpm size`. Then it fast-forwards `main`, and removes the worktree and the branch. Run it from `main`. |
| `tools/base-tree.sh <ref> [<path>...]` | Extracts a commit into a temporary folder with a link to `node_modules`, and prints the folder, for a base run of a tool with no `--base`. |
| `tools/break-test.sh '<perl expr>' <file> <test files>...` | Applies one temporary break to a tracked file, and prints each test that fails. |

## CI

CI (`.github/workflows/ci.yml`) runs the checks of design 9.2 on each push: the typecheck, the
lint, the format, `pnpm test`, the build, and the size, with no deploy.

## Checks for each kind of change

Each check compares the working tree with `main`. An equal result proves that the change kept the
behavior.

```text
comments or docs only        ->  body-probe --base main equal, dist/ of both builds equal
dead code removal            ->  + size --base main, camera-probe --base main, smoke, frozen --base main
asset or rig cleanup         ->  + rig-mesh <a> --check for each animal, studio-body output equal
performance change           ->  + frame-compare main <patch>, camera-probe --base main, frozen --base main
```

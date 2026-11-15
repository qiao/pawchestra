# Commands

This module of `AGENTS.md` lists the commands and the steps of CI. Use Node 24 or later, and the
pnpm of the `packageManager` field of `package.json`.

A row gives the main options. The head comment of `tools/<name>.ts` gives each option of
`pnpm <name>`, unless the row names another file.

## Shared options

- **`--set <changes>`.** One variant of a hold in memory, with its changes separated by `;`, such
  as `piano.lean=16deg`. The root `<instrument>@<species>` changes the own hold of one species, and
  the root `<species>` an instrument scale, a cymbal form, or a tuba pipe. Code:
  `tools/hold-sets.ts`.
- **`--base <ref>`.** Runs a commit in a child process (`tools/ref-tree.ts`), and compares it with
  the working tree. A cache by tree keeps the result. `PROBE_NO_CACHE=1` runs the commit again.
- **`--glb <file>`.** Gives the animal the studio body of another GLB file, in a copy of `src/`
  (`tools/glb-swap.ts`), with no `pnpm studio-body`. With `--base`, only the working tree takes it.
- **Recast role `<role>@<species>`.** The role tools take a role with another species, such as
  `violinist@wolf`, with the size rule of `tools/recast-scale.ts`. `close-views play --recast`
  puts it into the app.
- **`--midi <path>`.** A MIDI file of the user, read from its path and never copied into the
  repository. In `pose-depth`, `hold-fit`, `arm-check`, and `clip-probe`, it is one more `--demo`.
- **Image tools.** The tools of the table "Images" use headless Chromium with ANGLE on Metal
  (`pnpm exec playwright install chromium` one time). Do not edit the working tree while they
  build.

## Build and site

| Command | Action |
|---|---|
| `pnpm install` | Installs the dependencies. `prepare` sets the git hooks of `tools/git-hooks/`. |
| `pnpm prepare-site` | Writes the SF3 presets into `public/sf/` and the changed demos into `public/demos/` (design 8.3). `dev`, `build`, `smoke`, `frame`, and `frozen` run it first. |
| `pnpm dev` | Starts the Vite dev server: the gallery at `/gallery.html`, the animal views at `/views.html`, the test page of one role at `/test#<species>-<instrument>` or `/test#bear-conductor`, with `&rest` for rest mode (design 7.1), and a demo at `/#demo=<id>`. |
| `pnpm build` | Builds the site into `dist/` with the license file (design 7.3) and the gzipped presets and demos (design 7.2). A second pass (`vite build --mode test-page`) adds the test page (design 7.1). `PAWCHESTRA_ANALYTICS=1` adds Vercel Web Analytics (design 2.7). |
| `pnpm size [--base <ref>]` | Prints the gzip size of the first download after `pnpm build`, and fails above 1 MB (design 7.2). |
| `pnpm deploy:vercel [--preview]` | Builds the site with analytics, and deploys `dist/` to the Vercel project `pawchestra` (design 9.2). `--preview` also points `pawchestra-preview.vercel.app` to the deploy. Production only with the approval of the user. Code: `tools/deploy-vercel.sh`. |
| `pnpm load-probe [--phone] [--base <ref>]` | Measures the load of the default demo after `pnpm build`: FCP, LCP, the first frame, the time until play is ready, and the bytes. |
| `pnpm lighthouse [--quick]` | Audits the page with the pinned Lighthouse after `pnpm build`. |
| `pnpm typecheck` | Runs `tsc` with no output files. |
| `pnpm lint` | Runs `oxlint --type-aware .` with the anti-slop plugin. |
| `pnpm format`, `pnpm format:check` | Formats the source paths with oxfmt, or checks their format. |

## Images

| Command | Action |
|---|---|
| `pnpm screenshots <dir> [--sheet] [--play] [--ui]` | Writes the review screenshots of design 9.8: each demo at 1440 × 900 and 390 × 844, the gallery, and the animal views. |
| `pnpm share-image` | Writes `public/share.jpg` (design 7.4) from `SHARE_CAMERA`. Run it after a change of the look. |
| `node tools/wordmark.ts [--write]` | Makes the wordmark of the logo from `APP_NAME` with HarfBuzz (design 2.8). `--write` puts it into `src/ui/icons.ts` and `index.html`. Needs `hb-view`. |
| `pnpm snapshot` | Saves the play frame of the default demo and a close view of each gallery model into `scratch/snapshots/<date>-<hash>/`. |
| `pnpm sheet-check <sheet> <dir>` | Compares a sheet page of `views.html` with its sheet in `docs/reference/` (design 7.1). |
| `pnpm choir-check <dir>` | Puts the gallery penguin beside a penguin of each of the two newest reference images. |
| `pnpm close-views <role> <dir> [--lineup] [--base <ref>] [--set <changes>]... [--no-fill]`, or `<mode> <dir>` | Writes the moments and the views of `ROLE_VIEWS` of a role, and a grid. `--no-fill` renders with no fill light. The role views show the gallery, which has no hall and no post effects, so only `play --at <species>` shows the light of the app. Only the role mode takes `--glb`. The other modes are `lineup`, `species`, `batch` (the image set of a round), `play` (a demo from a chosen camera or seat), `audit` (2x crops of the arm seams), and `parts` (the next row). `play --quality <tier>` pins the setting "Quality", because the automatic tier can drop during a capture. |
| `pnpm close-views parts <dir> [--roles <role,...>] [--parts <part,...>] [--moments <moment,...>] [--base <ref>]` | Writes close-ups of the body parts of each role (`BODY_PARTS`): each arm, each paw, the seat, and each ankle. Each cell is `<dir>/<role>/<part>/<role>-<moment>-<part>-<view>.png` at 720 px, and each part has one sheet `<dir>/<role>-<part>.png`. The camera frames the posed mesh of the part, so no role needs a point. With no `--moments`, a role shows two play moments, the rest, `lift50`, and `stand`. A view `-cut` cuts away all that is nearer than the paw. `--base` puts the commit above the working tree. All 23 roles take about 3 minutes and 2.5 GB. |
| `pnpm clip-views <dir> --clip <file>[:<animation>]` | Shows a clip of `scratch/clips/<file>.glb` on each species from the four sides (design 4.4), with the depth of each arm part in the body. |
| `pnpm look-lab <dir>`, `pnpm look-variants <file> --out <dir>` | Measure frames of `close-views play` against `orchestra-latest.png`: one tree, or each variant. |
| `pnpm keyboard` | Checks each control with the keyboard alone at 1440 × 900 and 390 × 844. |

## Sound

| Command | Action |
|---|---|
| `pnpm loudness [--demo <id>]... [--fit [--write]] [--check]` | Measures the loudness of each demo at the output of the app (design 6.8). `--fit --write` writes `DEMO_LOUDNESS`, and `--check` fails a demo off `TARGET_LOUDNESS`. |

## Pose and body probes

These probes need no build and change no source file. [`rigging.md`](rigging.md) gives the roles.

A hold fix loops on the fast probes first: `hold-reach --set` (about 1 s) and `wind-grip --set`
(about 11 s). Run `hold-fit` and `arm-check` (2 to 6 minutes) only on the last variants, with all
variants as `--set` options of one run.

| Command | Action |
|---|---|
| `pnpm pose-probe <sheet> [--time <s>]...` | Prints the posed elbow, wrist, and palm of each arm of a sheet pose (design 7.1), and the tip direction of the instrument. |
| `pnpm pose-preview <role> [--moments <list>] [--skin] [--glb <file>]` | Writes the app pose of the first player of a role for `tools/blender/studio_preview.py` into `scratch/pose-preview/<role>.json` at the moments of `ROLE_VIEWS`. `--skin` adds the skins of its `--check`. |
| `pnpm pose-depth <role> [--demo <id>]... [--every <n>] [--base <ref>]`, or `<role> --where <bone> <demo>:<time>` | The clearance sweep of a role (design 9.3): the deepest point and the share over the limit of each moving part in each obstacle. In the work loop, sweep one demo with `--every 4`, and run one full sweep at the end of a round. The row `tree` is the working tree. `--where` gives the corners of a bone in the axes of the instrument. |
| `pnpm hold-scan <role> [--grid <path>=<a>:<b>:<step>]...` | Scores the grids and the moves of a bowed instrument around its end, on 12 play samples of one demo. The hair cell of a bow arm that reaches no hair, or less than 0.1 m, has the mark `no reach` or `short` (`tools/bow-warning.ts`). `pair-scan` marks it too, and `pose-depth` and `hold-fit` print a warning. |
| `pnpm pair-scan <role> --pairs <set>:<part>:<obstacle>,...` | Scores the base and named variants on chosen pairs of parts. |
| `pnpm trunk-form <role> [--base <ref>]` | Measures the form of the trunk of the first player in the bind and in the worst pose of each set. |
| `pnpm body-shape <role> [--base <ref>]` | Measures the body form of design 4.4 ("Replacing body") and the rest pose of a role. |
| `pnpm hold-reach <species> [--instrument <id>]` | Measures the reach of the arms to the instrument (design 4.6). `--instrument harp` gives the spare reach of each arm to each string (`tools/harp-reach.ts`). |
| `pnpm hold-fit <role> [--set <changes>]... [--base <ref>]`, or `--scan` | Fits a hold of a role, one row for each variant: the folds, the depths, the note-target errors, and the play turns of the arms. |
| `pnpm wind-grip <role>...` | Measures each paw on its tube over each sample set, and tells if it grasps the tube. |
| `pnpm fold-probe <role> [--faces <n>] [--base <ref>]` | Gives the share of the samples of each set in which a face of the studio skin folds. |
| `pnpm arm-shape <role> [--rings]` | Measures the twist along the upper arm, the flat and girth shares of four rings, and the shoulder spikes. |
| `pnpm arm-check <role>... \| --all [--base <ref>] [--views <dir>]`, or `--world --base <ref>` | The arm gate (design 4.4): the `ARM_LIMITS` of each arm over the fold samples and the moves, with `FAIL` (exit code 1), `OPEN`, `WORSE`, `REBIND`, or `PASS`. A value worse than the base fails only past `NEAR_LIMIT` of its limit. `--world` gives the largest move of the arm joints and turn of the palms against the commit, with `SAME` or `MOVED` (exit code 1). |
| `pnpm cast-matrix [--roles <list>] [--species <list>] [--quick] [--base <ref>]` | Recasts each species into each role with the shared hold and the size rule (design 4.4), and writes a table of `PASS`, `OPEN`, or `FAIL` with the worst arm gate value and the deepest clip. |
| `pnpm bind-supination <species> [--glb <file>]` | Gives the bind supination of each paw by the rule of design 4.4, with the signed paw twists of each role. For a hand rig, key the values in the Action `bind` of its `.blend`. |
| `pnpm carry-check <role,...> [--base <ref>]` | Measures the turns of the violin or the viola against the left paw over each lift and lowering, and the detour of the instrument from the short arc of each move. A detour near 0° turns the short way. |
| `pnpm body-probe [--out <file>]`, `--compare <a> <b>`, or `--base <ref>` | Probes the rest joints and a mesh hash of each species, and a hash of the poses of each player of each demo. `--compare` and `--base` fail on a difference. |
| `pnpm camera-probe [--out <file>]`, `--compare <a> <b>`, or `--base <ref>` | Prints a hash of the camera of `cameraAt()` for each demo (design 5.6). `--compare` and `--base` print the changed samples. |
| `pnpm sight-lines [--demo <id>]...` | Prints for each demo the players that do not see the head or the baton paw of the conductor (design 4.5), with the main blockers, and the players that the default view or the wide shots do not see. The count is a report with no goal. |
| `pnpm beat-rates [--demo <id>]... [--limit <bpm>]` | Prints the rate of each beat or note motion over a song (design 5.1, 5.4), and fails above the limit. |
| `pnpm clip-probe [--demo <id>]... [--base <ref>]` | Finds the clips of all players over the whole song. Of the body, it tests the paws only: use `body-clip` for the trunk, the arms, and the legs. |
| `pnpm body-clip <role\|<species>:<instrument>> [--demo <id>]... [--step <s>] [--limit <H share>] [--json <file>] [--set <changes>]...`, or `--demo <id>...` | Measures how deep each body region (the arms, the trunk, the head, the legs, and the tail) goes into each closed part of the instrument and into the seat, over the play, the lift, the rest, and the lowering. A row gives the depth in cm and in H, the share over the limit, the worst time, and `CLIP` (exit code 1) or `PASS`. The default limit is 0.045 H. Only closed shells count: a tube with no end caps drops out of the measure. |
| `pnpm shot-trace <demo> [--from <s>] [--to <s>]`, or `--rules` | Prints the choice of the shot planner at each cut (design 5.6). |
| `pnpm plan-time [--base <ref>]...` | Times `prepareShots()` on each demo (design 5.6) on each tree, in turns. |
| `pnpm light-probe [--look <JSON>]` | Prints the light on the players by row, and the lux for a goal. |

## Rig tools

Blender 5.2 or later comes from the variable `BLENDER`, or from the path.

| Command | Action |
|---|---|
| `pnpm rig-export <animal> [--blend <file>] [--out <file.glb>]` | Exports the hand rig `assets/models/<animal>/tripo-hand/<animal>.blend` (design 4.4, "Hand rig") into `<animal>.rig.glb` and the summary `<animal>.rig.json` with headless Blender. It stops at the first fault of the layout (exit code 1). |
| `blender -b --factory-startup --python tools/blender/simple_rig.py -- <config.json> --out <file.blend>` | Rigs a clean quad source by the simple route (design 4.4) with the config of `tools/mesh-rigs/simple/`, into the `.blend` of a hand rig. Then run `pnpm rig-export` and `pnpm studio-body`. |
| `pnpm hand-chain <species> [--build]` | Rebuilds the hand rig of a Tripo body from its chain in `tools/blender/hand/<species>/` (`tools/hand-chain.sh`): the rig config, the `.blend` in headless Blender, `rig-export`, and `studio-body`. `--build` then runs `pnpm build`. It stops at the first fault with the tail of its log in `scratch/hand/<species>/`, and prints the head height and the seat height. |
| `pnpm rig-trial <animal> <role> <tag> <step.py\|-> [--base <tag>] [--probes fold,depth] [--pair <tag>]`, or `<animal> --apply <tag>` | Tries a scripted edit of a hand rig on the copy `scratch/trials/<animal>/<tag>.blend` (contract: `tools/blender/rig_trial.py`), exports it, and renders the close views into `reports/trials/<animal>/<tag>/`. The default base and the target of `--apply` are `assets/models/<animal>/tripo-hand/<animal>.blend`. `--apply` runs the steps on that file, and keeps the result only when its GLB file equals the GLB file of the trial. |
| `pnpm bind-view <file.blend> [--box <box>] [--view <axis>] [--pose <file> --moment <name>]` | Draws a part of the seated bind with its vertex ids (`tools/blender/bind_view.py`), and prints its thin faces and sharp edges. `--pose` draws the app pose of a file of `pose-preview --glb`. |
| `blender -b --factory-startup --python tools/blender/studio_armature.py -- <animal> --out <file.blend>`, or `--drive` or `--rolls <file.blend>` | Starts the hand rig of a new species: the source mesh with `add_surface()`, the armature at the joints of `tools/mesh-rigs/<animal>.json`, and the Action `bind` of its seat rules. `--drive` keys the arm segments of the Action `bind`, and `--rolls` gives each bone the roll of its hint. |
| `blender -b --factory-startup <copy.blend> --python tools/blender/studio_preview.py -- --check <pose.json>` | Prints for each moment of a file of `pose-preview --skin` the largest gap of the preview from the GLB skin and from the app skin. |
| `blender -b --factory-startup --python tools/blender/mannequin.py -- <human\|animal> --out <dir>` | Writes the test mannequin of a preset (design 4.4) as GLB and FBX files, with the test clips (`assets/models/mannequin/README.md`). |
| `pnpm mixamo-import <file> --out <dir>` | Converts a Mixamo file into a GLB file in meters with one animation for each take (design 4.4). The folder must be one that git ignores (design 8.1). |
| `pnpm glb-point-edits <edits.json> [--out <file.glb>]` | Writes the point edits of an edit file into the rig GLB file of its base commit (design 4.4). It stops at another SHA-256 of the base. `--out` writes a trial file for `--glb`. |
| `pnpm studio-body <animal> [--inspect]`, or `--heights` | Writes `src/models/studio/<animal>.ts` from `glb` of `ANIMALS`, with no Blender, and then `src/models/studio-heights.ts`. `--heights` writes only the heights file. `--inspect` prints the joints and the clips. |
| `pnpm regen-studio [<animal>...]`, or `--heights` | Runs `studio-body` for each animal (default: all) and `--heights`, and prints `same`, `DIFF`, `NEW`, or `FAIL` for each file against `HEAD`. Code: `tools/regen-studio.sh`. |
| `pnpm view-point [<x>,<y>,<z>]...` | Projects each point into the default view with no render, and prints its pixel and its depth. |

## Tests and scripts

All tests are paused ([`workflow.md`](workflow.md), "Tests").

| Command | Action |
|---|---|
| `pnpm test` | Runs the Vitest project `unit` (design 9.3). During the pause, it runs no test. |
| `pnpm test:paused [--base <ref>] [<path>]...` | Runs the paused tests, or only the file of each path. `--base` prints only the failures of the working tree. |
| `pnpm test:perf` | Runs the speed tests (`*-speed.test.ts`) one file at a time. |
| `pnpm test:e2e` | Runs the Playwright tests of `e2e/*.e2e.ts` on the built site, on the port `PAWCHESTRA_E2E_PORT` (4182 by default). |
| `pnpm e2e-base <ref>` | Runs the Chromium e2e tests on the working tree and on `<ref>`, and prints the failures of the tree that pass on the base. |
| `pnpm smoke` | Runs the smoke test on the Vite dev server: the bow arm of a violin and the camera modes. |
| `pnpm round-checks [--fast] [<log dir>]` | Runs the end checks of a round (`AGENTS.md`, "Checks") one at a time, each into `<log dir>/<check>.log` (default `scratch/checks/`), and prints `<check> exit <n>`. `--fast` skips the smoke test. Exit code 1 when a check failed. Code: `tools/round-checks.sh`. |
| `pnpm frame [--demo=<id>]` | Measures the frame target of design 9.7 in Google Chrome with a Metal System Trace (`tools/measure-frame.ts`). About 3 minutes. |
| `pnpm frozen [--base <ref>]` | Renders the four frozen shots. `--base` also renders the commit, and exits with 1 when a pixel changed. |
| `pnpm cpu-profile [--demo <id>]` | Profiles the main thread during play, and prints the top functions for each frame. |
| `pnpm frame-compare <ref\|patch>...` | Measures `pnpm frame` in turns on each commit, or on `HEAD` with each `.patch` file, and compares the frozen shots. |
| `tools/check-commits.sh <base>` | Checks each commit of `<base>..HEAD` ([`workflow.md`](workflow.md), "The check script"): the lint, the typecheck, the format, and the tests that a commit reaches. |
| `tools/measure-lock.sh run --owner <name> -- <cmd>`, or `status` | The fair lock of the timed measures ([`workflow.md`](workflow.md), "Performance rounds"). |
| `tools/merge-worktree.sh [--into <path>] [--resume] <name> [<base>]` | Merges the round of `.claude/worktrees/<name>` into the main checkout with cherry-picks ([`workflow.md`](workflow.md), "Where to work"). Its head comment gives the steps and the exit codes. |
| `tools/base-tree.sh <ref>` | Extracts a commit into a temporary folder with a link to `node_modules`, for a base run of a tool with no `--base`. |
| `tools/break-test.sh '<perl expr>' <file> <test files>...` | Applies one temporary break to a tracked file, and prints each test that fails. |

## CI

CI (`.github/workflows/ci.yml`) runs the checks of design 9.2 on each push, with no deploy.

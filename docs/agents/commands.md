# Commands

This module of `AGENTS.md` lists the commands and the steps of CI. Use Node 24 or later, and the
pnpm of the `packageManager` field of `package.json`.

The head comment of a tool file gives the details and each option: `tools/<name>.ts` for
`pnpm <name>`, unless the row names another file. `--help` prints only the usage line.

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
| `pnpm deploy:vercel [--preview]` | Builds the site at the base path `/` with Vercel Web Analytics (`ZOOPHONY_ANALYTICS=1`, design 2.7), and deploys `dist/` to the Vercel project `zoophony` with the routes of `vercel.json` (design 9.2). It needs a logged-in Vercel CLI. `VERCEL_SCOPE` selects a team, and `--preview` makes a preview deploy. About 2 minutes. |
| `pnpm load-probe [--phone] [--repeat] [--base <ref>] [--profile] [--runs <n>] [--out <file>]` | Measures the load of the default demo after `pnpm build`, as the median of the runs: FCP, LCP, the first frame, the time until play is ready, the blocking time, and the bytes. `--phone` gives Fast 4G and a 4x CPU throttle, `--repeat` a second visit with the HTTP cache, and `--profile` a CPU profile with no minify. It runs through `tools/measure-lock.sh`. About 10 s for each desktop run. |
| `pnpm lighthouse [--quick] [--desktop] [--url <url>] [--preset mobile\|desktop] [--runs <n>] [--out <file>]` | Audits the page with the pinned Lighthouse after `pnpm build`, with the simulated throttle of the mobile and the desktop preset. With no `--url`, it serves `dist/` as Vercel does at 40 Mbit/s (`tools/site-server.ts`). It prints the median of 3 runs of each preset: the four scores, FCP, LCP, TBT, CLS, SI, the LCP element, the long tasks, and each failed audit. `--quick` runs one preset one time: mobile, or desktop with `--desktop`. It runs through `tools/measure-lock.sh`. About 15 s for each run. |
| `pnpm typecheck` | Runs `tsc` with no output files. |
| `pnpm lint` | Runs `oxlint --type-aware .` with the anti-slop plugin. |
| `pnpm format`, `pnpm format:check` | Formats the source paths with oxfmt, or checks their format. |

## Images

| Command | Action |
|---|---|
| `pnpm screenshots <dir> [--sheet] [--play] [--ui] [--drawer] [--load] [--shots]` | Writes the review screenshots of design 9.8 as WebP files of at most 300 kB: each demo at 1440 × 900 and 390 × 844, the gallery, the animal views, and the sheets. The flags add close views, play frames, UI states, and camera shots. |
| `pnpm share-image [--out <file>]` | Writes `public/share.jpg` (design 7.4): the default demo during play from `SHARE_CAMERA`, with the layer of `tools/share-card.ts`, at 1200 × 630 and at most 200 kB. Run it after a change of the look. About 15 s. |
| `pnpm snapshot` | Saves the play frame of the default demo and a close view of each gallery model into `scratch/snapshots/<date>-<hash>/`. |
| `pnpm sheet-check <sheet> <dir>` | Compares a sheet page of `views.html` with its sheet in `docs/reference/` (design 7.1). A matte of `tools/sheet-mattes/` adds the silhouette IoU of each view. |
| `pnpm choir-check <dir>` | Puts the gallery penguin beside a penguin of each of the two newest reference images. |
| `pnpm close-views <role> <dir> [--moments <list>] [--views <list>] [--probe <p>] [--lineup] [--sheet] [--base <ref>] [--glb <file>] [--set <changes>]...` | Writes the moments and the views of `ROLE_VIEWS` of a role, and a grid. `--moments` takes a share of a move, such as `lift30`. `--lineup` gives a row of the base, the tree, and each `--with` role for each of the four views. `--base --sheet` puts the base row above the tree row, cut to `--box`. `--target head` gives 3x face crops, and `--aim <x>,<z>,<height>` points the line camera of the conductor. Each `--set` goes into `set-<n>/`. 25 s to 45 s. |
| `pnpm close-views <mode> <dir> ...` | The other modes: `lineup <species,...>`, `species <species,...>`, `batch` (the image set of a round, 90 s to 260 s), and `play`. `play` renders `--demo` or `--midi`, in the venue of `--scene` (`hall` or `forest`), at each `--time` or `--strip <from>:<step>:<count>`, from `--camera` (a name, a drag, or JSON), `--camera-file`, `--cinematic`, `--shot <seat>`, or `--at <seat>` with `--azimuth`, `--zoom`, and `--elevation`. `--pause` renders the rest pose, and `--base` adds the commit. A camera in JSON moves only in the build of the tool, so with `--url` it shows the default view. With `--url`, use a drag camera, such as `250,0,0`. |
| `pnpm close-views audit <dir> [--roles <role,...>] [--base <ref>]` | The audit sheet of the seams: 2x crops of the arms and the upper trunk in each moment of each role, from six views at 20° and 40°, with the commit above the tree. It writes `<dir>/<role>-e20.png` and `<role>-e40.png`. All roles with no base: about 27 minutes. |
| `pnpm look-lab <dir> [--url <url>] [--scene <id>]`, `pnpm look-variants <file> --out <dir>` | Measure frames of `close-views play` against `orchestra-latest.png`: one tree, or each variant. A variant with the key `scene` renders that venue. The table "Whole frame" gives the mean color and the median luma of a 3 by 3 grid of the camera `default` against the reference of the venue, such as `forest.webp`. 40 s each. |
| `pnpm keyboard` | Checks each control with the keyboard alone at 1440 × 900 and 390 × 844. |

## Sound

| Command | Action |
|---|---|
| `pnpm loudness [--mix <name>] [--demo <id>]... [--file <path>]... [--fit [--write]] [--target <LUFS>]... [--json] [--check] [--wav <dir> [--seconds <s>]]` | Renders each demo in Node, and sends it through `output-chain.ts` in headless Chromium with the mix bus `--mix` (`hall` by default, design 6.8). It prints the loudness and the gain reduction of the glue compressor and the limiter. `--fit` gives the `DEMO_LOUDNESS` of the preset for `TARGET_LOUDNESS`, and `--write` writes these rows into `demo-loudness.ts`. `--file` measures and fits a MIDI file that is not a demo, at 0 dB with the stage mix of its score, with no checksum row. `--check` fails at more than 0.5 LU from the target or above -1 dBTP: run it for each preset. `--wav` writes the output at the app gain as a 16-bit WAV file, and `--seconds` cuts it. About 25 s for each demo. |

## Pose and body probes

These probes need no build and change no source file. They read the demos and the percussion test
score of `tools/probe-demos.ts`. [`rigging.md`](rigging.md) gives the roles.

| Command | Action |
|---|---|
| `pnpm pose-probe <sheet> [--time <s>]... [--set <changes>]...` | Prints the posed elbow, wrist, and palm of each arm of a sheet pose (design 7.1), in head heights from each shoulder joint, and the tip direction of the instrument. About 1 s. |
| `pnpm pose-depth <role> [--demo <id>]... [--soloist <species>] [--set <changes>]... [--per-bone] [--every <n>] [--gaps] [--targets] [--goal <cm>] [--base <ref>] [--glb <file>]`, or `<role> --where <bone> <demo>:<time>` | The clearance sweep of a role (design 9.3): the deepest point and the share over the limit of each moving part in each obstacle and of a held instrument in the body. `--targets` adds the note-target errors, and `--base` marks `GROWS`. `--where` gives the corners of a bone in the axes of the instrument. 10 s to 5 minutes. |
| `pnpm hold-scan <role> [--set <changes>] [--grid <path>=<a>:<b>:<step>]... [--move <axis>=<a>:<b>:<step>]...` | Scores the grids and the moves of a bowed instrument around its end, on 12 play samples and the rest of one demo: the depth of each arm bone and the instrument, the reached fingerboard and hair, and the cm past the limits. 0.15 s for each variant. |
| `pnpm pair-scan <role> --pairs <set>:<part>:<obstacle>,... [--every <n>] [--at <demo>@<time>]... [--variant <name>=<changes>]...` | Scores the base and named variants on chosen pairs, such as `lower:upper arms:body`: the deepest point, the share over the limit, and its sample. About 10 s for each demo and row with `--every 4`. |
| `pnpm trunk-form <role> [--sets <set>,...] [--from <f>] [--to <f>] [--base <ref>]` | Measures the trunk of the first player in the bind and the worst pose of each set: the gap to the convex hull, the dents over 2 mm, the largest turn between cuts, and the angles between light faces. 1 s. |
| `pnpm hold-reach <species> [--instrument <id>] [--support chair\|stand] [--set <changes>]... [--size <scale>]... [--glb <file>]` | Measures the reach of the arms to the instrument (design 4.6): the fingerboard, the bow hair, and the violin-shop scale of a violin or a viola, the spare reach of each palm to the grip of a wind, the slide travel of a trombone, and the strikes within 5 mm of percussion. Less than 1 s. |
| `pnpm hold-fit <role> [--set <changes>]... [--grid <path>=<a>:<b>:<step>]... [--sets <set>,...] [--faces <n>] [--demo <id>\|all]... [--technique <t>] [--base <ref>] [--glb <file>]`, or `--scan` | Fits a hold of a role, one row for each variant: the folds, the deepest point of each sample set, the note-target errors, the mean play turns of the arms, the instrument in the body, the lap rest, and the spare reach of a grip. `--grid` adds up to 40 variants, and `--scan` measures rest variants on one sample. The default demos are `FIT_DEMOS`. |
| `pnpm wind-grip <role>... [--every <n>] [--set <changes>]... [--lines]` | Measures each paw on its tube over the play, the lift, the rest, and the lowering: the gaps of the skin and the tips, the axis distance, the palm angle, and the side. A paw grasps when its tips touch, its palm faces the tube, and it is on the side of the technique. Roles: the winds but the horn, the percussion, `fox-violinist`, and `violist`. About 3 s each. |
| `pnpm fold-probe <role> [--step <s>] [--faces <n>] [--turns <face>] [--bins <face>] [--set <changes>]... [--json <file>] [--glb <file>] [--base <ref>]` | Gives the share of the samples of each set in which a face of the studio skin folds: its normal turns more than 90° from the bind. `--faces <n>` lists the worst faces, with their middles for `weights.rigid`. `--turns` and `--bins` give the arm turns of the folds of a face. `--base` marks the new and the gone faces. 10 s to 40 s. |
| `pnpm arm-look <role>... \| --all [--set <changes>]... [--glb <file>]` | Measures the arm skin against the source mesh over the play: the share of the upper arm edges whose fold angle changes by more than 40° (a crumpled skin), and the axis ratio of the mid upper arm (a flat plank). A value over a limit of the red fox is `FAIL`. About 50 s for each role. |
| `pnpm arm-shape <role> [--set <changes>]... [--rings] [--glb <file>]` | Measures the twist along the upper arm, the flat and girth shares of four rings, and the shoulder spikes in the samples of `pnpm fold-probe`. 25 s to 55 s. |
| `pnpm arm-check <role>... \| --all [--base <ref>] [--set <changes>]... [--variant <name>]... [--glb <file>] [--views <dir>] [--states <ref>,...]`, `<role> --trace <demo>:<from>-<to>`, or `<role> --explain stretch\|flat` | The arm gate (design 4.4): the `ARM_LIMITS` of each arm over the fold samples, and the paw twist and the wrist turn rate of the lifts and the lowerings. Each value gives p50, p95, the worst demo and time, and `FAIL` (exit code 1), `OPEN`, or `PASS`. `--views` writes 2x crops, and `--states` adds a column for each old commit. All roles: 5 to 7 minutes cold, 2 s from the cache. |
| `pnpm carry-check <role,...> [--set <changes>] [--base <ref>]` | Measures the carry of the violin or the viola in the left paw over each lift and lowering, at steps of 0.01 s: the fast steps with opposite turns of the instrument and the paw, the largest angle between their axes, and the largest turn of the instrument in the paw. Three roles: 45 s. |
| `pnpm raise-fit <role> --faces <list> --side L\|R [--bone upper\|forearm\|hand] [--sets <set>,...] [--json <file>] [--glb <file>]` | Fits one `raise` rule of a mesh rig to the folds of the faces: the mean turn of each key of the arm over the folded samples, and a ready entry. `--json` writes it for `rig-mesh --set 'raise+=@<file>'`. 15 s. |
| `pnpm body-probe [--out <file>]`, `--compare <base.json> <new.json>`, or `--base <ref>` | Probes the rest joints and a mesh hash of each species and player, and a hash of the poses of each player of each demo. `--compare` and `--base` print each difference, and fail on it. About 6 s. |
| `pnpm camera-probe [--out <file>]`, `--compare <base.json> <new.json>`, or `--base <ref>` | Prints a hash of the camera of `cameraAt()` for each demo and the total (design 5.6): each `CAMERA_STEP` of each view of `CAMERA_VIEWS`, with the position, the target, the field of view, the beam, the close flag, the light, and the spot. `--compare` and `--base` print each difference. |
| `pnpm beat-rates [--demo <id>]... [--limit <bpm>] [--base <ref>]`, or `--trace <from>-<to> [--player <n>]` | Prints the rate of each beat or note motion over a song (design 5.1, 5.4), and fails above 2 s over `--limit` or a conducted beat of 168. `--trace` prints the spine sway of one player at steps of 0.01 s. 3 s for each demo. |
| `pnpm clip-probe [--demo <id>]... [--jobs <n>] [--set <changes>]... [--variant <name>]... [--base <ref>]` | Finds the clips of all players over the whole song: overlapped seats, a paw in the other paw, a mallet across the other hand, a part in its own instrument, an instrument under the floor, and a part in a near player. A measure clips above 1% of the samples. One file of 1 minute: 6 s. All demos with `--base`: about 8 minutes. |
| `pnpm shot-trace <demo> [--from <s>] [--to <s>] [--cameras] [--base <ref>]` | Prints the choice of the shot planner at each cut (design 5.6): the dropped candidates, the scores, and the refused cameras. Less than 1 s. |
| `pnpm light-probe [--look <JSON>] [--grid <spec>] [--goal <r>]` | Light on the players by row, and the lux for a goal. 1 s. |

## Rig tools

Blender 5.2 or later comes from the variable `BLENDER`, or from the path.

| Command | Action |
|---|---|
| `pnpm rig-mesh <animal> [--preview <dir>] [--check [--set <changes>]... [--roles <list>] [--faces <n>] [--watch <faces>] [--hold <changes>]... [--keep <dir>]]` | Rigs a textured mesh into a studio body GLB file from `tools/mesh-rigs/<animal>.json` (design 4.4). `--check` rigs into a temporary folder, and prints the reach, the budgets, the seat, the standing error, the folds and the tail gaps of each role, the arm joins, and the dark faces with a fix. A `--set` takes JSON for a new key, `<path>+=<JSON>` to add to a list, and `@<file>` for a file. `--keep` keeps each GLB file. Run `pnpm studio-body <animal>` after each write. 20 s to 75 s. |
| `blender -b --factory-startup --python tools/blender/arm_root.py -- tools/arm-roots/<species>.json [--out <file.glb>] [--edits <JSON list>]` | Writes a copy of a source mesh with local edits at the arm root: `flip`, `fair`, `smooth`, `hull`, `push`, and `split`, at the welded vertex indices of `dump_mesh.py`. `--edits` replaces the list for a variant. Rig the copy with `pnpm rig-mesh <animal> --check --set source=<path> --keep <dir>`. A run gives the same bytes. 5 s. |
| `blender -b --factory-startup --python tools/blender/dump_mesh.py -- <mesh.glb> <out.npz>` | Writes the welded vertices (studio units and axes) and the triangles of a mesh into an npz file. |
| `pnpm mesh-options <animal> <dir> --size <label>=<head top>... [--legs <f>,...] [--arms <f>,...] [--instrument <id>]` | Makes the mid-report of a mesh: it rigs each size, leg factor, and arm factor as `rig-mesh --check` does, and writes the measures and the warnings into `<dir>/options.md`. About 7 s for each variant. |
| `pnpm studio-body <animal> [--inspect [--glb <file>]]` | Writes `src/models/studio/<animal>.ts` from `glb` of `ANIMALS`, with no Blender, scaled by the landmark of the animal. A seated role drops onto its seat. `--inspect` prints the joints, the clips, and the arm lengths, and writes no file. |
| `blender -b --factory-startup -P tools/forest-kit/build-kit.py -- assets/forest/forest-kit.glb [--render <dir>]`, then `pnpm forest-kit [--glb <file>] [--check]` | Builds the forest kit from one seed into a GLB file: the parts, one empty for each place around the stage of the default demo, and the rope ends of the light string (`assets/forest/README.md`). `--render` also renders the reference view, the five views, and the sheet of the parts. `pnpm forest-kit` writes `src/models/forest/kit-data.ts` from the GLB file, and prints the triangles of each part and the gzip size. A run gives the same bytes. About 1 s, and 80 s with `--render`. |
| `pnpm forest-cut [--side <m>] [<x>,<y>,<z>]...` | Builds the forest of a stage with no render, and prints the cut groups that each camera drops, with the band and the point of the stage that drop each group (design 4.1). With no position, it tests the default views at 1600 x 1000 and 390 x 844, the left, the right, the back, and the largest distance from the front and from 45°. `--side` sets the stage side. About 1 s. |
| `pnpm view-point [--side <m>] [--size <w>x<h>] [<x>,<y>,<z>]... [--pixel <u>,<v>,<y>]...` | Projects each point into the default view of "Reset view" with no render, and prints its pixel and its depth. `--pixel` prints the point at a height under a pixel. Use it to place a part in a box of a reference image. The stage side of the default demo and 1600x1000 by default. The frame has no drawer and no phone sheet. About 1 s. |

## Tests and scripts

All tests are paused ([`workflow.md`](workflow.md), "Tests").

| Command | Action |
|---|---|
| `pnpm test` | Runs the Vitest project `unit` (design 9.3). During the pause, it runs no test. |
| `pnpm test:paused [--base <ref>] [<path>]...` | Runs the paused tests, or only the file of each path. `--base <ref>` also runs the commit, and prints only the failures of the working tree. |
| `pnpm test:perf` | Runs the speed tests (`*-speed.test.ts`) one file at a time. A heavy load can make it fail. |
| `pnpm test:e2e [--project=chromium]` | Runs the Playwright tests of `e2e/*.e2e.ts` on the built site. Set `ZOOPHONY_E2E_PORT` to a free port (4182 by default, as in CI). |
| `pnpm smoke` | Runs the smoke test on the Vite dev server, with the checks that need the dev hook: the bow arm of a violin and the camera modes. |
| `pnpm frame [--demo=<id>] [--scene=<id>] [--free] [--max-cpu=<percent>] [--gpu-only] [--keep=<dir>]` | Measures the frame target of design 9.7 on the development Mac: `perf-60.mid` in Google Chrome with a Metal System Trace. `--scene=forest` measures the forest venue (design 4.1). About 3 minutes. Code: `tools/measure-frame.ts`. |
| `pnpm frozen [--base <ref>] [--shots <list>] [--out <dir>] [--tree <dir>]` | Renders the four frozen shots (song time and wall time held) into `<out>/tree/`. `--base` also renders the commit, prints the difference of each shot, and exits with 1 when a pixel changed. About 2 minutes. |
| `pnpm cpu-profile [--demo <id>] [--seek <s>] [--sec <n>] [--top <n>] [--in <file>] [--callers <function>[:<line>]]` | Profiles the main thread during play, and prints the self time and the total time of the top functions for each frame. `--callers` sums the time of a function by its callers. About 20 s. |
| `pnpm frame-compare <ref\|patch>... [--runs <n>] [--gate <load>] [-- <flags of pnpm frame>]` | Measures `pnpm frame` in turns on each commit, or on `HEAD` with each `.patch` file: the median of the main thread, the GPU row, and the frame rate with no cap, and the frozen shots against the first item. It takes the measure lock itself, so do not run it inside `tools/measure-lock.sh`, which makes it wait for itself. When the load average is above 8, a run of `frame-compare <base> HEAD` shows whether a failed `pnpm frame` comes from the load. About 5 minutes for each run of an item. |
| `tools/check-commits.sh [--tip] [--no-cache] <base>` | Checks each commit of `<base>..HEAD` ([`workflow.md`](workflow.md), "The check script"): the lint, the typecheck, the format, and the tests that a code commit reaches. `--tip` adds the full `pnpm test` on the last commit. It refuses a merge commit. |
| `tools/measure-lock.sh run --owner <name> [--gate <load>] [--max <s>] -- <cmd>`, `tools/measure-lock.sh status` | The fair lock of the timed measures ([`workflow.md`](workflow.md), "Performance rounds"): a queue of tickets, an optional CPU gate, and a stop after `--max` seconds (900 by default). |
| `tools/merge-branch.sh [--check-only] [--no-arm-check] <branch> [worktree]` | Rebases `<branch>` onto `main`, and checks each commit. It runs the full `pnpm test`, the arm gate of [`rigging.md`](rigging.md), `pnpm build`, and `pnpm size`, then fast-forwards `main` and removes the worktree and the branch. `--check-only` does not merge. Run it from `main`. |
| `tools/break-test.sh '<perl expr>' <file> <test files>...` | Applies one temporary break to a tracked file, runs the test files, restores the file, and prints each test that fails. |

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

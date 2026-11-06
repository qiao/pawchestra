# 9. Process

## 9.1 Repository

- Git, with the branch `main` and many fine-grained commits.
- The code license is Apache-2.0. The animal models are under CC BY-NC 4.0 (the license section
  of `README.md`).
- Each round merges into the local `main`. The project owner decides when to push `main` and
  when to deploy the site (9.2).

## 9.2 CI

GitHub Actions runs these checks:

| Check | Blocks a merge |
|---|---|
| Type check | yes |
| Oxlint, with `.oxlintrc.json` and the anti-slop plugin in `tools/oxlint/anti-slop/` | yes |
| oxfmt format check | yes |
| Vitest (`pnpm test`, with no paused test, 9.3) | yes |
| Size check (7.2) | yes |
| Vitest speed tests (`pnpm test:perf`, 9.3) | paused (9.3) |
| Playwright in Chromium, WebKit, and Firefox | paused (9.3) |
| Keyboard check (`pnpm keyboard`), frame target (`pnpm frame`, 9.7), paused tests | not in CI |

- Headless WebKit and Firefox on Linux have weak support for WebGL2 and audio output, so their
  Playwright runs do not block a merge (`continue-on-error: true`).
- The Linux runners have no GPU, so Chromium uses ANGLE on SwiftShader. The slow frames of
  SwiftShader make the keyboard check fail, and the frame target needs the GPU of the development
  Mac, so both checks stay local.
- While all tests are paused (9.3), the step `pnpm test:perf` and the job `playwright` have
  `if: false`. To end the pause, set `ALL_TESTS_PAUSED` of `vite.config.ts` to false, set the
  default of `MERGE_E2E` in `tools/merge-branch.sh` to 1, and remove each `if: false`. Then run
  `pnpm test`, `pnpm test:perf`, and `pnpm test:e2e` before the next merge.

`pnpm deploy:vercel` builds the site at the base path `/` with Vercel Web Analytics (2.7), and
deploys it to Vercel, with the routes of `vercel.json`: the cache headers and the Markdown copies
of 7.4. The routes use the form
`routes`, because only a route after `handle: filesystem` can send `404.md` with the status 404. CI does not deploy. `PAWCHESTRA_BASE` sets a different base path, and each
URL of the app starts from `import.meta.env.BASE_URL` or `import.meta.url`. The files of `assets/` and the preset files have a content hash in their
names, so they stay in the cache for one year with no new check. `index.html` and
`sf/index.json` hold the new names, so the browser checks them on each load. The demo files keep
their names, so they stay in the cache for one hour.

## 9.3 Tests

All tests are paused, because they took too long while the project changes fast. The switch
`ALL_TESTS_PAUSED` of `vite.config.ts` puts each unit test file into the Vitest project `paused`,
which `pnpm test`, CI, and the check scripts skip. No test is deleted. While the pause lasts, a
change adds no test and runs no break test, unless the project owner asks, because a test that no
check runs goes out of date. A change that needs a check runs one file with
`pnpm test:paused <path>`. A section of this design that names a paused test keeps its rule.

- Vitest tests the pure modules, all rules of section 3, and the demo files (8.3, 8.5).
- A test checks behavior, such as no clipping and the budgets. It pins no tuned value, no hash,
  and no geometry of a look, because a deliberate change of the look would then edit the test. A
  limit leaves a clear margin, and its comment gives the reason.
- A speed test (`*-speed.test.ts`) compares its work with a reference work in the same run
  (`src/test-speed.ts`), and keeps the least time of many rounds, because load only adds time.
- The clearance sweep of each role (`SWEEP_ROLES`) measures the depth of the paws, the arms, and a
  held part in the body and the instrument. A real player touches the instrument with the body,
  and the instrument does not go into the body (`INSTRUMENT_CONTACT`). `pnpm pose-depth <role>`
  prints the same depths, with the region of the body and the part of a bowed string at each
  deepest point (`BODY_REGIONS`, `bowedPlace()`), so that a hold fit sees the cause of a clip.
- The Playwright smoke test (`e2e/smoke.e2e.ts`) plays the default demo on the built site, so that
  it tests the files that deploy. The built site has no dev hook, so `App` writes the song time
  into the attribute `data-song-time` of the stage canvas.

## 9.4 Manual test before each release

Test on real Safari on macOS, real Safari on iOS (also with the silent switch on, 2.4), and
Android Chrome. In real Safari, the hall loads from its FLAC file (6.8). The author of spessasynth
does not test on Safari, and Playwright WebKit is no real Safari, so this manual test is
necessary.

## 9.5 Order of work

The steps put the largest risks first. A step is done only when its "done" criterion is true and
its review (9.8) is done. `TODO.md` splits each step into tasks, and holds the status of the work.

| Step | Work | Done when |
|---|---|---|
| 0. Skeleton | Vite, TypeScript (`docs/agents/code.md`), Vitest, Oxlint, oxfmt, the size check, the license file, and CI. | A clean clone runs `pnpm install`, `lint`, `typecheck`, `test`, `format:check`, `build`, and `size` with no error, and CI runs the same commands. |
| 1. Audio | The worklet, the Worker decode, and the SF3 split (6). | A demo plays to the end with no dropout in Chrome, Firefox, and Safari, and the step 1 targets of 9.7 pass. |
| 2. MIDI and score | `midi/`, `score/`, and `demos/patches.json` (8.3). | Each rule of section 3 has a test, the demo tests of 8.5 pass, and the step 2 targets pass. |
| 3. Scene | The stage, the light, the camera, and one player in sync. | The default view has the composition of the reference, and the clock target passes. |
| 4. Models | `models/` for all species and instruments, the gallery, and the layout. | The gallery shows each species with its instrument, and the chairs of each demo do not overlap. |
| 5. Motion | `pose/`, the idle motion, the rest pose, the conductor, and `perf-60.mid` of the frame target. | The pose and frame targets of 9.7 pass. |
| 6. UI | The bar, the drawer, the lists, the settings, the credits, the tiers, the file drop, the hash, and the messages of 2.8. | The UI matches `docs/prototype/ui.html` at both sizes, and a keyboard alone can use each control. |
| 6b. Cinematic camera | `shots/` (5.6) and the two camera modes of 2.5. | The shot targets and the frame target pass in Cinematic mode. |
| 7. Deploy | The demo build, the Playwright tests, and the deploy to Vercel. | CI passes on `main`, and the site deploys and plays the default demo. |

## 9.6 Docs

All docs, comments, commit messages, and UI text use ASD-STE100 Simplified Technical English.
The docs keep only the high level and the most important details, because each agent reads them in
each round. `docs/agents/writing.md` gives the length limits.

A new decision goes into its design section with its reason and no history. There are no decision
files. A research result goes into the design, or into a technique reference of
`docs/reference/`. A design section holds the current state, the rules, and the reasons, and names
the constant of a tuned value. The git history keeps the old records.

## 9.7 Targets

The development Mac is an Apple M1 Max with Chrome.

| Target | Value | How to measure | Step |
|---|---|---|---|
| First download | less than 1 MB after gzip | the size check (7.2) in CI | 0 |
| Score build | at most 100 ms for the largest demo | `score/score-speed.test.ts` | 2 |
| Clock | `Player.now()` within 20 ms of the audible time | an offline render, and the two clock methods of 6.7 in each browser | 1, 3 |
| Pose timing | each note event of `poseAt()` within 5 ms of its note, before the seeded offset | `pose/pose-timing.test.ts` | 5 |
| Seeded offset | at most ±20 ms for each player | Vitest | 5 |
| Audio render | at most 1.3 ms for each 128-frame block (half of the budget) | `node tools/measure-targets.ts`, also for a seek and a solo | 2 |
| Frame time | high tier, `perf-60.mid`: GPU time and main-thread time each at most 4 ms for 95% of the frames | `pnpm frame` (`tools/measure-frame.ts`) | 5 |
| Load | the presets of the default demo load and decode in at most 2 s at 50 Mbit/s | `pnpm load-probe` | 1 |
| First sound | the first note sounds at its song time after the downbeat, never late. The count-in starts at most 300 ms after the click | `audio/clock-render.test.ts`, and the first anchor against the click in the browser | 1 |
| Memory | at most 100 MB of decoded samples for each demo | `audio/pcm-memory.test.ts` | 2 |
| Shot plan | `prepareShots()` at most 20 ms for the largest demo | `shots/shots-speed.test.ts` | 6b |
| Camera | `cameraAt()` at most 0.01 ms for each call | the same test | 6b |
| Model shading | `shadeMesh()` of the models of `perf-60.mid` at most 90 ms | `models/shading-speed.test.ts` | 8 |

- Each timed measure runs through the fair lock `tools/measure-lock.sh`, so that two agents on one
  machine do not measure at the same time.
- A timed test fails when the ratio of its work to the reference work is more than 2 times its
  ratio on the development Mac. Thus a loaded machine passes, and a work 3 times slower fails.
- The frame target also holds in Cinematic mode (2.5).
- The GPU time depends on the view: a view of the stage top and the players costs more than a
  view of the dark hall. The shot plan follows the layout, so a change of a model, such as the
  size of the piano, can move the shot of the Metal trace. Before a GPU change counts as a
  regression, compare the frames of the trace time on both commits.
- The GPU time of a frame comes from a Metal System Trace with no frame cap, because at 60 fps the
  GPU lowers its clock and a timer query measures the clock more than the work. Guards check a
  quiet CPU and the highest GPU state.
- A change does not need a `pnpm frame` run. The check runs when the user or the manager asks,
  or for a change whose goal is speed, with the table in the report or the commit message. The
  reason: a run takes about 3 minutes, its guards often refuse the GPU phase while other work runs,
  and a run for each change cost more than it found. CI has no GPU, so this check is local.
- The frame target leaves a margin of about 4 times for an integrated GPU of the Intel Iris Xe
  class. The manual test (9.4) checks a real phone at 30 fps or more at the low tier.

## 9.8 Reviews

No round gets a review agent. The manager reviews each round from the report and the images, and
the project owner judges the look from the images. The implementation agent or a fix agent makes
each requested change as a commit on the same branch. `tools/merge-branch.sh` runs the checks of
each commit, and the arm gate (`pnpm arm-check`, 4.4) for a change of `src/pose/`, `src/models/`,
or `tools/blender/`.

At the end of a step or a round of the look, take the images at 1440 × 900 and at 390 × 844
(`pnpm screenshots`, `pnpm close-views`, `docs/agents/commands.md`). Each close view has a fill
light from the camera, so that the dark side shows. The images of a mesh, a hold, or a clip show
the front, the back, and each side, in the playing pose and in the rest pose. Give the images to
the manager with the report and the results of the targets of the step. The images stay in the
folder `reports/`, which git ignores, because report images made most of the size of the git
history. The hook `tools/git-hooks/pre-commit` stops a commit that adds one.

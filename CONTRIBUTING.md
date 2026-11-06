# Contributing to Pawchestra

This file gives the setup, the commands, the checks, and the rules of a change. The design in
[`docs/design.md`](docs/design.md) is the source of truth for the product. Read the design
section of an area before you change it. A pointer "design X.Y" in the code names the heading
"X.Y" of the design file whose number is X.

## Setup

1. Install [Node.js](https://nodejs.org/) 24 or newer and [pnpm](https://pnpm.io/) 10.
2. Install the dependencies:

   ```bash
   pnpm install
   ```

3. Start the dev server, and open the address that it prints:

   ```bash
   pnpm dev
   ```

The rigging tools (`pnpm rig-mesh`) also need [Blender](https://www.blender.org/). The app and
the other checks do not need it.

## Core commands

| Command | It does |
|---|---|
| `pnpm dev` | Prepares the SoundFont parts and the demo files, then starts the Vite dev server. |
| `pnpm build` | Makes the static site in `dist/` and writes the third-party license file. |
| `pnpm typecheck` | Runs `tsc` with the strict options of `tsconfig.json`. |
| `pnpm lint` | Runs `oxlint --type-aware .` with the anti-slop rules of `tools/oxlint/`. |
| `pnpm format` | Formats the TypeScript and the configs with oxfmt. |
| `pnpm format:check` | Checks the format. CI runs it. |
| `pnpm size` | Sums the gzip size of the first download, and fails above 1 MB. Run it after `pnpm build`. |
| `pnpm frame` | Measures the frame time in a real browser with a GPU. |
| `pnpm test:paused <path>` | Runs one paused test file (see "Tests"). |
| `pnpm body-probe --base main` | Compares the bodies and the poses of the working tree with `main`. |

[`docs/agents/commands.md`](docs/agents/commands.md) gives the probe, image, and rigging tools,
with their options and their outputs.

## Checks

Each commit passes these three checks:

```bash
pnpm typecheck
pnpm lint
pnpm format:check
```

CI runs them, the build, and the size check on each push. Do not read the exit code of a check
through a pipe: `pnpm lint | tail` always exits with 0. Use `set -o pipefail`, or run the check
alone.

`tools/check-commits.sh --tip <base>` runs the checks of a merge on each commit after `<base>`,
and keeps the result of each passed commit in a cache. Run it on a clean tree before you open a
pull request.

## Commits

- Make small commits: one logical change in each.
- Write the subject as a [Conventional Commit](https://www.conventionalcommits.org/), for example
  `fix(pose): smooth the side lean of the pianist`.
- Stage each path by its name. Do not use `git add -A` or `git add .`.
- A change of behavior updates its design section in the same pull request. A new decision goes
  into its design section, with its reason.
- A change that moves the size of the first download by more than 5 KB states the reason in its
  commit message.

## Rules of the code

[`docs/agents/code.md`](docs/agents/code.md) gives the compiler options, the lint rules, and the
code style. These rules of the architecture hold for each change:

- **Pure core.** `midi/`, `score/`, `pose/`, `models/`, `shots/`, and the block scheduler of the
  audio worklet are pure. They get all inputs as arguments, read no clock, use only seeded
  randomness, and touch no DOM. They can use the math classes of Three.js (`Vector3`,
  `Quaternion`, `Matrix4`), and no scene-graph object (`Object3D`, `Mesh`, geometry, material).
  The data that they return stays plain: typed arrays, tuples, or plain objects.
- **Stateless poses.** `poseAt()` calculates each pose only from the score, the scene layout, the
  song time, the wall time, the transport, the audibility of the seats, and the seed.
  `cameraAt()` calculates the camera only from the shot plan, the song time, the transport, and
  the view. Thus seek, pause, speed, mute, and solo are always correct.
- **One score.** The sound and the visuals both come from one `Score`. Each MIDI rule lives in
  `score/`, so the synth and the animals follow the same rule.

The data flow of a frame:

```text
MIDI file ──> midi/ ──> score/ ──> Score ──┬──> audio/ (worklet, SoundFont) ──> speakers
                                            │
                                            └──> pose/  poseAt()   ──┐
                                                 shots/ cameraAt() ──┴──> scene/ ──> canvas
```

## Budgets

- **Size.** The first download is less than 1 MB after gzip (design 7.2). The audio code, the
  Worker, the worklet, and the SoundFont files load with a dynamic import or a fetch after the
  first frame.
- **Frame time.** Each change of `src/scene/`, of a shader, or of the post effects runs
  `pnpm frame`, and gives its table in the pull request. CI has no GPU, so this check is local
  (design 9.7).
- **Licenses.** Before you add a MIDI file, a SoundFont, or a dependency, check the rules of
  design 8.1 and 7.3. Add each new dependency to the third-party license file.

## Tests

All unit tests are paused. `pnpm test` runs no test and passes. In CI, the perf tests and the
end-to-end job have `if: false`. The tests stay in the tree for information:

- `pnpm test:paused <path>` runs one test file.
- `pnpm test:paused --base main` runs all paused tests on `main` and on the working tree, and
  prints only the new failures.

Many paused tests check the look, the fit, or the clearance of the bodies, and the bodies change
often. Some of them fail now. Do not add a test that only repeats the current values. The switch
`ALL_TESTS_PAUSED` of `vite.config.ts` and the `if: false` lines of `.github/workflows/ci.yml`
end the pause.

## Writing

Write the docs, the comments, the commit messages, and the UI text in
[ASD-STE100 Simplified Technical English](https://www.asd-ste100.org/): short sentences, the
active voice, the present tense, and one term for one thing. Do not use em dashes.
[`docs/agents/writing.md`](docs/agents/writing.md) gives the rules and the prose checks.

## Licenses of a contribution

The code is under the [Apache License 2.0](LICENSE). The animal models in `assets/models/` and
`src/models/studio/` are under [CC BY-NC 4.0](assets/models/LICENSE). A contribution to an area
uses the license of that area.

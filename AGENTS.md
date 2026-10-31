# AGENTS.md

Zoophony is a WebGL MIDI player in which low-poly animals play orchestral music on a small stage.
It uses Three.js, TypeScript, Vite, and pnpm, and it is a static site on Vercel.

This file holds the rules that each agent needs in each round. The modules in `docs/agents/` hold
the details. [`CONTRIBUTING.md`](CONTRIBUTING.md) gives the setup and the core commands.

## Where the truth lives

- **Design.** `docs/design.md` is the index of the design files `docs/design/01-*.md` to
  `09-*.md`. The design is the single source of truth for the product. A pointer "design X.Y"
  names the heading "X.Y" in the file whose number is X. Read the section of an area before you
  change it.
- **Conflicts.** When a change conflicts with the design, ask the user when the user is available.
  Else follow the newest request of the user and the reference images, and update the design
  section in the same commit as the change.
- **Reference images.** `docs/reference/orchestra-latest.png` and `orchestra-side.png` are the
  newest target, from two angles. `mockup.png` and `scene.png` are the target of the look,
  `lowpoly-animals.png` of the forms and the facets, and `animals.webp` of the front, side, and
  back views. The sheets `*-views.png` and `*-turnaround.png` show single species. The images win
  over the values that design 4.5 to 4.7 names. Design 1 says which image wins where they differ.
- **Technique references.** The motion of each player follows a real musician. The target of
  each family is its reference in `docs/reference/`: `string-technique.md`, `wind-technique.md`,
  `percussion-technique.md`, `harp-technique.md`, and `piano-technique.md`, with a source for each
  fact. A change of the motion updates the section "Use in the app" of its reference in the same
  commit.
- **UI.** `docs/prototype/ui.html` and its screenshots in `docs/prototype/`. Design 2.8 gives the
  tokens and the exact message texts.
- **Assets.** `demos/README.md`, `assets/soundfont/README.md`, `assets/hall/README.md`, and the
  `README.md` of each folder of `assets/models/` give the sources, the licenses, and the checksums.
- **Bodies.** The table "Bodies and roles" of [`docs/agents/rigging.md`](docs/agents/rigging.md)
  gives the body and the role of each species.
- **Tasks.** Take the next task from `TODO.md`, and follow the rules at its top. A step is done
  when its "done" criterion is true and the manager accepts the report and the images (design
  9.8).
- **Low-poly studio.** `lowpoly-studio/` is a separate project, outside the rules of this file.

## Hard rules

- **Pure core.** `midi/`, `score/`, `pose/`, `models/`, `shots/`, and the block scheduler of the
  worklet get all inputs as arguments, read no clock, use only seeded randomness, and touch no
  DOM. They can use the math classes of `three/src/math/`, such as `Vector3` and `Quaternion`,
  and no scene-graph object, such as `Object3D`, `Mesh`, `Bone`, a geometry, or a material. Their
  results stay plain: typed arrays, tuples, or plain objects. A point or a rotation at a module
  boundary is a `Vec3` or a `Quat` of `models/tuples.ts` (design 7.1). A module scratch object
  holds no state.
- **Stateless poses.** `poseAt()` calculates each pose only from the score, the scene layout, the
  song time, the wall time, the transport, the audibility of the seats, and the seed. Thus seek,
  pause, speed, mute, and solo changes are always correct. `cameraAt()` calculates the camera only
  from the shot plan, the song time, the transport, and the view (design 5.6).
- **One score.** The sound and the visuals come from one `Score`. Put each MIDI rule in `score/`.
- **Size budget.** The first download is less than 1 MB after gzip (design 7.2). Load the audio
  code, the Worker, the worklet, and the SoundFont files after the first frame. A change that moves
  the size by more than 5 KB states the reason in its commit message. Raise the limit only with
  the approval of the user.
- **Licenses.** Before you add a MIDI file, a score, a SoundFont, or a dependency, check design 8.1
  and 7.3. Add each new dependency to the third-party license file.
- **Privacy.** Keep the personal data of the user out of each request to an outside service: no
  email address or name in a header, a User-Agent, a URL, or a payload. When an API asks for
  contact data, send a neutral value such as `zoophony-build/1.0`.
- **Frame time.** Each change of `src/scene/`, of a shader, or of the post effects runs
  `pnpm frame`, and gives its table in the report or the commit message (design 9.7).
- **Work order.** Follow the steps of design 9.5. The largest risks come first.

## Work rules

- **Where.** An agent that works alone commits on `main` in the main checkout. An agent that works
  beside another agent works in its own worktree and branch. Push nothing.
- **Commits.** Make very fine-grained commits: one logical change in each, with a Conventional
  Commit subject. Stage each path by its name, never with `git add -A` or `git add .`.
- **Checks.** Each commit passes `pnpm lint`, `pnpm typecheck`, and `pnpm format:check`. Before
  your report, run `tools/check-commits.sh --tip <base>` one time in the background, with a clean
  tree.
- **Tests.** All tests are paused. A change adds no test and runs no break test. A change that
  needs a check runs one file with `pnpm test:paused <path>`.
- **Docs.** A change of behavior updates its design section in the same session. A decision goes
  into its design section with its reason, and a research result into the design or a technique
  reference. Write all prose in ASD-STE100 Simplified Technical English, with no em dashes, and run
  the prose checks of [`writing.md`](docs/agents/writing.md).
- **Length.** Keep each doc in its limit of [`writing.md`](docs/agents/writing.md). A design
  section holds no history and no tuned value.
- **Processes.** Stop each server and browser that you start, and no other process.

## Modules

| Module | It holds | Read it |
|---|---|---|
| [`workflow.md`](docs/agents/workflow.md) | the docs rules, the commits, the worktrees and the merges, the tests, the probes, the images, and the end of a turn | at the start of each round |
| [`writing.md`](docs/agents/writing.md) | Simplified Technical English, the tells to avoid, the prose checks, the length limits, and TSDoc | before you write a doc, a comment, or a commit message |
| [`code.md`](docs/agents/code.md) | the compiler options, the lint rules, and the code style | before you write TypeScript |
| [`commands.md`](docs/agents/commands.md) | each command with its usage, its main options, its output, and its run time, and the steps of CI | before you run a tool that you do not know |
| [`rigging.md`](docs/agents/rigging.md) | the bodies and their roles, the asset chain, the arm gate, the rebuild of the arms in Blender, the traps, and the brief of a rigging round | before work on a body, a rig, a role, a hold, or a seat |
| [`look-work.md`](docs/agents/look-work.md) | the loop of a round of the light, the colors, or the grade, the look override, and the traps of the look measures | before a round of the light, the colors, or the grade |

# AGENTS.md

Pawchestra is a WebGL MIDI player in which low-poly animals play orchestral music on a small stage.
It uses Three.js, TypeScript, Vite, and pnpm, and it is a static site on Vercel.

This file holds the rules of each round. The modules in `docs/agents/` hold the details.
[`CONTRIBUTING.md`](CONTRIBUTING.md) gives the setup and the core commands.

## Where the truth lives

- **Design.** `docs/design.md` is the index of the design files `docs/design/01-*.md` to
  `09-*.md`, the single source of truth for the product. A pointer "design X.Y" names the heading
  "X.Y" in the file whose number is X. Read the section of an area before you change it.
- **Conflicts.** When a change conflicts with the design, ask the user when the user is available.
  Else follow the newest request of the user and the reference images, and update the design
  section in the same commit.
- **Reference images.** The images of `docs/reference/` win over the values that design 4.5 to
  4.7 names. Design 1 gives the role of each image and which image wins where they differ.
- **Technique references.** The motion of each player follows a real musician, and the cinematic
  camera follows a concert film. The `*-technique.md` files of `docs/reference/` give the target of
  each family, with a source for each fact. A change of the motion or of the shots updates the
  section "Use in the app" of its reference in the same commit.
- **UI.** `docs/prototype/ui.html` and its screenshots. Design 2.8 gives the tokens and the exact
  message texts.
- **Assets.** The `README.md` files of `demos/` and of each folder of `assets/` give the sources,
  the licenses, and the checksums.
- **Tasks.** The user gives the task of each round. A step is done when its "done" criterion is
  true and the manager accepts the report and the images (design 9.8).

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
  contact data, send a neutral value such as `pawchestra-build/1.0`.
- **Frame time.** Run `pnpm frame` only when the user or the manager asks, or for a change whose
  goal is speed, and then give its table in the commit message (design 9.7).
- **Work order.** Follow the steps of design 9.5. The largest risks come first.

## Work rules

- **Where.** An agent that works alone commits on `main` in the main checkout. An agent that works
  beside another agent works in its own detached worktree. Push nothing.
- **Commits.** Make very fine-grained commits: one logical change in each, with a Conventional
  Commit subject. Stage each path by its name, never with `git add -A` or `git add .`.
- **Checks.** The user verifies each result by hand in the app. Gates that stay on:
  - At the end of a round: `tools/round-checks.sh`, with `--fast` when the app and the UI do not
    change.
  - The pre-commit hook.
  - The fast loop (`loop`) of the skill `pawchestra-body`, in a body round.

  Each other gate runs only when the user or the manager asks: `check-commits.sh`, the arm gate,
  the clearance sweep, the body probe, the cast matrix, the frame measure, and the image sets.
  This rule wins over the check rules of the modules. A probe that helps you find a cause
  (`fold-probe`, `arm-look`, `pose-depth`, a render) is a tool: use it when it is faster than a
  guess.
- **Tests.** All tests are paused. A change adds no test and runs no break test. A change that
  needs a check runs one file with `pnpm test:paused <path>`.
- **Docs.** A change of behavior updates its design section in the same session. Write all prose
  in ASD-STE100 Simplified Technical English, keep each doc in its limit, and run the prose checks
  of [`writing.md`](docs/agents/writing.md).
- **Processes.** Stop each server and browser that you start, and no other process.

## Modules

- [`workflow.md`](docs/agents/workflow.md): the docs rules, commits, worktrees, merges, probes,
  and images. Read it at the start of each round.
- [`writing.md`](docs/agents/writing.md): Simplified Technical English, the prose checks, and the
  length limits. Read it before you write prose.
- [`code.md`](docs/agents/code.md): the compiler options, the lint rules, and the code style.
  Read it before you write TypeScript.
- [`commands.md`](docs/agents/commands.md): each command with its options, output, and run time,
  and CI. Read it before you run a tool that you do not know.
- [`rigging.md`](docs/agents/rigging.md): the bodies and roles, the routes of a rig, the arm gate,
  and the traps. Read it before work on a body, a rig, a hold, or a seat.
- [`rig-rounds.md`](docs/agents/rig-rounds.md): the brief of a rigging round and the docs
  checklist. Read it before you brief or start a rigging round.
- [`look-work.md`](docs/agents/look-work.md): the loop of a look round, the look override, and the
  traps. Read it before a round of the light, the colors, or the grade.

# Rigging rounds

This module of `AGENTS.md` gives the brief of a rigging round: the work before the brief, the brief,
the rules of a round, the common rules of the agents, and the docs checklist.
[`rigging.md`](rigging.md) gives the bodies, the arm gate, and the traps.

A manager briefs one implementation agent for each round, with no review agent and no test step.

```text
 manager                 agent                      manager
 +--------------+        +------------------+       +-------------------+
 | baseline,    | -----> | rig, hold fit,   | ----> | report, images,   |
 | inspect,     |        | probes, docs     |       | merge, retro      |
 | brief        |        +------------------+       +-------------------+
 +--------------+
```

## Before the brief

The manager runs these commands on `main` and puts the numbers into the brief:
`pnpm studio-body <a> --inspect`, `pnpm pose-depth <role> --gaps`, `pnpm arm-check <role>`,
`pnpm hold-reach <species> --instrument <id>` (with `--glb <file>` for a new file), and
`pnpm build && pnpm size`. The brief gives the posture of a real player from the technique
references of `docs/reference/`.

- When the violin shop rule gives a violin outside the real sizes, ask the user before the round:
  longer arms or a smaller instrument.
- Start a hold round only after each form round of the same body merges, because a form change
  moves the joints.
- Of two mesh rounds side by side, the second makes its docs commits after the first merges.

## Brief

```markdown
# Brief: the <species> as the <role> of the app

Start commit `<hash>`. <On `main`, or worktree `<path>` on branch `<branch>`>. Handoff
`scratch/handoff-<round>.md`. Time box <minutes>. Read `<scratch>/rules-common.md`.

## Goal
<the request in neutral words>. Done when:
1. `pnpm studio-body <a>` writes the module, and the species has the body.
2. <the pose claims: the seat, the feet, the hold>.
3. The role is in `SWEEP_ROLES`, `FOLD_ROLES`, `ROLE_VIEWS`, and "Bodies and roles".
4. `pnpm arm-check <role> --base <start> --views <dir>` gives no `FAIL`.
5. `tools/check-commits.sh --tip <base>` passed, and the docs checklist is true.

## Facts and baseline
<the output of "Before the brief", and the open form rounds of the body>

## Scale, seat, and poses
<the landmark, the seat that fits the legs, and the posture of a real player with its source>

## Range and stop
<the range of each fallback result. Outside it, stop, and report the measures.>

## Report format
Result. Numbers (| Measure | main | round |, and the gate table). Choices. Commits. Images
(with the crop pairs). Open problems and the next step.
```

## Rules of a round

- Commit the mechanism first, with values that change nothing. Then tune with `--set`, and commit
  the tuned values.
- When a measure chooses a value, check that the reference lies inside the range of the variants.
  Else stop, and send the table to the manager.
- When two goals conflict, keep this order: the clearance, the arm gate, the range of the
  instrument, and the look of the hold.
- Run `pnpm pose-depth <role> --glb <file> --every 4` on the first variant of a mesh edit, and
  the full sweep only on the final rig.
- Before a bind move edits a config, gate the straight variant with supination 0
  (`pnpm arm-check <role> --glb <file> --base <start>`). Two parallel rounds run each sweep
  through `tools/measure-lock.sh`.
- Make the images with one `pnpm close-views batch`, from the four sides of
  [`workflow.md`](workflow.md), at a note and at rest. Run `pnpm close-views audit` before the
  report.
- After the commit of the body, run `pnpm test:paused src/shots/` and
  `pnpm body-probe --base <start>`, and give the line of `pnpm size --base <start>`.
- After the merge, ask each agent what would make the next task faster, and apply the items that
  are worth the cost.

## Common rules of the agents

Copy this list into `<scratch>/rules-common.md`.

- Work where the brief says. Read `AGENTS.md` first. On `main`, give the start commit to each
  `--base`.
- Make very fine-grained Conventional Commits, and stage each path by its name.
- Use `perl -0pi -e` for a temporary edit, and the Edit tool for a lasting edit of code.
- Never take ports 5173, 5190, or 4182. Stop each process that you start by its PID.
- Do not edit the working tree while a tool builds the site.
- No merge and no push. End with a clean tree and no rebase in progress.
- Ask no questions when the user is not available. Report each open choice.
- Write all prose in ASD-STE100 Simplified Technical English. Keep the handoff file current.

## Docs checklist

- **A new species.** Design 1 (its reference sheet), 4.3 (the species and the seat heights), 4.4
  (the body and its rig rules), 4.5 (the accent color and the triangles), 4.6 (the instrument
  scale and the reach), 4.7 (the optional bones), 7.1 (`VIEW_SHEETS`), the table "Bodies and
  roles" and the traps of [`rigging.md`](rigging.md), and `assets/models/<s>/README.md` (the
  source, the license, and the checksum).
- **A new role.** The pose index of design 5, the moments of `pnpm close-views` in design 7.1, the
  sweep of design 9.3, and the role column of "Bodies and roles" of [`rigging.md`](rigging.md).
- **A new hold.** The pose index of design 5, design 5.2 (the rest), 5.3 (the hold), and 4.6 (the
  reach). Put each choice and its reason into its design section.

The code lists are `ANIMALS`, `STUDIO_BODIES`, `SPECIES`, `SWEEP_ROLES`, `ROLE_VIEWS`,
`FOLD_ROLES`, and the hold tables of step 6 of "Steps of a new body" of [`rigging.md`](rigging.md).

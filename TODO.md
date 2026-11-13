# TODO

This list holds the open tasks of Pawchestra, under the steps of the work order (design 9.5). It is
the only place for the status of the work. The rules for each task are in the design files of
[`docs/design/`](docs/design.md). The numbers in parentheses name the design sections, and the
index `docs/design.md` gives the file of each section.

## How to use this list

1. Take the first open task. Do the steps in order, and do the tasks of a step in order, unless a
   task says that it can wait.
2. Read the design sections that the task names before you start.
3. Do the task in one or more small commits (AGENTS.md). Put each product choice and its reason
   in its design section. Write no decision file.
4. In the last commit of the work, remove the task from this list. The list keeps no done tasks,
   no review lines, and no history.
5. When the work shows a new problem, add it as an open task under its step, with one line on the
   reason.
6. If a task is blocked, add a line `Blocked: <reason>` under it, and ask the user.
7. When a step has no open task and its "Done when" is true, remove the step.

## Step 1. Audio spike (6, 9.5, 9.7)

- [ ] Check the step 1 list of 9.5 in real Safari on macOS, on an idle Mac and with a load.
      Playwright WebKit drops blocks, because its AudioWorklet thread has no real-time priority.
      Blocked: turn on "Allow remote automation" in Safari, and run `sudo safaridriver --enable`.
- [ ] After the Safari check, remove the `volume` command of `processor.ts` and
      `SynthEngine.setVolume()`. The `Player` sets the volume in the output chain (6.4, 6.8).

Done when: the app plays the Beethoven demo to the end in Chrome, Firefox, and Safari on the
development Mac with no dropout.

## Step 2. MIDI and score (3, 8.3, 8.5, 9.7)

- [ ] Ask the user if the audio render target of 9.7 can use a percentile. In Node, the p99.9 of
      a block is at most 0.53 ms, but each run has a few blocks above 1.3 ms.
- [ ] Make the seek chase fit in one block of 2.667 ms. The first seek in the Boulanger demo takes
      about 4 ms. For example, keep the chase state at fixed points of the event list (6.5).

Done when: each rule of section 3 has at least one test that fails without the rule, the demo
tests pass for all demos, and the step 2 targets of 9.7 pass: the score build, the audio
render, and the memory.

## Step 3. Scene and one player (2.5, 2.6, 4.1, 4.5, 4.7)

- [ ] Measure the clock target of 9.7 with the bow.
- [ ] Measure the steps of `currentTime` in Firefox, and smooth `now()` if the bow needs it (6.7).
- [ ] Remove the top-level await of `src/gallery/views-main.ts`, so that the chunk merge of
      Rolldown works again (7.2). Measure `pnpm size` and `pnpm load-probe` after it.
- [ ] A lamp glow of `createGlows()` (`scene/hall.ts`) wider than about 130 px did not draw on
      the development Mac, but the GPU gives points up to 511 px. Check the hall lamps in the
      close shots, and draw a large glow as a quad.
- [ ] The conductor shot of `pnpm frozen` does not repeat: two runs of `e0ccc347` differ in 22,445
      pixels, by at most 2, at the lamp glows at the top left. A run at the load average 20 gave
      a perf-section shot with 2.2 million changed pixels and a softer blur, and the next run
      matched the base. The automatic tier can drop under load. Find the causes, so that a check
      of a refactor can trust each shot.
- [ ] After a restored WebGL context, run the compile and warm-up steps of a build too
      (`#compileSteps`, `#warmSteps` of `StageScene`). Now the first frame compiles the programs on
      the main thread, and the frames draw with empty maps for about 0.3 s (7.2).

- [ ] The score pages of the conductor desk go through the same height test of `stageBakeAt()` as
      the bevel of the stage lip (4.5). Check them for dark dashes in the close shots.
- [ ] The side glow of the stage switches from the skirt to the lip with a hard test at
      `y = -0.06` inside the face, which gives a stepped edge (4.5). Smooth it.

Done when: the screenshot has the composition of the reference (9.5), and the clock target
passes.

## Step 4. Models and gallery (4.3 to 4.7)

- [ ] Hand chains (4.4): merge the 14 copies of `build.py` in `tools/blender/hand/<s>/` into one
      shared `tools/blender/hand/build.py`. Each copy differs from the wolf copy (1,789 lines)
      by these diff lines: dog 115, hippo 134, monkey 161, pig 275, polar bear 304, deer 320,
      elephant 365, penguin 377, rabbit 458, cat 701, fox 731, panda 733, beaver 825. The
      differences are code, with few values: other versions of `lids`, `own_eyes`, `tail_rows`,
      `tail_vertices`, `thicken_trunk`, and `main` (cat, fox, panda, beaver, rabbit), and functions
      of one species, such as `turn_hooves` (deer, elephant, pig), `split_beak` (penguin), and
      `digits` (polar bear). Plan: (1) move the 6 equal `redits.py`, the 11 equal `rings.py`, and
      the 8 equal `rimport.py` into one shared copy each; (2) merge the near copies first (dog,
      hippo, monkey into the wolf copy), with each code difference behind a key of `params.json`;
      (3) then the hoof group (deer, elephant, pig) and the penguin; (4) then the tail and lid group
      (cat, fox, panda, beaver, rabbit) and the polar bear. After each species, `pnpm hand-chain
      <s>` must give the rig.glb, the rig.json, the studio module, and the config of `HEAD` byte
      for byte.
- [ ] Beaver bassoonist and panda trombonist (4.4): with the continuous elbow ramp and the soft
      clavicle ramp, the arm gate gives folds p95 37 on the right arm of the bassoonist and 86 (83)
      on the right arm of the trombonist (FAIL), while the dihedral angles of the elbow band fall (p95 at rest 106 to
      76 degrees, and 83 to 71 edges over 30 degrees). Find the folded faces with
      `pnpm fold-probe --faces`, and check them in 2x crops.
- [ ] Badger (4.4): with the back rows, the dark slit behind each upper arm is about half as large,
      and a thin dark crease stays in the right view of the xylophonist lift and the cymbalist
      strike (`reports/2026-11-13-c1b/`). The back wall on the clavicle folds in 71% of the lift
      samples of the xylophonist (fold-probe, clavicle_L 192). In a trial, a bind key that moved
      the crease vertices (1370, 1376, 1378, 1381 and their mirrors) 1.5 cm into the trunk cut the
      slit by about a third alone, but added nothing on top of the back rows.
- [ ] Badger (4.4): the elbow rings double the faces of the elbow, so the fold counts by face of
      `fold-probe` and the arm gate rise for some roles, while the bent elbow is round in the
      crops. Measure the folds by area, or by the dark pixels of the elbow, to compare.
- [ ] Rhino tubist (4.4): a faint part of the neck ledge stays at y 0.70 to 0.71 of the source,
      in the back view. A smooth there moves the lowest head vertex and so H. Move only that row
      of the ledge along the neck, or accept the change of H.
- [ ] Monkey trumpeter: a dark band stays under each buttock in the back view: the round form of
      the source that faces down, away from the key light.
- [ ] Monkey trumpeter: two thin faces across the wrists (329 and 1090) fold in each play sample.
      Cut the thin faces, or count their pixels in a probe build.
- [ ] Monkey trumpeter: the trumpet points about 23° below the level with the spine 12° back in
      the play (`MONKEY_TRUMPET.lean`), against "slightly down" of a real player (wind-technique
      2.1). Confirm the backward spine in the app. With the trumpet 20° down on the face, the top
      of the right paw comes to the height of the mouthpiece.
- [ ] Rhino tubist: the main branch is about 15 cm wide at the left grip, so the left paw lies
      against it and does not close around it. A real tubist grips thinner tubing at the side.
      Option: a thin tube at the left side of the tuba model for the left paw.
- [ ] Rhino tubist: `pnpm wind-grip tubist` and `pnpm body-clip tubist` take boulanger-matin,
      in which the tuba rests in about 80% of the play samples, so the play rows show mostly the
      rest. Read the play pose with `--lines`.
- [ ] Pig hornist: the right hoof still lies across the mouth of the bell (`PIG_HORN`). Grips
      nearer to the rim or further out of the bell kept the grasp share at 0% and the palm 90° to
      134° from the bell axis (`pnpm wind-grip hornist`). A hoof at the far rim along the bell
      wall needs a forearm near the bell axis, but the forearm meets the axis at 72° to 89° with
      each turn of the right side of the horn from 35° back to 15° forward, each grip, and each
      elbow, and a hoof off the axis goes through the wall. A cupped paw in the bell needs a paw that fits the throat of
      the horn, a larger horn, or a bell that opens toward the right shoulder.
- [ ] Beaver bassoonist: from the front, the long joint passes in front of the left cheek and the
      whiskers, 4.8 cm from the skin, as the bell of a real bassoonist rises at the left of the
      line of sight (`BEAVER_PLAY_TURN`). Confirm the look in the app.
- [ ] Monkey trumpeter: the right thumb points back to the mouthpiece. A real player puts it under
      the lead pipe between the first and the second valve casing (wind-technique 2.1).
- [ ] Monkey: `STUDIO_MONKEY.seatHeight` is the height of the haunch for a body with no chair. Check
      each reader of the seat height of a body with no chair.
- [ ] Trombonist panda (Tripo body): ask the user to confirm the arm stretch of 1.2 (as on the
      hippo and the deer, 2026-11-12). It lets the panda play the full trombone of the app (0.83 m,
      0.49 of the seated panda) with a slide travel of 13.5 cm at the 7th position, and the slide
      40° below the level. The paws are only 1.0 cm apart in the play: a left grip nearer the
      mouthpiece puts the left paw into the chin.
- [ ] Trombonist panda: the arm gate folds p95 are 75 (left) and 82 (right) after the arm stretch
      (63 and 78 before). Check the paws in 2x crops.
- [ ] Wind slide: the paused test `src/pose/winds.test.ts` (near line 234) expects a linear slide
      map, but `reachedShare` of 2026-11-12 moves the near positions more. Update it when the
      tests come back.
- [ ] Trombonist panda (Tripo body): the arm gate folds p95 are 61 (left) and 73 (right), at the
      finger crease of the paws that curl 130° and 120° around the tubes (the curls of 90° and 110°
      gave 33 and 42, and the paws did not grasp). Check the paws in 2x crops.
- [ ] Panda (Tripo body): the body is larger than the old body at the same H, and the seat is
      0.171 m high (0.277 m before). The players of the four demos with trombones move in the
      layout, by a median of 7 cm to 12 cm, and 17 players more than 0.2 m (the monkeys of
      beethoven-9 1.39 m and 1.28 m, a red fox of boulanger-matin 1.36 m). The seat height and the
      chair size move no player. Check the low chair and the moves with the user.
- [ ] Panda trombonist (5.3): the faces at the front of the right arm root and of the chest under
      the chin fold in each sample (clavicle_R 117,334 fold samples in `pnpm fold-probe
      trombonist`). Cause: the right shoulder bone turns 70° forward (`reach` of `PANDA_TROMBONE`),
      so the front of the right shoulder moves about 0.18 units toward the middle line, which is
      only 0.13 units away. No weight row removes it: the soft clavicle ramp and a chest ramp to
      the middle line only moved the folds. With `--set 'trombone@panda.reach=25deg'`, clavicle_R
      folds 4 samples, but the right upper arm goes 3.3 cm into the belly (45°: 16,490 samples and
      1.7 cm, limit 1.5 cm). Try a lower reach with the right elbow further out.
- [ ] Trumpeter monkey: the body of 1.2 times H with the trumpet of the app folds 47 arm faces in
      the rest sample of `hold-fit`. The arm gate did not run at this scale (folds p95 20 right
      and 26 left, skin twist 44 and 29 degrees at the scale before). Run it, and check the
      elbows in 2x crops.
- [ ] Trumpeter monkey: the body of 1.2 times H moves players in each of the 8 demos with a
      monkey: the second monkey of `beethoven-7-4` and `beethoven-8-4` 1.31 m, a horn pig of
      `beethoven-1` 1.37 m, the clarinet wolf and a horn pig there 0.96 m, and in
      `bach-bwv1047` each player 6 cm back. No monkey comes within 10 cm of a neighbor or
      14.8 cm of a stand. Check the hall views of each demo with a monkey trumpeter.
- [ ] Trumpeter monkey: at rest, with the trumpet in front of the belly (`restShift`), the upper
      arms roll 70.6° and -50.6° from the clavicles (`pose-preview`), more than 45°. The skin twist
      of the arm gate stays 29° and 25°. Check the arms at rest in a 2x crop.
- [ ] Conductor bear: the quiet place of the left hand and the cue point stay at the height of the
      head, as `mockup.png` and design 5.4 give them. Check them against a real conductor, whose
      gestures stay below the chin (`conductor-technique.md`, section 1).
- [ ] Conductor bear: in the steps of the end turn, the hips turn up to about 45° from the
      planted foot (`TURN_STEPS`, 5.4). Check the skin of the hips and the thighs in 2x crops.
- [ ] Conductor bear: at rest, the right arm folds 5 faces (p95, limit 8) against 1 before the
      relaxed arms and the turned rest baton. Check the right wrist in a 2x crop.
- [ ] Conductor bear: in the beat, the baton stands 32° off the forearm (p50, was 53°), nearly all
      of it inward (`batonPivot`, 5.4). A baton 3.5° in gives 19°, but it touches the desk of the
      stand when the arms come down after the final chord of `beethoven-8-4`. Move the baton of
      the lowering clear of the desk, then point the baton less in.
- [ ] Conductor bear: the rest baton hangs 27° forward of the vertical (`restBaton`, 5.4). A baton
      nearer the vertical (22°) turns the right wrist 2,794°/s at the start of a lift (limit
      3,000, the base 1,594). Spread the turn of the paw over the lift, then hang the baton lower.
- [ ] Conductor bear (5.4): with the continuous elbow rows, the left inner elbow faces 443, 5222,
      5223, and 5226 no longer fold at a bend of about 45°. Try a more bent left arm in the ready
      gesture and at a cue (`readyReach`, `cueReach`), and check the faces 4254, 4258, 4259, and
      4262, which fold in up to 6 % of the play at bends of 89° to 142° (`pnpm fold-probe
      conductor --faces`).
- [ ] Conductor bear: in the held final chord and at a climax, the baton points up past the cheek
      in the view from the front right (The Ember Crown 172 s, Mozart K. 525 30.9 s). The sweep
      finds no depth, so measure the gap of the baton to the head.
- [ ] Mouse and beaver: they stand in their seated poses with no chair. Measure their balance (the
      center of mass over the feet), and save the balance probe as a tool.
- [ ] Rhino tubist: ask the user to confirm the stand, the arms of the mesh, the lead pipe, and the
      hold.
- [ ] Rhino tubist: with a tuba of about 10 kg, the center of mass lies at the front end of the
      stable range of the soles. A small lean of the trunk back is an option.
- [ ] Rhino: check the left forearm from az-150 for a flat flap under the arm.
- [ ] Deer harpist: the high left palm (`highL`) and the damp with no press of 2026-11-12 keep each
      paw at most 1.4 cm in the body. Check the high left notes in 2x crops in the app.
- [ ] Deer harpist: the harp of 0.975 changes the right grip on purpose. `pnpm arm-check harpist`
      gives the right grip turn p50 20 (limit 45) against 11 of `ACCEPTED_GRIPS`. After the user
      checks the right paw in the app, write the new grip into `ACCEPTED_GRIPS`
      (`reports/2026-11-13-deer-arms/crops/`).
- [ ] Deer harpist: the harp of 0.975 stands in front of the chest, and the chest touches it.
      `pnpm body-clip harpist` gives 4 clips: the chest 1.5 cm in the neck (2.1 % of the play),
      the chest 1.3 cm in the top of the soundbox (0.7 %), the right upper arm 1.3 cm in the neck
      (0.0 %), and the right hoof 2.6 cm in the side of the base in pedal moves (0.5 %). A move of
      the harp of 0.02 H or 0.02 m puts the chest into the soundbox in each sample. Check the
      chest and the right hoof in 2x crops in the app, or narrow the top of the soundbox.
- [ ] Deer harpist: the arms of 1.5 times the source are 0.69 of the trunk, against 0.52 to 0.65
      for the other bodies (`reports/2026-11-13-deer-arms/lineup/`). Ask the user if the arms read
      too long.
- [ ] Deer harpist: the footprint of the harp of 0.975 moves seats of `boulanger-matin`: the fox
      violinist of seat 7 0.54 m, the contrabass 0.72 m, the small percussion 0.72 m, and seven
      other seats 0.1 to 0.2 m. Check the sight lines to the conductor (`pnpm sight-lines`).
- [ ] Deer harpist: with the forward right rest elbow (`restR.pole`) of the harp of 0.975, the
      right paw twists 82° at rest (p95, limit 170, 26 before), and the right forearm 43° (limit
      80, 15 before) (`pnpm arm-check harpist --base 19f45196b`). Check the right arm at rest in 2x
      crops.
- [ ] Deer harpist: in the fast run near 112 s of boulanger-matin, the right forearm turns 15° in
      one 1/30 s step (`scratch/tripo-audit/motion.ts`). The turn speed is lower than before the
      harp of 2026-11-13 (459 deg/s against 538), but the neighbor steps are slower now.
- [ ] Harp: no source of `docs/reference/harp-technique.md` gives the width and the depth of the
      soundbox of a concert harp at its top. Find one, and check `SOUNDBOX` against it.
- [ ] Deer harpist: 4 left-arm frames turn 15° to 17° in one 1/30 s step (127.5 s and 280.1 s of
      boulanger-matin), where the music gives a move less than 0.2 s.
- [ ] Deer harpist: in the fast run of 109 s to 120 s (about 14 notes/s, pluck 0.021 s) a finger
      close snaps 31° to 45° in one step.
- [ ] Deer: dark facet patches on the tail tip and the back of the left shoulder in the hall light.
      The color map has no dark texel there (`reports/2026-11-12-afix/deer/m4-patches/`), so the
      cause is the shading of flat faces that face away from the key. Four tail faces are flipped.
- [ ] Deer harpist: the left hand plays only up to D4 (`reach.leftHighest`), because the near harp
      puts the higher strings near the chest. A harpist plays up to about C5 with the left hand.
      The arms of 1.3 times the source can reach more: try E4 to G4 with `pnpm hold-fit harpist`.
- [ ] Deer harpist: `HARPIST_SWEEP` accepts a forearm depth of 2.5 cm in the body, but the depth is
      0 cm now. Trim the entry when the tests come back.
- [ ] Hold units: the instrument scales of the species (`harpScale`, `trumpetScale`,
      `bassoonScale`) are set by hand. A size change of a body still needs a manual edit of its
      instrument scale. Tie the scale to H, or give the rule in rigging.md.
- [ ] Hold units: the shared `SHOULDER_HOLD.restGapL` (rabbit fit) and `CELLO_HOLD.pluckSide`
      (dog fit) are now in H, so a recast body (for example `violinist@wolf`) gets the gap at its
      own size. Check the recast violinist and cellist in the cast matrix.
- [ ] Hold units: these body values are still in meters: `MIRROR_IN` of the conductor (0.12 m),
      `HEEL_LIFT.back` of harp-feet.ts (0.15 m), and the `offset` of `UPRIGHT_HOLDS`. Move each one
      to H when its body changes size.
- [ ] Harp strings: ask the user to pick the strength and the density of the bands of the swinging
      strings (`STRING_SWING`, 4.6). In the Cinematic solo shot, the default bands are thin.
- [ ] Harp strings: the bands write no depth, so the depth of field of a close shot blurs a band
      with the depth behind the strings. Check a close shot with a far background.
- [ ] Harp strings: no source gives the decay of the treble strings, so the treble value of
      `STRING_MOTION.ringSec` is an estimate (harp-technique, section 5).
- [ ] Add the chair as an obstacle to the sweeps of the seated roles, with the legs and the haunch
      as parts (`SEATED_PARTS`, `seatSurface()` of `pose/test-sweep-roles.ts`).
- [ ] Penguin singer: ask the user to confirm the Tripo penguin
      (`reports/2026-11-12-penguin/panel.png`) and its hold. The body keeps the choir folder in
      both flippers (design 4.6), with the folder at 0.74 H. Option: the flippers down at the sides
      or a little out, with no folder.
- [ ] Tripo penguin: the roots of the upper flippers go 2.0 cm into the sides in each pose (limit
      1.5 cm, `pnpm pose-depth singer`). The clip is at the root, so the pose does not change it.
- [ ] Tripo penguin: the center of mass lies 8 cm behind the middle of the soles, about 2 cm in
      front of the heels, as in the source. Decide if the bind leans the trunk forward (about
      12°) to put it over the middle.
- [ ] Tripo penguin: in the second half of the blink, up to 18 points of the side edges and the
      back edge of each lid leave the head. The lid and the head are both black. Check a close shot.
- [ ] Tripo penguin: the lower beak turns at the back of the mouth slit, and the chin in front of
      the slit follows it a little. Check the chin and the slit walls from below in a close shot.
      Confirm the beak opening (`CHOIR_MOTION.jaw`) in the app.
- [ ] Tripo penguin: the outer third of each flipper curls about 40° around the folder edge
      (`CHOIR_HOLD.flex`, `CHOIR_HOLD.curl`). Confirm the amount in the app. The palms now meet
      their grips within 3.1 mm (1.0 mm before).
- [ ] Tripo penguin: no round measured the recast roles of the cast matrix on the new body. The
      `raise` shapes of the earlier penguin ("Penguin recast folds") do not apply to it.
- [ ] Red fox and rabbit: the string planes are 9° and 10°, under the real 17°, because larger
      angles fold the right shoulder. Fix the right shoulder in a rig round (string-technique).
- [ ] Panda face: from 30° above, the mouthpiece and the paws hide the smile. Check the smile with
      the user in a close play frame of the stage.
- [ ] Tripo polar bear: the left grip turn p50 is 13° in the play, against 6° on main (limit 45°).
- [ ] Tripo polar bear: the closed lid stands out from the face as a cap (1.25 ball radii). Check
      the blink with the user in a close play frame
      (`reports/2026-11-10-polar-bear-hand-r10/panel.png`).
- [ ] Tripo polar bear: in the 3/4 view, a light lower lip shows under the dark mouth line, so the
      smile can read as a grin with teeth. It is the form of the source lip, not the small mouth
      parts (a dark color on them changed nothing). Ask the user.
- [ ] Tripo polar bear: the green sign of `polar-bear-normal.webp` follows the rabbit and the fox
      maps of the same Tripo export, with no seam test on this mesh.
- [ ] Polar bear pianist: in the play, the arms go up to 6.3 cm (forearms) and 7.4 cm (upper arms)
      into the trunk. In the lowering, 6.7 cm and 6.5 cm.
- [ ] Polar bear hand rig: a pocket stays at the front of each armpit in the chord and the far-left
      keys (0.0102 units, 2.1 cm, below its neighbors after the weight fixes, 4.9 cm before). Ask
      the user: a corrective key `arm_raise_*`, or a point edit of the armpit corner of the mesh.
- [ ] Polar bear pianist: after the soft clavicle ramp, a thinner dark line still shows under the
      right upper arm in the right views (chord, far-left, rest). It is a V groove between the
      bottom of the upper arm and the trunk wall in the reach poses: the line stays with no cast
      shadow (`--probe noshadow`) and with the crease angle 180. The arm rows with a reach of 0.115
      or a softer clavicle ramp change its dark pixels by at most 11%, up or down. Try a corrective
      key `arm_raise_R` that moves the trunk wall under the arm out to the arm in the reach poses.
- [ ] Polar bear hand rig: a soft ledge stays at the top of the right seated thigh near the groin in
      the pedal pose. Check it in the stage light.
- [ ] Polar bear hand rig: the right inner elbow folds up to 15 faces in the play (p95 11, limit 8)
      with the upright trunk and the keys at 1.0 H, and the left arm 8 in the lift. Keys at 1.1 H
      fold 7, but the upright trunk then reaches only 72% of the note targets of `bach-bwv1050`.
      Ask the user: a corrective key at the elbow, or loop edges.
- [ ] Polar bear pianist: from the front, the higher case and the lid hide the bear below the face.
- [ ] Polar bear pianist: at the far keys, the outer upper arm stands 36° to 41° out from the round
      trunk (piano-technique).
- [ ] Polar bear pianist: at rest, the paws lie on the front of the belly in place of the lap, because
      the thighs lie out of the reach of the arms (0.66 m). The lap place of `along` 0.45 to 0.7
      meets the chest or misses the leg on this body (`legTop()`).
- [ ] Polar bear legs: with the thighs 25° down (knee 120° in the bind), the pedal pose folds 5
      thin faces at the back of the right knee (2035, 2036, 3918, 5406, 4201) and 1 of the thigh
      (3917) in each play sample (`pnpm fold-probe pianist`: `shin_R`, `thigh_R`). Check the back
      of the right knee in the stage light.
- [ ] Polar bear hand rig: in the crease where the belly rests on each thigh, the key
      `bind_crotch` turns hidden pocket faces over (edges 2336-2389 and 2386-2388, up to 167°). The
      quad of 1676 to 1679 (right 2456) shows a small dark triangle from a low front side view, and
      the sides of the belly bulge between the thighs read dark from the front sides. Check the
      crease in the stage light (`reports/2026-11-05-polar-bear-crotch/pair-bind-crops.png`).
- [ ] Polar bear hand rig: the bottom of the haunch keeps long thin faces from the rump to the back
      of each thigh in the bind and the play (faces of 1311, 1354, 642, 219, 218). The rows of these
      vertices set the seat top, so no row and no move of `bind_belly` changes them. Loop edges on
      the underside of the haunch can fix them (`reports/2026-11-05-polar-bear-belly/`).
- [ ] Polar bear hand rig: the key `bind_belly` moves the thigh root band up to 7.9 cm forward and
      up, so the side of the haunch is fuller in the bind. Check the side of the haunch in the
      stage light.
- [ ] Polar bear rig: each forearm folds into a hard dark V at the inner elbow in the chord (faces
      574 to 576 on the right). Add loop edges or a corrective shape at the elbow.
- [ ] Polar bear pedals: the case shades the brass pedals, and from the stage camera the bear and
      the keys hide the pedals and the feet. No demo has sustain pedal data (CC 64) on the piano.
- [ ] Polar bear legs: the thigh of the pedal leg pulls the haunch 2.3 cm into the bench pad in the
      play. Keys further away keep the haunch on the pad, but fold the left shoulder more.
- [ ] Polar bear legs: the knee crease of the seated bind makes the thigh near the knee thinner than
      the mesh, and the back of each knee has 6 edges that turn more than 40°.
- [ ] Polar bear legs: the seated thigh keeps one depth from the haunch to the knee, but the source
      tapers. Try point edits or an edge ring split at the outer side of the hip (rigging.md,
      "Rules of the mesh").
- [ ] Polar bear legs: the thighs are short, so the lap is small.
- [ ] Polar bear legs: 4 edges of the crease of the left instep and 4 edges of the cut loop at the
      crotch turn more than 40° in the bind. Check them in the stage light.
- [ ] Polar bear legs: in the bind, 3 faces of the left shin and thigh turn over after the groin
      crease.
- [ ] Polar bear pianist: in the fast passages of `bach-bwv1050`, the head moves about 4 cm to each
      side two times each second. Find a calmer side lean that keeps the reach of the far paw.
- [ ] Polar bear keys: with the gaps between the white keys, the soft shadow of the paws on the keys
      is weaker. The claws stay at the key top and do not follow a pressed key down.
- [ ] Polar bear pianist: in `bach-bwv1050`, the arms still make 14 snaps over 10° and 2 over 15°
      in one step (`scratch/tripo-audit/motion.ts`). The soft reach (`REACH_SOFTNESS`) took off 14
      snaps over 10°, 10 over 15°, and all 5 over 20°. At 61.42 s, a thumb pass moves the
      palm 11 cm in 84 ms, the whole gap after the note before. At 164.30 s, the left elbow jumped
      2.5 cm in 8 ms while the palm moved 1.4 cm, near the full reach of the arm.
      A glide of the palm through the strikes of a run took off 1 snap, and a leap speed of 0.75 m/s
      gave 2 new snaps in `boulanger-matin`.
- [ ] Polar bear pianist: at 1% of the notes of the demos, the arm is at its full reach, and the
      palm stops up to 3.2 cm short of the key (the note target check of the pianist clearance).
      A lean toward the keys for a far black key can give the reach.
- [ ] Polar bear pianist: on a white key, the lowest claw point hangs about 3 cm in front of the
      front edge, at the height of the key top, so the claws do not rest on the key. Check it in a
      close view, and move the palm in (`palmL`, `palmR`) with the arm gate.
- [ ] Polar bear wrist: one edge of the left wrist band, on the palm side, stays concave in the play
      at a groove of the mesh. Check it from below in the stage light, and fair the groove.
- [ ] Polar bear bind supination: `pnpm bind-supination polar-bear` gives L 118 (now 112) and R
      44 for the cast roles. A new key moves the bind, so it waits for a user check.
- [ ] Piano: the lifted piano (`PIANO_LIFT`, `PIANO_SCALE` 1.16, the lid at 25°) moves the rows of
      the demos, the lid hides the lower muzzle of the right contrabass of `bach-bwv1050`, and its
      legs show under the higher case. Show the user the default views
      (`reports/2026-11-05-polar-bear-seat/after-stage/`).
- [ ] Close views: the pianist has no lift or lowering moment in `ROLE_VIEWS`, so `close-views
      pianist --moments lift50` fails. Give the role the moments of `halfMoves()`.
- [ ] Bear: at rest, the arms swing 20° more out around the round belly (`restArm.extraOut`), and
      the upper arms still go 3.7 cm into the sides of the chest (limit 4 cm), also in the lift
      and the lowering (the older bear 3.8 cm). Check the arm roots in 2x crops from az150 and
      az-150.
- [ ] Bear right paw: three thin faces of the knuckle crease (104, 105, 1769) fold in 99% of the
      play at the baton curl, and one wrist face (1833) in 77% (`pnpm fold-probe conductor
      --faces 6`). The fist hides them in the hall view. Check them in a 2x crop.
- [ ] Bear maps: the color map and the normal map of the new bear are 215 KB and 217 KB (the
      older bear 106 KB and 99 KB), because the fur strands add detail. They load after the first
      frame. Try a lower WebP quality if the load time of a demo grows.
- [ ] Bear and elephant: in the gallery light, each arm casts a black band of shadow on the trunk
      beside the belly. Check it in the stage light.
- [ ] Cat violist: the faces at the back of the bow arm root (2461, 2462, 2342, and 2456, on
      `upper_arm_seg0_R`) fold in 74% to 89% of the play and in 74% to 75% of the lift
      (`pnpm fold-probe violist --faces 25`). Look at them in 2x crops from az120 and az180, and
      fix them in the chain of the cat.
- [ ] Cat violist: a light shard at the right elbow, a dark dot on the right forearm, and a
      stretched texture at the right elbow at rest (pose audit L9). The rest hold of the right arm
      did not change in the string round, so look at the chain of the cat in 2x crops.
- [ ] Cat violist: with the viola on its via (`carryVia`), the left forearm goes 2.0 cm (lift) and
      2.2 cm (lowering) into the back of the viola near the rest, in 16% and 23% of the samples
      (1.6 cm and 1.5 cm when the viola hung from the paw, limit 1.5 cm, `pnpm body-clip
      violist`). An elbow out, (-1, -0.5, 0), keeps it at 1.2 cm, but the paw then twists past 180°
      on its forearm in a lowering of `mozart-k525`. The left arm gate folds 43 faces at rest (the
      curled rest paw).
- [ ] Rabbit violinist: the left forearm goes 2.3 cm into the back of the violin in 80% of the
      play and 63% of the lowering (limit 1.4 cm, `pnpm body-clip violinist`). No place, elbow,
      tilt, gap, or turn of the violin changes it, and a violin of 0.8 lowers it only to 2.0 cm.
      A violin 0.03 H or 0.06 H higher on the shoulder, and a left elbow in under the violin,
      (0.3, -1, -0.5), also keep 2.3 cm in 81%. The middle of the thick forearm (4 cm) lies under
      the back of the violin. The paw reaches the fingerboard only from 0.64, near the upper bout.
- [ ] Hippo bassist: the left forearm goes 2.9 cm into the contrabass in 50% of the play (limit
      2.3 cm). A higher left elbow, (-1, 0.3, 0), lowers it to 6%, but the left paw swing fails
      (77°, limit 70) and the folds grow from 29 to 42 (`pnpm arm-check bassist`). An elbow further
      back, (-1, -0.3, 0.3) to (-1, -0.1, 1), lowers it to 26% to 4%, and a bass 0.03 H further
      from the belly (`fit.gap` 0.25) to 31%, but each change moves the paw swing from 68° to 70°
      to 75° and the folds from 29 to 32 to 41. Each move to the left (`fit.side`) or lean to the
      left (`fit.left`) puts the upper arm into the bass. A fix needs a limit of the paw swing in
      the pose, or a smaller bass.
- [ ] Hippo bassist: the scroll stands in front of the left cheek in the left view (pose audit
      N10). The head does not go into the bass (`pnpm body-clip bassist`). A bass 1.5 cm to the
      left (`fit.side` -0.33) moves the scroll down and away a little, but the left forearm then
      goes into the bass in 34% of the play in place of 21% (with the elbow back). Try a shorter
      end pin (`BASS_END_PIN`) with the forearm limit of the item above.
- [ ] Hippo bassist: at rest, the right arm still lies along the round belly in the right view
      (2.9 cm in the belly, `pnpm hold-fit bassist --sets rest`). A rest elbow out, (1, -0.7, 0),
      and a grip 1.3 H out lift the arm off the belly in the front view, but the arm stands out as
      a wing, and the right view still shows it along the belly. Try a rest bow in front of the
      belly in a look round.
- [ ] Bind paws: the bind paws of most configs start pronated, so the cellist, the bassist, and the
      oboist twist the left paw near 170°. Try `studio.bindSupination`.
- [ ] Red fox and tan fox: at rest, the crook of the right elbow keeps a soft fold, because the
      linear blend pinches the bent inner elbow. A dual quaternion bind folds the bow arm.
- [ ] Red fox and tan fox: thin dark V lines on the white chest are splits of the normals of the fur
      spikes of the mesh. Smooth them like the neck notches, or give them the skin normals.
- [ ] Tan fox flutist: no left elbow that grasps the flute brings the move twist of the left paw
      (77°) to 70°.
- [ ] Rabbit: at rest, a narrow groove runs between the front of each upper arm and the trunk. It is
      the gap of the arm copy. Fill the gap in the copy.
- [ ] Rabbit violinist: the round elbow patch drops the section of the right upper arm of `pnpm
      arm-look` to 0.60. Find the cause, and keep the round elbow.
- [ ] Rabbit violinist: a dark lower face of the bow elbow shows from az150 in the moves, and a thin
      dark line under the forearm near the elbow from the front at the frog.
- [ ] Rabbit violinist: a small dark sliver stays under the right elbow from the right side at the
      frog.
- [ ] Rabbit with the neutral bind: in the cast matrix, the flute recast folds 9 faces of the right
      arm in the play (limit 8), and the cello recast 8. The snare drum recast passes now.
- [ ] Rabbit: under the raised bow arm, a shallow hollow with a small sharp tip stays in the right
      armpit. A smoother hollow needs more vertices in the notch.
- [ ] Rabbit: the narrow axis of each upper arm keeps 0.62 to 0.81 of the bind, so the shoulders
      look flatter than the source from the back. Try a bind arm nearer to the play.
- [ ] Rabbit: a flap face with two open edges (3.1 cm) stays under the right armpit. No frame shows
      it.
- [ ] Rabbit violinist: the bow goes up to 2.5 cm into the arms in the lowering and 1.0 cm at rest,
      near the grip.
- [ ] Rabbit violinist: the violin points 50° to the left, 5° more than a real player. A bow arm
      round or a smaller violin can bring it to 45°.
- [ ] Bowed strings: the left elbow points to the side under the instrument, and the upper arm turns
      29° to 46° to the side, but a violin student turns it 16° to 25° in (string-technique).
- [ ] Bowed strings: near the end of the lift and in the lowering, the arms go up to 2.5 cm into the
      instrument (limit 1.5 cm), and up to 2.8 cm for the standing soloists.
- [ ] Rabbit violinist: `pnpm body-clip violinist` (limit 0.045 H, 1.3 cm) in bach-bwv1047: the
      left forearm goes 2.2 cm and the left paw 2.1 cm into the violin in 100 % of the play, and
      67 % to 87 % of the lift and the lowering. The chest goes 2.1 cm (lift) and the head 1.9 cm
      (lowering) into the violin, and the right paw 1.5 cm (6.5 % of the play). Similar values
      show in `pachelbel-p37`. Check in 2x crops if the neck of the violin goes through the paw.
- [ ] Red fox violinist: with the violin of 0.83, the left paw goes 1.6 cm into the violin in
      0.4% of the play (limit 1.6 cm, `pnpm body-clip fox-red:violin`, bach-bwv1047), and no
      other row is over the limit. Check the smaller violin beside the rabbit in the hall view.
- [ ] Dog cellist: `pnpm body-clip --demo pachelbel-p37` (limit 0.045 H, 1.9 cm): the left paw goes
      2.1 cm into the cello in the lowering (16.7 %) and the lift (9.7 %).
- [ ] Layout: it knows only the bind footprints, so only a piano case keeps the reach of a player in
      play. A hold that reaches further can clip (a bassist beside a clarinet in `beethoven-8`).
- [ ] Layout sight lines (4.5): with no row risers and the lane search, 49 of 453 players stay
      blocked and 18 are hidden from the audience (`pnpm sight-lines`). Most are horns and
      percussion on the left of rows 3 and 4: row 0 keeps the gap of the conductor at about ±30°,
      and row 1 fills the other gaps of row 0 on the left. The user keeps this layout and accepts this count. A wider row 0
      (branch `worktree-agent-af5dcad398484b454`, report `2026-11-08-seat-lanes-2`) gave 7 blocked,
      but it left a large empty area between the conductor and the strings. Horns on the right
      gave 11 blocked on top of the wider row 0. A higher podium also keeps 0.35 m: 0.5 m gave 35
      blocked and 23 hidden, 0.7 m gave 11 blocked and 28 hidden. Seat trials on this layout
      (report `2026-11-08-seat-levers-3`): the first desk of the second violins in row 1 gave 72
      blocked and 21 hidden, and with the first desk of the violas also in row 1, 123 and 30.
      Horns on the right of row 3 gave 48 to 50 blocked and 19 or 20 hidden. Both together gave
      75 blocked and 23 hidden.
- [ ] Tripo elephant: its seat height is 0.489 m (0.288 m on the old elephant), the back of the
      haunch of the standing bind. Check the recast seated roles of the cast matrix.
- [ ] Elephant timpanist: the stump grip of 2026-11-12 holds the mallets 13° to 17° down between
      strikes (ball about one inch over the head) and 24° to 26° down at a strike. A level shaft
      puts the stump paws 2 cm to 6 cm into the kettles, because the paws stand over the heads.
- [ ] Timpanist: a muffle now moves at 1.2 m/s at most, so a rest that is too short for the move
      gets no muffle (beethoven-9 10 to 9 muffles, beethoven-5-4 90 to 72).
- [ ] Penguin singer: the paused test `src/pose/choir-notes.test.ts` expects the old jaw timing
      (the phrase lift and the jaw rate of 2026-11-12). Update it when the tests come back.
- [ ] Remove the twist bone of the upper arm (`upperTwist` of the rig configs,
      `StudioBody.upperTwist`, `upper_twist()` of `tools/blender/rig_mesh.py`, and design 4.4). No
      body uses it, because the pig now has arm segments.
- [ ] Hippo: the nose tip lies on a nostril 2.7 cm from the middle plane, and the rig checks warn.
- [ ] Rhino, polar bear: the lights of the two bead eyes stand at mirror places in the front close
      view (light x 0.09 / -0.10 and 0.08 / -0.13 of the eye width), so they point toward each
      other. The rhino gap was 0.05 before its eyes moved up (`eyeShift`).
- [ ] Rhino: thin dark lines of the old lower lid show under the right bead eye in the front close
      view. The app view does not show them. Polar bear: a faint light facet stays at the inner
      side of each bead eye. Penguin: the fur makes small dents at the inner side of the left eye.
- [ ] Deer, penguin, polar bear: the upright turn (`uprightRoll()`) leans the ovals 4° to 8° with
      the tops out in the front close view, where they were within 2° of upright. The linear bend
      model misses the fur cover. Try a fit of the turn on the real silhouette.
- [ ] Wolf: a dark lid wedge of the mesh stands out at the outer side of the right bead eye.
- [ ] Bead eye lights: the light of an eye that faces far to the side moves less to the side
      (`lightAcross()`), so it stands near the middle. The mean gap between the places of the two
      lights is 0.09 of the eye width in the front close views.
- [ ] Hippo bassist: at rest, the stick goes through the middle of the round paw, and the frog end
      hides in it. Ask the user for the form of the rest hold, such as the bow on the strings.
- [ ] Hippo bassist: in the lowering after a pizzicato, the bow turns 79° in the paw. Give the move
      a bow path that keeps the forearm near 45° (`BowVia` of `pose/bowed.ts`).
- [ ] Wolf clarinetist: the clarinet turns up to 14° in the closed left paw over a lift. Read the 2x
      crops of the lift, and scan the left rest elbow if it shows.
- [ ] Badger bass drummer: from the front, the drum hides the right arm and the beater, as a real
      drum hides its player. Ask the user if the badger must show more from the front.
- [ ] Badger: the snare sticks and the mallets keep about real lengths (34 cm), longer than the
      scaled bass drum beater. Ask the user if the scale of the badger applies to them too.
- [ ] Badger snare drummer: in the side views, the butt of the near stick shows over the belly at
      rest. It is no clip: the butts stay out at the sides of the body, at least 16.5 cm from the
      trunk at rest and 11.7 cm in the play, the lift, and the lowering. Ask the user if the rest
      must change, such as the two sticks in one paw.
- [ ] Badger bass drummer: between strikes, the paw keeps its turn in the world while the body
      sways, so its twist on the forearm moves 20° in about 1 s.
- [ ] Badger cymbalist: the upper arms stand 35° out from the side of the body in the play (21° to
      22° on the hanging arms). With the elbow poles of the snare drum ([±0.3, -1, 0.5]), the upper
      arms went 3.5 cm into the body (limit 2.5 cm). Fit the homes, or the spots a little in from
      opposite each other, as a real player rolls (percussion-technique 7, [31]).
- [ ] Badger xylophonist: the grip stays up to 7 cm over its bar (`gripRise`), and a real player
      keeps the hands at most one inch over them (percussion-technique 9). With 0.2 H, a target
      missed by 6.8 mm. The limit bends the paws more on the forearms: the arm gate counts 35 (L)
      and 22 (R) folded faces at the wrists in place of 22 and 15, which the 2x paw crops of
      `reports/2026-11-13-perc-holds/crops/` do not show. A home moved out to the end bars kept the
      folds low, but spread the arms out as wings.
- [ ] Badger xylophonist: a fast run between the lowest and the highest bars keeps the body in the
      middle (`side`), so both paws reach wide. Try a larger side lean for a run at one end.
- [ ] Badger bass drummer: the free left paw hangs open beside the body while the badger plays,
      because a real player muffles only in the rests (percussion-technique 5). Ask the user if the
      paw must wait at the far rim.
- [ ] Badger percussionist: the left paw curls 118° on the triangle clip, so the arm gate counts
      16 to 17 folded faces at the knuckles inside the fist (10 at 75°). The left paw grasps the
      clip in 79% of the play and the lift, and the right paw the beater in 88% of the play.
- [ ] Badger percussionist: the triangle stays up in the left paw at rest, because the trap table
      stands under it. A rest with the triangle on its stand and the beater on the table
      (`restSwitch()` trial) bent the empty left paw 123° on the forearm, or turned it over 178°
      between the hanging arm and the stand (16,423°/s). Ask the user for the rest place.
- [ ] Close views: `pnpm close-views play` renders with no fill light. Add a fill to the play mode
      for the checks (9.8).
- [ ] Recast roles: with `--base`, `pnpm arm-check --views` and `pnpm close-views` render the
      commit with the instrument scale of its app, but the gate measures the commit with its size
      rule (`tools/recast-scale.ts`). Give the build of the commit the scale of its own rule.
- [ ] Wolf violinist (`violinist@wolf`, spike): the left paw goes 1.8 cm into the violin in the
      play (limit 1.5 cm), and the bow plays no hair within 0.18 m of the 0.38 m bow at the frog.
      The paw of the wolf is large for its smaller violin. In `pachelbel-p37` at 210.9 s, the bow
      goes 5.9 cm into the body in 2% of the samples.
- [ ] Hanging arms: make `hangingHand()` of `pose/hang.ts` independent of the bind paw (shared pose
      code). It turns the bind paw by the shortest arc from straight down, so a straight bind turns
      the hanging paw: the hanging left paw of the badger bass drummer has the grip -44° (-22° on
      the old bind, `ACCEPTED_GRIPS`). The raised triangle upper arm of the badger goes 2.4 cm into
      the left shoulder (base 2.1 cm, accepted), and elbow variants of the triangle hold fold the
      arm root (L 8 to 10).
- [ ] Hippo with the T-pose body: each recast cell of the cast matrix fails, as on `831beea4`. The
      left arm folds 10 to 13 faces (limit 8) in the violin, the clarinet, the trumpet, and the
      snare drum, and the right arm 18 in the cello. The flute recast turns the left paw
      17,953°/s in a move. The own role passes.
- [ ] Fox with the neutral bind: the bent right elbow ring is 3.21 cm in place of 4.01 cm on the
      red fox violinist (20%), and 3.88 cm in place of 4.33 cm on the tan fox flutist. The 2x crops
      show no pinch. The left forearm goes 0.2 cm deeper into the violin at rest, and the left paw
      0.2 cm deeper into the flute (0.1 cm with no supination). In the cast matrix, the cello
      recast folds 10 faces of the left arm (limit 8), and the snare drum recast twists the left
      forearm 82° (limit 80°, base 80°). The rest shape of the right arm keeps its rule from the
      bent bind, with 3 faces turned over in the rig log, as on `14ef3d67`.
- [ ] Rhino right bind paw: it keeps no supination in place of the rule value 22°, because 22°
      takes the right forearm near the elbow 0.6 cm deeper into the tuba at rest, in the lift, and
      in the lowering (1.3 cm to 1.5 cm, limit 1.5 cm). The largest right paw twist p95 of the
      cast roles is thus 115° in place of 94° (the violin). The rig log keeps 1 face (444) of the
      right elbow shape turned over.
- [ ] Rhino neutral bind elbows: the bent elbow rings of the tuba hold are about 24% narrower
      (p5 L 4.26 cm against 5.58 cm, R 4.04 against 5.16). The 2x crops show no pinch.
- [ ] Neutral bind, cast matrix of the elephant, the rhino, and the bear: each recast cell fails on
      `37d5d5c7` and on the tree. The elephant clarinet folds grow (L 19, base 15), and its snare
      drum folds move to the left arm (L 13, base R 10). The rhino flute forearms go deeper into
      the body in the lift (5.3 cm, base 4.5 cm), and the rhino cello left arm is flatter (flat
      p5 0.65, limit 0.55). Most other fold counts fall.
- [ ] Polar bear with the neutral bind: in `pnpm arm-check pianist --world`, the fingers joints move
      0.013 cm (left) and 0.016 cm (right) against the bent bind (SAME up to 0.01 cm), with no turn
      of the palms. The straight bind puts the forearms 0.1 cm to 0.2 cm deeper into the case, and
      the `raise` shape of the right elbow puts the right upper arm 0.2 cm deeper into the
      shoulder.
- [ ] Clip places (9.3): `pnpm pose-depth` names the part of a bowed string at a clip, but no part
      of a wind or a brass instrument, such as a bell or a key.
- [ ] Neutral bind elbows: the bent elbows are narrower in meters than with the bent bind. The
      elbow ring p5 is 3.04 cm in place of 3.71 cm (left) and 3.39 in place of 3.97 (right) on the
      wolf clarinetist, and 1.74 in place of 1.98 (left) and 1.79 in place of 2.01 (right) on the
      mouse oboist. The rabbit violinist has 2.95 in place of 3.07 (left) and 2.88 in place of 3.04
      (right), and the polar bear pianist 4.96 in place of 5.32 (left) and 5.12 in place of 5.34
      (right). The 2x crops show no slit, flap, or pinch. Weights that keep the forearm and
      the elbow helper off the upper arm, with one more elbow ring, reach 3.83 cm (left) and
      3.86 cm (right) on the wolf, but fold 13 faces of each inner elbow (base 2 and 3). More
      Smooth rounds after a Remove From Group give 2.81 to 3.31 cm and 5 to 6 folds. The mouse got
      no try (`reports/2026-11-01-elbow-ring/`). The inner skin needs a turn ramp of about the
      elbow radius times the bend (design 4.4), and the gate ring at 0.85 of the upper arm lies
      inside that span. Decide: accept the narrower elbows, move the ramp onto the forearm over
      more rings, or blend the arm skin with dual quaternions in the app.
- [ ] Test mannequin: the forearm twist p95 of the left violin arm is 48 against 38 of the base
      (limit 80, margin 15), because the forearm segments spread the paw twist along the forearm.
      Decide if the margin holds against a base with no segments.
- [ ] Mesh intake: the limits `GAP`, `SPACING`, `TILT`, and `COLOR_FACES` of
      `tools/blender/mesh_intake.py` come only from the mannequin and the rebuilt arms. Check them
      on the first clean quad mesh, with `arm_rebuild.py --keep-faces` and the arm gate.
- [ ] Mesh intake: the quad share reads the order of the triangles of the glTF exporter of
      Blender, which writes the two triangles of a quad one after the other. A file of another
      exporter can give a low share for a quad mesh. Convert such a file in Blender first, or
      join the triangles by their shape.
- [ ] Recast grips: `pnpm arm-check` gives a recast role with no entry of `ACCEPTED_GRIPS` no
      grip turn, such as `violinist@mannequin`. The grip frame does not move with the bind, so the
      gate can take the entry of the role, as `pnpm cast-matrix` does. Decide it.
- [ ] Cast matrix (design 4.4): the baseline of six roles and 20 species gives 7 PASS, 2 OPEN, and
      111 FAIL (`reports/2026-11-01-cast-matrix/`). In 97 FAIL cells, a value fails in most
      recast cells of its column, so the shared hold of the instrument fits only its own species.
      Fit the shared holds of the bowed strings and the winds on more than one body.
- [ ] Arms in the body of the cast matrix (5.3): 9 cells fail on an arm clip only
      (`reports/2026-11-02-arm-clear/`). At the deepest moment of `cb550973`, the arm of the cat
      violinist (4.0 cm), the cat cellist (4.1 cm), the pig violinist (3.3 cm), and the mannequin
      cellist (2.4 cm) is straight (174° to 180°), because the paw target is out of reach. The pig
      violinist and the pig flutist (3.3 cm) clip at the root of the upper arm (0.02 to 0.10 of
      its length), and the dog cellist (2.7 cm) at 0.37. The mannequin violinist clips with the
      forearm near the wrist (0.88) in the violin (2.0 cm). A swivel of the elbow cannot move
      these points, and two tries cleared no cell. They also turned the paws on their forearms:
      11 arms of 9 own roles failed the arm gate, most on the move twist and the move turn. Next:
      a turn of the shoulder bone for the clips at the root, and a path of the paw in the lift and
      the lowering that keeps the elbow bent. The red fox flutist (2.8 cm, elbow at 141°) and the
      mannequin clarinetist (5.0 cm, 100°) bend the elbow, and a swivel brought the clarinetist to
      1.6 cm.
- [ ] Shared violin hold (`BOWED_HOLDS.violin`, 5.3): 8 of the 14 seated bodies pass. The upper
      arms of the cat go 2.0 cm to 4.0 cm into its deep chest in the play and the lowering, and the
      upper arms of the pig 2.5 cm to 3.3 cm. The left paw of the dog stretches 0.56 in the lift,
      the right upper arm of the monkey goes flat (0.53 to 0.55) in the play. The polar bear folds
      22 and 12 faces (body weights).
- [ ] Thick left wrist on the violin in the play (5.3, matrix group 5): the wrist end of the left
      forearm of the recast panda (2.0 cm in 93% of the play), hippo (1.7 cm, 37%), penguin
      (1.6 cm, 96%), badger (1.6 cm, 5%), polar bear (1.7 cm, 1%), and mannequin (1.6 cm, 2%) goes
      into the upper bout in the play, and of the panda, the hippo, and the penguin also in the
      moves (1.6 cm to 1.9 cm). The rest grip of the wrist clearance cleared the rest. On the
      panda, a move of the paw 3 cm down from the back of the violin gave 1.8 cm, 3 cm toward the
      scroll 1.7 cm, and a turn of the elbow 2.0 cm. A further tilt of the paw over the neck in
      the play (20° at the full rule) cleared the polar bear (1.2 cm) and the moves of the panda,
      but the violin of the penguin went 1.0 cm to 1.3 cm deeper into the belly in the moves. Next:
      the tilt with a path of the carried violin that keeps off the belly, or a thinner wrist end
      of the rebuilt arms. The rest grip of the rule moves the left forearm of the recast elephant
      1.5 cm into the upper bout in one lowering sample (1.3 cm before).
- [ ] Violin lift on a pronated bind paw (5.2): the left paw turns through the direction of no
      paw twist, so the carried violin turns about 240° with it in the middle of the move (the
      deer at `lift50`, `reports/2026-11-01-violin-hold/`). The role-neutral bind supination of
      each body (4.4) shortens this turn.
- [ ] Violin place (5.3): the head turn of the jaw rule (-15° to 15°) and the place of the violin
      on the collarbone need a look from the reference sheets on each body, because the matrix
      measures no contact of the jaw.
- [ ] Recast holds in the role tools: a recast role keeps the own hold of its species, such as
      `WOLF_VIOLIN_HOLD` for `violinist@wolf`, and the cast matrix takes the shared hold. The wolf
      passes with the shared violin hold, so its own hold can go. The `--base` build of
      `close-views` and the `--base` sweep of `pose-depth` keep the scale of their commit.
- [ ] Seated bear (4.4): the rig gives a standing bind a sit pose (`sitPose`, `seatedBody()`).
      Give the bear its sit pose (the values of `reports/2026-11-01-bear-sit/`), write its GLB
      and its module, and check that only the seated bear changes and the conductor stays
      (`pnpm body-probe`). Its violin and cello cells then fail on the arms only: the upper arms
      go 5 cm to 10 cm into the body, as on the standing bear.
- [ ] Right fingers of the shared trumpet (5.3, winds 2.1): the right paw faces the valve tops
      and points 0.4 of the way across them, but its fingers stay nearly straight (no
      `gripCurl`), so they do not arch down onto the valve caps as the monkey's do. A grip curl
      of the right paw alone needs a curl value for the left paw too. The margins are small: the
      dog palm turn 28/30 and the deer folds R 8/8 in the cast matrix. A larger side aim or
      shoulder turn made the dog miss its grip or the deer fold.
- [ ] Percussion holds (5.3): the badger plays the shared percussion holds as its own holds, so
      they have no elbow rule. Give them a fit of the badger (`armOut()` 42° and 44°), so that a
      rounder recast body turns its elbows out and the badger stays the same.
- [ ] Shared snare drum from the body (5.3, `PercussionHold.fit`): the raised drum clears the
      bellies of the recast elephant, bear, cat, hippo, panda, and polar bear. Open: the hanging
      trunk of the elephant goes 6.5 cm into the raised drum in the play, and its paws still miss
      the targets by 205 mm. The rhino keeps its bind place (the near rim is 0.2 H in front of its
      belly), and its forearms still go 2.1 cm into the belly. The pig moves only forward and
      misses by 11 mm. Measure the front with the hanging head of the elephant, and check a
      larger room for the rhino.
- [ ] Front wind holds (5.3): the forearms and the paws of the recast heavy bodies go into the head,
      and not into the belly (`pnpm pose-depth`, "into the head"): the flute of the elephant, bear,
      hippo, panda, rhino, and mannequin (1.8 cm to 8.7 cm, left forearm under the turned head), the
      penguin flute into the neck, and the trumpet of the elephant, bear, hippo, and rhino (2.7 cm
      to 10.0 cm, right arm under the snout). A place from the front of the belly, the head bow of
      the far mouth, a head lift, a left grip further along the flute, a lower left elbow, and a
      head turn of 15° do not clear them, and the bow makes the trumpet clips of the hippo, the
      elephant, and the rhino up to 1.3 cm deeper (`reports/2026-11-04-wind-head/`). Next: a place
      of the left grip and the elbows from the volume of the head under the mouth.
- [ ] Shared cello hold (`BOWED_HOLDS.cello`, 5.3): the rabbit, the mannequin, the wolf, the
      deer, and the dog (own hold) pass. The cello of the foxes goes 5.0 cm into the body in the
      play, and the upper arms of the cat and the pig go up to 4.0 cm into the body. With the rest
      grip on the neck and the paw girth rule, the knuckle end of the thick left paw of the bear,
      the rhino, and the hippo still goes 1.6 cm to 1.9 cm into the neck in the moves, and the
      curled claws of the badger (1.9 cm), the pig (1.8 cm, also at rest), and the monkey (1.8 cm,
      play) go into the neck. Next: a curl of the rest grip from the claw length, or a tilt of a
      thick paw over the neck.
- [ ] Dog cellist: the fitted place (`cello@dog.fit`) with a cello of 0.87 gives the arm gate of
      `DOG_HOLD` on two demos. Sweep the dog with it, then remove `DOG_HOLD` if it is not worse.
- [ ] Dog cellist left arm (5.3): the lowered elbow of `DOG_HOLD` keeps the elbow bent 51° to
      57° from straight in the mean of the play of three demos. Look at the elbow skin of the
      Tripo beagle from behind in a 2x crop (az-150). Only a grip further from the shoulder opens
      the elbow (the place of the cello). Run the cast matrix with the new elbow on `CELLO_HOLD`,
      and move it into the shared hold if the recast cells do not get worse.
- [ ] Dog cellist left elbow height (5.3): the left upper arm of the Tripo beagle is about level
      in the play (from 1° up to 5° down in the mean of `pachelbel-p37`, `boulanger-matin`, and
      `beethoven-5-4`), and a cellist holds it about 45° down on the A string (strings 1.8). Lower
      `DOG_HOLD.poleL`, and check the inner elbow and the back of the armpit with
      `pnpm fold-probe cellist --faces`. Fit a shape to the low elbow (`pnpm raise-fit`) only for a
      fold that no ring or weight row removes.
- [ ] Cello rule (4.6): the elbow limit (`CELLO_ELBOW`) and the gap of the back
      (`BowedHold.fit`) come from the dog, with no source. Fifteen of 20 species (nine of the
      14 seated bodies) need a cello below a 1/10, and the rule clamps it. A new cellist species
      takes the rule as `celloScale` by hand, because the rule poses the hold in a tool.
- [ ] Penguin seat (4.4): the penguin binds standing. A sit pose works, but it shows no change,
      because the egg hides the legs and the seat stays at about 6 cm. Decide if the penguin
      takes seated roles. The hippo, the elephant, the badger, and the rhino bind seated already,
      and their seated cells fail on the arms.
- [ ] Shared flute hold (`WIND_HOLDS.flute`, 5.3): 3 of the 14 seated bodies pass (the tan fox,
      the rabbit, the wolf). The free left paw of the deer, the beaver, the monkey, and the pig
      turns near or through 180° on its forearm in the lift, because their bind paws lie about 100°
      from the bind paws of the foxes. Port the twist mix of the violin carry (`mixTwist()` of
      `pose/bowed.ts`) to the free wind paw. The arms of the red fox, the cat, the polar bear, and
      the mannequin go 2.1 cm to 4.1 cm into the body at rest and in the moves, the left
      upper arm of the dog twists 58° (limit 55°), and the paws of the mouse miss the flute by
      1.5 cm. At rest, the right paw can stand off the upright flute (rabbit images).
- [ ] Shared clarinet hold (`WIND_HOLDS.clarinet`, 5.3): 3 of the 14 seated bodies pass (the wolf,
      the deer, the monkey). The upper arms of the cat, the pig, the polar bear, and the mannequin
      go 4.1 cm to 5.3 cm into the deep chest in the play. With the size rule of the winds, the paws
      of the foxes and the beaver reach the keys, and the mouse misses them by 4.3 cm.
- [ ] Shared trumpet hold (`WIND_HOLDS.trumpet`, 4.6, 5.3): with the size rule of the winds,
      both shoulders 34° forward, and the head bow of the far mouth, the dog, the pig, and the deer
      pass, and the wolf and the beaver are open (4 mm and 16 mm). The elephant, the bear, the
      hippo, the mouse, the rhino, the badger, and the penguin still miss the valves at the
      smallest trumpet (25 mm to 152 mm). Four of them need a bow of more than 30°. A trumpet that
      turns down twice the bow also passed the wolf, but it points far below "slightly down".
- [ ] Winds at the smallest size (4.6): the clarinet of 0.73 still misses the keys for the mouse
      (43 mm), the hippo, the bear, the rhino, the badger, the penguin, and the elephant, and the
      flute for the bear, the rhino, the badger, the penguin, and the elephant. The size rule
      cannot help: a hold or a body change must.
- [ ] Trumpet length: no source of `wind-technique.md` gives the length of a B-flat trumpet. The
      size rule takes 0.48 m from the trumpet of the app at 0.85 (`REAL_WIND_SIZES`).
- [ ] Standing winds: a soloist plays the flute and the trumpet standing. Check if a standing hold
      (`stand`) helps the bodies whose seated flute and clarinet cells fail on the arms (the bear,
      the hippo, the elephant, the badger, the rhino, and the penguin).
- [ ] Recast bodies: the bear, the rhino, the elephant, and the mannequin fold the arms in each role
      of the matrix (folds p95 13 to 29 in the five roles of the strings and the winds): a fault of
      the weights or the shapes of each body.
- [ ] Bear recast folds: the front of each arm root folds in the play of each recast role (flutist
      L 26). The hold turns the upper arm 65 to 110 degrees from the bind, across the chest, and the
      clavicle holds about half of the root and of the upper chest. A Smooth of the root weights
      only moved the folds. Rigid groups (`rigidPainted`) with two conductor `raise` shapes put 8 of
      12 recast arms under the limit, but the conductor showed dark facets on the upper chest and
      `pose-depth conductor` grew 0.3 and 0.4 cm (branch `bear-folds-rigid-try`). Try a clavicle
      share that ends at the shoulder line, or new faces at the front of the root in Blender.
- [ ] Polar bear recast folds: with the rigid faces under the arm roots, the cellist folds L 10,
      R 16 (the inner right elbow at rest and the right root), the clarinetist L 11, the flutist
      L 10, the trumpeter L 12, and the snare drummer R 10. Rigid groups at the front of the
      shoulder lines removed most of them, but their edges showed a dark notch in the 2x crops.
- [ ] Panda recast folds: one rigid group under and in front of the left arm root puts the left
      arms of the violinist, the cellist, the clarinetist, and the snare drummer under 8 (5 to
      6), and the flutist L at 9. Open: the cellist R 10 (6 faces under the right root and 3 of
      the inner elbow, at rest) and the flutist R 10 (7 faces of the inner right elbow in the
      play). A rigid group under the right root folded more faces of the trombonist.
- [ ] Elephant recast folds: the paws fold 3 to 10 faces in each sample (the finger roots, also
      in the timpanist), and the inner elbows fold at rest (clarinetist R 12, cellist R 10,
      snare drummer L 7). The front of the left root adds 2 to 9 in the play. Rigid root groups
      moved the folds to the elbows. A right elbow `raise` (branch `folds-ep-elephant-shape`)
      took the clarinetist R from 16 to 13 and the cellist R from 10 to 7, but grew the
      clarinetist R stretch from 0.20 to 0.25 (`FAIL` on the margin, `MOVES` of
      `--explain stretch`). Fix the paw faces first.
- [ ] Penguin recast folds: four left flipper `raise` shapes (the limit) put 7 of 12 recast arms
      under 8 (base 6). Open: the flutist L 26 (the front root and the flipper tip, and a flute shape
      at 137° turned over more faces after the relax), the clarinetist L 11 and R 12, and the
      cellist L 10 in the lift. In the flute and clarinet holds the shared grip curls the fingers
      125° to 176°, and the flipper tip folds (faces 1894 to 1899, 2903, 2907). A flipper needs a
      smaller curl in a recast hold (pose code), or a rig with no finger bone weight at the tip.
- [ ] Badger recast folds: four arm `raise` shapes (the limit) put 7 of 10 recast arms under 8
      (base 3). Open: the cellist L 15 (play and lift, and a cello shape gave the percussionist 4 more
      folds), the clarinetist R 10, and the violinist R 10. No shape is free.
- [ ] Cast matrix sizes: the violin, the viola (`hold-reach`), the cello (`cello-size.ts`), the
      trumpet, the clarinet, and the flute (`wind-size.ts`) have a size rule. The other scaled
      instruments keep the scale 1 in a recast. The real viola sizes come from a chart of body lengths, times the ratio of a full
      violin.
- [ ] Test mannequin: upload `mannequin-human-tpose.fbx` to mixamo.com, and compare the auto-rig
      with `mannequin-human-mixamo.glb`. It needs the Adobe account of the user.
- [ ] Test mannequin: the Mixamo help pages of Adobe refused the download (HTTP 403), so the
      skeleton options of the auto-rigger (65 or 25 bones) have no Adobe source yet.
- [ ] Test bodies: the paused tests that build each species (`species.test.ts`, `player.test.ts`)
      need `loadTestBodies()` before the pause ends, because the mannequin body loads apart.
- [ ] Hand rig: a raise key needs its `turn` as a quaternion in Blender axes, typed by hand. Add a
      helper that measures it from a pose of the rig, as `rule_key_turns()` of `rig_mesh.py`.
- [ ] Hand rig: a pose in Blender blends from the T-pose rest, and the app blends from the bind.
      Add a preview that shows the skin of the app in Blender, such as an import of the exported
      GLB file with a pose of a role.
- [ ] Hand rig: the export has no sit pose (`sitPose`, the clip `sit`), no `upperTwist`, and no
      form factor (`headFactor`, `neckFactor`, `headShift`). Add them when a hand rig needs them.
- [ ] Hand rig: `studio_armature.py` and `export_rig.py` load the functions of `rig_mesh.py` from
      its source. Move the shared functions into a small module before `rig_mesh.py` goes.
- [ ] Hand rig: `add_surface(..., eye_fans=False)` adds no fans now. Give `place_eyes()` the
      middles of the old eyes as a start.
- [ ] Hand rig: the preview of `fit_eyes()` repeats `addEye()` and `eyeBend()` in Python
      (`tools/blender/studio_eyes.py`). On the cat, its bends match the module within 2e-4. A
      change of the bead eye of the app must change both, or the preview must come from the app.
- [ ] Tripo cat (fourth Tripo cat, `tripo-hand/`): the body keeps the legs of the source, so its
      seat is 0.222 m (`seatHeight`, the cat before it 0.298 m). Check the chair against the
      string rows in the hall view.
- [ ] Tripo cat: the thighs of the seated bind spread 20° so that the belly does not cover the
      lap point. Check the knees against the music stand and the next seat in the hall view.
- [ ] Tripo cat: the arms are near the limit of 45°: the left upper arm rolls 42.5° in the
      stroke and -42.0° at rest, and the right forearm twists -42.9° at the tip. Check the
      shoulder and the wrist skin in the app.
- [ ] Tripo cat: the map keeps the gray of the source, and the fur reads light tan in the close
      views with the fill light (gray in the play view and the hall view). Check the look in the
      app.
- [ ] Tripo cat: the clearance of the arms and the viola has only renders. `pnpm pose-depth
      violist` did not run on the fourth mesh.
- [ ] Tripo cat: the smaller eyes and the lower upper lids have only ray checks of the lids (no
      lid point leaves the head in a blink step). Check a blink in the app.
- [ ] Tripo cat violist folds (4.4): the left paw folds up to 44 faces at rest and in the lift
      (`pnpm fold-probe violist`, L 42 of 44, in each of the 17 rest samples). The right arm root
      folds faces 2461 and 2462 (`upper_arm_seg0_R`) in 89 % and 88 % of the play samples. Wait
      for the next body of the cat before a fix.
- [ ] Tripo red fox violinist: the rest frog of the bow is 38.7 cm over the right thigh (16.3 cm
      on the fox of 62bf447f4), because the short arm does not reach it. At rest the left upper arm
      goes 1.8 cm into the left shoulder (3.0 cm into the belly before).
- [ ] Tripo red fox violinist: the last lowering of boulanger-matin starts from the pizzicato pose
      (tip up and to the right), and the bow passes 15 cm to 20 cm in front of the face for 0.41 s
      (0.22 s before the via reach of 2026-11-12). The cause is the pizzicato tip
      (`pizzicatoTip`); each via that keeps 0.22 s brings the mozart-k525 lift to 4 cm to 6 cm from
      the mouth.
- [ ] Tripo tan fox flutist: the free left paw rests on the haunch beside the hip, because the
      arm does not reach the top of the thigh or the flute at rest. In the lowering the right rest
      grip grasps the flute in only 37 % of the samples.
- [ ] Tripo fox: the new body at the eye height of the fox of 62bf447f4 moves seats in each of the
      18 demos, by up to 1.25 m (a red fox of beethoven-7-4 and beethoven-8-4, a horn pig of
      beethoven-1 1.07 m), and by 4 cm in pachelbel-p37, where the fox itself stays. Causes: the deeper trunk
      gives a chair 0.386 m deep (0.318 m before) and another footprint, and the head and the trunk
      hide other sight lines. With the old footprint and the old sight eye the large demos still
      move up to 1.64 m. The seat is 0.179 m (0.249 m before). Decide with the user: accept the
      moves, or a layout rule that keeps the seats.
- [ ] Tripo tan fox flutist: the left upper arm goes 2.9 cm into its arm root at each moment of
      `pnpm hold-fit flutist` (1.3 cm before), and 27 faces of the right arm fold at rest (none
      before). Try the clavicle rows and the rest elbows of `FOX_FLUTE`, and check 2x crops.
- [ ] Tripo fox wrists: the 28 band quads of the paw turn take one planar patch of the color map
      (`bandPatch`), so a straight light line shows where the band meets the forearm in the play
      view (`reports/2026-11-13-fox-wrist/play-red-fox/pair-az0-wrists-2x.png`). Try UVs that
      continue the forearm fur on the near ring.
- [ ] Tripo red fox violinist: with the right paw turn of 4 steps, the bow paw twists 47° (p95,
      22° with 3 steps) and the move twist is 122° (97°). Check the bow paw in the lift and the
      lowering in the app.
- [ ] Tripo red fox violinist: the paws go up to 2.5 cm into the violin and the left forearm 2.0
      cm (`pnpm body-clip fox-red:violin`, limit 0.045 H), as on the fox before (2.3 cm).
- [ ] Tripo red fox: `bowGrip` of `src/models/species.ts` is the grip of the paw of the fox of
      62bf447f4. The bow sits in the new right paw in the close views. Measure the stick against
      the middles of the new paw, and refit the grip if it misses.
- [ ] Tripo fox: in the last 4 of the 21 steps of the blink, 3 to 7 points of the upper inner
      corner of the left lid stand out of the head near the brow. The flat eye domes put the lid
      middles near the middle plane. Check the blink in the app.
- [ ] Tripo fox: from the front the face reads calmer than the fox of 62bf447f4, because the
      painted smile line lies on the sides of the muzzle and the painted brows read dark under
      the top light. It reads happy in the 3/4 and side views. Ask the user.
- [ ] Tripo fox: the tail tip lies on the floor behind the chair at rest (gap 0.0 cm, 7.5 cm
      before), because the new tail is longer and the seat lower. Check it from the back.
- [ ] Tripo fox: the four digits of each fore paw share one fingers bone, so they curl as one
      piece. Check the grip of each digit on the neck, the stick, and the flute in the app.
- [ ] Tripo fox fur strands: the strands follow the faint strokes of the source maps (`STRANDS`
      of `tools/fox-maps.py`), so they curve in places on the back, and they cross the painted
      mouth line. A flow field from the mesh (down the trunk, back on the head, out along the
      limbs and the tail) would give straighter strands.
- [ ] Tripo fox: the tan map moves the orange fur only by a lightness and a hue step
      (`TAN_STEP` of `tools/fox-maps.py`), so the tan fur keeps the chroma of the source and reads
      golden. A chroma step would read nearer the pale tan of the reference image.
- [ ] Fourth Tripo rabbit seats: against 931b150dd, 14 of 18 demos keep each seat, and 4 move:
      `bach-bwv1050` (8 players, up to 1.5 m), `bach-bwv1047` (2 players, the mouse oboist and a
      rabbit, 0.51 m), `bach-bwv1048` (3 players, 0.10 m), and `boulanger-matin` (3 players,
      0.13 m). The seated eyes keep their height. Causes by hybrid probes: the whisker strips make
      the head box 0.240 m wide on each side (0.207 m before, and 0.225 m or less keeps the seats
      of `bach-bwv1050` and `boulanger-matin`), and the ears in the sight mesh move `bach-bwv1047`
      and `bach-bwv1048`. Shorter whisker strips (about 10 %) would keep two demos. Check the new
      seats in the app.
- [ ] Fourth Tripo rabbit: at rest the lower end of the violin stands 2.1 cm above the lap (goal
      2.0), and the violin goes 1.0 cm into the body. In the lowering it goes 4.0 cm into the body
      (4.4 cm before). The upper arms go 3.9 cm into the body in the play (3.8 cm before), and
      into the violin 0.8 cm in the lift (0.1 cm before) (`pnpm hold-fit violinist`).
- [ ] Fourth Tripo rabbit: in `pnpm body-clip violinist` 7 of 11 rows clip (8 of 16 before): the
      left forearm and the left paw 2.3 cm and 1.9 cm into the violin in about 80 % of the play,
      the chest 2.0 cm, as on the third rabbit.
- [ ] Fourth Tripo rabbit: only 2 faces keep the gloss nose (27 on the third rabbit), because the
      face colors of the nose box fail the pink test of `nose_trim()`. Check the shine of the nose.
- [ ] Fourth Tripo rabbit face: the mouth of the source reads only a little happy in the front
      view of the hall. The map `smile` of the chain lifted the mouth corners of the third rabbit.
      Check the face in the app.
- [ ] Fourth Tripo rabbit fur: in the hall the lit fur has Oklab L 0.78 and C 0.07, and the
      rabbits of `orchestra-latest.png` L 0.94 to 0.98 and C 0.01 to 0.02. The map fur has the
      chroma of the sheet (`FUR_CHROMA`), and the warm hall light gives most of the rest.
- [ ] Tripo pig: at rest and in the moves, the right upper arm went 2.4 cm into the cap of the arm
      root (`pnpm pose-depth hornist`, limit 1.5 cm). With the arm rows of reach 0.085,
      `pnpm hold-fit hornist` gives 1.3 cm. Run `pnpm pose-depth hornist` to confirm.
- [ ] Pig hornist (4.4): the left armpit face 4454 still folds in 73% of the play and 48% of the
      lift (`pnpm fold-probe hornist`), at the front of the arm root. Check it in 2x crops from
      below.
- [ ] Pig hornist: the right grip moves 0.11 H out of the horn bell (`gripShiftR`), so the note
      target of the right palm is 4.5 cm from the grip of the horn (`pnpm hold-fit hornist`, within
      5 mm). Move the grip of the horn to the mouth of the bell (`HORN_PALM_DEPTH`), or let the
      target count the grip shift.
- [ ] Pig hornist: the right hoof is long and thick, so only about a third of it lies inside the
      flare of the bell, at the mouth. Check the hoof in the bell in the app.
- [ ] Tripo pig: in the last two of the 21 steps of the blink, 5 to 6 edge points of each closed
      lid lie just out of the head. Check a blink in a close play frame.
- [ ] Tripo pig: the denser mesh adds 36 KB to the first download (839 KB of 1 MB).
- [ ] Tripo fawn: ask the user to confirm the size: 1.3 times the scale of the standing shoulders
      of the old deer, so that the seated crown with no ears (1.53 m) is at the seated crown of the
      Tripo wolf (1.54 m), H 0.287 m against 0.369 m of the wolf, the ears above the wolf ears,
      and the trunk slimmer (chest 0.30 m against 0.38 m). Also confirm the arms 1.3 times longer.
- [ ] Tripo fawn: the eyeballs and their sockets are at 0.8 of the source, so that each eye opening
      is about 0.14 of the head width. Ask the user to confirm the eye size against the FBX.
- [ ] Tripo beagle cellist: the right paw twists 66° on its forearm at rest (`pnpm arm-check
      cellist`, paw twist p95), 92° before the rest grip of `f5031198e`. No rest grip, rest
      elbow, or bow turn of the scan took it to 45° or less. In one lowering at the end of
      `boulanger-matin` (280.67 s), the right paw turns 3,818°/s (limit 3,000). Check the bow
      wrist at rest and that lowering in the app.
- [ ] Tripo beagle bow hand (4.4, 5.3): the stick lies under the curled finger tips, 5 cm from
      the middle of the closed paw (`pnpm wind-grip cellist`). A curl of 105° puts it through
      the middle of the paw, but 20 faces of the right knuckles fold. Weights or a ring at the
      knuckles of the chain `tools/blender/hand/dog/` that bend without a fold allow that curl.
- [ ] Tripo beagle cellist folds: in the arm gate, the left arm folds 20 faces and the right arm
      12 (limit 8) now that both arms reach the strings. The left paw swings 75° (limit 70).
- [ ] Tripo beagle cellist folds (4.4): face 1410 (`hand_R`) folds in each of the 25,185 samples
      of `pnpm fold-probe cellist` (rest, play, and lift). Faces 5426 and 6365 (`wrist_L`) fold
      in each of the 18 rest samples, and in 52 % and 40 % of the play samples. Wait for the next
      body of the dog before a fix.
- [ ] Tripo beagle cellist: the front of each elbow has one long quad band between 2 poles, with
      no ring split. Check the inner elbow fold of the bow arm in the app.
- [ ] Tripo beagle seats (4.5): the larger beagle and its 1/2 cello make the footprint of the
      cellist larger, so the layout moves the seats. In 12 of the 18 demos the stage side grows by
      about 0.23 m. In `mozart-k191` each seat moves 12 cm to 28 cm, and in some demos the
      sections take other places, with moves up to 1.8 m. Check the rows in the app, and decide if
      the layout must keep the old places.
- [ ] Tripo beagle cello size (4.6): the reach of the left arm fails the cello rule at each size,
      so the rule gives the clamp of a 1/10, and the 1/2 of the dog comes from the body scale by
      hand. Fit `CELLO_ELBOW` or the reach test to the hold of the dog (`DOG_HOLD`).
- [ ] Violist grip turn: with the level viola of 0.925, the left paw of the cat turns 64° from its
      accepted grip (p50, limit 45, 49° with the viola of 0.74, `ACCEPTED_GRIPS` of
      `tools/arm-check.ts`). Check the left paw in 2x crops, and give the new median to
      `ACCEPTED_GRIPS` if it is good.
- [ ] Tripo monkey: the eye whites read smaller, and the pupils larger and darker, in the
      app than in the FBX viewer (`reports/2026-11-11-monkey/panel.png`, face rows). Find whether
      the map scale, the finish `varnish`, or the light makes the change.
- [ ] Tripo monkey: the source has small notches at the back of the knees and under the
      haunch, which show as dark marks in the back views. The look rule allows no point edit of
      the legs, so ask before any fix.
- [ ] Tripo monkey: the right hand closes under the valve casing, with no finger tip on a
      valve cap (the hold constants of the monkey before it). Check the grip against the trumpet
      technique (`docs/reference/wind-technique.md` 2.1).
- [ ] Tripo hippo: in the pizzicato of `brahms-2` (108 s to 114 s), the right upper arm and the
      right forearm each twist about 62°. A bow tip down keeps both near 47°, but the bow then
      goes 17.6 cm into the belly.
- [ ] Tripo hippo: at rest, the hanging right arm presses the side of the round belly (the paw
      4.9 cm, the upper arm 6.6 cm). Check it in 2x crops.
- [ ] Tripo hippo: the contrabass of 0.7 on the short end pin, 0.22 H in front of the belly,
      changes the footprint of the hippo and its seats. Check the hall views of `beethoven-1` and
      `boulanger-matin`.
- [ ] Tripo hippo: the gray-pink skin of the FBX reads as a light peach in the app light, and the
      snout casts a dark band over the mouth line. Ask the user before any change of the light.
- [ ] Tripo hippo bassist: the left forearm goes 3.3 cm into the neck heel of the lower bass in
      each play sample, and the left claws touch the pegbox (2.8 cm) in the first position.
      With a left paw tilt of 30°, the claws went 4.2 cm into the upper bout.
- [ ] Tripo hippo bassist: the bow plays near the end of the fingerboard (`soundingPoint` 0.3 to
      0.25), because the cello sounding point on the lower bass flips the bow paw on the lowest
      string. Show the user the frog and tip views (`reports/2026-11-11-cont/hippo/`).
- [ ] Tripo hippo bassist: the right upper arm goes up to 5.0 cm into the right shoulder in 64% of
      the play samples of `boulanger-matin` (24% with the higher bass, the same depth).
- [ ] Tripo cat violist: the left arm twists 55° in the lift (target 45°), the left paw swings
      72° at rest (limit 70), and the play grip turn is 64°. Each elbow that cut the swing turned
      the viola off its short arc. Lift elbows (`liftPoleL`, arm-check twist p95 / carry-check
      detour, base 55° / 36°): (0.6, 0.7, 0.5) 54° / 45°, (0.6, 0.4, 0.5) 48° / 58°,
      (0.6, 0.4, 0.3) 59° / 43°, (0.6, 0.2, 0.5) 38° / 63°, each with 0 opposed steps.
- [ ] Tripo red fox violinist: with the lower, left violin of the head turn, a paw goes up to
      1.6 cm into the violin in the lowering (1.3 % of the samples of the fox with four-digit
      paws, limit 1.5 cm). The rest bow via (`restBow.via.reach`) and the violin path
      (`liftReach`) are the knobs.
- [ ] Tripo beagle cellist: the clearance sweep puts the cello 12.3 cm into the chest at the bass
      side of the upper back, behind the left upper arm. No view shows it; the fit measures only
      the middle line of the back.

Done when: the gallery shows each species with its instrument, the budget test passes, and the
scene of each demo has its seats and stage size with no overlap.

## Step 5. Motion (5, 4.7, 9.7)

- [ ] Dog cellist: the left ear touches the cello, and the bow reach is 69% (goal 70%). Move the
      cello.
- [ ] Dog cellist: the knees stay about 21 cm from the leaned cello.
- [ ] Dog cellist: in `boulanger-matin` (121 s to 127 s), the third cellist puts one paw 2.4 cm into
      the other, where pizzicato on the low strings meets a held arco note (`pnpm clip-probe`).
- [ ] Dog: faces 1713 and 1714 of the left inner elbow fold at rest and in 13% of the lift samples
      of `mozart-k525`, and the left elbow shape `arm_raise_L` leaves 6 faces turned over in its own
      pose. Fit the left elbow shapes again with the rest elbow of `DOG_HOLD` (`pnpm raise-fit`).
- [ ] Dog: the white band of each rebuilt forearm ends in a saw-tooth color edge near the wrist
      (`reports/2026-11-03-dog-hold/crops-el20/`). Try a color blend (`colorBlend`) or a ring on the
      edge.
- [ ] Dog: a soft star dent shows on the chest below the right arm root from the right side, and a
      thin dark line at the right root from az150 at rest. Try a fair of the body caps.
- [ ] Cat violist: the left elbow up in the middle of the lift (`liftPoleL`, 5.2) rolls the left
      upper arm, and its skin twists 60° in the lift (p95, limit 55, 19° with the elbow out,
      `pnpm arm-check violist`). Each elbow that turns the viola the short way twists 60° to 64°.
- [ ] `pnpm pose-depth violist` stops on the working tree and on c03179672: the bones of the cat
      have 20 open loops, and the caller expects 25.
- [ ] Cat violist: in the 5th position, the left wrist under the neck keeps a twisted band.
- [ ] Cat violist: the left wrist bends about 30° from the forearm in the low positions, but a real
      violist keeps it straight (string-technique).
- [ ] Red fox: the bow grip is 2.2 cm from the middle of the paw for the standing soloist.
- [ ] Bowed strings: the change to pizzicato takes the bow hair 28.5 mm off the strings at one
      stroke of `boulanger-matin` (18.96 s).
- [ ] Bowed strings: a pizzicato note right after a bowed note (21 of 199 changes of
      `boulanger-matin`) still takes the bow off 0.2 s before the bowed note ends
      (`BOW_MOTION.techniqueLeastSec`). A change of 0.1 s turned the bow arm at 3,000°/s.
- [ ] Rabbit violinist: at the start of the lowering at the end of `boulanger-matin` (280.7 s),
      the bow turns at 7,124°/s and the bow paw at 5,920°/s for one step (1/240 s).
- [ ] Bow plan: ask the user to check the slurs that the bow plan infers from the MIDI files (21% to
      38% of the notes).
- [ ] When the test pause ends, fix the paused tests: the choir shot test, the shot test of the 2 cm
      moves, and the slide test of `src/pose/winds.test.ts` (equal steps).
- [ ] Wind breath: the breath in expands the chest and the belly, with still shoulders, in place of
      the lean back of the spine (wind-technique 1.6).
- [ ] Trombone: in a fast run, take the alternate position that moves the slide less, such as B♭3 in
      5 and F4 in 4 or 6 (wind-technique 1.3).
- [ ] Double horn: advanced players use the B♭ side above the written G4. The app has a single F
      horn. The B♭ side needs a thumb valve and a second fundamental, B♭1 (wind-technique 2.2).
- [ ] Panda trombonist: the shadow of the left arm crosses the belly in the front view. Show the
      user the front view.
- [ ] Panda trombonist: from the front, the right paw lies below the lower slide tube with its tips
      on the brace, so it reads as a paw under the slide.
- [ ] Hippo bassist: the right elbow goes 0.6 cm into the back of the contrabass at 197.40 s of
      `beethoven-1` (0 cm with the old body). The touch is accepted for now, because the T-pose
      body takes the upper arms from 5.1 cm to 1.3 cm out of the body. Try an elbow path for the
      frog-side low-string bow place: a right shoulder turn of 46° or a lean of 10° moves the
      touch to `bach-bwv1050` and `beethoven-9` (3.0 cm and 3.4 cm).
- [ ] Hippo bassist: check the texture under the right arm from az150 on the T-pose body. The old
      mesh showed a light face there.
- [ ] Held instruments over 2 cm in the body: the pig hornist, the rhino tubist, the red fox, the
      rabbit, and the cat. Fit each hold, or accept the depth with its reason.
- [ ] Merge gate: it runs no clearance sweep. Add the pair "instrument in body" of each held role to
      the gate, or end the test pause for it.
- [ ] Mouse oboist: the big head and the long muzzle put the reed 11 cm in front of the shoulder
      joints and high above them, so the paws hold the oboe at the height of the shoulders, with
      the right elbow bent 28° and the left 49°. Show the user, and offer a bowed head.
- [ ] Mouse oboist: the mitten paws have one bone for the digit block and none for the thumb, so
      the digits close together and the thumb lies along the tube. Ask the user if the paws need
      digit bones and a thumb bone (chain `tools/blender/hand/mouse/`).
- [ ] Mouse and beaver: find a source for the size of a small oboe and a small bassoon. The mouse
      plays an oboe of 0.5, and the beaver a bassoon of 0.7 (wind-technique 4.2). At 0.7 the bell
      top is 3.5 cm below the head top. At 0.8 the boot goes 8 cm into the belly.
- [ ] Beaver bassoonist: the bassoon of 0.7 moves 20 players by 1 cm to 27 cm in mozart-k191 (the
      pig horn 27.1 cm, red fox violins 21.3 cm and 15.4 cm), and each beaver stand 2 cm in 10
      demos. The reed blade hides behind the teeth, so from the front only the bocal shows.
- [ ] Beaver bassoonist: the forward turn of 2026-11-12 (`BEAVER_PLAY_TURN`) clears the eye in the
      app view, but in the close front-left head view (az -45) the bell end touches the front of
      the eye, and the tube covers the snout. A longer bocal (`BASSOON_REED`) could move it out, and
      it also moves the grips. Ask the user. The right arm folds p95 are 37 (27 before), and the
      bell top is 7.9 cm below the head top.
- [ ] Mouse (Tripo hand rig): the oboist folds 18 faces of the left arm and 15 of the right at p95
      (`pnpm arm-check oboist`, limit 8, 6 and 8 on the old mouse): the curled digits around the
      oboe, and thin faces at the arm root that fold with a shoulder turn of 2° to 8°
      (`pnpm fold-probe oboist --faces 20`). Look at the paws and the armpits in the app.
- [ ] Mouse (Tripo hand rig): at the eye height of the old mouse, the layout gives the seats of
      `7fa9d1e89` in 12 of 18 demos, with the penguin riser at 1.10 m in beethoven-9. The footprint
      of the mouse still moves players of 5 demos: beethoven-5-4 (a tan fox 0.55 m), mozart-k191
      (a dog 0.39 m, the stage side 9.45 m to 9.25 m), mozart-k315 (a pig 0.25 m), mozart-k417 (the
      mouse 0.18 m), and beethoven-9 (the mouse 5 cm). With the boxes of the old tail, only the
      mouse of mozart-k417 (0.22 m) and a red fox of mozart-k191 (8 cm) move. The tail of the
      source lies straight back (0.03 m wide), and the tail of the old mouse curled to the side
      (0.19 m wide). Ask the user: keep these seats, or a tail bind that curls to the side.
- [ ] Badger (Tripo hand rig, larger crown): the layout moves the mice and the tan foxes of
      boulanger-matin by up to 1.62 m and a hippo by 0.18 m against `7fa9d1e89`, and the badgers of
      beethoven-9 by 6 cm. The old mouse gives the same moves, so the badger causes them. Check the
      layout of boulanger-matin with the user.
- [ ] Mouse (Tripo hand rig): 2 points of each open lid and 1 side point in the blink leave the head
      at the socket rim (ray casts of `lids()`). Check the blink in a close view.
- [ ] Wolf clarinetist: at 35° the right paw reaches its grip with only 0.2 cm to spare, also with
      the right shoulder 45° forward (`pnpm hold-reach wolf --instrument clarinet`), and a palm
      misses its grip by up to 13.9 mm (`pnpm hold-fit clarinetist`, note targets, 6.2 mm before
      the smaller paws). Try a larger arm factor (up to 1.25) or a new mouthpiece place.
- [ ] Wolf clarinetist: the smaller paws raise the folded arm faces (`pnpm arm-check clarinetist`,
      folds p95) from 53 to 66 (left) and from 48 to 55 (right), over the limit of 8 before and
      after. Find the folded faces (`pnpm fold-probe`), and check the paws in the app.
- [ ] Wolf clarinetist: the mouthpiece goes 1.6 cm into the head under the long muzzle.
- [ ] Wolf: the seated wolf is 1.01 times the dog cellist, below the range of the orchestra images.
      Ask the user to confirm the shape of the body.
- [ ] Wolf: ask the user to confirm the face (level brows, level bead eyes, a thin smile line).
- [ ] Wolf: in the warm stage light, the fur shows a warm gray, but the wolf of the orchestra images
      is a cool gray with no cream chest. Show the user the face and a play frame.
- [ ] Wolf: at rest, the root of the tail goes 0.6 cm into the back of the seat.
- [ ] Close views: at zoom 2, the oboe leaves the frame of the ±35° views at the paws. Widen the
      frame of the oboist in `ROLE_VIEWS` of `tools/close-views.ts`.
- [ ] Wind players: the mitten paws close as one block, so no finger lies on a key.
- [ ] Wind thumbs: the thumbs of the meshes have no bone, and the rhino and pig paws have no digit.
      Add a thumb measure to `pnpm wind-grip`, and check the horn hold in the images.
- [ ] Horn grip: `pnpm wind-grip` has no hornist role, because the horn names no grip tube
      (`tubes: {}` of the horn in `models/instruments/brass.ts`). Give the horn a tube at the
      valves and at the bell throat, and add the role.
- [ ] Wind grips: `pnpm wind-grip` takes the finger tips from the bind pose, and the right oboe paw
      grasps in 54% of the play. Check the right oboe grip.
- [ ] Accepted grips: after a check of the 2x paw crops, update `ACCEPTED_GRIPS` for the bassoonist,
      the trombonist, the oboist, the clarinetist, the wolf, the tubist, and the xylophone.
- [ ] Horn: the right palm lies across the bell opening, 2.5 cm inside it (`HORN_PALM_DEPTH`). A
      real hand goes deeper, against the far wall at 2 o'clock. Turn the paw along the bell.
- [ ] Tripo beaver bassoonist: the curled digits and the paws fold 23 (left) and 20 (right) faces
      in the play (arm gate, limit 8), and the left grip turn p50 is 36° (17° on the old beaver).
      Check the paws on the bassoon in a 2x crop.
- [ ] Tripo beaver: the left upper arm lies 2.7 cm to 3.4 cm in the body at its root in each
      sample (`pnpm pose-depth bassoonist`, limit 1.5). Check if the sweep counts the root of an
      arm with no cut.
- [ ] Tripo beaver: its footprint moves the beavers 0.21 m to 0.52 m in their rows in 4 demos, and
      one cat 1.41 m in `boulanger-matin`. Check the wind rows in the hall view.
- [ ] Twist steps above 25° between two arm bones: the left forearm of the rabbit, the cat, and the
      foxes, the panda, and the wolf right forearm. Add forearm segments.
- [ ] Twist steps: measure the steps of the snare drum and the xylophone on the percussion test
      score.
- [ ] Arm gate: accept or fix the values near their margins: the cat, the elephant, the panda
      (`FAIL`, or revert `2ae168dc`), the mouse, the wolf, and the wind players.
- [ ] Arm gate: the stretch counts from the rest sample, so a rest shape or a bent wrist gives a
      false stretch (the hippo `FAIL`, the elephant, the snare). Count from the bind.
- [ ] Seam gate: no measure of the skin separates the flaps, the shards, and the dents at the arm
      seam, so `pnpm arm-check` does not see them. Try a render measure of the audit cells.
- [ ] Arm root dents, such as the V crease at the front of the rabbit right arm root: the bend from
      the source arm to the bind arm makes them. Try `studio.bindArms` nearer to the source.
- [ ] Rabbit: gate the branch `rabbit-depth` (`b1e270f02`, the bow grip further out in the lift and
      the lowering), then merge or remove it.
- [ ] Rabbit soloist: the violin goes 2.3 cm into the body in the lift and the lowering. Check the
      chin and the left shoulder in the close views.
- [ ] Rabbit violinist: the right forearm goes 2.1 cm into the body for 0.2 s at the song end of
      `bach-bwv1050`.
- [ ] Rhino: the shoulders widen the footprint, and the conductor pose of `boulanger-matin` changes
      from 257.38 s. Check that the cue of the conductor still aims at the tuba.
- [ ] Body probe: a change of the panda rig changes the pose sets of other players (38 sets of the
      hippo, the elephant, the badger, and the conductor with the free arms). The layout packs the
      seats of a row by the footprints (`playerFootprint()`), so the 0.7 cm narrower panda moves 9
      seats up to 0.32 cm, and their looks and cues change. Give the probe a seat mark, so that a
      body change shows the moved seats apart from a pose change.
- [ ] Tan fox flutist: the grips of the play and the rest lie on two sides of the flute, so the
      right paw turns around the tube in the lift (`gripAround`). Show the user the 2x crops.
- [ ] Pig hornist: the round belly covers the short thighs, so the horn rests on the belly. Show the
      user the close views.
- [ ] Pig: in the front view, the skin of the armpits stretches into bands to the raised upper arms.
      Show the user the close views.
- [ ] Pig: 22 faces of the right armpit turn past 45° at rest, and the rest shape keeps face 217
      turned over. `cut_seam()` fails on the pig seam (a vertex with two loop edges).
- [ ] Pose depth: `pnpm pose-depth --soloist` takes only a bowed role, so a standing pig soloist
      gets no check.
- [ ] Badger percussionist: ask the user to confirm the suspended cymbal, or longer arms for hand
      cymbals.
- [ ] Badger: the front fur and the eye stripes are darker than the sheet, and the warm light shows
      the stripes on the head as a mid brown. Show the user the faces.
- [ ] Badger triangle: the clip hangs from the tip of the thumb near the shoulder height, below the
      long snout. A real player holds it near the eye level, but a clip 0.4 H higher put the left
      claws 5.8 cm into the snout. Ask the user for a triangle at the chest or on its stand.
- [ ] Xylophone: a scale stays in one paw (122 of 127 fast strikes of the test score), because a
      paw never passes the other (`pass` 0), and one paw does not reach the outer bars. A real
      player alternates the hands over the two rows of bars (percussion-technique 9).
- [ ] Xylophone: in a run up the test score, the right paw misses the two sharp bars in the middle
      of the back row by 8 mm to 26 mm, and rises to the height of the muzzle.
- [ ] Xylophone: the mallets of 0.30 m look long beside the small bars. A shorter mallet moves the
      band of reach and the bars nearer.
- [ ] Xylophone: on a chord of two near bars, the shafts of the two mallets touch in 0.1% of the
      samples.
- [ ] Elephant timpanist: the left paw grasps its mallet in 84% of the play and 71% of the lift,
      and the right paw in 0% of the lowering (wind-grip, as on main). The largest twist step of
      the left paw was 29° in 0.01 s before the grip change: measure it again.
- [ ] Elephant timpanist: at rest, the felt balls lie on the heads, each on its own kettle,
      because each paw reaches only the front kettle of its side. Add a source for the rest of a
      timpanist to `docs/reference/percussion-technique.md`, and check the rest against it.
- [ ] Elephant timpanist: dark lines and areas show on the chest beside the raised arms, where the
      upper arm of the mesh lies on the side of the body.
- [ ] Elephant timpanist: a roll stays in one hand, and the outer kettles stand out of reach
      (`PercussionHold.pair`). Offer the user longer arms.
- [ ] Triangle: a louder note turns the beater back only up to 1.35 times as far, because a larger
      turn put the beater into the belly (1.9 cm at 1.5). A real loud stroke adds the arm.
- [ ] Small percussion: no demo has a rest of 2.7 s between the triangle and the tambourine
      (`switchRestSec()`), so each demo plays the tambourine on the trap table with the beater.
      `boulanger-matin` changes the instrument in 0 s to 2.1 s. Ask the user for a demo or a
      shorter switch.
- [ ] Polar bear pianist: the claw tips almost touch when the paws play two octaves apart, because
      the paws point in along the forearms (`PAW_TURN`).
- [ ] Conductor: add to `docs/reference/conductor-technique.md` the beat patterns, the tempo of a
      beat in 2 or in 1, and the sway, with sources. The fold limit of 168 BPM has no source.
- [ ] Conductor: the left palm turns only a part of the way up or down, because the twist of the
      paw stops at `MAX_TWIST_L` (45°). A full palm up needs a forearm that points nearer to its
      bind direction, or a supinated bind of the left arm.
- [ ] Conductor: the crescendo weight reads a trend of 2 s, so a long build, such as 115 s to
      126 s of `the-ember-crown.mid`, shows only in its last seconds. Try a trend over the phrase.
- [ ] Film: the Cinematic film shows the conductor in few shots. Give `pawchestra-film` a camera
      that keeps the bear in the frame, so that a film can show the expression of the conductor.
- [ ] Conductor: the sway of four demos takes 2 beats a side. Show the user, and check a lower
      `PULSE_TEMPO`.
- [ ] Conductor: the last bar of 7/8 of `bach-bwv1048` is beaten at 200 BPM, and the count-in beat
      of its first bar of 1/8 is 0.3 s. A fold needs an uneven grouping, such as 2+2+3.
- [ ] Conductor: the sway stops at the last pulse, so a file can stop its sway up to 0.5 s before
      its end.
- [ ] Docs: cut `docs/agents/commands.md` to about 3,000 words (writing.md).
- [ ] Tool: let `pnpm arm-check --views` render a `--midi` file and the percussion test score, so
      that the snare drummer and the xylophonist get crops.
- [ ] Tool: add `pnpm move-views <role> <demo> lift|lower <at> <times> [--base <ref>]`, which writes
      2x crop pairs of the frames inside a lift or a lowering.
- [ ] Tool: extend `pnpm arm-check --trace` to the lowerings and the pause points, with columns for
      the twist bone and the turn rates of the wrist and the forearm, and with `--base`.
- [ ] Tool: bring the cold arm gate back near 3 minutes: pose only the body of the role in the set
      `move`, with one pause point, in its own child process.
- [ ] Tool: give `pnpm hold-scan` the spare reach of a wind grip, the strikes of a percussion hold,
      and the lift and lowering samples.
- [ ] Tool: add `pnpm close-views --camera-at <bone>`, crop pairs from four directions around a
      bone.
- [ ] Tool: let `pnpm close-views` use the build again when the tree hash is the same, and take more
      than one `--glb` in one run.
- [ ] Tool: let `--at` of `pnpm close-views play` and `--views` of `pnpm arm-check` take the
      conductor.
- [ ] Tool: give `pnpm close-views play` the `--glb` option, so that a rig variant renders at any
      camera with no swap in the tree.
- [ ] Tool: let `--set` change `PIANO_SCALE` and `PIANO_FRONT_H` in memory.
- [ ] Tool: add a crease probe and a loop and non-manifold check of a GLB, each with `--base`.
- [ ] Tool: let `pnpm arm-check` print the bind bend of each paw beside the paw swing, and the
      forearm turn from a neutral forearm.
- [ ] Tool: add `pnpm arm-variants <animal> --edit <script> --opts <json>...`, which rigs each
      option set and prints the arm measures, the folds, and the depth of the upper arms.
- [ ] Tool: add `pnpm elbow-look`, and `pnpm arm-look --explain section` (the ring points, the
      weights, and the posed section of the worst sample).
- [ ] Tool: add `--no-shadows` to `pnpm close-views`, and a shade probe that maps the largest face
      of a dark patch to source vertices.
- [ ] Tool: mark in red the pixels of `close-views --sheet` that change by more than 40.
- [ ] Tool: let `pnpm rig-mesh --check --keep` run `pnpm arm-check --glb` on the kept variants in
      parallel jobs.
- [ ] Tool: let `pnpm rig-mesh --check` print the edges that pass through the skin and the hard
      edges near each knee.
- [ ] Tool: give `pnpm carry-check` a cache of the working tree, and `close-views play --base` a
      cache of the base frames.
- [ ] Tool: let `pnpm pose-depth` print only the pairs that differ between its `--set` rows, and
      take `--sets lift,lower`.
- [ ] Clips (4.4): test the retarget on real Mixamo files in `scratch/mixamo/`. The spike used the
      Mixamo-style clips of the mannequin round and a scratch armature only.
- [ ] Clips: the paws of `Clap` do not meet on the cat (0.80 H, 0.004 H with the plain
      retarget), and on round bodies with wide shoulders: elephant 1.7 H, bear 1.05 H, penguin
      2.3 H. The lift of `liftArms()` up to `LIFT_LIMIT` does not clear these arms, and the free
      turn then parts the paws. A larger lift puts the paws of the cat into its head. The upper arm
      of the clap goes deeper than with the plain retarget on the rhino (0.029 H to 0.049 H) and at
      the root on the bear (0.157 H to 0.190 H).
- [ ] Clips: the root of the upper arm lies in the shoulder in the T-pose of the source and in
      each clip, up to 0.19 H (bear, `Clap`), because of the skin at the arm cut. The clearance
      rule does not test the root. Check it with the arm gate.
- [ ] Clips: a standing foot of `Walk` still slides 0.06 H (beaver) and 0.04 H (penguin) in one
      step, because the thigh and the shin of these bodies have other ratios than the human leg.
- [ ] Tool: let `pnpm clip-views` print the gap of the paws and the slide of a standing foot. The
      clip fit round measured them with a scratch probe.
- [ ] Models: the files `mannequin-human-mixamo.*` and `mannequin-animal-mixamo.*` of
      `assets/models/mannequin/` have no `Idle` and no `Walk`. Write them again with
      `tools/blender/mannequin.py` in a round that may change the asset files.
- [ ] Clips: a clip in the concert needs a place for the instrument (a stand or the floor) and a
      blend from the rest pose of 5.2 into the clip and back. The gallery hides the instrument.
- [ ] Clips: decide where a retargeted clip for the build lives outside git (design 8.1), such as a
      private folder that `pnpm deploy:vercel` reads.
- [ ] Models: rig a real Mixamo-rigged animal with `pnpm mixamo-model` and `pnpm rig-mesh`, and
      give its arm segments their own weights. The spike rigged the animal mannequin with the
      seat of the rhino config. Blocked: the project author decides the rule of the auto-rig output
      (design 8.1).
- [ ] Tool: `pnpm rig-mesh` stops on a mesh with no eye or nose faces (no gloss faces), because
      `primitive_arrays()` of `rig_mesh.py` gets an empty material.
- [ ] Tool: `pnpm fold-probe` prints a wrong "Source middle (u)" for some faces. For face 133 of the
      deer it gives (-0.1721, 0.3031, 0.0644), but entry 133 of the corners file of the rig gives
      (-0.1909, 0.2710, 0.0843), the point that fixed the face in `weights.rigidPainted`.
- [ ] Let the viola and the contrabass lower in a long rest (`LONG_REST.keepUp`). In a long rest
      of the viola, the right paw of the cat goes 2.7 cm into the viola (0.1 cm deeper than the
      lowering after a pause), and the rest pose of the contrabass puts the left paw of the hippo
      4.4 cm into the neck (5.2).
- [ ] Show the user a lineup of the body layer at 1.5 (now, `BODY_MOTION.scale`), 2, and 3 times.
      Then give each player a level and trend track, as the conductor has
      (`buildExpressionTrack()`): a lean into a crescendo, a chest turn with a long bow, a bell lift
      at a phrase peak. The sway of each player already has a seeded side, lag, and level (5.1).
- [ ] Show the user a lineup of a seeded fur value step of ±5% for each player of a section, as one
      uniform of each player mesh. The posture of each player already varies (`PlayerPlan.posture`),
      and the four foxes of a section still have one face color (5.1).
- [ ] Turn the clavicle by a share of the lift of the upper arm (try 0.25 above 30°) before the
      IK, on the bow arm of the rabbit first. Now the clavicle takes one constant turn for each
      hold: the violinist shoulder bone turns 0.02° in 20 s, the upper arm 58.6° (4.7).
- [ ] Eye gaze pilot on one body in a trial folder: two optional eye bones, the eye faces at
      weight 1, a turn of at most 10° that starts 0.1 s before a planned look. Check the lids in
      2x crops. Now the eyes follow only `head`, and the gaze is paint (4.7).

Done when: the pose tests pass, and the pose and frame targets pass.

## Step 6. UI (2, 6.6, 9.5)

- [ ] Run `node tools/measure-targets.ts` on a quiet machine. The render target of 9.7 failed only
      under the load of other processes.
- [ ] Decide a second step for the soft starts that the velocity curve does not reach (6.1, 6.8).
      With `VELOCITY_ATTENUATION_CB`, the first 10 s of `beethoven-8-4` sit 17 LU below
      `TARGET_LOUDNESS`, and the 10 s to 30 s of `beethoven-1` sit 22 LU below. The curve at 0 cB
      leaves them 10 LU and 16 LU below. The first 10 s of `beethoven-6-1` sit at the limit of
      12 LU (hall). A slow leveler is an option, and no velocity of a file changes.
- [ ] Decide if the GeneralUser GS presets with their own velocity curve need a smaller cut
      (6.1). With `VELOCITY_ATTENUATION_CB`, p (velocity 40) of Concert Choir is 4.8 dB below f
      (velocity 96), and of Brass Section 3.9 dB, below the limit of 5 dB of the sweep.
- [ ] Add `pnpm loudness --check` to CI or to the merge checks. Until then, run it after each change
      of a demo file, the SoundFont, the velocity curve, the mix, the hall, or the limiter (6.8).
- [ ] Move the seat flags and the settings of `App` into small classes next to it, because
      `src/app/app.ts` is long. Do it after the work on the audio chain and the camera in `app.ts`.
- [ ] Check the seat rings in Safari, in Firefox, and on a real phone (2.8).
- [ ] Make `pnpm keyboard` pass again. At 1440 × 900 the check "Tooltips of the speed menu and the
      volume slider" fails, and `checkHiddenBarTap` stops at a timeout, because the UI has no
      `.collapse` element now. Thus the run never reaches its last checks.
- [ ] Ask the user for a public cast page: a mode `?page=cast` of the gallery with the UI names of
      the instruments, no test controls, and a link from the drawer and `/about`. The gallery and
      `test.html` are development pages with `noindex` now (7.4).
- [ ] Ask the user for Fraunces in the piece title. Measure a Latin subset first (target: at most
      25 KB as WOFF2, loaded after the first frame) and run `pnpm lighthouse`. The first download
      is 866,070 B of 1,000,000 B. The title now uses a system serif that differs on each
      platform (2.8, 7.2).

Done when: the UI matches the prototype at both sizes, and a keyboard alone can reach and use
each control.

## Step 6b. Cinematic camera (2.3, 2.4, 2.5, 2.8, 4.5, 5.6, 9.7)

- [ ] Take frames of each kind of shot of each demo at both sizes, and the GIF, and check them
      against 5.6 (9.8).
- [ ] Check the title in the frame at 844 × 390: it covers about 30% of the frame height at the
      left. A smaller title in Cinematic mode, or a fade some seconds after a piece starts, can
      help (2.3).
- [ ] Let the smoke test check Cinematic mode: the letterbox, and the rule that hides the whole UI.
      No end-to-end test uses Cinematic mode now (2.3, 2.5).
- [ ] Check the letterbox on a GPU with no float target. That path has no post effects, and it uses
      the canvas scissor of three.js in CSS pixels (4.5).
- [ ] Update the paused frame tests of `src/shots/test-shot-frames.ts` to `CINEMA_ASPECT`, to the
      composition of the close shots, and to the blurred head at a side edge. Let them read
      `FOREGROUND` and `CLEARANCE` in place of copies. They still sample the aspects 1.6 and 0.46
      (5.6). Also `prepare.test.ts` expects the half height of the shot over the shoulder above
      0.25 S (now about 0.21 S), and the 33° test of `camera-keys.test.ts` fails on the base too.
- [ ] Make the side views read as one clear side. A near player of the group can fill a frame edge
      (`beethoven-5-4` at 28.57 s, the ears at the bottom of `mozart-k191` at 125 s), and a view of
      the right side shows the backs of the cellists (5.6).
- [ ] Show the user the effect of the animal floor of 1.2 m before a second step. The median
      elevation of a solo went from 13.5° to 17.2°, and of a section from 20.4° to 22.4°. A blurred
      body at 1.2 m still fills a side edge (`beethoven-5-4` at 349.5 s) (5.6).
- [ ] Bring the plan time back to at most 1.05 times `ade6e026` (now 1.10, `pnpm plan-time`).
      `bach-bwv1047` became about 2 times slower in the round of the animal floor: find why. The
      outlines of `prepareSubjects()` take about 9% and the music reads about 13%. Design 9.7 gives
      at most 20 ms for the largest demo, and `beethoven-8-4` and `brahms-2` take about 40 ms.
- [ ] Test the closing shot and the fill wide shot against the 30° rule. At the last cut, refuse a
      wide or high candidate that makes a jump cut with the fixed closing key, and try
      `highFraming()` before the seeded fallback of the fill. No such jump cut occurs now (5.6).
- [ ] Tool: add `pnpm close-views play --shots <n> [--base <ref>]`, which renders the middle of the
      first n shots into a labelled contact sheet, and `--set` for the constants of the planner. A
      shot round wrote 4 scratch scripts for this, about 35 minutes.
- [ ] Tool: cache the base rows of `pnpm frame-compare` by tree, and let `close-views`,
      `screenshots`, and the Playwright probes take `tools/measure-lock.sh` as GPU users. A UI
      round spent about 45 minutes on frame measures, with refused runs under the load of renders.
- [ ] Tool: add `pnpm close-views play --look <JSON>...` with `--sheet`, which renders each look
      variant from one build in a labelled grid with a base row. It saves about 8 minutes for each
      look lineup.
- [ ] Tool: add `pnpm screenshots --cinematic --sizes <list>` (the UI shown and hidden) and a mode
      that records a UI move as a screencast. A UI round wrote three probes for this.
- [ ] Tool: let `pnpm shot-trace --base` tell if the two traces are equal, and add `--profile` to
      `pnpm plan-time`. A shot round wrote a scratch script for each.
- [ ] Tool: `pnpm close-views play` with `--pause` or `--url` still renders 1 to 2 s after `--time`.
      The label then says "on the bar".
- [ ] Ask the user for a portrait shot plan of Cinematic mode, with the portrait constants of the
      skill `pawchestra-film`. A phone in portrait shows the frame in 19.8% of the screen height,
      and only a hint asks to turn the phone. It changes the rule of 2.5 that a piece gives the
      same film on each screen.
- [ ] Ask the user about the inserts of the printed music and of the out of focus lamps. The
      music faces the players, so a camera within the line of 5.6 sees the back of the desk, and
      the lamps are the hall lamps, which the inserts do not show. No source gives either
      cutaway (`camera-technique.md`, section 6).
- [ ] Find a clear insert camera for the details that get none: the keys of the polar bear (its
      shoulder covers them from the side, and the case from the front), the bell of a trumpet or a
      horn behind its stand, the slide, and the cello and the double bass fingers, whose left paw
      travels along the neck (5.6).
- [ ] Count the inserts of each demo with a rule check in `pnpm shot-trace --rules`: no entry in
      an insert, the lead kept, the rate, the 30° rule at both cuts, and the frame tests of the
      play pose. `boulanger-matin` gets only 2 inserts, `bach-bwv1047` gets 6 (5.6).

Done when: the tests of 5.6 pass for each demo, the shot targets and the frame target of 9.7
pass, and the smoke test checks the camera.

## Step 8. Polished look (1, 2.5, 2.8, 4.1 to 4.6, 5.6)

The targets are `docs/reference/mockup.png` and `docs/reference/scene.png` (design 1). The
navigation menu at the top of the mockup is out of scope.

- [ ] Scene look: the hall with warm lights out of focus, the visible beam, the glossy stage, the
      lights, and the post effects (bloom, depth of field, vignette, grain, color grade).
- [ ] Camera: the default view and the shots of `scene.png`.
- [ ] Cast: the faceted animals and the instruments of `scene.png`.
- [ ] UI: the title, the panel, the demo rows, the seat rows, and the bar of `mockup.png`.
- [ ] Do the hall of the scene look task before the color tasks. Wide film shots show the stage in
      a black space, with no wall and no seats. Also do the bow of the conductor to the audience
      early: the end of a piece now has no reward (2.4, 5.4).
- [ ] Show the user the key shadow fit of the solo and section shots
      (`reports/2026-11-12-audit-render/t4-shadow/`). Outside the sphere a player gets no key
      shadow, and the soft dark areas of the old wide blur are lit now (4.5).
- [ ] Test KTX2 body maps with the transcoder after the first frame. The high tier keeps the
      maps at full size: 386 MB of GPU memory in `boulanger-matin` (2.6).
- [ ] Measure on a real phone which step of the automatic tier holds 30 fps: medium, medium at
      the pixel ratio 1.25 or 1.0, or low (2.6, 9.4).
- [ ] Show the user the ear glow of the rim light (`EAR_GLOW`, a first moderate step) in a lineup
      of strengths (4.5).
- [ ] Ask the user for instrument surface detail: a wood grain from a 3D noise in bind space on the
      `varnish` faces (no image file) and a clear coat. Design 4.1 keeps the plain parts of the
      instruments flat. Make a lineup of one violin and one cello first (4.1).
- [ ] After the shadow fit, make a proxy of about 1,500 triangles for one species in its chain,
      and draw it in the shadow and depth passes. Measure with `pnpm frame`. Now each pass draws
      about 360,000 triangles for 42 players (7.2, 9.7).
- [ ] Give the cello and the contrabass the deeper ribs of the real instruments (about 0.16 of the
      body length), and check the holds of the dog and the hippo.
- [ ] Slope the strings of the bowed strings down about 5° from the bridge to the nut, as on a real
      instrument. The bow contact, the fingerboard target, and the left hand poses follow the line.
- [ ] Audit the seating of design 4.2 against professional orchestras and choirs, with sources and
      the file and the line of each finding. Then fix the findings that the user approves.
- [ ] Bring the high tier within the frame target of 9.7 (4 ms p95 on the GPU and the main thread).
      The main thread passes. With the pixel ratio 1.5, no side light shadows, and 12 stage
      samples, the GPU was about 5 ms p95 on a view of the stage top, in one run that was not
      valid (another process used the GPU). Measure it on an idle machine.
- [ ] Pin the views of the traces of `pnpm frame`, for example with a fixed shot. The shot plan
      follows the layout, so the piano scale of 2026-10-24 moved the Metal trace from a view of
      the hall to a view of the stage top: 2.2 ms more GPU time with no change of a frame (9.7).
- [ ] Move `shareCorners()` and `createDepthGeometry()` out of the main thread, into the build or
      a Worker: about 75 ms of the build of `perf-60.mid` on the development Mac, in steps.
- [ ] Cut `poseStudioBones()`: about 0.5 ms of each frame for the 55 bodies of `perf-60.mid`.
- [ ] Compile the shaders before the first frame with no block (`compileAsync()`): `setProgram()`
      takes about 335 ms in the first frame of the default demo. The first frame stays the same.
- [ ] Cut the frame cost of the cinematic light: about 0.67 ms in each frame of `perf-60.mid`,
      0.42 ms of it in the bake step.
- [ ] Decide on the two back-row lights: they cost about 1.0 ms of GPU p50 in one run on a view
      of the stage top.
- [ ] When the test pause ends, fix `scene/player.test.ts` (6 of 13 fail) and the pool test of
      `scene/light-pool.test.ts` (no `#include <lights_fragment_end>`).
- [ ] The glow of the haze around the beam is weaker than in `orchestra-latest.png` above the stage
      in the camera `orchestra`. Free mode dims the beam there, as in a close shot.
- [ ] Give the players the shadows of the props again, such as the shadow of a chair seat on the
      shins. The bake took the props out of the shadow map.
- [ ] The white fur of the rabbit is a little more yellow than in `orchestra-latest.png` (hue 26°
      against 19°, `pnpm look-lab`).
- [ ] The chairs are less saturated than in `orchestra-latest.png`, and the stage outside the pool
      of light is brighter in the camera `orchestra`.
- [ ] Ask the user about a cool fill (`#282c34`) against the warm keys. It makes the shade of the
      white fur a little grayer.
- [ ] The lit floor in the pool is darker than in `orchestra-latest.png`, most beside the podium.
      Ask the user if the planks go back to their color, with the narrow pool.
- [ ] The white fur of the back rows is darker against the front rows than in `orchestra-latest.png`
      (`pnpm look-lab`, camera `default`).
- [ ] The floor at the back of the stage is brighter than in `orchestra-latest.png`.
- [ ] On the high and medium tiers, the hot spot of the key light also multiplies the side lights
      (`SPOT_POOL_GLSL`), so the back row gets less light than the first row.
- [ ] The chair mask "chair, front left" of `LOOK_REGIONS` (`tools/look-lab.ts`) holds only 4
      pixels, because its luma limit is 90.
- [ ] The polar bear close shot clips a channel on 0.6% of its light fur, because the key light and
      the kicker light the tops of its shoulders and arms.
- [ ] The shot planner keeps one upright cone at the stage center (`insideBeam()`). With three beams
      (`RIM_PLACE.count` 3), a camera can stand in a side beam and draw its back faces.
- [ ] Find the reads of the look roots at module load with a saved check. `LOAD_TIME_PATHS` of
      `scene/look-values.ts` lists them by hand, and a missed read fails with no error.
- [ ] Tool: give `pnpm close-views play` a `--look <JSON>` option that starts its own dev server, as
      `look-variants` does.
- [ ] Tool: give `pnpm look-variants` a `--shots <subjects>` option that renders the close shot of
      each variant and prints its clip measure.
- [ ] Fetch the presets of the default demo before the score build: the link is idle for about 4.7 s
      on a phone. This changes a rule of AGENTS.md, so ask the user first.
- [ ] Ship the packed meshes of the studio bodies as one binary file with gzip, read with
      `DecompressionStream`. It saves about 50 KB of the first download (7.2).
- [ ] Move the layout, the pose plan, and the geometry of the players off the main thread of the
      first frame, into a Worker or into the build: about 2.8 s on the phone run.
- [ ] Remove the CPU skin of each player in the first frame (`SkinnedMesh.computeBoundingSphere()`,
      about 138 ms). A new sphere can change the draw order.
- [ ] Ask the user about a service worker for repeat visits. It saves the revalidation of about 745
      KB after the `max-age` of 600 s of GitHub Pages. A host with brotli saves about 128 KB more.

Done when: the screenshots of design 9.8 look like `mockup.png` and `scene.png`, the size check
passes, and the quality tiers of 2.6 keep 60 fps on a laptop.

## Step 7. Demo build, tests, and deploy (8, 9)

- [ ] Run `pnpm deploy:vercel`, open the deployed site, play the default demo, and check that the
      CI run passes (9.2).
- [ ] Turn off GitHub Pages in the settings of the repository. The old site at
      <https://qiao.github.io/pawchestra/> stays online until then.
- [ ] Check the notes on GitHub Pages against Vercel: design 7.2 and 8.3, and the comments of
      `tools/gzip-site.ts`, `tools/size.ts`, `tools/load-probe.ts`, `src/audio/plain-bytes.ts`, and
      `vite.config.ts`. They tell how the host sends the files that the build gzips.
- [ ] Add `AudioContext.playbackStats` to the manual release test of 9.4. Chrome gives the underruns
      there.
- [ ] Add to 9.4: Escape in the open speed list below 700 px closes only the list (Chrome), and a
      phone call and fast taps on Pause and Play leave a correct state (iPhone).
- [ ] Do the manual release test of 9.4 with the user, on the deployed site and the real devices.
- [ ] Add `pnpm same-code <ref> [paths]`: it proves that a change touches only comments (the
      TypeScript and Python ASTs with no comments, the TOML data, and shell files with no
      comments). A comment round needs it.
- [ ] Give `pnpm rig-mesh` a `--base <ref>` mode that compares the outputs and caches each result
      by its inputs, as `body-probe` does. A check of all 18 animals now takes about 100 minutes.
- [ ] Add `pnpm knip` for the unused exports, with the HTML entries, `tools/**/*.ts`, and
      `--include-entry-exports`.
- [ ] Format `tools/mesh-rigs/*.json` with oxfmt, so that a script can rewrite them.
- [ ] Let `pnpm frame-compare` pass `--canvas-only` to its frozen step, for a round that changes
      the UI and the scene.
- [ ] Let the contrast checks of `e2e/title-shade.e2e.ts` print the place of the worst pixel, not
      only the ratio. An outline of the GitHub pill needed a probe to find.
- [ ] Red paused test files (9.3). On 2026-11-08, 59 of 231 files stay red after the removal of
      the dead tests and the tuned pins. Each one is a behavior test that a deliberate change
      broke. Fix the test or the code of each file before the pause ends:
      - Bodies and rigs: `src/models/footprint`, `player`, `studio-body`, `studio-rig`,
        `species`, and `mesh` tests, and `src/scene/player.test.ts`. The hand rigs and the
        corrective shapes changed the joints, the palettes, the eyes, and the morph count (4).
      - `src/models/studio-size.test.ts`: the packed polar bear is 47,672 B, above
        `STUDIO_MESH_GZIP_BUDGET` (34,000 B, design 7.2).
      - Instruments: `catalog`, `percussion`, and `piano` tests of `src/models/instruments/`. The
        trap table, the switch copies, the contrabass, and the piano scale moved.
      - `src/models/layout-scene.test.ts` (10 tests): the lane search and the first desk moves
        change the rows, the back desks, and the arcs. The choir risers reach 0.12 m into the
        side margin, the polar bear piano 7 mm into a corner cut, and the solo violin of
        BWV 1047 sits right of 0°.
      - Shots: `camera-at`, `choir-theme`, `opening-drawer`, `prepare`, `trace`, and the four
        `shot-frames` tests of `src/shots/`. The layout and the lower default view moved them.
      - Poses: 25 files of `src/pose/` and `src/gallery/sheet-poses.test.ts`. The new holds and
        bodies move the depths, the note targets, the gestures, and the rest places.
      - App and audio: `src/app/transport.test.ts` (the seek state), and
        `src/audio/player.test.ts` (the fake Worker gets no message in 18 tests).
      - Scene: `geometry` and `light-pool` tests of `src/scene/`. `addPlayerFill()` finds no
        light chunk in the test shader.
      - Tools: `close-views`, `hold-fit`, `hold-reach`, `hold-sets`, `rig-mesh`,
        `rig-mesh-check`, `studio-body`, and `studio-palette` tests of `tools/`. The rig configs
        have no `app.shoulders`.
- [ ] Remove the audit and review labels from the `it()` and `describe()` names of the paused
      tests, and the dated notes that the `_arms.py` scripts write into the weights files of
      `assets/models/`.
- [ ] Find or make one file of the famous pieces with no usable file (8.1):
      - Mozart, The Magic Flute overture: Mutopia 248 has four MIDI files. It needs a join tool.
      - Tchaikovsky, The Nutcracker: no orchestral file has a permitted license.
      - Vivaldi, The Four Seasons, Spring: Mutopia 301 is CC BY-SA.
      - Holst, The Planets, Jupiter: the CC0 score on IMSLP has only Dorico files.
      - Dvořák, Symphony 9: Mutopia 1793 is CC BY-SA.
      - Saint-Saëns, The Carnival of the Animals: the public domain Aquarium file of IMSLP does
        not download with a script, and Aquarium is not cheerful.
      - Haydn, Symphony 94: the CC BY score on IMSLP has only LilyPond files, from a modern
        edition.
      - Mozart, Clarinet Concerto: the MIDI file of Mutopia 1635 has no clarinet part.
      - Bizet, Carmen. Mozart, The Marriage of Figaro. Strauss II, The Blue Danube. Rossini,
        William Tell. Offenbach, Orpheus in the Underworld. Elgar, Pomp and Circumstance. Strauss
        I, Radetzky March: no file with a permitted license.

Done when: CI passes on `main` with Playwright in Chromium, and the deployed site plays the
default demo.

# TODO

This list holds the open tasks of Zoophony, under the steps of the work order (design 9.5). It is
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

- [ ] Monkey trumpeter: two thin faces across the wrists (329 and 1090) fold in each play sample.
      Cut the thin faces, or count their pixels in a probe build.
- [ ] Monkey trumpeter: from the front at the elevation 20, the right paw on the valve tops hides
      the mouth. Try a lower right grip or a smaller curl.
- [ ] Monkey trumpeter: the right thumb points back to the mouthpiece. A real player puts it under
      the lead pipe between the first and the second valve casing (wind-technique 2.1).
- [ ] Monkey: ask the user to confirm the stand of the monkey, which has no chair.
- [ ] Monkey: `STUDIO_MONKEY.seatHeight` is the height of the haunch for a body with no chair. Check
      each reader of the seat height of a body with no chair.
- [ ] Monkey: if the monkey gets a chair again, the root of the tail goes into the seat. Then give
      the tail three bones, or put it over the back edge of the seat.
- [ ] Mouse and beaver: they stand in their seated poses with no chair. Measure their balance (the
      center of mass over the feet), and save the balance probe as a tool.
- [ ] Rhino tubist: ask the user to confirm the stand, the arms of the mesh, the lead pipe, and the
      hold.
- [ ] Rhino tubist: with a tuba of about 10 kg, the center of mass lies at the front end of the
      stable range of the soles. A small lean of the trunk back is an option.
- [ ] Rhino tubist: the mitten paws go up to 2.4 cm into the tuba (limit 2.2 cm), and the right arm
      folds 6 faces at p95. Try a thinner round stump at the nails, or a grip outside the tube.
- [ ] Rhino tubist: the left forearm comes 1.5 cm into the main branch of the tuba in the moves and
      at rest (limit 1.5 cm), because the left elbow is low.
- [ ] Rhino: check the left forearm from az-150 for a flat flap under the arm.
- [ ] Deer harpist: ask the user to confirm the length of the arms, the size of the harp, its lean
      back onto the right shoulder, the box under it, and the rebuilt arms.
- [ ] Deer harpist: the left palm is 0.14 m above the middle of the strings, but a harpist holds
      both hands at almost one level. A lower palm needs room in the paw swing from the straight
      bind paw (59°, and 67° at 0.10 m, limit 70°).
- [ ] Deer harpist: the forearms rise about 30° from the elbow to the wrist, but a harpist holds
      them level. The elbows of the short arms hang below the strings (harp-technique).
- [ ] Deer harpist: the knees lie under the round belly, so the base of the harp stands in front of
      them. From the front, the crown of the column stands just below the muzzle.
- [ ] Deer harpist: `HARPIST_SWEEP` accepts a forearm depth of 2.5 cm in the body, but the depth is
      0 cm now. Trim the entry when the tests come back.
- [ ] Deer: a small cream fold of the haunch lies on the seat under the puff tail.
- [ ] Add the chair as an obstacle to the sweeps of the seated roles, with the legs and the haunch
      as parts (`SEATED_PARTS`, `seatSurface()` of `pose/test-sweep-roles.ts`).
- [ ] Penguin singer: ask the user to confirm the size, the flippers, the place of the folder, the
      wider folder (covers of 0.26 m) with the elbows further out, and the white throat. Option:
      flippers 1.25 times as long.
- [ ] Penguin: black wedges from the roots of the flippers show on the white belly under the folder
      in the front views.
- [ ] Penguin: the crease angle 35° has no facet probe against the penguins of the reference images
      (`ANIMALS` of `tools/studio-body.ts`).
- [ ] Penguin with rebuilt flippers: under the raised flipper, the black and white edge of the side
      lies up to about 1 cm further back than on the old rig, and the right side shows more white
      under the flipper (`reports/2026-11-03-penguin-arms/crop-left-c4.png`). The straight bind
      narrows the bent elbow rings to about 3.5 and 3.4 cm (old bind 3.80 and 4.28 cm), and one face
      of the left flipper root still turns over in the bind after the relax. In the cast matrix,
      the round upper arms go 3.6 to 6.2 cm into the body (old flippers 1.3 to 3.4 cm).
- [ ] Penguin: the round rebuilt flippers go 1.3 cm into the chest, and the forearms 0.3 cm into
      the folder (0 cm on the old flippers). The edge of the orange beak and feet is not cut.
      Check the roots of the flippers with a fill light.
- [ ] Red fox and rabbit: the string planes are 9° and 10°, under the real 17°, because larger
      angles fold the right shoulder. Fix the right shoulder in a rig round (string-technique).
- [ ] Panda: at rest, the app view (front left, 30° up) shows a white wedge of the chest between
      the raised left arm and the band. It is the top of the white belly of the texture, and its
      edge is now a clean curve. The reference images show a white chest up to a thin collar, so the
      rig keeps it. Ask the user if the band must cover the upper chest
      (`reports/2026-11-03-panda-edges/crops.png`).
- [ ] Panda: the lower edge of the band keeps a small step on each side under the arm root, and
      the outer top corner of the right eye patch keeps a short point (also in the texture).
- [ ] Panda: the eye margin of `panda_edge.py` (0.004) is near a limit. With 0, the cut faces in
      the left eye box grow the old eye of the rig, and its ring color makes a white hole in the
      patch. A change of the eye box or of the eye rules checks both patches.
- [ ] Panda: the side under each arm root (the shoulder band, 0.8 to 0.9 of the trunk line) has
      more clavicle and arm weight than trunk weight, so `pnpm trunk-form trombonist --to 0.9`
      gives a gap of 8.9 and 10.4 cm in the play and 8.2 and 6.7 cm at rest (old panda 3.0 and 1.6
      cm). The best try, `weights.paintedBelow` [0.6, 0.68] / 0.12 with a left `raise` shape of
      the rest (`pnpm raise-fit trombonist --faces 1598,1602,1603 --side L --sets rest,lift`),
      gives 4.8 and 5.5 cm in the play and 4.6 and 4.1 cm at rest, near half. It passes the arm
      gate (left folds 3, base 5), but the right arm folds 3 faces (base 2): face 689 at the front
      of the right arm root. A rigid face there gave 6 folds. With the rule, the bind itself has
      a gap of 4.7 and 5.0 cm, so no weight rule makes the gap smaller than that: a form change
      of the bind at the shoulder band is next. A rule above 0.62 u leaves faces of the right
      elbow `raise` shape turned over, and an inner limit of 0.10 or 0.14 makes the left side
      worse (`reports/2026-11-03-panda-head/`, try files in `scratch/merged/panda-head/`).
- [ ] Panda: the trunk from the hips to the neck is 1.41 H long (old panda 1.52 H), and the sit
      lifts the lowest haunch up to 11 cm onto the seat top of the old chair. Check the haunch from
      behind in the app view.
- [ ] Panda face: from 30° above, the mouthpiece and the paws hide the smile. Check the smile with
      the user in a close play frame of the stage.
- [ ] Pig: a T-pose mesh gave a flat slab, a flap, and 9 to 14 folded faces at the shoulders, so the
      current mesh stays. Ask the user: a ring at each shoulder, or another mesh.
- [ ] Polar bear pianist: in the play, the arms go up to 6.3 cm (forearms) and 7.4 cm (upper arms)
      into the trunk. In the lowering, 6.7 cm and 6.5 cm.
- [ ] Polar bear hand rig: a pocket stays at the front of each armpit in the chord and the far-left
      keys (0.0102 units, 2.1 cm, below its neighbors after the weight fixes, 4.9 cm before). Ask
      the user: a corrective key `arm_raise_*`, or a point edit of the armpit corner of the mesh.
- [ ] Polar bear hand rig: a soft ledge stays at the top of the right seated thigh near the groin in
      the pedal pose. Check it in the stage light.
- [ ] Polar bear hand rig: the right inner elbow folds up to 15 faces in the play (p95 11, limit 8)
      with the upright trunk and the keys at 1.0 H, and the left arm 8 in the lift. Keys at 1.1 H
      fold 7, but the upright trunk then reaches only 72% of the note targets of `bach-bwv1050`.
      Ask the user: a corrective key at the elbow, or loop edges.
- [ ] Polar bear pianist: from the front, the higher case and the lid hide the bear below the face.
- [ ] Polar bear pianist: at the far keys, the outer upper arm stands 36° to 41° out from the round
      trunk (piano-technique).
- [ ] Polar bear pianist: at rest, the paws lie on the front of the belly, not in the lap, because
      the thighs lie out of the reach of the arms (0.66 m). The lap place of `along` 0.45 to 0.7
      meets the chest or misses the leg on this body (`legTop()`).
- [ ] Polar bear legs: with the thighs 25° down (knee 120° in the bind), the pedal pose folds 5
      thin faces at the back of the right knee (2035, 2036, 3918, 5406, 4201) and 1 of the thigh
      (3917) in each play sample (`pnpm fold-probe pianist`: `shin_R`, `thigh_R`). Check the back
      of the right knee in the stage light.
- [ ] Polar bear hand rig: a dent stays at the middle of the front of the crotch, 1.1 cm below its
      neighbors (vertex 1797), and the edge of the belly overhangs the thigh roots. The piano hides
      both from the stage camera.
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
      tapers. Try a cut higher on the outer side of the hip, with tilted top rings.
- [ ] Polar bear legs: the thighs are short, so the lap is small.
- [ ] Polar bear legs: 4 edges of the crease of the left instep and 4 edges of the cut loop at the
      crotch turn more than 40° in the bind. Check them in the stage light.
- [ ] Polar bear legs: in the bind, 3 faces of the left shin and thigh turn over after the groin
      crease.
- [ ] Polar bear pianist: in the fast passages of `bach-bwv1050`, the head moves about 4 cm to each
      side two times each second. Find a calmer side lean that keeps the reach of the far paw.
- [ ] Polar bear keys: with the gaps between the white keys, the soft shadow of the paws on the keys
      is weaker. The claws stay at the key top and do not follow a pressed key down.
- [ ] Polar bear pianist: at 1% of the notes of the demos, the arm is at its full reach, and the
      palm stops up to 3.2 cm short of the key (the note target check of the pianist clearance).
      A lean toward the keys for a far black key can give the reach.
- [ ] Polar bear pianist: on a white key, the lowest claw point hangs about 3 cm in front of the
      front edge, at the height of the key top, so the claws do not rest on the key. Check it in a
      close view, and move the palm in (`palmL`, `palmR`) with the arm gate.
- [ ] Polar bear wrist: one edge of the left wrist band, on the palm side, stays concave in the play
      at a groove of the mesh. Check it from below in the stage light, and fair the groove.
- [ ] Polar bear paws: the automatic weights give each paw about 0.35 of the wrist helper, so the
      paw turns about two thirds of the hand turn. Take the helper off the paws (`step_wrist()`).
- [ ] Polar bear copy: `tools/blender/polar_bear_legs.py` stops when the JPEG of the arm image leaks
      into the free columns of the strip. Skip a border of 8 columns in `atlas_strip()`.
- [ ] Piano: the lifted piano (`PIANO_LIFT`, `PIANO_SCALE` 1.16, the lid at 25°) moves the rows of
      the demos, the lid hides the lower muzzle of the right contrabass of `bach-bwv1050`, and its
      legs show under the higher case. Show the user the default views
      (`reports/2026-11-05-polar-bear-seat/after-stage/`).
- [ ] Close views: the pianist has no lift or lowering moment in `ROLE_VIEWS`, so `close-views
      pianist --moments lift50` fails. Give the role the moments of `halfMoves()`.
- [ ] Bear: at rest, the arms stand out about 35° around the wide belly, and the upper arms go 2.2
      cm into the body while the arms move.
- [ ] Bear arm gate: with the straight bind, `pnpm arm-check conductor --base` fails the paw swing
      (L 43, R 51 against 26, 31), the move twist (63, 58 against 60, 52), and the flat share
      (0.84, 0.87 against 0.94, 0.92). They count from the bind. The world turns of the paws stay
      within 0.2°, and the elbow ring is 0.5 cm thicker in the lift. Accept the new base values.
- [ ] Bear forearm: one elbow axis serves the upper arm and the forearm, and the source forearm
      lies about 4° out of the plane of the old bent bind. So the forearm frame turns 4.07° from
      its old world turn in each pose. Give the forearm its own axis if a crop shows it.
- [ ] Bear wrist folds: two faces of the right palm heel fold in 99% of the play (the base had
      one), inside the crease, and two faces of the right forearm fold in 4% to 7%. No crop shows
      them. From az150 at elevation 40, the left wrist shows a soft shade where it bends.
- [ ] Bear: from az-150, a soft dark crease stays at the left arm root, most at rest. From az150, a
      small dark pocket stays where the raised right arm meets the back.
- [ ] Bear: the trunk faces of the notch below the caps of the cut face down under each raised arm.
      No view shows them.
- [ ] Bear: the cheeks and the brow show a few facets in the head crops. Try a larger blend on the
      head only.
- [ ] Bear and elephant: in the gallery light, each arm casts a black band of shadow on the trunk
      beside the belly. Check it in the stage light.
- [ ] Cat: face 832 at the front of the right armpit folds in most of the play. Arm segments allow
      no `raise` shape there.
- [ ] Cat: the armpit line at the lower back of each arm root folds a little in the play (faces 729,
      688, and 728 on the right), and 11 to 12 hidden faces of the lines turn over.
- [ ] Cat: a soft fold stays at the front of the left arm root, and a notch at rest. Put the socket
      front and the first ring front of the copy onto the trunk surface before the weights.
- [ ] Cat: at the ends of each armpit line, the wall meets the trunk at up to 108°, and a small
      point shows from az ±150. Clean the 14 thin faces of the right line.
- [ ] Cat: near the elbow, the left forearm is 0.89 of the tube in the play, because the linear
      blend turns the paw about 100° from the bind over three forearm segments.
- [ ] Cat: from the back, a dark band in a V lies on the lower back above the seat. Find the faces
      and the light that make it.
- [ ] Cat tail: 4 faces stay turned over against the bone turn after the bind. No image shows them.
- [ ] Cat: the A-pose body keeps the bent bind of the viola hold (4.4, "Role-neutral bind"). The
      straight bind (L 106, R 47) folded the inner right elbow of the violist (folds p95 R 8, base
      2, margin 2), and six tries of a shape of the bent right elbow failed
      (`reports/2026-11-02-cat-neutral/`, `reports/2026-11-02-cat-bend/`). The open choice: a
      fifth shape (`STUDIO_RAISES`).
- [ ] Cat: a run of `pnpm rig-mesh cat` today moves the tail root and 404 vertices near the haunch
      and the tail by up to 4.8 cm against the base `cat.rig.glb` of fc52d38f
      (`assets/models/cat/README.md`). Find the change of `rig_mesh.py`, and make the run give
      the base file again. Then `pnpm glb-point-edits assets/models/cat/cat-edits.json` adds the
      point edits.
- [ ] Cat tail: the haunch fills the width of the seat (`seatWidth`), so the outer half of the
      curled tail end lies over the left edge of the seat (README, "Point edits"). Choose a wider
      chair or a shorter curl.
- [ ] Cat tail root: under the haunch, 6 edges at the tail root fold by 109° to 174° (vertices
      2224, 2254, 2255, 2256, 2258, 3721, 3730, and 4415 of `cat.rig.glb`). The seat hides them in
      each view of `reports/2026-11-05-cat-edits/`. Move them with point edits if a crop shows them.
- [ ] Cat violist: the skin of the bow arm crumples in the play: `pnpm arm-look violist` gives a
      crease share of 20.0% on `mozart-k525` (limit 14.6%), 3.3% in the bind, and 1.7% at rest.
      The creased edges lie at the right arm root, where `clavicle_R` meets the chest, the neck,
      and `spine1` in hard steps (30 places with a step above 0.5). The elbow poles change the share
      by at most 1 point, and a shoulder reach of 26° gives 20%. A blend of the root weights gives
      14.9% to 17.2%, but it doubles to quintuples the folded faces of `pnpm fold-probe`. Rebuild
      the weights of the right arm root, or fit a `raise` shape.
- [ ] Cat legs: ask the user for the leg girth step of
      `reports/2026-11-05-cat-edits/leg-lineup.png` (1.15, 1.25, or 1.35). The body has 1.25, and
      the README gives the rule for another step.
- [ ] Rabbit, red fox, cat, and tan fox: the arm-down shape restores the twist loss of the bind left
      forearm twice. Mask the forearm part of the shape on a supinated side.
- [ ] Bind paws: the bind paws of most configs start pronated, so the cellist, the bassist, and the
      oboist twist the left paw near 170°. Try `studio.bindSupination`.
- [ ] Red fox and tan fox: at rest, the crook of the right elbow keeps a soft fold, because the
      linear blend pinches the bent inner elbow. A dual quaternion bind folds the bow arm.
- [ ] Red fox and tan fox: thin dark V lines on the white chest are splits of the normals of the fur
      spikes of the mesh. Smooth them like the neck notches, or give them the skin normals.
- [ ] Tan fox flutist: no left elbow that grasps the flute brings the move twist of the left paw
      (87°) to 70°.
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
- [ ] Cat violist: ask the user to confirm the 1/2 viola. A 3/4 viola reaches the nut at about 55°.
- [ ] When the tests come back, run `pnpm test:paused src/shots/` and
      `src/models/layout-scene.test.ts`. The harp, the viola, and the piano gap moved seats.
- [ ] Layout: it knows only the bind footprints, so only a piano case keeps the reach of a player in
      play. A hold that reaches further can clip (a bassist beside a clarinet in `beethoven-8`).
- [ ] Elephant: a short light sliver stays at the inner root of the right arm, near the tusk, from
      the front.
- [ ] Elephant timpanist: between strikes, the heads stay 2 cm to 7 cm above the spots with the
      shafts down. A real timpanist holds them one inch above the head with a level shaft.
- [ ] Pig hornist: fix the dark facets on the shoulders.
- [ ] Pig in the cast matrix: the moved root vertices of `pig_root.py` come up to 1.5 cm out of the
      shoulder in the snare drum (0.5 cm in before), and up to 1.2 cm in the other recast roles.
      Check them in 2x crops of the recast roles.
- [ ] Remove the unused high stool (`HIGH_STOOL` and the support `high-stool` of `props.ts`). No
      player sits on it.
- [ ] Remove the twist bone of the upper arm (`upperTwist` of the rig configs,
      `StudioBody.upperTwist`, `upper_twist()` of `tools/blender/rig_mesh.py`, and design 4.4). No
      body uses it, because the pig now has arm segments.
- [ ] Hippo: the nose tip lies on a nostril 2.7 cm from the middle plane, and the rig checks warn.
- [ ] Mouse: in the front view, the pea eyes lean in at the top, because the surface under them
      faces more up. Try a direction between the two.
- [ ] Hippo bassist: at rest, the stick goes through the middle of the round paw, and the frog end
      hides in it. Ask the user for the form of the rest hold, such as the bow on the strings.
- [ ] Hippo bassist: in the lowering after a pizzicato, the bow turns 79° in the paw. Give the move
      a bow path that keeps the forearm near 45° (`BowVia` of `pose/bowed.ts`).
- [ ] Wolf clarinetist: at rest, the bell of the clarinet rests on nothing. Offer the user the bell
      on the right knee and the left paw on the left thigh (`restFreeL`).
- [ ] Wolf clarinetist: the clarinet turns up to 14° in the closed left paw over a lift. Read the 2x
      crops of the lift, and scan the left rest elbow if it shows.
- [ ] Badger bass drummer: from the front, the drum hides the right arm and the beater, as a real
      drum hides its player. Ask the user if the badger must show more from the front.
- [ ] Badger: the snare sticks and the mallets keep about real lengths (34 cm), longer than the
      scaled bass drum beater. Ask the user if the scale of the badger applies to them too.
- [ ] Badger bass drummer: between strikes, the paw keeps its turn in the world while the body
      sways, so its twist on the forearm moves 20° in about 1 s.
- [ ] Badger bass drummer: the left paw hangs and does not muffle the head in the rests
      (percussion-technique 5).
- [ ] Close views: `pnpm close-views play` renders with no fill light. Add a fill to the play mode
      for the checks (9.8).
- [ ] Recast roles: with `--base`, `pnpm arm-check --views` and `pnpm close-views` render the
      commit with the instrument scale of its app, but the gate measures the commit with its size
      rule (`tools/recast-scale.ts`). Give the build of the commit the scale of its own rule.
- [ ] Wolf violinist (`violinist@wolf`, spike): the left paw goes 1.8 cm into the violin in the
      play (limit 1.5 cm), and the bow plays no hair within 0.18 m of the 0.38 m bow at the frog.
      The paw of the wolf is large for its smaller violin. In `pachelbel-p37` at 210.9 s, the bow
      goes 5.9 cm into the body in 2% of the samples.
- [ ] Pig hornist with rebuilt arms: at rest, the round right forearm goes 0.4 cm into the rim of
      the bell near the wrist (0.1 cm on the old arm, target 0.3 cm), with the rest
      right elbow (1, -0.5, -0.6) and the bind supination R 64 (0.3 cm on R 51). The left paw goes
      0.4 cm into the horn at rest (0.6 cm on the old hold): of 16 rest variants of the left elbow
      and the left rest grip, none kept the left paw at 0.1 cm and the left wrist at 0.3 cm or
      less. Try a rest grip on the far side of the valves, or accept the depths.
- [ ] Hanging arms: make `hangingHand()` of `pose/hang.ts` independent of the bind paw (shared pose
      code). It turns the bind paw by the shortest arc from straight down, so a straight bind turns
      the hanging paw: the hanging left paw of the badger bass drummer has the grip -44° (-22° on
      the old bind, `ACCEPTED_GRIPS`). The raised triangle upper arm of the badger goes 2.4 cm into
      the left shoulder (base 2.1 cm, accepted), and elbow variants of the triangle hold fold the
      arm root (L 8 to 10).
- [ ] Badger with rebuilt arms: the straight bind narrows the bent elbows of the xylophonist to
      2.7 cm (base 4.0 cm) and of the cymbalist to 3.2 cm (base 4.1 cm). Read the 2x elbow crops.
- [ ] Badger recast roles: the freed round upper arms go 3.4 to 4.5 cm into the body in the shared
      holds of the violin, the flute, the clarinet, and the trumpet (base 2.0 to 3.0 cm).
- [ ] Arm rebuild: a cut plane less than about 0.4 mm from a source vertex leaves a cluster of
      very small faces at its loop. `step_clean_flaps()` deletes the flaps, but the small faces
      of the dog right shoulder line still turn over at rest (`rigidPainted` fixes them). A snap
      of such a vertex onto the plane changes the bytes of the monkey, whose wrist planes pass
      0.11 mm and 0.19 mm from a vertex.
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
- [ ] Bear left bind paw: it supinates 25° in place of the rule value 51°, because 51° dents the
      side of the left forearm of the conductor near the wrist at the beat (2x crops), and wider
      skin normals and a dual quaternion bind did not remove the dent. The largest left paw twist
      p95 of the cast roles is thus 136° in place of 110° (the violin and the flute). A fix of the
      forearm form would let the left take the rule value.
- [ ] Bear `raise` shapes: the rig log keeps 3 faces of the right shape turned over after the
      relax (736, 737, 738), as on `37d5d5c7`.
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
- [ ] Deer with the neutral bind: the right forearm goes 0.24 cm deeper into the soundbox in the
      lowering (2.22 cm, base 1.98, accepted 4 cm). A right supination of 0 or 30 gives the same
      depth, so the straight bind causes it. With its `raise` shape, the right inner elbow still
      folds 2 faces at p95 in the play (494 and 495, base 0). The bent elbow rings of the harp hold
      are narrower (p5 L 2.32 cm against 2.86, R 2.15 against 2.94). The 2x crops show no pinch.
- [ ] Deer cast matrix with the neutral bind: the snare drum recast fails on the left forearm
      twist (80°, limit 80°), and the flute recast on the left paw swing (73°, limit 70°) in place
      of a flip of the left paw (move turn 17,993°/s on `14ef3d67`).
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
- [ ] Mouse with the neutral bind: the folds grow. The oboist folds 8 faces of the right arm at
      p95 at rest (limit 8, base 7) and 6 of the left arm (base 4). In the cast matrix, the snare
      drum recast folds 9 faces of the left arm in the play (limit 8, base 3) and 8 of the right
      (base 2). Its paws are pronated, so the large bind supination (127° and 119°) is far from
      them. The violin recast takes the left paw 1.6 cm into the violin in the lift (limit 1.5 cm,
      base 1.5 cm).
- [ ] Test mannequin: the forearm twist p95 of the left violin arm is 48 against 38 of the base
      (limit 80, margin 15), because the forearm segments spread the paw twist along the forearm.
      Decide if the margin holds against a base with no segments.
- [ ] Arm rebuild: on the wolf clarinetist, `arm_rebuild.py` gives fewer folds than `wind_arms.py`,
      but a flat p5 0.82 of the right arm in the lift (0.92 on `main`, margin 0.05). Find the
      ring, then replace the species scripts one at a time after a review of the crops.
- [ ] Arm rebuild: `arm_rebuild.py` has no cut along the seam with a side wall (`cat_arms.py`),
      so an arm joined to the trunk down to the elbow (the fox and the deer) keeps
      its species script.
- [ ] Mesh intake: `pnpm mesh-intake` puts the shoulder line of the dog at 0.50 of the upper arm,
      at its limit, but the arm of `dog.glb` joins the trunk down to 0.80 (the `README.md` of the
      dog). The rays from the bone do not see the seam faces outside the arm. Count the faces
      that join the arm and the trunk.
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
- [ ] Inner upper arm of the pig in the shared holds (5.3): with the root domes shrunk
      (`pig_root.py`), the round tube of `pig-upper.glb` still goes into the trunk at 0.36 to 0.47
      of the upper arm: violin play 2.3 cm, cello lowering 4.0 cm (left arm). The same vertices
      come up to 9 cm out of the trunk in other holds, so they are not a hidden root. Next: the
      elbow out in these holds, or a flatter inner side of the tube.
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
- [ ] Dog cellist left arm (5.3): the lowered elbow of `DOG_HOLD` keeps the bend of the elbow,
      about 62° between the upper arm and the forearm, so the elbow skin still makes a sharp point
      from behind (`reports/2026-11-05-dog-left-arm/crop-elbow-az-150.png`). Only a grip further
      from the shoulder opens it (the place of the cello). Run the cast matrix with the new elbow
      on `CELLO_HOLD`, and move it into the shared hold if the recast cells do not get worse.
- [ ] Dog cellist left elbow height (5.3): the left upper arm goes only about 11° down in the
      play, and a cellist holds it about 45° down on the A string (strings 1.8). A lower elbow
      folds the inner elbow faces 1711 and 1712 into a dark wedge (about 20° down: 1.2% of the
      play), and an elbow further back folds the armpit faces 2580 and 2581. The two inner elbow
      shapes of the dog (`raise` of `tools/mesh-rigs/dog.json`) come from the old level elbow
      and are at full weight in nearly each play sample. Fit a shape to the low elbow
      (`pnpm raise-fit`), or move the inner elbow rings, then lower `DOG_HOLD.poleL` again.
- [ ] Dog cellist inner elbow (4.4): the faces 1713 and 1714 at the inner left elbow fold in 15 of
      18 rest samples and in 2% to 5% of the play samples, also before the elbow changes. Look at
      them in the 2x crops of the rest, and fix them in the rig.
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
      under 8 (base 6). Open: the flutist L 26 (the front root and the flipper tip; a flute shape
      at 137° turned over more faces after the relax), the clarinetist L 11 and R 12, and the
      cellist L 10 in the lift. In the flute and clarinet holds the shared grip curls the fingers
      125° to 176°, and the flipper tip folds (faces 1894 to 1899, 2903, 2907). A flipper needs a
      smaller curl in a recast hold (pose code), or a rig with no finger bone weight at the tip.
- [ ] Badger recast folds: four arm `raise` shapes (the limit) put 7 of 10 recast arms under 8
      (base 3). Open: the cellist L 15 (play and lift; a cello shape gave the percussionist 4 more
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
      change of the pea eye of the app must change both, or the preview must come from the app.

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
- [ ] Cat violist: in the 5th position, the left wrist under the neck keeps a twisted band.
- [ ] Cat violist: the left wrist bends about 30° from the forearm in the low positions, but a real
      violist keeps it straight (string-technique).
- [ ] Red fox: the bow grip is 2.2 cm from the middle of the paw for the standing soloist.
- [ ] Bowed strings: the change to pizzicato takes the bow hair 28.5 mm off the strings at one
      stroke of `boulanger-matin` (18.96 s).
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
- [ ] Panda trombonist: the arm reaches 0.155 m of the slide, 27% of a real seventh position. A
      larger right shoulder turn puts the right upper arm into the belly, and the grip 0.05 H up the
      brace keeps it off the belly. Show the user slide angles of 45° and 60°.
- [ ] Panda trombonist: the left elbow out uses most of the margin of the grip turn (left 16,
      margin 15 over 2). Show the user the 2x paw crops of the play and the rest, and ask to accept
      the new medians in `ACCEPTED_GRIPS`, so that a later hold change has room.
- [ ] Panda trombonist rest: the top of the upright trombone crosses the left eye in the front
      view. A place beside the head (rest turn 20° to the left, `restShift` [-0.4, -0.16, -0.3])
      turned the right arm across the belly: the arm gate failed (right folds 5, flat 0.73), and
      the upper arms went 5.9 cm into the body. A lower place with the slide 25° forward
      (`restDown` 50, `restShift` [0, -0.28, -0.38]) cleared the face and passed the gate, but the
      upper arms went 0.5 cm deeper and the left paw left its rest grip
      (`reports/2026-11-03-panda-look/rest-tries.png`). Ask the user for the rest place.
- [ ] Panda trombonist rest: in the middle of the lift and the lowering, the left finger tips
      leave the tubes (`pnpm wind-grip`: lift 94%, lowering 83%). A left rest grip 0.02 H toward
      the left shoulder gave 94% and 90%, but flattened the left upper arm at rest (arm gate flat
      0.81, base 0.87).
- [ ] Panda: the upper chest width at 0.75 of the seat to neck span (W7 of `pnpm body-shape
      trombonist --base 7cf41074`) is 0.86 of the old panda, near the limit of 15%. The old trunk
      is about 8% narrower at all heights, so the black band of the back still reads a little wider
      (`reports/2026-11-03-panda-chest/`).
- [ ] Panda trombonist: from the front, the right paw lies below the lower slide tube with its tips
      on the brace, so it reads as a paw under the slide.
- [ ] Hippo bassist: the right elbow goes 0.6 cm into the back of the contrabass at 197.40 s of
      `beethoven-1` (0 cm with the old body). The touch is accepted for now, because the T-pose
      body takes the upper arms from 5.1 cm to 1.3 cm out of the body. Try an elbow path for the
      frog-side low-string bow place: a right shoulder turn of 46° or a lean of 10° moves the
      touch to `bach-bwv1050` and `beethoven-9` (3.0 cm and 3.4 cm).
- [ ] Hippo bassist: check the texture under the right arm from az150 on the T-pose body. The old
      mesh showed a light face there.
- [ ] Hippo bassist: the left paw stops only up to 0.7 of the fingerboard, so the high notes take
      lower places on the neck. Show the user a high passage of `bach-bwv1050`.
- [ ] Hippo bassist: the bow plays only a part of the hair, so the strokes are short. Offer the user
      longer arms or a smaller contrabass.
- [ ] Hippo bassist: the top edge of the upper bout touches the chest under the chin, and a few
      teeth of the skin show over it in a close view from the front.
- [ ] Held instruments over 2 cm in the body: the pig hornist, the rhino tubist, the red fox, the
      rabbit, and the cat. Fit each hold, or accept the depth with its reason.
- [ ] Merge gate: it runs no clearance sweep. Add the pair "instrument in body" of each held role to
      the gate, or end the test pause for it.
- [ ] Mouse oboist: the big head puts the reed high, so the paws hold the half-size oboe at the
      height of the shoulders with open elbows. Show the user, and offer a bowed head.
- [ ] Mouse and beaver: find a source for the size of a small oboe and a small bassoon. The mouse
      plays an oboe of 0.5, and the beaver a bassoon of 0.82 (wind-technique 4.2).
- [ ] Mouse: the loop of the long tail lies on the floor behind the mouse, and the footprint is
      0.764 m deep. Check the tail between the rows of the stage with the user.
- [ ] Mouse: with no chair, the haunch hangs 0.076 m above the floor, and it seems to float in the
      low side view. Offer the user a lower haunch, or the heels further back.
- [ ] Wolf clarinetist: renders from the camera of the reference images put the clarinet of the wolf
      at about 30° to 35°. The app uses 30°. Show the user, and offer 35°.
- [ ] Wolf clarinetist: the right paw reaches its grip with only 0.9 cm to spare. Try a larger arm
      factor (up to 1.25) or a new mouthpiece place.
- [ ] Wolf clarinetist: the mouthpiece goes 1.3 cm into the head under the long muzzle.
- [ ] Wolf: the seated wolf is 1.01 times the dog cellist, below the range of the orchestra images.
      Ask the user to confirm the shape of the body.
- [ ] Wolf: ask the user to confirm the face (level brows, level pea eyes, a thin smile line).
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
- [ ] Beaver bassoonist: three faces of the inner left elbow fold in each play sample, and the
      left paw swings 70° on its forearm in the play (limit 70). Try wider elbow rings
      (`arm_rebuild.py --spec`) with new rigid crease points, or a left elbow `raise` shape.
- [ ] Beaver: the fur keeps the orange-brown of its texture. Ask the user if the plain fur takes the
      chroma of `SPECIES_COLORS.beaver`.
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
- [ ] Badger: ask the user to confirm the size of the badger.
- [ ] Badger: the front fur and the eye stripes are darker than the sheet, and the warm light shows
      the stripes on the head as a mid brown. Show the user the faces.
- [ ] Suspended cymbal: the free paw does not muffle the plate after a note, and the moments of
      `ROLE_VIEWS.cymbalist` keep the names of a crash.
- [ ] Badger triangle: the left paw stands with the fingers up. A real player holds the clip between
      the thumb and the fingers at eye level (percussion-technique 10).
- [ ] Snare and cymbal: at rest, the arms hang, so the tips stand 5 cm to 9 cm outside the rim
      (5.2). Ask the user if `ready` keeps the tips over the instrument at rest.
- [ ] Xylophone: a scale stays in one paw, and one paw does not reach the outer bars. A real player
      alternates the hands in a scale, with no cross (`alternateHands()`, percussion-technique 9).
- [ ] Xylophone: where one paw passes the other in a run, the shafts show as an X from above. A real
      player keeps a V (percussion-technique 9).
- [ ] Xylophone: between strikes, the heads stand up to 13 cm high. A real player keeps the stroke 2
      to 3 inches high. A lower head bent the wrist past the gate.
- [ ] Xylophone: in a run up the test score, the right paw misses the two sharp bars in the middle
      of the back row by 8 mm to 26 mm, and rises to the height of the muzzle.
- [ ] Xylophone: the mallets of 0.30 m look long beside the small bars. A shorter mallet moves the
      band of reach and the bars nearer.
- [ ] Xylophone: on a chord of two near bars, the shafts of the two mallets touch in 0.1% of the
      samples.
- [ ] Xylophone grip: the shafts leave the fists past the knuckles, so the exit rule finds no grasp.
- [ ] Xylophone rest: the paws hold the mallets up and forward at rest. No source gives the rest of
      a xylophonist. The set position of the snare drum can fit it.
- [ ] Elephant timpanist: the left paw grasps in 68% of the lift, and its largest twist step is 29°
      in 0.01 s.
- [ ] Elephant timpanist: dark lines and areas show on the chest beside the raised arms, where the
      upper arm of the mesh lies on the side of the body.
- [ ] Elephant timpanist: a roll stays in one hand, and the outer kettles stand out of reach
      (`PercussionHold.pair`). Offer the user longer arms.
- [ ] Polar bear pianist: the claw tips almost touch when the paws play two octaves apart, because
      the paws point in along the forearms (`PAW_TURN`).
- [ ] Conductor: start `docs/reference/conducting-technique.md` with sources: the beat patterns, the
      tempo of a beat in 2 or in 1, and the sway. The fold limit of 168 BPM has no source.
- [ ] Conductor: the sway of four demos takes 2 beats a side. Show the user, and check a lower
      `PULSE_TEMPO`.
- [ ] Conductor: the last bar of 7/8 of `bach-bwv1048` is beaten at 200 BPM, and the count-in beat
      of its first bar of 1/8 is 0.3 s. A fold needs an uneven grouping, such as 2+2+3.
- [ ] Conductor: the sway stops at the last pulse, so a file can stop its sway up to 0.5 s before
      its end.
- [ ] Docs: cut `docs/agents/commands.md` to about 3,000 words and `docs/agents/rigging.md` to about
      4,000 words (writing.md).
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
- [ ] Ask the user if a silent seat row needs a second cue. With one row soloed, the silent rows
      look almost as bright as the solo row, and only the pressed "S" shows the solo (2.8).
- [ ] Show the user the seat rings in play, and ask if the pulse of fast short notes is correct
      (2.8). A tutti turns on each ring, so the rings then show no lead.
- [ ] Check the seat rings in Safari, in Firefox, and on a real phone (2.8).
- [ ] Make `pnpm keyboard` pass again. At 1440 × 900 the check "Tooltips of the speed menu and the
      volume slider" fails, and `checkHiddenBarTap` stops at a timeout, because the UI has no
      `.collapse` element now. Thus the run never reaches its last checks.

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
- [ ] Give the cello and the contrabass the deeper ribs of the real instruments (about 0.16 of the
      body length), and check the holds of the dog and the hippo.
- [ ] Slope the strings of the bowed strings down about 5° from the bridge to the nut, as on a real
      instrument. The bow contact, the fingerboard target, and the left hand poses follow the line.
- [ ] Conductor: at the song end, turn to the audience on the podium, bow, and turn back (5.4). Keep
      the clearance tests of the stand.
- [ ] Audit the seating of design 4.2 against professional orchestras and choirs, with sources and
      the file and the line of each finding. Then fix the findings that the user approves.
- [ ] Bring the high tier within the frame target of 9.7 (4 ms p95 on the GPU and the main thread).
      The main thread passes. With the pixel ratio 1.5, no side light shadows, and 12 stage
      samples, the GPU was about 5 ms p95 on a view of the stage top, in one run that was not
      valid (another process used the GPU). Measure it on an idle machine.
- [ ] Cut the main-thread cost of the read of the title backdrop (`app/backdrop-probe.ts`, 2.8).
      A frame with a read or its result took about 2 ms more than another frame, mostly in the
      browser, in about 18% of the frames. With no read, the main thread p95 went from 4.00 ms to
      3.04 ms (median of two runs each). A longer interval changes how fast the shade follows the frame.
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
- [ ] Put the Vercel URL in the line "Live site" of `README.md`, and turn off GitHub Pages in the
      settings of the repository. The old site at <https://qiao.github.io/zoophony/> stays online
      until then.
- [ ] Check the notes on GitHub Pages against Vercel: design 7.2 and 8.3, and the comments of
      `tools/gzip-site.ts`, `tools/size.ts`, `tools/load-probe.ts`, `src/audio/plain-bytes.ts`, and
      `vite.config.ts`. They tell how the host sends the files that the build gzips.
- [ ] Add an Open Graph image to `index.html`: a screenshot of the default view, with the absolute
      URL of the deployed site (2.8).
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

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
- [ ] Forest scene: build the surroundings from the forest kit (round C). Replace the stub of
      `scene/forest.ts` with the meshes of `assets/forest/` (4.1).
- [ ] Hide or fade each forest part between the camera and the stage (`src/models/forest/kit.ts`).
      The trees at the sides stand inside the default distance of about 16 m, so an orbit, a side
      shot, or a high shot can look through a trunk or a crown.
- [ ] Decide the space between the deck edge and the near trees of the forest. With 1.5 m to the
      roots, the near trunks show only at the left and right edges of the default view. In
      `forest.webp`, the left trunk stands nearer to the deck.
- [ ] Check a far zoom-out of Free mode in the forest. The ground of the kit ends at 42 m with a
      rim that rises 2.2 m, so a low far camera can see past it.
- [ ] Tune the albedos of the forest kit with the light and the grade of the app. They match the
      medians of `forest.webp` only under the warm sun of the Blender preview.
- [ ] Give the forest kit the leaf clusters of `forest.webp`. The crowns are round faceted blobs,
      the waterfall is a stack of gray rocks, and no lantern hangs from a branch.
- [ ] Draw the `foliage` faces of the forest kit from both sides. The fronds of the ferns and the
      blades of the grass are single sheets.
- [ ] Share the corner code of `models/forest/kit-format.ts` with `models/studio-format.ts`. Both
      hold the same recent-vertex code, because the forest round could not change
      `studio-format.ts`.
- [ ] Forest: the stub frame is darker at the top corners than `reference/forest.webp` (median
      luma 20 to 25 against 35) and redder (mean RGB 99, 57, 27 against 106, 69, 31). The default
      view shows more earth than canopy. Tune the roots `FOREST*` with `pnpm look-variants` and
      the key `scene` (4.1).
- [ ] Forest: `pnpm look-lab` measures a forest frame against `orchestra-latest.png`. Add the
      regions and the reference `forest.webp` for the venue `forest`.
- [ ] Remove the top-level await of `src/gallery/views-main.ts`, so that the chunk merge of
      Rolldown works again (7.2). Then the forest chunk can import the modules of the first
      download, and `ForestKit` can go. Measure `pnpm size` and `pnpm load-probe` after it.
- [ ] A lamp glow of `createGlows()` (`scene/surroundings.ts`) wider than about 130 px did not
      draw on the development Mac, but the GPU gives points up to 511 px. Check the hall lamps in
      the close shots, and draw a large glow as a quad.
- [ ] The conductor shot of `pnpm frozen` does not repeat: two runs of `e0ccc347` differ in 22,445
      pixels, by at most 2, at the lamp glows at the top left. A run at the load average 20 gave
      a perf-section shot with 2.2 million changed pixels and a softer blur, and the next run
      matched the base. The automatic tier can drop under load. Find the causes, so that a check
      of a refactor can trust each shot.
- [ ] A change of the scene sends the camera of Free mode back to the default view, as a change
      of "Section size" does (2.8). Keep the orbit of the camera, so that a switch does not move
      the view.

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
- [ ] Deer harpist: the right move twist max fails the arm gate on its margin. Turn the right paw
      toward the treble strings, or accept the value in the gate.
- [ ] Deer harpist: the left palm is 0.14 m above the middle of the strings, but a harpist holds
      both hands at almost one level. A lower palm needs room in the paw swing (66°, limit 70°).
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
      bind of the upper arms, and the white throat. Option: flippers 1.25 times as long.
- [ ] Penguin: black wedges from the roots of the flippers show on the white belly under the folder
      in the front views.
- [ ] Penguin: the crease angle 35° has no facet probe against the penguins of the reference images
      (`ANIMALS` of `tools/studio-body.ts`).
- [ ] Penguin: a round bump at the armpit shows from az90, because the faces with a part of the arm
      weight stretch when the flipper rises. Try a cut of the flipper with a side wall.
- [ ] Penguin: the flippers go 1.3 cm into the body, and the edge of the orange beak and feet is not
      cut. Check the roots of the flippers with a fill light.
- [ ] Red fox and rabbit: the string planes are 9° and 10°, under the real 17°, because larger
      angles fold the right shoulder. Fix the right shoulder in a rig round (string-technique).
- [ ] Panda: try `weights.armCrease` on each arm that is one solid with the trunk.
- [ ] Panda: a small gray dent shows below each arm from the left side. Move the body run of the cut
      (vertices 787, 793, and 800, `tools/arm-roots/panda.json`).
- [ ] Panda face: the round patches have angular edges, and they are smaller than in the reference.
      Ask the user if a smoother oval is worth a vertex move.
- [ ] Panda face: from 30° above, the mouthpiece and the paws hide the smile. Check the smile with
      the user in a close play frame of the stage.
- [ ] Beaver: the narrow axis of the middle of each upper arm is 0.35 to 0.40 of the wide axis in
      the play, below the limit 0.44 of `pnpm arm-look`.
- [ ] Pig: a T-pose mesh gave a flat slab, a flap, and 9 to 14 folded faces at the shoulders, so the
      current mesh stays. Ask the user: a ring at each shoulder, or another mesh.
- [ ] Polar bear pianist: the arms go up to about 8 cm into the belly in the play (accepted 4 cm).
      Try the elbow poles (`HANDS_HOLDS.piano`) further out, with the arm gate.
- [ ] Polar bear pianist: from the front, the open lid hides the bear and its paws.
- [ ] Polar bear pianist: at the far keys, the outer upper arm stands 36° to 41° out from the round
      trunk (piano-technique).
- [ ] Polar bear pianist: at rest, the paws lie 8 cm to 10 cm below the key top, on the lower belly,
      because the arms do not reach the thighs. Lower paws fold the right shoulder.
- [ ] Polar bear rig: the left shoulder folds about 20 faces at rest and in the play (limit 8). Add
      loop edges or a corrective shape at the armpit (`pnpm fold-probe pianist`).
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
- [ ] Polar bear pianist: in the lift and the lowering, the paws and the forearms touch the front of
      the case up to 1.5 cm deep (limit 1.5 cm).
- [ ] Polar bear pianist: at 7 black key notes of the demos, the arm is at its full reach, and the
      palm stops 2.8 to 5.7 cm short of the key (the note target check of the pianist clearance).
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
- [ ] Piano: the larger piano moves the rows of four demos, and in `bach-bwv1048` and `bach-bwv1050`
      the lid hides the contrabasses. Show the user the default views.
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
- [ ] Cat violist: the round belly keeps both elbows 35° to 48° from the vertical at rest, and the
      right upper arm meets the belly 1.7 cm deep near the elbow (limit 1.5 cm).
- [ ] Cat violist: the bow upper arm goes 2.1 cm into the body at the tip on the lowest string
      (limit 1.5 cm). Try a flatter inner upper arm. A larger shoulder turn folds face 785.
- [ ] Cat violist: the right claws go 2.2 cm into the viola at the frog, and the left upper arm 2.2
      cm into the body in the moves (limit 1.5 cm).
- [ ] Cat violist: `pnpm arm-look violist` finds too many thin dark folds across the right shoulder
      at the tip. Try a bind of the right upper arm nearer to the play.
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
- [ ] Rabbit, red fox, cat, and tan fox: the arm-down shape restores the twist loss of the bind left
      forearm twice. Mask the forearm part of the shape on a supinated side.
- [ ] Bind paws: the bind paws of most configs start pronated, so the cellist, the bassist, the
      hornist, and the oboist twist the left paw near 170°. Try `studio.bindSupination`.
- [ ] Red fox and tan fox: at rest, the crook of the right elbow keeps a soft fold, because the
      linear blend pinches the bent inner elbow. A dual quaternion bind folds the bow arm.
- [ ] Red fox and tan fox: thin dark V lines on the white chest are splits of the normals of the fur
      spikes of the mesh. Smooth them like the neck notches, or give them the skin normals.
- [ ] Tan fox flutist: no left elbow that grasps the flute brings the move twist of the left paw
      (87°) to 70°.
- [ ] Rabbit: at rest, a narrow groove runs between the front of each upper arm and the trunk. It is
      the gap of the arm copy. Fill the gap in the copy.
- [ ] Rabbit violinist: the bow goes up to 2.5 cm into the arms in the lowering and 1.0 cm at rest,
      near the grip.
- [ ] Rabbit violinist: the violin points 50° to the left, 5° more than a real player. A bow arm
      round or a smaller violin can bring it to 45°.
- [ ] Rabbit violinist: the round elbow patch drops the section of the right upper arm of `pnpm
      arm-look` to 0.60. Find the cause, and keep the round elbow.
- [ ] Rabbit violinist: with the round elbow patch, the upper arms go 2.5 cm into the body at rest
      and 5.9 cm in the lowering. Keep the patch out of the trunk when the arm hangs.
- [ ] Rabbit violinist: a dark lower face of the bow elbow shows from az150 in the moves, and a thin
      dark line under the forearm near the elbow from the front at the frog.
- [ ] Rabbit violinist: a small dark sliver stays under the right elbow from the right side at the
      frog.
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
- [ ] Pig hornist: the dome of each upper arm lies inside the shoulder (4.2 cm in the sweep). Give
      the pair an accepted depth, and fix the dark facets on the shoulders.
- [ ] Remove the unused high stool (`HIGH_STOOL` and the support `high-stool` of `props.ts`). No
      player sits on it.
- [ ] Hippo: the nose tip lies on a nostril 2.8 cm from the middle plane, and the rig checks warn. A
      tip on the plane moves the jaw of the rig 3.0 cm up.
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

Done when: the gallery shows each species with its instrument, the budget test passes, and the
scene of each demo has its seats and stage size with no overlap.

## Step 5. Motion (5, 4.7, 9.7)

- [ ] Dog cellist: the left ear touches the cello, the left forearm and paw go up to 2.1 cm into it,
      and the bow reach is 69% (goal 70%). Move the cello, and rebuild the left arm shapes.
- [ ] Dog cellist: the knees stay about 21 cm from the leaned cello.
- [ ] Dog cellist: in `boulanger-matin` (121 s to 127 s), the third cellist puts one paw 2.4 cm into
      the other, where pizzicato on the low strings meets a held arco note (`pnpm clip-probe`).
- [ ] Dog: the upper arms go 5.2 cm into the body in the play and the lowering (goal 3.5 cm). Try a
      larger `weights.armRoot.along`, or a bow hold that keeps the upper arm off the chest.
- [ ] Dog: faces 342 and 172 at the right shoulder top fold in 17% of the lift. Try a `raise` shape
      fitted on the lift alone, with a fade of 5° to 10°.
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
- [ ] Panda trombonist: the shadow of the left arm crosses the belly in the front view, and face 467
      at the front of the right shoulder folds in 2% of the lift. Show the user the front view.
- [ ] Panda trombonist: the arm reaches about 0.1 m of the slide, 18% of a real seventh position,
      and a larger right shoulder turn folds the shoulder. Show the user slide angles of 45° and 60°.
- [ ] Panda trombonist: from the front, the right paw lies below the lower slide tube with its tips
      on the brace, so it reads as a paw under the slide.
- [ ] Panda trombonist: at rest, the left finger tips stand 0.7 cm from the slide tubes (limit 0.6
      cm). Give each paw a rest aim.
- [ ] Hippo bassist: the upper arms go up to 6 cm into the body and 4.7 cm into the contrabass. The
      hidden inner side of the arm tube counts. Measure the visible surface only.
- [ ] Hippo bassist: the left forearm goes 2.1 cm into the neck in 0.1% of the play, and a light
      face of the texture shows under the right arm from az150.
- [ ] Hippo bassist: on the E and A strings, the bow paw goes more than 1.5 cm into the belly in 5%
      of the play. Try a hold that moves the right elbow off the line of the stick (slant -10°).
- [ ] Hippo bassist: the left paw stops only up to 0.7 of the fingerboard, so the high notes take
      lower places on the neck. Show the user a high passage of `bach-bwv1050`.
- [ ] Hippo bassist: the bow plays only a part of the hair, so the strokes are short. Offer the user
      longer arms or a smaller contrabass.
- [ ] Hippo bassist: in the change from the bow to pizzicato at 248.13 s of `boulanger-matin`, the
      right forearm goes 4.2 cm into the rim of the upper bout. Try a path around the rim.
- [ ] Hippo bassist: the top edge of the upper bout touches the chest under the chin, and a few
      teeth of the skin show over it in a close view from the front.
- [ ] Hippo face: the brow ridge of the mesh shades a crease above each pea eye, which can read
      stern in a close front view. Show the user the face, and offer a face rule.
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
- [ ] Wind grips: `pnpm wind-grip` takes the finger tips from the bind pose, and the right oboe paw
      grasps in 54% of the play. Check the right oboe grip.
- [ ] Accepted grips: after a check of the 2x paw crops, update `ACCEPTED_GRIPS` for the bassoonist,
      the trombonist, the oboist, the clarinetist, the wolf, the tubist, and the xylophone.
- [ ] Horn: the right palm lies across the bell opening, 2.5 cm inside it (`HORN_PALM_DEPTH`). A
      real hand goes deeper, against the far wall at 2 o'clock. Turn the paw along the bell.
- [ ] Beaver bassoonist: the right claws go 1.5 cm into the bassoon in one lowering sample.
- [ ] Beaver bassoonist: three faces of the left wrist, forearm, and shoulder top fold at rest and
      in 13% of the lift, and a dark slot shows at the cap of the cut under the left arm.
- [ ] Beaver: a soft dark crease stays at the front of the right arm root from the right side.
- [ ] Beaver: rebuild the arms with segments. The method of the cat folded 15 faces of each arm, so
      a new try needs a smaller socket.
- [ ] Beaver: the fur keeps the orange-brown of its texture. Ask the user if the plain fur takes the
      chroma of `SPECIES_COLORS.beaver`.
- [ ] Twist steps above 25° between two arm bones: the left forearm of the rabbit, the cat, and the
      foxes, the beaver, the panda, and the wolf right forearm. Add forearm segments.
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
- [ ] Rabbit: under the raised bow arm, a shallow hollow with a small sharp tip stays in the right
      armpit. A smoother hollow needs more vertices in the notch.
- [ ] Rabbit: the narrow axis of each upper arm keeps 0.62 to 0.81 of the bind, so the shoulders
      look flatter than the source from the back. Try a bind arm nearer to the play.
- [ ] Rabbit: a flap face with two open edges (3.1 cm) stays under the right armpit. No frame shows
      it.
- [ ] Rabbit soloist: the violin goes 2.3 cm into the body in the lift and the lowering. Check the
      chin and the left shoulder in the close views.
- [ ] Rabbit violinist: the right forearm goes 2.1 cm into the body for 0.2 s at the song end of
      `bach-bwv1050`.
- [ ] Rhino: the shoulders widen the footprint, and the conductor pose of `boulanger-matin` changes
      from 257.38 s. Check that the cue of the conductor still aims at the tuba.
- [ ] Body probe: a change of the panda rig changes 18 pose sets of other players at the start of
      `brahms-2` and `beethoven-9`. Find the shared input that the panda rig moves.
- [ ] Tan fox flutist: the grips of the play and the rest lie on two sides of the flute, so the
      right paw turns around the tube in the lift (`gripAround`). Show the user the 2x crops.
- [ ] Pig hornist: two faces of the right hoof fold at rest and in 27% of the lift, because a body
      has at most four corrective shapes (`RAISE_LIMIT`). Try a weight rule of the right paw.
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
- [ ] Badger triangle: three faces at the front of the left shoulder fold in 86% of the play
      (`raise-fit` of `tools/mesh-rigs/badger.json`).
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

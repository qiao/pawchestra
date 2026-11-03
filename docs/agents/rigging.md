# Rigging

This module of `AGENTS.md` gives the bodies, the asset chain, the arm gate, the rebuild of the arms
in Blender, and the traps of the rig. Design 4.4 gives the rules of the bodies, and the reference
images are the target of each body. [`rig-rounds.md`](rig-rounds.md) gives the brief of a rigging
round.

## Bodies and roles

Each species has a studio body (`body: 'studio-<a>'`). The roles are the names that
`pnpm fold-probe`, `pnpm hold-fit`, `pnpm arm-check`, and `pnpm close-views` take.
`pnpm pose-depth violinist` sweeps the rabbit and the red fox together. "Rebuilt arms" means quad
arm tubes, Blender weights, and arm segments (see "The rebuild of the arms in Blender").

| Species | Body | Role |
|---|---|---|
| bear | T-pose mesh, rebuilt arms (`bear_arms.py`), the role-neutral bind with elbow `raise` shapes, forearm skin normals (`rootNormals.wrist`), a larger crease angle, a color blend. Stands on the podium, with the baton along the index finger. | `conductor` |
| polar-bear | T-pose mesh, rebuilt arms and legs (`polar_bear_arms.py`, `polar_bear_legs.py`), the role-neutral bind, dual quaternion knees (`bind.knee`, `kneeCrease`), the old bone heat (`heatSource`), and the leg length of the mesh. Sits on a bench that fits its haunch (`benchFitOf()`) at a piano of `PIANO_SCALE`, with the right foot on the damper pedal. | `pianist` |
| rabbit | A-pose mesh, longer rebuilt arms (`violin_arms.py`), the role-neutral bind, a `raise` shape of the left elbow, root and elbow skin normals, a smaller violin. | `violinist` |
| fox-red | Longer rebuilt arms (`fox_arms.py`), the role-neutral bind, a `raise` shape that smooths the bow arm at rest, a tail of two bones. | `fox-violinist` |
| fox-tan | The red fox rig with a tan palette (`palettes`). | `flutist` |
| cat | Rebuilt arms with a round side wall and a clean armpit line (`cat_arms.py`), a dual quaternion left lower arm (`bind.arm`), three `raise` shapes with `follow` at the left arm root, a viola of `violaScale`. | `violist` |
| dog | A copy with round inner arms (`dog-arms.glb`), a cut at each arm seam, a chest share of the inner arm root (`weights.armRoot`), a round hanging tail. | `cellist` |
| panda | A copy with the arms freed from the trunk (`panda_edit.py`), longer rebuilt arms (`arm_rebuild.py --factor 1.497`), the role-neutral bind. The trombone hold keeps the round elbows away from the trunk. | `trombonist` |
| hippo | Longer rebuilt arms with a seam cut and a side wall (`hippo_arms.py`), smoothed arm tubes (`armSmooth`), the role-neutral bind with elbow `raise` shapes, smaller pea eyes. Stands at the contrabass. | `bassist` |
| mouse | Longer rebuilt arms (`wind_arms.py`), the role-neutral bind, a long tail on the floor, a smaller oboe, no chair (`noChair`). | `oboist` |
| elephant | A-pose mesh, rebuilt arms with flatter inner upper arms (`elephant_arms.py`), the role-neutral bind. Stands at the timpani, with the trunk on the head. | `timpanist` |
| beaver | Root skin normals, a broad tail on the floor, a smaller bassoon, no chair. | `bassoonist` |
| pig | A copy with round upper arms free of the trunk (`pig-arms.glb`), a twist bone of each upper arm (`upperTwist`), a horn turned back toward the body. | `hornist` |
| wolf | Longer rebuilt arms (`wind_arms.py`), lower and wider than the mesh (`proportions`), the role-neutral bind. The clarinet bell rests against the right knee. | `clarinetist`, `violinist@wolf` (recast) |
| badger | A tail ball and a suspended cymbal (`cymbalForm`). Stands at each percussion instrument. | `bass-drummer`, `snare-drummer`, `cymbalist`, `percussionist`, `xylophonist` |
| monkey | Longer rebuilt arms (`arm_rebuild.py --factor 1.2`), the role-neutral bind, a long tail curled on the floor, a smaller trumpet, no chair. Stands with its feet under its hips and its trunk leaned forward. | `trumpeter` |
| rhino | T-pose mesh, rebuilt arms (`rhino_tpose_arms.py`), the role-neutral bind with elbow `raise` shapes, a tail ball. Stands at a tuba with a longer lead pipe (`tubaPipe`). | `tubist` |
| deer | Longer rebuilt arms with a side wall (`deer_arms.py`), the role-neutral bind with a right elbow `raise`, antlers on the head. Sits on the harp stool, with a smaller harp (`harpScale`) on its right shoulder. | `harpist` |
| penguin | The flippers as arms, a split beak with a jaw bone (`penguin-beak.glb`), faces cut along the black and white edge (`penguin-edge.glb`), a larger crease angle and a color blend. Stands on its riser with the folder. | `singer` |
| mannequin | The test body (design 4.4): the animal preset of `mannequin.py`, with the kept faces of `arm_rebuild.py --keep-faces`. No section casts it. | `violinist@mannequin`, `clarinetist@mannequin` (recast) |

## The asset chain

Each body comes from a textured mesh with no skeleton. The tools rig it into the GLB format of a
studio body, then pack it into a module that the app reads.

```text
 assets/models/<s>/<s>.glb (source mesh, unchanged)
   | tools/blender/arm_rebuild.py, or <a>_arms.py (rebuilt arms or legs)
   v
 <s>-arms.glb + <s>-weights.json (a copy with quad tubes and Blender weights)
   | pnpm rig-mesh <a>   (tools/mesh-rigs/<a>.json, Blender)
   v
 <s>.rig.glb (face colors, gloss, joints, shapes, clip `reference`, seat in the extras)
   | pnpm studio-body <a> (ANIMALS of tools/studio-body.ts, no Blender)
   v
 src/models/studio/<a>.ts --> STUDIO_BODIES --> SPECIES[<s>].body
```

Test a change of the chain on the test mannequin first (`assets/models/mannequin/`, design 4.4):
`pnpm rig-mesh mannequin --check` and `pnpm arm-check violinist@mannequin clarinetist@mannequin`.
Its mesh has clean quad rings and twist markers, so a fault there comes from the chain.

### Steps of a new body

1. **Joints.** Measure the joints on cuts of the mesh, and write them in
   `tools/mesh-rigs/<a>.json` with a note on each measure. Start with the arm factor 1 and the leg
   factor 1. The first line of `pnpm rig-mesh <a> --check` gives the arm factor of the target
   reach.
2. **Form.** A body that is shorter or wider than the mesh takes `proportions`. A head that keeps
   its form takes `"keep": "head"` with a blend zone on the neck above the shoulder tops. A larger
   head grows `H`, so fit the holds again.
3. **Options.** Run `pnpm mesh-options <a> <dir> --size <label>=<head top>... --arms <f>,...
   --legs <f>,... --instrument <id>`. Fix each warning of the rigs, then ask the user about the
   size, the arms, and the legs with `options.md` and `options.png`.
4. **Rig.** Check the mesh with `pnpm mesh-intake` (design 4.4). Run `arm_rebuild.py`, with
   `--keep-faces` on `keep faces`. Look at the seated bind, the standing body, the knees, and the
   bones with `pnpm rig-mesh <a> --check --preview <dir>`. Try each variant with `--check --set`,
   and add `--no-base` after the first run. The triangles and the gzip size stay in their
   budgets, and the standing body stays within 1 mm of the source.
5. **Export.** Add the animal to `ANIMALS` with the landmark of its scale (the shoulder joints), a
   crease angle that matches the facet contrast of its reference crops, and the seat settings. Run
   `pnpm studio-body <a>`, add the module to `STUDIO_BODIES`, and give the species the body.
6. **Holds.** Fit the holds (`SPECIES_HOLDS`, `SPECIES_WIND_HOLDS` with `LEG_RESTS`, or
   `PERCUSSION_HOLDS`) in the `H` of the new body with `pnpm hold-fit <role> --set`,
   `pnpm hold-reach <species>`, and `pnpm pose-depth <role>`. After a change of shared code,
   `pnpm body-probe --base <start>` shows no change of the other players.

A new role adds in the same commit its entries in `SWEEP_ROLES` of `src/pose/test-sweep-roles.ts`,
`FOLD_ROLES` of `tools/fold-probe.ts`, and `ROLE_VIEWS` of `tools/close-views.ts`, and its rows in
the table above and in the pose index of design 5. Only the last commit of a series of rig commits
writes the GLB file, together with its module.

## The arm gate

A fold count does not see a twisted or a flat arm, and a goal on one measure moves the twist to a
joint that no goal measures. Each round that changes a hold, a rig, a pose, an instrument size, or
a seat runs the whole gate, `pnpm arm-check <roles> --base <start> --views <dir>`, and puts the
table and the crop pairs into its report. A `FAIL`, or a better number with a worse look, makes the
round not done.

- `--trace <demo>:<from>-<to>` finds a fast turn of a paw. `--states <ref>,...` compares old
  commits.
- `tools/merge-branch.sh` runs the gate of all roles for a change of `src/pose/`, `src/models/`,
  or `tools/blender/`.
- The grip turn compares each paw with `ACCEPTED_GRIPS` of `tools/arm-check.ts`. A new role adds
  its entry. A round that changes a grip on purpose expects a `FAIL` of the grip turn, and gives
  the new median with the 2x paw crops at a strike and at rest. The entry changes only after the
  manager accepts them.
- The paw twist, the paw swing, the forearm twist, the move twist, and the flat share count from
  the bind. When the bind differs from the base, they take only their limits (`REBIND`), and the
  gate prints the elbow and wrist ring widths. The grip turn ignores the bind. A rebind round
  proves the same bones with `pnpm arm-check <roles> --world --base <start>`.
- `pnpm arm-look <role>` measures a crumpled or a flat upper arm.

## The rebuild of the arms in Blender

Rebuild the arms when they show a spiral crease, a sharp elbow, slivers, or slits. Rebuild the legs
when the seated legs show a wedge. Three causes add up, so fix all three. A second subdivision, a
Smooth of the upper arm weights, or a move of the elbow alone does not fix a twisted arm.

- **Faces.** Long thin triangles across a joint fold into a spiral. New quad faces fix it.
- **Bones.** The linear blend collapses the skin under a large twist on one bone. Short segments
  keep each step below about 25°.
- **Hold.** The hold sets the total twist. A real forearm turns about 90°, and a paw that turns
  about 160° on its forearm folds the wrist. Then change the hold or the instrument first, and
  hold the part near the direction of no paw twist.

Run `tools/blender/arm_rebuild.py` first. Its doc comment gives its eight steps, which it does from
the joints of the config and rays through the mesh, with the functions of the species scripts. A
clean quad mesh skips steps 2 to 5 (`--keep-faces`). Write a species script
`tools/blender/<a>_arms.py` only for a fault that it does not fix, such as an arm joined to the
trunk down to the elbow (`cat_arms.py`, which takes its weights from the copy before the wall).

### Rules

- Work in the live Blender through Blender MCP with the plain Blender tools, one step at a time
  (`run_steps()`). Look at an image after each step. Write no weight algorithm of your own.
- Change only the limb faces from the shoulder line to the wrist, or from the haunch line to the
  ankle. The new surface lies on the old limb. Ask the user before the first rebuild of a species.
- Keep the source file. Write the copy next to it, with a note in the `README.md` of the folder.
- Never call `read_factory_settings`, because it stops the MCP server. Stop only the Blender
  process that you start.
- Merge by Distance first, because automatic weights fail on split seams.
- Put the rings of 16 vertices about 0.45 arm radii apart, with a ring on each side of the elbow
  and the wrist. A slanted color edge keeps its zigzag (`colorBlend` softens it).
- In Weight Paint, remove the arm bones from the trunk below the armpits, and smooth the shoulder
  line. Look at the arm down, forward, an elbow at 100°, and a forearm turn of 90°.

For the legs (`polar_bear_legs.py`), cut below the crotch and above the foot, build the tube before
the leg factor, and keep the rule weights with a knee ramp (`paintedLower`, `weights.knee`). New
faces move the bone heat of the whole mesh, so give the kept vertices the old bone heat
(`heatSource`).

### Bones

Each upper arm and each forearm has 4 deform segments, and each elbow and each wrist has a helper
bone. The old arm bones hold no skin and only drive the new bones. `armSegments` of the config
turns this on.

```text
 clavicle --> upper_arm (drives) --+-- upper_arm_seg0..3 (roll 1/8 .. 7/8)
                                   +-- elbow helper (half of upper -> fore)
              forearm (drives) ----+-- forearm_seg0..3 (twist 1/8 .. 7/8)
              forearm_twist -------+-- wrist helper (half of fore+twist -> paw)
              hand (skin) --> fingers (skin)
```

`poseSegments()` and `StudioArmSegments` of `src/models/studio-rig.ts` and `driven_turns()` of
`tools/blender/rig_mesh.py` turn the new bones with the same rule. `paintedWeights` names the
weights file, and `paintedLower` lists the bones that keep the rule weights. Each body with
`armSegments` has 20 more bone matrices, so run `pnpm frame` after a new one.

## Traps

Read the group of your work before you plan it.

### Paws and twist

- The retarget turns each paw toward its forearm in the plane of the palm (`PAW_TURN`), up to 70°.
  A pose can give a paw its own turn (`pawTurnL`, `pawBendR`).
- The bind paw of a mesh is pronated, so a far supinated hold passes 180° of skin twist, where
  `twistAngle()` flips. Supinate the bind paw (`studio.bindSupination`), also with straight bind
  arms: with no supination, the left violin paw flips. Take the value of design 4.4
  (`pnpm bind-supination <species>`), and probe the new rig again, because a twist past 180° gives
  a wrong value. Else lower the twist of the hold. Carry no value from the last frame.
- A turn of the bind forearm about the upper arm (`studio.bindArms`) moves the zero of the paw twist
  and of the upper arm roll. Straight bind arms keep the roll zero with the elbow axes of the bent
  bind (`StudioBody.hinges`).
- The `palm` of a rig config sets the roll of the arm bones. Read it from the curl of the claws.

### Holds and reach

- Short arms do not reach the instruments of the app. Size the instrument by the rule of real
  players, and keep the limbs until the user asks for longer arms.
- The arm factor follows the hold. Fit the hold with a first factor, measure the reach, and rig the
  final factor one time.
- A new scale of `SpeciesParams` adds its instrument to `SCALED_INSTRUMENTS`, so the typecheck
  names each reader.
- A hold trades folds against clearance. Check each hold change with `pnpm hold-fit --set`,
  `pnpm pose-depth --set`, and `pnpm arm-check --variant` before you write it.
- The arm gate and the depths pass while a paw misses its instrument. Measure each grip with
  `pnpm wind-grip`, and look at the thumb, which the tool does not see.
- A paw that points at its tube cannot face it with the palm. Put the grip beside the tube.
- A big head puts the grips at shoulder height: point the elbows down. A deep trunk takes the room
  of the elbows: point them out.
- A round belly takes the room of short forearms and covers short thighs. Place a floor instrument
  by its contact point, move the keys forward, and lean the spine.
- A long snout puts the mouthpiece far forward. Turn the instrument back around the mouthpiece, or
  move the mouthpiece under the muzzle (`lipShift`).
- Rest elbows far from the play elbows twist the paws in the lift. Keep them near.
- A freed round arm has its full inner half width, so the hold of the joined arm puts it into the
  trunk with the same bones. Turn the elbows out about the line from the shoulder to the grip, and
  bend the elbow with a nearer grip. The grip turn counts from the posed forearm, so check it.
- A roll rule that aims at a far point flips when the prop points at it (`rollToward()`).
- A line through the tail end (`trunkFront()`) can meet the back of a short neck under a large head
  (the panda, the mouse), and the fit then jumps. Measure the front of a band of the upper chest
  (`chestFront()`).

### Bow

- A turned paw moves on an arc around the wrist. Put the bow stick along that arc.
- The paw slides on the stick when the forearm turns against the bow. Turn the hand around a grip in
  the middle of the paw (`stickTurnR`).
- A direct mix from an upright rest bow turns the tip through the head. Use a via (`BowVia`).

### Clearance

- The sweep measures triangle corners, so the middle of a long box can go into the body unseen.
  `bowPoints()` takes a point at each 1 cm of the bow.
- A depth that stays the same over all variants is half the thickness of the obstacle.
- The depth of an open part is false near its edge, so the sweep measures closed parts
  (`closedPart()`).
- The pair "instrument in body" gives the deepest corner. Measure the visible top plate alone.
- `armGaps()` of `pose/test-arm-clearance.ts` gives false depths for an arm in front of the
  chest. Measure a free pose, such as a clip, in the closed body (`closedDepth()`).

### Weights and folds

- Bone heat gives the trunk side a part of a hanging arm. Keep the arm weights on the free arm
  (`armSplit`, `armBelow`, `armCrease`).
- A thin face with corners of different weights turns over at a bent joint. `weights.rigid` gives
  it the mean. The `sliver` rule can then move a weight 4 cm away, so compare the weights with
  `main` by place.
- A narrow fade under a far bone turn moves the fold into the fade. Let the fade span several
  rings.
- Add a ring at a joint (`refine.rings`) only where `pnpm fold-probe` finds folds, then run
  `pnpm pose-depth`.
- Automatic weights give the clavicle most of a thick arm root, and the wrist helper half of a
  short paw. Check both.
- `weights.fingers` 0.5 keeps the curl small. A paw that closes around a tube takes the weight 1.
- A bind that bends a thick paw (`studio.bindArms`) presses the inner wrist skin in the rest shape,
  and each pose blends its bend on top. No weight rule, ring, taper, or `raise` then removes the
  dark slit at the wrist. Bind the arms straight (`studio.straightArms`), and judge a wrist by its
  2x crops.
- Blender weights on the trunk, the head, or the neck fold faces. Keep the rule weights there
  (`paintedLower`).
- The glTF skin has no B-Bones and 4 weights for each vertex. In the Blender preview, set
  `bbone_segments` to 1, turn off Preserve Volume, and run Limit Total 4.

### Seams and cuts

- A raised arm pulls a seam where a hanging arm touches the trunk into dark flaps. Only a cut at
  the seam fixes them (`cut`). Give the caps the skin normals.
- A flap, a shard, or a dent at a seam is often a source form that the hanging arm hid. No measure
  sees it, so look at the sheets of `pnpm close-views audit`.
- After a cut, the inner root of a bow arm swings into the chest. Give it a chest share
  (`weights.armRoot`).
- End a cut above the shoulder joint, else a black triangle shows on the back.
- Flatten the inner side of a thick upper arm after the bake, never before it.
- Cut a wrist parallel to the last ring, and give the band `rootNormals.wrist`.
- A dark slot at an arm root or an elbow can come from split normals. Render
  `--probe colors,normals`, and try `rootNormals` before a rebuild.

### Shapes

- When no weight rule or ring removes a fold, fit a shape of `raise` with `pnpm raise-fit` on the
  key of its joint. A body has at most `RAISE_LIMIT` shapes.
- A shape fixes only the poses near its rule, so fit the hold first. Keep the rig log count of
  `raise R` at 0.
- A shape or a longer elbow helper cannot widen an elbow ring that a straight bind narrows.
  Weights that keep the forearm and the helper off the upper arm widen it, but fold the inner
  elbow, also with more Smooth rounds or one more elbow ring.
- A grip far in front of a deep chest turns the shoulder past any shape. Turn the shoulder bone
  forward with the arm (`reachL`).
- On an arm joined to the trunk, start an elbow shape with `below` 0, and read its rig log first:
  `below` 0.3 also relaxes the faces of the arm root and turns them over.

### Legs, seat, and tail

- Put the hip joints of short thick legs in the haunch. Keep the shin to thigh ratio of the mesh,
  and fit the bench to the legs.
- The linear blend flattens a bent knee. Give the knees `bind.knee`, and smooth the back of the knee
  in few rounds.
- Short or sloped thighs set the seat top before the haunch. End the seat where the thighs leave
  it (`chair.front`).
- A tail root moves the seat top. Give the sit a fixed top from the final `--check` (`sit.top`).
- A tail on the floor stays flat with rigid bone turns (`studio.tailBind`). A large tail needs two
  bones.
- A body with no chair keeps its center of mass over its soles: feet under the hips, and the trunk
  leaned forward.
- A standing bind sits with a sit pose of its rig (`sitPose`, design 4.4). End its chair behind the
  heels, because short thighs leave the feet under the haunch.

### Head and colors

- A big head over a thin neck shows a dark band. Smooth the neck with a box that ends behind the
  chin.
- A horn, a trunk, whiskers, or antlers distort the head measures. Use `noseTop`, `noseFront`,
  `headFloor`, and `headCeiling`.
- A closed beak cannot open by weights. Split a copy of the source.
- A face takes black from a third of dark samples. Make the border faces light (`colors.border`).
- A face rule can paint a dark block on the side. Check it from the front, at 60°, and each side.
- Measure the packed parts before you cut a palette entry.

### Blender scripts

- The face order of `bmesh.ops.create_uvsphere()` changes from run to run. Make the sphere points
  in the script.
- The glTF exporter writes the vertex colors only with `export_vertex_color='NAME'` and the name
  of the color attribute.
- The `location` of a new child object is in the frame of its parent. Undo the place, the turn,
  and the scale of the parent to get the local point.
- The glTF importer adds a sphere mesh for the bone shapes, and keys at the 24 fps of the scene.
  An FBX take can key the scale of the armature object. Check the meshes, the rate, and the scale.
- An FBX armature with no mesh takes its current pose as its rest pose. Keep each quaternion key
  on the side of the key before it (a dot product of 0 or more), else the blend goes the long way.
- The FBX exporter takes its ids from the Python string hash. Run Blender with `PYTHONHASHSEED=0`
  and `--python-use-system-env`, as `mannequin.py` does.
- A pose turn of a bone uses the axes of that bone, with Y along the bone. Convert a turn in the
  axes of the armature first.
- A value such as 0.707107 in a module fails the lint as an approximate `Math.SQRT1_2`. Move a
  joint a little off 45°.
- An import of `cat_arms.py` replaces `arm_faces()` and `arm_verts()` of `violin_arms.py`. Put the
  plain functions back after the import, as `arm_rebuild.py` does.

### Probes

- `--views` of `pnpm arm-check` takes no conductor. Aim `pnpm close-views conductor --aim` at a
  wrist, or a camera in JSON at the podium.
- A fix of a turn rate can move a prop to a wrong place with all measures passed. Render a crop of
  the move before you commit.
- Record each row of a variant table with the commit or the `--set` of its run.
- These pose values stay in meters at each body size: the bow values of `src/pose/bowed-rig.ts` and
  `src/pose/strokes.ts`, `HAND_MOTION`, the percussion `sizes`, `CONDUCTOR_MOTION.scale`, and the
  sweep limits. After a change of the body size, compare in `H` first.

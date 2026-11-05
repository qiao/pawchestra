# Rigging

Design 4.4 gives the body rules, and [`rig-rounds.md`](rig-rounds.md) the brief of a rigging
round.

## Bodies and roles

Each species has a studio body (`'studio-<a>'`). "Rebuilt arms" means quad
arm tubes, Blender weights, and arm segments. Each body has rebuilt arms and the role-neutral bind
(design 4.4).

| Species    | Body                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Role                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| bear       | T-pose mesh, rebuilt arms (`bear_arms.py`), elbow `raise` shapes, forearm skin normals (`rootNormals.wrist`), a larger crease angle, a color blend. Stands on the podium.                                                                                                                                                                                                                                                                                                                                      | `conductor`                                                                  |
| polar-bear | T-pose mesh, rebuilt arms and legs (`polar_bear_arms.py`, `polar_bear_legs.py`), dual quaternion knees (`bind.knee`, `kneeCrease`), the old bone heat (`heatSource`), rigid faces under the arm roots (`rigidPainted`). Sits on a bench that fits its haunch (`benchFitOf()`).                                                                                                                                                                                                                                 | `pianist`                                                                    |
| rabbit     | T-pose mesh, longer rebuilt arms (`arm_rebuild.py --factor 1.18`), rigid armpit faces, a trunk share under the armpits (`paintedBelow`), the old chair and form (rig config), filled old eyes (`eyeFill`), `raise` rest shapes, a tail ball carried down (`sit.carryTail`), a smaller violin.                                                | `violinist`                                                                  |
| fox-red    | Longer rebuilt arms (`fox_arms.py`), a `raise` shape that smooths the bow arm at rest, a tail of two bones.                                                                                                                                                                                                                                                                                                                                                                                                    | `fox-violinist`                                                              |
| fox-tan    | The red fox rig with a tan palette (`palettes`).                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `flutist`                                                                    |
| cat        | Hand rig (`cat.blend`, its `README.md`): T-pose mesh, arm and forearm rings, a soft brow, smooth eye sockets, eye objects, long thick legs, bind keys, `arm_raise` keys, a tail over the left side of the seat, a viola of `violaScale`.                                                                                                                                             | `violist`                                                                    |
| dog        | A copy with round inner arms (`dog-patch.glb`), longer rebuilt arms (`arm_rebuild.py --factor 1.35`), a cut at each arm seam, elbow `raise` shapes, a round hanging tail.                                                                                                                                                                                                                                                                                                                                      | `cellist`                                                                    |
| panda      | T-pose mesh, longer rebuilt arms (`arm_rebuild.py --factor 1.05`), color edges cut (`panda_edge.py`), a right elbow `raise`, rigid root faces (`rigidPainted`), the old form of the rig config.                                                                                                                                                                                       | `trombonist`                                                                 |
| hippo      | T-pose mesh, smoothed tubes (`armSmooth`), a socket segment (`rootSegment`), smaller pea eyes. Stands at the contrabass.                                                                                                                                                                                                                                                                                                                                                                                       | `bassist`                                                                    |
| mouse      | Longer rebuilt arms (`wind_arms.py`), a long tail on the floor, a smaller oboe, no chair (`noChair`).                                                                                                                                                                                                                                                                                                                                                                                                          | `oboist`                                                                     |
| elephant   | A-pose mesh, rebuilt arms with flatter inner upper arms (`elephant_arms.py`). Stands at the timpani, with the trunk on the head.                                                                                                                                                                                                                                                                                                                                                                               | `timpanist`                                                                  |
| beaver     | Arms freed in a copy (`beaver_edit.py`), longer rebuilt arms (`arm_rebuild.py --factor 1.5`), rigid crease faces (`rigidPainted`), root skin normals, a tail on the floor, a smaller bassoon, no chair.                                                                                                                                                                                                                                                                                                        | `bassoonist`                                                                 |
| pig        | A copy with round upper arms (`pig-upper.glb`), longer rebuilt arms (`arm_rebuild.py --factor 1.5`), arm roots at the trunk wall (`pig_root.py`), two left `raise` shapes, forearm skin normals.                                                                                                                                                                                                                                          | `hornist`                                                                    |
| wolf       | Longer rebuilt arms (`wind_arms.py`), lower and wider than the mesh (`proportions`). The clarinet bell rests against the right knee.                                                                                                                                                                                                                                                                                                                                                                           | `clarinetist`, `violinist@wolf` (recast)                                     |
| badger     | Arms freed in a copy (`badger_edit.py`), rebuilt arms, rigid shoulder faces (`rigidPainted`), triangle and recast `raise` shapes, a tail ball, a suspended cymbal (`cymbalForm`). Stands at each percussion instrument.                                                                                                                                                                                                                                                                                        | `bass-drummer`, `snare-drummer`, `cymbalist`, `percussionist`, `xylophonist` |
| monkey     | Longer rebuilt arms (`arm_rebuild.py --factor 1.2`), a long tail curled on the floor, a smaller trumpet, no chair.                                                                                                                                                                                                                                                                                                                                                                                             | `trumpeter`                                                                  |
| rhino      | T-pose mesh, rebuilt arms (`rhino_tpose_arms.py`), elbow `raise` shapes, a tail ball. Stands at a tuba with a longer lead pipe (`tubaPipe`).                                                                                                                                                                                                                                                                                                                                                                   | `tubist`                                                                     |
| deer       | Longer rebuilt arms with a side wall (`deer_arms.py`), a right elbow `raise`, antlers. Sits on the harp stool, with a smaller harp (`harpScale`) on its right shoulder.                                                                                                                                                                                                                                                                                                                                        | `harpist`                                                                    |
| penguin    | Flippers freed in a copy (`penguin_edit.py`) and rebuilt, a split beak with a jaw bone, faces cut along the black and white edge, a color blend, left flipper `raise` shapes. Stands on its riser.                                                                                                                                                                                                                                                                      | `singer`                                                                     |
| mannequin  | The test body: the animal preset of `mannequin.py`, its own faces (`arm_rebuild.py --keep-faces`).                                                                                                                                                                                                                                                                                                                                                                                                             | `violinist@mannequin`, `clarinetist@mannequin` (recast)                      |

## The asset chain

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

Test a change of the chain on the mannequin first (`assets/models/mannequin/`, design 4.4):
`pnpm rig-mesh mannequin --check` and `pnpm arm-check violinist@mannequin clarinetist@mannequin`.
Its clean rings and twist markers show a fault.

### Steps of a new body

1. **Joints.** Measure the joints on cuts of the mesh, and write them in
   `tools/mesh-rigs/<a>.json` with a note on each measure. Start with the arm and leg factors 1.
   `pnpm rig-mesh <a> --check` gives the arm factor of the target reach.
2. **Form.** A body that is shorter or wider than the mesh takes `proportions`. A head that keeps
   its form takes `"keep": "head"`. A larger head grows `H`, so fit the holds again.
3. **Options.** Run `pnpm mesh-options` ([`commands.md`](commands.md)). Fix each warning of the
   rigs, then ask the user about the size, arms, and legs with `options.md` and `options.png`.
4. **Rig.** Check the mesh with `pnpm mesh-intake` (design 4.4). Run `arm_rebuild.py`. Look at
   the bind, the standing body, the knees, and the bones with `pnpm rig-mesh <a> --check --preview
   <dir>`, and each variant with `--set`. Keep the budgets, and the standing body within 1 mm of
   the source.
5. **Export.** Add the animal to `ANIMALS` with the landmark of its scale, a crease angle that
   matches the facet contrast of its reference crops, and the seat settings. Run
   `pnpm studio-body <a>`, add the module to `STUDIO_BODIES`, and give the species the body.
6. **Holds.** Fit the holds (`SPECIES_HOLDS`, `SPECIES_WIND_HOLDS` with `LEG_RESTS`, or
   `PERCUSSION_HOLDS`) in the `H` of the new body with `pnpm hold-fit <role> --set`,
   `pnpm hold-reach <species>`, and `pnpm pose-depth <role>`. After a change of shared code,
   `pnpm body-probe --base <start>` shows no change of the other players.

### Steps of a hand rig

A hand rig (design 4.4, "Hand rig") replaces `rig-mesh` for one body. Its `.blend` holds the rig,
the pea eyes, and the facts of the body, and its mesh is the source of truth. In a live Blender,
call only `add_surface()`, `fix_rolls()`, and `drive_segments()` of
`tools/blender/studio_armature.py` (`sa`), and `place_eyes()` and `fit_eyes()` of
`tools/blender/studio_eyes.py` (`se`). Run the command line of `studio_armature.py` headless only.

1. **Mesh.** Edit the mesh, and keep its UVs. Run `sa.add_surface(mesh, '<s>', <texture>,
   eye_fans=False)` one time for the face colors and the gloss nose. The texture is the source
   GLB file or an image file, such as the base color JPEG of an FBX source. A new species can
   start with the command line ([`commands.md`](commands.md)), which also adds the armature, the
   Action `bind`, and eye fans.
2. **Rig.** Put `palm`, `seat`, `hinges`, and the facts of the body on the armature object: the
   names of `BODY_FACTS` of `tools/studio-body.ts`, with `height` and `crease` at least. Fit the
   bones, run `sa.fix_rolls(rig)`, and paint the weights (Limit Total 4, Normalize All). Pose the
   bind, run `sa.drive_segments(rig, key_frame=1)`, and sculpt the keys `bind*` and `arm_raise_*`.
3. **Eyes.** Run `se.place_eyes(rig, mesh, {side: (middle, direction, size)})` with each middle
   on the head surface in the bind, and delete the eye fans if the mesh has them. After an edit
   of an eye or of the face, run `se.fit_eyes(rig, mesh)`: it levels each eye and bends its
   preview to the head.
4. **Export.** Run `pnpm rig-export <s>`, `pnpm studio-body <s>`, and the gates. Diff
   `<s>.rig.json` to see what moved.

A new role adds in the same commit its entries in `SWEEP_ROLES` of `src/pose/test-sweep-roles.ts`,
`FOLD_ROLES` of `tools/fold-probe.ts`, and `ROLE_VIEWS` of `tools/close-views.ts`, and its rows in
the table above and in the pose index of design 5. Only the last commit of a rig series writes the
GLB file and its module.

## The arm gate

A fold count does not see a twisted or a flat arm. Each round that changes a hold, a rig, a pose,
an instrument size, or a seat runs the whole gate (`pnpm arm-check <roles> --base <start> --views
<dir>`) and reports its table and crop pairs. A `FAIL`, or a better number with a worse look,
makes the round not done.

- The grip turn compares each paw with `ACCEPTED_GRIPS` of `tools/arm-check.ts`. A new role adds
  its entry. A planned grip change expects a grip turn `FAIL`, and gives the new median with 2x
  paw crops at a strike and at rest. The manager accepts the new entry.
- A paw that faces its tube in a shared wind hold has the palm turn against `ACCEPTED_PALMS` in
  place of the grip turn. A new such hold adds the entry that the tool prints.
- The paw twist, paw swing, forearm twist, move twist, and flat share count from the bind. With a
  new bind, they take only their limits (`REBIND`), and `pnpm arm-check <roles> --world --base
  <start>` proves the same bones. The grip turn ignores the bind.

## The rebuild of the arms in Blender

Rebuild the arms for a spiral crease, a sharp elbow, slivers, or slits, and the legs for a wedge
in the seated legs. Three causes add up, so fix all three. A second subdivision, a Smooth of the
upper arm weights, or a move of the elbow alone does not fix a twisted arm.

- **Faces.** Long thin triangles across a joint fold into a spiral. New quad faces fix it.
- **Bones.** The linear blend collapses the skin under a large twist on one bone. Short segments
  keep each step below about 25°.
- **Hold.** The hold sets the total twist. A real forearm turns about 90°, and a paw turned
  about 160° folds the wrist. Then change the hold or the instrument first.

Run `tools/blender/arm_rebuild.py` first (`--keep-faces` for a clean quad mesh). Write a species
script `tools/blender/<a>_arms.py` only for a fault that it does not fix, such as an arm joined to
the trunk (`beaver_edit.py`).

### Rules

- Work in Blender with the plain tools, one step at a time (`run_steps()`), and look at an image
  after each step. Write no weight algorithm of your own.
- Change only the limb faces from the shoulder line to the wrist, or from the haunch line to the
  ankle. The new surface lies on the old limb. Ask the user before the first rebuild of a species.
- Keep the source file, and write the copy next to it with a note in its `README.md`.
- Never call `read_factory_settings`: it stops the MCP server.
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

Each upper arm and each forearm has 4 deform segments, and each elbow and wrist a helper bone. The
old arm bones hold no skin and only drive the new bones. `armSegments` of the config turns this on.

```text
 clavicle --> upper_arm (drives) --+-- upper_arm_seg0..3 (roll 1/8 .. 7/8)
                                   +-- elbow helper (half of upper -> fore)
              forearm (drives) ----+-- forearm_seg0..3 (twist 1/8 .. 7/8)
              forearm_twist -------+-- wrist helper (half of fore+twist -> paw)
              hand (skin) --> fingers (skin)
```

`poseSegments()` and `StudioArmSegments` of `src/models/studio-rig.ts` and `driven_turns()` of
`tools/blender/rig_mesh.py` turn the new bones with the same rule.

## Traps

### Paws and twist

- The retarget turns each paw toward its forearm in the plane of the palm (`PAW_TURN`), up to 70°.
  A pose can give a paw its own turn (`pawTurnL`, `pawBendR`).
- The bind paw of a mesh is pronated, so a far supinated hold passes 180° of skin twist, where
  `twistAngle()` flips. Supinate the bind paw by the value of `pnpm bind-supination <species>`
  (design 4.4), or lower the twist of the hold. Carry no value from the last frame.
- A turn of the bind forearm about the upper arm (`studio.bindArms`) moves the zero of the paw twist
  and of the upper arm roll. Straight bind arms keep the roll zero with the elbow axes of the bent
  bind (`StudioBody.hinges`).
- The `palm` of a rig config sets the roll of the arm bones. Read it from the curl of the claws.

### Holds and reach

- Short arms do not reach the instruments. Size the instrument by the rule of real players.
- The arm factor follows the hold. Fit the hold with a first factor, measure the reach, and rig the
  final factor.
- A hold trades folds against clearance. Check each hold change with `pnpm hold-fit --set`,
  `pnpm pose-depth --set`, and `pnpm arm-check --variant`.
- The arm gate and the depths pass while a paw misses its instrument. Measure each grip with
  `pnpm wind-grip`, and look at the thumb.
- A paw that points at its tube cannot face it with the palm. Put the grip beside the tube.
- A big head puts the grips at shoulder height: point the elbows down. A deep trunk takes the room
  of the elbows: point them out.
- A round belly takes the room of short forearms. Place a floor instrument by its contact point,
  and lean the spine.
- A long snout puts the mouthpiece far forward. Turn the instrument back around the mouthpiece, or
  move the mouthpiece under the muzzle (`lipShift`).
- A freed round arm has its full inner half width. Turn each elbow out, or bend it with a nearer
  grip, and check the grip turn (design 5.3).
- A roll rule that aims at a far point flips when the prop points at it (`rollToward()`).
- A line through the tail end (`trunkFront()`) can meet the back of a short neck under a large head.
  Measure the front of a band of the upper chest (`chestFront()`).

### Bow

- A turned paw moves on an arc around the wrist: put the bow stick along it.
- A forearm turn against the bow slides the paw on the stick. Turn the hand around a mid-paw grip
  (`stickTurnR`).
- A direct mix from an upright rest bow turns the tip through the head. Use a via (`BowVia`).

### Clearance

- The sweep measures triangle corners, so the middle of a long box can go into the body unseen
  (`bowPoints()`).
- The depth of an open part is false near its edge, so the sweep measures closed parts
  (`closedPart()`).
- The pair "instrument in body" gives the deepest corner. Measure the visible top plate alone.
- `armGaps()` of `pose/test-arm-clearance.ts` gives false depths for an arm in front of the
  chest. Measure a free pose, such as a clip, in the closed body (`closedDepth()`).
- The sweep counts the hidden root of a free arm in the trunk as a clip. Move only its deep
  vertices toward the wall, or toward the joint when they also come out (`pig_root.py`).

### Weights and folds

- Bone heat gives the trunk side a part of a hanging arm. Keep the arm weights on the free arm
  (`armSplit`, `armBelow`, `armCrease`).
- A thin face with corners of different weights turns over at a bent joint. `weights.rigid` gives
  it the mean. The `sliver` rule can move a weight 4 cm: compare the weights with `main`.
- A hanging T-pose arm folds the faces under its root. Make them and the first tube ring rigid
  (`rigidPainted`). Two rigid groups that touch fold at their shared edge: join them.
- A rigid group at the front of a root or across the chest moves the fold to its edge, which shades
  a dark notch. A Smooth of the root weights also moves the fold. A rigid patch on the arm swings
  across the chest, and the body cut folds over it: give it more clavicle than arm (`cat_root.py`).
- A raised arm pulls out a side with no trunk weight: give it a trunk share (`paintedBelow`).
  The share leaves a notch at the front of a hanging arm root. Fit a rest shape with `follow`.
- Add a ring at a joint (`refine.rings`) only where `pnpm fold-probe` finds folds, then run
  `pnpm pose-depth`.
- A straight bind folds a thick inner elbow. Put its rings one arm radius from the joint
  (`arm_rebuild.py --spec`).
- Automatic weights give the clavicle most of a thick arm root, and the wrist helper half of a
  short paw. Check both. `weights.fingers` 1 closes a paw around a tube.
- Uneven shares around one forearm ring, from a Smooth of a half ring or the weights of a large
  paw, dent a bent elbow and shear the twisted faces into dark spikes. Give each forearm ring one
  mean weight (`cat.blend`).
- A bent bind of a thick paw (`studio.bindArms`) presses the inner wrist into a dark slit that no
  weight rule, ring, or `raise` removes. Bind the arms straight (`studio.straightArms`), and judge
  a wrist by its 2x crops.
- Blender weights on the trunk, the head, or the neck fold faces. Keep the rule weights there
  (`paintedLower`).
- The glTF skin has no B-Bones and 4 weights for each vertex. In the Blender preview, set
  `bbone_segments` to 1, turn off Preserve Volume, and run Limit Total 4.

### Seams and cuts

- A crease can hold a closed tetrahedron, or a vertex of two surfaces. Remove them before the
  split (`penguin_edit.py`). A collapse at a cut loop can give a face of a stray color (`spread`).
- A raised arm pulls a seam where a hanging arm touches the trunk into dark flaps. Only a cut at
  the seam fixes them (`cut`). Give the caps the skin normals.
- A flap, a shard, or a dent at a seam is often a source form that the hanging arm hid. Look at the
  sheets of `pnpm close-views audit`.
- After a cut, the inner root of a bow arm swings into the chest. Give the rule weights a chest
  share (`weights.armRoot`), or turn the elbow out (design 5.3).
- End a cut above the shoulder joint, else a black triangle shows on the back.
- Flatten the inner side of a thick upper arm after the bake, never before it.
- Cut a wrist parallel to the last ring, and give the band `rootNormals.wrist`.
- A dark slot at an arm root or an elbow can come from split normals. Render
  `--probe colors,normals`, and try `rootNormals` before a rebuild.

### Shapes

- When no weight rule or ring removes a fold, fit a `raise` shape with `pnpm raise-fit` on the
  key of its joint. A body has at most `RAISE_LIMIT` shapes.
- A shape fixes only the poses near its rule, so fit the hold first.
- A recast hold that turns a hanging bind arm 110° or more crushes the front of the root. Fit a
  shape to the hold and a raised rest (`--sets rest`), and gate the own roles.
- A shape or a longer elbow helper cannot widen an elbow ring that a straight bind narrows.
  Weights that widen it fold the inner elbow.
- A grip far in front of a deep chest turns the shoulder past any shape. Turn the shoulder bone
  forward with the arm (`reachL`).
- On an arm joined to the trunk, start an elbow shape with `below` 0, and read its rig log first:
  `below` 0.3 also turns over the relaxed faces of the arm root.

### Legs, seat, and tail

- Put the hip joints of short thick legs in the haunch. Keep the shin to thigh ratio of the mesh,
  and fit the bench to the legs.
- The linear blend flattens a bent knee. Give the knees `bind.knee`, and smooth the back of the knee
  in few rounds.
- Short or sloped thighs set the seat top far under the hips. End the seat where the thighs leave
  it (`chair.front`).
- A large sit drop stretches the faces under a tail ball into a column. Carry the ball and the
  haunch near it (`sit.carryTail`, `sit.tailSpread`).
- A tail on the floor stays flat with rigid bone turns (`studio.tailBind`). A large tail needs two
  bones.
- A tip bone turned more than about 100° off the curl of the mesh pinches the bend. Spread the
  bend (`weights.tail.bend`).
- A tail root can set the seat top. Give the sit a fixed top from the final `--check` (`sit.top`,
  `sit.root`).
- A body with no chair keeps its center of mass over its soles: feet under the hips, and the trunk
  leaned forward.
- A long leg factor thins a thigh. Widen it before the skin (`legGirth`): bone heat splits a short
  thigh.
- A trunk factor up to the neck shortens the chest under the arm roots and folds the shoulders.
  Shorten only the trunk below the chest joint (`trunkTop`).
- A long thigh puts the feet forward. Lengthen the shin (`shinFactor`), and move `headFloor` and
  each lap share (`lap.along`) with the legs.
- A back factor of `girthProfile` moves the back on the chair. Keep it at 1 below the hips joint.
  A width row at the shoulder joints moves the rest paws. Narrow below them.
- A standing bind sits with a sit pose of its rig (`sitPose`, design 4.4). End its chair behind the
  heels, because short thighs leave the feet under the haunch.

### Head and colors

- A big head over a thin neck shows a dark band. Smooth the neck with a box that ends behind the
  chin.
- A horn, a trunk, whiskers, or antlers distort the head measures. Use `noseTop`, `noseFront`,
  `headFloor`, and `headCeiling`.
- A closed beak cannot open by weights. Split a copy of the source.
- A face takes black from a third of dark samples. Make the border faces light (`colors.border`).
- An old eye that is a ball in a groove shows a light rim or a dark almond around the pea eye,
  also with fur colors. Fill it (`eyeFill`), or smooth it in a hand rig and run `se.fit_eyes()`.
- A `soften` moves source points, so the painted weights find no vertex there. Put the `soften` in
  the config, and run `arm_rebuild.py`: it writes the softened places into the weights file.
- A face rule can paint a dark block on the side. Check it from the front, at 60°, and the sides.

### Blender scripts

- The face order of `bmesh.ops.create_uvsphere()` changes from run to run. Make the sphere points
  in the script.
- The glTF exporter writes vertex colors only with `export_vertex_color='NAME'` and the attribute
  name.
- The `location` of a new child object is in the frame of its parent. Undo the parent transform
  for the local point.
- A move of the basis of a mesh with shape keys must move each key too, else each key gets the
  move back as its own.
- The glTF importer adds bone shapes and keys at 24 fps, and an FBX take can key the armature
  scale.
- An FBX armature with no mesh takes its current pose as its rest pose. Keep each quaternion key
  on the side of the key before it (a dot product of 0 or more), else the blend goes the long way.
- The FBX exporter takes its ids from the Python string hash. Run Blender with `PYTHONHASHSEED=0`
  and `--python-use-system-env`, as `mannequin.py` does.
- A pose turn of a bone uses the axes of that bone, with Y along the bone. Convert a turn in the
  axes of the armature first.
- A value such as 0.707107 in a module fails the lint as an approximate `Math.SQRT1_2`. Move a
  joint a little off 45°.

### Probes

- Split a recast fold count by the main bones of `pnpm fold-probe --faces` before a root fix:
  paws and inner elbows at rest can hold most of it.
- `--views` of `pnpm arm-check` takes no conductor. Aim `pnpm close-views conductor --aim` at a
  wrist.
- The bow values (`src/pose/bowed-rig.ts`, `src/pose/strokes.ts`), `HAND_MOTION`, the percussion
  `sizes`, `CONDUCTOR_MOTION.scale`, and the sweep limits stay in meters. Compare a new body size
  in `H` first.

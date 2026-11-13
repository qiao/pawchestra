# Rigging

Design 4.4 gives the body rules, and [`rig-rounds.md`](rig-rounds.md) the brief of a rigging
round.

## Bodies and roles

Each species has a studio body (`'studio-<a>'`) with the role-neutral bind (design 4.4). "Hand
rig" means the hand rig of a Tripo P2 mesh in `assets/models/<s>/tripo-hand/`, with no arm cut and
no stretch. A chain in `tools/blender/hand/<s>/` makes each one. "Rebuilt arms"
means quad arm tubes, Blender weights, and arm segments of the mesh rig. The `README.md` of each
model folder gives the files of each step.

| Species | Body | Role |
| --- | --- | --- |
| bear | Hand rig at the eye height of the older bear, smaller paws, paws turned by whole ring steps. Stands on the podium. | `conductor` |
| polar-bear | Hand rig, a digit bone for each claw. Sits on a bench that fits the legs, with the thighs sloped down (`benchFitOf()`). | `pianist` |
| rabbit | Hand rig of the fourth Tripo rabbit at the seated eye height of the third rabbit, arms of the girth of the third rabbit (`armGirth`), a smaller violin. | `violinist` |
| fox-red | Hand rig at the eye height of the older fox, arms 1.25 times longer, a smaller fore paw, own joints for the legs and the right ear of a source that is no mirror. | `fox-violinist` |
| fox-tan | The red fox rig with a tan palette (`palettes`). | `flutist` |
| cat | Hand rig, a tail curled on the seat, a viola of `violaScale`. | `violist` |
| dog | Hand rig of the beagle. | `cellist` |
| panda | Hand rig, arms 1.2 times longer. Stands as a soloist. | `trombonist` |
| hippo | Hand rig, arms 1.2 times longer. Stands at the contrabass. | `bassist` |
| mouse | Hand rig at the eye height of the older mouse, a long tail on the floor, a smaller oboe. No chair: it stands on the legs of its source. | `oboist` |
| elephant | Hand rig. Stands at the timpani. | `timpanist` |
| beaver | Hand rig. No chair: it stands on its short legs. | `bassoonist` |
| pig | Hand rig. Stands as a soloist. | `hornist` |
| wolf | Hand rig. | `clarinetist`, `violinist@wolf` (recast) |
| badger | Hand rig at the crown of the older badger, arms 1.2 times longer, a left eyeball fused to its socket (`fused_ball()`), a suspended cymbal (`cymbalForm`). Stands at each percussion instrument. | `bass-drummer`, `snare-drummer`, `cymbalist`, `percussionist`, `xylophonist` |
| monkey | Hand rig at 1.2 times H of the older monkey, no chair, with the trumpet of the app. | `trumpeter` |
| rhino | T-pose mesh, rebuilt arms (`rhino_tpose_arms.py`), elbow `raise` shapes, a tail ball. Stands at a tuba with a longer lead pipe (`tubaPipe`). | `tubist` |
| deer | Hand rig of the fawn, arms 1.3 times longer. Sits on the harp stool, with a smaller harp (`harpScale`). | `harpist` |
| penguin | Hand rig. Stands on its riser. | `singer` |
| mannequin | The test body: the animal preset of `mannequin.py`, its own faces (`arm_rebuild.py --keep-faces`). | `violinist@mannequin`, `clarinetist@mannequin` (recast) |

## Rules of the mesh

These rules hold for each route:

- **The quad source is the truth.** Commit a quad source as an FBX file, with its base color in
  `<name>.fbm/`, or as a `.blend`. A GLB file holds only triangles, and a join of its triangles
  into quads only guesses the loops. Edit the quads, and divide them only at the export.
- **Subdivide, never cut.** Add a limb ring only by an edge ring split on a clean quad loop, with
  the new vertices at the edge middles (`rings.subdivide`). Never add a ring with a plane cut. An
  edge ring with a triangle or a pole takes no split: report its place. A limb ring of quads
  through one triangle can take the split (`seed_rings()`, badger).
- **A small clip over an over-cut.** A small clip of the arm root into the trunk is better than an
  over-cut. A notch, a gap, a fin, a flap, or a ledge at the armpit or the inner elbow is a fault.
  A fault that a prop or the piano hides still counts.
- **Weights by exact rows.** Give exact rows on chosen vertices (`sa.set_weight_row()`). Each
  joint blends only in its own rings, with one row for each ring. Each vertex outside the rings
  follows one bone. Write no fade formula over a region, and paint no brush strokes through MCP.
  After a change of the bind, check all weights again.
- **Point edits by hand.** Fix a mesh with point edits in the live Blender, on a copy of the
  source. Never change the form to remove a dark band.
- **App body.** A new body or route goes into the app only after the user approves its look there.

## The asset chain

Three routes make the rig file `<s>.rig.glb`, and `pnpm studio-body` packs each one. Design 4.4
("Models") gives the chain in a diagram.

- **Mesh rig.** `arm_rebuild.py` or `<a>_arms.py` rebuilds the arms, and `pnpm rig-mesh` rigs
  the rhino and the mannequin. A mesh whose arms join the trunk takes this
  route.
- **Simple route.** `simple_rig.py` writes the `.blend` of a hand rig from a clean quad mesh with
  the arms apart (design 4.4). The skill `pawchestra-body` runs it in a candidate tree.
- **Hand rig.** A person or an agent makes the `.blend` in Blender, and `pnpm rig-export` exports
  it. A script chain makes the `.blend` of each Tripo body.

A point edit of a rig file goes into `assets/models/<s>/<s>-edits.json`, and
`pnpm glb-point-edits <file>` writes it into the rig file of its base commit. Test a
change of the chain on the mannequin first: `pnpm rig-mesh mannequin --check` and
`pnpm arm-check violinist@mannequin clarinetist@mannequin`.

### Steps of a new body

Steps 1 to 4 are the steps of the mesh rig. Steps 5 and 6 hold for each route.

1. **Joints.** Measure the joints on cuts of the mesh, and write them with a note on each measure
   in `tools/mesh-rigs/<a>.json`. `pnpm rig-mesh <a> --check` gives the arm factor of the reach.
2. **Form.** A body that is shorter or wider than the mesh takes `proportions`, and a head that
   keeps its form takes `"keep": "head"`. A larger head grows `H`, so fit the holds again.
3. **Options.** Run `pnpm mesh-options`, and fix each warning. Then ask the user about the size,
   the arms, and the legs with `options.md` and `options.png`.
4. **Rig.** Check the mesh with `pnpm mesh-intake`, and run `arm_rebuild.py`. Look at each
   variant with `pnpm rig-mesh <a> --check --preview <dir>`. Keep the budgets, and keep the
   standing body within 1 mm of the source.
5. **Export.** Add the animal to `ANIMALS` with the landmark of its scale, the crease angle of its
   reference crops, and the seat settings. Run `pnpm studio-body <a>`, add the module to
   `STUDIO_BODIES`, and give the species the body.
6. **Holds.** Fit the holds (`SPECIES_HOLDS`, `SPECIES_WIND_HOLDS` with `LEG_RESTS`, or
   `PERCUSSION_HOLDS`) in the `H` of the new body with `pnpm hold-fit`, `pnpm hold-reach`, and
   `pnpm pose-depth`.

### Steps of a hand rig

Design 4.4 ("Hand rig") gives the layout of the `.blend` and the folder of a trial. Export a trial
only by path (`--blend <file> --out <file>`), never to `assets/models/<s>/`.

The chain of a Tripo body lives in `tools/blender/hand/<s>/` (`tools/blender/hand/README.md`).
Change the chain, never its `.blend`, and run `pnpm hand-chain <s>`. A size change is
`metersPerUnit` in `params.json`. A worktree has the chain in git, so copy no scratch folder.

In a live Blender, call only the functions of `studio_preview.py` (`sp`), `studio_armature.py`
(`sa`), and `studio_eyes.py` (`se`) of `tools/blender/`. Run their command lines headless only.
Write the exact call and values of each scripted edit of a `.blend` in the `README.md` row of the
file. Try each scripted edit on a copy with `pnpm rig-trial`, and find thin faces and sharp edges
with `pnpm bind-view`.

1. **Mesh.** Edit the mesh, and keep its UVs. Run `sa.add_surface(mesh, '<s>', <texture>,
   eye_fans=False)` one time for the face colors and the gloss nose. For the color map of the
   source (design 4.5), give each new face UVs of the fur next to it, by hand. Set the property
   `texture` of the mesh object to a web copy `<name>-color.webp`, and the face attribute
   `plain` on a fur face that keeps its color, such as a whisker.
2. **Rig.** Put `palm`, `seat`, `hinges`, and the facts of `BODY_FACTS` (at least `height` and
   `crease`) on the armature object. Fit the bones, run `sa.fix_rolls(rig)`, and give Automatic
   Weights (Limit Total 4, Normalize All), then exact rows. Pose the bind, run
   `sa.drive_segments(rig, key_frame=1)`, and sculpt the keys `bind*` and `arm_raise_*`.
3. **Eyes.** Run `se.place_eyes()` with each middle on the head surface in the bind, and delete
   the eye fans. After an edit of an eye or of the face, run `se.fit_eyes(rig, mesh)`. When the
   color map paints a full eye on the eyeballs of the source, keep the eyeballs in place of the
   eye objects: the face attribute `eye`, the slot `fur`, the source UVs, and the row `head` 1.
   Give each such eye a lid (design 4.4, "Hand rig"), and check its edges with ray casts. Add no
   catchlight mesh: the eye light of the app gives each ball its highlight (design 4.5).
4. **Preview.** `pnpm pose-preview <role>` writes the app pose of each moment.
   `sp.load_preview()` shows it beside the rig, `sp.refresh_preview()` shows the open file, and
   `sp.fold_colors(True)` marks the folds. Check each weight edit in the bind and the app pose.
5. **Export.** Run `pnpm rig-export <s>` and `pnpm studio-body <s>`. Diff `<s>.rig.json` to see
   what moved.

For the simple route, run `simple_rig.py`, then step 5. Write a texture with `Image.save()`,
because `Image.save_render()` changes the colors by the view transform.

## The arm gate

A fold count does not see a twisted or a flat arm. On request, each round that changes a hold, a
rig, a pose, an instrument size, or a seat runs `pnpm arm-check <roles> --base <start> --views
<dir>`, and reports its table and crop pairs. Then a `FAIL`, or a better number with a worse look,
makes the round not done. Gate only the roles that the body plays. A recast cell is a report only.
Design 4.4 ("Arm gate") gives the measures.

- A planned grip change expects a `FAIL` against `ACCEPTED_GRIPS`. Report the new median with 2x
  paw crops at a strike and at rest.
- A new wind hold whose paw faces its tube adds the `ACCEPTED_PALMS` entry that the tool prints.
- After a new bind, `--world --base <start>` proves the same bones.
- A `WORSE` value is inside `NEAR_LIMIT` of its limit and stops nothing. Check its arm in the
  crops.

## The rebuild of the arms in Blender

This section holds for the mesh rig. Rebuild the arms for a spiral crease, a sharp elbow, slivers,
or slits. Fix all three causes, because they add up:

- **Faces.** Long thin triangles across a joint fold into a spiral. New quad faces fix it.
- **Bones.** The linear blend collapses the skin under a large twist on one bone. Short segments
  keep each step below about 25°.
- **Hold.** A paw turned about 160° folds the wrist, and a real forearm turns about 90°. Then
  change the hold or the instrument first.

Run `tools/blender/arm_rebuild.py` first (`--keep-faces` for a clean quad mesh). Write a species
script `tools/blender/<a>_arms.py` only for a fault that it does not fix.

- Ask the user before the first rebuild of a species. Change only the limb faces from the
  shoulder line to the wrist, or from the haunch line to the ankle.
- Work one step at a time (`run_steps()`), and look at an image after each step. Write no weight
  algorithm of your own. Keep the source file, and note the copy in its `README.md`.
- Never call `read_factory_settings`, because it stops the MCP server.
- Merge by Distance first, because automatic weights fail on split seams.
- In Weight Paint, remove the arm bones from the trunk below the armpits. Look at the arm down,
  forward, an elbow at 100°, and a forearm turn of 90°.
- New faces move the bone heat of the whole mesh, so give the kept vertices the old bone heat
  (`heatSource`).

### Bones

Each upper arm and each forearm has 4 deform segments, and each elbow and wrist a helper bone. The
old arm bones hold no skin and only drive the new bones (`armSegments`).

```text
 clavicle --> upper_arm (drives) --+-- upper_arm_seg0..3 (roll 1/8 .. 7/8)
                                   +-- elbow helper (half of upper -> fore)
              forearm (drives) ----+-- forearm_seg0..3 (twist 1/8 .. 7/8)
              forearm_twist -------+-- wrist helper (half of fore+twist -> paw)
              hand (skin) --> fingers (skin)
```

`poseSegments()` of `src/models/studio-rig.ts` and `driven_turns()` of
`tools/blender/rig_mesh.py` turn the new bones with the same rule.

## Traps

Design 4.4 gives the rule and the reason of each config key.

### Holds and reach

- Hold values that follow the body are in `H`, and values on the instrument are in instrument
  units, so a body size change needs no hold edit (design 5.3, "Units"). The motion sizes and the
  sweep limits stay in meters: check them after a size change.
- The bind paw of a mesh is pronated, so a far supinated hold passes 180° of skin twist, where
  `twistAngle()` flips. Use `pnpm bind-supination` (design 4.4), or lower the twist of the hold.
- The `palm` of a rig config sets the roll of the arm bones. Read it from the claw curl on the real
  palm of the source.
- Short arms do not reach the instruments. Size the instrument by the rule of real players, then
  fit the arm factor to the reach.
- A hold trades folds against clearance. Check each hold change with `hold-fit`, `pose-depth`,
  `arm-check`, and `body-clip` (the trunk, the arms, and the legs in the instrument and the seat).
- The arm gate and the depths pass while a paw misses its instrument. Measure each grip with
  `pnpm wind-grip`, and look at the thumb. A paw that points at its tube cannot face it with the
  palm: put the grip beside the tube.
- A big head puts the grips at shoulder height: point the elbows down. A deep trunk or a freed
  round arm takes the room of the elbows: point them out, and check the grip turn (design 5.3).
- A round belly takes the room of short forearms. Place a floor instrument by its contact point,
  and lean the spine.
- A long snout puts the mouthpiece far forward. Turn the instrument back around the mouthpiece, or
  move the mouthpiece under the muzzle (`lipShift`).
- A turned paw moves on an arc around the wrist: put the bow stick along it. A forearm turn
  against the bow slides the paw on the stick: turn the hand around a mid-paw grip
  (`stickTurnR`). A direct mix from an upright rest bow turns the tip through the head: use a via (`BowVia`).

### Clearance and probes

- The sweep measures triangle corners, so the middle of a long box can go into the body unseen
  (`bowPoints()`). The depth of an open part is false near its edge, so the sweep measures closed
  parts (`closedPart()`).
- The pair "instrument in body" gives the deepest corner. Measure the visible top plate alone.
- Measure a free pose, such as a clip, in the closed body (`closedDepth()`).
- The sweep counts the hidden root of a free arm in the trunk as a clip. Move only its deep
  vertices toward the wall, or toward the joint when they also come out.
- Before a root fix, split a recast fold count by bone with `pnpm fold-probe --faces`. Paws and
  inner elbows at rest can hold most of it.
- `arm-check --views` takes no conductor. Aim `pnpm close-views conductor --aim` at a wrist.

### Weights, folds, and shapes

- Bone heat gives the trunk side a part of a hanging arm. Keep the arm weights on the free arm
  (`armSplit`, `armBelow`, `armCrease`).
- A thin face with corners of different weights turns over at a bent joint, so `weights.rigid`
  gives it the mean. The `sliver` rule can move a weight 4 cm: compare the weights with `main`.
- A hanging T-pose arm folds the faces under its root. Make them and the first tube ring rigid
  (`rigidPainted`), and join two rigid groups that touch. A rigid group at the front of a root or
  across the chest, or a Smooth of the root weights, moves the fold to its edge as a dark notch.
- Bone heat gives the front of an armpit a clavicle share of about 0.55. A much lower first arm
  row folds it when the arm reaches forward: start `rows.control` near that share.
- Bone heat thigh shares far up the belly pull a seated belly back into a ridge. Move it toward
  the trunk form with a key (`trunk_belly()` of the panda chain), faded out under the arms.
- Add a ring at a joint (`refine.rings`) only where `pnpm fold-probe` finds folds. A straight bind
  folds a thick inner elbow: put its rings one arm radius from the joint (`arm_rebuild.py --spec`).
- Automatic weights give the clavicle most of a thick arm root, and the wrist helper half of a
  short paw. Check both. `weights.fingers` 1 closes a paw around a tube.
- An elbow helper share below 1 at the elbow joint makes the bend share jump there. Let it reach
  1 at the joint (badger).
- Uneven shares around one forearm ring dent a bent elbow and shear the twisted faces into dark
  spikes. Measure them with `sa.ring_spread()`.
- Blender weights on the trunk, the head, or the neck fold faces. Keep the rule weights there
  (`paintedLower`).
- A thigh share in the crotch lifts the lower belly band of a seated bind into a shelf. Move the
  band onto the thigh tops with a key `bind*`, and keep each crease vertex off the line of its
  neighbors. A lower thigh share only moves the shelf down, because the belly then hangs over the
  thigh tops. A relax along the normal toward the vertices above and below keeps each girth
  (`bind_belly` of the rabbit candidate).
- A hold can turn a paw far from the source paw, and a twist of 110° on one arm part still
  shows as sheared facets. Turn the source paw rigidly about the forearm axis by whole ring steps
  and join the wrist band again, with a `palm` for each side on the real palm. Then move the rest
  between the moments with the elbow poles of the hold, and center it with `hinges`. Keep each
  part within about 45°. The app takes the smooth normals from the bind, so keep the bind
  supination near 0 when the twists stay far from 180°.
- When no weight rule or ring removes a fold, fit a `raise` shape after the hold with
  `pnpm raise-fit`. A shape fixes only the poses near its rule, and design 4.4 gives its limits.
- A grip far in front of a deep chest turns the shoulder past any shape. Turn the shoulder bone
  forward with the arm (`reachL`).
- On an arm joined to the trunk, start an elbow shape with `below` 0, because `below` 0.3 also
  turns over the relaxed faces of the arm root.

### Seams

Design 4.4 gives the merges of each copy.

- Remove a closed tetrahedron or a vertex of two surfaces in a crease before the split. A
  collapse at a cut loop can give a face of a stray color (`spread`).
- Free an arm (`cut`) only as far as a raised arm of the played roles needs it, and stop where the
  root meets the trunk. End a cut above the shoulder joint, else a black triangle shows on the
  back. Give the caps the skin normals, and check the flat rig view (front, below, back).
- A flap, a shard, or a dent at a seam is often a source form that the hanging arm hid. Look at the
  sheets of `pnpm close-views audit`.
- A tube that `arm_rebuild.py` wraps onto a freed arm can keep its lowest inner vertices on the
  trunk as fins. Merge each into the next vertex of its ring on the arm.
- A free arm corner that turns away from a trunk hole leaves a notch beside the cap. Move it toward
  the trunk with `weightMoves`, beyond the plane of `armSplit`.
- After a cut, the inner root of a bow arm swings into the chest. Give the rule weights a chest
  share (`weights.armRoot`), or turn the elbow out (design 5.3).
- Split normals can make a dark slot at an arm root, an elbow, or a wrist. Render
  `--probe colors,normals`, and try `rootNormals` before a rebuild.

### Legs, seat, and tail

- Put the hip joints of short thick legs in the haunch. Keep the shin to thigh ratio of the mesh,
  and fit the bench to the legs. A long thigh puts the feet forward: lengthen the shin
  (`shinFactor`), and move `headFloor` and each lap share (`lap.along`) with the legs.
- The linear blend flattens a bent knee. Give the knees `bind.knee`.
- A tail on the floor stays flat with rigid bone turns (`studio.tailBind`). A large tail needs two
  bones. A tip bone far off the curl of the mesh pinches the bend (`weights.tail.bend`). A tail
  root can set the seat top: fix it with `sit.top` and `sit.root`.
- A girth move that ends at a joint leaves a ledge in the seated bind. Relax the posed bind there
  in a few plain Laplacian rounds, into the sit key by the inverse skin. Taubin keeps the ledge.
  A standing body gets the source back from `legs_straight`: use `smooth` boxes (rhino).

### Head and colors

- A big head over a thin neck shows a dark band under the head. Keep this form, because a fill of
  the groove makes the neck a thick column.
- A closed beak cannot open by weights. Split a copy of the source.
- A face takes black from a third of dark samples. Make the border faces light (`colors.border`).
- An old eye that is a ball in a groove shows a light rim or a dark almond around the bead eye.
  Fill it (`eyeFill`), or move the dome and groove vertices along the eye axis onto the face
  surface, and put the eye object on that surface. A ball with a painted eye
  stays (step 3 of "Steps of a hand rig").
- The eye box and the nose box of `add_surface()` are in the units of the source. Run it before
  the legs lift the body, or lower the mesh for the run.
- A `soften` moves source points, so the painted weights find no vertex there. Put the `soften` in
  the config, and run `arm_rebuild.py`, which writes the softened places into the weights file.

### Blender scripts

- The face order of `bmesh.ops.create_uvsphere()` changes from run to run. Make the sphere points
  in the script.
- The glTF exporter writes vertex colors only with `export_vertex_color='NAME'` and the attribute
  name.
- The `location` of a new child object is in the frame of its parent. A move of the basis of a
  mesh with shape keys must move each key too.
- The glTF importer adds bone shapes, keys at 24 fps, and the Action `reference` of an export,
  which the next export reads as the pose of the sheet. An FBX take can key the armature scale.
- An FBX armature with no mesh takes its current pose as its rest pose. Keep each quaternion key
  on the side of the key before it (a dot product of 0 or more), else the blend goes the long way.
- The FBX exporter takes its ids from the Python string hash. Run Blender with `PYTHONHASHSEED=0`
  and `--python-use-system-env`, as `mannequin.py` does.
- A value such as 0.707107 in a module fails the lint as an approximate `Math.SQRT1_2`. Move a
  joint a little off 45°.

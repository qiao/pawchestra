# Rigging

Design 4.4 gives the body rules, and [`rig-rounds.md`](rig-rounds.md) the brief of a rigging
round.

## Bodies and roles

Each species has a body (`'body-<a>'`) with the role-neutral bind (design 4.4). "Hand
rig" means the hand rig of a Tripo P2 mesh in `assets/models/<s>/tripo-hand/`, with no arm cut and
no stretch. A chain in `tools/blender/hand/<s>/` makes each one. The `README.md` of each model
folder gives the files of each step.

| Species | Body | Role |
| --- | --- | --- |
| bear | Hand rig, smaller paws, paws turned by whole ring steps. Stands on the podium. | `conductor` |
| polar-bear | Hand rig, a digit bone for each claw. Sits on a bench that fits the legs, with the thighs sloped down (`benchFitOf()`). | `pianist` |
| rabbit | Hand rig of the fourth Tripo rabbit, thicker arms (`armGirth`), arms 1.25 times longer (`armStretch`), a smaller violin. | `violinist` |
| fox-red | Hand rig, arms 1.25 times longer, a smaller fore paw, own joints for the legs and the right ear of a source that is no mirror. | `fox-violinist` |
| fox-tan | The red fox rig with a tan palette (`palettes`). | `flutist` |
| cat | Hand rig, a tail curled on the seat, a viola of `violaScale`. | `violist` |
| dog | Hand rig of the beagle. | `cellist` |
| panda | Hand rig, arms 1.2 times longer. Stands as a soloist. | `trombonist` |
| hippo | Hand rig, arms 1.2 times longer. Stands at the contrabass. | `bassist` |
| mouse | Hand rig, a long tail on the floor, a smaller oboe. No chair: it stands on the legs of its source. | `oboist` |
| elephant | Hand rig. Stands at the timpani. | `timpanist` |
| beaver | Hand rig. No chair: it stands on its short legs. | `bassoonist` |
| pig | Hand rig. Stands as a soloist. | `hornist` |
| wolf | Hand rig. | `clarinetist`, `violinist@wolf` (recast) |
| badger | Hand rig, arms 1.2 times longer, a left eyeball fused to its socket (`fused_ball()`), a suspended cymbal (`cymbalForm`). Stands at each percussion instrument. | `bass-drummer`, `snare-drummer`, `cymbalist`, `percussionist`, `xylophonist` |
| monkey | Hand rig, no chair, a smaller trumpet (`trumpetScale`). | `trumpeter` |
| rhino | Hand rig, arms 1.2 times longer, the left paw turned by 5 ring steps, face rows on the long muzzle (`faceRows`). Stands at a tuba with a longer lead pipe (`tubaPipe`). | `tubist` |
| deer | Hand rig of the fawn, arms 1.5 times longer. Sits on the harp stool, with the harp of 0.975 (`harpScale`) in front of the chest. | `harpist` |
| penguin | Hand rig. Stands on its riser. | `singer` |
| mannequin | The test body: the animal preset of `mannequin.py`, as the fixed rig file `mannequin.rig.glb`. | `violinist@mannequin`, `clarinetist@mannequin` (recast) |

## Rules of the mesh

These rules hold for each route:

- **The quad source is the truth.** Commit a quad source as an FBX file, with its base color in
  `<name>.fbm/`, or as a `.blend`. A GLB file holds only triangles, and a join of its triangles
  into quads only guesses the loops. Edit the quads, and divide them only at the export.
- **Subdivide, never cut.** Add a limb ring only by an edge ring split on a clean quad loop, with
  the new vertices at the edge middles (`rings.subdivide`). Never add a ring with a plane cut. An
  edge ring with a triangle or a pole takes no split: report its place. A limb ring of quads
  through one triangle, or a clean band beside a loop through a pole, can take the split
  (`seed_rings()`, badger and beaver).
- **A small clip over an over-cut.** A small clip of the arm root into the trunk is better than an
  over-cut. A notch, a gap, a fin, a flap, or a ledge at the armpit or the inner elbow is a fault.
  A fault that a prop or the piano hides still counts.
- **Weights by exact rows.** Give exact rows on chosen vertices (`sa.set_weight_row()`). Each
  joint blends only in its own rings, with one row for each ring. Each vertex outside the rings
  follows one bone. Write no fade formula over a region, and paint no brush strokes through MCP.
  After a change of the bind, check all weights again.
- **Point edits in the chain.** Change the form of a source only with point edits of its chain:
  a pure map of points in `redits.py`, with its values in `edits` of `params.json`. `build.py`
  moves the mesh with the map, and `make_config.py` moves the joints with it, so that the bones
  fit. Try an edit in the live Blender first, then write it into the chain. Cut no arm free of the
  trunk, and never change the form to remove a dark band.
- **App body.** A new body or route goes into the app only after the user approves its look there.

## The asset chain

Two routes make the rig file `<s>.rig.glb`, and `pnpm body-module` packs each one. Design 4.4
("Models") gives the chain in a diagram. A source mesh needs its arms apart from the trunk.

- **Simple route.** `simple_rig.py` writes the `.blend` of a hand rig from a clean quad mesh with
  the arms apart (design 4.4). The skill `pawchestra-body` runs it in a candidate tree.
- **Hand rig.** A person or an agent makes the `.blend` in Blender, and `pnpm rig-export` exports
  it. A script chain makes the `.blend` of each Tripo body.

Test a change of a shared hold on the mannequin with
`pnpm arm-check violinist@mannequin clarinetist@mannequin`.

### Steps of a new body

1. **Rig.** Make the `.blend` by the simple route or by hand ("Steps of a hand rig"), and export
   it with `pnpm rig-export`. Keep the budgets.
2. **Export.** Add the animal to `ANIMALS` with the landmark of its scale, the crease angle of its
   reference crops, and the seat settings. Run `pnpm body-module <a>`, add the module to
   `BODIES`, and give the species the body.
3. **Holds.** Fit the holds (`SPECIES_HOLDS`, `SPECIES_WIND_HOLDS` with `LEG_RESTS`, or
   `PERCUSSION_HOLDS`) in the `H` of the new body with `pnpm hold-fit`, `pnpm hold-reach`, and
   `pnpm pose-depth`.

### Steps of a hand rig

Design 4.4 ("Hand rig") gives the layout of the `.blend` and the folder of a trial. Export a trial
only by path (`--blend <file> --out <file>`), never to `assets/models/<s>/`.

The chain of a Tripo body lives in `tools/blender/hand/<s>/` (`tools/blender/hand/README.md`).
Change the chain, never its `.blend`, and run `pnpm hand-chain <s>`. A size change is
`metersPerUnit` in `params.json`. A worktree has the chain in git, so copy no scratch folder.

In a live Blender, call only the functions of `body_preview.py` (`sp`), `body_armature.py`
(`sa`), and `body_eyes.py` (`se`) of `tools/blender/`. Run their command lines headless only.
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
5. **Export.** Run `pnpm rig-export <s>` and `pnpm body-module <s>`. Diff `<s>.rig.json` to see
   what moved.

For the simple route, run `simple_rig.py`, then step 5. Write a texture with `Image.save()`:
`Image.save_render()` applies the view transform.

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

## Arm bones

Each upper arm and each forearm has 4 deform segments, and each elbow and wrist a helper bone. The
old arm bones hold no skin and only drive the new bones (`armSegments`).

```text
 clavicle --> upper_arm (drives) --+-- upper_arm_seg0..3 (roll 1/8 .. 7/8)
                                   +-- elbow helper (half of upper -> fore)
              forearm (drives) ----+-- forearm_seg0..3 (twist 1/8 .. 7/8)
              forearm_twist -------+-- wrist helper (half of fore+twist -> paw)
              hand (skin) --> fingers (skin)
```

`poseSegments()` of `src/models/body-rig.ts` and `driven_turns()` of
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
- An own wind hold with a side aim and no `aimSigns` takes the side sign of each paw from the arm.
  A body change can flip that sign and turn the paw over (the tan fox flute). Set `aimSigns`, as
  the shared hold does.
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

- A thin face with corners of different weights turns over at a bent joint, so `weights.rigid`
  gives it the mean.
- Start `rows.control` near the bone heat clavicle share of the armpit (0.55 to 0.7), else the
  front folds in a reach. Give the arm shares of the back wall to the clavicle (`back_rows()`,
  badger), else a backward elbow folds it into a slit.
- Bone heat thigh shares far up the belly pull a seated belly back into a ridge. Move it toward
  the trunk form with a key (`trunk_belly()` of the panda chain), faded out under the arms.
- Limit Total 4 can drop the belly thigh shares under the arms, so the seated chest stands over
  the belly as a ledge. Fade them out by exact rows (`belly_rows()`, pig).
- Add a ring at a joint (`refine.rings`) only where `pnpm fold-probe` finds folds. A straight bind
  folds a thick inner elbow: put its rings one arm radius from the joint.
- Automatic weights give the clavicle most of a thick arm root, and the wrist helper half of a
  short paw. Check both. `weights.fingers` 1 closes a paw around a tube.
- A helper share below 1 at the elbow joint makes the bend share jump there. Let it rise from 0
  to 1 at the joint (the source x for an arm stretch) and fall to 0, over about one arm radius
  on each side: a rise of 0.018 units sharpened the fox elbow.
- Uneven shares around one forearm ring dent a bent elbow and shear the twisted faces into dark
  spikes. Measure them with `sa.ring_spread()`.
- Blender weights on the trunk, the head, or the neck fold faces. Keep the rule weights there.
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
  supination near 0 when the twists stay far from 180°. Keep the near ring out of the turn
  (`move[A] = False`): a cut at the mean place of a slanted ring shears the wrist into a pinch.
- A turned paw keeps its UVs, so a ring line with a step of tone shows at the band. Fade the band
  texels in the maps (`bandFade`). A planar patch (`bandPatch`) shows one fur piece on each quad.
- When no weight rule or ring removes a fold, fit a `raise` shape after the hold. A shape fixes
  only the poses near its rule, and design 4.4 gives its limits.
- A grip far in front of a deep chest turns the shoulder past any shape. Turn the shoulder bone
  forward with the arm (`reachL`).
- On an arm joined to the trunk, start an elbow shape with `below` 0, because `below` 0.3 also
  turns over the relaxed faces of the arm root.

### Seams

Design 4.4 gives the merges of each copy.

- Remove a closed tetrahedron or a vertex of two surfaces in a crease before the split. A
  collapse at a cut loop can give a face of a stray color (`spread`).
- A flap, a shard, or a dent at a seam is often a source form that the hanging arm hid. Look at the
  sheets of `pnpm close-views audit`.
- Split normals can make a dark slot at an arm root, an elbow, or a wrist. Render
  `--probe colors,normals`.

### Legs, seat, and tail

- A near vertical thigh bone gives its roll no clear hint, and the export refuses the leg frames
  ("scales or shears"). Slope the thigh about 15° back (the rhino).
- Put the hip joints of short thick legs in the haunch. Keep the shin to thigh ratio of the mesh,
  and fit the bench to the legs. A long thigh puts the feet forward: lengthen the shin
  with a point edit, and move `headFloor` and each lap share (`lap.along`) with the legs.
- The linear blend flattens a bent knee. Give the knees `bind.knee`.
- A tail on the floor stays flat with rigid bone turns (`bind.tailBind`). A large tail needs two
  bones. A tip bone far off the curl of the mesh pinches the bend (`weights.tail.bend`). A tail
  root can set the seat top: fix it with `sit.top` and `sit.root`.
- A girth move that ends at a joint leaves a ledge in the seated bind. Relax the posed bind there
  in a few plain Laplacian rounds, into the sit key by the inverse skin. Taubin keeps the ledge.
  A standing body gets the source back from `legs_straight`: use `smooth` boxes.

### Head and colors

- A big head over a thin neck shows a dark band under the head. Keep this form, because a fill of
  the groove makes the neck a thick column.
- A closed beak cannot open by weights. Split a copy of the source.
- A face takes black from a third of dark samples. Make the border faces light (`colors.border`).
- An old eye that is a ball in a groove shows a light rim or a dark almond around the bead eye.
  Move the dome and groove vertices along the eye axis onto the face
  surface, and put the eye object on that surface. A ball with a painted eye
  stays (step 3 of "Steps of a hand rig").
- The eye box and the nose box of `add_surface()` are in the units of the source. Run it before
  the legs lift the body, or lower the mesh for the run.

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

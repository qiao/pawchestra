# Cat model

This folder holds the T-pose source mesh of the cat, the rig made by hand in Blender
(`cat.blend`), and the rigged copy that the export writes from it. The app does not serve these
files. It loads the module `src/models/studio/cat.ts`, which this chain writes:

```text
cat-tpose.glb                      source mesh
   │  work by hand in Blender (design 4.4, "Hand rig")
   v
cat.blend                          mesh, face colors, armature, bind, and keys
   │  pnpm rig-export cat
   v
cat.rig.glb + cat.rig.json         rigged mesh and its text summary
   │  pnpm studio-body cat
   v
src/models/studio/cat.ts           studio body of the app
```

`cat-arms.glb`, `cat-weights.json`, and `cat-root-weights.json` are the inputs of the old chain
of `tools/mesh-rigs/cat.json`. `pnpm rig-mesh cat` stops now, because the folder holds
`cat.blend`. Each value of the hand rig lives only in `cat.blend`, and the tools read it from the
export (design 4.4, "Hand rig"). The bind of `cat.blend` started from the seat rules of
`cat.json`.

`docs/agents/rigging.md` gives the steps of a hand rig. The target of the form is the sheet
`docs/reference/cat-views.png`. The cat has the same pea eyes as the fox and the rabbit: the eye
objects of `cat.blend` place them.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `cat-tpose.glb` | Source mesh (below) | None |
| `cat-arms.glb` | Copy of `cat-tpose.glb` with rebuilt arms. License as `cat-tpose.glb` | `arm_rebuild.py` (below) |
| `cat-weights.json` | Weights of the same Blender run. License as `cat-tpose.glb` | The same run |
| `cat-root-weights.json` | `cat-weights.json` with more clavicle weight at the right armpit. License as `cat-tpose.glb` | `blender -b --factory-startup -P tools/blender/cat_root.py` |
| `cat.blend` | Made by hand in Blender from `cat-tpose.glb` (below). License as `cat-tpose.glb` | None: edit it in Blender |
| `cat.rig.glb` | Export of `cat.blend`. License as `cat-tpose.glb` | `pnpm rig-export cat` |
| `cat.rig.json` | Text summary of the export, for diffs | The same run |

## cat-tpose.glb

The new source mesh of the cat, in a T-pose: the arms are level and out to the sides, free of the
trunk. The mesh has no skeleton.

| Item | Value |
|---|---|
| Size | 16,839,588 bytes |
| SHA-256 | `0880377af85b14e01dd5985e3a53a35f88b2fa2c5e8901505488b510e66f4210` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,110 triangles and 4,386 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial`, double-sided, with a base color PNG (11,083,837 bytes) and a metallic-roughness PNG (5,595,156 bytes), each of 4096 × 4096 pixels |

The values below are in the units of the studio: 1 unit from the soles to the tips of the ears,
the soles at y = 0, +z forward, and +x the left side of the animal. The mesh faces +z. The weld is
at 1e-5.

- The weld gives 1,565 vertices in one connected part. 23 open edges and 21 edges with more than
  two faces remain. 213 faces have a corner angle below 10°.
- The box is x -0.475 to 0.474, y 0 to 1, and z -0.267 to 0.252. The cat is 1.9017 units of the
  file high from the soles to the tips of the ears. The top of the skull is at y 0.914.
- The cat stands upright on short legs, with the crotch at y 0.145. The trunk is narrow: 0.21 units
  wide at the waist (y 0.5). The cream belly goes from the chin to the crotch.
- The arms are level at y 0.598 and free of the trunk from x 0.13 out. The white paw starts at
  x 0.35, and each paw ends at x 0.474, with the pink pads and claws under it, so the palm faces
  down.
- The eyes are dark faces of the head surface at y 0.80 and z 0.20, with no shells. The pink nose
  is at y 0.75 and z 0.25. Thin whiskers stand out from the muzzle.
- The long tail hangs from the back of the haunch (y 0.26, z -0.06) down to y 0.09 behind the
  legs, and curls up behind to y 0.25 at z -0.27.

## cat-arms.glb and cat-weights.json

`tools/blender/arm_rebuild.py` rebuilds the free T-pose arms of `cat-tpose.glb` with quad tubes
at the length of the mesh (no `--factor`), and writes the Blender weights of the arms. The
shoulder line lies at 0.25 of the upper arm, and the wrist cut at 0.1 of the paw. Each arm has 14
rings of 16 vertices. The rings of each elbow lie 0.035 units from the elbow joint (`--spec`), and
the elbow helper is 0.07 units, twice that gap: with the gap of 0.0216 units that the script
chooses, the inner faces of each elbow turned over in each pose of the play and the rest. The
faces of the paws, the trunk, the legs, the tail, and the head are the faces of the source. The
points of `cat-weights.json` are the places of the source. A run gives the same bytes:

```bash
blender -b --factory-startup -P tools/blender/arm_rebuild.py -- cat --spec '{"gap": 0.035}'
```

| File | Size | SHA-256 |
|---|---|---|
| `cat-arms.glb` | 1,117,708 bytes | `534753ea563f0e71e438485a3b481535c26406b04571733aaf316f062f1cb6e2` |
| `cat-weights.json` | 443,443 bytes | `43c269c0e67de717f3637d84dfd22533fb7790118eb6596d7ca6cd889797a963` |

## cat-root-weights.json

The faces of each armpit (`rigidPainted`) take one mean weight, with 0.27 on the clavicle and 0.73
on the upper arm. In the recast violin, cello, flute, and clarinet holds, the right arm reaches
across the chest. The right armpit patch then swings to the front of the chest, and the cut of the
body at the arm root folds over the arm vertices beside it: the sweep measured them 2.2 cm to
2.6 cm in the body (design 9.3). `tools/blender/cat_root.py` gives the right patch the clavicle
share 0.52, so that it joins the body, and each other vertex of the right arm root with a clavicle
share of 0.1 to 0.32 at least 0.4, so that the weights fade to the arm. The places and the other
bones stay. The left side keeps its weights: with the same change, the rest folds of the left arm
of the violist grew from 3 to 6. A run gives the same bytes.

| File | Size | SHA-256 |
|---|---|---|
| `cat-root-weights.json` | 443,344 bytes | `55393f1a7fc16f38cd04299c4c4ed99035fd8b8ec37acda05ee6dec41713aa46` |

## cat.rig.glb

`pnpm rig-export cat` writes it from `cat.blend`, with the text summary `cat.rig.json`. A run gives
the same bytes.

| Item | Value |
|---|---|
| Size | 877,596 bytes |
| SHA-256 | `d0e770d1e7250d0da7910d42b5558c641d64d5baa892ab87a7c508d8d1d308a7` |
| Form | The head, the brow, the trunk, the arms, the paws, and the tail of the source (design 4.4, "Replacing body"). The thigh 1.6 and the shin 2.32 times as long, and both 1.5 times as wide, so that the cat sits on the chair of the cat of the A-pose mesh: the seat top is 0.300 m high, 0.46 m wide, and 0.343 m deep. The seated cat is 1.675 m high to the ear tips |
| Bind | The role-neutral bind of the Action `bind` (design 4.4): straight arms with the elbow axes of `hinges`, and the bind supination L 130 and R 81 |
| Faces | 4,382 triangles, of them 22 gloss (the nose) |
| Extras | `eyes`: the middle, the direction, and the size of each eye object. `body`: the facts of the body of the armature (below) |
| Shapes | The arm-down shape of each arm and the straight legs of each side, which the export calculates, and the keys `arm_raise_L`, `arm_raise_R`, `arm_raise_L2`, and `arm_raise_L3` of the elbows and the left wrist |
| Tail | In the seated bind, the root of the tail goes left along the back of the haunch, and the tail curls up beside the left hip on the seat. The footprint of the seated cat is 0.652 m deep and 0.704 m wide (0.633 m and 0.704 m on the rig of `rig-mesh`) |

## cat.blend

The rig of the cat, made by hand in Blender from `cat-tpose.glb` (design 4.4, "Hand rig"), with
the seated bind (the Action `bind`), its fix (the key `bind_sit`), the pea eyes, and the facts of
the body.

| Item | Value |
|---|---|
| Size | 352,950 bytes |
| SHA-256 | `1a98bb2473ebb843007fae33ab3fd3d44aaa0a7471d6aef77ce00043dcc3965a` |
| Origin | Made by hand in Blender 5.2 from `cat-tpose.glb` |
| License | CC BY-NC 4.0, as `cat-tpose.glb` |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the ear tips of the source, the soles at z = 0, the animal faces -y, and +x is its left side. The longer legs lift the body 0.1272 units, so the ear tips are at z = 1.1272. The mesh and the armature have no transform |
| Mesh | One object `cat`: the source welded at 1e-5, with flat faces and no custom normals, the edits below, and the surface of `add_surface()` of `tools/blender/studio_armature.py`: the face attributes `color` and `color_base`, and a gloss nose. The gloss fans of the eyes are removed. 2,201 vertices and 4,382 triangles, 22 of them gloss |
| Eyes | The objects `eye_L` and `eye_R` (`tools/blender/studio_eyes.py`), children of the bone `head`. In the bind, the origin of each is the middle of the eye on the head surface, its Z axis the direction of the eye, and its scale the head height `H` of the eye, 0.288572 units (0.458 m). Their meshes are previews of the eyes of the app. The eyes started at the places, the directions, and the size of the eyes that the rules of `pnpm studio-body` gave on `main` (1.35 times the share of the head, 0.05 `H` above the old eyes), and moved onto the smooth eye sockets (below) |
| Materials | The slots `fur` and `gloss`. Each reads the face attribute `color` |
| Armature | One object `cat_rig`: the 30 body bones, `tail_tip`, and the 20 arm segments and helpers, with the parents of `STUDIO_PARENTS`. The rest is the T-pose. The Z axis of each bone points to its hint. The Action `bind` holds the seated bind at frame 1 (below). The property `palm` is (0, 0, -1), `seat` is the chair of `cat.json` (front 0.1, back -0.087, half width 0.184), and `hinges` holds the elbow axes of `bind_hinges()` |
| Facts of the body | The properties of the armature (`BODY_FACTS` of `tools/studio-body.ts`), below |
| Shape keys | `Basis`, `bind_sit` and `bind_armpit` at the value 1, and `arm_raise_L`, `arm_raise_R`, `arm_raise_L2`, and `arm_raise_L3` at the value 0 (below), each with its custom property on the mesh. A body has at most 4 keys `arm_raise_*` (`STUDIO_RAISES`) |
| Weights | Automatic weights and the fixes below, at most 4 bones on each vertex. The upper arm, the forearm, and the forearm twist bone hold no weight |

The facts of the body:

- **`height` 1.152946.** The standing shoulder joints in the app, in meters: the joints of the
  mesh, raised 0.1272 units by the longer legs. Thus the head height `H` stays the `H` of the cat
  of the A-pose mesh, 0.339 m (1.588737 m for each unit).
- **`crease` 35.** The crease angle of the fur, in degrees.
- **`seatWidth` 0.46 and `backRoom` 0.052.** The cat sits on the chair of the cat of the A-pose
  mesh: 0.46 m wide, and 0.343 m deep with the back room. The haunch is 0.53 m wide, so it reaches
  a little past the sides of the seat.
- **`headFloor` 0.827.** The tips of the lower whiskers hang below the chin and follow the head,
  so the head measures start at the chin, 0.827 units high after the rise of the legs.

The seated bind:

- **Bones.** The turns of `bind_turns()` of `tools/blender/rig_mesh.py` with the seat rules of
  `tools/mesh-rigs/cat.json`: the thighs slope 25° down and 1° out, the shins are vertical, the
  trunk leans 1.26° back (the hip angle opens 1°), and the arms are straight at the bind upper arm
  of `bindArms`. The paws turn toward supination, the left 130° and the right 81°, the values of
  `pnpm bind-supination cat` on this rig, and the arm segments and the helpers turn by the rule of
  the app (`drive_segments()` of `tools/blender/studio_armature.py`). These values live only in
  the Action `bind`.
- **Tail.** The root bone goes left and down along the back of the haunch, as `tailBind` of
  `cat.json` gives it: (0.858, -0.504, 0.101) in the studio axes of the source. The tip bone keeps
  the curl of the mesh (104° from the root bone). It turns with the root bone, then 60° about it,
  to (0.286, 0.927, -0.243). Thus the tail lies on the seat at the back of the left hip and curls
  up beside it, in front of the back post. With no turn about the root bone, the tip points back
  past the chair, and with 100°, it goes into the hip.
- **`bind_sit`.** `sit()` of `rig_mesh.py` lowers the underside of the haunch behind the hip
  joints onto the seat (the rule `sit` of `cat.json` with `most` 0.07 and no `top`).
  `crease_relax()` then smooths the crease of the belly and the thighs (the rule `crease`), and a
  second `sit()` (`most` 0.03, `top` the seat top of the bind) puts the haunch back on the seat.
  The key is this move of the bind, turned back into the rest by the inverse of the blended skin
  of each vertex. 236 vertices move, at most 16.4 cm in the bind. From the side, the underside
  behind the hip joints was up to 15.8 cm above the seat before, and 2.9 cm after. The seat top
  stays 0.300 m.
- **`bind_armpit`.** With a hanging upper arm, the rigid patch under each arm root (the fix
  "Armpits" below) swings into the chest, and a notch shows at the front and the back of the arm
  root. The fix in the hanging pose: the patch and three rings of its neighbors take the skin of
  their weights after 12 rounds of Smooth, and the vertex of the back notch goes onto the line of
  its two neighbors. The pose is a copy of the rig whose rest is the bind, so that the skin blends
  from the bind as in the app, with each upper arm turned the least way to hang down (54° from
  the bind). The key holds half of that fix, moved back into the bind by the inverse of the skin
  of the pose, at most 2.9 cm. Half makes the notch smaller and keeps the arm gate. The whole fix
  (5.8 cm in the bind) cut a deeper notch at the back of the left arm root and failed the arm
  gate. As a bind key, the fix uses none of the 4 keys `arm_raise_*`.
- **Raise keys.** `raise_shape()` of `tools/blender/rig_mesh.py` relaxes the faces that fold in
  the pose of a rule, on the bind of this rig. The rule is the output of `pnpm raise-fit` for the
  folded faces, the key is the move of the bind turned back into the rest by the inverse of the
  blended skin, and the property holds the turn of the key bone of the rule (w, x, y, z, Blender
  axes) and the fade. A hand edit of a key starts from these:

  | Key | Bone | Rule (`pnpm raise-fit`) | Turn | Fade |
  |---|---|---|---|---|
  | `arm_raise_L` | forearm | `violist`, the 11 folded faces of the left inner elbow, sets play: the elbow 90° from the bind | 0.7067, -0.5146, -0.4761, -0.0958 | 10° to 35° |
  | `arm_raise_R` | forearm | `violist`, the 8 folded faces of the right inner elbow, sets rest: the elbow 112° from the bind | 0.5621, -0.6051, 0.5488, 0.1297 | 10° to 35° |
  | `arm_raise_L2` | hand | `violist`, the 2 folded faces of the left wrist, sets play: the paw 95° from the forearm | 0.6062, -0.6229, 0.3503, 0.3491 | 15° to 25° |
  | `arm_raise_L3` | forearm | `trumpeter@cat`, the 11 folded faces of the left inner elbow, sets rest: the elbow 123° from the bind | 0.4788, -0.6437, -0.5789, -0.1455 | 10° to 20° |

The joints are the joints of `tools/mesh-rigs/cat.json`, except the arm joints, which come from
sections of the mesh, and the bend of the tail:

- **Shoulder** (0.085, 0.5985, 0.087): on the axis of the upper arm, 0.035 units inside the line
  where the arm leaves the trunk.
- **Elbow** (0.247, 0.5985, 0.090): where the center line of the arm bends forward (the back line
  bends at x 0.24, the front line at x 0.27).
- **Wrist** (0.372, 0.5985, 0.113): the narrowest section of the arm, at the middle of the gray
  to white blend of the paw. The forearm twist bone starts halfway between the elbow and the
  wrist.
- **Tail bend** (0, 0.122, -0.15): the middle of the tail tube at the bottom of its curl.

The fixes of the weights:

- **Thighs.** No thigh weight above y 0.21, then 6 rounds of Smooth from y 0.14 to 0.24. The
  automatic weights gave the thighs the lower belly and the back of the haunch up to y 0.28, so a
  sit pulled the belly into folds.
- **Armpits.** The 19 vertices under each arm root (|x| 0.09 to 0.135, y 0.525 to 0.59, z 0 to
  0.16) take one mean weight, so that they move as one rigid patch. A hanging arm folded them.
- **Shoulder tops, face, ears.** No head weight on the shoulder tops (|x| above 0.075, y below
  0.665), no neck weight above y 0.715, and no ear weight below y 0.865, each with a short Smooth
  of its edge. The 85 vertices of the whiskers take the head bone alone.
- **Tail root.** No tail weight on the body in front of z 0.01 or on the lower back above y 0.31,
  then a Smooth of the root band.
- **Paws.** No wrist helper or forearm segment beyond |x| 0.395, a short Smooth of the wrist band,
  and the fingers keep half of their weight (`weights.fingers` of `cat.json`).
- **Finger tips.** The 3 vertices of the paw tips with the fingers bone alone take hand 0.5 and
  fingers 0.5, as the other paw vertices. A face at the right paw tip folded in each sample of the
  bow grip.
- **Elbows.** 4 rounds of Smooth on the band of each elbow (|x| 0.20 to 0.30 of the source), so
  that the bend spreads over more rings. The inner elbow folded at small bends, as at the rest of
  `trumpeter@cat`.
- **Slivers.** Each group of faces with a corner below 4° on a forearm (18 faces in 8 groups,
  most of them from the forearm rings) takes one mean weight, and the 5 vertices of a sliver at
  the left wrist that is thin only in the bind too. A thin face with corners of different
  weights turned over in each sample of the play.

The places above are places of the source, before the legs lift the body. The edits of the mesh,
in the studio axes of the sections above (y up, z forward):

- **Rings.** Ten planar edge rings go across each arm, so that the arm bends and twists over more
  vertices: three at the shoulder (x 0.13, 0.155, 0.18), three at the elbow (0.222, 0.247,
  0.272), two along the forearm (0.297, 0.323), and two at the wrist (0.35, 0.372). The ring at
  0.372 lies at the middle of the gray to white blend of the paw. Each plane is at a right angle
  to the arm axis, and it cuts only the arm faces (y 0.52 to 0.68, |x| above 0.10). Each new
  vertex lies on an old edge, with the mix of the UVs of the edge ends, so the surface and the
  colors stay. An old vertex less than 0.005 units from a plane joins the ring, so that the cut
  makes no thin face.
- **Eye sockets.** Each old eye of the mesh is an almond eyeball in a groove. The faces had the
  fur color, but the groove and the corners of the almond faced away from the light, so a black
  almond showed around each pea eye. 47 vertices of the eyeballs, the grooves, and the inner
  corners (an ellipse of 0.042 by 0.03 units around each old eye, grown by 1.25, within 0.03
  units of its plane) take 10 rounds of the Smooth of Blender with the factor 0.5, with the ring
  around them fixed, and each shape key takes the same move. A vertex moves at most 0.021 units.
- **Brow.** 21 vertices of the sharp edges of the brow above each eye move toward the mean of
  their neighbors, at most 0.01 units, with the rule of `softened()` of
  `tools/blender/rig_mesh.py` (edges above 20°, a share of 0.5, 10 rounds). The box is |x| 0.015
  to 0.10, y 0.832 to 0.88, and z 0.17 to 0.24, and the vertices below y 0.83 stay. The sharp
  edges shade dark slashes above the black pea eyes of the app, which read as a worried brow. A
  box from y 0.81 also moves the upper lids, and the eyes then look tired.
- **Forearm rings.** Three more planar rings go across each forearm, halfway between the rings
  above (x 0.2845, 0.31, and 0.3365 of the source), with the rule of the rings (a snap of 0.005
  units). Each new vertex takes the mix of the weights, the UVs, and the shape keys of its edge
  ends. With the long faces of the forearm, the twist of the play stretched the left forearm
  twice as much as on the rig of `rig-mesh` (stretch p95 0.12, 0.06 on main).
- **Colors.** The plain fur takes the move of `colors.tone` of `cat.json` (`tone()` of
  `tools/blender/rig_mesh.py`), as in the rig of `pnpm rig-mesh`: 2,974 faces move in Oklab toward
  the gray blue of the cat of the A-pose mesh. The face attributes `color` and `color_base` hold
  the result. With the colors of the texture alone, the fur is brown in the light of the stage.
- **Legs.** Each thigh is 1.6 times and each shin 2.32 times as long as on the source, along the
  axis of its bone, and each foot keeps its size (the rule of `stretch()` of
  `tools/blender/rig_mesh.py`). Before the stretch, the thighs and the shins are 1.5 times as
  wide across their axes (`leg_girth()`). The body above the hips joint rises 0.1272 units, so
  that the soles stay at z = 0, and the bones move with the mesh. Thus the seated cat sits on the
  chair of the cat of the A-pose mesh: with the seat rules of `cat.json` and 1.588737 m for each
  unit, the seat top is 0.300 m high (0.151 m with the legs of the source), the thigh is 0.205 m
  long, and the shin 0.222 m. The wider legs keep the hip width (0.53 m) and the shin width
  (0.14 m) of the cat of `pnpm rig-mesh`. Long legs with the width of the source look thin.

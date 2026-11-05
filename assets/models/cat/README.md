# Cat model

This folder holds the T-pose source mesh of the cat, the rig made by hand in Blender
(`cat.blend`), and the rigged copy that the export writes from it. The app does not serve these
files. It loads the module `src/models/studio/cat.ts`, which this chain writes:

```text
tripo/cat-tpose.fbx                source mesh with quad faces
   │  work by hand in Blender (design 4.4, "Hand rig")
   v
cat.blend                          mesh, face colors, armature, weights, eyes, bind, keys
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
export (design 4.4, "Hand rig").

`docs/agents/rigging.md` gives the steps of a hand rig. The target of the form is the sheet
`docs/reference/cat-views.png`. The cat has the same pea eyes as the fox and the rabbit: the eye
objects of `cat.blend` place them.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `cat-tpose.glb` | Source mesh (below) | None |
| `tripo/cat-tpose.fbx`, `tripo/cat-tpose.fbm/` | Source mesh with quad faces, and its four textures (below) | None |
| `cat-arms.glb` | Copy of `cat-tpose.glb` with rebuilt arms. License as `cat-tpose.glb` | `arm_rebuild.py` (below) |
| `cat-weights.json` | Weights of the same Blender run. License as `cat-tpose.glb` | The same run |
| `cat-root-weights.json` | `cat-weights.json` with more clavicle weight at the right armpit. License as `cat-tpose.glb` | `blender -b --factory-startup -P tools/blender/cat_root.py` |
| `cat.blend` | Made by hand in Blender from `tripo/cat-tpose.fbx` (below). License as the FBX file | None: edit it in Blender |
| `cat.rig.glb` | Export of `cat.blend`. License as the FBX file | `pnpm rig-export cat` |
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

## tripo/cat-tpose.fbx

A retopology of `cat-tpose.glb` with Tripo: the same cat in the same T-pose, with quad faces in
even rings around the arms and the tail. The FBX file keeps the quads (a GLB file of the same
mesh holds only triangles). The folder `cat-tpose.fbm/` holds its textures, and the FBX file
links them by name.

| Item | Value |
|---|---|
| Origin | Made with Tripo (a retopology of `cat-tpose.glb`) by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary |
| Contents | One mesh object `output_unwrapped`, turned 90° about X (the FBX axes have Y up), with no armature and no animation. 2,999 vertices and 3,213 faces: 2,760 quads and 453 triangles (5,973 triangles). One UV layer. One material that links the four textures |
| Parts | The body (2,756 vertices) and 5 whisker strands (243 vertices, 465 triangles). The body has 10 open edges: a slit of 8 edges under the nose, and 1 edge at the outer corner of each eye, where a small extra triangle lies over the surface. 1 whisker has 2 open edges |
| Box | After the turn: x ±0.4756, y ±0.2588, and z 0 to 0.998 in the units of the file. The cat faces -y |

| File | Size | Pixels | SHA-256 |
|---|---|---|---|
| `cat-tpose.fbx` | 275,552 bytes | | `92e23f4c5440b892e29e1f61f988f90660f0cbd33ccf2f750e5605e7c8e8ca32` |
| `cat-tpose.fbm/cat-tpose_basecolor.jpg` | 1,110,790 bytes | 4096 × 4096 | `6eb0f2d260b83001dbe886f4bbf946a0ab4a2e32d42636896452080150672924` |
| `cat-tpose.fbm/cat-tpose_metallic.jpg` | 332,266 bytes | 2048 × 2048 | `f364d55404a594c11f5b68fc5d4148547af075c7ff53fef22313deb61c5ce52c` |
| `cat-tpose.fbm/cat-tpose_normal.jpg` | 694,704 bytes | 2048 × 2048 | `3ffdb62a5d31aae713042e474d4089fc6d31273c8463d99c3a8c72574b853bce` |
| `cat-tpose.fbm/cat-tpose_roughness.jpg` | 184,077 bytes | 2048 × 2048 | `b6d74c6f642d089bd8ffd75ec9b739257ae814e41e1c42e76e3ba97c6ce37c7d` |

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
| Size | 834,508 bytes |
| SHA-256 | `12c1f9afbe48556893f1f9929f92af83e8955066f546b7c18126204be7c8c2c2` |
| Form | The mesh of `cat.blend` in its seated bind (below). The seat top is 0.301 m high, and the chair is 0.46 m wide and 0.343 m deep, as the chair of the cat of the A-pose mesh |
| Faces | 6,151 triangles, of them 65 gloss (the nose) |
| Extras | `eyes`: the middle, the direction, and the size of each eye object. `body`: the facts of the body of the armature |
| Shapes | The arm-down shape of each arm and the straight legs of each side, which the export calculates, and the keys `arm_raise_R` and `arm_raise_L` of the inner elbows |
| Footprint | The seated violist is 0.673 m deep and 0.708 m wide (0.652 m and 0.704 m with the rig of commit 7c9e8074). The feet reach 1.7 cm further forward, and the tail 0.4 cm past the back of the chair |

## cat.blend

The hand rig of the cat (design 4.4, "Hand rig"), made in Blender 5.2 from `tripo/cat-tpose.fbx`:
the mesh, the colors, the armature, the weights, the pea eyes, the seated bind (the Action
`bind`), its keys, and the facts of the body.

| Item | Value |
|---|---|
| Size | 379,174 bytes |
| SHA-256 | `8594950bf9f9b46df21bd985d2945fd73e9d678ccdb1c1be1f23ba9bbef978b0` |
| Origin | Made by hand in Blender 5.2 from `tripo/cat-tpose.fbx` |
| License | CC BY-NC 4.0, as the FBX file |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the ear tips of the source, the soles at z = 0, the animal faces -y, and +x is its left side. The longer legs lift the body 0.1227 units, so the ear tips are at z = 1.1227. No object has a transform |
| Mesh | One object `cat`: the FBX mesh with the turn of the file applied and the scale 1.001957, with flat faces and no custom normals, the edits below, and the surface of `add_surface(..., eye_fans=False)` of `tools/blender/studio_armature.py` with the base color JPEG: the face attributes `color` and `color_base` and a gloss nose. 3,090 vertices and 3,344 faces (2,807 quads and 537 triangles, 6,151 triangles), 35 faces of them gloss |
| Eyes | The objects `eye_L` and `eye_R` (`tools/blender/studio_eyes.py`), children of the bone `head`, with the size (0.288572 units) and the direction (±0.6219, -0.7827, 0.0208) of the eyes of the old `cat.blend`. Each middle lies on the smooth eye socket, where the axis meets the head surface. `fit_eyes()` levels them in the bind, with the middles at (±0.0756, -0.1959, 0.9325) |
| Materials | The slots `fur` and `gloss`. Each reads the face attribute `color` |
| Armature | One object `cat_rig`: the 30 body bones, `tail_tip`, and the 20 arm segments and helpers, with the parents of `STUDIO_PARENTS`, the rest in the T-pose, and the properties `palm` (0, 0, -1), `seat`, `hinges`, and the facts of the body (below). The Z axis of each bone points to its hint (`fix_rolls()`). The Action `bind` holds the seated bind at frame 1 (below) |
| Shape keys | `Basis`, `bind_sit` and `bind_tail` at the value 1, and `arm_raise_R` and `arm_raise_L` at the value 0 (below), each with its custom property on the mesh. A body has at most 4 keys `arm_raise_*` (`STUDIO_RAISES`) |
| Weights | Automatic weights and the fixes below, at most 4 bones on each vertex, each sum 1. The upper arm, the forearm, the forearm twist bone, and `root` hold no weight |

The seated bind and its keys, in the studio axes of the bind (x left, up, forward):

- **Bones.** The turns of `bind_turns()` of `tools/blender/rig_mesh.py` with the seat rules of
  `tools/mesh-rigs/cat.json`: the thighs slope 25° down and 1° out, the shins are vertical, the
  trunk leans 1.26° back, and the arms are straight at the bind upper arm of `bindArms`. The paws
  turn toward supination, the left 132° and the right 89°, the values of `pnpm bind-supination
  cat` on this rig, and `drive_segments()` turns the arm segments and the helpers. With the 130°
  and 81° of the old file, the arm gate of the violist gave the paw twist p95 L 101 and R 72 and
  the move twist max L 102 and R 75, and with these values 99, 64, 100, and 67. The tail bones lie along the curve of `bind_tail`: the root bone on
  (0.9925, -0.0112, -0.1214) and the tip bone on (0.6517, -0.7579, -0.0291).
- **Hips bone.** The tail of the hips bone lies on the line of the thighs, up and 2° forward (8°
  at the spine joint before). Blender stores the frame of a bone about 6° off the line of its
  parent with a shear of 5e-5 (the series of `vec_roll_to_mat3_normalized()` near the -Y axis),
  and the export stops above 1e-5. The joints keep their places.
- **`bind_sit`.** `sit()` of `rig_mesh.py` lowers the underside of the haunch behind the hip
  joints onto a seat top 0.300 m above the soles (the rule `sit` of `cat.json` with `most` 0.07
  and that top), `crease_relax()` smooths the crease of the belly and the thighs (the rule
  `crease`), and a second `sit()` (`most` 0.03) puts the haunch back on the seat. The key is this
  move of the bind, turned back into the rest by the inverse of the blended skin of each vertex.
  301 vertices move, at most 15.9 cm. From the side, the underside behind the hip joints was up to
  8.8 cm above the seat, and 1.1 cm after.
- **`bind_tail`.** The tail lies on the seat behind the haunch and hangs over the left side of the
  seat in front of the left back post, as a seated cat lets its tail hang off a stool. Each vertex
  with a tail weight keeps its arc length along the middle line of the rest tail and its offset
  across the line, and the line follows a curve through 8 points: down from the root onto the
  seat, left along the back of the haunch, over the side edge, and down. The root on the back of
  the haunch drops with 0.4 of the drop of `bind_sit` around it, the bend fades in over 0.03
  units of the line, and 25 rounds of a Smooth within 0.08 units of a point 0.03 units above the
  root take away the knob of the root. The key holds the move from the blended skin, at most
  13.9 cm. The tail passes 0.8 cm in front of the left back post and 0.4 cm behind the back of
  the seat. Two tail bones with the old curl beside the hip made a lump at the hip and a knot on
  the seat.
- **No `bind_armpit`.** In the hanging pose of the old key (each upper arm 54° down from the
  bind), its fix (the patch under the arm root and three rings with the skin of their smoothed
  weights) changes no 2x crop of the arm roots, so the file has no such key.
- **Raise keys.** `raise_shape()` of `rig_mesh.py` relaxes the faces that fold in the pose of a
  rule, on the bind. The rule is the output of `pnpm raise-fit violist --sets rest,play --bone
  forearm` for the folded faces of `pnpm fold-probe violist`, the key is the move of the bind
  turned back into the rest by the inverse of the blended skin, and the property holds the turn
  of the forearm (w, x, y, z, Blender axes) and the fade:

  | Key | Folded faces | Elbow from the bind | Turn | Fade | Folds in the pose |
  |---|---|---|---|---|---|
  | `arm_raise_R` | 5 of the right inner elbow, folded in each sample of the rest and the play | 102° | 0.6273, -0.5762, 0.5142, 0.1004 | 10° to 20° | 7 to 2 |
  | `arm_raise_L` | 4 of the left inner elbow | 90° | 0.7063, -0.5215, -0.4721, -0.0799 | 10° to 20° | 5 to 0 |

  The rules of the fronts of the armpits (the upper arm 66° and 29° from the bind) turn over no
  face in the pose of Blender, so their keys moved less than 0.3 mm and the file has none.

The facts of the body:

- **`height` 1.148228.** The standing shoulder joints in the app, in meters: the joints of the
  mesh, raised 0.1227 units by the longer legs. Thus the scale stays 1.588737 m for each unit.
- **`crease` 35.** The crease angle of the fur, in degrees.
- **`seatWidth` 0.46 and `backRoom` 0.075.** The chair of the cat of the A-pose mesh: 0.46 m wide
  and 0.343 m deep. With the room of the old file (0.052 m), the chair is 0.312 m deep, because
  the back above the root of the tail is the back of the body.
- **`headFloor` 0.8214.** The head measures start at the chin height of the old file, so that the
  head height `H` stays 0.339 m. The underside of the jaw of the FBX mesh lies 0.017 units
  (2.7 cm) lower, and with it `H` is 0.367 m, which moves each hold in `H`.

The property `seat` is the chair of `cat.json` (front 0.1, back -0.087, half width 0.184), and
`hinges` holds the elbow axes of `bind_hinges()`.

The joints, in the studio axes of the source (x, up, forward), before the stretch of the legs:

- **Trunk and head.** The joints of `tools/mesh-rigs/cat.json`, with the head end on the top of
  the skull (0, 0.9119, 0.08) and the ear tips (±0.155, 0.998, 0.163).
- **Arm.** The shoulder (0.085, 0.600, 0.094) on the axis of the upper arm. The elbow
  (0.2413, 0.5997, 0.0956) is the middle of the ring at x 0.2413: the center lines of the upper
  arm and of the forearm meet at x 0.232. The wrist (0.3795, 0.5992, 0.1254) is the middle of the
  ring at x 0.3795, on the color line of the paw. The fingers go from (0.445, 0.588, 0.137) to
  the paw tip (0.4765, 0.590, 0.137).
- **Leg.** The hip (0.093, 0.185, 0.08), the knee (0.0934, 0.1059, 0.0773) on the middle knee
  ring, the ankle (0.099, 0.048, 0.078) on the color line of the foot, and the toes from
  (0.115, 0.018, 0.13) to (0.118, 0.008, 0.168).
- **Tail.** The root (0, 0.215, -0.035), the bend (0, 0.125, -0.16), and the end
  (0, 0.245, -0.222), each in the middle of the tail tube on a cut at x = 0.

The edits of the mesh, in the order of the work:

- **Import.** No vertices merge at 1e-5. The 2 extra triangles at the outer corners of the eyes
  lay over the surface, each with one open edge and two edges of three faces: they go. 8 open
  edges remain in a slit under the nose (the nostrils, a part of the form), and 2 on one whisker.
- **Arm rings.** The arm had a ring every 0.035 units (about 0.8 arm radii) from x 0.172 to
  0.353, then at 0.380, 0.390, and 0.400. A loop cut halfway between each two rings from x 0.206
  to 0.380 (x 0.2235, 0.2586, 0.2958, 0.3344, 0.3662) gives rings about 0.4 radii apart, with
  5 rings within one radius of the elbow and of the wrist. The cut at x 0.189 is not done: the ring
  at x 0.172 is not planar, and the cut made a half ring. Each new vertex lies on an old edge,
  with the mix of the UVs. A quad gives two quads, and a triangle a triangle and a quad.
- **Knee rings.** The knee had 3 rings of 9 and 10 vertices (up 0.126, 0.106, 0.080) in an
  irregular thigh. Two loop cuts at 0.116 and 0.093 give 5 rings within one leg radius. The
  thigh above them keeps the flow of the source.
- **Ankle line.** A planar cut at up 0.048 goes around each foot, where the texture goes from the
  gray fur to the white paw (the middle lightness). Each face of five corners that a cut made
  splits into a quad and a triangle (2 at the knees, 4 at the ankles).
- **Colors.** One color line at each wrist and each ankle: the faces on the arm side of the ring
  at x 0.380, and above the ankle cut, take the main fur color of the forearm or of the shin, and
  the gray faces on the other side take the white of the paw. The pink pads keep their colors.
  Then the plain fur takes the move of `colors.tone` of `cat.json` (`tone()` of
  `tools/blender/rig_mesh.py`), with the paws and the feet beyond the lines kept: 2,208 faces.
- **Eye sockets.** Each old eye of the mesh is a ball with a textured eye in a groove. 54 and 55
  vertices in an ellipse of 0.0525 by 0.0375 units around the pupil (in the plane of the eye,
  within 0.03 units of it) take 10 rounds of the Smooth of Blender with the factor 0.5, with the
  ring around them fixed. A vertex moves at most 0.0174 units. No dark almond shows around the
  pea eyes (`reports/2026-11-04-cat2/face/`).
- **Brow.** 15 vertices of the sharp edges above the eyes move toward the mean of their
  neighbors, at most 0.010 units, with the rule and the box of the old file (edges above 20°,
  |x| 0.015 to 0.10, up 0.832 to 0.88). The bridge of the nose made a slanted edge of 46° above
  each inner eye corner.
- **Legs.** First an even offset outward from the bone axes, so that the bulge of the haunch keeps
  its form: the thigh grows 0.044 units, faded in from 1.0 thigh lengths above the hip joint to
  0.2 below it, and the shin grows 0.044 units at the knee, 0.027 at its middle, and 0 at the
  ankle. The back of the thigh keeps its place, and near the crotch the inner side keeps its
  place and the outer side grows 1.15 times. A factor across the axes made sharp fins at the
  outer haunch and a ledge where the thigh met the belly, in the rest and in the bind. Then the
  thigh is 1.6 and the shin 2.30 times as long along its bone, and each foot keeps its size
  (`stretch()` of `rig_mesh.py`, by the leg weights). The body rises 0.1227 units, and the bones
  move with the mesh.
- **Whiskers.** The Decimate of Blender (collapse, ratio 0.4) on the 5 whisker strands only
  takes them from 243 vertices and 465 triangles to 94 vertices and 165 triangles. The 2x face
  crops show the same whiskers with fewer bends.

The legs, in meters (1.588737 m for each unit), with the old file in parentheses: in the
seated bind of the seat rules of `cat.json`, the seat top is 0.3010 m (0.3002 m), the thigh is
0.201 m (0.205 m) and the shin 0.213 m (0.222 m) long, and the seated cat is 1.651 m (1.675 m)
high. The shin factor is 2.30, because 2.32 put the seat top at 0.3025 m. In the rest, the mid
thigh is 0.571 and the mid shin 0.399 of the width of the head at the eyes (0.439 and 0.290; the
source 0.304 and 0.22), and the hips are 0.625 m wide (0.539 m).

The fixes of the weights, in the studio axes of the source:

- **Thighs.** No thigh weight above up 0.20, then 12 rounds of Smooth from up 0.10 to 0.25.
- **Head, neck, ears, whiskers.** No head weight on the shoulder tops (|x| above 0.075, up below
  0.665), no neck weight above up 0.715, and no ear weight below up 0.865, each with 2 rounds of
  Smooth of its edge. The gloss nose and the vertices of the whiskers take the head bone alone.
- **Tail root.** No tail weight on the body in front of forward 0.01 or above up 0.31, then 3
  rounds of Smooth of the root band.
- **Paws.** No wrist helper or forearm segment beyond |x| 0.4025, 2 rounds of Smooth of the wrist
  band (|x| 0.36 to 0.41), and the fingers keep half of their weight. The 6 vertices on the
  fingers bone alone take hand 0.5 and fingers 0.5.
- **Elbows.** 8 rounds of Smooth on the band of each elbow (|x| 0.19 to 0.30), then 30 rounds on
  the front half of the band (forward above 0.09, |x| 0.19 to 0.31), where the forearm bends in.
- **Shoulders.** 6 rounds of Smooth on the arm roots (|x| 0.08 to 0.19), then the 7 vertices
  under each arm root (|x| 0.09 to 0.135, up 0.525 to 0.59, forward 0 to 0.16) take one mean
  weight.
- **Crotch.** After the leg stretch, 16 rounds of Smooth on the vertices of the front with a
  thigh share of 0.02 to 0.98 and |x| below 0.11.
- **Armpit slivers.** 3 triangles under the arm roots, one on the left and two on the right, have
  a corner above 165° in the bind. Their corners take one mean weight, so that each moves as one
  piece. Each turned over in each sample of the play of the violist.

The folds of the test poses of the last round (arms down 80°, the elbow at 90° and 130°, the bow
arm, the sit with the thigh at 90°): the triangles whose normal turns more than 60° and more
than 90° from the turn of the main bone of their face. The old file had a mesh of triangles, so
both count triangles. The sit of the old file had the legs of the source. The column with the
legs of the source has no crotch fix.

| Pose | Old file | This file, legs of the source | This file, long legs |
|---|---|---|---|
| Arms down | 12 / 6 | 14 / 1 | 14 / 1 |
| Elbow 90° | 29 / 24 | 28 / 7 | 28 / 7 |
| Elbow 130° | 50 / 33 | 47 / 15 | 47 / 15 |
| Bow | 39 / 24 | 33 / 17 | 33 / 17 |
| Sit | 26 / 14 | 21 / 14 | 28 / 12 |

The forearm turns of ±90°, the head turn of 30°, and the tail swing fold no triangle.

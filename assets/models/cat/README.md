# Cat model

This folder holds the T-pose source mesh of the cat, a copy with rebuilt arms and its weights,
the rigged copy, and a rig made by hand in Blender (`cat.blend`). The app does not serve these
files. It loads the module
`src/models/studio/cat.ts`, which this chain writes:

```text
cat-tpose.glb                      source mesh (`armSource` of tools/mesh-rigs/cat.json)
   │  tools/blender/arm_rebuild.py rebuilt arms and painted weights
   v
cat-arms.glb + cat-weights.json    `source` of tools/mesh-rigs/cat.json
   │  tools/blender/cat_root.py    more clavicle weight at the right armpit
   v
cat-root-weights.json              `paintedWeights` of tools/mesh-rigs/cat.json
   │  pnpm rig-mesh cat
   v
cat.rig.glb                        rigged mesh
   │  pnpm studio-body cat
   v
src/models/studio/cat.ts           studio body of the app
```

`docs/agents/rigging.md` gives the steps of the chain. The target of the form is the sheet
`docs/reference/cat-views.png`. The cat has the same bead eyes as the fox and the rabbit.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `cat-tpose.glb` | Source mesh (below) | None |
| `cat-arms.glb` | Copy of `cat-tpose.glb` with rebuilt arms. License as `cat-tpose.glb` | `arm_rebuild.py` (below) |
| `cat-weights.json` | Weights of the same Blender run. License as `cat-tpose.glb` | The same run |
| `cat-root-weights.json` | `cat-weights.json` with more clavicle weight at the right armpit. License as `cat-tpose.glb` | `blender -b --factory-startup -P tools/blender/cat_root.py` |
| `cat.rig.glb` | Output of the rig. License as `cat-tpose.glb` | `pnpm rig-mesh cat` |
| `cat.blend` | Made by hand in Blender from `cat-tpose.glb` (below). License as `cat-tpose.glb` | None: edit it in Blender |

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

| Item | Value |
|---|---|
| Size | 820,144 bytes |
| SHA-256 | `cf530ae52a410a05e4bcf71db492d64340019df2b5c54511cb437fabe33d716e` |
| Form | The head, the brow, the arms, the paws, and the tail keep the form of the source (design 4.4, "Replacing body"). The thigh 1.6 and the shin 2.4 times as long as on the source (`legFactor`, `shinFactor`), so that the cat sits on the chair of the cat of the A-pose mesh: the seat top is 0.299 m high (`sit.top`), 0.46 m wide, and 0.343 m deep. The thigh 1.7 and the shin 1.25 times as thick (`legGirth`), so that the long legs keep more of the stocky look of the legs of the source. The trunk from the hips joint to the chest joint is 0.6 times as long (`trunkFactor`, `trunkTop`), so that the trunk from the hips joint to the neck joint is 1.61 H (2.23 H on the source). The seated cat is 1.45 m high to the ear tips. A flatter and narrower belly, a deeper chest, narrow shoulders (the shoulder joints 0.238 m apart), and a straight back into the neck (`girthProfile`); and the thighs 1 degree out in place of 8, so that the legs are close and parallel from the front (`studio.legTurns`) |
| Bind | The role-neutral bind (design 4.4): the arms of the source, straight (`studio.straightArms`), with the elbow axes of the bent bind of `studio.bindArms`, and the bind supination L 150 and R 90 (`studio.bindSupination`) |
| Faces | 3,926 triangles: 3,902 of the body and the eye shells, of them 46 gloss |
| Shapes | The arm-down shape of each arm, the straight legs of each side, and four `raise` shapes: the bent left elbow at rest (two), the bow arm in the play, and the bent right elbow at rest |
| Tail | In the seated bind, the root of the tail goes left along the back of the haunch, and the tail hangs over the left side of the seat in front of the left back post (`studio.tailBind`), 2.4 cm from the post. The bend between the two tail bones spreads over 0.07 units on each side (`weights.tail.bend`). The tail keeps its curl in the standing body. The footprint of the seated cat is 0.633 m deep and 0.704 m wide |

A run of `pnpm rig-mesh cat` gives the same bytes.

## cat.blend

The rig of the cat, made by hand in Blender from `cat-tpose.glb` (design 4.4, "Hand rig"), with
the seated bind (the Action `bind`) and its fix (the key `bind_sit`).

| Item | Value |
|---|---|
| Size | 317,045 bytes |
| SHA-256 | `d4e0332daae65384e7f73ef1d61f51e1a587a83ec950dba741e4116616f57cb8` |
| Origin | Made by hand in Blender 5.2 from `cat-tpose.glb` |
| License | CC BY-NC 4.0, as `cat-tpose.glb` |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the ear tips of the source, the soles at z = 0, the animal faces -y, and +x is its left side. The longer legs lift the body 0.1272 units, so the ear tips are at z = 1.1272. No object has a transform |
| Mesh | One object `cat`: the source welded at 1e-5, with flat faces and no custom normals, the edits below, and the surface of `add_surface()` of `tools/blender/studio_armature.py`: the face attributes `color` and `color_base`, a gloss fan of 12 triangles on each eye, and a gloss nose. 2,018 vertices and 3,988 triangles, 46 of them gloss |
| Materials | The slots `fur` and `gloss`. Each reads the face attribute `color` |
| Armature | One object `cat_rig`: the 30 body bones, `tail_tip`, and the 20 arm segments and helpers, with the parents of `STUDIO_PARENTS`. The rest is the T-pose. The Z axis of each bone points to its hint. The Action `bind` holds the seated bind at frame 1 (below). The property `palm` is (0, 0, -1), `seat` is the chair of `cat.json` (front 0.1, back -0.087, half width 0.184), and `hinges` holds the elbow axes of `bind_hinges()` |
| Shape keys | `Basis`, `bind_sit` at the value 1, and `arm_raise_L` and `arm_raise_R` at the value 0 (below), each with its custom property on the mesh |
| Weights | Automatic weights and the fixes below, at most 4 bones on each vertex. The upper arm, the forearm, and the forearm twist bone hold no weight |

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
- **`arm_raise_L`, `arm_raise_R`.** With a hanging upper arm, the rigid patch under each arm
  root (the fix "Armpits" below) swings into the chest, and a notch shows at the front and the
  back of the arm root. Each key holds the fix of one side in the hanging pose: the patch and three
  rings of its neighbors (122 vertices on the left, 124 on the right) take the skin of their
  weights after 12 rounds of Smooth, and the vertex of the back notch goes onto the line of its
  two neighbors. The moves are at most 3.6 cm. The pose is a copy of the rig whose rest is the
  bind, so that the skin blends from the bind as in the app, with each upper arm turned the least
  way to hang down (54° from the bind). The property of each key gives the side, that turn in the
  axes of the chest (w 0.8898, x 0.2809, y ±0.3598, z ∓0.0023, in Blender axes), and the fade
  from 15° to 45°.

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
- **Brow.** 21 vertices of the sharp edges of the brow above each eye move toward the mean of
  their neighbors, at most 0.01 units, with the rule of `softened()` of
  `tools/blender/rig_mesh.py` (edges above 20°, a share of 0.5, 10 rounds). The box is |x| 0.015
  to 0.10, y 0.832 to 0.88, and z 0.17 to 0.24, and the vertices below y 0.83 stay. The sharp
  edges shade dark slashes above the black pea eyes of the app, which read as a worried brow. A
  box from y 0.81 also moves the upper lids, and the eyes then look tired.
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

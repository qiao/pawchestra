# Cat model

This folder holds the source mesh of the cat, a copy with rebuilt arms and its weights, and the
rigged copy. The app does not serve these files. It loads the module `src/models/studio/cat.ts`,
which this chain writes:

```text
cat.glb                            source mesh
   │  cat_arms.py (e491ff3c)       rebuilt arms, belly, and painted weights
   v
cat-arms.glb + cat-weights.json    `source` and `paintedWeights` of tools/mesh-rigs/cat.json
   │  pnpm rig-mesh cat
   v
cat.rig.glb of fc52d38f            rigged mesh
   │  pnpm glb-point-edits assets/models/cat/cat-edits.json
   v
cat.rig.glb                        rigged mesh with point edits
   │  pnpm studio-body cat
   v
src/models/studio/cat.ts           studio body of the app
```

This is the body that production shows. `docs/agents/rigging.md` gives the steps of the chain.
The target of the form is the sheet `docs/reference/cat-views.png`. The cat has the same bead eyes
as the fox and the rabbit.

The folder also holds the files of trials that the app does not use ("Trial files" below): the
hand rig of 2026-11-04 and 2026-11-05 from a Tripo mesh (`hand-rig/`, `tripo/`), and the T-pose
mesh of an earlier body (`cat-tpose.glb`). The hand rig is rejected: it gave a thin, faceted arm
root and other faults. Its `.blend` lies in `hand-rig/`, so that no tool finds it beside the GLB
file of the app (`handRigOf()` of `tools/glb-swap.ts`), and `pnpm rig-mesh cat` runs. Never
export the trial to `cat.rig.glb` of this folder: that file is the rig of the app.

## Files

The app chain:

| File | Origin | Rebuild |
|---|---|---|
| `cat.glb` | Source mesh (below) | None |
| `cat-arms.glb` | Copy of `cat.glb` with rebuilt arms and belly. License as `cat.glb` | `cat_arms.py` of e491ff3c |
| `cat-weights.json` | Weights of the same Blender run. License as `cat.glb` | `cat_arms.py` of e491ff3c |
| `cat.rig.glb` | Output of the rig with point edits. License as `cat.glb` | `pnpm glb-point-edits assets/models/cat/cat-edits.json` ("Point edits" below) |
| `cat-edits.json` | The point edits of the rig of fc52d38f | None: the edits of 2026-11-05 |

The trial files, which the app does not use:

| File | Origin | Rebuild |
|---|---|---|
| `cat-tpose.glb` | T-pose source mesh (below) | None |
| `tripo/cat-tpose.fbx`, `tripo/cat-tpose.fbm/` | Source mesh with quad faces, and its four textures (below) | None |
| `hand-rig/cat.blend` | Made by hand in Blender from `tripo/cat-tpose.fbx` (below). License as the FBX file | None: edit it in Blender |
| `hand-rig/cat.rig.glb` | Export of `hand-rig/cat.blend`. License as the FBX file | `pnpm rig-export cat --blend assets/models/cat/hand-rig/cat.blend --out assets/models/cat/hand-rig/cat.rig.glb` |
| `hand-rig/cat.rig.json` | Text summary of the export, for diffs | The same run |

## cat.glb

| Item | Value |
|---|---|
| Size | 14,466,300 bytes |
| SHA-256 | `0ca57eaa7f831ce5f17ff889d46b935e6c21400e69a597347c1381f0305cda9e` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,121 triangles and 4,148 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial`, double-sided, with a base color texture and a metallic-roughness texture, each a PNG of 4096 × 4096 pixels. The texture is an atlas of an automatic unwrap |

Facts of the mesh:

- A weld at 1e-5 gives 1,563 vertices in one connected part. The mesh has 2 open edges and 6
  edges with more than two faces. 318 faces have a corner angle below 10°.
- The box is x -0.491 to 0.490, y -0.952 to 0.952, and z -0.419 to 0.426. Thus the cat is 1.903
  units high from the soles to the tips of the ears.
- The cat faces +z, with its left side at +x. These are the axes of the studio.
- The cat stands in an A-pose: the arms go down and out at about 58° below the horizontal.
- The eyes are dark faces of the head surface with a few green faces, with no shells. Thin
  whiskers stand out from the muzzle.
- The tail hangs down behind the legs, and its end goes back along the floor. The sheet shows a
  tail that curls up at its end.

## cat-arms.glb and cat-weights.json

| Item | Value |
|---|---|
| `cat-arms.glb` | 1,180,540 bytes, SHA-256 `ecfe907e75fac79a56df2e5aa98e82b95217ff78f0d17cddb95e880552d90d76` |
| Mesh | 2,146 vertices after a weld at 1e-5, 4,287 triangles: on each arm a tube of 16 rings of 16 vertices, joined to the shoulder socket and to the paw with Bridge Edge Loops, and a side wall of 54 (left) and 50 (right) faces under each arm. Near the left armpit line, 8 vertices of the first two shoulder rings merged into the next ring or into the line |
| Material | One material with one base color JPEG of 4096 × 4608 pixels: the atlas of the source, and a strip of 512 pixels on top with the fur color of the source arms, baked onto the new faces. The side walls and the flat inner sides of the arms take one gray fur texel of the trunk beside the seam. No metallic-roughness texture |
| `cat-weights.json` | 480,430 bytes, SHA-256 `588d9b38b0dff053118adf037f9c87521a1504fc48df949043622062a486155e` |
| Weights | The automatic weights of Blender with the Weight Paint fixes of the script, on the studio bones and the arm segments and helpers (`armSegments` of the config), for `paintedWeights` of the config. The arms take the automatic weights of the copy before the round side walls (`step_tube_heat()`) |

The upper arm of `cat.glb` joins the side of the trunk down to the elbow. Thus the script makes an
armpit: a cut along the seam where the arm meets the trunk, a side wall of the trunk under the
arm, and a quad tube from the shoulder to the wrist. The flat inner side of the tube lies on the
side wall and meets it only at the armpit line. The faces of the paws, the trunk, the legs, and
the head are the faces of the source.

A rig with arm segments does not stretch the arms, so the arms get their length in the copy. The
upper arm is 0.92 and the forearm 0.78 as long as on the source. The arm is 1.10 head heights from
the shoulder joint to the wrist (1.30 on the source). The cross-section is 0.85 of the source.

The other steps of the script:

- **`step_belly()`.** It moves the belly front onto an ellipse arc and each side onto an even
  curve, at most 0.016 units. Thus the trunk is an even oval from the front and from the side. The
  front of the upper belly, where the bow upper arm lies in the play, is a little flatter, most at
  the middle line (`flat`). The faces and the colors of the trunk stay.
- **`step_round_wall()`.** It deletes the small trunk faces that turn back under the side wall,
  fills the hole again with even faces, and smooths the wall and the trunk near it along the
  normal of the plane of the seam. Thus the side wall rounds into the trunk.
- **`step_clean_pit()`.** It merges the shoulder ring vertices near the left armpit line into the
  next ring, and the socket vertices near the line ends. Then it fills the band again with a strip
  of triangles. Thus the band has no thin face. The right arm keeps its band, because the clean
  made the root ring of the bow arm flatter in the play.

The run of `tools/blender/cat_arms.py` at e491ff3c made them. The script of today keeps only the
steps of the side wall, with no run of the cat (672184a7), so the git history keeps the run.

## cat.rig.glb

| Item | Value |
|---|---|
| Size | 880,372 bytes |
| SHA-256 | `ef16dc6ec32c36d73e9a5f5619dbf69b21121236dabbbcc771f597338a254594` |
| Base | The rig of fc52d38f: 880,600 bytes, SHA-256 `2c10b8cd816073ed359990699c274573b6246820389f4d6b05fb645975b517cb` |
| Bind | The bind of the viola hold, with the elbows bent (below) |
| Shapes | The arm-down shape of each arm, the straight legs of each side, and four `raise` shapes (below) |

The base is the rig of e491ff3c, which has the mesh data of production. A run of
`pnpm rig-mesh cat` today gives another file: the tail root and 404 vertices near the haunch and
the tail move by up to 0.029 units (4.8 cm), because `tools/blender/rig_mesh.py` changed after
e491ff3c. The app keeps the committed file. `pnpm glb-point-edits` reads the base with
`git show fc52d38f:assets/models/cat/cat.rig.glb`, so a second run gives the same bytes. Never
run `pnpm rig-mesh cat` into this folder: it drops the point edits.

## Rig facts of cat.rig.glb

- The seated bind bends each elbow 79° and turns the left paw 120°. Thus the rig binds the left
  lower arm with the dual quaternion blend (`bind.arm` of the config), and the elbow and the
  forearm keep the round of the tube. The bow arm keeps the linear blend, because it bends
  further than the bind in the play.
- The front of each arm root keeps the trunk weights, so it stays with the chest. With no trunk
  weights, the root folded.
- Three `raise` shapes of the left arm (the turns of the play, of the rest, and between them) move
  the front of the arm root half of the way with the first segment of the upper arm (`follow`).
  In the shape of the play, the skin near the root front fills its valleys and moves no vertex in
  (`follow.fill`). A fourth shape does the same for the bow arm in the play.

## Point edits

The point edits of 2026-11-05 make the tail a round tube, the legs thicker, the left forearm
flatter, and the root of the bow arm even (`cat-edits.json`). A script in a live Blender session
made the moves. The edit file keeps each move, by the index of a vertex of the primitive `fur`, in
the stored space of the file (the seated bind, in units). The tool moves each vertex at the same
stored place, so the face colors stay one surface. The module keeps its seat height, its chair
depth, and its joints.

```text
            seated bind (stored)           standing soloist (clip reference)
tail:  new tube = curve + frame · offset    bind + both leg shapes = source tail
legs:  p + 0.25 · g · (p − axis point)      the leg shapes add on top of the move
arm:   axis + r_new / r · (p − axis)        no shape changes
```

**Tail (132 places, 199 vertices, largest move 0.0776 units).** The rig curled the tail of the
seated bind along `studio.tailCurl`. It moved each vertex by `smoothstep(share, 0.5, 0.95)` of
its tail share, and the tail end has a share of 0.75 (the chest has the rest), so the end moved
only 58% of the way. Its source line ended at the bend, so the floor part of the source tail
folded onto one point. The edit makes the tube again from the source:

- The source is the standing tail of the file: the bind with both `legs_straight` shapes, skinned
  by the first key of the clip `reference`. The tube is the welded vertices with |x| < 0.07,
  stored z < -0.03, and stored y < 0.46 in that pose. Its middle line runs through the middles of
  24 cuts across the tube: 0.367 units long, with a median radius of 0.0335.
- Each vertex keeps its place along the line, times 0.737, and its offset from the line in the
  rotation-minimizing frame, times a factor that falls from 1 at the place 0.02 to 0.72 at 0.08.
  The first normal of both lines is +x.
- The new line is a Catmull-Rom curve, 0.271 units long, through these stored points: (0, 0.315,
  -0.066), (0.006, 0.306, -0.096), (0.036, 0.296, -0.097), (0.072, 0.294, -0.081), (0.106, 0.294,
  -0.066), (0.138, 0.293, -0.033), (0.156, 0.291, 0.005), (0.160, 0.289, 0.045). The root starts
  at the old root ring on the back of the haunch. The tube goes back onto the seat, then around
  the back and the left side of the haunch.
- Vertex 2223 keeps its stored z: it is the back of the body that sets the chair depth.
- The `legs_straight` shapes take each move back, half each, so the standing soloist keeps the
  source tail.

Checks of the tube: its lowest point over the seat is at the seat top (0.2658), and it keeps
0.0034 units from the back posts of the chair. Beyond the place 0.12, no vertex lies in the
haunch. The haunch fills the width of the seat, so the outer half of the tail end lies over the
left edge of the seat (largest x 0.182, edge 0.140).

**Legs (111 places, 254 vertices, largest move 0.0142 units).** Each leg vertex moves away from
its leg axis by 0.25 × g of its distance. The axis point blends the nearest points of the thigh
line (hip joint to knee) and the shin line (knee to ankle) by the skin weights of the vertex. g
grows from 0 at 0.2 to 1 at 0.5 of the thigh, and falls from 1 at 0.70 to 0 at 0.95 of the
shin (smoothstep). Thus the girth blends into the haunch and the ankle with no ledge. A vertex
below the axis keeps its height, so the thighs stay on the seat. The edit takes the vertices
with |x| > 0.012, a distance below 0.075 from the axis, and at least 0.9 of their weight on the
hips and the leg bones. `leg-lineup.png` of `reports/2026-11-05-cat-edits/` shows the factors
1.15, 1.25, and 1.35. Each leg move is linear in the factor, so another factor F takes the leg
moves times (F − 1) / 0.25.

The lowest ring of each shin then takes one factor, 1.12, around the shin axis: 9 places on the
left (2288, 2291, 2296, 2299, 2317, 2318, 2340, 2347, 3780) and 10 on the right. The ring is
slanted, so the ramp of g gave it 1.02 at the back and 1.23 at the front. Its front stood out
over the top of the paw, and the face below it showed as a dark dent above the paw. Vertex 4818
of the right ring takes 1.04: it lies lower, next to the paw, and 1.12 gives it a sharp edge to
the paw. In the rest pose, the largest edge angle of the lower shin goes from 53.6° to 40.3° on
the left (base 37.3°) and from 72.8° to 59.0° on the right (base 59.9°).

**Left forearm (43 places, 85 vertices, largest move 0.0073 units).** The left forearm had a
belly on the side that faces the upper arm (the elbow pit side): a radius of 3.31 cm at 0.55 of
the forearm from the elbow, over a hollow of 2.05 cm at 0.27. The right forearm has 2.86 cm and
2.31 cm there. In the play pose the forearm lies level, so the belly showed as a bump on the top
of the arm. Each point of the pit side (out to 45° from the middle, with a fall to 70°) between
0.26 and 0.76 of the forearm takes the radius of the right forearm at the mirrored place, with
half of the belly of the right forearm over the straight line from 0.27 to 0.84. Each point moves
only toward the forearm axis or away from it, in the bind. The new pit side runs from 2.30 cm
near the elbow to 2.59 cm at 0.55 and 2.24 cm near the wrist. In the play pose, the mean edge
angle of the forearm goes from 14.3° to 13.8°, and the largest from 58.1° to 54.2°.

**Weights (61 places, 84 vertices).** The rig gave each vertex of the tail end 0.251 of its
weight on the chest. The edit gives that share to `tail_tip`, so the tail end does not follow the
chest. Six root places (2224, 3339, 3354, 3358, 4413, and 4414) get a tail share of 0.51 from the
hips. The export then counts them as tail, so the moved root behind the haunch does not set the
chair depth. Their standing places move up to 0.0037 units.

**Bow arm root (27 places, 2 moves).** The play turns `clavicle_R` 36° from the bind, and the
upper arm 65° to 77°. The rig gave the right arm root hard steps: a band of places on
`clavicle_R` alone across the back of the shoulder (849, 984, 986) lay beside places on the chest,
the neck, or `spine1` alone. 30 edges of the root had a step of the clavicle and arm share above
0.5. In the play, the band moved up to 4 cm against its neighbors, and the skin creased and
folded. The edit gives the root one row for each ring, from the joint to the back and the neck
(the rule of "Steps of a hand rig" of `docs/agents/rigging.md`):

| Ring | Places | Row |
|---|---|---|
| 1 | 796, 799, 802, 805 | `clavicle_R` 0.6, `upper_arm_R` 0.3, `chest` 0.1 |
| 2 | 794, 820, 821, 824 | `clavicle_R` 0.8, `chest` 0.2 |
| 3 | 819, 857, 861, 863 | `clavicle_R` 0.6, `chest` 0.4 |
| 4 | 818, 854, 856 | `clavicle_R` 0.3, `chest` 0.7 |
| 5 | 849, 850, 984 | `clavicle_R` 0.1, `chest` 0.9 |
| Around | 986 | `chest` 1 |
| Around | 814, 817, 837, 838, 839, 840, 847, 848 | `spine1` 1 |

The chest, `spine1`, and the neck move less than 1 cm against each other at the root in the play, so
the rows use the chest for the trunk share. The rows of ring 4 and 5 come from a lineup of `pnpm
arm-look` (ring 4 at 0.4 or 0.35 and ring 5 at 0.2 or 0.15 gave 14.2% to 14.8%). The front of the
root (825, 827, 828, 864, 884, 885, 886, 890, 892, 912) keeps the weights of the rig: more chest
share there moved the folds to the neck (889, 894, 908). The underside keeps its trunk share ("Rig
facts"). The place 766 keeps its head share on `clavicle_R`, as before.

Two moves (`bow_arm_root`) remove a dark slit behind the root. The places 839 and 840 lie where
the side wall under the arm meets the back. 840 lay 6 mm in from the wall, so the faces 839-840-838
and 847-840-839 made a shelf that faced down. 840 moves 4 mm out to the wall and 839 3 mm in, both
2 mm down and 1 mm forward (largest move 4.6 mm). The deltas come from a grid of 1 mm steps with the
least mean edge angle at the corner in the bind. The same search also moved 848, which folded the
small face 817-850-848 in the play, so 848 stays.

| Measure | Before | After |
|---|---|---|
| Crease share of the bow arm, `pnpm arm-look violist` (limit 14.6%) | 21.7% | 13.6% |
| Most folded faces in a play sample, `pnpm fold-probe violist` (right side) | 21 (7) | 16 (2) |
| Folded faces of all samples on `clavicle_R` / `spine1` / `chest` | 41,183 / 50,519 / 5,679 | 26,667 / 47,734 / 7,496 |
| Root edges with a step of the clavicle and arm share above 0.5 / 0.3 | 30 / 83 | 15 / 68 |
| Root edges above 90° at the tip / that turn 40° more than in the bind | 35 / 46 | 28 / 32 |
| Mean edge angle of the root at the tip | 32.1° | 28.8° |
| Right arm, `pnpm arm-check violist`: play samples with a fold / twist p95 (limit 55) | 54.4% / 35 | 10.0% / 38 |

The root is the 151 places within 0.09 units of the shoulder joint. The 2x crops of
`reports/2026-11-05-cat-bow-arm/crops/` show the slit behind the root gone at the tip and the rest
from az150. The fourth `raise` shape is 0 at the tip and at the rest, where the slit was, so it is
not the cause. At the frog and the crossing it removes 15 of 48 to 50 folded edges of the root.
`pnpm pose-depth violist` gives the same depths as before.

## Trial files

These files are the trials of 2026-11-03 to 2026-11-05: `cat-tpose.glb`, the source of the
T-pose body of `pnpm rig-mesh cat` at bdc18111, and the hand rig of the Tripo mesh. The app does
not use them. The text below gives the trials as they were: `cat-arms.glb`, `cat-weights.json`,
and `cat-root-weights.json` in it are the files of the T-pose chain at 6b516429, which the git
history keeps.

### cat-tpose.glb

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

### tripo/cat-tpose.fbx

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

### hand-rig/cat.rig.glb

`pnpm rig-export cat --blend assets/models/cat/hand-rig/cat.blend --out
assets/models/cat/hand-rig/cat.rig.glb` writes it, with the text summary `cat.rig.json`. A run
gives the same bytes.

| Item | Value |
|---|---|
| Size | 986,272 bytes |
| SHA-256 | `4bee422da9b085f5fdfd80f65e106af5c58c89a0d89bd10ad9d2057276ee7c6a` |
| Form | The mesh of `cat.blend` in its seated bind (below). The seat top is 0.301 m high, and the chair is 0.46 m wide and 0.343 m deep, as the chair of the cat of the A-pose mesh |
| Faces | 6,171 triangles, of them 65 gloss (the nose) |
| Extras | `eyes`: the middle, the direction, and the size of each eye object. `body`: the facts of the body of the armature |
| Shapes | The arm-down shape of each arm and the straight legs of each side, which the export calculates, and the keys `arm_raise_R`, `arm_raise_L`, `arm_raise_L2`, and `arm_raise_L3` (below) |
| Footprint | The seated violist is 0.673 m deep and 0.706 m wide (0.652 m and 0.704 m with the rig of commit 7c9e8074). The feet reach 1.7 cm further forward, and the tail 0.4 cm past the back of the chair |

### hand-rig/cat.blend

The hand rig of the cat (design 4.4, "Hand rig"), made in Blender 5.2 from `tripo/cat-tpose.fbx`:
the mesh, the colors, the armature, the weights, the pea eyes, the seated bind (the Action
`bind`), its keys, and the facts of the body.

| Item | Value |
|---|---|
| Size | 377,280 bytes |
| SHA-256 | `8aeb3a095894071c6893c1c233ca72314c94d57d466bba65789518ec769b1089` |
| Origin | Made by hand in Blender 5.2 from `tripo/cat-tpose.fbx` |
| License | CC BY-NC 4.0, as the FBX file |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the ear tips of the source, the soles at z = 0, the animal faces -y, and +x is its left side. The longer legs lift the body 0.1227 units, so the ear tips are at z = 1.1227. No object has a transform |
| Mesh | One object `cat`: the FBX mesh with the turn of the file applied and the scale 1.001957, with flat faces and no custom normals, the edits below, and the surface of `add_surface(..., eye_fans=False)` of `tools/blender/studio_armature.py` with the base color JPEG: the face attributes `color` and `color_base` and a gloss nose. 3,100 vertices and 3,360 faces (2,811 quads and 549 triangles, 6,171 triangles), 35 faces of them gloss |
| Eyes | The objects `eye_L` and `eye_R` (`tools/blender/studio_eyes.py`), children of the bone `head`, with the size (0.288572 units) and the direction (±0.6219, -0.7827, 0.0208) of the eyes of the old `cat.blend`. Each middle lies on the smooth eye socket, where the axis meets the head surface. `fit_eyes()` levels them in the bind, with the middles at (±0.0756, -0.1959, 0.9325) |
| Materials | The slots `fur` and `gloss`. Each reads the face attribute `color` |
| Armature | One object `cat_rig`: the 30 body bones, `tail_tip`, and the 20 arm segments and helpers, with the parents of `STUDIO_PARENTS`, the rest in the T-pose, and the properties `palm` (0, 0, -1), `seat`, `hinges`, and the facts of the body (below). The Z axis of each bone points to its hint (`fix_rolls()`). The Action `bind` holds the seated bind at frame 1 (below) |
| Shape keys | `Basis`, `bind_sit` and `bind_tail` at the value 1, and `arm_raise_R`, `arm_raise_L`, `arm_raise_L2`, and `arm_raise_L3` at the value 0 (below), each with its custom property on the mesh. A body has at most 4 keys `arm_raise_*` (`STUDIO_RAISES`) |
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
- **Round haunch.** After the full thighs, the back of the haunch was a straight slant down to
  one low point above the seat, with a dip under the hip joint in front of it. Two moves of the
  bind, each turned back into the rest by the inverse of the blended skin and added to
  `bind_sit`, make it round. First, in the side view (forward, up), the points behind the chord
  from (-0.04, 0.38) to (0.053, 0.276) move out from it, back and down, by 0.022 units times
  sin(pi t), where t is 0 to 1 along the chord. The move fades out over 0.045 units in front of
  the chord and from |x| 0.15 to 0.20, and no point goes below the seat. 21 points move, at most
  0.0215 units. Then the underside comes down toward the seat: each point at the height h above
  the seat (forward -0.05 to 0.14, |x| 0.02 to 0.19) goes to h (1 - 0.8 f), with f the smooth
  step down from h 0 to 0.05. 53 points move, at most 0.0104 units. No point with a tail weight
  of 0.1 or more, or with a shin or foot weight of 0.5 or more, moves. The seat top stays 0.3001
  m.
- **Soft hip ledges.** After the full thighs, the outer top of each thigh made a sharp ledge
  against the side of the haunch in the seated bind, which showed from the sides as a light flap.
  A relax of the bind smooths it: 8 rounds in which each point within 0.07 units of a center
  moves half of the way to the mean of its neighbors, times a smooth falloff (1 at the center, 0
  at 0.07 units). The centers (x, up, forward) are (-0.175, 0.339, 0.13), (-0.164, 0.308, 0.112),
  (-0.153, 0.301, 0.084), and (-0.169, 0.281, 0.177) on the right, and (0.176, 0.291, 0.147),
  (0.171, 0.309, 0.114), (0.162, 0.311, 0.086), and (0.14, 0.292, 0.059) on the left. No point
  with a tail weight above 0.05 or below the height 0.285 units moves. The move goes into
  `bind_sit` by the inverse of the blended skin. 39 points move, at most 0.0233 units. The rest,
  and with it the leg widths, stay.
- **Soft crotch.** From the front, the bottom of the belly between the thighs was a dark notch
  with spikes. The same relax (6 rounds, 0.06 units) at the centers (0, 0.33, 0.13),
  (±0.03, 0.35, 0.15), and (0, 0.30, 0.085) makes it a smooth hollow. No point with a tail weight
  above 0.05 or below the height 0.285 units moves. 37 points move, at most 0.0227 units.
- **Soft knees.** From the back diagonals, the inner and the outer side of each bent knee was a
  sharp crease, and the knee read as an angular knob. The same relax (6 rounds, 0.05 units) at
  the centers (±0.171, 0.27, 0.184) and (±0.034, 0.265, 0.189) softens them. No point with a
  tail weight above 0.05, and no point on the seat (below the height 0.285 units and behind the
  forward 0.11), moves. 38 points move, at most 0.0233 units.
- **Soft inner knees.** After the thigh taper, the inner side of each seated knee showed a dark
  wedge from the front. The same relax (6 rounds, 0.05 units) at the centers (±0.045, 0.30,
  0.185), with the same points kept, smooths it. 27 points move, at most 0.0062 units.
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
  rule, on the bind. The rule is the output of `pnpm raise-fit` for the folded faces of `pnpm
  fold-probe`, the key is the move of the bind turned back into the rest by the inverse of the
  blended skin, and the property holds the turn of the key bone (w, x, y, z, Blender axes) and
  the fade:

  | Key | Rule | Bone from the bind | Turn | Fade | Folds in the pose |
  |---|---|---|---|---|---|
  | `arm_raise_R` | `violist`, 5 faces of the right inner elbow, sets rest and play | forearm 102° | 0.6273, -0.5762, 0.5142, 0.1004 | 10° to 20° | 7 to 2 |
  | `arm_raise_L` | `violist`, 4 faces of the left inner elbow, sets rest and play | forearm 90° | 0.7063, -0.5215, -0.4721, -0.0799 | 10° to 20° | 5 to 0 |
  | `arm_raise_L2` | `trumpeter@cat`, 4 faces of the left inner elbow, set rest | forearm 121° | -0.4950, 0.6461, 0.5664, 0.1292 | 10° to 20° | 10 to 7 |
  | `arm_raise_L3` | `trumpeter@cat`, 4 faces of the front of the left armpit, sets rest and lift | upper arm 56° | 0.8814, 0.0523, -0.3505, -0.3123 | 20° to 30° | 5 to 1 |

  The rules of the fronts of the armpits of the violist (the upper arm 66° and 29° from the bind)
  turn over no face in the pose of Blender, so their keys moved less than 0.3 mm.

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
  its form: the thigh grows 0.0323 units, faded in from 1.0 thigh lengths above the hip joint to
  0.2 below it, and the shin grows 0.0323 units at the knee, 0.0183 at its middle, and 0 at the
  ankle. The first offset (0.044 units, and 0.027 at the middle of the shin) made the legs too
  thick, so a second offset of the same rule on the long legs (-0.0117 and -0.0087 units) took them
  back to these values. Each key keeps its move from the basis. The back of the thigh keeps its place, and near the crotch the inner side keeps its
  place and the outer side grows 1.15 times. A factor across the axes made sharp fins at the
  outer haunch and a ledge where the thigh met the belly, in the rest and in the bind. Then the
  thigh is 1.6 and the shin 2.30 times as long along its bone, and each foot keeps its size
  (`stretch()` of `rig_mesh.py`, by the leg weights). The body rises 0.1227 units, and the bones
  move with the mesh.
- **Slim shins.** The shins were thick and blocky. Each point of a shin (leg weights at least 0.5,
  tail weight below 0.5, at most 0.12 units from the axis) moves toward the middle line of the
  shin with the factor 1 - 0.21 s(u). Here u is 0 at the knee and 1 at the ankle, and s is the
  smooth step up from u -0.05 to 0.3, times the smooth step down from u 0.75 to 1.0. The middle
  line is the mean of the points across the axis in 11 bins of u. 53 points of each shin move, at
  most 0.0137 units. The knee, the ankle, the feet, and the leg lengths stay. Each key keeps its
  move from the basis.
- **Full thighs.** In the seated bind, each thigh was a narrow band from the hip to the knee.
  Each point of a thigh (at most 0.15 units from the axis, no tail or arm point) moves out from
  the middle line of the thigh by 0.030 units times the front share of its direction, 0.017
  units times the outer share, and 0.009 units times the inner share. The inner share fades in
  from 0 at the hip joint to all at 0.6 thigh lengths, so the crotch keeps its place. The back of
  the thigh does not move, because in the bind it is the underside on the seat; the front of the
  rest is the top in the bind. The move fades in from 0.35 thigh lengths above the hip joint to
  0.05 below it, and out from 0.75 to 1.05 thigh lengths, so the knee keeps its place. The middle
  line is the mean of the points across the axis in 9 bins from the hip joint to the knee. 119
  points move, at most 0.034 units. Each key keeps its move from the basis.
- **Thigh taper.** In the stand, the full thighs over the slim shins read as puffy pants with a
  knob at each knee. Each thigh now tapers from the middle to the knee. At each height from up
  0.14 to 0.255 (the knee joint is at up 0.181), the ring of the thigh takes, in each direction
  from the joint line, the radius r(0.14) + (r(0.255) - r(0.14)) t^1.3, where t is 0 at up 0.14
  and 1 at up 0.255. The radius of each ring comes from a cut at that height, at each 5° around
  the joint line. No point moves out, and no tail point moves. 34 points of each leg move, at
  most 0.0182 units. The mid thigh goes from 0.582 to 0.545 of the width of the head, the front
  of the thigh at up 0.20 from forward 0.177 to 0.161, and the shin, the joints, the leg lengths,
  and the feet stay. Each key keeps its move from the basis.
- **Haunch cut.** In the seated bind, the back of the right haunch near the tail root was a flat
  wall with a fan of long thin triangles down to one corner on the seat (vertex 765): the edges
  765-762 and 794-795 were 0.121 and 0.099 units long. A cut of the edge ring 765-762, 794-795,
  and 1617-2148 (`subdivide_edges()` of bmesh, 1 cut) adds the vertices 3090 to 3092, each with
  the mean weights and keys of its edge. Each face of five corners at an end of the cut splits
  into a quad and a triangle (3090 to 763, 3091 to 1616). In the bind, each new vertex then goes
  to the middle of a cubic curve along its edge, with the tangents of the surface at the two ends
  (out 0.0087, 0.0045, and 0.0013 units), and the move goes into `bind_sit` by the inverse of the
  blended skin. No old vertex moves, and the rest stays.
- **Haunch corner.** After the haunch cut, the faces of the back, the inner side, and the outer
  side of the right haunch still met in one low corner on the seat (vertex 765), and the hard
  creases into it (45° to 60°, more than the crease angle) read as a V from the back diagonals.
  `edge_split()` of bmesh at the middle of the edges 765-764, 765-3090, 765-1541, 765-795,
  3094-795, 3090-3092, and 1120-1541 adds the vertices 3093 to 3099, each with the mean weights
  and keys of its edge, and `connect_verts()` joins 3093-3094, 3093-1120, 3094-795, 3094-763,
  3095-3096, 3095-3093, 3095-917, 3097-3096, 3097-3098, 3098-762, 3099-3095, and 3099-1137. In
  the bind, 3093 and 3094 go to the middle of a cubic curve along their edges (as the haunch
  cut), and 3095 and 3096 go onto the circle of the seat line through 1541, 765, and 795 (seen
  from above). Then each new vertex moves along the mean normal of its faces (square to its
  edge) by -0.004, -0.004, 0.001, -0.004, 0.0008, 0.0054, and 0 units, the values with the least
  sum of the squares of the face angles above 22° near the corner. Each move goes into
  `bind_sit` by the inverse of the blended skin. Each new vertex ends 0.0018 to 0.0066 units out
  from the middle of its edge, and no point goes below the seat. Each crease near the corner, out
  of the seat line, is now 35° or less (the outer crease 762-3090, 3090-3094, 3094-765: 39°, 45°,
  52° before, 23°, 30°, 33° after). No old vertex moves, so the tail root and the seat contact
  stay.
- **Whiskers.** The Decimate of Blender (collapse, ratio 0.4) on the 5 whisker strands only
  takes them from 243 vertices and 465 triangles to 94 vertices and 165 triangles. The 2x face
  crops show the same whiskers with fewer bends.

The legs, in meters (1.588737 m for each unit), with the old file in parentheses: in the
seated bind of the seat rules of `cat.json`, the seat top is 0.3001 m (0.3002 m), the thigh is
0.201 m (0.205 m) and the shin 0.213 m (0.222 m) long, and the seated cat is 1.651 m (1.675 m)
high. The shin factor is 2.30, because 2.32 put the seat top at 0.3025 m. In the rest, the mid
thigh is 0.545 (0.582 before the thigh taper) and the mid shin 0.281 of the width of the head at
the eyes (0.439 and 0.290; the source 0.304 and 0.22), and the hips are 0.637 m wide (0.539 m).
The first offset gave 0.571, 0.399, and 0.625 m, and the second offset 0.500, 0.343, and 0.591 m
before the slim shins and the full thighs.

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
  weight with the clavicle share 0.52 and the arm bones in their ratio. With the mean of the
  automatic weights (clavicle 0.28), the patch was a part of the upper arm, and `pnpm pose-depth
  violist` measured it 3.3 cm in the arm root in each sample (main 1.0 cm to 1.4 cm).
- **Head at the arm roots.** The 20 vertices of the fronts of the arm roots with a clavicle and
  arm share of 0.5 or more give their head weight (0.06 to 0.31) to the neck. A turn of the head
  folded the faces at the front of each armpit.
- **Crotch.** After the leg stretch, 16 rounds of Smooth on the vertices of the front with a
  thigh share of 0.02 to 0.98 and |x| below 0.11.
- **Armpit slivers.** 3 triangles under the arm roots, one on the left and two on the right, have
  a corner above 165° in the bind. Their corners take one mean weight, so that each moves as one
  piece. Each turned over in each sample of the play of the violist.
- **Elbow rings.** The 4 forearm rings of each arm in the elbow band, from 0.12 to 0.54 of the
  forearm from the elbow joint, take one mean weight each: each vertex of a ring takes the mean
  weights of its ring, at most 4 bones. The Smooth of the elbow band gave the front half of each
  ring more elbow helper and upper arm than the back half (0.26 more in the first ring), so that
  in the bent elbow of the violist the inner side of the forearm stayed back and made a dent at
  the inner elbow. Each key keeps its move of the bind. The app renders of the violist with one
  change at a time show it: with no keys `arm_raise_L` and `arm_raise_R`, the dent stays; with
  no loop cuts at the arms, the elbow folds more; with the mean weights of these 4 rings, the
  dent goes.
- **Wrist rings.** The 3 forearm rings of each arm from 0.67 to 0.90 of the forearm also take
  one mean weight each. The automatic weights gave the wrist helper and the paw up to 0.72 more
  weight on one side of a ring than on the other, and the forearm segments other shares, so that
  the twist of one ring differed up to 20° in the bind. The skin of the paw pulled one side of the
  forearm, and the faces of the forearm turned in thin dark spikes that wound around it. With
  these rings, each forearm ring turns as one piece, and the bind twist of the left forearm
  grows from 15° at the first ring to 122° at the last (0° to 127° from the elbow joint to the
  wrist joint). The bind supination of phase A (130° and 81°) changes no app render of the arm.

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

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

`tripo-hand/` holds a candidate body ("Candidate hand rig" below): a hand rig of the third Tripo
P2 mesh `tripo-p2/cat.fbx`, made in headless Blender with no arm cut and no arm stretch.

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
| Mesh | One object `cat`: the FBX mesh with the turn of the file applied and the scale 1.001957, with flat faces and no custom normals, edits by hand, and the surface of `add_surface(..., eye_fans=False)` of `tools/blender/studio_armature.py` with the base color JPEG: the face attributes `color` and `color_base` and a gloss nose. 3,100 vertices and 3,360 faces (2,811 quads and 549 triangles, 6,171 triangles), 35 faces of them gloss |
| Eyes | The objects `eye_L` and `eye_R` (`tools/blender/studio_eyes.py`), children of the bone `head`, with the size (0.288572 units) and the direction (±0.6219, -0.7827, 0.0208) of the eyes of the old `cat.blend`. Each middle lies on the smooth eye socket, where the axis meets the head surface. `fit_eyes()` levels them in the bind, with the middles at (±0.0756, -0.1959, 0.9325) |
| Materials | The slots `fur` and `gloss`. Each reads the face attribute `color` |
| Armature | One object `cat_rig`: the 30 body bones, `tail_tip`, and the 20 arm segments and helpers, with the parents of `STUDIO_PARENTS`, the rest in the T-pose, and the properties `palm` (0, 0, -1), `seat`, `hinges`, and the facts of the body. The Z axis of each bone points to its hint (`fix_rolls()`). The Action `bind` holds the seated bind at frame 1 |
| Shape keys | `Basis`, `bind_sit` and `bind_tail` at the value 1, and `arm_raise_R`, `arm_raise_L`, `arm_raise_L2`, and `arm_raise_L3` at the value 0, each with its custom property on the mesh. A body has at most 4 keys `arm_raise_*` (`STUDIO_RAISES`) |
| Weights | Automatic weights and fixes by hand, at most 4 bones on each vertex, each sum 1. The upper arm, the forearm, the forearm twist bone, and `root` hold no weight |

The rig is a rejected trial, so this file keeps no steps. The steps of each edit, the
bind, the weights, and the keys are in the git history of this `README.md`, at 0cd1a4e94.

## Candidate hand rig

`tripo-hand/` holds a candidate body ("tripo-hand/cat.blend" below): a hand rig of the third Tripo
P2 mesh `tripo-p2/cat.fbx`, made in headless Blender with no arm cut and no arm stretch.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/cat.fbx`, `tripo-p2/cat.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/cat.blend` | Made in headless Blender 5.2 from `tripo-p2/cat.fbx` (below). License as the FBX file | The scripted edits below |
| `tripo-hand/cat.rig.glb` | Export of `tripo-hand/cat.blend`. License as the FBX file | `pnpm rig-export cat --blend assets/models/cat/tripo-hand/cat.blend --out assets/models/cat/tripo-hand/cat.rig.glb` |
| `tripo-hand/cat.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/cat-color.webp` | The color map of the candidate ("Color map" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/cat-maps.py` |
| `tripo-hand/cat-normal.webp` | The normal map of the fur ("Normal map" below). License as the FBX file | The run of `tools/cat-maps.py` above (cwebp 1.5.0) |

The files of the candidate, after the last edit:

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/cat.blend` | 380,547 bytes | `11bd91361a3a8d08bd18e8bc3207226aa059c8e4fd59b8176aa2c05d63f1169a` |
| `tripo-hand/cat.rig.glb` | 839,724 bytes | `2ebd2829af9cc630a83ce85e00d9b270d931be6e4db666816c970874b639719e` |
| `tripo-hand/cat.rig.json` | 21,224 bytes | `bd64603e3bc5b6719716f1bd12ac702cb5fc628e97115aa3bc92f16df4f0e6e5` |
| `tripo-hand/cat-color.webp` | 233,814 bytes | `175bfe51f79cfbc799cafbbf44592a2509315bcfe401ad55f04234f238bb44e5` |
| `tripo-hand/cat-normal.webp` | 78,584 bytes | `9e2d4f98ba34240894ef3f0eff106065825aa0339e38ea2b5e4ddb09537d9b2e` |

### tripo-p2/cat.fbx

The third Tripo cat: a gray and white tabby with green eyes, a white chest, white paws, and a
white tail tip, in a T-pose with quad faces, made with Tripo P2 from the turnaround sheet
`cat-tabby3.png` of the project author. Its arm tubes have 8 vertices around, and its leg tubes 12.
It replaces the second Tripo cat (FBX SHA-256
`d9b38bf098e744e96da28e94abdb00f19b459654e67531b97072d58ad2ac57ff`). The folder `cat.fbm/` holds
its color map and its normal map. The Tripo download names them
`tripo_rgb_c56b7b9d-bee2-42f9-8813-38855b2b411a.jpg` (now `cat_basecolor.jpg`) and
`tripo_normal_f60dbe84-0314-4a91-b849-bf22ccd352af.jpg` (now `cat_normal.jpg`). The FBX file links
the maps by the folder of the download, so each tool takes the path of the map. The roughness and
metallic maps of the download are not kept.

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary |
| Contents | One mesh object, with no armature and no animation. 3,192 vertices and 3,325 faces: 2,765 quads and 560 triangles (6,090 triangles), no n-gon. One UV layer |
| Parts | 28 parts: the body with the tail (2,731 vertices), two eyeballs (86 vertices each, closed spheres of radius 0.049 that reach over the middle plane into the head), the inside of the mouth (69 vertices), and 23 strips: the whiskers, the brow whiskers, and the tufts in the ears. No vertices merge at 1e-5. 232 open edges, and no edge with more than two faces |
| Axes | The cat faces -y of Blender, so the import takes no turn. 1 unit from the soles to the ear tips, x ±0.3974 (the paw tips), and z ±0.2557 (the whisker tips and the tail curl) |

| File | Size | Pixels | SHA-256 |
|---|---|---|---|
| `cat.fbx` | 212,556 bytes | | `f6225744655b117ad547b426e0237ace0a86218817e12a3f8bba7c7a430fa980` |
| `cat.fbm/cat_basecolor.jpg` | 3,563,226 bytes | 4096 × 4096 | `28c19cdc2750fb5ec412ae3158920eede4d99cf99a51c5f0fdd5150d63b39668` |
| `cat.fbm/cat_normal.jpg` | 1,412,871 bytes | 4096 × 4096 | `d0675e1a9bab7b6947437122886976130da064348691884c3719eba83935cdbd` |

The color map paints a full eye on each eyeball: a large black pupil with a soft gray light, a
yellow-green iris, white, and a dark lash line around the opening. It paints each iris at the
inner lower corner of its opening. It also paints a dark brow arc over each eye, the tabby stripes,
a white blaze, muzzle, chest, and paws, a pink nose, and pink inner ears and pads.

### tripo-hand/cat.blend

The candidate hand rig of the third Tripo P2 cat (design 4.4, "Hand rig"), made in headless
Blender 5.2 (`blender -b --factory-startup`) by scripted edits, in the order below. The source FBX
is the target of the look: the head, the girths, the trunk, the paws, and the legs keep the form
of the source, with no cut, no split, and no stretch. The edits are only those that the rig, the
seat, the eyes, and the tail need. The chair fits the body (`StudioBody.seatHeight`), so the seat
is lower than the seat of the cat of main.

| Item | Value |
|---|---|
| Origin | Made in Blender 5.2 from `tripo-p2/cat.fbx` |
| License | CC BY-NC 4.0, as the FBX file |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the ear tips before the edits, the soles at z = 0, the cat faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `cat`, with the shape keys `bind_belly` ("Belly") and `bind_tail` ("Tail on the seat"). The eyeballs keep their front (the back faces go, "Lids"), with the face attribute `eye`. The two lids have the face attribute `lid`, and the 98 faces of the strips of fewer than 30 vertices (whiskers, brow whiskers, ear tufts) have `plain`. The UV map of the FBX, and the property `texture` (`assets/models/cat/tripo-hand/cat-color.webp`) |
| Armature | `cat_rig`: the 30 body bones, `tail_tip`, and the 20 arm segments and helpers of the simple route, at the joints of `tools/mesh-rigs/simple/cat-tripo.json` (the source joints, mapped by the paw turns and the point edits). The Action `bind` holds the seated bind of the bind rules of that config, with no bind supination. The properties `palm`, `hinges`, `seat`, and `lids` come from the steps below |
| Facts | `height` 0.863456 (the shoulder joints at 1.4272 m for each unit, so that H is 0.339357 m, near the H 0.339375 m of the cat of main), `crease` 55, `seatWidth` 0.46 |
| Eyes | The eyeballs of the mesh at the size of the source, with the `varnish` finish (`eyeFinish` of the entry in `tools/studio-body.ts`) and no eye light ("Eyes"), and a blink lid on each. No eye objects, so the app adds no bead eyes |

The scripts of the session (`scratch/cat3/` of the worktree, which git ignores: `build.py`,
`redits.py`, `rimport.py`, `rings.py`, `make_config.py`, `chain-here.sh`, and `params.json`) are not
in the repo. They follow the scripts of the second Tripo rabbit (`assets/models/rabbit/README.md`).
The edits, in the order of the work (`sa` is `tools/blender/studio_armature.py`, x is the x of the
left arm, y the height, in the source):

- **Import.** `sa.import_source('assets/models/cat/tripo-p2/cat.fbx', 1e-5)`. No vertex merges.
  Each face is flat.
- **Arm rings.** Edge ring Subdivide (`bmesh.ops.subdivide_edges(bm, edges=<ring>, cuts=2,
  use_grid_fill=True)`) of the clean quad bands of 8 edges between the closed arm loops at x 0.122,
  0.146, and 0.176.
- **Knee and shin rings.** The same call with 1 cut on the clean leg bands of 12 edges at y 0.062
  to 0.089 and 0.183 to 0.215.
- **Rings with no split.** These bands stop at a triangle or a pole: the arm root to x 0.122, the
  elbow from x 0.176 to x 0.225 (partial loops at x 0.194 and 0.207 carry the bend), the forearm
  from x 0.225 (8 vertices) to x 0.275 (9 vertices), the paw, and the leg band from y 0.089 to
  0.183 (the knee joint lies at y 0.16).
- **Paws turned.** Each vertex past the arm loop at x 0.166 (a loop of the split) turns rigidly
  about the rest forearm axis by whole ring steps of 45 degrees: 45 degrees on the left (1 step)
  and 90 degrees on the right (2 steps), 307 vertices on each side. The 8 quads of the band from
  the loop at x 0.166 to the loop at x 0.176 go, and new quads join the two loops with the same
  step offset. The far loop moves back to its place before the turn, with a fade to 0 at 0.02
  units along the arm. The new quads take the planar UVs of the clean gray patch at UV (0.0409,
  0.7373). The tabby stripes go around the forearm, so the turn does not show.
- **Point edits.** None: the form of the source stays.
- **Surface.** `sa.add_surface(cat, 'cat', 'assets/models/cat/tripo-p2/cat.fbm/cat_basecolor.jpg',
  eye_fans=False, config=<cat-tripo.json>)`. The faces of the two eyeballs (the loose parts of 81
  to 99 vertices in the eye box) get the face attribute `eye`. The export then gives `ownEyes`.
- **Round balls.** The Tripo balls are not round: the back reaches 1.09 times the radius of the
  fitted sphere. Each ball vertex more than 45 degrees from the eye axis (0.35, 0, 0.94), x
  mirrored on the right, and outside the sphere moves in to the sphere (66 vertices). The front
  of the ball, which shows, stays.
- **Armature.** The armature of the config with a palm for each side: the palm of the pads of
  the source, (-0.03, -0.998, -0.05) in the studio axes with x mirrored on the right, turned by
  the paw turn. The property `hinges` holds the elbow axis of the config of each side, turned
  about its bind upper arm by 13 degrees on the left and -44 degrees on the right ("Arm twist").

The weights, in the order of the work, in the rest pose:

1. Automatic Weights, then Limit Total 4 and Normalize All, on a copy of the mesh with no loose
   part. Each vertex takes the row of its copy. The tail is a part of the body ("Tail on the
   seat" gives its rows).
2. Arm rows: each vertex of a side with |x| from 0.085, within 0.05 units of the line of the rest
   arm, takes one exact row with `sa.set_weight_row()`: a clavicle share and an elbow helper
   share, linear between the control rows below, and the rest on the 4 roll segments of the upper
   arm or the forearm. The elbow joint lies at x 0.19.

   | x | 0.085 | 0.097 | 0.108 | 0.12 | 0.13 | 0.155 | 0.167 | 0.182 | 0.198 | 0.213 | 0.225 |
   |---|---|---|---|---|---|---|---|---|---|---|---|
   | Clavicle | 0.40 | 0.25 | 0.12 | 0.04 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
   | Elbow helper | 0 | 0 | 0 | 0 | 0 | 0 | 0.25 | 0.75 | 0.75 | 0.25 | 0 |

3. Wrist rows: with d the place along the rest forearm axis past the head of `hand_<side>`, the
   bend share b of the paw grows in 12 equal steps, one in each band of 0.004 from d -0.03. A row
   with b of 0.5 or less is {`wrist` 2b, the arm row the rest}, above 0.5 {`wrist` 2 (1 - b),
   `hand` 2b - 1}.
4. Knuckle rows: from d -0.02 past the head of `fingers_<side>`, the `hand` share of each row
   splits into `hand` and `fingers` by a fingers share that grows in 12 equal steps of 0.003.
5. The vertices of the loose parts (the eyeballs, the mouth, and the strips) and of the gloss nose
   take {`head` 1}: 509 vertices.
6. Ear rows: a plane across the base of each ear, through four points of the left ear base of the
   source, (0.04, 0.905, 0.09), (0.13, 0.845, 0.09), (0.085, 0.88, 0.03), and (0.085, 0.875,
   0.13) (studio axes, x mirrored on the right), mapped by the point edits. Each head vertex above
   the plane by 0.008 or more and with |x| above 0.002 takes {`ear_<side>` 1}, one from 0 to 0.008
   {`ear_<side>` 0.5, `head` 0.5}, and each other vertex gives its ear share to `head` (166 ear, 6
   base, and 695 head rows).

**Arm twist.** The roll of each upper arm (from the clavicle) and the twist of each forearm (the
paw from the upper arm), in degrees, in the moments of `pnpm pose-preview violist` with the hold
`CAT_HOLD` of `src/pose/bowed-rig.ts`:

| Moment | Left upper arm | Left forearm | Right upper arm | Right forearm |
|---|---|---|---|---|
| frog | 39.6 | 12.9 | -7.2 | -1.8 |
| tip | 39.5 | 12.7 | -37.2 | -36.9 |
| crossing | 39.6 | 12.9 | -9.9 | -14.3 |
| rest | -42.1 | -40.8 | -15.3 | -17.4 |
| lift50 | 8.5 | -4.8 | 15.4 | -30.0 |
| lower50 | 24.3 | 10.7 | 15.3 | -16.4 |
| stand | 39.4 | 11.6 | -7.5 | -0.9 |

With no paw turn and no hinge turn, the right forearm twisted 95 to 127 degrees and the right
upper arm rolled -53 to -81 degrees.

**Form.** The values of `pnpm body-shape violist --base main`, in cm, at the same H of 33.9 cm.
The body keeps the form of the source. A head 1.1 times wider, a trunk up to 1.6 times wider and
deeper, thicker limbs, smaller paws, and shins 1.75 times longer toward the cat of main read as a
different cat from the source.

| Measure | Cat of main | This rig |
|---|---|---|
| Trunk width W3, W5, W7, W8 | 44.9, 37.8, 29.6, 29.1 | 32.8, 25.6, 25.9, 24.8 |
| Trunk depth D3, D4, D6, D8 | 34.9, 34.1, 31.2, 30.4 | 27.0, 26.1, 20.8, 24.0 |
| Upper arm girth | 33.0 | 31.4 |
| Forearm girth | 30.3 | 26.2 |
| Thigh girth | 55.5 | 52.8 |
| Shin girth | 37.4 | 33.1 |
| Seat height | 29.8 | 19.3 |

**Smooth surface.** Each face takes the color of its region (pink by a hue below 16 or above 340
degrees, a saturation of 0.38 or more, and a lightness above 0.35, white by a lightness of 0.6 or
more, else the gray fur), and ten Taubin rounds (0.5, then -0.53) relax the body, with each move
clipped to 0.01 units. The loose parts and the gloss nose stay. 13 light gloss faces over the nose
go back to the fur.

**Seat.** The thighs slope 20 degrees down and 8 degrees out in the bind, and the shins lean 12
degrees forward (`legTurns` of the config). The front of the seat lies 0.06 units behind the knee
joint of the bind (0.045 put the calf over the seat), and 54 % of the thigh lies on the seat. The
seat height of the app is 0.193 m.

**Rest.** At rest the viola and the bow lie on the lap: `lapPoint()` of `src/pose/lap.ts` takes
the top of the highest triangle of the hips, the spine, and the legs over a point of the thigh.
With a trunk 1.5 times deeper at the belly, a belly triangle covered that point, and the rest
lifted the bow and the viola to the chest. With the trunk of the source, the top of the lap is the
thigh.

**Mouth.** The source mouth is a deep slit, and it shaded as a thick, wide, dark line. The fur faces
of the slit take the face attribute `rim`, so that they shade as the lips around them: each fur
face of the body in the box |x| below 0.055, y 0.70 to 0.746 (mapped by the point edits), and z
0.14 to 0.27 of the source, with a corner more than 0.006 units behind the front skin (the largest
z of the points within 0.008 units in x and y), 219 faces.

**Belly.** The key `bind_belly` relaxes the posed bind of the 24 vertices with a rest height
(Blender z) from 0.33 to 0.42, rest y below 0, and atan2(|x|, -y) at most 60 degrees, in 3 rounds
of P += 0.5 ((mid - P) . n) n (the rule of the rabbit).

**Tail on the seat.** The tail has two bones, `tail` from the root at y 0.36 to the bend at (0,
0.15, -0.10), and `tail_tip` to (0, 0.14, -0.25), with `studio.tailBind` of the second cat. The
tail takes exact rows and a bind key, as the tail of the second Tripo cat (the old rows of this
README in the git history):

- **Middle line.** In the rest, the edge distance from the end of the hook gives rings of the tube
  in bands 0.02 units wide, up to 0.4 units. The middles of the bands, smoothed twice by (1/4,
  1/2, 1/4), give the line from the root at (0, 0.344, -0.012) to the tip at (0, 0.128, -0.251),
  0.359 units long. The tube is each vertex within 0.43 units of edge distance and 0.075 units of
  the line: 183 vertices.
- **Rows.** Each tube vertex takes {`hips` 1 - a, `tail` a (1 - b), `tail_tip` a b}, with p its
  place along the line, a = smoothstep(-0.04, -0.005, p), and b = smoothstep(p_b - 0.04, p_b +
  0.04, p) about the head of `tail_tip` at p_b 0.211. The 44 other vertices with a share of the
  tail bones give it to `hips`.
- **Key.** The key `bind_tail` moves each tube vertex of the bind to the same place along a path
  and the same offset in the moving frames of the line and of the path. The path is a
  Catmull-Rom curve from the bind root of the line through the points below (units, relative to
  the root, studio axes): down the back, onto the seat behind the haunch, and to the left back
  corner of the seat. Each vertex moves by smoothstep(0, 0.03, p), then 3 Taubin rounds with the
  same share.

```text
(0, -0.07, -0.02) (0.01, -0.134, -0.04) (0.05, -0.147, -0.055) (0.09, -0.148, -0.05)
(0.12, -0.148, -0.015) (0.125, -0.146, 0.035)
```

The tube of the bind lies from x -0.038 to 0.147, from y 0.134 to 0.401 (the seat top 0.135), and
from z -0.091 to 0.064, so it lies on the seat (back edge -0.1) behind the haunch. With the two
rigid bones only, the tail hung behind the seat.

**Lids.** A lid on each eye: 13 × 13 points from psi -60 to 60 degrees and lam -38 to 60 degrees
(38 degrees in and 60 out, the right lid mirrors the range) at 1.15 ball radii, and a lower strip
at 1.12 radii, 156 quads on each side, held turned up 110 degrees into the head. Before the lids,
the ball faces with each corner more than 135 degrees from the open eye, or with a corner across
the middle plane by more than 0.003 units, go, and the middle and the radius of each ball come
again from the ball vertices that stay (the middle of the export). The eyes lie close to the
middle plane, so 14 points of the left open lid and 15 of the right reach over it: each moves onto
the plane x = ±0.002 on its own side at the same distance from the middle of its ball. In the 21
steps of the blink, no open lid point, side edge, or back edge leaves the head, and the lower
strip of the closed lid lies under the head. The lid faces take the UVs of the gray patch at UV
(0.0409, 0.7373) at 0.3 UV for each unit, and the row `head` 1.

**Eyes.** The eyes keep the eye paint of the source ("Color map" below) at the size of the
source: in the front view each eye opening is 0.160 of the head width at the eye line. The
source paints a light in each pupil, so the eyes take the `varnish` finish and no eye light: with
the `eye` finish, each eye showed two lights.

**Color map.** `tools/cat-maps.py` writes `cat-color.webp` and `cat-normal.webp` from the source
maps and the rig file:

```text
uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/cat-maps.py
```

It keeps the colors of the source, but for a small step of the gray fur from sRGB (113, 104, 104)
to Oklab L 0.44, C 0.03, h 260 (`GRAY_FUR`). In an even gray light (Eevee), the gray fur of the
source FBX is Oklab L 0.48 with almost no chroma. With the source map, the warm light of the stage
and the fill light of the close views made it L 0.62, C 0.051, h 55, a light tan, and with the
step it is L 0.60, C 0.039, h 54 in the close view, and L 0.50, C 0.052, h 55 in the hall view
(`close-views play --at cat --no-fill --pause --time 6`). The cream white, the pink, the black,
the brows, and the mouth line keep the paint of the source.

- **Iris move.** `center_irises()` moves each iris to the middle of the opening in the view of
  the play: in the play moments of the violist the head turns up 15.7 degrees, and the front
  camera of the test page looks down 7.4 degrees at the eyes (`gaze_targets()`). The target then
  turns 6 degrees out and 5 degrees up. The iris of the cat is large, and its inner side lies
  under the lash line, so a mirror of the iris paint left seams. The tool paints the iris as the
  median source color of each ring of 1 degree about the pupil, and copies the pupil with its
  light from the source. The old place of the iris takes the median white of its row of the
  front picture. The left iris moves 11.9 degrees and the right 11.0 degrees on the ball.
- **Round iris.** `far_eyes()` of the fox and the rabbit then makes the moved iris round about its
  pupil from the clean directions of the source iris, at the iris and pupil radii of the source
  (27.5 and 16.5 degrees on the left, 29.5 and 18.5 on the right), with no shade of the iris,
  the ring, or the white. Each pupil keeps its painted light (`PAINTED_LIGHT`).

**Normal map.** Each x, y tilt of the normal map of the FBX limited to 0.2 (1.23 % of the
texels), a box scale to 1024 pixels, the tilts times 4 (`NORMAL_MAP_GAIN` of `src/scene/fur.ts`)
in red and green, 255 in blue, and `cwebp -q 60 -sharp_yuv -m 6` (libwebp 1.5.0).

### History

The second Tripo P2 cat (FBX SHA-256
`d9b38bf098e744e96da28e94abdb00f19b459654e67531b97072d58ad2ac57ff`) had a hand rig made in
headless Blender: arm and knee rings, paw turns, the crease 55, a Taubin relax, longer legs, a
thicker trunk, a larger head, a tail on the seat (the key `bind_tail`), its own eyes at 0.75 of
their size with blink lids, and the color map and normal map of its FBX. The third mesh comes from
a new sheet, and the steps above repeat that work on it. The old files and the steps of each edit
are in the git history of this folder, at 53a440d56.

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

`tripo-hand/` holds a candidate body ("Candidate hand rig" below): a hand rig of the Tripo P2 mesh
`tripo-p2/cat.fbx`, made in headless Blender with no arm cut and no arm stretch.

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

`tripo-hand/` holds a candidate body ("tripo-hand/cat.blend" below): a hand rig of the Tripo P2
mesh `tripo-p2/cat.fbx`, made in headless Blender with no arm cut and no arm stretch.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/cat.fbx`, `tripo-p2/cat.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/cat.blend` | Made in headless Blender 5.2 from `tripo-p2/cat.fbx` (below). License as the FBX file | The scripted edits below |
| `tripo-hand/cat.rig.glb` | Export of `tripo-hand/cat.blend`. License as the FBX file | `pnpm rig-export cat --blend assets/models/cat/tripo-hand/cat.blend --out assets/models/cat/tripo-hand/cat.rig.glb` |
| `tripo-hand/cat.rig.json` | Text summary of the export, for diffs | The same run |

### tripo-p2/cat.fbx

A grey cat with a white bib and white paws in a T-pose, made with Tripo P2: quad faces, arm tubes
of 8 vertices around, and leg tubes of 11 and 12 vertices around. The FBX file keeps the quads.
The folder `cat.fbm/` holds its color map and its normal map. The Tripo download names them
`tripo_rgb_a77bbd2f-f3f2-4b78-b59e-8a3f5a0b090d.jpg` (now `cat_basecolor.jpg`) and
`tripo_normal_8eea86d6-e999-412c-bf36-703abd06872e.jpg` (now `cat_normal.jpg`). The FBX file links
the maps by the folder of the download, so the import finds no map, and each tool takes the path
of the map. The roughness and metallic maps of the download are not kept.

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary |
| Contents | One mesh object, with no armature and no animation. 3,293 vertices and 3,597 faces: 2,930 quads and 667 triangles (6,527 triangles), no n-gon. One UV layer |
| Parts | 15 parts: the body (2,989 vertices), two eyeballs (49 and 47 vertices), eight whisker strips at the muzzle (17 to 19 vertices each), two brow whisker strips (16 vertices each), and two small strips over the eyes (15 vertices each). No vertices merge at 1e-5. 86 open edges in 23 loops: the 2 eye sockets and the open ends of the strips. 47 edges have more than two faces: the lip lines and the lid lines around the eyes |
| Box | In the studio units (1 unit from the soles to the ear tips): x ±0.3373 (the paw tips) and z -0.228 to 0.228 (the tail curl and the whisker tips). The cat faces -y in Blender. The tail hangs down behind the legs, and its tip curls back and to the left (a mirror gap of 0.076 units) |

| File | Size | Pixels | SHA-256 |
|---|---|---|---|
| `cat.fbx` | 223,084 bytes | | `d9b38bf098e744e96da28e94abdb00f19b459654e67531b97072d58ad2ac57ff` |
| `cat.fbm/cat_basecolor.jpg` | 2,733,041 bytes | 4096 × 4096 | `e525e433ca2b227e40bd496da79523417cb99d18e3b00433cdc53322bfd1959b` |
| `cat.fbm/cat_normal.jpg` | 1,424,367 bytes | 4096 × 4096 | `22219eb8d6e48d50cf7cfb5ef50a47d94a6b53f922420ffb2c86908166035ae2` |

The color map paints a full eye on each eyeball: a black slit pupil, a green iris with an amber
ring, a white light, and a dark rim. It paints a light spot over the inner end of each eye, a
white muzzle, a pink nose, and pink inner ears.

### tripo-hand/cat.blend

The candidate hand rig of the Tripo P2 mesh (design 4.4, "Hand rig"), made in headless Blender 5.2
(`blender -b --factory-startup`) by scripted point edits, in the order below. The arms and the
legs keep the form and the length of the source: no cut, no split from the trunk, and no stretch.

| Item | Value |
|---|---|
| Origin | Made in Blender 5.2 from `tripo-p2/cat.fbx` |
| License | CC BY-NC 4.0, as the FBX file |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the ear tips, the soles at z = 0, the cat faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `cat`: 3,423 vertices and 3,727 faces (3,060 quads and 667 triangles, 6,787 triangles), flat faces, and the surface of `sa.add_surface()`. 89 faces are gloss (the pink nose). The two eyeballs of the source sit in their sockets, and their 100 faces have the face attribute `eye`. The UV map of the FBX |
| Armature | `cat_rig`: the 30 body bones, `tail_tip`, and the 20 arm segments and helpers of the simple route, at the joints of `tools/mesh-rigs/simple/cat-tripo.json` (shoulder x 0.072, elbow 0.172, wrist 0.245, fingers 0.295, tip 0.337). The Action `bind` holds the seated bind of the bind rules of that config, with no bind supination. The properties `palm` (a palm for each side), `hinges`, and `seat` |
| Facts | `height` 1.117714 (the shoulder joints at 0.65 u, 1.71956 m for each unit, so that H is 0.339375 m, the H of the cat of `cat.rig.glb`), `crease` 55, `seatWidth` 0.46 |
| Eyes | The eyeballs of the mesh. No eye objects, so the app adds no bead eyes |

The edits, in the order of the work (`sa` is `tools/blender/studio_armature.py`):

- **Import.** `sa.import_source('assets/models/cat/tripo-p2/cat.fbx', 1e-5)`: no vertex merges,
  1 unit from the soles to the ear tips. Each face is flat.
- **Arm rings.** Edge ring Subdivide (`bmesh.ops.subdivide_edges(bm, edges=<ring>, cuts=1,
  use_grid_fill=True)`) of the clean quad edge ring of 8 edges between two closed arm loops. The
  bands, by the x of their loops on each arm: 0.1388 to 0.1572, 0.1787 to 0.1951, 0.1951 to
  0.2122, and 0.2122 to 0.2295. Each arm now has a loop each 0.25 to 0.36 arm radii (radius 0.033
  to 0.029) from x 0.139 to x 0.2295, and 4 loops within one radius of the elbow.
- **Knee rings.** The same call on the clean leg bands of 11 edges: y 0.1287 to 0.1498 (1 cut) and
  0.1498 to 0.179 (2 cuts) of each leg. The knee joint is at y 0.165, and the knee has loops at y
  0.129, 0.139, 0.150, 0.160, 0.169, and 0.179.
- **Rings with no split.** These bands stop at a triangle or a pole, so they take no split: the
  upper arm root from x 0.092 to x 0.139 (poles 2088, 2103, 2104, 2152, and 2168 on the left), the
  wrist and the paw from x 0.2295 (poles and triangles at the digit roots), the leg band at y 0.179
  to 0.242 (pole 1914), and the haunch from y 0.297 (poles).
- **Surface.** `sa.add_surface(cat, 'cat', 'assets/models/cat/tripo-p2/cat.fbm/cat_basecolor.jpg',
  eye_fans=False, config=<cat-tripo.json>)`. 89 faces of the pink nose are gloss.
- **Eyes.** The 100 faces of the two eyeballs (the loose parts in the eye box of the config) get
  the face attribute `eye` (BOOLEAN, FACE) and the colors `color` and `color_base` `#15110e` (the
  eye color of the app). The export then gives `ownEyes`, and the app adds no bead eyes.
- **Armature.** The armature of the config, as `sa.build_armature()` makes it, with a palm for each
  side: the palm of the config, (-0.3949, -0.9151, 0.0815), and its mirror on the right.

The weights, in the order of the work, in the rest pose:

1. Automatic Weights, then Limit Total 4 and Normalize All (`sa.skin_mesh(copy, cat_rig,
   auto=True)`), on a copy of the mesh with no loose part and with no face on an edge of more than
   two faces (135 faces). On the full mesh, bone heat finds no solution. Each vertex takes the row
   of its copy with `sa.set_weight_row()`. 24 vertices of the face that the copy does not hold
   take {`head` 1}.
2. Arm rows: each vertex of each arm from x 0.088 to the wrist takes one exact row with
   `sa.set_weight_row()`, by its x (left arm). A row holds a clavicle share, an elbow helper share,
   and a wrist helper share, linear between the control rows below. The rest of the row goes to
   the 4 roll segments of the upper arm (x below 0.172) or of the forearm: segment k takes the
   share at (k + 0.5) / 4 of the part, with a linear ramp between two segments (the roll split of
   the simple route). The arm root loops at x 0.082 and 0.087 keep the automatic weights.

   | x | 0.088 | 0.10 | 0.11 | 0.125 | 0.14 | 0.145 | 0.16 | 0.18 | 0.195 | 0.21 | 0.222 | 0.235 |
   |---|---|---|---|---|---|---|---|---|---|---|---|---|
   | Clavicle | 0.40 | 0.25 | 0.12 | 0.04 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
   | Elbow helper | 0 | 0 | 0 | 0 | 0 | 0.25 | 0.75 | 0.75 | 0.25 | 0 | 0 | 0 |
   | Wrist helper | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.25 | 0.75 |

3. Paws, by rows across the paw, by the place along the rest forearm axis (as the x of the axis
   point of the left paw): 0.24 to 0.255 {`wrist` 0.5, `hand` 0.5}, 0.255 to 0.278 {`hand` 1}, the
   knuckle row 0.278 to 0.30 {`hand` 0.5, `fingers` 0.5}, and from 0.30 {`fingers` 1}.
4. The vertices of the loose parts (eyeballs and whisker strips), of the gloss nose, and of the
   eyeballs take {`head` 1}: 396 vertices.

The trunk, the neck, the head, the ears, the hips, the legs, and the tail keep the automatic
weights. The scripts of the session (`scratch/cat/` of the worktree, which git ignores) are not in
the repo.

**Arm twist.** In the moments of the violist, the roll of each upper arm (from the clavicle) and
the twist of each forearm (the paw from the upper arm) reached 125° on the left forearm in the
play and -69° at rest, and 113° on the right forearm. Three changes of the rig and the hold of the
violist (`CAT_HOLD` of `src/pose/bowed-rig.ts`) make each part take 45° or less:

- **Paws turned.** Before the surface, each vertex past the arm loop at x 0.2295 turns rigidly
  about the rest forearm axis (from the forearm joint to the wrist joint), by whole ring steps of
  45°: 45° on the left (1 step) and 90° on the right (2 steps), 318 vertices on each side. The 8
  quads of the band from the loop at x 0.2209 to the loop at x 0.2295 go, and new quads join the
  two loops with the same step offset, with the UVs of the old quads. A turned vertex of the far
  loop lies at most 0.0052 units (left) and 0.0081 units (right) from the old place of its
  vertex. The joints of `fingers_L` and `fingers_R` of the config turn with the paws.
- **Palms.** The property `palm` holds the palm of the config, (-0.3949, -0.9151, 0.0815) in the
  studio axes with x mirrored on the right, turned by the same angle about the same axis: left
  (-0.241408, 0.611609, -0.75343), right (0.479657, -0.858879, 0.179598) in Blender axes. The
  rolls of the arm bones follow these palms.
- **Elbow axis.** The property `hinges` of the right arm is the axis of the config turned -30°
  about its bind upper arm: (-0.460806, 0.475631, 0.749288). With +30°, the right upper arm rolls
  -81° at the frog.

**Smooth surface.** Two changes make the candidate smooth (`reports/2026-11-10-cat-hand-r6/`,
which git ignores). With the crease 55 (the facts), the arm loops of 8 vertices, 45° apart, shade
round:

- **One color for each region.** The face colors of `add_surface()` took the shade that the
  Tripo texture bakes, so the fur showed many tones on each part. Each face now takes the color
  of its region, by the lightness L, the saturation S, and the hue h of its old color (HLS, sRGB):
  pink (h below 16° or above 340°, S at least 0.38, and L above 0.35: the inner ears, the pads,
  and the mouth, 416 faces, sRGB 198, 140, 122), white (L at least 0.6: the bib, the muzzle, and
  the paws, 1,144 faces, 218, 184, 164), and the grey fur (1,826 faces, 135, 115, 106). Each region
  takes the color of its face at 0.6 of its luma range. The gloss nose, the eyeballs, and the faces
  of the loose parts keep their colors. The color map of round 7 replaces the face colors.
- **Relax.** Ten Taubin rounds (0.5, then -0.53) on the body, with each move clipped to 0.01
  units, move the vertices at most 0.01 units (mean 0.0018, 26 clipped). The eyeballs, the loose
  parts, the gloss nose, the open edges (the eye sockets), and the vertices of the edges of more
  than two faces (the lip and lid lines) stay. The bones and the weights stay.

**Seat.** A seated violist sits with most of each thigh on the seat, and the front edge of the
seat a little behind the knee. The tail curls on the seat beside the haunch. Three changes give
this seat:

- **Legs of the bind.** The leg turns of the config (`studio.legTurns`, `uv run --no-project
  --with numpy python -I tools/rig/leg_turns.py <config> 15 8 12`) turn each thigh to a slope of
  15° below the horizontal and 8° out, and each shin 12° forward of the vertical, so that the knee
  angle from the side is 117°. Each foot keeps its turn in the world, so the sole stays flat.
- **Seat of the rig.** The property `seat` reaches from z -0.09 to z 0.1714 (studio axes, +z
  forward): the front edge lies 0.045 units (7.7 cm) behind the knee joint of the bind, so that
  70 % of the thigh (hip joint to knee joint) lies on the seat. The back edge lies 0.06 units
  behind the haunch, so that the root of the tail lies on the seat.
- **Tail.** The tail has two bones: `tail` from the root at y 0.43 (source) to the bend at
  (0.005, 0.33, -0.045), and `tail_tip` to the tip (0.03, 0.17, -0.205). The bend lies 0.1 units
  below the root, so that the root bone goes down the back of the haunch to the seat. The bind
  turns them to the directions of `studio.tailBind` of the config: the root down, back, and a
  little to the left, (0.25, -1, -0.6), and the tip forward and to the left, (0.85, -0.15, 0.5), so
  that the tail lies on the back of the seat and its curl turns over the left side of the seat.

**Belly.** The raised thighs pull the lower belly back in the bind, and its faces pointed down by
up to 58° (12 of 32 faces of the lower belly by more than 30°): a dark crease above the thighs
from the front. The key `bind_belly` moves the bind of 40 chosen vertices, with this call:

```python
import bind_edit as be  # tools/blender/
# S: each vertex with rest z (Blender) from 0.38 to 0.52, rest y below 0, theta = atan2(|x|, -y)
# at most 60 degrees, and a distance from the z axis below 0.2.
# Four rounds: P[i] += 0.5 * ((mid - P[i]) . n[i]) * n[i] for each i in S at the same time.
# mid: the middle of the mean of the edge neighbors above and the mean of those below (rest z
# more than 0.01 apart). n: the vertex normal of the bind before the key.
# Then each vertex of S moves along -y (forward) in the bind, with zb its bind z, by
# 0.02 * ss(0.33, 0.37, zb) * (1 - ss(0.42, 0.47, zb)) * (1 + cos(pi * theta / 60 deg)) / 2.
be.add_bind_move(body, rig, P_after - P_bind, 'bind_belly')
```

The largest move is 0.0179 units, and the mean is 0.0070. No face of the lower belly points down
by more than 30° (largest 29.1°, mean 13.8°). The key `bind_belly` is the only key `bind*`.

**Longer legs.** With the seat of "Seat", the seat height of the app was 0.244 m, against 0.298 m
on the cat of main: the knee of the Tripo cat is low. The shins of the mesh are now longer, and
the feet, the thighs, the hips, the trunk, the tail, the arms, and the head keep their form and
size. One scripted point edit in the rest pose, after the paw turn, moves each vertex only along
the height y (studio axes) by its height y in the source:

```text
g(y) = y + (k - 1) G(y),  k = 1.38,  G(y) = the integral from 0 to y of b
b(y) = 0 below y 0.055, a smoothstep up to 1 at y 0.075, 1 to y 0.15,
       a smoothstep down to 0 at y 0.175, 0 above y 0.175
vertex: y += (1 - t) (g(y) - y) + t * rise,  rise = (k - 1) G(1) = 0.03705
t: the tail share, ss(-0.003, -0.012, z) * (1 - ss(0.42, 0.46, y))
```

The scale along each leg thus goes smoothly from 1 at the ankle to 1.38 on the shin and back to 1
at the knee, so no loop spacing jumps. Each point above y 0.175 and the whole tail move up by
0.03705 units (the rigid part of the body). The joints of the config take the same map. Before the
edit, an edge ring Subdivide with 1 cut splits each of the two shin bands of 11 edges, y 0.0674 to
0.0958 and 0.0958 to 0.1287 of each leg, so that the longer shin keeps a loop each 0.3 to 0.45
leg radii.

| Measure | Before | After | Main cat |
|---|---|---|---|
| Shin, knee joint to ankle joint | 0.115 units (19.8 cm) | 0.152 units (26.2 cm) | 22.3 cm |
| Thigh, hip joint to knee joint | 26.9 cm | 26.9 cm | 24.0 cm |
| Seat height of the app | 0.244 m | 0.305 m | 0.298 m |

The values in the paragraphs above "Longer legs" are in the rest places before this edit: add
0.03705 to each height above y 0.175 (studio y, Blender z), except the belly key, whose heights are
after it.

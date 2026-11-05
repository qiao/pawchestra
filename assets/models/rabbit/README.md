# Rabbit model

This folder holds the T-pose source meshes of the rabbit, the rig made by hand in Blender
(`rabbit.blend`), and the rigged copy that the export writes from it. The app does not serve these
files. It loads the module `src/models/studio/rabbit.ts`, which this chain writes:

```text
tripo/rabbit.fbx                   source mesh with quad faces
   │  work by hand in Blender (design 4.4, "Hand rig")
   v
rabbit.blend                       mesh, face colors, armature, weights, eyes, bind, keys
   │  pnpm rig-export rabbit
   v
rabbit.rig.glb + rabbit.rig.json   rigged mesh and its text summary
   │  pnpm studio-body rabbit
   v
src/models/studio/rabbit.ts        studio body of the app
```

`rabbit-arms.glb` and `rabbit-weights.json` are the inputs of the old chain of
`tools/mesh-rigs/rabbit.json`. `pnpm rig-mesh rabbit` stops now, because the folder holds
`rabbit.blend`. Each value of the hand rig lives only in `rabbit.blend`, and the tools read it from
the export (design 4.4, "Hand rig"). `docs/agents/rigging.md` gives the steps of a hand rig. The
target of the form is the sheet `docs/reference/rabbit-views.png`.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `rabbit-tpose.glb` | Source mesh (below) | None |
| `tripo/rabbit.fbx`, `tripo/rabbit.fbm/` | Source mesh with quad faces, and its four textures (below) | None |
| `rabbit-arms.glb` | Copy of `rabbit-tpose.glb` with rebuilt arms. License as the source | `arm_rebuild.py rabbit --factor 1.18` |
| `rabbit-weights.json` | Weights of the same Blender run. License as the source | `arm_rebuild.py rabbit --factor 1.18` |
| `rabbit.blend` | Made by hand in Blender from `tripo/rabbit.fbx` (below). License as the FBX file | None: edit it in Blender |
| `rabbit.rig.glb` | Export of `rabbit.blend`. License as the FBX file | `pnpm rig-export rabbit` |
| `rabbit.rig.json` | Text summary of the export, for diffs | The same run |

## rabbit-tpose.glb

The mesh has no skeleton. The arms stand out level to the sides, free of the trunk.

| Item | Value |
|---|---|
| Size | 13,759,212 bytes |
| SHA-256 | `a6dbee19e81407e6a88acb302f20a734c0021a27986ba48b999c3832caca7fea` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,123 triangles and 4,709 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial`, double-sided, with a base color texture (8.0 MB) and a metallic-roughness texture (5.5 MB), each a PNG of 4096 × 4096 pixels |

The values below are in the units of the studio: 1 unit from the soles to the ear tips, the soles
at y = 0, +z forward, and +x the left side of the animal. The mesh is 1.902 units of the file
high, and the weld at 1e-5 gives 1,566 vertices in one part. 6 edges are open, 14 edges have more
than two faces, and 484 faces have a corner angle below 10°.

- The box is x -0.358 to 0.358, y 0 to 1, and z -0.162 to 0.158.
- The arms stand out level at y 0.47 to 0.53, free of the trunk from |x| 0.087, with the paw
  tips at |x| 0.357. The pads of each paw face down (the palm hint of the config).
- The legs part below the crotch at y 0.18. The feet reach forward to z 0.086.
- The fur is light grey, with pink inner ears, a pink nose, and pink paw pads. The black eyes
  are at y 0.646 to 0.683 and z 0.067 to 0.095. Thin whiskers leave the muzzle at y 0.57 to 0.62,
  out to |x| 0.17.
- The ears stand from y 0.76 to the top. A round tail ball sits at the back, at y 0.25 to 0.34,
  out to z -0.162.

```bash
shasum -a 256 assets/models/rabbit/rabbit-tpose.glb
```

## tripo/rabbit.fbx

A mesh of the same rabbit in the same T-pose, made with Tripo: quad faces, and arm and leg tubes
of 8 to 16 vertices around. Its arm sections and its head width are those of `rabbit-tpose.glb`
within 2 %. The FBX file keeps the quads (a GLB file of the same mesh holds only triangles). The
folder `rabbit.fbm/` holds its textures, and the FBX file links them by name.

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary |
| Contents | One mesh object `output_unwrapped`, turned 90° about X (the FBX axes have Y up), with no armature and no animation. 2,428 vertices and 2,638 faces: 2,217 quads and 421 triangles (4,855 triangles). One UV layer. One material that links the four textures |
| Parts | One connected part, with the whiskers. No vertices merge at 1e-5. 10 open edges: 3 at the root of each whisker group, 1 at each side of the nose, and 2 under the left paw. 7 edges have more than two faces |
| Box | After the turn: x ±0.3564, y ±0.1592, and z 0 to 0.998 in the units of the file. The rabbit faces -y |

| File | Size | Pixels | SHA-256 |
|---|---|---|---|
| `rabbit.fbx` | 217,104 bytes | | `6ee4f87a767c16e80576e976244b013391857b53ef33e4a59996a6f120a85c44` |
| `rabbit.fbm/rabbit_basecolor.jpg` | 889,716 bytes | 4096 × 4096 | `5c70fcccdbf4a272d9844e6f3f5ff4820f82f76062e5318cda85e99f77c3fe10` |
| `rabbit.fbm/rabbit_metallic.jpg` | 355,829 bytes | 2048 × 2048 | `cf96150d0a4f567b21d6d09568f862399939595f11ed4e7c10e0da5ef810e3df` |
| `rabbit.fbm/rabbit_normal.jpg` | 734,946 bytes | 2048 × 2048 | `e91b3d0f6c2a627e704f91778597ee0674ab9132a026b59be2db835545f812ee` |
| `rabbit.fbm/rabbit_roughness.jpg` | 191,192 bytes | 2048 × 2048 | `47e6fbac3a29e63b8d677bfc13311d399a6f4572ce7356e5693f4327f4302d94` |

## rabbit-arms.glb and rabbit-weights.json

The inputs of the old chain of `tools/mesh-rigs/rabbit.json`.

| Item | Value |
|---|---|
| `rabbit-arms.glb` | 922,252 bytes, SHA-256 `1cf55635efe10f9124c26ec0160366d144055c051a53fc7c8822464ac5a93dc1` |
| Mesh | 2,022 vertices after a weld at 1e-5, 4,035 triangles: on each arm a tube of 14 quad rings of 16 vertices from 0.2 of the upper arm to 0.1 of the paw, joined to the trunk and the paw with Bridge Edge Loops, with Beautify Faces and Collapse Edges on the bridge triangles |
| Material | One material with one base color JPEG of 4096 × 4608 pixels: the atlas of the source, and a strip of 512 pixels on top with the fur color of the source arms, baked onto the new faces. No metallic-roughness texture |
| `rabbit-weights.json` | 446,496 bytes, SHA-256 `45af4710d2b4c2b9127e6ed17bfb3a96ef93710bea54ceb42af09e6d8f32e8b4` |
| Weights | The automatic weights of Blender with the weight rules of the script, on the studio bones and the arm segments and helpers (`armSegments` of the config), for `paintedWeights` of the config |

`tools/blender/arm_rebuild.py` puts new quad faces on each arm of `rabbit-tpose.glb` from the
shoulder line to the wrist, with the settings that it finds from the joints of the config and from
rays through the mesh. The new arm surface lies on the old one. The faces of the paws, the trunk,
the legs, the tail, and the head are the faces of the source. The arms are 1.18 times longer from
the shoulder line (`--factor 1.18`), because a rig with arm segments does not stretch the arms.
With this factor, the left paw reaches the nut of the violin of the rabbit (`armFactorNote` of the
config). A run gives the same bytes:

```bash
blender -b --factory-startup -P tools/blender/arm_rebuild.py -- rabbit --factor 1.18
shasum -a 256 assets/models/rabbit/rabbit-arms.glb assets/models/rabbit/rabbit-weights.json
```

## rabbit.rig.glb

`pnpm rig-export rabbit` writes it from `rabbit.blend`, with the text summary `rabbit.rig.json`. A
run gives the same bytes.

| Item | Value |
|---|---|
| Size | 729,816 bytes |
| SHA-256 | `cd0675a5705624d0dc72926eb04a01e34a7ac20e6d2e424e3880dc075e0d8e90` |
| Form | The mesh of `rabbit.blend` in its seated bind (below). The seat top is 0.250 m high, and the chair is 0.42 m wide and 0.237 m deep, as the chair of the old rabbit |
| Faces | 5,877 triangles, of them 75 gloss (the nose) |
| Extras | `eyes`: the middle, the direction, and the size of each eye object. `body`: the facts of the body of the armature |
| Shapes | The arm-down shape of each arm and the straight legs of each side, which the export calculates, and the keys `arm_raise_R`, `arm_raise_R2`, and `arm_raise_L` (below) |

## rabbit.blend

The hand rig of the rabbit (design 4.4, "Hand rig"), made in Blender 5.2 from `tripo/rabbit.fbx`
in headless runs: the mesh, the colors, the armature, the weights, the pea eyes, the seated bind
(the Action `bind`), its keys, and the facts of the body. The calls below name the functions of
`tools/blender/studio_armature.py` (`sa`), `studio_eyes.py` (`se`), and `rig_mesh.py` (`rm`).

| Item | Value |
|---|---|
| Size | 338,250 bytes |
| SHA-256 | `55d15a0a9e0ef46b1c586ecd986b7a8c7008d4ce8baa8f05d8ffc305fb848749` |
| Origin | Made by hand in Blender 5.2 from `tripo/rabbit.fbx` |
| License | CC BY-NC 4.0, as the FBX file |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the ear tips of the source, the soles at z = 0, the animal faces -y, and +x is its left side. The longer legs lift the body 0.0672 units, so the ear tips are at z = 1.0672. No object has a transform |
| Mesh | One object `rabbit`: the FBX mesh with the turn of the file applied and the scale 1.001957, with flat faces and no custom normals, the edits below, and the surface of `sa.add_surface(rabbit, 'rabbit', 'assets/models/rabbit/tripo/rabbit.fbm/rabbit_basecolor.jpg', eye_fans=False)`: the face attributes `color` and `color_base` and a gloss nose. 2,939 vertices and 3,185 faces (2,692 quads and 493 triangles, 5,877 triangles), 42 faces of them gloss |
| Eyes | The objects `eye_L` and `eye_R` of `se.place_eyes()`, children of the bone `head`, with the size of the pea eyes of the old module (0.200104 units, 0.286547 m) and the direction (±0.7526, -0.6512, 0.0974), the mean normal of the dark faces of the old eyes. Each middle lies where the axis through the middle of the old eye meets the smooth socket in the bind: (±0.0688, -0.0644, 0.7258) |
| Materials | The slots `fur` and `gloss`. Each reads the face attribute `color` |
| Armature | One object `rabbit_rig`: the 30 body bones with no tail tip, and the 20 arm segments and helpers (helpers 0.03 units long), with the parents of `STUDIO_PARENTS`, the rest in the T-pose, and the properties `palm` (0, -0.0201, -0.9998), `seat`, `hinges`, and the facts of the body (below). The Z axis of each bone points to its hint (`sa.fix_rolls(rabbit_rig)`). The Action `bind` holds the seated bind at frame 1 (below) |
| Shape keys | `Basis`, `bind_sit`, `bind_crease`, `bind_lap`, `bind_neck`, `bind_nape`, and `bind_collar` at the value 1, and `arm_raise_R`, `arm_raise_R2`, and `arm_raise_L` at the value 0 (below), each with its custom property on the mesh |
| Weights | Automatic weights and the fixes below, at most 4 bones on each vertex, each sum 1. The upper arm, the forearm, the forearm twist bone, and `root` hold no weight |

The edits of the mesh, in the order of the work:

- **Import.** No vertices merge at 1e-5. The 10 open edges stay (the whisker roots, the sides of
  the nose, and a slit under the left paw).
- **Arm tubes.** The arm tube of the FBX mesh has rings of 8 to 13 vertices with long triangles,
  0.035 to 0.04 units apart. The tube from the ring of 8 vertices at the shoulder (|x| 0.1223)
  to the ring of 16 vertices at the wrist (|x| 0.2954) goes, and a new tube takes its place: 15
  rings of 16 vertices in planes of one x, 0.01275 units apart (0.43 arm radii), with quads, and
  one quad and one triangle for each edge of the shoulder ring. Each new vertex lies at its angle
  on the round section of the source (a Fourier series of order 3 of 64 rays, scaled to the
  perimeter of the source section), with the UV of the source surface there. The tube is 1.18
  times longer from the shoulder ring, as the arms of the old rig, so that the paw keeps the reach
  of the rabbit hold (0.385 m, old 0.3886 m): the paw moves out 0.0312 units. The upper arm is
  1.1 times as thick as the source at its middle (in from the shoulder ring over 0.4 of the upper
  arm, out to 1.0 at the wrist ring). The mid upper arm girth is 1.09 of the width of the head at
  the eyes (`rabbit-tpose.glb` 0.99).
- **Knee rings.** Two loop cuts at each knee: halfway between the rings at up 0.10 and 0.129,
  and between the rings at up 0.072 and 0.10. 4 rings lie within one leg radius of the knee joint.
- **Colors.** Each face is fur (Oklab chroma 0.02 or less), pink (0.035 or more on a foot, 0.04
  on a paw, 0.045 on an ear or the nose), or mixed. A mixed face takes the class of most of its
  edge neighbors, and a thin pink triangle (a corner below 25°) with at most one pink neighbor
  becomes fur. Each pink face takes the most common pink of its region, the gloss nose one pink,
  a mixed fur face the fur of its neighbors, and the whiskers the main fur color: 454 faces.
  Then the plain fur of the attributes `color` and `color_base` takes the move of `colors.tone`
  of `tools/mesh-rigs/rabbit.json` (`tone()` of `tools/blender/rig_mesh.py`: chroma 0.03 or
  less, the move fades out from the lightness 0.985 to 0.995, the rows [0.6, -0.02, 0.003,
  0.009] and [0.97, -0.028, 0.003, 0.009] of [L, dL, da, db] in Oklab, no bone kept), as the old
  rig did: 2,836 faces. The main fur goes from Oklab (0.979, 0.003, 0.007) to (0.951, 0.006,
  0.016), toward the cream of the fur swatch of `rabbit-views.png`. The pink faces have more
  chroma, so they keep their colors.
- **Eye sockets.** Each old eye is a ball with a textured eye in a groove. 56 and 54 vertices in an
  ellipse of 0.036 by 0.042 units around the middle of the dark eye faces (in the plane of the
  eye, within 0.03 units of it) take 10 rounds of the Smooth of Blender with the factor 0.5, with
  the ring around them fixed. A vertex moves at most 0.0103 units. The brow needs no edit: no edge
  above the eyes bends more than 29.3°, below the crease angle of 35°.
- **Legs.** An even offset of 0.012 units outward from the thigh axes (`offset` below), then the
  thighs are 1.75 and the shins 1.25 times as long along their bones, and each foot keeps its size
  (`rm.segment_stretch()`, by the leg weights). The offset fades in from 1.0 thigh lengths above
  the hip joint to 0.2 below it, and out from 0.8 to 1.1 thigh lengths. The back of the thigh
  keeps its place, and near the crotch the inner side keeps its place and the outer side grows
  1.15 times. The shin takes no offset. The body rises 0.0672 units, and the bones move with the
  mesh. The thigh factor is that of the old rig, and the shin factor is the shortest that puts the
  haunch of the bind on the seat top of 0.250 m (the old 1.49 put it at 0.272 m).
- **Flat quads.** 12 quads with a straight corner (above 179°), at the paw tops and the nose,
  split along the diagonal from that corner. Blender divided 5 of them into a triangle of no area,
  which folded in each pose.
- **Haunch cut.** The back of each haunch lobe was two large quads (up to 0.12 units high) that
  met in one corner on the seat, and from the back each lobe ended in a point there. After the
  bind keys up to `bind_collar`, the 12 faces whose corners all lie in the bind behind y 0.03,
  below 0.14 units above the seat top, at |x| below 0.15, with a shin and foot share below 0.5
  and a tail share below 0.85 (faces 99, 103, 110, 114, 429, 430, 440, 446, 1450, 1740, 1768,
  and 1977) take `bmesh.ops.subdivide_edges()` of their 31 edges (1 cut, grid fill, the corner
  type `INNER_VERT`), and `bmesh.ops.triangulate()` (`BEAUTY`) splits the 12 faces of more than
  four corners. The 39 new vertices (2900 to 2938) take the mean weights and keys of their edges
  (the interpolation of bmesh), at most 4 bones, so the bind does not move.

The seated bind and its keys, in the studio axes of the bind (x left, up, forward):

- **Bones.** The turns of `rm.bind_turns()` with the studio rules of `tools/mesh-rigs/rabbit.json`
  (the leg turns, the trunk 5.08° back, the straight arms at the bind upper arm) and the bind
  supination 115° (left) and 57° (right), the values of `pnpm bind-supination rabbit` on this rig
  (a second probe gives a change of 0.5°). Then `sa.drive_segments(rabbit_rig, key_frame=1)`.
  The largest paw twist p95 of the six roles goes from 159° to 135° on the left and from 92° to
  79° on the right.
- **Hips bone.** The tail of the hips bone lies 3° back from the vertical (0.0037 units), so that
  each thigh lies 9° off its line. At 5°, Blender stored each leg frame with a shear of 2.7e-5
  (the series of `vec_roll_to_mat3_normalized()` between about 2° and 6.3° off the -Y axis of the
  parent), and the export stops above 1e-5.
- **`bind_sit`.** `rm.sit()` with the rule `sit` of `rabbit.json` lowers the underside of the
  haunch onto a seat top 0.250 m above the soles (`most` 0.015, then a second `sit()` with
  0.005), with no `rm.crease_relax()`. 157 vertices move, at most 2.6 cm, and the tail ball
  keeps its form. The key is this move of the bind, turned back into the rest by the inverse of
  the blended skin of each vertex. With the back of the seat at -0.1396 units and the rule
  `crease` of `rabbit.json`, the back of the haunch dropped up to 7.7 cm into a column under the
  tail ball. After the haunch cut, the back of the haunch takes one oval in the bind, added to
  `bind_sit`: each vertex behind y 0.03, below 0.11 units above the seat top, at |x| below 0.17,
  with a shin and foot share below 0.5 and a tail share below 0.85 (49 vertices) moves along the
  ray from the middle (0, 0, 0.06 above the seat top) onto the ellipsoid with the radii 0.15
  (x), 0.105 (y), and 0.085 (up), by 1/3 at the border of the region and 2/3 one ring in, and no
  point goes below the seat top. 49 vertices move, at most 2.6 cm. From the back and the back
  diagonals, the lobes now go down to the seat in one round curve, and the tail ball keeps its
  form and its place. One small face on the seat (274, 284, 2912) turns over under the haunch.
- **`bind_crease`.** The folded faces of the front of the hips (up 0.15 to 0.29 units of the
  source, |x| below 0.14, in front of the trunk middle) take 60 rounds of the relax of the
  faces that turn more than 35° (each vertex moves halfway to the mean of its neighbors).
- **`bind_lap`.** The lower belly between the thighs (|x| below 0.06) moves forward onto the line
  from 0.105 units in front of the trunk middle at the hips (up 0.31 of the bind) to 0.08 units at
  the seat (up 0.23), less to the sides, then the moved vertices and their ring take 8 Taubin
  rounds (0.5, -0.53). 48 vertices move, at most 9.5 cm. The lower belly of the mesh turns down
  between the seated thighs, and the app showed it as a dark wedge at the crotch.
- **`bind_neck`.** Each vertex of the front of the neck between the chest and the chin (|x| below
  0.08) moves forward by 0.6 of its gap behind the line from the chest front (vertex 1628) to the
  chin front (vertex 689) at the middle, less to the sides, then 4 Taubin rounds. 27 vertices
  move, at most 4.1 cm. The round head sits on the chest, and the app showed the groove under the
  jaw as a dark band.
- **`bind_nape`.** Each vertex of the back of the neck (|x| below 0.09, with an arm share below
  0.3) moves back by 0.6 of its gap in front of the line from the upper back (vertex 1340) to the
  back of the skull (vertex 16) at the middle, less to the sides, then 4 Taubin rounds. 10
  vertices move, at most 3.9 cm. From behind and from the stage camera, the groove showed as a
  dark collar.
- **`bind_collar`.** The keys of the neck and the nape left the groove under the round head, and
  the app showed it as a dark collar under the chin and a dark band at the sides of the neck. In
  the bind, with the keys before it, each azimuth around the vertical line through the neck joint
  (0 at the front, +90 at the left) has a rim: the point of the largest radius where the head
  faces (head share 0.9 or more, no whisker) cross the half plane of the azimuth between the
  heights 0.64 and 0.75, smoothed over 5°. Each vertex below its rim (at most 0.004 under it,
  above the height 0.53, with an arm share below 0.2) moves out from the line to the cone that
  goes down and in from the rim with the slope 0.3 at the front and 0.12 at the sides and the
  back (the change from 30° to 70° of azimuth), only when the cone is out of it. The move fades
  out from 0.08 to 0.15 below the rim, with the arm share plus half the clavicle share from 0.03
  to 0.2, and on the violin side from the azimuth 10° to 25° on, up to 95°, and back from 115°.
  Then the moved vertices and their ring take 4 Taubin rounds (0.5, -0.53). 210 vertices move,
  at most 5.1 cm. The violin of the hold lies under the left jaw and its tail end against the
  left side of the neck: a fill there put the violin up to 4.3 cm deeper into the head in `pnpm
  pose-depth violinist`, and with the fade it goes 0.3 cm deeper (2.7 cm, before 2.4 cm). With
  no clavicle share in the fade, a face at the front of the right shoulder folded in 58 % of the
  play samples of `pnpm fold-probe violinist` (7 % before). The fill made the quad 2369 under
  the right jaw (296, 1781, 1380, 297) nearly flat in the bind, so a split along the diagonal
  1781 to 297 (`bmesh.ops.connect_verts()`, largest corner 131° in place of 172°) keeps its thin
  triangle from folding with the head.
- **Raise keys.** `rm.raise_shape()` relaxes the faces that fold in the pose of a rule of `pnpm
  raise-fit violinist`, on the bind, and the key is the move turned back into the rest by the
  inverse of the blended skin. The property holds the turn of the forearm (w, x, y, z, Blender
  axes) and the fade:

  | Key | Rule | Turn | Fade |
  |---|---|---|---|
  | `arm_raise_R` | 10 faces of the right inner elbow, the mean turn of the play (96° from the bind), `below` 0.3 | 0.6700, -0.4206, 0.5587, 0.2490 | 10° to 35° |
  | `arm_raise_R2` | 7 faces of the right inner elbow, 15° further, `below` 0 | 0.5442, -0.4754, 0.6315, 0.2810 | 20° to 30° |
  | `arm_raise_L` | 9 faces of the left inner elbow (89° from the bind) | 0.7130, -0.3972, -0.5274, -0.2360 | 15° to 25° |

  In `pnpm fold-probe violinist`, the right inner elbow faces folded in up to 93 % of the play
  samples and the left in up to 13 %. With the keys, the worst face folds in 77 %, the next in 48 %
  and less, and the left in 6 %. A key for a face at the front of the right arm root turned over
  no face in the pose of Blender, so the file has no such key.

The facts of the body:

- **`height` 0.807929.** The standing shoulder joints in the app, in meters: the joints of the
  mesh (up 0.497 of the source) raised 0.0672 units by the longer legs. Thus the scale stays
  1.43199 m for each unit, as for the old rabbit.
- **`crease` 35.** The crease angle of the fur, in degrees.
- **`backRoom` 0.0889.** The chair keeps the depth of the old chair (0.237 m). The body is less
  deep than the old body behind the front edge of the seat, so the room behind its back grows.

The head height `H` is 0.3027 m (old 0.3209 m): the head of the mesh from the chin to the top of
the skull. The old rig counted a part of the ear base. The file has no `headFloor`, because no
whisker or jaw vertex lies below the chin.

The property `seat` is the chair of `rabbit.json` with the back edge at -0.10 units (front -0.03,
half width 0.16), and `hinges` holds the elbow axes of `rm.bind_hinges()`.

The joints, in the studio axes of the source (x, up, forward), before the stretch of the legs:

- **Trunk and head.** The joints of `tools/mesh-rigs/rabbit.json`, with the head end on the top of
  the skull (0, 0.755, 0.022) and the ear tips (±0.138, 0.995, -0.06).
- **Arm.** The shoulder (0.075, 0.497, 0.010), the elbow (0.202, 0.4975, 0.0097) at 0.39 of the
  tube, and the wrist (0.3265, 0.5029, 0.0088) in the middle of the wrist ring. The fingers go
  from (0.3615, 0.501, 0.0083) to the paw tip (0.388, 0.495, 0.0088).
- **Leg.** The hip (0.072, 0.185, 0), the knee (0.066, 0.1156, -0.0057) in the middle of the knee
  ring, the ankle (0.067, 0.055, -0.025), and the toes from (0.085, 0.018, 0.045) to (0.09,
  0.008, 0.08).
- **Tail.** From (0, 0.29, -0.075) to (0, 0.29, -0.16), through the tail ball.

The fixes of the weights, in the studio axes of the source, before the stretch of the legs:

- **Thighs.** No thigh weight above up 0.23 or on the other side, then 6 rounds of Smooth from
  up 0.15 to 0.26.
- **Tail.** The ball alone takes the tail (within 0.06 units of (0, 0.285, -0.12), behind
  forward -0.085), then 2 rounds of Smooth of its root band.
- **Head, neck, ears.** No head weight on the shoulder tops (|x| above 0.07, up below 0.565), no
  neck weight above up 0.6, and no ear weight below up 0.765 or on the other side, each with 2
  rounds of Smooth of its edge. The gloss nose and the whiskers take the head bone alone.
- **Crotch.** After the leg stretch, 16 rounds of Smooth on the 152 vertices of the front of the
  crotch and the lower belly with a thigh share of 0.02 to 0.98 and |x| below 0.12.
- **Arms.** No wrist helper or forearm segment beyond |x| 0.34, 2 rounds of Smooth on the wrist
  band (|x| 0.31 to 0.345), the fingers keep half of their weight, 4 rounds on each elbow band
  (|x| 0.17 to 0.24), and 6 rounds on each arm root (|x| 0.06 to 0.14). The head weight of the
  vertices with a clavicle and arm share of 0.5 or more goes to the neck.
- **Neck sides.** No clavicle or arm weight on the sides of the neck under the jaw (up above
  0.585, |x| below 0.09), with 2 rounds of Smooth under it. With the bow arm raised and the head
  turned, a face there folded in 97 % of the play samples.
- **Arm rings.** `sa.ring_spread(rabbit, 'arm_L')` gave a spread of the shares of one ring of up
  to 0.08 in twist and 0.21 in the wrist helper. Each ring of the arm tube from its second ring to
  the last ring before the wrist (14 on each side) takes one mean weight: each vertex of a ring
  takes the mean weights of its ring, at most 4 bones. Each key keeps its move of the bind.

The legs, in meters (1.43199 m for each unit): in the seated bind, the seat top is 0.250 m (old
0.250 m), the hips joint 0.3285 m above the soles (old 0.352 m), the mid thigh girth 0.517 m (old
rig 0.456 m) and the mid shin girth 0.259 m (old 0.299 m). In the rest, the mid thigh is 0.542 and
the mid shin 0.256 of the width of the head at the eyes (before the legs 0.442 and 0.256).

## The module

`pnpm studio-body rabbit` writes `src/models/studio/rabbit.ts` from `rabbit.rig.glb`. The eye
objects of `rabbit.blend` give the pea eyes, and the armature gives the facts of the body. The
module is 46.5 KB after gzip (the old module 28.6 KB), because the mesh has 5,877 triangles in
place of 4,035.

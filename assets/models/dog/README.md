# Dog model

This folder holds the source mesh of the dog of main, a copy with patched arms, a copy with rebuilt
arms and its weights, a copy of that with the arm roots at the trunk, and the rigged copy. The app
does not serve these files. It loads the module `src/models/studio/dog.ts`, which this chain wrote
before the candidate hand rig ("Candidate hand rig" below) took its place:

```text
dog.glb                               source mesh
   │  tools/blender/arm_patch.py      round patch on the inner side of each arm
   v
dog-patch.glb                         `armSource` of tools/mesh-rigs/dog.json
   │  tools/blender/arm_rebuild.py    rebuilt arms and painted weights
   v
dog-arms.glb + dog-weights.json       `paintedWeights` of tools/mesh-rigs/dog.json
   │  point edits in Blender           arm roots at the trunk (dog-arms-clip.json)
   v
dog-arms-clip.glb                     `source` of tools/mesh-rigs/dog.json
   │  pnpm rig-mesh dog
   v
dog.rig.glb                           rigged mesh
   │  pnpm studio-body dog
   v
src/models/studio/dog.ts              studio body of the app
```

`docs/agents/rigging.md` gives the steps of the chain.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `dog.glb` | Source mesh (below) | None |
| `dog-patch.glb` | Copy of `dog.glb` with patched arms. License as `dog.glb` | `arm_patch.py` (below) |
| `dog-arms.glb` | Copy of `dog-patch.glb` with rebuilt arms. License as `dog.glb` | `arm_rebuild.py dog --factor 1.35` |
| `dog-weights.json` | Weights of the same Blender run. License as `dog.glb` | `arm_rebuild.py dog --factor 1.35` |
| `dog-arms-clip.glb` | Copy of `dog-arms.glb` with the arm roots at the trunk. License as `dog.glb` | None: point edits in Blender (below) |
| `dog-arms-clip.json` | The list of the edits of `dog-arms-clip.glb`, and `weightMoves` of the config. License as `dog.glb` | None |
| `dog.rig.glb` | Output of the rig. License as `dog.glb` | `pnpm rig-mesh dog` |

## dog.glb

| Item | Value |
|---|---|
| Size | 16,259,152 bytes |
| SHA-256 | `24d8087c4a0929f6349f73a6dbbf63d080f5e97d3f4e2f66aebd01474eb9f1e6` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,139 triangles and 4,420 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial`, double-sided, with a base color texture and a metallic-roughness texture, each a PNG of 4096 × 4096 pixels. The texture is an atlas of an automatic unwrap |

The values below are in the units of the studio: 1 unit from the soles to the top of the head,
the soles at y = 0, +z forward, and +x the left side of the animal. The mesh faces +z. The weld is
at 1e-5.

- The weld gives 1,574 vertices in one connected part. The mesh has 10 open edges and 5 edges
  with more than two faces. 139 faces have a corner angle below 10°.
- The box is x -0.280 to 0.280, y 0 to 1, and z -0.309 to 0.303. The dog is 1.903 units of the
  file high from the soles to the top of the head.
- The dog is a beagle that stands upright on its hind legs. Its arms hang down, out, and forward,
  with the paws in front of the belly at y 0.37 to 0.47.
- The eyes and the nose are dark faces of the head surface, with no shells. The long ears hang
  down beside the head to y 0.74. The tail tip is at z -0.31, 0.16 units above the floor.

## dog-patch.glb

| Item | Value |
|---|---|
| Size | 16,232,556 bytes |
| SHA-256 | `8a2b4cad31d94ce4372b02c36af2e1a6d9a1d6ccc592f60ec3dec8696fd8de2d` |
| Writer | Khronos glTF Blender I/O of Blender 5.2.2, from an import of `dog.glb` |

Each arm of the source joins the side of the trunk from the shoulder down to 0.80 of the upper
arm. The edit removes the faces that join each arm to the trunk below the cut top of the rig (22
on the left, 19 on the right). It closes the inner side of each arm with a round patch of 13 and 9
new vertices (36 and 26 faces). The hole of the trunk stays open, and the cut of the rig closes
it. No vertex of the source moves. The copy has 3,160 triangles. The script reads the joints of
the config, and the config of the rebuilt arms has the joints of the longer arms. So a run with the
config of commit `46ab1d72`, the last config with the joints of the source, gives the same bytes:

```bash
git show 46ab1d72:tools/mesh-rigs/dog.json > /tmp/dog-patch.json
blender -b --factory-startup --python tools/blender/arm_patch.py -- \
  /tmp/dog-patch.json assets/models/dog/dog.glb assets/models/dog/dog-patch.glb \
  '{"step":0.02,"freeR":false,"fade":[0.05,0.35],"scale":1.0}'
```

```bash
shasum -a 256 assets/models/dog/dog.glb assets/models/dog/dog-patch.glb
```

## dog-arms.glb and dog-weights.json

| Item | Value |
|---|---|
| `dog-arms.glb` | 1,123,888 bytes, SHA-256 `5b9f1c7f07d25c0188e5c0fda017e41a2787ec77d63ec03e2af28cc9cccd91a3` |
| Mesh | 1,893 vertices after a weld at 1e-5, 3,756 triangles: on each arm a tube of 10 quad rings of 16 vertices from 0.35 of the upper arm to 0.1 of the paw, joined to the trunk and the paw with Bridge Edge Loops, with Beautify Faces, Collapse Edges on the bridge triangles, and no flap face at the loops |
| Material | One material with one base color JPEG: the atlas of the source, and a strip of 512 pixels on top with the fur color of the source arms, baked onto the new faces. No metallic-roughness texture |
| `dog-weights.json` | 425,610 bytes, SHA-256 `7228f27e2d46ce05f83d5bb0553a5400a6506f88e0c94fdd3dec941f7a375aab` |
| Weights | The automatic weights of Blender with the weight rules of the script, on the studio bones and the arm segments and helpers (`armSegments` of the config), for `paintedWeights` of the config |

`tools/blender/arm_rebuild.py` puts new quad faces on each arm of `dog-patch.glb` from the shoulder
line to the wrist, with the settings that it finds from the joints of the config and from rays
through the mesh. The new arm surface lies on the old one. The arms are 1.35 times longer from the
shoulder line (`--factor 1.35`), because a rig with arm segments does not stretch the arms. The
round inner sides of the arms above the shoulder line, the paws, the trunk with its two holes, the
legs, the tail, and the head are the faces of `dog-patch.glb`. The cut of the rig closes the holes
of the trunk. A run gives the same bytes:

```bash
blender -b --factory-startup -P tools/blender/arm_rebuild.py -- dog --factor 1.35
shasum -a 256 assets/models/dog/dog-arms.glb assets/models/dog/dog-weights.json
```

## dog-arms-clip.glb

| Item | Value |
|---|---|
| Size | 1,123,920 bytes |
| SHA-256 | `1d2eeb94b3796df5ecccbf346cab080562c78965569e101d1e2999c49a80102d` |
| Writer | Khronos glTF Blender I/O v5.2.40 |

The trunk of `dog-arms.glb` has a hole beside each arm root, and the cut of the rig closes it with
a cap. The round inner side of each arm turns away from the trunk at its top front corner, up to
0.035 units out from the edge of the hole. In the bind and in a flat front view, the gap between
that corner and the cap showed as a deep notch with a dark triangle at the top of each armpit.

The copy moves the top front corner of the round inner side of each arm toward the trunk, with
point edits in the live Blender on the welded mesh. `dog-arms-clip.json` lists the 4 moves:

1. The corner vertex at the top of the hole (the arm run of the cut) moves 0.019 units on the
   left and 0.021 units on the right toward the middle plane. It stays just beyond the plane of
   `weights.armSplit`, so that the cut still finds it in the free arm.
2. The vertex of the inner side below it moves onto the edge of the hole: 0.017 units on the left
   and 0.032 units on the right. It lies inside the plane, and only free arm vertices surround it,
   so it stays a part of the arm (`armIslands`).

Thus the arm meets the cap of the trunk in a crease, with a small clip at the top front of the
root. Each move goes only along x, and no face goes or comes. The copy has the same 1,893 vertices
and 3,756 triangles after the weld. The rig reads `dog-arms-clip.json` as `weightMoves`, so that
each moved vertex keeps its weight row of `dog-weights.json`.

## dog.rig.glb

`pnpm rig-mesh dog` rigs `dog-arms.glb` with the role-neutral bind of design 4.4: straight bind
arms, the bind supination of `studio.bindSupination`, three `raise` shapes of the inner elbows,
and the skin normals at the arm roots (`rootNormals` of `tools/mesh-rigs/dog.json`). `pnpm studio-body dog` then writes `src/models/studio/dog.ts`.

## Candidate hand rig

`tripo-hand/` holds a candidate body ("tripo-hand/dog.blend" below): a hand rig of the Tripo P2
beagle `tripo-p2/dog.fbx`, made by one build script in a headless Blender 5.2, as the Tripo wolf
(`../wolf/README.md`). The body keeps the form, the colors, and the eyes of the source: no point
edit changes the head, the ears, the muzzle, the trunk, the paws, the legs, or the tail. The arms
keep the length of the source: no cut, no split from the trunk, and no stretch. On the branch of the
candidate, the `ANIMALS` entry of the dog points to `tripo-hand/dog.rig.glb`. The files of the dog
of main above do not change.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/dog.fbx`, `tripo-p2/dog.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/dog.blend` | Made from `tripo-p2/dog.fbx` by the scripted edits below. License as the FBX file | The scripted edits below |
| `tripo-hand/dog.rig.glb` | Export of `tripo-hand/dog.blend`. License as the FBX file | `pnpm rig-export dog --blend assets/models/dog/tripo-hand/dog.blend --out assets/models/dog/tripo-hand/dog.rig.glb` |
| `tripo-hand/dog.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/dog-color.webp`, `tripo-hand/dog-normal.webp` | Web copies of the color map and the normal map of the FBX ("Maps" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/dog-maps.py` |

### tripo-p2/dog.fbx

A friendly beagle in a T-pose with quad faces, made with Tripo P2 from the sheet of the beagle
(`assets/images2/beagle.png` of the main checkout). Its arm tubes have 13 vertices around.

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan, and given on 2026-11-11. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary. The maps lie beside the FBX file in the zip file |
| Contents | One mesh object, with no armature and no animation. 3,224 vertices and 3,526 faces: 2,888 quads and 638 triangles, no n-gon. One UV layer |
| Parts | 3 parts: the body with the ears and the tail (3,150 vertices), and one eyeball on each side: a dome of 37 vertices and 36 faces, open at its rim, a sphere of radius 0.0332 units about (±0.0383, 0.8997, 0.1132). 28 open edges (24 at the rims of the domes, 4 at a small hole of the left foot), and no edge with more than two faces |
| Box | In the studio units (1 unit from the soles to the top of the head): x ±0.428 (the paw tips), z -0.261 (the tail) to 0.261 (the nose). The beagle faces -y in Blender, with its left side at +x, so the import needs no turn |

The folder `dog.fbm/` keeps two maps of the zip file under new names, as bytes. The roughness and
the metallic maps are not kept.

| File | Name in the zip file | Size | Pixels | SHA-256 |
|---|---|---|---|---|
| `dog.fbx` | `tripo_convert_b0d9dd04-81b3-40b7-a2b9-c9b0b88f3c5f.fbx` | 215,580 bytes | | `3b4d27bd21a9995dc93b45df58be137d2368a86d2e8670f0ae7ff49bb9f175e3` |
| `dog.fbm/dog_basecolor.jpg` | `tripo_rgb_fe9250cd-a8b7-4ee2-9e1a-46ea5e2af245.jpg` | 2,681,292 bytes | 4096 × 4096 | `5fd0994318064613e14c3df02e2343a6b8363c10ad8ac373fd5ecfeeb7d61969` |
| `dog.fbm/dog_normal.jpg` | `tripo_normal_e4c004ed-3c63-4789-b628-5a54c10471de.jpg` | 1,003,568 bytes | 4096 × 4096 | `8021d77abbff352c5d2469f8f437c8a3b868a517ce67c047bea90d6eee95d49b` |

The color map paints an orange and cream beagle: orange ears, head, back, and upper arms, a cream
blaze, muzzle, chest, belly, legs, and paws, a white tail tip, a dark brown nose, freckles on the
muzzle, a smile line, and on each eyeball a brown iris, a black pupil, and two white lights.

### tripo-hand/dog.blend

The candidate hand rig (design 4.4, "Hand rig"). The scripts of the session (`scratch/beagle/` of
the worktree, which git ignores: `build.py`, `rings.py`, `make_config.py`, `params.json`, and
`chain-here.sh`) are not in the repo. They are the scripts of the Tripo wolf with the values of the
beagle. `make_config.py` writes `tools/mesh-rigs/simple/dog-tripo.json`: the joints of the source.

| Item | Value |
|---|---|
| Size | 393,864 bytes. A new build gives the same export, but not the same `.blend` bytes |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the top of the head, the soles at z = 0, the beagle faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `dog`: 3,770 vertices and 4,020 faces (3,382 quads and 638 triangles, 7,402 triangles), flat faces, and the surface of `sa.add_surface()`. No face is gloss: the 115 faces of the nose take the slot `fur` and the color map, with the smooth normals of the fur ("Nose"). The 72 faces of the two eyeballs have the face attribute `eye`, and the 312 faces of the two lids the face attribute `lid`. The UV map of the FBX, and the property `texture` (`assets/models/dog/tripo-hand/dog-color.webp`) |
| Armature | `dog_rig`: the 30 body bones, `tail_tip`, and the 20 arm segments and helpers, at the joints of the config. The Action `bind` holds the seated bind with no bind supination. The properties `palm`, `hinges`, `seat`, and `lids` come from the steps below |
| Facts | `height` 0.977184 (the shoulder joints at 1.508 m for each unit, so that H is 0.41623 m, 1.27 times the H of the dog of main: "Size" below), `crease` 180 |
| Eyes | The eyeballs of the source, with the finish `varnish` and no eye light (`eyeFinish` of the entry), and a blink lid on each. No eye objects, so the app adds no bead eyes |

The edits, in the order of the build (`sa` is `tools/blender/studio_armature.py`, x is the x of the
left side):

- **Import.** `sa.import_source('assets/models/dog/tripo-p2/dog.fbx', 1e-5)`. No vertex merges,
  and each face is flat. No part goes: the source has no hidden loose inner part.
- **Arm rings.** Edge ring Subdivide (`bmesh.ops.subdivide_edges(bm, edges=<ring>, cuts=1,
  use_grid_fill=True)`) of the clean quad bands of 13 edges between the arm loops at x 0.121,
  0.137, 0.158, 0.182, and 0.201, and at x 0.246, 0.281, 0.303, and 0.318. The loops at x 0.201 and
  0.246 run through 2 poles in front of the elbow, so the build takes the band next to the closed
  loop at the other end. A ring then stands about each 0.25 arm radii.
- **Rings with no split.** The band from x 0.201 to 0.246 at the elbow has the poles and 4
  triangles in front: its back has rings at x 0.212 and 0.229, and its front one long quad band.
  The legs take no split: their rings stand about each 0.015 to 0.02 units.
- **Paws turned.** Each vertex past the arm ring at x 0.2814 turns rigidly about the rest forearm
  axis by whole ring steps of 360/13 degrees: -110.8 degrees on the left (4 steps) and 27.7 degrees
  on the right (1 step), 211 vertices on each side. New quads join the two rings with the step
  offset, and the far ring takes the form of the ring before the turn (a fade to 0 at 0.02 units).
  The new quads keep the UVs of the old band. The paws keep their form ("Arm twist").
- **Point edits.** None. The head, the ears, the eyes, the muzzle, the trunk, the paws, the legs,
  and the tail keep the form of the source.
- **Surface.** `sa.add_surface(dog, 'dog', <base color>, eye_fans=False,
  config=<dog-tripo.json>)`. The gloss nose is the dark nose in the nose box of the config.
- **Eyes.** The 72 faces of the two eyeballs take the face attribute `eye`.
- **Armature.** The joints of the config: the shoulder at x 0.10, the elbow at x 0.205, the wrist
  at x 0.31, the knuckles at x 0.375, the hip at (0.083, 0.28, 0.035), and the knee at (0.083,
  0.16, 0). The palm is the true palm of the source, the mean normal of the paw faces that face
  down, (0.155, -0.988, -0.012), turned by the paw turn. The bind arms (`bindArms`) and the trunk
  (`open` 1) are those of the dog of main. The elbow axis of each side turns about its bind upper
  arm (`hingeTurn`): 8 degrees on the left and -20 degrees on the right ("Arm twist").

The weights, in the rest pose:

1. Automatic Weights, then Limit Total 4 and Normalize All, on a copy of the mesh with no tail and
   no eyeball.
2. Arm rows: each vertex of a side with |x| from 0.10, within 0.07 units of the line of the rest
   arm, takes one exact row (`sa.set_weight_row()`): a clavicle share from 0.4 at x 0.10 to 0 at x
   0.14, an elbow helper share of 0.25, 0.75, 0.75, and 0.25 at x 0.183, 0.198, 0.213, and 0.228,
   and the rest on the 4 roll segments. The 8 vertices of the ear tips in that reach, which the
   automatic weights give mostly to the head, the ears, and the neck, keep their rows.
3. Wrist rows: the bend share of the paw grows in 12 equal steps of 0.004 from 0.04 units before
   the head of `hand_<side>`. Knuckle rows: the fingers share grows in 12 equal steps of 0.0035 from
   0.02 units before the head of `fingers_<side>`.
4. The eyeballs and the gloss nose take {`head` 1}. The tail is the part that a flood from its
   lowest point reaches through vertices with z below -0.095 (148 vertices). It takes {`hips`
   1 - a, `tail` a (1 - c), `tail_tip` a c}, with a = smoothstep(-0.01, 0.03) along `tail` and c =
   smoothstep(-0.04, 0.04) along `tail_tip`.

**Smooth surface.** No relax and no region colors. The crease angle 180 gives each corner the mean
normal of the faces at its vertex, as the smooth shading of an FBX viewer.

**Nose.** At the end of the build, the 115 gloss faces of the dark nose go to the slot `fur`
(`noseFur` of the params). Thus the nose takes the color map, with its painted nostrils, and the
smooth normals of the fur. As flat gloss faces in one color, the nose showed facets and no nostrils.
The weights do not change: the nose vertices keep the row {`head` 1}. The armature property
`headShift` (0, 0, -0.007327586) moves the head center of the holds back to the head center of the
gloss nose, because the head box of `pnpm studio-body` now holds the nose. Thus no hold moves. The
nose keeps the colors of the source map. In the hall light it reads as the nose of the FBX file, so
the map tool does not change it.

**Seat.** The thighs slope 25 degrees down and turn 30 degrees out in the bind, and the shins are
vertical, as on the dog of main, so that the knees spread around the lower bout of the cello. The
property `seat` is {`prop` `chair`, `front` 0.0785, `back` -0.1, `halfWidth` 0.17}: the front lies
0.055 units behind the knee joint of the bind, the nearest place that keeps the back of each knee
off the seat, and 44 % of the thigh lies on the seat. The seat height is 0.191 m (0.265 m on the
dog of main), with the short legs of the source. The tail keeps its form: it goes back over the
back edge of the seat, and its tip turns up behind the seat (`tailBind`).

**Size.** The body scales to 1.27 times H of the dog of main (`metersPerUnit` 1.508 of
`tools/mesh-rigs/simple/dog-tripo.json`), so that the beagle reads a little larger than the Tripo
cat of the violas beside it. The scale changes only the fact `height` of the armature: the mesh,
the bones, and the weights of the export stay. The seat height follows the legs. The measures in
the app, in meters, with the seated values from the bind of each player:

| Measure | Tripo cat | Beagle at H of main | Beagle now | Now / cat |
|---|---|---|---|---|
| Standing, to the top of the head | 1.384 | 1.187 | 1.508 | 1.09 |
| Standing, to the ear tips | 1.484 | 1.187 | 1.508 | 1.02 |
| Seated, top of the head above the floor | 1.260 | 1.108 | 1.407 | 1.12 |
| Seated, ear tips above the floor | 1.360 | 1.108 | 1.407 | 1.03 |
| Distance of the shoulder joints | 0.282 | 0.238 | 0.302 | 1.07 |
| Head height H | 0.339 | 0.328 | 0.416 | 1.23 |
| Seat height | 0.201 | 0.150 | 0.191 | 0.95 |

The ears of the beagle hang, so the step compares the top of the head with no ear. A step to 1.1
times the ear tips of the cat makes the head of the beagle about 1.3 times the head of the cat.

**Ears.** The long ears hang to the top of each shoulder in the source. They follow the head and
their ear bones, and in the moments of the cellist they lie on the shoulders with no visible cut
into the arms or the cello. No weight fix was necessary.

**Lids.** A lid on each eyeball: 14 × 13 points from psi -55 to 45 degrees and lam from -50 to 62
degrees on the left (the mirror on the right), with the lower strip as the first row, at 1.17 ball
radii. 156 quads on each side, held turned up 126 degrees into the head. The property `lids` holds
the angle 2.199115 and the hinge axes. The lid faces take the orange fur patch at UV (0.625, 0.56)
at 0.75 UV for each unit, and the row `head` 1. In the 21 steps of the blink no open lid point,
side edge, or back edge leaves the head (ray casts), and the open lid lies at least 0.0167 units
under it.

**Arm twist.** The roll of each upper arm and the twist of each forearm, in degrees, in each moment
of the cellist (`pnpm pose-preview cellist`):

| Moment | Left upper arm | Left forearm | Right upper arm | Right forearm |
|---|---|---|---|---|
| frog | 37.4 | -35.3 | -22.2 | -43.6 |
| tip | 37.3 | -34.0 | -32.7 | -31.2 |
| crossing | 37.3 | -33.3 | -24.1 | -39.2 |
| rest | 44.5 | 27.9 | -40.1 | 91.9 |
| lift50 | 42.6 | 10.3 | -23.6 | -6.3 |
| lower50 | 41.7 | -1.0 | -22.7 | -21.6 |

With the paws of the source and no hinge turn, the left forearm twisted -154 degrees in the play,
and the right forearm 139.5 degrees at rest. The paw turn and the hinge turn add the same angle to
each moment of a side, so they cannot make the spread of the right forearm smaller: from 4 degrees
at the frog to 139.5 degrees at rest. The rest of the right forearm keeps 91.9 degrees, so that each
moment of the play stays within 45 degrees. The `DOG_HOLD` of `src/pose/bowed-rig.ts` does not
change.

**Maps** (`tools/dog-maps.py`). The tool scales the color map to 2048 pixels (Lanczos) and writes
WebP quality 60, method 6 (Pillow 13.0.0). No texel changes its color: the fur, the ears, and the
eye paint stay. In the play view and in the high hall view of the app, the gaze reads as a look at
the viewer, so no iris moves. The same run writes `dog-normal.webp` from the normal map of the FBX:
each x, y tilt limited to 0.2 (1.21 % of the texels), a box scale to 1024 pixels, the tilts times 4
in red and green, 255 in blue, and `cwebp -q 60 -sharp_yuv -m 6` (libwebp 1.5.0).

**Differences from the source.** The app light is warm and comes from above, so the orange fur reads
more saturated and the cream reads warmer than in the even gray light of an FBX viewer. The front of
each elbow has one long quad band, so the inner elbow folds in straight lines.

The export of the file and the maps. License of each file: CC BY-NC 4.0, as the FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/dog.rig.glb` | 1,084,064 bytes | `6b5687f08957cf142ca53400d22bc0342c8960e5b9697fa708889782bb7a0066` |
| `tripo-hand/dog.rig.json` | 16,184 bytes | `712be77001139e11263872c715c88a4fb2347cedad39c5557b11b831b61447bf` |
| `tripo-hand/dog-color.webp` | 118,948 bytes, 2048 × 2048 | `a40fcf698fb40ff0d95c1a580f93b7f9999e05e4e3adcadac2eae14abeabaded` |
| `tripo-hand/dog-normal.webp` | 28,924 bytes, 1024 × 1024 | `9e96ae9a9353cd93673333c33a3907dbef87813ef3858a2d7c5de930786fd075` |

# Hippo model

This folder holds the T-pose source mesh of the old hippo, a copy with rebuilt arms and its
weights, and the rigged copy. The app does not serve these files. It loads the module
`src/models/studio/hippo.ts`, which this chain wrote before the hand rig of the Tripo hippo
("Tripo hand rig" below) took its place:

```text
hippo-tpose.glb                      source mesh (`armSource` of tools/mesh-rigs/hippo.json)
   │  tools/blender/arm_rebuild.py   rebuilt arms and painted weights
   v
hippo-arms.glb + hippo-weights.json  `source` and `paintedWeights` of tools/mesh-rigs/hippo.json
   │  pnpm rig-mesh hippo, then pnpm glb-point-edits hippo-edits.json
   v
hippo.rig.glb                        rigged mesh with point edits
   │  pnpm studio-body hippo
   v
src/models/studio/hippo.ts           studio body of the app
```

`docs/agents/rigging.md` gives the steps of the chain.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `hippo-tpose.glb` | Source mesh (below) | None |
| `hippo-arms.glb` | Copy of `hippo-tpose.glb` with rebuilt arms. License as `hippo-tpose.glb` | `arm_rebuild.py` (below) |
| `hippo-weights.json` | Weights of the same Blender run. License as `hippo-tpose.glb` | The same run |
| `hippo.rig.glb` | Output of the rig with point edits. License as `hippo-tpose.glb` | `pnpm glb-point-edits assets/models/hippo/hippo-edits.json` ("Point edits" below) |
| `hippo-edits.json` | The point edits of the rig of 187ec0a72 | None |

## hippo-tpose.glb

The source mesh of the hippo, in a T-pose: the arms are level and out to the sides, free of the
trunk. The mesh has no skeleton.

| Item | Value |
|---|---|
| Size | 16,620,776 bytes |
| SHA-256 | `8b9ed066f67a7c2a80bd18643275e62d5a82e2939c9589b81f47d3197905ddac` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,098 triangles and 4,255 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial`, double-sided, with a base color PNG (10,781,869 bytes) and a metallic-roughness PNG (5,682,574 bytes), each of 4096 × 4096 pixels |

The values below are in the units of the studio: 1 unit from the soles to the top of the ears,
the soles at y = 0, +z forward, and +x the left side of the animal. The mesh faces +z. The weld is
at 1e-5.

- The weld gives 1,552 vertices in one connected part. Three open edges and one edge with three
  faces remain. 94 faces have a corner angle below 10°.
- The box is x -0.536 to 0.536, y 0 to 1, and z -0.270 to 0.268. The hippo is 1.7724 units of the
  file high from the soles to the top of the ears. The top of the skull is at y 0.984.
- The hippo stands upright on very short legs, with the crotch at y 0.14. The very round belly
  goes forward to z 0.214.
- The arms are level at y 0.63 and free of the trunk from x 0.2 out. Each paw ends at x 0.536,
  with a row of light claws under its end, so the palm faces down.
- The eyes are dark faces of the head surface at y 0.91 and z 0.104, with no shells. The small
  round ears go from y 0.96 to 1.0 at x ±0.08 to ±0.12. The short tail hangs from y 0.32 to 0.23
  at z -0.25.

## hippo-arms.glb and hippo-weights.json

`tools/blender/arm_rebuild.py` rebuilds the free T-pose arms of `hippo-tpose.glb` with quad tubes
at the length of the mesh (no `--factor`), and writes the Blender weights of the arms. The
shoulder line lies at 0.3 of the upper arm. Each arm has 9 rings of 16 vertices, and the elbow
helper is 0.0722 units, twice the gap of the elbow rings. The wrist cut lies at 0.2 of the paw
(`--spec`): with the cut at 0.1 that the script chooses, the bridge of the right wrist takes dark
baked faces in a lip around the wrist. The faces of the paws, the trunk, the legs, and the head
are the faces of the source. A run gives the same bytes:

```bash
blender -b --factory-startup -P tools/blender/arm_rebuild.py -- hippo --spec '{"cut": {"shoulder": 0.3, "tilt": 0.0, "wrist": 0.2}}'
```

| File | Size | SHA-256 |
|---|---|---|
| `hippo-arms.glb` | 992,116 bytes | `b8ecb0d191f7beeca0d2f22283308bde126db3476c68c111028fafbf6b10b525` |
| `hippo-weights.json` | 399,966 bytes | `180a8953709c4b75cfa6809179bfc958787612e27dc9d197114de91eef3288be` |

## hippo.rig.glb

| Item | Value |
|---|---|
| Size | 590,796 bytes |
| SHA-256 | `4c4855bfcff7a94058680749809d0431ad5d21ffc06599ee256719530388f614` |
| Bind | The role-neutral bind (design 4.4): the arms of the source, straight (`studio.straightArms`), with the elbow axes of the bent bind of `studio.bindArms`, and the bind supination L 20 and R 0 (`studio.bindSupination`) |
| Shapes | The arm-down shape of each arm and the straight legs of each side. No `raise` shape |

A run of `pnpm rig-mesh hippo` gives the base (590,984 bytes, SHA-256
`f0d68c1a6bc5e58190b6404c1e95525924876711af432116f3e0f4a74f7e1ab8`). It drops the point edits.

## Point edits

`hippo-edits.json` fills the furrow between the brows. The middle line between the brows stood
0.012 to 0.016 units (1.9 cm to 2.6 cm) behind the inner brows, so the two inner slopes of the
furrow shaded dark beside the eyes, and the face read as a frown. The two vertices on each side of
the middle line move forward by 0.01 and 0.005 units, and the two inner brow vertices over each eye
move back by 0.004 units. `pnpm glb-point-edits` reads the base with
`git show 187ec0a72:assets/models/hippo/hippo.rig.glb`, so a second run gives the same bytes.

## Tripo hand rig

`tripo-hand/` holds the body of the app: a hand rig of the Tripo P2 mesh `tripo-p2/hippo.fbx`, made
by one build script in a headless Blender 5.2, as the Tripo wolf (`../wolf/README.md`). The body
keeps the form, the colors, the eyeballs, and the teeth of the source: no point edit changes the
head, the trunk, the paws, the legs, or the tail. The arms keep the length of the source: no cut,
no split from the trunk, and no stretch. The `ANIMALS` entry of the hippo points to
`tripo-hand/hippo.rig.glb`. The files of the old hippo above do not change.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/hippo.fbx`, `tripo-p2/hippo.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/hippo.blend` | Made from `tripo-p2/hippo.fbx` by the scripted edits below. License as the FBX file | The scripted edits below |
| `tripo-hand/hippo.rig.glb` | Export of `tripo-hand/hippo.blend`. License as the FBX file | `pnpm rig-export hippo --blend assets/models/hippo/tripo-hand/hippo.blend --out assets/models/hippo/tripo-hand/hippo.rig.glb` |
| `tripo-hand/hippo.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/hippo-color.webp`, `tripo-hand/hippo-normal.webp` | Web copies of the color map and the normal map of the FBX ("Maps" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/hippo-maps.py` |

### tripo-p2/hippo.fbx

A round, friendly gray-pink hippo in a T-pose with quad faces, made with Tripo P2 from the sheet
of the hippo (`assets/images2/hippo.png` of the main checkout). Its arm tubes have 18 vertices
around.

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan, and given on 2026-11-11. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary. The maps lie beside the FBX file in the zip file |
| Contents | One mesh object, with no armature and no animation. 3,235 vertices and 3,507 faces: 2,875 quads and 632 triangles, no n-gon. One UV layer |
| Parts | 5 parts: the body with the ears and the tail (3,059 vertices), one eyeball on each side (a dome of 43 vertices, open at its rim, a sphere of radius 0.0277 units about (±0.0645, 0.8885, 0.0928)), and one tooth on each side (45 vertices, at (±0.087, 0.712, 0.227)). The head has a hole under each eyeball. 80 open edges (32 at the holes under the eyeballs, 28 at the rims of the eyeballs, 20 at the teeth), and no edge with more than two faces |
| Box | In the studio units (1 unit from the soles to the top of the ears): x ±0.451 (the paw tips), z -0.299 (the tail) to 0.299 (the snout). The hippo faces -y in Blender, with its left side at +x, so the import needs no turn |

The folder `hippo.fbm/` keeps two maps of the zip file under new names, as bytes. The roughness
and the metallic maps are not kept.

| File | Name in the zip file | Size | Pixels | SHA-256 |
|---|---|---|---|---|
| `hippo.fbx` | `tripo_convert_0ef3386f-01cd-4133-8693-02dbeb7c48f8.fbx` | 214,972 bytes | | `7a34440f28c6cdcefa9eb12614af9771081a27fb4817a36008cfa7d49b647a37` |
| `hippo.fbm/hippo_basecolor.jpg` | `tripo_rgb_e50d1ba2-86cd-40b1-990a-f943ed2472f8.jpg` | 1,979,824 bytes | 4096 × 4096 | `3cd42f90b903919ab5f7d696d34b807b7cd4b200eb604eb7d36c9fd9bd0fe721` |
| `hippo.fbm/hippo_normal.jpg` | `tripo_normal_14fe0744-ddf3-439c-8786-7664446d3af6.jpg` | 1,211,888 bytes | 4096 × 4096 | `c1dd8060fbeb5718beecbd5c4b6ee8779d3798ec1993cdc70633315abb374f61` |

The color map paints gray-pink skin with a paler belly and snout, pink inner ears, soft brown
brows, freckles on the snout, two cream teeth, pale toes, and on each eyeball a brown iris, a black
pupil, white at the corners, and a white light.

### tripo-hand/hippo.blend

The hand rig (design 4.4, "Hand rig"). The scripts of the session (`scratch/hippo/` of the
worktree, which git ignores: `build.py`, `rings.py`, `make_config.py`, `params.json`, and
`chain-here.sh`) are not in the repo. They are the scripts of the Tripo beagle with the values of
the hippo. `make_config.py` writes `tools/mesh-rigs/simple/hippo-tripo.json`: the joints of the
source.

| Item | Value |
|---|---|
| Size | 410,478 bytes. A new build gives the same export, but not the same `.blend` bytes |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the top of the ears, the soles at z = 0, the hippo faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `hippo`: 3,887 vertices and 4,107 faces (3,475 quads and 632 triangles, 7,582 triangles), flat faces, and the surface of `sa.add_surface()` with no gloss face. The 84 faces of the two eyeballs have the face attribute `eye`, and the 312 faces of the two lids the face attribute `lid`. The UV map of the FBX, and the property `texture` (`assets/models/hippo/tripo-hand/hippo-color.webp`) |
| Armature | `hippo_rig`: the 30 body bones, `tail_tip`, and the 20 arm segments and helpers, at the joints of the config. The Action `bind` holds the bind with no bind supination. The properties `palm`, `hinges`, `seat`, and `lids` come from the steps below |
| Facts | `height` 0.920891 (the shoulder joints at 1.534818 m for each unit, so that H is 0.502359 m, the H of the old hippo), `crease` 180 |
| Eyes | The eyeballs of the source, with the finish `varnish` and no eye light (`eyeFinish` of the entry), and a blink lid on each. No eye objects, so the app adds no bead eyes |

The edits, in the order of the build (`sa` is `tools/blender/studio_armature.py`, x is the x of the
left side):

- **Import.** `sa.import_source('assets/models/hippo/tripo-p2/hippo.fbx', 1e-5)`. No vertex
  merges, and each face is flat. No part goes: the eyeballs and the teeth show.
- **Arm rings.** Edge ring Subdivide (`bmesh.ops.subdivide_edges(bm, edges=<ring>, cuts=<n>,
  use_grid_fill=True)`) of the clean quad bands of 18 edges between the closed arm loops at x
  0.188, 0.207, 0.231, 0.267, 0.287, 0.309, 0.331, and 0.353: 1 cut on each band, and 2 cuts on
  the band of the elbow (x 0.231 to 0.267). A ring then stands about each 0.11 to 0.17 arm radii.
- **Rings with no split.** The arm root to x 0.188 and the paw from x 0.353 stop at triangles or
  poles. The legs have no closed loop, so they take no ring.
- **Paws turned.** Each vertex past the arm ring at x 0.3307 turns rigidly about the rest forearm
  axis by whole ring steps of 360/18 degrees: 40 degrees on the left (2 steps) and -40 degrees on
  the right, 248 vertices on each side. New quads join the two rings with the step offset, and the
  far ring takes the form of the ring before the turn (a fade to 0 at 0.02 units). The new quads
  keep the UVs of the old band. The paws keep their form ("Arm twist").
- **Point edits.** None.
- **Surface.** `sa.add_surface(hippo, 'hippo', <base color>, eye_fans=False,
  config=<hippo-tripo.json>)`. The 28 nose faces go back to the fur slot, and the gloss slot goes
  (`noGloss`): the map paints the two nostrils, so the snout keeps the color map.
- **Eyes.** The faces of the two eyeballs (the loose parts of 30 to 99 vertices in the eye box)
  take the face attribute `eye`, and keep the color map.
- **Armature.** The joints of the config: the shoulder at x 0.145, the elbow at x 0.25, the wrist
  at x 0.355, the knuckles at x 0.405, the hip at (0.115, 0.21, 0.01), the knee at (0.12, 0.11,
  -0.018), and the ankle at (0.125, 0.045, -0.025). The palm is the true palm of the source, the
  mean normal of the paw faces that face down from x 0.33, (0.182, -0.98, -0.075), turned by the
  paw turn. The bind arms (`bindArms`) and the trunk (`open` 1) are those of the old hippo. The
  bind keeps the legs of the source ("Stance"). The tail bones keep the directions of the source.
  The elbow axis of the left side turns 5.5 degrees about its bind upper arm (`hingeTurn`, "Arm
  twist").

The weights, in the rest pose:

1. Automatic Weights, then Limit Total 4 and Normalize All, on a copy of the mesh with no tail, no
   eyeball, and no tooth.
2. Arm rows: each vertex of a side with |x| from 0.145, within 0.10 units of the line of the rest
   arm at the root (0.084 units on the forearm and the paw), takes one exact row
   (`sa.set_weight_row()`): a clavicle share from 0.4 at x 0.145 to 0 at x 0.185, an elbow helper
   share of 0.25, 0.75, 0.75, and 0.25 at x 0.2275, 0.2425, 0.2575, and 0.2725, and the rest on the
   4 roll segments. The 46 vertices of the jowls and the belly side in that reach, which the
   automatic weights give mostly to the head, the neck, or the trunk, keep their rows.
3. Wrist rows: the bend share of the paw grows in 12 equal steps of 0.004 from 0.04 units before
   the head of `hand_<side>`. Knuckle rows: the fingers share grows in 12 equal steps of 0.0035
   from 0.02 units before the head of `fingers_<side>`.
4. The eyeballs and the teeth take {`head` 1}. The tail is the part that a flood from its back
   point reaches through vertices with z below -0.256 and y below 0.33 (49 vertices). It takes
   {`hips` 1 - a, `tail` a (1 - c), `tail_tip` a c}, with a = smoothstep(-0.005, 0.015) along `tail`
   and c = smoothstep(-0.015, 0.015) along `tail_tip`.

**Smooth surface.** No relax and no region colors. The crease angle 180 gives each corner the mean
normal of the faces at its vertex, as the smooth shading of an FBX viewer.

**Stance.** The hippo stands at its contrabass in the pose of the source (`standingBody()` of
`src/models/studio-rig.ts`). The bind keeps the legs of the source: the leg turns of the config are
the turn from the source legs to the same legs (`tools/rig/leg_turns.py <config> 105.6 -10.1
-6.1`). With the seated thighs of the old hippo (25 degrees down), the short thighs pushed into the
round belly in the bind, and the normals of the export showed the dents and a fold on the belly in
the standing pose. The property `seat` is {`prop` `chair`, `front` -0.14, `back` -0.26,
`halfWidth` 0.24}: a seat under the back of the haunch, behind the heels, which only sets the seat
height of the export (0.235 m).

**Lids.** A lid on each eyeball: 14 × 13 points from psi -55 to 65 degrees and lam from -65 to 70
degrees on the left (the mirror on the right), with the lower strip as the first row, at 1.12 ball
radii. 156 quads on each side, held turned up 105 degrees into the head. The property `lids` holds
the angle 1.832596 and the hinge axes. The lid faces take the skin patch at UV (0.9003, 0.4657) at
0.25 UV for each unit, and the row `head` 1. The ray casts of the lid test take the eyeballs as a
part of the head, because the head has a hole under each eyeball. In the 21 steps of the blink no
open lid point, side edge, or back edge leaves the head, and the open lid lies at least 0.0053
units under it.

**Eyes.** Each eyeball is 0.039 units wide, 0.12 of the head width (0.317 units at y 0.78). In the
play view of a phone, the 3/4 view, and the default hall camera, the iris fills the opening, and
white shows only at the corners, so the eyes keep the size and the paint of the source. The gaze
reads as a look ahead, so no iris moves. The map paints a light on each eyeball, so the eyes take
the finish `varnish` and no eye light.

**Arm twist.** The roll of each upper arm and the twist of each forearm, in degrees, in each moment
of the bassist (`pnpm pose-preview bassist`, `HIPPO_HOLD` of `src/pose/bowed-rig.ts`):

| Moment | Left upper arm | Left forearm | Right upper arm | Right forearm |
|---|---|---|---|---|
| frog | -9.6 | 42.4 | 10.3 | -28.0 |
| tip | -9.6 | 37.4 | -5.6 | -40.9 |
| crossing | -9.5 | 37.9 | 6.2 | -27.6 |
| rest | -40.4 | -9.0 | -11.0 | -16.1 |
| lift50 | -21.8 | -31.3 | -6.8 | 43.6 |
| lower50 | -18.4 | -42.7 | -5.4 | 35.9 |

The paw turn and the elbow axis turn add the same angle to each moment of a forearm, so the spread
over the moments comes from the hold. The left forearm spreads 85 degrees and the right forearm 85
degrees, so both stay within 45 degrees only near the middle of their spread.

**Maps** (`tools/hippo-maps.py`). The tool scales the color map to 2048 pixels (Lanczos) and
writes WebP quality 60, method 6 (Pillow 13.0.0). No texel changes its color. The same run writes
`hippo-normal.webp` from the normal map of the FBX: each x, y tilt limited to 0.2 (0.60 % of the
texels), a box scale to 1024 pixels, the tilts times 4 in red and green, 255 in blue, and `cwebp -q
60 -sharp_yuv -m 6` (libwebp 1.5.0).

**Differences from the source.** The app light is warm and comes from above, so the gray-pink
skin reads as a light peach in the app, and the snout casts a dark band over the mouth line. The
trunk leans 20 degrees forward in the play and at rest, and the teeth show less than in the front
view of the source.

The export of the file and the maps. License of each file: CC BY-NC 4.0, as the FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/hippo.rig.glb` | 1,130,460 bytes | `b39cc1f3966a6bae034fc8f00c3f59ed88c5fcf9d4566e827ca81515f84c2878` |
| `tripo-hand/hippo.rig.json` | 16,403 bytes | `0d6bfc7f7aa9da75565d821045aef4263916a1ceaa364ad044600b2877af0809` |
| `tripo-hand/hippo-color.webp` | 66,764 bytes, 2048 × 2048 | `475803ad0c7ff15b5e375da9d97e4d350ac5f024cb7eb7380fa47c845d0473cb` |
| `tripo-hand/hippo-normal.webp` | 37,300 bytes, 1024 × 1024 | `22136ba7d9c0141efc91d9e0c782ff23c17bd364221bdd73518552b033d0741f` |

# Wolf model

This folder holds the Tripo P2 source mesh of the wolf (`tripo-p2/`) and its hand rig
(`tripo-hand/`). The app does not serve these files. It loads the module
`src/models/bodies/wolf.ts`, which this chain writes:

```text
tripo-p2/wolf.fbx             source mesh with quad faces
   │  pnpm hand-chain wolf    chain tools/blender/hand/wolf/
   v
tripo-hand/wolf.blend         hand rig (design 4.4, "Hand rig")
   │  pnpm rig-export wolf    the same run
   v
tripo-hand/wolf.rig.glb       rigged mesh, with its summary wolf.rig.json
   │  pnpm body-module wolf   the same run
   v
src/models/bodies/wolf.ts     body of the app
```

`tools/blender/hand/README.md` gives the steps of the chain. The section "Tripo hand rig" below
gives the files, their sources, their licenses, and their checksums.

The files of the older body of the route of `pnpm rig-mesh` are removed. Commit `cbc8db5e4` has
these files and the sections of this file about them.

## Tripo hand rig

`tripo-hand/` holds the body of the app ("tripo-hand/wolf.blend" below): a hand rig of the Tripo P2
mesh `tripo-p2/wolf.fbx`, made by one build script in a headless Blender 5.2. The body keeps the
form, the colors, and the eye paint of the source, but one point edit makes the front paws smaller
("Paw size"). No point edit changes the head, the trunk, the legs, or the tail. The arms keep the
length of the source: no cut, no split from the trunk, and no stretch. The `ANIMALS` entry of the
wolf points to `tripo-hand/wolf.rig.glb`.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/wolf.fbx`, `tripo-p2/wolf.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/wolf.blend` | Made from `tripo-p2/wolf.fbx` by the scripted edits below. License as the FBX file | `pnpm hand-chain wolf` |
| `tripo-hand/wolf.rig.glb` | Export of `tripo-hand/wolf.blend`. License as the FBX file | `pnpm rig-export wolf --blend assets/models/wolf/tripo-hand/wolf.blend --out assets/models/wolf/tripo-hand/wolf.rig.glb` |
| `tripo-hand/wolf.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/wolf-color.webp`, `tripo-hand/wolf-normal.webp` | Web copies of the color map and the normal map of the FBX ("Color map" and "Normal map" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/tripo-maps.py wolf` |

### tripo-p2/wolf.fbx

A friendly gray wolf in a T-pose with quad faces, made with Tripo P2 from the sheet of the wolf
(`assets/images2/wolf2.png` of the main checkout). Its arm tubes and its leg tubes have 11 vertices
around.

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan, and given on 2026-11-10. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary. The maps lie beside the FBX file in the zip file |
| Contents | One mesh object, with no armature and no animation. 3,074 vertices and 3,524 faces: 2,582 quads and 942 triangles, no n-gon. One UV layer |
| Parts | 3 parts: the body (2,905 vertices), the tail (145 vertices, open at its root inside the haunch), and an open tube of 24 vertices inside the belly (x ±0.04, y 0.33 to 0.46), which no view shows. No eyeball: the map paints each eye on faces of the head. 36 open edges, and no edge with more than two faces |
| Box | In the body units (1 unit from the soles to the ear tips): x ±0.409 (the paw tips), z -0.241 (the tail) to 0.241 (the nose). The wolf faces -y in Blender, with its left side at +x, so the import needs no turn |

The folder `wolf.fbm/` keeps two maps of the zip file under new names, as bytes. The roughness and
the metallic maps are not kept.

| File | Name in the zip file | Size | Pixels | SHA-256 |
|---|---|---|---|---|
| `wolf.fbx` | `tripo_convert_39b8a8d2-8a35-4b3f-b56b-ea0ebdb3ab3e.fbx` | 213,756 bytes | | `a4de972c85ea9063d80d165b57fe4705287a8c83f0b087ea81dacba90b6b5570` |
| `wolf.fbm/wolf_basecolor.jpg` | `tripo_rgb_54074081-1f8c-413b-8634-65df171d385a.jpg` | 3,244,427 bytes | 4096 × 4096 | `bc9e3a915c104977d15f351696717724d24abf6f1a4c93c651ea8bf96feec458` |
| `wolf.fbm/wolf_normal.jpg` | `tripo_normal_1ba41bf5-82ae-48f7-a64b-d496a2484ff8.jpg` | 1,901,581 bytes | 4096 × 4096 | `4ae853e5acbc74d6794cecd0e546caff9a7a6d211a1572f4abe5e723b82abf68` |

The color map paints a gray wolf with a cream chest, cheeks, muzzle, and tail tip, soft gray brows,
a black nose, a thin smile line, and on each eye an orange brown iris at the inner corner, a black
pupil, white, a dark lash line, and a white light.

### tripo-hand/wolf.blend

The hand rig (design 4.4, "Hand rig"). The chain of the body is in `tools/blender/hand/wolf/`
(`build.py`, `make_config.py`, `params.json`, `base-config.json`, `eye-centers.json`, `redits.py`,
`rimport.py`, `rings.py`), and `pnpm hand-chain wolf` runs it (`tools/blender/hand/README.md`). Its
scripts follow the scripts of the Tripo fox (`../fox/README.md`). `make_config.py` writes
`tools/mesh-rigs/simple/wolf-tripo.json`: the joints of the source.

| Item | Value |
|---|---|
| Size | 394,536 bytes |
| SHA-256 | `a5a3ea9ea1e9ab171b6a857e9cb8baa37dfdf050aa9cc407a678102126a570af` |
| Axes | The body units in the axes of Blender: 1 unit from the soles to the ear tips, the soles at z = 0, the wolf faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `wolf`: 3,656 vertices and 4,066 faces (3,124 quads and 942 triangles, 7,190 triangles), flat faces, and the surface of `sa.add_surface()`. No face is gloss: the 82 faces of the nose take the slot `fur` and the color map, with the smooth normals of the fur ("Nose"). The 48 faces of the two painted eyes have the face attribute `eye`, and the 312 faces of the two lids the face attribute `lid`. The UV map of the FBX, and the property `texture` (`assets/models/wolf/tripo-hand/wolf-color.webp`) |
| Armature | `wolf_rig`: the 30 body bones, `tail_tip`, and the 20 arm segments and helpers, at the joints of the config. The Action `bind` holds the seated bind with no bind supination. The properties `palm`, `hinges`, `seat`, and `lids` come from the steps below |
| Facts | `height` 1.121345 (the shoulder joints at 1.77428 m for each unit, so that H is 0.369244 m, the H of the wolf of main), `crease` 180 |
| Eyes | The painted eye faces of the mesh, with the finish `varnish` and no eye light (`eyeFinish` of the entry), and a blink lid on each. No eye objects, so the app adds no bead eyes |

The edits, in the order of the build (`sa` is `tools/blender/body_armature.py`, x is the x of the
left side):

- **Import.** `sa.import_source('assets/models/wolf/tripo-p2/wolf.fbx', 1e-5)`. No vertex merges,
  and each face is flat.
- **Inner tube.** The loose part of 24 vertices inside the belly goes. No view shows it.
- **Arm rings.** Edge ring Subdivide (`bmesh.ops.subdivide_edges(bm, edges=<ring>, cuts=<n>,
  use_grid_fill=True)`) of the clean quad bands of 11 edges between the closed arm loops at x 0.124,
  0.150, 0.178, 0.208, 0.238, 0.267, and 0.290: 1 cut on each band, and 2 cuts on the two bands at
  the elbow (x 0.178 to 0.238). A ring then stands about each 0.3 arm radii.
- **Knee rings.** The same call with 1 cut on the leg bands of 11 edges at y 0.135 to 0.150, 0.150
  to 0.172, and 0.172 to 0.1975. The knee joint is at y 0.165.
- **Rings with no split.** The arm root to x 0.124 and the paw from x 0.290 stop at triangles or
  poles.
- **Paws turned.** Each vertex past the arm ring at x 0.2786 turns rigidly about the rest forearm
  axis by whole ring steps of 360/11 degrees: -65.5 degrees on the left (2 steps) and 65.5 degrees
  on the right, 358 and 359 vertices. New quads join the two rings with the step offset, and the
  far ring takes the form of the ring before the turn (a fade to 0 at 0.02 units). The new quads
  keep the UVs of the old band. The paws keep their form ("Arm twist").
- **Wrist loop.** The ring at x 0.2786 does not turn. It is slanted, so 4 of its 11 vertices lie
  past its mean along the forearm axis. When they turned with the paw, the quads before the ring
  sheared into a V notch at the wrist: 9 faces on the left and 8 on the right had UV scale ratios of
  2.6 to 12.9, against about 1.2 on the faces around them.
- **Point edits.** One: the edit `paw` of the front paws ("Paw size" below). The head, the eyes, the
  muzzle, the trunk, the arms, the legs, and the tail keep the form of the source.
- **Surface.** `sa.add_surface(wolf, 'wolf', <base color>, eye_fans=False,
  config=<wolf-tripo.json>)`. The gloss nose is the dark nose in the nose box of the config.
- **Eyes.** The 48 head faces with at least half of their pixels in the eye paint of the front
  view of the source (the dark lash line, the pupil, the orange iris, and the white, closed and
  filled) take the face attribute `eye`. Each eye is about 0.035 units wide, and a sphere fits its
  vertices within 0.0045 units (radius 0.026 on the left, 0.030 on the right).
- **Armature.** The joints of the config: the shoulder at x 0.10, the elbow at x 0.20, the wrist at
  x 0.30, the knuckles at x 0.343 (x 0.355 in the source, moved by the paw edit), the hip at (0.067,
  0.29, 0.055), and the knee at (0.067, 0.165, 0.022). The palm is the true palm of the source, the
  mean normal of the paw faces that face down, (0.107, -0.994, 0.016), turned by the paw turn. The
  bind arms (`bindArms`), the trunk (`open` 1), and the tail bind are those of the wolf of main.

The weights, in the rest pose:

1. Automatic Weights, then Limit Total 4 and Normalize All, on a copy of the mesh with no tail.
2. Arm rows: each vertex of a side with |x| from 0.10, within 0.07 units of the line of the rest
   arm, takes one exact row (`sa.set_weight_row()`): a clavicle share from 0.4 at x 0.10 to 0 at x
   0.14, an elbow helper share that grows from 0 at x 0.165 to 1 at the elbow joint (x 0.2) and
   falls to 0 at x 0.236,
   and the rest on the 4 roll segments.
3. Wrist rows: the bend share of the paw grows in 12 equal steps of 0.004 from 0.04 units before
   the head of `hand_<side>`. Knuckle rows: the fingers share grows in 12 equal steps of 0.0035 from
   0.02 units before the head of `fingers_<side>`.
4. The eye faces and the gloss nose take {`head` 1}. The tail takes {`hips` 1 - a, `tail` a (1 - c),
   `tail_tip` a c}, with a = smoothstep(-0.01, 0.03) along `tail` and c = smoothstep(-0.04, 0.04)
   along `tail_tip`.

**Smooth surface.** No relax and no region colors: the form stays the form of the source. The crease
angle 180 gives each corner the mean normal of the faces at its vertex, as the smooth shading of an
FBX viewer.

**Nose.** At the end of the build, the 82 gloss faces of the dark nose go to the slot `fur`
(`noseFur` of the params). Thus the nose takes the color map, with its painted nostrils, and the
smooth normals of the fur. As flat gloss faces in one color, the nose showed facets and no nostrils.
The weights do not change: the nose vertices keep the row {`head` 1}. The armature property
`headShift` (0, 0, -0.006106139) moves the head center of the holds back to the head center of the
gloss nose, because the head box of `pnpm body-module` now holds the nose. Thus no hold moves. The
nose keeps the colors of the source map. In the hall light it reads as the nose of the FBX file, so
the map tool does not change it.

**Seat.** The thighs slope 25 degrees down and 15 degrees out in the bind, and the shins are vertical,
as on the wolf of main. The property `seat` is {`prop` `chair`, `front` 0.1186, `back` -0.08,
`halfWidth` 0.15}: the front lies 0.05 units behind the knee joint of the bind, and 56 % of the
thigh lies on the seat. The seat height is 0.276 m (0.288 m on the wolf of main), with the legs of
the source. The tail goes back over the back edge of the seat and hangs down behind it.

**Lids.** A lid on each eye: 14 × 13 points from psi -55 to 45 degrees and lam from -50 to 62
degrees on the left (the mirror on the right), with the lower strip as the first row. Each row lies at 1.17 ball radii,
or 1.03 times the farthest eye point from the middle of the sphere fit of the export, if that is
farther (1.209 radii on the left, 1.17 on the right), because the painted eye is no true sphere. 156
quads on each side, held turned up 126 degrees into the head. The property `lids` holds the angle
2.199115 and the hinge axes. The lid faces take the cream fur patch at UV (0.4189, 0.2041) at 0.84 UV
for each unit, and the row `head` 1. In the 21 steps of the blink no open lid point, side edge, or
back edge leaves the head (ray casts), and the open lid lies at least 0.0236 units under it.

**Paw size.** This is an exception to the route of the wolf, which keeps the form of the source. In
the app, the front paws of the source read too large: against the distance of the shoulder joints,
the source paw is 1.45 times as long and 1.74 times as wide as the paw of the wolf of main, and 1.15
and 1.19 times the paw of the Tripo beagle. The point edit `paw` of `redits.py` (in `params.json`:
`{"kind": "paw", "length": 0.8, "wide": 0.8, "thick": 1.0, "ramp": 0.02, "width": [0, 0, 1]}`)
scales each front paw past the wrist joint of its side (x 0.30) about that joint, in the frame of
the paw: the rest forearm axis, the width axis +z of the source turned with the paw turn, and the
height axis square to the two. A point at the distance d past the wrist joint takes the share
smoothstep(0, 0.02, d) of the scale, so the wrist has no step. The paw height, the arm, the bones of
the arm, and the feet do not change. `make_config.py` moves the knuckle joint and the tip of
`fingers_<side>` with the same edit, and the weight rows keep their rules. The largest move is 0.023
units (4.0 cm). The left paw in the rest of each export (`scratch/wolf/paw_measure.py`), in meters
and in H, and the shares of the shoulder distance and of the arm (shoulder joint to wrist joint):

| Measure | Source wolf | Wolf now | Wolf of main | Tripo beagle | Tripo rabbit |
|---|---|---|---|---|---|
| Length, wrist joint to tip | 0.200 (0.542) | 0.160 (0.433) | - | 0.148 (0.355) | 0.107 (0.359) |
| Width | 0.205 (0.555) | 0.164 (0.444) | - | 0.146 (0.352) | 0.121 (0.404) |
| Height | 0.124 (0.336) | 0.124 (0.336) | - | 0.114 (0.273) | 0.069 (0.230) |
| Length / shoulder distance | 0.564 | 0.451 | 0.390 | 0.489 | 0.514 |
| Width / shoulder distance | 0.577 | 0.462 | 0.332 | 0.486 | 0.579 |
| Length / arm | 0.562 | 0.449 | 0.324 | 0.465 | 0.406 |
| Width / arm | 0.575 | 0.460 | 0.275 | 0.461 | 0.457 |

The paw stays larger than the paw of the wolf of main, and it is near the paw of the beagle. The
clarinet hold changes with the smaller paws ("Clarinet hold" below).

**Arm twist.** The roll of each upper arm and the twist of each forearm, in degrees, in each moment
of `WOLF_CLARINET` of `src/pose/winds.ts` (`pnpm pose-preview clarinetist`):

| Moment | Left upper arm | Left forearm | Right upper arm | Right forearm |
|---|---|---|---|---|
| note | -24.7 | 17.1 | 28.2 | -14.6 |
| rest | 8.0 | 11.1 | 9.8 | 1.5 |
| lift50 | -14.0 | 14.7 | 9.0 | 6.7 |
| lower50 | -17.9 | 17.4 | 12.2 | 4.7 |
| stand | -24.7 | 16.7 | 28.1 | -14.1 |

With the paws of the source, the forearms twisted -73 and 88 degrees at rest. Each paw closes on the
clarinet, and the mouthpiece meets the lips under the muzzle.

**Clarinet hold.** The hold of the clarinetist (`WOLF_CLARINET`, design 5.3) follows a seated
clarinetist (`docs/reference/wind-technique.md` 3): the left paw on the upper joint (its middle 24
cm from the tip of the mouthpiece), the right paw on the lower joint (38 cm, below the thumb rest at
34.5 cm), each from the side of its own shoulder with the fingers curled over the front of the tube,
and the head upright. The clarinet hangs 35 degrees from the vertical (30 degrees before), both
shoulder bones turn further forward (45 and 30 degrees, 35 and 20 before), the elbows point further
out, and the right fingers curl 105 degrees (115 before). Against the commit before the smaller paws
(34d140d5c):

| Measure | Before | Now |
|---|---|---|
| Right paw grasps the clarinet in the play (`pnpm wind-grip clarinetist`) | 100 % | 100 % |
| Left paw grasps it in the play | 100 % | 100 % |
| Palm angle in the play, left and right (median) | 0°, 10° | 5°, 16° |
| Twist p95, left and right (`pnpm arm-check clarinetist`) | 11°, 11° | 7°, 7° |
| Forearm twist p95, left and right | 20°, 10° | 14°, 6° |
| Upper arms in the body in the play (`pnpm pose-depth clarinetist`) | 4.7 cm | 2.1 cm |
| Forearms in the body in the lift | 1.1 cm | 0.1 cm |
| Paws and claws in the body | 0 cm | 0 cm |
| Mouthpiece in the head under the muzzle | 1.7 cm | 1.6 cm |
| Bell in the right knee at rest | 1.6 cm | 1.9 cm |
| Spare reach of the right arm in the play (`pnpm hold-fit clarinetist`) | 1.3 cm | 0.2 cm |
| Largest error of a palm from its grip (note targets) | 6.2 mm | 13.9 mm |

With the smaller paws and a curl of 115 degrees, the right finger tips stood 0.8 cm off the tube in
the notes that open the right keys, and the right paw grasped in 79 % of the play samples. The bell
does not reach between the knees: the clarinet is shorter than the line from the mouth to the knees.
The folds of the arms (`pnpm arm-check`, folds p95) go from 53 to 66 (left) and from 48 to 55
(right), over the limit of 8 before and after.

**Color map** (`tools/tripo-maps.py wolf`). The tool scales the source to 2048 pixels (Lanczos),
keeps 0.7 of its detail finer than a blur of 2 texels (`detail` of `SPECIES`), and writes WebP
quality 60, method 6 (Pillow 13.0.0). Reason: the full detail read as carved grooves in the hall
light. The colors of the fur, the brows, and the eye paint stay. The eyes keep the iris place of the
source. In the play view of the app the gaze reads as a look at the viewer, so no iris moves.

**Normal map.** The same run writes `wolf-normal.webp` from the normal map of the FBX: each x, y
tilt limited to 0.2 (5.15 % of the texels), a box scale to 1024 pixels, the tilts times 0.5 (`tilt`
of `SPECIES`) and 4 in red and green, 255 in blue, and `cwebp -q 60 -sharp_yuv -m 6` (libwebp
1.5.0).

**Differences from the source.** The app light is warm and comes from above, so the gray fur reads
lighter and warmer than in the even gray light of an FBX viewer, and the chin shades darker. The
source has no eyeball, so the eyes take the finish of the eye faces and blink with lids.

The export of the file and the maps. License of each file: CC BY-NC 4.0, as the FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/wolf.rig.glb` | 1,308,864 bytes | `fca800f9d1d79e8d1174d7bf6b0a776feff8f3b8dd455bfdb8bbf6045fa992e5` |
| `tripo-hand/wolf.rig.json` | 15,687 bytes | `1ec320e0df89ac3992bf4fce9d7ce0fa6a52d406ae87b7c8cf7d5c2b1253a679` |
| `tripo-hand/wolf-color.webp` | 171,898 bytes, 2048 × 2048 | `bc6334af510185d4367b057c36ca289174cfc2936b3cfde64ab2b63a10215efa` |
| `tripo-hand/wolf-normal.webp` | 62,414 bytes, 1024 × 1024 | `dd4896a3db92b8b187b31e4e9c118e5fbccbf1f9478fb43126727f8222beed59` |

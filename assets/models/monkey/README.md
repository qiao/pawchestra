# Monkey model

This folder holds the Tripo P2 source mesh of the monkey (`tripo-p2/`) and its hand rig
(`tripo-hand/`). The app does not serve these files. It loads the module
`src/models/studio/monkey.ts`, which this chain writes:

```text
tripo-p2/monkey.fbx             source mesh with quad faces
   │  pnpm hand-chain monkey    chain tools/blender/hand/monkey/
   v
tripo-hand/monkey.blend         hand rig (design 4.4, "Hand rig")
   │  pnpm rig-export monkey    the same run
   v
tripo-hand/monkey.rig.glb       rigged mesh, with its summary monkey.rig.json
   │  pnpm studio-body monkey   the same run
   v
src/models/studio/monkey.ts     studio body of the app
```

`tools/blender/hand/README.md` gives the steps of the chain. The section "Tripo hand rig" below
gives the files, their sources, their licenses, and their checksums.

The files of the older body of the route of `pnpm rig-mesh` are removed. Commit `cbc8db5e4` has
these files and the sections of this file about them.

## Tripo hand rig

`tripo-hand/` holds the body of the app ("tripo-hand/monkey.blend" below): a hand rig of the Tripo
P2 mesh `tripo-p2/monkey.fbx`, made by one build script in a headless Blender 5.2, by the route of
the Tripo wolf (`../wolf/README.md`, "Tripo hand rig"). The body keeps the form, the colors, and the
eyes of the source: no point edit changes the head, the face, the ears, the trunk, the hands, the
feet, the legs, or the tail. The arms keep the length of the source: no cut, no split from the
trunk, and no stretch. The `ANIMALS` entry of the monkey points to `tripo-hand/monkey.rig.glb`.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/monkey.fbx`, `tripo-p2/monkey.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/monkey.blend` | Made from `tripo-p2/monkey.fbx` by the scripted edits below. License as the FBX file | `pnpm hand-chain monkey` |
| `tripo-hand/monkey.rig.glb` | Export of `tripo-hand/monkey.blend`. License as the FBX file | `pnpm rig-export monkey --blend assets/models/monkey/tripo-hand/monkey.blend --out assets/models/monkey/tripo-hand/monkey.rig.glb` |
| `tripo-hand/monkey.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/monkey-color.webp`, `tripo-hand/monkey-normal.webp` | Web copies of the color map and the normal map of the FBX ("Color map" and "Normal map" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/monkey-maps.py` |

### tripo-p2/monkey.fbx

A cute brown macaque in a T-pose with quad faces, made with Tripo P2 from the sheet of the monkey
(`assets/images2/monkey.png` of the main checkout): a pink face, pink ears, hands, and feet, five
fingers on each hand, and a tail that curls up behind the back. Its arm tubes have 8 vertices
around.

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan, and given on 2026-11-11. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary. The maps lie beside the FBX file in the zip file |
| Contents | One mesh object, with no armature and no animation. 3,271 vertices and 3,583 faces: 2,923 quads and 660 triangles, no n-gon. One UV layer |
| Parts | 4 parts: the body with the tail (3,147 vertices), two eyeballs (49 vertices each, spheres of radius 0.0327 about (±0.041, 0.839, 0.197)), and a loose speck of 26 vertices that floats about 0.05 units behind the tail (z -0.269 to -0.288). 24 open edges, and no edge with more than two faces |
| Box | In the studio units (1 unit from the soles to the top of the tuft): x ±0.431 (the finger tips), z -0.288 (the speck) to 0.288 (the muzzle). The monkey faces -y in Blender, with its left side at +x, so the import needs no turn |

The folder `monkey.fbm/` keeps two maps of the zip file under new names, as bytes. The roughness and
the metallic maps are not kept.

| File | Name in the zip file | Size | Pixels | SHA-256 |
|---|---|---|---|---|
| `monkey.fbx` | `tripo_convert_7dce9a2e-4a8e-4905-bc20-15db7b214dcb.fbx` | 226,572 bytes | | `bec39b50697ca7c38f61c4d7a9b2ea0f58cb154cc97e94cad2eaaa40c2a92582` |
| `monkey.fbm/monkey_basecolor.jpg` | `tripo_rgb_1c53751f-7c27-4c66-b612-22fe4a6bcad4.jpg` | 3,135,319 bytes | 4096 × 4096 | `47aca241ba57952feb0cb8ef7948bb2b9d93aabdaa15654424d1ce98b0772868` |
| `monkey.fbm/monkey_normal.jpg` | `tripo_normal_fedfa8b1-bbc3-41d8-936d-2202ec96348e.jpg` | 1,732,799 bytes | 4096 × 4096 | `fc638bfc751a68e0ded6a56c6f3a73cf9233a63d3d553860887ea1be90de4281` |

The color map paints brown fur, a cream chest and belly, a pink face with a small pink nose and a
smile line, pink ears, hands, and feet, and on each eyeball a full eye: a brown iris, a black
pupil, white, a dark rim, and a white light.

### tripo-hand/monkey.blend

The hand rig (design 4.4, "Hand rig"). The chain of the body is in `tools/blender/hand/monkey/`
(`build.py`, `make_config.py`, `params.json`, `base-config.json`, `redits.py`, `rimport.py`,
`rings.py`), and `pnpm hand-chain monkey` runs it (`tools/blender/hand/README.md`). Its scripts are
those of the Tripo wolf with the changes below. `make_config.py` writes
`tools/mesh-rigs/simple/monkey-tripo.json`: the joints of the source.

| Item | Value |
|---|---|
| Size | 398,656 bytes (each run writes other bytes) |
| SHA-256 | `1d0484d325e91a8620df7c2aad0a19fcf61d1a16231a3908db359dd1bb864470` |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the top of the tuft, the soles at z = 0, the monkey faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `monkey`: 3,721 vertices and 3,983 faces (3,323 quads and 660 triangles, 7,306 triangles), flat faces, and the surface of `sa.add_surface()`. No face is gloss: the 20 faces of the nose take the slot `fur` and the color map, with the smooth normals of the fur ("Nose"). The 96 faces of the two eyeballs have the face attribute `eye`, and the 312 faces of the two lids the face attribute `lid`. The UV map of the FBX, and the property `texture` (`assets/models/monkey/tripo-hand/monkey-color.webp`) |
| Armature | `monkey_rig`: the 30 body bones, `tail_tip`, and the 20 arm segments and helpers, at the joints of the config. The Action `bind` holds the bind with no bind supination. The properties `palm`, `hinges`, `seat`, and `lids` come from the steps below |
| Facts | `height` 0.857518 (the shoulder joints at 1.356832 m for each unit: 1.2 times the scale 1.130693 that kept H of the monkey of main, so that H is 0.400355 m), `crease` 180 |
| Eyes | The eyeballs of the mesh, with the finish `varnish` and no eye light (`eyeFinish` of the entry), and a blink lid on each. No eye objects, so the app adds no bead eyes |

The edits, in the order of the build (`sa` is `tools/blender/studio_armature.py`, x is the x of the
left side):

- **Import.** `sa.import_source('assets/models/monkey/tripo-p2/monkey.fbx', 1e-5)`. No vertex
  merges, and each face is flat.
- **Speck.** The loose part of 26 vertices behind the tail goes (each loose part of fewer than 30
  vertices). The eyeballs stay.
- **Arm rings.** Edge ring Subdivide (`bmesh.ops.subdivide_edges(bm, edges=<ring>, cuts=1,
  use_grid_fill=True)`) of the clean quad bands of 8 edges between the closed arm loops at x 0.165,
  0.185, 0.199, 0.213, 0.234, 0.261, 0.285, and 0.305: 1 cut on each band. The elbow and the
  forearm then have a ring about each 0.3 arm radii.
- **Folds.** `fold_relax()` of the badger chain (`foldRelax` of the params): each round moves each
  vertex of the triangles with a corner normal 45 degrees or more off the face normal half of the
  way to the middle of its neighbors, between the feet (y 0.06) and the neck (y 0.66) and inside
  the paws (|x| below 0.29), with each move clipped to 0.015 units. 130 fold triangles become 3
  in 40 rounds, and 145 vertices move, by 0.006 units in the mean and 0.015 units (2.0 cm) at
  most. The folds are fur tufts along the back and creases at the backs of the knees. The FBX
  viewer shades them with the custom normals of the file, but the app makes its normals from the
  form, so they showed as dark spikes on the outline of the back and dark creases at the knees.
  The head keeps its form.
- **No knee rings.** The leg loops stop at poles, so no leg band is a clean quad ring. Exact knee
  rows ("Weights" below) take their place.
- **Hands turned.** Each vertex past the arm ring at x 0.295 turns rigidly about the rest forearm
  axis by whole ring steps of 45 degrees: -135 degrees on the left (3 steps) and 90 degrees on the
  right (2 steps), 309 and 310 vertices. New quads join the two rings with the step offset, and the
  far ring takes the form of the ring before the turn (a fade to 0 at 0.02 units). The hands and
  the fingers keep their form ("Arm twist").
- **Point edits.** None.
- **Surface.** `sa.add_surface(monkey, 'monkey', <base color>, eye_fans=False,
  config=<monkey-tripo.json>)`. The 20 gloss faces are the pink nose in the nose box of the config.
- **Eyes.** The faces of the two eyeballs (the loose parts of 30 to 99 vertices in the eye box)
  take the face attribute `eye`, and keep the color map.
- **Armature.** The joints of the config: the shoulder at x 0.10, the elbow at x 0.205, the wrist
  at x 0.31, the knuckles at x 0.375, where the fingers part, the hip at (0.09, 0.30, 0.06), the
  knee at (0.094, 0.17, 0.055), and the ankle at (0.095, 0.055, 0.04). The palm is the true palm of
  the source, the mean normal of the hand faces that face down, (-0.066, -0.998, 0), turned by the
  hand turn. The bind arms (`bindArms`) are those of the monkey of main. The leg turns put the
  thigh 90 degrees down and 15 degrees out, and the shin 22 degrees back, and the trunk leans
  forward a little (`open` -2). The tail bones keep the directions of the source in the bind.

The weights, in the rest pose:

1. Automatic Weights, then Limit Total 4 and Normalize All, on a copy of the mesh with no tail and
   no eyeball.
2. Arm rows: each vertex of a side with |x| from 0.10, within 0.07 units of the line of the rest
   arm (0.11 units past the wrist, so that the thumb is in), takes one exact row
   (`sa.set_weight_row()`): a clavicle share from 0.4 at x 0.10 to 0 at x 0.14, an elbow helper
   share of 0.25, 0.75, 0.75, and 0.25 at x 0.185, 0.199, 0.213, and 0.227, and the rest on the 4
   roll segments.
3. Wrist rows: the bend share of the hand grows in 12 equal steps of 0.004 from 0.04 units before
   the head of `hand_<side>`. Knuckle rows: the fingers share grows in 12 equal steps of 0.0035
   from 0.02 units before the head of `fingers_<side>`. The four fingers follow `fingers_<side>`,
   and the thumb, which starts near the wrist, follows the hand. The rig has no digit bones,
   because the trumpet hold poses no single finger.
4. Knee rows: each leg vertex within 0.07 units of the knee joint along the line from the hip to
   the ankle, and within 0.08 units of that line, keeps the sum t of its thigh and shin shares and
   splits it as thigh t (1 - k) and shin t k, with k = smoothstep(-0.04, 0.04) of the place past the
   knee joint.
5. The eyeballs and the gloss nose take {`head` 1}. The tail (the vertices that a flood from its
   lowest point reaches through z below -0.07, and through z below -0.04 above y 0.42 for the end
   of the curl) takes {`hips` 1 - a, `tail` a}, with a = smoothstep(0, 0.03) of the length of the
   shortest edge path from the root of the tail. `tail_tip` takes no share: with a share by the
   place along that bone, the curl bent in the bind.

**Smooth surface.** No relax and no region colors. The crease angle 180 gives each corner the mean
normal of the faces at its vertex, as the smooth shading of an FBX viewer.

**Nose.** At the end of the build, the 20 gloss faces of the pink nose go to the slot `fur`
(`noseFur` of the params). Thus the nose takes the color map, with its painted nostrils, and the
smooth normals of the fur. As flat gloss faces in one color, the nose showed facets and no nostrils.
The weights do not change: the nose vertices keep the row {`head` 1}. The head center of the holds
does not move, so the armature has no `headShift`. The nose keeps the colors of the source map. In
the hall light it reads as the nose of the FBX file, so the map tool does not change it.

**Stance.** The monkey has no chair (`noChair` of `src/models/species.ts`). The property `seat` is
{`prop` `chair`, `front` -0.04, `back` -0.11, `halfWidth` 0.15}: a seat under the back of the
haunch, behind the heels, which only sets the seat height of the export. The seat height is
0.401 m (0.292 m on the monkey of main), so the soles stay on the floor in the app. The legs keep
the length of the source. The thighs hang straight down, the knees bend 22 degrees, and the
shoulders stay over the hips, as a brass player stands erect (`docs/reference/wind-technique.md`,
1.8). The soloist keeps this stance (`soloist` false in `ANIMALS` of `tools/studio-body.ts`).
Reason: the straight legs of the sheet put the center of mass 2.1 to 2.8 cm off the middle of the
soles. With the leg turns and the trunk lean of the monkey of main, the large head and the chest
leaned far forward of the haunch.

**Play stance.** In the play, the spine turns 7 degrees back (`lean` of `MONKEY_TRUMPET` of
`src/pose/winds.ts`), so the head stays upright over the chest and the hips. The monkey plays the
trumpet of the app (no `trumpetScale`). The table gives, from the middle of the soles (the corners
within 1.2 cm of the floor, 26 cm long), the center of mass (the volume of the skin and a trumpet
of 1 kg times the cube of its scale) and the head center, in cm in front of the middle (negative:
behind it), with the bow of the head from the vertical. The hips stay 4.6 cm behind the middle.
The lowest point of the skin stays on the floor in each moment. Before: the body at the scale
1.130693 with the trumpet of 0.85. Probe: `scratch/p/balance.ts` of the session, which git
ignores (from `scratch/trumpet/probe.ts`, with the height of the lowest point).

| Moment | Center of mass, before | After | Head center, before | After | Head bow, before | After |
|---|---|---|---|---|---|---|
| note, stand | -0.5 | -0.5 | -0.4 | -0.4 | 3.9° | 3.9° |
| between | 0.2 | 0.3 | 1.1 | 1.4 | 5.7° | 5.7° |
| rest | 0.5 | 0.7 | 0.2 | 0.3 | -12.7° | -12.7° |
| lift50 | 0.2 | 0.3 | 0.0 | 0.1 | -6.3° | -6.3° |
| lower50 | 0.1 | 0.1 | -0.1 | 0.0 | -4.0° | -4.0° |

**Lids.** A lid on each eye: 14 × 13 points from psi -55 to 45 degrees and lam from -50 to 62
degrees on the left (the mirror on the right), with the lower strip as the first row, at 1.17 ball
radii. 156 quads on each side, held turned up 126 degrees into the head. The property `lids` holds
the angle 2.199115 and the hinge axes. The lid faces take the pink skin patch at UV (0.868, 0.352)
at 0.25 UV for each unit, and the row `head` 1. In the 21 steps of the blink no open lid point,
side edge, or back edge leaves the head (ray casts), and the open lid lies at least 0.0265 units
under it.

**Arm twist.** The roll of each upper arm and the twist of each forearm, in degrees, in each moment
of `MONKEY_TRUMPET` of `src/pose/winds.ts` (`pnpm pose-preview trumpeter`):

| Moment | Left upper arm | Left forearm | Right upper arm | Right forearm |
|---|---|---|---|---|
| note | 24.1 | 22.8 | -25.7 | -22.7 |
| rest | 70.6 | -2.6 | -50.6 | 5.3 |
| lift50 | 43.7 | 15.5 | -29.9 | -14.4 |
| lower50 | 37.6 | 19.0 | -26.7 | -17.8 |
| stand | 24.1 | 22.8 | -25.7 | -22.7 |

The rest row comes from the rest place in front of the belly (`restShift` of `MONKEY_TRUMPET`).
Its upper arm rolls are larger than 45 degrees (67.0 and -49.4 with the old stance). The skin
twist of the arm gate (`pnpm arm-check trumpeter`, p95) was 39 (left) and 29 (right) degrees.
The table comes from the hold before the play stance. With the play stance, the trumpet of 0.85,
and the scale 1.130693, the skin twist is 44 and 29 degrees, at most 45, and the right paw bends
68 degrees at the wrist (limit 70). The arm gate did not run again at the scale 1.356832.

With the hands of the source, the forearms twisted -130 and 112 degrees at rest. The hold keeps the
constants of the trumpet hold of the monkey of main. The right hand closes under the valves, the
left hand on the lead pipe, and the mouthpiece meets the lips under the nose.

**Color map** (`tools/monkey-maps.py`). The tool scales the source to 2048 pixels (Lanczos) and
writes WebP quality 60, method 6 (Pillow 13.0.0). No texel changes its color. The eyes keep the
iris place of the source. In the play view and the far hall view the gaze reads as a look ahead, so
no iris moves.

**Normal map.** The same run writes `monkey-normal.webp` from the normal map of the FBX, as for the
wolf: each x, y tilt limited to 0.2 (2.13 % of the texels), a box scale to 1024 pixels, the tilts
times 4 in red and green, 255 in blue, and `cwebp -q 60 -sharp_yuv -m 6` (libwebp 1.5.0).

**Differences from the source.** The app light is warm and comes from above, so the brown fur reads
lighter and more orange than in the even gray light of an FBX viewer. The eye whites read smaller,
and the pupils larger and darker, than in the FBX viewer. The source has small notches at the back
of the knees and under the haunch, which the app light shows as dark marks. The arm tubes have 8
vertices around, so the arm outline shows corners.

The export of the file and the maps. License of each file: CC BY-NC 4.0, as the FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/monkey.rig.glb` | 1,239,404 bytes | `a42590fe194c25894fff5c965c07c5c9a782be8fc4890c19bd23f57b32ab4420` |
| `tripo-hand/monkey.rig.json` | 16,671 bytes | `2086a1ed58d160c470edccf826dd14f0c75b5bb44766e26f8fa97d1aa338abf1` |
| `tripo-hand/monkey-color.webp` | 178,300 bytes, 2048 × 2048 | `5b9920243e479862e07e602f19b82b5eebdfe1f1ddd6d019c524f619cb34d117` |
| `tripo-hand/monkey-normal.webp` | 111,326 bytes, 1024 × 1024 | `e81b285a48619d696b4ae23557ee2d203934d8a2be29739b2a7cfd2c88f83dca` |

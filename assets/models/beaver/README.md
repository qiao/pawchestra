# Beaver model

This folder holds the Tripo P2 source mesh of the beaver (`tripo-p2/`) and its hand rig
(`tripo-hand/`). The app does not serve these files. It loads the module
`src/models/studio/beaver.ts`, which this chain writes:

```text
tripo-p2/beaver.fbx             source mesh with quad faces
   │  pnpm hand-chain beaver    chain tools/blender/hand/beaver/
   v
tripo-hand/beaver.blend         hand rig (design 4.4, "Hand rig")
   │  pnpm rig-export beaver    the same run
   v
tripo-hand/beaver.rig.glb       rigged mesh, with its summary beaver.rig.json
   │  pnpm studio-body beaver   the same run
   v
src/models/studio/beaver.ts     studio body of the app
```

`tools/blender/hand/README.md` gives the steps of the chain. The section "Tripo hand rig" below
gives the files, their sources, their licenses, and their checksums.

The files of the older body of the route of `pnpm rig-mesh` are removed. Commit `cbc8db5e4` has
these files and the sections of this file about them.

## Tripo hand rig

`tripo-hand/` holds the body of the app: a hand rig of the Tripo P2 mesh `tripo-p2/beaver.fbx`,
made by one build script in a headless Blender 5.2, by the route of the Tripo wolf
(`../wolf/README.md`). The source FBX is the target of the look: the body keeps the form, the
colors, the eye paint, and the eyes of the source, with a crease angle of 180° and only a scale to
H. The arms keep the length of the source: no cut, no split from the trunk, and no stretch. The
`ANIMALS` entry of the beaver in `tools/studio-body.ts` points to `tripo-hand/beaver.rig.glb`. The
files of the old beaver above do not change.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/beaver.fbx`, `tripo-p2/beaver.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/beaver.blend` | Made from `tripo-p2/beaver.fbx` by the scripted edits below. License as the FBX file | `pnpm hand-chain beaver` |
| `tripo-hand/beaver.rig.glb` | Export of `tripo-hand/beaver.blend`. License as the FBX file | `pnpm rig-export beaver --blend assets/models/beaver/tripo-hand/beaver.blend --out assets/models/beaver/tripo-hand/beaver.rig.glb` |
| `tripo-hand/beaver.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/beaver-color.webp`, `tripo-hand/beaver-normal.webp` | Web copies of the color map and the normal map of the FBX ("Maps" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/beaver-maps.py` |

### tripo-p2/beaver.fbx

A round, furry beaver in a T-pose with quad faces, made with Tripo P2 from the sheet of the beaver
(`assets/images2/beaver.png` of the main checkout). It stands upright on short legs, and its large
flat tail goes back from the haunch and lies on the floor behind it.

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan, and given on 2026-11-12. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary. The maps lie beside the FBX file in the zip file |
| Contents | One mesh object, with no armature and no animation. 3,227 vertices and 3,621 faces: 2,643 quads and 978 triangles, no n-gon. One UV layer |
| Parts | 20 parts: the body with the tail (2,890 vertices), the two front teeth (99 vertices, open at the top), an eyeball of 69 vertices in an open socket on each side, and 16 whisker strips of 5 to 7 vertices. 148 open edges in 19 loops, and no edge with more than two faces |
| Box | In the studio units (1 unit from the soles to the top of the head): x ±0.467 (the paw tips), z -0.410 (the tail tip) to 0.409 (the nose). The beaver faces -y in Blender, with its left side at +x, so the import needs no turn |

The folder `beaver.fbm/` keeps two maps of the zip file under new names, as bytes. The roughness and
the metallic maps are not kept.

| File | Name in the zip file | Size | Pixels | SHA-256 |
|---|---|---|---|---|
| `beaver.fbx` | `tripo_convert_d2e560d9-0dc1-4578-9923-069bdb492435.fbx` | 222,700 bytes | | `9ce94a737c15e7c5de8fa08bed9f526b5fe963d6a65ce27a9818ba113e6cf74c` |
| `beaver.fbm/beaver_basecolor.jpg` | `tripo_rgb_7b6059c5-604a-4012-911d-18b38c686cf8.jpg` | 3,995,186 bytes | 4096 × 4096 | `84a5735f34de85d3b1582646ae1c5ff56fe53b4603d6a088e1e29de6bfa73e48` |
| `beaver.fbm/beaver_normal.jpg` | `tripo_normal_cfde2fde-ef2e-4c9e-887f-e3e737665cd3.jpg` | 2,362,920 bytes | 4096 × 4096 | `cf1fee4a8080c874cbde7b3a6c580e59ba2d45beae758e3933c5607fcf794709` |

The color map paints orange-brown fur with long strands, a light muzzle and cheeks with dots at the
whisker roots, a dark brown nose, cream teeth, dark brown paws and feet, a brown tail with a pattern
of scales, and on each eyeball a dark brown iris, a black pupil, and a white light.

### tripo-hand/beaver.blend

The hand rig (design 4.4, "Hand rig"). The chain of the body is in `tools/blender/hand/beaver/`
(`build.py`, `make_config.py`, `params.json`, `base-config.json`, `redits.py`, `rimport.py`,
`rings.py`, `tail.py`), and `pnpm hand-chain beaver` runs it (`tools/blender/hand/README.md`). Its
scripts follow the scripts of the Tripo cat (`../cat/README.md`). `make_config.py` writes
`tools/mesh-rigs/simple/beaver-tripo.json`: the joints of the source.

| Item | Value |
|---|---|
| Size | 383,979 bytes (each run writes other bytes) |
| SHA-256 | `19860b713dbedc7b22a0051dff1c5ab103f3fac11151ac82f6b8a2bbd9744b1f` |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the top of the head, the soles at z = 0, the beaver faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `beaver`: 3,687 vertices and 4,029 faces (3,051 quads and 978 triangles, 7,080 triangles), flat faces, and the surface of `sa.add_surface()`. No face is gloss: the 85 faces of the nose take the slot `fur` and the color map. The 136 faces of the two eyeballs have the face attribute `eye`, the 312 faces of the two lids the face attribute `lid`, and the 42 faces of the whiskers the face attribute `plain`. The UV map of the FBX, and the property `texture` (`assets/models/beaver/tripo-hand/beaver-color.webp`) |
| Armature | `beaver_rig`: the 30 body bones, `tail_tip`, and the 20 arm segments and helpers, at the joints of the config. The Action `bind` holds the bind with no bind supination. The properties `palm`, `hinges`, `seat`, and `lids` come from the steps below |
| Facts | `height` 0.617287 (the shoulder joints at 1.01029 m for each unit, so that H is 0.310441 m, the H of the beaver of main, 0.310442 m), `crease` 180 |
| Eyes | The eyeballs of the source in their sockets, with the finish `varnish` and no eye light (`eyeFinish` of the entry), and a blink lid on each. No eye objects, so the app adds no bead eyes |

The edits, in the order of the build (`sa` is `tools/blender/studio_armature.py`, x is the x of the
left side):

- **Import.** `sa.import_source('assets/models/beaver/tripo-p2/beaver.fbx', 1e-5)`. No vertex
  merges, and each face is flat.
- **Arm rings.** Edge ring Subdivide (`bmesh.ops.subdivide_edges(bm, edges=<ring>, cuts=1,
  use_grid_fill=True)`) of the clean quad bands of 12 edges between the closed arm loops at x 0.204
  and 0.234, and at x 0.299 and 0.331.
- **Elbow rings.** The elbow from x 0.234 to 0.299 has a ring through two poles (x 0.268 to
  0.276) and no closed loop there, but each band at its two sides is a clean ring of 12 quads.
  `seed_rings()` cuts each band one time at its middle (`ringSeeds` of the params: the seeds
  (0.2504, 0.5769, 0.1756) and (0.2802, 0.5594, 0.1473), mirrored on the right). Thus a ring
  stands each 0.015 units over the bend, as on the upper arm and the forearm. Reason: over bands
  of 0.03 units, the bent right elbow of the bassoonist showed a sharp corner with flat faces.
- **Rings with no split.** The arm root to x 0.186 and the paw from x 0.352 stop at triangles or
  poles. The legs are short stumps under the belly, and their bind keeps the pose of the source,
  so they take no ring.
- **Folds.** The source has small folds of the surface: on the back (x ±0.064, y 0.61), on each
  cheek (x ±0.19, y 0.83), under the jaw (x ±0.17, y 0.74), and on the back of the head. The FBX
  viewer shades them with the custom normals of the file, but the app makes its normals from the
  form, so their faces showed as dark triangles. `fold_relax()` finds the triangles with a corner
  whose normal (crease 180) turns more than 75° from the triangle, with no paw (|x| below 0.36)
  and no foot (y above 0.06), and moves their vertices by 0.5 times the mean of their edge
  neighbors less their place, in up to 40 rounds, with each total move clipped to 0.02 units. 20
  fold triangles become 1 (at the low back behind the root of the tail, which the tail hides). 46
  vertices move, by 0.005 units in the mean and 0.0186 units (1.9 cm) at most, in a cheek pocket.
  The step comes before the paw turn.
- **Paws turned.** Each vertex past the arm ring at x 0.331 turns rigidly about the rest forearm
  axis by whole ring steps of 30 degrees: -120 degrees on the left (4 steps) and 30 degrees on the
  right (1 step), 328 vertices on each side. New quads join the two rings with the step offset,
  and the far ring takes the form of the ring before the turn (a fade to 0 at 0.02 units). The new
  quads keep the UVs of the old band. The paws keep their form ("Arm twist").
- **Wrist loop.** The ring at x 0.331 does not turn. It is slanted, so 5 of its 12 vertices lie
  past its mean along the forearm axis. When they turned with the paw, the quads before the ring
  sheared into a pinched wrist with a fan of stretched fur: 10 faces on the left and 12 on the right
  had UV scale ratios of 2.6 to 14.5, against about 1.1 on the faces around them.
- **Point edits.** None. The head, the eyes, the teeth, the trunk, the arms, the paws, the legs,
  and the tail keep the form of the source. In the app the paws read in proportion to the arms, so
  they take no paw edit.
- **Surface.** `sa.add_surface(beaver, 'beaver', <base color>, eye_fans=False,
  config=<beaver-tripo.json>)`. At the end of the build, the 85 gloss faces of the nose go to the
  slot `fur`, so that the nose takes the color map and the smooth normals of the fur.
- **Eyes.** The two loose parts of 60 to 80 vertices in the eye box take the face attribute `eye`.
  Each ball is a sphere of radius 0.0244 units about (±0.0696, 0.888, 0.259), and each eye
  opening is about 0.12 of the head width at the eye line.
- **Armature.** The joints of the config: the shoulder at x 0.17, the elbow at x 0.27, the wrist at
  x 0.365, where the paw widens, the knuckles at x 0.405, and the tip at x 0.467, on the arm axis
  at y 0.611. The hip at (0.11, 0.20, 0.07), the knee at (0.13, 0.12, 0.10), the ankle at (0.14,
  0.055, 0.10), and the toes from (0.15, 0.02, 0.21) to (0.155, 0.01, 0.32). The tail bone from
  (0, 0.20, -0.12), `tail_tip` from (0, 0.09, -0.25) to (0, 0.03, -0.40). The palm is the true palm
  of the source, the mean normal of the paw faces that face down (x from 0.38), (0.049, -0.999,
  -0.016), turned by the paw turn. Each elbow axis turns about its bind upper arm (`hingeTurn`:
  30 degrees on the left, -60 degrees on the right; "Arm twist").

The weights, in the rest pose:

1. Automatic Weights, then Limit Total 4 and Normalize All, on a copy of the mesh with no loose
   part.
2. Arm rows: each vertex of a side with |x| from 0.17, within 0.08 units of the line of the rest
   arm, takes one exact row (`sa.set_weight_row()`): a clavicle share of 0.60, 0.50, 0.40, 0.32,
   0.22, 0.17, and 0.08 at x 0.17, 0.18, 0.19, 0.2, 0.21, 0.219, and 0.235, and 0 at x 0.27, an
   elbow helper share that grows from 0 at x 0.219 to 1 at the elbow joint (x 0.27) and falls to 0
   at x 0.315, and the rest on the 4 roll segments. The helper ramp spans the three rings on each
   side of the joint, so that the bend share grows over 6 bands, and the bent elbow is round. With
   a ramp from x 0.235 to 0.306, the bent right elbow of the bassoonist still showed a corner. The bone heat rows inside x 0.17 give the front of each
   armpit a clavicle share of about 0.6, so the soft clavicle ramp of the polar bear starts near
   that share. The old first row of 0.4 dropped to 0 in 0.04 units, and the paws of the rest
   bassoon pulled the front of the right armpit into a dark slot.
3. Wrist rows: the bend share of the paw grows in 12 equal steps of 0.004 from 0.03 units before
   the head of `hand_<side>`. Knuckle rows: the fingers share grows in 12 equal steps of 0.0035 from
   0.02 units before the head of `fingers_<side>`.
4. Ear rows: a plane through the ear base splits the head and each ear (`earPlane` of the params),
   as on the Tripo cat.
5. The eyeballs, the teeth, the whiskers, and the nose take {`head` 1}. The tail (each vertex with
   rest z below -0.13 and y below 0.28, 150 vertices) takes {`hips` 1 - a, `tail` a (1 - c),
   `tail_tip` a c}, with a = smoothstep(-0.01, 0.03) along `tail` and c = smoothstep(-0.03, 0.03)
   along `tail_tip`. Each other vertex gives its tail weights to the hips.

**Smooth surface.** No relax and no region colors: the form stays the form of the source, but for
the folds above. The crease angle 180 gives each corner the mean normal of the faces at its vertex,
as the smooth shading of an FBX viewer.

**Stance and seat.** The beaver has no chair (`noChair`, design 4.4). Its bind keeps the legs, the
trunk, and the tail of the source: the leg turns are none (`studio.legTurns`), the trunk takes no
recline (`studio.trunk.open` 0), and the tail bones keep the directions of the source
(`studio.tailBind`). Thus it stands on its short legs as in the source, with the feet flat on the
floor and the flat tail on the floor behind it. The property `seat` is {`prop` `chair`, `front` 0,
`back` -0.1, `halfWidth` 0.24}: its top is the underside of the belly between the legs. The seat
height of the app is 0.062 m (0.072 m on the beaver of main). The seat height moves no player of a
demo. The footprint of the new body (the round belly and the long flat tail) moves the beavers 0.21
m to 0.52 m in their rows in 4 demos, and the players of 7 of the 19 demos by a median of 1 cm to
4 cm (`layout-dump.ts` of the scratch folder against `HEAD`).

**Tail.** The tail does not move in the bind, so it lies on the floor behind the body in each pose,
as in the source. It sways about the vertical with the idle sway of the app. There is no chair, so
it meets no seat, back post, or rail.

**Lids.** A lid on each eye: 13 × 13 points from psi -60 to 60 degrees and lam from -60 to 65
degrees on the left (the mirror on the right), with the lower strip as the first row, at 1.15 ball
radii (1.12 for the strip). 156 quads on each side, held turned up 110 degrees into the head. The
property `lids` holds the angle 1.919862 and the hinge axes. The lid faces take the fur patch at UV
(0.7152, 0.1556) at 0.64 UV for each unit, and the row `head` 1. In the 21 steps of the blink no
open lid point, side edge, or back edge leaves the head (ray casts), and the open lid lies at least
0.0059 units under it.

**Eyes and face.** The eyes keep the size, the paint, and the iris place of the source. Each eye
opening is about 0.12 of the head width, no white shows above an iris, and the gaze reads forward
in the test page, the play view of a phone, and the default hall camera. The map paints a light on
each ball, so the eyes take the finish `varnish` and no eye light, with one light in each eye. The
mouth of the source reads as a slight smile in the stage light, so it takes no smile edit.

**Arm twist.** The roll of each upper arm and the twist of each forearm, in degrees, in each moment
of `BEAVER_BASSOON` of `src/pose/winds.ts` (`pnpm pose-preview bassoonist`), with the hold of the
first fit of this body:

| Moment | Left upper arm | Left forearm | Right upper arm | Right forearm |
|---|---|---|---|---|
| note | -5.1 | 16.1 | -5.9 | 6.8 |
| rest | 19.7 | -13.1 | -13.6 | 10.7 |
| lift50 | 10.6 | -2.1 | -12.1 | 10.4 |
| lower50 | 7.3 | 1.8 | -11.2 | 9.9 |

With the paws and the elbow axes of the source, the forearms twisted -134 to -163 degrees (left)
and 97 to 101 degrees (right), and the right upper arm rolled -66 to -74 degrees.

**Bassoon hold.** The arms of the Tripo beaver are short, so the hold of the old beaver did not
reach: the right paw missed its grip by 11.6 cm in the play and 14 cm at rest, and the reed ended
at the lower tips of the teeth. `BEAVER_BASSOON` and `SPECIES.beaver` of the app change (design
5.3): a bassoon of 0.55 (0.82 before), the shoulders 35° (left) and 40° (right) forward (20° and
20° before), the boot joint 5° to the right (5° to the left before), the reed 0.25 H lower and
0.24 H back from the mouth, at the lower lip behind the teeth, the rest place 0.1 H forward and
0.1 H lower, the left elbow further out, the right grip 0.15 H toward the axis and 0.08 H across
it, and the left fingers curled 110°. The measures of the gates, with the beaver of `HEAD` in
parentheses where the tool gives it:

| Measure | Left | Right |
|---|---|---|
| Grasps the bassoon, play, lift, rest, lower (`pnpm wind-grip bassoonist`) | 100 % in each set | 100 % in each set |
| Spare reach to the grip, play / rest (`pnpm hold-fit bassoonist`) | 0.6 / 1.9 cm | 0.9 / 1.1 cm |
| Note targets within 5 mm (`pnpm pose-depth bassoonist`) | 100 % | 100 % |
| Twist p95 (`pnpm arm-check bassoonist --base HEAD`) | 9° (22°) | 8° (29°) |
| Forearm twist p95 | 4° (43°) | 4° (18°) |
| Paw twist p95 | 10° (36°) | 10° (28°) |
| Grip turn p50 | 36° (17°) | 8° (15°) |
| Folds p95, the curled digits and the paws | 23 (9) | 20 (2) |
| Stretch p95 | 0.14 (0.06) | 0.04 (0.02) |

The paws, the claws, and the forearms stay within 1.2 cm of the bassoon, and the reed goes 1.4 cm
into the head at the lips (limit 2 cm). The left upper arm lies 2.7 cm (play) to 3.4 cm (rest)
in the body at 0.31 of its length, in each sample: that is its root in the round shoulder, with
no cut, and no view shows it. The long joint passes beside the head, clear of the eye, and the
boot stays below and behind the music desk.

**Maps** (`tools/beaver-maps.py`). The tool scales the color map of the source to 2048 pixels
(Lanczos), keeps 0.7 of its detail finer than a blur of 2 texels (`DETAIL_SHARE`), and writes
WebP quality 60, method 6 (Pillow 13.0.0). Reason: the full detail read as carved grooves in the
hall light. The colors stay. It writes `beaver-normal.webp` from the normal map of the FBX: each
x, y tilt limited to 0.2 (5.85 % of the texels), a box scale to 1024 pixels, the tilts times 0.5
(`TILT_SHARE`) and 4 in red and green, 255 in blue, and
`cwebp -q 60 -sharp_yuv -m 6` (libwebp 1.5.0).

**Differences from the source.** The app light is warm and comes from above, so the fur reads
lighter and more orange than in the even gray light of an FBX viewer, and the neck under the head
shades darker. The fold relax fills the small folds of the surface by 1.9 cm at most.

The export of the file and the maps. License of each file: CC BY-NC 4.0, as the FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/beaver.rig.glb` | 1,224,492 bytes | `0dce90442368ef178e826bca76dff79b6368f297ddc5e99b6035972408d440bc` |
| `tripo-hand/beaver.rig.json` | 17,197 bytes | `3e15962de667ad34b4a05a0c506d37033145e6f6c303849a55f3c5147f464ddd` |
| `tripo-hand/beaver-color.webp` | 199,904 bytes, 2048 × 2048 | `fc5a6f549bc676eefc6837d5398ad00f439d75cf9191a3921707f8034a35bfbc` |
| `tripo-hand/beaver-normal.webp` | 84,258 bytes, 1024 × 1024 | `aa1edb196f4b423afb6bb80671a424e943ca4f3354f7ba3f01ad755ba0471982` |

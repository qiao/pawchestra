# Panda model

This folder holds the Tripo P2 source mesh of the panda (`tripo-p2/`) and its hand rig
(`tripo-hand/`). The app does not serve these files. It loads the module
`src/models/studio/panda.ts`, which this chain writes:

```text
tripo-p2/panda.fbx             source mesh with quad faces
   │  pnpm hand-chain panda    chain tools/blender/hand/panda/
   v
tripo-hand/panda.blend         hand rig (design 4.4, "Hand rig")
   │  pnpm rig-export panda    the same run
   v
tripo-hand/panda.rig.glb       rigged mesh, with its summary panda.rig.json
   │  pnpm studio-body panda   the same run
   v
src/models/studio/panda.ts     studio body of the app
```

`tools/blender/hand/README.md` gives the steps of the chain. The section "Hand rig" below gives the
files, their sources, their licenses, and their checksums.

The files of the older body of the route of `pnpm rig-mesh` are removed. Commit `cbc8db5e4` has
these files and the sections of this file about them.

## Hand rig

`tripo-hand/` holds the body of the app: a hand rig of the Tripo P2 mesh `tripo-p2/panda.fbx`, made
by one build script in headless Blender 5.2, by the route of the Tripo wolf (`../wolf/README.md`,
"Tripo hand rig"). The body keeps the form, the colors, and the eye paint of the source. Two point
edits change the form: the upper arms and the forearms are 1.2 times longer ("Arm stretch"), and the
front paws are smaller ("Paw size"). The arms have no cut and no split from the trunk. The `ANIMALS`
entry of the panda in `tools/studio-body.ts` points to `tripo-hand/panda.rig.glb`. The files of the
old panda above do not change.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/panda.fbx`, `tripo-p2/panda.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/panda.blend` | Made from `tripo-p2/panda.fbx` by the scripted edits below. License as the FBX file | `pnpm hand-chain panda` |
| `tripo-hand/panda.rig.glb` | Export of `tripo-hand/panda.blend`. License as the FBX file | `pnpm rig-export panda --blend assets/models/panda/tripo-hand/panda.blend --out assets/models/panda/tripo-hand/panda.rig.glb` |
| `tripo-hand/panda.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/panda-color.webp`, `tripo-hand/panda-normal.webp` | Web copies of the color map and the normal map of the FBX ("Maps" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/tripo-maps.py panda` |

### tripo-p2/panda.fbx

A round plush panda with cream fur, dark ears, eye patches, shoulders, arms, and legs, and a round
tail, in a T-pose with quad faces, made with Tripo P2 from the sheet `assets/images2/panda.png` of
the main checkout.

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan, and given on 2026-11-12. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary. The maps lie beside the FBX file in the zip file |
| Contents | One mesh object, with no armature and no animation. 3,267 vertices and 3,599 faces: 2,895 quads and 704 triangles. One UV layer |
| Parts | 3 parts: the body with the round tail (3,185 vertices, closed), and two eyeballs (41 vertices each, open caps of about 0.03 units at (±0.052, 0.842, 0.125)). The 32 open edges are the rims of the eyeballs |
| Axes | The panda faces -y of Blender, so the import takes no turn. 1 unit from the soles to the ear tips, x ±0.46 (the paw tips), and z ±0.215 (the belly and the tail) |

The folder `panda.fbm/` keeps two maps of the zip file under new names, as bytes. The roughness
and the metallic maps are not kept.

| File | Name in the zip file | Size | Pixels | SHA-256 |
|---|---|---|---|---|
| `panda.fbx` | `tripo_convert_b9f16d02-8bf4-4c38-a0c1-408950af57ba.fbx` | 219,788 bytes | | `0151931b64e9625a7520199aa1a5d78451110a38489864c12247edbf405441c5` |
| `panda.fbm/panda_basecolor.jpg` | `tripo_rgb_ae82a68c-b295-4048-bb67-562c779168b7.jpg` | 4,478,108 bytes | 4096 × 4096 | `6acce2c36421f4a27ed65a8f6a12e9662c4d9a872be7452e506c806d33a4f018` |
| `panda.fbm/panda_normal.png` | `extracted_normal_a368a13f_cdd9_468f_8fd4_1f26b7dabe0a.png` | 10,096,302 bytes | 4096 × 4096 | `f0f30277d5fa3a47977d5e9014d12b385a4fab0c58acfa70c2084d6d7bcf4038` |

The color map paints the cream fur, the dark brown ears, eye patches, shoulders, arms, and legs, a
dark nose with nostrils, a thin smile line, and on each eyeball a brown iris, a black pupil, and a
white light. The normal map is an RGBA PNG with an alpha of 255 everywhere. Its red, green, and
blue hold a tangent-space normal in the encoding of the JPEG normal maps of the Tripo wolf and pig
(the median near 128, 127, 254), with the same sign of green: on the three maps, the tilt field
has the smaller curl with the same sign. Its tilts are smaller (95th percentile 0.07, against 0.20
on the wolf).

### tripo-hand/panda.blend

| Item | Value |
|---|---|
| Size | 403,098 bytes |
| SHA-256 | `744e9123c828de23771036129b04db2989e2f442b08aaf7fe45b97ac292f0378` |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the ear tips, the soles at z = 0, the panda faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `panda`, with the shape key `bind_belly` ("Belly"): 3,767 vertices and 4,047 faces (3,343 quads and 704 triangles, 7,390 triangles), flat faces, and the surface of `sa.add_surface()`. No face is gloss: the nose takes the color map. The 91 faces of the two eyeballs have the face attribute `eye`, and the 312 faces of the two lids `lid`. The UV map of the FBX, and the property `texture` (`assets/models/panda/tripo-hand/panda-color.webp`) |
| Armature | `panda_rig`: the 30 body bones, `tail_tip`, and the 20 arm segments and helpers, at the joints of the config. The Action `bind` holds the seated bind with no bind supination. The properties `palm`, `hinges`, `seat`, and `lids` come from the steps below |
| Facts | `height` 1.133145 (the shoulder joints at 1.807249 m for each unit, so that H is 0.499711 m, the H of the panda of `panda.rig.glb` at cbc8db5e4), `crease` 180, `seatWidth` 0.66 |
| Eyes | The eyeballs of the mesh at the size of the source, with the finish `varnish` and no eye light (`eyeFinish` of the entry), and a blink lid on each. No eye objects, so the app adds no bead eyes |

The chain of the body is in `tools/blender/hand/panda/` (`build.py`, `make_config.py`,
`params.json`, `base-config.json`, `redits.py`, `rimport.py`, `rings.py`, `tail.py`), and `pnpm
hand-chain panda` runs it (`tools/blender/hand/README.md`). Its scripts follow the scripts of the
Tripo cat and of the Tripo wolf. `make_config.py` writes `tools/mesh-rigs/simple/panda-tripo.json`:
the joints of the source, mapped by the paw turns, the arm stretch, and the paw edit. The edits, in
the order of the build (`sa` is `tools/blender/studio_armature.py`, x is the x of the left side, y
the height, in the source):

- **Import.** `sa.import_source('assets/models/panda/tripo-p2/panda.fbx', 1e-5)`. No vertex merges,
  and each face is flat.
- **Arm rings.** Edge ring Subdivide (`bmesh.ops.subdivide_edges(bm, edges=<ring>, cuts=1,
  use_grid_fill=True)`) of the clean quad bands of 16 edges between the closed arm loops at x
  0.199, 0.219, and 0.238, at the elbow (x 0.235).
- **Knee rings.** The same call with 1 cut on the leg bands of 18 edges between the closed loops at
  y 0.115, 0.138, and 0.158. The knee joint is at y 0.13.
- **Paws turned.** Each vertex past the arm ring at x 0.238 turns rigidly about the rest forearm
  axis by whole ring steps of 22.5 degrees: -135 degrees on the left (6 steps) and 112.5 degrees on
  the right (5 steps), 422 vertices on each side. New quads join the two rings with the step
  offset, and the far ring takes the form of the ring before the turn (a fade to 0 at 0.02 units).
  The new quads keep the UVs of the old band ("Arm twist").
- **Forearm loop.** The ring at x 0.238, near the elbow, does not turn. It is slanted, so 5 (left)
  and 4 (right) of its 16 vertices lie past its mean along the forearm axis. When they turned with
  the forearm, they moved up to 0.118 units, and the quads before the ring sheared into notches
  below the elbow: 12 faces on the left and 9 on the right had UV scale ratios of 3.0 to 23.3,
  against about 1.2 on the faces around them.
- **Arm stretch.** The point edit `armStretch` ("Arm stretch" below), before the automatic weights.
- **Paw size.** The point edit `paw` ("Paw size" below), after the automatic weights. Its paw frame
  moves with the forearm joint and the wrist joint of the arm stretch.
- **Other point edits.** None. The head, the eyes, the muzzle, the trunk, the legs, the feet, and
  the tail keep the form of the source.
- **Surface.** `sa.add_surface(panda, 'panda', <base color>, eye_fans=False,
  config=<panda-tripo.json>)`. The 40 faces in the nose box are no dark gloss faces, so they go back
  to the fur: the nose takes the color map with its painted nostrils.
- **Armature.** The joints of the config: the shoulder at x 0.13, the elbow at x 0.2555, the wrist
  at x 0.3693, the knuckles at x 0.4271 (x 0.235, 0.33, and 0.40 in the source, moved by the arm
  stretch and the paw edit), the hip at (0.105, 0.24, -0.01), the knee
  at (0.116, 0.13, -0.007), and the ankle at y 0.045. The palm is the true palm of the source, the
  mean normal of the paw faces that face down (x from 0.36), (0.127, -0.992, -0.016), turned by the
  paw turn. The bind arms and the trunk are those of the panda of main.

The weights, in the rest pose:

1. Automatic Weights, then Limit Total 4 and Normalize All, on a copy of the mesh with no
   eyeball.
2. Arm rows: each vertex of a side with |x| from 0.13, within 0.085 units of the line of the rest
   arm, takes one exact row (`sa.set_weight_row()`): a clavicle share from 0.4 at x 0.13 to 0 at x
   0.17, an elbow helper share that grows from 0 at x 0.2 to 1 at the elbow joint (x 0.235) and
   falls to 0 at x 0.27,
   and the rest on the 4 roll segments. These x are places of the source: a vertex of the
   stretched arm takes the row of its place before the stretch.
3. Wrist rows: the bend share of the paw grows in 12 equal steps of 0.004 from 0.03 units before
   the head of `hand_<side>`. Knuckle rows: the fingers share grows in 12 equal steps of 0.0035 from
   0.024 units before the head of `fingers_<side>`.
4. The eyeballs and the nose take {`head` 1}.
5. Ear rows: a plane across the base of each ear, through (0.072, 0.967, -0.035), (0.137, 0.881,
   -0.028), (0.081, 0.941, 0.019), and (0.111, 0.927, -0.068) (x mirrored on the right), the edge
   of the dark ear paint. Each head vertex 0.008 or more above the plane takes {`ear_<side>` 1},
   one from 0 to 0.008 {`ear_<side>` 0.5, `head` 0.5}.
6. Tail: the round tail is a bump of the haunch, no loose part. The automatic weights gave the tail
   bones shares over the lower back, so the bump and the back swayed with the idle tail. Each of
   the 152 vertices with a tail share gives it to `hips`, so the bump keeps its place.

**Smooth surface.** No relax and no region colors. The crease angle 180 gives each corner the mean
normal of the faces at its vertex, as the smooth shading of an FBX viewer.

**Belly.** Bone heat gives the thighs shares far up the belly and the flanks (0.1 at rest z 0.48,
0.7 on the flank at z 0.34). The seated thighs turn forward, so these shares pulled the belly back
by up to 0.1 units. The side views showed a hard ridge from each armpit down to the knee, and the
front view a dark band across the belly. The standing soloist has neither fault, because
`legs_straight_*` give it the source form. The key `bind_belly` (`belly_key()` and
`trunk_belly()` of `build.py`, `belly` of `params.json`) fixes the seated bind, and the weights do
not change:

1. Trunk form: each vertex moves by s (M_hips - M_leg) r, summed over its leg bones with their
   weights, with r its rest place and M the bind matrix of a bone. s = 0.5 ss(z, 0.18, 0.36)
   (1 - ss(z, 0.42, 0.50)) (1 - ss(y, -0.06, 0.04)), with ss a smoothstep of the rest place. The
   top fade keeps the chest under the arms: with no fade, the right upper arm went 1.7 cm into the
   belly in the play (`pnpm hold-fit trombonist`, limit 1.5 cm, 1.3 cm before).
2. Relax: 6 rounds of P += 0.5 ((mid - P) . n) n on the vertices with a rest z from 0.20 to 0.36,
   rest y below 0, atan2(|x|, -y) at most 60 degrees, and a distance below 0.25 from the z axis.

175 vertices move, at most 0.052 units. The trunk form starts at the lower belly (rest z 0.18).
With a start at z 0.26, the lower belly kept thigh shares of 0.5 to 0.7. The seated thighs pulled
it about 0.09 units back behind the thigh tops, so a groove with a black line showed across the
lap in each front view. Now the belly rests on the thigh tops. In the front views of the
trombonist, the pixels with a luma below 30 in the lap fall from 7,941 to 2,015 (rest) and from
6,031 to 2,093 (first position). A start at z 0.14 also moved the crotch, and the belly then
covered the tops of the dark thighs.

**Arm stretch.** The point edit `armStretch` of `redits.py` (in `params.json`: `{"kind":
"armStretch", "k": 1.2, "ramp": 0.01, "reach": [0.1, 0.12]}`), the edit of the hippo and the deer
(`../hippo/README.md`, "Arm stretch"). Each vertex of a side with |x| over the shoulder joint moves
along the line u of the rest arm, from the shoulder joint to the wrist joint (0.2003 units), from
its place t on the line to t + 0.2 G(t). G is the integral of a band from 0 to t: a smoothstep from
0 at t -0.01 to 1 at 0.01, 1 to the wrist, and a smoothstep to 0 from 0.01 before the wrist to 0.01
after it. Thus the upper arm and the forearm grow by 1.2, and the paw moves out by 0.04 units as one
piece. The move fades from 1 at 0.1 units from the line to 0 at 0.12 units, so that the belly and
the head stay: the arm and the paw lie within 0.095 units of the line, and the trunk and the head
0.12 units or more from it. Reason: the big round head puts the mouth 0.21 m in front of the right
shoulder joint, and with the arms of the source, each arm reached 0.417 m from the shoulder joint
to the middle of the palm. The right arm then reached 0.03 m of the slide travel of the trombone
of the app, so the panda played a trombone of 0.75, which read as a toy. Each arm now reaches
0.488 m, and the right arm reaches 0.135 m of the slide travel of the trombone of the app
(`pnpm hold-reach panda --instrument trombone`). The seat height (0.171 m), the head height, and the
layout do not change: each seat of a demo moves 0.04 cm or less.

**Paw size.** In the app, the front paws of the source read too large against the short arms: the
paw is 0.66 of the arm long and 0.70 of the arm wide (the source wolf 0.56 and 0.58, the panda of
main 0.29 and 0.39). The point edit `paw` of `redits.py` (in `params.json`: `{"kind": "paw",
"length": 0.8, "wide": 0.8, "thick": 1.0, "ramp": 0.02, "width": [0, 0, 1]}`), the edit of the
wolf, scales each front paw past the wrist joint about that joint, in the frame of the paw, with a
smoothstep share over the first 0.02 units. The paw height, the arm, and the feet do not change.
The largest move is 0.027 units (4.8 cm). The left paw in the rest of the export
(`scratch/panda/paw_measure.py`), against the shoulder distance:

| Measure | Source panda | Panda now | Panda of main | Tripo wolf |
|---|---|---|---|---|
| Length, wrist joint to tip | 0.506 | 0.405 | 0.302 | 0.451 |
| Width | 0.542 | 0.434 | 0.405 | 0.462 |

**Seat.** The thighs slope 25 degrees down and 5 degrees out in the bind, and the shins are
vertical, as on the panda of main (`legTurns` of the config). The legs are the short, thick legs of
the source, so the knee lies only 0.10 units in front of the hip, and the shin is 0.09 units
thick from the knee joint to its back. Thus the front of the seat lies 0.09 units behind the knee
joint (`seatGap`), and the seat top (the lowest point of the haunch over the seat) is 0.171 m high
(0.277 m on the panda of main), with the legs of the source. The chair is 0.435 m deep, so that
its back is behind the tail. Steeper thighs (40 degrees) give 0.185 m. A heel lift does not help
the round haunch, so the bind keeps the posture of the panda of main.

**Haunch and chair.** The haunch is 0.55 m wide at the seat top, 0.66 m 0.02 units above it, and
0.73 m at its widest, against the chair of 0.42 m of design 4.5. The fact `seatWidth` 0.66 gives
the panda a chair as wide as its haunch. The width of the chair moves no player: the layout moves
of the new body (below) are the same with 0.42, 0.60, 0.66, and 0.72.

**Tail.** The round tail is a bump of the haunch with the rows of `hips` (step 6 of the weights).
It lies 11.6 cm over the seat top and in front of the chair back, and `tools/tail-gap.ts` finds no
tail bone in the skin. With the tail rows of the automatic weights, it swayed 1.0 cm into the top
rail of the chair.

**Lids.** A lid on each eye: 14 × 13 points from psi -60 to 60 degrees and lam -60 to 65 degrees
(the right lid mirrors the range) at 1.15 ball radii, and a lower strip at 1.12 radii, held turned
up 125 degrees into the head (the property `lids`). The lid faces
take the dark eye patch at UV (0.8772, 0.6533), sRGB (52, 37, 30), at 0.3 UV for each unit, and
the row `head` 1. In the 21 steps of the blink no open lid point, side edge, or back edge leaves the
head (ray casts), and the open lid lies at least 0.0096 units under it. At 110 degrees, 15 points
of each open lid stood out of the head.

**Eyes.** Each eyeball is 0.027 units wide, about 0.08 of the head width at the eye line (0.33
units), under the limit of about 0.14. The front view and the default hall camera show the iris in
the middle of the eye with no white above it, and the gaze looks at the viewer. So the eyes keep
the size, the place, and the paint of the source. The map paints a light on each eye, so the eyes
take the finish `varnish` and no eye light, which gives one light in each eye. The source paints a
slight smile, and the face reads happy in the app, so the mouth takes no edit.

**Arm twist.** The roll of each upper arm (from the clavicle) and the twist of each forearm (the
paw from the upper arm), in degrees, in the moments of `pnpm pose-preview trombonist` with the
hold `PANDA_TROMBONE` of `src/pose/winds.ts`:

| Moment | Left upper arm | Left forearm | Right upper arm | Right forearm |
|---|---|---|---|---|
| first | 35.7 | 6.2 | -30.3 | 23.3 |
| seventh | 35.7 | 6.2 | -34.4 | 19.2 |
| rest | 37.3 | 7.9 | -39.1 | 20.4 |
| lift50 | 37.6 | 4.4 | -36.1 | 22.7 |
| lower50 | 37.5 | 4.1 | -34.8 | 23.1 |
| stand | 35.6 | 5.8 | -30.1 | 23.7 |

With no paw turn, the forearms twisted -127 degrees on the left and 96 to 149 degrees on the right.

**Maps** (`tools/tripo-maps.py panda`). The color map is the source at 2048 pixels (Lanczos), WebP
quality 60, method 6: no texel changes its color. The normal map takes the red, green, and blue of
the PNG: each x, y tilt limited to 0.2 (1.15 % of the texels), a box scale to 1024 pixels, the tilts
times 4 in red and green, 255 in blue, and `cwebp -q 60 -sharp_yuv -m 6` (libwebp 1.5.0).

**Differences from the source.** The app light is warm and comes from above, so the cream fur reads
lighter and the dark parts read browner than in the even gray light of an FBX viewer. The upper
arms and the forearms are 1.2 times longer, and the front paws are smaller (0.8). The eyeballs blink with lids. In the bind, the thighs slope forward and the
arms bend at the elbows.

The export of the file and the maps. License of each file: CC BY-NC 4.0, as the FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/panda.rig.glb` | 1,152,972 bytes | `c65e8eef26c682c1459810df094b607bf87974ff094a67ffdc1de203e03c21ba` |
| `tripo-hand/panda.rig.json` | 16,255 bytes | `66b86315aae29b60f2ea44e9dec99524ee8011aaee8798aae7b4dba441f605bd` |
| `tripo-hand/panda-color.webp` | 259,152 bytes, 2048 × 2048 | `f630fa99d34ef0f4be8b5c8bafcdf90602ca1488d0f5946fc11420e66165909c` |
| `tripo-hand/panda-normal.webp` | 52,722 bytes, 1024 × 1024 | `aa537e7099c209fab0f402754cc48d6d45b930806cc567942ab1c56d31e551bb` |

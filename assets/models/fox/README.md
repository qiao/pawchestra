# Fox model

This folder holds the Tripo P2 source mesh of the fox (`tripo-p2/`) and its hand rig
(`tripo-hand/`). The red fox and the tan fox share the rig. The app does not serve these files. It
loads the module `src/models/studio/fox.ts`, which this chain writes:

```text
tripo-p2/fox-paws.fbx        source mesh with quad faces
   │  pnpm hand-chain fox    chain tools/blender/hand/fox/
   v
tripo-hand/fox.blend         hand rig (design 4.4, "Hand rig")
   │  pnpm rig-export fox    the same run
   v
tripo-hand/fox.rig.glb       rigged mesh, with its summary fox.rig.json
   │  pnpm studio-body fox   the same run
   v
src/models/studio/fox.ts     studio body of the app
```

`tools/blender/hand/README.md` gives the steps of the chain. The section "Candidate hand rig" below
gives the files, their sources, their licenses, and their checksums.

The files of the older body of the route of `pnpm rig-mesh` are removed. Commit `cbc8db5e4` has
these files and the sections of this file about them.

## Candidate hand rig

`tripo-hand/` holds the body of the red fox and the tan fox ("tripo-hand/fox.blend" below): a hand
rig of the Tripo P2 mesh `tripo-p2/fox.fbx` with four digits on each front paw
(`tripo-p2/fox-paws.fbx`), made in headless Blender by the route of the Tripo wolf: the form, the
colors, and the eye paint of the source, with no arm cut and no stretch. The `ANIMALS` entry of the
fox points to `tripo-hand/fox.rig.glb`. The red fox and the tan fox share it.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/fox.fbx`, `tripo-p2/fox.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-p2/fox-paws.fbx` | The source mesh with four-digit front paws ("Four-digit paws" below). License as the FBX file | `blender -b --factory-startup --python-exit-code 1 -P tools/blender/fox_paws.py -- assets/models/fox/tripo-p2/fox.fbx assets/models/fox/tripo-p2/fox-paws.fbx` |
| `tripo-hand/fox.blend` | Made in headless Blender 5.2 from `tripo-p2/fox-paws.fbx` (below). License as the FBX file | `pnpm hand-chain fox` |
| `tripo-hand/fox.rig.glb` | Export of `tripo-hand/fox.blend`. License as the FBX file | `pnpm rig-export fox --blend assets/models/fox/tripo-hand/fox.blend --out assets/models/fox/tripo-hand/fox.rig.glb` |
| `tripo-hand/fox.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/fox-color.webp` | Color map of the red fox, from the color map of the Tripo FBX ("Color map" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/fox-maps.py` |
| `tripo-hand/fox-tan-color.webp` | Color map of the tan fox ("Tan color map" below). License as the FBX file | The same run |
| `tripo-hand/fox-normal.webp` | Normal map of the fur of the red fox and the tan fox ("Normal map" below). License as the FBX file | The same run (cwebp 1.5.0) |

### tripo-p2/fox.fbx

A furry red fox in a T-pose with quad faces, made with Tripo P2 from the sheet `fox3.png` of the
project author: dark socks and paws, a cream chest and tail tip, a soft brow, and a smile. Its arm
tubes have 11 vertices around, and its leg tubes 10. It replaces the Tripo fox of 204632d8d
("History" below).

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan, and given on 2026-11-12. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary. The maps lie beside the FBX file in the zip file |
| Contents | One mesh object, with no armature and no animation. 3,239 vertices and 3,681 faces: 2,783 quads and 898 triangles, no n-gon. One UV layer |
| Parts | 3 parts: the body with the tail (3,115 vertices), and two eyeballs of 62 vertices each, which reach the middle plane. No vertices merge at 1e-5. 4 open edges (a slit of 2 edges on each foot), and 2 edges with more than two faces |
| Axes | The fox faces -y of Blender, so the import takes no turn. 1 unit from the soles to the ear tips, x ±0.3925 (the paw tips), and z ±0.237 (the snout and the tail) |

The folder `fox.fbm/` keeps two maps of the zip file under new names, as bytes. The roughness and
the metallic maps are not kept.

| File | Name in the zip file | Size | Pixels | SHA-256 |
|---|---|---|---|---|
| `fox.fbx` | `tripo_convert_f4a46474-daff-496e-b8bc-b2a3aee59b96.fbx` | 221,916 bytes | | `8a73a54ad78571d82e0e9dfe755d7eaa436f248b21c789bf1def8585cdffeda7` |
| `fox.fbm/fox_basecolor.jpg` | `tripo_rgb_7728173b-67c9-44a5-8321-bb37350c8f5d.jpg` | 2,218,034 bytes | 4096 × 4096 | `17078e2ad629fb31e8529b0ffde23921b431ca2224618b3d8f9a0e804a6a4bc4` |
| `fox.fbm/fox_normal.jpg` | `tripo_normal_42949653-dcf1-40c4-814b-42e7624127f2.jpg` | 863,434 bytes | 4096 × 4096 | `e2564cab8a122fb793e914eec3b73008b3a63d95d086c05fd1d03758b425b2ec` |

The color map paints on each eyeball an amber iris with a dark ring, a black pupil with a white
light, white, and a dark lash line. It also paints soft brows, a dark brown nose, a smile line,
dark socks up to the knees and over the forearms, dark ear tips, and a cream bib, cheeks, muzzle,
and tail tip.

### tripo-p2/fox-paws.fbx

**Four-digit paws.** Each front paw of the source has three long digits that spread 47° apart, as
a hand. `tools/blender/fox_paws.py` (headless Blender 5.2) removes each front paw past the closed
wrist ring of 11 vertices at x 0.2765 (275 vertices on each side) and builds a new paw of quad faces
on the ring. The rest of the mesh does not change. The right paw is the mirror of the left paw.

- **Frame.** The middle of the wrist ring, the paw axis a = (0.996, -0.009, -0.086) of Blender
  (out and a little down, as the source paw), the up axis u, and the width axis w (forward).
- **Wrist.** A band of 11 quads and 3 triangles joins the wrist ring to the first palm ring of 14
  vertices (an alignment of the two rings by angle). A closed quad surface on a ring of 11 edges
  must hold an odd face, so the paw has these 3 triangles and no other.
- **Palm.** Four rings of 14 vertices (4 edges on the top, 4 on the bottom, 3 on each side) on a
  super ellipse (exponent 2.4), at 0.008, 0.018, 0.029, and 0.040 units past the wrist ring, with
  the half widths 0.027, 0.030, 0.0312, and 0.031. The top gets lower to the front (half heights
  0.019 to 0.0085), and the bottom bulges into a palm pad (0.0195, then 0.018 and 0.014).
- **Digits.** The front palm ring and 6 inner vertices (0.004 units back, the web) are the bases of
  four tubes of 8 vertices: the 4 columns of the palm. Each digit has an ellipse section of 0.0154 ×
  0.0164 units, rings at 0.006 units and at 1, 0.55, and 0.2 tip radii before the tip, and a round
  tip of 4 quads about a tip vertex. Past the palm, the middle digits are 0.024 and 0.025 units
  long, the inner digit (to the front, the side of the thumb of a hand) 0.018, and the outer digit
  0.016, as on a real fore paw. They spread 1.2° and 4° from the paw axis, so they lie close
  together, and each digit curls down by 2 × 5.5 t (16° at the tip of a middle digit).
- **UVs.** Each new face takes the box projection of its main normal onto one of four squares of
  even dark paw fur in the color map (UV (0.6797, 0.8730) on the top, (0.5493, 0.8755) on the
  bottom, (0.9194, 0.3032) on the sides, and (0.5654, 0.1719) on the front), at 0.66 UV for each
  unit. The source paw has 0.86 UV for each unit and the same dark brown (sRGB about 70, 40, 24).

Each side has 200 new faces, and the mesh has 3,077 vertices and 3,505 faces (2,635 quads and 870
triangles). The open edges and the edges of more than two faces are those of the source, and each
edge of two faces has one winding. The FBX holds the mesh in the studio units with the UV map, smooth
faces, and no material. A run gives the same mesh. The bytes differ only by the time stamp of the
FBX header.

The left paw before and after, in the units of the source, from the wrist joint (x 0.281) to the
tip, with the shoulder joints at x ±0.085 (`paw_compare.py` and `paw_measure.py` of the session).
The other bodies are the values of their READMEs after their paw edits. The last row comes from
`paw_measure.py` on the rig file of each body:

| Measure | Source fox | Fox now | Tripo wolf | Tripo cat | Tripo beagle | Tripo rabbit |
|---|---|---|---|---|---|---|
| Digits | 3, 47° apart | 4, 2° to 6° apart | - | - | - | - |
| Length, wrist joint to tip | 0.1115 | 0.0603 | - | - | - | - |
| Width | 0.0992 | 0.0623 | - | - | - | - |
| Height | 0.048 | 0.0392 | - | - | - | - |
| Length / shoulder distance | 0.656 | 0.355 | 0.451 | 0.432 | 0.489 | 0.514 |
| Width / shoulder distance | 0.584 | 0.366 | 0.462 | 0.510 | 0.486 | 0.579 |
| Length / arm (shoulder to wrist joint) | 0.568 | 0.307 | 0.449 | 0.377 | 0.465 | 0.406 |
| Width / arm | 0.506 | 0.317 | 0.460 | 0.445 | 0.461 | 0.457 |
| Width / wrist diameter (girth / π) | - | 1.29 | 1.30 | 1.44 | - | 1.49 |

The palm is 0.035 units long from the wrist joint to the knuckle joint (0.071 in the source), and
0.062 wide at its front (0.083 at x 0.33 in the source). Each digit is 0.015 units wide (0.040 in
the source), and the gaps between the digits grow from 0 at the web to about 0.001 at the tips. In
the app the paw is 0.107 m long and 0.111 m wide (0.29 H). Reason: the source paw was 0.66 of the
shoulder distance long, and its three thick digits read as a hand. The first four-digit paw (0.132
m long and 0.134 m wide, 1.48 wrist diameters, four digits of 0.027 to 0.031 units) still read as a
large hand with digits of one length. A fox paw has a palm pad and four short digits close
together: the middle two are the longest, and the outer two are shorter.

### tripo-hand/fox.blend

The hand rig (design 4.4, "Hand rig"), made in headless Blender 5.2 (`blender -b --factory-startup`)
by one build script, as the Tripo wolf (`../wolf/README.md`) and the Tripo cat (`../cat/README.md`).
The chain of the body is in `tools/blender/hand/fox/` (`build.py`, `make_config.py`, `params.json`,
`base-config.json`, `redits.py`, `rimport.py`, `rings.py`, `tail.py`), and `pnpm hand-chain fox`
runs it (`tools/blender/hand/README.md`). `make_config.py` writes
`tools/mesh-rigs/simple/fox-tripo.json`: the joints of the source, mapped by the paw turns and the
eye edit.

| Item | Value |
|---|---|
| Size | 372,984 bytes. A new build gives the same export, but not the same `.blend` bytes |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the ear tips, the soles at z = 0, the fox faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `fox`: 3,591 vertices and 3,943 faces (3,087 quads and 856 triangles, 7,030 triangles). Flat faces and the surface of `sa.add_surface()`. No face is gloss: the 42 faces of the dark nose take the slot `fur` and the color map, with the smooth normals of the fur. The 112 faces of the two eyeballs have the face attribute `eye`, and the 312 faces of the two lids the face attribute `lid`. The UV map of the FBX, and the property `texture` (`assets/models/fox/tripo-hand/fox-color.webp`) |
| Armature | `fox_rig`: the 30 body bones, `tail_tip`, and the 20 arm segments and helpers, at the joints of the config. The Action `bind` holds the seated bind with no bind supination. The properties `palm`, `hinges`, `seat`, and `lids` come from the steps below |
| Facts | `height` 1.065552 (the shoulder joints at 1.77592 m for each unit, so that H is 0.380 m, the H of the fox before), `crease` 180 |
| Eyes | The eyeballs of the mesh at 0.93 of their size ("Eyes"), with the finish `varnish` and no eye light (`eyeFinish` of the entry), and a blink lid on each. No eye objects, so the app adds no bead eyes |

The edits, in the order of the build (`sa` is `tools/blender/studio_armature.py`, x is the x of the
left side, y the height, in the source). Each edit is a need of the rig, the seat, the eyes, or the
instruments:

- **Import.** `sa.import_source('assets/models/fox/tripo-p2/fox-paws.fbx', 1e-5)`. No vertex
  merges, and each face is flat.
- **Arm rings.** Edge ring Subdivide (`bmesh.ops.subdivide_edges(bm, edges=<ring>, cuts=<n>,
  use_grid_fill=True)`) of the clean quad bands of 11 edges between the closed arm loops at x 0.128,
  0.153, 0.173, 0.199, 0.229, and 0.255: 1 cut on each band, and 2 cuts on the two bands at the
  elbow (x 0.173 to 0.229). A ring then stands about each 0.3 to 0.4 arm radii.
- **Rings with no split.** The arm root to x 0.128 stops at poles, and the wrist ring at x 0.2765
  meets the 3 triangles of the new paw. The closed leg loops of 10 vertices on the left (y 0.061 to
  0.137) have no mirror on the right above y 0.081, so no leg band takes a split.
- **Paws turned.** Each vertex past the arm ring at x 0.242 turns rigidly about the rest forearm
  axis by whole ring steps of 360/11 degrees: -163.6 degrees on the left (5 steps) and 98.2 degrees
  on the right (3 steps), 220 vertices on each side. New quads join the two rings with the step
  offset, the far ring takes the form of the ring before the turn (a fade to 0 at 0.02 units), and
  the 22 new quads take the planar UVs of the dark patch at UV (0.6797, 0.8730) ("Arm twist").
- **Eye size.** The edit `eyes` scales each eyeball and its socket by 0.93 about the middle of the
  ball (±0.0369, 0.7878, 0.1024). Each ball scales as one piece. Each other point within 0.041 of
  the middle scales fully, the share falls by a smoothstep to 0 at 0.064, and also to 0 near the
  middle plane (|x| below 0.012). Points in front of z 0.20 stay, and points below y 0.75 fade out
  to y 0.72, so that the muzzle and the mouth stay. Each ball then moves 0.002 units back along its
  eye axis (0.38, 0, 0.925), x mirrored on the right. The largest skin move is 0.0029 units
  ("Eyes").
- **Other point edits.** None. The muzzle, the trunk, the legs, the feet, and the tail keep the form
  of the source. The paws are those of `fox-paws.fbx`.
- **Surface.** `sa.add_surface(fox, 'fox', <base color>, eye_fans=False, config=<fox-tripo.json>)`.
  The 42 gloss faces of the nose box go back to the slot `fur`, so the nose takes the color map
  with its painted nostrils.
- **Upper lids.** The skin of each upper lid turns down 4 degrees about the hinge through the middle
  of the ball: each head vertex with psi from 12 to 85 degrees above the eye axis, within 2.4 ball
  radii, and less than 65 degrees to the side (smoothstep ends 12, 28, 60, 85 degrees, 1.5 and 2.4
  radii, 35 and 65 degrees), about 50 vertices on each side, at most 0.0036 units ("Eyes").
- **Armature.** The joints of the config: the shoulder at x 0.085, the elbow at x 0.185, the wrist
  at x 0.281, the knuckles at x 0.316 (the base of the digits), the hip at (0.06, 0.29, 0.06), and
  the knee at (0.055, 0.165, 0.042). The palm is the true palm of the new paw, the down normal of its
  palm rings, (-0.086, -0.996, -0.001) in the studio axes with x mirrored on the right, turned by
  the paw turn. The property `hinges` holds the elbow axis of each side, turned about its bind upper
  arm by 15 degrees on the left and -40 degrees on the right ("Arm twist").

The weights, in the rest pose:

1. Automatic Weights, then Limit Total 4 and Normalize All, on a copy of the mesh with no loose
   part. The tail is a part of the body ("Tail" gives its rows).
2. Arm rows: each vertex of a side with |x| from 0.085, within 0.05 units of the line of the rest
   arm, takes one exact row (`sa.set_weight_row()`): a clavicle share of 0.55, 0.4, 0.27, 0.15, and
   0.06 at x 0.085, 0.095, 0.105, 0.115, and 0.125, linear between them and 0 from x 0.135
   (`rows.control` of `params.json`), an elbow helper share of 0.25, 0.75, 0.75, and 0.25 at x
   0.163, 0.178, 0.194, and 0.209, and the rest on the 4 roll segments ("Arm roots").
3. Wrist rows: the bend share of the paw grows in 12 equal steps of 0.003 from 0.03 units before
   the head of `hand_<side>`. Knuckle rows: the fingers share grows in 12 equal steps of 0.003 from
   0.017 units before the head of `fingers_<side>`, so the four digits and the front of the palm
   take `fingers_<side>`.
4. The eyeballs and the nose take {`head` 1}.
5. Ear rows: a plane across the base of each ear, through (0.035, 0.895, 0.05), (0.135, 0.85,
   0.05), (0.085, 0.875, 0), and (0.085, 0.875, 0.10) (x mirrored on the right). Each head vertex
   above the plane by 0.008 or more takes {`ear_<side>` 1}, one from 0 to 0.008 {`ear_<side>` 0.5,
   `head` 0.5}, and each other vertex gives its ear share to `head` (218 ear, 20 base, and 600 head
   rows).

With wrist steps of 0.004 from 0.04 units, the right wrist ring of the flutist flattened to 0.47 of
its width in the play (`flat p5` of `pnpm arm-check`, limit 0.55), and with 0.005 from 0.05 units
to 0.42. With 0.003 from 0.03 units it keeps 0.56.

**Smooth surface.** No relax and no region colors: the basis keeps the form of the source. The
crease angle 180 gives each corner the mean normal of the faces at its vertex, as the smooth shading
of an FBX viewer.

**Seat.** The thighs slope 15 degrees down and 8 degrees out in the bind, the shins lean 12 degrees
forward, and the feet stay flat on the floor (`legTurns` of the config). The front of the seat lies
0.06 units behind the knee joint of the bind, and 50 % of the thigh lies on the seat. The legs keep
the length of the source, so the seat height of the app is 0.249 m (0.258 m on the fox before).
A higher seat by a turn of the feet with the heels up changes the sight pass of the layout (design
4.5): against the layout of the flat feet, a heel turn of 4 degrees (seat 0.258 m) moves 318 of the
459 players of the 19 demos, and 12 degrees (seat 0.276 m) moves 421. Against the layout of the fox
before, each of the three seats moves most players by more than 0.1 m (395, 401, and 362 players),
because the new body changes the head heights and the chair depth. So the seat takes the flat feet.

**Tail.** The tail is a part of the body. Its tube is each vertex past the closed root loop of 12
vertices at (0, 0.358, -0.023) on the back, and the loop itself (110 vertices). Its middle line
goes from the middle of that loop to the tip (0, 0.121, -0.177), through the middles of the bands of
the edge distance from the tip. The tube vertices take {`hips` 1 - a, `tail` a (1 - b), `tail_tip`
a b}, with a = smoothstep(-0.01, 0.03) of the place along the line and b = smoothstep(-0.04, 0.04)
about the head of `tail_tip`. Each other vertex gives its tail weights to `hips`. The tail bones
point (0, -0.5, -1) and (0, -1, -0.1) in the bind (`studio.tailBind`): the tail goes back over the
back edge of the seat and hangs down behind the chair between the back posts. In the rest of the
violinist (`node tools/tail-gap.ts fox-violinist`), the tail keeps 1.5 cm from the seat, 3.5 cm
from each back post, 4.9 cm from the top rail, and 7.5 cm from the floor. With the tube from the
automatic weights, the root of the tail counted as the body: the chair was 0.42 m deep, and the
tail went 1.5 cm into the seat. With the bones of the fox before, (0, -1, -0.55) and (0, -1, 0.15),
it went 2.0 cm into the seat and touched the floor. The tail sways in the idle motion.

**Belly.** The seated belly shows no dent in the close views of the rest and the play, so the body
has no key `bind_belly`.

**Lids.** A lid on each eye: 14 × 13 points from psi -60 to 60 degrees and lam from -40 to 75
degrees on the left (the mirror on the right) at 1.17 ball radii, and a lower strip at 1.035
radii, 156 quads on each side, held turned up 126 degrees into the head. The 14 back ball faces of
each eye with each corner more than 135 degrees from the open eye go, a ball face over the middle
plane goes too, and the middle and the radius of each ball come again from the ball vertices that
stay. The open lid points within 0.002 units of the middle plane move onto it on their own side. In
the 21 steps of the blink no open lid point, side edge, or back edge leaves the head (ray casts),
and the lower strip of the closed lid lies under the head. With lam to 64 degrees, the outer side
edge left the head in the second half of the blink. The lid faces take the orange fur patch at UV
(0.4121, 0.4268) at 0.88 UV for each unit, and the row `head` 1.

**Eyes.** At the size of the source, each eye opening was 0.165 of the head width at the eye line
(front view of the bind, `eyemeasure.py` of the session). The edit `eyes` (0.93, 0.002 units
deeper) makes it 0.145, and the upper lids turn down 4 degrees. With 0.87, 0.004 units deeper, and
10 degrees, the opening was 0.118, and the eyes read sleepy. The eyes keep the iris place and the
iris paint of the source: the gaze reads at the viewer in the play view, the 3/4 view, and the
default hall camera, with no squint and no look down, so the map tool moves no iris. The map paints a
light in each pupil, so the eyes take the finish `varnish` and no eye light, which gives one light
in each eye. The face reads happy: the map paints a smile line, and the mouth needs no point edit.

**Arm twist.** The roll of each upper arm (from the clavicle) and the twist of each forearm (the
paw from the upper arm), in degrees, in each moment of `FOX_HOLD` of `src/pose/bowed-rig.ts` and
`FOX_FLUTE` of `src/pose/winds.ts` (`pnpm pose-preview fox-violinist`, `pnpm pose-preview
flutist`):

| Role | Moment | Left upper arm | Left forearm | Right upper arm | Right forearm |
|---|---|---|---|---|---|
| Violinist | frog | -37.4 | -36.5 | -20.0 | -32.2 |
| Violinist | tip | -37.5 | -36.5 | -34.2 | -30.4 |
| Violinist | crossing | -35.9 | -35.9 | -22.6 | -24.3 |
| Violinist | rest | 23.4 | 28.8 | -13.3 | -8.3 |
| Violinist | lift50 | 3.7 | -1.3 | -29.7 | -1.0 |
| Violinist | lower50 | -4.9 | -11.6 | -36.3 | -6.6 |
| Violinist | stand | -36.8 | -38.4 | -20.8 | -30.6 |
| Flutist | note | 15.6 | 16.9 | 25.8 | 30.0 |
| Flutist | rest | 11.3 | 20.4 | -34.2 | -36.5 |
| Flutist | lift50 | 14.7 | 33.4 | -16.0 | -28.9 |
| Flutist | lower50 | 16.7 | 35.5 | -5.1 | -7.6 |
| Flutist | stand | 15.8 | 15.0 | 25.5 | 32.5 |

A turn of an elbow axis moves twist from one part of an arm to the other, and the paw turns move the forearm twist
in steps of 32.7 degrees. With the holds of the fox before, the right forearm twisted from -69
degrees (violin tip) to 28 degrees (flute stand): a range of 97 degrees, more than two parts of 45
degrees can hold with any elbow axis. The violin hold now raises the bow elbow, (3, 0.8, -0.6) at
the frog and (1, 0.6, -1) at the tip, which takes the right forearm to -37 degrees at most, and the
left paw tilts 10 degrees over the neck (20 before), which takes the left arm in the play from 85 to
74 degrees on its two parts.

**Holds.** The violin lies near level (`violinTurn(-25, 5, 25)` of `FOX_HOLD`), the bow stays off
the face, and the four digits of each paw close over the neck, the stick, and the flute. The
measures of the hold tools on this body (in parentheses the fox before, at 204632d8d, where a tool
runs on it):

| Measure | Violinist | Flutist |
|---|---|---|
| Arm gate (`pnpm arm-check fox-violinist flutist --base HEAD`) | L PASS, R OPEN: folds p95 11 (10), limit 8 | L PASS, R FAIL: paw swing p95 103° (111°), limit 70°, and flat p5 0.56 (0.63), limit 0.55 |
| Twist p95, left and right | 15°, 15° (14°, 10°) | 15°, 14° (15°, 18°) |
| Forearm twist p95, left and right | 25°, 23° (31°, 37°) | 54°, 42° (60°, 48°) |
| Note targets (`pnpm hold-fit`) | 100 % within 5 mm | 100 % within 5 mm |
| Deepest part in the body in the play (`pnpm pose-depth`, 18 and 15 demos) | upper arms 7.6 cm (right upper arm into the right shoulder), forearms 3.5 cm, paws 2.9 cm | upper arms 2.0 cm |
| Paws in the instrument in the play | 1.7 cm in 3.1 % of the samples, claws 1.0 cm | claws 0.7 cm |
| Lift and rest, upper arms in the body | 3.3 cm | 2.0 cm |
| Violin carry (`pnpm carry-check fox-violinist --base HEAD`) | largest angle 19° (22°), 0 of 10,626 fast steps over 90°, detour 28° of 137° (26° of 137°) | - |
| Flute grip in the play (`pnpm wind-grip flutist`) | - | left paw 100 %, right paw 31 % (31 %), right finger tips 0.7 cm off the tube |

The sweep of the fox before stops on its open loops, so the depths have no base. With the bow
elbow of the fox before, the upper arms go as deep (one demo, `--set` of `pnpm pose-depth`).

**Arm roots.** With a clavicle share from 0.4 at the shoulder joint (x 0.085, the root loop of the
arm) to 0 at x 0.125, the front of the first root rings followed the upper arm by 0.63 to 0.87.
The bow arm of the red fox turns 68 degrees forward from the bind, and the flute arms turn forward
too. These rings then turned into the chest and the shoulder. The clavicle rows of step 2 now
reach to x 0.135, with more than half of the root loop on the clavicle. The two roles share the
body, so one change serves both. The sweep (`pnpm pose-depth violinist@fox-red --demo
mozart-k525`, `pnpm pose-depth flutist --demo beethoven-1`) and the arm gate (`pnpm arm-check
fox-violinist flutist`), before and after:

| Measure | Before | After |
|---|---|---|
| Violinist, upper arms in the body in the play | 2.2 cm, 97 % of the samples over 1.5 cm | 0.4 cm, 0 % |
| Flutist, upper arms in the body: play, lift, rest, lower | 2.0, 2.0, 1.2, 2.0 cm | 0.6, 1.1, 1.0, 1.2 cm |
| Folds p95, violinist L and R, flutist L and R (limit 8) | 4, 11, 6, 6 | 4, 7, 4, 2 |
| Twist p95, violinist L and R, flutist L and R (limit 55) | 15, 21, 28, 18 | 15, 21, 28, 18 |
| Flat p5, violinist L and R, flutist L and R (limit 0.55) | 0.87, 0.89, 0.88, 0.78 | 0.83, 0.80, 0.74, 0.78 |

The other pairs of the sweeps, the note targets, the flute grips (`pnpm wind-grip flutist`), the
head height, and the seat height do not change. A clavicle share of 0.45 at x 0.085 left 2.1 cm
at the front of the root loop in the violin (each 25th sample of the play). The rest, the lift,
and the lowering of the violinist keep the left upper arm 3.4 cm in the belly (upperArmL 0.50,
`TODO.md`).

**Color map.** `tools/fox-maps.py` writes `fox-color.webp`, `fox-tan-color.webp`, and
`fox-normal.webp` from the source maps and the rig file:

```text
uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/fox-maps.py
```

The red map is the source scaled to 2048 pixels (Lanczos) with fur strands ("Fur strands"),
WebP quality 60, method 6 (Pillow 13.0.0). The hue of each texel stays, and the eyeballs keep their
colors. The gaze shift of `tools/gaze_shift.py` is off (`GAZE_SHIFT`), because the irises of the source read
as a look at the viewer ("Eyes").

**Tan color map.** The tan map is the red map with one Oklab step of the orange fur only
(`TAN_STEP`), the step of the fox before: the lightness +0.06 and the hue +18 degrees, with no
chroma step. A texel that leaves the sRGB gamut takes the largest chroma in the gamut at its new
lightness and hue. The share of the step of a texel falls to 0 for a chroma below 0.09, a lightness
above 0.82, or a hue more than 25 degrees from 50 degrees, so the cream, the dark socks, the lines,
and the white keep the colors of the source. The eyeballs keep their colors. The texels of the fur
(53.9 % of the map) go from the median Oklab L 0.626, C 0.163, h 48.2 to L 0.686, C 0.150, h 66.2.
Each fur texel keeps its step from the other fur texels, so the strands stay.

**Normal map.** The same run writes `fox-normal.webp` from the normal map of the FBX: each x, y tilt
limited to 0.2 (1.25 % of the texels), a box scale to 1024 pixels, plus the tilts of the strands
("Fur strands"), each sum limited to 0.2, the tilts times 4 in red and green, 255 in blue, and
`cwebp -q 60 -sharp_yuv -m 6` (libwebp 1.5.0). The red fox and the tan fox share it.

**Fur strands.** The source maps paint the fur smooth, so the fox fur showed no strands in the app
beside the cat, the wolf, and the rabbit. The measures of the source maps (`nstats.py` and
`cstats.py` of the session, the strand contrast as the RMS of the linear luma in 16-texel blocks
over the block mean, in the blocks with no island edge):

| Map | Fox | Tripo cat | Tripo wolf | Tripo rabbit |
|---|---|---|---|---|
| Color: strand contrast, median | 0.017 | 0.170 | 0.089 | 0.087 |
| Color: fur luma (linear), median | 0.231 | 0.182 | 0.239 | 0.578 |
| Normal: tilt, median | 0.006 | 0.028 | 0.028 | 0.028 |
| Normal: tilt, mean | 0.019 | 0.047 | 0.054 | 0.063 |

The fur luma of the fox is near that of the wolf, and 97 % of its triangles have the finish
`matte` of the fur, so neither the tone curve nor the fur mask was the cause. `strands()` of
`tools/fox-maps.py` (`STRANDS`) makes a strand height at 2048 pixels: the direction of least change
of the structure tensor of the source maps (blur sigma 24 texels), seeded white noise (seed 7,
blur sigma 1.4 texels) summed along that direction over 22 texels on each side with a Hann weight,
a high pass (sigma 10 texels), and one standard deviation, clipped at 2.5. Each linear color of the
red map takes the factor 1 + 0.16 times the height. The normal map adds the slope of the height,
with an RMS tilt of 0.06. The web maps after the edit (8-texel blocks):

| Web map | Fox before | Fox now | Tripo cat | Tripo wolf | Tripo rabbit |
|---|---|---|---|---|---|
| Color: strand contrast, median | 0.011 | 0.088 | 0.140 | 0.075 | 0.072 |
| Normal: tilt, mean | 0.013 | 0.046 | 0.037 | 0.040 | 0.042 |
| Normal: tilt high pass, RMS | 0.017 | 0.052 | 0.046 | 0.052 | 0.060 |
| Normal: strand wavelength at 1024 pixels | 26 | 8.0 | 8.5 | 9.8 | 7.5 |

**Differences from the source.** The app light is warm and comes from above, so the orange fur
reads lighter and warmer than in the even gray light of an FBX viewer. The front paws have four
digits ("Four-digit paws"). The maps add fur strands ("Fur strands"). The eyes are 0.93 of their
size and a little deeper, and the upper lids a little lower ("Eyes"). Each eye has a blink lid.

The export of the file and the maps. License of each file: CC BY-NC 4.0, as the FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-p2/fox-paws.fbx` | 203,084 bytes (one run) | `c24479e9963f1edc635923db310229609828a66caf4f58208739f44773384d73` |
| `tripo-hand/fox.rig.glb` | 1,053,592 bytes | `ae28e65d513f9f3f924f752fb9359b402f10803de68fcd6f7ff2c3eb03dbea91` |
| `tripo-hand/fox.rig.json` | 16,978 bytes | `e6cde95987a3431e25397741997b68ed77c1e190f029cac1d5e2bddfb9821286` |
| `tripo-hand/fox-color.webp` | 241,484 bytes, 2048 × 2048 | `5f1242c5f0a1c17e5f3d62934a168a1efe7882b3066f3a45ca5c9c76043daedf` |
| `tripo-hand/fox-tan-color.webp` | 250,614 bytes, 2048 × 2048 | `cd53b99716829001f0f6dd9612700951d46ed57a64cb3a021b2da90be11f7e23` |
| `tripo-hand/fox-normal.webp` | 180,566 bytes, 1024 × 1024 | `bf1e788187919e2796a37d599c2c990e4ee29c2b2882c2fac1ea8095965a3797` |

### History

The first Tripo P2 fox (FBX SHA-256 `db116e3197e4f68838268a7a9c2def02427863545d6692c4435f5aaec4ed0845`)
took 12 rounds of edits in a live Blender. The second Tripo P2 fox (FBX SHA-256
`598c8e8d989d30c04548aa0b0da8967cd44311c3d69fe1b59fc3acf7265cd795`, Tripo files of `f033bd5d`) had a
hand rig in headless Blender with a head 1.17 times larger and legs 1.88 times longer. A Tripo CLI
fox with small dark bead eyes (task `10130f2a-0bd4-4acd-bd30-5d7d03c3a482`) was a trial, and it is
dropped. The third Tripo P2 fox (FBX SHA-256
`8b25bab74212f40292eaf9b3fbbb09519a961000f2ef73b1ba6c610b46e3f3c7`, task
`a4f84f84-0533-4be9-9ec7-c734527b7e66`) was the body of the foxes up to 204632d8d: three-digit
paws, a gaze shift of the irises in the map, the finish `eye` with the eye light, a key
`bind_belly`, and a loose tail part. The old files and the steps of each edit are in the
git history of this folder.

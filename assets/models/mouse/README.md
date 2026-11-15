# Mouse model

This folder holds the Tripo P2 source mesh of the mouse (`tripo-p2/`) and its hand rig
(`tripo-hand/`). The app does not serve these files. It loads the module
`src/models/bodies/mouse.ts`, which this chain writes:

```text
tripo-p2/mouse.fbx              source mesh with quad faces
   │  pnpm hand-chain mouse     chain tools/blender/hand/mouse/
   v
tripo-hand/mouse.blend          hand rig (design 4.4, "Hand rig")
   │  pnpm rig-export mouse     the same run
   v
tripo-hand/mouse.rig.glb        rigged mesh, with its summary mouse.rig.json
   │  pnpm body-module mouse    the same run
   v
src/models/bodies/mouse.ts      body of the app
```

`tools/blender/hand/README.md` gives the steps of the chain. The section "Tripo hand rig" below
gives the files, their sources, their licenses, and their checksums.

The files of the older body of the route of `pnpm rig-mesh` are removed. Commit `aa8af0dd8` has
these files and the sections of this file about them.

## Tripo hand rig

`tripo-hand/` holds the body of the app: a hand rig of the Tripo P2 mesh `tripo-p2/mouse.fbx`, made
by one build script in a headless Blender 5.2. The chain is a copy of the chain of the Tripo beaver
(`../beaver/README.md`), because the beaver also stands with no chair and has a tail on the floor.
The source FBX is the target of the look: the body keeps the form, the colors, the eye paint, and
the eyes of the source, with a crease angle of 180° and only a scale to H. The arms keep the length
of the source: no cut, no split from the trunk, and no stretch. The `ANIMALS` entry of the mouse in
`tools/body-module.ts` points to `tripo-hand/mouse.rig.glb`.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/mouse.fbx`, `tripo-p2/mouse.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/mouse.blend` | Made from `tripo-p2/mouse.fbx` by the scripted edits below. License as the FBX file | `pnpm hand-chain mouse` |
| `tripo-hand/mouse.rig.glb` | Export of `tripo-hand/mouse.blend`. License as the FBX file | `pnpm rig-export mouse --blend assets/models/mouse/tripo-hand/mouse.blend --out assets/models/mouse/tripo-hand/mouse.rig.glb` |
| `tripo-hand/mouse.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/mouse-color.webp`, `tripo-hand/mouse-normal.webp` | Web copies of the color map and the normal map of the FBX ("Maps" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/mouse-maps.py` |

### tripo-p2/mouse.fbx

A gray-taupe mouse in a T-pose with quad faces, made with Tripo P2 from the sheet of the mouse
(`assets/images2/mouse.png` of the main checkout). It stands upright on its legs. It has a cream
belly, large round ears with pink insides, pink paws and feet, whiskers, and a long thin pink tail,
which goes down behind the legs and lies on the floor behind the mouse.

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan, and given on 2026-11-13. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary. The maps lie beside the FBX file in the zip file |
| Contents | One mesh object, with no armature and no animation. 3,260 vertices and 3,411 faces: 2,938 quads and 473 triangles, no n-gon. One UV layer |
| Parts | 11 parts: the body with the tail (3,030 vertices), an eyeball of 66 vertices in an open socket on each side, and 8 whisker strips of 12 or 13 vertices. 162 open edges in 18 loops, and one edge with more than two faces |
| Box | In the body units (1 unit from the soles to the top of the ears): x ±0.418 (the paw tips), z -0.336 (the tail tip) to 0.336 (the nose). The mouse faces -y in Blender, with its left side at +x, so the import needs no turn |

The folder `mouse.fbm/` keeps two maps of the zip file under new names, as bytes. The roughness and
the metallic maps are not kept. The FBX file names the maps of the zip file, so an import of the
FBX file alone finds no map: the chain reads the color map by its path (`sourceTexture` of the
params).

| File | Name in the zip file | Size | Pixels | SHA-256 |
|---|---|---|---|---|
| `mouse.fbx` | `tripo_convert_5183bf44-37b8-458e-a30a-ee39d176d0dd.fbx` | 218,876 bytes | | `7e34e4f6dfc8d4216e3ea3cd9d1d7302663f98c0acf8545cf4150fd8f53df305` |
| `mouse.fbm/mouse_basecolor.jpg` | `tripo_rgb_7b29168e-f908-43da-8784-bd60248bcefc.jpg` | 3,494,703 bytes | 4096 × 4096 | `35db7b6283d560b2f62d4dbc1ea55ec863d46272173d5f662f32be730d932d38` |
| `mouse.fbm/mouse_normal.jpg` | `tripo_normal_56758350-3749-42c9-add5-cad644498c12.jpg` | 1,981,114 bytes | 4096 × 4096 | `11b815316b04f9c8a1e9655663fb20a198f6cc3ab235bd274a5d778254dd77b2` |

The color map paints gray-taupe fur with soft strokes, a cream belly and muzzle, pink skin on the
inner ears, the nose, the paws, the feet, and the tail, a smiling mouth, and on each eyeball a dark
brown iris and a black pupil with a light rim, and no light spot.

### tripo-hand/mouse.blend

The hand rig (design 4.4, "Hand rig"). The chain of the body is in `tools/blender/hand/mouse/`
(`build.py`, `make_config.py`, `params.json`, `base-config.json`, `redits.py`, `rimport.py`,
`rings.py`, `tail.py`), and `pnpm hand-chain mouse` runs it (`tools/blender/hand/README.md`).
`make_config.py` writes `tools/mesh-rigs/simple/mouse-tripo.json`: the joints of the source.

| Item | Value |
|---|---|
| Axes | The body units in the axes of Blender: 1 unit from the soles to the top of the ears, the soles at z = 0, the mouse faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `mouse`: 3,720 vertices and 3,819 faces (3,346 quads and 473 triangles, 7,165 triangles), flat faces, and the surface of `sa.add_surface()`. No face is gloss: the 45 faces of the nose take the slot `fur` and the color map. The 134 faces of the two eyeballs have the face attribute `eye`, the 312 faces of the two lids the face attribute `lid`, and the 50 faces of the whiskers the face attribute `plain`. The UV map of the FBX, and the property `texture` (`assets/models/mouse/tripo-hand/mouse-color.webp`) |
| Armature | `mouse_rig`: the 30 body bones, `tail_tip`, and the 20 arm segments and helpers, at the joints of the config. The Action `bind` holds the bind with no bind supination. The properties `palm`, `hinges`, `seat`, and `lids` come from the steps below |
| Facts | `height` 0.507275 (the shoulder joints at 0.841252 m for each unit, so that H is 0.221512 m and the lower eye of the standing mouse is 0.688 m high, as on the mouse of `7fa9d1e89`), `crease` 180 |
| Eyes | The eyeballs of the source in their sockets, with the finish `eye` and the eye light of the app, and a blink lid on each. No eye objects, so the app adds no bead eyes |

The edits, in the order of the build (`sa` is `tools/blender/body_armature.py`, x is the x of the
left side):

- **Import.** `sa.import_source('assets/models/mouse/tripo-p2/mouse.fbx', 1e-5)`. No vertex merges,
  and each face is flat.
- **Arm rings.** Edge ring Subdivide (`bmesh.ops.subdivide_edges(bm, edges=<ring>, cuts=1,
  use_grid_fill=True)`) of the clean quad bands of 12 edges between the closed arm loops at x
  0.1822 and 0.2031, 0.229 and 0.2495, 0.2495 and 0.2699, and 0.2699 and 0.2903.
- **Rings with no split.** The arm root from x 0.109 to 0.182 stops at poles, and the paw from x
  0.33 at triangles and poles. The legs keep the pose of the source in the bind, so they take no
  ring.
- **Paws turned.** Each vertex past the arm ring at x 0.3138 turns rigidly about the rest forearm
  axis by whole ring steps of 30 degrees: -120 degrees on the left (4 steps) and 90 degrees on the
  right (3 steps), 285 vertices on each side. New quads join the two rings with the step offset,
  and the far ring takes the form of the ring before the turn (a fade to 0 at 0.015 units). The new
  quads keep the UVs of the old band ("Arm twist").
- **Point edits.** None. The head, the eyes, the ears, the trunk, the arms, the paws, the legs, and
  the tail keep the form of the source. The mouth of the source paints a smile, so it takes no
  smile edit.
- **Surface.** `sa.add_surface(mouse, 'mouse', <base color>, eye_fans=False,
  config=<mouse-tripo.json>)`. At the end of the build, the 45 gloss faces of the nose go to the
  slot `fur`, so that the nose takes the color map and the smooth normals of the fur.
- **Eyes.** The two loose parts of 60 to 80 vertices in the eye box take the face attribute `eye`.
  Each ball is a sphere of radius 0.0229 units about (±0.062, 0.818, 0.212), and its socket opens
  about 54 degrees out from the forward axis.
- **Armature.** The joints of the config: the shoulder at x 0.115, the elbow at x 0.225, the wrist
  at x 0.33, where the paw starts, the knuckles at x 0.372, and the tip at x 0.418, on the arm axis
  at y 0.60. The hip at (0.075, 0.20, 0.05), the knee at (0.09, 0.115, 0.068), the ankle at (0.092,
  0.045, 0.055), and the toes from (0.11, 0.015, 0.14) to (0.12, 0.01, 0.205). The ear from (0.095,
  0.885, 0.02) to (0.19, 0.985, -0.06). The tail bone from (0, 0.15, -0.072), `tail_tip` from (0,
  0.025, -0.185) to (0, 0.008, -0.336). The palm is the true palm of the source, the mean normal of
  the paw faces that face down (x from 0.345), (0.035, -0.999, 0.041), turned by the paw turn.

The weights, in the rest pose:

1. Automatic Weights, then Limit Total 4 and Normalize All, on a copy of the mesh with no loose
   part.
2. Arm rows: each vertex of a side with |x| from 0.115, within 0.06 units of the line of the rest
   arm, takes one exact row (`sa.set_weight_row()`): a clavicle share from 0.4 at x 0.115 to 0 at
   x 0.155, an elbow helper share that grows from 0 at x 0.195 to 1 at the elbow joint (x 0.225) and
   falls to 0 at x 0.258, and the rest on the 4 roll segments.
3. Wrist rows: the bend share of the paw grows in 12 equal steps of 0.0035 from 0.025 units before
   the head of `hand_<side>`. Knuckle rows: the fingers share grows in 10 equal steps of 0.003 from
   0.015 units before the head of `fingers_<side>`.
4. Ear rows: a plane through the ear base splits the head and each ear (`earPlane` of the params),
   as on the Tripo cat: {`ear` 1} past the plane by 0.008 units, {`ear` 0.5, `head` 0.5} in that
   band. 323 ear vertices and 24 base vertices on the two sides.
5. The eyeballs, the whiskers, and the nose take {`head` 1}. The tail (each vertex within the edge
   distance 0.33 of the tail tip, 167 vertices) takes {`hips` 1 - a, `tail` a (1 - c), `tail_tip`
   a c}, with a = smoothstep(-0.01, 0.03) along `tail` and c = smoothstep(-0.03, 0.03) along
   `tail_tip`. Each other vertex gives its tail weights to the hips.

**Smooth surface.** No relax, no fold relax, and no region colors: the form stays the form of the
source. The crease angle 180 gives each corner the mean normal of the faces at its vertex, as the
smooth shading of an FBX viewer.

**Stance and seat.** The mouse has no chair (`noChair`, design 4.4). Its bind keeps the legs, the
trunk, and the tail of the source: the leg turns are none (`bind.legTurns`), the trunk takes no
recline (`bind.trunk.open` 0), and the tail bones keep the directions of the source
(`bind.tailBind`). Thus it stands on its legs as in the source, with the feet flat on the floor
and the tail on the floor behind it. The property `seat` is {`prop` `chair`, `front` 0.015, `back`
-0.1, `halfWidth` 0.045}: the seat lies between the legs, behind the shins and the feet, and its
top is the crotch, at 0.119 units. The seat height of the app is 0.100 m (0.076 m on the mouse of
`7fa9d1e89`, which stood on bent knees). Standing, the top of the skull is 0.771 m above the floor
and the ear tips 0.841 m, against 0.812 m and 0.856 m on the mouse of `7fa9d1e89`.

**Lids.** A lid on each eye: 13 × 13 points from psi -70 to 65 degrees and lam from -72 to 72
degrees (the mirror on the right), with the lower strip as the first row, at 1.15 ball radii (1.12
for the strip). 156 quads on each side, held turned up 140 degrees into the head. The socket opens
about 54 degrees around the ball, so the lid spans more than on the beaver, and it turns further
to hide. The property `lids` holds the angle 2.443461 and the hinge axes. The lid faces take the
fur patch at UV (0.2852, 0.6871) at 0.77 UV for each unit, and the row `head` 1. In the 21 steps of
the blink, 2 points of the open lid and at most 1 side point leave the head (ray casts), each at
the socket rim.

**Eyes and face.** The eyes keep the size, the paint, and the iris place of the source. The map
paints no light spot on the balls, so the eyes take the finish `eye` and the eye light of the app,
which gives each ball one soft highlight. The mouth of the source reads as a smile in the stage
light.

**Arm twist.** The p95 of the twist of each arm part in the play, the lift, and the rest of the
oboist (`pnpm arm-check oboist`), in degrees, with the paws of the source in parentheses:

| Arm | Upper arm | Forearm | Paw |
|---|---|---|---|
| Left | 26 (24) | 25 (56) | 37 (130) |
| Right | 36 (30) | 9 (45) | 22 (112) |

**Scale.** The scale of the chain (`metersPerUnit` 0.841252) puts the lower eye of the standing
mouse 0.688 m above the floor, as on the mouse of `7fa9d1e89`. The seat search of each demo reads
the eye height and the mesh of each body (design 4.2), so this scale gives the seats of that mouse
in 12 of 18 demos. At the H of the old mouse (0.271642 m), the eyes stood 0.844 m high and the ear
tips 1.032 m, and players of 14 of 18 demos moved by up to 1.5 m.

**Oboe hold.** The arms of the Tripo mouse reach 0.18 m from the shoulder joint to the wrist,
against 0.27 m on the rebuilt arms of the old mesh, so the hold of the old mouse did not reach:
the left paw missed its grip by 2.7 cm and the right paw by 5.2 cm in the play, and no note target
lay within 5 mm. `MOUSE_OBOE` of `src/pose/winds.ts` changes (design 5.3): the reed goes between
the lips at the front of the muzzle (`lipShift`), the oboe hangs 30 degrees from the vertical,
the shoulders turn forward 70 degrees (right) and 45 degrees (left), each grip moves 0.08 H up the
tube from the grip of the shared hold, onto the tone holes of its joint, and the digits curl 120
degrees (left) and 100 degrees (right). The oboe has the scale 0.5, a factor of the oboe of the
app, so it keeps its size in meters at each scale of the body. The measures:

| Measure | Left | Right |
|---|---|---|
| Spare reach to the grip, play / rest (`pnpm hold-fit oboist`) | 1.9 / 5.7 cm | 1.0 / 6.1 cm |
| Note targets within 5 mm (`pnpm hold-fit oboist`), worst error 0.0 mm | 100 % | 100 % |
| Grasps the oboe, play, lift, rest, lower (`pnpm wind-grip oboist`) | 100 % each | 100 % each |
| Middle of the paw from the reed tip, play (`pnpm wind-grip oboist`) | 6.5 cm | 15.6 cm |
| Folds p95 (`pnpm arm-check oboist`) | 18 | 15 |

The folds are the curled digits of the paws and a few thin faces at the arm root, which fold with
a turn of the shoulder (`pnpm fold-probe oboist --faces 20`). The paws and the claws stay within
0.4 cm of the oboe, the paws keep a gap of at least 1.0 cm in the play, and the reed goes 0.6 cm
into the head at the lips (limit 2 cm). The oboe has no closed part, so `pnpm body-clip oboist`
finds no row. The pink of the paws is the pink of the source: the mean color of the paw texels is
RGB (231, 155, 135) in the source map and (229, 156, 136) in `mouse-color.webp`.

**Maps** (`tools/mouse-maps.py`). The tool scales the color map of the source to 2048 pixels
(Lanczos), adds the soft fur strands of `tools/fox-maps.py` (`strands()` of `tools/fur_maps.py`,
tilt 0.03, luma 0.08, half length 11 texels) to the fur, and writes WebP quality 60, method 6
(Pillow 13.0.0). The pink skin (Oklab C from 0.06, h near 35 degrees: 24 % of the texels) and the
eyeballs take no strands. It writes `mouse-normal.webp` from the normal map of the FBX with the
slope of the same strands: each x, y tilt limited to 0.2 (4.27 % of the texels), a box scale to 1024
pixels, the tilts times 4 in red and green, 255 in blue, and `cwebp -q 60 -sharp_yuv -m 6` (libwebp
1.5.0). The eye mask comes from the rig file, so run the tool after the chain.

**Differences from the source.** The app light is warm and comes from above, so the fur reads
lighter and more beige than in the even gray light of an FBX viewer.

The export of the file and the maps. License of each file: CC BY-NC 4.0, as the FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/mouse.rig.glb` | 1,168,048 bytes | `97ac5589cc90eee884211052b41906154dc6ab4720884a5921e0cbf248573d2e` |
| `tripo-hand/mouse.rig.json` | 17,320 bytes | `190ce16dfa014b9f2c3a97b6fa8a5454a82cf0d2ab7a7461b3041caced196104` |
| `tripo-hand/mouse-color.webp` | 227,220 bytes, 2048 × 2048 | `91da719f0aa1a77655125e3034962a62b0708837d2b3fcef182a0aff337f2ab1` |
| `tripo-hand/mouse-normal.webp` | 174,666 bytes, 1024 × 1024 | `a39faab17e9846fb1fd278a74e36eca974bf4d863583340df897b58d0779b3f3` |

# Rabbit model

This folder holds the Tripo P2 source mesh of the rabbit (`tripo-p2/`) and its hand rig
(`tripo-hand/`). The app does not serve these files. It loads the module
`src/models/bodies/rabbit.ts`, which this chain writes:

```text
tripo-p2/rabbit.fbx             source mesh with quad faces
   │  pnpm hand-chain rabbit    chain tools/blender/hand/rabbit/
   v
tripo-hand/rabbit.blend         hand rig (design 4.4, "Hand rig")
   │  pnpm rig-export rabbit    the same run
   v
tripo-hand/rabbit.rig.glb       rigged mesh, with its summary rabbit.rig.json
   │  pnpm body-module rabbit   the same run
   v
src/models/bodies/rabbit.ts     body of the app
```

`tools/blender/hand/README.md` gives the steps of the chain. The section "Hand rig" below gives the
files, their sources, their licenses, and their checksums.

The files of the older bodies are removed: the route of `pnpm rig-mesh`, two older hand rigs, and
three older Tripo meshes. Commit `cbc8db5e4` has the files of the route of `pnpm rig-mesh`, and
commit `931b150dd` has the third Tripo rabbit and the sections of this file about it.

## Hand rig

`tripo-hand/` holds the hand rig of the rabbit ("tripo-hand/rabbit.blend" below), from the fourth
Tripo P2 mesh `tripo-p2/rabbit.fbx`, made in headless Blender by the route of the Tripo wolf: the
form, the eye paint, the whiskers, and the mouth of the source, with no arm cut, and with arms 1.25
times longer than the arms of the source (the point edit `armStretch`). The `ANIMALS` entry of the rabbit points to `tripo-hand/rabbit.rig.glb`.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/rabbit.fbx`, `tripo-p2/rabbit.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/rabbit.blend` | Made in headless Blender 5.2 from `tripo-p2/rabbit.fbx` (below). License as the FBX file | `pnpm hand-chain rabbit` |
| `tripo-hand/rabbit.rig.glb` | Export of `tripo-hand/rabbit.blend`. License as the FBX file | `pnpm rig-export rabbit --blend assets/models/rabbit/tripo-hand/rabbit.blend --out assets/models/rabbit/tripo-hand/rabbit.rig.glb` |
| `tripo-hand/rabbit.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/rabbit-color.webp`, `tripo-hand/rabbit-normal.webp` | Web copies of the color map and the normal map of the FBX ("Maps" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/rabbit-maps.py` |

### tripo-p2/rabbit.fbx

The fourth Tripo rabbit: a slim rabbit in a T-pose with quad faces, long ears with pink insides,
large dark eyes, whiskers, pink paw pads, and a round tail, made with Tripo P2 from the sheet
`assets/images2/rabbit3.png` of the main checkout, which git does not keep. The sheet shows white
fur, and the color map paints it cream. Its upper arm tubes have 13 vertices around, its forearm
tubes 11, its thigh tubes 15, and its shin tubes 14. It replaces the third Tripo P2 rabbit (FBX
SHA-256 `5eedb256218d3e71cc4fe7879b496f9a18c3483adc48badb4f1680cfdc04354c`).

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan, and given on 2026-11-13. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Task | The Tripo convert file `tripo_convert_2977f5f6-5c5d-4030-87c5-bce33881304e` (zip SHA-256 `63bda8d4246fa6f7cc8e8808983eb3cdbf506f4c6bd21315a4677884c1847fbd`) |
| Writer | Tripo, FBX 7.4 binary. The maps lie beside the FBX file in the zip file |
| Contents | One mesh object, with no armature and no animation. 3,328 vertices and 3,606 faces: 2,918 quads and 688 triangles, no n-gon. One UV layer |
| Parts | 11 parts: the body with the tail (3,162 vertices), two eyeballs (37 vertices each, open at the back, a sphere of radius 0.0224 units about (±0.0344, 0.7139, 0.0754)), and eight whisker strips of 11 or 13 vertices. No vertices merge at 1e-5. 140 open edges in 15 loops, and 22 edges with more than two faces |
| Axes | The rabbit faces -y of Blender, so the import needs no turn. Then 1 unit from the soles to the ear tips, x ±0.3217 (the paw tips), and z -0.1444 (the tail) to 0.1444 (the nose) in the body axes |

The folder `rabbit.fbm/` keeps two maps of the zip file under new names, as bytes: the base color
map (`tripo_rgb_*.jpg`) and the normal map (`tripo_normal_*.jpg`). The roughness and the metallic
maps are not kept.

| File | Size | Pixels | SHA-256 |
|---|---|---|---|
| `rabbit.fbx` | 220,860 bytes | | `467a5a800374a1df5a14e335c095dc1a3cefced4f90ca64f01f6f6f34fd0b716` |
| `rabbit.fbm/rabbit_basecolor.jpg` | 2,841,976 bytes | 4096 × 4096 | `945fb5613befef5169ad7ed74b6694f989cdd8059b0cb7a714e285919cc1c978` |
| `rabbit.fbm/rabbit_normal.jpg` | 1,145,078 bytes | 4096 × 4096 | `3dac5705c9f94f285af139525533be05b8ad3487a581825a52bc8f9dc162e4e7` |

The color map paints a full eye on each eyeball (a large black pupil, a thin brown ring, and a
white light), a pink nose, pink inner ears and paw pads, dark whiskers, and smooth cream fur
(Oklab L 0.856, C 0.055, h 69).

### tripo-hand/rabbit.blend

The hand rig of the fourth Tripo P2 rabbit (design 4.4, "Hand rig"), made in headless Blender 5.2
(`blender -b --factory-startup`) by one build script, by the route of the Tripo wolf
(`../wolf/README.md`). The source FBX is the target of the look: the body keeps the form, the eye
paint, the whiskers, and the mouth of the source, with a crease angle of 180 and one scale of the
whole body. Two form edits change the source: the girth of the arms ("Arm girth" below) and the
length of the arms ("Arm length" below). The arms have no cut and no split from the trunk. The legs
keep the length of the source.

| Item | Value |
|---|---|
| Size | 394,390 bytes |
| SHA-256 | `58e11a9f6e0ba9037ceaf7d73af0b0f3fe6ecf048c4d3cb8f8abc46c0280aee1` |
| Origin | Made in Blender 5.2 from `tripo-p2/rabbit.fbx` |
| License | CC BY-NC 4.0, as the FBX file |
| Axes | The body units in the axes of Blender: 1 unit from the soles to the ear tips, the soles at z = 0, the rabbit faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `rabbit`: 3,846 vertices and 4,072 faces (3,384 quads and 688 triangles, 7,456 triangles), flat faces, and the surface of `sa.add_surface()`. The 74 faces of the two eyeballs have the face attribute `eye`, and the 312 faces of the two lids the face attribute `lid`. The UV map of the FBX, and the property `texture` (`assets/models/rabbit/tripo-hand/rabbit-color.webp`) |
| Armature | `rabbit_rig`: the 30 body bones and the 20 arm segments and helpers of the simple route, at the joints of `tools/mesh-rigs/simple/rabbit-tripo.json` (the source joints, mapped by the paw turns and the point edits). The Action `bind` holds the seated bind of the bind rules of that config, with no bind supination. The properties `palm`, `hinges`, `seat`, and `lids` come from the steps below |
| Facts | `height` 0.834507 (the shoulder joints at 1.474394 m for each unit, so that H is 0.304675 m), `crease` 180, `backRoom` 0.01 |
| Eyes | The eyeballs of the mesh at the size of the source, with the finish `eye` and the eye light (no `eyeFinish` in the entry), and a blink lid on each. No eye objects, so the app adds no bead eyes |

The export of the file (`pnpm rig-export rabbit --blend assets/models/rabbit/tripo-hand/rabbit.blend
--out assets/models/rabbit/tripo-hand/rabbit.rig.glb`). License of both files: CC BY-NC 4.0, as the
FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/rabbit.rig.glb` | 1,131,576 bytes | `c7350a8e781535f32b4ff48ec0557ee3c46d01a50364bd026cbfe3c554bafc19` |
| `tripo-hand/rabbit.rig.json` | 16,015 bytes | `9447a49b195d6c6dd6cb259960fafd7fd375fc46946e8cf479bb30c63a0c1c71` |

The chain of the body is in `tools/blender/hand/rabbit/` (`build.py`, `make_config.py`,
`params.json`, `base-config.json`, `redits.py`, `rimport.py`, `rings.py`), and `pnpm hand-chain
rabbit` runs it (`tools/blender/hand/README.md`). Two runs give the same bytes of the rig file, its
summary, the rig config, and the module. Only the `.blend` differs. The edits, in the order of the
work (`sa` is `tools/blender/body_armature.py`, x is the x of the left arm). Each edit is a need
of the rig, the seat, or the look:

- **Import.** `sa.import_source('assets/models/rabbit/tripo-p2/rabbit.fbx', 1e-5)`. The FBX faces
  -y, so no turn follows. No vertex merges. Each face is flat.
- **Arm rings.** Edge ring Subdivide (`bmesh.ops.subdivide_edges(bm, edges=<ring>, cuts=1,
  use_grid_fill=True)`) of the closed strips of quads around each arm: 13 quads from x 0.0837 to
  0.1012 and from 0.1012 to 0.1202 on the upper arm, and 11 quads from x 0.1944 to 0.212 and from
  0.212 to 0.2294 on the forearm. The two arms have the same clean strips.
- **Knee rings.** The same call on the strips of 14 quads from y 0.1395 to 0.1511 and of 15 quads
  from y 0.1682 to 0.1865 of each leg.
- **Rings with no split.** The elbow from x 0.1202 to 0.1944 (a band of poles), the paw from x
  0.257, the hip, and the feet.
- **Paws turned.** Each vertex past the arm ring at x 0.2032 turns rigidly about the rest forearm
  axis by whole ring steps of 32.7 degrees (360 / 11): -196.4 degrees on the left (6 steps) and
  32.7 degrees on the right (1 step), 206 vertices on each side. New quads join the two rings of
  the strip x 0.2032 to 0.212 with the same step offset, and they take the planar UVs of the
  clean fur patch at UV (0.5707, 0.1512) ("Arm twist").
- **Arm girth.** The point edit `armGirth` of `redits.py` (`{"kind": "armGirth", "table": [[0.07,
  1.0], [0.09, 1.15], [0.158, 1.15], [0.2, 1.12], [0.245, 1.12], [0.26, 1.0]], "reach": [0.045,
  0.06], "y": [0.5, 0.62]}`): each arm point moves away from the line from the shoulder joint to
  the wrist joint by the factor of its x, with the share 1 up to 0.045 units from the line and 0 at
  0.06. The largest move is 0.0052 units ("Arm girth" below).
- **Arm stretch.** The point edit `armStretch` of `redits.py` (`{"kind": "armStretch", "k": 1.25,
  "ramp": 0.01, "reach": [0.05, 0.07]}`), after `armGirth`, because the x of the table of
  `armGirth` is the x of the source: each arm point moves along the line from the shoulder joint to
  the wrist joint, so that the upper arm and the forearm grow by 1.25. The paw past the wrist
  moves as one piece by 0.0465 units, with its turn. The share is 1 up to 0.05 units from the line
  and 0 at 0.07. The thick arm and the paw lie within 0.046 units of the line, and the nearest trunk
  point at 0.074 and head point at 0.077, so the trunk, the head, and the loose parts do not move
  ("Arm length" below).
- **Surface.** `sa.add_surface(rabbit, 'rabbit', 'assets/models/rabbit/tripo-p2/rabbit.fbm/rabbit_basecolor.jpg',
  eye_fans=False, config=<rabbit-tripo.json>)`. The faces of the two eyeballs get the face
  attribute `eye`. 55 light faces of the nose box leave the gloss nose, so that they show the
  color map.
- **Armature.** The armature of the config with a palm for each side: the true palm of the
  source, (0, -0.996, 0.087) in the body axes, from the mean normal of the pink paw pads, turned
  by the paw turn. The property `hinges` holds the elbow axis of the config of each side, turned
  about its bind upper arm by 6 degrees on the left and -37 degrees on the right. The hip joint
  lies at (0.06, 0.275, 0.01).

The weights, in the order of the work, in the rest pose:

1. Automatic Weights, then Limit Total 4 and Normalize All, on a copy of the mesh with no loose
   part and no face of the 22 edges of more than two faces. Each vertex takes the row of its copy.
2. Arm rows: each vertex of a side with |x| from 0.075, within 0.045 units of the line of the rest
   arm, takes one exact row with `sa.set_weight_row()`: a clavicle share and an elbow helper share,
   linear between the control rows below, and the rest on the 4 roll segments of the upper arm or
   the forearm. The elbow bend spreads over x 0.127 to 0.188. Each x of this step is the x of the
   source: the build maps the x of a vertex back through the edit `armStretch`
   (`redits.arm_source_x()`).

   | x | 0.0755 | 0.0866 | 0.0955 | 0.1043 | 0.1143 | 0.1274 | 0.158 | 0.1883 |
   |---|---|---|---|---|---|---|---|---|
   | Clavicle | 0.40 | 0.25 | 0.12 | 0.04 | 0 | 0 | 0 | 0 |
   | Elbow helper | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |

   The helper share reaches 1 at the elbow joint (x 0.158), so that the bend share grows
   linearly over the elbow.

3. Wrist rows and knuckle rows: the bend share of the paw grows in 12 equal steps of 0.0035 from
   0.035 before the wrist joint, and the fingers share in 12 equal steps of 0.003 from 0.02 before
   the knuckle joint.
4. The vertices of the loose parts (the eyeballs and the whisker strips) and of the gloss nose
   take {`head` 1}: 229 vertices.
5. Ear rows: a plane across the base of each ear, through (0.045, 0.81, 0), (0.045, 0.805, -0.06),
   (0.02, 0.815, -0.03), and (0.075, 0.795, -0.03) (body axes, x mirrored on the right). Each
   head vertex above the plane by 0.008 or more and with |x| above 0.002 takes {`ear_<side>` 1},
   the band of 0.008 takes {`ear_<side>` 0.5, `head` 0.5}, and each other vertex gives its ear
   share to `head` (475 ear, 6 base, and 308 head rows).

The trunk, the neck, the head, the hips, the legs, and the tail keep the automatic weights.

**Scale.** The scale of the whole body is 1.474394 m for each unit (`metersPerUnit` of
`params.json`): the eyes of the seated rabbit are then at the height of the eyes of the third
Tripo rabbit, 0.947 m, because the seat search of the layout reads the eye height (design 4.2).
The heights of the app, the third rabbit (`931b150dd`) against this body:

| Measure | Third rabbit | Fourth rabbit |
|---|---|---|
| H (head height) | 0.298502 m | 0.304675 m |
| Eyes, seated (the lower eye bone) | 0.947 m | 0.947 m |
| Eyes, standing as a soloist | 1.041 m | 1.053 m |
| Crown (the ear tips), seated | 1.393 m | 1.369 m |
| Seat | 0.196 m | 0.229 m |

**Arm girth.** The arms of the source are thinner than the arms of the third rabbit: in the rest of
the export, the girth of the upper arm at its middle is 0.266 m (0.873 H) against 0.312 m
(1.045 H), and of the forearm 0.231 m against 0.260 m. Thin arms read weak on the earlier Tripo
bodies, so the edit `armGirth` gives the arms the girth of the third rabbit: 0.306 m (1.003 H) and
0.258 m (0.848 H). The paws are smaller than the paws of the third rabbit: 0.100 m long and 0.099 m
wide (0.107 m and 0.121 m), 0.48 of the shoulder distance in width (0.58), so they take no edit.

**Arm length.** The arms of the source reach 0.299 m from the shoulder joint to the middle of the
palm. With this reach, the violin of 0.456 m put the left paw at the body end of the fingerboard,
next to the upper bout. The edit `armStretch` makes the upper arm and the forearm 1.25 times
longer, as on the red fox: the shoulder joint to the wrist joint is 0.343 m (0.274 m in the
source), and the arms reach 0.367 m to the middle of the palm. The paws keep their size.

**Arm twist.** The turns of the arms in the play of the hold `RABBIT_HOLD` of
`src/pose/bowed-rig.ts` (`pnpm hold-fit violinist`): the left upper arm 42 degrees, the left paw 25
degrees (a forearm twist of -10 and a swing of 23), the right upper arm 33 degrees, and the right
paw 26 degrees (a twist of 13 and a swing of 23). With the left paw turned 5 steps (-163.6
degrees), the left forearm twisted -46 degrees.

**Violin.** The arms reach 0.367 m from the shoulder joint to the middle of the palm. The violin is
0.75 of the violin of the app (0.380 m, `violinScale` of `src/models/species.ts`), near a 1/16
violin: the left paw reaches the fingerboard from the nut, and the bow paw 0.110 m to 0.320 m of
the hair (`pnpm hold-reach rabbit --instrument violin`). The rest grip holds the neck at 0.25 of
the fingerboard (`RABBIT_HOLD.restPlace`) with the left elbow bent 32.5 degrees, so that the lower
end of the violin stands 2.0 cm above the lap.

**Seat.** The thighs slope 15 degrees down and 8 degrees out in the bind, the shins lean 6
degrees forward, and each foot turns 15 degrees with the heel up, with the toes flat on the floor
(`legTurns` of the config). The front of the seat lies 0.05 units behind the knee joint of the
bind, and 56 % of the thigh lies on the seat. The legs keep the length of the source, so the seat
height of the app is 0.229 m (`seatHeight` of `src/models/bodies/rabbit.ts`).

**Lids.** A lid on each eye: 13 × 13 points from psi -48 to 50 degrees and lam -55 to 60 degrees
(the right lid mirrors the range) at 1.12 ball radii, and a lower strip at 1.07 radii, held turned
up 110 degrees into the head. The property `lids` holds the angle 1.919862 and the hinge axes, left
(0.677585, 0.735445, 0) and right (0.677735, -0.735306, 0). The lid faces take the UVs of the
clean fur patch at UV (0.715, 0.8195) at 0.93 UV for each unit, and the row `head` 1. In the 21
steps of the blink no open lid point, side edge, or back edge leaves the head (ray casts), and
each open lid point lies 0.016 units or more under the skin. With the ranges of the third rabbit
(psi ±40, lam -45 to 55), up to 10 points left the closed lid, because the eye of the source opens
less.

**Maps.** `tools/rabbit-maps.py` writes `rabbit-color.webp` and `rabbit-normal.webp` from the
source maps, as `tools/mouse-maps.py`:

- The color map is the source scaled to 2048 pixels (Lanczos). The fur takes 0.35 of its Oklab
  chroma (`FUR_CHROMA`): the source paints it cream (C 0.055), and the sheet shows it white (C 0.014
  to 0.021). Then the fur takes the strands of `tools/fox-maps.py` (`STRANDS`: the RMS tilt
  0.03, the luma factor 0.08, and the half length 11 texels). The strands of double strength and
  length read as carved grooves on the white fur. The pink skin (Oklab C 0.084 to 0.097, h 37 to
  48, `SKIN`) and the eyeballs keep their color and take no strands.
  WebP quality 60, method 6 (Pillow 13.0.0).
- The normal map: each x, y tilt of the normal map of the FBX limited to 0.2 (0.38 % of the
  texels), a box scale to 1024 pixels, the slopes of the strands added, the tilts times 4
  (`NORMAL_MAP_GAIN` of `src/scene/fur.ts`) in red and green, 255 in blue, and `cwebp -q 60
  -sharp_yuv -m 6` (libwebp 1.5.0). The mean normal of the source is (0.0, -0.002, 0.994).

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/rabbit-color.webp` | 193,496 bytes | `7ad607b6f3018b417b546cf5275b71e665631ded60efc545052aab04686ca9eb` |
| `tripo-hand/rabbit-normal.webp` | 109,604 bytes | `97681ba8f061e3491efc37ddbb5d6ba3c910eb4bd04b6b7663c1c9eac5a35d4d` |

**Fur color in the hall.** The lit fur of the seated rabbit in the hall view with no fill light
(`close-views play --demo mozart-k525 --at rabbit --azimuth 40 --zoom 1.6 --time 10`, the
brightest 10 % of a box on the chest, the thigh, and the head), in Oklab:

| Body | L | C | h |
|---|---|---|---|
| Third rabbit | 0.76 to 0.78 | 0.078 to 0.083 | 62 to 64 |
| Fourth rabbit, source chroma | 0.76 to 0.78 | 0.078 to 0.084 | 62 to 65 |
| Fourth rabbit, `FUR_CHROMA` 0.35 | 0.76 to 0.78 | 0.066 to 0.073 | 63 to 65 |
| Rabbits of `docs/reference/orchestra-latest.png` | 0.94 to 0.98 | 0.009 to 0.020 | 62 to 70 |

The warm hall light gives most of the chroma: a chroma factor of 0.2 takes C only to 0.063 to
0.070. In the back light, the lit back has L 0.754 and C 0.027 (0.731 and 0.047 on the third
rabbit).

**Differences from the source.** The app light is warm and comes from above, so the fur reads
warmer than in the even gray light of an FBX viewer. The fur has the chroma of the sheet and fur
strands. The arms are thicker, and the paw turns move the seam of each forearm band. Each eye has a
blink lid and takes the eye light.

### History

The first Tripo P2 rabbit (FBX SHA-256
`6ee4f87a767c16e80576e976244b013391857b53ef33e4a59996a6f120a85c44`) had a hand rig made in a live
Blender through the Blender MCP tools. Its files and the steps of each edit are in the git history
of this folder, at a385ad8ba^. The hand rig of the second mesh is at 12edbabec. The hand rig of the
third mesh (FBX SHA-256 `5eedb256218d3e71cc4fe7879b496f9a18c3483adc48badb4f1680cfdc04354c`) is at
931b150dd: smaller eyeballs and paws, a lifted smile, irises moved out, and lighter lash lines.
The fourth mesh replaces it.

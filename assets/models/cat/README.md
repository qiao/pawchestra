# Cat model

This folder holds the Tripo P2 source mesh of the cat (`tripo-p2/`) and its hand rig
(`tripo-hand/`). The app does not serve these files. It loads the module `src/models/studio/cat.ts`,
which this chain writes:

```text
tripo-p2/cat.fbx             source mesh with quad faces
   │  pnpm hand-chain cat    chain tools/blender/hand/cat/
   v
tripo-hand/cat.blend         hand rig (design 4.4, "Hand rig")
   │  pnpm rig-export cat    the same run
   v
tripo-hand/cat.rig.glb       rigged mesh, with its summary cat.rig.json
   │  pnpm studio-body cat   the same run
   v
src/models/studio/cat.ts     studio body of the app
```

`tools/blender/hand/README.md` gives the steps of the chain. The section "Tripo hand rig" below
gives the files, their sources, their licenses, and their checksums.

The files of the older bodies are removed: the route of `pnpm rig-mesh`, an older hand rig, and an
older Tripo mesh. Commit `cbc8db5e4` has these files and the sections of this file about them.

## Tripo hand rig

`tripo-hand/` holds the body of the app ("tripo-hand/cat.blend" below): a hand rig of the fourth
Tripo P2 mesh `tripo-p2/cat.fbx`, made by one build script in headless Blender 5.2, by the route of
the Tripo wolf (`../wolf/README.md`, "Tripo hand rig"). The body keeps the form and the colors of
the source: no point edit changes the trunk, the legs, or the tail, on the head only the eyes and
the mouth corners change, and the front paws are smaller ("Paw size"). The arms keep the length of
the source: no cut, no split from the trunk, and no stretch. The edits are only those that the rig,
the seat, the viola, the eyes, a slight smile, and smaller front paws need.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/cat.fbx`, `tripo-p2/cat.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/cat.blend` | Made from `tripo-p2/cat.fbx` by the scripted edits below. License as the FBX file | `pnpm hand-chain cat` |
| `tripo-hand/cat.rig.glb` | Export of `tripo-hand/cat.blend`. License as the FBX file | `pnpm rig-export cat --blend assets/models/cat/tripo-hand/cat.blend --out assets/models/cat/tripo-hand/cat.rig.glb` |
| `tripo-hand/cat.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/cat-color.webp`, `tripo-hand/cat-normal.webp` | Web copies of the color map and the normal map of the FBX ("Color map" and "Normal map" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/cat-maps.py` |

### tripo-p2/cat.fbx

The fourth Tripo cat: a gray tabby with a white chest and muzzle, white paws, brown eyes, and a
round head, in a T-pose with quad faces, made with Tripo P2 from the sheet `cat-tabby4.png` of the
project author. Its arm tubes and its leg tubes have 12 vertices around. It replaces the third
Tripo cat (FBX SHA-256 `f6225744655b117ad547b426e0237ace0a86218817e12a3f8bba7c7a430fa980`).

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan, and given on 2026-11-11. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary. The maps lie beside the FBX file in the zip file |
| Contents | One mesh object, with no armature and no animation. 3,237 vertices and 3,435 faces: 2,878 quads and 557 triangles, no n-gon. One UV layer |
| Parts | 13 parts: the body with the tail (2,975 vertices), two eyeballs (90 vertices each, closed spheres of radius 0.0335 at (±0.0461, 0.828, 0.143)), and 10 whisker strips of 7 or 9 vertices. 135 open edges, and no edge with more than two faces |
| Axes | The cat faces -y of Blender, so the import takes no turn. 1 unit from the soles to the ear tips, x ±0.4096 (the paw tips), and z ±0.228 (the whisker tips and the tail) |

The folder `cat.fbm/` keeps two maps of the zip file under new names, as bytes. The roughness and
the metallic maps are not kept.

| File | Name in the zip file | Size | Pixels | SHA-256 |
|---|---|---|---|---|
| `cat.fbx` | `tripo_convert_4075efce-789c-4617-bc4a-71e318a5dc61.fbx` | 215,068 bytes | | `4f2b51f5ba00a91598ac87d054ded6cbea2a219ef919d59b4d6864c01a51353b` |
| `cat.fbm/cat_basecolor.jpg` | `tripo_rgb_1bfadb32-b887-4794-884d-d695d3ee99d3.jpg` | 4,554,310 bytes | 4096 × 4096 | `e0659294bb5a33d17cc79d412043a32ed425f87edb8c081d1594a5cda0eb71bc` |
| `cat.fbm/cat_normal.jpg` | `tripo_normal_37966b9b-e6d8-48b5-8177-a94cd66425b6.jpg` | 1,906,505 bytes | 4096 × 4096 | `34f4509cf4ca9cb50401284719966472df586c54083a4ce2fbb5bcc1f06c87c3` |

The color map paints a full eye on each eyeball: an orange brown iris, a black pupil with a soft
gray light, white, and a dark lash line. It also paints the gray tabby stripes, a cream chest and
muzzle, white paws, a pink nose, pink inner ears, and a thin mouth line.

### tripo-hand/cat.blend

The hand rig (design 4.4, "Hand rig"). The chain of the body is in `tools/blender/hand/cat/`
(`build.py`, `make_config.py`, `params.json`, `base-config.json`, `redits.py`, `rimport.py`,
`rings.py`, `tail.py`), and `pnpm hand-chain cat` runs it (`tools/blender/hand/README.md`). Its
scripts follow the scripts of the third Tripo cat and of the Tripo wolf. `make_config.py` writes
`tools/mesh-rigs/simple/cat-tripo.json`: the joints of the source, mapped by the paw turns and the
eye edit.

| Item | Value |
|---|---|
| Size | 382,564 bytes |
| SHA-256 | `e6f7978c6f733b872a60134db5ac932412b40384ec7ebf0ff69b0b30def8d0ea` |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the ear tips, the soles at z = 0, the cat faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `cat`: 3,693 vertices and 3,829 faces (3,274 quads and 555 triangles, 7,103 triangles), flat faces, and the surface of `sa.add_surface()`, with the shape keys `bind_belly` ("Belly"), `bind_tail` ("Tail behind the chair"), and `bind_sit` ("Sit"). No face is gloss: the 45 faces of the nose take the slot `fur` and the color map, with the smooth normals of the fur ("Nose"). The 187 faces of the two eyeballs have the face attribute `eye`, the 312 faces of the two lids `lid`, and the 36 faces of the whisker strips `plain`. The UV map of the FBX, and the property `texture` (`assets/models/cat/tripo-hand/cat-color.webp`) |
| Armature | `cat_rig`: the 30 body bones, `tail_tip`, and the 20 arm segments and helpers, at the joints of the config. The Action `bind` holds the seated bind with no bind supination. The properties `palm`, `hinges`, `seat`, and `lids` come from the steps below |
| Facts | `height` 0.942613 (the shoulder joints at 1.48443 m for each unit, so that H is 0.339381 m, the H of the cat of `cat.rig.glb` at cbc8db5e4), `crease` 180, `seatWidth` 0.46 |
| Eyes | The eyeballs of the mesh at 0.90 of their size ("Eye size"), with the finish `varnish` and no eye light (`eyeFinish` of the entry), and a blink lid on each. No eye objects, so the app adds no bead eyes |

The edits, in the order of the build (`sa` is `tools/blender/studio_armature.py`, x is the x of the
left side, y the height, in the source):

- **Import.** `sa.import_source('assets/models/cat/tripo-p2/cat.fbx', 1e-5)`. No vertex merges,
  and each face is flat.
- **Arm rings.** Edge ring Subdivide (`bmesh.ops.subdivide_edges(bm, edges=<ring>, cuts=1,
  use_grid_fill=True)`) of the clean quad bands of 12 edges between the closed arm loops at x
  0.111, 0.131, and 0.157, and from 0.258 to 0.284. Partial loops at x 0.187, 0.208, and 0.228
  carry the bend of the elbow.
- **Knee rings.** The same call with 1 cut on the leg band of 12 edges from y 0.157 to 0.189. The
  knee joint is at y 0.165.
- **Paws turned.** Each vertex past the arm loop at x 0.284 turns rigidly about the rest forearm
  axis by whole ring steps of 30 degrees: 30 degrees on the left (1 step) and 90 degrees on the
  right (3 steps), 398 and 399 vertices. New quads join the two loops with the step offset, and
  the far loop takes the form of the loop before the turn (a fade to 0 at 0.02 units). The new
  quads keep the UVs of the old band. The paws keep their form ("Arm twist"). The loop at x 0.284
  does not turn. It is slanted (0.080 to 0.094 units along the forearm axis), so 5 of its 12
  vertices lie past its mean. When they turned with the paw, the quads before the loop sheared by
  up to 3 ring steps. The right wrist then showed a stretched texture and a light shard at rest:
  11 faces had UV scale ratios of 4.4 to 10.3, against about 1.1 on the faces around them.
- **Eye size.** The edit `eyes` scales each eyeball and its socket by 0.90 about the middle of
  the ball, (±0.04606, 0.82771, 0.14292). Each ball scales as one piece. Each other point within
  0.037 of the middle scales fully, the share falls by a smoothstep to 0 at 0.059, and also to 0
  near the middle plane (|x| below 0.015) past 0.032. Points in front of z 0.20 stay, and points
  below y 0.79 fade out to y 0.75, so that the nose and the muzzle stay. Each ball then moves
  0.004 units back along its eye axis (0.30, 0, 0.954), x mirrored on the right. The largest skin
  move is 0.0038 units ("Eyes").
- **Smile.** The map `smile` of `tools/blender/hand/cat/redits.py` (the values in `smile` of
  `params.json`) lifts the corners of the mouth into a slight smile ("Smile"). The step runs after
  the weights (after the ear rows, step 5 below), so the automatic weights stay those of the mesh
  with no smile, and no arm skin changes. As a point edit before the weights, it changed the
  automatic weights of each arm bone a little. Each point moves by lift × a(|x|) × b(y − m(|x|)) × f(z) × c along
  (0, 1, −0.4): up, and a little back. The lift is 0.007 units (10 mm in the app). m is the mouth
  line of the source, the slit under the muzzle pads, linear between the [|x|, y] rows [0,
  0.7587], [0.0164, 0.7538], [0.0276, 0.7518], [0.0374, 0.7518], [0.0447, 0.7543], and [0.051,
  0.7587]. a is a smoothstep from 0 at |x| 0.006 to 1 at 0.036, 1 to 0.05, and a smoothstep to 0
  at 0.085. b is 1 from 0.004 below the line to 0.005 above it, and a smoothstep to 0 at 0.02
  below (the chin) and 0.022 above (the pads). f is a smoothstep from 0 at z 0.13 to 1 at 0.16. c
  is a smoothstep from 0 at 0.003 to 1 at 0.012 of the distance from the nose box of the config.
  Each whisker strip moves as one piece with the move of its root, its point nearest the middle
  plane. 90 skin vertices and the 64 points of 8 whisker strips move. The corners (for example
  2333, 2334, 2142, and 2364 on the left, at |x| 0.037 to 0.045) move 0.007 up and 0.0028 back,
  the lower curve of each side of the W (2302, 2309, and 2311, at |x| 0.028 to 0.030) 0.0057 to
  0.0063 up, and the cheek and pad points over the corners (2337, 2339, and 2369) 0.0035 to
  0.0048 up. The middle of the W, the nose, the eyes, and the underside of the jaw stay, so the
  viola place under the jaw (`fitViolinPlace()` of `src/pose/violin-place.ts`) does not move.
- **Paw size.** The edit `paw` of `redits.py` (in `params.json`: `{"kind": "paw", "length": 0.84,
  "fingers": 0.9, "fingerRamp": 0.01, "wide": 0.87, "thick": 1.0, "ramp": 0.02, "width": [0, 0,
  1]}`) makes each front paw smaller past the wrist joint ("Paw size" below). The step runs after
  the automatic weights (step 1 below) and before the exact rows (steps 2 and 3).
- **Other point edits.** None. The muzzle (except the mouth corners), the trunk, the legs, the
  feet, and the tail keep the form of the source.
- **Surface.** `sa.add_surface(cat, 'cat', <base color>, eye_fans=False, config=<cat-tripo.json>)`.
  The gloss nose is the pink nose in the nose box of the config. 31 light gloss faces over the
  nose go back to the fur. The faces of the two eyeballs get the face attribute `eye`, and the
  export then gives `ownEyes`.
- **Upper lids.** The skin of each upper lid turns down 10 degrees about the hinge through the
  middle of the ball: each head vertex with psi from 12 to 85 degrees above the eye axis, within
  2.4 ball radii, and less than 65 degrees to the side (smoothstep ends 12, 28, 60, 85 degrees,
  1.5 and 2.4 radii, 35 and 65 degrees), 37 vertices on each side, at most 0.0081 units ("Eyes").
- **Armature.** The joints of the config: the shoulder at x 0.095, the elbow at x 0.20, the wrist
  at x 0.31, the knuckles at x 0.353 (x 0.36 in the source, moved by the paw edit), the hip at (0.075, 0.29, 0.045), and the knee at (0.0715,
  0.165, 0.045). The palm is the true palm of the source, the mean normal of the paw faces that
  face down, (0.047, -0.998, -0.039), turned by the paw turn. The bind upper arm points down and
  forward, (0.5014, -0.6017, 0.6217) in the studio axes (`studio.bindArms.upper_arm`), and the
  property `hinges` holds the elbow axis of each side, turned about its bind upper arm by 11
  degrees on the left and -48 degrees on the right ("Arm twist").

The weights, in the rest pose:

1. Automatic Weights, then Limit Total 4 and Normalize All, on a copy of the mesh with no loose
   part. The tail is a part of the body ("Tail behind the chair" gives its rows).
2. Arm rows: each vertex of a side with |x| from 0.095, within 0.06 units of the line of the rest
   arm, takes one exact row with `sa.set_weight_row()`: a clavicle share from 0.4 at x 0.095 to 0
   at x 0.135, an elbow helper share that grows from 0 at x 0.145 to 1 at the elbow joint (x 0.2) and
   falls to 0 at x 0.26, and the rest on the 4 roll segments. A fall that ended at x 0.236 (0.036
   units) folded the inner right elbow edge 909-912 to 160° in the lowering: the fall now takes
   0.06 units, near the 0.055 units of the rise.
3. Wrist rows: the bend share of the paw grows in 12 equal steps of 0.004 from 0.03 units before
   the head of `hand_<side>`. Knuckle rows: the fingers share grows in 12 equal steps of 0.0035 from
   0.024 units before the head of `fingers_<side>`.
4. The eyeballs, the whisker strips, and the gloss nose take {`head` 1}.
5. Ear rows: a plane across the base of each ear, through (0.045, 0.925, 0.06), (0.135, 0.86,
   0.06), (0.09, 0.893, 0), and (0.09, 0.893, 0.12) (x mirrored on the right). Each head vertex
   above the plane by 0.008 or more takes {`ear_<side>` 1}, one from 0 to 0.008 {`ear_<side>` 0.5,
   `head` 0.5}, and each other vertex gives its ear share to `head` (194 ear, 16 base, and 487
   head rows).

**Smooth surface.** No relax and no region colors: the form stays the form of the source. The
crease angle 180 gives each corner the mean normal of the faces at its vertex, as the smooth
shading of an FBX viewer.

**Nose.** At the end of the build, the 45 gloss faces of the pink nose go to the slot `fur`
(`noseFur` of the params). Thus the nose takes the color map, with its painted nostrils, and the
smooth normals of the fur. As flat gloss faces in one color, the nose showed facets and no nostrils.
The weights do not change: the nose vertices keep the row {`head` 1}. The armature property
`headShift` (0, 0, -0.000732941) moves the head center of the holds back to the head center of the
gloss nose, because the head box of `pnpm studio-body` now holds the nose. Thus no hold moves. The
nose keeps the colors of the source map. In the hall light it reads as the nose of the FBX file, so
the map tool does not change it.

**Seat.** The thighs slope 20 degrees down and 20 degrees out in the bind, the shins lean 8
degrees forward, and each foot turns 12 degrees with the heel up, the toes flat on the floor
(`legTurns` of the config, `tools/rig/leg_turns.py <config> 20 20 8 12`). The front of the seat
lies 0.06 units behind the knee joint of the bind, and 46 % of the thigh lies on the seat. The
seat height of the app is 0.222 m, with the legs of the source (`StudioBody.seatHeight`). The
lowest point of each foot is on the floor, and the toe pads touch it over 7.7 cm.

With the shins 12 degrees forward and flat feet, the seat was 0.201 m, and the chair read low. The
higher eyes change the sight pass of the layout (design 4.5). Each seat from 0.214 m to 0.222 m
moves the same 22 players in 5 demos, by 0.10 to 0.52 m. A seat of 0.211 m moves 12 players, and
a seat of 0.204 m moves 2. Thus the seat takes the top of that range.

**Rest.** At rest the viola stands on the left thigh and the bow hangs from the right paw, as on
the third cat. `lapPoint()` of `src/pose/lap.ts` takes the top of the highest triangle of the hips,
the spine, and the legs over a point of the thigh. The source belly is round and reaches z 0.199.
With the thighs 8 degrees out, a belly triangle covered that point 0.06 units over the thigh,
and the rest lifted the viola and the bow to the chest. With the thighs 20 degrees out, the top
of the lap is the thigh.

**Belly.** The key `bind_belly` relaxes the posed bind of the 24 vertices with a rest height
(Blender z) from 0.33 to 0.42, rest y below 0, and atan2(|x|, -y) at most 60 degrees, in 3 rounds
of P += 0.5 ((mid - P) . n) n (the rule of the rabbit).

**Sit.** The key `bind_sit` (`sit_key()` of the build, the last bind key, after `bind_tail`) puts
the underside of the haunch onto the seat: `be.sit_move(cat, cat_rig, {band 0.05, most 0.07, ramp
0.03, end 0.01, radius 0.012, across true})` of `tools/blender/bind_edit.py`, then
`be.add_bind_move(cat, cat_rig, <move>, 'bind_sit')`. The plane is the thigh underside over the
seat (Blender z 0.2229, the seat top of the app). Each body point behind 0.03 units in front of
the hip joints moves down by the gap of the lowest point of its slice across the seat (0.012 units
deep), less over 0.05 units of height and at the back of the haunch. The 17 points and their moves
on z, in units: 407 -0.0279, 414 -0.0058, 447 -0.0273, 1541 -0.0195, 1594 -0.0063, 1595 -0.0099,
1597 -0.0476, 1600 -0.0497, 1601 -0.0497, 1602 -0.0046, 1957 -0.0279, 2112 -0.0056, 3148 -0.0195,
3189 -0.0497, 3204 -0.0099, 3206 -0.0063, 3208 -0.0474. The seat height does not change. In the
seat probe (rows of 1 cm over the seat, a row touches within 1 cm), the rows behind the hip joints
that touch the seat go from 0 % to 69 %, and their mean gap from 4.8 cm to 1.9 cm. Thus the
haunch rests on the seat in the views from the side and from behind. A drop of each point to the
lowest point within 0.012 units around it (no `across`) gave 77 %, but it made the haunch a box
with steep sides, and its edge showed as teeth from behind. Thighs 15 degrees down gave 77 % with
`across`, and they lowered the seat to 0.213 m, which moves players in the sight pass of the
layout (design 4.5).

**Tail behind the chair.** The tail has two bones, `tail` from the root at (0, 0.36, -0.065) and
`tail_tip` from (0, 0.22, -0.12) to (0, 0.10, -0.20), with the `studio.tailBind` of the third cat.
The tube vertices take exact rows along a middle line from (0, 0.335, -0.029) to (0, 0.119,
-0.225), and the key `bind_tail` lays the tube along the path `tailLay.path` of `params.json`:
back from the root (0, 0.333, -0.031) of the bind, over the back edge of the seat, and down behind
the chair between the back posts, with the tip a little to the left. 140 tube vertices take tail
rows, and 126 move in the key. The tube of the bind lies from y 0.095 to 0.384 and back to z
-0.228. In the axes of the bind the soles are 0.073 units up and the seat top (the lowest point
of the body over the seat) is at y 0.223, so the tube keeps 8.6 cm from
each back post, 6.7 cm from the top rail, and 3.3 cm from the floor in the app, in the rest and
the play of the violist (`tools/tail-gap.ts` with samples of the play). The key `bind_sit`
("Sit") puts the root of the tail on the seat (0.1 cm, 5.4 cm before), with no point in it. The tail does not sway
(`seatedTail` of the species).

The key of the first build laid the tube along the path of the third cat (the git history of this
README at c6f979952): down the back, onto the seat, and to the left back corner of the seat. Its
seat top of 0.135 was in the axes with the soles on the floor, and the bind has the soles 0.087
units up. Thus the tube lay 13 cm too low in the app: it went 1.8 cm into the seat, and hung
under the seat to 7.4 cm over the floor at the left back post.

**Lids.** A lid on each eye: 14 × 13 points from psi -60 to 60 degrees and lam -60 to 65 degrees
(the right lid mirrors the range) at 1.15 ball radii, and a lower strip at 1.12 radii, 156 quads
on each side, held turned up 110 degrees into the head. The back ball faces with each corner more
than 135 degrees from the open eye go, and the middle and the radius of each ball come again from
the ball vertices that stay. In the 21 steps of the blink no open lid point, side edge, or back
edge leaves the head (ray casts), and the lower strip of the closed lid lies under the head. The
lid faces take the gray fur patch at UV (0.8474, 0.9198) at 0.3 UV for each unit, and the row
`head` 1.

**Eyes.** At the size of the source, each eye opening was 0.153 of the head width at the eye line
(front view of the bind), the ball stood 0.20 ball radii over the skin edge, and in the play view
of a phone white showed above each iris. These are the faults of the eyes of the third cat, so
the build repeats its fix, in smaller steps: the ball and its socket at 0.90, the ball 0.004
units deeper, and the upper lids 10 degrees lower. Now the opening is 0.132 of the head width (at
0.85 it was 0.129), the ball stands 0.10 radii over the skin edge, and the top of each iris lies
under the upper lid in the play view, the 3/4 view, and the default hall camera. White shows only
at the sides. The eyes keep the iris place and the iris paint of the source, and the gaze needs no
move. The map paints a soft light in each pupil, so the eyes take the finish `varnish` and no
eye light, which gives one light in each eye. With the finish `eye` and the eye light, each pupil
showed two lights.

**Arm twist.** The roll of each upper arm (from the clavicle) and the twist of each forearm (the
paw from the upper arm), in degrees, in the moments of `pnpm pose-preview violist` with the hold
`CAT_HOLD` of `src/pose/bowed-rig.ts`:

| Moment | Left upper arm | Left forearm | Right upper arm | Right forearm |
|---|---|---|---|---|
| frog | 42.5 | 33.2 | -13.6 | -11.3 |
| tip | 42.5 | 32.9 | -34.9 | -42.9 |
| crossing | 42.5 | 33.2 | -14.0 | -23.5 |
| rest | -42.0 | -6.1 | -4.2 | -24.3 |
| lift50 | 16.5 | 24.3 | 30.6 | -42.5 |
| lower50 | 33.3 | 34.1 | 29.5 | -31.8 |
| stand | 41.8 | 32.6 | -13.1 | -10.7 |

With no paw turn, no hinge turn, and the bind upper arm of the third cat, the right forearm twisted
68 to 118 degrees, and the left upper arm rolled from -38 degrees at rest to 57 degrees in the
stroke. A bind upper arm that points more down and forward cut that range from 95 to 84 degrees.

**Color map** (`tools/cat-maps.py`). The tool scales the source to 2048 pixels (Lanczos) and writes
WebP quality 60, method 6 (Pillow 13.0.0). No texel changes its color: the tabby fur, the brows,
and the eye paint stay.

**Normal map.** The same run writes `cat-normal.webp` from the normal map of the FBX: each x, y
tilt limited to 0.2 (2.84 % of the texels), a box scale to 1024 pixels, the tilts times 4 in red
and green, 255 in blue, and `cwebp -q 60 -sharp_yuv -m 6` (libwebp 1.5.0).

**Smile.** In the stage light, the slit under the muzzle pads shades as a dark line. In the
source, that line falls from the middle of the W to its lowest point at |x| 0.03 to 0.037, near
the corners, so the mouth read flat to sad from the front and the 3/4 view. The edit `smile` moves
the lowest point of each side in toward the middle and lifts the corners, so the line bends up at
its ends: a soft, slight smile. The color map paints only a thin, level line, so the edit is in
the geometry only, and `tools/cat-maps.py` does not change. The weights, the joints, the seat,
and the viola place do not change, so the rows of the viola, the bow, and the paws in the viola of
`pnpm pose-depth violist` stay. In the lift and the lower of `beethoven-6-1`, a point of the right
forearm lies in the body under the jaw, and its nearest skin is the lifted mouth corner: its depth
goes from 1.2 to 1.7 cm (lift) and from 2.4 to 2.6 cm (lower).

**Paw size.** In the app, the front paws and the digits of the source read too large. The
point edit `paw` (above) scales each front paw past the wrist joint of its side (x 0.31) about
that joint, in the frame of the paw: the rest forearm axis, the width axis +z of the source turned
with the paw turn, and the height axis square to the two. A point at the distance d past the wrist
joint takes the share smoothstep(0, 0.02, d) of the scale, so the wrist has no step. Past the
knuckle joint (x 0.36 of the source), the digits take the factor 0.9 more in length, with a fade
of 0.01 units on each side of the knuckle, so the length scale goes from 0.84 to 0.756 with no
step. Reason: the digits of the source are half of the paw length (0.38 on the paw of the cat of
main), so they read long on their own. The paw height, the arm, the bones of the arm, and the feet
do not change. `make_config.py` moves the knuckle joint and the tip of `fingers_<side>` with the
same edit. The left paw in the rest of each export (`paw_measure.py` of the session), in meters
and in H:

| Measure | Source cat | Cat now | Old cat (`cat.rig.glb` at cbc8db5e4) |
|---|---|---|---|
| Length, wrist joint to tip | 0.153 (0.450) | 0.122 (0.359) | 0.066 (0.194) |
| Knuckle joint from the wrist joint | 0.077 (0.226) | 0.064 (0.189) | 0.041 (0.121) |
| Width | 0.166 (0.488) | 0.144 (0.424) | 0.079 (0.233) |
| Height | 0.082 (0.243) | 0.082 (0.243) | 0.049 (0.144) |
| Length / shoulder distance | 0.541 | 0.432 | 0.509 |
| Width / shoulder distance | 0.587 | 0.510 | 0.610 |
| Length / arm (shoulder to wrist joint) | 0.472 | 0.377 | 0.372 |
| Width / arm | 0.512 | 0.445 | 0.446 |

The paw is 0.80 as long and 0.87 as wide as in the source. Against the arm, these are the shares
of the paw of the cat of main, and the paw is not smaller than that paw. In shares of H, the paw
of main is much smaller, because its head is large. The trunk of the cat of main is narrow, so
the shares of the shoulder distance do not give a limit. Thus the scales stop at the arm shares.
With the paw edit before the weights, the automatic weights of the arm changed a little, so the
step runs after them. With the knuckle rows of the source (12 steps of 0.003), the shorter paw put
more faces in the crease of the curled digits at rest: 50 faces of the left paw folded (41 before
the edit, `pnpm fold-probe violist`). With steps of 0.0035, 43 fold.

With the smaller paws, the higher seat, and the tail behind the chair, the paws still close on
the viola neck and on the bow. Against the body of 34d140d5c, the note targets do not change
(`pnpm hold-fit violist`: the same worst sample of 76.1 mm, and 99.9 % within 5 mm). The arm gate
(`pnpm arm-check violist --base`) has no FAIL: the twist p95 stays at 55° on the left arm (lift)
and 7° on the right arm, and the rest folds of the left arm go from 41 to 42. In the sweep
(`pnpm pose-depth violist --base`), each depth changes by 0.6 cm or less: the paws go 0.2 to 0.6
cm less into the body and the viola, the rest forearms 0.2 cm more into the viola, and the viola
0.3 cm more into the body in the lower.

**Differences from the source.** The stage light is warm and the close views add a fill light, so
the gray fur reads light tan in the close views, and gray in the play view and the hall view. The
eyes are 0.90 of their size, a little deeper, and the upper lids a little lower ("Eyes"). The mouth
corners are 0.007 units higher ("Smile"). The front paws are smaller ("Paw size"). The thighs of the seated bind spread 20 degrees
("Rest").

The export of the file and the maps. License of each file: CC BY-NC 4.0, as the FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/cat.rig.glb` | 1,191,172 bytes | `94adf10fe6519189a5d90fb7012fc9ec2a2e07aa12fd8cc1780692321afb845c` |
| `tripo-hand/cat.rig.json` | 18,465 bytes | `9891213795eb1aaaeb88f1935d9982fb80a2bfc04975b5c7a026a0a0f500256e` |
| `tripo-hand/cat-color.webp` | 312,842 bytes, 2048 × 2048 | `cb365d40c472fdd23f5874fd8e5336b7f76fbf7ebfaf4ff0ab1ad76179a11b2a` |
| `tripo-hand/cat-normal.webp` | 129,298 bytes, 1024 × 1024 | `039d58a13f55967f5152f30696548c0ed672d1186bf8c0d3f8f8279730ccf4f6` |

### History

The second Tripo P2 cat (FBX SHA-256
`d9b38bf098e744e96da28e94abdb00f19b459654e67531b97072d58ad2ac57ff`) and the third (FBX SHA-256
`f6225744655b117ad547b426e0237ace0a86218817e12a3f8bba7c7a430fa980`) each had a hand rig made in
headless Blender, with a Taubin relax, region colors, the crease 55, a tail on the seat, smaller
own eyes with blink lids, and an edited color map (an iris move, a round iris, and a gray fur
step). The fourth mesh comes from a new sheet and takes the route of the Tripo wolf. The old files
and the steps of each edit are in the git history of this folder: the second cat at 53a440d56,
the third at c6f979952.

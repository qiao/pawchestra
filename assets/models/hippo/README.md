# Hippo model

This folder holds the Tripo P2 source mesh of the hippo (`tripo-p2/`) and its hand rig
(`tripo-hand/`). The app does not serve these files. It loads the module
`src/models/studio/hippo.ts`, which this chain writes:

```text
tripo-p2/hippo.fbx             source mesh with quad faces
   │  pnpm hand-chain hippo    chain tools/blender/hand/hippo/
   v
tripo-hand/hippo.blend         hand rig (design 4.4, "Hand rig")
   │  pnpm rig-export hippo    the same run
   v
tripo-hand/hippo.rig.glb       rigged mesh, with its summary hippo.rig.json
   │  pnpm studio-body hippo   the same run
   v
src/models/studio/hippo.ts     studio body of the app
```

`tools/blender/hand/README.md` gives the steps of the chain. The section "Tripo hand rig" below
gives the files, their sources, their licenses, and their checksums.

The files of the older body of the route of `pnpm rig-mesh` are removed. Commit `cbc8db5e4` has
these files and the sections of this file about them.

## Tripo hand rig

`tripo-hand/` holds the body of the app: a hand rig of the Tripo P2 mesh `tripo-p2/hippo.fbx`, made
by one build script in a headless Blender 5.2, as the Tripo wolf (`../wolf/README.md`). The body
keeps the form, the colors, the eyeballs, and the teeth of the source: no point edit changes the
head, the trunk, the paws, the legs, or the tail. The arms have no cut and no split from the
trunk. The upper arms and the forearms are 1.2 times longer than in the source ("Arm stretch"
below), and the paws keep their size. The `ANIMALS` entry of the hippo points to
`tripo-hand/hippo.rig.glb`. The files of the old hippo above do not change.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/hippo.fbx`, `tripo-p2/hippo.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/hippo.blend` | Made from `tripo-p2/hippo.fbx` by the scripted edits below. License as the FBX file | `pnpm hand-chain hippo` |
| `tripo-hand/hippo.rig.glb` | Export of `tripo-hand/hippo.blend`. License as the FBX file | `pnpm rig-export hippo --blend assets/models/hippo/tripo-hand/hippo.blend --out assets/models/hippo/tripo-hand/hippo.rig.glb` |
| `tripo-hand/hippo.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/hippo-color.webp`, `tripo-hand/hippo-normal.webp` | Web copies of the color map and the normal map of the FBX ("Maps" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/tripo-maps.py hippo` |

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

The hand rig (design 4.4, "Hand rig"). The chain of the body is in `tools/blender/hand/hippo/`
(`build.py`, `make_config.py`, `params.json`, `base-config.json`, `redits.py`, `rimport.py`,
`rings.py`), and `pnpm hand-chain hippo` runs it (`tools/blender/hand/README.md`). Its scripts are
those of the Tripo beagle with the values of the hippo. `make_config.py` writes
`tools/mesh-rigs/simple/hippo-tripo.json`: the joints of the source, moved by the point edits of
`redits.py`.

| Item | Value |
|---|---|
| Size | 412,179 bytes. A new build gives the same export, but not the same `.blend` bytes |
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
  axis by whole ring steps of 360/18 degrees: 160 degrees on the left (8 steps) and -60 degrees on
  the right (3 steps), 241 vertices on each side. New quads join the two rings with the step offset, and the
  far ring takes the form of the ring before the turn (a fade to 0 at 0.02 units). The new quads
  keep the UVs of the old band. The paws keep their form ("Arm twist").
- **Wrist loop.** The ring at x 0.3307 does not turn. It is slanted, so 7 of its 18 vertices lie
  past its mean along the forearm axis. When they turned with the paw, the quads before the ring
  sheared into slits and notches at the wrist: 13 faces on the left and 15 on the right had UV scale
  ratios of 2.6 to 22.5, against about 1.2 on the faces around them. One face on the left (2.5) and
  8 faces in the new band and past ring B on the right (2.2 to 4.1) keep their stretch: the join of
  the turned paw causes it, not the cut.
- **Arm stretch.** The point edit `armStretch` (`tools/blender/hand/hippo/redits.py`, params `{"kind":
  "armStretch", "k": 1.2, "ramp": 0.01, "reach": [0.095, 0.115]}`), after the paw turns. Each
  vertex of a side with |x| over the shoulder joint moves along the line u of the rest arm, from
  the shoulder joint to the wrist joint (0.2135 units), from its place t on the line to
  t + 0.2 G(t). G is the integral of a band from 0 to t: a smoothstep from 0 at t -0.01 to 1 at
  0.01, 1 to the wrist, and a smoothstep to 0 from 0.01 before the wrist to 0.01 after it. Thus the
  upper arm and the forearm grow by 1.2, and the paw moves out by 0.0427 units as one piece. The
  move fades from 1 at 0.095 units from the line to 0 at 0.115 units, so that the jowls and the
  belly stay. The joints move with the same map: the elbow to x 0.2704, the wrist to x 0.3963,
  and the knuckles to x 0.4466. The arm rows of the weights read the x of the source. Reason: with
  the arms of the source, each arm reached 0.32 m from the shoulder joint to the wrist, and the
  round belly stands 0.39 m in front of the shoulders, so no upright hold of the contrabass
  reached the strings and the neck. Each arm now reaches 0.38 m.
- **Point edits.** None other.
- **Surface.** `sa.add_surface(hippo, 'hippo', <base color>, eye_fans=False,
  config=<hippo-tripo.json>)`. The 28 nose faces go back to the fur slot, and the gloss slot goes
  (`noGloss`): the map paints the two nostrils, so the snout keeps the color map.
- **Eyes.** The faces of the two eyeballs (the loose parts of 30 to 99 vertices in the eye box)
  take the face attribute `eye`, and keep the color map.
- **Armature.** The joints of the config: the shoulder at x 0.145, the elbow at x 0.2704, the
  wrist at x 0.3963, the knuckles at x 0.4466, the hip at (0.115, 0.21, 0.01), the knee at (0.12, 0.11,
  -0.018), and the ankle at (0.125, 0.045, -0.025). The palm is the true palm of the source, the
  mean normal of the paw faces that face down from x 0.33, (0.182, -0.98, -0.075), turned by the
  paw turn. The bind arms (`bindArms`) and the trunk (`open` 1) are those of the old hippo. The
  bind keeps the legs of the source ("Stance"). The tail bones keep the directions of the source.
  The elbow axis of the left side turns 5.5 degrees about its bind upper arm, and the elbow axis
  of the right side -20 degrees (`hingeTurn`, "Arm twist").

The weights, in the rest pose:

1. Automatic Weights, then Limit Total 4 and Normalize All, on a copy of the mesh with no tail, no
   eyeball, and no tooth.
2. Arm rows: each vertex of a side with |x| from 0.145, within 0.10 units of the line of the rest
   arm at the root (0.084 units on the forearm and the paw), takes one exact row
   (`sa.set_weight_row()`): a clavicle share from 0.4 at x 0.145 to 0 at x 0.185, an elbow helper share that grows from 0 at x 0.21 to 1 at the elbow joint (x 0.25) and
   falls to 0 at x 0.287, and the rest on the
   4 roll segments. The 46 vertices of the jowls and the belly side in that reach, which the
   automatic weights give mostly to the head, the neck, or the trunk, keep their rows. The x of a
   control row and of a reach is the x of the source: the build maps the x of each vertex back
   through the arm stretch.
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
| frog | 7.9 | 9.0 | -17.7 | 3.0 |
| tip | 6.9 | 0.2 | -15.3 | 1.0 |
| crossing | 6.5 | 1.5 | -18.4 | 3.4 |
| rest | 20.2 | 17.7 | -2.8 | -21.0 |
| lift50 | 15.2 | 14.5 | 1.2 | 28.5 |
| lower50 | 13.5 | 13.3 | -1.5 | 25.0 |

The paw turn adds the same angle to each moment of a forearm, and the elbow axis turn moves a part
of the roll of the upper arm into the forearm, so the spread over the moments comes from the hold.
Over the bowing of five demos (`--times` every 5 s), each part takes at most 40 degrees. In the
pizzicato of `brahms-2`, the right upper arm and the right forearm each take about 62 degrees. The
old hold twisted them about 100 degrees there.

**Maps** (`tools/tripo-maps.py hippo`). The tool scales the color map to 2048 pixels (Lanczos) and
writes WebP quality 60, method 6 (Pillow 13.0.0). No texel changes its color. The same run writes
`hippo-normal.webp` from the normal map of the FBX: each x, y tilt limited to 0.2 (0.60 % of the
texels), a box scale to 1024 pixels, the tilts times 4 in red and green, 255 in blue, and `cwebp -q
60 -sharp_yuv -m 6` (libwebp 1.5.0).

**Differences from the source.** The app light is warm and comes from above, so the gray-pink
skin reads as a light peach in the app, and the snout casts a dark band over the mouth line. The
trunk leans 8 degrees forward in the play and at rest, and the teeth show less than in the front
view of the source. The upper arms and the forearms are 1.2 times longer ("Arm stretch").

The export of the file and the maps. License of each file: CC BY-NC 4.0, as the FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/hippo.rig.glb` | 1,130,472 bytes | `fbd01d0b47e8504ec85b554d8ce2c91ecfee5a7a5117fd6667133237c4c99ac3` |
| `tripo-hand/hippo.rig.json` | 16,400 bytes | `ec114d65f73fdf4793bc95233aba19a6b0ee03def4bd4a35327a911df42c759b` |
| `tripo-hand/hippo-color.webp` | 66,764 bytes, 2048 × 2048 | `475803ad0c7ff15b5e375da9d97e4d350ac5f024cb7eb7380fa47c845d0473cb` |
| `tripo-hand/hippo-normal.webp` | 37,300 bytes, 1024 × 1024 | `22136ba7d9c0141efc91d9e0c782ff23c17bd364221bdd73518552b033d0741f` |

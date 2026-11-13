# Polar bear model

This folder holds the Tripo P2 source mesh of the polar bear (`tripo-p2/`) and its hand rig
(`tripo-hand/`). The app does not serve these files. It loads the module
`src/models/studio/polar-bear.ts`, which this chain writes:

```text
tripo-p2/polar-bear.fbx             source mesh with quad faces
   │  pnpm hand-chain polar-bear    chain tools/blender/hand/polar-bear/
   v
tripo-hand/polar-bear.blend         hand rig (design 4.4, "Hand rig")
   │  pnpm rig-export polar-bear    the same run
   v
tripo-hand/polar-bear.rig.glb       rigged mesh, with its summary polar-bear.rig.json
   │  pnpm studio-body polar-bear   the same run
   v
src/models/studio/polar-bear.ts     studio body of the app
```

`tools/blender/hand/README.md` gives the steps of the chain. The section "Tripo hand rig" below
gives the files, their sources, their licenses, and their checksums.

The files of the older bodies are removed: the route of `pnpm rig-mesh`, an older hand rig, and an
older Tripo mesh. Commit `cbc8db5e4` has these files and the sections of this file about them.

## Tripo hand rig

`tripo-hand/` holds the body of the app ("tripo-hand/polar-bear.blend" below): a hand rig of the
Tripo P2 mesh `tripo-p2/polar-bear.fbx`, made by scripted point edits in a headless Blender 5.2. The
arms keep the length of the source: no cut, no split from the trunk, and no stretch. The `ANIMALS`
entry of the polar bear points to `tripo-hand/polar-bear.rig.glb`.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/polar-bear.fbx`, `tripo-p2/polar-bear.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/polar-bear.blend` | Made from `tripo-p2/polar-bear.fbx` by the scripted edits below. License as the FBX file | `pnpm hand-chain polar-bear` |
| `tripo-hand/polar-bear.rig.glb` | Export of `tripo-hand/polar-bear.blend`. License as the FBX file | `pnpm rig-export polar-bear --blend assets/models/polar-bear/tripo-hand/polar-bear.blend --out assets/models/polar-bear/tripo-hand/polar-bear.rig.glb` |
| `tripo-hand/polar-bear.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/polar-bear-color.webp`, `tripo-hand/polar-bear-normal.webp` | Web copies of the color map and the normal map of the FBX ("Color map" and "Normal map" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/polar-bear-maps.py` after the export |

### tripo-p2/polar-bear.fbx

A cute, round polar bear in a T-pose with quad faces, made with Tripo P2 from the sheet of the
polar bear (`assets/images2/polar-bear.png` of the main checkout). Its arm tubes have 17 vertices
around, and its leg tubes 15. This mesh replaces the first Tripo P2 polar bear
(the git history keeps it).

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan, and given on 2026-11-10. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary. The maps lie beside the FBX file in the zip file |
| Contents | One mesh object, with no armature and no animation. 3,280 vertices and 3,507 faces: 2,767 quads and 740 triangles (6,274 triangles), no n-gon. One UV layer |
| Parts | 21 parts: the body (2,636 vertices), two eyeballs (65 vertices each), 10 claws of the paws (29 vertices each), and 8 claws of the feet (28 vertices each). No vertices merge at 1e-5. The open loops are the 2 eye sockets (16 edges), the backs of the 2 eyeballs (14 edges), the bases of the 18 claws (10 edges), and 3 holes of 4 edges: in the nose, on the front of the left thigh, and on the left side of the chest |
| Box | In the studio units (1 unit from the soles to the top of the head): x ±0.463 (the claw tips) and depth ±0.224. The bear faces -y in Blender. The two sides differ by at most 0.0027 units |

The folder `polar-bear.fbm/` keeps two maps of the zip file under new names, as bytes. The
roughness and the metallic maps are not kept.

| File | Name in the zip file | Size | Pixels | SHA-256 |
|---|---|---|---|---|
| `polar-bear.fbx` | `tripo_convert_5b92c94f-1230-4e5b-bb97-1914924719da.fbx` | 219,308 bytes | | `623e2abd5c324d228ff1bf044aab0c2167ba571c1d34948b369a26652baa7750` |
| `polar-bear.fbm/polar-bear_basecolor.jpg` | `tripo_rgb_f9fdd282-49d4-433f-9d95-2097f17838de.jpg` | 4,200,630 bytes | 4096 × 4096 | `c2ba40e8a879b110d84d426df36bff90676ad19c294b32537fc59d56eb5b9ef7` |
| `polar-bear.fbm/polar-bear_normal.jpg` | `tripo_normal_3d0ffc7d-444a-4187-b425-ee632cb1bf8e.jpg` | 1,950,696 bytes | 4096 × 4096 | `9f9e6d84d6103e401647d7ac82da6278a37a5f7c86ec18288b62c2ea87815030` |

The color map paints a tan bear (median Oklab L 0.841, C 0.069, h 74 of the fur texels), a full
eye on each eyeball (a black pupil in a brown iris, a gray white light at the top of the pupil, a
dark lash line, and white at the outer corner), soft gray brown brows, a dark brown nose, a dark
mouth line in a smile, and brown claws.

### tripo-hand/polar-bear.blend

The hand rig (design 4.4, "Hand rig"), made in headless Blender 5.2 (`blender -b --factory-startup`)
by one build script. The chain of the body is in `tools/blender/hand/polar-bear/` (`build.py`,
`make_config.py`, `params.json`, `base-config.json`, `redits.py`, `rimport.py`, `rings.py`), and
`pnpm hand-chain polar-bear` runs it (`tools/blender/hand/README.md`). Its scripts follow the
scripts of the Tripo fox (`assets/models/fox/README.md`). `make_config.py` writes
`tools/mesh-rigs/simple/polar-bear-tripo.json`: the joints of the source, mapped by the point edits.

| Item | Value |
|---|---|
| Size | 404,710 bytes |
| SHA-256 | `19e5ea8c69f3db53bc4012fe034c507363e7a88c598cc494a9ca3c7c5c5a34ac` |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the top of the head before the edits, the soles at z = 0, the bear faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `polar_bear`, with the shape key `bind_belly`: 3,772 vertices and 3,950 faces (3,210 quads and 740 triangles, 7,160 triangles), flat faces, and the surface of `sa.add_surface()`. No face is gloss: the 97 faces of the nose box take the slot `fur` and the color map, with the smooth normals of the fur. The 128 faces of the two eyeballs have the face attribute `eye`, and the 312 faces of the two lids the face attribute `lid`. The UV map of the FBX, and the property `texture` (`assets/models/polar-bear/tripo-hand/polar-bear-color.webp`) |
| Armature | `polar_bear_rig`: 60 bones. The 30 body bones, the 20 arm segments and helpers, and the 10 digit bones (`digit1_<side>` at the thumb side, +z, to `digit5_<side>`), at the joints of the config. The Action `bind` holds the seated bind. The properties `palm` (0, 0, -1), `seat`, `hinges`, and `lids` come from the steps below |
| Facts | `height` 1.346171 (the shoulder joints at 0.672 u at 2.003231 m for each unit, so that H is 0.4228 m, the H of the main polar bear), `crease` 55 |
| Eyes | The eyeballs of the mesh, with the finish `varnish` and no eye light (`eyeFinish` of the entry), and a blink lid on each. No eye objects, so the app adds no bead eyes |

The edits, in the order of the build (`sa` is `tools/blender/studio_armature.py`, x is the x of the
left side):

- **Import.** `sa.import_source('assets/models/polar-bear/tripo-p2/polar-bear.fbx', 1e-5)`. No
  vertex merges, and each face is flat.
- **Holes.** Each open loop of 4 edges on the body takes one quad (`bmesh.ops.edgeloop_fill()`)
  with the UV of a face of the same vertex at each corner.
- **Arm rings.** Edge ring Subdivide (`bmesh.ops.subdivide_edges(bm, edges=<ring>, cuts=1,
  use_grid_fill=True)`) of the clean quad bands of 17 edges between the closed arm loops at x
  0.2898, 0.3156, and 0.34. A ring then stands about each 0.013 units (0.2 arm radii) on the
  forearm.
- **Knee rings.** The same call on the leg bands of 15 edges between the leg loops at y 0.0874,
  0.1138, and 0.1417.
- **Rings with no split.** The upper arm and the elbow (x 0.125 to 0.29) have no closed edge loop:
  the Tripo mesh has poles and triangles there. The paw from x 0.352, the leg above y 0.142, and
  the feet stop at triangles or poles too.
- **Point edits.** As maps of the rest points, in this order:
  - Eyes: scale 1, the size of the source ball (middle (±0.0366, 0.909, 0.1141), radius 0.0192).
  - Arm girth: each arm point moves toward the line from the shoulder joint to the wrist joint by
    the factor k(x), linear between (0.14, 1), (0.165, 0.8), (0.19, 0.64), and 0.64 from there,
    with the share 1 to 0.115 units from the line and 0 at 0.14, for y 0.5 to 0.84.
  - Paws: past the wrist joint, the length along the rest forearm axis takes 0.64 and the width
    (+z) 0.84, with a ramp of 0.015 units (the edit `paw` of the fox).
  - Leg girth: each leg point moves toward the line ankle, knee, hip of its side, in the plane of
    its height, by k(y): (0.05, 1), (0.08, 0.78), (0.15, 0.77), (0.18, 0.75), (0.23, 0.72), (0.30,
    0.8), and (0.37, 1), with the share 1 to 0.11 units and 0 at 0.14.
  - Claws: each claw of a paw takes the move of its middle, and scales about it by 0.63, so that
    it fits the smaller paw. The claws of the feet do not change.
- **Surface.** `sa.add_surface(polar_bear, 'polar-bear', <base color>, eye_fans=False,
  config=<polar-bear-tripo.json>)`.
- **Armature.** The joints of the config: the shoulder at x 0.125, the elbow at x 0.245 (0.52 of
  the arm, as on the main polar bear), the wrist at x 0.355, the knuckles at x 0.425, the hip at
  (0.092, 0.29, 0), the knee at (0.104, 0.164, -0.012), and the hips and spine joints of the first
  Tripo polar bear. With other hip and knee places the rest frame of `thigh_L` sheared by up to 5e-5,
  above the limit of the export (`FRAME_LIMIT`). The digit bones go from the middle of the open base of
  each claw to its farthest vertex, in the same edit session as the other bones, because a second
  edit session also sheared the thighs.

The weights, in the rest pose:

1. Automatic Weights, then Limit Total 4 and Normalize All, on a copy of the mesh with no loose part.
2. Arm rows: each vertex of a side with |x| from 0.15, within 0.1 units of the line of the rest arm,
   takes one exact row (`sa.set_weight_row()`): a clavicle share of 0.50, 0.38, 0.33, 0.22, 0.10,
   and 0.04 at x 0.15, 0.17, 0.175, 0.19, 0.21, and 0.225, and 0 from x 0.24,
   an elbow helper share of 1 - |x - 0.245| / 0.07, and the rest on the 4 roll segments.
   The helper share reaches 1 at the elbow joint, so that the bend share grows linearly over
   the elbow. A peak of 0.75 put 0.25 on the upper arm before the joint and on the forearm
   after it, and the bend share jumped from 0.375 to 0.625 at the joint.
   The bone heat rows inside x 0.15 give the front of each armpit a clavicle share of about 0.57.
   A first row of 0.35 folded the front of each armpit when the arm reached for the keys, and a
   dark slit showed under the right upper arm. With the soft ramp, the fold samples on the
   clavicles (`pnpm fold-probe pianist`) fell from 19,133 (right) and 24,884 (left) to 58 and 10.
3. Wrist rows: the bend share of the paw grows in 12 equal steps of 0.004 from 0.04 units before
   the head of `hand_<side>`. Knuckle rows: the fingers share grows in 12 equal steps of 0.0035 from
   0.02 units before the head of `fingers_<side>`.
4. Each claw vertex of a paw takes {`digit<k>_<side>` 1}, each claw vertex of a foot {`toes_<side>`
   1}, and the eyeballs and the gloss nose {`head` 1}.

Then, on the rest mesh after the weights:

- **Trunk.** Each horizontal section of the trunk scales about its middle by its weight on the trunk
  bones, by u from the hips joint (0) to the neck joint (1): width 0.92 to u 0, 0.95 at 0.3, and 1
  from 0.5. Depth 0.88 to u 0.3, 0.91 at 0.5, 0.89 at 0.7, 0.86 at 0.9, 0.9 at 1.05, and 1 from 1.2.
- **Smooth surface.** Each face takes one color of its region, and ten Taubin rounds (0.5, then
  -0.53) relax the body, with each move clipped to 0.01 units. The eyeballs, the claws, the gloss
  nose, and the open edges stay.
- **Nose.** The gloss faces of the nose go to the slot `fur` (`noseFur` of the params), so the
  nose takes the color map and the smooth normals of the fur. As flat gloss faces in one dark
  color, its facets showed a light square in the key light. The export then writes no gloss
  primitive (`write_glb()` of `tools/blender/rig_mesh.py`).
- **Lids.** A lid on each eye: 14 × 13 points from psi -55 to 60 degrees and lam from -60 to 62
  degrees at 1.2 ball radii, and a lower strip pushed out past the farthest ball point. 156 quads
  on each side, held turned up 126 degrees into the head. The property `lids` holds the angle
  2.199115 and the hinge axes. The lid faces take the UVs of the fur patch at UV (0.7151, 0.2015)
  at 0.69 UV for each unit, and the row `head` 1. In the 21 steps of the blink no open lid point,
  side edge, or back edge leaves the head, and the open lid lies at least 0.0268 units under it.
- **Seat.** The thighs slope 22 degrees down and 12 degrees out in the bind, and the shins lean 5
  degrees forward (`tools/rig/leg_turns.py <config> 22 12 5`). The property `seat` is {`prop`
  `bench`, `front` -0.045, `back` -0.2, `halfWidth` 0.25}, as on the first Tripo polar bear. The
  bind arms (`bindArms`) and the bind supination (right 52 degrees) are those of the first Tripo
  polar bear.
- **Belly.** The key `bind_belly` relaxes the posed bind of the vertices with a rest height from
  0.21 to 0.42, in 4 rounds of P += 0.5 ((mid - P) . n) n (63 vertices, at most 0.01 units).

**Form against the main polar bear.** `pnpm body-shape pianist --base main`, in cm (main, then
this rig). Main is the upper bound of each girth and depth:

| Measure | Source | This rig | Main polar bear |
|---|---|---|---|
| H | 42.3 | 42.3 | 42.3 |
| Seat height | 23.4 | 26.8 | 26.8 |
| Upper arm, forearm girth | 104.9, 93.6 | 74.0, 59.8 | 73.7, 59.8 |
| Thigh (on the leg), shin girth | 130.9, 99.7 | 112.3, 76.4 | 108.2, 75.7 |
| Trunk depth D3, D5, D8 | 72.3, 71.7, 62.8 | 73.7, 68.0, 57.9 | 69.4, 67.8, 55.2 |
| Upper arm, forearm length | 24.1, 22.4 | 24.1, 22.4 | 33.7, 28.8 |

The source column is the build with no point edit, at 20 degrees of thigh slope. As shares of H,
on the rest mesh: the paw is 0.33 H long, 0.49 H wide, and 0.35 H high (main 0.33, 0.47, 0.34),
and the head is 1.10 H wide (main 0.91). The head keeps the round form of the sheet. The arms keep
their length, so they are shorter than on main.

**Color map** (`tools/polar-bear-maps.py`). The tool scales the source to 2048 pixels, and:

1. **Eyes.** `EYE_PAINT = 'centered'` keeps the eye paint of the source and moves each iris, with
   its pupil and its light, to the middle of its opening in the view of the play
   (`center_irises()`, `gaze_targets()`). The head of the pianist turns down 5.2 degrees in the
   play moments (`pnpm pose-preview pianist`), and the front camera of the test page lies 0.3
   degrees above the eyes, so the view looks down 5.5 degrees. The target then turns 6 degrees out
   and 5 up, the same on both sides. The source paints the left iris at the inner corner and the
   right iris near the middle: the left iris (34 degrees) moves 22.4 degrees, the right iris (25
   degrees) 12.2 degrees on the ball. The old place of the iris takes the white across, and the lash
   line stays (`LASH_LINE`). With `EYE_PAINT = 'source'` the paint of the source stays.
2. **Far tone** (`far_tone()`). Each eyeball texel takes the lightness factor 0.9 for the iris and
   0.85 for the white, and the white a warm step, by a soft white share: the values of
   `far_eyes()` of the fox and the rabbit for a dark iris (the brown iris has the median Oklab L
   0.39). In the hall view the bright white read dim. The round iris of `far_eyes()` is not used:
   the source paints white only at the outer corner, so the iris edge shows in only 13 of 120
   directions about the pupil. In the far view (`close-views play --no-fill --at polar-bear
   --azimuth -60 --zoom 0.5 --elevation 30`, `bach-bwv1050` at 31 s) each eye reads as a small dark
   eye.
3. **Brows** (`soften_brows()`). The body faces within 3.4 ball radii of a ball, past 1.5 radii and
   above the eye, keep half of their step from the fur color around them (mean lightness step 0.03
   to 0.015).
4. **Fur.** Each texel moves in Oklab to `FUR` (L 0.92, C 0.015, h 85) plus 0.7 of its lightness
   step and 0.3 of its chroma step from the source fur. A dark texel keeps its lightness and 0.6 of
   its chroma. The texels of the 18 claws take `CLAW` (L 0.25). The dark texels of the 192 nose
   triangles (`NOSE_BOX`) take `NOSE` (L 0.22) plus 0.5 of their lightness step from their median
   (Oklab L 0.336), so that the nostrils still show. The eyeball texels keep the colors of steps 1
   and 2. WebP quality 60, method 6 (Pillow 13.0.0).

The hall view of the app (`close-views play --demo bach-bwv1050 --time 31 --no-fill --size
2880x1800`), the median Oklab of the bear pixels (the box 0.1 to 0.3 by 0.5 to 0.75 of the
image, L above 0.5, C below 0.14):

| Body | L | C | h | Clipped pixels |
|---|---|---|---|---|
| This rig | 0.646 | 0.068 | 61.3 | 0.1 % |
| Main polar bear | 0.632 | 0.067 | 59.8 | 0.0 % |

**Normal map.** The same run writes `polar-bear-normal.webp` from the normal map of the FBX: each
x, y tilt limited to 0.2 (2.53 % of the texels), a box scale to 1024 pixels, the tilts times 4 in
red and green, 255 in blue, and `cwebp -q 60 -sharp_yuv -m 6` (libwebp 1.5.0).

The export of the file and the maps. License of each file: CC BY-NC 4.0, as the FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/polar-bear.rig.glb` | 883,036 bytes | `4881e0432286911d67a8f72318bd0f6d16e6532783d523ab268a5d7cfe866dc0` |
| `tripo-hand/polar-bear.rig.json` | 18,509 bytes | `f5d83381065de71814de2a3bbe72a41b35a4e0fa3e94bce17061dc2e2639eb13` |
| `tripo-hand/polar-bear-color.webp` | 177,576 bytes, 2048 × 2048 | `3445636300eb5ca1b2d3213048b8de71ae63f2cb7edc34989184015e11396757` |
| `tripo-hand/polar-bear-normal.webp` | 119,866 bytes, 1024 × 1024 | `a7c97420957c9ba890474f5e429ed9e3740e87616b82b98f1fcbf444711b4e68` |

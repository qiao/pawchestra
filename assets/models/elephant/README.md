# Elephant model

This folder holds the Tripo P2 source mesh of the elephant (`tripo-p2/`) and its hand rig
(`tripo-hand/`). The app does not serve these files. It loads the module
`src/models/studio/elephant.ts`, which this chain writes:

```text
tripo-p2/elephant.fbx             source mesh with quad faces
   │  pnpm hand-chain elephant    chain tools/blender/hand/elephant/
   v
tripo-hand/elephant.blend         hand rig (design 4.4, "Hand rig")
   │  pnpm rig-export elephant    the same run
   v
tripo-hand/elephant.rig.glb       rigged mesh, with its summary elephant.rig.json
   │  pnpm studio-body elephant   the same run
   v
src/models/studio/elephant.ts     studio body of the app
```

`tools/blender/hand/README.md` gives the steps of the chain. The section "Tripo hand rig" below
gives the files, their sources, their licenses, and their checksums.

The files of the older body of the route of `pnpm rig-mesh` are removed. Commit `cbc8db5e4` has
these files and the sections of this file about them.

## Tripo hand rig

`tripo-hand/` holds the body of the elephant of the app ("tripo-hand/elephant.blend" below): a hand
rig of the Tripo P2 mesh `tripo-p2/elephant.fbx`, made by one build script in a headless Blender
5.2, by the route of the Tripo wolf (`../wolf/README.md`, "Tripo hand rig"). The source FBX is the
target of its look: no point edit changes the head, the face, the ears, the trunk, the tusks, the
paws, the legs, or the tail, and no color changes. The arms keep the length of the source: no cut,
no split from the trunk, and no stretch. The `ANIMALS` entry of the elephant points to
`tripo-hand/elephant.rig.glb`. The files of the old elephant above do not change.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/elephant.fbx`, `tripo-p2/elephant.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/elephant.blend` | Made from `tripo-p2/elephant.fbx` by the scripted edits below. License as the FBX file | `pnpm hand-chain elephant` |
| `tripo-hand/elephant.rig.glb` | Export of `tripo-hand/elephant.blend`. License as the FBX file | `pnpm rig-export elephant --blend assets/models/elephant/tripo-hand/elephant.blend --out assets/models/elephant/tripo-hand/elephant.rig.glb` |
| `tripo-hand/elephant.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/elephant-bands.json` | The band faces of the stump turns, for the band fade of the maps (`tools/blender/band_faces.py`) | `pnpm hand-chain elephant` |
| `tripo-hand/elephant-color.webp`, `tripo-hand/elephant-normal.webp` | Web copies of the color map and the normal map of the FBX, with the band fade ("Color map" and "Normal map" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/tripo-maps.py elephant`, after the chain (the tool reads the band faces) |

### tripo-p2/elephant.fbx

A round gray elephant in a T-pose with quad faces, made with Tripo P2 from the sheet of the
elephant (`assets/images2/elephant2.png` of the main checkout): large ears with a pink inside,
small cream tusks, a long trunk that curls at its tip, round stump paws with pale nails at the
end, and a thin tail with a dark tuft.

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan, and given on 2026-11-12. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary. The maps lie beside the FBX file in the zip file |
| Contents | One mesh object, with no armature and no animation. 3,162 vertices and 3,541 faces: 2,779 quads and 762 triangles, no n-gon. One UV layer |
| Parts | One part, with no open edge. No eyeball: the map paints each eye on faces of the head |
| Box | In the studio units (1 unit from the soles to the top of the head): x ±0.438 (the paw ends), z -0.288 (the tail tuft) to 0.288 (the trunk). The elephant faces -y in Blender, with its left side at +x, so the import needs no turn |

The folder `elephant.fbm/` keeps two maps of the zip file under new names, as bytes. The roughness
and the metallic maps are not kept.

| File | Name in the zip file | Size | Pixels | SHA-256 |
|---|---|---|---|---|
| `elephant.fbx` | `tripo_convert_739dc3b8-8f96-40b9-8238-551d249b2de4.fbx` | 217,548 bytes | | `d04001261cd3c074cb59858e926ade23d908f7e8e58a8b835b281f1d5bf2a11c` |
| `elephant.fbm/elephant_basecolor.jpg` | `tripo_rgb_c147588b-9127-4868-8795-82230c869e53.jpg` | 2,300,329 bytes | 4096 × 4096 | `c0d64d2def73f43d8bbf1a33aac3b560b5a558ef669bfc3cb88830a5fbeec1db` |
| `elephant.fbm/elephant_normal.jpg` | `tripo_normal_1ed6ac9c-b91e-4239-b47a-9e56f9e59fd9.jpg` | 1,415,891 bytes | 4096 × 4096 | `a684f317ece8e8e4b5b318ccaedc96bb6393428ac2be9b3a7f65ff401ad316cb` |

The color map paints gray skin with fine wrinkles, pink inside the ears and on the cheeks, cream
tusks and nails, a dark tail tuft, dark brows, a thin smile line under the trunk, and on each eye a
dark lash line, a black pupil, an orange brown iris at the inner side, and a thin white rim at the
outer side. It paints no light in the eyes.

### tripo-hand/elephant.blend

The hand rig (design 4.4, "Hand rig"). The chain of the body is in `tools/blender/hand/elephant/`
(`build.py`, `make_config.py`, `params.json`, `base-config.json`, `eye-centers.json`, `redits.py`,
`rimport.py`, `rings.py`), and `pnpm hand-chain elephant` runs it (`tools/blender/hand/README.md`).
Its scripts are those of the Tripo pig (`../pig/README.md`) with the changes below. `make_config.py`
writes `tools/mesh-rigs/simple/elephant-tripo.json`: the joints of the source.

| Item | Value |
|---|---|
| Size | 376,803 bytes. A new build gives the same export, but not the same `.blend` bytes |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the top of the head, the soles at z = 0, the elephant faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `elephant`: 3,526 vertices and 3,853 faces (3,091 quads and 762 triangles, 6,944 triangles), flat faces, and the surface of `sa.add_surface()`. No face is gloss. The 42 faces of the two painted eyes have the face attribute `eye`, and the 312 faces of the two lids the face attribute `lid`. The UV map of the FBX, and the property `texture` (`assets/models/elephant/tripo-hand/elephant-color.webp`) |
| Armature | `elephant_rig`: the 30 body bones, `tail_tip`, and the 20 arm segments and helpers, at the joints of the config. The Action `bind` holds the standing bind with no bind supination. The properties `palm`, `hinges`, `seat`, and `lids` come from the steps below |
| Facts | `height` 1.135511 (the shoulder joints at 1.914859 m for each unit, so that H is 0.593073 m, the H of the elephant of main), `crease` 180, and `headFloor` 0.69 ("Trunk") |
| Eyes | The painted eye faces of the mesh, with the finish `eye` and the eye light, and a blink lid on each. No eye objects, so the app adds no bead eyes |

The edits, in the order of the build (`sa` is `tools/blender/studio_armature.py`, x is the x of the
left side):

- **Import.** `sa.import_source('assets/models/elephant/tripo-p2/elephant.fbx', 1e-5)`. No vertex
  merges, and each face is flat. The source has no loose part, so no part goes.
- **No arm rings and no knee rings.** The arm has closed loops only at x 0.313 and 0.344 (13
  vertices each), and the other arm loops and each leg band stop at poles. So no band is a clean
  quad ring, and no ring takes a split. The arm quads lie about 0.02 units apart, about 0.4 arm
  radii. Exact knee rows take the place of knee rings.
- **Paws turned.** Each stump paw turns rigidly about the rest forearm axis by one step of the
  closed ring of 13 vertices at x 0.344 (`turn_hooves()` of the build, as the hooves of the pig):
  27.7 degrees on the left and -27.7 degrees on the right, 127 vertices on each side. The 13 faces
  between the ring and the paw side go, and Bridge Edge Loops joins the ring to the turned edge
  with 13 new quads, with the UVs of the old band. The paw is a round stump, so the turn does not
  change its outline ("Arm twist"). The chain writes the 26 new faces to
  `tripo-hand/elephant-bands.json` (`bandFade`), and both maps paint their texels as a fade from
  the forearm skin to the turned stump skin (`tools/band_fade.py`). Reason: the stump turned with
  its UVs, so a thin seam line showed across the stump where the band met it.
- **Point edits.** None. The paw is a stump as wide as the forearm (about 0.10 units, 19 cm), so it
  does not read too large against the arm, and it keeps its size.
- **Surface.** `sa.add_surface(elephant, 'elephant', <base color>, eye_fans=False,
  config=<elephant-tripo.json>)`. The trunk has no dark nose pad, so no face is gloss
  (`noGloss`).
- **Eyes.** The 42 head faces with at least half of their pixels in the eye paint of the front
  view of the source (the dark lash line, the pupil, the orange iris, and the white, closed and
  filled, in the band of the eyes from y 0.842 to 0.890) take the face attribute `eye`. Each eye is
  about 0.03 units wide, 0.09 of the head width. A sphere fits its vertices within 0.0033 units
  (radius 0.0345 on the left, 0.0327 on the right).
- **Armature.** The joints of the config: the shoulder at x 0.13, the elbow at x 0.255, in the
  middle from the shoulder to the wrist, the wrist at x 0.385, where the nails start, the knuckles
  at x 0.415, and the tip at x 0.438. The leg: the hip joint at (0.105, 0.25, -0.045), the knee at
  y 0.14, and the ankle at y 0.05, on the axis of the closed leg loops. The ear bone goes from
  (0.18, 0.85, -0.07) out to (0.33, 0.80, -0.17). The tail bones keep the directions of the source:
  from (0, 0.36, -0.25) down the rump to the tuft at (0, 0.185, -0.275). The palm is the true palm
  of the source, the mean normal of the paw faces that face down (x from 0.385), (0.343, -0.931,
  -0.125), turned by the paw turn. The bind arms (`bindArms`) are those of the elephant of main,
  and each elbow axis turns 20 degrees about the bind upper arm (`hingeTurn`: 20 on the left, -20
  on the right).

The weights, in the rest pose:

1. Automatic Weights, then Limit Total 4 and Normalize All, on a copy of the mesh with no tail.
2. Arm rows: each vertex of a side with |x| from 0.13, within 0.075 units of the line of the rest
   arm, takes one exact row (`sa.set_weight_row()`): a clavicle share of 0.8, 0.6, 0.4, 0.2, and
   0.05 at x 0.13, 0.15, 0.17, 0.19, and 0.21, linear between them and 0 from x 0.22 (`rows.control`
   of `params.json`), an elbow helper share that grows from 0 at x 0.22 to 1 at the elbow joint (x 0.255) and
   falls to 0 at x 0.29, and the rest on the 4 roll segments ("Arm roots").
3. Wrist rows: the bend share of the paw grows in 12 equal steps of 0.003 from 0.03 units before
   the head of `hand_<side>`. Knuckle rows: the fingers share grows in 12 equal steps of 0.0025 from
   0.015 units before the head of `fingers_<side>`.
4. Knee rows: each leg vertex within 0.04 units of the knee joint along the leg, and within 0.09
   units of the line from the hip to the ankle, splits the sum of its thigh and shin shares by
   smoothstep(-0.025, 0.025) of its place past the knee joint (84 vertices).
5. Face rows: each vertex above y 0.70 with a head share keeps its ear shares and gives each other
   share to `head` (574 vertices).
6. Ear rows: the ear of a side is the flood over edges from its outermost point through the
   vertices with |x| above 0.17 and y above 0.655 (194 and 193 vertices). Each takes {`ear` e,
   `head` 1 - e}, with e = smoothstep(0.17, 0.215) of |x|. Reason: bone heat gave the low ear lobes,
   which hang just over the upper arms, shares of the clavicles and the chest, so that the lobes
   moved with the arms.
7. Trunk rows: the trunk, the tusks, and the lips are the flood over edges from the lowest trunk
   point and from the lowest point of each tusk, through the vertices with y below 0.74 and z above
   0.11 (415 vertices, x ±0.125, y 0.444 to 0.739). Each takes {`head` h, `neck` 1 - h}, with h
   from 0.6 at the tip of the trunk (y 0.444) to 1 at y 0.66 and above. Reason: bone heat gave the
   trunk shares of the chest and the spine, because it hangs in front of the chest. The neck share
   keeps the low trunk nearer to the vertical when the head bows.
8. The eye faces take {`head` 1}. The tail (the flood from its farthest point back through z below
   -0.22 and y below 0.37, 152 vertices) takes {`hips` 1 - a, `tail` a (1 - c), `tail_tip` a c},
   with a = smoothstep(0, 0.02) of the edge path from the root of the tail and c =
   smoothstep(-0.04, 0.04) along `tail_tip`.

**Smooth surface.** No relax and no region colors. The crease angle 180 gives each corner the mean
normal of the faces at its vertex, as the smooth shading of an FBX viewer.

**Trunk.** The trunk hangs from the face down to y 0.44, in front of the chest. The armature fact
`headFloor` 0.69 (design 4.4) keeps the trunk and the tusks out of the head measures of `pnpm
studio-body`, as on the elephant of main, so that H is the height of the head above the chin.

**Stance.** The elephant stands at its timpani in its bind (`soloist` false in `ANIMALS` of
`tools/studio-body.ts`). The bind keeps the straight legs of the source (`tools/rig/leg_turns.py
<config> 90 0 0 0`), and the trunk of the bind stands as in the source (`trunk.open` 0). The
property `seat` is {`prop` `chair`, `front` -0.15, `back` -0.27, `halfWidth` 0.2}: a seat under the
back of the haunch, behind the heels, which only sets the seat height of the export, as on the
Tripo monkey. The seat height is 0.489 m (0.288 m on the elephant of main), so the soles stay on the
floor in the app. A seat under the crotch stopped the export, because the shins lie over it. The
table gives, from the middle of the soles (the corners within 1.2 cm of the floor, 38.5 cm long),
the center of mass (the volume of the skin) and the head center, in cm in front of the middle, and
the head center in front of the middle of the chest (`scratch/elephant/balance.py` of the session,
from `pnpm pose-preview timpanist --skin`; the model faces -z):

| Moment | Center of mass | Head center | Head over chest |
|---|---|---|---|
| rest, left, right, lift50, lower50 | -0.2 | 15.8 | 14.5 |
| up | 0.7 | 17.4 | 15.5 |
| between (damp) | 2.3 | 20.4 | 17.6 |

The head of the source stands 14.5 cm in front of the middle of its chest, with the face and the
root of the trunk to the front, so the stance keeps it. With the damp lean of 15 degrees of the
elephant of main, the center of mass went 10.5 cm and the head center 39 cm in front of the middle
of the soles.

**Lids.** A lid on each eye: 14 × 13 points from psi -40 to 36 degrees and lam from -38 to 50
degrees on the left (the mirror on the right), with the lower strip as the first row, at 1.17 ball
radii. 156 quads on each side, held turned up 110 degrees into the head. The property `lids` holds
the angle 1.919862 and the hinge axes. The lid faces take the gray skin patch at UV (0.4382, 0.5777)
at 0.63 UV for each unit, and the row `head` 1. In the 21 steps of the blink no open lid point, side
edge, or back edge leaves the head (ray casts), and the open lid lies at least 0.0278 units under
it. With the ranges and the turn of 126 degrees of the wolf, 3 points of each open lid lay out of
the head.

**Arm twist.** The roll of each upper arm and the twist of each forearm, in degrees, in each moment
of the timpani hold (`pnpm pose-preview timpanist`):

| Moment | Left upper arm | Left forearm | Right upper arm | Right forearm |
|---|---|---|---|---|
| left | 28.2 | 23.9 | -29.0 | -6.0 |
| between | 18.5 | -43.0 | -32.0 | -12.9 |
| up | 31.2 | 0.5 | -34.5 | -17.0 |
| right | 28.7 | 19.8 | -28.5 | -6.1 |
| rest | 28.7 | 20.0 | -28.9 | -5.2 |
| lift50 | 28.2 | 24.3 | -29.0 | -5.5 |
| lower50 | 28.2 | 24.2 | -29.0 | -5.6 |

With the paws and the elbow axes of the source, the upper arms rolled 46 to 54 degrees. An elbow
axis turn of 20 degrees moves 20 degrees of the twist from the upper arm to the forearm, and the
paw turn of one ring step takes 27.7 degrees off the forearm.

**Timpani hold.** The timpani hold (`PERCUSSION_HOLDS.timpani` of `src/pose/percussion-rig.ts`,
design 5.3) changes in two values for the stump paws: the curl of the paw end on the shaft is 20
degrees (100 before), and the damp reaches 0.52 m and 0.51 m with the spine 3 degrees forward (15
before), the grip level with the head, the rigid low point of the paw 1.5 cm over the head (1.7 cm
under it before), and 5 of the pitch of the mallet (9 before). The mallets stay at the grips of the
elephant of main (`TIMPANI.malletSpotL` and `malletSpotR`), and the kettles do not move. The
sweep of one demo (`pnpm pose-depth timpanist --demo beethoven-5-4`) and the arm gate
(`pnpm arm-check timpanist --base 204632d8d`), in the play:

| Measure | Old values on the new body | Now |
|---|---|---|
| Paws in the kettles | 5.7 cm | 0.8 cm |
| Forearms in the kettles | 6.4 cm | 0.3 cm |
| Trunk (the head bone) in the kettles | 2.2 cm | 0 cm, 8.3 cm of room in the damp |
| Mallets in the kettles (limit 3 cm) | 2.2 cm | 2.2 cm |
| Upper arms in the body, into the arm root | 4.8 cm | 4.8 cm |
| Folds p95, left and right (limit 8, main 6 and 3) | 47, 45 | 12, 11 |
| Skin twist p95, left and right (main 27 and 26) | 18, 18 | 12, 11 |
| Note targets within 5 mm | 100 % | 100 % |

The folds that stayed lay at the inner elbows and at the root of each upper arm (`pnpm fold-probe
timpanist`). "Arm roots" gives the fix of the roots.

**Arm roots.** The shoulder joint lies 0.035 units inside the side of the trunk. With a clavicle
share from 0.4 at x 0.13 to 0 at x 0.17, the rings under the arm, where the arm leaves the trunk
(x 0.15 to 0.18), followed the upper arm by 0.89 to 1.0. The bind holds the upper arm 8 degrees
below level, and the timpani hold lowers it 39 to 54 degrees more. These rings then turned about
the joint into the trunk: 0.7 cm in the bind, and 3.9 cm to 4.2 cm in each sample of the sweep.
The clavicle rows of step 2 now reach to x 0.22, so the rings of the root lag behind the upper
arm. The sweep of beethoven-9 (`pnpm pose-depth timpanist --demo beethoven-9`) and the arm gate
(`pnpm arm-check timpanist`), before and after:

| Measure | Before | After |
|---|---|---|
| Upper arms in the body: play, lift, rest, lower | 4.2, 3.9, 3.9, 4.2 cm | 0.0, 0.0, 0.0, 0.1 cm |
| Folds p95, left and right (limit 8) | 9, 4 | 6, 2 |
| Twist p95, left and right (limit 55) | 8, 8 | 8, 8 |
| Flat p5, left and right (limit 0.55) | 0.87, 0.90 | 0.86, 0.90 |

The other pairs of the sweep, the note targets, the head height, and the seat height do not
change. A clavicle share of 0.7 at x 0.13 and 0.5 at x 0.15 left 1.5 cm in the play, and 0.75 and
0.55 split the body surface of the sweep into 5 open loops.

**Color map** (`tools/tripo-maps.py elephant`). The tool scales the source to 2048 pixels (Lanczos)
and writes WebP quality 60, method 6 (Pillow 13.0.0). No texel changes its color. The eyes keep the
iris place of the source: in the face views, the play view, and the far hall view from the default
camera, the gaze reads as a look ahead, and no iris is too large (0.09 of the head width), so no
iris moves.

**Normal map.** The same run writes `elephant-normal.webp` from the normal map of the FBX, as for
the wolf: each x, y tilt limited to 0.2 (0.64 % of the texels), a box scale to 1024 pixels, the
tilts times 4 in red and green, 255 in blue, and `cwebp -q 60 -sharp_yuv -m 6` (libwebp 1.5.0).

**Differences from the source.** The app light is warm and comes from above, so the gray skin reads
lighter and warmer than in the even gray light of an FBX viewer, and the head casts a dark band of
shadow on the neck under the chin. The source paints no light in the eyes, so each eye shows one
small light of the eye light. The mouth line lies under the trunk, so the face reads happy by the
eyes and the brows, as in the source. The timpani hold bends the arms, and the stump paws close a
little on the mallets.

The export of the file and the maps. License of each file: CC BY-NC 4.0, as the FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/elephant.rig.glb` | 1,088,320 bytes | `ad50236ba8eb5278a15d0491ec44ea52f6e89a1f834f94a949a941550cd4d1e6` |
| `tripo-hand/elephant.rig.json` | 15,348 bytes | `8ff17f3d68bba37d0028e6d8520689d0a672e0708d400da8901080bab3d71183` |
| `tripo-hand/elephant-color.webp` | 84,808 bytes, 2048 × 2048 | `147a74170ee834bf1060d05d17431f4984db864a0264e14ddd955e782da2496c` |
| `tripo-hand/elephant-normal.webp` | 66,884 bytes, 1024 × 1024 | `bf2678fac168ddffb83767605e1a1d76a05fbf23f5c3880c1d2efe1859f21656` |

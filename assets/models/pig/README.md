# Pig model

This folder holds the Tripo P2 source mesh of the pig (`tripo-p2/`) and its hand rig
(`tripo-hand/`). The app does not serve these files. It loads the module `src/models/studio/pig.ts`,
which this chain writes:

```text
tripo-p2/pig.fbx             source mesh with quad faces
   │  pnpm hand-chain pig    chain tools/blender/hand/pig/
   v
tripo-hand/pig.blend         hand rig (design 4.4, "Hand rig")
   │  pnpm rig-export pig    the same run
   v
tripo-hand/pig.rig.glb       rigged mesh, with its summary pig.rig.json
   │  pnpm studio-body pig   the same run
   v
src/models/studio/pig.ts     studio body of the app
```

`tools/blender/hand/README.md` gives the steps of the chain. The section "Tripo hand rig" below
gives the files, their sources, their licenses, and their checksums.

The files of the older body of the route of `pnpm rig-mesh` are removed. Commit `cbc8db5e4` has
these files and the sections of this file about them.

## Tripo hand rig

`tripo-hand/` holds the body of the pig of the app ("tripo-hand/pig.blend" below): a hand rig of the
Tripo P2 mesh `tripo-p2/pig.fbx`, made by one build script in a headless Blender 5.2, by the route
of the Tripo wolf (`../wolf/README.md`, "Tripo hand rig"). The body keeps the form, the colors, and
the eye paint of the source: no point edit changes the head, the face, the ears, the trunk, the
hooves, the legs, or the tail. The arms keep the length of the source: no cut, no split from the
trunk, and no stretch. The `ANIMALS` entry of the pig points to `tripo-hand/pig.rig.glb`. The files
of the old pig above do not change.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/pig.fbx`, `tripo-p2/pig.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/pig.blend` | Made from `tripo-p2/pig.fbx` by the scripted edits below. License as the FBX file | `pnpm hand-chain pig` |
| `tripo-hand/pig.rig.glb` | Export of `tripo-hand/pig.blend`. License as the FBX file | `pnpm rig-export pig --blend assets/models/pig/tripo-hand/pig.blend --out assets/models/pig/tripo-hand/pig.rig.glb` |
| `tripo-hand/pig.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/pig-color.webp`, `tripo-hand/pig-normal.webp` | Web copies of the color map and the normal map of the FBX ("Color map" and "Normal map" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/pig-maps.py` |

### tripo-p2/pig.fbx

A round pink pig in a T-pose with quad faces, made with Tripo P2 from the sheet of the pig
(`assets/images2/pig.png` of the main checkout): floppy ears, a snout disc, dark cloven hooves on
the arms and the legs, and a curly tail.

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan, and given on 2026-11-11. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary. The maps lie beside the FBX file in the zip file |
| Contents | One mesh object, with no armature and no animation. 3,278 vertices and 3,656 faces: 2,891 quads and 765 triangles, no n-gon. One UV layer |
| Parts | One part with the tail. No eyeball: the map paints each eye on faces of the head. 11 open edges in 3 small loops at the roots of the ears, and no edge with more than two faces |
| Box | In the studio units (1 unit from the soles to the top of the head): x ±0.427 (the hoof tips), z ±0.263 (the tail and the snout disc). The pig faces -y in Blender, with its left side at +x, so the import needs no turn |

The folder `pig.fbm/` keeps two maps of the zip file under new names, as bytes. The roughness and
the metallic maps are not kept.

| File | Name in the zip file | Size | Pixels | SHA-256 |
|---|---|---|---|---|
| `pig.fbx` | `tripo_convert_137f8b00-4642-4b4b-bdf1-09958ecaf099.fbx` | 221,452 bytes | | `22ee38734cc3528a7f442f29746b648d1ad8bd5a837630676b211030e7ab0909` |
| `pig.fbm/pig_basecolor.jpg` | `tripo_rgb_0462fe8b-ec13-4b51-8f79-53c6247da2a5.jpg` | 1,679,262 bytes | 4096 × 4096 | `97b4b7ed096b56748c5d77dfbe48e9809d74f6674242029c93454aa0995b7351` |
| `pig.fbm/pig_normal.jpg` | `tripo_normal_81c0be4b-d6dc-4c8b-84aa-895e88331e62.jpg` | 902,417 bytes | 4096 × 4096 | `16158ac7accf8a036aedf0ef277b98237861ef653dbf7ff85aa5bcbcc3508700` |

The color map paints pink skin, darker pink inside the ears, a pink snout disc with two dark
nostrils, brown brows, a thin smile line, dark brown hooves, and on each eye a dark lash line, a
black pupil, an orange brown iris at the inner side of the eye, and white at the outer side. It
paints no light in the eyes.

### tripo-hand/pig.blend

The hand rig (design 4.4, "Hand rig"). The chain of the body is in `tools/blender/hand/pig/`
(`build.py`, `make_config.py`, `params.json`, `base-config.json`, `eye-centers.json`, `redits.py`,
`rimport.py`, `rings.py`), and `pnpm hand-chain pig` runs it (`tools/blender/hand/README.md`). Its
scripts are those of the Tripo monkey (`../monkey/README.md`) with the eye faces of the Tripo wolf
and the changes below. `make_config.py` writes `tools/mesh-rigs/simple/pig-tripo.json`: the joints
of the source.

| Item | Value |
|---|---|
| Size | 384,093 bytes |
| SHA-256 | `1d752944202b92beedcdf3941e6d52d980063aadba474e3d4749f74e43082efc` |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the top of the head, the soles at z = 0, the pig faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `pig`: 3,642 vertices and 3,968 faces (3,203 quads and 765 triangles, 7,171 triangles), flat faces, and the surface of `sa.add_surface()`. No face is gloss: the snout disc takes the slot `fur` and the color map. The 93 faces of the two painted eyes have the face attribute `eye`, and the 312 faces of the two lids the face attribute `lid`. The UV map of the FBX, and the property `texture` (`assets/models/pig/tripo-hand/pig-color.webp`) |
| Armature | `pig_rig`: the 30 body bones, `tail_tip`, and the 20 arm segments and helpers, at the joints of the config. The Action `bind` holds the seated bind with no bind supination. The properties `palm`, `hinges`, `seat`, and `lids` come from the steps below |
| Facts | `height` 0.851151 (the shoulder joints at 1.402226 m for each unit, so that H is 0.411693 m, the H of the pig of main), `crease` 180, and `mouthHeight` 0.75 ("Mouth") |
| Eyes | The painted eye faces of the mesh, with the finish `eye` and the eye light, and a blink lid on each. No eye objects, so the app adds no bead eyes |

The edits, in the order of the build (`sa` is `tools/blender/studio_armature.py`, x is the x of the
left side):

- **Import.** `sa.import_source('assets/models/pig/tripo-p2/pig.fbx', 1e-5)`. No vertex merges,
  and each face is flat.
- **No arm rings and no knee rings.** The arm has closed loops only at x 0.151 (15 vertices) and
  0.271 (14 vertices), and the other arm loops and each leg band stop at poles. So no band is a
  clean quad ring, and no ring is split. The arm and the leg quads lie about 0.02 units apart, about
  0.35 arm radii. Exact knee rows ("Weights" below) take the place of knee rings.
- **Hooves turned.** Each hoof turns rigidly about the rest forearm axis by whole steps of the
  closed ring of 14 vertices at x 0.271 (`turn_hooves()` of the build): -102.9 degrees on the left
  (-4 steps) and 51.4 degrees on the right (2 steps), 222 vertices on each side. The hoof side is
  the part of the arm past the ring, found by a flood from the hoof tip. The 14 faces between the
  ring and the hoof side go, and Bridge Edge Loops (`bmesh.ops.bridge_loops()`) joins the ring to
  the turned edge with 14 new quads. Each new face takes the UVs of the old band at its place, and
  at the UV seam of the band the set of corner UVs with the shortest UV outline. The hooves and the
  arms keep their form ("Arm twist").
- **Point edits.** None.
- **Surface.** `sa.add_surface(pig, 'pig', <base color>, eye_fans=False,
  config=<pig-tripo.json>)`. The 53 gloss faces of the snout disc go back to the slot `fur`
  (`noGloss`), and the slot `gloss` goes. The disc thus shows the color map with its painted
  nostrils.
- **Eyes.** The 93 head faces with at least half of their pixels in the eye paint of the front view
  of the source (the dark lash line, the pupil, the orange iris, and the white, closed and filled,
  in the band of the eyes from y 0.812 to 0.870) take the face attribute `eye`. Each eye is about
  0.044 units wide, 0.137 of the head width. A sphere fits its vertices within 0.008 units (radius
  0.028 on the left, 0.029 on the right).
- **Armature.** The joints of the config: the shoulder at x 0.13, the elbow at x 0.24, the wrist at
  x 0.345, where the hoof starts, the knuckles at x 0.39, where the toes part, the hip at (0.095,
  0.24, -0.01), the knee at (0.098, 0.13, -0.03), and the ankle at (0.103, 0.045, -0.013). The palm
  is the true palm of the source: the mean normal of the hoof faces that face down (x from 0.36),
  (0.243, -0.968, -0.067), turned by the hoof turn. The bind arms (`bindArms`) are those of the pig
  of main, and each elbow axis turns about the bind upper arm (`hingeTurn`): 80 degrees on the left
  and -110 degrees on the right ("Arm twist"). The leg turns put the thigh 25 degrees down and 15
  degrees out, and the shin vertical, as on the pig of main, and turn each foot 30 degrees with the
  heel up, the hoof tips flat on the floor ("Seat"). The tail bones keep the directions of the
  source in the bind.

The weights, in the rest pose:

1. Automatic Weights, then Limit Total 4 and Normalize All, on a copy of the mesh with no tail.
2. Arm rows: each vertex of a side with |x| from 0.13, within 0.075 units of the line of the rest
   arm, takes one exact row (`sa.set_weight_row()`): a clavicle share from 0.4 at x 0.13 to 0 at x
   0.17, an elbow helper share that grows from 0 at x 0.205 to 1 at the elbow joint (x 0.24) and
   falls to 0 at x 0.275, and the rest on the 4 roll segments.
3. Wrist rows: the bend share of the hoof grows in 12 equal steps of 0.003 from 0.03 units before
   the head of `hand_<side>`. Knuckle rows: the toes share grows in 12 equal steps of 0.0025 from
   0.015 units before the head of `fingers_<side>`. The rig has no digit bones.
4. Knee rows: each leg vertex within 0.05 units of the knee joint along the line from the hip to
   the ankle, and within 0.08 units of that line, keeps the sum t of its thigh and shin shares and
   splits it as thigh t (1 - k) and shin t k, with k = smoothstep(-0.03, 0.03) of the place past the
   knee joint (172 vertices).
5. Face rows: each vertex above y 0.70 with a head share keeps its ear shares and gives each other
   share to `head` (467 vertices). Bone heat gave the chin and the snout disc shares of the
   clavicles and the neck, because the head hangs over the shoulders. The face then moved with the
   shoulders, and `pnpm studio-body` found the tip of the nose and the mouth at the back of the head.
6. The eye faces take {`head` 1}. The tail (the flood from its farthest point back through z below
   -0.186, 167 vertices) takes {`hips` 1 - a, `tail` a}, with a = smoothstep(0, 0.02) of the length
   of the shortest edge path from the root of the tail. `tail_tip` takes no share, as on the Tripo
   monkey, so that the curl keeps its form.
7. Belly rows (`belly_rows()`, `bellyRows` of the params), after the knee rows: each trunk vertex
   (a thigh share below 0.5) with rest z above 0.30 keeps its thigh shares times f, with f linear
   from 1 at z 0.30 to 0 at z 0.48, and the rest of its thigh share goes to `spine` (110
   vertices). Bone heat gave the belly thigh shares of 0.13 to 0.19 up to z 0.48, and Limit Total
   4 dropped them under the arms. The seated bind turns the thighs, so it pulled the belly 0.05
   units back at z 0.48 and only 0.006 units at z 0.505. The chest then stood over the belly as a
   ledge: a pale flat panel with a hard corner in front of each upper arm in the seated play and
   rest (the right side in the hall view), and not in the stand. With the rows, the pull falls
   evenly from 0.10 units at z 0.32 to 0.008 units at z 0.47, and the belly is round under the
   chest. The belly now hangs a little over the thigh tops, with a shadow line in the lap in the
   front view.

**Smooth surface.** No relax and no region colors. The crease angle 180 gives each corner the mean
normal of the faces at its vertex, as the smooth shading of an FBX viewer.

**Mouth.** The snout disc stands far in front of the lips, so the body gives the height of its
mouth line (`mouthHeight` 0.75, a fact of the armature, design 4.4). On a cut of the bind head with
the middle plane, the front of the lower lip lies at y 0.745 and z 0.214, and the crease under the
disc at y 0.753. The mouth of the studio body is 6.1 cm behind the tip of the nose.

**Seat.** The thighs slope 25 degrees down and 15 degrees out in the bind, the shins are vertical,
and each foot turns 30 degrees about x with the heel up (`tools/rig/leg_turns.py <config> 25 15 0
30`), so that the hoof tips stay flat on the floor, as a pig stands on its hoof tips. The property
`seat` is {`prop` `chair`, `front` 0.0281, `back` -0.17, `halfWidth` 0.2}: the front lies 0.06
units behind the knee joint of the bind, and 39 % of the thigh lies on the seat (28 % with the
front 0.07 units behind the knee). With the front 0.05 units behind the knee, the round back of the
shin lay over the seat, and `pnpm rig-export` stopped. The seat height is 0.152 m (0.126 m with
flat feet), with the legs of the source: a heel angle of 15, 25, 30, 35, and 40 degrees gives
0.140, 0.148, 0.152, 0.154, and 0.156 m. The layout of the demos does not change with 30 or 32
degrees. With 34 degrees, 9 players of `boulanger-matin` move in the sight pass of the layout
(design 4.5), and with 40 degrees, 3 players of two demos move. The curly tail stays behind the
haunch, over the back edge of the seat.

**Lids.** A lid on each eye: 14 × 13 points from psi -50 to 40 degrees and lam from -75 to 80
degrees on the left (the mirror on the right), with the lower strip as the first row. Each row lies
at 1.2 ball radii, or 1.03 times the farthest eye point from the middle of the sphere fit of the
export, if that is farther (1.333 radii on the left), because the painted eye is no true sphere. 156
quads on each side, held turned up 105 degrees into the head. The property `lids` holds the angle
1.832596 and the hinge axes. The lid faces take the pink skin patch at UV (0.1673, 0.8346) at 0.15
UV for each unit, and the row `head` 1. The open lid lies at least 0.0064 units under the head
(ray casts). In the last two of the 21 steps of the blink, 5 to 6 points of the side edges and the
back edge of the closed left lid, and 5 of the right lid, lie just out of the head. With a larger
turn or a larger psi range, points of the open lid left the head.

**Arm twist.** The roll of each upper arm and the twist of each forearm, in degrees, in each moment
of `PIG_HORN` of `src/pose/winds.ts` (`pnpm pose-preview hornist`):

| Moment | Left upper arm | Left forearm | Right upper arm | Right forearm |
|---|---|---|---|---|
| note | 2.4 | 29.4 | -23.7 | -2.4 |
| rest | 28.2 | 15.3 | -40.5 | 28.9 |
| lift50 | 17.7 | 22.0 | -34.6 | 16.4 |
| lower50 | 14.3 | 23.9 | -32.4 | 12.0 |
| stand | 2.9 | 37.8 | -5.5 | -1.1 |

With the hooves and the elbow axes of the source, the upper arms rolled up to 112 and -115 degrees
and the forearms twisted up to -177 and 167 degrees. A hoof turn alone moves only the forearm
twist, and an elbow axis turn moves the twist from the upper arm to the forearm. The horn hold
points the right elbow out to the side, so that the hoof lies across the mouth of the bell
(`PIG_HORN`, design 5.3): with the right elbow axis at -90 degrees, the right upper arm then rolled
up to -60 degrees, and at -110 degrees it rolls at most -40.5 degrees. A turn of the right hoof by
whole ring steps did not keep the hoof out of the wall of the bell in the play: the hoof is about 6
cm thick, and at each step some part of it went 5 cm to 10 cm deep into the narrow throat.

The arm gate (`pnpm arm-check hornist --base 34d140d5c`) passes: folds p95 6 on the left and 5 on
the right (8 and 23 before the new hold), skin twist p95 16 on each upper arm, and 17 and 14 on the
forearms. The grip of the right arm takes the new median (`ACCEPTED_GRIPS`).

**Color map** (`tools/pig-maps.py`). The tool scales the source to 2048 pixels (Lanczos) and writes
WebP quality 60, method 6 (Pillow 13.0.0). No texel changes its color. The eyes keep the iris place
of the source: in the play view, the 3/4 views, and the far hall view from the default camera, the
gaze reads as a look ahead, and the face reads happy, so no iris moves.

**Normal map.** The same run writes `pig-normal.webp` from the normal map of the FBX, as for the
wolf: each x, y tilt limited to 0.2 (0.57 % of the texels), a box scale to 1024 pixels, the tilts
times 4 in red and green, 255 in blue, and `cwebp -q 60 -sharp_yuv -m 6` (libwebp 1.5.0).

**Differences from the source.** The app light is warm and comes from above, so the pink skin reads
lighter and warmer than in the even gray light of an FBX viewer, and the head casts a dark band of
shadow on the neck under the chin. The source paints no light in the eyes, so each eye shows one
small light of the eye light. The seated bind and the hold bend the arms and the legs.

The export of the file and the maps. License of each file: CC BY-NC 4.0, as the FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/pig.rig.glb` | 1,009,104 bytes | `4a126f44c43447143fd1d00a06a56928aba93f42ac17a0dfe6db000b84e2251a` |
| `tripo-hand/pig.rig.json` | 16,377 bytes | `41b63b08c5e4888a863c610fef115dd63fba82ca33a0db489a1bc06cb7a0013e` |
| `tripo-hand/pig-color.webp` | 54,072 bytes, 2048 × 2048 | `7e93b90c62901e98e717ea958be65306951c6bc7f8ea7ec50fa9f91cc97af295` |
| `tripo-hand/pig-normal.webp` | 16,518 bytes, 1024 × 1024 | `1f67a4b13f0fcdb7950acf73470ee5d796e7d0a8487acd0a78fa044198b7065b` |

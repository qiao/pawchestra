# Monkey model

This folder holds the source mesh of the monkey, a copy with rebuilt arms and its weights, and the
rigged copy. The app does not serve these files. It loads the module `src/models/studio/monkey.ts`,
which this chain writes:

```text
monkey.glb                               source mesh
   │  tools/blender/arm_rebuild.py       rebuilt arms and painted weights
   v
monkey-arms.glb + monkey-weights.json    `source` and `paintedWeights` of tools/mesh-rigs/monkey.json
   │  pnpm rig-mesh monkey
   v
monkey.rig.glb                           rigged mesh
   │  pnpm studio-body monkey
   v
src/models/studio/monkey.ts              studio body of the app
```

`docs/agents/rigging.md` gives the steps of the chain.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `monkey.glb` | Source mesh (below) | None |
| `monkey-arms.glb` | Copy of `monkey.glb` with rebuilt arms. License as `monkey.glb` | `arm_rebuild.py monkey --factor 1.2` |
| `monkey-weights.json` | Weights of the same Blender run. License as `monkey.glb` | `arm_rebuild.py monkey --factor 1.2` |
| `monkey.rig.glb` | Output of the rig. License as `monkey.glb` | `pnpm rig-mesh monkey` |

## monkey.glb

| Item | Value |
|---|---|
| Size | 16,090,928 bytes |
| SHA-256 | `9bc5c97007e30b23f7220eed227124c979bbce86b6d47eea1988d7ddfb91efc6` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,129 triangles and 5,211 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial`, double-sided, with a base color texture (10.4 MB) and a metallic-roughness texture (5.5 MB), each a PNG |

```bash
shasum -a 256 assets/models/monkey/monkey.glb
```

## Mesh facts

The values are in the units of the studio: 1 unit from the soles to the highest point, the soles
at y = 0, +z forward, and +x the left side of the animal. The mesh faces +z, with its left side at
+x. The weld is at 1e-5.

- The weld gives 1,568 vertices in one part. 6 edges are open and 3 edges have more than two
  faces. 229 faces have a corner angle below 10°.
- The box is x -0.283 to 0.283, y 0 to 1, and z -0.148 to 0.147. The monkey is 1.8988 units of
  the file high from the soles to the top of a small tuft of hair on the head. The skull top
  under the tuft is at about y 0.965.
- The monkey stands upright on short legs, with the crotch at y 0.215. The long arms hang down
  and out. They are apart from the body from x 0.09 out, with long dark brown hands and fingers
  down to y 0.27. The feet are dark brown too.
- The fur is brown, with a cream face, chest, and belly. The large dark eyes have white rims, at
  y 0.83 to 0.87 and z 0.10, with no shells.
- A small brown nose is at the front of the muzzle (z 0.147 at y 0.81). The texture has thin
  brown brows and a thin smile line.
- The round pink ears stand at the sides of the head, from x 0.12 to 0.17.
- The long thin tail leaves the back of the haunch at y 0.27 and goes down to the floor behind
  the right foot. It ends in a curl that stands up on the floor at x -0.25 to -0.13.

## monkey-arms.glb and monkey-weights.json

| Item | Value |
|---|---|
| `monkey-arms.glb` | 948,484 bytes, SHA-256 `d21a8eca1fa86ad5bf5387a9c3203c272b75b1aa3c232b77516ce906e588d3c1` |
| Mesh | 1,982 vertices after a weld at 1e-5, 3,957 triangles: on each arm a tube of 15 quad rings of 16 vertices from 0.2 of the upper arm to 0.1 of the paw, joined to the trunk and the paw with Bridge Edge Loops, with Beautify Faces and Collapse Edges on the bridge triangles |
| Material | One material with one base color JPEG: the atlas of the source, and a strip of 512 pixels on top with the fur color of the source arms, baked onto the new faces. No metallic-roughness texture |
| `monkey-weights.json` | 446,328 bytes, SHA-256 `7bfdeaac77e181bedbb3d96281ee02de8b7c41f0aa83b1c63d62da76059ce1d7` |
| Weights | The automatic weights of Blender with the weight rules of the script, on the studio bones and the arm segments and helpers (`armSegments` of the config), for `paintedWeights` of the config |

`tools/blender/arm_rebuild.py` puts new quad faces on each arm from the shoulder line to the wrist,
with the settings that it finds from the joints of the config and from rays through the mesh. The
new arm surface lies on the old one. The arms are 1.2 times longer from the shoulder line
(`--factor 1.2`), because a rig with arm segments does not stretch the arms. The faces of the
paws, the trunk, the legs, the tail, and the head are the faces of the source. A run gives the
same bytes:

```bash
blender -b --factory-startup -P tools/blender/arm_rebuild.py -- monkey --factor 1.2
shasum -a 256 assets/models/monkey/*.glb assets/models/monkey/monkey-weights.json
```

## monkey.rig.glb

| Item | Value |
|---|---|
| Size | 482,476 bytes |
| SHA-256 | `330c307b9c84f58ac51759c6e765c6b8e364bafe6faf70dad6adf19152e0c89d` |
| Bind | The role-neutral bind (design 4.4): the arms of the source, straight (`studio.straightArms` of the config), with the elbow axes of the bent trumpet bind (`studio.bindArms`), and the bind paws supinated so that the largest paw twist of the roles of the cast matrix is smallest (`studio.bindSupination`) |
| Shapes | The arm-down shape of each arm, and the straight legs of each side |

## Candidate hand rig

`tripo-hand/` holds a candidate body ("tripo-hand/monkey.blend" below): a hand rig of the Tripo P2
mesh `tripo-p2/monkey.fbx`, made by one build script in a headless Blender 5.2, by the route of the
Tripo wolf (`../wolf/README.md`, "Candidate hand rig"). The body keeps the form, the colors, and the
eyes of the source: no point edit changes the head, the face, the ears, the trunk, the hands, the
feet, the legs, or the tail. The arms keep the length of the source: no cut, no split from the
trunk, and no stretch. On the branch of the candidate, the `ANIMALS` entry of the monkey points to
`tripo-hand/monkey.rig.glb`. The files of the monkey of main above do not change.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/monkey.fbx`, `tripo-p2/monkey.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/monkey.blend` | Made from `tripo-p2/monkey.fbx` by the scripted edits below. License as the FBX file | The scripted edits below |
| `tripo-hand/monkey.rig.glb` | Export of `tripo-hand/monkey.blend`. License as the FBX file | `pnpm rig-export monkey --blend assets/models/monkey/tripo-hand/monkey.blend --out assets/models/monkey/tripo-hand/monkey.rig.glb` |
| `tripo-hand/monkey.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/monkey-color.webp`, `tripo-hand/monkey-normal.webp` | Web copies of the color map and the normal map of the FBX ("Color map" and "Normal map" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/monkey-maps.py` |

### tripo-p2/monkey.fbx

A cute brown macaque in a T-pose with quad faces, made with Tripo P2 from the sheet of the monkey
(`assets/images2/monkey.png` of the main checkout): a pink face, pink ears, hands, and feet, five
fingers on each hand, and a tail that curls up behind the back. Its arm tubes have 8 vertices
around.

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan, and given on 2026-11-11. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary. The maps lie beside the FBX file in the zip file |
| Contents | One mesh object, with no armature and no animation. 3,271 vertices and 3,583 faces: 2,923 quads and 660 triangles, no n-gon. One UV layer |
| Parts | 4 parts: the body with the tail (3,147 vertices), two eyeballs (49 vertices each, spheres of radius 0.0327 about (±0.041, 0.839, 0.197)), and a loose speck of 26 vertices that floats about 0.05 units behind the tail (z -0.269 to -0.288). 24 open edges, and no edge with more than two faces |
| Box | In the studio units (1 unit from the soles to the top of the tuft): x ±0.431 (the finger tips), z -0.288 (the speck) to 0.288 (the muzzle). The monkey faces -y in Blender, with its left side at +x, so the import needs no turn |

The folder `monkey.fbm/` keeps two maps of the zip file under new names, as bytes. The roughness and
the metallic maps are not kept.

| File | Name in the zip file | Size | Pixels | SHA-256 |
|---|---|---|---|---|
| `monkey.fbx` | `tripo_convert_7dce9a2e-4a8e-4905-bc20-15db7b214dcb.fbx` | 226,572 bytes | | `bec39b50697ca7c38f61c4d7a9b2ea0f58cb154cc97e94cad2eaaa40c2a92582` |
| `monkey.fbm/monkey_basecolor.jpg` | `tripo_rgb_1c53751f-7c27-4c66-b612-22fe4a6bcad4.jpg` | 3,135,319 bytes | 4096 × 4096 | `47aca241ba57952feb0cb8ef7948bb2b9d93aabdaa15654424d1ce98b0772868` |
| `monkey.fbm/monkey_normal.jpg` | `tripo_normal_fedfa8b1-bbc3-41d8-936d-2202ec96348e.jpg` | 1,732,799 bytes | 4096 × 4096 | `fc638bfc751a68e0ded6a56c6f3a73cf9233a63d3d553860887ea1be90de4281` |

The color map paints brown fur, a cream chest and belly, a pink face with a small pink nose and a
smile line, pink ears, hands, and feet, and on each eyeball a full eye: a brown iris, a black
pupil, white, a dark rim, and a white light.

### tripo-hand/monkey.blend

The candidate hand rig (design 4.4, "Hand rig"). The scripts of the session (`scratch/monkey/` of
the worktree, which git ignores: `build.py`, `make_config.py`, `base-config.json`, `params.json`,
and `chain-here.sh`) are not in the repo. They are the scripts of the Tripo wolf with the changes
below. `make_config.py` writes `tools/mesh-rigs/simple/monkey-tripo.json`: the joints of the source.

| Item | Value |
|---|---|
| Size | 399,190 bytes |
| SHA-256 | `d46510b2ee4acab35a9d89d223bd80cff1a269d3ee947d15bd17e504ffd43f50` |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the top of the tuft, the soles at z = 0, the monkey faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `monkey`: 3,721 vertices and 3,983 faces (3,323 quads and 660 triangles, 7,306 triangles), flat faces, and the surface of `sa.add_surface()`. 20 faces are gloss (the nose). The 96 faces of the two eyeballs have the face attribute `eye`, and the 312 faces of the two lids the face attribute `lid`. The UV map of the FBX, and the property `texture` (`assets/models/monkey/tripo-hand/monkey-color.webp`) |
| Armature | `monkey_rig`: the 30 body bones, `tail_tip`, and the 20 arm segments and helpers, at the joints of the config. The Action `bind` holds the bind with no bind supination. The properties `palm`, `hinges`, `seat`, and `lids` come from the steps below |
| Facts | `height` 0.714598 (the shoulder joints at 1.130693 m for each unit, so that H is 0.333629 m, the H of the monkey of main), `crease` 180 |
| Eyes | The eyeballs of the mesh, with the finish `varnish` and no eye light (`eyeFinish` of the entry), and a blink lid on each. No eye objects, so the app adds no bead eyes |

The edits, in the order of the build (`sa` is `tools/blender/studio_armature.py`, x is the x of the
left side):

- **Import.** `sa.import_source('assets/models/monkey/tripo-p2/monkey.fbx', 1e-5)`. No vertex
  merges, and each face is flat.
- **Speck.** The loose part of 26 vertices behind the tail goes (each loose part of fewer than 30
  vertices). The eyeballs stay.
- **Arm rings.** Edge ring Subdivide (`bmesh.ops.subdivide_edges(bm, edges=<ring>, cuts=1,
  use_grid_fill=True)`) of the clean quad bands of 8 edges between the closed arm loops at x 0.165,
  0.185, 0.199, 0.213, 0.234, 0.261, 0.285, and 0.305: 1 cut on each band. The elbow and the
  forearm then have a ring about each 0.3 arm radii.
- **No knee rings.** The leg loops stop at poles, so no leg band is a clean quad ring. Exact knee
  rows ("Weights" below) take their place.
- **Hands turned.** Each vertex past the arm ring at x 0.295 turns rigidly about the rest forearm
  axis by whole ring steps of 45 degrees: -135 degrees on the left (3 steps) and 90 degrees on the
  right (2 steps), 309 and 310 vertices. New quads join the two rings with the step offset, and the
  far ring takes the form of the ring before the turn (a fade to 0 at 0.02 units). The hands and
  the fingers keep their form ("Arm twist").
- **Point edits.** None.
- **Surface.** `sa.add_surface(monkey, 'monkey', <base color>, eye_fans=False,
  config=<monkey-tripo.json>)`. The 20 gloss faces are the pink nose in the nose box of the config.
- **Eyes.** The faces of the two eyeballs (the loose parts of 30 to 99 vertices in the eye box)
  take the face attribute `eye`, and keep the color map.
- **Armature.** The joints of the config: the shoulder at x 0.10, the elbow at x 0.205, the wrist
  at x 0.31, the knuckles at x 0.375, where the fingers part, the hip at (0.09, 0.30, 0.06), the
  knee at (0.094, 0.17, 0.055), and the ankle at (0.095, 0.055, 0.04). The palm is the true palm of
  the source, the mean normal of the hand faces that face down, (-0.066, -0.998, 0), turned by the
  hand turn. The bind arms (`bindArms`), the leg turns (the thigh 65 degrees down and 15 degrees
  out, the shin 20 degrees back), and the forward lean of the trunk (`open` -14) are those of the
  monkey of main. The tail bones keep the directions of the source in the bind.

The weights, in the rest pose:

1. Automatic Weights, then Limit Total 4 and Normalize All, on a copy of the mesh with no tail and
   no eyeball.
2. Arm rows: each vertex of a side with |x| from 0.10, within 0.07 units of the line of the rest
   arm (0.11 units past the wrist, so that the thumb is in), takes one exact row
   (`sa.set_weight_row()`): a clavicle share from 0.4 at x 0.10 to 0 at x 0.14, an elbow helper
   share of 0.25, 0.75, 0.75, and 0.25 at x 0.185, 0.199, 0.213, and 0.227, and the rest on the 4
   roll segments.
3. Wrist rows: the bend share of the hand grows in 12 equal steps of 0.004 from 0.04 units before
   the head of `hand_<side>`. Knuckle rows: the fingers share grows in 12 equal steps of 0.0035
   from 0.02 units before the head of `fingers_<side>`. The four fingers follow `fingers_<side>`,
   and the thumb, which starts near the wrist, follows the hand. The rig has no digit bones,
   because the trumpet hold poses no single finger.
4. Knee rows: each leg vertex within 0.07 units of the knee joint along the line from the hip to
   the ankle, and within 0.08 units of that line, keeps the sum t of its thigh and shin shares and
   splits it as thigh t (1 - k) and shin t k, with k = smoothstep(-0.04, 0.04) of the place past the
   knee joint.
5. The eyeballs and the gloss nose take {`head` 1}. The tail (the vertices that a flood from its
   lowest point reaches through z below -0.07, and through z below -0.04 above y 0.42 for the end
   of the curl) takes {`hips` 1 - a, `tail` a}, with a = smoothstep(0, 0.03) of the length of the
   shortest edge path from the root of the tail. `tail_tip` takes no share: with a share by the
   place along that bone, the curl bent in the bind.

**Smooth surface.** No relax and no region colors. The crease angle 180 gives each corner the mean
normal of the faces at its vertex, as the smooth shading of an FBX viewer.

**Stance.** The monkey has no chair (`noChair` of `src/models/species.ts`). The property `seat` is
{`prop` `chair`, `front` 0, `back` -0.07, `halfWidth` 0.15}: a seat under the back of the haunch,
which only sets the seat height of the export. The seat height is 0.305 m (0.292 m on the monkey of
main), so the soles stay on the floor in the app. The legs keep the length of the source. The feet
stand under the hips, and the trunk leans forward, so the center of mass stays over the soles.

**Lids.** A lid on each eye: 14 × 13 points from psi -55 to 45 degrees and lam from -50 to 62
degrees on the left (the mirror on the right), with the lower strip as the first row, at 1.17 ball
radii. 156 quads on each side, held turned up 126 degrees into the head. The property `lids` holds
the angle 2.199115 and the hinge axes. The lid faces take the pink skin patch at UV (0.868, 0.352)
at 0.25 UV for each unit, and the row `head` 1. In the 21 steps of the blink no open lid point,
side edge, or back edge leaves the head (ray casts), and the open lid lies at least 0.0265 units
under it.

**Arm twist.** The roll of each upper arm and the twist of each forearm, in degrees, in each moment
of `MONKEY_TRUMPET` of `src/pose/winds.ts` (`pnpm pose-preview trumpeter`):

| Moment | Left upper arm | Left forearm | Right upper arm | Right forearm |
|---|---|---|---|---|
| note | 24.2 | 15.3 | -25.7 | -16.5 |
| rest | 30.9 | 4.6 | -19.6 | 21.6 |
| lift50 | 28.1 | 11.9 | -21.2 | 5.6 |
| lower50 | 27.1 | 13.7 | -21.9 | 0.3 |
| stand | 20.9 | 22.4 | -24.8 | -22.2 |

With the hands of the source, the forearms twisted -130 and 112 degrees at rest. The hold keeps the
constants of the trumpet hold of the monkey of main. The right hand closes under the valves, the
left hand on the lead pipe, and the mouthpiece meets the lips under the nose.

**Color map** (`tools/monkey-maps.py`). The tool scales the source to 2048 pixels (Lanczos) and
writes WebP quality 60, method 6 (Pillow 13.0.0). No texel changes its color. The eyes keep the
iris place of the source. In the play view and the far hall view the gaze reads as a look ahead, so
no iris moves.

**Normal map.** The same run writes `monkey-normal.webp` from the normal map of the FBX, as for the
wolf: each x, y tilt limited to 0.2 (2.13 % of the texels), a box scale to 1024 pixels, the tilts
times 4 in red and green, 255 in blue, and `cwebp -q 60 -sharp_yuv -m 6` (libwebp 1.5.0).

**Differences from the source.** The app light is warm and comes from above, so the brown fur reads
lighter and more orange than in the even gray light of an FBX viewer. The eye whites read smaller,
and the pupils larger and darker, than in the FBX viewer. The nose is a gloss face group with flat
normals. The source has small notches at the back of the knees and under the haunch, which the app
light shows as dark marks. The arm tubes have 8 vertices around, so the arm outline shows corners.

The export of the file and the maps. License of each file: CC BY-NC 4.0, as the FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/monkey.rig.glb` | 1,240,632 bytes | `0cdd51a978ac07ec82e5ac3b38f201e9e2b0246cd3122d3e8bf1925b359d5e12` |
| `tripo-hand/monkey.rig.json` | 16,677 bytes | `61a5043c321e975629a28f9b61e17587b7f7823dd02bea6e56a7f5985878d197` |
| `tripo-hand/monkey-color.webp` | 178,300 bytes, 2048 × 2048 | `5b9920243e479862e07e602f19b82b5eebdfe1f1ddd6d019c524f619cb34d117` |
| `tripo-hand/monkey-normal.webp` | 111,326 bytes, 1024 × 1024 | `e81b285a48619d696b4ae23557ee2d203934d8a2be29739b2a7cfd2c88f83dca` |

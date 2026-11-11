# Wolf model

This folder holds the source mesh of the wolf of main, a copy with rebuilt arms and its weights, and
the rigged copy. The app does not serve these files. It loads the module `src/models/studio/wolf.ts`,
which this chain wrote before the candidate hand rig ("Candidate hand rig" below) took its place:

```text
wolf.glb                               source mesh
   │  tools/blender/wind_arms.py wolf  rebuilt arms and painted weights
   v
wolf-arms.glb + wolf-weights.json      `source` and `paintedWeights` of tools/mesh-rigs/wolf.json
   │  pnpm rig-mesh wolf
   v
wolf.rig.glb                           rigged mesh
   │  pnpm studio-body wolf
   v
src/models/studio/wolf.ts              studio body of the app
```

`docs/agents/rigging.md` gives the steps of the chain.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `wolf.glb` | Source mesh (below) | None |
| `wolf-arms.glb` | Copy of `wolf.glb` with rebuilt arms. License as `wolf.glb` | `wind_arms.py wolf` |
| `wolf-weights.json` | Weights of the same Blender run. License as `wolf.glb` | `wind_arms.py wolf` |
| `wolf.rig.glb` | Output of the rig. License as `wolf.glb` | `pnpm rig-mesh wolf` |

## wolf.glb

| Item | Value |
|---|---|
| Size | 18,480,832 bytes |
| SHA-256 | `d0895416708754880201946d20240202757d5dd7ea45b29a34dcc697f6741aa6` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,119 triangles and 6,162 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial`, double-sided, with a base color texture (13.2 MB) and a metallic-roughness texture (5.1 MB), each a PNG |

The values below are in the units of the studio: 1 unit from the soles to the tips of the ears,
the soles at y = 0, +z forward, and +x the left side of the animal. The mesh faces +z. The weld is
at 1e-5.

- The weld gives 1,563 vertices in one part. 6 edges are open and 3 edges have more than two
  faces. 352 faces have a corner angle below 10°.
- The box is x -0.231 to 0.230, y 0 to 1, and z -0.200 to 0.197. The wolf is 1.9012 units of the
  file high from the soles to the tips of the ears. The top of the skull is at y 0.946.
- The wolf stands upright on long legs, with the crotch at y 0.30 and dark lower legs and feet.
  The arms hang down, out, and forward. They are apart from the body from x 0.085 out, with the
  dark paws at y 0.38 to 0.45.
- The black nose is at z 0.197 and y 0.817. The eyes are at y 0.85 to 0.86 and z 0.12, with no
  shells. The bushy tail hangs from y 0.40 down to its tip at y 0.081 and z -0.18.

## wolf-arms.glb and wolf-weights.json

| Item | Value |
|---|---|
| `wolf-arms.glb` | 1,324,948 bytes, SHA-256 `1745e2cecd3ab6b0bdfde6d7fb5c5c45bab5b8abc62933fb22c5a5472b6097d7` |
| Mesh | 1,984 vertices after a weld at 1e-5, 3,961 triangles: on each arm a tube of quad rings of 16 vertices, joined to the trunk and the paw with Bridge Edge Loops, with Beautify Faces and Collapse Edges on the bridge triangles |
| Material | One material with one base color JPEG: the atlas of the source, and a strip of 512 pixels on top with the fur color of the source arms, baked onto the new faces. No metallic-roughness texture |
| `wolf-weights.json` | 447,401 bytes, SHA-256 `132b64a348e23d46101924a63bdedb03405ea9ef3b38c4555d4adcc8aba87f8e` |
| Weights | The automatic weights of Blender with the Weight Paint fixes of the script, on the studio bones and the arm segments and helpers (`armSegments` of the config), for `paintedWeights` of the config |

The script puts new quad faces on each arm from the shoulder line to the wrist. The new arm
surface lies on the old one. The arms are 1.178 times longer from the shoulder line, because a rig
with arm segments does not stretch the arms. The faces of the paws, the trunk, the legs, and the
head are the faces of the source. Only the short edges of the thin faces at the cut loops
collapse. The points of the weights file are in the units of the scaled source (`proportions` and
`soften` of the config). A run gives the same bytes:

```bash
blender -b --factory-startup -P tools/blender/wind_arms.py -- wolf
shasum -a 256 assets/models/wolf/*.glb assets/models/wolf/wolf-weights.json
```

## wolf.rig.glb

| Item | Value |
|---|---|
| Size | 729,332 bytes |
| SHA-256 | `a9cd380d98bd0134c74066c54e8f00bb5b02210aa095e39c490182d4d56facb0` |
| Bind | The role-neutral bind (design 4.4): the arms of the source, straight (`studio.straightArms` of the config), with the elbow axes of a forward bend (`studio.bindArms`), and the bind paws supinated so that the largest paw twist of the roles of the cast matrix is smallest (`studio.bindSupination`) |
| Shapes | The arm-down shape of each arm, and the straight legs of each side |

## Candidate hand rig

`tripo-hand/` holds a candidate body ("tripo-hand/wolf.blend" below): a hand rig of the Tripo P2
mesh `tripo-p2/wolf.fbx`, made by one build script in a headless Blender 5.2. The body keeps the form,
the colors, and the eye paint of the source: no point edit changes the head, the trunk, the paws, the
legs, or the tail. The arms keep the length of the source: no cut, no split from the trunk, and no
stretch. On the branch of the candidate, the `ANIMALS` entry of the wolf points to
`tripo-hand/wolf.rig.glb`. The files of the wolf of main above do not change.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/wolf.fbx`, `tripo-p2/wolf.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/wolf.blend` | Made from `tripo-p2/wolf.fbx` by the scripted edits below. License as the FBX file | The scripted edits below |
| `tripo-hand/wolf.rig.glb` | Export of `tripo-hand/wolf.blend`. License as the FBX file | `pnpm rig-export wolf --blend assets/models/wolf/tripo-hand/wolf.blend --out assets/models/wolf/tripo-hand/wolf.rig.glb` |
| `tripo-hand/wolf.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/wolf-color.webp`, `tripo-hand/wolf-normal.webp` | Web copies of the color map and the normal map of the FBX ("Color map" and "Normal map" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/wolf-maps.py` |

### tripo-p2/wolf.fbx

A friendly gray wolf in a T-pose with quad faces, made with Tripo P2 from the sheet of the wolf
(`assets/images2/wolf2.png` of the main checkout). Its arm tubes and its leg tubes have 11 vertices
around.

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan, and given on 2026-11-10. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary. The maps lie beside the FBX file in the zip file |
| Contents | One mesh object, with no armature and no animation. 3,074 vertices and 3,524 faces: 2,582 quads and 942 triangles, no n-gon. One UV layer |
| Parts | 3 parts: the body (2,905 vertices), the tail (145 vertices, open at its root inside the haunch), and an open tube of 24 vertices inside the belly (x ±0.04, y 0.33 to 0.46), which no view shows. No eyeball: the map paints each eye on faces of the head. 36 open edges, and no edge with more than two faces |
| Box | In the studio units (1 unit from the soles to the ear tips): x ±0.409 (the paw tips), z -0.241 (the tail) to 0.241 (the nose). The wolf faces -y in Blender, with its left side at +x, so the import needs no turn |

The folder `wolf.fbm/` keeps two maps of the zip file under new names, as bytes. The roughness and
the metallic maps are not kept.

| File | Name in the zip file | Size | Pixels | SHA-256 |
|---|---|---|---|---|
| `wolf.fbx` | `tripo_convert_39b8a8d2-8a35-4b3f-b56b-ea0ebdb3ab3e.fbx` | 213,756 bytes | | `a4de972c85ea9063d80d165b57fe4705287a8c83f0b087ea81dacba90b6b5570` |
| `wolf.fbm/wolf_basecolor.jpg` | `tripo_rgb_54074081-1f8c-413b-8634-65df171d385a.jpg` | 3,244,427 bytes | 4096 × 4096 | `bc9e3a915c104977d15f351696717724d24abf6f1a4c93c651ea8bf96feec458` |
| `wolf.fbm/wolf_normal.jpg` | `tripo_normal_1ba41bf5-82ae-48f7-a64b-d496a2484ff8.jpg` | 1,901,581 bytes | 4096 × 4096 | `4ae853e5acbc74d6794cecd0e546caff9a7a6d211a1572f4abe5e723b82abf68` |

The color map paints a gray wolf with a cream chest, cheeks, muzzle, and tail tip, soft gray brows,
a black nose, a thin smile line, and on each eye an orange brown iris at the inner corner, a black
pupil, white, a dark lash line, and a white light.

### tripo-hand/wolf.blend

The candidate hand rig (design 4.4, "Hand rig"). The scripts of the session (`scratch/wolf/` of the
worktree, which git ignores: `build.py`, `redits.py`, `rings.py`, `make_config.py`, `eyemask.py`, `eyesel.py`,
`params.json`, and `chain-here.sh`) are not in the repo. They follow the scripts of the Tripo fox
(`../fox/README.md`). `make_config.py` writes `tools/mesh-rigs/simple/wolf-tripo.json`: the joints
of the source.

| Item | Value |
|---|---|
| Size | 395,747 bytes |
| SHA-256 | `96a93e5eb3b115cb84117a4e05f25bddec7903985e927759c4fa7ffcc3ef89f0` |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the ear tips, the soles at z = 0, the wolf faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `wolf`: 3,656 vertices and 4,066 faces (3,124 quads and 942 triangles, 7,190 triangles), flat faces, and the surface of `sa.add_surface()`. No face is gloss: the 82 faces of the nose take the slot `fur` and the color map, with the smooth normals of the fur ("Nose"). The 48 faces of the two painted eyes have the face attribute `eye`, and the 312 faces of the two lids the face attribute `lid`. The UV map of the FBX, and the property `texture` (`assets/models/wolf/tripo-hand/wolf-color.webp`) |
| Armature | `wolf_rig`: the 30 body bones, `tail_tip`, and the 20 arm segments and helpers, at the joints of the config. The Action `bind` holds the seated bind with no bind supination. The properties `palm`, `hinges`, `seat`, and `lids` come from the steps below |
| Facts | `height` 1.121345 (the shoulder joints at 1.77428 m for each unit, so that H is 0.369244 m, the H of the wolf of main), `crease` 180 |
| Eyes | The painted eye faces of the mesh, with the finish `varnish` and no eye light (`eyeFinish` of the entry), and a blink lid on each. No eye objects, so the app adds no bead eyes |

The edits, in the order of the build (`sa` is `tools/blender/studio_armature.py`, x is the x of the
left side):

- **Import.** `sa.import_source('assets/models/wolf/tripo-p2/wolf.fbx', 1e-5)`. No vertex merges,
  and each face is flat.
- **Inner tube.** The loose part of 24 vertices inside the belly goes. No view shows it.
- **Arm rings.** Edge ring Subdivide (`bmesh.ops.subdivide_edges(bm, edges=<ring>, cuts=<n>,
  use_grid_fill=True)`) of the clean quad bands of 11 edges between the closed arm loops at x 0.124,
  0.150, 0.178, 0.208, 0.238, 0.267, and 0.290: 1 cut on each band, and 2 cuts on the two bands at
  the elbow (x 0.178 to 0.238). A ring then stands about each 0.3 arm radii.
- **Knee rings.** The same call with 1 cut on the leg bands of 11 edges at y 0.135 to 0.150, 0.150
  to 0.172, and 0.172 to 0.1975. The knee joint is at y 0.165.
- **Rings with no split.** The arm root to x 0.124 and the paw from x 0.290 stop at triangles or
  poles.
- **Paws turned.** Each vertex past the arm ring at x 0.2786 turns rigidly about the rest forearm
  axis by whole ring steps of 360/11 degrees: -65.5 degrees on the left (2 steps) and 65.5 degrees
  on the right, 362 and 363 vertices. New quads join the two rings with the step offset, and the
  far ring takes the form of the ring before the turn (a fade to 0 at 0.02 units). The new quads
  keep the UVs of the old band. The paws keep their form ("Arm twist").
- **Point edits.** None. The head, the eyes, the muzzle, the trunk, the paws, the legs, and the tail
  keep the form of the source.
- **Surface.** `sa.add_surface(wolf, 'wolf', <base color>, eye_fans=False,
  config=<wolf-tripo.json>)`. The gloss nose is the dark nose in the nose box of the config.
- **Eyes.** The 48 head faces with at least half of their pixels in the eye paint of the front
  view of the source (the dark lash line, the pupil, the orange iris, and the white, closed and
  filled) take the face attribute `eye`. Each eye is about 0.035 units wide, and a sphere fits its
  vertices within 0.0045 units (radius 0.026 on the left, 0.030 on the right).
- **Armature.** The joints of the config: the shoulder at x 0.10, the elbow at x 0.20, the wrist at
  x 0.30, the knuckles at x 0.355, the hip at (0.067, 0.29, 0.055), and the knee at (0.067, 0.165,
  0.022). The palm is the true palm of the source, the mean normal of the paw faces that face down,
  (0.107, -0.994, 0.016), turned by the paw turn. The bind arms (`bindArms`), the trunk (`open` 1),
  and the tail bind are those of the wolf of main.

The weights, in the rest pose:

1. Automatic Weights, then Limit Total 4 and Normalize All, on a copy of the mesh with no tail.
2. Arm rows: each vertex of a side with |x| from 0.10, within 0.07 units of the line of the rest
   arm, takes one exact row (`sa.set_weight_row()`): a clavicle share from 0.4 at x 0.10 to 0 at x
   0.14, an elbow helper share of 0.25, 0.75, 0.75, and 0.25 at x 0.178, 0.193, 0.208, and 0.223,
   and the rest on the 4 roll segments.
3. Wrist rows: the bend share of the paw grows in 12 equal steps of 0.004 from 0.04 units before
   the head of `hand_<side>`. Knuckle rows: the fingers share grows in 12 equal steps of 0.0035 from
   0.02 units before the head of `fingers_<side>`.
4. The eye faces and the gloss nose take {`head` 1}. The tail takes {`hips` 1 - a, `tail` a (1 - c),
   `tail_tip` a c}, with a = smoothstep(-0.01, 0.03) along `tail` and c = smoothstep(-0.04, 0.04)
   along `tail_tip`.

**Smooth surface.** No relax and no region colors: the form stays the form of the source. The crease
angle 180 gives each corner the mean normal of the faces at its vertex, as the smooth shading of an
FBX viewer.

**Nose.** At the end of the build, the 82 gloss faces of the dark nose go to the slot `fur`
(`noseFur` of the params). Thus the nose takes the color map, with its painted nostrils, and the
smooth normals of the fur. As flat gloss faces in one color, the nose showed facets and no nostrils.
The weights do not change: the nose vertices keep the row {`head` 1}. The armature property
`headShift` (0, 0, -0.006106139) moves the head center of the holds back to the head center of the
gloss nose, because the head box of `pnpm studio-body` now holds the nose. Thus no hold moves. The
nose keeps the colors of the source map. In the hall light it reads as the nose of the FBX file, so
the map tool does not change it.

**Seat.** The thighs slope 25 degrees down and 15 degrees out in the bind, and the shins are vertical,
as on the wolf of main. The property `seat` is {`prop` `chair`, `front` 0.1186, `back` -0.08,
`halfWidth` 0.15}: the front lies 0.05 units behind the knee joint of the bind, and 56 % of the
thigh lies on the seat. The seat height is 0.276 m (0.288 m on the wolf of main), with the legs of
the source. The tail goes back over the back edge of the seat and hangs down behind it.

**Lids.** A lid on each eye: 14 × 13 points from psi -55 to 45 degrees and lam from -50 to 62
degrees on the left (the mirror on the right), with the lower strip as the first row. Each row lies at 1.17 ball radii,
or 1.03 times the farthest eye point from the middle of the sphere fit of the export, if that is
farther (1.209 radii on the left, 1.17 on the right), because the painted eye is no true sphere. 156
quads on each side, held turned up 126 degrees into the head. The property `lids` holds the angle
2.199115 and the hinge axes. The lid faces take the cream fur patch at UV (0.4189, 0.2041) at 0.84 UV
for each unit, and the row `head` 1. In the 21 steps of the blink no open lid point, side edge, or
back edge leaves the head (ray casts), and the open lid lies at least 0.0236 units under it.

**Arm twist.** The roll of each upper arm and the twist of each forearm, in degrees, in each moment
of `WOLF_CLARINET` of `src/pose/winds.ts` (`pnpm pose-preview clarinetist`):

| Moment | Left upper arm | Left forearm | Right upper arm | Right forearm |
|---|---|---|---|---|
| note | -26.2 | 29.6 | 30.1 | -27.1 |
| rest | 41.8 | -7.9 | -35.7 | 22.6 |
| lift50 | 21.1 | 1.3 | -9.0 | 0.9 |
| lower50 | 11.2 | 6.7 | -1.0 | -4.8 |
| stand | -26.3 | 29.2 | 30.3 | -26.8 |

With the paws of the source, the forearms twisted -73 and 88 degrees at rest. Each paw closes on the
clarinet, and the mouthpiece meets the lips under the muzzle.

**Color map** (`tools/wolf-maps.py`). The tool scales the source to 2048 pixels (Lanczos) and writes
WebP quality 60, method 6 (Pillow 13.0.0). No texel changes its color: the fur, the brows, and the
eye paint stay. The eyes keep the iris place of the source. In the play view of the app the gaze
reads as a look at the viewer, so no iris moves.

**Normal map.** The same run writes `wolf-normal.webp` from the normal map of the FBX: each x, y
tilt limited to 0.2 (5.15 % of the texels), a box scale to 1024 pixels, the tilts times 4 in red and
green, 255 in blue, and `cwebp -q 60 -sharp_yuv -m 6` (libwebp 1.5.0).

**Differences from the source.** The app light is warm and comes from above, so the gray fur reads
lighter and warmer than in the even gray light of an FBX viewer, and the chin shades darker. The
source has no eyeball, so the eyes take the finish of the eye faces and blink with lids.

The export of the file and the maps. License of each file: CC BY-NC 4.0, as the FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/wolf.rig.glb` | 1,308,872 bytes | `4e4bcb50d667662db0e2090865878269aaa8e95fd23e6fbbe6c18e8c8ca4c278` |
| `tripo-hand/wolf.rig.json` | 15,687 bytes | `8722bf07140b1e6590610882507ccd8f652ebd0e490d0c9981056a18cf91b97a` |
| `tripo-hand/wolf-color.webp` | 205,090 bytes, 2048 × 2048 | `eef1e480bcb8dd099b54c0793699999fa8ae82a835f7291e0284c6d538f67b83` |
| `tripo-hand/wolf-normal.webp` | 121,396 bytes, 1024 × 1024 | `64f71fe8916ac5600d15d9c70caba053f3cfab412a892cc505796f5f14f6dc1d` |

# Penguin model

This folder holds the Tripo P2 source mesh of the penguin (`tripo-p2/`) and its hand rig
(`tripo-hand/`). The app does not serve these files. It loads the module
`src/models/studio/penguin.ts`, which this chain writes:

```text
tripo-p2/penguin.fbx             source mesh with quad faces
   │  pnpm hand-chain penguin    chain tools/blender/hand/penguin/
   v
tripo-hand/penguin.blend         hand rig (design 4.4, "Hand rig")
   │  pnpm rig-export penguin    the same run
   v
tripo-hand/penguin.rig.glb       rigged mesh, with its summary penguin.rig.json
   │  pnpm studio-body penguin   the same run
   v
src/models/studio/penguin.ts     studio body of the app
```

`tools/blender/hand/README.md` gives the steps of the chain. The section "Tripo hand rig" below
gives the files, their sources, their licenses, and their checksums.

The files of the older body of the route of `pnpm rig-mesh` are removed. Commit `cbc8db5e4` has
these files and the sections of this file about them.

## Tripo hand rig

`tripo-hand/` holds the body of the singer: a hand rig of the Tripo P2 mesh `tripo-p2/penguin.fbx`,
made by one build script in a headless Blender 5.2, by the route of the Tripo wolf
(`../wolf/README.md`, "Tripo hand rig") and the Tripo monkey (`../monkey/README.md`). The body keeps
the form, the colors, and the eyes of the source: no point edit changes the head, the face, the
trunk, the flippers, the legs, the feet, or the tail. The flippers keep the length of the source: no
cut, no split from the trunk, and no stretch. The `ANIMALS` entry of the penguin
(`tools/studio-body.ts`) points to `tripo-hand/penguin.rig.glb`. The files of the earlier penguin
above do not change.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/penguin.fbx`, `tripo-p2/penguin.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/penguin.blend` | Made from `tripo-p2/penguin.fbx` by the scripted edits below. License as the FBX file | `pnpm hand-chain penguin` |
| `tripo-hand/penguin.rig.glb` | Export of `tripo-hand/penguin.blend`. License as the FBX file | `pnpm rig-export penguin --blend assets/models/penguin/tripo-hand/penguin.blend --out assets/models/penguin/tripo-hand/penguin.rig.glb` |
| `tripo-hand/penguin.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/penguin-color.webp`, `tripo-hand/penguin-normal.webp` | Web copies of the color map and the normal map of the FBX ("Color map" and "Normal map" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/tripo-maps.py penguin` |

### tripo-p2/penguin.fbx

A fluffy Adelie penguin with quad faces, made with Tripo P2 from the sheet of the penguin
(`assets/images2/penguin.png` of the main checkout): a black back and head, a white front, white
undersides of the flippers, a black beak with an orange line along the mouth, dark feet, and
pointed tail feathers. The flippers stand out from the sides, a little down, as flat blades. Their
tubes have 16 vertices around.

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan, and given on 2026-11-12. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary. The maps lie beside the FBX file in the zip file |
| Contents | One mesh object, with no armature and no animation. 3,161 vertices and 3,378 faces: 2,854 quads and 524 triangles, no n-gon. One UV layer |
| Parts | 3 parts: the body (3,039 vertices) and two eyeballs (61 vertices each, spheres of radius 0.021 about (±0.052, 0.923, 0.035)). 118 open edges in 18 loops (the 2 eye sockets, the open backs of the 2 eyeballs, 12 small holes of the feet, and 2 holes at the root of the tail), and no edge with more than two faces |
| Box | In the studio units (1 unit from the soles to the crown): x ±0.470 (the flipper tips), z -0.242 (the tail tip) to 0.242 (the beak tip). The penguin faces -y in Blender, with its left side at +x, so the import needs no turn |

The folder `penguin.fbm/` keeps two maps of the zip file under new names, as bytes. The roughness
and the metallic maps are not kept.

| File | Name in the zip file | Size | Pixels | SHA-256 |
|---|---|---|---|---|
| `penguin.fbx` | `tripo_convert_8fbf53d2-d0a2-427f-b9ef-173593ce5c89.fbx` | 210,220 bytes | | `1026384db27e3725e10f645816bbcd6892c37dd1c7926b83664f0a981e347848` |
| `penguin.fbm/penguin_basecolor.jpg` | `tripo_rgb_b77a28f4-1e96-4a84-890e-21ad3421de81.jpg` | 2,957,967 bytes | 4096 × 4096 | `7ec6d824bb27eefeefb92acc340585e363f714963dcbbbb79c2984e06605c8c0` |
| `penguin.fbm/penguin_normal.jpg` | `tripo_normal_c09c2ac3-4fd0-49cd-9bee-3fdd1f2604b3.jpg` | 954,394 bytes | 4096 × 4096 | `4cdd022ff2bba42f051708d271d39db86d703f7d1d4e62684b83df3ab29dfc40` |

The color map paints the black and white feathers, the orange mouth line, and on each eyeball a
full eye: a black pupil, a brown iris, a white crescent at the back of the iris, and a painted
light.

### tripo-hand/penguin.blend

The hand rig (design 4.4, "Hand rig"). The chain of the body is in `tools/blender/hand/penguin/`
(`build.py`, `make_config.py`, `params.json`, `base-config.json`, `redits.py`, `rimport.py`,
`rings.py`), and `pnpm hand-chain penguin` runs it (`tools/blender/hand/README.md`). Its scripts are
those of the Tripo monkey with the changes below. `make_config.py` writes
`tools/mesh-rigs/simple/penguin-tripo.json`: the joints of the source.

| Item | Value |
|---|---|
| Size | 385,596 bytes |
| SHA-256 | `4e35b622b0d08e4dda7ca8fc16da63cdc62b8cd46c5d42b6a86b697e9faf7e67` |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the crown, the soles at z = 0, the penguin faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `penguin`: 3,616 faces after the rings, the beak split, and the lids, flat faces, and the surface of `sa.add_surface()`. No face is gloss: the 68 faces at the beak tip take the slot `fur` and the color map ("Nose"). The 120 faces of the two eyeballs have the face attribute `eye`, and the lid faces the face attribute `lid`. The UV map of the FBX, and the property `texture` (`assets/models/penguin/tripo-hand/penguin-color.webp`) |
| Armature | `penguin_rig`: the 30 body bones, `tail_tip`, `jaw`, and the 20 arm segments and helpers, at the joints of the config. The Action `bind` holds the bind with no bind supination. The properties `palm`, `hinges`, `seat`, and `lids` come from the steps below |
| Facts | `height` 0.677402 (the shoulder joints at 1.050235 m for each unit, so that H is 0.217537 m, the H of the earlier penguin), `crease` 180 |
| Eyes | The eyeballs of the mesh, with the finish `varnish` and no eye light (`eyeFinish` of the entry), and a blink lid on each. No eye objects, so the app adds no bead eyes |

The edits, in the order of the build (`sa` is `tools/blender/studio_armature.py`, x is the x of the
left side):

- **Import.** `sa.import_source('assets/models/penguin/tripo-p2/penguin.fbx', 1e-5)`. No vertex
  merges, and each face is flat. No loose part goes: the source has none apart from the eyeballs.
- **Beak split.** The singer opens the beak (design 5.3), and the beak of the source is closed. The
  source has a thin mouth slit at the beak root, along the orange mouth line of the color map. The
  slit goes into the head to z 0.086 and opens on the face at (±0.0275, 0.892, 0.10). The plane
  through the x axis, the point (y 0.8905, z 0.112), and a point under the hook of the tip (y
  0.8745, z 0.242) follows the top of the orange line. It cuts the faces of the beak box (|x| to
  0.034, y 0.855 to 0.91, z from 0.105) with `bmesh.ops.bisect_plane()`: no vertex moves. The
  faces split along the whole closed section of the beak (rule `loop`, 28 edges): around the tip,
  back along the sides to the slit, and across the front wall of the slit at z 0.11 to 0.135. The
  path vertices of the upper part move 0.0002 units up along the plane normal, and those of the
  lower part 0.0002 units down. A cap closes each part, with the UV of the dark head feathers at
  (0.1779, 0.9067). A small loop at the hook of the tip stays joined. The upper and the lower beak
  stay joined only through the back wall of the slit and the face. A flood from the lower path
  through the vertices below the plane in the jaw box (|x| to 0.07, y 0.85 to 0.905, z from 0.085)
  gives 89 vertices the point attribute `jaw`: the lower beak, the lower wall of the slit, and the
  chin in front of the slit.
- **Arm rings.** Edge ring Subdivide (`bmesh.ops.subdivide_edges(bm, edges=<ring>, cuts=<n>,
  use_grid_fill=True)`) of the clean quad bands of 16 edges between the closed flipper loops at x
  0.200, 0.240, 0.291, 0.352, and 0.393: 1 cut on the band 0.200 to 0.240 (the shoulder), 2 cuts on
  the band 0.240 to 0.291 (the elbow), and 1 cut on the band 0.352 to 0.393 (the wrist). The root of
  the flipper (x 0.10 to 0.20) and the band 0.291 to 0.352 stop at poles.
- **No leg rings.** The short legs hide in the egg, and their loops stop at poles.
- **No flipper turn.** The flipper twist stays below 45 degrees in each moment of the singer with
  the flippers of the source ("Flipper twist").
- **Point edits.** None.
- **Surface.** `sa.add_surface(penguin, 'penguin', <base color>, eye_fans=False,
  config=<penguin-tripo.json>)`. The 68 gloss faces are the faces at the beak tip in the nose box.
- **Eyes.** The faces of the two eyeballs take the face attribute `eye`, and keep the color map.
- **Armature.** The joints of the config: the shoulder at (0.16, 0.645, -0.10), where the flipper
  leaves the side of the trunk, the elbow at x 0.265, the wrist at x 0.365, the knuckles at x 0.42,
  and the tip at (0.468, 0.618, -0.083). The hip at (0.085, 0.18, -0.04), the knee at (0.095, 0.11,
  -0.03), the ankle at (0.10, 0.05, -0.04), and the toes from (0.10, 0.015, 0.04). The tail from
  (0, 0.12, -0.19) to the tip at (0, 0.04, -0.242), and the jaw from the back of the mouth slit (0,
  0.8935, 0.09) to the tip (0, 0.8775, 0.242). The palm is the white under face of the flipper, the mean
  normal of the flipper faces that face forward, (-0.035, -0.444, 0.895). The bind arms
  (`bindArms`) are those of the earlier penguin. Each leg turn is the identity, and the trunk does
  not recline (`open` 0).

The weights, in the rest pose:

1. Automatic Weights, then Limit Total 4 and Normalize All, on a copy of the mesh with no tail and
   no eyeball.
2. Flipper rows: each vertex of a side with |x| from 0.16, within 0.075 units of the line of the
   rest flipper, takes one exact row (`sa.set_weight_row()`): a clavicle share from 0.4 at x 0.16
   to 0 at x 0.20, an elbow helper share that grows from 0 at x 0.21 to 1 at the elbow joint (x 0.265) and
   falls to 0 at x 0.295, and the rest on the 4 roll segments.
3. Wrist rows: the bend share of the flipper tip grows in 12 equal steps of 0.004 from 0.04 units
   before the head of `hand_<side>`. Knuckle rows: the fingers share grows in 12 equal steps of
   0.0035 from 0.02 units before the head of `fingers_<side>`. The paw bones thus take the outer
   third of the flipper.
4. The eyeballs and the beak tip take {`head` 1}. The tail (the vertices that a flood from its
   lowest point reaches through z below -0.16 and y below 0.12) takes {`hips` 1 - a, `tail` a},
   with a = smoothstep(0, 0.03) of the length of the shortest edge path from the root of the tail.
5. Jaw rows: bone heat gives the jaw a share of the upper beak and the face. Each vertex out of the
   lower beak gives its jaw share to the head (516 vertices). Each vertex of the lower beak takes
   {`jaw` s, `head` 1 - s}, with s = smoothstep(0, 0.03) of its place along the jaw bone from the
   back of the slit. The lower beak thus turns about the back of the gape, and the chin in front of
   the slit follows it a little.

**Smooth surface.** No relax and no region colors. The crease angle 180 gives each corner the mean
normal of the faces at its vertex, as the smooth shading of an FBX viewer.

**Nose.** The penguin has no nose. The gloss faces of the nose box at the beak tip go back to the
slot `fur` at the end of the build (`noseFur`), so the whole beak keeps the color map.

**Stance and balance.** The penguin stands on its riser in the pose of the source. The property
`seat` is {`prop` `chair`, `front` -0.11, `back` -0.165, `halfWidth` 0.24}: a seat behind the
heels, which only sets the seat height of the export. The probe `balance.py` takes the volume
center of mass of the app skin in each moment of `pnpm pose-preview singer --skin` and the middle of
the soles (the skin points within 1.2 cm of the lowest point). The soles go from 18.1 cm behind to
2.9 cm in front of the root. In cm in front of the middle of the soles (negative: behind it):

| Moment | Center of mass | Sideways |
|---|---|---|
| note | -8.7 | -0.7 |
| between | -8.6 | -0.5 |
| rest | -8.1 | 0.0 |

The center of mass stays over the soles, 1.8 to 2.4 cm in front of the heels, as a real penguin
stands back on its heels. The source has it 8.3 cm behind the middle too. A trunk lean that puts it
over the middle of the soles is about 12 degrees, and the upright penguin of the source then
leans forward, so the bind keeps the stance of the source.

**Lids.** A lid on each eye: 14 × 13 points from psi -55 to 45 degrees and lam from -50 to 62
degrees on the left (the mirror on the right), with the lower strip as the first row, at 1.17 ball
radii. 156 quads on each side, held turned up 126 degrees into the head. The property `lids` holds
the angle 2.199115 and the hinge axes. The lid faces take the black head feathers at UV (0.1779,
0.9067) at 0.2 UV for each unit, and the row `head` 1. The open lid lies at least 0.009 units under
the head. The eyes sit on the sides of a narrow head, so in the second half of the blink up to 18
points of the side edges and the back edge of each lid leave the head (ray casts). The lid and the
head around the eye are both black.

**Flipper twist.** `pnpm arm-check singer --base HEAD`, against the earlier penguin in parentheses:

| Arm | folds p95 | twist p95 | forearm twist p95 | paw twist p95 | move twist max | grip turn p50 |
|---|---|---|---|---|---|---|
| Left | 3 (1) | 19 (18) | 13 (17) | 28 (12) | 28 (12) | 2 (7) |
| Right | 2 (1) | 19 (16) | 14 (9) | 28 (24) | 28 (24) | 2 (7) |

Each flipper twists at most 28 degrees in the singer moments. The flat flipper is 1.4 cm across
its narrow axis at the elbow ring and 0.9 cm at the wrist ring (2.9 cm on the round rebuilt
flippers).

**Folder hold.** The flippers start at the back half of the sides, about 11 cm further back than
the flippers of the earlier penguin. With the folder at 1.1 H in front of the head center, the palms
stayed up to 74 mm from their grips (`pnpm hold-fit singer`). The folder now hangs at 0.74 H
(`CHOIR_FOLDER.forward`), and the elbow poles are (±1, -1, 0.1) (`CHOIR_HOLD`): the palms meet the
grips within 3.1 mm, the flipper tips twist 27 degrees (40 with the earlier poles), and the folder
goes 0.7 cm into the belly in the play (`pnpm pose-depth singer`, limit 2.0 cm). The paw bones hold the
outer third of each flipper (the wrist at two thirds of its length). The hand bends 30 degrees
toward the palm at the wrist (`CHOIR_HOLD.flex`) and the fingers curl 15 degrees
(`CHOIR_HOLD.curl`), so the outer third curls about 40 degrees around the outer edge of the cover,
as a hand holds a book. The tips stay out of the folder (0.0 cm), and the paws go 0.2 cm into it. The roots of the upper flippers
go 2.0 cm into the sides in each pose (1.3 cm on the earlier penguin, limit 1.5 cm).

**Color map** (`tools/tripo-maps.py penguin`). The tool scales the source to 2048 pixels (Lanczos)
and writes WebP quality 60, method 6 (Pillow 13.0.0). No texel changes its color. The eye of the map
looks forward and a little out, as the eyes of a penguin on the sides of its head, so no iris moves.
The iris is 0.15 of the head width, near the limit of 0.14, so the eyes keep their size.

**Normal map.** The same run writes `penguin-normal.webp` from the normal map of the FBX, as for the
wolf: each x, y tilt limited to 0.2 (0.63 % of the texels), a box scale to 1024 pixels, the tilts
times 4 in red and green, 255 in blue, and `cwebp -q 60 -sharp_yuv -m 6` (libwebp 1.5.0).

**Differences from the source.** The app light is warm and comes from above, so the white front
reads cream and the black feathers read dark brown. The source holds the flippers out to the
sides, and the app holds the folder with them. The open beak shows a dark cap on each part, and the
walls of the mouth slit of the source.

The export of the file and the maps. License of each file: CC BY-NC 4.0, as the FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/penguin.rig.glb` | 1,093,568 bytes | `67e5e82f63a5498124d07df58c88af04b2960e33556145d4d6b2118df790f068` |
| `tripo-hand/penguin.rig.json` | 17,143 bytes | `1bf81ef2d128c109ccb9336432b4d3a1cc11204e8baca1137b4f2ca1c2fc1e2c` |
| `tripo-hand/penguin-color.webp` | 157,932 bytes, 2048 × 2048 | `e6d5fe8c012bc9b6ffded679d001c714ab45713427a78bfcfff2cfa53686013d` |
| `tripo-hand/penguin-normal.webp` | 29,206 bytes, 1024 × 1024 | `de0f7717703072644cdd941a6e1850f61480830b61081392e3c79b47fa63e189` |

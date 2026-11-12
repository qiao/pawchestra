# Penguin model

This folder holds the source mesh of the earlier penguin, three edited copies, a copy with rebuilt
flippers and its weights, a copy of it with a smooth color edge, a copy of that with clean
armpits, a copy of that with a crease at each flipper root, and the rigged copy. The app does not
serve these files. Before the Tripo penguin ("Tripo hand rig" below), the module
`src/models/studio/penguin.ts` came from this chain:

```text
penguin.glb                          source mesh
   │  tools/blender/penguin_beak.py  split beak, so that the beak opens
   v
penguin-beak.glb
   │  tools/blender/penguin_edge.py  color edge cut
   v
penguin-edge.glb
   │  tools/blender/penguin_edit.py  flippers free of the trunk
   v
penguin-free.glb                     `armSource` of tools/mesh-rigs/penguin.json (git keeps it out)
   │  tools/blender/arm_rebuild.py   rebuilt flippers and painted weights
   v
penguin-arms.glb + penguin-weights.json  `weightSource` and `paintedWeights` of the config
   │  point edits in Blender           smooth black and white edge (penguin-arms-edge.json)
   v
penguin-arms-edge.glb
   │  point edits in Blender           no fins under the flippers (penguin-arms-pit.json)
   v
penguin-arms-pit.glb
   │  point edits in Blender           a crease at each root, no flat ledge (penguin-arms-crease.json)
   v
penguin-arms-crease.glb              `source` of the config
   │  pnpm rig-mesh penguin
   v
penguin.rig.glb                      rigged mesh
   │  pnpm studio-body penguin
   v
src/models/studio/penguin.ts         studio body of the app
```

`docs/agents/rigging.md` gives the steps of the chain.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `penguin.glb` | Source mesh (below) | None |
| `penguin-beak.glb` | Copy of `penguin.glb` with a split beak. License as `penguin.glb` | `penguin_beak.py` (below) |
| `penguin-edge.glb` | Copy of `penguin-beak.glb` with the color edge cut. License as `penguin.glb` | `penguin_edge.py` (below) |
| `penguin-free.glb` | Copy of `penguin-edge.glb` with the flippers free of the trunk. Git keeps out its 14 MB. License as `penguin.glb` | `penguin_edit.py` (below) |
| `penguin-arms.glb` | Copy of `penguin-free.glb` with rebuilt flippers. License as `penguin.glb` | `arm_rebuild.py` (below) |
| `penguin-weights.json` | Weights of the same Blender run. License as `penguin.glb` | `arm_rebuild.py` (below) |
| `penguin-arms-edge.glb` | Copy of `penguin-arms.glb` with a smooth black and white edge. License as `penguin.glb` | None: point edits in Blender (below) |
| `penguin-arms-edge.json` | The list of the edits of `penguin-arms-edge.glb`. License as `penguin.glb` | None |
| `penguin-arms-pit.glb` | Copy of `penguin-arms-edge.glb` with no fins under the flippers. License as `penguin.glb` | None: point edits in Blender (below) |
| `penguin-arms-pit.json` | The list of the edits of `penguin-arms-pit.glb`. License as `penguin.glb` | None |
| `penguin-arms-crease.glb` | Copy of `penguin-arms-pit.glb` with a crease at each flipper root. License as `penguin.glb` | None: point edits in Blender (below) |
| `penguin-arms-crease.json` | The list of the edits of `penguin-arms-crease.glb`. License as `penguin.glb` | None |
| `penguin.rig.glb` | Output of the rig. License as `penguin.glb` | `pnpm rig-mesh penguin` |

## penguin.glb

| Item | Value |
|---|---|
| Size | 13,514,964 bytes |
| SHA-256 | `a4e098c5d90f3b0de0a2a9873d783c3367c5c09afcb33a9327301382e1c7bfb2` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,103 triangles and 3,656 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial`, double-sided, with a base color texture (7.5 MB) and a metallic-roughness texture (5.9 MB), each a PNG |

The values below are in the units of the studio: 1 unit from the soles to the crown, the soles at
y = 0, +z forward, and +x the left side of the animal. The mesh faces +z. The weld is at 1e-5.

- The weld gives 1,553 vertices in one part. 2 edges are open and 3 edges have more than two
  faces. 200 faces have a corner angle below 10°.
- The box is x -0.324 to 0.324, y 0 to 1, and z -0.236 to 0.234. The penguin is 1.903 units of
  the file high from the soles to the crown.
- The body is one egg from the feet up to the crown, widest at y 0.31 to 0.37 (x ±0.224) and
  deepest at y 0.43 (z -0.223 to 0.214). The head has no neck: the body is narrowest at y 0.79
  (x ±0.133).
- Each flipper hangs out and down from its root on the side of the body (y 0.48 to 0.65) to its
  tip at x 0.324 and y 0.29. It is broad from the front to the back (z -0.066 to 0.087) and free
  of the body below its root.
- The closed orange beak goes from its root at z 0.15 to its tip at z 0.234 and y 0.88. The black
  eyes are at y 0.91, with no shells.
- The feet stand under the egg, from y 0 to 0.09, with the toes forward to z 0.105. A short
  pointed tail sticks out back at y 0.05 to 0.16 and z -0.236.

## penguin-beak.glb

| Item | Value |
|---|---|
| Size | 13,518,096 bytes |
| SHA-256 | `27302fbcae0699a0ce8aa6a2a3010d66ea5438205a6737afbed6c50751330f70` |
| Writer | Khronos glTF Blender I/O of the Blender of the script |

The script splits the beak, so that the beak opens. The edits, in the units of the studio:

1. It welds the vertices at 1e-5 units of the file, as `pnpm rig-mesh` welds them.
2. The level plane at y 0.883, the height of the tip of the beak, cuts the 93 faces of the beak.
   The cut is a path of 20 edges from the left corner of the mouth (x 0.045, z 0.140) around the
   tip to the right corner (x -0.045).
3. The faces split along the path into an upper part and a lower part. Each corner of the mouth
   stays one vertex.
4. The vertices of the path move 0.0005 units of the file up on the upper part and down on the
   lower part, so that the weld does not join them again. The outer form of the closed beak stays
   the same.
5. A cap of 21 corners closes each part. The two caps share the edge between the corners of the
   mouth, and their normals point into the mouth.
6. A patch of 24 × 24 pixels of the mouth color `#4d2312` goes into a free place of the base color
   texture (u 0.044, v 0.009), and the caps take its UV.

The copy has 3,185 triangles, with the same 2 open edges and 3 edges with more than two faces. A
headless run gives the same bytes:

```bash
blender --background --factory-startup --python tools/blender/penguin_beak.py -- \
  assets/models/penguin/penguin.glb assets/models/penguin/penguin-beak.glb 0.883
```

## penguin-edge.glb

| Item | Value |
|---|---|
| Size | 13,527,960 bytes |
| SHA-256 | `0f1ac9c7397f37d7c19e82ffd7beaeb3fc2f38b3c4edf4e07b13dd10ab52277e` |
| Writer | Khronos glTF Blender I/O of the Blender of the script |

The script cuts the faces along the black and white edge of the texture. Thus each face of the rig
lies on one side, and the edge runs through the faces as on the source mesh, with no gradient. The
edits:

1. It welds the vertices at 1e-5 units of the file, as `pnpm rig-mesh` welds them.
2. Each vertex is light or dark by the Oklab lightness 0.5 of the texture at its UV. A vertex on
   the orange beak or feet has no side, because a cut at the root of the beak gave thin faces that
   folded when the beak opened.
3. Each of the 182 edges between a light and a dark vertex splits where the texture changes along
   it, from 0.15 to 0.85 of the edge. Each of the 178 faces with two new vertices splits along the
   line between them.

The copy has 3,549 triangles, with the same 2 open edges and 3 edges with more than two faces. A
headless run gives the same bytes:

```bash
blender --background --factory-startup --python tools/blender/penguin_edge.py -- \
  assets/models/penguin/penguin-beak.glb assets/models/penguin/penguin-edge.glb
shasum -a 256 assets/models/penguin/*.glb
```

## penguin-free.glb

| Item | Value |
|---|---|
| Size | 13,539,948 bytes |
| SHA-256 | `f4c6df462da8f5b619d7d709b6e5e4a16a548a96b23f41e671a35b69acd91788` |
| Writer | Khronos glTF Blender I/O of the Blender of the script |

The inner side of each flipper of `penguin-edge.glb` joins the side of the trunk in a deep crease
from the shoulder down to about 0.85 of the upper arm, so `arm_rebuild.py` finds no free section.
`tools/blender/penguin_edit.py` splits each flipper from the trunk along its crease with the steps
of `beaver_edit.py`, turns it 8° out, and closes the flipper and the trunk with new faces. First it
gives the trunk alone a vertex that the left flipper and the trunk both hold, and removes a flap
face of the left crease and a small closed tetrahedron of the right crease. The new faces of the
side wall take the black of the flipper, below a straight white edge along the flank line under
the flipper. The split beak and the color edge cut stay. The copy has 1,985 vertices and 3,966
triangles after the weld. Two runs give the same bytes. The script prints the joints of the turned
flipper, which are the arm joints of the config:

```bash
blender -b --factory-startup -P tools/blender/penguin_edit.py -- assets/models/penguin/penguin-free.glb
```

## penguin-arms.glb

| Item | Value |
|---|---|
| Size | 929,692 bytes |
| SHA-256 | `9f2e89aa2e3f2c9f20f7275224a4624051b2b70b21505cc90357fb53f2d23e64` |

`arm_rebuild.py` finds the shoulder line at 0.1 of the upper arm. The flat flipper needs a larger
ratio in the free test (`free`), and a collapse at the cut loop joins two islands of the atlas in
9 faces, which take the UV of a neighbor face (`spread`). The copy has 2,194 vertices and 4,384
triangles after the weld:

```bash
blender -b --factory-startup -P tools/blender/arm_rebuild.py -- penguin --spec '{"free": 1.8, "spread": 0.2}'
```

## penguin-arms-edge.glb

| Item | Value |
|---|---|
| Size | 951,812 bytes |
| SHA-256 | `08fa8b59bd82314c4dd9c90819898d8d6923f49368561d3a86c9aa2eb2aea781` |
| Writer | Khronos glTF Blender I/O of Blender 5.2 |

The texture edge of the Meshy mesh is noisy. `penguin_edge.py` cut each edge where the texture
changes, so the cut points made a jagged line, and the faces on its two sides made a staircase on
the head, the cheek patch, the throat, and the flank. The face color rule then took the larger half
of the samples of each face, and the flank rule turned single black faces white along a straight
line: both added steps. The copy moves the edge onto a smooth curve on the surface. The edits, made
in the live Blender on the welded mesh of `penguin-arms.glb`, in the units of the studio:

1. Each face has a side: white or black, from its color in the rig of `penguin-arms.glb`, after the
   flank rule. The orange faces, the faces of the eye boxes, and the faces of the flipper tubes
   (each corner with an arm weight of 0.9 or more in the rig) keep their faces and colors.
2. Each vertex takes the mean side of the other faces within 0.09 units over the surface, weighted
   by the face area and a Gauss curve of the distance with sigma 0.03 units. Forward of the line of
   `colors.flank`, a smooth term adds up to 1 toward white, so that a raised flipper still leaves
   no black band on the side. The edge is the zero line of this field.
3. A zero within 0.15 of an edge end moves to that end, so that no new face is a thin sliver. A
   zero on an edge of a face at the flipper root (each corner with a clavicle and arm weight of
   0.6 or more in `penguin-weights.json`) also moves to the nearer end: there the weights change
   fast, and small new faces folded at the front of the left root. Each other edge with a zero
   splits there: 112 new vertices, each on its old edge. Each face splits along the line between
   its new vertices, or from its new vertex to its corner on the line.
4. Each face whose texture side differs from its side of the line takes the UVs of the nearest face
   of its side, corner by corner: 339 faces (215 to white, 124 to black). The rig then gives it the
   color of that face.

No old vertex moves. The largest distance from a new vertex to the surface of `penguin-arms.glb`
is 1.4e-8 units. The copy has 2,306 vertices and 4,608 triangles after the weld (4,384 before).
The texture is the same JPEG. `penguin-arms-edge.json` lists each new vertex (its old edge and its
place) and each recolored face. The rig takes the weights of each vertex from its place on
`penguin-arms.glb` (`weightSource` of the config), so that `penguin-weights.json` still keys to
those vertices, and a new vertex takes the weights of the two ends of its edge in the ratio of its
place. The flank rule changes no face of this copy.

## penguin-arms-pit.glb

| Item | Value |
|---|---|
| Size | 950,476 bytes |
| SHA-256 | `bd3924084f81698e4197b5a5244d46060b620354c7d25e4bfca0297cbe279600` |
| Writer | Khronos glTF Blender I/O v5.2.40 |

The rebuilt tube of each flipper lay on the trunk below the shoulder: `arm_rebuild.py` wrapped the
tube onto the old flipper, which `penguin_edit.py` freed from a crease that went far down the
side. The inner vertices of the lower rings of the tube stayed on the trunk wall. Thus a thin box
went from the inner side of each flipper to the trunk: two walls 0.02 to 0.04 units apart and a
flat floor, from y 0.46 up to y 0.52 on the left and from y 0.49 up to y 0.52 on the right. From
the front and a little below, the floor and the walls showed as dark fins under the flipper root.
The tube faces on the trunk also hid small crumpled faces of the trunk wall.

The copy removes the fins with point edits in the live Blender on the welded mesh. Each edit
merges one vertex into a neighbor vertex at the place of that neighbor, so that no vertex goes to
a new place. `penguin-arms-pit.json` lists the 24 merges in their order:

1. On each side, each inner vertex of the three lowest tube rings that lay on the trunk merges into
   the next vertex of its ring on the inner side of the flipper: 6 vertices on the left and 5 on
   the right. Each ring then closes across the inner side of the flipper, and the flipper is free
   of the trunk up to y 0.52. The tube stays on the trunk above it, so the armpit stays a short
   crease with no gap at the root: a clip is better than an over-cut.
2. Each vertex of a thin or flat triangle of the trunk wall that the tube faces hid merges into its
   nearest neighbor of the same wall: 8 vertices on the left, and 5 vertices of the color edge cut
   of `penguin-arms-edge.glb` near the front of the right root.

The copy has 2,282 vertices and 4,560 triangles after the weld (2,306 and 4,608 before): 48
faces go (28 on the left, 20 on the right), and 34 faces take a new corner (19 and 15). A new
corner takes the UV of its vertex in a face that shares a corner UV with it, so that the face
stays on its island of the atlas. Where no such face exists, the corner keeps its old UV. Thus
the black and white edge stays, and the rig gives no new lone face. Each vertex keeps its place on `penguin-arms-edge.glb`, so the rig gives it the weights of
its place on `penguin-arms.glb` (`weightSource` of the config). The faces that close the inner
side of a flipper lie up to 0.024 units from the old surface, where the walls were.

## penguin-arms-crease.glb

| Item | Value |
|---|---|
| Size | 950,372 bytes |
| SHA-256 | `3c552e5fd5f7fe13b8e79bdf1eb6fdaccc857bf61d327aeda94f9cbe161db3f7` |
| Writer | Khronos glTF Blender I/O v5.2.40 |

After the merges of `penguin-arms-pit.glb`, the top of the gap under each flipper root was a flat
ledge: the faces from the inner vertices of the lowest free tube ring to the vertices of the next
ring that lie on the trunk, about 0.03 units wide at y 0.52. At the back of each root, a second
flat ledge lay one ring higher, at y 0.54. From the front, the back, and below, each ledge showed
as a short flat dark edge.

The copy turns each ledge into a crease, with point edits in the live Blender on the welded mesh.
Each edit merges one vertex into a neighbor vertex of the ring above it, at the place of that
neighbor, so that no vertex goes to a new place. `penguin-arms-crease.json` lists the 7 merges in
their order:

1. On each side, the inner vertices of the lowest free ring merge into the vertices of the next
   ring that do not lie on the trunk: 2 on the left and 3 on the right (one of them in two steps).
   The top of the gap is then a ridge between the trunk and the inner side of the flipper, with no
   flat face.
2. On each side, the vertex of the trunk at the back ledge merges into the vertex of the next ring
   above it: 1 on the left and 1 on the right.

A first try moved the free ring vertices onto the trunk wall at their height. It gave a shallow
slope from the trunk to the flipper and a dent at the back of the root, so the copy uses the
merges. Each merge moves a corner at most 0.027 units. The copy has 2,275 vertices and 4,546
triangles after the weld (2,282 and 4,560 before): 14 faces go, and each other face keeps the UVs
of its own corners, so that it stays on its island of the atlas. Each vertex keeps its place on
`penguin-arms-pit.glb`, so the rig gives it the weights of its place on `penguin-arms.glb`
(`weightSource` of the config).

## penguin.rig.glb

Each fur face of the rig is black or white, apart from the orange beak and feet and the brown
mouth (`colors.twoTone` of `tools/mesh-rigs/penguin.json`). The texture gives the faces near the
black and white edge gray, tan, and pale yellow colors, and the color blend of the app spreads such
a face into a smudge on the cheek patch. A lone face whose three neighbors are of the other color
takes that color: a white sliver at the top of the left cheek patch and one white face on the
front of each flipper. Each other face keeps its side of the smooth edge of
`penguin-arms-edge.glb`.

The rig has four `raise` shapes of the left flipper (`raise` of `tools/mesh-rigs/penguin.json`),
for the recast roles of the cast matrix. The shared holds of the clarinet and the cello, and the
rest holds of the cello and the trumpet, turn the flipper 75° to 140° from the hanging bind, and
the clavicle only up to about 35°. The weights go from the clavicle to the arm in about 0.04 units
at the front of the flipper root, so the linear blend crushes the front of the root, and its
faces fold. Each shape relaxes these faces in the pose of its hold (`pnpm raise-fit`). The singer
does not reach these turns, so its skin does not change. A shape of the flute hold (137°) turned
over more faces after the relax than before, so the flute has no shape.

## Tripo hand rig

`tripo-hand/` holds the body of the singer: a hand rig of the Tripo P2 mesh `tripo-p2/penguin.fbx`,
made by one build script in a headless Blender 5.2, by the route of the Tripo wolf
(`../wolf/README.md`, "Candidate hand rig") and the Tripo monkey (`../monkey/README.md`). The body
keeps the form, the colors, and the eyes of the source: no point edit changes the head, the face,
the trunk, the flippers, the legs, the feet, or the tail. The flippers keep the length of the
source: no cut, no split from the trunk, and no stretch. The `ANIMALS` entry of the penguin
(`tools/studio-body.ts`) points to `tripo-hand/penguin.rig.glb`. The files of the earlier penguin
above do not change.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/penguin.fbx`, `tripo-p2/penguin.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/penguin.blend` | Made from `tripo-p2/penguin.fbx` by the scripted edits below. License as the FBX file | The scripted edits below |
| `tripo-hand/penguin.rig.glb` | Export of `tripo-hand/penguin.blend`. License as the FBX file | `pnpm rig-export penguin --blend assets/models/penguin/tripo-hand/penguin.blend --out assets/models/penguin/tripo-hand/penguin.rig.glb` |
| `tripo-hand/penguin.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/penguin-color.webp`, `tripo-hand/penguin-normal.webp` | Web copies of the color map and the normal map of the FBX ("Color map" and "Normal map" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/penguin-maps.py` |

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

The hand rig (design 4.4, "Hand rig"). The scripts of the session (`scratch/penguin/` of the
worktree, which git ignores: `build.py`, `make_config.py`, `base-config.json`, `params.json`,
`chain-here.sh`, and the probe `balance.py`) are not in the repo. They are the scripts of the
Tripo monkey with the changes below. `make_config.py` writes
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
   to 0 at x 0.20, an elbow helper share of 0.25, 0.75, 0.75, and 0.25 at x 0.25, 0.26, 0.27, and
   0.28, and the rest on the 4 roll segments.
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
grips within 1.0 mm, the flipper tips twist 27 degrees (40 with the earlier poles), and the folder
goes 0.7 cm into the belly in the play (`pnpm pose-depth singer`, limit 2.0 cm). The roots of the upper flippers
go 2.0 cm into the sides in each pose (1.3 cm on the earlier penguin, limit 1.5 cm).

**Color map** (`tools/penguin-maps.py`). The tool scales the source to 2048 pixels (Lanczos) and
writes WebP quality 60, method 6 (Pillow 13.0.0). No texel changes its color. The eye of the map
looks forward and a little out, as the eyes of a penguin on the sides of its head, so no iris
moves. The iris is 0.15 of the head width, near the limit of 0.14, so the eyes keep their size.

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
| `tripo-hand/penguin.rig.glb` | 1,093,568 bytes | `6848aa20f4147e41579e0ed48281645ad0b943f7cf36f28bb5a85be95d46174b` |
| `tripo-hand/penguin.rig.json` | 17,143 bytes | `01fb55b911ce0f5763b033adfeabeb27b3484508b3387f094756fbd648228d00` |
| `tripo-hand/penguin-color.webp` | 157,932 bytes, 2048 × 2048 | `e6d5fe8c012bc9b6ffded679d001c714ab45713427a78bfcfff2cfa53686013d` |
| `tripo-hand/penguin-normal.webp` | 29,206 bytes, 1024 × 1024 | `de0f7717703072644cdd941a6e1850f61480830b61081392e3c79b47fa63e189` |

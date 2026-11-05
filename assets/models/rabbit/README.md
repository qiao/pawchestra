# Rabbit model

This folder holds the T-pose source meshes of the rabbit, the rig made by hand in Blender
(`rabbit.blend`), and the rigged copy that the export writes from it. The app does not serve these
files. It loads the module `src/models/studio/rabbit.ts`, which this chain writes:

```text
tripo/rabbit.fbx                   source mesh with quad faces
   │  work by hand in Blender (design 4.4, "Hand rig")
   v
rabbit.blend                       mesh, face colors, armature, weights, eyes, bind, keys
   │  pnpm rig-export rabbit
   v
rabbit.rig.glb + rabbit.rig.json   rigged mesh and its text summary
   │  pnpm studio-body rabbit
   v
src/models/studio/rabbit.ts        studio body of the app
```

`rabbit-arms.glb` and `rabbit-weights.json` are the inputs of the old chain of
`tools/mesh-rigs/rabbit.json`. `pnpm rig-mesh rabbit` stops now, because the folder holds
`rabbit.blend`. Each value of the hand rig lives only in `rabbit.blend`, and the tools read it from
the export (design 4.4, "Hand rig"). `docs/agents/rigging.md` gives the steps of a hand rig. The
target of the form is the sheet `docs/reference/rabbit-views.png`.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `rabbit-tpose.glb` | Source mesh (below) | None |
| `tripo/rabbit.fbx`, `tripo/rabbit.fbm/` | Source mesh with quad faces, and its four textures (below) | None |
| `rabbit-arms.glb` | Copy of `rabbit-tpose.glb` with rebuilt arms. License as the source | `arm_rebuild.py rabbit --factor 1.18` |
| `rabbit-weights.json` | Weights of the same Blender run. License as the source | `arm_rebuild.py rabbit --factor 1.18` |
| `rabbit.blend` | Made by hand in Blender from `tripo/rabbit.fbx` (below). License as the FBX file | None: edit it in Blender |
| `rabbit.rig.glb` | Export of `rabbit.blend`. License as the FBX file | `pnpm rig-export rabbit` |
| `rabbit.rig.json` | Text summary of the export, for diffs | The same run |

## rabbit-tpose.glb

The mesh has no skeleton. The arms stand out level to the sides, free of the trunk.

| Item | Value |
|---|---|
| Size | 13,759,212 bytes |
| SHA-256 | `a6dbee19e81407e6a88acb302f20a734c0021a27986ba48b999c3832caca7fea` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,123 triangles and 4,709 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial`, double-sided, with a base color texture (8.0 MB) and a metallic-roughness texture (5.5 MB), each a PNG of 4096 × 4096 pixels |

The values below are in the units of the studio: 1 unit from the soles to the ear tips, the soles
at y = 0, +z forward, and +x the left side of the animal. The mesh is 1.902 units of the file
high, and the weld at 1e-5 gives 1,566 vertices in one part. 6 edges are open, 14 edges have more
than two faces, and 484 faces have a corner angle below 10°.

- The box is x -0.358 to 0.358, y 0 to 1, and z -0.162 to 0.158.
- The arms stand out level at y 0.47 to 0.53, free of the trunk from |x| 0.087, with the paw
  tips at |x| 0.357. The pads of each paw face down (the palm hint of the config).
- The legs part below the crotch at y 0.18. The feet reach forward to z 0.086.
- The fur is light grey, with pink inner ears, a pink nose, and pink paw pads. The black eyes
  are at y 0.646 to 0.683 and z 0.067 to 0.095. Thin whiskers leave the muzzle at y 0.57 to 0.62,
  out to |x| 0.17.
- The ears stand from y 0.76 to the top. A round tail ball sits at the back, at y 0.25 to 0.34,
  out to z -0.162.

```bash
shasum -a 256 assets/models/rabbit/rabbit-tpose.glb
```

## tripo/rabbit.fbx

A mesh of the same rabbit in the same T-pose, made with Tripo: quad faces, and arm and leg tubes
of 8 to 16 vertices around. Its arm sections and its head width are those of `rabbit-tpose.glb`
within 2 %. The FBX file keeps the quads (a GLB file of the same mesh holds only triangles). The
folder `rabbit.fbm/` holds its textures, and the FBX file links them by name.

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary |
| Contents | One mesh object `output_unwrapped`, turned 90° about X (the FBX axes have Y up), with no armature and no animation. 2,428 vertices and 2,638 faces: 2,217 quads and 421 triangles (4,855 triangles). One UV layer. One material that links the four textures |
| Parts | One connected part, with the whiskers. No vertices merge at 1e-5. 10 open edges: 3 at the root of each whisker group, 1 at each side of the nose, and 2 under the left paw. 7 edges have more than two faces |
| Box | After the turn: x ±0.3564, y ±0.1592, and z 0 to 0.998 in the units of the file. The rabbit faces -y |

| File | Size | Pixels | SHA-256 |
|---|---|---|---|
| `rabbit.fbx` | 217,104 bytes | | `6ee4f87a767c16e80576e976244b013391857b53ef33e4a59996a6f120a85c44` |
| `rabbit.fbm/rabbit_basecolor.jpg` | 889,716 bytes | 4096 × 4096 | `5c70fcccdbf4a272d9844e6f3f5ff4820f82f76062e5318cda85e99f77c3fe10` |
| `rabbit.fbm/rabbit_metallic.jpg` | 355,829 bytes | 2048 × 2048 | `cf96150d0a4f567b21d6d09568f862399939595f11ed4e7c10e0da5ef810e3df` |
| `rabbit.fbm/rabbit_normal.jpg` | 734,946 bytes | 2048 × 2048 | `e91b3d0f6c2a627e704f91778597ee0674ab9132a026b59be2db835545f812ee` |
| `rabbit.fbm/rabbit_roughness.jpg` | 191,192 bytes | 2048 × 2048 | `47e6fbac3a29e63b8d677bfc13311d399a6f4572ce7356e5693f4327f4302d94` |

## rabbit-arms.glb and rabbit-weights.json

The inputs of the old chain of `tools/mesh-rigs/rabbit.json`.

| Item | Value |
|---|---|
| `rabbit-arms.glb` | 922,252 bytes, SHA-256 `1cf55635efe10f9124c26ec0160366d144055c051a53fc7c8822464ac5a93dc1` |
| Mesh | 2,022 vertices after a weld at 1e-5, 4,035 triangles: on each arm a tube of 14 quad rings of 16 vertices from 0.2 of the upper arm to 0.1 of the paw, joined to the trunk and the paw with Bridge Edge Loops, with Beautify Faces and Collapse Edges on the bridge triangles |
| Material | One material with one base color JPEG of 4096 × 4608 pixels: the atlas of the source, and a strip of 512 pixels on top with the fur color of the source arms, baked onto the new faces. No metallic-roughness texture |
| `rabbit-weights.json` | 446,496 bytes, SHA-256 `45af4710d2b4c2b9127e6ed17bfb3a96ef93710bea54ceb42af09e6d8f32e8b4` |
| Weights | The automatic weights of Blender with the weight rules of the script, on the studio bones and the arm segments and helpers (`armSegments` of the config), for `paintedWeights` of the config |

`tools/blender/arm_rebuild.py` puts new quad faces on each arm of `rabbit-tpose.glb` from the
shoulder line to the wrist, with the settings that it finds from the joints of the config and from
rays through the mesh. The new arm surface lies on the old one. The faces of the paws, the trunk,
the legs, the tail, and the head are the faces of the source. The arms are 1.18 times longer from
the shoulder line (`--factor 1.18`), because a rig with arm segments does not stretch the arms.
With this factor, the left paw reaches the nut of the violin of the rabbit (`armFactorNote` of the
config). A run gives the same bytes:

```bash
blender -b --factory-startup -P tools/blender/arm_rebuild.py -- rabbit --factor 1.18
shasum -a 256 assets/models/rabbit/rabbit-arms.glb assets/models/rabbit/rabbit-weights.json
```

## rabbit.rig.glb

`pnpm rig-export rabbit` writes it from `rabbit.blend`, with the text summary `rabbit.rig.json`. A
run gives the same bytes.

| Item | Value |
|---|---|
| Size | 533,636 bytes |
| SHA-256 | `f62e7b552bba013bfe0e9b12f0764f9706b9c739670235c5f18311aea7102f8f` |
| Form | The mesh of `rabbit.blend` in its seated bind (below). The seat top is 0.250 m high, and the chair is 0.42 m wide and 0.237 m deep, as the chair of the old rabbit |
| Faces | 5,705 triangles, of them 75 gloss (the nose) |
| Extras | `eyes`: the middle, the direction, and the size of each eye object. `body`: the facts of the body of the armature |
| Shapes | The arm-down shape of each arm and the straight legs of each side, which the export calculates |

## rabbit.blend

The hand rig of the rabbit (design 4.4, "Hand rig"), made in a live Blender 5.2 from
`tripo/rabbit.fbx`: the mesh, the colors, the armature, the weights, the pea eyes, the seated bind
(the Action `bind`), and the facts of the body. Each edit of the mesh is a point edit by hand, or
one translation, scale, or loop cut of a named part, with its ids and values below. The calls
name the functions of `tools/blender/studio_armature.py` (`sa`) and `studio_eyes.py` (`se`).

| Item | Value |
|---|---|
| Size | 330,824 bytes |
| SHA-256 | `720afe210929c401e00aaac1dbbd8a469e4315c0327adfe1b82afb479795d373` |
| Origin | Made by hand in Blender 5.2 from `tripo/rabbit.fbx` |
| License | CC BY-NC 4.0, as the FBX file |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the ear tips of the source, the soles at z = 0, the animal faces -y, and +x is its left side. The longer legs lift the body 0.0806 units, so the ear tips are at z = 1.0806. No object has a transform |
| Mesh | One object `rabbit`: the FBX mesh with the edits below, flat faces, no custom normals, and the surface of `sa.add_surface()` (below). 2,981 vertices and 3,202 faces (2,759 quads and 443 triangles, 5,961 triangles), 42 faces of them gloss (the nose) |
| Eyes | The objects `eye_L` and `eye_R` of `se.place_eyes()`, children of the bone `head`, with the size 0.200104 units (0.286547 m) and the direction (±0.7526, -0.6512, 0.0974) of the last rig. Each middle lies on the flat eye area of the head on the eye axis in the bind: (0.0666, -0.0625, 0.7390) and (-0.0672, -0.0630, 0.7390) |
| Materials | The slots `fur` and `gloss`. Each reads the face attribute `color` |
| Armature | One object `rabbit_rig`: the 30 body bones with no tail tip, and the 20 arm segments and helpers (helpers 0.03 units long), with the parents of `STUDIO_PARENTS`, the rest in the T-pose, and the properties `palm` (0, -0.0201, -0.9998), `seat`, `hinges`, and the facts of the body (below). The Z axis of each bone points to its hint (`sa.fix_rolls(rabbit_rig)`). The Action `bind` holds the seated bind at frame 1 (below) |
| Shape keys | None. The seated bind and the play show no fault that a `bind*` or `arm_raise_*` key must fix (below) |
| Weights | The automatic weights of Blender and the fixes below, at most 4 bones on each vertex, each sum 1. The upper arm, the forearm, the forearm twist bone, and `root` hold no weight |

The edits of the mesh, in the order of the work. Each id is the id in the mesh before its edit.

- **Import.** The FBX mesh `output_unwrapped` turns 90° about x (the turn of the file). The scale
  1.001957 (1 / 0.998047) gives 1 unit from the soles to the ear tips. No vertices merge at 1e-5.
  The custom normals go, and each face is flat. 2,428 vertices and 2,638 faces.
- **Belly patch.** The source has a round patch on the lower belly: a fan of 6 triangles around
  vertex 339 and a ring of thin faces around it (vertex pairs 2 to 7 mm apart). The vertices 337,
  1743, and 1744 lie at one point at its top. The fan stood 3.9 mm in front of the belly curve.
  - The 19 vertices 337, 338, 339, 340, 790, 791, 954, 1298, 1299, 1744, 1859, 1860, 1861, 1893,
    1943, 1944, 1952, 1963, and 2105 go.
  - The vertices 1770, 1937, 1301, 1892, and 758 merge into 1769, 1742, 1551, 1638, and 759, at
    the place of the second vertex.
  - A grid of 4 × 3 quads fills the hole, with the rows (759, 370, 1743, 953, 952), (1742, a, b,
    c, 1769), (1894, d, e, f, 1771), and (1638, 1926, 1923, 1300, 1551).
  - The 6 new vertices lie on the belly curve between the rows: a (-0.0155, -0.1065, 0.2251), b
    (-0.001, -0.1092, 0.2257), c (0.0155, -0.1065, 0.2251), d (-0.0141, -0.0943, 0.2075), e
    (-0.001, -0.0949, 0.2068), and f (0.0141, -0.0943, 0.2075). Each corner of the 12 faces has
    the UV of one point of the belly fur (0.4314, 0.5653).
  - The edges 1771-1550 and 1894-278 dissolve, so each side of the grid has one quad in place of
    two triangles.
- **Belly bands.** On each side, a band of thin quads (4 to 8 mm wide) went from the corner of the
  belly patch up to the side of the hip. In each pair across a band, the outer vertex merges into
  the vertex on the belly side, at its place. A vertex moves at most 7.8 mm.
  - Right: 261 → 365, 1792 → 321, 322 → 321, 1453 → 320, 319 → 320, 1452 → 1451, 1866 → 1865,
    1772 → 1975, 1378 → 1379, 2101 → 1379, and 277 → 276.
  - Left: 1489 → 1182, 186 → 185, 1722 → 185, 183 → 184, 2027 → 184, 560 → 559, 1981 → 1299,
    437 → 436, 438 → 439, 2021 → 439, and 1540 → 1905.
  - The corner of the grid: 1183 → 946.
  - No edge of the belly, the groin, and the lower chest is now shorter than 8 mm (z 0.15 to
    0.45, |x| below 0.13, the front half).
- **Arm tubes.** The source arm tube has rings of 8 to 13 vertices with long triangles. On each
  side, the tube from the shoulder ring (8 vertices at |x| 0.1223) to the wrist ring (16 vertices
  at |x| 0.2926 to 0.2965) goes, and 15 new rings of 16 vertices take its place.
  - The 23 vertices of the rings at |x| 0.1693, 0.2162, and 0.2573 go: 467, 468, 575, 576, 577,
    654, 655, 657, 658, 665, 1043, 1044, 1045, 1073, 1074, 1140, 1329, 1401, 1519, 1639, 1640,
    1642, and 1704 on the left, and 336, 339, 362, 363, 633, 636, 637, 650, 651, 771, 780, 781,
    1001, 1002, 1012, 1013, 1108, 1384, 1385, 1432, 1433, 1489, and 1584 on the right.
  - The two triangles on the paw side of each wrist band go (147-148-838 and 602-631-632 on the
    left, 634-635-1969 and 605-606-624 on the right), and then their 4 loose edges.
  - The paw (the part from the wrist ring out, 221 vertices on the left and 220 on the right)
    moves out 0.0312 units along x. This keeps the reach of the 1.18 arm of the last rig (0.385 m
    from the shoulder joint to the palm in `pnpm hold-reach rabbit`), so the violin hold keeps
    its reach to the nut.
  - The new rings lie in planes of one x, 0.01277 units apart (0.39 to 0.45 arm radii): |x|
    0.1351, 0.1478, 0.1606, 0.1734, 0.1861, 0.1989, 0.2117, 0.2244, 0.2372, 0.2500, 0.2627,
    0.2755, 0.2883, 0.3010, and 0.3138.
  - The upper arm keeps the length of the source: each ring up to the elbow (|x| 0.1898, at 0.39
    of the source tube as on the last rig) takes the source section at its own x. The forearm is
    1.30 times as long (0.1056 to 0.1368 units). Each forearm ring takes the source section at
    the same share of the source forearm (|x| 0.1968, 0.2067, 0.2165, 0.2264, 0.2362, 0.2461,
    0.2560, 0.2658, 0.2757, and 0.2855), and moves out along x by one translation.
  - Vertex k of a ring lies where a ray from the area middle of the source section meets the
    source surface, at the angle of k. The angles go in even steps from the shoulder ring (its 8
    vertices and the 8 half angles) to the wrist ring, so the quads do not twist.
  - A ring of 16 points on a faceted section cuts its corners. So each ring then takes one scale
    in its plane about its middle: the source perimeter over the ring perimeter. From the
    shoulder out: 1.0271, 1.0311, 1.0191, 1.0156, 1.0312, 1.0364, 1.0330, 1.0385, 1.0323,
    1.0263, 1.0204, 1.0181, 1.0153, 1.0113, and 1.0057 on the left, and 1.0388, 1.0450, 1.0297,
    1.0137, 1.0172, 1.0167, 1.0169, 1.0349, 1.0303, 1.0256, 1.0206, 1.0186, 1.0171, 1.0126, and
    1.0063 on the right.
  - The faces: 8 quads and 8 triangles from the shoulder ring to the first ring, and 16 quads
    between two rings and from the last ring to the wrist ring. Each corner takes the UV of its
    ray hit. A face whose corner UVs spread more than 0.08 crosses a seam of the atlas, so all its
    corners take the UV of its first corner (97 faces on the left, 99 on the right).
  - The mid upper arm girth (the ring at |x| 0.1606) is 0.209 units, 1.00 of the width of the
    head at the eyes (0.209 units), as on the source.
- **Legs.** The thighs are 1.75 and the shins 1.25 times as long, as on the last rig, so that the
  seated bind of the last rig puts the haunch on the old seat (0.250 m). The soles stay at z 0.
  Each vertex belongs to a band of one height: a ring of each leg, or the crotch at that height.
  Each band moves up by one translation, the stretch at its mean height: 0.25 (z - 0.055) up to
  the knee joint (z 0.1156), then 0.01515 + 0.75 (z - 0.1156) up to the hip joint (z 0.185).

  | Band | z of the source | Vertices (both legs) | Move up |
  |---|---|---|---|
  | Feet | 0 to 0.057 | 286 | 0 |
  | Shin ring | 0.0665 to 0.0802 | 20 | 0.0045 |
  | Low knee ring | 0.0978 to 0.1057 | 18 | 0.0117 |
  | High knee ring | 0.1272 to 0.1311 | 18 | 0.0255 |
  | Low thigh | 0.1429 to 0.1566 | 14 | 0.0400 |
  | High thigh | 0.1624 to 0.1683 | 16 | 0.0533 |
  | Hips and crotch | 0.1742 to 0.1898 | 19 | 0.0642 |
  | The rest of the body | 0.1957 and up | 2,430 | 0.0672 |

  The girth of the source stays: the mid thigh is 0.452 and the mid shin 0.261 of the width of
  the head at the eyes (the source 0.449 and 0.262, the last rig 0.542 and 0.256).
- **Arm lengths.** The upper arm and the forearm share the extra length: each bone is 1.1416
  times as long as on the source (upper arm 0.1148 to 0.1311 units from the shoulder joint at |x|
  0.075, forearm 0.1056 to 0.1205), and the wrist stays at |x| 0.3266, so the reach stays. The
  elbow joint moves from |x| 0.1898 to 0.2061. Each ring moves along x by one translation, and
  its girth stays. The rings of the upper arm are then 0.01585 units apart, and those of the
  forearm 0.01125 units. The 15 rings go to |x| 0.1381, 0.1540, 0.1698, 0.1857, 0.2015, 0.2141,
  0.2253, 0.2366, 0.2478, 0.2591, 0.2703, 0.2816, 0.2928, 0.3041, and 0.3153 (moves of +0.0031,
  +0.0061, +0.0092, +0.0123, +0.0154, +0.0152, +0.0137, +0.0121, +0.0106, +0.0091, +0.0076,
  +0.0061, +0.0046, +0.0030, and +0.0015 on both sides).
- **Surface.** `sa.add_surface()` with the texture
  `assets/models/rabbit/tripo/rabbit.fbm/rabbit_basecolor.jpg` and `eye_fans=False`, with the mesh
  0.0672 units lower for the run and back after it, because the eye box and the nose box of
  `rabbit.json` are in the units of the source. 41 faces of the nose become gloss, and
  79 and 69 faces of the old eyes take the fur color.
- **Colors.** Each face is fur (Oklab chroma 0.02 or less), pink (0.035 or more on a foot, 0.04
  on a paw, 0.045 elsewhere), or mixed. A mixed face takes the class of most of its edge
  neighbors (2 rounds; 152 faces). Each of the 11 pink regions takes its most common pink, and
  each fur face that was mixed takes the most common plain fur of its neighbors (79 faces). 378
  faces change. The whiskers keep the white of the texture. Then the plain fur of `color` and
  `color_base` takes the move of `colors.tone` of `rabbit.json` (`tone()` of `rig_mesh.py`, as
  the last rig): 2,730 faces. The main fur goes to Oklab (0.951, 0.006, 0.016), the cream of the
  fur swatch of `rabbit-views.png`.
- **Knee rings.** At each knee, 2 loop cuts (`bmesh.ops.subdivide_edges()` of the 9 edges between
  the knee rings at z 0.1135 and 0.1549, 2 cuts) give rings at z 0.1273 and 0.1411: 4 rings
  within one leg radius of the knee joint (z 0.1308). 36 new vertices.
- **Shins.** The seated bind of the last rig put the haunch 0.232 m above the soles, under the old
  seat (0.250 m). So the shins are 0.0134 units longer (1.47 times the source): each band of one
  height moves up by one translation, the share of the shin below its middle (ankle z 0.055, knee
  z 0.1308). The shin ring (20 vertices) moves 0.00398, the low knee ring (18) 0.01033, the first
  cut ring (18) 0.01277, and all above 0.0134. Each bone above the ankle moves up 0.0134 (the
  head of each shin too). The seat top is now 0.250 m above the soles.
- **Flat quads.** 13 quads with a straight corner (180°), at the paw tops and the nose, split
  along the diagonal from that corner (`bmesh.ops.connect_verts()`), so no triangle has no area:
  592-481, 536-567, 775-773, 1144-595, 1276-787, 1267-1202, 2184-2186, 2322-1434, 2183-2331,
  2280-1906, 2347-2354, 2374-1751, and 1383-1552. Two of them folded in each sample of `pnpm
  fold-probe violinist`.

The bones, the weights, the bind, and the eyes:

- **Arm bones.** The elbow joint goes to |x| 0.2061 (y -0.0097, z 0.5781 after the rise), the
  middle of the forearm to |x| 0.2663, and each upper arm and forearm segment to a quarter of its
  bone. The elbow helper starts at the elbow, 0.03 units along the forearm. Then
  `sa.fix_rolls(rabbit_rig)`.
- **Weights.** The automatic weights of Blender (`ARMATURE_AUTO`), Limit Total 4, Normalize All.
  Then the fixes of the last rig, in the source heights plus 0.0672: no thigh weight above z
  0.2972 or on the other side, and 6 rounds of Smooth from z 0.2172 to 0.3272. Only the tail ball
  (within 0.06 of (0, 0.12, 0.3522), behind y 0.085) takes the tail, with 2 rounds of Smooth of
  its root. No head weight on the shoulder tops (|x| above 0.07, z below 0.6322), no neck weight
  above z 0.6672, no ear weight below z 0.8322 or on the other side, and 2 rounds of Smooth on the
  edges of these groups. No clavicle or arm weight on the neck sides (z above 0.6522, |x| below
  0.09), and 2 rounds of Smooth under them. The head weight of a vertex with an arm share of 0.5 or
  more goes to the neck. 16 rounds of Smooth on the 75 vertices of the front of the crotch with a
  thigh share of 0.02 to 0.98. No wrist or forearm segment weight beyond |x| 0.34, and 6 rounds of
  Smooth on each arm root (|x| 0.06 to 0.13). After the shins, the 230 whisker vertices (|x|
  above 0.09, y below -0.10, z 0.62 to 0.74) take the head bone alone, and 51 vertices of the
  lower sides of the head (z above 0.635, |x| below 0.15) lose their clavicle and arm weights.
  The whiskers folded with the turn of the head in 89 % of the play samples.
- **Ring rows.** Each ring of each arm tube and each knee ring takes one weight row
  (`sa.set_weight_row()`), so that no ring is uneven:

  | Ring (|x|) | Upper arm segments | Elbow helper | Forearm segments | Wrist helper | Paw |
  |---|---|---|---|---|---|
  | 0.1381 | 1.00 | 0 | 0 | 0 | 0 |
  | 0.1540 | 0.959 | 0.041 | 0 | 0 | 0 |
  | 0.1698 | 0.840 | 0.160 | 0 | 0 | 0 |
  | 0.1857 | 0.589 | 0.411 | 0 | 0 | 0 |
  | 0.2015 | 0.279 | 0.677 | 0.044 | 0 | 0 |
  | 0.2141 | 0.077 | 0.700 | 0.223 | 0 | 0 |
  | 0.2253 | 0.013 | 0.550 | 0.438 | 0 | 0 |
  | 0.2366 | 0 | 0.342 | 0.658 | 0 | 0 |
  | 0.2478 | 0 | 0.173 | 0.827 | 0 | 0 |
  | 0.2591 | 0 | 0.072 | 0.928 | 0 | 0 |
  | 0.2703 | 0 | 0.022 | 0.978 | 0 | 0 |
  | 0.2816, 0.2928 | 0 | 0 | 1.00 | 0 | 0 |
  | 0.3041 | 0 | 0 | 0.850 | 0.150 | 0 |
  | 0.3153 | 0 | 0 | 0.499 | 0.500 | 0.001 |
  | Wrist ring | 0 | 0 | 0.150 | 0.600 | 0.250 |

  The elbow ramp is the ramp of the last rig over the distance from the elbow joint (the helper
  up to 0.7 over about 10 rings). The share of the upper arm splits over the segments by the place
  of the ring between the middles of the segments, and so does the share of the forearm. The knee
  rings take thigh and shin: 0.200 and 0.800 (z 0.1135), 0.458 and 0.542 (0.1273), 0.704 and
  0.296 (0.1411), 0.900 and 0.100 (0.1549).
- **Bind.** The Action `bind` of the last rig: the leg turns, the trunk 5.08° back, the straight
  arms, and the bind supination 115° (left) and 57° (right). After the bone edits,
  `sa.drive_segments(rabbit_rig, key_frame=1)`.
- **Eyes.** The middle of each eye object moves out along its axis onto the head surface in the
  bind (left 0.00288, right 0.0032 units), then `se.place_eyes()`. On the old middle, the dome of
  the source eye stood in front of the pea eye and cut into it.
- **Belly weights.** In the seated bind, the thigh shares of the lower belly pulled it away from
  the row above, so a fold line (18° to 40°) outlined a round lobe with dark sides. The 55
  vertices of the lower belly (|x| below 0.085, y below -0.02, z 0.24 to 0.36 in the rest) give
  their thigh weight to the hips: 43 of them had a thigh share, from 0.033 to 0.543 (ids 260, 261,
  273, 274, 359, 360, 373, 745, 746, 937, 938, 986, 1046, 1173, 1216, 1281, 1282, 1441, 1526,
  1527, 1613, 1614, 1717, 1718, 1740, 1743, 1744, 1745, 1860, 1861, 1878, 1879, 1881, 1885,
  1886, 1890, 1891, 1893, 1904, 1946, 2034, 2052, 2065). The fold line goes down to 7° to 23° in
  the bind, as in the rest, and the bend of the seated thighs stays in the groin creases.
- **Eye areas.** The source eye is a dome in a groove, so a light ring showed around each pea eye.
  In the frame of each eye object in the rest (u across, v up, h along the eye axis), the
  vertices within 0.03 units of the axis move along the axis onto the face surface around the
  eye: h = a + b u + c v + d (u² + v²), the least squares fit through the vertices 0.03 to 0.045
  units from the axis, which do not move. The fit is (-0.0059, 0.0635, -0.2169, 3.4389) on the
  left and (-0.0051, -0.0613, -0.2238, 3.0841) on the right. The moves along the axis, in mm:
  - Left (axis 0.7526, -0.6512, 0.0974): 419 -5.9, 420 -1.9, 421 -0.8, 422 -4.7, 623 -6.0, 624
    -5.8, 625 -2.4, 626 -3.3, 729 -1.9, 730 +3.0, 731 +3.1, 732 -2.6, 854 -2.8, 855 -2.7, 1169
    +7.0, 1170 +8.0, 1172 +5.7, 1217 +2.7, 1218 +5.5, 1383 -5.2, 1384 -8.8, 1544 +1.7, 1552 -6.6,
    1631 -2.4, 1632 -6.0, 1633 -4.6, 1634 -2.4, 1656 +6.1, 1657 +1.3, 1671 +0.6, 1672 -2.2, 1816
    +6.2, 1817 +1.2, 1818 +2.3, 1819 +6.7, 1877 +1.7, 1903 +1.9, 2168 +0.5, 2169 -1.2, 2310 -4.8,
    2311 -3.3, 2355 +4.2.
  - Right (axis -0.7526, -0.6512, 0.0974): 141 -5.6, 142 -4.3, 143 -0.9, 144 -2.1, 301 -1.9, 302
    -2.1, 507 -2.7, 508 -0.2, 509 +1.2, 510 -1.8, 782 +6.8, 783 +2.6, 784 +5.2, 785 +8.6, 977
    +6.0, 1126 -8.2, 1127 -5.3, 1174 -5.9, 1175 -1.2, 1176 +2.0, 1177 -4.0, 1233 -6.7, 1234 -4.3,
    1235 +2.1, 1278 +1.9, 1279 +3.8, 1423 -2.2, 1468 -3.2, 1469 +1.0, 1530 +6.2, 1531 +7.4, 1625
    +7.5, 1880 +2.4, 1916 -1.3, 1984 -0.2, 1985 +3.0, 1997 -5.1, 2042 +3.8, 2123 +3.2, 2175 -1.8,
    2177 +6.9.
  - The groove had faces that hung over, so after the moves the triangles (1217, 1218, 2168) and
    (1469, 1530, 2123) turned over. Each collapses to one vertex at its middle
    (`bmesh.ops.pointmerge()`): (0.05273, -0.0981, 0.74559) and (-0.05316, -0.09847, 0.74565).
  - The middle of each eye object then moves along its axis onto the new surface in the bind (left
    -0.0058, right -0.00506 units), with `se.place_eyes()`. The sharp edges of each eye area (above
    30°) go from 26 to 6 on the left and from 28 to 7 on the right.
- **Arm roots.** On each side, no vertex lay between the trunk loop and the shoulder ring of the
  source. 8 large quads closed the gap (mean area 0.0015, tube faces 0.0002), and 8 quads and 8
  triangles joined the shoulder ring to the first tube ring. In a bent arm, these flat faces cut
  across the inside of the bend. Below, s is the distance from the shoulder joint along the upper
  arm bone, and each list goes around the arm in the order of its 16 columns.
  - The trunk loops (s -0.009 to 0.012): right 247, 248, 408, 407, 1448, 991, 992, 1801, left 55,
    54, 1698, 799, 1152, 1153, 111, 112. The shoulder rings (|x| 0.1223, s 0.047): right 1512,
    1215, 405, 406, 338, 337, 1316, 1800, left 56, 53, 1072, 1890, 1505, 466, 469, 795. Vertex k
    of each list is column 2k.
  - The 8 quads of each gap (right 145, 562, 626, 730, 1071, 1651, 1968, 2140, left 20, 493,
    749, 754, 1115, 1161, 2015, 2191) and the 16 faces from each shoulder ring to the first ring
    (right 540, 681, 751, 756, 862, 1046, 1299, 1516, 1532, 1536, 1539, 1547, 1644, 2200, 2202,
    2228, left 236, 468, 861, 863, 941, 1296, 1300, 1332, 1336, 1535, 1537, 1554, 1645, 1646,
    1836, 2293) go, and then their loose edges.
  - A copy of `tripo/rabbit.fbx` gives the source surface: the turn 90° about x, the scale
    1.001957, and a rise of 0.0806 put its trunk loops and shoulder rings on those of the mesh
    within 0.001 mm. The copy goes after the work.
  - Each shoulder ring gets a vertex in each odd column: a ray from the bone axis at s 0.047, at
    the angle of the odd vertex of the first ring, meets the source on the edge of the ring.
    Right 2853 (-0.1223, -0.0234, 0.5465), 2854 (-0.1223, 0.0057, 0.5467), 2855 (-0.1223, 0.0270,
    0.5649), 2856 (-0.1223, 0.0192, 0.5927), 2857 (-0.1223, -0.0012, 0.6067), 2858 (-0.1223,
    -0.0230, 0.6048), 2859 (-0.1223, -0.0414, 0.5900), 2860 (-0.1223, -0.0465, 0.5637). Left 2909
    (0.1223, 0.0049, 0.5468), 2910 (0.1223, -0.0240, 0.5463), 2911 (0.1223, -0.0464, 0.5634), 2912
    (0.1223, -0.0415, 0.5899), 2913 (0.1223, -0.0225, 0.6041), 2914 (0.1223, -0.0002, 0.6059), 2915
    (0.1223, 0.0206, 0.5922), 2916 (0.1223, 0.0270, 0.5649).
  - Each trunk loop edge gets a vertex in the odd column, at the middle of the edge. Two of them
    are at 0.7 of the edge from a sharp corner of the loop (right 2967 from 407 to 408, left 2980
    from 112 to 55), so that no thin face stays at the corner. Right 2965 (-0.0861, -0.0254,
    0.5356), 2966 (-0.0861, 0.0059, 0.5366), 2967 (-0.0822, 0.0252, 0.5473), 2968 (-0.0714,
    0.0254, 0.5904), 2969 (-0.0685, 0.0020, 0.6148), 2970 (-0.0675, -0.0245, 0.6109), 2971
    (-0.0695, -0.0489, 0.5845), 2972 (-0.0793, -0.0509, 0.5503). Left 2973 (0.0861, 0.0049,
    0.5366), 2974 (0.0861, -0.0274, 0.5356), 2975 (0.0793, -0.0528, 0.5503), 2976 (0.0695,
    -0.0509, 0.5845), 2977 (0.0675, -0.0254, 0.6100), 2978 (0.0685, 0.0029, 0.6139), 2979
    (0.0714, 0.0264, 0.5904), 2980 (0.0822, 0.0252, 0.5473).
  - Three rings of 16 vertices fill each gap. Vertex j of a ring lies where a ray from the bone
    axis through the point at 0.25, 0.5, or 0.75 of the way from the trunk loop to the shoulder
    ring in column j meets the source (the start of an odd column is the middle of its trunk
    loop edge). The mean s of the rings is 0.0126, 0.0242, and 0.0357. All new vertices lie on
    the source surface, so the T-pose form does not change.
    - Right, ring 1: 2861 (-0.0944, -0.0426, 0.5405), 2862 (-0.0952, -0.0246, 0.5393), 2863
      (-0.0959, -0.0088, 0.5366), 2864 (-0.0952, 0.0056, 0.5397), 2865 (-0.0944, 0.0215, 0.5420),
      2866 (-0.0908, 0.0272, 0.5566), 2867 (-0.0871, 0.0347, 0.5713), 2868 (-0.0842, 0.0226,
      0.5905), 2869 (-0.0812, 0.0127, 0.6109), 2870 (-0.0819, 0.0012, 0.6129), 2871 (-0.0827,
      -0.0113, 0.6148), 2872 (-0.0812, -0.0241, 0.6093), 2873 (-0.0797, -0.0367, 0.6041), 2874
      (-0.0827, -0.0464, 0.5857), 2875 (-0.0856, -0.0572, 0.5679), 2876 (-0.0900, -0.0505,
      0.5532).
    - Right, ring 2: 2877 (-0.1037, -0.0431, 0.5444), 2878 (-0.1042, -0.0238, 0.5426), 2879
      (-0.1047, -0.0088, 0.5385), 2880 (-0.1042, 0.0054, 0.5426), 2881 (-0.1037, 0.0225, 0.5454),
      2882 (-0.1013, 0.0260, 0.5599), 2883 (-0.0988, 0.0333, 0.5747), 2884 (-0.0969, 0.0199,
      0.5905), 2885 (-0.0949, 0.0108, 0.6090), 2886 (-0.0954, 0.0004, 0.6109), 2887 (-0.0959,
      -0.0117, 0.6129), 2888 (-0.0949, -0.0237, 0.6077), 2889 (-0.0939, -0.0352, 0.6031), 2890
      (-0.0959, -0.0439, 0.5869), 2891 (-0.0978, -0.0548, 0.5718), 2892 (-0.1008, -0.0502,
      0.5561).
    - Right, ring 3: 2893 (-0.1130, -0.0435, 0.5483), 2894 (-0.1133, -0.0236, 0.5445), 2895
      (-0.1135, -0.0088, 0.5405), 2896 (-0.1133, 0.0055, 0.5446), 2897 (-0.1130, 0.0235, 0.5488),
      2898 (-0.1118, 0.0262, 0.5624), 2899 (-0.1106, 0.0318, 0.5782), 2900 (-0.1096, 0.0186,
      0.5911), 2901 (-0.1086, 0.0088, 0.6070), 2902 (-0.1089, -0.0004, 0.6088), 2903 (-0.1091,
      -0.0122, 0.6109), 2904 (-0.1086, -0.0233, 0.6062), 2905 (-0.1081, -0.0338, 0.6021), 2906
      (-0.1091, -0.0421, 0.5882), 2907 (-0.1101, -0.0523, 0.5757), 2908 (-0.1116, -0.0486,
      0.5599).
    - Left, ring 1: 2917 (0.0944, 0.0215, 0.5420), 2918 (0.0952, 0.0047, 0.5397), 2919 (0.0959,
      -0.0108, 0.5366), 2920 (0.0952, -0.0269, 0.5376), 2921 (0.0944, -0.0440, 0.5405), 2922
      (0.0900, -0.0504, 0.5540), 2923 (0.0856, -0.0587, 0.5679), 2924 (0.0827, -0.0479, 0.5857),
      2925 (0.0797, -0.0382, 0.6041), 2926 (0.0812, -0.0248, 0.6086), 2927 (0.0827, -0.0113,
      0.6129), 2928 (0.0819, 0.0021, 0.6119), 2929 (0.0812, 0.0147, 0.6109), 2930 (0.0842, 0.0237,
      0.5904), 2931 (0.0871, 0.0347, 0.5713), 2932 (0.0908, 0.0288, 0.5557).
    - Left, ring 2: 2933 (0.1037, 0.0225, 0.5454), 2934 (0.1042, 0.0045, 0.5427), 2935 (0.1047,
      -0.0108, 0.5385), 2936 (0.1042, -0.0263, 0.5395), 2937 (0.1037, -0.0440, 0.5444), 2938
      (0.1008, -0.0479, 0.5577), 2939 (0.0978, -0.0558, 0.5718), 2940 (0.0959, -0.0449, 0.5869),
      2941 (0.0939, -0.0362, 0.6031), 2942 (0.0949, -0.0241, 0.6072), 2943 (0.0959, -0.0117,
      0.6109), 2944 (0.0954, 0.0014, 0.6099), 2945 (0.0949, 0.0127, 0.6090), 2946 (0.0969, 0.0211,
      0.5903), 2947 (0.0988, 0.0333, 0.5747), 2948 (0.1013, 0.0292, 0.5583).
    - Left, ring 3: 2949 (0.1130, 0.0235, 0.5488), 2950 (0.1133, 0.0047, 0.5447), 2951 (0.1135,
      -0.0108, 0.5405), 2952 (0.1133, -0.0252, 0.5429), 2953 (0.1130, -0.0440, 0.5483), 2954
      (0.1115, -0.0468, 0.5606), 2955 (0.1101, -0.0528, 0.5757), 2956 (0.1091, -0.0426, 0.5882),
      2957 (0.1081, -0.0342, 0.6021), 2958 (0.1086, -0.0233, 0.6057), 2959 (0.1091, -0.0122,
      0.6090), 2960 (0.1089, 0.0006, 0.6079), 2961 (0.1086, 0.0108, 0.6070), 2962 (0.1096, 0.0200,
      0.5909), 2963 (0.1106, 0.0318, 0.5782), 2964 (0.1118, 0.0283, 0.5616).
  - Faces: 16 quads in each row from the trunk loop to the first tube ring, 80 on each side. Each
    trunk face on a trunk loop edge takes the new vertex of that edge. The trunk faces around
    each new vertex then take the split into quads and triangles with the largest smallest
    corner at rest and in the bind, and with the smallest bend between neighbor faces in the
    moments of `pnpm pose-preview violinist`. The trunk faces that touch the loops are now:
    right (2965, 248, 249), (247, 2965, 249, 250), (249, 248, 2966, 766), (766, 2966, 408),
    (810, 759, 408, 2967), (2967, 407, 810), (390, 810, 407, 2968), (2968, 1448, 390), (1448,
    2969, 994, 390), (2969, 991, 994), (991, 2970, 993, 994), (2970, 992, 993), (2018, 993, 992,
    2971), (2971, 1801, 2007, 2018), (667, 1801, 2972), and (247, 667, 2972); left (2973, 808,
    55), (54, 851, 808, 2973), (851, 54, 2974), (1103, 851, 2974, 1698), (1698, 2975, 798),
    (2975, 799, 798), (796, 799, 2976), (1151, 796, 2976, 1152), (1151, 1152, 2977), (1154, 1151,
    2977, 1153), (1154, 1153, 2978), (2978, 111, 1154), (111, 110, 1154), (113, 110, 111, 2979),
    (2979, 112, 113), (112, 2980, 113), and (2980, 55, 809, 113). The triangle (1801, 993, 992)
    of the source had a corner of 15°, and its two new quads have no corner below 44°.
  - Weights: each new ring and each shoulder ring takes one weight row (`sa.set_weight_row()`):
    a ramp from the clavicle to the upper arm segments, with no trunk share. The upper arm share
    splits over the segments by the place of the ring between the middles of the segments, as in
    "Ring rows". The first tube ring keeps the upper arm alone.

    | Ring | s | Clavicle | Upper arm segment 0 | Upper arm segment 1 |
    |---|---|---|---|---|
    | 1 | 0.0126 | 0.70 | 0.300 | 0 |
    | 2 | 0.0242 | 0.55 | 0.343 | 0.107 |
    | 3 | 0.0357 | 0.40 | 0.246 | 0.354 |
    | Shoulder ring | 0.0473 | 0.20 | 0.045 | 0.755 |

  - Each trunk loop vertex gives its upper arm share to `upper_arm_seg0` (its s is below the
    middle of segment 0), and half of each trunk share (chest, spine1, neck, head) to the
    clavicle. In the play, the app turns the clavicle forward up to 40° (right) and 16° (left).
    With the full trunk share on the loop, the first row of each root folded in each play moment.
    Each new trunk loop vertex takes the blend of the rows of its two loop neighbors at its place.
    The rows of the loops are now: right 247 (clavicle 0.535, segment 0 0.255, spine1 0.118,
    chest 0.092), 248 (0.518, 0.292, spine1 0.115, chest 0.075), 408 (0.543, 0.249, chest 0.126,
    spine1 0.082), 407 (0.518, 0.417, chest 0.065), 1448 (0.487, 0.378, head 0.069, neck 0.066),
    991 (0.381, 0.538, neck 0.081), 992 (0.474, 0.383, neck 0.075, head 0.068), 1801 (0.552,
    0.283, chest 0.107, head 0.059); left 55 (0.543, 0.249, chest 0.126, spine1 0.082), 54 (0.515,
    0.294, spine1 0.115, chest 0.075), 1698 (0.525, 0.263, spine1 0.119, chest 0.093), 799 (0.513,
    0.311, chest 0.112, spine1 0.064), 1152 (0.453, 0.400, neck 0.075, head 0.072), 1153 (0.372,
    0.544, neck 0.084), 111 (0.484, 0.379, neck 0.069, head 0.069), 112 (0.517, 0.418, chest
    0.065).
  - The new faces of each root have a mean area of 0.0002, as the tube faces, and no corner below
    18°. In the app rest, each new ring keeps 95 to 97 % of its girth in the bind. `pnpm
    fold-probe violinist` stays at 12.2 % of the play samples with a fold and at most 2 faces, and
    no root face folds. The 8 sides of the source section and the near right angle where the arm
    meets the trunk stay, because each new vertex lies on the source surface.

The facts of the body:

- **`height` 0.827117.** The standing shoulder joints in the app, in meters: the shoulder joint at
  z 0.5776 times 1.43199. Thus the scale stays 1.43199 m for each unit, as for the old rabbit.
- **`crease` 35.** The crease angle of the fur, in degrees.
- **`backRoom` 0.0889.** The chair keeps the depth of the old chair (0.237 m).

The property `seat` is the chair of `rabbit.json` with the back edge at -0.10 units (front -0.03,
half width 0.16), and `hinges` holds the elbow axes of the bind arms of the last rig. The head
height `H` is 0.3027 m.

The joints, in Blender axes of the rest: the hips joint (0, 0, 0.2856), the shoulder (±0.075,
-0.01, 0.5776), the elbow (±0.2061, -0.0097, 0.5781), the wrist (±0.3265, -0.0088, 0.5835), the
fingers from (±0.3615, -0.0083, 0.5816) to the paw tip (±0.388, -0.0088, 0.5756), the hip
(±0.072, 0, 0.2656), the knee (±0.0615, 0.01, 0.1442), the ankle (±0.0628, 0.0341, 0.055), the
toes from (±0.0808, -0.0359, 0.018) to (±0.0858, -0.0709, 0.008), and the tail from (0, 0.075,
0.3706) to (0, 0.16, 0.3706). The head goes from (0, -0.022, 0.6356) to (0, -0.022, 0.8356).

In the seated bind, the seat top is 0.250 m above the soles and the hips joint 0.346 m. In the
rest, the mid thigh is 0.452 and the mid shin 0.261 of the width of the head at the eyes, as on
the source.

## The module

`pnpm studio-body rabbit` writes `src/models/studio/rabbit.ts` from `rabbit.rig.glb`. The eye
objects of `rabbit.blend` give the pea eyes, and the armature gives the facts of the body. The
module is 40.7 KB after gzip (the module of the last hand rig 46.5 KB).

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
Until phase B of `rabbit.blend` (below) ends, this file is the export of the last rig.

| Item | Value |
|---|---|
| Size | 729,840 bytes |
| SHA-256 | `95ecc33a11855851154d26135ef01d6bf2c86777022fc5d2b8d02a43e7cfb9fa` |
| Form | The mesh of `rabbit.blend` in its seated bind (below). The seat top is 0.250 m high, and the chair is 0.42 m wide and 0.237 m deep, as the chair of the old rabbit |
| Faces | 5,877 triangles, of them 75 gloss (the nose) |
| Extras | `eyes`: the middle, the direction, and the size of each eye object. `body`: the facts of the body of the armature |
| Shapes | The arm-down shape of each arm and the straight legs of each side, which the export calculates, and the keys `arm_raise_R`, `arm_raise_R2`, and `arm_raise_L` (below) |

## rabbit.blend

The hand rig of the rabbit (design 4.4, "Hand rig"). Each edit of the mesh is a point edit by hand
in a live Blender 5.2, with its vertex ids and values below. The work has two phases. Phase A
makes the form of the mesh in the T-pose. Phase B fits the armature, the weights, the seated bind,
the keys, the eyes, and the colors again. Until phase B ends, the armature `rabbit_rig`, its
Action `bind`, and the eye objects are those of the last rig. The mesh has no weights, keys, or
colors, and `rabbit.rig.glb` and the module are the export of the last rig.

| Item | Value |
|---|---|
| Size | 331,759 bytes |
| SHA-256 | `62332835b45543a85dec550e9455e7fee60156cc2abd5e0b391d4adecdf8dfdb` |
| Origin | Made by hand in Blender 5.2 from `tripo/rabbit.fbx` |
| License | CC BY-NC 4.0, as the FBX file |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the ear tips of the source, the soles at z = 0, the animal faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `rabbit`: the FBX mesh with the edits below, with flat faces and no custom normals. 2,387 vertices and 2,595 faces |
| Armature | The object `rabbit_rig` of the last rig, with the properties `palm`, `seat`, `hinges`, and the facts of the body (below). Phase B fits its bones again |

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

The facts of the body on the armature, from the last rig:

- **`height` 0.807929.** The standing shoulder joints in the app, in meters: the joints of the
  mesh (up 0.497 of the source) raised 0.0672 units by the longer legs of the last rig. Thus the
  scale is 1.43199 m for each unit, as for the old rabbit.
- **`crease` 35.** The crease angle of the fur, in degrees.
- **`backRoom` 0.0889.** The chair keeps the depth of the old chair (0.237 m).

The property `seat` is the chair of `rabbit.json` with the back edge at -0.10 units (front -0.03,
half width 0.16), and `hinges` holds the elbow axes of `rm.bind_hinges()` of the last rig.

The joints of the last rig, in the studio axes of the source (x, up, forward), before the stretch
of the legs:

- **Trunk and head.** The joints of `tools/mesh-rigs/rabbit.json`, with the head end on the top of
  the skull (0, 0.755, 0.022) and the ear tips (±0.138, 0.995, -0.06).
- **Arm.** The shoulder (0.075, 0.497, 0.010), the elbow (0.202, 0.4975, 0.0097) at 0.39 of the
  tube, and the wrist (0.3265, 0.5029, 0.0088) in the middle of the wrist ring, on arms 1.18 times
  longer than the source. The fingers go from (0.3615, 0.501, 0.0083) to the paw tip (0.388,
  0.495, 0.0088).
- **Leg.** The hip (0.072, 0.185, 0), the knee (0.066, 0.1156, -0.0057) in the middle of the knee
  ring, the ankle (0.067, 0.055, -0.025), and the toes from (0.085, 0.018, 0.045) to (0.09,
  0.008, 0.08).
- **Tail.** From (0, 0.29, -0.075) to (0, 0.29, -0.16), through the tail ball.

The last rig, in meters (1.43199 m for each unit): in the seated bind, the seat top is 0.250 m,
the hips joint 0.3285 m above the soles, the mid thigh girth 0.517 m, and the mid shin girth
0.259 m. Its head height `H` is 0.3027 m.

## The module

`pnpm studio-body rabbit` writes `src/models/studio/rabbit.ts` from `rabbit.rig.glb`. The eye
objects of `rabbit.blend` give the pea eyes, and the armature gives the facts of the body. The
module is 46.5 KB after gzip (the old module 28.6 KB), because the mesh has 5,877 triangles in
place of 4,035.

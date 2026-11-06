# Polar bear model

This folder holds the T-pose source mesh of the polar bear, a copy with new arms, a copy with new
arms and legs, their weights, and the rigged copy. The app does not serve these files. It loads
the module `src/models/studio/polar-bear.ts`, which this chain writes:

```text
polar-bear-tpose.glb                       source mesh
   │  tools/blender/polar_bear_arms.py     new arms and painted weights
   v
polar-bear-arms.glb + polar-bear-weights.json
   │  tools/blender/polar_bear_legs.py     new legs, weights of the kept vertices
   v
polar-bear-limbs.glb                       `source` of tools/mesh-rigs/polar-bear.json
  + polar-bear-limbs-weights.json          `paintedWeights` of the same config
   │  pnpm rig-mesh polar-bear             bone heat from polar-bear-arms.glb (`heatSource`)
   v
polar-bear-tpose.rig.glb                   rigged mesh
   │  pnpm studio-body polar-bear
   v
src/models/studio/polar-bear.ts            studio body of the app
```

`docs/agents/rigging.md` gives the steps of the chain. The polar bear has the same eye size as the
bear.

The folder also holds a hand rig in progress (design 4.4, "Hand rig"): its source in `tripo/` and
its `.blend` in `hand-rig/`. The app does not use them, and `polar-bear-tpose.rig.glb` stays the
rig of the app. In `hand-rig/`, no tool takes the `.blend` for the rig of the app (`handRigOf()` of
`tools/glb-swap.ts`), so `pnpm rig-mesh polar-bear` still runs.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `polar-bear-tpose.glb` | Source mesh (below) | None |
| `polar-bear-arms.glb` | Copy of the source with new arms | `polar_bear_arms.py` |
| `polar-bear-weights.json` | Weights of the same Blender run | `polar_bear_arms.py` |
| `polar-bear-limbs.glb` | Copy of `polar-bear-arms.glb` with new legs | `polar_bear_legs.py` |
| `polar-bear-limbs-weights.json` | Weights of the same Blender run | `polar_bear_legs.py` |
| `polar-bear-tpose.rig.glb` | Output of the rig | `pnpm rig-mesh polar-bear` |

The license of each copy is the license of the source.

The files of the hand rig, which the app does not use:

| File | Origin | Rebuild |
|---|---|---|
| `tripo/polar-bear-tpose.fbx`, `tripo/polar-bear-tpose.fbm/` | Source mesh with quad faces, and its four textures (below) | None |
| `hand-rig/polar-bear.blend` | Made by hand in Blender from `tripo/polar-bear-tpose.fbx` (below). License as the FBX file | None: edit it in Blender |

## polar-bear-tpose.glb

The mesh has no skeleton. The arms are in a T-pose: out to the sides and level, free of the trunk.

| Item | Value |
|---|---|
| Size | 17,143,328 bytes |
| SHA-256 | `b09c1c94f52737839c3ca155521ec5df43e32511258256aea880dd828aacc5f7` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,144 triangles and 4,518 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |

With a weld at 1e-5, in the units of the studio, the mesh has 1,574 vertices in one part, no open
edge, and 251 faces with a corner angle below 10°. The box is x -0.5 to 0.5, y 0 to 1, and
z -0.177 to 0.177. Each arm is free of the trunk beyond x 0.145, from y 0.65 to 0.79.

## polar-bear-arms.glb and polar-bear-weights.json

| Item | Value |
|---|---|
| `polar-bear-arms.glb` | 1,228,632 bytes, SHA-256 `1b8103ae58438f23dcae4bf3a3d6f53e43770c1e1fda930ea695a58454b6ac62` |
| Mesh | 2,048 vertices after a weld at 1e-5, 4,092 triangles: on each arm a tube of 15 rings of 16 vertices, joined to the trunk and the paw with Bridge Edge Loops |
| Material | One material with one base color JPEG of 4096 × 5120 pixels: the atlas of the source, and a strip of 1024 pixels on top with the fur color of the source arms, baked onto the new faces. No metallic-roughness texture |
| `polar-bear-weights.json` | 456,038 bytes, SHA-256 `58e5e7a56d643f4a3493f3ab1a3559288bd045fd271e3caf499a3f0b3df80ca7` |
| Weights | The automatic weights of Blender with the Weight Paint fixes of the script, on the studio bones and the arm segments and helpers (`armSegments` of the config) |

The script puts new quad faces on each arm from the shoulder line to the wrist. The faces of the
paws, the trunk, the legs, and the head are the faces of the source. The new arm surface lies on
the old one, with the arm length of the source. The wrist cut stands parallel to the last ring of
each tube. The thin faces of each wrist band collapse, and the band is smoothed and put back on
the old surface. Thus the wrist shows no crease.

`polar_bear_legs.py` reads both files. The rig takes the bone heat of each kept vertex from
`polar-bear-arms.glb` (`heatSource` of the config).

## polar-bear-limbs.glb and polar-bear-limbs-weights.json

| Item | Value |
|---|---|
| `polar-bear-limbs.glb` | 1,258,044 bytes, SHA-256 `49795e987c8215777b5229f8a1792240838bd5f72291c2f9407e43004505aa8a` |
| Mesh | 2,530 vertices after a weld at 1e-5, 5,056 triangles: on each leg a tube of 10 rings of 20 vertices, joined to the haunch and the foot with Bridge Edge Loops |
| Material | One material with one base color JPEG of 4096 × 5120 pixels: the atlas of `polar-bear-arms.glb`, with the fur color of the source legs baked into the strip on top, beside the arm image |
| `polar-bear-limbs-weights.json` | 563,009 bytes, SHA-256 `726946e540721eefa3426f56bc9a3c36c859576aee3b35154ba3683a0c893549` |
| Weights | The weights of `polar-bear-weights.json` for each kept vertex, and the automatic weights of Blender for each new vertex, for `paintedWeights` of the config |

The script puts new quad faces on each leg from the haunch line, below the crotch, to the ankle.
Long faces of the source ran from the haunch to the heel, so the seated leg was a wedge with no
hollow behind the knee. The faces of the feet, the trunk, the haunch, the arms, and the head stay.
The new leg surface lies on the old one, with the leg length of the source. The rig keeps that
length (`legFactor` 1), so that the body keeps the part ratios of the mesh.

## Rebuild

Each run gives the same bytes:

```bash
blender -b --factory-startup -P tools/blender/polar_bear_arms.py
blender -b --factory-startup -P tools/blender/polar_bear_legs.py
shasum -a 256 assets/models/polar-bear/*.glb assets/models/polar-bear/*.json
```

## polar-bear-tpose.rig.glb

| Item | Value |
|---|---|
| Size | 957,836 bytes |
| SHA-256 | `dae800f8004177639cd9b38d5dffcb08340e44083081a847416d396e971fe7e0` |
| Bind | The role-neutral bind (design 4.4): the arms of the source, straight (`studio.straightArms` of the config), with the elbow axes of the old bent bind (`studio.bindArms`), and the bind paws supinated so that the largest paw twist of the roles of the cast matrix and the piano is smallest (`studio.bindSupination`) |
| Shapes | The arm-down shape of each arm, the straight legs of each side, and a `raise` shape of each bent elbow of the piano hold |
| Arm roots | The faces under each arm root move rigidly (`weights.rigidPainted`). Without the rule, they fold when the arm hangs at rest and in the lift |

A run of `pnpm rig-mesh polar-bear` gives the same bytes.

## tripo/polar-bear-tpose.fbx

A retopology of `polar-bear-tpose.glb` with Tripo: the same bear in the same T-pose, with quad
faces. The FBX file keeps the quads (a GLB file of the same mesh holds only triangles). In the
units of the studio (1 unit high), each vertex of the FBX mesh lies at most 0.0064 units (mean
0.0013) from the surface of the GLB mesh. Each GLB vertex lies at most 0.0059 units from the FBX
surface, and the two boxes agree within 0.002 units. The form is mirror symmetric, but the faces
of the left and the right leg and armpit differ.

The folder `polar-bear-tpose.fbm/` keeps the JPEG names of the zip file. The FBX file links
`polar_bear.fbm/<name>`, and the FBX import of Blender finds each JPEG by its name next to the FBX
file.

| Item | Value |
|---|---|
| Origin | Made with Tripo (a retopology of `polar-bear-tpose.glb`), and given by the project author on 2026-11-05 (`polar_bear.zip`, SHA-256 `fde047fd52387cc06b2e71cc9619cd1fee1b114ca1f2746614d76f1a79c2b661`). The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary |
| Contents | One mesh object `output_unwrapped`, turned 90° about X (the FBX axes have Y up), with no armature and no animation. 2,461 vertices and 2,656 faces: 2,260 quads and 396 triangles (4,916 triangles). One UV layer. One material that links the four textures |
| Parts | One connected part. No two vertices lie within 0.001 units. 6 open edges: a crack of zero width at the back of each thigh, where one vertex lies at the middle of an edge of the other side |
| Box | After the turn: x ±0.4990, y ±0.1787, and z 0 to 0.9980 in the units of the file. The bear faces -y |

| File | Size | Pixels | SHA-256 |
|---|---|---|---|
| `polar-bear-tpose.fbx` | 225,280 bytes | | `0bcc6f2946ad69f1592cafc1a5ae0a9f583d878e8abfd5f6e8432598dc5f945e` |
| `polar-bear-tpose.fbm/polar_bear_basecolor.jpg` | 913,087 bytes | 4096 × 4096 | `c63132f98c8142ad5165978fa30d5978f17661c35381016e1d0d6d6c159f3946` |
| `polar-bear-tpose.fbm/polar_bear_metallic.jpg` | 348,066 bytes | 2048 × 2048 | `c760954e644e72f2bf2d646f929249e7cc7244322b5f44eddbcd1081795f5e24` |
| `polar-bear-tpose.fbm/polar_bear_normal.jpg` | 510,600 bytes | 2048 × 2048 | `3dd83e580acb8d84675339dc89b2de9eee7e43d6d9ae9bb7d5e50d96e761aee8` |
| `polar-bear-tpose.fbm/polar_bear_roughness.jpg` | 181,275 bytes | 2048 × 2048 | `4a50a8a8ca4bd0877a1de4fdf836f711017d4aaf0a40208d9055d4786e06ff0c` |

## hand-rig/polar-bear.blend

This file is the form step of the hand rig of the polar bear (design 4.4, "Hand rig"). It is made
in a live Blender 5.2 from `tripo/polar-bear-tpose.fbx`, and it holds only the mesh and its face colors. The armature,
the weights, the bind, the keys, the pea eyes, and the facts of the body come in the next step.
Until then `pnpm rig-export` stops on this file. Each edit below is a point edit with a standard
operator of Blender. No vertex of the source moves, except the one vertex that Dissolve Vertices
removes. Each id is the id in the mesh before its edit.

| Item | Value |
|---|---|
| Size | 253,990 bytes |
| SHA-256 | `5f2f9f936c16c0e0cb441ab1f1fa4332a6ea5f0a76dcb6c20f0648031f41b341` |
| Origin | Made by hand in Blender 5.2 from `tripo/polar-bear-tpose.fbx` |
| License | CC BY-NC 4.0, as the FBX file |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the top of the skull, the soles at z = 0, the bear faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `polar_bear`: 2,754 vertices and 2,968 faces (2,536 quads and 432 triangles, 5,504 triangles), flat faces, no custom normals, and the surface of `add_surface()` (below). 42 faces are gloss (the nose) |
| Materials | The slots `fur` and `gloss`. Each reads the face attribute `color` |
| Form | Each new vertex lies within 0.0014 units of the surface of the FBX mesh, and the removed vertex 2013 within 0.0014 units of the new surface |

The edits, in the order of the work:

- **Import.** The turn of the file (90° about x) and the scale 1.001957 (1 / 0.998047) go into the
  mesh. No two vertices lie within 0.001 units, so nothing merges. The custom normals and the
  attribute `sharp_edge` go, and each face is flat.
- **Cracks.** The 6 open edges are a crack of zero width at the back of each thigh (up 0.17 to
  0.22). Vertex 1386 lies at the middle of edge 225-642 (left), and vertex 509 at the middle of
  edge 243-242 (right), with no face between. Subdivide (1 cut) of the edge and Merge at Last of
  the new vertex into 1386 (509) close each crack. Connect Vertex Path 1386-226 (509-244) splits
  the face of five corners into a quad and a triangle.
- **T-fills.** 25 triangles fill a T-junction. In each, the corner M lies 0.8 to 4.6 thousandths
  of a unit from the edge A-B, and the corner at M is 157° to 175°. Each shows as a dark line in
  flat shading, such as the line on the chest near the left shoulder. Dissolve Edges on A-B joins
  the sliver to the face across. Then Connect Vertex Path from M to one far corner splits that face
  into a triangle and a quad. That corner gives the larger smallest angle and no corner above 160°.
  At face 1113, vertex 2013 has only two edges, so Dissolve Vertices on 2013 is the fix. The fix
  of 1098 comes after the arm cuts and before the knee cuts.

  | Face | A, M, B | Place | Connect |
  |---|---|---|---|
  | 2183 | 960, 65, 66 | front of the left shoulder | 65-1212 |
  | 65, 66, 130 | 210, 235, 219 / 210, 220, 236 / 236, 429, 430 | back of the left knee | 235-218, 220-602, 429-220 |
  | 121, 1544 | 393, 392, 399 / 1407, 2240, 22 | left ankle loop, back and front | 392-1095, 2240-451 |
  | 332, 617 | 971, 968, 970 / 902, 1264, 962 | side of each hip | 968-311, 1264-961 |
  | 796, 801 | 1071, 1717, 560 / 559, 1726, 1701 | back of the left upper arm | 1717-1701, 1726-1717 |
  | 1159, 1161 | 1173, 436, 1712 / 408, 1142, 1141 | back of the right upper arm | 436-408, 1142-436 |
  | 1369 | 1803, 1802, 2109 | back of the right shoulder | 1802-2108 |
  | 1113 | 722, 2013, 1725 | back of the right armpit | Dissolve Vertices 2013 |
  | 1766, 2096 | 1129, 1779, 1130 / 694, 695, 1586 | side of the belly | 1779-1127, 695-1955 |
  | 1885 | 1248, 1263, 1191 | front of the right shin | 1263-847 |
  | 2321, 2576 | 2301, 855, 857 / 1974, 2439, 2438 | base of each ear | 855-1983, 2439-1984 |
  | 1505, 1529, 1820, 1854, 1988 | 2216, 2218, 2217 / 2010, 2228, 2011 / 159, 2215, 487 / 100, 835, 101 / 1430, 1429, 1668 | feet and the left sole | 2218-1817, 2228-262, 2215-940, 835-99, 1429-547 |
  | (after the arm cuts) | 1097, 1098, 707 | back of the right knee | 1098-1074 |

- **Straight corners.** 16 quads have a corner above 160°. In 7 of them, the split of the export
  (`calc_loop_triangles()`) gave a sliver. Connect Vertex Path from that corner to the opposite
  corner splits each quad into two triangles. The pairs are 1822-1329 (back of the left armpit),
  1719-1156 and 435-1092 (under each upper arm), 585-1310 (back of the left haunch), 2395-1119
  (forehead), 46-248 and 1969-1525 (top of the head), 1201-705 (left paw), and 1225-1226,
  1332-77, 1818-1820, 1897-547, 2213-159, 1540-2187, 2311-2301, 2106-2211 (feet). After this step,
  no triangle of the export has a corner above 160°.
- **Arm rings.** The forearm had one ring between the elbow ring at x 0.2705 and the wrist ring at
  x 0.4135. The rings were 1.4 and 1.7 ring radii apart. Loop Cut (2 cuts) of the band from x
  0.2705 to 0.3412 adds the rings at x 0.294 and 0.318 (edge 1494 left, 2905 right). Loop Cut (3
  cuts) of the band from x 0.3412 to 0.4135 adds the rings at x 0.360, 0.378, and 0.396 (edge 52
  left, 309 right). This loop stops at two long triangles at the back of the forearm (faces 662
  and 672 on the left). A second Loop Cut (3 cuts, edge 428 left, 4035 right) cuts the strip
  between them. In each triangle, three Connect Vertex Path close the rings (the tips are 791 and
  810 on the left, 1537 and 502 on the right). Each triangle becomes three quads and a small tip
  triangle.
- **Knee rings.** The knee (up 0.15 in `tools/mesh-rigs/polar-bear.json`) had a band of long
  faces above the ankle loop. On the outer side of the left leg, one face went from up 0.102 to
  0.194. The left band has 29 faces above the ankle loop (25 vertices at up 0.102), with 7
  triangles and a quad with one corner on the loop. A Loop Cut stops at each triangle, and at that
  quad it turns up the leg. Thus Subdivide (2 cuts) of the 29 edges from the loop to the next row
  makes the rings around the whole band. It is the same subdivision as a Loop Cut. The right leg
  has one more row (29 vertices, up 0.112 to 0.137). Subdivide (1 cut) of the 30 edges above that
  row makes its ring. Connect Vertex Path 354-2690 splits one face of five corners on the left.
- **Surface.** `sa.add_surface(polar_bear, 'polar-bear',
  'assets/models/polar-bear/tripo/polar-bear-tpose.fbm/polar_bear_basecolor.jpg', eye_fans=False)`
  of `tools/blender/studio_armature.py` ran one time. The 3 dark eye faces on each side take the
  fur color, and the 42 faces of the nose are gloss. Their 49 vertices form the vertex group `head`.
- **Colors.** Faces 121 and 2920 at the back of the left knee came out black. After the cuts,
  their corners had the UVs of two islands of the texture. Each takes the mean `color` and
  `color_base` of its fur neighbors (2913, 2919, 2922 and 187, 2906, 2919, 2922).

The rings of each arm after the cuts (the right arm is the mirror), with the spacing in ring
radii. The joints of `tools/mesh-rigs/polar-bear.json` are the shoulder at x 0.13, the elbow at
0.29, and the wrist at 0.435.

| x | 0.156 | 0.180 | 0.211 | 0.244 | 0.2705 | 0.294 | 0.318 | 0.341 | 0.360 | 0.378 | 0.396 | 0.4135 | 0.433 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Vertices | 17 | 17 | 16 | 15 (part) | 19 | 20 | 20 | 20 | 21 | 21 | 21 | 20 | 20 (paw line) |
| Spacing | | 0.39 | 0.53 | 0.60 | 0.48 | 0.45 | 0.46 | 0.47 | 0.38 | 0.39 | 0.41 | 0.42 | 0.49 |

The rows of the knee after the cuts, at four sides of each leg (up, in units). The ankle rows at up
0.10, 0.06, and 0.04 get no cut.

| Side | Left leg | Right leg |
|---|---|---|
| Front | 0.157, 0.138, 0.122, 0.102 | 0.157, 0.135, 0.115, 0.098 |
| Outer | 0.194, 0.162, 0.132, 0.102 | 0.194, 0.163, 0.130, 0.102 |
| Back | 0.151, 0.134, 0.120, 0.102 | 0.151, 0.142, 0.132, 0.098 |
| Inner | 0.136, 0.124, 0.114, 0.102 | 0.136, 0.126, 0.115, 0.091 |

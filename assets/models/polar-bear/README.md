# Polar bear model

This folder holds the hand rig of the polar bear, which the app uses, and the files of the older
rig chain, which the app no longer uses. The app does not serve these files. It loads the module
`src/models/studio/polar-bear.ts`, which this chain writes:

```text
tripo/polar-bear-tpose.fbx                 source mesh with quad faces
   │  edits by hand in a live Blender      form step, then rig step (below)
   v
polar-bear.blend                           hand rig (design 4.4, "Hand rig")
   │  pnpm rig-export polar-bear
   v
polar-bear.rig.glb + polar-bear.rig.json   rigged mesh and its text summary
   │  pnpm studio-body polar-bear
   v
src/models/studio/polar-bear.ts            studio body of the app
```

`docs/agents/rigging.md` gives the steps of a hand rig. The `.blend` lies beside the GLB file of
the app, so the tools take it for a hand rig (`handRigOf()` of `tools/glb-swap.ts`), and
`pnpm rig-mesh polar-bear` stops.

The older chain made `polar-bear-tpose.rig.glb` from `polar-bear-tpose.glb` with
`tools/blender/polar_bear_arms.py`, `tools/blender/polar_bear_legs.py`, and
`pnpm rig-mesh polar-bear`. Its files stay in the folder as unused files.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `tripo/polar-bear-tpose.fbx`, `tripo/polar-bear-tpose.fbm/` | Source mesh with quad faces, and its four textures (below) | None |
| `polar-bear.blend` | Made by hand in Blender from `tripo/polar-bear-tpose.fbx` (below). License as the FBX file | None: edit it in Blender |
| `polar-bear.rig.glb` | Export of `polar-bear.blend`. License as the FBX file | `pnpm rig-export polar-bear` |
| `polar-bear.rig.json` | Text summary of the export, for diffs | The same run |

The files of the older chain, which the app does not use:

| File | Origin | Rebuild |
|---|---|---|
| `polar-bear-tpose.glb` | Source mesh (below) | None |
| `polar-bear-arms.glb` | Copy of the source with new arms | `polar_bear_arms.py` |
| `polar-bear-weights.json` | Weights of the same Blender run | `polar_bear_arms.py` |
| `polar-bear-limbs.glb` | Copy of `polar-bear-arms.glb` with new legs | `polar_bear_legs.py` |
| `polar-bear-limbs-weights.json` | Weights of the same Blender run | `polar_bear_legs.py` |
| `polar-bear-tpose.rig.glb` | Output of the rig of 54e171ad | `pnpm rig-mesh polar-bear` at 54e171ad, before the hand rig |

The license of each copy is the license of the source.

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

At 54e171ad, a run of `pnpm rig-mesh polar-bear` gave the same bytes. Now `pnpm rig-mesh polar-bear`
stops, because the hand rig lies beside the GLB file of the app.

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

## polar-bear.blend

The hand rig of the polar bear (design 4.4, "Hand rig"), made in a live Blender 5.2 from
`tripo/polar-bear-tpose.fbx` in two steps: the form step (the mesh and its face colors) and the
rig step (the armature, the weights, the seated bind, the pea eyes, and the facts of the body).

| Item | Value |
|---|---|
| Size | 339,898 bytes |
| SHA-256 | `2d72ba2a58088a40e6fe6866fda939b8ba89bd25977c844182ee6ead0f65afe9` |
| Origin | Made by hand in Blender 5.2 from `tripo/polar-bear-tpose.fbx` |
| License | CC BY-NC 4.0, as the FBX file |
| Objects | The mesh `polar_bear`, the armature `polar_bear_rig`, and the eye objects `eye_L` and `eye_R`. No object has a transform |

### Form step

The form step was the file `hand-rig/polar-bear.blend` of f1bb5f5e. It held only the mesh and its
face colors. Each edit below is a point edit with a standard operator of Blender. No vertex of the
source moves, except the one vertex that Dissolve Vertices removes. Each id is the id in the mesh
before its edit.

| Item | Value |
|---|---|
| Size | 253,990 bytes |
| SHA-256 | `5f2f9f936c16c0e0cb441ab1f1fa4332a6ea5f0a76dcb6c20f0648031f41b341` |
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

### Rig step

The rig step added the armature, the weights, the seated bind, the pea eyes, and the facts of the
body in the live Blender. Each value lives only in the `.blend`, and
`tools/mesh-rigs/polar-bear.json` keeps the values of the older chain. The places are in the axes
of Blender (x left, y back, z up), in units.

**Bones.** The armature `polar_bear_rig` has the 50 bones of the older body: the 30 body bones
with the ears and one tail bone, and the 20 arm segments and helpers (no `tail_tip`, no `jaw`).
The parents are those of `STUDIO_PARENTS`. `root`, the upper arms, the forearms, and the forearm
twist bones hold no weight. Each joint lies at the middle of a ring of the mesh:

| Joint | Head (left side) | Note |
|---|---|---|
| Hips, spine, spine1, chest, neck | (0, 0.01, 0.29), (0, 0.015, 0.38), (0, 0.01, 0.48), (0, 0.015, 0.58), (0, 0.03, 0.68) | The trunk line of the older config |
| Head | (0, 0.02, 0.79), tail (0, -0.04, 1.0) | |
| Ear | (0.07, -0.02, 0.95), tail (0.082, -0.02, 0.995) | The middle of the ear ring |
| Clavicle | (0.03, 0.035, 0.70) | |
| Shoulder | (0.13, 0.036, 0.725) | On the axis of the rings at x 0.156 and 0.180 |
| Elbow | (0.2935, 0.0391, 0.7312) | The middle of the ring at x 0.294, between the rings at 0.2705 and 0.318 |
| Forearm twist | (0.363, 0.0303, 0.73255) | Halfway from the elbow to the wrist |
| Wrist | (0.4325, 0.0215, 0.7339) | The middle of the ring at x 0.433 (the paw line) |
| Fingers | (0.465, 0.019, 0.729), tail (0.495, 0.015, 0.72) | |
| Hip | (0.095, 0.004, 0.28) | On the line of the middles of the leg cuts at z 0.14 to 0.20 |
| Knee | (0.113, 0.016, 0.145) | The middle of the knee ring at z 0.141 |
| Ankle | (0.113, 0.03, 0.065) | |
| Toes | (0.12, -0.05, 0.02), tail (0.12, -0.11, 0.003) | |
| Tail | (0, 0.14, 0.29), tail (0, 0.185, 0.285) | In the tail ball |

The arm segments split the upper arm and the forearm into four equal parts, and each helper
starts at its joint with the length 0.03 (`segment_joints()` of `tools/blender/rig_mesh.py`). The
right side mirrors the left side. `sa.fix_rolls(rig)` gave each bone the roll of its hint, with
`palm` (0, 0, -1). A hip joint at x 0.11 put the thigh 6.2° off the line of the hips bone, and
Blender then stores the frame of the thigh with a shear of 5e-5 (the export stops above 1e-5).
At x 0.095, the line of the leg cuts, the thigh is 11.5° off the line, with a shear of 1.5e-6.

**Facts.** The armature has `height` 1.491763 (the standing shoulder joints at 0.725 u, 2.057604
m for each unit), `crease` 40, `colorBlend` 0.05, `palm`, `seat` {prop `bench`, front -0.05,
back -0.2, halfWidth 0.25}, and `hinges` L (-0.576037, -0.749779, -0.325597) and R (-0.576037,
0.749779, 0.325597): the unit cross product of the bind upper arm and the forearm direction
(0.316246, 0.757051, 0.571719) of `studio.bindArms` of the older config, in the studio axes.

**Weights.** In the order of the work, with the rest pose of the armature:

1. Parent with Automatic Weights, then Limit Total 4 and Normalize All on all groups.
2. The 49 vertices of the gloss nose: `sa.set_weight_row(mesh, v, {'head': 1.0})`.
3. Ears: the ear share stays within 0.028 of the ear middle (±0.072, -0.02, 0.972) and falls
   linearly to 0 at 0.038. The rest goes to `head` (402 rows). Automatic weights gave the ear
   bones the brow and the eyes.
4. Tail: the tail share times 1 - smoothstep(d, 0.04, 0.06) of the distance d from (0, 0.165,
   0.29). The rest goes to `hips`. Back of the haunch: the thigh share times smoothstep(z, 0.20,
   0.29) · smoothstep(y, -0.02, 0.05) goes to `hips`, so that the rump stays with the pelvis on
   the bench.
5. Hip line: each thigh share is at most 1 - smoothstep(z, 0.19, 0.37). The rest goes to `hips`.
   Automatic weights gave the thigh 0.5 to 0.7 of the flank up to z 0.40, and the flank folded
   into a slit at the outer right hip in the pedal pose. The band 0.21 to 0.31 left a ledge at
   the top of the seated thigh (sharpest edge in the chord 99°, and 58° with this band). The last
   run of steps 4 and 5 starts again from the automatic weights of step 1 for the 480 vertices
   with a thigh share above z 0.16, and step 13 then runs again.
6. Shoulder tops: each head share is at most 1 - s · (1 - smoothstep(z, 0.77, 0.83)), with s =
   smoothstep(|x|, 0.06, 0.10). The rest goes to `neck` times 1 - k and to the clavicle of the
   side times k, with k = smoothstep(|x|, 0.06, 0.11) (30 rows, no nose vertex).
7. Arm rings: each ring of each arm from x 0.156 to 0.4496 takes the mean row of the ring
   (`sa.set_weight_row()`). `sa.ring_spread(mesh, 'arm_L')` then gives a spread of 0 on each
   ring.
8. The ring at x 0.4496 (the paw side of the wrist): {`wrist`: 0.6, `hand`: 0.4}. The mean row
   (wrist 0.42, hand 0.40, forearm_seg3 0.15, fingers 0.03) folded 6 faces of the left wrist at
   rest, and {hand 0.7, wrist 0.3} 11.
9. Arm roots: the clavicle share of the ring mean row is 0.45 at x 0.156, 0.35 at x 0.180, 0.20
   at x 0.211, and 0.05 at x 0.244. The other bones of the row scale to the rest. The folded faces
   of the preview of the four play moments went from 25, 25, 17, 19 to 3, 3, 3, 2 (with the
   groin).
10. Front of the arm root: the 13 left and 7 right vertices of the trunk loop of the arm from 60°
    below the front to 45° above it, around the shoulder axis, take the mean of their own row and
    the row of the ring at x 0.156.
11. Front armpit pocket: the vertices 1825, 617, 755 (mirror of 617), 1542, and 615 take the mean
    row of their edge neighbors. The deepest point of the pocket in the chord went from 0.0236
    to 0.0102 units (4.9 cm to 2.1 cm) below the mean of its neighbors. A pocket stays (open
    item).
12. Knee rings: one mean row on each knee ring folded 10 faces at the back of the pedal knee,
    because the rings slant down to the back. So the 220 vertices of the knee rings keep the
    automatic weights, from a copy of the mesh with step 1.
13. Groin: the vertices 2096, 314, 2098, and 1894 (right) and 2390, 1857, 1858, and 2389 (left)
    take one mean row on each side. Two faces of the front of the right groin folded in the
    pedal pose, and after the step none.
14. Nape: the vertex 909 takes `head` 0.52, and its other bones scale to 0.48. The head height
    `H` (the lowest point with a head share above 0.5) then is 0.4228 m, as the 0.4224 m of the
    older body, so the rest and the lift of the pianist, which are in `H`, stay.
15. Thigh root rings: two arcs of the rings of the thigh root, from the inner groin over the front
    to the outer side, take one mean row each, from the rows before the step:
    `sa.set_weight_row(mesh, v, row)` for each vertex of the arc. The upper arc is 2336, 2389,
    2390, 2189, 1883, 1006, and 1008 (left), with {`thigh_L` 0.3915, `hips` 0.5291, `spine`
    0.0794}. The lower arc is 2354, 2328, 1858, 1857, 61, 60, and 1007, with {`thigh_L` 0.6906,
    `hips` 0.2837, `spine` 0.0251, `shin_L` 0.0006}. The right arcs 1893, 1894, 2096, 2097, 967,
    570, 565 and 1892, 1895, 2098, 314, 315, 569, 568 take the mirror rows. The step replaces step
    13 for these vertices. In the seated bind with the thighs 25° down, the thigh shares of the
    upper arc went from 0.21 to 0.60 around the front, and the groin vertices 2390 and 1858 sank
    into a dent at the front of the thigh root: 3.6 cm and 3.2 cm below the mean of their edge
    neighbors, along the normal (2.1 cm at 40°). After the step, the deepest vertex of the thigh
    root is 1.5 cm below its neighbors (2354), and the deepest of the crotch 1.9 cm (1797, at the
    middle of the front). Arcs of shares 0.25 to 0.46 and 0.60 to 0.78 gave 2.0 cm to 5.1 cm, and
    longer arcs to the back of the haunch (1401, 1402, 522, 523) gave 2.9 cm. The folds of
    `pnpm fold-probe pianist` do not change.
16. Belly and flank: the thighs turn about 65° from the rest into the bind, and each vertex with
    a mix of trunk and thigh shears. The fade of step 5 above the upper arc of step 15 folded the
    lower flank into long thin faces. Each vertex below takes one exact row with
    `sa.set_weight_row()`, and its mirror vertex the mirror row:
    - Trunk rows (the thigh share goes, and the trunk shares scale to 1), so that the vertex
      keeps its source place in the bind: 1343, 1344, 1342, 1786, 1205, and 1160 (thigh 0.01 to
      0.17 before), and 969, 970, 311, 1130, and 1353 (thigh below 0.005). Right: 1218, 1587,
      979, 2223, 972, 618, 901, 902, 961, 1586, 1206.
    - The upper arc row of step 15 on 1401 (right 566), so that the arc holds one row up to the
      side of the haunch.
    - The lower arc row of step 15 on 1402, 522, and 523 (right 567, 1391, 246), so that the
      lower arc holds one row from the inner groin to the side of the haunch.

    The vertices of the crotch, the groin (1676 to 1679, 2388), the rump (1310, 1311, 1354), and
    the bottom of the haunch keep their rows: with trunk rows, the crotch sank 9.3 cm (2388) and
    3.9 cm (1678) below its neighbors, the rump showed a dark fold at the back, and the bottom of
    the haunch sets the seat top. One row on the whole lower ring (also 643, 642, 219, and the
    inner arc to 52) lowered the lowest point of the haunch by 1.4 cm. The thigh share of the
    upper arc now has a spread of 0 (0.18 before), and of the front and the side of the lower
    ring 0 (0.37 before).
    The seat top (0.268 m) and the folds of `pnpm fold-probe pianist` do not change, and each dent
    of step 15 changes by 1 mm or less.

**Bind.** The Action `bind` holds the seated bind at frame 1. The trunk, the head, and the tail
keep the rest. The legs sit on a bench that fits them (design 4.4, "Seat"): each thigh turns the
least way onto the direction 25° below the horizontal and 12° out, each shin onto the vertical
with the ankle 5° in front of the knee, and each foot and toe bone keeps its rest turn, so the
feet stand flat. The knee angle is 120°. The call was
`sa.set_world_turns(rig, turns, sa.sheet_worlds(rig), key_frame=1)` with these world turns of
`thigh_*`, `shin_*`, `foot_*`, and `toes_*`. Each upper arm turns the least way onto the bind direction
(0.813873, -0.143043, 0.563161) of `studio.bindArms` (studio axes), and the forearm, the twist
bone, the paw, and the fingers keep its turn (the role-neutral bind). Each paw then turns about
the bind forearm toward supination, the left 112° and the right 43°: the values of
`pnpm bind-supination polar-bear --glb <export> --summary <export>.json` on the export with no
supination. `sa.drive_segments(rig, key_frame=1)` keyed the segments and the helpers.

**Bind key.** With the trunk rows of weight step 16, the turn of the thigh from the rest to the
bind falls on the band between the upper arc and the lower arc of the thigh root, and the band
made a ledge with a pinch at the top of the seated thigh. The shape key `bind_belly` (value 1)
moves the band vertices in the bind, and `pnpm rig-export` bakes it into the bind. Each band
vertex sits in a column of four vertices: a trunk vertex above, the upper arc vertex, the lower
arc vertex, and a thigh vertex below, such as 1205, 1883, 61, 62. The move of each band vertex
puts it on the cubic curve from the trunk vertex to the thigh vertex, with the end directions of
the column beyond each end, at the share of the rest arc length. The trunk vertex and the thigh
vertex do not move. The columns of the left side start at 1679, 1343, 1344, 1786, 1205, 969, 970,
and 311. The moves of 2336, 2389, and 2390 are 0.45, 0.6, and 0.8 of the curve move: full moves
folded the faces at the inner groin in the play. Two point edits follow: 1858 goes to the mean of
its edge neighbors, and the crotch vertex 1797 halfway to that mean. The key writes each move as
a move of the rest by the inverse skin turn of the vertex. The moves in the bind, in cm (Blender
axes):

| Vertex (right) | Move left | Move right |
|---|---|---|
| 60 (569) | -0.6, -5.8, 2.0 | 0.9, -7.3, 2.7 |
| 61 (315) | -0.4, -4.8, 2.5 | 0.3, -5.1, 2.8 |
| 1006 (570) | -0.7, -6.3, 2.6 | 0.8, -6.9, 2.8 |
| 1007 (568) | -0.4, -5.3, 3.4 | 0.3, -5.2, 3.3 |
| 1008 (565) | -0.2, -4.1, 3.3 | 0.1, -4.0, 3.3 |
| 1401 (566) | -0.2, -4.2, 3.9 | 0.2, -3.8, 3.5 |
| 1402 (567) | 0.2, -5.6, 4.4 | -0.2, -4.7, 3.4 |
| 1797 (1285) | 0.0, -1.1, -0.2 | 0.0, -1.1, -0.1 |
| 1857 (314) | -0.6, -4.6, 2.4 | 0.5, -5.4, 3.0 |
| 1858 (2098) | -0.3, -4.2, 2.3 | 0.3, -4.5, 2.4 |
| 1883 (967) | 0.0, -5.6, 2.6 | -0.1, -5.8, 2.7 |
| 2189 (2097) | 0.0, -5.5, 2.5 | 0.0, -5.8, 2.7 |
| 2328 (1895) | 1.2, -2.2, 1.9 | -1.2, -2.4, 1.8 |
| 2336 (1893) | -0.5, 0.3, 2.1 | 0.5, 0.3, 2.1 |
| 2354 (1892) | 0.3, -0.9, 2.0 | -0.4, -1.1, 2.0 |
| 2389 (1894) | 0.5, -3.0, 0.8 | -0.5, -3.1, 0.8 |
| 2390 (2096) | -0.1, -4.9, 1.8 | 0.0, -4.9, 1.7 |

The right leg has other faces than the left, so the right moves differ a little. The dihedral
angle of each edge with the rest z from 0.15 to 0.48 and |x| < 0.2 (1,049 edges) went from mean
16.7°, p95 55.5°, max 153.1° to 16.2°, 54.9°, 149.4° in the bind, and on the side and the back of
the band (691 edges) from 14.0°, 35.2°, 78.6° to 13.3°, 33.4°, 71.1°. The deepest vertex of the
thigh root went from 2.1 cm to 1.5 cm below its neighbors (2336), and the crotch vertex 1797 from
2.0 cm to 1.1 cm. The seat top (0.268 m) and the folds of `pnpm fold-probe pianist` do not change.

At 25°, the seat top is 0.268 m, the hip joints 0.43 m, and the knees 0.31 m above the floor.
At 40°, the seat top was 0.331 m and the hip joints 0.49 m: the haunch sat on the front edge of
the bench, and the bear looked as if it stood up. The exports of 20°, 22°, 28°, and 31° gave the
seat tops 0.257 m, 0.267 m, 0.280 m, and 0.294 m. Below 25°, the thighs set the seat top. The front
edge of the seat lies 0.05 units behind the hip joints: a front edge 0.02, 0.04, 0.06, or 0.08 units
nearer the hips puts the seat top on the sloped thighs, 0.6 cm to 4.9 cm lower.

**Eyes.** `se.place_eyes(rig, mesh, {side: (middle, direction, size)})` with the middles
(±0.0422, -0.1016, 0.9417), the directions (±0.4450, -0.7197, 0.5329), and the size 0.165237
(0.339993 m, the pea eye of the older body). A first run put each middle where the axis of the eye
of the older body meets the head surface, at (±0.0404, -0.0987, 0.9456). There the brow covered
the top of each oval, and the eyes read as narrow slits. The second run moved each middle 0.004
out along its direction and 0.006 down, so the whole oval and its light show. `place_eyes()` runs
`fit_eyes()`.

**Colors.** `color` is `color_base` with the move of `colors.shift` of
`tools/mesh-rigs/polar-bear.json` (`shift_colors()` of `tools/blender/rig_mesh.py`): 2,606 fur
faces take 1.045 of their lightness and 0.3 of their chroma, toward the white of the older body.
The faces 2561 (left flank) and 2508 (left belly) were darker than the fur around them, and each
takes the mean `color` and `color_base` of its fur neighbors (612, 89, 332, 820 and 1117, 413,
2015).

## polar-bear.rig.glb

`pnpm rig-export polar-bear` writes it, with the text summary `polar-bear.rig.json`. A run gives
the same bytes.

| Item | Value |
|---|---|
| Size | 716,772 bytes |
| SHA-256 | `94e5789e869d9756340476bfaf6dd5da5c4b914d2cb4ebf442f1c5f916c3fb88` |
| Summary | `polar-bear.rig.json`: 7,643 bytes, SHA-256 `9d37b9a736a657e9d3022ad2052c6ef9e94ea9169199985998debc298a99acdd` |
| Form | The mesh of `polar-bear.blend` in its seated bind. In the app, the seat top is 0.268 m high, and the fit of the bench is 0.244 m deep (`benchFitOf()`) |
| Faces | 5,504 triangles, of them 76 gloss (the nose) |
| Shapes | The arm-down shape of each arm and the straight legs of each side, which the export calculates |

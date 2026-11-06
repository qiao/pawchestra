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

The folder also holds the source of a hand rig in progress (design 4.4, "Hand rig") in `tripo/`.
The app does not use it, and `polar-bear-tpose.rig.glb` stays the rig of the app.

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

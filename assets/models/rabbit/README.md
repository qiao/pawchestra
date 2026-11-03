# Rabbit model

This folder holds the A-pose source mesh of the rabbit, a copy with rebuilt arms and its weights,
and the rigged copy. The app does not serve these files. It loads the module
`src/models/studio/rabbit.ts`, which this chain writes:

```text
rabbit-apose.glb                          source mesh
   │  tools/blender/violin_arms.py rabbit  rebuilt arms and painted weights
   v
rabbit-arms.glb + rabbit-weights.json     `source` and `paintedWeights` of the config
   │  pnpm rig-mesh rabbit                config tools/mesh-rigs/rabbit.json
   v
rabbit-apose.rig.glb                      rigged mesh
   │  pnpm studio-body rabbit
   v
src/models/studio/rabbit.ts               studio body of the app
```

`docs/agents/rigging.md` gives the steps of the chain.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `rabbit-apose.glb` | Source mesh (below) | None |
| `rabbit-arms.glb` | Copy of the source with rebuilt arms. License as the source | `violin_arms.py rabbit` |
| `rabbit-weights.json` | Weights of the same Blender run. License as the source | `violin_arms.py rabbit` |
| `rabbit-apose.rig.glb` | Output of the rig. License as the source | `pnpm rig-mesh rabbit` |

## rabbit-apose.glb

The mesh has no skeleton. The arms are in an A-pose: out, down, and a little forward, apart from
the trunk below the shoulders.

| Item | Value |
|---|---|
| Size | 16,662,596 bytes |
| SHA-256 | `ed1c4778be4ee6ceba54aaf8e92117684551c18c06448e3b4904d2415e56634a` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,118 triangles and 4,327 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |

## rabbit-arms.glb and rabbit-weights.json

| Item | Value |
|---|---|
| `rabbit-arms.glb` | 1,066,280 bytes, SHA-256 `3a8d60065ea5679e331fc16e106e74e3f68546654b83176a55dba878e2554245` |
| Mesh | 2,084 vertices after a weld at 1e-5, 4,154 triangles: on each arm a tube of 15 rings of 16 vertices, joined to the trunk and the paw with Bridge Edge Loops, with Beautify Faces on the bridge triangles |
| Material | One material with one base color JPEG of 4096 × 4608 pixels: the atlas of the source, and a strip of 512 pixels on top with the fur color of the source arms, baked onto the new faces. No metallic-roughness texture |
| `rabbit-weights.json` | 460,502 bytes, SHA-256 `e257527785da440da83161e07fce7e3700bebaeaa527a6dec2ad88d072d99969` |
| Weights | The automatic weights of Blender with the Weight Paint fixes of the script, on the studio bones and the arm segments and helpers (`armSegments` of the config), for `paintedWeights` of the config |

The script puts new quad faces on each arm from the shoulder line to the wrist. The faces of the
paws, the trunk, the legs, and the head are the faces of the source. The new arm surface lies on
the old one. The arms are 1.15 times longer from the shoulder line, a little longer than the arms
of the source. The copy gives them this length, because a rig with arm segments does not stretch
the arms. A run gives the same bytes:

```bash
blender -b --factory-startup -P tools/blender/violin_arms.py -- rabbit
shasum -a 256 assets/models/rabbit/*.glb assets/models/rabbit/rabbit-weights.json
```

The rig gives the faces near each shoulder joint and each elbow joint the normals of the skin with
no crease angle (`rootNormals` of the config). The seated bind raises the hanging arms, and each
hold bends the elbows. A crease angle there splits the normals, and the split shows as a slit at the
front of each arm root.

## rabbit-apose.rig.glb

| Item | Value |
|---|---|
| Size | 804,132 bytes |
| SHA-256 | `cfc3fe4485e0917e049bad6024de04d73d5bf6e2e8a76d48c7b1047d17fe6785` |
| Bind | The role-neutral bind (design 4.4): the arms of the source, straight (`studio.straightArms` of the config), with the elbow axes of the old bent bind of the violin hold (`studio.bindArms`), and the bind paws supinated so that the largest paw twist of the roles of the cast matrix is smallest (`studio.bindSupination`) |
| Shapes | The arm-down shape of each arm, the straight legs of each side, and a `raise` shape of the bent left elbow |

A run of `pnpm rig-mesh rabbit` gives the same bytes.

# Elephant model

This folder holds the A-pose source mesh of the elephant, a copy with rebuilt arms and its
weights, and the rigged copy. The app does not serve these files. It loads the module
`src/models/studio/elephant.ts`, which this chain writes:

```text
elephant-apose.glb                     source mesh
   │  tools/blender/elephant_arms.py   rebuilt arms and painted weights
   v
elephant-arms.glb                      `source` of tools/mesh-rigs/elephant.json
  + elephant-weights.json              `paintedWeights` of the same config
   │  pnpm rig-mesh elephant
   v
elephant.rig.glb                       rigged mesh
   │  pnpm studio-body elephant
   v
src/models/studio/elephant.ts          studio body of the app
```

`docs/agents/rigging.md` gives the steps of the chain.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `elephant-apose.glb` | Source mesh (below) | None |
| `elephant-arms.glb` | Copy of `elephant-apose.glb` with rebuilt arms. License as the source | `elephant_arms.py` |
| `elephant-weights.json` | Weights of the same Blender run. License as the source | `elephant_arms.py` |
| `elephant.rig.glb` | Output of the rig. License as the source | `pnpm rig-mesh elephant` |

## elephant-apose.glb

The mesh has no skeleton. The arms are in an A-pose: about 45° down and apart from the trunk below
the shoulders.

| Item | Value |
|---|---|
| Size | 18,864,976 bytes |
| SHA-256 | `0c81e0000d3164207c6d70e2410c572d7997e4d323ce101eac37b806a4286dc4` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,113 triangles and 4,305 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial`, double-sided, with a base color texture and a metallic-roughness texture, each a PNG |

A weld at 1e-5 gives 1,559 vertices. The mesh is 1.9027 units of the file high from the soles to
the skull top. It has two open edges at the left side of the head.

## elephant-arms.glb and elephant-weights.json

| Item | Value |
|---|---|
| `elephant-arms.glb` | 1,195,432 bytes, SHA-256 `406e181e0369fb81f6143afed1fbae88a1d48145f848b960d7ed1f8a622200a2` |
| Mesh | 1,951 vertices after a weld at 1e-5, 3,896 triangles: on each arm a tube of 13 quad rings of 16 vertices from 0.4 of the upper arm to 0.3 of the paw, joined to the trunk and the paw with Bridge Edge Loops, with Beautify Faces and Collapse Edges on the bridge triangles |
| Material | One material with one base color JPEG: the atlas of the source, and a strip of 512 pixels on top with the fur color of the source arms, baked onto the new faces. No metallic-roughness texture |
| `elephant-weights.json` | 436,673 bytes, SHA-256 `c8b807d60432cafbd096aa1baa36ec0498052b67f740df5b8646fdfd6dc4cf78` |
| Weights | The automatic weights of Blender with the Weight Paint fixes of the script, on the studio bones and the arm segments and helpers (`armSegments` of the config), for `paintedWeights` of the config |

The script puts new quad faces on each arm from the shoulder line to the wrist, because the long
faces of the source arms showed dark slits and shards on the upper arms. The new arm surface lies
on the old one. The arms keep their length and their cross-section, with no cut into the arm
surface and no dent. The faces of the paws, the trunk, the legs, and the head are the faces of the
source. Only the short edges of the thin faces at the cut loops and under the armpits collapse.

The inner front of each upper arm meets the round belly in the ready pose of the timpani. There
the arm is 0.009 units (1.7 cm) flatter, with a smooth falloff over the near rings
(`step_flatten()`). The arm keeps a round outline. The flatten comes after the bake, so that each
texel takes the skin of its own place on the source arm. A flatten before the bake moves the tube
out of the reach of the bake rays, and the bake then writes black texels. A run gives the same
bytes:

```bash
blender -b --factory-startup -P tools/blender/elephant_arms.py
shasum -a 256 assets/models/elephant/*.glb assets/models/elephant/elephant-weights.json
```

## elephant.rig.glb

| Item | Value |
|---|---|
| Size | 751,672 bytes |
| SHA-256 | `d248d687b1ba860d14f45f5f94a8edd310683d79daee77d48d35bf111a15c995` |
| Bind | The role-neutral bind (design 4.4): the arms of the source, straight (`studio.straightArms` of the config), with the elbow axes of the old bent bind (`studio.bindArms`), and the bind paws supinated so that the largest paw twist of the roles of the cast matrix and the timpani is smallest (`studio.bindSupination`). The skin of each forearm and wrist takes the skin normals (`rootNormals.wrist`) |

A run of `pnpm rig-mesh elephant` gives the same bytes.

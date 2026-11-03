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
| `rabbit-arms.glb` | Copy of `rabbit-tpose.glb` with rebuilt arms. License as the source | `arm_rebuild.py rabbit --factor 1.18` |
| `rabbit-weights.json` | Weights of the same Blender run. License as the source | `arm_rebuild.py rabbit --factor 1.18` |
| `rabbit-apose.rig.glb` | Output of the rig. License as the source | `pnpm rig-mesh rabbit` |
| `rabbit-tpose.glb` | The T-pose source mesh of the next body (below) | None |

## rabbit-tpose.glb

The T-pose mesh replaces `rabbit-apose.glb` as the source when its rig passes the arm gate and
the clearance sweep. A first rig with arms 1.18 times longer passed the arm gate, and its upper arms
went up to 3.9 cm into the body in the lowering (`TODO.md`). The mesh has no skeleton. The arms
stand out level to the sides, free of the trunk.

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

The rig gives the faces near each shoulder joint and each elbow joint the normals of the skin with
no crease angle (`rootNormals` of the config). The bind raises the arms, and each hold bends the
elbows. A crease angle there splits the normals, and the split shows as a slit at the front of each
arm root.

## rabbit-apose.rig.glb

| Item | Value |
|---|---|
| Size | 804,132 bytes |
| SHA-256 | `cfc3fe4485e0917e049bad6024de04d73d5bf6e2e8a76d48c7b1047d17fe6785` |
| Bind | The role-neutral bind (design 4.4): the arms of the source, straight (`studio.straightArms` of the config), with the elbow axes of the old bent bind of the violin hold (`studio.bindArms`), and the bind paws supinated so that the largest paw twist of the roles of the cast matrix is smallest (`studio.bindSupination`) |
| Shapes | The arm-down shape of each arm, the straight legs of each side, and a `raise` shape of the bent left elbow |

A run of `pnpm rig-mesh rabbit` gives the same bytes.

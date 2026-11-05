# Rabbit model

This folder holds the T-pose source mesh of the rabbit, a copy with rebuilt arms and its weights,
and the rigged copy. The app does not serve these files. It loads the module
`src/models/studio/rabbit.ts`, which this chain writes:

```text
rabbit-tpose.glb                          source mesh
   │  tools/blender/arm_rebuild.py rabbit --factor 1.18
   v
rabbit-arms.glb + rabbit-weights.json     `source` and `paintedWeights` of the config
   │  pnpm rig-mesh rabbit                config tools/mesh-rigs/rabbit.json
   v
rabbit.rig.glb                            rigged mesh
   │  pnpm studio-body rabbit
   v
src/models/studio/rabbit.ts               studio body of the app
```

`docs/agents/rigging.md` gives the steps of the chain.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `rabbit-arms.glb` | Copy of `rabbit-tpose.glb` with rebuilt arms. License as the source | `arm_rebuild.py rabbit --factor 1.18` |
| `rabbit-weights.json` | Weights of the same Blender run. License as the source | `arm_rebuild.py rabbit --factor 1.18` |
| `rabbit-tpose.glb` | Source mesh (below) | None |
| `rabbit.rig.glb` | Output of the rig. License as the source | `pnpm rig-mesh rabbit` |
| `tripo/rabbit.fbx`, `tripo/rabbit.fbm/` | Source mesh with quad faces, and its four textures (below) | None |

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
of 8 to 16 vertices around. Its arm sections and its head width are those of
`rabbit-tpose.glb` within 2 %.
The FBX file keeps the quads (a GLB file of the same mesh holds only triangles). The folder
`rabbit.fbm/` holds its textures, and the FBX file links them by name.

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

## rabbit.rig.glb

| Item | Value |
|---|---|
| Size | 622,644 bytes |
| SHA-256 | `a199fd89f2131842b2be30573c763dbb62008e076a4d4973b0941adbd6e79c6a` |
| Bind | The role-neutral bind (design 4.4): the rebuilt arms straight (`studio.straightArms` of the config), with the elbow axes of the bent bind of the violin hold (`studio.bindArms`), and the bind paws supinated so that the largest paw twist of the roles of the cast matrix is smallest (`studio.bindSupination`) |
| Colors | The plain fur moves toward the cream of the fur swatch of `docs/reference/rabbit-views.png` (`colors.tone`) |
| Armpits | The trunk under each arm root takes a part of the painted arm weights (`weights.paintedBelow`), so that a raised arm does not pull the side out |
| Thighs | 2 times wider across their axes before the skin, up and to the sides (`legGirth`), because the leg factor makes the thin thighs of the mesh long. The thighs turn further out and the shins further in (`studio.legTurns`), so that the knees keep the gap of the A-pose rabbit |
| Seat | The chair of the A-pose rabbit: the shins are shorter (`shinFactor`), and the haunch drops further onto the seat (`sit.most`). The tail ball moves down with the ring of the haunch around it (`sit.carryTail`), and the haunch near the ball moves with it (`sit.tailSpread`), so that the ball keeps its round form |
| Form | A longer neck (`neckFactor`), a longer trunk below the chest (`trunkFactor`, `trunkTop`), and a smaller head (`headFactor`), so that the head does not sit on the shoulders. A rounder belly and shoulder joints further apart (`girthProfile`), as on the A-pose rabbit |
| Shapes | The arm-down shape of each arm, the straight legs of each side, and a shape of each arm at rest (`raise`) that takes the front of the arm root along with the hanging arm, so that no notch shows there |

A run of `pnpm rig-mesh rabbit` gives the same bytes.

## The module

`pnpm studio-body rabbit` writes `src/models/studio/rabbit.ts` from `rabbit.rig.glb`. The old eye
of the mesh is a black ball in a groove, and the rig colors the ball as fur. So the export moves
the head vertices of each old eye onto a smooth surface (`eyeFill` of `ANIMALS`), and the pea
eyes lie flush on it, with the size of the eyes of the A-pose rabbit (`eyeSize`).

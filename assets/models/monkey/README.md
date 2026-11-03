# Monkey model

This folder holds the source mesh of the monkey, a copy with rebuilt arms and its weights, and the
rigged copy. The app does not serve these files. It loads the module `src/models/studio/monkey.ts`,
which this chain writes:

```text
monkey.glb                               source mesh
   │  tools/blender/arm_rebuild.py       rebuilt arms and painted weights
   v
monkey-arms.glb + monkey-weights.json    `source` and `paintedWeights` of tools/mesh-rigs/monkey.json
   │  pnpm rig-mesh monkey
   v
monkey.rig.glb                           rigged mesh
   │  pnpm studio-body monkey
   v
src/models/studio/monkey.ts              studio body of the app
```

`docs/agents/rigging.md` gives the steps of the chain.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `monkey.glb` | Source mesh (below) | None |
| `monkey-arms.glb` | Copy of `monkey.glb` with rebuilt arms. License as `monkey.glb` | `arm_rebuild.py monkey --factor 1.2` |
| `monkey-weights.json` | Weights of the same Blender run. License as `monkey.glb` | `arm_rebuild.py monkey --factor 1.2` |
| `monkey.rig.glb` | Output of the rig. License as `monkey.glb` | `pnpm rig-mesh monkey` |

## monkey.glb

| Item | Value |
|---|---|
| Size | 16,090,928 bytes |
| SHA-256 | `9bc5c97007e30b23f7220eed227124c979bbce86b6d47eea1988d7ddfb91efc6` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,129 triangles and 5,211 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial`, double-sided, with a base color texture (10.4 MB) and a metallic-roughness texture (5.5 MB), each a PNG |

```bash
shasum -a 256 assets/models/monkey/monkey.glb
```

## Mesh facts

The values are in the units of the studio: 1 unit from the soles to the highest point, the soles
at y = 0, +z forward, and +x the left side of the animal. The mesh faces +z, with its left side at
+x. The weld is at 1e-5.

- The weld gives 1,568 vertices in one part. 6 edges are open and 3 edges have more than two
  faces. 229 faces have a corner angle below 10°.
- The box is x -0.283 to 0.283, y 0 to 1, and z -0.148 to 0.147. The monkey is 1.8988 units of
  the file high from the soles to the top of a small tuft of hair on the head. The skull top
  under the tuft is at about y 0.965.
- The monkey stands upright on short legs, with the crotch at y 0.215. The long arms hang down
  and out. They are apart from the body from x 0.09 out, with long dark brown hands and fingers
  down to y 0.27. The feet are dark brown too.
- The fur is brown, with a cream face, chest, and belly. The large dark eyes have white rims, at
  y 0.83 to 0.87 and z 0.10, with no shells.
- A small brown nose is at the front of the muzzle (z 0.147 at y 0.81). The texture has thin
  brown brows and a thin smile line.
- The round pink ears stand at the sides of the head, from x 0.12 to 0.17.
- The long thin tail leaves the back of the haunch at y 0.27 and goes down to the floor behind
  the right foot. It ends in a curl that stands up on the floor at x -0.25 to -0.13.

## monkey-arms.glb and monkey-weights.json

| Item | Value |
|---|---|
| `monkey-arms.glb` | 948,484 bytes, SHA-256 `d21a8eca1fa86ad5bf5387a9c3203c272b75b1aa3c232b77516ce906e588d3c1` |
| Mesh | 1,982 vertices after a weld at 1e-5, 3,957 triangles: on each arm a tube of 15 quad rings of 16 vertices from 0.2 of the upper arm to 0.1 of the paw, joined to the trunk and the paw with Bridge Edge Loops, with Beautify Faces and Collapse Edges on the bridge triangles |
| Material | One material with one base color JPEG: the atlas of the source, and a strip of 512 pixels on top with the fur color of the source arms, baked onto the new faces. No metallic-roughness texture |
| `monkey-weights.json` | 446,328 bytes, SHA-256 `7bfdeaac77e181bedbb3d96281ee02de8b7c41f0aa83b1c63d62da76059ce1d7` |
| Weights | The automatic weights of Blender with the weight rules of the script, on the studio bones and the arm segments and helpers (`armSegments` of the config), for `paintedWeights` of the config |

`tools/blender/arm_rebuild.py` puts new quad faces on each arm from the shoulder line to the wrist,
with the settings that it finds from the joints of the config and from rays through the mesh. The
new arm surface lies on the old one. The arms are 1.2 times longer from the shoulder line
(`--factor 1.2`), because a rig with arm segments does not stretch the arms. The faces of the
paws, the trunk, the legs, the tail, and the head are the faces of the source. A run gives the
same bytes:

```bash
blender -b --factory-startup -P tools/blender/arm_rebuild.py -- monkey --factor 1.2
shasum -a 256 assets/models/monkey/*.glb assets/models/monkey/monkey-weights.json
```

## monkey.rig.glb

| Item | Value |
|---|---|
| Size | 482,476 bytes |
| SHA-256 | `330c307b9c84f58ac51759c6e765c6b8e364bafe6faf70dad6adf19152e0c89d` |
| Bind | The role-neutral bind (design 4.4): the arms of the source, straight (`studio.straightArms` of the config), with the elbow axes of the bent trumpet bind (`studio.bindArms`), and the bind paws supinated so that the largest paw twist of the roles of the cast matrix is smallest (`studio.bindSupination`) |
| Shapes | The arm-down shape of each arm, and the straight legs of each side |

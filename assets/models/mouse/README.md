# Mouse model

This folder holds the source mesh of the mouse, a copy with rebuilt arms and its weights, and the
rigged copy. The app does not serve these files. It loads the module `src/models/studio/mouse.ts`,
which this chain writes:

```text
mouse.glb                               source mesh
   │  tools/blender/wind_arms.py mouse  rebuilt arms and painted weights
   v
mouse-arms.glb + mouse-weights.json     `source` and `paintedWeights` of tools/mesh-rigs/mouse.json
   │  pnpm rig-mesh mouse
   v
mouse.rig.glb                           rigged mesh
   │  pnpm studio-body mouse
   v
src/models/studio/mouse.ts              studio body of the app
```

`docs/agents/rigging.md` gives the steps of the chain.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `mouse.glb` | Source mesh (below) | None |
| `mouse-arms.glb` | Copy of `mouse.glb` with rebuilt arms. License as `mouse.glb` | `wind_arms.py mouse` |
| `mouse-weights.json` | Weights of the same Blender run. License as `mouse.glb` | `wind_arms.py mouse` |
| `mouse.rig.glb` | Output of the rig. License as `mouse.glb` | `pnpm rig-mesh mouse` |

## mouse.glb

| Item | Value |
|---|---|
| Size | 16,782,192 bytes |
| SHA-256 | `94159c8fb93bea6d5edae7bc1ea1d0e88e1359565402c008071624288e0b64a7` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,077 triangles and 4,758 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial`, double-sided, with a base color texture and a metallic-roughness texture, each a PNG |

The values below are in the units of the studio: 1 unit from the soles to the top of the ears,
the soles at y = 0, +z forward, and +x the left side of the animal. The mesh faces +z. The weld is
at 1e-5.

- The weld gives 1,569 vertices in 5 connected parts: the body (1,524 vertices) and 4 small
  groups of whiskers. 48 open edges lie in the whiskers, the paws, and the feet, and 23 edges have
  more than two faces. 424 faces have a corner angle below 10°.
- The box is x -0.268 to 0.267, y 0 to 1, and z -0.359 to 0.338. The mouse is 1.9010 units of the
  file high from the soles to the top of the ears. The top of the skull is at y 0.949.
- The mouse stands upright on short legs, with the crotch at y 0.14 and long flat feet forward to
  z 0.18. The round belly goes forward to z 0.19.
- The short arms hang down, out, and forward. They are apart from the body from x 0.11 out, with
  the paws at y 0.34 to 0.42.
- The eyes are dark faces of the head surface at y 0.81 to 0.86 and z 0.18 to 0.21, with no
  shells. The large round ears go from y 0.80 to 1.0 at x ±0.07 to ±0.24.
- The long thin tail goes from its root under the buttock (y 0.17, z -0.09) to the floor at
  z -0.33. Then it lies on the floor in a curve to its tip at x -0.17 and z -0.12.

## mouse-arms.glb and mouse-weights.json

| Item | Value |
|---|---|
| `mouse-arms.glb` | 1,147,128 bytes, SHA-256 `7a481991189e4a94c18e2049b4466357bc1570b50c8e546e09b71c063c7aed4f` |
| Mesh | 1,961 vertices after a weld at 1e-5, 3,862 triangles: on each arm a tube of quad rings of 16 vertices, joined to the trunk and the paw with Bridge Edge Loops, with Beautify Faces and Collapse Edges on the bridge triangles |
| Material | One material with one base color JPEG: the atlas of the source, and a strip of 512 pixels on top with the fur color of the source arms, baked onto the new faces. No metallic-roughness texture |
| `mouse-weights.json` | 440,106 bytes, SHA-256 `073d4c18b0730393cca83d21a251ccd3605bbd7d8671c5cb440608c43f36ac04` |
| Weights | The automatic weights of Blender with the Weight Paint fixes of the script, on the studio bones and the arm segments and helpers (`armSegments` of the config), for `paintedWeights` of the config |

The script puts new quad faces on each arm from the shoulder line to the wrist. The cut of the
shoulder line lies at 0.6 of the upper arm, because the upper arm joins the trunk above it. The
new arm surface lies on the old one. The arms are 1.25 times longer from the shoulder line,
because a rig with arm segments does not stretch the arms. The faces of the paws, the trunk, the
legs, and the head are the faces of the source. Only the short edges of the thin faces at the cut
loops and in front of and under the armpits collapse. A run gives the same bytes:

```bash
blender -b --factory-startup -P tools/blender/wind_arms.py -- mouse
shasum -a 256 assets/models/mouse/*.glb assets/models/mouse/mouse-weights.json
```

## mouse.rig.glb

| Item | Value |
|---|---|
| Size | 577,884 bytes |
| SHA-256 | `2de3ca18ed1ef9c9a1cfec45463d7c03c61f6969808f41baa7483e1a82bff61f` |
| Bind | The role-neutral bind (design 4.4): the arms of the source, straight (`studio.straightArms` of the config), with the elbow axes of the bent bind of the oboe hold (`studio.bindArms`), and the bind paws supinated so that the largest paw twist of the roles of the cast matrix and the oboe is smallest (`studio.bindSupination`) |

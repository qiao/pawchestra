# Panda model

This folder holds the source mesh of the panda, a copy with rebuilt arms and its weights, and the
rigged copy. The app does not serve these files. It loads the module `src/models/studio/panda.ts`,
which this chain writes:

```text
panda.glb                            source mesh
   │  tools/blender/panda_edit.py    arms free of the trunk
   v
panda-edit.glb                       not in git (below)
   │  tools/blender/arm_rebuild.py   rebuilt arms and painted weights
   v
panda-arms.glb + panda-weights.json  `source` and `paintedWeights` of tools/mesh-rigs/panda.json
   │  pnpm rig-mesh panda
   v
panda.rig.glb                        rigged mesh
   │  pnpm studio-body panda
   v
src/models/studio/panda.ts           studio body of the app
```

`docs/agents/rigging.md` gives the steps of the chain.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `panda.glb` | Source mesh (below) | None |
| `panda-edit.glb` | Copy with the arms free of the trunk, not in git. License as `panda.glb` | `blender -b --factory-startup -P tools/blender/panda_edit.py -- assets/models/panda/panda-edit.glb` |
| `panda-arms.glb` | `panda-edit.glb` with rebuilt arms 1.497 times as long. License as `panda.glb` | `blender -b --factory-startup -P tools/blender/arm_rebuild.py -- panda --factor 1.497` |
| `panda-weights.json` | Weights of the same Blender run. License as `panda.glb` | The same run |
| `panda.rig.glb` | Output of the rig. License as `panda.glb` | `pnpm rig-mesh panda` |

## panda.glb

| Item | Value |
|---|---|
| Size | 12,125,640 bytes |
| SHA-256 | `3938ac7d825f75608e3109018d8690a577b30b434f5655fc8fa296e773e1892f` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,146 triangles and 3,953 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial`, double-sided, with a base color texture and a metallic-roughness texture, each a PNG of 4096 × 4096 pixels |

```bash
shasum -a 256 assets/models/panda/panda.glb
```

## Mesh facts

The values are in the units of the studio: 1 unit from the soles to the top of the ears, the soles
at y = 0, +z forward, and +x the left side of the animal. The mesh faces +z, with its left side at
+x. The weld is at 1e-5.

- The weld gives 1,575 vertices in one connected part. The mesh has no open edge and no edge with
  more than two faces. 64 faces have a corner angle below 10°.
- The box is x -0.344 to 0.344, y 0 to 1, and z -0.238 to 0.237. The panda is 1.9015 units of the
  file high from the soles to the top of the ears. The top of the skull is at y 0.986.
- The panda stands upright on short legs, with the crotch at y 0.157. Its arms hang down, out,
  and forward, with the paws beside the belly at y 0.35 to 0.45.
- The fur is white, with black ears, eye patches, shoulders, arms, and legs. The eyes are dark
  faces of the head surface inside the dark eye patches, with no shells. The nose is a patch of
  dark faces at the front of the muzzle.
- The small round ears stand on the top of the head, from y 0.90 to 1.0, beside the top of the
  skull.
- The short round tail is a ball at the back, from z -0.19 to -0.238 and from y 0.22 to 0.33.

## panda-edit.glb

The upper arm of `panda.glb` joins the side of the trunk down to the elbow, so `arm_rebuild.py`
finds no free section of it. `tools/blender/panda_edit.py` frees each arm in this copy:

- It splits the crease of each arm (`SEAMS`), turns the arm out 10° about the forward axis
  through the shoulder joint, and shifts it 0.018 units out and up, with a ramp along the upper
  arm. The arm now hangs 31.2° below the horizontal.
- It closes the inner side of each arm with a grid of quads, and the trunk with a side wall, as
  `cat_arms.py` does for the cat. It smooths the pockets of the trunk that the arm hid.
- The new faces take the fur colors beside them. The rest of the mesh stays.

`pnpm mesh-intake` on the copy passes the pose, the arm free, and the gap lines. Only
`arm_rebuild.py` reads the copy, and a run gives the same bytes, so git keeps no copy of it
(`.gitignore`). Write it before a rebuild of the arms.

| Item | Value |
|---|---|
| Size | 12,113,876 bytes |
| SHA-256 | `d51c42d3385947dd1f9927a2aa4d90b4eca067dab3f19e96ccf38fba444eb94b` |

## panda-arms.glb and panda-weights.json

`tools/blender/arm_rebuild.py` rebuilds the arms of `panda-edit.glb` with quad tubes, 1.497 times
as long as the mesh (`--factor 1.497`), and writes the Blender weights of the arms. The shoulder
line lies at 0.25 of the upper arm. A run gives the same bytes. The round arm is 9.3 cm from the
bone to its inner side, so the holds keep the elbows away from the trunk (design 5.3).

| File | Size | SHA-256 |
|---|---|---|
| `panda-arms.glb` | 821,148 bytes | `91f7246c55d2863ec414ddb825844f328320d87f1d056fa5b64ce4285b2e5a1a` |
| `panda-weights.json` | 439,232 bytes | `4cd2116637468398f7d697046f0822f3f987fe70c3f4cfbece5f04515e84740b` |

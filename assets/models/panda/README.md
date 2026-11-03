# Panda model

This folder holds the source mesh of the panda, a copy with rebuilt arms and its weights, and the
rigged copy. The app does not serve these files. It loads the module `src/models/studio/panda.ts`,
which this chain writes:

```text
panda-tpose.glb                      source mesh
   │  tools/blender/arm_rebuild.py panda --factor 1.05
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
| `panda-tpose.glb` | Source mesh (below) | None |
| `panda-arms.glb` | Copy of `panda-tpose.glb` with rebuilt arms. License as the source | `blender -b --factory-startup -P tools/blender/arm_rebuild.py -- panda --factor 1.05` |
| `panda-weights.json` | Weights of the same Blender run. License as the source | The same run |
| `panda.rig.glb` | Output of the rig. License as the source | `pnpm rig-mesh panda` |
| `panda.glb` | The source mesh of the older body (below). No rig reads it | None |

## panda-tpose.glb

The mesh has no skeleton. The arms stand out level to the sides, free of the trunk.

| Item | Value |
|---|---|
| Size | 13,086,256 bytes |
| SHA-256 | `883565d62054921455a119395318b83019d225e629ec58ada6f535fb967e895e` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,141 triangles and 3,912 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial`, double-sided, with a base color texture (7.6 MB) and a metallic-roughness texture (5.3 MB), each a PNG of 4096 × 4096 pixels |

The values below are in the units of the studio: 1 unit from the soles to the ear tips, the soles
at y = 0, +z forward, and +x the left side of the animal. The mesh is 1.699 units of the file
high, and the weld at 1e-5 gives 1,573 vertices in one part. 2 edges are open, 1 edge has more
than two faces, and 49 faces have a corner angle below 10°.

- The box is x -0.560 to 0.559, y 0 to 1, and z -0.230 to 0.230.
- The arms stand out level at y 0.53 to 0.68, free of the trunk from |x| 0.21, with the paw tips
  at |x| 0.56. The claws of each paw curl down, so the palm faces down (the palm hint of the
  config).
- The legs part below the crotch at y 0.19. The feet reach forward to z 0.107.
- The fur is white, with black ears, eye patches, shoulders, arms, and legs. Each eye has a brown
  iris and a black pupil at y 0.815 to 0.845, inside the black patch. The nose is a black patch at
  the front of the muzzle, at y 0.75 to 0.79, and a thin mouth line smiles under it.
- The round belly reaches z 0.207 at y 0.37. The small round ears stand from y 0.91 to the top.
  A round tail ball sits at the back, at y 0.22 to 0.35, out to z -0.230.

```bash
shasum -a 256 assets/models/panda/panda-tpose.glb
```

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

| Item | Value |
|---|---|
| `panda-arms.glb` | 806,948 bytes, SHA-256 `92fa61ba7f8708b6e2b91916c2983eed483bacf34faafe66e01defd037d2fbe2` |
| Mesh | 1,856 vertices after a weld at 1e-5, 3,707 triangles: on each arm a tube of 10 quad rings of 16 vertices from 0.25 of the upper arm to 0.1 of the paw, joined to the trunk and the paw with Bridge Edge Loops, with Beautify Faces and Collapse Edges on the bridge triangles |
| Material | One material with one base color JPEG of 4096 × 4608 pixels: the atlas of the source, and a strip of 512 pixels on top with the fur color of the source arms, baked onto the new faces. No metallic-roughness texture |
| `panda-weights.json` | 415,692 bytes, SHA-256 `7d7b33862d664b86ff8ea0cc4af7d5b1e661f3e44a3c6c09eb09c02cb1edc71d` |
| Weights | The automatic weights of Blender with the weight rules of the script, on the studio bones and the arm segments and helpers (`armSegments` of the config), for `paintedWeights` of the config. The fingers keep half of their weight (`weights.fingers`) |

`tools/blender/arm_rebuild.py` puts new quad faces on each arm of `panda-tpose.glb` from the
shoulder line to the wrist, with the settings that it finds from the joints of the config and from
rays through the mesh. The new arm surface lies on the old one. The faces of the paws, the trunk,
the legs, the tail, and the head are the faces of the source. The arms are 1.05 times longer from
the shoulder line (`--factor 1.05`), because a rig with arm segments does not stretch the arms.
With this factor, the right arm reaches the slide travel of the panda of the older mesh
(`armFactorNote` of the config). A run gives the same bytes:

```bash
blender -b --factory-startup -P tools/blender/arm_rebuild.py -- panda --factor 1.05
shasum -a 256 assets/models/panda/panda-arms.glb assets/models/panda/panda-weights.json
```

# Hippo model

This folder holds the source mesh of the hippo, a copy with rebuilt arms and its weights, and the
rigged copy. The app does not serve these files. It loads the module `src/models/studio/hippo.ts`,
which this chain writes:

```text
hippo.glb                            source mesh
   │  tools/blender/hippo_arms.py    rebuilt arms and painted weights
   v
hippo-arms.glb + hippo-weights.json  `source` and `paintedWeights` of tools/mesh-rigs/hippo.json
   │  pnpm rig-mesh hippo
   v
hippo.rig.glb                        rigged mesh
   │  pnpm studio-body hippo
   v
src/models/studio/hippo.ts           studio body of the app
```

`docs/agents/rigging.md` gives the steps of the chain.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `hippo.glb` | Source mesh (below) | None |
| `hippo-arms.glb` | Copy of `hippo.glb` with rebuilt arms. License as `hippo.glb` | `hippo_arms.py` |
| `hippo-weights.json` | Weights of the same Blender run. License as `hippo.glb` | `hippo_arms.py` |
| `hippo.rig.glb` | Output of the rig. License as `hippo.glb` | `pnpm rig-mesh hippo` |
| `hippo-tpose.glb` | New source mesh in a T-pose (below). No tool reads it yet | None |

## hippo.glb

| Item | Value |
|---|---|
| Size | 15,088,140 bytes |
| SHA-256 | `15b1d48ac8dcc578744c79addb414104fae125888fa39d9fd441978c24602102` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,141 triangles and 4,362 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial`, double-sided, with a base color texture and a metallic-roughness texture, each a PNG of 4096 × 4096 pixels |

The values below are in the units of the studio: 1 unit from the soles to the top of the ears,
the soles at y = 0, +z forward, and +x the left side of the animal. The mesh faces +z. The weld is
at 1e-5.

- The weld gives 1,573 vertices in one connected part. Two open edges and one edge with three
  faces lie in the small tail. 124 faces have a corner angle below 10°.
- The box is x -0.361 to 0.361, y 0 to 1, and z -0.277 to 0.276. The hippo is 1.9017 units of the
  file high from the soles to the top of the ears. The top of the skull is at y 0.981.
- The hippo stands upright on very short legs, with the crotch at y 0.122. The round belly goes
  forward to z 0.216.
- The short arms hang down, out, and forward. They are apart from the belly from x 0.207 out,
  with the paws at y 0.36 to 0.45.
- The small eyes are dark faces of the head surface at y 0.91 and z 0.094, with no shells. The
  small round ears go from y 0.965 to 1.0 at x ±0.1. The small tail hangs from y 0.215 to 0.157.

## hippo-arms.glb and hippo-weights.json

| Item | Value |
|---|---|
| `hippo-arms.glb` | 922,388 bytes, SHA-256 `5fb9ecc5973690e6c9e56f982fd587cf665ecc9b64ab7f77822e06bbc4bfdec7` |
| Mesh | 1,804 vertices after a weld at 1e-5, 3,603 triangles: on each arm a tube of quad rings of 16 vertices, joined to the socket and the paw with Bridge Edge Loops, with Beautify Faces and Collapse Edges on the thin faces |
| Material | One material with one base color JPEG: the atlas of the source, and a strip of 512 pixels on top with the skin color of the source arms, baked onto the new faces. The side walls and the flat inner sides take one skin color of the trunk. No metallic-roughness texture |
| `hippo-weights.json` | 400,569 bytes, SHA-256 `1bbd06fb66568694e4ad1a59220fe69db9536e8e540d482ed5bcddf3417d847b` |
| Weights | The automatic weights of Blender with the Weight Paint fixes of the script, on the studio bones and the arm segments and helpers (`armSegments` of the config), for `paintedWeights` of the config |

The hanging upper arm joins the trunk down to about y 0.45, near the elbow. Thus the script
follows the route of `cat_arms.py` and `fox_arms.py`: a cut along the seam where the arm meets the
trunk, a side wall of the trunk under the arm, and a tube with a flat inner side on the wall. The
arms are 1.5 times longer from the socket, because a rig with arm segments does not stretch the
arms.

The faces of the paws, the trunk, the legs, and the head are the faces of the source. Only the
thin faces at the cut loops collapse or go. The wrist cut lies 0.25 of the paw from the wrist
joint, parallel to the last ring of the tube. Smooth Vertices evens the band of each wrist, so
that the bridge to the paw has no lip and no spike (`cut_planes()` and `step_smooth_wrist()`).
Each paw keeps the bend of the source, about 25° off the forearm in the plane of the palm. A run
gives the same bytes:

```bash
blender -b --factory-startup -P tools/blender/hippo_arms.py
shasum -a 256 assets/models/hippo/*.glb assets/models/hippo/hippo-weights.json
```

## hippo-tpose.glb

The new source mesh of the hippo, in a T-pose: the arms are level and out to the sides, free of
the trunk. The mesh has no skeleton.

| Item | Value |
|---|---|
| Size | 16,620,776 bytes |
| SHA-256 | `8b9ed066f67a7c2a80bd18643275e62d5a82e2939c9589b81f47d3197905ddac` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,098 triangles and 4,255 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial`, double-sided, with a base color PNG (10,781,869 bytes) and a metallic-roughness PNG (5,682,574 bytes), each of 4096 × 4096 pixels |

The values below are in the units of the studio: 1 unit from the soles to the top of the ears,
the soles at y = 0, +z forward, and +x the left side of the animal. The mesh faces +z. The weld is
at 1e-5.

- The weld gives 1,552 vertices in one connected part. Three open edges and one edge with three
  faces remain. 94 faces have a corner angle below 10°.
- The box is x -0.536 to 0.536, y 0 to 1, and z -0.270 to 0.268. The hippo is 1.7724 units of the
  file high from the soles to the top of the ears. The top of the skull is at y 0.984.
- The hippo stands upright on very short legs, with the crotch at y 0.14. The very round belly
  goes forward to z 0.214.
- The arms are level at y 0.63 and free of the trunk from x 0.2 out. Each paw ends at x 0.536,
  with a row of light claws under its end, so the palm faces down.
- The eyes are dark faces of the head surface at y 0.91 and z 0.104, with no shells. The small
  round ears go from y 0.96 to 1.0 at x ±0.08 to ±0.12. The short tail hangs from y 0.32 to 0.23
  at z -0.25.

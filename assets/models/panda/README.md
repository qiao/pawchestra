# Panda model

This folder holds the source mesh of the panda, a copy with rebuilt arms and its weights, a copy
with the color edges cut, and the rigged copy. The app does not serve these files. It loads the module `src/models/studio/panda.ts`,
which this chain writes:

```text
panda-tpose.glb                      source mesh
   │  tools/blender/arm_rebuild.py panda --factor 1.05
   v
panda-arms.glb + panda-weights.json  `weightSource` and `paintedWeights` of tools/mesh-rigs/panda.json
   │  tools/blender/panda_edge.py
   v
panda-edge.glb                       `source` of tools/mesh-rigs/panda.json
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
| `panda-edge.glb` | Copy of `panda-arms.glb` with the color edges cut. License as the source | `panda_edge.py` (below) |
| `panda.rig.glb` | Output of the rig. License as the source | `pnpm rig-mesh panda` |

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

## panda-edge.glb

| Item | Value |
|---|---|
| Size | 816,332 bytes |
| SHA-256 | `0afdef67d919dcbb201dae71a724c67f6edea09665434bd2a319f06ddaa358c3` |
| Mesh | 4,071 triangles (3,707 in `panda-arms.glb`), with the same 2 open edges and 1 edge with more than two faces |

The faces of the head and the trunk are 2 cm to 5 cm across, and the rig gives each face one
color. With no cut, each eye patch is a set of angular shards, and the lower edge of the band on
the back is a saw line. `tools/blender/panda_edge.py` cuts the faces along the edge between the
black and the white of the texture, in two regions: the eye patches, and the lower edge of the
band on the back. It splits each face that the edge crosses at the middles of its edges one time,
then splits each edge between a light and a dark vertex where the texture changes. The faces of
the eye boxes keep their edges. Each new vertex lies on an old face: the largest distance of a
vertex from the surface of `panda-arms.glb` is below 1e-7 units, and the area is the same. The rig
takes the weights of `panda-arms.glb` (`weightSource` of the config), so the cut moves no weight.

The front and the sides of the band keep their faces. There the weights of the clavicles change
much from corner to corner, and the small new faces turned over in the play of the trombonist.

A headless run gives the same bytes:

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python \
  tools/blender/panda_edge.py -- assets/models/panda/panda-arms.glb assets/models/panda/panda-edge.glb
shasum -a 256 assets/models/panda/panda-edge.glb
```

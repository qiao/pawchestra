# Cat model

This folder holds the T-pose source mesh of the cat, a copy with rebuilt arms and its weights,
and the rigged copy. The app does not serve these files. It loads the module
`src/models/studio/cat.ts`, which this chain writes:

```text
cat-tpose.glb                      source mesh (`armSource` of tools/mesh-rigs/cat.json)
   │  tools/blender/arm_rebuild.py rebuilt arms and painted weights
   v
cat-arms.glb + cat-weights.json    `source` and `paintedWeights` of tools/mesh-rigs/cat.json
   │  pnpm rig-mesh cat
   v
cat.rig.glb                        rigged mesh
   │  pnpm studio-body cat
   v
src/models/studio/cat.ts           studio body of the app
```

`docs/agents/rigging.md` gives the steps of the chain. The target of the form is the sheet
`docs/reference/cat-views.png`. The cat has the same bead eyes as the fox and the rabbit.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `cat-tpose.glb` | Source mesh (below) | None |
| `cat-arms.glb` | Copy of `cat-tpose.glb` with rebuilt arms. License as `cat-tpose.glb` | `arm_rebuild.py` (below) |
| `cat-weights.json` | Weights of the same Blender run. License as `cat-tpose.glb` | The same run |
| `cat.rig.glb` | Output of the rig. License as `cat-tpose.glb` | `pnpm rig-mesh cat` |

## cat-tpose.glb

The new source mesh of the cat, in a T-pose: the arms are level and out to the sides, free of the
trunk. The mesh has no skeleton.

| Item | Value |
|---|---|
| Size | 16,839,588 bytes |
| SHA-256 | `0880377af85b14e01dd5985e3a53a35f88b2fa2c5e8901505488b510e66f4210` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,110 triangles and 4,386 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial`, double-sided, with a base color PNG (11,083,837 bytes) and a metallic-roughness PNG (5,595,156 bytes), each of 4096 × 4096 pixels |

The values below are in the units of the studio: 1 unit from the soles to the tips of the ears,
the soles at y = 0, +z forward, and +x the left side of the animal. The mesh faces +z. The weld is
at 1e-5.

- The weld gives 1,565 vertices in one connected part. 23 open edges and 21 edges with more than
  two faces remain. 213 faces have a corner angle below 10°.
- The box is x -0.475 to 0.474, y 0 to 1, and z -0.267 to 0.252. The cat is 1.9017 units of the
  file high from the soles to the tips of the ears. The top of the skull is at y 0.914.
- The cat stands upright on short legs, with the crotch at y 0.145. The trunk is narrow: 0.21 units
  wide at the waist (y 0.5). The cream belly goes from the chin to the crotch.
- The arms are level at y 0.598 and free of the trunk from x 0.13 out. The white paw starts at
  x 0.35, and each paw ends at x 0.474, with the pink pads and claws under it, so the palm faces
  down.
- The eyes are dark faces of the head surface at y 0.80 and z 0.20, with no shells. The pink nose
  is at y 0.75 and z 0.25. Thin whiskers stand out from the muzzle.
- The long tail hangs from the back of the haunch (y 0.26, z -0.06) down to y 0.09 behind the
  legs, and curls up behind to y 0.25 at z -0.27.

## cat-arms.glb and cat-weights.json

`tools/blender/arm_rebuild.py` rebuilds the free T-pose arms of `cat-tpose.glb` with quad tubes
at the length of the mesh (no `--factor`), and writes the Blender weights of the arms. The
shoulder line lies at 0.25 of the upper arm, and the wrist cut at 0.1 of the paw. Each arm has 14
rings of 16 vertices. The rings of each elbow lie 0.035 units from the elbow joint (`--spec`), and
the elbow helper is 0.07 units, twice that gap: with the gap of 0.0216 units that the script
chooses, the inner faces of each elbow turned over in each pose of the play and the rest. The
faces of the paws, the trunk, the legs, the tail, and the head are the faces of the source. The
points of `cat-weights.json` are the places after the `soften` of the brow in the config, so that
the painted weights find each softened vertex. A run gives the same bytes:

```bash
blender -b --factory-startup -P tools/blender/arm_rebuild.py -- cat --spec '{"gap": 0.035}'
```

| File | Size | SHA-256 |
|---|---|---|
| `cat-arms.glb` | 1,117,708 bytes | `534753ea563f0e71e438485a3b481535c26406b04571733aaf316f062f1cb6e2` |
| `cat-weights.json` | 443,441 bytes | `02b0339c3aec91562a2f2f116c9926b79bade46a9b595ce3fc5d1de12edfb948` |

## cat.rig.glb

| Item | Value |
|---|---|
| Size | 825,140 bytes |
| SHA-256 | `840b652c391ea46254f445e9b2e1b4e9b44f982a6d2573db300ef65d73b3d96d` |
| Form | The thigh 1.6 and the shin 2.4 times as long as on the source, and the thigh 1.4 times as thick (`legFactor`, `shinFactor`, `legGirth`), so that the cat sits on the chair of the cat of the A-pose mesh: the seat top is 0.300 m high, 0.46 m wide, and 0.343 m deep. The trunk from the hips joint to the chest joint is 0.6 times as long (`trunkFactor`, `trunkTop`), so that the trunk from the hips joint to the neck joint is 1.61 H (that cat 1.49 H). The head and the ears are 0.85 times as large, around the neck joint (`headFactor`), so that the head is as wide for its height as the head of that cat. The sharp edges of the brow are softened (`soften`), so that the brow does not read as worried. The body comes near the shape of that cat on the seated bind: the upper arm 0.67 and the forearm 0.87 times as thick (`armGirth`); a flatter and narrower belly, a deeper chest, narrow shoulders (the shoulder joints 0.238 m apart, that cat 0.212 m), and a straight back into the neck (`girthProfile`); and the thighs 1 degree out in place of 8, so that the legs are close and parallel from the front (`studio.legTurns`) |
| Bind | The role-neutral bind (design 4.4): the arms of the source, straight (`studio.straightArms`), with the elbow axes of the bent bind of `studio.bindArms`, and the bind supination L 150 and R 90 (`studio.bindSupination`) |
| Faces | 3,926 triangles: 3,902 of the body and the eye shells, of them 46 gloss |
| Shapes | The arm-down shape of each arm, the straight legs of each side, and four `raise` shapes: the bent left elbow at rest (two), the bow arm in the play, and the bent right elbow at rest |
| Tail | In the seated bind, the long tail lies on the seat behind the haunch and hangs over the left side of the seat (`studio.tailBind`). It keeps its curl, also in the standing body. The footprint of the seated cat is 0.650 m deep, 1.2 cm deeper than on the cat of the A-pose mesh |

A run of `pnpm rig-mesh cat` gives the same bytes.

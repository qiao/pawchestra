# Cat model

This folder holds the source mesh of the cat, a copy with rebuilt arms and its weights, and the
rigged copy. The app does not serve these files. It loads the module `src/models/studio/cat.ts`,
which this chain writes:

```text
cat.glb                            source mesh
   │  tools/blender/cat_arms.py    rebuilt arms, belly, and painted weights
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
| `cat.glb` | Source mesh (below) | None |
| `cat-arms.glb` | Copy of `cat.glb` with rebuilt arms and belly. License as `cat.glb` | `cat_arms.py` |
| `cat-weights.json` | Weights of the same Blender run. License as `cat.glb` | `cat_arms.py` |
| `cat.rig.glb` | Output of the rig. License as `cat.glb` | `pnpm rig-mesh cat` |
| `cat-tpose.glb` | New source mesh in a T-pose (below). No tool reads it yet | None |

## cat.glb

| Item | Value |
|---|---|
| Size | 14,466,300 bytes |
| SHA-256 | `0ca57eaa7f831ce5f17ff889d46b935e6c21400e69a597347c1381f0305cda9e` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,121 triangles and 4,148 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial`, double-sided, with a base color texture and a metallic-roughness texture, each a PNG of 4096 × 4096 pixels. The texture is an atlas of an automatic unwrap |

Facts of the mesh:

- A weld at 1e-5 gives 1,563 vertices in one connected part. The mesh has 2 open edges and 6
  edges with more than two faces. 318 faces have a corner angle below 10°.
- The box is x -0.491 to 0.490, y -0.952 to 0.952, and z -0.419 to 0.426. Thus the cat is 1.903
  units high from the soles to the tips of the ears.
- The cat faces +z, with its left side at +x. These are the axes of the studio.
- The cat stands in an A-pose: the arms go down and out at about 58° below the horizontal.
- The eyes are dark faces of the head surface with a few green faces, with no shells. Thin
  whiskers stand out from the muzzle.
- The tail hangs down behind the legs, and its end goes back along the floor. The sheet shows a
  tail that curls up at its end.

## cat-arms.glb and cat-weights.json

| Item | Value |
|---|---|
| `cat-arms.glb` | 1,180,540 bytes, SHA-256 `ecfe907e75fac79a56df2e5aa98e82b95217ff78f0d17cddb95e880552d90d76` |
| Mesh | 2,146 vertices after a weld at 1e-5, 4,287 triangles: on each arm a tube of 16 rings of 16 vertices, joined to the shoulder socket and to the paw with Bridge Edge Loops, and a side wall of 54 (left) and 50 (right) faces under each arm. Near the left armpit line, 8 vertices of the first two shoulder rings merged into the next ring or into the line |
| Material | One material with one base color JPEG of 4096 × 4608 pixels: the atlas of the source, and a strip of 512 pixels on top with the fur color of the source arms, baked onto the new faces. The side walls and the flat inner sides of the arms take one gray fur texel of the trunk beside the seam. No metallic-roughness texture |
| `cat-weights.json` | 480,430 bytes, SHA-256 `588d9b38b0dff053118adf037f9c87521a1504fc48df949043622062a486155e` |
| Weights | The automatic weights of Blender with the Weight Paint fixes of the script, on the studio bones and the arm segments and helpers (`armSegments` of the config), for `paintedWeights` of the config. The arms take the automatic weights of the copy before the round side walls (`step_tube_heat()`) |

The upper arm of `cat.glb` joins the side of the trunk down to the elbow. Thus the script makes an
armpit: a cut along the seam where the arm meets the trunk, a side wall of the trunk under the
arm, and a quad tube from the shoulder to the wrist. The flat inner side of the tube lies on the
side wall and meets it only at the armpit line. The faces of the paws, the trunk, the legs, and
the head are the faces of the source.

A rig with arm segments does not stretch the arms, so the arms get their length in the copy. The
upper arm is 0.92 and the forearm 0.78 as long as on the source. The arm is 1.10 head heights from
the shoulder joint to the wrist (1.30 on the source). The cross-section is 0.85 of the source.

The other steps of the script:

- **`step_belly()`.** It moves the belly front onto an ellipse arc and each side onto an even
  curve, at most 0.016 units. Thus the trunk is an even oval from the front and from the side. The
  front of the upper belly, where the bow upper arm lies in the play, is a little flatter, most at
  the middle line (`flat`). The faces and the colors of the trunk stay.
- **`step_round_wall()`.** It deletes the small trunk faces that turn back under the side wall,
  fills the hole again with even faces, and smooths the wall and the trunk near it along the
  normal of the plane of the seam. Thus the side wall rounds into the trunk.
- **`step_clean_pit()`.** It merges the shoulder ring vertices near the left armpit line into the
  next ring, and the socket vertices near the line ends. Then it fills the band again with a strip
  of triangles. Thus the band has no thin face. The right arm keeps its band, because the clean
  made the root ring of the bow arm flatter in the play.

A run gives the same bytes:

```bash
blender -b --factory-startup -P tools/blender/cat_arms.py
shasum -a 256 assets/models/cat/*.glb assets/models/cat/cat-weights.json
```

## Rig facts of cat.rig.glb

- The seated bind bends each elbow 79° and turns the left paw 120°. Thus the rig binds the left
  lower arm with the dual quaternion blend (`bind.arm` of the config), and the elbow and the
  forearm keep the round of the tube. The bow arm keeps the linear blend, because it bends
  further than the bind in the play.
- The front of each arm root keeps the trunk weights, so it stays with the chest. With no trunk
  weights, the root folded.
- Three `raise` shapes of the left arm (the turns of the play, of the rest, and between them) move
  the front of the arm root half of the way with the first segment of the upper arm (`follow`).
  In the shape of the play, the skin near the root front fills its valleys and moves no vertex in
  (`follow.fill`). A fourth shape does the same for the bow arm in the play.

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

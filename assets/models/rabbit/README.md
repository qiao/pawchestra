# Rabbit model

This folder holds the source mesh of the rabbit and its rig. The app does not serve these files.
It loads the module `src/models/studio/rabbit.ts`, which this chain writes by the simple route
(design 4.4, "Simple route"):

```text
tripo-p2/rabbit.fbx + tripo-p2/rabbit.fbm/rabbit_basecolor.jpg     source mesh (quads) and texture
   │  blender -b --factory-startup --python tools/blender/simple_rig.py --
   │      tools/mesh-rigs/simple/rabbit-tripo.json --out assets/models/rabbit/tripo-p2/rabbit.blend
   v
tripo-p2/rabbit.blend                                              rig, weights, bind, pea eyes
   │  pnpm rig-export rabbit --blend assets/models/rabbit/tripo-p2/rabbit.blend
   │      --out assets/models/rabbit/tripo-p2/rabbit.rig.glb
   v
tripo-p2/rabbit.rig.glb + tripo-p2/rabbit.rig.json                 rigged mesh and its summary
   │  pnpm studio-body rabbit
   v
src/models/studio/rabbit.ts                                        studio body of the app
```

`tripo-p2/rabbit.blend` lies beside the GLB file of the app, so the tools take the rig as a hand
rig (`handRigOf()` of `tools/glb-swap.ts`): they read its values from the export, and
`pnpm rig-mesh rabbit` stops. A run of the chain gives the same `rabbit.rig.glb`. The `.blend`
differs from run to run.

## Files

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/rabbit.fbx` | Source mesh with quad faces (below) | None |
| `tripo-p2/rabbit.fbm/rabbit_basecolor.jpg` | Base color texture of the source, at 2048 × 2048 pixels (below) | None |
| `tripo-p2/rabbit.blend` | Output of `simple_rig.py`. License as the source | `simple_rig.py` (above) |
| `tripo-p2/rabbit.rig.glb` | Export of `rabbit.blend`. License as the source | `pnpm rig-export` (above) |
| `tripo-p2/rabbit.rig.json` | Text summary of the export, for diffs | The same run |

## tripo-p2/rabbit.fbx

The rabbit of the turnaround sheet `rabbit.png` of 2026-11-07 (a T-pose, three views), made with
Tripo P2 (Smart Mesh, quad output, a target of about 2,000 quads). The FBX file is the file of the
download, with no change. It also holds a Tripo armature (65 Mixamo bones), which the rig does not
read.

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan, and given on 2026-11-07 (`tripo_convert_ba507965-bf17-4167-84e0-276667bc52f2.zip`, SHA-256 `6b17930d68428b8efd86ec129d3680335ca9f8db145d28629f2e0c346ec25a1f`). The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary |

| File | Size | SHA-256 |
|---|---|---|
| `rabbit.fbx` | 363,196 bytes | `df87e14418a11ca61024bb3370a85ed72cd4ef2e159b732ab92f78a307f8ac0e` |
| `rabbit.fbm/rabbit_basecolor.jpg` | 576,197 bytes | `19977ea6de5e557fc93bbdae314e67feb930ac558d0edea66bbafb97eb72cb14` |

The texture is the base color JPEG of the download (4096 × 4096 pixels) at 2048 × 2048 pixels,
written by Blender (`Image.scale()`, JPEG quality 90). Its colors change by 1.2 of 255 on the
mean. The normal, roughness, and metallic maps of the download stay out.

The values below are in the units of the studio: 1 unit from the soles to the ear tips, the soles
at y = 0, +z forward, and +x the left side of the animal. In the FBX file, the mesh is 0.9995
units high, and it faces -Y.

- **Faces.** 2,771 vertices and 2,973 faces: 2,425 quads and 548 triangles (5,398 triangles). No
  vertices merge at 1e-5. No edge has more than two faces. The mesh is symmetric: each vertex has
  a mirror vertex within 0.0025 units.
- **Parts.** 11 parts: the body (2,493 vertices), two eyeballs (99 vertices each) in the eye
  sockets, and 8 thin whisker strips (four on each side).
- **Open edges.** 124, all on the face: the rim of each eye socket (14 edges), the back of each
  eyeball inside the head (8 edges), and the edges of the 8 whisker strips. The fur has no hole.
- **Form.** The arms stand out level at y 0.557, free of the trunk from |x| 0.09, with the paw
  tips at |x| 0.306. The arm rings have 11 or 12 vertices, about 0.9 radii apart. The front of
  each mid upper arm holds 3 triangles, so the edge ring there does not close. The legs part
  below the crotch at y 0.235. A large round haunch, a thin neck at y 0.60, a round head from y
  0.62 to 0.78, and ears from y 0.78 to the top. A round tail ball at y 0.25 to 0.35.
- **Colors.** Cream fur (sRGB about 231, 201, 168), a pink nose (about 240, 160, 130), pink
  inner ears, and pink pads under the paws. The dark eyes are the eyeballs. The face has a smile
  line.

```bash
shasum -a 256 assets/models/rabbit/tripo-p2/rabbit.fbx assets/models/rabbit/tripo-p2/rabbit.fbm/rabbit_basecolor.jpg
```

## tripo-p2/rabbit.rig.glb

The simple route of design 4.4 with the config `tools/mesh-rigs/simple/rabbit-tripo.json`. No
cut, no cap, no remesh, no rebuild, and no point edit.

| File | Size | SHA-256 |
|---|---|---|
| `rabbit.rig.glb` | 756,560 bytes | `0e299b6bfdef1c100f03d9589f48fe9099bb9063dd69357e7448a4dc1719a12f` |

- **Mesh.** The FBX quads, welded at 1e-5, flat faces, and the face colors of `add_surface()`
  from the texture, with no tone move. The export divides each quad into two triangles.
- **Limbs.** Each upper arm and forearm 1.2 times as long (`limbs.arm`), so that the left paw
  reaches the fingerboard from 0.01 of its length, as on the rabbit of the old body. The shin band
  0.85 times and the thigh band 0.739 times as high (`limbs.leg`), so that the thigh and the seat
  height are those of the old body: at the scale of H, the source legs are longer.
- **Rings.** 5 new rings on each arm, from 0.1 to 0.97 of the line from the shoulder joint to the
  wrist joint: each edge of the quad edge ring between two rings splits at its middle
  (`rings.subdivide`). The edge ring at 0.32 of each arm line holds the source triangles above,
  so it takes no split. 224 new triangles (5,622 in all).
- **Weights.** Bone heat, 3 weight smooth passes, and the roll split of the arm segments
  (`rollSplit`): each vertex takes the roll of its place along the bone. The eyeballs, the
  whiskers, and the nose take the head bone alone.
- **Bind.** The leg turns and the trunk of the old body, straight arms, and the bind supination
  of `pnpm bind-supination rabbit` (L 97, R 47).
- **Facts.** `height` from the shoulder joints at 1.6833 m for each unit (H 0.2985 m, as on the
  old body), `crease` 35, `backRoom` 0.04. The seat top is 0.261 m.

## Earlier bodies

The git history keeps the earlier rabbit files, which no tool reads now: the A-pose body of
`pnpm rig-mesh rabbit` (`rabbit-apose.glb`, `rabbit-arms.glb`, `rabbit-weights.json`, and
`tools/mesh-rigs/rabbit.json`, removed on 2026-11-07), the hand rig trial of a first Tripo mesh (`tripo/`, `hand-rig/`), and
two trials of the simple route on the Meshy T-pose mesh (`rabbit-tpose.glb`, `simple/`). The
trials of the simple route gave the steps of the chain above: a plain limb stretch, a weight smooth,
and the bind supination of the probe.

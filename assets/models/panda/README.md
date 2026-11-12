# Panda model

This folder holds the source mesh of the old panda, a copy with rebuilt arms and its weights, a
copy with the color edges cut, a copy with fewer folds at the arm roots, and the rigged copy. The
app does not serve these files. It loads the module `src/models/studio/panda.ts`, which this chain
wrote before the hand rig of the Tripo panda ("Hand rig" below) took its place:

```text
panda-tpose.glb                      source mesh
   │  tools/blender/arm_rebuild.py panda --factor 1.05
   v
panda-arms.glb + panda-weights.json  `weightSource` and `paintedWeights` of tools/mesh-rigs/panda.json
   │  tools/blender/panda_edge.py
   v
panda-edge.glb
   │  point edits in Blender            fewer folds at the arm roots (panda-edge-pit.json)
   v
panda-edge-pit.glb                   `source` of tools/mesh-rigs/panda.json
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
| `panda-edge-pit.glb` | Copy of `panda-edge.glb` with fewer folds at the arm roots. License as the source | None: point edits in Blender (below) |
| `panda-edge-pit.json` | The list of the edits of `panda-edge-pit.glb`. License as the source | None |
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
| Size | 815,864 bytes |
| SHA-256 | `8cbcaf9969d7bebeb25cf10b8f67eab9ae5b90b001d827c1d8ee7cfdbc89fa0a` |
| Mesh | 4,057 triangles (3,707 in `panda-arms.glb`), with the same 2 open edges and 1 edge with more than two faces |

The faces of the head and the trunk are 2 cm to 5 cm across, and the rig gives each face one
color. With no cut, each eye patch is a set of angular shards, and the lower edge of the band is a
saw line. `tools/blender/panda_edge.py` cuts the faces along the edge between the black and the
white of the texture, in two regions with their own settings (`REGIONS`). In the eye patches, it
first splits each face that the edge crosses at the middles of its edges, so that each small patch
keeps its oval. Along the lower edge of the band, on the front, the sides, and the back, it makes
no such split, and a change near a corner goes through that corner, so that the new faces are few
and large. Then it splits each edge between a light and a dark vertex where the texture changes.
The faces of the eye boxes keep their edges. Each new vertex lies on an old face: the largest
distance of a vertex from the surface of `panda-arms.glb` is below 1e-7 units, and the area is the
same. The rig takes the weights of `panda-arms.glb` (`weightSource` of the config), so the cut
moves no weight.

At the band, the weights of the clavicles change much from corner to corner. Small new faces of a
middle split turned over in the play of the trombonist. The large new faces do not: the fold probe
of the trombonist gives the same faces as with no cut on the front and the sides.

A headless run gives the same bytes:

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python \
  tools/blender/panda_edge.py -- assets/models/panda/panda-arms.glb assets/models/panda/panda-edge.glb
shasum -a 256 assets/models/panda/panda-edge.glb
```

## panda.rig.glb

| Item | Value |
|---|---|
| Size | 581,504 bytes |
| SHA-256 | `87c071a67defc58a51bdca78c597577e521e4dc11418b089fce43ce3c62f69f9` |
| Form | The thigh 1.1 and the shin 1.38 times as long as on the source (`legFactor`, `shinFactor`), and the front edge of the seat at z -0.085 (`chair.front`), so that the panda sits on the chair of the panda of the A-pose mesh: the seat top is 0.277 m high, and the chair is 0.210 m deep. The head is 0.93 times as large around the neck joint (`headFactor`), so that it is 1.128 H wide, as the head of that panda. The trunk tapers from the belly to the shoulders (`girthProfile`), the upper arms are 0.92 times as thick (`armGirth`), and the thighs turn 5° out, so that the body keeps the shape of that panda (design 4.4, `pnpm body-shape trombonist --base 7cf41074`) |
| Root faces | The thin faces at the front of each arm root, and the faces under the left arm root, take one mean weight in each group (`weights.rigidPainted` of the config). The left group joins the front faces and the faces under the root, so that the hanging T-pose arm folds fewer faces and the fold does not move to an edge between two groups |

A run of `pnpm rig-mesh panda` gives the same bytes.

## panda-edge-pit.glb

| Item | Value |
|---|---|
| Size | 815,708 bytes |
| SHA-256 | `c5c62488107b04892297f5f4692727e4eb5ed697f901d6fb012639d610530b5b` |
| Writer | Khronos glTF Blender I/O v5.2.40 |

The bind of `panda-edge.glb` has no fold at the arm roots. The hold of the trombone brings the
level arms of the T-pose down, and some faces at the roots then turn over:

- On the top of the left root, a sliver with its three corners nearly on one line: a dark back
  face at the top of the root at rest and at the lift and the lowering of the trombone.
- At the top front of each root and on the front of the left root, faces between corners of other
  weights: fins and deep notches at the notes and at rest.

The copy removes them with point edits in the live Blender on the welded mesh. Each edit merges one
vertex into a neighbor vertex at the place of that neighbor, so that no vertex goes to a new place.
`panda-edge-pit.json` lists the 5 merges in their order. Each merge moves a corner at most
0.035 units. The copy has 2,026 vertices and 4,047 triangles after the weld (2,031 and 4,057
before): 10 faces go, and each other face keeps the UVs of its own corners. Each merged corner
takes the weights of its new place on `panda-arms.glb` (`weightSource`).

A merge at the back of the left root also removed folds at the notes, but it made a notch under
the root in the bind, so the copy does not keep it. Two faults stay, because they are folds of the
pose and no fault of the mesh: a face of the upper chest under the chin turns over when the head
bends to the mouthpiece (a dark triangle beside each root in the front views), and the right
upper arm twists into a zigzag band at rest.

## Hand rig

`tripo-hand/` holds the body of the app: a hand rig of the Tripo P2 mesh `tripo-p2/panda.fbx`,
made by one build script in headless Blender 5.2, by the route of the Tripo wolf
(`../wolf/README.md`, "Candidate hand rig"). The body keeps the form, the colors, and the eye paint
of the source. The only point edit makes the front paws smaller ("Paw size"). The arms keep the
length of the source: no cut, no split from the trunk, and no stretch. The `ANIMALS` entry of the
panda in `tools/studio-body.ts` points to `tripo-hand/panda.rig.glb`. The files of the old panda
above do not change.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/panda.fbx`, `tripo-p2/panda.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/panda.blend` | Made from `tripo-p2/panda.fbx` by the scripted edits below. License as the FBX file | The scripted edits below |
| `tripo-hand/panda.rig.glb` | Export of `tripo-hand/panda.blend`. License as the FBX file | `pnpm rig-export panda --blend assets/models/panda/tripo-hand/panda.blend --out assets/models/panda/tripo-hand/panda.rig.glb` |
| `tripo-hand/panda.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/panda-color.webp`, `tripo-hand/panda-normal.webp` | Web copies of the color map and the normal map of the FBX ("Maps" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/panda-maps.py` |

### tripo-p2/panda.fbx

A round plush panda with cream fur, dark ears, eye patches, shoulders, arms, and legs, and a round
tail, in a T-pose with quad faces, made with Tripo P2 from the sheet `assets/images2/panda.png` of
the main checkout.

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan, and given on 2026-11-12. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary. The maps lie beside the FBX file in the zip file |
| Contents | One mesh object, with no armature and no animation. 3,267 vertices and 3,599 faces: 2,895 quads and 704 triangles. One UV layer |
| Parts | 3 parts: the body with the round tail (3,185 vertices, closed), and two eyeballs (41 vertices each, open caps of about 0.03 units at (±0.052, 0.842, 0.125)). The 32 open edges are the rims of the eyeballs |
| Axes | The panda faces -y of Blender, so the import takes no turn. 1 unit from the soles to the ear tips, x ±0.46 (the paw tips), and z ±0.215 (the belly and the tail) |

The folder `panda.fbm/` keeps two maps of the zip file under new names, as bytes. The roughness
and the metallic maps are not kept.

| File | Name in the zip file | Size | Pixels | SHA-256 |
|---|---|---|---|---|
| `panda.fbx` | `tripo_convert_b9f16d02-8bf4-4c38-a0c1-408950af57ba.fbx` | 219,788 bytes | | `0151931b64e9625a7520199aa1a5d78451110a38489864c12247edbf405441c5` |
| `panda.fbm/panda_basecolor.jpg` | `tripo_rgb_ae82a68c-b295-4048-bb67-562c779168b7.jpg` | 4,478,108 bytes | 4096 × 4096 | `6acce2c36421f4a27ed65a8f6a12e9662c4d9a872be7452e506c806d33a4f018` |
| `panda.fbm/panda_normal.png` | `extracted_normal_a368a13f_cdd9_468f_8fd4_1f26b7dabe0a.png` | 10,096,302 bytes | 4096 × 4096 | `f0f30277d5fa3a47977d5e9014d12b385a4fab0c58acfa70c2084d6d7bcf4038` |

The color map paints the cream fur, the dark brown ears, eye patches, shoulders, arms, and legs, a
dark nose with nostrils, a thin smile line, and on each eyeball a brown iris, a black pupil, and a
white light. The normal map is an RGBA PNG with an alpha of 255 everywhere. Its red, green, and
blue hold a tangent-space normal in the encoding of the JPEG normal maps of the Tripo wolf and pig
(the median near 128, 127, 254), with the same sign of green: on the three maps, the tilt field
has the smaller curl with the same sign. Its tilts are smaller (95th percentile 0.07, against 0.20
on the wolf).

### tripo-hand/panda.blend

| Item | Value |
|---|---|
| Size | 400,899 bytes |
| SHA-256 | `fb8a82c363b78df5ae98ee2668ada5b6dff4dbccb35a91ef6ede88ae521771e7` |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the ear tips, the soles at z = 0, the panda faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `panda`: 3,767 vertices and 4,047 faces (3,343 quads and 704 triangles, 7,390 triangles), flat faces, and the surface of `sa.add_surface()`. No face is gloss: the nose takes the color map. The 91 faces of the two eyeballs have the face attribute `eye`, and the 312 faces of the two lids `lid`. The UV map of the FBX, and the property `texture` (`assets/models/panda/tripo-hand/panda-color.webp`) |
| Armature | `panda_rig`: the 30 body bones, `tail_tip`, and the 20 arm segments and helpers, at the joints of the config. The Action `bind` holds the seated bind with no bind supination. The properties `palm`, `hinges`, `seat`, and `lids` come from the steps below |
| Facts | `height` 1.133145 (the shoulder joints at 1.807249 m for each unit, so that H is 0.499711 m, the H of the panda of `panda.rig.glb`), `crease` 180, `seatWidth` 0.66 |
| Eyes | The eyeballs of the mesh at the size of the source, with the finish `varnish` and no eye light (`eyeFinish` of the entry), and a blink lid on each. No eye objects, so the app adds no bead eyes |

The scripts of the session (`scratch/panda/` of the worktree, which git ignores: `build.py`,
`redits.py`, `rings.py`, `make_config.py`, `params.json`, and `chain-here.sh`) are not in the repo.
They follow the scripts of the Tripo cat and of the Tripo wolf. `make_config.py` writes
`tools/mesh-rigs/simple/panda-tripo.json`: the joints of the source, mapped by the paw turns and
the paw edit. The edits, in the order of the build (`sa` is `tools/blender/studio_armature.py`, x
is the x of the left side, y the height, in the source):

- **Import.** `sa.import_source('assets/models/panda/tripo-p2/panda.fbx', 1e-5)`. No vertex merges,
  and each face is flat.
- **Arm rings.** Edge ring Subdivide (`bmesh.ops.subdivide_edges(bm, edges=<ring>, cuts=1,
  use_grid_fill=True)`) of the clean quad bands of 16 edges between the closed arm loops at x
  0.199, 0.219, and 0.238, at the elbow (x 0.235).
- **Knee rings.** The same call with 1 cut on the leg bands of 18 edges between the closed loops at
  y 0.115, 0.138, and 0.158. The knee joint is at y 0.13.
- **Paws turned.** Each vertex past the arm ring at x 0.238 turns rigidly about the rest forearm
  axis by whole ring steps of 22.5 degrees: -135 degrees on the left (6 steps) and 112.5 degrees on
  the right (5 steps), 427 and 426 vertices. New quads join the two rings with the step offset, and
  the far ring takes the form of the ring before the turn (a fade to 0 at 0.02 units). The new
  quads keep the UVs of the old band ("Arm twist").
- **Paw size.** The point edit `paw` ("Paw size" below), after the automatic weights.
- **Other point edits.** None. The head, the eyes, the muzzle, the trunk, the legs, the feet, and
  the tail keep the form of the source.
- **Surface.** `sa.add_surface(panda, 'panda', <base color>, eye_fans=False,
  config=<panda-tripo.json>)`. The 40 faces in the nose box are no dark gloss faces, so they go back
  to the fur: the nose takes the color map with its painted nostrils.
- **Armature.** The joints of the config: the shoulder at x 0.13, the elbow at x 0.235, the wrist at
  x 0.33, the knuckles at x 0.40 (moved by the paw edit), the hip at (0.105, 0.24, -0.01), the knee
  at (0.116, 0.13, -0.007), and the ankle at y 0.045. The palm is the true palm of the source, the
  mean normal of the paw faces that face down (x from 0.36), (0.127, -0.992, -0.016), turned by the
  paw turn. The bind arms and the trunk are those of the panda of main.

The weights, in the rest pose:

1. Automatic Weights, then Limit Total 4 and Normalize All, on a copy of the mesh with no
   eyeball.
2. Arm rows: each vertex of a side with |x| from 0.13, within 0.085 units of the line of the rest
   arm, takes one exact row (`sa.set_weight_row()`): a clavicle share from 0.4 at x 0.13 to 0 at x
   0.17, an elbow helper share of 0.25, 0.75, 0.75, and 0.25 at x 0.2125, 0.2275, 0.2425, and 0.2575,
   and the rest on the 4 roll segments.
3. Wrist rows: the bend share of the paw grows in 12 equal steps of 0.004 from 0.03 units before
   the head of `hand_<side>`. Knuckle rows: the fingers share grows in 12 equal steps of 0.0035 from
   0.024 units before the head of `fingers_<side>`.
4. The eyeballs and the nose take {`head` 1}.
5. Ear rows: a plane across the base of each ear, through (0.072, 0.967, -0.035), (0.137, 0.881,
   -0.028), (0.081, 0.941, 0.019), and (0.111, 0.927, -0.068) (x mirrored on the right), the edge
   of the dark ear paint. Each head vertex 0.008 or more above the plane takes {`ear_<side>` 1},
   one from 0 to 0.008 {`ear_<side>` 0.5, `head` 0.5}.
6. Tail: the round tail is a bump of the haunch, no loose part. The automatic weights gave the tail
   bones shares over the lower back, so the bump and the back swayed with the idle tail. Each of
   the 152 vertices with a tail share gives it to `hips`, so the bump keeps its place.

**Smooth surface.** No relax and no region colors. The crease angle 180 gives each corner the mean
normal of the faces at its vertex, as the smooth shading of an FBX viewer.

**Paw size.** In the app, the front paws of the source read too large against the short arms: the
paw is 0.66 of the arm long and 0.70 of the arm wide (the source wolf 0.56 and 0.58, the panda of
main 0.29 and 0.39). The point edit `paw` of `redits.py` (in `params.json`: `{"kind": "paw",
"length": 0.8, "wide": 0.8, "thick": 1.0, "ramp": 0.02, "width": [0, 0, 1]}`), the edit of the
wolf, scales each front paw past the wrist joint about that joint, in the frame of the paw, with a
smoothstep share over the first 0.02 units. The paw height, the arm, and the feet do not change.
The largest move is 0.027 units (4.8 cm). The left paw in the rest of the export
(`scratch/panda/paw_measure.py`), against the shoulder distance:

| Measure | Source panda | Panda now | Panda of main | Tripo wolf |
|---|---|---|---|---|
| Length, wrist joint to tip | 0.506 | 0.405 | 0.302 | 0.451 |
| Width | 0.542 | 0.434 | 0.405 | 0.462 |

**Seat.** The thighs slope 25 degrees down and 5 degrees out in the bind, and the shins are
vertical, as on the panda of main (`legTurns` of the config). The legs are the short, thick legs of
the source, so the knee lies only 0.10 units in front of the hip, and the shin is 0.09 units
thick from the knee joint to its back. Thus the front of the seat lies 0.09 units behind the knee
joint (`seatGap`), and the seat top (the lowest point of the haunch over the seat) is 0.171 m high
(0.277 m on the panda of main), with the legs of the source. The chair is 0.435 m deep, so that
its back is behind the tail. Steeper thighs (40 degrees) give 0.185 m. A heel lift does not help
the round haunch, so the bind keeps the posture of the panda of main.

**Haunch and chair.** The haunch is 0.55 m wide at the seat top, 0.66 m 0.02 units above it, and
0.73 m at its widest, against the chair of 0.42 m of design 4.5. The fact `seatWidth` 0.66 gives
the panda a chair as wide as its haunch. The width of the chair moves no player: the layout moves
of the new body (below) are the same with 0.42, 0.60, 0.66, and 0.72.

**Tail.** The round tail is a bump of the haunch with the rows of `hips` (step 6 of the weights).
It lies 11.6 cm over the seat top and in front of the chair back, and `tools/tail-gap.ts` finds no
tail bone in the skin. With the tail rows of the automatic weights, it swayed 1.0 cm into the top
rail of the chair.

**Lids.** A lid on each eye: 14 × 13 points from psi -60 to 60 degrees and lam -60 to 65 degrees
(the right lid mirrors the range) at 1.15 ball radii, and a lower strip at 1.12 radii, held turned
up 125 degrees into the head (the property `lids`). The lid faces
take the dark eye patch at UV (0.8772, 0.6533), sRGB (52, 37, 30), at 0.3 UV for each unit, and
the row `head` 1. In the 21 steps of the blink no open lid point, side edge, or back edge leaves the
head (ray casts), and the open lid lies at least 0.0096 units under it. At 110 degrees, 15 points
of each open lid stood out of the head.

**Eyes.** Each eyeball is 0.027 units wide, about 0.08 of the head width at the eye line (0.33
units), under the limit of about 0.14. The front view and the default hall camera show the iris in
the middle of the eye with no white above it, and the gaze looks at the viewer. So the eyes keep
the size, the place, and the paint of the source. The map paints a light on each eye, so the eyes
take the finish `varnish` and no eye light, which gives one light in each eye. The source paints a
slight smile, and the face reads happy in the app, so the mouth takes no edit.

**Arm twist.** The roll of each upper arm (from the clavicle) and the twist of each forearm (the
paw from the upper arm), in degrees, in the moments of `pnpm pose-preview trombonist` with the
hold `PANDA_TROMBONE` of `src/pose/winds.ts`:

| Moment | Left upper arm | Left forearm | Right upper arm | Right forearm |
|---|---|---|---|---|
| first | 33.7 | 7.8 | -34.8 | 20.0 |
| seventh | 33.7 | 7.8 | -36.2 | 20.8 |
| rest | 38.1 | 9.5 | -43.5 | 22.4 |
| lift50 | 37.9 | 6.2 | -41.6 | 24.1 |
| lower50 | 37.4 | 5.9 | -40.1 | 23.2 |
| stand | 33.7 | 7.3 | -34.7 | 20.4 |

With no paw turn, the forearms twisted -127 degrees on the left and 96 to 149 degrees on the right.

**Maps** (`tools/panda-maps.py`, a copy of `tools/wolf-maps.py`). The color map is the source at
2048 pixels (Lanczos), WebP quality 60, method 6: no texel changes its color. The normal map takes
the red, green, and blue of the PNG: each x, y tilt limited to 0.2 (1.15 % of the texels), a box
scale to 1024 pixels, the tilts times 4 in red and green, 255 in blue, and `cwebp -q 60 -sharp_yuv
-m 6` (libwebp 1.5.0).

**Differences from the source.** The app light is warm and comes from above, so the cream fur reads
lighter and the dark parts read browner than in the even gray light of an FBX viewer. The front
paws are smaller (0.8). The eyeballs blink with lids. In the bind, the thighs slope forward and the
arms bend at the elbows.

The export of the file and the maps. License of each file: CC BY-NC 4.0, as the FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/panda.rig.glb` | 1,152,580 bytes | `7191c6d47721d18e50a08be326b7940904486723339bea9df192dde8e50ef797` |
| `tripo-hand/panda.rig.json` | 16,262 bytes | `20cfd4f65ce9f85f18807079fe4deb73e061b7dc89ef70a26c7ca118c56e132e` |
| `tripo-hand/panda-color.webp` | 259,152 bytes, 2048 × 2048 | `f630fa99d34ef0f4be8b5c8bafcdf90602ca1488d0f5946fc11420e66165909c` |
| `tripo-hand/panda-normal.webp` | 52,722 bytes, 1024 × 1024 | `aa537e7099c209fab0f402754cc48d6d45b930806cc567942ab1c56d31e551bb` |

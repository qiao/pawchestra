# Rabbit model

This folder holds the A-pose source mesh of the rabbit, a copy with rebuilt arms and its weights,
and the rigged copy. The app does not serve these files. It loads the module
`src/models/studio/rabbit.ts`, which this chain writes:

```text
rabbit-apose.glb                          source mesh
   │  violin_arms.py rabbit (e491ff3c)    rebuilt arms and painted weights
   v
rabbit-arms.glb + rabbit-weights.json     `source` and `paintedWeights` of the config
   │  pnpm rig-mesh rabbit                config tools/mesh-rigs/rabbit.json
   v
rabbit-apose.rig.glb                      rigged mesh
   │  pnpm studio-body rabbit
   v
src/models/studio/rabbit.ts               studio body of the app
```

This is the body that production shows. `docs/agents/rigging.md` gives the steps of the chain.

The folder also holds the files of trials that the app does not use ("Trial files" below): the
hand rig of 2026-11-04 and 2026-11-05 from a Tripo mesh (`hand-rig/`, `tripo/`), and the T-pose
mesh of an earlier body (`rabbit-tpose.glb`). The hand rig is rejected: it gave a thin, faceted
arm root and other faults. Its `.blend` lies in `hand-rig/`, so that no tool finds it beside the
GLB file of the app (`handRigOf()` of `tools/glb-swap.ts`), and `pnpm rig-mesh rabbit` runs.

`tripo-hand/` holds a candidate body ("tripo-hand/rabbit.blend" below): a hand rig of the Tripo P2
mesh `tripo-p2/rabbit.fbx`, made in a live Blender with no arm cut and no limb stretch. On the
branch of the candidate, the `ANIMALS` entry of the rabbit points to `tripo-hand/rabbit.rig.glb`.

## Files

The app chain:

| File | Origin | Rebuild |
|---|---|---|
| `rabbit-apose.glb` | Source mesh (below) | None |
| `rabbit-arms.glb` | Copy of the source with rebuilt arms. License as the source | `violin_arms.py rabbit` of e491ff3c |
| `rabbit-weights.json` | Weights of the same Blender run. License as the source | `violin_arms.py rabbit` of e491ff3c |
| `rabbit-apose.rig.glb` | Output of the rig. License as the source | `pnpm rig-mesh rabbit` |

The trial files, which the app does not use:

| File | Origin | Rebuild |
|---|---|---|
| `rabbit-tpose.glb` | T-pose source mesh (below) | None |
| `tripo/rabbit.fbx`, `tripo/rabbit.fbm/` | Source mesh with quad faces, and its four textures (below) | None |
| `hand-rig/rabbit.blend` | Made by hand in Blender from `tripo/rabbit.fbx` (below). License as the FBX file | None: edit it in Blender |
| `hand-rig/rabbit.rig.glb` | Export of `hand-rig/rabbit.blend`. License as the FBX file | `pnpm rig-export rabbit --blend assets/models/rabbit/hand-rig/rabbit.blend --out assets/models/rabbit/hand-rig/rabbit.rig.glb` |
| `hand-rig/rabbit.rig.json` | Text summary of the export, for diffs | The same run |

The candidate hand rig:

| File | Origin | Rebuild |
|---|---|---|
| `tripo-hand/rabbit.blend` | Made by hand in Blender 5.2 from `tripo-p2/rabbit.fbx` (below). License as the FBX file | None: edit it in Blender |
| `tripo-hand/rabbit.rig.glb` | Export of `tripo-hand/rabbit.blend`. License as the FBX file | `pnpm rig-export rabbit --blend assets/models/rabbit/tripo-hand/rabbit.blend --out assets/models/rabbit/tripo-hand/rabbit.rig.glb` |
| `tripo-hand/rabbit.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/rabbit-color.webp` | Web copy of the color map of the Tripo FBX ("Color map" below). License as the FBX file | None: made one time from the source image |

## rabbit-apose.glb

The mesh has no skeleton. The arms are in an A-pose: out, down, and a little forward, apart from
the trunk below the shoulders.

| Item | Value |
|---|---|
| Size | 16,662,596 bytes |
| SHA-256 | `ed1c4778be4ee6ceba54aaf8e92117684551c18c06448e3b4904d2415e56634a` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,118 triangles and 4,327 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |

## rabbit-arms.glb and rabbit-weights.json

| Item | Value |
|---|---|
| `rabbit-arms.glb` | 1,066,280 bytes, SHA-256 `3a8d60065ea5679e331fc16e106e74e3f68546654b83176a55dba878e2554245` |
| Mesh | 2,084 vertices after a weld at 1e-5, 4,154 triangles: on each arm a tube of 15 rings of 16 vertices, joined to the trunk and the paw with Bridge Edge Loops, with Beautify Faces on the bridge triangles |
| Material | One material with one base color JPEG of 4096 × 4608 pixels: the atlas of the source, and a strip of 512 pixels on top with the fur color of the source arms, baked onto the new faces. No metallic-roughness texture |
| `rabbit-weights.json` | 460,502 bytes, SHA-256 `e257527785da440da83161e07fce7e3700bebaeaa527a6dec2ad88d072d99969` |
| Weights | The automatic weights of Blender with the Weight Paint fixes of the script, on the studio bones and the arm segments and helpers (`armSegments` of the config), for `paintedWeights` of the config |

The script puts new quad faces on each arm from the shoulder line to the wrist. The faces of the
paws, the trunk, the legs, and the head are the faces of the source. The new arm surface lies on
the old one. The arms are 1.15 times longer from the shoulder line, a little longer than the arms
of the source. The copy gives them this length, because a rig with arm segments does not stretch
the arms. The run of `tools/blender/violin_arms.py -- rabbit` at e491ff3c made them. The script of
today has no entry of the rabbit (d46b8997), so the git history keeps the run.

The rig gives the faces near each shoulder joint and each elbow joint the normals of the skin with
no crease angle (`rootNormals` of the config). The seated bind raises the hanging arms, and each
hold bends the elbows. A crease angle there splits the normals, and the split shows as a slit at the
front of each arm root.

## rabbit-apose.rig.glb

| Item | Value |
|---|---|
| Size | 804,132 bytes |
| SHA-256 | `cfc3fe4485e0917e049bad6024de04d73d5bf6e2e8a76d48c7b1047d17fe6785` |
| Bind | The role-neutral bind (design 4.4): the arms of the source, straight (`studio.straightArms` of the config), with the elbow axes of the old bent bind of the violin hold (`studio.bindArms`), and the bind paws supinated so that the largest paw twist of the roles of the cast matrix is smallest (`studio.bindSupination`) |
| Shapes | The arm-down shape of each arm, the straight legs of each side, and a `raise` shape of the bent left elbow |

A run of `pnpm rig-mesh rabbit` gives the same bytes.

## Trial files

These files are the trials of 2026-11-03 to 2026-11-05: `rabbit-tpose.glb`, the source of the
T-pose body of `pnpm rig-mesh rabbit` at 77b9d9d3, and the hand rig of the Tripo mesh. The app
does not use them. The text below gives the trials as they were: "the last rig" is the T-pose rig
of 77b9d9d3, and `rabbit.json` is its config at that commit.

`tripo-p2/` holds the trial of 2026-11-07: a Tripo P2 quad mesh (`rabbit.fbx`, its base color in
`rabbit.fbm/`) rigged by the simple route (design 4.4, "Simple route") with the config
`tools/mesh-rigs/simple/rabbit-tripo.json`, and its rig (`rabbit.blend`, `rabbit.rig.glb`,
`rabbit.rig.json`). It was the app rabbit from bf942d8b until 3e06a62a, which gave the app the
A-pose rabbit again. The report is in `reports/2026-11-07-tripo-rabbit/` (git ignores it).

### rabbit-tpose.glb

The mesh has no skeleton. The arms stand out level to the sides, free of the trunk.

| Item | Value |
|---|---|
| Size | 13,759,212 bytes |
| SHA-256 | `a6dbee19e81407e6a88acb302f20a734c0021a27986ba48b999c3832caca7fea` |
| Origin | Generated with Meshy by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Khronos glTF Blender I/O v4.3.47 |
| Contents | One node `output_unwrapped` with one mesh of one primitive: 3,123 triangles and 4,709 vertices with POSITION, NORMAL, TEXCOORD_0, and indices. No skin and no animation |
| Material | One material `BakedMaterial`, double-sided, with a base color texture (8.0 MB) and a metallic-roughness texture (5.5 MB), each a PNG of 4096 × 4096 pixels |

The values below are in the units of the studio: 1 unit from the soles to the ear tips, the soles
at y = 0, +z forward, and +x the left side of the animal. The mesh is 1.902 units of the file
high, and the weld at 1e-5 gives 1,566 vertices in one part. 6 edges are open, 14 edges have more
than two faces, and 484 faces have a corner angle below 10°.

- The box is x -0.358 to 0.358, y 0 to 1, and z -0.162 to 0.158.
- The arms stand out level at y 0.47 to 0.53, free of the trunk from |x| 0.087, with the paw
  tips at |x| 0.357. The pads of each paw face down (the palm hint of the config).
- The legs part below the crotch at y 0.18. The feet reach forward to z 0.086.
- The fur is light grey, with pink inner ears, a pink nose, and pink paw pads. The black eyes
  are at y 0.646 to 0.683 and z 0.067 to 0.095. Thin whiskers leave the muzzle at y 0.57 to 0.62,
  out to |x| 0.17.
- The ears stand from y 0.76 to the top. A round tail ball sits at the back, at y 0.25 to 0.34,
  out to z -0.162.

```bash
shasum -a 256 assets/models/rabbit/rabbit-tpose.glb
```

### tripo/rabbit.fbx

A mesh of the same rabbit in the same T-pose, made with Tripo: quad faces, and arm and leg tubes
of 8 to 16 vertices around. Its arm sections and its head width are those of `rabbit-tpose.glb`
within 2 %. The FBX file keeps the quads (a GLB file of the same mesh holds only triangles). The
folder `rabbit.fbm/` holds its textures, and the FBX file links them by name.

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary |
| Contents | One mesh object `output_unwrapped`, turned 90° about X (the FBX axes have Y up), with no armature and no animation. 2,428 vertices and 2,638 faces: 2,217 quads and 421 triangles (4,855 triangles). One UV layer. One material that links the four textures |
| Parts | One connected part, with the whiskers. No vertices merge at 1e-5. 10 open edges: 3 at the root of each whisker group, 1 at each side of the nose, and 2 under the left paw. 7 edges have more than two faces |
| Box | After the turn: x ±0.3564, y ±0.1592, and z 0 to 0.998 in the units of the file. The rabbit faces -y |

| File | Size | Pixels | SHA-256 |
|---|---|---|---|
| `rabbit.fbx` | 217,104 bytes | | `6ee4f87a767c16e80576e976244b013391857b53ef33e4a59996a6f120a85c44` |
| `rabbit.fbm/rabbit_basecolor.jpg` | 889,716 bytes | 4096 × 4096 | `5c70fcccdbf4a272d9844e6f3f5ff4820f82f76062e5318cda85e99f77c3fe10` |
| `rabbit.fbm/rabbit_metallic.jpg` | 355,829 bytes | 2048 × 2048 | `cf96150d0a4f567b21d6d09568f862399939595f11ed4e7c10e0da5ef810e3df` |
| `rabbit.fbm/rabbit_normal.jpg` | 734,946 bytes | 2048 × 2048 | `e91b3d0f6c2a627e704f91778597ee0674ab9132a026b59be2db835545f812ee` |
| `rabbit.fbm/rabbit_roughness.jpg` | 191,192 bytes | 2048 × 2048 | `47e6fbac3a29e63b8d677bfc13311d399a6f4572ce7356e5693f4327f4302d94` |

### hand-rig/rabbit.rig.glb

`pnpm rig-export rabbit --blend assets/models/rabbit/hand-rig/rabbit.blend --out
assets/models/rabbit/hand-rig/rabbit.rig.glb` writes it, with the text summary `rabbit.rig.json`.
A run gives the same bytes.

| Item | Value |
|---|---|
| Size | 551,340 bytes |
| SHA-256 | `a2c1f3547193685c78e56365ccf16b591facd093f8d16f565487cdffac293e5c` |
| Form | The mesh of `rabbit.blend` in its seated bind (below). The seat top is 0.250 m high, and the chair is 0.42 m wide and 0.237 m deep, as the chair of the old rabbit |
| Faces | 5,961 triangles, of them 75 gloss (the nose) |
| Extras | `eyes`: the middle, the direction, and the size of each eye object. `body`: the facts of the body of the armature |
| Shapes | The arm-down shape of each arm and the straight legs of each side, which the export calculates |

### hand-rig/rabbit.blend

The hand rig of the rabbit (design 4.4, "Hand rig"), made in a live Blender 5.2 from
`tripo/rabbit.fbx`: the mesh, the colors, the armature, the weights, the pea eyes, the seated bind
(the Action `bind`), and the facts of the body. Each edit of the mesh was a point edit by hand, or
one translation, scale, or loop cut of a named part.

| Item | Value |
|---|---|
| Size | 330,824 bytes |
| SHA-256 | `720afe210929c401e00aaac1dbbd8a469e4315c0327adfe1b82afb479795d373` |
| Origin | Made by hand in Blender 5.2 from `tripo/rabbit.fbx` |
| License | CC BY-NC 4.0, as the FBX file |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the ear tips of the source, the soles at z = 0, the animal faces -y, and +x is its left side. The longer legs lift the body 0.0806 units, so the ear tips are at z = 1.0806. No object has a transform |
| Mesh | One object `rabbit`: the FBX mesh with edits by hand, flat faces, no custom normals, and the surface of `sa.add_surface()`. 2,981 vertices and 3,202 faces (2,759 quads and 443 triangles, 5,961 triangles), 42 faces of them gloss (the nose) |
| Eyes | The objects `eye_L` and `eye_R` of `se.place_eyes()`, children of the bone `head`, with the size 0.200104 units (0.286547 m) and the direction (±0.7526, -0.6512, 0.0974) of the last rig. Each middle lies on the flat eye area of the head on the eye axis in the bind: (0.0666, -0.0625, 0.7390) and (-0.0672, -0.0630, 0.7390) |
| Materials | The slots `fur` and `gloss`. Each reads the face attribute `color` |
| Armature | One object `rabbit_rig`: the 30 body bones with no tail tip, and the 20 arm segments and helpers (helpers 0.03 units long), with the parents of `STUDIO_PARENTS`, the rest in the T-pose, and the properties `palm` (0, -0.0201, -0.9998), `seat`, `hinges`, and the facts of the body. The Z axis of each bone points to its hint (`sa.fix_rolls(rabbit_rig)`). The Action `bind` holds the seated bind at frame 1 |
| Shape keys | None. The seated bind and the play show no fault that a `bind*` or `arm_raise_*` key must fix |
| Weights | The automatic weights of Blender and fixes by hand, at most 4 bones on each vertex, each sum 1. The upper arm, the forearm, the forearm twist bone, and `root` hold no weight |

The rig is a rejected trial, so this file keeps no steps. The steps of each edit, the
bind, the weights, and the keys are in the git history of this `README.md`, at e40c077df.

### tripo-hand/rabbit.blend

The candidate hand rig of the Tripo P2 mesh (design 4.4, "Hand rig"), made in a live Blender 5.2
through the Blender MCP tools, in a scene of its own. The arms keep the form of the source: no
cut, no split from the trunk, and no stretch. The legs keep the length of the source too.

| Item | Value |
|---|---|
| Size | 1,398,983 bytes |
| SHA-256 | `cf25ba1e57b511be38b22608474f52ef9614b7274ad3125d417ad5361e9c1d36` |
| Origin | Made by hand in Blender 5.2 from `tripo-p2/rabbit.fbx` |
| License | CC BY-NC 4.0, as the FBX file |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the ear tips, the soles at z = 0, the rabbit faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `rabbit`: 3,039 vertices and 3,241 faces (2,693 quads and 548 triangles, 5,934 triangles), flat faces, and the surface of `sa.add_surface()`. 29 faces are gloss (the nose). The two eyeballs of the source sit in their sockets, and their 218 faces have the face attribute `eye` ("Eyes" below). The UV map of the FBX, and the custom property `texture` (`assets/models/rabbit/tripo-hand/rabbit-color.webp`). The 34 faces of the whisker grey have the face attribute `plain` ("Color map" below) |
| Armature | `rabbit_rig`: the 30 body bones and the 20 arm segments and helpers of the simple route, at the joints of `tools/mesh-rigs/simple/rabbit-tripo.json` (shoulder x 0.065, elbow 0.16, wrist 0.245, fingers 0.275). The Action `bind` holds the seated bind of the bind rules of that config, with no bind supination, so the bind forearms have no twist. The property `palm` holds a palm for each side ("Arm twist" below) |
| Facts | `height` 0.939281 (the shoulder joints at 0.558 u, 1.6833 m for each unit, so that H stays 0.2985 m), `crease` 55 ("Smooth surface" below), `backRoom` 0.01 ("Seat" below) |
| Eyes | The eyeballs of the mesh. No eye objects, so the app adds no pea eyes ("Eyes" below) |

The edits, in the order of the work:

- **Import.** `sa.import_source()` of the FBX with a weld at 1e-5: no vertex merges. The mesh
  has 2,771 vertices, 2,425 quads, and 548 triangles, no edge with more than two faces, and 11
  parts: the body, the 2 eyeballs, the 6 whisker strips, and 2 small parts at the mouth.
- **Arm rings.** Edge ring Subdivide (1 cut, grid fill) of clean quad edge rings of 11 or 12
  edges. The first pass split the bands at x 0.097, 0.145, 0.1665, 0.194, and 0.222 of each arm.
  The second pass split the five forearm bands at x 0.1727, 0.1864, 0.2013, 0.2154, and 0.2287,
  so that the twist of the violin hold spreads over more rings. Each arm now has a ring each 0.25
  to 0.35 arm radii (radius 0.027 u) from x 0.136 to the wrist.
- **Knee rings.** Edge ring Subdivide (1 cut) of the clean leg bands at z 0.170 and 0.207 of each
  leg. The knee joint is at z 0.20.
- **Rings with no split.** These edge rings stop at a triangle or a pole, so they take no split:
  the arm root (x 0.065 to 0.09, poles at the back of the root), the front of the upper arm at x
  0.105 to 0.13 (3 triangles, poles 1786, 2057, 2059 on the left), the paw side of the wrist at x
  0.23 to 0.26 (2 triangles), and the leg bands at z 0.074, 0.095, 0.126, 0.156, 0.187, and
  0.230 (one triangle each).
- **Surface.** `sa.add_surface(rabbit, 'rabbit', 'assets/models/rabbit/tripo-p2/rabbit.fbm/rabbit_basecolor.jpg',
  eye_fans=False, config=<rabbit-tripo.json>)`, with the materials made under their own names
  (the live session held other `fur` and `gloss` materials). The faces of the old eyes take the
  fur color, and 29 faces of the nose are gloss.

The weights, in the order of the work, in the rest pose:

1. Parent with Automatic Weights, then Limit Total 4 and Normalize All (`sa.skin_mesh()`).
2. Arm rings: each vertex ring of each arm takes one exact row. A row holds a clavicle share, an
   elbow helper share, and a wrist helper share, linear between the control rings below (x of
   the left arm). The rest of the row goes to the 4 roll segments of the upper arm (x below
   0.16) or of the forearm: segment k takes the share at (k + 0.5) / 4 of the part, with a linear
   ramp between two segments (the roll split of the simple route).

   | x | 0.068 | 0.085 | 0.097 | 0.109 | 0.136 | 0.145 | 0.154 | 0.1665 | 0.179 | 0.194 | 0.209 | 0.222 | 0.235 |
   |---|---|---|---|---|---|---|---|---|---|---|---|---|---|
   | Clavicle | 0.45 | 0.30 | 0.15 | 0.05 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
   | Elbow helper | 0 | 0 | 0 | 0 | 0 | 0.25 | 0.75 | 0.75 | 0.25 | 0 | 0 | 0 | 0 |
   | Wrist helper | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.25 | 0.75 |

   The rings at x 0.068, 0.085, 0.109, and 0.136 are the vertex groups of their x range,
   because poles cut them. The trunk loop around each arm root keeps the automatic weights.
3. Paws, by rows across the paw, by the place along the rest forearm axis (as the x of the axis
   point of the left paw), so that a turn of the paw keeps its rows: 0.2435 to 0.2565 {`wrist` 0.5, `hand`
   0.5}, 0.2565 to 0.268 {`hand` 1}, the knuckle row 0.268 to 0.282 {`hand` 0.5, `fingers` 0.5},
   and from 0.282 {`fingers` 1}.
4. The 278 vertices of the loose parts (eyeballs, whiskers, mouth parts) and the 33 vertices of
   the gloss nose take {`head` 1}.

The trunk, the neck, the head, the ears, the hips, the legs, and the tail keep the automatic
weights. The scripts of the live session are not in the repo. A `bind*` or `arm_raise_*` key is
not in the file.

**Arm twist.** The violin hold turns the left paw about 220 degrees from the paw of the source,
which faces down in the T-pose. The rest of the hold needs about -80 degrees, and the lift
between the two moves the paw continuously, so the 220 degrees cannot wrap to 140. Four changes
make the turn that each arm part takes at most about 45 degrees:

- **Left paw turned.** Each vertex beyond the wrist ring at x 0.2287 turns rigidly about the rest
  forearm axis (from the forearm head to the paw head) by 5 ring steps of 360/11 degrees
  (-163.6 degrees). The 11 quads of the band between that ring and the paw go, and new quads
  join the ring to the turned paw with the same step offset, with the colors and the UVs of the
  old quads. The faces stay quads, and the rest forearm has no twist. The bone `fingers_L` turns with the paw.
  The property `palm` holds a palm for each side: the left palm is the source palm turned by the
  same angle, so that it is the real palm of the turned paw (the pink pads face up). The right
  palm stays the source palm. The rolls and the bind follow the new palm.
- **Elbow axes.** The property `hinges` of the left arm is the axis of the config. The right one
  is turned -68 degrees about its bind upper arm, so that its upper arm and forearm take about
  9 and 23 degrees in the bows (they took -50 and 82).
- **Bind supination 0.** The app takes the smooth normals from the bind. A bind supination twists
  the bind forearm, and the crease angle 35 then gives hard edges on the diagonals of its quads.
- **Rabbit hold.** The left elbow comes in under the violin in the play and points out at rest
  (`RABBIT_HOLD` of `src/pose/bowed-rig.ts`). The two elbows move a part of the turn from the
  forearm into the upper arm in each moment.

The roll of each upper arm skin (from the clavicle) and the twist of each forearm skin (from the
upper arm), in degrees, in the moments of the violinist:

| Moment | Left upper arm | Left forearm | Right upper arm | Right forearm |
|---|---|---|---|---|
| frog | -28.4 | -26.2 | 9.4 | 22.9 |
| tip | -28.5 | -26.3 | 8.3 | -1.7 |
| crossing | -24.1 | -27.0 | 4.9 | 27.3 |
| rest | 41.0 | 38.6 | 38.6 | 26.0 |
| lift50 | 31.9 | 6.6 | 34.2 | 40.9 |
| lower50 | 27.8 | -2.3 | 28.2 | 39.4 |
| stand | -28.7 | -28.6 | 9.9 | 24.8 |

In 18 samples of `mendelssohn-op61.mid` from 0 s to 60 s, each value stays within 28 degrees on
the left and 43 degrees on the right.

**Smooth surface.** Three changes make the candidate as smooth as the A-pose rabbit or smoother
(`reports/2026-11-08-tripo-rabbit-hand/smooth/`, which git ignores):

- **One color for each region.** The face colors of `add_surface()` took the shade that the
  Tripo texture bakes, so the fur showed 9 to 11 tones on each part. Each face now takes the
  color of its region: the cream fur (sRGB 232, 204, 171), the pink inner ears (223, 177, 144,
  faces above z 0.74), the pink pads of the paws and the feet (226, 183, 150), the gloss nose
  (239, 163, 132), and the grey whiskers (174, 167, 163). A face is pink when the hue of its
  old color is below 26.5°. Each region takes the color of its face at 0.6 of its luma range.
- **Crease 55.** The limb rings have 11 vertices, 33° apart. With the crease 35, 62 % to 82 % of
  the faces of the arms, the legs, and the paws had a corner that left out a neighbor face
  (`studioNormals()`), and shaded as a facet. With 55, 6 % to 18 %.
- **Relax.** Ten Taubin rounds (0.5, then -0.53) on the body move each vertex at most 0.0095
  units (mean 0.0017). The eyeballs, the whiskers, the mouth parts, the open edges of the eye
  sockets, and the gloss nose stay. The mean fold between neighbor faces goes from 14.5° to
  12.4° on the trunk and from 21.3° to 16.8° on the paws. The bones and the weights stay.

**Seat.** A seated violinist sits with most of each thigh on the seat, and the front edge of the
seat a little behind the knee. Two changes give this seat:

- **Legs of the bind.** The keys of the Action `bind` turn each thigh to a slope of 15 degrees
  below the horizontal (29 degrees before) and each shin to 78 degrees (81 degrees before). Each
  foot keeps its turn in the world, so the sole stays flat. The bones keep their lengths, and the
  mesh keeps its form.
- **Seat of the rig.** The property `seat` reaches from z -0.08 to z 0.09 (studio axes, +z
  forward). At z 0.09 the calf starts to go below the thigh, so a seat further forward rests on
  the calves. `backRoom` is 0.01.

| Measure | Before | After | Main rabbit |
|---|---|---|---|
| Chair depth | 0.179 m | 0.337 m | 0.265 m |
| Seat top | 0.350 m | 0.249 m | 0.262 m |
| Thigh (hip joint to knee joint) over the seat | 0 % | 64 % | |
| Front edge of the seat behind the knee joint | 0.25 m | 0.08 m | |
| Back of the pelvis to the chair back | 0.05 m | 0.02 m | |

**Eyes.** Each eye of the Tripo mesh is a loose ball of 0.265 H in a round socket hole of
0.178 H by 0.173 H. The color map paints a full eye on each ball: a black pupil, an amber iris, a
white light, and a light rim. The candidate keeps these eyes and has no pea eyes (design 4.4,
"Hand rig"). An earlier edit (88afd18bf) deleted the balls, filled each socket with fur, and put
a pea eye of 1.2 H on it. These point edits in the live Blender undo it:

1. Delete the 6 Grid Fill vertices of each eye, with their 12 quads.
2. Move the 78 groove vertices back to their places of the `.blend` of 88afd18bf^. Each vertex
   finds its old vertex by its place across the eye axis, and the match agrees with the vertex
   order of that file for each vertex.
3. Add the two eyeballs of that file again (99 vertices and 109 faces each), with their UVs and
   custom normals, on the slot `fur`.
4. Give the 49 socket faces with fur UVs of the texture round ("Color map" below) their source
   UVs again, so that the dark lining of the map shows around each eye.
5. Give each eyeball vertex the row `head` 1 with `sa.set_weight_row()`. A blink of an eye bone
   squeezed the ball to a thin disc and opened the socket into the head, so the eyes do not
   blink.
6. Give the eyeball faces the color `#15110e` (the eye color of the app) for the frames before
   the map loads, and the face attribute `eye`.
7. Delete the eye objects `eye_L` and `eye_R`.

The mesh is then the mesh of 88afd18bf^ again in each vertex, face, UV, custom normal, and
weight, except the face colors of the eyeballs. The export writes the middle of each eyeball as
`ownEyes`. The rim vertices of each socket keep shares of `neck` (at most 0.071) and
`ear_<side>` (at most 0.06), as in the source rig.

**Color map.** The app shows the color map of the Tripo FBX on the candidate, in place of the face
colors (design 4.5). The mesh keeps the UV map of the FBX. The edge ring cuts of the arms and the
knees interpolate it, and the seams of their faces show the same color steps as the FBX. The eye
fill of that time left two faults, which these point edits in the live Blender fixed. The restore
of the eyeballs ("Eyes" above) removed the fill and gave the faces of steps 2 and 3 their source
UVs again:

1. The 12 Grid Fill quads of each eye had mixed UVs of the socket rim: 8 were flipped, and 4 were
   3 to 6 times squeezed.
2. The socket groove faces sampled the dark lining that the map paints in each socket (luma 53 to
   150, against about 210 for the fur), a brown ring around each pea eye.
3. Each fur face nearer than 0.0215 units to the middle of the fill of its eye (36 faces on each
   side), and face 2101 under the left eye, take the planar projection of their corners on the
   plane of the eye, at the texel density of the faces around them, into one clean fur area of
   the head at UV (0.9053, 0.2549). No other UV changes.
4. The faces of the whisker grey get the face attribute `plain`, so that the whiskers keep their
   color. The gloss nose keeps its color too.

| Item | Value |
|---|---|
| Source | `tripo_rgb_c4acb3c5-787a-40aa-b5ec-b0a42565a62d.jpg` in the `.fbm` folder of the Tripo export `tripo_convert_ba507965-bf17-4167-84e0-276667bc52f2` (FBX identical to `tripo-p2/rabbit.fbx`): 4096 × 4096, 2,738,253 bytes, SHA-256 `2ff05842ef4b57bae3a98a2f63c4675766f0e5ebdd057a696c4b090fa55c9447` |
| `rabbit-color.webp` | Lanczos scale to 2048 × 2048, WebP quality 60 (Pillow, method 6): 121,414 bytes, SHA-256 `94e60d2ac1cb2b3d28f4316fdba0113f1aabe1d1f151247006471e86f815ccb1` |
| Origin | Made with Tripo by the project author on a paid plan. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |

A copy of 1024 pixels blurs the fur strands in a close head view at a device pixel ratio of 2,
and 2048 shows them. The qualities 60 and 75 look the same there. The map holds no baked key
light: the luma of the cream fur faces is 193 to 220 (5th to 95th percentile, median 206, the
face color 206.5), with the same mean on the head, the trunk, the arms, and the legs. The darkest
faces are a painted mouth line and a little occlusion at the crotch and the ear roots.

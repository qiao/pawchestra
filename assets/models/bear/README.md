# Bear model

This folder holds the Tripo P2 source mesh of the bear (`tripo-p2/`) and its hand rig
(`tripo-hand/`). The app does not serve these files. It loads the module
`src/models/studio/bear.ts`, which this chain writes:

```text
tripo-p2/bear.fbx             source mesh with quad faces
   │  pnpm hand-chain bear    chain tools/blender/hand/bear/
   v
tripo-hand/bear.blend         hand rig (design 4.4, "Hand rig")
   │  pnpm rig-export bear    the same run
   v
tripo-hand/bear.rig.glb       rigged mesh, with its summary bear.rig.json
   │  pnpm studio-body bear   the same run
   v
src/models/studio/bear.ts     studio body of the app
```

`tools/blender/hand/README.md` gives the steps of the chain. The section "Tripo hand rig" below
gives the files, their sources, their licenses, and their checksums.

The older Tripo bear, made by hand in a live Blender, is at commit `d5d8ab2c3`, with the sections
of this file about it. The files of the route of `pnpm rig-mesh` are at commit `cbc8db5e4`.

## Tripo hand rig

`tripo-hand/` holds the body of the app: a hand rig of the Tripo P2 mesh `tripo-p2/bear.fbx`,
made by one build script in a headless Blender 5.2, by the route of the Tripo badger
(`../badger/README.md`). The source FBX is the target of the look: the body keeps the form, the
eye paint, the eyes, the claws, the round belly, and the tail bump of the source, with a crease
angle of 180°. The edits are a scale to the eye height of the older bear, smaller front paws, a
paw turn, a small move of the upper lids, and a lower lightness of the color map. The arms and
the legs keep the length of the source, with no cut and no split from the trunk. The `ANIMALS`
entry of the bear in `tools/studio-body.ts` points to `tripo-hand/bear.rig.glb`.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/bear.fbx`, `tripo-p2/bear.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/bear.blend` | Made from `tripo-p2/bear.fbx` by the scripted edits below. License as the FBX file | `pnpm hand-chain bear` |
| `tripo-hand/bear.rig.glb` | Export of `tripo-hand/bear.blend`. License as the FBX file | `pnpm rig-export bear --blend assets/models/bear/tripo-hand/bear.blend --out assets/models/bear/tripo-hand/bear.rig.glb` |
| `tripo-hand/bear.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/bear-color.webp`, `tripo-hand/bear-normal.webp` | Web copies of the color map and the normal map of the FBX, with fur strands ("Maps" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/bear-maps.py`, after the chain (the tool reads the eyes of the rig file) |

### tripo-p2/bear.fbx

A round, furry brown bear in a T-pose with quad faces, made with Tripo P2 from the turnaround
sheet of the bear. It stands upright on short legs, with a round belly, round ears, a light tan
muzzle, a dark brown nose, dark claws on the paws and the feet, and a small tail bump.

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan, and given on 2026-11-13. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary. The maps lie beside the FBX file in the zip file |
| Contents | One mesh object, with no armature and no animation. 3,113 vertices and 3,397 faces: 2,729 quads and 668 triangles (6,126 triangles), no n-gon. One UV layer |
| Parts | 3 parts: the body with the head, the claws, and the tail (3,031 vertices), and the two eyeballs (41 vertices each). Each eyeball is a cap of a sphere of radius 0.0413 units, open at the back. 116 open edges in 13 loops: the rims of the 2 eyeballs (17 edges), the 2 eye sockets (18 edges), a slit at the left corner of the mouth (10 edges), a slit across the tail (7 edges), and 7 holes of 4 edges (on the paws, beside the mouth, and on the left upper arm). No edge has more than two faces |
| Box | In the studio units (1 unit from the soles to the top of the ears): x ±0.477 (the claw tips of the paws), z -0.2255 (the tail) to 0.2259 (the nose). The bear faces -y in Blender, with its left side at +x, so the import needs no turn |

The folder `bear.fbm/` keeps two maps of the zip file under new names, as bytes. The roughness and
the metallic maps are not kept.

| File | Name in the zip file | Size | Pixels | SHA-256 |
|---|---|---|---|---|
| `bear.fbx` | `tripo_convert_a5dac401-27b1-4d25-870f-82d6f3a31524.fbx` | 211,148 bytes | | `b9cd9a0a50f38faf1f53fbd8b51437296e70f6858de74f0a3b5c70c3ae077da6` |
| `bear.fbm/bear_basecolor.jpg` | `tripo_rgb_b023e225-56ba-4cda-ad47-4d0d3174b833.jpg` | 3,676,950 bytes | 4096 × 4096 | `59d4a219ff02ad972f7b3b0dff545a1d6b619f99400204edcb387f2e6a19391c` |
| `bear.fbm/bear_normal.jpg` | `tripo_normal_17744727-2bb2-4bc9-963a-dfa0b4559192.jpg` | 1,706,614 bytes | 4096 × 4096 | `a57fcfa9f6bf0dde2ec1ade13e07722b69cc21ff5e6099ffabde499d5a7eb9d2` |

The color map paints orange brown fur (median sRGB 159, 86, 32 on the back), a lighter belly, a
tan muzzle (206, 139, 82), a dark brown nose (80, 54, 36), dark claws, and on each eyeball a white
ball with a brown iris and a black pupil. The chain reads the base color by its path in this folder
(`sourceTexture` of the params), so the FBX needs no new paths.

### tripo-hand/bear.blend

The hand rig (design 4.4, "Hand rig"). The chain of the body is in `tools/blender/hand/bear/`
(`build.py`, `make_config.py`, `params.json`, `base-config.json`, `redits.py`, `rimport.py`,
`rings.py`, `tail.py`), and `pnpm hand-chain bear` runs it. Its scripts are those of the Tripo
badger with the changes below. `make_config.py` writes `tools/mesh-rigs/simple/bear-tripo.json`:
the joints of the source, mapped by the point edits.

| Item | Value |
|---|---|
| Size | 372,325 bytes (each run writes other bytes) |
| SHA-256 | `a1b3ae46bbe840f3105de08ff8eb8aa1c59ba719feeede92a8d9f7b033744d9a` |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the top of the ears, the soles at z = 0, the bear faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `bear`: 3,477 vertices and 3,716 faces (3,048 quads and 668 triangles, 6,764 triangles), flat faces, and the surface of `sa.add_surface()`. No face is gloss: the nose takes the slot `fur` and the color map. The 92 faces of the two eyeballs have the face attribute `eye`, and the 312 faces of the two lids the face attribute `lid`. The UV map of the FBX, and the property `texture` (`assets/models/bear/tripo-hand/bear-color.webp`) |
| Armature | `bear_rig`: the 30 body bones and the 20 arm segments and helpers, at the joints of the config. The Action `bind` holds the standing bind of the older bear: no leg turn, no trunk recline, straight arms, and no bind supination. The properties `palm`, `hinges`, `seat`, and `lids` come from the steps below |
| Facts | `height` 1.121989 (the shoulder joints at y 0.669, 1.677114 m for each unit), `crease` 180, and the cue facts `cueHeadLeft` 35, `cueHeadRight` 30, and `cueLift` 12 of the older bear (design 5.4, `rigFacts` of the params) |
| Eyes | The eyeballs of the source, with the finish `eye` and the eye light, and a blink lid on each. No eye objects, so the app adds no bead eyes |

**Scale.** The eyes of the standing bear (the middles of the eyeballs) stand 1.481005 m high, as
on the older bear (1.481006 m), so that the seats and the camera framing do not move (design 4.2).
H goes from 0.357761 m to 0.346565 m, the crown from 1.659 m to 1.677 m. The baton, the
conductor stand, and the podium keep their sizes in meters. The feet stand on the podium (1.05 m
wide), at most 0.35 m from its middle.

The edits, in the order of the build (`sa` is `tools/blender/studio_armature.py`, x is the x of the
left side):

- **Import.** `sa.import_source('assets/models/bear/tripo-p2/bear.fbx', 1e-5)`. No vertex merges,
  and each face is flat.
- **Holes.** `fill_holes()` of the polar bear chain closes each open loop of 4 edges or fewer with
  one quad (`holes` of the params): 7 holes. Each new corner takes the UV of a face of its vertex.
- **No rings.** Only a few arm loops of the source are closed (14 vertices at x 0.201, 0.244,
  0.336, and 0.368), the elbow region has poles, and the legs have no closed loop. No band is
  split.
- **Folds.** `fold_relax()` with the rule of the beaver: 3 fold triangles become 0 in 2 rounds. 9
  vertices move, at most 0.0094 units.
- **Paw turn.** Each paw past the closed loop at x 0.336 turns rigidly about the rest forearm axis
  by whole steps of the loop of 14 edges (25.7°): -77.1° on the left (3 steps) and 51.4° on the
  right (2 steps), 311 vertices on each side. The band to the loop at x 0.368 goes, new quads
  join the two loops with the step offset, and the turned loop takes the form of the loop before
  the turn, with a fade over 0.03 units (`turnFit`). The palm hint turns with the paw. Reason:
  with no turn, the paws of the conductor twisted -78° (left) and 55° (right) on their forearms in
  the play (`pnpm hold-fit conductor`), and now 0° and 4°.
- **Surface.** `sa.add_surface(bear, 'bear', <base color>, eye_fans=False,
  config=<bear-tripo.json>)`. The 51 gloss faces of the nose box go back to the slot `fur`
  (`nose_trim()`), so that the nose takes the color map with its painted nostrils.
- **Eyes.** The eyeballs are the two loose parts of 41 vertices in the eye box. Their 92 faces take
  the face attribute `eye`.
- **Armature.** The joints of the source, on sections of the mesh: the arm axis at y 0.669 to
  0.663, from z 0.01 at the shoulder to z 0.106 at the wrist (the arm points 27° forward). The
  shoulder at x 0.165 (the arm leaves the trunk at x 0.205), the elbow at x 0.265, the wrist at x
  0.355 where the paw widens, the knuckles at x 0.42, and the tip at x 0.475. The hip at (0.112,
  0.23, -0.005), the knee at (0.118, 0.13, -0.014), the ankle at (0.12, 0.06, -0.03), and the toes
  from (0.125, 0.025, 0.07) to (0.13, 0.012, 0.135): the thigh leans 6°, so that its frame in the
  frame of the hips stays exact. The tail bone from (0, 0.29, -0.17) to (0, 0.28, -0.235). The palm
  is the true palm of the source, the mean normal of the paw faces that face down (x from 0.37),
  (0.129, -0.99, -0.058), turned with the paw.
- **Paw size.** After the automatic weights, the point edit `paw` makes each front paw past the
  wrist joint 0.75 times as long, 0.8 times as wide, and 0.9 times as thick, with a ramp of 0.025
  units: 305 vertices on each side, at most 0.034 units. The tip goes from x 0.467 to x 0.439.
  Reason: the paws of the source were 0.68 H long from the wrist joint, against 0.35 to 0.50 H on
  the polar bear, the wolf, the panda, the badger, and the rabbit. They are now 0.47 H long.
- **Upper lids.** `lower_lids()` turns the skin of each upper lid down by 5° about the middle of the
  ball (`lidLower`: psi 12° to 60°, reach 1.15 to 1.6 ball radii, lam 20° to 35°): 54 vertices on
  each side, at most 0.004 units. Reason: a full ring of white around the iris read startled, and
  the sheet shows the upper lid over the top of the iris.
- **Seat.** The bear stands on the podium, so the app does not read the seat. The seat is the
  crotch between the legs (half width 0.02, front 0.03, back -0.06), inside the inner sides of the
  legs.

The weights, in the rest pose:

1. Automatic Weights, then Limit Total 4 and Normalize All, on a copy of the mesh with no loose
   part.
2. Arm rows: each vertex of a side with |x| from 0.165, within 0.085 units of the line of the rest
   arm, takes one exact row (`sa.set_weight_row()`): a clavicle share from 0.4 at x 0.165 to 0 at x
   0.22, an elbow helper share of 0.25, 0.75, 0.75, and 0.25 at x 0.245, 0.26, 0.275, and 0.29, and
   the rest on the 4 roll segments.
3. Wrist rows and knuckle rows as on the badger: the bend share of the paw grows in 12 equal steps
   of 0.004 from 0.03 units before the head of `hand_<side>`, and the fingers share in 12 equal
   steps of 0.0035 from 0.02 units before the head of `fingers_<side>`.
4. Ear rows: a plane through the ear base, from (0.05, 0.958) at the inner side to (0.137, 0.925)
   at the outer side, splits the head and each ear (`earPlane`): 166 ear vertices, 22 base
   vertices.
5. Throat rows (`throat_rows()`): each vertex at y 0.77 to 0.86 and z above 0 with a head and neck
   share of at least 0.6 gives its clavicle and ear shares to the head and the neck, in the ratio of
   its head and neck shares: 250 vertices, at most 0.32 moves. Reason: the skin under the muzzle
   stayed behind in a large head turn, and its thin faces folded. The box starts at y 0.77, so that
   the chin and H stay.
6. The eyeballs and the lids take {`head` 1}. The tail bump keeps the automatic weights.

**Lids.** A lid on each eye, as on the badger (`lids` of the params). Each eyeball is a cap: a ray
from outside the head reaches its points within 16° of its axis. Each closed lid spans psi from
-36° to 34° and lam from -24° to 36° in 12 steps each, at 1.07 times the ball radius, with a lower
strip at 1.03 times the radius. The open lid lies 110° up. 2 points of each open lid move onto the
plane x = ±0.003 (`lidClear`), so that each lid stays on its own side of the middle plane. In 21
steps of the blink, no point of the side edges or of the back edge leaves the head.

### Maps

`tools/bear-maps.py` writes both maps, as `tools/badger-maps.py` does: the color map of the source
at 2048 pixels, with the soft fur strands of `strands()` (tilt 0.03, luma 0.08, half length 11
texels: a luma step along the strands), and the normal map of the source with the limit 0.2, at 1024
pixels, with the slope of the same strands. The source normal map is smooth: its median tilt at 1024
pixels is 0.020, against 0.026 on the cat and 0.024 on the wolf.

Each texel of the color map, except the eyeballs, takes 0.87 times its Oklab lightness
(`LIGHTNESS`). The chroma and the hue stay. In the hall view with no fill light (`close-views play
--demo mozart-k525 --time 12`, the camera `back` behind the conductor, the box x 0.40 to 0.56 and
y 0.42 to 0.62 of the frame), the median Oklab L, C, and h of the back fur:

| Fur | L | C | h |
|---|---|---|---|
| The source fur in the map (sRGB 159, 86, 32) | 0.531 | 0.117 | 53 |
| The colors of the source in the hall | 0.637 | 0.122 | 47 |
| `bear-color.webp` (`LIGHTNESS` 0.87) in the hall | 0.561 | 0.120 | 45 |
| The older bear in the hall | 0.470 | 0.090 | 50 |

| File | Size | SHA-256 |
|---|---|---|
| `bear-color.webp` | 165,330 bytes, 2048 × 2048, WebP quality 60 | `2264dca584d6b958d1cd3f90acb5a7c313f6a473f676c8de8dce96d11d896c4b` |
| `bear-normal.webp` | 150,232 bytes, 1024 × 1024 | `0648815290a80c2deb5ad847df8d2541c11a0dd3e3c7a09f428317d44e7740c7` |

### Export

License of both files: CC BY-NC 4.0, as the FBX file. Two runs of the chain give the same bytes.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/bear.rig.glb` | 1,093,528 bytes | `ba06d1dfee96b08a54702de0fadbe9fa42fc58ae52e54259e8c1766305ac4a6b` |
| `tripo-hand/bear.rig.json` | 15,939 bytes | `02541d39618ae6519994bc91f1b6dd9373666c5e862fb0319cc092d652e46001` |

### Conductor

`CONDUCTOR_HOLD` of `src/pose/conductor.ts` keeps its values, except the extra swing of the rest
arms (`restArm.extraOut`, design 5.4). The measures of `pnpm hold-fit conductor` and `pnpm
pose-depth conductor` (all 19 demos), the older bear against this body:

| Measure | Older bear | This body |
|---|---|---|
| Paws in the body or the head, play | 0.1 cm | 0.0 cm |
| Upper arms in the body, play | 0.0 cm | 2.4 cm (the left arm root, limit 1.5 cm) |
| Forearms in the body, lift, lowering, and rest | 1.9 cm | 0.0 cm |
| Upper arms in the body, lift and lowering | 3.8 cm | 4.0 cm (limit 4 cm) |
| Upper arms in the body, rest | 3.2 cm | 3.7 cm (limit 4 cm) |
| Samples of the play with a folded face | 56.2 % | 100 % (the knuckle crease of the baton paw) |
| Faces that fold at rest | 7 | 7 |
| Paw twist on the forearm in the play, L / R | 20° / -3° | 0° / 4° |
| Body in the baton (`pnpm body-clip conductor`) | PASS, no point | PASS, no point |

In the play, three thin faces of the knuckle crease of the right paw (104, 105, 1769) fold in 99 %
of the samples at the curl of the fingers around the baton, and one wrist face (1833) in 77 %
(`pnpm fold-probe conductor --faces 6`). The fist hides them in the hall view.

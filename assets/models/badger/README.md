# Badger model

This folder holds the Tripo P2 source mesh of the badger (`tripo-p2/`) and its hand rig
(`tripo-hand/`). The app does not serve these files. It loads the module
`src/models/studio/badger.ts`, which this chain writes:

```text
tripo-p2/badger.fbx             source mesh with quad faces
   │  pnpm hand-chain badger    chain tools/blender/hand/badger/
   v
tripo-hand/badger.blend         hand rig (design 4.4, "Hand rig")
   │  pnpm rig-export badger    the same run
   v
tripo-hand/badger.rig.glb       rigged mesh, with its summary badger.rig.json
   │  pnpm studio-body badger   the same run
   v
src/models/studio/badger.ts     studio body of the app
```

`tools/blender/hand/README.md` gives the steps of the chain. The section "Tripo hand rig" below
gives the files, their sources, their licenses, and their checksums.

The files of the older body of the route of `pnpm rig-mesh` are removed. Commit `aa8af0dd8` has
these files and the sections of this file about them.

## Tripo hand rig

`tripo-hand/` holds the body of the app: a hand rig of the Tripo P2 mesh `tripo-p2/badger.fbx`,
made by one build script in a headless Blender 5.2, by the route of the Tripo beaver
(`../beaver/README.md`). The source FBX is the target of the look: the body keeps the form, the
colors, the eye paint, and the eyes of the source, with a crease angle of 180° and only a scale to
the crown of the old badger. The upper arms and the forearms are 1.2 times longer than in the
source ("Arms"), with no cut and no split from the trunk. The
`ANIMALS` entry of the badger in `tools/studio-body.ts` points to `tripo-hand/badger.rig.glb`.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/badger.fbx`, `tripo-p2/badger.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/badger.blend` | Made from `tripo-p2/badger.fbx` by the scripted edits below. License as the FBX file | `pnpm hand-chain badger` |
| `tripo-hand/badger.rig.glb` | Export of `tripo-hand/badger.blend`. License as the FBX file | `pnpm rig-export badger --blend assets/models/badger/tripo-hand/badger.blend --out assets/models/badger/tripo-hand/badger.rig.glb` |
| `tripo-hand/badger.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/badger-color.webp`, `tripo-hand/badger-normal.webp` | Web copies of the color map and the normal map of the FBX, with fur strands ("Maps" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/badger-maps.py`, after the chain (the tool reads the eyes of the rig file) |

### tripo-p2/badger.fbx

A round, furry badger in a T-pose with quad faces, made with Tripo P2 from the turnaround sheet of
the badger. It stands upright on short legs, and its short tail goes down and back from the
haunch.

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan, and given on 2026-11-13. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary. The maps lie beside the FBX file in the zip file |
| Contents | One mesh object, with no armature and no animation. 3,281 vertices and 3,700 faces: 2,827 quads and 873 triangles, no n-gon. One UV layer |
| Parts | 2 parts: the body with the head, the left eyeball, and the tail (3,216 vertices), and the right eyeball (65 vertices). 33 open edges in 3 loops: the socket of the right eye (16 edges), the rim of the right eyeball (13 edges), and a hole of 4 edges at the root of the left ear. No edge has more than two faces |
| Box | In the studio units (1 unit from the soles to the top of the ears): x ±0.470 (the paw tips), z -0.322 (the tail tip) to 0.322 (the nose). The badger faces -y in Blender, with its left side at +x, so the import needs no turn |

The folder `badger.fbm/` keeps two maps of the zip file under new names, as bytes. The roughness
and the metallic maps are not kept.

| File | Name in the zip file | Size | Pixels | SHA-256 |
|---|---|---|---|---|
| `badger.fbx` | `tripo_convert_404fb08d-932b-4b1d-8909-e8fa389ae4a6.fbx` | 221,708 bytes | | `b3454e609756343f0408b92409a624eaf2f773ec237d47f1837b0dc0387d20e2` |
| `badger.fbm/badger_basecolor.jpg` | `tripo_rgb_2e5ad10b-94db-45ed-8dc8-2c24752834e1.jpg` | 2,567,595 bytes | 4096 × 4096 | `6bc2976aa8088eef2fc2759167f9cc12518ef4f109231d1e9271def0a75b7885` |
| `badger.fbm/badger_normal.jpg` | `tripo_normal_fe0cf185-3be2-4e0e-9f11-2251c14bf8d0.jpg` | 1,221,949 bytes | 4096 × 4096 | `ae123af43fae61eabe2659282deaaedec4e6828c9efddec4b51639388f1e9bb6` |

The color map paints dark brown fur on the body, the arms, and the legs, a cream face with a dark
brown stripe over each eye, a cream throat and chest, round ears with cream rims, a cream tail, a
dark brown nose, and on each eyeball a dark iris with an orange rim, a black pupil, and a white
light. The FBX names the maps by their paths in the zip file. The chain reads the base color by
its path in this folder (`sourceTexture` of the params), so the FBX needs no new paths.

### tripo-hand/badger.blend

The hand rig (design 4.4, "Hand rig"). The chain of the body is in `tools/blender/hand/badger/`
(`build.py`, `make_config.py`, `params.json`, `base-config.json`, `redits.py`, `rimport.py`,
`rings.py`, `tail.py`), and `pnpm hand-chain badger` runs it (`tools/blender/hand/README.md`). Its
scripts are those of the Tripo beaver with the changes below. `make_config.py` writes
`tools/mesh-rigs/simple/badger-tripo.json`: the joints of the source.

| Item | Value |
|---|---|
| Size | 382,386 bytes (each run writes other bytes) |
| SHA-256 | `431fe7ee05cbdba3fa2afa10d694a57ef8beb80b035452dd51c2931f787d450f` |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the top of the ears, the soles at z = 0, the badger faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `badger`: 3,645 vertices and 4,012 faces (3,139 quads and 873 triangles, 7,151 triangles), flat faces, and the surface of `sa.add_surface()`. No face is gloss: the nose takes the slot `fur` and the color map. The 114 faces of the two eyeballs have the face attribute `eye`, and the 312 faces of the two lids the face attribute `lid`. The UV map of the FBX, and the property `texture` (`assets/models/badger/tripo-hand/badger-color.webp`) |
| Armature | `badger_rig`: the 30 body bones, `tail_tip`, and the 20 arm segments and helpers, at the joints of the config. The Action `bind` holds the bind with no bind supination. The properties `palm`, `hinges`, `seat`, and `lids` come from the steps below |
| Facts | `height` 0.636469 (the shoulder joints at 1.038285 m for each unit, so that the crown stands 1.038 m high, as on the badger of `aa8af0dd8`, and H is 0.27948 m), `crease` 180, and `seatWidth` 0.07 ("Stance and seat") |
| Eyes | The eyeballs of the source, with the finish `varnish` and no eye light (`eyeFinish` of the entry), and a blink lid on each. No eye objects, so the app adds no bead eyes |

The edits, in the order of the build (`sa` is `tools/blender/studio_armature.py`, x is the x of the
left side):

- **Import.** `sa.import_source('assets/models/badger/tripo-p2/badger.fbx', 1e-5)`. No vertex
  merges, and each face is flat.
- **No arm rings and no knee rings.** The arm of the source has a closed loop only at the wrist (x
  0.356, 17 vertices). The other arm loops and the leg bands stop at poles, so no band is a clean
  quad ring, and no ring is split.
- **Folds.** `fold_relax()` with the rule of the beaver (`foldRelax` of the params): 27 fold
  triangles become 0 in 4 rounds. 31 vertices move, by 0.0014 units in the mean and 0.0027 units
  (2.4 mm) at most.
- **Arm stretch.** The point edit `armStretch` ("Arms"). No paw turn and no other point edit:
  the head, the eyes, the trunk, the paws, the legs, and the tail keep the form of the source.
- **Surface.** `sa.add_surface(badger, 'badger', <base color>, eye_fans=False,
  config=<badger-tripo.json>)`. The 231 gloss faces of the nose box go back to the slot `fur`
  (`nose_trim()`), so that the nose takes the color map.
- **Eyes.** The right eyeball is the loose part of 65 vertices in the eye box. The left eyeball
  joins the rim of its socket, so it is a part of the head (`fused_ball()`, `fusedBall` of the
  params): the sphere of the right ball, mirrored, is the first guess, and 4 rounds fit a sphere to
  the head vertices within 0.004 units of the last sphere. The left ball is a sphere of radius
  0.0186 units about (0.0687, 0.8588, 0.1516). Its faces are the 50 faces that a flood from its
  pole (16 edges) reaches through faces with each corner within 1.06 radii of the middle. The 114
  ball faces take the face attribute `eye`.
- **Armature.** The joints of the source (the arm stretch moves the elbow to x 0.281, the wrist to
  x 0.392, and the knuckles to x 0.447): the shoulder at x 0.17, the elbow at x 0.263, the wrist
  at x 0.356, the knuckles at x 0.41, and the tip at x 0.467, on the arm axis at y 0.613. The hip at
  (0.10, 0.25, 0.0), the knee at (0.11, 0.13, -0.025), the ankle at (0.115, 0.05, -0.03), and the
  toes from (0.125, 0.02, 0.09) to (0.13, 0.01, 0.175). The tail bone from (0, 0.28, -0.20),
  `tail_tip` from (0, 0.20, -0.265) to (0, 0.13, -0.322). The palm is the true palm of the source,
  the mean normal of the paw faces that face down (x from 0.38), (0.139, -0.99, -0.005). The elbow
  axes keep the axes of the bind (no `hingeTurn`).

The weights, in the rest pose:

1. Automatic Weights, then Limit Total 4 and Normalize All, on a copy of the mesh with no loose
   part.
2. Arm rows: each vertex of a side with |x| from 0.17, within 0.08 units of the line of the rest
   arm, takes one exact row (`sa.set_weight_row()`): a clavicle share from 0.4 at x 0.17 to 0 at x
   0.21, an elbow helper share of 0.25, 0.75, 0.75, and 0.25 at x 0.241, 0.256, 0.271, and 0.286,
   and the rest on the 4 roll segments.
3. Wrist rows and knuckle rows as on the beaver: the bend share of the paw grows in 12 equal steps
   of 0.004 from 0.03 units before the head of `hand_<side>`, and the fingers share in 12 equal
   steps of 0.0035 from 0.02 units before the head of `fingers_<side>`.
4. Ear rows: a plane through the ear base splits the head and each ear (`earPlane` of the
   params): 257 ear vertices, 25 base vertices.
5. The eyeballs take {`head` 1}. The tail (each vertex with rest z below -0.2 and y below 0.3, 113
   vertices) takes {`hips` 1 - a, `tail` a (1 - c), `tail_tip` a c}, with a = smoothstep(0, 0.04)
   along `tail` and c = smoothstep(-0.03, 0.03) along `tail_tip`. Each other vertex gives its tail
   weights to the hips.

**Stance and seat.** The badger stands at each percussion instrument (`stand` of design 4.5). Its
bind keeps the legs, the trunk, and the tail of the source: the leg turns are none
(`studio.legTurns`), the trunk takes no recline (`studio.trunk.open` 0), and the tail bones keep the
directions of the source (`studio.tailBind`). The property `seat` is {`prop` `chair`, `front`
0.05, `back` -0.1, `halfWidth` 0.04}, inside the inner sides of the legs, and the fact `seatWidth`
0.07 m gives the app seat the same width. So the seat height is the height of the crotch between
the legs, 0.124 m. The old badger had the seat of its seated bind (0.059 m). The app reads neither,
because a percussion player stands.

**Lids.** A lid on each eye: 13 × 13 points from psi -60 to 60 degrees and lam from -75 to 80
degrees on the left (the mirror on the right), with the lower strip as the first row, at 1.15 ball
radii (1.12 for the strip). 156 quads on each side, held turned up 125 degrees into the head. The
property `lids` holds the angle 2.181662 and the hinge axes. The lid faces take the dark brown fur
patch of the eye stripe at UV (0.8584, 0.6131) at 0.68 UV for each unit, and the row `head` 1. The
ray casts of the checks reach 1.0 units (`rayReach`), because the head is long: a ray of 0.3 units
from the back of an eye did not reach the back of the head. In the 21 steps of the blink, no point
of the left lid leaves the head. On the right lid, one point of the open lid behind the ball and 1
edge point in 3 early steps of the blink lie just out of the head. With the lam range of the
beaver (-60 to 65 degrees), up to 8 side edge points of the closing lids lay out of the head.

**Eyes and face.** The eyes keep the size, the paint, and the iris place of the source. The map
paints a light on each ball, so the eyes take the finish `varnish` and no eye light, with one
light in each eye. The mouth of the source reads as a slight smile, so it takes no smile edit.

**Arms.** The point edit `armStretch` of `redits.py` (in `params.json`: `{"kind": "armStretch",
"k": 1.2, "ramp": 0.01, "reach": [0.11, 0.13]}`), the edit of the panda and the deer
(`../panda/README.md`, "Arm stretch"). Each vertex of a side with |x| over the shoulder joint moves
along the line of the rest arm from the shoulder joint to the wrist joint (0.187 units), so that
the upper arm and the forearm grow by 1.2, and the paw moves out by 0.037 units as one piece. The
move fades from 1 at 0.11 units from the line to 0 at 0.13 units: the arm and the claws lie within
0.11 units of the line, and the trunk 0.118 units or more from it. The control rows of the arm
weights take the x of the source (`arm_source_x()`). Reason: the arms of the source are short. At
the crown of the old badger, the reach from the shoulder joint to the middle of the palm was
0.224 m, and it is now 0.262 m, against 0.273 m on the old badger (`pnpm hold-reach badger`).

**Size.** `metersPerUnit` 1.038285 in `params.json`: 1.147 times the scale that gave the H of the
old badger, so that the standing crown matches the crown of the old badger (1.038 m). At the H of
the old badger, the crown stood 0.905 m high, because the head of the source is larger for its
body.

**Maps** (`tools/badger-maps.py`). The tool scales the color map of the source to 2048 pixels
(Lanczos), adds the fur strands of `tools/fox-maps.py` (`strands()`, the same values), and writes
WebP quality 60, method 6 (Pillow 13.0.0). The eyeball texels and 4 texels around them keep their
colors. The normal map of the source is smooth (median tilt 0.012 at 1024 pixels, against 0.023
to 0.028 on the cat, the wolf, and the rabbit), so the strands also go into `badger-normal.webp`:
each x, y tilt of the source limited to 0.2 (0.61 % of the texels), a box scale to 1024 pixels,
the slope of the strands added, the tilts times 4 in red and green, 255 in blue, and
`cwebp -q 60 -sharp_yuv -m 6` (libwebp 1.5.0).

**Differences from the source.** The app light is warm and comes from above, so the dark brown fur
reads lighter and warmer than in the even gray light of an FBX viewer. The fold relax moves the
surface by 2.4 mm at most. The crown stands 1.038 m high, as on the old badger (the Tripo beaver
1.010 m), so H is 0.279 m, 1.147 times the H of the old badger, because the head of the source is
larger for its body. The upper arms and the forearms are 1.2 times longer than in the source.

The export of the file and the maps. License of each file: CC BY-NC 4.0, as the FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/badger.rig.glb` | 1,235,312 bytes | `11b76f08f08164ef9d0fb35a19d029cfbac149cfc1d0777279d2d7bc49e77ee7` |
| `tripo-hand/badger.rig.json` | 16,699 bytes | `15c95862a5e5ad57c81c53c2632a2040f348a570a0125bccbd775e95ba53e8c3` |
| `tripo-hand/badger-color.webp` | 189,662 bytes, 2048 × 2048 | `c39783873dc1e304260f55305623864cf52b7a0479265ab0dce259d077f947b3` |
| `tripo-hand/badger-normal.webp` | 192,290 bytes, 1024 × 1024 | `adefbb19c178bfd6977b1ef6ecdbe60553d7d6c9b65ee1a4543108e8f910b581` |

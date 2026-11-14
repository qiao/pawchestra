# Rhino model

This folder holds the Tripo P2 source mesh of the rhino (`tripo-p2/`) and its hand rig
(`tripo-hand/`). The app does not serve these files. It loads the module
`src/models/studio/rhino.ts`, which this chain writes:

```text
tripo-p2/rhino.fbx             source mesh with quad faces
   │  pnpm hand-chain rhino    chain tools/blender/hand/rhino/
   v
tripo-hand/rhino.blend         hand rig (design 4.4, "Hand rig")
   │  pnpm rig-export rhino    the same run
   v
tripo-hand/rhino.rig.glb       rigged mesh, with its summary rhino.rig.json
   │  pnpm studio-body rhino   the same run
   v
src/models/studio/rhino.ts     studio body of the app
```

`tools/blender/hand/README.md` gives the steps of the chain. The section "Tripo hand rig" below
gives the files, their sources, their licenses, and their checksums.

The files of the older body of the route of `pnpm rig-mesh` (a T-pose mesh made with Meshy, with
rebuilt arms) are removed. Commit `8e42c4eaa` has these files and the sections of this file about
them.

## Tripo hand rig

`tripo-hand/` holds the body of the app: a hand rig of the Tripo P2 mesh `tripo-p2/rhino.fbx`, made
by one build script in a headless Blender 5.2, by the route of the Tripo hippo
(`../hippo/README.md`). The body keeps the form, the colors, and the eyeballs of the source: no
point edit changes the head, the face, the horns, the ears, the trunk, the paws, the legs, or the
tail. The arms have no cut and no split from the trunk. The upper arms and the forearms are 1.2
times longer than in the source ("Arm stretch" below), and the paws keep their size. The `ANIMALS`
entry of the rhino points to `tripo-hand/rhino.rig.glb`.

| File | Origin | Rebuild |
|---|---|---|
| `tripo-p2/rhino.fbx`, `tripo-p2/rhino.fbm/` | Source mesh with quad faces, and its color map and normal map (below) | None |
| `tripo-hand/rhino.blend` | Made from `tripo-p2/rhino.fbx` by the scripted edits below. License as the FBX file | `pnpm hand-chain rhino` |
| `tripo-hand/rhino.rig.glb` | Export of `tripo-hand/rhino.blend`. License as the FBX file | `pnpm rig-export rhino --blend assets/models/rhino/tripo-hand/rhino.blend --out assets/models/rhino/tripo-hand/rhino.rig.glb` |
| `tripo-hand/rhino.rig.json` | Text summary of the export, for diffs | The same run |
| `tripo-hand/rhino-color.webp`, `tripo-hand/rhino-normal.webp` | Web copies of the color map and the normal map of the FBX ("Maps" below). License as the FBX file | `uv run --no-project --with numpy==2.5.4 --with pillow==13.0.0 python -I tools/rhino-maps.py` |

### tripo-p2/rhino.fbx

A round, friendly gray rhino in a T-pose with quad faces, made with Tripo P2: a pale belly and
muzzle, a large cream horn on the muzzle and a small one behind it, tall ears with a pink inside,
stump paws with pale nails, and a thin tail with a dark tuft. Its arm tubes have 19 vertices
around.

| Item | Value |
|---|---|
| Origin | Made with Tripo by the project author on a paid plan, and given on 2026-11-13. The author holds the rights |
| License | CC BY-NC 4.0 (`../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Tripo, FBX 7.4 binary. The maps lie beside the FBX file in the zip file |
| Contents | One mesh object, with no armature and no animation. 5,353 vertices and 5,703 faces: 4,963 quads and 740 triangles, no n-gon. One UV layer |
| Parts | 4 parts: the body with the horns and the ears (5,134 vertices), one eyeball on each side (a dome of 43 vertices, open at its rim, a sphere of radius 0.0208 units about (±0.062, 0.792, 0.100)), and the tail (133 vertices, from (0, 0.336, -0.234) down to its tuft at y 0.129). 28 open edges: the rims of the 2 eyeballs. No edge has more than two faces |
| Box | In the studio units (1 unit from the soles to the top of the ears): x ±0.451 (the paw tips), z -0.299 (the tail) to 0.299 (the large horn). The rhino faces -y in Blender, with its left side at +x, so the import needs no turn |

The folder `rhino.fbm/` keeps two maps of the zip file under new names, as bytes. The roughness
and the metallic maps are not kept.

| File | Name in the zip file | Size | Pixels | SHA-256 |
|---|---|---|---|---|
| `rhino.fbx` | `tripo_convert_4ebf2303-5270-46cc-980b-9dbe2adf2d6a.fbx` | 343,388 bytes | | `952da7ad963e89a810a8ccac48eb3ce949c60ac096ade40be0bb60cc9f4096ba` |
| `rhino.fbm/rhino_basecolor.jpg` | `tripo_rgb_1878b45d-b304-48f5-981e-fc77e26450f1.jpg` | 3,120,670 bytes | 4096 × 4096 | `e254a82a0bd432973e7fa62e8f83d4d92461642589f118d6f0c4d1c883cf1a80` |
| `rhino.fbm/rhino_normal.jpg` | `tripo_normal_570c8b25-45df-4ce7-88b0-653e196bb9f0.jpg` | 1,924,554 bytes | 4096 × 4096 | `1caaea3c94418c1663a2ad2ace0d3364b480faede94ea056282e0d5187706233` |

The color map paints gray skin with fine wrinkles and folds, a paler belly and muzzle, cream horns
and nails, pink inside the ears, a dark tail tuft, a thin smile line under the muzzle, and on each
eyeball a brown iris and a black pupil.

### tripo-hand/rhino.blend

The hand rig (design 4.4, "Hand rig"). The chain of the body is in `tools/blender/hand/rhino/`
(`build.py`, `make_config.py`, `params.json`, `base-config.json`, `redits.py`, `rimport.py`,
`rings.py`), and `pnpm hand-chain rhino` runs it (`tools/blender/hand/README.md`). Its scripts are
those of the Tripo hippo with the values of the rhino and the face rows below. `make_config.py`
writes `tools/mesh-rigs/simple/rhino-tripo.json`: the joints of the source, moved by the point
edits of `redits.py`.

| Item | Value |
|---|---|
| Size | 559,198 bytes. A new build gives the same export, but not the same `.blend` bytes |
| Axes | The studio units in the axes of Blender: 1 unit from the soles to the top of the ears, the soles at z = 0, the rhino faces -y, and +x is its left side. No object has a transform |
| Mesh | One object `rhino`: 5,945 vertices and 6,243 faces (5,503 quads and 740 triangles, 11,746 triangles), flat faces, and the surface of `sa.add_surface()` with no gloss face. The 84 faces of the two eyeballs have the face attribute `eye`, and the 312 faces of the two lids the face attribute `lid`. The UV map of the FBX, and the property `texture` (`assets/models/rhino/tripo-hand/rhino-color.webp`) |
| Armature | `rhino_rig`: the 30 body bones, `tail_tip`, and the 20 arm segments and helpers, at the joints of the config. The Action `bind` holds the bind with no bind supination. The properties `palm`, `hinges`, `seat`, and `lids` come from the steps below |
| Facts | `height` 0.947268 (the shoulder joints at 1.611 m for each unit, so that the eyes of the standing rhino are 1.275 m above the floor, as on the rhino of `8e42c4eaa`), `crease` 180, `noseTop` 0.775, and `mouthHeight` 0.669 ("Face rows") |
| Eyes | The eyeballs of the source, with the finish `eye` and the eye light of the app, and a blink lid on each. No eye objects, so the app adds no bead eyes |

The edits, in the order of the build (`sa` is `tools/blender/studio_armature.py`, x is the x of the
left side):

- **Import.** `sa.import_source('assets/models/rhino/tripo-p2/rhino.fbx', 1e-5)`. No vertex
  merges, and each face is flat. No part goes: the eyeballs and the tail show.
- **Arm rings.** Edge ring Subdivide (`bmesh.ops.subdivide_edges(bm, edges=<ring>, cuts=<n>,
  use_grid_fill=True)`) of the clean quad bands of 19 edges between the closed arm loops at x
  0.2387, 0.2612, 0.2819, 0.3041, 0.3255, and 0.3416: 2 cuts on the band of the elbow (x 0.2387 to
  0.2612), and 1 cut on each other band. A ring then stands about each 0.11 to 0.17 arm radii.
- **Rings with no split.** The arm root to x 0.2387 and the paw from x 0.3416 stop at triangles or
  poles. The legs have one closed loop only (y 0.133), so they take no ring.
- **Left paw turned.** Each vertex of the left side past the arm ring at x 0.3255, within 0.13
  units of the rest forearm axis (`turnRadius`), turns rigidly about that axis by -5 ring steps of
  360/19 degrees (-94.7 degrees, 350 vertices). New quads join the ring at x 0.3255 to the turned
  ring after it (x 0.3336), with the UVs of the old band, and the turned ring takes the form of the
  ring before the turn (a fade to 0 at 0.02 units). The right paw does not turn ("Arm twist").
  With the limit 0.08 units of the hippo chain, the outer part of the wide stump paw did not turn,
  and the paw tore into a slit at the claws.
- **Arm stretch.** The point edit `armStretch` of the hippo chain (`redits.py`, params `{"kind":
  "armStretch", "k": 1.2, "ramp": 0.01, "reach": [0.095, 0.115]}`). Each vertex of a side with |x|
  over the shoulder joint moves along the line of the rest arm, from the shoulder joint to the
  wrist joint (0.2215 units), so that the upper arm and the forearm grow by 1.2, and the paw moves
  out by 0.0443 units as one piece. The move fades from 1 at 0.095 units from the line to 0 at
  0.115 units, so that the belly and the chest stay. The joints move with the same map. The arm
  rows of the weights read the x of the source. Reason: the round belly stands 0.38 m in front of
  the shoulder joints, and the tuba stands in front of it. With the arms of the source, each arm
  reached 0.36 m from the shoulder joint to the wrist, and the paws missed their grips by 4 cm to
  11 cm. Each arm now reaches 0.43 m.
- **Point edits.** None other.
- **Surface.** `sa.add_surface(rhino, 'rhino', <base color>, eye_fans=False,
  config=<rhino-tripo.json>)`. The 140 nose faces go back to the fur slot, and the gloss slot goes
  (`noGloss`): the map paints the two nostrils, so the muzzle keeps the color map.
- **Eyes.** The faces of the two eyeballs (the loose parts of 30 to 99 vertices in the eye box)
  take the face attribute `eye`, and keep the color map.
- **Armature.** The joints of the config: the shoulder at x 0.14, 0.035 units inside the side of
  the trunk, the elbow at x 0.25, the wrist at x 0.355, where the paw widens, the knuckles at x
  0.405, and the tip at x 0.451 (in the source, before the arm stretch), on the axis of the closed
  arm loops (y 0.588 to 0.556, z -0.092 to -0.03). The hip at (0.115, 0.23, -0.045), the knee at
  (0.105, 0.13, -0.072), and the ankle at (0.105, 0.05, -0.075). The thigh slopes 16 degrees back:
  with a near vertical thigh, the roll of its bone was not well defined, and the export refused
  the leg frames (scale 1.8e-5, limit 1e-5). The ear bone goes from (0.085, 0.885, -0.015) to
  (0.11, 1.0, 0.008). The tail bones keep the directions of the source, from (0, 0.325, -0.25)
  down to (0, 0.135, -0.262). The palm is the true palm of the source, the mean normal of the paw
  faces that face down from x 0.36, (0.417, -0.909, -0.015). The bind arms (`bindArms`) are those
  of the rhino of `8e42c4eaa`, so that the elbow axes of the tuba hold stay. The bind keeps the
  legs of the source ("Stance").

The weights, in the rest pose:

1. Automatic Weights, then Limit Total 4 and Normalize All, on a copy of the mesh with no tail and
   no eyeball.
2. Arm rows: each vertex of a side with |x| from 0.14, within 0.10 units of the line of the rest
   arm at the root (0.086 units on the forearm and the paw), takes one exact row
   (`sa.set_weight_row()`): a clavicle share of 0.8, 0.6, 0.4, 0.2, and 0.05 at x 0.14, 0.155,
   0.17, 0.185, and 0.2, linear between them and 0 from x 0.21, an elbow helper share that grows
   from 0 at x 0.215 to 1 at the elbow joint (x 0.25) and falls to 0 at x 0.285, and the rest on
   the 4 roll segments ("Arm roots"). The vertices of the belly side in that reach, which the
   automatic weights give mostly to the trunk, keep their rows. The x of a row is the x of the
   source: the build maps the x of each vertex back through the arm stretch.
3. Wrist rows: the bend share of the paw grows in 12 equal steps of 0.004 from 0.04 units before
   the head of `hand_<side>`. Knuckle rows: the fingers share grows in 12 equal steps of 0.0035
   from 0.02 units before the head of `fingers_<side>`.
4. The eyeballs take {`head` 1}. The tail (the loose part) takes {`hips` 1 - a, `tail` a (1 - c),
   `tail_tip` a c}, with a = smoothstep(-0.005, 0.015) along `tail` and c = smoothstep(-0.015,
   0.015) along `tail_tip`.
5. Ear rows (`earPlane`): a plane through the points (0.05, 0.9, -0.015), (0.105, 0.875, -0.015),
   (0.078, 0.888, -0.045), and (0.078, 0.888, 0.02) splits each ear from the head. Each vertex above
   y 0.7 with an ear share takes {`ear` 1} above the plane (302 vertices), {`ear` 0.5, `head` 0.5}
   in the band of 0.008 units over it (46), and else its row with the ear share given to `head`
   (1,044).
6. Face rows (`faceRows`, "Face rows"): each vertex with y above 0.625 and z above 0.09, y above
   0.7 and z above -0.03, or y above 0.8 and z above -0.1, with a head and ear share of at least
   0.5, gives each other share to `head`. It keeps its ear shares only from y 0.8 (1,090 vertices).

**Face rows.** Bone heat gave the muzzle, the horns, and the cheeks about 0.3 of each ear bone and
0.1 of the neck, because the long muzzle lies as far from the head bone as from the ear bones. The
muzzle then moved with the ears, and `pnpm studio-body` found no muzzle vertex with the row `head`
1, so the tip of the nose lay at the front of the large horn, 0.9 units high. With the ear rows and
the face rows, each vertex of the muzzle takes {`head` 1}. The fact `noseTop` puts the tip of the
nose at the front of the muzzle under the large horn (the horn starts at y 0.79), and the fact
`mouthHeight` puts the mouth at the crease between the lips on the middle plane (y 0.669), as a cut
of the source shows. The chin then counts in the head, so H is 0.492665 m.

**Arm roots.** The shoulder joint lies 0.035 units inside the side of the trunk. With a clavicle
share from 0.4 at x 0.14 to 0 at x 0.18, the rings where the arm leaves the trunk followed the
upper arm, and the lowered arms of the tuba hold turned them into the trunk: the upper arms went
7.3 cm into the body in the play (`pnpm hold-fit tubist`). With the rows of step 2, as on the Tripo
elephant (`../elephant/README.md`, "Arm roots"), they went 5.7 cm in, at the elbow on the belly.

**Smooth surface.** No relax and no region colors. The crease angle 180 gives each corner the mean
normal of the faces at its vertex, as the smooth shading of an FBX viewer.

**Stance.** The rhino stands at its tuba in the pose of the source (`standingBody()` of
`src/models/studio-rig.ts`). The bind keeps the legs of the source: the leg turns of the config are
the turn from the source legs to the same legs (`tools/rig/leg_turns.py <config> 106.1 20.3
-2.1`), and the trunk of the bind stands as in the source (`trunk.open` 0). The property `seat` is
{`prop` `chair`, `front` -0.17, `back` -0.27, `halfWidth` 0.2}: a seat under the back of the
haunch, behind the heels, which only sets the seat height of the export (0.296 m).

**Lids.** A lid on each eyeball: 13 × 13 points at 1.12 ball radii, fitted to the opening of the
ball (psi -35 to 36 degrees and lam -50 to 54 degrees on the left, the mirror on the right). 156
quads on each side, held turned up 105 degrees into the head. The property `lids` holds the angle
1.832596 and the hinge axes. The lid faces take the gray skin patch at UV (0.946, 0.8624) at 0.25
UV for each unit, and the row `head` 1. In the 21 steps of the blink no open lid point, side edge,
or back edge leaves the head (ray casts), and the open lid lies at least 0.0038 units under it.

**Eyes.** Each eyeball is 0.03 units wide, 0.13 of the head width (0.23 units at y 0.79). The map
paints the iris and the pupil and no light, so the eyes take the finish `eye` and the eye light of
the app. In the face views at the elevations 20 and 40, the iris fills the opening, and the smile
line of the map reads as a happy face.

**Arm twist.** The roll of each upper arm and the twist of each forearm from the bind, in degrees,
in each moment of the tubist (`pnpm pose-preview tubist`, `RHINO_TUBA` of `src/pose/winds.ts`):

| Moment | Left upper arm | Left forearm | Right upper arm | Right forearm |
|---|---|---|---|---|
| note, between | -27.0 | 0.6 | 42.8 | 26.0 |
| rest | -39.7 | 7.3 | 47.4 | 23.6 |
| lift50 | -33.4 | 4.8 | 47.3 | 23.7 |
| lower50 | -32.0 | 3.9 | 45.5 | 23.9 |

The left palm faces the main branch of the tuba, so with the left paw of the source the left
forearm twisted 87 to 94 degrees. The paw turn of five ring steps takes 94.7 degrees off it.

**Tuba hold.** `RHINO_TUBA` changes in two values for the new body (design 5.3): the tuba stands
upright in front of the round belly in the play (`play` 0 degrees forward, 7 before), and at rest
it moves 0.1 H back (0.26 H before). The lead pipe keeps its length (`tubaPipe`). The measures of
`pnpm hold-fit tubist` (boulanger-matin), with the old hold on the new body first:

| Measure | Old hold on the new body | Now |
|---|---|---|
| Spare reach to the left grip, play / rest | 1.7 / 0.1 cm | 6.2 / 6.5 cm |
| Spare reach to the right grip, play / rest | 2.9 / -3.9 cm (a miss) | 5.7 / 3.7 cm |
| Note targets within 5 mm | 100 % | 100 % |
| Left claws in the tuba at rest | 4.7 cm | below the limit |
| Mouthpiece in the head at the lips | 2.1 cm | 1.9 cm |
| Left upper arm in the belly, at the elbow | 5.4 cm | 5.7 cm in the play, 5.3 cm at rest |

The thick left upper arm lies against the round belly, and the sweep counts its elbow about 5.5
cm in the belly. In the crops, the arm rests on the side of the belly with no visible cut.
Elbows further out (-1.2, -1, 0) changed the depth by 0.5 cm or less. The right paw lies on the
valve tops, and the left paw lies against the main branch with its claws on it, at each moment.

**Balance.** The center of mass of the skin (its volume) stands 1.7 cm to 2.6 cm in front of the
middle of the soles (33.1 cm long) in each moment (`pnpm pose-preview tubist --skin`). The body
holds about 0.33 m³, so a tuba of about 10 kg about 40 cm in front of the middle moves the center
about 1.2 cm more to the front. It stays over the soles.

**Maps** (`tools/rhino-maps.py`). The tool scales the color map to 2048 pixels (Lanczos) and
writes WebP quality 60, method 6 (Pillow 13.0.0). No texel changes its color. The same run writes
`rhino-normal.webp` from the normal map of the FBX: each x, y tilt limited to 0.2 (2.86 % of the
texels), a box scale to 1024 pixels, the tilts times 4 in red and green, 255 in blue, and `cwebp -q
60 -sharp_yuv -m 6` (libwebp 1.5.0).

**Differences from the source.** The app light is warm and comes from above, so the gray skin reads
as a light warm gray in the app. The upper arms and the forearms are 1.2 times longer ("Arm
stretch").

The export of the file and the maps. License of each file: CC BY-NC 4.0, as the FBX file.

| File | Size | SHA-256 |
|---|---|---|
| `tripo-hand/rhino.rig.glb` | 1,944,024 bytes | `ec6a1dfc089bd856cc2b2df8cdfe5d8cbef982ec8a34cbd38a35d080cfb985a8` |
| `tripo-hand/rhino.rig.json` | 16,952 bytes | `673012776834a3539522734ddd8042e9017546570e1e27f9e749da139ffe5af7` |
| `tripo-hand/rhino-color.webp` | 159,812 bytes, 2048 × 2048 | `9efa737b7a9256382ce1c50fc3f1e6fefbe91fec80b59a995b0231086021fdb0` |
| `tripo-hand/rhino-normal.webp` | 122,062 bytes, 1024 × 1024 | `4cbc905058f748eb7fdc7db187fa81971c6b2320d37512ab9fc6fba4b0e62d69` |

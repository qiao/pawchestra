# 4. Stage, cast, and look

## 4.1 Look

- Low-poly shapes with flat facets and matte colors from the reference images. The fur of a
  studio body shades smooth across the small angles between its faces and keeps its larger
  edges. The props and the plain parts of the instruments keep flat faces. The glossy parts of
  the instruments shade soft (4.5, materials).
- A cinematic stage light. The key light goes from the front of the stage to the back, so the
  shadows fall back. Rim lights behind the stage light the heads and give the visible beam, with
  haze and dust motes (4.5, light and render).
- A dark concert hall with two balcony tiers and rows of small warm lamps around the stage, as
  in `scene.png`. The lamps of the balcony rails go all around the hall. The low row of wall
  lamps has a gap at the back, so that no lamp floats above the orchestra. The lamps bloom, and
  in a close shot they become soft discs.
- A square stage of glossy walnut planks with cut corners, a raised lip, and no steps, as in
  `orchestra-latest.png`. Yellow chairs and black music stands.
- Post effects make the image of a film: a bloom, a depth of field in the close shots, a warm
  color grade, a vignette, and a fine grain (4.5, post effects).
- The bear conductor stands on a podium at the front center. A chamber group of at most 5
  players has no conductor and no podium (4.2).

These product choices apply to each area:

- **Reference images first.** The reference images win over the values in the code. The
  values that 4.5 to 4.7 name describe the current models, and they are no targets. Design 1
  says which image wins where two images differ. A newer product choice wins over an image, and
  its section names it.
- **Happy faces.** Each animal has a happy face. A face rule of the rig removes a sad look, such
  as raised inner brows or a crease that goes down over the eyes (4.4, mesh rig). The faces have
  no blush.
- **Natural balance.** A body that stands, or that plays with no chair, keeps its center of mass
  over the middle of its soles, where a real stance is most stable (4.4, seat).
- **Fur by shading only.** The material has no tufts, no shells, no fins, and no hair cards. A
  studio body with a color map gets a sheen and strand normals on its fur faces (4.5, materials).

## 4.2 Layout

The sections go into arcs in the standard order, with no gaps between the used sections. The
stage size follows the player count. Thus a string quartet sits close together on a small stage.

The standard order is the American seating of a professional orchestra, with the contrabasses
in a line at the back, as the Vienna Philharmonic seats them. The diagram shows it from above.

```text
                          back of the stage
┌──────────────────────────────────────────────────────────────────┐
│                        choir (on risers)                         │
│ row 4:  percussion  contrabasses  timpani  trombones  tuba       │
│ row 3:        horns   clarinets | bassoons   trumpets            │
│ row 2:  keyboard  harp   flutes | oboes                          │
│ row 1: 1st violins  2nd violins | violas  cellos  (other desks)  │
│ row 0: 1st violins  2nd violins | violas  cellos  (first desks)  │
│     soloist (piano)        [bear on the podium]                  │
└──────────────────────────────────────────────────────────────────┘
                        front of the stage
```

- The strings sit in wedges. The first desk of each string seat (its players 0 and 1) sits in
  the front row, and its other desks sit in the row behind it. The rows spread to the side edges,
  as in the reference image (4.5, seat geometry).
- A keyboard of the orchestra (a celesta, a harpsichord, or an organ that is not the soloist of
  3.8) sits at the place of the piano soloist when the score has no soloist, as the piano of
  `orchestra-latest.png`. In row 2, its case and its open lid hid the conductor from the players
  behind it. With a soloist, it sits at the left of the harp, as the celesta
  of a professional orchestra. With no harp and no woodwinds, it then sits in the middle behind
  the strings, as a continuo harpsichord.
- The instrument rows stand on the stage floor. Only the choir stands on risers. The layout
  clears the sight lines by the seat places only (4.5, seat geometry). The players look through
  the gaps of the rows in front. A back desk of the strings looks through the gap between the two
  players of the first desk in front of it, so the first desks move a little to give each such
  gap the room of a desk. The winds, the brass, and the percussion look through the gap of the
  conductor between the second violins and the violas, so the inner first desks move out to make
  this gap wide. A joint search of all rows then opens lanes for the players behind (4.5, lanes).
  A few players behind the strings stay blocked.
- The vocal soloists of 3.8 stand in front of the choir, on the lowest level of the risers,
  because a place beside the conductor covers the first violins or the cellos.
- The soloist of 3.8 stands or sits at the front left of the conductor, as in a concerto. A
  piano seat is always the soloist (3.8), so the piano stands there. Another soloist leaves its
  section row and stands next to the podium (4.5, seat geometry). It has no music stand, because
  a soloist plays from memory.
- **Chamber group.** A score with at most 5 players has no conductor and no podium, because a
  conductor for one pianist looks wrong. The players sit in a small arc at the stage center and
  face each other a little, as a real chamber group does. A score with no players keeps the
  conductor, so that the stage is not empty. `chamberFormOf()` of `models/cast.ts` gives one of
  three forms:

  ```text
     solo              recital                     arc (a string quartet)
                    ┌───────────────┐
                    │ (P)    piano   )                  (V2)  (Va)
      (X)           └──────────────(  )            (V1)            (Vc)
                               (S)
   ────────────────────────────── audience ──────────────────────────────
   X: the player alone, P: the pianist, S: the partner in the crook of the piano,
   V1, V2, Va, Vc: the first violin, the second violin, the viola, and the cello
  ```

  - **Solo.** One player at the stage center faces the audience, with no music stand.
  - **Recital.** A pianist and a partner in the crook of the piano, as in a recital.
  - **Arc.** Two to five players in one arc, in the order of the rows, so a string quartet sits
    in the classic half circle. The players of an arc sit.
  - No player leaves the group as a soloist. A player alone and the partner of a pianist stand
    when their instrument stands as a soloist (4.5, supports).

- Larger species sit farther back, so that a big animal hides no smaller animal. In the default
  view, a large species hides less than 10% of the head of each smaller animal.
- The joint search of the seats reads the footprint, the eye height, and the mesh of each body
  (4.5, lanes). A new body with the same footprint can thus move the seats of other rows, because
  its eyes see other lanes and its head hides other sight lines. A body that replaces the body of
  a species thus keeps the eye height of the old body, as the Tripo mouse, the Tripo fox, and the
  Tripo bear do (4.4, hand rig). The form of its footprint and its mesh can still move seats. For
  example, the tail of the Tripo mouse lies straight back, and the tail of the old mouse curled to
  the side. The whiskers of the fourth Tripo rabbit make its head box wider, and its ears hide other
  sight lines. The trunk of the Tripo fox is deeper than that of the older fox, so its chair is
  deeper, and its head and trunk hide other sight lines.

## 4.3 Species

Each species has one `SpeciesParams` in `SPECIES` of `models/species.ts`, and each species has a
studio body of its own (4.4). The table gives the species of each section.

| Section             | Species                                       | Section  | Species                    |
| ------------------- | --------------------------------------------- | -------- | -------------------------- |
| Violin, first seat  | rabbit (reference)                            | Flute    | fox, light tan (reference) |
| Violin, second seat | fox, red-orange with a white face (reference) | Oboe     | mouse                      |
| Viola               | cat                                           | Clarinet | wolf (`animals.webp`)      |
| Cello               | dog                                           | Bassoon  | beaver                     |
| Contrabass          | hippo                                         | Horn     | pig                        |
| Harp                | deer                                          | Trumpet  | monkey                     |
| Piano               | polar bear                                    | Trombone | panda                      |
| Timpani             | elephant                                      | Tuba     | rhino                      |
| Percussion          | badger                                        | Choir    | penguin                    |
| Conductor           | bear (reference)                              |          |                            |

- The fox plays in two sections, in the two colors of the reference image (`fox-red` and
  `fox-tan`). The two foxes share one mesh and one rig, and the tan fox takes another palette of
  the same faces (`palette`) and, on a body with a color map, the color map of that palette.
- The polar bear plays the piano and each keyboard seat of 3.8. The wolf is the gray clarinet
  player of `animals.webp`. The penguins look like a choir in robes.
- The mouse, the beaver, and the monkey play with no chair (`noChair`), as a real mouse, beaver,
  or monkey stands on its hind legs (4.4, seat).
- Further seats of a section alternate their species variants: a third violin seat uses rabbits
  again.

```typescript
/** The parameters of one species (`SPECIES` of `models/species.ts`). */
interface SpeciesParams {
  /** The head height `H` of the studio body, in meters. */
  headHeight: number;
  /** The height of the seat above the floor, in H: the length of the seated legs. */
  seatHeight: number;
  /** The fur, the belly, and the accent colors (4.5). The UI seat dots read them. */
  colors: SpeciesColors;
  /** The studio body of the species (4.4): `'studio-rabbit'`, `'studio-fox'`, and so on. */
  body: StudioBodyName;
  /** Another palette of the faces of the body (`StudioBody.palettes`): the tan fox. */
  palette?: StudioPalette;
  /**
   * The scale of an instrument of `SCALED_INSTRUMENTS` for the species (4.6), 1 by default.
   * Also `violaScale`, `celloScale`, `bassScale`, `fluteScale`, `oboeScale`,
   * `clarinetScale`, `bassoonScale`, `trumpetScale`, `tromboneScale`, `cymbalScale`, and
   * `harpScale`.
   */
  violinScale?: number;
  /** `'suspended'` for a species whose arms cannot hold hand cymbals (4.6). */
  cymbalForm?: CymbalForm;
  /** The lengths of the longer lead pipe of the tuba, back and left, in meters (4.6). */
  tubaPipe?: readonly [back: number, left: number];
  /** True for a species that plays with no chair (4.4, seat). */
  noChair?: true;
  /** The place and the turn of the bow stick in the right paw (4.6). */
  bowGrip?: BowGrip;
  /** A seated tail that does not sway (5.1): the cat, whose tail hangs behind its chair. */
  seatedTail?: 'curl';
  /** Ears that hang beside the head, and do not twitch (5.1): the dog. */
  hangingEars?: true;
}
```

The head height `H` is the unit of the body. The head height and the seat height of a species
come from its studio body (`StudioBody.headHeight`, `StudioBody.seatHeight`). The bear has no
studio seat, so it uses a seat of 0.75 H. The holds of 4.6 and the pose holds of 5.3 give each
value that follows the body in `H`, so one hold serves the species of different sizes, and a body
size change needs no hold edit (5.3, "Units").

## 4.4 Models

Code builds the instruments and the props from low-poly shapes with vertex colors. Each species
has a studio body: a source mesh, rigged into the studio format. The app reads only the modules
of `src/models/studio/`, and the tools make them from the meshes:

```text
user mesh (GLB)  ->  pnpm mesh-intake (keep faces | needs rebuild)
  ->  tools/blender/arm_rebuild.py [--keep-faces]  ->  <a>-arms.glb + <a>-weights.json
  ->  pnpm rig-mesh <a> (tools/mesh-rigs/<a>.json, Blender)  ->  <a>.rig.glb
  ->  pnpm studio-body <a> (no Blender)  ->  src/models/studio/<a>.ts (the app reads only this)
```

A body with a hand rig makes `<a>.rig.glb` with `pnpm rig-export` in place of the two middle steps
("Hand rig"). A body of the simple route makes the `.blend` of such a rig with a script ("Simple
route").

The rebuild applies only to a body whose arms or legs get new quad faces. A clean quad mesh
(`keep faces`, "Source meshes") keeps its faces, and the step adds only the arm segments and the
weights. The rebuild takes its settings from the joints of the config and from the mesh, so that
a new mesh gets clean arms with no work by hand. Each face takes one color, so a face across a
color edge of the old arm gives a saw-tooth edge. The rebuild thus puts a ring at each color edge
across the arm. A species script `tools/blender/<a>_arms.py` replaces it only for a fault that it
does not fix.

An arm that the mesh joins to the trunk needs a free section. A species script frees it with a
side wall on the trunk (`cat_arms.py`), or splits it from the trunk along its crease in a
copy. An arm that joins the trunk only near the
shoulder also takes the split, because the long thin faces above a low shoulder line fold when the
arm lifts. A flat flipper has rays of different lengths with no trunk in the section, so the free
test takes a larger ratio for it (`--spec` key `free`).

Point edits of a copy then clean the seams, and the rig reads each moved vertex with its weight row
(`weightMoves`). They merge fins, slivers, spikes, and near twin vertices into a neighbor, and
they merge a flat ledge or a strip under a freed root into a crease. Reason: a short clip of the
root into the trunk looks better than a gap, a notch, a flap, or a ledge under it. The old faces
keep their colors. The `README.md` of `assets/models/<a>/` gives the source, the steps, and the
reason of each file. [`docs/agents/rigging.md`](../agents/rigging.md) gives the details and the
traps of the rig.

### Source meshes

- **Fidelity.** A source mesh stays as it is. The rig adds no stretch of a limb, unless a
  product choice sets an arm or a leg factor. The props and the instruments fit the body: each
  chair fits the legs, and a species with short arms plays a smaller instrument in place of
  longer arms (4.6). Each edit goes into a copy that a script of `tools/blender/` makes, so the
  source file stays unchanged and a run gives the same bytes again. A point edit of a rig file
  goes into an edit file, and `pnpm glb-point-edits` writes it into the rig file of a base commit.
- **Replacing body.** A new body of a species keeps three things of its old body in the app view:
  the chair, the seat height, and the leg length. The source mesh sets the head, the face, the
  girths of the arms and the legs, the paws, and the tail. Reason: rules that copied the old body (a
  smaller head, thinner arms) made the cat differ from its own mesh, and its paws then looked too
  large. The leg factors stretch the legs to the old seat, so the stretched legs take a girth
  across their axes (`legGirth`) that keeps more of the stocky look of the legs of the mesh: of the
  girth variants, the one whose mid thigh and mid shin widths, as a share of the head height and of
  the hip width, are nearest to the mesh. The leg turns of the seat (`studio.legTurns`) keep the
  knees of the old body. The trunk length and the trunk shape stay a
  product choice of the form keys of "Mesh rig" (`trunkFactor`, `girthProfile`). `pnpm body-shape` measures the seated bind: the width and the
  depth of the trunk at 10 heights from the seat to the neck joint, the girths of the limbs at their
  middles, the knee and the ankle gaps from the front, the distance of the shoulder joints, and the
  bulge of the back line behind the line from the waist to the neck. A width row of `girthProfile`
  at the shoulder joints moves the joints and the arm roots in together, so the arm root keeps its
  form. The arms then hang nearer to the trunk, and the hold turns the elbows out where they go into
  the body (5.3). On a T-pose body, the cut near the armpits goes through the level arm roots, and
  the trunk share of the painted weights (`weights.paintedBelow`) counts them as trunk. So that
  width row measures the arm roots, and a width row of `girthProfile` does not change it: the images
  of the app view judge that height.
- **Colors.** The texture shows as one color for each face. A color rule of the rig can move the
  fur toward the color of the species in the reference images. The faces near a color edge of the
  texture take gray, tan, or pale yellow mixes, and the color blend of the render (`colorBlend`)
  spreads each such face into a smudge. So a body of two plain colors, such as the black and white
  penguin, gives each face one of the two colors, and its orange keeps its colors
  (`colors.twoTone`).
- **Color edges.** A large face across a sharp color edge gives a saw-tooth edge, or an angular
  eye patch. A script cuts such faces along the edge in a copy, and each new vertex lies on an old
  face. The rig takes the weights of the mesh
  before the cut (`weightSource`). Where the weights change fast, such as at the clavicles, the
  skin moves a new vertex off the line of its old edge, and a small new face turns over in the
  play. There the cut adds few and large faces: it splits no face at the middles of its edges, and
  a change near a corner goes through that corner. The texture has a soft gray step at each edge,
  so a face of the edge takes the larger half of its samples (`colors.split`).
  A cut at the change of a noisy texture gives a jagged line, and the faces along it a staircase.
  So the penguin copy cuts along the zero line of a smoothed side field over the surface in place
  of the texture change, and a face of the other texture side takes the UVs of a near face of its
  side (`assets/models/penguin/README.md`).
- **Intake spec.** A new mesh comes with clean quad faces, so that its arms keep their faces: the
  rig adds only the arm segments and the weights (`arm_rebuild.py --keep-faces`). `pnpm
  mesh-intake` checks each point of the intake table below with the limits of
  `tools/blender/mesh_intake.py`, and gives the verdict `keep faces` or `needs rebuild`. The rig
  fixes the meshes that exist.
- **Triangle budget.** The budget of a studio body allows round forms, such as a round tube for
  each arm (`STUDIO_TRIANGLE_BUDGET`, `STUDIO_MESH_GZIP_BUDGET` of `tools/studio-budgets.ts`).
  The first download of 1 MB and the frame time of 9.7 stay the limits. The whole scene has no
  triangle limit of its own.
- **Licenses.** The project author made the meshes with Meshy or Tripo on a paid plan, and holds
  their rights. The files of `assets/models/` and `src/models/studio/` are under CC BY-NC 4.0 (the
  `README.md` of the repository), with no entry in the third-party license file (7.3).
- **Test mannequin.** `tools/blender/mannequin.py` makes an original test body for the rig chain
  and for the Mixamo route (`assets/models/mannequin/README.md`). The preset `human` has the
  proportions of an adult of 1.8 m, and the preset `animal` the mean proportions of the wolf and
  the rabbit. A band and a front stripe on each limb show a twist. The palm and the back of the
  hand have two colors, and the two sides have two tints. Each joint has quad rings of 16
  vertices. The species `mannequin` has the animal preset with its own faces as its body
  (`arm_rebuild.py --keep-faces`), and no section casts it.
  The role tools test it with a recast role, such as `violinist@mannequin`. No piece casts it,
  so the app does not load it (7.2).

| Intake point | Target | Reason |
| --- | --- | --- |
| Pose | An A-pose: each upper arm 30° to 45° below the horizontal (`POSE`). | A hanging arm and a raised arm then bend the shoulder about the same angle from the bind. |
| Arm gap | A gap between each arm and the trunk: the arm is free of the trunk from a shoulder line before `FREE_ARM` of the upper arm, and the free arm stays `GAP` arm radii from the trunk and the legs. | An arm that touches the trunk needs a cut with a flat cap, and bone heat then spreads the arm weights into the trunk. Both give flaps at the armpit. |
| Limb rings | Each arm and leg is a quad tube. Its rings have 16 vertices (at least `RING_VERTS`), stand at a right angle to the bone (`TILT`), and lie about 0.45 to 0.5 radii apart (at most `SPACING`). | Short arm segments keep each turn step small, and close rings keep the faces between them from a spiral fold. A ring of fewer vertices shows a flat side when the arm twists. |
| Joint rings | At least 3 rings within one radius of each elbow and knee, and 2 of each wrist (`JOINT_RINGS`). | The helper bone of a joint spans these rings, so that the bend spreads over several faces. |
| Color edges | Each color edge of the texture lies on a ring or another edge, and no arm face crosses one (`COLOR_FACES`). | Each face takes one color, so a face across a color edge gives a saw-tooth edge. |
| Faces | At least `QUAD_SHARE` of the triangles in quads, and at most `STUDIO_TRIANGLE_BUDGET` triangles. | A triangle stops an edge ring. The budget keeps the download and the frame time. |

The check reads the rings along each arm, and the rings across each knee. A GLB file holds only
triangles. The glTF exporter writes the two triangles of a quad one after the other, so the check
joins each such pair into a quad again.

### Rules of each body

- The animal faces -z, with its left side at -x. The mouth is near the middle plane, below the
  eyes. The bones have the names of 4.7, so that the pose code of section 5 drives each body.
- Each player is one `SkinnedMesh`: the body, the instrument, and the bow merge into one mesh,
  with one draw call. One `Mesh` for each part gives about 25 draw calls for each animal, which
  is too many for an integrated GPU. The static props merge into a few meshes.

### Export

`pnpm studio-body <animal>` reads the rigged GLB file with no Blender and writes the module. The
entry of the animal in `ANIMALS` of `tools/studio-body.ts` gives its settings. A hand rig holds
the facts of its body in its `.blend` ("Hand rig").

- It turns the animal to face -z and scales it. It drops the props and the clips of the GLB file,
  because the app keeps its own, and it joins the digits of a paw into one `fingers` bone.
- It drops the eyes of the mesh, and puts the bead eyes of the app on eye bones of their own, so
  that they blink. A body of `pnpm rig-mesh` puts each bead eye on the head surface under the
  middle of its old eye. A hand rig gives its eyes with objects of its `.blend` ("Hand rig"). A
  hand rig with no eye objects keeps the eyes of its mesh (`eyes` is `null`): each eye bone lies at
  the middle of the sphere that fits the eye faces of its side (`ownEyesOf()`), and the app adds no
  bead eyes. Such eyes follow the head bone. A lid on each eye blinks over them
  (`StudioBody.lids`, "Hand rig"). Each eye bends to the head surface (`eyeBend()`), so its rim
  lies at the fur.
  `eyePush()` tests a coarse oval with no turn (`PUSH_OVAL`), so that the faces of the oval of the
  app do not move the eye places. A test of the oval of the app pushed single eyes out, and it
  closed no notch, because the fur covers a notch at the rim, which the push leaves in the head.
- A notch of the fur in a bead eye, or a crease beside it, comes from a few faces of the old eye
  socket. A body fixes it with a point edit of its rig file (`<s>-edits.json`, the elephant) or of
  its `.blend` (the polar bear).
- A bead eye is an oval of `EYE_SEGMENTS` faces around its long axis and `EYE_RINGS` steps up, and
  its light has the faces of `LIGHT_BALL`. Fewer steps showed an octagon and a hexagon in a close
  view. Each oval turns in the plane of its eye so that it is upright in the front view
  (`uprightRoll()` of `models/eyes.ts`), because a bend on a sloped cheek leaned the tops of the two
  eyes toward each other, a sad look. Both lights stand at one place on the two eyes, to the upper
  left in the front view, as the reflection of one lamp does (`lightAcross()`).
- The tip of the nose comes from the vertices near the middle plane (`NOSE_PLANE`), or below a
  horn (`noseTop`). The head measures leave out a long nose, the whiskers, and the antlers
  (`headFloor`, `headCeiling`), because the holds in `H` start at the head.
- The mouth lies `MOUTH_DROP` H below the tip of the nose. A body whose nose is far in front of its
  mouth gives the height of its mouth line (`mouthHeight`, a fact of the body), and its mouth is
  then the front of the lips on the middle plane at that height (`mouthOf()`, `StudioBody.mouth`).
  The pig takes it. Reason: the rule put the pig mouth on the front of the snout disc, so the horn
  mouthpiece touched the disc in front of the lips. A real player rests the mouthpiece on the lips
  (winds 2.1, 2.2). A new mouth point moves the instrument of the bind pose, and the layout reads
  that place (4.2), so a new mouth point moves the seats. A hold can move the mouthpiece to the lips
  in place of it (`WindHold.lipShift`, 5.3).
- **Scale.** The scale keeps a landmark that the scene depends on: the shoulders of the bear for
  the conductor stand, and the shoulders, the ear tips, or the head top at the chosen size for
  each other body. A longer leg raises the landmark, so the trunk, the head, and the arms keep
  their size in meters.

### Mesh rig

`pnpm rig-mesh <animal>` rigs a source mesh with Blender: one mesh of faces with one color each,
the skeleton of a studio body (`STUDIO_BONES`), a skin of up to four bones for each vertex,
and up to `RAISE_LIMIT` corrective shapes. The config `tools/mesh-rigs/<animal>.json` gives the
joints and the rules, each with a note. The rig file holds only the animal, so that other tools
can read it, and a role-neutral body holds no prop of a role. The seat of the config goes into the
extras of the asset as numbers ("Seat"), and only the preview images show a chair.

| Group | Config keys | Purpose |
| --- | --- | --- |
| Form | `armFactor`, `legFactor`, `shinFactor`, `headFactor`, `neckFactor`, `trunkFactor`, `trunkTop`, `girthFactor`, `girthProfile`, `armGirth`, `legGirth`, `proportions` | Change a part to a product choice or to the sheet. The head can keep its form. A long thigh can keep its width. A trunk can shorten only below the chest joint (`trunkTop`), so that the arm roots keep their form: the shoulders fold when the chest under them shortens. The trunk can change its width, its front, and its back by bands along its axis (`girthProfile`), so that the back on the chair keeps its place. The arms can become thinner across their axes (`armGirth`). The legs and the tail keep their places. |
| Seat | `studio.legTurns`, `sit`, `studio.trunk`, `chair.front`, `crease` | Bind a seated role in its pose of 5.2, with the haunch on the seat. |
| Weights | `weights.*`, `refine.rings`, `refine.pointFlip`, `heatSource`, `weightSource` | Bone heat, with rules and rings that keep the faces at the joints from a fold. A planar split of the faces takes the weights of the mesh before it. The trunk under a T-pose arm root keeps a trunk share of the painted weights (`weights.paintedBelow`), so that a raised arm does not pull the side out. That share also holds the front of the root with the chest, so a hanging arm leaves a dark notch there. A shape of the rest takes the front of the root along with the arm (`raise` with `follow`), and the play keeps the share. |
| Shapes | `raise` | Give the source back in the standing pose, and relax the faces of a bent arm. |
| Arms | `upperTwist`, `armSegments`, `studio.bindSupination`, `studio.bindArms`, `studio.straightArms`, `armSmooth` | Spread the roll of an arm along the arm, so the skin does not twist. |
| Thumbs | `thumbs` | Give the free thumb of a fist its own bone. |
| Splits | `weights.armSplit`, `weights.armFree`, `weights.armCrease`, `cut` | Free an arm that the mesh joins to the trunk, so a raised arm pulls no flap out. Free it only as far as a raised arm needs: a small clip is better than an over-cut. |
| Normals | `cut.skinNormals`, `cut.bodyNormals`, `rootNormals` | Shade a bent arm root, elbow, wrist, or knee soft, with no dark slot. |
| Colors | `colors.tone`, `colors.shift`, `colors.dark`, `colors.border`, `colors.split`, `colors.flank`, `colors.twoTone` | Move the face colors toward the reference, and keep the black borders clean. |
| Face | `colors.patch`, `colors.smile`, `soften`, `eyeShell` | Give a happy face: round eye patches, a thin smile line, and no brow crease. |
| Tail, ears, jaw | `studio.tailCurl`, `studio.tailBind`, `tailBall`, `sit.carryTail`, `sit.tailSpread`, `earFlap`, `noseFront`, `weights.jaw` | Lay a tail on the seat or the floor, move a tail ball down with the haunch, let a trunk or a hanging ear follow the head, and open a beak. |

**Arms.** A hold with the elbow out and level rolls the upper arm far, and the linear blend at
the shoulder then twists the skin and squeezes the arm flat. So a body takes a twist bone of each
upper arm (`upperTwist`), or arm segments with a helper bone at the elbow and at the wrist
(`armSegments`). The arms of a body with segments are quad tubes that a script of
`tools/blender/` builds on the arms of the mesh. The bind paw sets the zero of the paw twist, so
the rig turns it toward supination where a hold supinates far (`studio.bindSupination`).

**Thumb of a fist.** A paw of a mesh can be one fist with a free thumb stub, as each deer paw
is. Point edits that split the fist into digits would change the form, so such a paw keeps the one
`fingers` bone, and only the thumb takes a bone of its own (`thumbs`, `THUMB_BONES`). The thumb
is a child of the paw, because the thumb of a real hand starts at the wrist. The config
lists the vertices of the free stub, chosen by hand. Each gives only its share of the paw to the
thumb, and keeps its shares of the fingers and the wrist helper. Thus a pose with no thumb bend
skins each vertex as before. The vertices around the root of the stub keep their rows, because
each already has four bones. The pose bends the thumb by the bend of digit 1 of its paw
(`AnimalPose.digits`) about its close axis (`StudioBody.thumbAxes`), which moves the tip across
the palm, so the pose data has one format for claws and thumbs.

**Straight bind.** A bind that bends a thick elbow or paw (`studio.bindArms`) makes the rest shape
a linear blend of that bend, with the skin on the inner side already pressed. Each pose then blends
its own bend on top of it, and the bent wrists of the bear showed a dark slit that no weight rule
removed. So a body can bind its arms as straight as the source (`studio.straightArms`): the skin
blends one time, from the source. A straight arm has no elbow plane, so the body gives the elbow
axis of each arm (`StudioBody.hinges`). The axis is the axis of the bent bind of
`studio.bindArms`, so that the upper arms and the paws keep their world turns in each pose. The
inner elbow then bends further from its bind, so a `raise` shape of a bent elbow relaxes its faces.
The linear blend of the larger bend also narrows the bent elbow, and a shape cannot widen it.
Weights that keep the forearm and the elbow helper off the upper arm keep the elbow wide, but the
whole bend then falls on the rings at the joint, and the inner skin folds. A fold-free inner
elbow needs a turn ramp about as long as the elbow radius times the bend angle. The relax of a
shape moves only the faces that turn over in the pose of its rule, so the fold can move to the
next faces of the elbow ring. Thus a rule of a bent elbow can turn further than the mean turn of
its folded samples (`--further` of `pnpm raise-fit`), so that its pose also turns over the next
faces.

**Role-neutral bind.** The target of each body is a bind that fits no single role: straight bind
arms, and one bind supination of each paw for all roles. A bind bent for one hold gives a rest
shape that fits only that hold, and each other hold blends its own bend on top. So a body with
the role-neutral bind takes a new role with no new rig, which is the way to one skeleton for each
species and each instrument (Cast matrix). Each body of the app has this bind. A body with `raise`
shapes also fits each shape against all its roles, because a shape fits only the poses near its
hold. A pose gives the bend of a paw off its forearm as an angle (`pawBendR`), so that a new bind
keeps the paw in the world.

The bind supination of each paw is the value that makes the largest paw twist p95 of any role
smallest. The roles are the roles of the cast matrix (`CAST_ROLES`) and the own roles of the body,
each on the sample of the matrix (`CAST_SAMPLE`). A value from two roles only can put the paw twist
of a third role near 180°, where the skin folds and the twist measure flips. A change of the
supination moves each signed paw twist of its side by the same angle, so the signed twists of one
rig give the value of each side (`pnpm bind-supination <species>`). A twist that passes 180° on the
probed rig flips, and its shifted value is then wrong. So a value from a rig with such a twist is a
first value: the body rigs it, and a probe of the new rig gives the change that remains. When the
value of a side makes a clearance of the own role of the body grow in the concert, or dents its
skin in the 2x crops, the own role wins, and the value of that side stays smaller: the concert
plays the own role, and a recast role is only a test.

The forearm segments share the bind supination, so the rest shape holds a twisted forearm. On a
thick forearm, the edges of its thin faces then turn more than the crease angle, and a hold near
the twist of the source shows a dark saw-tooth line under the wrist. So the forearm faces of such
a body take the skin normals with no crease angle (`rootNormals.wrist`, from the elbow side of
the forearm to the paw). A normal rule cannot change the form: on a thick forearm, the
supination can dent the side of the forearm near the wrist, or push the forearm near the elbow
deeper into an instrument.

**Arm gate.** A fold count does not see a twisted or a flat arm. So `pnpm arm-check` reads all
arm measures of each arm against one table of limits (`ARM_LIMITS`). A change of a pose, a hold,
or a body runs it on request (9.8). The paw twist, the paw swing, and the flat share measure the skin, so
they count from the bind. The grip turn asks if the paw holds its prop in the accepted way of the
role (`ACCEPTED_GRIPS`), which is a question of the pose. So it reads the twist of the paw in the
frame of the posed forearm (`GripFrames`): the axis from the elbow to the wrist, and the elbow
axis of the retarget. The palm comes from the hand of the player, and the zero is its hanging arm
with the palm inward. A new bind of the same pose then keeps each grip, and one entry of a role
holds for each body. A paw that faces its tube in a shared wind hold with the elbow rule (the flute,
the clarinet, and the right paw of the trumpet, design 5.3) has the palm turn in place of the grip turn: the angle between its
palm and the palm of the accepted player of the role, both in the axes of the instrument
(`ACCEPTED_PALMS`). Reason: the hold keeps such a paw on its keys while the elbow rule turns the
forearm of a round body, and a real player keeps the turn of the hand on the instrument with any
build of the arm. The left paw of the shared trumpet keeps the grip turn, because the hold does not
roll it to the tube, so it turns with its forearm. The bowed holds keep it too: no bowed cell of the
cast matrix fails on it, and the bow paw holds the bow.

A new bind of the same bone pose moves the zero of the lines that count from the bind
(`BIND_MEASURES`), so their margin against the base would fail a body for its bind alone. So the
gate keys the bind of each body (the bind heads of the arm bones, the palms, and the elbow axes).
When the key differs from the base, these lines take only their limits, and `REBIND` marks a line
that the margin alone fails. The gate then compares the elbow and wrist ring widths in meters,
because the flat share counts from the bind ring. A body with the same bind keeps the margin, so a
round that keeps the binds stays as strict as before. A rebind must keep the pose of the bones, so
`pnpm arm-check --world --base` compares the posed arm joints and palms of the two trees at the
samples of the gate.

A value over its limit fails when the base is within the limit. A value that is worse than the
base by its margin fails only past `NEAR_LIMIT` of its limit. Inside that share, it is `WORSE`
with exit code 0, because such values stopped rounds with no fault in the crops. The move twist
is the value of one worst sample, so it takes only its limit. A role with no entry in
`ACCEPTED_GRIPS` has an `OPEN` grip until an entry comes from accepted crops.

```typescript
/** The bind frames of the grip of one arm (`tools/arm-check.ts`). */
interface GripFrames {
  /** The turn from the frame of the player (down, +x) to the bind forearm and its elbow axis. */
  readonly fore: Quaternion;
  /** The turn from the frame of the player (down, inward palm) to the bind paw and its palm. */
  readonly paw: Quaternion;
}
```

**Cast matrix.** The goal is one skeleton with which each species can play each instrument.
`pnpm cast-matrix` measures the way to it: it recasts each species into each role (a recast role,
see "Retarget and render"), and runs the arm gate and the clearance sweep with its note targets
on the shortest demo of the role. A recast pair plays the shared hold of the instrument, because an
own hold would hide a fault of the body. A violin or a viola takes the size of the rule of a violin
shop, a cello the cello rule, and a trumpet, a clarinet, or a flute the size rule of the winds,
each clamped to the real sizes (4.6). Each other instrument keeps the size of the app. The recast
roles of `pnpm arm-check`, `pnpm pose-depth`, and `pnpm close-views` take the same size
(`tools/recast-scale.ts`), so that a run of one pair measures its cell. `--quick` takes a coarse
sample, so that a round finds the faults of a pair early.
`--set` and `--variant` change the holds in memory, as the other hold tools do, so that a try
needs no edit of the source. A value over its limit fails, unless the own pair of the role has the
same open item. The grip of each pair counts from
the accepted grip of the role, because the frame of the grip does not move with the bind. Run the
matrix after a change of a shared hold, a bind rule, or the skeleton, and compare the counts of
each verdict. A shared hold can turn a hanging bind arm 110° or more from the bind, while the
clavicle turns little. The linear blend then crushes the front of the arm root. A `raise` shape of
that hold relaxes the root, because rigid faces or a Smooth of the weights only move the fold. A
body has few shapes (`RAISE_LIMIT`), so a shape goes to the recast holds with the most folds.

### Hand rig

A body can also come from a rig that a person or an agent makes by hand in Blender, saved as
`assets/models/<s>/tripo-hand/<s>.blend`. `pnpm rig-export <s>` (`tools/blender/export_rig.py`,
headless Blender) reads it and writes `<s>.rig.glb` in the format of "Mesh rig". Thus `pnpm studio-body`,
the app, and the gates (`arm-check`, `cast-matrix`, `pose-depth`, `close-views`) do not change.
Reason: `pnpm rig-mesh` calculates each rig again from the source on each run, so a rule for one
fault also moves vertices that the rule was not written for. A fix by hand is local, and it shows
in Blender before the export. A pose in Blender skins from the T-pose and the app from the bind, so
`pnpm pose-preview` and `tools/blender/studio_preview.py` show the app pose of each moment on an
export of the open `.blend`, with the bind as its rest.

Eighteen species have the hand rig of a Tripo P2 mesh (`assets/models/<s>/tripo-hand/<s>.blend`).
A chain of `tools/blender/hand/<s>/` makes each one (`pnpm hand-chain <s>`). Only the mannequin
comes from `rig-mesh`. A long muzzle that lies as far from the head bone as from the ear bones
takes face rows after the ear rows (`faceRows` of the params of the rhino): each other share of the
muzzle goes to the head. Reason: bone heat gave the muzzle of the rhino shares of the ears, so the
muzzle moved with the ears, and the export found no tip of the nose. In the arm rows of
each hand chain, the elbow helper share rises from 0 to 1 at the elbow joint and falls to 0 on
each side (`rows.control` of its params), so that the bend share grows linearly over the elbow.
Reason: a helper share of 0.75 at the joint put 0.25 of each row on the upper arm before the joint
and on the forearm after it, so the bend share jumped from 0.375 to 0.625 at the joint, and the
bent elbow showed a crease and a point. Each paw of the polar bear
has one digit bone for each claw (`DIGIT_BONES`,
`digit1` at the thumb side to `digit5`), a child of the fingers with its head at the base of its
claw. Each claw spike follows its digit, and its base at the fur rim and a base that two claws
share take half of each bone. The paw vertices follow the paw and the fingers, and the wrist
helper only its own ring. Reason: with half of the wrist helper, the paw turned only about two
thirds of the hand turn, and one claw could not press a key alone. A trial of a hand rig keeps
its files outside `tripo-hand/`, such as in `scratch/trials/` of `pnpm rig-trial`, and exports only
by path (`pnpm rig-export <s> --blend <file> --out <file>`), so that no tool takes it for the body
of the app.

```text
source mesh  ->  edits by hand in Blender (loop edges, smoothed vertices)  ->  mesh of <s>.blend
  ->  add_surface(..., eye_fans=False) of tools/blender/studio_armature.py (face colors, gloss nose)
  ->  armature, weights, bind, and shape keys by hand (studio_armature.py can start them)
  ->  eye objects (place_eyes() of tools/blender/studio_eyes.py), or eye faces of the mesh
  ->  pnpm rig-export <s>  ->  <s>.rig.glb + <s>.rig.json (a text summary for diffs)
  ->  pnpm studio-body <s>  ->  src/models/studio/<s>.ts
```

In a rig made by hand, the mesh of the `.blend` is the source of truth, and no tool makes it
again from the source file.
`add_surface()` runs one time on that mesh: each face takes the color of the base color texture
of the source (the GLB file, or the image file of an FBX source) through the UVs of the mesh, by
the color rules of "Mesh rig" (`face_colors()`, `palette()`). The faces of the old eyes take the
fur color, and with `eye_fans=False` the mesh gets no gloss fan on them, because the eye objects
or the eye faces give the eyes. Then a person edits the colors in Blender, and the export reads
them only from the face attribute `color`. A hand rig can also show the color map of its source
in place of the face colors ("Materials" of 4.5): the mesh keeps the UV map of the source, and each
new face gets UVs that sample the fur next to it. The new band faces of a paw turn keep the UVs of the old band, and
the maps tool of the species paints their texels as a fade from the forearm fur to the turned paw
fur (`bandFade` of the params, `tools/band_fade.py`). Reason: the paw turns with its UVs, so its
fur at the band comes from another side of the map, and a ring line with a step of tone showed. The `.blend` holds the data that a person draws. The
export calculates only the measures, with the functions of `tools/blender/rig_mesh.py`, so that
each measure has one definition. It checks each point of the layout below, and stops with the
name of the first fault.

Each value of a hand rig, such as the bind, the joints, the weights, the keys, the bead eyes, and
the facts of the body, lives only in its `.blend`. The bead eyes are objects of the `.blend`, so
that Blender shows the eyes of the app, and no rule of `pnpm studio-body` moves or sizes them. A
`.blend` with no eye objects shows the eyes of its mesh, which the color map paints. The
facts of the body (`BODY_FACTS` of `tools/studio-body.ts`), such as the scale, the crease angle,
and the width of the chair, are custom properties of the armature, so that each fact has one
place beside the rig that it fits. `ANIMALS` keeps only the settings of the app: the landmark,
the role, the constant, and the GLB file. A tool reads each value from the export
(`<s>.rig.glb` or its summary `<s>.rig.json`), never from the rig config
`tools/mesh-rigs/<s>.json`, which keeps the values of the old chain. `pnpm rig-mesh <s>` stops
for a body with a `.blend` beside its GLB file (`handRigOf()` of `tools/glb-swap.ts`).

Each Tripo body of `tripo-hand/` comes from a script chain in
`tools/blender/hand/<s>/`: `params.json` and `base-config.json` hold its values, `make_config.py`
writes its rig config `tools/mesh-rigs/simple/<s>-tripo.json`, and `build.py` writes its `.blend` in
headless Blender. `pnpm hand-chain <s>` runs the chain, `rig-export`, and `studio-body`. For such a
body, the chain is the source of truth, and the `.blend` is an output. Reason: git keeps the
chain, so each worktree and each later round can make the body again byte for byte.

| GLB item | Hand rig |
| --- | --- |
| Joints and parents | The bones of the armature, in the order of `STUDIO_BONES`, with the parents of `STUDIO_PARENTS`. |
| Bind nodes, inverse bind matrices | The world frames of the bones in the Action `bind`. |
| `POSITION` | The mesh in the bind: the basis and the shape keys `bind*`, moved by the linear blend of the bones. |
| `JOINTS_0`, `WEIGHTS_0` | The vertex groups. |
| `COLOR_0`, `COLOR_1` | The face attributes `color` and `color_base`, in linear RGB. |
| Materials `fur` and `gloss` | The material slots. |
| Targets `arm_raise_*` | The shape keys of these names: the move of the bind mesh from the key at 0 to the key at 1. |
| Targets `arm_down_*`, `legs_straight_*` | Calculated: the moves that give the source back in the pose of the sheet (`correctives()`, `split_shapes()`). |
| Clip `reference` | The rest pose of the armature: the pose of the sheet. |
| `seat` | The custom property `seat` of the armature. The export measures the top (`seat_masks()`). |
| `raise` | The custom property of the mesh that has the name of each key `arm_raise_*`. |
| `hinges` | The custom property `hinges` of the armature. |
| `eyes` | The eye objects `eye_L` and `eye_R` in the bind: the middle, the unit direction, and the size of each eye (`eyes_of()`). |
| `ownEyes` | With no eye objects: the middle of the sphere that fits the faces with the boolean face attribute `eye` and no `plain` on each side, in the bind (`own_eyes_of()`), and the triangles of all eye faces of the side (`faces`). Each eye vertex follows only `head`. |
| `lids` | With eye faces and the custom property `lids` of the armature: the turn from open to closed, the hinge axis of each side turned by the head into the bind, and the triangles with the boolean face attribute `lid` of each side (`lids_of()`). Each lid vertex follows only `head`, and lies farther from the middle of its eye than each vertex of the ball. |
| `body` | The custom properties of the armature that hold the facts of the body (`BODY_FACTS`). |
| `caps`, `rim` | The boolean face attributes `cap` and `rim`. |
| `TEXCOORD_0`, `texture` | With the custom property `texture` of the mesh object (the web copy of the color map): the active UV map, with v from the top edge. A gloss face and a face with the boolean face attribute `plain`, such as a whisker, take (-1, -1). |
| `trunk` | Calculated: the largest turn of a trunk bone from the pose of the sheet to the bind. |
| `headShift` | The custom property `headShift` of the armature, in the studio axes. `pnpm studio-body` adds it to the head center of the holds. A nose that goes from the slot `gloss` to the slot `fur` moves the head box forward, so the Tripo wolf, beagle, and cat set it, and no hold moves. |
| `headFactor` | The custom property `headFactor` of the armature. A hand rig that scales the head about the neck joint by the head weights, as the Tripo beagle, sets it, and `pnpm studio-body` measures H and the head center before the factor, so no hold moves. |
| `neckFactor`, `upperTwist` | None. The mesh holds the form, and the arm segments replace the twist bone. |

The layout of the `.blend`:

- **Units and axes.** One Blender unit is one unit of the studio: the T-pose source is 1 unit from
  the soles to the top (`load_mesh()`), with the soles at z = 0. The animal faces -Y, with its left
  side at +X. A form change in the mesh, such as longer legs, keeps the units, so that the facts
  in units, such as `headFloor`, keep their meaning. The mesh and the armature have no transform.
- **Objects.** One mesh, one armature, and the eye objects `eye_L` and `eye_R`, or no eye objects
  for a mesh with eye faces. The export skips
  the objects of other types. The custom properties of the armature are on the armature object,
  and the export also reads them from the armature data.
- **Armature.** The rest is the T-pose of the source. The bones are the bones of `STUDIO_BONES`
  with no eye bones: the body bones, the optional `tail_tip` and `jaw`, and all or none of
  `ARM_SEGMENT_BONES`. The Z axis of each bone points to its hint, at a right angle to the bone,
  as `frame()` of `rig_mesh.py` does: up (+Z) for `root`, the feet, the toes, the tail, and the
  jaw, the palm for the arm bones and their segments and helpers, and forward (-Y) for the other
  bones. Each bone has one B-Bone segment, the quaternion rotation mode, and no constraint.
- **Bind.** The Action `bind` holds the seated, role-neutral bind ("Role-neutral bind") at its
  first frame. A bone with no key keeps its rest, and no bone scales. The arm segments and the
  helpers turn by the rule of the app (`driven_turns()`): the helper keys them, and the export
  checks them.
- **Mesh.** The material slots are `fur` and `gloss`. The mesh has no gloss faces of an eye, and
  `pnpm studio-body` stops for a file with eye fans. The nose has gloss faces on the head bone
  alone ("Export"), or fur faces with the color map, as on the Tripo polar bear, wolf, beagle,
  monkey, and cat. Reason: flat gloss facets in one color showed a light square in the key light
  and no painted nostrils. A mesh with no gloss face writes no gloss
  primitive. The face attribute `color` gives one color to each face. Each vertex has 1 to
  `STUDIO_INFLUENCES` weights that add up to 1. The mesh has one Armature modifier, with no
  envelopes and no preserve volume, and no other modifier. A face can have more than three
  corners, and the export divides it as Blender does.
- **Eyes.** Each eye object is a mesh with the bone `head` as its parent. In the bind, its origin
  is the middle of the eye, its Z axis the direction in which the eye faces, its Y axis up along
  the plane of the eye (the turn of `addEye()`), and its even scale the head height `H` of the
  eye. Both eyes have one size. The mesh of the object is a preview of the eye of the app: the
  oval of `EYE` and its light, bent to the head surface by the rule of `eyeBend()` and turned
  upright by the rule of `uprightRoll()`. The export
  reads only the transform. `pnpm studio-body` measures the bend where the axis of the eye meets
  the head surface, so that an eye can stand in front of the surface, and it reports a front of
  an eye that the head covers (`eyePush()`). A mesh whose color map paints its eyes, such as the
  eyeballs of a Tripo mesh, keeps them in place of the eye objects: their faces have the face
  attribute `eye`, the fur slot, and the UVs of the source, and each of their vertices has the
  weight row `head` 1. Reason: a blink of an eye bone flattens a ball and opens its socket into
  the head. The export refuses eye objects and eye faces in one file. `pnpm studio-body` gives
  the eye faces the wet finish `eye` (`EYEBALL_FINISH`), or the `eyeFinish` of the body, and lists
  them as `StudioBody.eyeballs`. A corner of such a face takes the mean normal of the eye faces at
  its vertex with no crease angle (`studioNormals()`), so each ball shades smooth. Reason: the matte
  fur gives a painted eye no gloss, and a flat gloss face shows its facets.
- **Eye highlight.** The eye light of the players (4.5) gives each eyeball its highlight, so the
  ball carries no catchlight mesh. A white lens on the ball was an opaque disc with a hard edge,
  the same from each angle. The sphere fit of the eye middle skips the eye faces with `plain`.
- **Lids.** Such a mesh can have a lid on each eye: a part of a sphere around the middle of the
  ball, a little larger than the ball, with the face attribute `lid`, the fur slot, the face
  colors of the fur next to the eye, and UVs of a clean fur patch of the color map. The file
  holds the open lid, turned up into the head about its hinge axis, and each lid vertex has the
  weight row `head` 1, so that Blender shows the head of the app. `pnpm studio-body` moves each
  lid vertex onto the eye bone of its side, and the blink turns the eye bone about the hinge axis
  by up to the angle of `lids` (5.1). Reason: a turn about the middle keeps the lid outside the
  ball, so the ball keeps its form and the socket stays closed. The lid reaches past the dark
  inner lining of the socket, so that the closed lid shows no dark ring, and each edge stays
  under the head surface when the lid is open or closed. A strip at the lower edge turns in
  toward the ball, so the moving edge shows no gap.
- **Shape keys.** `Basis` is the T-pose source. A key `bind*`, such as `bind_sit`, is a fix of the
  bind at the weight 1, such as the haunch on the seat or a crease. A key `arm_raise_<side>`, then
  `arm_raise_<side>2`, is a corrective shape of "Mesh rig", at most `STUDIO_RAISES`, in the order
  of the keys. A rig that comes from a GLB file can also hold the pose of the sheet as the Action
  `reference`, and the four shapes of the source as drawn keys.

```typescript
/** The custom properties of the armature object of a hand rig (`tools/blender/export_rig.py`). */
interface HandRigArmature {
  /** The palm hint of the left arm bones, in Blender axes. The right side mirrors it. */
  readonly palm: Vec3;
  /** `SeatExtras` with no top, in the units and the axes of the studio. */
  readonly seat: Omit<SeatExtras, 'top'>;
  /** The unit elbow axes of straight bind arms, in Blender axes (`StudioBody.hinges`). */
  readonly hinges?: Readonly<Record<Side, Vec3>>;
  /** The height of the landmark in the app, in meters: it sets the scale. */
  readonly height: number;
  /** The crease angle of the fur, in degrees. */
  readonly crease: number;
  /**
   * The lids of the eyes of the mesh: the turn from open to closed in radians, and the hinge axis
   * of each side in Blender axes, in the rest. A positive turn closes the lid.
   */
  readonly lids?: { readonly angle: number; readonly L: Vec3; readonly R: Vec3 };
  /** The width of the seat of the chair, in meters. Each other fact of `BODY_FACTS` is optional. */
  readonly seatWidth?: number;
  /** The room behind the back on the chair, in meters. */
  readonly backRoom?: number;
  /** The lowest height of the head measures, in units. */
  readonly headFloor?: number;
  /** The largest turn of the head to each side in a cue of the conductor, in degrees (5.4). */
  readonly cueHeadLeft?: number;
  readonly cueHeadRight?: number;
  /** The angle up of the left hand at the cue point of the conductor, in degrees (5.4). */
  readonly cueLift?: number;
}

/** An entry of the extras `ownEyes`, in the bind, in the units and the axes of the studio. */
interface OwnEyeExtras {
  /** The middle of the sphere that fits the eyeball faces: the head of the eye bone of the side. */
  readonly middle: Vec3;
  /** The eye faces of the side, as triangles of the primitive `fur`. */
  readonly faces: readonly number[];
}

/** The extras `lids`, in the bind, in the axes of the studio (`StudioLids` of the module). */
interface LidExtras {
  /** The turn of each lid from open to closed, in radians. */
  readonly angle: number;
  /** The unit hinge axis of each lid. A positive turn closes the lid. */
  readonly axes: Readonly<Record<Side, Vec3>>;
  /** The triangles of each lid, as indices of the triangles of the primitive `fur`. */
  readonly faces: Readonly<Record<Side, readonly number[]>>;
}

/** An entry of the extras `eyes`, in the bind, in the units and the axes of the studio. */
interface EyeExtras {
  /** The middle of the eye: the head of its eye bone. */
  readonly middle: Vec3;
  /** The unit direction in which the eye faces. */
  readonly direction: Vec3;
  /** The head height `H` of the eye. */
  readonly size: number;
}

/** The custom property of the mesh for each key `arm_raise_*`, under the name of the key. */
interface HandRigRaise {
  readonly side: Side;
  readonly bone?: 'forearm' | 'hand';
  /** `StudioRaise.turn` as w, x, y, z, in Blender axes. */
  readonly turn: readonly [number, number, number, number];
  /** `StudioRaise.fade`, in degrees. */
  readonly fade: readonly [full: number, none: number];
}
```

The rest of the armature is the T-pose, and the app blends each pose from the bind. So a pose in
Blender differs from the same pose in the app where a vertex has bones with different turns, and
a key `arm_raise_*` too. An import of the GLB file into Blender shows the skin of the app, because
its rest is the bind.

### Simple route

A clean quad mesh with the arms apart from the trunk, such as a Tripo mesh in a T-pose, can take
the simple route: `tools/blender/simple_rig.py` with a config of `tools/mesh-rigs/simple/`. It
makes no cut, no cap, no remesh, and no rebuild, so the body keeps the form of its source. It
writes the `.blend` of a hand rig, and `pnpm rig-export` and `pnpm studio-body` follow ("Hand
rig"). The first Tripo P2 rabbit was a trial of this route that the app does not use. A hand rig
of the fourth Tripo P2 rabbit (`assets/models/rabbit/tripo-p2/`) with no arm cut and no arm
stretch (`assets/models/rabbit/tripo-hand/`) is the body of the rabbit. Its source FBX is the
target of its look, as for the Tripo wolf. It keeps the eyeballs of the source in their sockets,
with no bead eyes, the finish `eye`, the eye light, and a blink lid on each eye ("Hand rig").
Reason: the map paints a full eye on each eyeball (a black pupil, a brown ring, and a light). Its
color map (`rabbit-color.webp`, `tools/rabbit-maps.py`) gives the fur the chroma of the sheet
(`FUR_CHROMA`) and adds fur strands (`STRANDS`). The pink skin and the eyes keep the paint of the
source. Reason: the source paints the fur cream and smooth, and the sheet and the reference images
show a white rabbit. Its arms are thicker than in the source, with the girth of the third Tripo
rabbit (the point edit `armGirth` of its chain). Reason: the arms of the source are 15% thinner,
and thin arms read weak on the earlier Tripo bodies. Its seated eyes are at the height of the eyes
of the third rabbit (`metersPerUnit` of its chain, 4.2). Its arms reach 0.299 m, so its violin is
0.9 of the violin of the app (4.6, `violinScale`). The Tripo bear
(`assets/models/bear/tripo-hand/`) is the body of the conductor, by the rules of the badger. The
source FBX is the target of its look: it keeps the eyeballs and the eye paint of the source with
lids, the claws, the round belly, and the tail bump. It stands with the bind of the older bear,
and its eyes stand at the height of the eyes of the older bear (`metersPerUnit` of its chain), so
that the layout and the camera framing stay (4.2). Its front paws are smaller than in the source
(the point edit `paw`). Reason: the paws of the source were 0.68 H long, against 0.35 to 0.5 H on
the other bodies. Each paw turns by whole steps of a closed wrist ring, so that the forearms of
the conductor do not twist. The skin of the upper lids turns down a little over the iris
(`lidLower`). Reason: a full ring of white around the iris read startled. Its color map keeps the
colors of the source at a lower lightness (`LIGHTNESS` of `tools/bear-maps.py`). Reason: the key
light of the hall made the fur of the source colors lighter than the source. A
hand rig of the fourth Tripo P2 cat (`assets/models/cat/tripo-hand/`) is the body of the cat
violist, by the route of the Tripo wolf. The source FBX is the target of its look: no point edit
changes its trunk, limbs, legs, or tail, its map keeps the colors of the source
(`tools/cat-maps.py`), its crease angle is 180°, and it scales only to H of the cat of main. Its
chair fits its legs: the shins of its bind stand nearly vertical and the heels are a little up,
with the toes on the floor. Reason: with flat feet, the chair read too low. The higher eyes
change the sight pass of the layout (4.5) in five demos. The only form edits are those of the eyes, of the mouth corners, and of the
front paws. The point edit `paw` makes each front paw shorter and narrower past the wrist joint,
and the digits a little shorter again past the knuckles (the values are in its README). Reason:
the paws and the digits of the source read too large in the app. Against the arm, the paw now has
the length and the width of the paw of the cat of main. Its
eyeballs and sockets are smaller than in the source, each ball sits a little deeper, and the skin of
each upper lid turns down a little over the top of the iris (`assets/models/cat/README.md`, "Eyes").
Reason: at the source size, each eye opening was about 0.15 of the head width, the ball bulged out
of the face, and white showed above the iris in the play view. These faults made the eyes of the
third cat read uncanny. The corners of its mouth lift a little up and back, with the cheeks and the
pads over them, so the mouth reads as a slight smile (`assets/models/cat/README.md`, "Smile").
Reason: in the stage light, the slit under the muzzle pads shades as a dark line that fell to the
corners, and the mouth read sad. The map paints a soft light in each pupil, so the eyes take the
finish `varnish` and no eye light, with one light in each eye. Its paws turn about the forearms by
whole ring steps, its elbow axes turn, and its bind upper arm points down and forward, so that each
part of each arm takes at most about 45° of roll or twist in the moments of the violist, the rest
included. Its thighs spread 20° in the seated bind. Reason: with less spread, its round belly
covered the lap point, and the rest lifted the viola and the bow to the chest. Its tail goes back
over the back edge of the seat and hangs down behind the chair between the back posts (the key
`bind_tail`), and it does not sway. Reason: a tail on the seat beside the haunch went through the
seat or near a back post. The large tail of the Tripo fox goes back over the back edge of the
seat and hangs down behind the chair (`studio.tailBind`), and its rows start at the root loop of the
tail on the back. Reason: with rows from the bone heat, the root of the tail counted as the body, the chair grew
deeper, and the tail went into the seat.
A hand rig of the Tripo P2 fox (`assets/models/fox/tripo-hand/`) is the body of the red fox and the
tan fox. It follows the route of the Tripo wolf (below): the colors and the eye paint of its source,
the crease angle 180°, and a scale to the eye height of the older fox (4.2). Reason: the look target
of this body is its source FBX. Its point edits serve only the rig and the holds
(`assets/models/fox/README.md`). The left paw moves in to the length of the mirror of the right
arm (`armEven`), because the left forearm of the source has one longer quad band. The upper arms
and the forearms are 1.25 times longer (`armStretch`). Reason: the source arm reached 0.82 H from
the shoulder joint to the palm, and both flute grips lay out of reach. It now reaches 1.0 H, as
the older fox. Its violin is 0.83 of the violin of the app (4.6, `violinScale`). Reason: with the
full violin, the short arm stopped the strings only over the upper bout, and the thick left paw
went into the violin. The fore paw past the wrist joint is a little smaller than the source paw
(the edit `paw`): about 0.42 H long, as the paw of the wolf (0.43 H), and wider than the wrist. Its
middle two digits stay the longest. Reason: the source paw was 0.47 H long and 1.8 wrist diameters
wide, and a paw of 0.34 H, at the wrist ratio of the wolf, read too small on the forearm. The edit
scales about the wrist joint after the arm stretch, so the forearm keeps its girth up to the joint,
and the wrist and the knuckles of the mesh lie at their joints. Reason: about the source wrist, the
edit made a narrow neck before the joint, and a wrist bend turned the paw heel. The legs and the right ear of the source are no mirrors of the left
ones, so they take joints of their own. Its eyes are the flat eye domes of the mesh, because the
map paints a full eye on each, with a light in each pupil. So the eyes take the finish `varnish`
and no eye light. Each dome lies on its own sphere (`ballSphere`), and each blink lid turns 60°
about the deep middle of that sphere and covers only the eye opening. Reason: the app turns a lid
about the middle of the sphere of its eyeball, and a lid of the usual size and turn left the head.
Its legs keep the length of the source, and its feet stay flat in the bind. The Tripo polar bear
(`assets/models/polar-bear/tripo-hand/`) keeps the eyeballs of its source, and its irises take the
middle of the opening in the view of the play of the pianist (`gaze_targets()` of
`tools/polar-bear-maps.py`), its painted light gives the `varnish` finish and no eye light, and
its eyes keep the size of the source ball. Its map also gives each eye a darker iris and a softer
warm white (`far_tone()`), with the values of the dark iris of the earlier fox map tool. Reason: in the hall view
each eye is a few pixels across, and the bright white read dim. Its source paints white only at the
outer corner, so it takes no round iris. Its arm, leg, and trunk girths and
its paws are those of the main polar bear, and its head keeps the round form of the sheet. The
Tripo wolf (`assets/models/wolf/tripo-hand/`) has no change of its map colors, and it
scales only to H of the wolf of main. Reason: the look target of this body is its source FBX in an
FBX viewer. Its one point edit makes the front paws smaller past the wrist (the edit `paw` of its
build, `assets/models/wolf/README.md`, "Paw size"). Reason: against the distance of the shoulder
joints, the source paws are larger than the paws of the beagle and the rabbit, and they read too
large on the short arms. Its source has no eyeball, so the head faces of each
painted eye take the face attribute `eye`, the finish `varnish`, and a blink lid. Its crease angle
is 180°, as the smooth shading of an FBX viewer. Its paws turn about the forearms by whole ring
steps, so that each part of each arm takes at most about 45° in the moments of the clarinetist. The
Tripo beagle of the dog (`assets/models/dog/tripo-hand/`) follows the same rules, and it
scales to a larger H than the dog of main (`metersPerUnit` of its config). Reason: the beagle sits
beside the Tripo cat of the violas, and it must read a little larger. The top of its head stands
a little higher than the top of the head of the cat, seated and standing (the ears of the
cat do not count, because the ears of the beagle hang). Its source has eyeballs with painted
irises and lights, so the eyeballs stay, with the finish `varnish` and a blink lid. Its short legs
give a lower chair. Its front paws are the first exception to the form of the source: the point edit
`paw` of its build makes each paw shorter and narrower past the wrist joint (the values are in its
README). Reason: the arms are short and the head is large, so the paws of the source read too large
in the app, and against the width of the trunk they were much larger than the paws of the dog of
main. Its head is the second exception: after the weights, its build makes the head, the ears, the
eyes, and the muzzle smaller about the neck joint, with the head weight as the share, and its lids
fit the scaled eyes. The armature keeps the factor (`headFactor`), so H and the holds do not
change. Reason: against the width of the trunk, the head read too large, and larger than the head
of the Tripo cat.
Its paws and elbow axes turn so that each part of each arm takes at most 45° in the play of the
cellist. The rest of the bow forearm keeps a larger twist, because the cello hold sets it. The
Tripo monkey (`assets/models/monkey/tripo-hand/`) follows the same rules for the trumpet.
It scales to 1.2 times H of the monkey of main (`metersPerUnit` of its config). Reason: at H of
the monkey of main, it was one of the smallest bodies of the lineup, and its trumpet read small.
Its source has eyeballs, so the faces of each ball take the face attribute `eye`, the finish
`varnish`, and a blink lid. It has no chair, as the monkey of main. Its bind has its own leg turns
and a small trunk lean: the thighs hang straight down, the knees bend a little, and the shoulders
stay over the hips. Reason: with the leg turns and the trunk lean of the monkey of main, the large
head and the chest leaned far forward of the haunch. It relaxes the small folds of the source
below the neck (`fold_relax()`, as on the beaver). Reason: the fur tufts along the back and the
creases at the backs of the knees showed as dark spikes and dark creases. Its tail keeps
the curl of the source and follows the root bone of the tail alone. Reason: a second tail bone bent
the curl in the bind. The Tripo hippo (`assets/models/hippo/tripo-hand/`) follows the same rules
for the contrabass. Its eyeballs and its two loose teeth stay. It stands in the pose of the
source, and its bind keeps the legs of the source. Reason: seated thighs push into the round belly
in the bind, and the normals of the export then show the dents in the standing pose. Its upper
arms and forearms are longer than in the source (the point edit `armStretch` of its build,
`assets/models/hippo/README.md`), and the paws keep their size. Reason: with the arms of the
source, no upright hold of the contrabass reached the strings and the neck over the round belly.
Its paws and its elbow axes turn so that each part of each arm takes at most 45° in the moments of
the bassist. The Tripo pig (`assets/models/pig/tripo-hand/`) is the body of the hornist, by the
same rules. Its source paints each eye on faces of the head with no light, so the eye faces take
the face attribute `eye`, the finish `eye` with the eye light, and a blink lid. Its arms keep the
short length of the source, so the form of the horn puts its coil and its bell in their reach
(`HORN_PLANE`, 4.6), and the shoulders turn forward (`PIG_HORN`, 5.3). Its arm loops stop at
poles, so no ring takes a split: each
hoof turns by whole steps of the one closed wrist ring, and a bridge of new quads joins the ring
again (`turn_hooves()` of its build). Each elbow axis also turns. Each part of each arm then takes
at most 45° in the moments of the hornist. Its face takes the head bone alone above the chin,
because the bone heat of the hanging head gave the snout shares of the shoulders. The thigh
shares of its belly fall to 0 below the arms (`belly_rows()` of its build). Reason: the bone heat
gave the belly thigh shares up to the arms and none from there, so the seated bind pulled the
belly back under the chest, and a pale flat panel with a hard corner showed in front of each upper
arm. The key `bind_belly` of its build relaxes the lower belly into the thigh tops (`belly` of the
params). Reason: with the belly rows, the round belly hung over the thigh tops, and a black wedge
of shadow showed in the lap. Its arm rows reach the vertices under each arm root (`rows.reach`
of the params). Reason: the bone heat rows there gave two neighbors at the front of the left
armpit trunk shares of 0.44 and 0, and their faces folded in each sample. The Tripo
penguin (`assets/models/penguin/tripo-hand/`) is the body of the singer, by the same rules. Its
eyeballs stay, with the finish `varnish` and a blink lid. The flat flippers are its arms: each
flipper takes edge-ring rings at the shoulder, the elbow, and the wrist, and the paw bones take the
flipper tip. Its beak opens: the build cuts the whole closed beak of the source along the mouth
plane, back to the mouth slit of the source at the end of the orange mouth line, and a dark cap
closes each part. The lower beak and the chin in front of the slit follow the jaw bone (`jaw`),
which turns at the back of the slit, as the jaw of a real bird turns at the back of the gape. It stands in the pose of the source, with its legs and its
upright trunk, and its center of mass lies over the back of the soles, as on a real penguin. Its
flippers start at the back half of the sides, so the choir folder is nearer to the chest than for
the earlier penguin (`CHOIR_FOLDER`, 5.3). The Tripo elephant
(`assets/models/elephant/tripo-hand/`) is the body of the timpanist, by the same rules. Its source
paints each eye on faces of the head with no light, so it takes the eyes of the pig. Its stump
paws turn by whole steps of one closed wrist ring, as the hooves of the pig, and each elbow axis
turns, so that each part of each arm takes at most 45° in the moments of the timpanist. Its
trunk, tusks, and lips take the head bone and a share of the neck bone toward the tip of the
trunk, and its large ears take the ear bones and the head bone alone. Reason: bone heat gave the
trunk shares of the chest, and the low ear lobes shares of the shoulders. The Tripo beaver (`assets/models/beaver/tripo-hand/`) is the body of the bassoonist, by the same rules. Its
eyeballs, its teeth, and its whisker strips stay, and the eyes take the finish `varnish` and a
blink lid. It has no chair, and its bind keeps the legs, the trunk, and the flat tail of the source,
so it stands on its short legs with the tail on the floor behind it. Its one form edit relaxes the
small folds of the source surface (`fold_relax()` of its build). Reason: the FBX viewer shades
them with the custom normals of the file, but the app makes its normals from the form, and the
folds showed as dark triangles on the back and the cheeks. Its paws and elbow axes turn so that
each part of each arm takes at most 45° in the moments of the bassoonist. Its arms are short, so
it plays a smaller bassoon, and its hold turns both shoulders forward (`BEAVER_BASSOON`, 5.3).
The bassoon is the largest at which both paws reach their grips with the boot joint in front of the
round belly. Its first arm row starts near the clavicle share that bone heat gives the armpit
(`rows.control`), as on the polar bear. Reason: a first row of 0.4 that fell to 0 in 0.04 units
folded the front of the right armpit at the rest of the bassoon into a dark slot. The ring between
the two elbow bands goes through two poles, so one edge ring cut halves each band (`seed_rings()`
of its build), and the elbow helper ramp spans three rings on each side of the joint. The turned
band of each paw takes one cut too (`turnBandCuts`). Reason: over bands of 0.03 units, the bent
right arm of the bassoonist was a box, with a sharp elbow corner and a square step at the wrist.
The Tripo badger (`assets/models/badger/tripo-hand/`) is the body of the
percussionist, by the rules of the beaver. Its right eyeball is a loose part in an open socket,
and the source joins its left eyeball to the rim of the socket, so a sphere fit finds the faces of
that ball (`fused_ball()` of its build). Both eyes keep the paint of the source, with the finish
`varnish` and a blink lid. No arm band of the source is a closed loop of quads. Each of the three
bands of the elbow is a ring of quads through one triangle, and one edge ring cut halves each band
(`seed_rings()` of its build), with no paw turn. Its elbow helper share rises to 1 at the elbow
joint and falls to 0 on each side, so that the bend share grows linearly. Reason: with rings 0.6
arm radii apart and a helper share of 0.75 at the joint, the bend share jumped at the joint, and
the bent elbow showed a faceted point with a dark notch. Its arm rows start near the bone heat
clavicle share as on the beaver, and the trunk vertices of the back wall of each armpit give their
arm shares to the clavicle (`back_rows()` of its build). Reason: when the elbow went back, those
arm shares pulled the back of the armpit into a fold, and a dark slit showed behind the upper arm.
Its normal map keeps only the tilt of the fur strands on the back of the neck (`FLAT` of
`tools/badger-maps.py`). Reason: the source paints small bumps there, which showed as red and brown
dots in the warm light.
It has no chair, and its bind keeps the legs, the trunk, and the tail of the
source. Its standing crown matches the crown of the older badger (`metersPerUnit` of its chain),
and its upper arms and forearms are 1.2 times longer than in the source (the point edit
`armStretch`, as on the panda). Reason: at the H of the older badger, the body stood 13% lower
and the short arms missed the bass drum, the small percussion, and the xylophone. The Tripo mouse
(`assets/models/mouse/tripo-hand/`) is the body of the oboist, by the rules of the beaver. Its
standing eyes are at the height of the eyes of the older mouse (`metersPerUnit` of its chain).
Reason: the seat search reads the eye height and the mesh of each body (4.2), and at the H of the
older mouse its eyes and its large ears stood higher and moved players of 14 of 18 demos. The Tripo panda (`assets/models/panda/tripo-hand/`) is the body of the
trombonist, by the same rules. Its eyeballs keep the paint and the size of the source, with the
finish `varnish` and a blink lid. Its front paws are smaller than in the source (the point edit
`paw`), as on the Tripo wolf. Reason: against its short arms, the paws of the source read too
large. Its round tail is a bump of the haunch, and it moves with the hips. Reason: the bone heat
gave the tail bones shares of the lower back, and the bump swayed into the chair back. Each paw
turns by whole ring steps, so that each part of each arm takes at most 45° in the moments of the
trombonist. Its mouth lies far in front of its short arms, so its upper arms and forearms are
longer than in the source (the point edit `armStretch`, as on the hippo), and it plays the
trombone of the app. Reason: with the arms of the source, the right arm reached almost none of
the slide travel of the trombone of the app, and a smaller trombone of 0.75 read as a toy. The Tripo fawn (`assets/models/deer/tripo-hand/`) is the body of the harpist, by the same rules. Its source
paints a full eye with a light on each eyeball, so the eyeballs take the finish `varnish`, no eye
light, and a blink lid. Its eyeballs and their sockets are smaller than in the source, because the
eye opening was about 0.18 of the head width in the play view, above the limit of about 0.14 of
the other bodies. Its scale (`metersPerUnit` of its config) puts its seated crown, with no ears,
at the seated crown of the Tripo wolf, and its ears rise above the ears of the wolf. Reason: with
the standing shoulders of the old deer, the slim fawn was the smallest body of the orchestra. Its
head is small, so a scale that keeps H of the old deer made it 1.6 times taller. The stool grows
with the body (4.6), and the palm offsets of the harp hold are in `H` (5.3). Its
upper arms and forearms are 1.5 times longer than in the source (`armStretch`), as on the Tripo
hippo, and the hooves keep their size. Reason: the harp stands in front of the chest (4.6), and
with arms of 1.4, the hooves missed their places on the bass strings by up to 2.3 cm. The arms are
0.69 of the trunk, against 0.52 to 0.65 for the other hand bodies. The spine
stays erect, so that the muzzle stays off the neck of the harp. The left hoof turns
by one step of a closed wrist ring, and each elbow axis turns, so that each part of each arm
takes at most 45° in the moments of the harpist. The paws of the fox turn about the
forearms by whole ring steps, and the holds of
the red fox and the tan fox (`FOX_HOLD`, `FOX_FLUTE`) give each part of each arm at most about 45°
of roll or twist in the moments of both roles. Reason: one body plays the violin and the flute, and
with the paws and the holds of the fox of main, a forearm twisted up to 168°. The turn takes each
vertex that the edges join to the far ring of the turned band, and no vertex of the near ring.
Reason: a cut by the place along the forearm also turned vertices of the slanted near ring, and
they made fins and slits at the wrist. Past the far ring, the turned part changes from the form of
the ring before the turn to its own turned form over `turnFit`. Reason: over a shorter fade, the
turn of the right paw left a step on the edge of the forearm. An arm that the mesh
joins to the trunk needs a cut,
so such a mesh takes the mesh rig ("Mesh rig").

```text
source (FBX with quads, or GLB) + base color  ->  weld, face colors (add_surface())
  ->  limb factors (limbs)  ->  edge ring splits on the arms (rings.subdivide)
  ->  armature and seated bind of the config  ->  bone heat, weight smooth, roll split
  ->  bead eyes and facts  ->  <a>.blend  ->  pnpm rig-export  ->  pnpm studio-body
```

- **Quads.** An FBX source keeps its quads, and a GLB source holds only triangles. The join of a
  GLB into quads (`joinQuads`) is a guess, so a quad source comes as an FBX file.
- **Limbs.** An arm factor gives the reach of the role, and a shin and a thigh factor give the seat
  of the old body (`limbs`). Each factor is a plain stretch along the bone or the height.
- **Rings.** A new ring halfway between two arm rings splits each edge of the quad edge ring
  between them at its middle (`rings.subdivide`), so that each roll segment has about two rings and
  each elbow the rings of `JOINT_RINGS`. Reason: a plane cut goes through the faces at any angle
  and leaves slivers, and a new ring on the quads follows them. An edge ring that holds a triangle
  or a pole takes no split.
- **Roll split.** Each vertex keeps its weight on the roll segments of its arm part, and the
  segments share it by the place of the vertex along the bone (`rollSplit`). Reason: bone heat
  gives each segment its weights by distance, so the roll gathered in bands at the segment
  borders, and the faces twisted into a spiral of long facets.
- **Loose parts.** Each part other than the body, such as an eyeball or a whisker strip, takes the
  head bone alone, because bone heat gives a loose part no sure weights.

### Seat

- A seated role binds its mesh seated. The export puts the soles on the floor and the haunch on
  the seat. The chair fits the body (`StudioBody.seatHeight`, `chairDepth`, `chairWidth`,
  `backRoom`), so the feet touch the floor. The seat is level, and it ends where the thighs leave
  it at the haunch (`chair.front`).
- The rig writes the seat of its config into the extras of the asset (`seat`, `SeatExtras` below),
  and the export fits the seat of the app to it.
- The sit lowers the underside of the haunch onto the seat, most at the back of the haunch, and
  less with the height. A tail ball stays on its bone, so the faces under it stretch into a
  column. So the ball moves down with the mean drop of the ring of the haunch around it
  (`sit.carryTail`). The ring drops by different amounts, so the haunch near the ball also moves
  with the ball, with a share that falls to 0 over a band (`sit.tailSpread`). The change of the
  drop then spreads over several faces, and the ball keeps its round form.
- A hand chain has no sit step of the rig config. The seat top is the lowest body point over the
  seat, often the thigh underside, so a round haunch hangs over the seat with a gap. The key
  `bind_sit` of the cat and the pig chains (`sit_move()` of `tools/blender/bind_edit.py`, `sit` of
  `params.json`) moves the haunch underside behind the hip joints down onto the plane of the thigh
  underside. The seat height does not change. Each slice across the seat moves as one (`across`),
  so the cross section of the haunch keeps its round form. Reason: a drop of each point to its
  own lowest neighbor made the haunch a box with steep sides, and on a coarse mesh its edge showed
  as teeth.
- The polar bear is the largest player, as a real polar bear is larger than the other animals of
  the cast. The piano grows only a little with it (`PIANO_SCALE`), because a larger piano hides
  the players behind it. It stands on longer legs (`PIANO_LIFT`) with its lid on the short prop
  stick (`PIANO.lidAngle`), so that the keys stand at the height that the upright trunk of the
  bear needs, and the faces of the players behind it show over the lid.
- The polar bear sits on a bench that fits its haunch and legs (`benchFitOf()`), as a real
  pianist sits on the front half of the bench: the whole haunch sits on the seat, the thighs slope
  a little down from the hips to the knees, the knees open past 90°, the shins stand near
  vertical, and the feet stand flat. Its legs keep the length of the mesh, so the body keeps the
  part ratios of the mesh, and only the slope of the thighs in the bind sets the height of the
  bench. The thighs slope down at most about 25°. Reason: thighs that slope further down put the
  haunch on the front edge of the bench, and the bear looks as if it stands up. A smaller slope
  lowers the hips, and below about 25° the thighs set the seat top in place of the haunch. The
  bench reaches back from the front edge of its fit to at least `PIANO_BENCH.studioDepth`, so the
  round haunch sits on the bench with a little room behind it. The deer sits on the stool of the
  harp.
- The wider haunch of the cat sits on a wider chair (`seatWidth`), and its tail lies curled on
  the seat around the left side of the haunch (`studio.tailCurl` of the rig config). The rabbit
  sits with more room behind the back (`backRoom`), so that its back keeps off the chair back.
- The Tripo rabbit of `tripo-hand/` keeps the legs of its mesh, and its chair fits them
  (`StudioBody.seatHeight`). It sits as a real
  violinist does: the thighs of its bind slope a little down, and the seat of its rig ends where
  the calves start to go below the thighs. So the seat carries most of each thigh, its front edge
  is a little behind the knees, and the back of the pelvis is near the chair back. Reason: with
  the steep thighs of the bind rules, only the haunch could sit on the seat. The shins stand
  nearly vertical and the heels are a little up, with the toes on the floor, so that the seat is
  near the seat of the cat. Reason: with flat feet, the chair read too low.
- The Tripo pig keeps the short legs of its mesh. Its bind keeps the foot turn of the source, so
  each sole lies flat on the floor, and its shins stay vertical. The front edge of the seat is
  near the knees, so that more of each thigh lies on the seat. Reason: the hoof is one part with
  no toe bend, so a bind with the heel up tilted the whole hoof onto its front tip, with the heel
  above the floor. Its round back reaches further back than the haunch and sets the chair depth,
  so the haunch sits on the front half of the seat.
- The Tripo panda keeps the short, thick legs of its mesh, and its bind keeps the leg turns of the
  panda of the old mesh: the thighs slope down and the shins stand vertical, with flat feet. So
  its chair is low, and the front edge of the seat lies about one shin radius behind the knees,
  so that no shin lies over the seat. Its round haunch is wider than the chair of the app, so it
  sits on a wider chair (`seatWidth`), and the chair is deep enough that its round tail lies in
  front of the chair back. Reason: steeper thighs or raised heels add little height under the
  round haunch, and the seat height and the chair size move no player of the layout (4.5). The
  larger body of the Tripo panda at the same H moves the players of the four demos with
  trombones.
- The seated bind of the Tripo panda and of the Tripo polar bear has a key `bind_belly`. On the
  panda, it moves the belly half way to the form that the trunk bones alone give, from the lower
  belly over the thigh tops up to below the arms, and relaxes the lap rows. Reason: bone heat gives
  the thighs shares far up the belly and the flanks, and the seated thighs pulled the belly back
  into a hard ridge from each armpit to the knee, a dark band across the belly, and a groove with
  a black line at the lap. The key fades out under the arms, so that the upper arms keep their
  room. The standing soloist keeps the form of the source.
- The seated bind of the Tripo fox has a key `bind_sit`. It puts the underside of the haunch
  behind the hip joints onto the plane of the thigh underside, so that the thighs and the haunch
  sit on one seat plane, and the hip joints stand about 0.3 H over the seat, as on the cat, the
  pig, and the wolf. Reason: a small knob of the source at the back of the haunch was the lowest
  point over the seat, so the seat top went under it, and the thighs and the haunch floated over
  the seat as in a squat. The root of its tail turns up a little (`studio.tailBind`), so that the
  tail clears the back edge of the higher seat and the feet, in place of the tail tip, stand on
  the floor. The fox thus sits a little lower, and its tail reaches a little farther back, so the
  layout (4.5) moves players in most demos.
- The Tripo fawn keeps the long legs of its mesh, with flat hooves, on the stool of the old deer
  (`seatWidth`). Its shins lean 35° forward, so that the seat is lower. Its short tail hangs behind
  the back edge of the seat. Reason: with vertical shins, the higher seat moved players of the
  layout, and the hooves reached fewer strings.
- The mouse, the beaver, and the monkey have no chair (`noChair`). Each keeps its seated pose at
  the seat height of its legs, with its feet on the floor. The Tripo mouse and the Tripo beaver
  bind standing on the legs of their sources, and the seat top is the lowest point of the body
  between the legs, behind the shins (the crotch of the mouse). The monkey stands erect, as a brass
  player does: its hips stand over its feet, its knees bend a little, and its shoulders stay over
  its hips. Its center of mass thus stays over the middle of its soles. As a soloist, it keeps
  this stance, because the straight legs of its sheet put the center of mass off the middle.
  It plays a smaller trumpet (`trumpetScale`), and in the play its spine turns a little back and
  its head stays upright (5.3), so the head stays over the chest and the hips. Reason: with the
  trumpet of the app, the arms reach the valves only with the trumpet far below the level, and
  its bell went behind the music stand.
- The hippo, the elephant, the badger, the rhino, and the penguin stand to play, in the standing
  pose of their meshes. The seat of the Tripo badger is the crotch between its legs
  (`seatWidth`), and the app builds no chair under it. The rhino stands as a real tubist on a strap does. The Tripo elephant
  binds standing on the straight legs of its source, as the Tripo monkey, and keeps this stance
  at its timpani. Its center of mass then lies over the middle of its soles. Its seat height is
  the height of the back of its haunch over the floor, and the app builds no chair under it.
- A seated body that also stands as a soloist (`soloist` of `ANIMALS`) keeps the leg shapes of
  its sheet pose (`standingBody()` of `models/studio-rig.ts`).

```typescript
/** The seat of a rig in the extras of its GLB file, in the units of the studio (`studio-body.ts`). */
interface SeatExtras {
  /** The seat of the app that takes its place: `chair`, or `bench` for the piano bench. */
  readonly prop: string;
  /** The height of the seat top: the lowest point of the body over the seat. */
  readonly top: number;
  /** The z of the front edge and of the back edge of the seat. */
  readonly front: number;
  readonly back: number;
  /** The half width of the seat on x, around the middle plane. */
  readonly halfWidth: number;
}
```

### Retarget and render

```text
 src/models/studio/<a>.ts: StudioBody (packed mesh, heads, palms, sheet arms)
        | studioRig() (models/studio-rig.ts)
        v
 StudioRig: the skeleton of the player (arms straight down), the constants of the arms
        |                                   |
 buildStudioBody(): the body in the         poseAt() pose of the player (5.1), each frame
 bind pose of the player, two bones of          |
 the player for each corner (footprints,        v
 hanging arms, tests)                       poseStudioBones(): the studio bones from the
                                            bones of the player, the corrective weights
                                                |
                                                v
                                            the scene: one SkinnedMesh, 4 bones and morph
                                            targets (scene/player.ts)
```

- **Retarget.** The app keeps its own motion (5.3, 5.4), so it drives the studio bones from the
  pose of the player in each frame. The skeleton of the player has each arm straight down,
  because the pose code reads a hanging arm in the bind pose (5.2). Each paw turns toward the
  forearm up to `PAW_TURN`, because the skin bends well only near its clips. A pose can give a
  paw its own turn (`pawTurnL`, `pawTurnR`, `pawBendR`). Each shape takes its weight from the pose
  alone (`raiseWeight()`), so the rule of stateless poses holds.
- **Render.** The fur gets smooth normals within the crease angle of the body (`crease` of
  `ANIMALS`, `studioNormals()`). A body can take its own angle, such as 180° for a Tripo body
  that shows the smooth shading of its source. The other bodies share one angle. A body can also
  blend its face colors (`colorBlend`), and no body of the app takes it. The colors hold the baked occlusion of the rig.
- **Bind mesh.** `buildStudioBody()` gives the mesh in the bind pose of the player, with two
  bones for each corner, for the footprints, the budgets, and the tests.
- **Recast role.** A role tool tests a body in a role that is not its own with a recast role
  `<role>@<species>` (`recastScene()` of `pose/test-scene.ts`). The species takes the seats and
  the instrument of the role in the test scenes only, and the cast of the app does not change.

### Clips

A clip of a person, such as a Mixamo animation, can move a player in a moment with no play: a
walk on, a bow, applause, or an idle. A clip cannot follow the notes, so the concert keeps
`poseAt()` (5.1). Only the gallery plays a clip now (`clip`, 7.1). Design 8.1 gives the license
rule of the Mixamo files.

```text
 Mixamo FBX or GLB file (outside git, 8.1)
   | pnpm mixamo-import (headless Blender: no prefix, meters, one animation for each take)
   v
 <dir>/<name>.glb --> readSourceFile() (models/source-clips.ts): the rest pose and the keys
   | retargetClip() (pose/retarget.ts), one time for each body, on clipTarget()
   v
 PlayerClip: the rotations of BONE_NAMES and the root offset at CLIP_RATE frames a second
   | clipPoseAt() (pose/clip-pose.ts), in each frame, with no state
   v
 AnimalPose --> poseStudioBones()
```

```typescript
/** A clip on the skeleton of a player: plain data that the clip layer reads with no state. */
interface PlayerClip {
  readonly name: string;
  /** The frames for each second (`CLIP_RATE`). */
  readonly rate: number;
  readonly frames: number;
  /** One quaternion for each bone of `BONE_NAMES` in each frame, relative to the parent. */
  readonly rotations: Float32Array;
  /** The offset of the root bone in each frame, in meters, in the model axes. */
  readonly rootOffsets: Float32Array;
  /** The depth of the lowest sole under the floor before the floor rule, in `H`. */
  readonly floorDepths: Float32Array;
}
```

- **Bone map.** `MIXAMO_BONES` gives the bone of the player of each Mixamo bone, or none. Of
  several bones that drive one bone, the last bone of the chain gives the turn: `spine` takes
  `Spine1`, and `chest` takes `Spine2`, which carries the arms and the neck. The roll of a Mixamo
  forearm turns its hand, and the turn of the hand reaches the twist bone (`TWIST_SHARE`). The
  four long fingers give one curl of the `fingers` block (`FINGER_CURL_SHARE`).
- **World turns.** A clip stores each turn relative to the T-pose of the source, so a rename of
  the bones alone does not work. The retarget reads the world turn of each source bone from its
  rest pose. Thus the rolls of the source bones do not matter.
- **Rest compensation.** Each limb bone of the player first turns from its bind pose to the
  direction of its source bone in the rest pose of the source: the hanging arm goes to the T-pose
  with the palm down, and a seated thigh goes down. The trunk, the head, and the feet keep their
  bind form, because both rest poses stand upright with the head forward and the feet flat. Thus
  each animal keeps its own lean.
- **Axes and size.** The left side of the source goes to -x, and its up to +y. The up of the
  source is the axis of the file nearest to the line from the hips to the head, because that line
  leans forward a little, and the floor rule then reads a forward walk as a rise. The source has
  no chin, so its `H` is its height over `HUMAN_HEADS`, the canon of figure drawing.
- **Hanging arm rule.** A human arm that hangs at the side goes straight down into the round
  trunk of an animal. Thus each arm bone blends its rest compensation toward the turn to the side
  arm of the body, by the share of the source arm that hangs (`HANG_FADE`, the angle of the line
  from the shoulder to the wrist). The side arm is the arm of `hangingArm()` (5.2) with no forward
  swing and no elbow bend: the smallest angle out to the side at which it clears the torso and
  the legs. The hanging arm of the source points straight down, so the source gives the swing and
  the elbow bend, and the arms hang along the sides. The full rest arm of 5.2 with the bend of the
  source held the forearms straight forward. A raised arm, a clap, and a T-pose keep the plain
  retarget.
- **Meeting paw rule.** The shoulders of an animal are wider in `H`, so the paws of a human clap
  stay apart. Thus a wrist near the middle plane of the source chest (`MEET_FADE`) keeps its
  distance from the plane in `H`, by a two-bone swing of the arm (`meetPaws()`).
- **Clearance rule.** The large head of an animal fills the place of a raised human hand, and its
  round trunk the place of a clap. Arms that reach in front of the chest (`FRONT_FADE`) first
  lift together about the side axis of the chest, up to `LIFT_LIMIT` (`liftArms()`). This turn
  keeps the distance of each wrist from the middle plane, so the paws of a clap meet above a round
  belly. Then each upper arm that is still in the body turns about the shoulder joint by the
  smallest turn that moves the deepest arm point out (`clearArms()`). The forearm and the paw keep
  their turns, so a wave still waves beside the head. The body of the rule is a stack of
  horizontal slices of each body bone, with a radius for each angle bin (`clipBody()`), one time
  for each body. The root of the upper arm lies in the shoulder in each pose, so the rule does not
  test it.
- **Walk rule.** A standing foot moves back under the hips by the turns of the leg, and these
  scale with the leg length. Thus the hips move across the floor by the ratio of the leg lengths,
  from the hip joint over the knee to the ankle, and a standing foot keeps its place. A move in
  `H` slid the short feet of the animals.
- **Floor rule.** The legs of an animal are shorter in `H` than human legs, so a move of the hips
  puts the soles under the floor or in the air. Thus the lowest sole of the player keeps the
  height of the lowest sole of the source, in `H` (`solePoints()`). A foot on the floor of the
  source stays on the floor, and a jump stays a jump.
- **Gallery.** The animals of a clip stand, and the bones of the instrument hide, because a clip
  cannot hold an instrument. The dev and preview servers serve the clip files from a local folder
  (`PAWCHESTRA_CLIPS`, `scratch/clips/` by default), so `dist/` gets no Mixamo file (8.1).
  `pnpm clip-views` shows a clip from the four sides, and measures the floor depth and the depth
  of each arm part in the body.
- **Models.** `pnpm mixamo-model` reads a Mixamo-rigged mesh, and writes the inputs of
  `pnpm rig-mesh`: the mesh alone as the source, the joints and the palm of the config, and a
  `paintedWeights` file from the skin. Mixamo has no twist bone, so the forearm weight moves to
  the twist bone along the forearm (`TWIST_RAMP`). Mixamo has no ears and no tail, so the rigger
  adds their joints. The rig then adds the eyes, the palms, and the seat.

## 4.5 Visual values

One world unit is one meter. The code files that each block names hold the values. The colors
come from samples of the reference images. Tune the light first, and change a base color only
when no light value can match the lit pixels of the reference.

**Colors**

- **Scene colors.** `SCENE_COLORS` of `models/colors.ts` (chairs, stands, sheets), `STAGE_COLORS` of
  `models/props.ts` (stage, risers, podium), and `HALL_COLORS` of `scene/hall.ts`. The hall is a
  dark, warm room. The stage is an amber wood with a tone for each plank and dark seams, and a baked
  light (`SIDE_GLOW`) keeps its sides from black. The chairs are a honey wood. The music stands are
  black with a warm gray desk, because black desks were the largest shapes of some close shots.
- **Species colors.** `SPECIES_COLORS` gives each species the fur, the belly, and the accent color.
  A studio body keeps the face colors of its rig (4.4). The UI seat dots read the fur color, and a
  color rule of a rig can move the fur toward it. All bead eyes are black with a light. A body that
  shows the eyes of its mesh takes the eye colors of its color map (4.4, "Hand rig").
- **Instrument colors.** `INSTRUMENT_COLORS`. The bowed strings are varnished wood with a lighter
  top and darker edges. The clarinet and the oboe are black lacquer with silver keys, the
  bassoon is a dark red maple, the flutes are silver, the brass is gold with lit bells and nickel
  silver trim, and the timpani are copper. The piano is a black polish with a gold
  plate, light steel strings, and copper bass strings in its open case (`PIANO_INSIDE`). The harp is varnished maple with a
  lighter soundboard, gilded parts, and red C strings and dark blue F strings. The timpani are a
  deep red-brown copper in a black frame with chrome lugs (`kettle`), because a lighter copper read
  as a peach plastic in the hall light. The heads of the timpani and the drums are a warm cream
  (`drumHead`), because a white head clipped to white. The drums are a red lacquered wood with chrome or wood
  hoops, the cymbals are bronze with darker lathe rings, and the xylophone is rosewood over
  aluminum tubes.

**Materials**

All meshes share the values of one `MeshStandardMaterial` with vertex colors and crease normals
(`models/shading.ts`), so each player has one material and one draw call. Each program variant
of the players (skin, morph count) gets its own copy of the material and a depth material
(`scene/variants.ts`), and the scene pass draws the players of one copy together. A pass draws a player only when its camera sees the sphere of the pose
(`scene/bounds.ts`). A frame poses only the players whose cull sphere meets the view of the camera
or of the key shadow, and hides the others (`scene/pose-cull.ts`, 9.7). The corners with the same values share one vertex, and the depth passes and
the shadow maps draw a depth geometry with only the positions, the skin, and the morph positions
(`scene/shared-corners.ts`). The GPU then skins each vertex one time in place of each corner, and
the pixels do not change. The stage computes the bone matrices from the pose with the products
of three.js in the same order, so each bit stays (`FrameSkeleton` of `scene/player.ts`). Each triangle has a finish (`FINISHES` of `models/mesh.ts`):

| Finish    | Parts                                                     | Intent                                                                |
| --------- | --------------------------------------------------------- | --------------------------------------------------------------------- |
| `matte`   | Cloth, raw wood, the stage, the props, and the bodies.    | No gloss. A studio body smooths the angles below its crease angle.    |
| `varnish` | The varnished wood of the bowed strings, the harp, the bassoon, the drums, and the xylophone. | A soft gloss.                                                         |
| `lacquer` | The black lacquer of the piano bench, the woodwinds, and the timpani frame, and the bead eyes. | A sharp gloss.                                                        |
| `metal`   | Brass, bronze, copper, chrome, nickel silver, and silver. | Sharp highlights, and a half metal look with the color of the metal.  |
| `eye`     | The eyeballs of a hand rig.                               | The gloss of `lacquer`, and the only finish that the eye light reaches. |
| `polish`  | The case, the lid, the desk, the legs, and the lyre of the grand piano. | A mirror gloss with a weak reflection. With the reflection of `lacquer`, the warm lamps turned the black case brown. |
| `string`  | The strings in the open piano.                            | The values of `metal`. A string thinner than a pixel fades toward the color of the plate below it (`STRING_FADE`), because the strings made a moiré at the pixel ratio 1. The plate shows between the strings, so the area is a little darker than the true mean. |
| `felt`    | The felt and the yarn heads of the mallets and the beater. | No gloss, as `matte`, with smooth normals. With `matte`, each face of a small round head shaded flat, and the head looked as a cut stone. |

Each finish also has a factor of the reflection of the environment (`reflection`). The red
channel of the finish table holds it, and the player shader scales the reflection by it
(`addFinishReflection()` of `scene/geometry.ts`). The hall is dark, so the physical reflection
of a polished finish showed almost nothing, and a full metalness looked black. With the factor,
the brass, the copper, the lacquer, and the string varnish show the warm lamps and the lit
stage. The fur stays matte with the factor 1.

The studio bodies smooth their fur, because their many small faces showed a crumpled pattern
under the hard key light.

A studio body can show a color map of its fur in place of its face colors (`StudioBody.texture`,
such as the Tripo rabbit). The module holds the image path and the texture point of each fur corner.
A player of such a body takes a copy of the shared material with the map
(`bodyMapMaterial()` of `scene/body-texture.ts`), and its geometry holds the points as `uv1`. The
shader takes the texel in place of the vertex color of each corner with a point, so the light,
the finish table, the fill, and the grade stay. The gloss nose, the whiskers, the bead eyes, and
the instrument keep their colors. The eyes of the mesh take the map with the `eye` finish, so the
stage lamps and the eye light give them a gloss over the painted eye. An eye with the paint of its
source and a painted light, as on the polar bear, takes `varnish` and no eye light. Their face color is the eye
color, for the frames before the map loads. The first draw starts the load of the image (7.2). Until the
image is on the GPU, the body shows its face colors.

The Tripo polar bear (`assets/models/polar-bear/tripo-hand/`) shows a map that
`tools/polar-bear-maps.py` makes from the map of its Tripo FBX. The cream fur goes to the white
of the main polar bear in the hall light (`FUR`), and the claws go dark (`CLAW`). Reason: the
Tripo map paints a tan bear with brown claws, and the hall view sets the target, as for the fox.
The painted brows keep half of their contrast to the fur (`soften_brows()`).
The Tripo wolf (`assets/models/wolf/tripo-hand/`) shows the map of its Tripo FBX at 2048 pixels
with no change of a color (`tools/wolf-maps.py`). Reason: the look target of this body is its
source FBX. The Tripo beagle of the dog (`assets/models/dog/tripo-hand/`) does the same with
`tools/dog-maps.py`, and the Tripo monkey (`assets/models/monkey/tripo-hand/`) with
`tools/monkey-maps.py`, for the same reason. The Tripo hippo (`assets/models/hippo/tripo-hand/`)
does the same with `tools/hippo-maps.py`, the Tripo pig (`assets/models/pig/tripo-hand/`) with
`tools/pig-maps.py`, the Tripo penguin (`assets/models/penguin/tripo-hand/`) with
`tools/penguin-maps.py`, the Tripo elephant (`assets/models/elephant/tripo-hand/`) with
`tools/elephant-maps.py`, and the Tripo fawn (`assets/models/deer/tripo-hand/`) with
`tools/deer-maps.py`.

A palette of the faces can have its own color map (`StudioTexture.palettes`), such as the map of
the tan fox. `tools/fox-maps.py` makes both maps of the fox from the source image. A species shows
the map of its palette (`studioBodyMap()`), and a palette with no map shows its face colors. Thus
the tan fox never shows the red map. The red map keeps the colors of the source and adds fur
strands (`STRANDS`, "Strand normals" below). The tan map
moves only the orange fur of the source, by one step of the lightness and the hue (`TAN_STEP`), and
the cream, the dark socks, the lines, and the eyes keep the colors of the source. Reason: the
source FBX is the look target, and the tan fox needs the smallest change that reads as tan.

Such a body also gets the fur shading of `scene/fur.ts` (`FUR_LOOK`), only on its fur faces: the
faces with texture points and the finish `matte`. The eyeballs, the gloss nose, and the `plain`
faces keep the shared shading.

- **Sheen.** The shader turns on the sheen lobe of three.js ("Charlie", Estevez and Kulla 2017),
  as velvet has it. It is strong where the view grazes the surface and weak where the surface
  faces the view, so the outline gets a soft light and the front keeps its shading. The lights
  of three.js give it with the pool of the stage lights. The rim lights are no lights of
  three.js, so the shader adds their sheen on each fur pixel. Thus the rim lights behind the
  orchestra give a warm light on the outline of the heads and the shoulders. A low roughness
  keeps the lobe near the outline. A higher roughness also lit the whole side of the body. The
  sheen falls with the luma of the fur below `fullLuma`, because dark fur passes less light. With
  the full sheen on all fur, the dark socks of the fox looked cream.
- **Strand normals.** A normal map beside the color map (`<name>-normal.webp`) tilts the normal
  of each fur pixel. The tangent frame comes from the screen derivatives of the view position and
  of the texture points, so the skin needs no tangents. The map uses the green of OpenGL, and
  the texture points have v from the top edge, so the y factor is negative. The web copy holds
  the tilts times `NORMAL_MAP_GAIN`, because the source tilts are near the step of 8 bits. The
  shader takes z = 1, because a stored z of 0 at a clipped tilt gave NaN pixels that the bloom
  spread into black squares. A body with no normal map file keeps the normals of its mesh. A map
  of a palette takes the normal map of the map of its body, because both have the same UVs and
  strands.
- **Added strands.** A source that paints its fur smooth, such as the Tripo fox, gets strands
  from its maps tool (`STRANDS` of `tools/fox-maps.py`): seeded noise, smeared along the faint
  strokes of the source, gives a small luma step in the color map and its slope in the normal
  map. Reason: with no strands in either map, the fox fur read as smooth plastic beside the
  other bodies. The strands of the fox and the rabbit are short, and their tilt and luma step
  are about half of those of the Tripo cat and wolf. Reason: one height gives both maps, so
  each dark groove of the color map is also a groove of the normals. With the strength and the
  length of the cat and the wolf, the fur read as carved wood or clay.

The fur of the Tripo rabbit is near the shoulder of the tone curve, so the sheen adds little
light at the outline. Its source paints the fur smooth, so its maps tool adds strands, as for the
fox.

The stage has its own wood material (`createStageMaterial()` of `scene/stage.ts`). A test of its
shader must not make a line thinner than one pixel inside a face. Reason: MSAA smooths only the
edges of the triangles, so such a line breaks into dashes that move with the camera. Thus:

- The baked light of the skirt and the lip (`SIDE_GLOW`) finds a plank by its face: a face that
  points up at y = 0. A test of y alone left a band of 2 mm on the outer face of the lip with no
  light.
- A point with no texel of the bake for its surface takes the rule of an overhang (no key light,
  half the sky), except on a slope of the lip. There it reads the bake 4 cm beside it. The inner
  bevel rises more across one texel than the height test allows, so thin lines of it found no
  texel and were dark.

**Light and render**

`scene/lights.ts` holds the lights, `scene/light-pool.ts` the pool, `models/beam.ts` and
`scene/beam.ts` the light places and the beams, and `scene/solo-light.ts` the solo light.

```text
          rim light (behind, high, no shadow) ── visible beam in the haze
                          │
   back   ┌───────────────v───────────────┐
          │   players: lit rims, shadows  │  shadows fall to the back right
          │     ◄ side light  side light ►│  (weak cross lights)
   front  └───────────────────────────────┘
                    ^
                    │ key light (front left, high, the only stage shadow)
                 audience and default camera
```

- **Key light** (`KEY_PLACE`). A warm `SpotLight` far in front of the stage, high and to the
  left, acts as the front light of a concert hall. The shadows fall back, beside the players in
  the default view. Each body keeps a lit side and a shade side. The intensity grows with the
  square of the distance, so each stage size gets the same light.
- **Shadow fit** (`SHADOW_FIT` of `shots/shadow-fit.ts`, `fitKeyShadow()`). The shadow map of the
  whole stage has texels of about 12 mm on a large stage, so a paw or a bow cast no shadow. A
  solo or a section shot fits the map to a sphere around the target of the shot, with a radius
  from the frame of the shot. The shadow camera looks at the sphere, and the light keeps its
  cone. The near plane of the stage keeps each caster between the light and the sphere. The
  sphere comes from the shot plan (`CameraPose.shadowFit`), so it is constant in a shot and the
  shadows do not swim. A blend of two shots holds both spheres. The blur radius gives an edge of
  `CLOSE_SHADOW_WIDTH`, so the shadows of a close shot are soft, and the normal bias is small.
  Outside the sphere, a player gets no shadow of the key light, and the shadow pass draws only
  the players in the view of the map. Thus the wide shots, the side shots (they show the back
  rows large), the conductor shots, a blend of the camera mode, and Free mode keep the map of the
  stage.
- **Rim lights** (`RIM_LIGHT`, `RIM_PLACE`). Warm spotlights far behind and high light the heads
  and the shoulders, so the players stand out of the dark hall. They cast no shadow, so the
  shadows keep one direction. The vertex shaders calculate them (`scene/rim-light.ts`), because a
  spotlight costs GPU time on each lit pixel (9.7). On the players, the rim light wraps a little
  past the edge of each body (`RIM_LIGHT.wrap`), because fur scatters the light under its tips,
  so a rim in a back light is a soft band. The stage gets no wrap. A thin ear passes a part of the
  rim light to its side away from the lamp, with a warm tint (`EAR_GLOW`), as the skin of a real
  ear glows in a back light. The vertex shader finds the ears by the skin weights of the bones
  `ear_L` and `ear_R`, so each studio body with ear bones gets the glow. The default camera
  stands in front, so each ear stands between a rim light and the camera.
- **Side and back-row lights** (`SIDE_LIGHT`, `BACK_ROW_LIGHT`). Weak cross lights from the
  front corners. They cast no shadow (2.6), so the key light alone casts the shadows. The
  back-row lights keep the back rows almost as bright as the front rows. These lights are a warm
  white, so white, gray, and purple fur keep their colors.
- **Pool** (`LIGHT_POOL`, `addLightPool()`). A factor in the shaders makes a pool on the
  conductor and the middle of the orchestra, because a separate light costs GPU time. A hot spot
  holds only the podium on the players, so the white fur of the front rows does not clip.
- **Eye light** (`EYE_LIGHT_LOOK`, `scene/eye-light.ts`). As the eye light of a film set, a lamp
  up and to the left of the camera gives each eyeball of a hand rig (the finish `eye`) a soft
  highlight. Only these pixels see it, and it follows the camera in each camera mode. The key light
  comes from the back, so the stage lamps give such an eye no clear highlight from the front or
  from the app camera.
  - The highlight is a GGX lobe scaled to 1 at its middle, so `strength` gives its light and
    `roughness` its size and its soft edge. It reads the normal of the true sphere of the ball,
    so it stays round on the few faces of a low-poly ball.
  - Its middle turns from the mirror direction toward the eye axis by `pull`. The eyes of a
    rabbit face about 50° to the side, and the mirror point of a front camera lies behind the
    socket rim. Thus the highlight moves a little with the view and stays in the open eye.
  - It fades from `fade[0]` to `fade[1]` off the eye axis, before the socket rim cuts it, and the
    pool scales it. The skin of the head moves the axis and the middle of each ball, which come
    from the eyeball triangles (`eyeBallsOf()`). The axis is their vector area, which is zero on
    a closed ball. Thus a hand rig deletes the back faces of a closed ball, deep in the head.
  - It adds only a highlight: the ball keeps the dark of the bead eyes. Each other body keeps its
    material (`eyeLightMaterial()` of `scene/player.ts`).
- **Beam** (`BEAM_LOOK`). The haze cone leans toward its rim light, which stands at the x of the
  beam, so the beam has a visible source and stands upright. The camera dims it in a close shot,
  because a near camera sees the additive haze as a veil over the image (5.6).
- **Beam in Free mode** (`freeBeamOpacity()`). The beam dims with the distance from the camera to
  the stage center over the range `FREE_BEAM_FADE`, down to `CLOSE_BEAM_OPACITY`. The fade is a
  smoothstep on the logarithm of the distance, because a wheel step multiplies the distance by a
  constant factor. Thus each step dims the beam by a small, almost equal amount, and the first
  steps from the default view keep the full beam. A short range removes the beam in two wheel
  steps.
- **Other terms.** Each layout bakes the soft key shadow on the stage one time
  (`scene/stage-bake.ts`), because the props and the stage do not move. A close shot adds a soft
  key and a kicker on the shade side of the subject (`scene/shot-light.ts`, 5.6). Room haze gives
  the back rows an aerial depth (`ROOM_HAZE`). A solo turns the key light, the pool, and the beams
  to the soloed players (`soloAim()`, 2.4). A captured cube of the lit hall gives the reflections
  (`captureEnvironmentSteps()`). Its diffuse light also lights each fold of a body that no lamp
  reaches: the neck below the head, the arm roots, the haunch, and the inner sides of the legs.
  With no environment light, each such fold is a black band, and the contact shade changes it
  little. Thus the gallery captures its lit floor too (7.1).
- **Tone.** AgX tone mapping, because ACES moved the dark wood to red. Its exposure (`STAGE_TONE`)
  keeps the lit floor and the white fur below the shoulder of the curve, so the stage does not
  look over-exposed. With reduced motion, the noise, the motes, and the grain stand still (2.5).

**Hall**

The concert hall (`HALL` of `scene/hall.ts`) scales with the stage side. The balcony rails carry
lamps all around. The low wall lamps skip the back (`HALL.wallLamps.backGap`), because lamps
there floated above the orchestra and near the title of the first screen (2.8). Each lamp has a
soft glow disc. The shell and the floor hold a baked light, because lights cost GPU time on large
surfaces.

**Post effects**

The scene renders into a target with MSAA, then the post effects make the image of the canvas
(`scene/post.ts`, `POST_LOOK`).

```text
scene ──> [scene target, MSAA] ──┬──> bloom down 1/2 ... ──> bloom up ──────────┐
                                 └──> blur prepare 1/2 ──> blur gather 1/2 ──┐  │
beam depth + hall ──> [depth 1/2] ──────────^ (only with a shallow focus)    v  v
          [scene target] ───────────────────────────────────────────────> final pass ──> canvas
beam depth ──> surface 1/2 ──> surface blur 1/2 ─────────────────────────────────^
```

- With no float target, the scene renders with no post effects. The bloom levels follow the tier
  (2.6).
- The depth of field is a thin lens focused on the nearer eye of the hero of the shot (5.6), at
  the view depth of the eye, or on the detail of an insert. The aperture follows the distance to
  the point that the camera looks at, and it closes for a far point, so the wide views stay sharp
  and skip the blur. Free mode has none.
- **Depth of the blur.** The blur reads a depth at half size with the hall, and the depth pass of
  the beam has no hall. A pass copies the depth of the beam pass to half size
  (`DEPTH_COPY_FRAGMENT`), and a draw of only the hall adds the hall. Thus each player and each
  prop draws its depth one time in each frame. On a flat face, the copy mixes the four depths
  around the pixel. At an outline, it takes the face of three of the four depths, else the
  nearest. The frames change only at some outline pixels, where a draw at half size had another
  face.
- **Mix of the blur.** The final pass mixes the sharp image and the soft image by the blur at full
  size: it reads the depth of the beam pass, with a tent over the pixel and its four neighbors
  (`softShareAt()`). Thus the outline of a sharp subject keeps the anti-alias of the MSAA. With
  the depth at half size, the outline showed steps of 2 pixels and a dotted dark line. The depth
  of the beam pass has no hall, so a pixel of the hall reads the depth at half size.
- The bloom keeps a small part of all light, as a diffusion filter, with a warm halation.
- **Lens fringe** (`LENS_FRINGE`). The final pass moves the red of the scene a little outward and
  the blue a little inward, with the square of the distance from the middle of the frame, as the
  lateral color of a real film lens. The middle of the frame stays sharp, so the faces do not
  change. The low tier skips it,
  because it costs two more samples of the scene for each pixel.
- **Contact shade** (`CONTACT_SHADE` of `scene/surface.ts`). A pass at half size reads the depth
  of the beam pass and finds the soft dark where two surfaces meet: under the feet, the chairs,
  and the stands, and in the crease between an arm and the trunk. The final pass multiplies the
  scene by it, before the haze, as the ambient occlusion of a film render. A sample counts only
  above a small angle over the face (`bias`), so the flat faces of a low-poly body stay clean.
  Each pixel turns its samples by a 4 × 4 pattern, and a blur of 4 × 4 pixels removes the
  pattern. The hall gets no shade, because the depth pass has no hall. The high tier reads the depth many times for each pixel at
  half size (`TIER_SETTINGS.high.contactSamples`). Without the shade, the medium tier of a phone
  looked flat, so it has a cheap shade: a quarter size and fewer samples (`surfaceLevel`,
  `contactSamples`). It reads the depth about 15% as often as the high tier. The
  blur of 4 × 4 pixels at a quarter size is wider, which a soft contact shade permits. The low
  tier has none (2.6).
- **Floor gloss** (`FLOOR_GLOSS` of `scene/surface.ts`). The same pass traces each pixel of the
  stage top along its mirror ray through the depth. The thickness of a surface follows the step
  of the ray, so that a ray that passes behind a thin leg goes on and draws no streak. The hit
  reads the mean of a small box of the scene color, so that one bright pixel does not sparkle.
  The ray takes a jitter in a small cone. A blur in two passes, along the rows and then along the
  columns, joins the rays of a wide tent, so the reflection is soft. Then the hit or the miss of
  one ray, as the camera moves, changes only a faint soft spot. The tent gives each value of the
  jitter pattern the same weight, so the pattern does not show. The blur takes only the
  floor pixels, and the final pass adds the reflection only where the depth at full size is on
  the floor, so that it does not spread onto the feet and the chair legs. The jitter is fixed on
  the screen and the pass keeps no history, so a still camera shows a still reflection, and a
  seek or a cut needs no reset. The Fresnel term of the lacquer makes the reflection stronger at
  a flat angle. It fades along the ray and at the frame edges. The physical reflection of the
  lacquer did not show on the dark players, so a factor makes it visible. A planar reflection
  renders the scene again, which costs too much time on the main thread and the GPU (9.7). Only
  the high tier has it (2.6).
- **Streaks.** The app has no anamorphic streaks. Only the hall lamps pass the bloom threshold,
  and the shots do not show them, so a streak pass showed nothing in the shots and cost GPU time.
- The final pass does the tone mapping, a grade (`gradeColor()`, `GRADE` of `scene/grade.ts`), a
  vignette, and a grain. `pnpm look-lab` fits the grade to `orchestra-latest.png`. The curve
  keeps the soft shoulder of AgX, because a steep shoulder clipped the floor and the white fur.
- **Letterbox** (2.5). Each target keeps the size of the canvas, and a scissor limits each pass to
  the letterbox (`cropTarget()` of `scene/letterbox.ts`): the scene pass, its MSAA resolve, the
  depth passes, the bloom, and the blur. Each sample stays in the written part of its source
  (`SOURCE_CLAMP` of `scene/post-shaders.ts`), and the final pass writes the black bars with no
  sample. Thus no pass renders the scene under the bars, and the move of the bars allocates no
  target. A canvas of the size of the letterbox would allocate each target again in each frame of
  the move. The blur of the depth of field is a part of the height of the letterbox.
- **Vignette.** Free mode has a round vignette from the middle of the canvas (`POST_LOOK`). It
  darkens the middle of the top edge by only about 12%, where the hall is dark already. The
  letterbox has an oval vignette with the shape of the frame (`FRAME_VIGNETTE`), so that the top
  and the bottom edges darken as much as the sides, and the vignette shows on the lit stage. A
  close shot gets the stronger vignette of `SHOT_LOOK`, and the letterbox takes the same ratio as
  a boost (`vignetteOf()` of `scene/stage-scene.ts`).

**Camera**

`shots/view.ts` holds the field of view (30°), the default view, the screen rules, and the orbit
limits. `shots/frame.ts` holds the frame.

- The default view stands on the audience axis behind the conductor, as `orchestra-latest.png`,
  and looks down at `DEFAULT_ELEVATION` at `DEFAULT_TARGET`. It looks a little less steeply down
  than the image. This product choice wins over the image. The wide shots of 5.6 look at the same
  target, and Free mode turns around it (2.5).
- The default distance (`DEFAULT_DISTANCE_IN_SIDES × S`) is the unit of the wide shots, the
  planner, and the beam fade. A portrait viewport gets a lower and more frontal view
  (`PORTRAIT_RULE`). Each player stays whole in each wide shot (`wideView()`), and the frame
  centers on the free area of 2.8 (`viewFrame()`).
- In Cinematic mode, `setViewOffset()` puts the image of the camera into the letterbox of 2.5,
  with the aspect `CINEMA_ASPECT`. The canvas keeps the size of the window.

**Supports.** The players of the timpani, the percussion, the contrabass, the tuba, the choir,
and the conductor stand. The soloist of 3.8 also stands when it plays the violin, the viola, the
flute, the oboe, the clarinet, the horn, the trumpet, or the trombone, as in a concerto
(`supportOf()` of `models/player.ts`).

**Props and stage**

`models/props.ts` holds the chairs, the stools, the music stands, and the choir risers.
`models/stage.ts` holds the stage, the podium, and the conductor stand.

| Item            | Rules                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| Chair           | A level seat, two back posts, one wide top rail, and four legs (`CHAIR`). It fits the body (4.4, seat).   |
| Stool           | For the harp, with no back (`STOOL`). It fits the legs, so the knees and the hooves stay out of it.       |
| Piano bench     | A padded seat with four tapered legs (`PIANO_BENCH`), as in `polar-bear-views.png`. It fits the legs and holds the whole haunch. |
| Music stand     | A tripod and a tilted desk with a sheet (`MUSIC_STAND`), below the eyes of its players.                   |
| Sheet music     | Staff lines, bar lines, and notes on each stand sheet, the sheet on each piano desk, and each page of the conductor score (`SHEET_PRINT` of `scene/sheets.ts`). |
| Podium          | A box with cut corners and framed panels (`PODIUM_SIZE`, `PODIUM_TRIM`), as in `bear-views.png`.          |
| Conductor stand | A desk on a post in front of the podium (`CONDUCTOR_STAND`), with its top edge at the bear shoulders.     |
| Stage           | A slab of side `S` with cut corners (`STAGE_CORNER_CUT`), a raised lip (`STAGE_LIP`), and lacquered planks. |
| Choir risers    | Up to three arc levels behind the orchestra, and a curved stair at each side end (`RISER`).              |

The props give the sheets as plain corners (`buildSheets()` of `models/stage.ts`). The piano does
not move in a pose, so the sheet of its desk (`pianoSheetCorners()`) stays at its place in the bind
pose of the pianist. The scene draws the music into one canvas texture of 256 pixels at start,
with no file, and lays it on the white sheets with a polygon offset. The lines fade to gray with the mip levels at a distance, so they
make no moiré. Reason: the close shots showed the sheets as blank white quads.

**Choir risers.** The risers follow real choral risers and stage stairs (`buildRisers()`):

- Each level is a tread of boards with a lighter nosing lip that passes the riser face below it,
  as the nosing of a stair tread [IBC 1011.5]. A riser face of darker wood joins two levels.
- The front of the lowest level and the back of the top level are dark skirt faces. A groove at
  each joint of the arc faces copies the panels of the stage skirt, so the risers sit on the stage.
- A curved stair at each side end of the lowest level wraps around the end of the arc, as the end
  stair of a curved choral riser (`riserStair()`, `RISER.stairs`). Each step is a wedge of an
  annulus around the podium center, at the front of the level. The steps continue the arc past
  the end and go down to the stage top. The singers use the higher levels as steps.
- Each step has a tread with a lighter nosing, a riser face of darker wood, and dark skirt faces
  at its front and its back, as the levels.
- A step rises at most 8 in, as a Wenger Signature riser step [Wenger Signature] and a StageRight
  stair [StageRight stairs]. The steps divide the height of the level evenly. The tread is 11 in,
  as a Wenger stairway [Wenger stairway] and the least tread of [IBC 1011.5].
- The obstacle of the lowest level holds one arc block for each step. Thus the fit of the choir,
  the stage size, and the wing of the risers keep the stairs clear of the other items.
- The risers and the stairs have no guard rails and no hand rails.
- The treads keep the wood of the reference images in place of the gray carpet of a Wenger riser.

Sources: [Wenger Signature](https://www.wengercorp.com/Lit/Wenger_Signature%20Choral%20Riser_TS.pdf),
[Wenger stairway](https://shop.wengercorp.com/education/fixed-height-stairway.html),
[StageRight stairs](https://performance.stageright.com/products/accessories/stairs/basic-stairs/),
[IBC 1011.5](https://codes.iccsafe.org/s/IBC2018/chapter-10-means-of-egress/IBC2018-Ch10-Sec1011.5.2).

**Stage origin**

The world origin is the stage center, on the top of the stage. The axes are the right-handed
axes of Three.js: +x points to the right as the audience sees it, +y points up, and +z points to
the audience (the front).

1. Place the soloist, then the seats in arcs around the podium center.
2. Calculate the half width `L`: the largest `|x|` of a seat or a footprint, plus a chair and a
   margin.
3. Set the front distance `F` from the front edge to the podium center (`PODIUM_FROM_FRONT`).
4. Calculate the depth `D`: `F`, plus the largest distance of a seat behind the podium, plus a
   chair and a margin.
5. The stage side is `S = max(5, 2 × L, D)`. Any extra depth goes to the back.
6. Spread the instrumental rows inside the stage, then place them for the sight lines (seat
   geometry). `S` does not change.
7. Move all items so that the stage center is the origin.

**Seat geometry**

The seats stand in arcs around the podium center (`models/layout-scene.ts`), and all players
face the podium, except the pianist. An angle of 0° points from the podium to the back (-z), and
negative angles are on the left. A seat at the angle `a` and the radius `r` is at
`podium + (r × sin a, 0, -r × cos a)`.

- A seated player uses at least `SEATED_ARC`, and neighbors keep `FOOTPRINT_GAP` between their
  footprints. Two string players share one stand (`STAND_DISTANCE`). Each wind player has a
  stand.
- Rows 0 and 1 hold the strings: the violins left of 0°, the violas and the cellos right of it,
  so no string player sits behind the conductor. The other rows are centered on 0° and span at
  most 160°.
- Each row stands at least `ROW_STEP` behind the row in front, and then moves back until its
  footprints clear the items in front. A player behind a piano case keeps `PIANO_REACH_GAP`,
  because it reaches toward the case in play.
- The choir risers stand behind the last row, each level higher, so the back row hides no singer.
- After the stage size, each row spreads to the side edges (`SPREAD_LIMITS`), because the packed
  rows left the front corners empty. Then row 0 widens the gap of the conductor
  (`CONDUCTOR_GAPS`): the inner first desk of each side moves out to the angle of the gap, or to
  the largest angle below it that fits, and its outer neighbors keep their packed arcs. Then row 1
  moves its back desks toward their first desks, as the wedges of a professional orchestra.
- Row 1 reserves the band of its items over the whole arc (`backDeskBand()`): from the lip in front
  of its stands to the back of its chairs. The other rows keep their gaps from the band, so that
  the back desks can move along the arc after the spread. The band gives fewer blocked players
  than no band, and the other rows have no band, so that the stage stays small.
- **Sight lines.** After the spread and the wedges, each player sees the head and the baton paw of
  the conductor (`CONDUCTOR_SIGHT` of `models/sight.ts`). The points cover the parts of the posed conductor that the
  `sight-lines` probe measures: a grid on the head with its front and its back, the baton paw with
  the baton, and the left paw. The lines go from the eyes of the player to the points, against the
  triangles of the player meshes of the rows in front (a box tree of each model) and the boxes of
  the stands. The boxes of a footprint are too large for this test, because a box
  of a head band holds the ears and the whole head. A player is blocked when an item hides one
  head point or one baton point. A music stand hides only the head, and the own stand of the
  player counts. The instrument rows stand on the stage floor. Only the choir stands on risers.
  The layout clears the sight lines by the seat places only. The eyes of the bear are only about
  0.1 m above the heads of the seated strings, so a player behind them sees the conductor only
  through a gap. From the front row to the back row:
  - A search moves the players of the row along the arc, up to `CONDUCTOR_SIGHT.nudge`, with the
    fewest blocked players, then the fewest players with no sight of the left paw, then the
    smallest moves (`sightCost()`). Among blocked places, it takes the place with the least
    hidden. Neighbors keep their packed arcs, and the outer players keep the edges of the spread.
    Two neighbors of one seat stay together as a section (`seatBonds()`): their arc stays at
    most `SPREAD_LIMITS.maxArc`, or their packed arc or their arc after the spread when one of
    these is longer. Reason: with no limit, the search moved the inner one of two horns to the
    gap of the conductor, 2.9 m from its partner at the edge of the spread.
    The strings keep the gap of the conductor: the back desks of row 1 stay at least as far from
    0° as the inner first desks. When the angles of the search do not fit, the search runs again
    and skips each angle at which a player or its own stand does not fit (`fitsAt()`). From row
    2, the view of the audience (`AUDIENCE`) also counts in the cost, because a small animal
    behind the strings can hide in the low wide shots of Cinematic.
  - **First desks.** The spread gives each gap of row 0 the same arc, but a desk of two partners
    fits into the gap between two first desk players only when the gap is a little larger. When a
    back desk player stays blocked, a greedy search moves runs of row 0 players next to it (the
    player alone, with one neighbor, or with all players to the inside or to the outside) by 1°
    steps (`FRONT_MOVES`), and keeps the move with the lowest cost of row 1. A move keeps the
    packed arcs, the arcs of the seats (`seatBonds()`), the gap of the conductor of the spread row 0, the stage, the gaps to the other items, and the
    sight of row 0 past the soloists. Real back desks also sit behind the gaps of the desks in
    front.
  - **Open gap.** On a small stage, one side of row 1 can have no free arc, for
    example six violin back desks beside a keyboard at the front left. When a back desk player
    still loses `OPEN_GAP_HIDDEN` of the head and the baton paw, row 1 searches again with the
    gap open: its inner players can pass 0°, up to the packed arc from the inner player of the
    other side, and the view of the audience counts in the cost. The row keeps this search only
    when it has fewer blocked players. A player that sees most of the conductor keeps its desk,
    so the desks do not move into the gap for a small fault.
  - **Gap of the conductor.** The layout runs the spread and the sight pass with each gap of
    `CONDUCTOR_GAPS`, and keeps the gap with the fewest blocked players. The best gap depends on
    the score, because a keyboard or many first desks on one side leave less room.
  - **Lanes.** The sight pass places one row at a time, so it cannot keep a lane open for a row
    behind. After the pass, a joint search moves the players of all rows (`laneSearchSteps()`).
    For each blocked player from row 1, from the front, it tries runs of the items that hide the
    conductor from it and of the player itself: the player alone, with one neighbor, or with all
    players to the inside or to the outside on its side. Each run moves by 1° steps up to
    `LANES.reach`. A move keeps the packed arcs, arcs of at most 1.6 m or the arc after the pass,
    the spread angles of the outer players, the gap of the conductor, the back desks outside it,
    the stage, and the gaps to the other items. It must lower the cost of the blocked player and
    the sum of the costs of all players (`sightCost()`, with the view of the audience from row 2).
    Thus a back desk of the violas can leave the gap of row 0 that a trumpet looks through, and
    take a free gap farther out. The search runs only on the gap of the conductor that the sight
    pass chose, because a search for each gap takes too much time.
  - The choir risers then rise together, up to `CHOIR_LIFT.highest`, until each singer sees the
    conductor.
  - The count of blocked players is a report. No round has a goal count. A seat fix adds no
    riser under an instrument row, opens no empty center, and keeps the stage size and the
    podium height. Show the overview of the stage before a merge of a seat change.
  - `pnpm sight-lines` measures the result on the meshes of all demos. A few players behind the
    strings stay blocked, most of them horns and percussion on the left of rows 3 and 4. Four
    first desk players on each side of row 0 at their packed arcs keep the gap of the conductor
    at about ±30°, and the back desks of row 1 sit in all the other gaps of row 0 on the left.
    Thus a player on the left behind the strings sees the conductor only through the gap of the
    conductor. A larger radius of row 0 would widen the gap, but the stages of these demos fill
    their depth, so it would make the stage larger.
  - Two other seatings clear no more sight lines, so the rows keep the order of the table. A
    first desk of row 0 in row 1 opens row 0, but row 1 then fills the left side and one back
    desk moves into the gap of the conductor. Horns on the right of row 3, with the other brass
    and the percussion moved to keep the sections together, only move the block from the horns
    to the trumpets. They also hide more bassoons from the wide shots.

```typescript
/** The limits of the spread of a row. */
interface SpreadLimits {
  /** The largest angle of a seat from 0°, in radians: 90°. */
  readonly maxAngle: number;
  /** The largest arc between two neighbors of a row, in meters: 1.6. */
  readonly maxArc: number;
}
```

The **footprint** of a player is one box for the parts of each bone in each band of height, in
the bind pose, and the box of its seat. A bowed string, its bow, and each wind count a simple
model (`InstrumentPiece.footprint`), so the detail of the model does not move the seats.

| Row | Sections, from left to right                                                   |
| --- | ------------------------------------------------------------------------------ |
| 0   | the first desks of: first violins, other violins, violas, cellos               |
| 1   | the other desks of: first violins, other violins, violas, cellos               |
| 2   | a keyboard of the orchestra (4.2), harp, flutes, oboes                         |
| 3   | horns, clarinets, bassoons, trumpets                                           |
| 4   | percussion, contrabasses, timpani, trombones, tuba                             |
| 5   | choir, on the risers                                                           |

**Soloist.** The soloist of 3.8 stands at the front left of the conductor (`SOLOIST_PLACE`) and
turns to the conductor (`SOLOIST_FACING`), so the default view sees its face. A piano soloist
sits at `PIANO_CENTER` and faces the conductor, so the lid opens to the audience. With no
soloist, the first keyboard of the orchestra sits there too (4.2). A keyboard of
the orchestra turns a quarter turn, so that its case lies along row 2.

**Chamber group** (`CHAMBER`). The players of an arc stand in one row around the podium center
and face the center. A solo player stands at the middle. In a recital, the partner stands at the
curved side of the piano and turns a little to the pianist.

## 4.6 Model inventory

Each body is a module of `src/models/studio/` (4.4). The instruments are in
`models/instruments/`.

| Section    | Species         | Body file             | Support         |
| ---------- | --------------- | --------------------- | --------------- |
| violin     | rabbit, red fox | `rabbit.ts`, `fox.ts` | chair           |
| viola      | cat             | `cat.ts`              | chair           |
| cello      | dog             | `dog.ts`              | chair           |
| contrabass | hippo           | `hippo.ts`            | stands          |
| harp       | deer            | `deer.ts`             | stool           |
| piano      | polar bear      | `polar-bear.ts`       | bench           |
| flute      | tan fox         | `fox.ts`, tan palette | chair           |
| oboe       | mouse           | `mouse.ts`            | no chair        |
| clarinet   | wolf            | `wolf.ts`             | chair           |
| bassoon    | beaver          | `beaver.ts`           | no chair        |
| horn       | pig             | `pig.ts`              | chair           |
| trumpet    | monkey          | `monkey.ts`           | no chair        |
| trombone   | panda           | `panda.ts`            | chair           |
| tuba       | rhino           | `rhino.ts`            | stands          |
| timpani    | elephant        | `elephant.ts`         | stands          |
| percussion | badger          | `badger.ts`           | stands          |
| choir      | penguin         | `penguin.ts`          | stands on riser |
| conductor  | bear            | `bear.ts`             | stands, podium  |

`castScore(score)` of `models/cast.ts` gives each player its species (4.3), its instrument, and
its support. A drum player gets the instrument of the first key group that it plays, in the
order of 3.8. The kettle count comes from the highest note of the timpani seat.

```typescript
/** The species and the instrument of one player. */
interface PlayerCast {
  /** The index of the seat in `Score.seats`. */
  seatIndex: number;
  /** 0 is the principal player of the seat. */
  player: number;
  species: SpeciesId;
  instrument: InstrumentId;
  /** The kettle count of the timpani. The other instruments ignore it. */
  kettles: 2 | 3 | 4;
  /** The support of the player. The soloist of a wind or of a violin stands (4.5). */
  support: Support;
}

/** Pure. One entry for each player, in the order of `ScenePose.players` (5.1). */
declare function castScore(score: Score): PlayerCast[];
```

### Sizes and holds

The instruments follow the reference images, and their sizes fit the animals. The chairs, the
stands, and the podium keep their sizes in meters. The arms of each body keep their chosen
length, and a species with short arms plays a smaller instrument (`SCALED_INSTRUMENTS`, the scale
fields of `SpeciesParams`), as a child plays a fractional violin or a small lever harp. A smaller
instrument shrinks toward the mouth or the base, so the mouth keeps its place. A violin shop
sizes a violin so that, with the left arm extended, the scroll lies in the middle of the palm
(`pnpm hold-reach`). The rabbit violin and the cat viola are larger than this rule gives, near the
smallest real sizes, and the arms keep their length. The left paw then stops the strings only on
the part of the fingerboard that it reaches (`BowedRig.stopRange`), as a player in a high
position, the scroll stands out past the paw, and the bow plays only the part of the hair that
the right arm reaches (`BowedRig.bowRange`). Reason: at the size of the rule, the instrument read
as a toy under the paws in the hall view. The cello rule (`celloRule()` of `tools/cello-size.ts`) sizes a cello as a
cellist does: the largest cello at which the left paw reaches the first position with the elbow
bent to at most `CELLO_ELBOW`, the end pin fits the chest, and the lower bout is not below the
knees, clamped to the real sizes (`REAL_CELLOS`, from a 1/10 to a 4/4). The cast matrix gives
this size to a recast cellist, and a new cellist species takes it as its `celloScale`. The reach
limit of the Tripo beagle fails at each size, so the rule gives it the clamp. Its cello keeps the
share of the body that the clamp has at the H of the dog of main, because the body scales to a
larger H (4.4), and the scroll must stay beside the left ear (`celloScale` of the dog). Each cello
gets the end pin of its body (`celloPinOf()`), so that the top of its back rests on the chest at
the lean of `CELLO_PLACE`, as a cellist sets the end pin.

The size rule of the winds (`windRule()` of `tools/wind-size.ts`) sizes a trumpet, a clarinet, or
a flute for the arms: the largest size at which each palm reaches its grip in the playing pose
with at most `WIND_REACH_SHARE` of the arm, so that each elbow keeps a bend, as the monkey at its
trumpet. The size stays between the smallest real instrument with the same hold and fingering (a
pocket trumpet, an E-flat clarinet, a piccolo) and the size of the app (`REAL_WIND_SIZES`), because
a player with long arms bends the elbows more and plays the standard instrument. When no real size
passes, the rule takes the real size with the nearest grips. The cast matrix gives this size to a
recast wind player. A smaller wind does not bring a mouth that is far in front of the shoulders
nearer, so a long muzzle or a deep body still misses its grips at the smallest size.

The hold gives the place of each piece in the bind pose of 4.7, in the axes of the model: the
player faces -z, and its left is -x. An offset in `H` uses the head height of the player. Where
the body sets the hold, the instrument fits the body, as the table names.

| Instrument | Model and hold |
| --- | --- |
| Violin, viola | An arched body with f-holes, a scroll, a bridge, four strings, a chin rest, a shoulder rest, and a bow. Under the chin on the left shoulder. The shared violin hold places the violin on the left collarbone from the body (5.3). The cat plays a small viola near the neck. |
| Cello, contrabass | The violin form with an end pin of a thin steel rod and a round rubber tip (`celloPinOf()`, `endPinLength()`, `END_PIN`). The cello leans back between the knees, at a place from the body (5.3). The contrabass has sloped shoulders and machine heads, and stands upright at the left side of the standing hippo, in front of its belly, at a place from the body (5.3). The hippo plays a smaller contrabass (`bassScale`) on a short end pin (`BASS_END_PIN`), so that the upper bout stands below the left shoulder and the left arm passes over it. |
| Harp | The base on the floor with the pedals at the hooves, in front of the chest, and the top of the soundbox against the chest, in front of and below the right shoulder. The deer plays a harp of 0.975 (`harpScale`), upright, diagonal, and as near to the stool as the chest lets it (`HARP_PLACE`). The right arm passes outside the top of the soundbox with the elbow up. Reason for the size: a smaller harp read as the harp of a child. Reason for the place: at the right of the chest, the shortest treble strings of a harp larger than 0.85 stand beside the right shoulder, so the right upper arm goes through them. |
| Piano | Larger than a real grand piano (`PIANO_SCALE`), on longer legs (`PIANO_LIFT`), so the forearms of the polar bear are almost level with the keys. The keys stand in front of its belly (`PIANO_FRONT_H`). |
| Flute, oboe, clarinet, bassoon | The lip plate, the reed, or the mouthpiece at the mouth. The flute points to the right, and the bassoon crosses the body to the left. The shared flute and clarinet holds take their arms from the body (5.3). The mouse plays a smaller oboe (`oboeScale`), and its shoulders turn forward, so that the short arms of its source reach the grips (5.3). A recast flute or clarinet takes the size rule of the winds. |
| Horn, trumpet, trombone, tuba | The mouthpiece at the mouth. The coil of the horn stands in front of the right side of the chest, and its bell opens back and to the right beside the belly (`HORN_PLANE`). The monkey plays a smaller trumpet (`trumpetScale`), and the rhino has a longer lead pipe (`tubaPipe`). A recast trumpet takes the size rule of the winds. A smaller trumpet or trombone keeps the footprint of the instrument of the app, so that no seat moves. |
| Timpani | Kettles of the real size in an arc. The kettles of the elephant move to its short arms, with a gap for its trunk (`TIMPANI`). |
| Percussion | Drums, a xylophone, a triangle, and a tambourine within the reach of the badger, and a suspended cymbal (`cymbalForm`, `SUSPENDED_CYMBAL`). The bass drum has the size of a person-sized drum at the scale of the badger crown (`BADGER_SCALE`), so it follows the body. Its beater keeps the real length in front of the grip, as the snare sticks (`BASS_DRUM.mallet`), because a beater at the scale looked as a ball on the fist. The xylophone bars stand below the shoulder joints of the badger (`XYLOPHONE.barHeight`). The section "Percussion" below gives their parts. |
| Choir folder | In both flippers, in front of the chest (`CHOIR_FOLDER`). |
| Baton | The butt in the heel of the palm, and the stick out through the palm under the curled claws, turned toward the thumb, as a conductor holds it with the butt against the palm (`BATON_GRIP`, `BATON_ALONG`). |

Each mallet, stick, and beater slants down toward the line of the forearm, as a real player holds
the shaft along the thumb (`malletTilt`). Each shaft of the badger but the triangle beater takes
one angle (`PAW_TILT`), so that it crosses the palm under the curled claws and leaves the fist at
the thumb side. The triangle beater slants a little less (`TRIANGLE.malletTilt`), and the claws
also close on it. The left grip of the elephant lies nearer to the wrist than the right grip
(`TIMPANI.malletSpotL`), so that the end of each stump closes on its shaft. The paw holds each snare stick one third up from the
butt (`SNARE_DRUM.malletButt`), as a real player holds the fulcrum, and keeps the full length in
front of the grip (`SNARE_DRUM.stick`), because the short arms reach the head only with it. No
vertex of a player is below the floor.

**Bowed strings** (`models/instruments/strings.ts`). The strings stay at one height over the
board (`VIOLIN`), because the holds and the play targets read that height. The neck under the
first positions is open below the board (`NECK_OPEN`), so the left paw of the hippo does not go
through it. The chin rest of the violin and the viola is at the left of the tailpiece, on the side
of the G string (`CHIN_REST`), because a violinist rests the left side of the jaw on it. The
shoulder rest is a bent bar under the back of the lower bout, with a foot on each rib
(`SHOULDER_REST`), because a violinist holds the instrument between the chin rest and the shoulder
rest. Its high end is on the side of the E string, because the left shoulder and the upper arm
lie under that side in the hold. The strings of the violin and the viola have a triangle section
(`STRING_SECTION`), because they are about 1 mm thick on the stage, so the shoulder rest fits in
the triangle budget. The layout reads a simple box of each bowed string (`addLayoutSpace()`), so a
change of the detail does not move the seats. The parts follow a real instrument, and the points
that the holds read stay: the nut, the bridge, the strings, the bow contact, and the end pin.

- **Body.** A smooth curve through the points of the outline gives the upper bout, the C-bouts,
  and the lower bout (`VIOLIN_OUTLINE`, `BASS_OUTLINE`, `smoothHalf()`). The tip of each corner
  stays sharp. The cello and the contrabass have more points than the violin (`OUTLINE_POINTS`),
  because they are large in the close shots. The top and the back rise in an arch of several
  levels to a flat middle under the bridge (`TOP_LEVELS`). The contrabass has a flat back with a
  break near the neck (`BASS_BREAK`). The curve and the arches stay inside the earlier outline of
  straight segments, except near the two ends of the outline. Reason: a curve through the points
  of the earlier outline put the paws of the hippo deeper into the contrabass.
- **Head.** The pegbox is hollow, with a dark open slot (`PEGBOX`). The ebony pegs cross the slot,
  with a collar and a round thumb piece (`PEG_PROFILE`). The contrabass has brass machine heads: a
  plate on each side, keys with an oval paddle, and a roller across the slot for each string
  (`MACHINES`).
- **Tail end.** The ebony tailpiece has a round top end (`TAILPIECE`), and an ebony saddle lies on
  the edge of the top. On the cello and the contrabass, a tailgut goes over the saddle to the end
  pin holder (`TAIL_END`). The cello has four silver fine tuners (`FINE_TUNERS`). The cello and
  the contrabass have light metal strings.
- **End pin.** A thin steel rod with a round black rubber tip, and an ebony holder with a silver
  ring at the tail end (`END_PIN`). Each ring of the tip stands high enough over the floor point,
  so that no point of the tip goes below the floor at the lean of the cello.
- **Depth.** No two faces that face the same way lie close over each other, as on the piano. The
  slot of the pegbox is a hollow with its floor far below the walls. The f-holes are the only
  marks on a face, and they lie `F_HOLE.lift` above the arch.

**Piano** (`models/instruments/piano.ts`). A concert grand: 88 separate keys, a lyre, and three
brass pedals in the sizes of a real grand piano (`PIANO_PEDALS`). The lift raises the case, the
keys, the lid, and the bar of the lyre, and the pedals stay on the floor. Each key turns down with
its notes (`PIANO.keyDip`), and the damper pedal goes down under the right foot (5.3). The parts
follow a real grand:

- **Case.** The plan has a straight bass side at the left of the player, a short straight treble
  side, a bent side in an S curve, and a round tail (`CASE_PLAN`). A smooth curve through its
  points gives a round rim with no facets. The rim wall has one thickness (`PIANO_INSIDE.rim`) and
  is open at the front between its two arms.
- **Inside.** A gold plate covers the soundboard to a narrow band at the rim, with a row of round
  holes through it. Two rows of tuning pins stand on its front. Thin steel strings run from the pins back to
  the edge of the plate, and the copper bass strings fan out over them to the tail, as the
  overstrung bass. A row of dampers lies on the strings behind the desk, and the highest strings
  have none (`PIANO_INSIDE`).
- **Front.** A cheek block closes each end of the keys, a key slip runs in front of them, and the
  open fallboard stands over their back ends. The music desk stands on a rail on the front of the
  rim, just behind the fallboard, and leans back with a ledge for the music (`PIANO_FRONT`). The
  sheet music lies in a frame of the desk, and the scene prints music on it, as on the stands.
- **Lid.** The lid has the outline of the rim and closes onto it. It hinges on the bass side, and
  its front flap lies folded back on it, so the desk stands in front of the lid. The prop stick
  stands on the rim of the bent side near the front and holds the lid near its edge (`PIANO_LID`).
- **Legs and lyre.** Three legs taper down to a wider foot (`PIANO_LEGS`). The lyre has two flat
  posts, the rod of the sostenuto pedal between them, and two braces back to the case.
- **Depth.** Two faces that face the same way and cover each other lie at least 2 cm apart, or
  the hidden face is not there (`PIANO_INSIDE`). Reason: the far hall camera has a near plane of
  0.1 m and a 24-bit depth buffer, so its depth steps are some millimeters. Faces nearer than that
  flashed, such as the pin block in the plane of the plate.

The layout reads the parts of the piano, so a change of the case or the lid moves the seats near
it by a few centimeters.

**Harp** (`models/instruments/harp.ts`). A concert pedal harp in the varnished maple of
`harpFrame`, with gilded parts, as a natural Lyon & Healy Style 23. The parts follow a real
pedal harp (`docs/reference/harp-technique.md`):

- **Column.** A fluted shaft between a gilded foot and a gilded crown (`COLUMN`). The crown is
  low, so that it stands below the muzzle of the deer in a side view.
- **Neck.** An S curve (`HARP.neck`): it falls from the crown, rises in a hump over the middle
  strings, and falls onto the top of the soundbox. It is thinner and lower toward the soundbox
  (`NECK`), so that its slim end fits on the narrow top of the soundbox and stays off the right
  shoulder of the player. A brass plate covers the bottom of each side
  over the strings (`NECK`), as the plates of the action. The crown and the neck near it stand
  lower than on a concert harp (`HARP.column`). Reason: the long muzzle of the deer reaches over
  the neck near the crown, and the head of a harpist does not rest on the harp.
- **Soundbox.** A round back of five staves and a flat spruce soundboard, wide and deep at the
  base and narrow and shallow at the top (`SOUNDBOX`). The strings start in a center strip of the
  soundboard, and the middle stave of the back has four holes. Reason for the narrow top: it stands
  at the right side of the chest of the player, and a wider and deeper top went into the chest of the
  deer.
- **Base.** A bevelled pedestal with seven brass pedals in a fan at the end of the player: D, C,
  and B at the left, and E, F, G, and A at the right, as the harpist sees them (`HARP_PEDALS`).
  Each pedal is one part, in the order of `HARP_PEDALS.order`, so that a pose can move it. A pedal
  has three notches: flat at the top, natural in the middle, and sharp at the bottom.
  `harpPedalEnds()` gives a pedal in a notch, and `harpPedalFoot()` the point where the hoof
  presses it. The model shows each pedal in the natural notch, and the scene turns each pedal
  around its root into the notch of the pose (`PedalTurn`, `applyPedals()` of `scene/player.ts`),
  as it turns the piano keys.
- **Strings.** 47 strings, one for each natural note from C1 to G7 (`HARP.strings`), so that the
  colors of a real harp fall on the correct notes. The C strings are red and the F strings dark
  blue. The bass strings are silver wound wire, the middle strings gut, and the treble strings a lighter
  nylon, thinner toward the treble (`STRINGS`). Each string is one part: a prism of three sides
  with open ends, from the center strip up into the neck. Thus the clearance probes do not read
  the strings as a part of the frame. A bronze wire under the warm light read as one red area
  beside the red C strings, so the wires are silver. The strings fill the frame, as on a concert
  harp: the bass string starts near the bottom of the soundboard and ends in the neck near the
  column, and the treble string ends where the neck meets the soundbox (`STRINGS.ends`). The
  foot of the soundbox stands near the foot of the column (`HARP.soundbox`), so that the long bass
  strings can start low.
- **Pluck points.** `harpStringPosition()` gives the pluck point of the string of the key: the
  share `PLUCK.share` of the string from the soundboard up to the bottom of the neck, as harpists
  pluck at one third to two fifths of the string (harp 7.3). Thus the bass strings are plucked
  low, and the treble strings near the top of the soundbox.
- **Swing.** A plucked string swings (5.3), and the scene draws it as a camera with a long
  shutter sees it: the envelope of the swing, as a translucent band (`scene/harp-strings.ts`).
  A sampled swing flickers at each frame rate, and the envelope stays steady. Each string line
  (`InstrumentStrings`) holds the largest swing of a loudest pluck (`STRINGS.swing`), larger in
  the bass than in the treble. The swing follows an ellipse whose long axis lies across the
  string, near the plane of the strings (`STRINGS.swingTilt`, `swingCross`), as a measure of real
  plucks gives (harp 5).

The band of a string is a strip of `BAND_SEGMENTS` segments, one border at the pluck point. The
vertex shader turns it to the camera and widens it by the radius of the wire and the part of the
swing that the camera sees across the string. The form goes from the triangle of the pluck to
the arc of the first mode. Each pixel takes the share of the time in which the wire covers it,
as a mean over the pixel, so the band is brightest at its edges, where the wire turns. The
normal of a round wire across the band keeps the light along the string. While a band shows,
the part of its string closes onto its line (`applyStrings()` of `scene/player.ts`), so the
player of a harp has positions of its own, as a pianist has for its keys.

- **Strength.** `STRING_SWING.strength` scales the real swing, because a swing of a few
  millimeters on the harp of the deer does not show in a stage shot. `STRING_SWING.density`
  scales the coverage, because the blur of a thin pale string on the pale harp almost
  disappears. `STRING_SWING.opacity` caps the opacity of each pixel of a band, because the bass
  strings stand closer than the width of their bands: with no cap, a group of plucked bass
  strings filled one solid area. All three are look paths (`LOOK_ROOTS`), such as
  `?look={"STRING_SWING.strength":3}` on the dev server.
- **Cost.** The bands are one draw for each harp player, with alpha blend and no depth write, so
  the depth passes and the shadow map skip them. A still harp has an empty draw range, so it
  draws no band. The bands are not in the triangle budget of the harp, because they are no part
  of the model. All tiers show them.

The frame stays in the triangle budget of the harp (`INSTRUMENT_BUDGETS`).

**Percussion** (`models/instruments/percussion.ts`). Each instrument follows a real concert
instrument, with the polished finishes of the other instruments
(`docs/reference/percussion-technique.md` 10). The heads, the bars, the strike targets, and the
grips keep their places, so the holds and the strikes do not change with the detail.

- **Timpani.** Each kettle follows the timpani of `orchestra-latest.png` and a Ludwig Grand
  Symphonic timpano (`KETTLE`): a deep copper bowl, a black counter hoop with a chrome top that
  slopes down from the edge of the head, eight black tension rods with chrome lugs down to a base
  ring, three legs with casters, and a balanced action pedal at the side of the player.
- **Drums.** One builder makes the shell, the heads, the hoops, the lugs, and the tension rods of
  each drum (`addDrum()`). The bass drum has wood hoops and 12 lugs, as a Yamaha CB-7036
  (`BASS_DRUM_LOOK`), and lies on the rubber pads of two black A frames with casters. It has more
  faces around its axis than the snare drum, because its large round head showed its corners. The
  snare
  drum has triple flanged chrome hoops and 10 lugs, as a Ludwig Supraphonic (`SNARE_DRUM_LOOK`),
  a strainer, snare wires under the bottom head, and a basket stand. Both shells have one
  lacquer, as a matched set. Each hoop rises a few millimeters over its head, so that a stick or a
  beater at the head does not touch it.
- **Cymbals.** A bell, a domed bow, and a thin rim (`CYMBAL_RINGS`). The rings of the bow
  alternate a polished and a groove bronze, as the lathe grooves of a cymbal. The bow stays near
  the straight bow of the layout form, so that a mallet at the edge strikes it at the same height.
  The cymbal has more faces around its axis than the snare drum (`CYMBAL_SEGMENTS`), because the
  rim of the suspended cymbal showed its corners in the close shots.
  A hand cymbal has a leather strap, and the suspended cymbal sits between felt washers under a
  wing nut.
- **Small percussion.** A padded trap table stands in front of the player, and a stand with a hook
  for the triangle at its left (`TRAP_TABLE`). The post of the stand is out to the left of the hook
  (`TRAP_TABLE.post`), so that it stays clear of the left arm. The tambourine, the triangle, and the
  beater each have a copy on the table or the stand and a copy in a paw (`TABLE_PLACES`,
  `PieceCopies`). The scene moves the corners of the copy that the pose does not show to one point.
  The table keeps the footprint of the old tambourine stand, so the seats do not move. The
  tambourine has a wood frame, a head, and five pairs of jingles in slots. The triangle is one rod
  with round corners and one open corner (`TRIANGLE`).
- **Xylophone.** Rosewood bars in the layout of a keyboard, at the small sizes of `XYLOPHONE`.
  Under each bar hangs an aluminum tube a quarter of the wavelength of its note long, and a rail
  runs under each node line of the bars, where a free bar does not move (`XYLOPHONE_FRAME`).
- **Mallets.** Each mallet has a look of its own (`MalletLook`): a felt ball on the timpani
  mallets and the bass drum beater, a yarn ball on the cymbal mallets, a rubber head on the
  xylophone mallets, a hickory snare stick with a taper and a bead, and a steel triangle beater
  with a grip sleeve. The felt and the yarn heads take the finish `felt` (4.5), and the hard
  rubber heads take the soft gloss of `varnish`, so that each head shades round. A larger head
  has more faces around its axis (`roundMallet()`), because a head of 6 faces showed a hexagon
  in its outline. The timpani mallets have thicker shafts of a warm maple (`TIMPANI.shaft`,
  `malletShaft`), as the mallets of `orchestra-latest.png`, because thin pale shafts read as
  sticks in the large stump paws of the elephant.

These rules hold for the models:

- **Closed solids.** The clearance probes read only the closed shells of an instrument
  (`instrumentSurface()` of `pose/test-sweep-roles.ts`, 9.3). Thus each kettle and each drum is
  one closed profile from head to head over its hoops, and each cymbal one closed profile. The
  hoops are a part of the profile, because a point in two overlapping shells reads as outside.
- **Layout.** Each piece adds its old simple form to its footprint (`PieceBuilder.space()`,
  `MalletHold.space`), as the bowed strings do, so that a change of the detail does not move the
  seats.

**Winds** (`models/instruments/woodwinds.ts`, `brass.ts`). Each wind follows the parts of a real
orchestral instrument (`docs/reference/wind-technique.md` 6), in the low-poly style of the scene.
A bent brass tube is one smooth solid along its path (`tubeAlong()` and `rounded()` of
`tubing.ts`), so it shows no seam at a bend.

- **Flute.** Silver: the head joint with the crown and the lip plate around the dark embouchure
  hole, the body joint and the foot joint with a ring at each tenon, and the key cups on the top
  with their rod at the side of the audience.
- **Oboe and clarinet.** The polished black wood with silver rings at the joints, and the silver
  key cups and rods on the front, where the fingers close the holes. The oboe has a double reed of
  cane bound with thread, and a narrow bell with a rim. The clarinet has a black mouthpiece with
  the cane reed on the side of the player, a silver ligature with two screws, a barrel, two
  joints, a thumb rest at the back, and a wide bell that turns in at the rim.
- **Bassoon.** A dark red stained maple (`bassoonStain`): the boot joint as an oval around both
  bores with the silver cap of its U-tube, the wing joint, the long joint, and the bell joint, with
  silver rings, key rods, and cups. The silver bocal rises from the wing joint in an S curve and ends
  in a straight part that comes into the mouth from the front left (`BOCAL_END`), with the reed, a
  blade of cane bound with thread. Reason: with a short straight part and a thin tube, the bocal
  read as a vertical wire that ended at the front teeth. The reed lies near the long joint (`BASSOON_REED`), so that the long
  joint passes beside the long muzzle of the beaver. The beaver turns the left side of the bassoon
  forward (`BEAVER_PLAY_TURN`), so that from the front left the long joint crosses the muzzle in
  front of the eye, in place of the cheek next to the eye.
- **Trumpet** (`TRUMPET`). The lead pipe passes the valves at their left to the main tuning slide
  in front of them. The bell bow behind the valves brings the bell pipe forward at the height of
  the valve tops, so the bell lies above the lead pipe, as on a real trumpet. Three piston valves
  with pearl buttons, the saddle of the first valve slide, and the ring of the third valve slide.
- **Trombone.** The inner slide and its stockings are nickel silver. The outer slide is one bent
  tube with a ferrule at each open end and a dark bumper on its bow. The bell section has a short
  tuning slide that ends beside the cheek (`TROMBONE_BACK`), so that it stays out of the big head
  of the panda with the slide toward the audience. The counterweight touches the outer side of the
  bow, at the middle between its legs.
- **Horn** (`HORN`). A double horn in the axes of its coil. The lead pipe goes along the tangent
  to the hoop and then around the hoop to the valves. The bell branch leaves the last valve, goes
  out to the outer hoop (`HORN.hoopFrom`), and widens along the hoop into the bell tail, which
  leaves the coil outside the hoop and ends inside the throat of the bell. The throat of the bell
  is wide (`HORN_FLARE`). Four rotary valves with silver caps and the levers of the left fingers,
  the loops of the F side and the B♭ side, and the valve slides. `HORN_PLANE` puts the coil in front
  of the right side of the chest. Reason: a straight lead pipe from the lips to a coil at the
  belly looked like a drinking straw, and the throat of a real horn takes the right hand. The
  space of the layout keeps the older horn, so that no seat moves.
- **Tuba.** A top-action tuba: the bell branch widens more and more toward the bell, and above the
  grip of the left paw it leans out to the left (`TUBA_BELL_LEAN`), so that the rim of the bell
  stays off the cheek and the eye of the rhino. The bell flares fast near the rim to a bead, and a
  garland of nickel silver goes around the flare (`TUBA_FLARE`, `TUBA_GARLAND`), because a
  straight cone up to the rim read as a funnel. The bottom bow joins it to the valves, and four
  piston valves have pearl buttons. The long slide of the first valve crosses the front of the
  tuba below the grip of the left paw (`TUBA_LONG_SLIDE`), and the slides of the other valves hang
  at the right of the valves. Reason: with only short slides at the right, the tuba read as a cone
  and a bow, as a large saxophone. The lead pipe
  starts at the end of the mouthpiece shank and goes down in front of the chin, so that no part of
  it goes into the face. It goes into the front of the first valve casing below its top, so that
  it stays off the finger buttons.

The mouthpieces, the ferrules, the valve caps, the levers, and the garland of the tuba are nickel
silver, as on the real instruments. The points that the holds read stay: the mouth, the grips, the grip tubes, the bell
of the horn, and the slide line. The layout reads the space of the simpler model of each wind
(`wind-space.ts`, `InstrumentPiece.footprint`), so the detail does not move the seats.

### Instrument data

`buildInstrument(id)` gives an `InstrumentModel` as pure data, with no scene-graph object (7.1).

```typescript
interface InstrumentModel {
  id: InstrumentId;
  /** The parent of the `instrument` bone: `chest` or `root` (4.7). */
  parent: 'chest' | 'root';
  /** The rigid pieces. The main piece is first. */
  pieces: readonly InstrumentPiece[];
  /** The palms, the mouth, and the chin, as points on the pieces. `null` if not used. */
  grips: InstrumentGrips;
  /** The points and lines that the arms and the mallets aim at. */
  targets: readonly PlayTarget[];
  /** The size of the box around the main piece, in meters. */
  size: Vec3;
}

interface InstrumentPiece {
  /** One bone of 4.7: `instrument`, `slide`, `bow`, `malletL`, `malletR`, or `baton`. */
  bone: InstrumentBone;
  /** Corner lists with a color and a finish, in the piece axes, in meters. */
  parts: readonly InstrumentPart[];
  /** The place of the piece in the bind pose: an anchor, an offset in `H` and in meters. */
  hold: PieceHold;
  /** The corners of a simple box model for the layout, in place of the parts. */
  footprint?: readonly number[];
}
```

- Each piece is rigid and follows one bone. The origin of the piece axes is the bind position of
  its bone, so a mallet turns around the palm and a bow around its grip.
- `holdInstrument(model, body)` places the pieces on the points of one body, and
  `attachInstrument()` adds them to the mesh of the player.
- `pianoKeyPosition()`, `xylophoneBarPosition()`, and `harpStringPosition()` give the point of
  each key, because a pitch is not linear along the evenly spaced keys, bars, and strings.
- The trombone slide and the damper pedal move along a line, which a bone rotation cannot do, so
  the pose moves the `slide` bone (`AnimalPose.slideOffset`, 5.1).
- The piano keys are parts of the `instrument` piece, in MIDI order. A bone for each key adds 88
  bones, so the scene turns the keys in the positions of the mesh (`applyKeys()` of
  `scene/player.ts`). Each pianist has positions of its own and shares the other attributes.

## 4.7 Rig

Each player has one skeleton with the bones of `BONE_NAMES` (`models/rig.ts`). Each skeleton has
all bones, so a bone has the same index in each player. A bone with no part, such as the trunk of
a rabbit, moves nothing.

```typescript
type BoneName =
  | 'root' | 'hips' | 'spine' | 'chest' | 'neck' | 'head'
  /** Opens for the choir. */
  | 'jaw'
  /** Scale on Y for blinks, or turn the lids of a studio body with lids. */
  | 'eyeL' | 'eyeR' | 'earL' | 'earR'
  /** Only if the species has a tail. */
  | 'tail1' | 'tail2'
  /** Only for the elephant. */
  | 'trunk1' | 'trunk2' | 'trunk3'
  | 'shoulderL' | 'upperArmL' | 'forearmL' | 'handL' | 'fingersL'
  | 'shoulderR' | 'upperArmR' | 'forearmR' | 'handR' | 'fingersR'
  | 'thighL' | 'shinL' | 'footL' | 'thighR' | 'shinR' | 'footR'
  /** Parent: `chest` for the violin, the viola, and the winds, `root` for floor instruments. */
  | 'instrument'
  /** Children of `handR` or `handL`, as the instrument needs. */
  | 'bow' | 'malletL' | 'malletR' | 'baton'
  /** Child of `instrument`, for the trombone slide and the damper pedal. */
  | 'slide';
```

- **Studio bones.** A studio body has a skeleton of its own: the body bones of the mesh rig, two
  eye bones for the bead eyes (for the lids of a body with the eyes of its mesh), and the
  optional bones (`OPTIONAL_STUDIO_BONES`): a tail tip (`tail_tip`), the jaw of a beak (`jaw`),
  the arm segments and helpers (`ARM_SEGMENT_BONES`), the digits of a hand rig (`DIGIT_BONES`),
  and the thumbs of a fist (`THUMB_BONES`). The optional bones come after the other bones, so
  that a new one keeps each other index. The scene gives the mesh the studio bones and the bones
  of the player, and `poseStudioBones()` writes their matrices from the pose of the player. A
  pose also holds the twist bones of the upper arms (`UPPER_TWIST_BONES`).
- **Arm segments.** `poseArm()` writes each segment from the turns of its arm, around the joint at
  the start of its part. The readers of the bind mesh read the upper arm or the forearm of the
  player for them (`STUDIO_FOLLOWS`).
- **Digits and thumbs.** Each digit of a hand rig takes the turn of the fingers and its own bend
  around the curl axis of its paw. Each thumb of a fist takes the turn of the paw and its own bend
  about its close axis. With no bend, a digit moves as the fingers and a thumb as the paw. The
  readers of the bind mesh read the fingers or the paw of the player for them.
- **Jaw.** The `jaw` of a studio body is a child of `head` at the hinge of the beak, and the choir
  pose opens it (5.3). A body with no jaw keeps the `jaw` of the player with no vertex on it.
- **Arms.** Analytic two-bone IK (upper arm and forearm). `poseAt()` calculates the hand targets
  on the instrument: the bow frog, the fingerboard position of the pitch, the keys, and the
  mallet heads. `fingersL` and `fingersR` curl as one block.
- **Legs.** The legs keep a seated or a standing pose. The right leg of a pianist on the damper
  pedal and the legs of a side move of the hips turn (5.3), and the feet stay on the floor. The
  idle motion moves only the spine, the head, the ears, the eyes, and the tail.
- **Torso.** A rotation of `chest` moves the shoulders, the arms, and a violin together.
- **Bind mesh.** The readers of the bind mesh read the main bone of each corner: the
  footprints, the chair clearance, the silhouettes, and the budgets. `posedCorner()` of
  `pose/test-skin.ts` poses a corner in the tests as the GPU does.
- **Bind pose.** No bone has a rotation. The body sits on its seat or stands, and the arms hang
  down beside the body. The instrument is in its playing place on its bone, and the bow lies in
  the hanging right paw.

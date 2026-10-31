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
- **No fur shading.** The material has no fur shader, no tufts, and no shells (4.5, materials).

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
  3.8) sits at the left of the harp, as the celesta of a professional orchestra. With no harp and
  no woodwinds, it sits in the middle behind the strings, as a continuo harpsichord.
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
  the same faces (`palette`).
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
   * Also `violaScale`, `celloScale`, `bassScale`, `oboeScale`, `bassoonScale`,
   * `trumpetScale`, `cymbalScale`, and `harpScale`.
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
  /** A seated tail that lies curled on the seat, and does not sway (5.1): the cat. */
  seatedTail?: 'curl';
  /** Ears that hang beside the head, and do not twitch (5.1): the dog. */
  hangingEars?: true;
}
```

The head height `H` is the unit of the body. The head height and the seat height of a species
come from its studio body (`StudioBody.headHeight`, `StudioBody.seatHeight`). The bear has no
studio seat, so it uses a seat of 0.75 H. The holds of 4.6
give their offsets in `H`, so one hold serves the species of different sizes.

## 4.4 Models

Code builds the instruments and the props from low-poly shapes with vertex colors. Each species
has a studio body: a source mesh, rigged into the studio format. The app reads only the modules
of `src/models/studio/`, and the tools make them from the meshes:

```text
user mesh (Meshy GLB)  ->  tools/blender/<a>_arms.py  ->  <a>-arms.glb + <a>-weights.json
  ->  pnpm rig-mesh <a> (tools/mesh-rigs/<a>.json, Blender)  ->  <a>.rig.glb
  ->  pnpm studio-body <a> (no Blender)  ->  src/models/studio/<a>.ts (the app reads only this)
```

The first step applies only to a body whose arms or legs get new quad faces. The rig of another
body reads the source mesh. The `README.md` of `assets/models/<a>/` gives the source and the
steps of each file.
[`docs/agents/rigging.md`](../agents/rigging.md) gives the details and the traps of the rig.

### Source meshes

- **Fidelity.** A source mesh stays as it is. The rig adds no stretch of a limb, unless a
  product choice sets an arm or a leg factor. The props and the instruments fit the body: each
  chair fits the legs, and a species with short arms plays a smaller instrument in place of
  longer arms (4.6). Each edit goes into a copy that a script of `tools/blender/` makes, so the
  source file stays unchanged and a run gives the same bytes again.
- **Colors.** The texture shows as one color for each face. A color rule of the rig can move the
  fur toward the color of the species in the reference images.
- **Intake pose.** A new mesh comes in an A-pose, with a gap between each arm and the trunk. An
  arm that touches the trunk needs a cut with a flat cap, and bone heat then spreads the arm
  weights into the trunk. Both give flaps at the armpit. The rig fixes the meshes that exist.
- **Triangle budget.** The budget of a studio body allows round forms, such as a round tube for
  each arm (`STUDIO_TRIANGLE_BUDGET`, `STUDIO_MESH_GZIP_BUDGET` of `tools/studio-budgets.ts`).
  The first download of 1 MB and the frame time of 9.7 stay the limits.
- **Licenses.** The project author made the meshes with Meshy on a paid plan, and holds their
  rights. The files of `assets/models/` and `src/models/studio/` are under CC BY-NC 4.0 (the
  `README.md` of the repository), with no entry in the third-party license file (7.3).

### Rules of each body

- The animal faces -z, with its left side at -x. The mouth is near the middle plane, below the
  eyes. The bones have the names of 4.7, so that the pose code of section 5 drives each body.
- Each player is one `SkinnedMesh`: the body, the instrument, and the bow merge into one mesh,
  with one draw call. One `Mesh` for each part gives about 25 draw calls for each animal, which
  is too many for an integrated GPU. The static props merge into a few meshes.

### Export

`pnpm studio-body <animal>` reads the rigged GLB file with no Blender and writes the module. The
entry of the animal in `ANIMALS` of `tools/studio-body.ts` gives its settings.

- It turns the animal to face -z and scales it. It drops the props and the clips of the studio,
  because the app keeps its own, and it joins the digits of a paw into one `fingers` bone.
- It drops the eyes of the mesh, and puts the pea eyes of the app on eye bones of their own, so
  that they blink. A body can scale, level, move, or turn its eyes (`eyeSize`, `eyeLevel`,
  `eyeShift`, `eyeNormal`). Each eye bends to the head surface (`eyeBend()`), so its rim lies at
  the fur. Both eye lights show on the upper left, as the reflection of one lamp does.
- The tip of the nose comes from the vertices near the middle plane (`NOSE_PLANE`), or below a
  horn (`noseTop`). The head measures leave out a long nose, the whiskers, and the antlers
  (`headFloor`, `headCeiling`), because the holds in `H` start at the head.
- **Scale.** The scale keeps a landmark that the scene depends on: the shoulders of the bear for
  the conductor stand, and the shoulders, the ear tips, or the head top at the chosen size for
  each other body. A longer leg raises the landmark, so the trunk, the head, and the arms keep
  their size in meters.

### Mesh rig

`pnpm rig-mesh <animal>` rigs a source mesh with Blender: one mesh of faces with one color each,
the skeleton of the biped template of the studio, a skin of up to four bones for each vertex,
and up to `RAISE_LIMIT` corrective shapes. The config `tools/mesh-rigs/<animal>.json` gives the
joints and the rules, each with a note.

| Group | Config keys | Purpose |
| --- | --- | --- |
| Form | `armFactor`, `legFactor`, `headFactor`, `neckFactor`, `trunkFactor`, `girthFactor`, `proportions` | Change a part to a product choice or to the sheet. The head can keep its form. |
| Seat | `studio.legTurns`, `sit`, `studio.trunk`, `chair.front`, `crease` | Bind a seated role in its pose of 5.2, with the haunch on the seat. |
| Weights | `weights.*`, `refine.rings`, `refine.pointFlip`, `heatSource` | Bone heat, with rules and rings that keep the faces at the joints from a fold. |
| Shapes | `raise` | Give the source back in the standing pose, and relax the faces of a bent arm. |
| Arms | `upperTwist`, `armSegments`, `studio.bindSupination`, `studio.bindArms`, `studio.straightArms`, `armSmooth` | Spread the roll of an arm along the arm, so the skin does not twist. |
| Splits | `weights.armSplit`, `weights.armFree`, `weights.armCrease`, `cut` | Free an arm that the mesh joins to the trunk, so a raised arm pulls no flap out. |
| Normals | `cut.skinNormals`, `cut.bodyNormals`, `rootNormals` | Shade a bent arm root, elbow, wrist, or knee soft, with no dark slot. |
| Colors | `colors.tone`, `colors.shift`, `colors.dark`, `colors.border`, `colors.split`, `colors.flank` | Move the face colors toward the reference, and keep the black borders clean. |
| Face | `colors.patch`, `colors.smile`, `soften`, `eyeShell` | Give a happy face: round eye patches, a thin smile line, and no brow crease. |
| Tail, ears, jaw | `studio.tailCurl`, `studio.tailBind`, `tailBall`, `earFlap`, `noseFront`, `weights.jaw` | Lay a tail on the seat or the floor, let a trunk or a hanging ear follow the head, and open a beak. |

**Arms.** A hold with the elbow out and level rolls the upper arm far, and the linear blend at
the shoulder then twists the skin and squeezes the arm flat. So a body takes a twist bone of each
upper arm (`upperTwist`), or arm segments with a helper bone at the elbow and at the wrist
(`armSegments`). The arms of a body with segments are quad tubes that a script of
`tools/blender/` builds on the arms of the mesh. The bind paw sets the zero of the paw twist, so
the rig turns it toward supination where a hold supinates far (`studio.bindSupination`).

**Straight bind.** A bind that bends a thick elbow or paw (`studio.bindArms`) makes the rest shape
a linear blend of that bend, with the skin on the inner side already pressed. Each pose then blends
its own bend on top of it, and the bent wrists of the bear showed a dark slit that no weight rule
removed. So a body can bind its arms as straight as the source (`studio.straightArms`): the skin
blends one time, from the source. A straight arm has no elbow plane, so the body gives the elbow
axis of each arm (`StudioBody.hinges`). The axis is the axis of the bent bind of
`studio.bindArms`, so that the upper arms and the paws keep their world turns in each pose. The
inner elbow then bends further from its bind, so a `raise` shape of a bent elbow relaxes its faces.

**Arm gate.** A fold count does not see a twisted or a flat arm. So `pnpm arm-check` reads all
arm measures of each arm against one table of limits (`ARM_LIMITS`), and each change of a pose,
a hold, or a body runs it.

### Seat

- A seated role binds its mesh seated. The export puts the soles on the floor and the haunch on
  the seat. The chair fits the body (`StudioBody.seatHeight`, `chairDepth`, `chairWidth`,
  `backRoom`), so the feet touch the floor. The seat is level, and it ends where the thighs leave
  it at the haunch (`chair.front`).
- The polar bear sits on a bench that fits its haunch and legs (`benchFitOf()`), with vertical
  shins and flat feet, as a real pianist sits. Its legs keep the length of the mesh, so the body
  keeps the part ratios of the mesh. The deer sits on the stool of the harp.
- The mouse, the beaver, and the monkey have no chair (`noChair`). Each keeps its seated pose at
  the seat height of its legs, with its feet on the floor. The monkey has short legs under a
  large head, so its feet stand under its hips and its trunk leans forward with the head level.
  Its center of mass thus stays over its soles.
- The hippo, the elephant, the badger, the rhino, and the penguin stand to play, in the standing
  pose of their meshes. The rhino stands as a real tubist on a strap does.
- A seated body that also stands as a soloist (`soloist` of `ANIMALS`) keeps the leg shapes of
  its sheet pose (`standingBody()` of `models/studio-rig.ts`).

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
  paw its own turn (`pawTurnL`, `pawKeepR`). Each shape takes its weight from the pose alone
  (`raiseWeight()`), so the rule of stateless poses holds.
- **Render.** The fur gets smooth normals within the crease angle of the body (`crease` of
  `ANIMALS`, `studioNormals()`). The bears and the penguin take a larger angle and a color blend
  (`colorBlend`), so they look round with soft facets, and the edges of the muzzle and the claws
  stay sharp. The other bodies share one angle. The colors hold the baked occlusion of the rig.
- **Bind mesh.** `buildStudioBody()` gives the mesh in the bind pose of the player, with two
  bones for each corner, for the footprints, the budgets, and the tests.

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
  color rule of a rig can move the fur toward it. All eyes are black with a light.
- **Instrument colors.** `INSTRUMENT_COLORS`. The bowed strings are varnished wood with a lighter
  top and darker edges. The clarinet is black lacquer with silver keys, the flutes are silver, the
  brass is gold with lit bells, and the timpani are copper. The piano is black lacquer with a dark
  well and a dark gold plate in its open case (`PIANO_INSIDE`).

**Materials**

All meshes share the values of one `MeshStandardMaterial` with vertex colors and crease normals
(`models/shading.ts`), so each player has one material and one draw call. Each program variant
of the players (skin, morph count) gets its own copy of the material and a depth material
(`scene/variants.ts`), and the scene pass draws the players of one copy together. A pass draws a player only when its camera sees the sphere of the pose
(`scene/bounds.ts`). The corners with the same values share one vertex, and the depth passes and
the shadow maps draw a depth geometry with only the positions, the skin, and the morph positions
(`scene/shared-corners.ts`). The GPU then skins each vertex one time in place of each corner, and
the pixels do not change. The stage computes the bone matrices from the pose with the products
of three.js in the same order, so each bit stays (`FrameSkeleton` of `scene/player.ts`). Each triangle has a finish (`FINISHES` of `models/mesh.ts`):

| Finish    | Parts                                                     | Intent                                                                |
| --------- | --------------------------------------------------------- | --------------------------------------------------------------------- |
| `matte`   | Cloth, raw wood, the stage, the props, and the bodies.    | No gloss. A studio body smooths the angles below its crease angle.    |
| `varnish` | The varnished wood of the bowed strings.                  | A soft gloss.                                                         |
| `lacquer` | The black lacquer of the piano and the clarinet, the eyes. | A sharp gloss.                                                        |
| `metal`   | Brass, copper, and silver.                                | Sharp highlights. The hall is dark, so a high metalness looks black.  |

The studio bodies smooth their fur, because their many small faces showed a crumpled pattern
under the hard key light.

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
- **Rim lights** (`RIM_LIGHT`, `RIM_PLACE`). Warm spotlights far behind and high light the heads
  and the shoulders, so the players stand out of the dark hall. They cast no shadow, so the
  shadows keep one direction. The vertex shaders calculate them (`scene/rim-light.ts`), because a
  spotlight costs GPU time on each lit pixel (9.7).
- **Side and back-row lights** (`SIDE_LIGHT`, `BACK_ROW_LIGHT`). Weak cross lights from the
  front corners. They cast no shadow (2.6), so the key light alone casts the shadows. The
  back-row lights keep the back rows almost as bright as the front rows. These lights are a warm
  white, so white, gray, and purple fur keep their colors.
- **Pool** (`LIGHT_POOL`, `addLightPool()`). A factor in the shaders makes a pool on the
  conductor and the middle of the orchestra, because a separate light costs GPU time. A hot spot
  holds only the podium on the players, so the white fur of the front rows does not clip.
- **Beam** (`BEAM_LOOK`). The haze cone leans toward its rim light, which stands at the x of the
  beam, so the beam has a visible source and stands upright. The camera dims it in a close shot.
- **Other terms.** Each layout bakes the soft key shadow on the stage one time
  (`scene/stage-bake.ts`), because the props and the stage do not move. A close shot adds a soft
  key and a kicker on the shade side of the subject (`scene/shot-light.ts`, 5.6). Room haze gives
  the back rows an aerial depth (`ROOM_HAZE`). A solo turns the key light, the pool, and the beams
  to the soloed players (`soloAim()`, 2.4). A captured cube of the lit hall gives the reflections
  (`captureEnvironmentSteps()`).
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
scene ──> [depth 1/2] ──────────────────────^ (only with a shallow focus)    v  v
          [scene target] ───────────────────────────────────────────────> final pass ──> canvas
```

- With no float target, the scene renders with no post effects. The bloom levels follow the tier
  (2.6).
- The depth of field is a thin lens focused on the subject of the shot (5.6). The aperture
  closes for a far focus, so the wide views stay sharp and skip the blur. Free mode has none.
- The bloom keeps a small part of all light, as a diffusion filter, with a warm halation.
- The final pass does the tone mapping, a grade (`gradeColor()`, `GRADE` of `scene/grade.ts`), a
  vignette, and a grain. `pnpm look-lab` fits the grade to `orchestra-latest.png`. The curve
  keeps the soft shoulder of AgX, because a steep shoulder clipped the floor and the white fur.

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

**Supports.** The players of the timpani, the percussion, the contrabass, the tuba, the choir,
and the conductor stand. The soloist of 3.8 also stands when it plays the violin, the viola, the
flute, the oboe, the clarinet, the horn, the trumpet, or the trombone, as in a concerto
(`supportOf()` of `models/player.ts`).

**Props and stage**

`models/props.ts` holds the chairs, the stools, the music stands, and the risers.
`models/stage.ts` holds the stage, the podium, and the conductor stand.

| Item            | Rules                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| Chair           | A level seat, two back posts, one wide top rail, and four legs (`CHAIR`). It fits the body (4.4, seat).   |
| Stool           | For the harp, with no back (`STOOL`). It fits the legs, so the knees and the hooves stay out of it.       |
| Piano bench     | A padded seat with four tapered legs (`PIANO_BENCH`), as in `polar-bear-views.png`. It fits the body.     |
| Music stand     | A tripod and a tilted desk with a sheet (`MUSIC_STAND`), below the eyes of its players.                   |
| Podium          | A box with cut corners and framed panels (`PODIUM_SIZE`, `PODIUM_TRIM`), as in `bear-views.png`.          |
| Conductor stand | A desk on a post in front of the podium (`CONDUCTOR_STAND`), with its top edge at the bear shoulders.     |
| Stage           | A slab of side `S` with cut corners (`STAGE_CORNER_CUT`), a raised lip (`STAGE_LIP`), and lacquered planks. |
| Choir risers    | Up to three arc levels behind the orchestra, with three steps in front (`RISER`).                         |

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
6. Spread the instrumental rows inside the stage. `S` does not change.
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
  rows left the front corners empty. Then row 1 moves its back desks toward their first desks, as
  the wedges of a professional orchestra.

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
the bind pose, and the box of its seat. A bowed string and its bow count a simple box model
(`InstrumentPiece.footprint`), so the detail of the model does not move the seats.

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
sits at `PIANO_CENTER` and faces the conductor, so the lid opens to the audience. A keyboard of
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
(`pnpm hold-reach`).

The hold gives the place of each piece in the bind pose of 4.7, in the axes of the model: the
player faces -z, and its left is -x. An offset in `H` uses the head height of the player. Where
the body sets the hold, the instrument fits the body, as the table names.

| Instrument | Model and hold |
| --- | --- |
| Violin, viola | An arched body with f-holes, a scroll, a bridge, four strings, a chin rest, a shoulder rest, and a bow. Under the chin on the left shoulder. The cat plays a small viola near the neck. |
| Cello, contrabass | The violin form with an end pin (`endPinLength()`). The cello leans back between the knees. The contrabass has sloped shoulders and machine heads, and stands at the left side. |
| Harp | Leaned back onto the right shoulder. The deer plays a smaller harp on a box (`HARP_PLACE`, `HARP_STAND`). |
| Piano | Larger than a real grand piano (`PIANO_SCALE`), so the keys stand a little below the elbows of the polar bear. The keys stand in front of its belly (`PIANO_FRONT_H`). |
| Flute, oboe, clarinet, bassoon | The lip plate, the reed, or the mouthpiece at the mouth. The flute points to the right, and the bassoon crosses the body to the left. |
| Horn, trumpet, trombone, tuba | The mouthpiece at the mouth. The pig turns its horn back toward the body (`PIG_HORN`), and the rhino has a longer lead pipe (`tubaPipe`). |
| Timpani | Kettles of the real size in an arc. The kettles of the elephant move to its short arms, with a gap for its trunk (`TIMPANI`). |
| Percussion | Drums, a xylophone, a triangle, and a tambourine within the reach of the badger, and a suspended cymbal (`cymbalForm`, `SUSPENDED_CYMBAL`). |
| Choir folder | In both flippers, in front of the chest (`CHOIR_FOLDER`). |
| Baton | Along the index finger, with its grip in the palm, as a conductor holds it (`BATON_ALONG`). |

Each mallet, stick, and beater slants down toward the line of the forearm, as a real player holds
the shaft along the thumb (`malletTilt`). No vertex of a player is below the floor.

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
change of the detail does not move the seats.

**Piano** (`models/instruments/piano.ts`). 88 separate keys, a lyre, and three brass pedals in the
sizes of a real grand piano (`PIANO_PEDALS`). Each key turns down with its notes (`PIANO.keyDip`),
and the damper pedal goes down under the right foot (5.3).

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
  /** Scale on Y for blinks. */
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

- **Studio bones.** A studio body has a skeleton of its own: the body bones of the biped template
  of the studio, two eye bones for the pea eyes, and the optional bones
  (`OPTIONAL_STUDIO_BONES`): a tail tip (`tail_tip`), the jaw of a beak (`jaw`), and the arm
  segments and helpers (`ARM_SEGMENT_BONES`). The optional bones come after the other bones, so
  that a new one keeps each other index. The scene gives the mesh the studio bones and the bones
  of the player, and `poseStudioBones()` writes their matrices from the pose of the player. A
  pose also holds the twist bones of the upper arms (`UPPER_TWIST_BONES`).
- **Arm segments.** `poseArm()` writes each segment from the turns of its arm, around the joint at
  the start of its part. The readers of the bind mesh read the upper arm or the forearm of the
  player for them (`STUDIO_FOLLOWS`).
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

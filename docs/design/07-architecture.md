# 7. Architecture

## 7.1 Modules

The stack is Three.js, TypeScript, and Vite, with pnpm. There is no UI framework, because the UI
is small. The audio module is behind the small `Player` interface (6.8), so a change inside it
does not change the other modules.

```text
first download                                lazy, after the first frame
┌────────┐    ┌─────────┐    ┌────────┐       ┌─────────────────────────────┐
│ midi/  │───>│ score/  │───>│ pose/  │       │ audio/: Player              │
│ (pure) │    │ (pure)  │    │ (pure) │       │ Worker: SF3 to PCM SF2      │
└────────┘    └────┬────┘    └───┬────┘       │ worklet: spessasynth_core   │
                   │             │            │ and the block scheduler     │
                   │             v            └──────────────┬──────────────┘
                   │         ┌────────┐                      │
                   │         │ scene/ │<── models/ (pure)    │ Player
                   │         └───┬────┘                      │
                   │             │                           │
                   v             v                           v
              ┌──────────────────────────────────────────────────────┐
              │ app/ and ui/: load flow, transport, seat list, hash  │
              └──────────────────────────────────────────────────────┘
```

| Module | Job | Pure | Loads |
|---|---|---|---|
| `midi/` | Parse the bytes of a Standard MIDI File into tracks of events in ticks. | yes | first download |
| `score/` | Apply the rules of section 3, and build the `Score` with `buildScore()` (3.2). | yes | first download |
| `pose/` | `poseAt()` (5.1). | yes | first download |
| `models/` | The species, the studio bodies, the instruments, and `layoutScene()`. | yes | first download; each body with the piece that casts it (7.2) |
| `shots/` | The camera shots of 5.6: `prepareShots()` and `cameraAt()`. | yes | first download |
| `scene/` | Three.js: stage, lights, camera, quality tiers, poses applied to bones. | no | first download |
| `audio/` | The `Player`, the Worker, and the worklet processor. | no (the block scheduler is pure) | lazy |
| `app/`, `ui/` | Load flow, transport, seat list, URL hash, settings. | no | first download |
| `gallery/` | The development pages `gallery.html` and `views.html`. | no | own entry |
| `test-page/` | The development page `test.html`, at `/test`. | no | own build pass |
| `tools/` | The build scripts, the tools of a studio body (4.4), the probes, and the image tools (`docs/agents/commands.md`). | no | build only |

### Pure modules

A pure module gets all inputs as arguments, reads no clock, uses only seeded randomness, and
touches no DOM. It can use the math classes of `three/src/math/`, because they are plain
JavaScript that runs in Node, and Three.js is already in the first download. It uses no
scene-graph object of Three.js (`Object3D`, `Mesh`, `Bone`, geometry, material, or renderer). It
returns plain data: typed arrays, tuples, or plain objects. Thus a test can compare it, and
`poseAt()` stays stateless (5.1). A long calculation, such as `layoutScene()`, also has a step
form that the app runs in slices of the main thread (7.2, "Short tasks during the load").

A point or a rotation at a module boundary is a readonly tuple of `models/tuples.ts`. A function
converts it with `new Vector3(...p)`, and gives back a tuple with `toVec3()` or `toQuat()`. The
frame path of `poseAt()` writes module scratch objects in place, so that a frame allocates few
objects. Each call writes a scratch object before it reads it, so the scratch holds no state.

```typescript
/** A point (x, y, z) in meters: the plain form of a `Vector3`. */
export type Vec3 = Readonly<Vector3Tuple>;
/** A rotation as a unit quaternion (x, y, z, w): the plain form of a `Quaternion`. */
export type Quat = Readonly<QuaternionTuple>;
```

### Gallery

`gallery.html` shows each species with the instrument of its section, and each instrument alone,
with a time slider and a test note list. Thus a person can examine the models and the motion with
no MIDI file. A separate entry adds nothing to the first download.

A line of the test note list holds a start and a length in seconds, and a key (`1.5 0.5 C5`).
Each player plays the notes with `poseAt()` in a seat of its own, and the bear conducts them in
4/4. `galleryPlan()` of `src/gallery/plan.ts` makes the plan with `preparePlayer()` and
`prepareConductor()`, because the gallery has no `Score`. Each animal gets a transport of its own,
because each animal has its own seeded delay of a move.

The gallery renders at the high tier with the shadow radius of the stage, so that the close views
show the shadows of the app. The camera looks down at `GALLERY_ELEVATION_DEG`, so the gap in
front of a row grows with the height of the next row (`GAP`, `LABEL_DEPTH`). The pianist faces
+x, as on the stage, so that the camera sees it beside the piano.

The gallery captures its lit floor in the room environment as its environment light
(`captureEnvironment()` of `src/gallery/main.ts`), with the values of the stage (`ENVIRONMENT`,
`CAPTURE`, 4.5). The diffuse light of the capture reaches each fold of a body that the key light
and the fill light miss, so a fold shows the soft shade of the app. With no environment, each
such fold is a black band. The gallery has no hall, no back-row lights, and no post effects, so
a frame of the app (`pnpm close-views play --at <species>`) is the proof of a fault of the light.

| Query | Effect |
|---|---|
| `page=species`, `page=instruments` | The species with their instruments, or each instrument alone. |
| `only=<list>` | Keeps the named species and instruments. The badger takes the instrument of a role. |
| `zoom`, `target`, `azimuth`, `elevation`, `x`, `z`, `distance` | Move the camera from the fit view, or to a fixed distance. |
| `body`, `head` | Turn the camera around the body of the first animal, or aim at its head. A close view of a new role thus needs no camera values. |
| `part=<bone,...>`, `margin`, `cut` | Aim the camera at a body part of the first animal in its pose, such as `part=handL,fingersL`. The frame holds the mesh on the bones (`partFrame()` of `src/gallery/parts.ts`), from `azimuth` and `elevation`. `cut` cuts away all that is nearer than the part. |
| `stand`, `rest` | Give each player the support `stand` (4.5), or the rest pose (5.2). |
| `lift=<share>`, `lower=<share>` | Show each animal at a share (0 to 1) of its lift or of its lowering, after its seeded delay (`moveTransport()`). |
| `wall=<seconds>` | Stop the idle motion at a wall clock time, so that two renders of a moment show the same pose. |
| `probe=colors`, `normals`, `noshadow` | Show the face colors, the normals, or no shadow on the bodies (`applyProbe()`). |
| `fill=<lux>` | Add a light from the camera, so that a close view shows the side that the key light leaves dark. |
| `clip=<file>[:<animation>]` | Play a clip of `clips/<file>.glb` on each animal at the time of the slider (4.4). The animals stand, and the instrument hides. |

`pnpm close-views` uses these queries to show the moments and the views of each role of
`ROLE_VIEWS` in one grid, and `pnpm choir-check` to compare the penguin with the reference images.

The page reads `part`, `margin`, `cut`, `azimuth`, `elevation`, `rest`, `lift`, `lower`, and `wall`
again at each `popstate` event. A tool changes the query with `history.replaceState()` and sends the
event, so one load of the page shows each part, view, and moment of a role
(`pnpm close-views parts`). The canvas attribute `data-part` gives the ball of the part and the
posed head of each bone.

### Views page

`views.html` shows the animals with the rows, the places, and the labels of
`docs/reference/animals.webp`, so that a person can put the two images side by side.
`?page=bears` shows the bear family. The page has an orthographic camera, its own studio light
(`VIEW_LIGHT`), and the tone mapping and the grade of the stage (`GRADE_FUNCTION`, 4.5). One
light serves all pages of `views.html`, and the stage keeps its own light.

The query `sheet=<id>` shows one species as its model sheet in `docs/reference/` does, with the
size, the scale, and the camera angles of the sheet (`VIEW_SHEETS` of `src/gallery/sheets.ts`).
Each sheet pose comes from `poseAt()` at a moment of test notes (`SHEET_MOMENTS`), with the hold of
the stage (5.3). The front view of the polar bear hides the piano, because its open lid hides the
head. The bear sheet has a soft light with no cast shadow, so its page has a light of its own
(`ViewSheet.light`, `ViewSheet.shadows`). The key `matte` shows the silhouette of the body, which
`pnpm sheet-check` compares with the matte of the sheet in `tools/sheet-mattes/`.

### Test page

`test.html`, at `/test`, shows one animal of the cast on the stage of the app: the hall, the
stage floor, the pool light, the beam, and the post effects of `StageScene`. The animal plays or
conducts the test phrase of its role in a loop, with the sound of the app. Thus a person can
check the real motion and the sound of one role with no MIDI file.

- **Roles.** The list holds the conductor (`#bear-conductor`, the species of `CONDUCTOR`), each
  species with each instrument of its section, the standing soloist of each instrument whose
  soloist stands (4.5), and the recast roles of the instruments of the cast matrix (4.4).
  `testRoles()` of `test-page/roles.ts` makes it.
- **Role panel.** A fixed panel at the left side lists the roles, with one group for each species
  (`rolesBySpecies()`). The conductor is in the group of the bear, which comes first. A click on
  the title of a group folds or unfolds it, and all groups start unfolded. The panel marks the
  picked role (`aria-current`), and a click on a role picks it. The panel scrolls on its own, and
  the stage fills the rest of the width.
- **Phrase.** `phraseOf()` of `test-page/phrases.ts` gives each instrument a test note list of
  about 8 s: long notes, fast notes, string crossings or changes of the register, and rests.
  `partsFile()` writes it as a MIDI file, and the score rules read it. Thus the sound and the
  motion come from one `Score`.
- **Conductor phrase.** `conductorPhrase()` of `test-page/conductor-phrase.ts` gives six sections
  8 bars of 4/4 at 120 BPM, one player each, because a group of five or fewer has no conductor
  (4.2). It holds each input of the conductor pose (5.4): a soft legato start, entries
  after a rest that the left hand cues, a crescendo, a staccato forte with an accent, a tutti
  that the baton cues, a diminuendo, and a held final chord with a cut-off.
- **Place.** The layout of the app puts the one player at the stage center (4.2). A role with
  another species or another support takes that place, as a recast role of the role tools does
  (`soloLayoutSteps()`). The page loads only the bodies of the role, of the seat species of the
  score, and of the bear, because the layout builds their models.
- **Conductor place.** The layout of the app for the conductor phrase moves so that the podium is
  at the stage center, and the pose plan holds all its animals. The stage shows only the podium,
  the conductor stand, and the conductor, on the smallest stage (`SMALLEST_STAGE`), and `poseAt()`
  poses only the conductor. Thus the presets aim at the conductor as at a player, and the near
  limit of Free mode does not push them out to the edge of an orchestra stage. The sound plays
  all parts, and the cues turn to the places of the hidden players.
- **Time.** The pose comes from `preparePosesSteps()` and `poseAt()` of the app. The first play
  has the count-in and the lift of the app (5.2). At the end of the phrase, the page seeks to 0.
  A pause holds the pose at its song time, so the time slider shows each moment of the play.
  Until the samples of the `Player` are ready, a song clock with no sound runs the loop
  (`SilentClock`). The button "Start the sound" makes the `Player` in its click, and the
  `Player` then plays on from the song time of the clock.
- **Mode.** In play mode, the animal plays the phrase. In rest mode, the page makes no sound, and
  the animal holds the rest pose of its role with its idle motion. Each seat of the score is
  silent, as a mute of the app makes it (`changeAudibility()`, 5.5), so `poseAt()` lowers each
  instrument to the rest pose of a long rest. The conductor has no seat. Its rest pose comes from
  the transport, so rest mode pauses the transport of the pose, as a pause of the app does (5.2):
  the arms stay up for the hold of a pause, then hang beside the body. The song time runs on in
  both modes, so a change back to play mode lifts the instruments in the phrase.
- **Camera.** The orbit controls of Free mode turn the camera (2.5). The presets Front, Side,
  Back, and Close show for one frame as the camera of a shot, and Free mode keeps them. So each
  preset target stays less than 1 m from the default target, and each camera stays outside the
  near limit (`viewCamera()` of `test-page/views.ts`). The presets turn with the side that the
  animal faces (`ViewSubject.turn`), so the front view shows the face of the conductor, who faces
  the orchestra. The frame moves down by half the bar, because the page has no bar.
- **Panel.** The panel of the controls floats over the stage, at the right of the role panel. A
  button at its top folds and unfolds the controls. On a screen of 600 px or less, the panel goes
  to the bottom, over the floor, and starts folded, so that it does not cover the animal. The role
  panel becomes a drawer there: a button at the top left opens it, and a pick closes it.
- **Link.** The URL hash names the role and rest mode, such as `/test#rabbit-violin` or
  `/test#rabbit-violin&rest`, so a reload or a shared link shows the same role in the same mode.

`pnpm build` builds the test page in a second pass (`TEST_PAGE_MODE` of `vite.config.ts`). As a
fourth entry of one build, it put the modules that it shares with the start page into common
chunks, and the first download grew. The pass adds its files to `dist/` and keeps the manifest of
the first pass. `vercel.json` routes `/test` to `test.html`, and the html fallback of Vite serves
it in dev and in preview.

```typescript
/** One role of the test page: a player, or the conductor. */
export type TestRole = PlayerRole | ConductorRole;

export interface PlayerRole {
  /** The name in the URL hash: `<species>-<instrument>`, and `-standing` for a soloist. */
  readonly id: string;
  /** The text of the role under its species in the role panel: "violin (seated)". */
  readonly part: string;
  readonly group: 'section' | 'soloist' | 'recast';
  readonly species: SpeciesId;
  /** The role species and the species of the seats. Their bodies load before the build. */
  readonly bodies: readonly SpeciesId[];
  readonly instrument: PlayedInstrument;
  readonly support: Support;
}

export interface ConductorRole {
  /** `<species>-conductor`, with the species of `CONDUCTOR`. */
  readonly id: string;
  readonly group: 'conductor';
  readonly species: SpeciesId;
  readonly bodies: readonly SpeciesId[];
}
```

### Development pages on the site

The site holds `gallery.html`, `views.html`, and `test.html`, because the screenshot script and
the review checks open the first two on the built site, and a person opens the test page. No page links them, and each one has
`<meta name="robots" content="noindex" />`, so that search engines leave them out.

## 7.2 First download

The first download is less than 1 MB (`SIZE_LIMIT_BYTES` of `tools/size.ts`). CI fails above the
limit and prints the size on each run. The limit goes up only with the approval of the project
owner. A change that moves the size by more than 5 KB states the reason in its commit message.

`pnpm size` (`tools/size.ts`) sums the gzip sizes of `index.html`, the CSS, the entry chunk with
its static imports and their assets, the MIDI file of the default demo (`DEFAULT_DEMO`, 8.2), and
the chunks of the studio bodies that the default demo casts. It does not count the audio code, the SF3 files, the development pages, and the other demos. The
app loads the audio code after the first frame, and another demo when the user selects it. A
file that is gzip data already counts with its own size, because the host sends it with no
second gzip. `--base <ref>` also builds a commit, and prints both totals.

The packed meshes of the studio bodies are the largest part of the app. Thus each body module
is a chunk of its own, and the app loads only the bodies that a piece casts. The first step of
the scene plan loads the bodies of the score (`castBodiesSteps()` of `app/body-loads.ts`): the
bear conductor and the species of each seat with players. A body loads one time, so a piece
change loads only its new species. The layout needs the head height and the seat height of each
species before the load, so `pnpm studio-body` writes these two values into
`models/studio-heights.ts`, and `species.ts` reads them from there.

The pure core reads each body from a registry (`studioBodyOf()` of `models/studio-body.ts`). In
Node, the registry holds all bodies of `models/studio-bodies.ts`, so the tools and the tests load
nothing. The plugin `BROWSER_STUDIO_BODIES` of `vite.config.ts` gives the browser code an empty
record in place of that module, in the dev server and in the build. The app and the gallery thus
fill the registry with `loadStudioBodies()`, which loads each module with `import()`.

```typescript
/** Loads the body modules that are not loaded. All bodies when no names are given. */
export function loadStudioBodies(names?: readonly StudioBodyName[]): Promise<void>;
/** Gives the bodies that a score casts: the conductor and each seat with players. */
export function castBodies(score: Score): StudioBodyName[];
```

Each packed mesh has a gzip budget (`STUDIO_MESH_GZIP_BUDGET` of `tools/studio-budgets.ts`), and
the bodies of the default demo count against the limit. `packStudioMesh()` writes one stream for
each kind of number, so that gzip finds the repeats.

The texture points of a body with a color map (4.5) are in its module, so they count. An atlas of
Tripo has about two points for each vertex, so `packStudioUvs()` predicts each new point from two
known corners of its triangle and the places of the vertices, as the parallelogram rule of a mesh
codec does, and writes only the miss. The image itself is not in the first download: the first
draw of the body starts its load in the next animation frame, from a lazy URL chunk of Vite
(`import.meta.glob` of `scene/body-texture.ts`), and `createImageBitmap()` decodes it off the
main thread. Its size is the smallest that shows the fur strands in a close view at a device
pixel ratio of 2. The normal map of the fur (`<name>-normal.webp`) loads in the same way and in
the same frame.

`index.html` preloads the file of the default demo with a low priority when the hash names no
demo, so that the score build does not wait for a fetch after the scripts. The preload starts
after the first contentful paint. The LCP that Lighthouse simulates holds each request that ends
before the paint of the LCP element, and the file of 30 kB added 150 ms on mobile.

The largest contentful paint (LCP) of the page is the piece title (2.8). `index.html` holds the
title lines of the default demo, so the browser paints them with the first paint, before the
scripts run. `Title` keeps the header and its text nodes, because a new or a moved node paints
its text again as a later LCP candidate.

The plugin `INDEX_VALUES` of `vite.config.ts` writes the URL and the title lines from
`DEFAULT_DEMO` into the placeholders of `index.html`, so that the page and the app cannot differ.

The build puts the CSS of `index.html` inline in its head (`INLINE_CSS` of `vite.config.ts`),
because a linked style sheet blocks the first paint for one more request. The CSS is about 6 kB
after compression. Only a new deploy loads it again, because a repeat visit gets the page from
its ETag. The dev server keeps the links. `pnpm size` counts the CSS in `index.html`.

### Short tasks during the load

No task of the main thread is a long task during the load. Lighthouse multiplies each task of a
phone by 4, and each part of a task above 50 ms adds to the total blocking time. Thus each task
stays below about 10 ms on the development Mac.

```text
module task ─> probe of WebGL2 ─> renderer ─> app and fetch ─> slices of the build ─> show
                                                                │ (SLICE_MS each)
   score ─> cast bodies (import) ─> models and layout ─> pose plan ─> shot plan ─> scene steps
```

- **Step form.** A long pure calculation has a step form: a generator that yields between its
  steps (`Steps` of `score/steps.ts`). A step reads no clock, so `runAll()` of a tool and the
  slices of the app give the same result.
- **Slices.** `runSliced()` of `app/slices.ts` runs steps until `SLICE_MS` pass, and then gives
  the main thread back with `scheduler.yield()`, or a `MessageChannel` message. A step that waits
  for the GPU yields `wait`. A step that needs a load yields its promise, and the slices wait
  for it. A later selection stops a build at its next slice. The builds run
  one after the other, because they share the renderer.
- **Scene build.** `StageScene.prepareSteps()` builds the scene of a layout, and `show()` swaps
  it in one task. The steps compile the programs of each pass with a render target, as the pass
  draws them, and wait for `KHR_parallel_shader_compile`. The bake, the environment, and the
  capture render in steps, with a fence wait at the end of each, because an upload waits on the
  main thread while the GPU is busy. One draw of each player geometry on a warm layer uploads its
  buffers and builds its morph texture. The first frame thus compiles and uploads nothing new.
- **Stopped build.** A build writes the pool and the rim lights of its layout into the shared
  uniforms, because its capture renders with them. A stopped build calls
  `StageScene.cancelBuild()`, which frees its scene, its targets, and its camera, and writes the
  lights of the shown layout again. The orbit controls of a new camera connect to the canvas only
  in `show()`, so a drag during a build moves only the shown camera.
- **Restore.** A restored WebGL context makes the environment, the bake, and the capture again
  (`StageScene.restoreSteps()`), in slices after the build before it. WebGL changes the status of
  a fence or of a parallel compile only between two tasks. Thus `runAll()` cannot run a step that
  waits for the GPU, because its wait never ends in one task.
- **Start.** One probe context gives WebGL2 and the target format (`probeWebgl2()`). The probe
  and the renderer start in later tasks, and the first canvas size comes from a
  `ResizeObserver`, so no read forces the layout of the page.
- **Audio.** The app starts the audio output service before the `AudioContext` (6.3).

The steps run on the main thread, with no Worker. The scene needs the player models of the pure
core on the main thread, so a Worker bundle holds the pure core and the packed meshes a second
time, above the limit of the first download. A plan also holds instances of the math classes,
which a message to a Worker gives back as plain objects.

GitHub Pages gzips only the text types. Thus the build gzips the demo files and the preset files
in place, with the same names (`GZIP_AUDIO` of `vite.config.ts`). The client removes the gzip
layer with `DecompressionStream` when the first two bytes are `1f 8b` (`plainBytes()`), so the
plain files of the dev server also load. A browser with no `DecompressionStream` cannot load the
presets and the demos, and the app adds no fallback for it.

## 7.3 Third-party licenses

The build writes `third-party-licenses.txt`, and the credits dialog links to it (8.1). The file
holds Three.js (MIT), spessasynth_core (Apache-2.0), stb-vorbis (Apache-2.0), the package
`@vercel/analytics` of the deploy build (MIT, 2.7), and the three sources of the SoundFont (6.2):
GeneralUser GS (GeneralUser GS License v2.0), VSCO 2 CE (CC0 1.0), and VCSL (CC0 1.0). It also
holds the two hall impulse responses (CC BY 4.0, 6.8), the GitHub mark (MIT, Primer Octicons,
2.8), and the font Fraunces of the wordmark (SIL Open Font License 1.1, 2.8).

`tools/licenses.ts` writes the file after the Vite build, and the plugin `DEV_LICENSES` of
`vite.config.ts` serves the same text on the dev server. The script fails when a package in
`dependencies` is not in its list, and when a package of the list is not installed. Thus a new
dependency that the site ships gets an entry in the same commit. A tool that the site does not
ship gets no entry, such as `wasm-media-encoders` and the FLAC writer of `tools/hall-flac.py`.
The meshes of the studio bodies (4.4) are made for this project by its owner, who holds their
rights, so they need no entry.

- CC0 1.0 has no condition. The entries of VSCO 2 CE and VCSL still give the credit that the
  VSCO 2 CE readme asks for, and say that the SoundFont holds changed samples.
- CC BY 4.0 asks for the credit, a link to the license, and a note of the changes. Each hall
  entry (`hallEntry()`) gives the credit line of `HALL_CREDIT` or `KONZERTHAUS_CREDIT` with the
  note of the changes, the source, and the license link. The link meets section 3(a)(1)(C), so
  the repository holds no copy of the license text.
- The GitHub mark is also a trademark of GitHub, Inc., so its use follows the logo rules of GitHub
  (`assets/github-mark/README.md`).

## 7.4 Search and share

The main URL of the site is `https://www.pawchestra.com/` (`SITE_URL` of `app/page-title.ts`).
The Vercel project `pawchestra` sends `pawchestra.com`, `zoophony.com`, and `www.zoophony.com` to
it with the status 308, so that the old links stay good. The plugin `INDEX_VALUES` of
`vite.config.ts` writes the texts of this section into `index.html` from the constants of
`app/page-title.ts`, so that the page and the app cannot differ.

- **Title**: the start page has the title `SITE_TITLE`: the name and the words that people search
  for, such as 3D, animal orchestra, MIDI player, and browser. Google renders the page with its
  scripts, so the app keeps this title while the default demo shows (`pageTitle()`). A search
  result and a share of the start page then name the app and its topic. Another demo and a file
  of the user give the title of the piece (2.8).
- **Description**: `SITE_DESCRIPTION`, at most 155 characters, because a search result cuts a
  longer text. It names classical music and three composers of the demos.
- **Canonical URL**: `<link rel="canonical">` and `og:url` name `SITE_URL` in each build. The
  same build also deploys to GitHub Pages (9.2), so the copy there points to the main URL.
- **Share card**: Open Graph (`og:site_name`, `og:title`, `og:description`, `og:image` with its
  size and alt text) and `twitter:card` `summary_large_image`. The image is `public/share.jpg`
  (`SHARE_IMAGE`), 1200 × 630, which `pnpm share-image` writes. No element of the page loads it,
  so the first download (7.2) does not hold it. `theme-color` is the dark edge of the page
  background.
- **Share image**: the target is `docs/reference/share-card.webp`. A card shows small in a feed, so
  the image tells what the app is and shows the animals. It is a frame of the default demo during
  play from `SHARE_CAMERA` of `tools/share-image.ts`: above and behind the conductor, so that the
  players fill most of the width with depth. The camera stands a little left of the middle line,
  because the layout is wider on the right. The conductor stands in the middle of the lower half, no
  player is cut, and the head of each back row shows above the row in front of it. The front edge of
  the stage crosses the bottom. The build of the tool hides the visible beam of the stage (4.5), and
  the card adds no beam, so that the logo stands out on a dark wall. The target image has a cone of
  light behind the title, and the card leaves it out for this reason. The top third stays dark for
  the title: the paw and the wordmark in gold, and under them the line "A web-based MIDI player with
  an animal orchestra." in Fraunces (`SHARE_LINE`). The layer of `tools/share-card.ts` adds a
  vignette, a warm grade, and a soft glow. It blurs the hall wall behind the title, so that the wall
  is dark and smooth and no lamp shows there. Chromium draws the layer from HTML and CSS, so the
  tool needs no image library. The font file of the line (`assets/fraunces/fraunces.ttf`) stays out
  of the build, so the license file (7.3) does not change. A close shot of the players under the
  wordmark shows the faces larger at 300 px wide (`--camera` of the tool), but each trial cut or
  blurred a body at an edge or in front, so the card keeps the stage view of the target.
- **Icons and manifest**: `index.html` links `favicon.svg`, `apple-touch-icon.png` (180 px, the
  paw of the favicon on a full square, because iOS rounds the corners), and `site.webmanifest`
  with the name, the colors of the page, and both icons. The browser asks for them only when it
  needs them, so the first download (7.2) does not grow. The manifest names no service worker.
- **Structured data**: a JSON-LD `WebApplication` with the name, the URL, the description, the
  image, the category, the need for WebGL2 (2.6), and a free offer. It holds no personal data, so
  it has no `Organization` with a contact point and a postal address.
- **Crawlers**: `public/robots.txt` lets each crawler read each path, and names
  `public/sitemap.xml`, which lists the start page and the site pages. Both name `SITE_URL`. The
  development pages keep their `noindex` (7.1) and stay open in `robots.txt`, because a crawler
  that may not read a page does not see its `noindex`.
- **Text of the page**: Google renders the page, maybe with no WebGL2. With WebGL2, the page shows
  the wordmark as its `h1` (2.8), the piece title, and the intro line about the app. With no
  WebGL2, the full-page message shows the name as its `h1`, `ABOUT_TEXT`, and the message (2.6).
  Each text is visible, and each visitor gets the same HTML. The start page adds no long text for
  crawlers, because a visible text block covers the stage and a hidden one breaks this rule.
  An agent reads the Markdown copy and the site pages.
- **Site pages**: `tools/site-pages.ts` writes them from one source into the build. `/about`,
  `/contact`, and `/privacy` are static HTML pages in the colors of the UI, with all text in the
  HTML, because an agent checks such pages before it names a site. The contact page sends each
  message to the issues of the repository, so no page holds an email address.
- **Markdown for agents**: each site page and the start page have a Markdown copy. `llms.txt` holds
  the text of `index.md`, with the sections "When to use" and "When to use a different tool".
  The routes of `vercel.json` send the copy when the `Accept` header names `text/markdown`, and
  `404.md` with the status 404 for a missing path. Browsers do not name `text/markdown`, so they
  get the HTML. These paths send `Vary: Accept`, so that a cache keeps the two copies apart. The
  head of `index.html` names `index.md` as its alternate, for an agent that sends no such header.

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
| `models/` | The species, the studio bodies, the instruments, and `layoutScene()`. | yes | first download |
| `shots/` | The camera shots of 5.6: `prepareShots()` and `cameraAt()`. | yes | first download |
| `scene/` | Three.js: stage, lights, camera, quality tiers, poses applied to bones. | no | first download |
| `audio/` | The `Player`, the Worker, and the worklet processor. | no (the block scheduler is pure) | lazy |
| `app/`, `ui/` | Load flow, transport, seat list, URL hash, settings. | no | first download |
| `gallery/` | The development pages `gallery.html` and `views.html`. | no | own entry |
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

| Query | Effect |
|---|---|
| `page=species`, `page=instruments` | The species with their instruments, or each instrument alone. |
| `only=<list>` | Keeps the named species and instruments. The badger takes the instrument of a role. |
| `zoom`, `target`, `azimuth`, `elevation`, `x`, `z`, `distance` | Move the camera from the fit view, or to a fixed distance. |
| `body`, `head` | Turn the camera around the body of the first animal, or aim at its head. A close view of a new role thus needs no camera values. |
| `stand`, `rest` | Give each player the support `stand` (4.5), or the rest pose (5.2). |
| `lift=<share>`, `lower=<share>` | Show each animal at a share (0 to 1) of its lift or of its lowering, after its seeded delay (`moveTransport()`). |
| `probe=colors`, `normals`, `noshadow` | Show the face colors, the normals, or no shadow on the bodies (`applyProbe()`). |
| `fill=<lux>` | Add a light from the camera, so that a close view shows the side that the key light leaves dark. |

`pnpm close-views` uses these queries to show the moments and the views of each role of
`ROLE_VIEWS` in one grid, and `pnpm choir-check` to compare the penguin with the reference images.

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

### Development pages on the site

The site holds `gallery.html` and `views.html`, because the screenshot script and the review
checks open them on the built site. No page links them, and each one has
`<meta name="robots" content="noindex" />`, so that search engines leave them out.

## 7.2 First download

The first download is less than 1 MB (`SIZE_LIMIT_BYTES` of `tools/size.ts`). CI fails above the
limit and prints the size on each run. The limit goes up only with the approval of the project
owner. A change that moves the size by more than 5 KB states the reason in its commit message.

`pnpm size` (`tools/size.ts`) sums the gzip sizes of `index.html`, the CSS, the entry chunk with
its static imports and their assets, and the MIDI file of the default demo (`DEFAULT_DEMO`, 8.2).
It does not count the audio code, the SF3 files, the development pages, and the other demos. The
app loads the audio code after the first frame, and another demo when the user selects it. A
file that is gzip data already counts with its own size, because the host sends it with no
second gzip. `--base <ref>` also builds a commit, and prints both totals.

The packed meshes of the studio bodies are most of the first download. The default demo casts
nearly all bodies, so all bodies stay in the first download, and each packed mesh has a gzip
budget (`STUDIO_MESH_GZIP_BUDGET` of `tools/studio-budgets.ts`). `packStudioMesh()` writes one
stream for each kind of number, so that gzip finds the repeats.

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
   score ─> models and layout ─> pose plan ─> shot plan ─> scene steps (GPU waits)
```

- **Step form.** A long pure calculation has a step form: a generator that yields between its
  steps (`Steps` of `score/steps.ts`). A step reads no clock, so `runAll()` of a tool and the
  slices of the app give the same result.
- **Slices.** `runSliced()` of `app/slices.ts` runs steps until `SLICE_MS` pass, and then gives
  the main thread back with `scheduler.yield()`, or a `MessageChannel` message. A step that waits
  for the GPU yields `wait`. A later selection stops a build at its next slice. The builds run
  one after the other, because they share the renderer.
- **Scene build.** `StageScene.prepareSteps()` builds the scene of a layout, and `show()` swaps
  it in one task. The steps compile the programs of each pass with a render target, as the pass
  draws them, and wait for `KHR_parallel_shader_compile`. The bake, the environment, and the
  capture render in steps, with a fence wait at the end of each, because an upload waits on the
  main thread while the GPU is busy. One draw of each player geometry on a warm layer uploads its
  buffers and builds its morph texture. The first frame thus compiles and uploads nothing new.
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

The main URL of the site is `https://www.zoophony.com/` (`SITE_URL` of `app/page-title.ts`). The
plugin `INDEX_VALUES` of `vite.config.ts` writes the texts of this section into `index.html` from
the constants of `app/page-title.ts`, so that the page and the app cannot differ.

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
  the stage crosses the bottom. The build of the tool hides the visible beam of the stage (4.5),
  and the card adds no beam, so that the logo stands out on a dark wall. The target image has a cone
  of light behind the title, and the card leaves it out for this reason. The top third stays dark
  for the title: the paw and the wordmark in gold, and under them the line "A web-based MIDI player
  with an animal orchestra." in Fraunces (`SHARE_LINE`). The layer of `tools/share-card.ts` adds a
  vignette, a warm grade, and a soft glow. It blurs the hall wall behind the title, so that the wall is dark and smooth and no lamp
  shows there. Chromium draws the layer from HTML and CSS, so the tool needs no image library. The
  font file of the line (`assets/fraunces/fraunces.ttf`) stays out of the build, so the license file
  (7.3) does not change.
- **Structured data**: a JSON-LD `WebApplication` with the name, the URL, the description, the
  image, the category, the need for WebGL2 (2.6), and a free offer. It holds no personal data, so
  it has no `Organization` with a contact point and a postal address.
- **Crawlers**: `public/robots.txt` lets each crawler read each path, and names
  `public/sitemap.xml`, which lists the start page and the site pages. Both name `SITE_URL`. The
  development pages keep their `noindex` (7.1) and stay open in `robots.txt`, because a crawler
  that may not read a page does not see its `noindex`.
- **Text of the page**: Google renders the page, maybe with no WebGL2. With WebGL2, the page shows
  the wordmark as its `h1` (2.8), the piece title, and the intro line with the name and one line
  about the app. With no WebGL2, the full-page message shows the name as its `h1`, `ABOUT_TEXT`,
  and the message (2.6). Each text is visible, and each visitor gets the same HTML. The start page
  adds no long text for crawlers, because a visible text block covers the stage and a hidden one
  breaks this rule. An agent reads the Markdown copy and the site pages.
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

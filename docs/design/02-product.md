# 2. Product

## 2.1 Input

- The user drops a `.mid` file on the page, or selects a file with a button. Each file goes
  through the file rules of 3.3. A drop of several files plays the first one. The drop overlay
  shows only for a drag of files.
- The user selects a demo from the demo list (section 8).
- Version 1 has no URL load and no live MIDI input. With a file, the app knows each note before
  it sounds, so an animal can move before the note.

## 2.2 First screen

- At start, the app selects the default demo (`DEFAULT_DEMO`, 8.2), because the default is a
  positive and cheerful piece. Its orchestra sits in the rest pose (5.2), a large play button
  starts the music, and the samples load right after the first frame.
- The URL hash `#demo=<id>` opens a demo (`fileFromHash()` in `app/demos.ts`). A selection in the
  demo list writes the hash with `history.replaceState()`. `film=1` in the hash starts the first
  play in Cinematic mode (`filmFromHash()`), and each change of the mode writes or removes it, so
  that a copied link opens the same piece in the same mode. A dropped file removes the hash,
  because a link cannot open a file of the user.
- "Copy link" in the settings of the drawer gives the URL of the page: the share sheet of the
  system on a touch device, else the clipboard with a short status line (`shareLink()` of
  `app/share-link.ts`).
- Only the first screen waits for a click, because the browser needs a user gesture before it
  plays audio. A piece that the user selects later starts when its samples are ready.
- A click on play while the samples load starts the piece when they are ready, and a second click
  cancels the wait (`playAction()` in `app/play-control.ts`). The click resumes the suspended
  `AudioContext` at once, because Safari can refuse a resume outside a user gesture (6.8).
- A demo file that does not load keeps the current piece and shows its message with "Try again"
  (`noPieceStatus()`).
- The last selection wins. A selection, also of the demo that shows, stops each earlier selection
  that still loads (`App.select()`).

## 2.3 Layout

The UI has the style of a video player. The theme is dark only, because the scene is dark.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Logo (paw, Pawchestra)                               ┌─────────────────┐ │
│ Title of the piece                                   │ Drawer:         │ │
│ Composer                                             │                 │ │
│                                                      │  Music          │ │
│                                                      │  Seats          │ │
│                 3D scene (canvas)                    │  Settings       │ │
│                                                      │  (Credits)      │ │
│                                                      │                 │ │
│                                                      └─────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────────────┐ │
│ │ [>] 1:23 ---o----------- 5:16  1.0×  vol --o-  [c] [o] [ ] [|]       │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

- The bar holds play and pause, the seek bar, the times, the speed, the volume, and the buttons
  "Cinematic camera", "Reset view" (2.5), full screen, and the drawer. During play, the bar and
  the pointer hide after a short time with no pointer motion. A hidden bar ignores the pointer, so
  the first tap only shows it.
- The bar keeps its place at the bottom of the window in both camera modes. In Cinematic mode it
  covers the bottom of the frame when it shows, because a bar that moved at each change of the
  mode looked like a fault.
- In Cinematic mode, the piece title, the composer, and the link to GitHub fade out and stay
  hidden, because the title card shows the piece in the frame. The logo stays at the top-left
  corner of the frame and moves with the bars (`--letterbox` and `--letterbox-side` of
  `ui/ui.css`). The title stays a live region, so that a screen reader still reads a new piece.
  The link hides after the fade, so that it takes no focus and no pointer.
- In Cinematic mode during play, all controls and panels hide after the same time: the bar, the
  drawer (also when it is open), each tooltip, and the pointer (`uiShown()` of
  `app/bar-rules.ts`). A pointer motion, a tap, or Tab shows them all. They stay while the
  pointer is over the bar or the drawer, while one of these has the keyboard focus, and while a
  dialog or a message is open. A pause shows them, and an open drawer comes back open. They fade in 0.2 s, at
  once with reduced motion. Free mode hides only the bar, because there the user works with the
  view and the drawer.
- Each change from Free mode to Cinematic mode closes the drawer, so that the film starts with no
  panel. A pointer motion, a tap, or Tab then shows the bar, and the drawer stays closed. The
  drawer button opens it. A change back to Free mode does not open the drawer again, so that a
  drag does not make a panel jump into view.
- The drawer has the tabs "Music" (the demos and the file button), "Seats", and "Settings" (with
  the link "Credits"). The UI says "Music", because each user knows the word, and it covers a demo
  and a MIDI file of the user. "Track" names a track of a MIDI file, and "song" does not fit the
  movement of a symphony. The code keeps the names "demo" and "piece". Each tab shows a 16 px
  icon before its text: two notes for "Music", a seat of a hall for "Seats", and two sliders for
  "Settings" (`TAB_ICONS` of `ui/drawer.ts`).
- Each seat row has a mute button and a solo button. In Free mode, a click on an animal toggles the
  solo of its seat, and a label shows the seat for 2 s above the click, for example "Violins 1, 4
  rabbits" (`PICK_LABEL_MS`). A click on the floor or the empty space clears each solo, and a
  click on the conductor does nothing. A child asks what one animal sounds like, and the animal
  on the screen is the clearest control. The ray of the click tests the player boxes of
  `prepareClearance()` (`pickPlayer()` of `app/pick.ts`), and it goes through the stands and the
  risers, because the box of a thin stand covers the player behind it. A click is a press and a
  release of at most `CLICK_SLOP_PX`, so a drag still turns the view. In Cinematic mode a tap
  only shows the hidden UI (2.3).
- The UI uses the system fonts, so the first download does not grow and no request goes to a
  font server.

## 2.4 Play, load, and keyboard

- Play waits until all samples of the file are loaded and decoded. The speed goes from 0.5× to
  1.5×.
- Space plays and pauses. The left and the right arrows seek 5 s, and Home goes to the start. The
  up and the down arrows move the volume slider by 5 of 100, and turn the mute off, as the slider
  does. C toggles the cinematic camera, M the mute, and F the full screen. Escape closes the
  drawer, a message, or the dialog. The keys do nothing in a text field, with Ctrl, Alt, or Meta,
  while the dialog is open, and when the focused control uses the key (`keyAction()` in
  `app/keys.ts`). C also acts on a focused button or slider, because no control uses it. A row of
  the piece list uses only Enter, so Space plays and pauses after a click on a piece.
- A solo moves the spotlight to the soloed players. The solo flags alone give the light, so a
  seek, a pause, and a mute keep it (4.5, 6.6).
- A click on play starts a count-in of the conductor before the music (5.4, 6.5).
- The Media Session gives the piece to the system: the title, the composer, `share.jpg`, and the
  actions play, pause, and seek (`SystemMedia` of `app/system-media.ts`). Thus the lock screen,
  a headset, and the media keys control the music.
- During play, a screen Wake Lock keeps the screen on, because a phone locks its screen during a
  long piece with no touch. A pause and the end release it. The browser releases it when the tab
  hides, so the app asks for it again when the tab shows.
- The app makes the `AudioContext` and loads the worklet before the first click, and the click
  resumes it. On iOS, `playWithSilentSwitch()` sets `navigator.audioSession.type = 'playback'`, so
  that the silent switch does not mute the music.

## 2.5 Camera

The camera has two modes: a free orbit camera and a cinematic camera that cuts between shots. The
page starts in Free mode (`app/camera-mode.ts`).

```text
                page load
                    │
                    v
             +-------------+
             |    FREE     |  orbit camera
             +-------------+
                │       ^
   "Cinematic   │       │  drag, wheel, pinch (at once),
    camera", C  │       │  "Cinematic camera", C (blend), or
    (blend)     │       │  "Reset view" (Free, default view)
                v       │
             +-------------+
             |  CINEMATIC  |  cameraAt()
             +-------------+
```

- The default view has the angle of view of `orchestra-latest.png` (1). It frames the used seats
  in the free area beside the open drawer (4.5).
- In Free mode, the canvas has the cursor `grab`, and `grabbing` during a drag. During the first
  piece, a hint "Drag to look around" shows with the bar above it, until the first drag or pinch
  of the session (`DRAG_HINT_TEXT`), because nothing else tells that the view turns.
- **Free** is the orbit camera. After a drag, a pinch, or a wheel in Cinematic mode, it starts
  from the current camera, so the view does not jump. It cannot go below the stage, and a zoom
  stops outside the box of the stage and the players.
- "Watch as a film" on the first screen (2.8) and `film=1` in the hash (2.2) change to Cinematic
  mode at the next play. A change of the mode by the user before the play cancels it.
- **Cinematic** takes each frame from `cameraAt()`: the shots of 5.6, with short cutaways to
  details of the playing, and the focus on the eye of the hero of each shot. The first shot
  starts from the default view, so a click on play makes no cut. A drag, a pinch, or a wheel changes to Free
  at once. The change to Cinematic mode closes the drawer (2.3).
- **Letterbox.** Cinematic mode shows the scene in the largest box of the aspect 21:9
  (`CINEMA_ASPECT`) at the middle of the viewport, as a film. Pure black bars fill the rest: at
  the top and the bottom of a view narrower than 21:9, and at the sides of a wider view. The
  frame is the same in each view, also on a phone in portrait, as a film player shows a film. The
  shots of 5.6 take this aspect in each view, so a piece gives the same film on each screen. The
  drawer and the bar do not move the frame. The title stands at its top-left corner (2.3). Free
  mode has no bars.
- On a touch screen in portrait, the frame fills about a fifth of the screen height, so one line
  below it says "Turn the phone for a larger film." (`TURN_HINT_TEXT`). A portrait shot plan
  would break the rule of the same film on each screen, so the frame stays.
- **Mode blend** (`MODE_BLEND`, `scene/mode-blend.ts`). The toggle moves the camera into the new
  mode as a crane move of a film, with a smoothstep, because a cut from the orbit view into a
  close shot was jarring. A blend into Cinematic mode goes to the live camera of the shots, which
  moves on. A blend into Free mode goes back to the camera of Free mode at the last change into
  Cinematic mode, or else to the default view.
- The blend turns around the points that the two cameras look at. The point moves on a line, and
  the camera moves on a sphere around it: the azimuth turns the short way, so a camera on the
  other side of the stage goes around the players. A camera that comes nearer first turns and
  then dollies in on the line of sight of the new camera, and a camera that goes away first
  dollies out. The distance swells with the turn in the middle, as a crane swings out. A blend
  with one weight for all parts came nearer than `ANIMAL_FLOOR` (5.6) to an animal in the middle
  of many blends into a low shot. The ends keep the floor, and a few blends into a low solo or
  section shot still come near for a short time.
- Each change of the mode blends the bars, the field of view, the beam, the light of the shot,
  and the focus over the same time, so the frame does not jump. The image of the camera moves with the
  bars (`StageCamera.frameTo()`). A drag, a pinch, a wheel, or "Reset view" moves the camera at
  once, because the user takes the camera. A drag, a pinch, or a wheel during a blend into Free
  mode stops it, and the orbit continues from the camera on the screen.
- Each frame of a blend moves the values on the screen a part of the rest of the way to the live
  values (`blendShare()`). Thus a cut of the shots or a seek during the blend does not jump, and a
  change during a blend starts a new blend from the frame on the screen. The blend runs on the wall
  time, so it also runs during a pause.
- On the first screen in Free mode, the frame shrinks until the stage is clear of the play button
  (2.8). Cinematic mode keeps the full letterbox frame, and the button shows over the film for a
  moment, because a shrink that grows back at the first play reads as a zoom of the film. The
  frame uses the view of the stage at the default distance in the current direction, so a drag
  changes it and a zoom does not. Thus a wheel or a pinch zooms the camera there as during play,
  and a zoom in can move the stage under the play button.
- A pinch never zooms the page, because the page is the frame of the stage. On the stage, a pinch
  zooms the camera. The root takes `touch-action: pan-x pan-y`, and the app stops the gesture
  events of Safari, which does not obey that rule for a pinch.
- With reduced motion, Free mode has no inertia, a shot holds its first camera with no drift
  (5.6), and each transition is a hard cut, also a change of the mode.
- A new piece keeps the mode and makes new shots. The shots do not follow a solo, because they come
  one time from the score. No setting stores the mode.

## 2.6 Quality tiers and browser support

The tiers are High, Medium, and Low (`TIER_SETTINGS` of `scene/quality.ts`). The low tier has no
bloom, no lens fringe, no depth of field, and no dust motes. Only the high tier has the floor
gloss and the full contact shade at half size (4.5), because they read the depth many times for
each pixel. The medium tier has a cheap contact shade at a quarter size, so a phone does not look
flat. The low tier has neither. The medium and the low tiers load the color maps and the normal
maps of the bodies at half size (`bodyMapScale`), because the maps of a large cast at full size
took about four times the GPU memory, and a phone browser can lose the WebGL context. A map keeps
the size of its load when the tier drops later. No tier has side light shadows, because they cost GPU time in each frame and changed only small shadows on the players. Each tier
keeps MSAA, because the hard edges of the low-poly parts show steps (4.5). No tier uses the full
pixel ratio of a Retina screen, because the GPU time grows with the pixels and the frame target of
9.7 comes first. The image is a little softer.

- A touch screen (`(pointer: coarse)`) or a small screen starts at the medium tier, and other
  devices at the high tier. The app does not read the GPU name, because Safari on iOS gives only
  "Apple GPU".
- The automatic tier drops one step when the frames are slow for a time window (`followFrame()`
  in `app/settings.ts`). The steps are High, Medium, Medium at the pixel ratio 1.25 and then 1.0
  (`medium-125`, `medium-100`), and Low (`LOWER_TIER`). The pixel count goes down before the post
  effects, because it is a smooth lever and the post effects make the look of the film. The
  settings show a step as "Auto (Medium)". On a screen with the device pixel ratio 1, the two
  steps change nothing, so the drop to Low takes two more windows. It measures the time between frames, because the work time of a frame
  does not hold the GPU time. It measures only during play, with a visible tab, with no build of a
  scene, and with the setting "Auto". The slices of a build make the frames slow on each GPU. The
  tier only goes down, so the quality does not go down and up many times.
- A steady 30 fps or 50 fps does not drop the tier (`slowWindow()`), because energy saver modes
  and 50 Hz displays cap the rate, and a lower tier does not make these frames faster.
- A manual setting overrides the automatic tier. The setting "Frame rate" draws at each refresh
  ("Auto"), or caps the rate at 60 or 30 fps (`frameDue()`).
- A change of the tier compiles the new post passes in the next frames, one step in each frame
  (`PostPipeline.setTier()`). The post effects keep the old tier until the GPU links the new
  programs, because a frame that links a program waits on the main thread.
- The app needs WebGL2 (`probeWebgl2()` of `app/webgl.ts`). With no WebGL2, a full-page message
  replaces the stage and the UI.
- Supported browsers: the current and the previous major versions of Chrome, Firefox, and Safari
  (macOS and iOS), and Android Chrome.

## 2.7 Privacy

The site counts the page views with Vercel Web Analytics (`@vercel/analytics`), and has no cookies
and no service worker. The owner of the project needs the number of visits, and Web Analytics
gives it with no cookie and no identifier that follows a visitor to other sites.

- Only the build of `pnpm deploy:vercel` loads the analytics. The script sets
  `PAWCHESTRA_ANALYTICS=1`, and `vite.config.ts` gives the constant `PAWCHESTRA_ANALYTICS` to
  `src/main.ts`. The dev server and the local builds load no analytics. Thus the local probes get
  no request for a missing script, and the dev server sends no request to a host of Vercel.
- `inject()` loads `/_vercel/insights/script.js` from the site itself, and the script sends the
  page views to the same site.
- The app page gives one page view at each load. A demo selection changes only the hash with
  `history.replaceState()`, and the script counts a page view only at a new path. The pages of 7.4
  run no script, so they give no page views. The app sends no custom events.
- For each page view, Vercel stores the URL, the referrer, the place, the browser, the operating
  system, and the type of device. It identifies a visit with a hash of the request, and discards
  the hash after 24 hours.
- Web Analytics must be on in the settings of the Vercel project. Else the script gets a 404, and
  the app works with no count.

The link to the repository on GitHub (2.8) is a plain link. The page loads nothing from GitHub,
and the link sends no referrer (`rel="noopener noreferrer"`).

The page `/privacy` (7.4) gives these facts to the visitors, from `PRIVACY` of
`tools/site-pages.ts`. A change of this section updates that page in the same commit.

## 2.8 UI spec

The prototype [`prototype/ui.html`](../prototype/ui.html) and its screenshots show the tokens
and the layout, and `reference/mockup.png` is the target of the look. The CSS of the app is in
`ui/ui.css`.

**Tokens**

| Token | Value |
|---|---|
| `--bg-overlay` | `rgba(16, 13, 11, 0.72)`, with `backdrop-filter: blur(10px)` |
| `--panel` | `#17130f` |
| `--panel-glass` | `rgba(21, 18, 16, 0.96)`, with `backdrop-filter: blur(16px)` (the floating panel of the drawer) |
| `--line-faint` | `rgba(255, 240, 220, 0.06)` (the line between two rows of a list, and the hover of a seat row) |
| `--line` | `rgba(255, 240, 220, 0.10)` |
| `--pill-line` | `rgba(255, 240, 220, 0.24)` (the outline of the pill "Open source") |
| `--text` | `#efe8dc` |
| `--text-dim` | `#b5aa99` |
| `--accent` | `#e7b45a` (the warm gold of the spotlight) |
| `--accent-strong` | `#f0c676` (hover) |
| `--on-accent` | `#1a140d` (an icon or a text on `--accent`) |
| `--danger` | `#e0796a` |
| `--title-shade` | `rgba(11, 9, 8, 0.8)` (the darkest part of the title shade) |
| `--github-mark` | `#c8c8c8` (the neutral gray of the GitHub mark, as the logo rules of GitHub ask) |
| `--track` | `rgba(255, 240, 220, 0.2)` (the track of a slider, where it is not filled) |
| Font | `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` |
| `--font-serif` | `"Palatino Linotype", Palatino, "Book Antiqua", "Iowan Old Style", Georgia, "Noto Serif", serif` (the piece title) |
| Font sizes | 12 px for times (tabular numbers), 13 px for secondary text, 14 px body. The piece title is `clamp(24px, 2.5vw, 36px)` (32 px at 1280 px), and the composer `clamp(13px, 1.15vw, 16px)` |
| Radius | 10 px for panels, 12 px for the floating panel of the drawer and for the bar, 8 px for buttons |
| Control size | at least 40 px for the controls of the bar and the first screen. 32 px for the compact controls in the drawer, in messages, and in dialogs (tabs, M, S, segmented buttons, close, the link "Credits"). At least 44 px for every control on a touch screen |
| Focus | a 2 px ring in `--accent`, with a 2 px offset, and the button radius on a slider |
| Button states | the hover and the color change in 120 ms (none with reduced motion), and a pressed button gets `rgba(255, 240, 220, 0.18)`. The large play button gets `--accent-strong` and the scale 0.96 while pressed |

**Components**

The modules of `ui/` and `app/` hold the sizes, the places, and the motions. Each motion is
instant with reduced motion. Each text keeps the contrast 4.5:1 of WCAG AA over the scene.

- **Title**: the logo (a gold paw and the wordmark "Pawchestra" in Fraunces, one SVG path
  `WORDMARK_PATH`, so no font file loads), the piece title, and the composer. The wordmark is the
  `h1` of the page, with the name as its accessible name, because the page is the app. The piece
  title is an `h2`. A gray pill with the
  GitHub mark and "Open source" (`REPOSITORY_TEXT`) links to `REPOSITORY_URL`. It is gray, because
  the logo rules of GitHub permit only white, black, or gray. `index.html` holds the title lines
  of the default demo, and the app keeps that header, so the piece title paints with the first
  paint (7.2). A hash that names a demo clears the lines before the first paint, and the app
  writes the title of its demo. The full-page message of 2.6 removes the header. In Cinematic
  mode, the header shows only the logo (2.3).
- **Title shade**: one fixed gradient in `--title-shade` from the top-left corner of the frame
  covers the title and fades out below it and right of it (`.title::before` of `ui/ui.css`), with
  a tight text shadow on the letters. It keeps 4.5:1 for each line over a white animal, and it has
  no visible shape. In Cinematic mode it covers only the logo line. A shade for each line, with a
  level from a read of the frame behind it, showed as a dark smudge on the light beam, and the
  read raised the p95 of the main thread by about 1 ms. `e2e/title-shade.e2e.ts` checks the
  contrast and the edges.
- **Title card**: in Cinematic mode, the song start shows the composer in spaced gold capitals, a
  short gold rule, and the piece title in the serif, centered in the lower part of the frame, as
  the main title of a film (`ui/title-card.ts`). A window in portrait shows it in the top bar of
  the letterbox, just above the frame. Its opacity is a function of the song time
  (`TITLE_CARD`, `titleCardLevel()` of `app/title-card.ts`), so a pause holds it and a seek is
  correct. It fades in after the count-in and fades out a few seconds later. With reduced motion
  it shows and hides with no fade. A soft shade keeps 4.5:1 over the stage. A screen reader skips
  it (`aria-hidden`), because the live region of the title reads the piece. Free mode has no card,
  because the title shows there.
- **End card**: at the song end, after the bow of the conductor, the card shows the composer,
  the piece title, "Play again", and "Next: {title}" with a ring that counts down 10 s
  (`END_CARD` of `app/end-card.ts`). At the end of the count, the next demo of `DEMO_IDS`
  starts, and the last demo goes back to the first. A tap or a key stops the count, and the ring
  goes. The end of a performance is the moment of the next choice, and a stop with no next step
  ended the session. The opacity is a function of the song end and the time since the transport
  stopped there (`endCardView()`), as `titleCardLevel()` is of the song time, so a seek back or a
  play hides it. A file of the user has no next demo, so its card shows only "Play again". The
  card shows in both modes, with no fade with reduced motion.
- **Bar**: "Cinematic camera" is pressed in Cinematic mode. At the song end, play becomes "Play
  again" (6.5), and the end card offers the next demo. The seek bar seeks only when the samples are
  ready (`app/seek.ts`). The volume gain is the square of the position (6.8). The drawer button says
  "Open the drawer" or "Close the drawer", and the full screen button "Full screen" or "Exit full
  screen". Each control stays inside the bar at each width. From 900 px, the controls stand in the
  groups of the mockup. From 700 px to 899 px, the groups do not fit, so the controls stand closer.
  The volume slider shrinks to half its width before a control leaves the bar.
- **First screen**: a round play button below the front edge of the stage, so that it does not
  cover the orchestra. In Free mode, the camera frame shrinks until the stage is clear of it
  (`clearFirstScreen()`). Cinematic mode keeps its full frame (2.5). A ring shows the load
  progress of the bytes, and the load text counts the files (`loadText()`). Until the first play,
  an intro line tells what the app does, "Watch as a film" starts the piece in Cinematic mode,
  and "Select music" opens the demo list. The line names the classical music before the MIDI
  file, because most visitors have no MIDI file. The film is the best view of the app, and its
  icon in the bar has no text and no tooltip on a touch screen, so the first screen names it.
  While the drawer shows the demo list, "Select music" has nothing to open, so it hides. "Watch as
  a film" keeps the height of the line, so that the first screen keeps its size. A wide window
  opens the drawer at the demo list at start, so there the film button shows alone. ASD-STE100
  has no verb "choose", so the buttons say "Select".
  `index.html` holds the same load state as static HTML and the style sheets in its head (inline
  in the build, 7.2), so the first paint shows no unstyled page.
- **Drawer**: a floating panel in `--panel-glass`, nearly opaque, so that its dim text keeps
  4.5:1 over white fur. Only the panel of the current tab scrolls. The arrow keys, Home, and End
  move between the tabs, as the tabs pattern of WAI-ARIA says. While the drawer is open in Free
  mode, the camera moves its frame with `setViewOffset()` (`stageCover()`), and the canvas fills
  the window, so the opaque canvas shows no edge. A wide window opens the drawer at start
  (`isWideLayout()`), so that the stage does not move at the click on play. The change to
  Cinematic mode closes it (2.3).
  - **Demos**: a row with the title, the composer, and the length, and no cover. A long title
    wraps, because an ellipsis would hide a part of it. The current row has a level meter from the
    notes of the score (`meterLevels()`), so the UI owns no audio code. The meter has a column of
    its own, so the text does not move. After a file of the user plays, a row "Your file:
    {title}" at the top of the list plays it again, so that the user can go back to it after a
    demo. The row holds the file in memory only, so a reload removes it (2.7).
  - **File button**: "Open a MIDI file", with the second line "From this device, or drop it on the
    page" ("From this device" on a touch screen). It stands below the demo list, because it also
    selects a piece. It does not say "Upload", because the file stays on the device.
  - **Seats**: a row with a dot in the fur color, the seat name, the animal line, and the toggle
    buttons "Mute" and "Only this" (`aria-label` "Mute {name}" and "Only this: {name}"). The words
    replace the letters M and S of audio software, because the app is for the public, and they
    fit on a phone too. Each label starts with the visible word, for voice control (WCAG 2.5.3).
    Only a screen reader reads the source line. The dot keeps its full size and color, because it
    links the row to the animals. The level shows only in a ring around the dot with a soft glow
    (`seatLevels()`). A dark fur gets a lighter ring that keeps 3:1 (`ringColor()`). A silent seat
    has a dim dot and dim text, so a solo shows in each row.
  - **All seats**: a row above the seat list. A click clears each mute and solo flag. It is
    pressed and dim while no seat has a flag, and in the accent color while a flag is on.
  - **Settings**: "Section size" (Auto, One per part, Full), "Quality" (Auto, High, Medium, Low),
    and "Frame rate" (Auto, 60 fps, 30 fps). "Auto" names its current value, such as "Auto
    (Full)". `SETTING_HELP` gives the help lines. A counter beside "Frame rate" shows the drawn
    rate (`measuredFrameRate()`).
  - **Credits**: the link "Credits" is a `button` with `aria-haspopup="dialog"`, because it opens a
    native `<dialog>` and goes to no page. The dialog has the layout of the end credits of a film:
    a title card with the author, then "Now playing" (8.2), "Sounds" (6.2, 6.8), and "Other
    pieces" (7.3, 8.1), and an end card with the copyright line and "Third-party licenses"
    (`creditTexts()`). Each link opens a new tab, so that the music does not stop.
- **Phone**, narrower than 700 px: the drawer is a sheet above the bar with a drag handle, and a
  selection closes it. The speed, the volume, "Reset view", and full screen move into the group
  "Playback" of the settings, so that the page has one control of each kind. The bar shows no
  duration, so that the seek bar is longer. The top inset of the title (`--title-top`) keeps the
  touch area of the link to GitHub inside the window.
- **Messages**: at the bottom center above the bar, with a bar in `--danger`. A message closes
  after a few seconds, with "Close the message", or with Escape. It stays while it has the pointer
  or the focus (`followMessage()`). A new message or a new piece replaces it. The failure texts
  end with "Check the connection.", because the button "Try again" stands next to them.
- **Build cover**: the canvas fades out before a build and in after the first render.
- **Page title**: "{title}, {composer} · Pawchestra" for a demo, and "{title} · Pawchestra" for a
  file (`pageTitle()`). The default demo keeps the title of the start page (7.4).
- **Tooltips** name the action and its key: "Play (Space)", "Pause (Space)", "Play again (Space)",
  "Seek (← →, Home)", "Mute (M)", "Volume (↑ ↓)", "Cinematic camera (C)", "Full screen (F)", "Exit
  full screen (F)", and "Speed", "Reset view", and "Open the drawer" with no key. The tooltip of the
  seek bar adds the time under the pointer before its text, "1:23 · Seek (← →, Home)", and follows
  the pointer. The link to GitHub shows "Pawchestra on GitHub". The tooltips keep their keys,
  although the mockup shows only the names, because they are the only visible hint of the keys. A
  tooltip follows WCAG 1.4.13, and never shows for a touch. A bar that hides hides only the tooltips
  of its own controls, so the tooltip of the link to GitHub stays while the link has the focus. A
  screen reader skips it, because `aria-label` and `aria-keyshortcuts` give the name and the key.
- **Icons**: inline SVG, 20 × 20, stroke width 1.75, round caps and joins, `currentColor`
  (`ui/icons.ts`). "Cinematic camera" shows an open clapperboard. It reads as film at 20 px,
  with the stroke weight of the other icons. A movie camera with two reels is too busy at 20 px,
  a frame with filled letterbox bars reads as a card, a film strip reads as a media file, and a
  still camera looks like a button that takes a photo.

**Seat texts**

| Section | Name | One player | Section | Name | One player |
|---|---|---|---|---|---|
| violin | Violins | Violin | horn | Horns | Horn |
| viola | Violas | Viola | trumpet | Trumpets | Trumpet |
| cello | Cellos | Cello | trombone | Trombones | Trombone |
| contrabass | Contrabasses | Contrabass | tuba | Tuba | Tuba |
| harp | Harp | Harp | timpani | Timpani | Timpani |
| piano | Piano (see below) | Piano | percussion | Percussion | Percussion |
| flute | Flutes | Flute | choir | Choir | Voice |
| oboe | Oboes | Oboe | sound-only | Other sounds | Other sounds |
| clarinet | Clarinets | Clarinet | | | |
| bassoon | Bassoons | Bassoon | | | |

`app/seat-text.ts` makes the texts.

- A seat with one player takes the name in the column "One player". The soloist (3.8) that does
  not sit at a keyboard adds "soloist", for example "Flute soloist", because "Solo flute" reads
  as an action. A chamber group of 4.2 names no soloist.
- A seat of the section "piano" takes the name of its first program (`keyboardName()`): programs 0
  to 5 "Piano", 6 "Harpsichord", 7 "Clavinet", 8 "Celesta", 16 to 20 "Organ", 21 and 23
  "Accordion", and 22 "Harmonica". The piano model stays.
- If more than one seat of a section has a name, the name gets the number of the seat in that
  section, from 1: "Violins 1", "Violin 2", "Choir 3". The soloist gets no number, and the other
  seats of its section do not count it.
- The animal line gives the number of players and their species: "5 rabbits", "1 deer", "8 red
  foxes" (`animalText()`). The sound-only seat shows "No animal".
- The source line names the ports (from 0), the channels (1 to 16), and the programs or kits
  (from 0) of the seat (`sourceLine()`): "Port 0, channels 7 and 10, program 47, kit 48". The
  sound-only seat names only its programs and kits (3.7): "Programs 80 and 81". A list of three
  or more items uses commas and "and": "channels 1, 2, and 9".

**Message texts**

| Case | Text |
|---|---|
| Not a valid MIDI file | This file is not a valid MIDI file. |
| Format 2 | This MIDI file uses format 2. The player supports format 0 and format 1 only. |
| More than 4 MB | This file is larger than 4 MB. Select a smaller file. |
| No notes | This MIDI file has no notes. |
| No WebGL2 (a full-page message) | This browser cannot show the orchestra, because it does not support WebGL2. Use a current version of Chrome, Firefox, or Safari. |
| Above the full-page message: the name (24 px) and one line about the app (16 px, dim) | Pawchestra / An orchestra of animals plays your MIDI file. |
| Demo file failure (with a "Try again" button) | The demo did not load. Check the connection. |
| Load failure (with a "Try again" button) | The instruments did not load. Check the connection. |
| Audio failure after the load, for example during play (with a "Try again" button) | An error stopped the music. Try again. |
| Load progress before the file of the first piece shows | Loading |
| Load progress before the list of the preset files is known | Loading instruments |
| Load progress | Loading instruments: {done} of {total} |
| Load progress after a long load, when the sizes are known (megabytes of 1,000,000 bytes, one decimal) | Loading instruments: {done} of {total} ({arrived} of {sum} MB) |
| Second line of the load text while the piece waits for its samples | The music starts after the load. |
| Drop overlay | Drop the MIDI file to play it. |
| First screen, until the first play of the session | An orchestra of animals plays classical music. It also plays your MIDI file. |
| First screen, the button that opens the demo list | Select music |
| First screen, the button that starts the piece in Cinematic mode | Watch as a film |
| Settings, the button that copies or shares the link of the page | Copy link |
| Over the stage in Free mode, until the first drag | Drag to look around |
| Demo list, the row of the last file of the user | Your file: {title} |
| End card, the two buttons | Play again / Next: {title} |
| Label above a clicked animal, for 2 s | {seat name}, {animal line} |
| Below the frame of Cinematic mode on a phone in portrait | Turn the phone for a larger film. |
| Status after the link is in the clipboard | The link is copied. |
| Status after the browser did not copy the link | The link did not copy. Copy it from the address bar. |
| Seat row, the mute button and the solo button | Mute / Only this |
| Row above the seat list that clears each mute and solo flag | All seats |

**Accessibility**

- Each control is a `button`, an `input type="range"`, or a `select`, with an `aria-label`. A demo
  row has the label of its title, its composer, and its spoken length (`demoRowLabel()`).
- Each toggle button has `aria-pressed`. Each tab has `role="tab"` and `aria-selected`.
- The seek bar has an `aria-valuetext`, for example "1 minute 23 seconds of 5 minutes 16 seconds".
- The canvas has `role="img"` and the `aria-label` "An orchestra of animals on a stage".
- Polite `aria-live` regions announce the load progress, the messages, and the title of each new
  piece.
- The focus order is the title, the bar, then the drawer.
- When a focused play button of the first screen or a focused message goes away, the play button
  of the bar gets the focus. When the drawer closes with the focus in it (Escape, or a selection in
  the sheet of a phone), the drawer button gets the focus. The change to Cinematic mode gives the
  focus to the drawer button only when the focus came into the drawer from the keyboard
  (`closeDrawerForFilm()`). Else the focus goes, so that the bar hides, no tooltip stays on the
  film, and Space pauses. The drawer records the kind of each focus when it comes, because
  Chromium shows a focus from a click as a keyboard focus after the next key press.
- A row of the music list that a click focused shows no focus ring, also after Space or an arrow
  key. A Tab into the list shows the ring.
- In Free mode, the bar stays visible while a control of the bar has the keyboard focus
  (`:focus-visible`), while the pointer is over it, and while the drawer is open. In Cinematic
  mode, the focus or the pointer on the bar, the drawer, or the link of the title keeps the bar
  and the drawer, and an open drawer does not (2.3). The title does not hide. The hidden controls
  stay in the focus order.

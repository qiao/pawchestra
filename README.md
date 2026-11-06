# Pawchestra

Pawchestra is a WebGL MIDI player. An orchestra of 3D animals plays the music on a small stage.

Live site: <https://www.pawchestra.com/>

![Pawchestra](docs/pawchestra.png)

## Features

- **3D animal orchestra.** The animals play the strings, the woodwinds, the brass, the
  percussion, the piano, and the harp, and a choir of animals sings. The poses follow each note:
  the fingers, the bow strokes, the breaths, the mallet strokes, and the keys.
- **Your own MIDI files.** Drop a `.mid` file onto the window, or select one of the built-in
  public domain pieces. A link with `#demo=<id>` opens a demo, for example
  <https://www.pawchestra.com/#demo=bach-bwv1047>.
- **SoundFont synth.** An AudioWorklet plays the instruments from a SoundFont, with the reverb of
  a real concert hall.
- **Camera.** Select the cinematic camera, which follows the sections that play, or the free
  orbit camera.
- **Section controls.** Solo or mute each section. The stage beam follows the soloists.
- **Small static app.** The app runs in the browser with WebGL and Web Audio. The first download
  is less than 1 MB after gzip.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) version 24 or newer
- [pnpm](https://pnpm.io/) version 10

### Run locally

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Start the local development server:
   ```bash
   pnpm dev
   ```

3. Open `http://localhost:5173` in your browser.

### Build for production

Create a static build in `dist/`:
```bash
pnpm build
```

## Controls

| Key or gesture | Action |
|---|---|
| `Space` | Play or pause |
| `Left` / `Right` | Seek 5 seconds backward or forward |
| `Up` / `Down` | Turn the volume up or down |
| `Home` | Return to start |
| `C` | Toggle automatic cinematic camera |
| `M` | Toggle mute |
| `F` | Toggle full screen |
| `Escape` | Close drawer or dialog |
| Drag (> 4 px) | Orbit 3D camera |
| Scroll / Pinch | Zoom in or out |

## Browser support

The app needs WebGL2. It supports the current and the previous major versions of Chrome, Firefox,
and Safari (macOS and iOS), and Chrome on Android. Desktop browsers come first. A phone plays the
music with a lower visual quality.

## Privacy

The site counts the page views with Vercel Web Analytics, which sets no cookies and stores no
personal identifier. The site has no service worker. A MIDI file that you open stays on your
device: the app sends it to no server. The page
[`/privacy`](https://www.pawchestra.com/privacy) of the live site gives the same facts.

## Technology

- [Three.js](https://threejs.org/) renders the stage with WebGL2.
- [TypeScript](https://www.typescriptlang.org/) and [Vite](https://vite.dev/). The UI uses no
  framework, because it is small.
- [spessasynth_core](https://github.com/spessasus/spessasynth_core) plays the SoundFont in an
  AudioWorklet.
- [Oxlint](https://oxc.rs/) checks the code, and oxfmt formats it.
- The site is static. [Vercel](https://vercel.com/) hosts it, and Vercel Web Analytics counts the
  page views.

## Architecture

One `Score` drives both the sound and the animals. `poseAt()` calculates each pose only from the
score, the layout of the stage, and the song time. Thus a seek, a pause, or a change of the speed
always gives the correct pose.

```text
 .mid file
     │
     v
 ┌────────┐    ┌────────┐    ┌────────┐    ┌──────────┐
 │ midi/  │───>│ score/ │─┬─>│ pose/  │───>│ scene/   │───> canvas
 │ parse  │    │ Score  │ │  │ poseAt │    │ Three.js │
 └────────┘    └────────┘ │  └────────┘    └──────────┘
                          │      ^              ^
                          │   models/        shots/
                          │
                          │  ┌──────────────────────────┐
                          └─>│ audio/: SoundFont synth  │───> speakers
                             └──────────────────────────┘
```

- `src/midi/`: Parses the bytes of a Standard MIDI File into tracks of events.
- `src/score/`: Builds the `Score`: the timed notes, the sections, and the seats of the players.
- `src/pose/`: Calculates the pose of each animal at a song time: the bow strokes, the fingers,
  the breaths, and the mallet strokes.
- `src/models/`: Builds the animal bodies, the instruments, and the layout of the stage.
- `src/shots/`: Plans the camera shots, and calculates the camera at a song time.
- `src/scene/`: Renders the stage with Three.js: the lights, the stage beam, the quality tiers,
  and the bones of the animals.
- `src/audio/`: Plays the SoundFont in an AudioWorklet. A Worker decodes the SoundFont files
  before play.
- `src/app/`, `src/ui/`: The load flow, the transport, the seat list, the URL hash, and the
  settings.
- `src/gallery/`: The development pages `gallery.html` and `views.html`.
- `tools/`: The build scripts, the probes, and the image tools
  ([`docs/agents/commands.md`](docs/agents/commands.md)).

The modules `midi/`, `score/`, `pose/`, `models/`, and `shots/` are pure. They get all inputs as
arguments, read no clock, and touch no DOM, so they also run in Node. Design 7.1 in
[`docs/design/07-architecture.md`](docs/design/07-architecture.md) gives the details.

## Contributing

[`CONTRIBUTING.md`](CONTRIBUTING.md) gives the setup, the checks, and the rules of a change. The
design is in [`docs/design.md`](docs/design.md). All unit tests are paused now: `pnpm test` runs
no test, and `pnpm test:paused <path>` runs one paused file.

## Credits

The app includes the third-party files below. The build writes all their licenses into
`third-party-licenses.txt`, and the credits dialog of the app links it.

- **Demo pieces:** [`demos/README.md`](demos/README.md) gives the source, the license, and the
  checksum of each piece.
- **SoundFont:** [`assets/soundfont/README.md`](assets/soundfont/README.md) (GeneralUser GS and
  the Versilian Studios libraries).
- **Hall reverb:** [`assets/hall/README.md`](assets/hall/README.md) (St Paul's Hall, University
  of Huddersfield).
- **Font:** [`assets/fraunces/README.md`](assets/fraunces/README.md) (Fraunces, SIL Open Font
  License).
- **GitHub mark:** [`assets/github-mark/README.md`](assets/github-mark/README.md) (MIT license).
- **Animal models:** each folder of [`assets/models/`](assets/models/) has a README with the
  origin and the checksums of its files.

## License

- **Code:** the [Apache License 2.0](LICENSE).
- **Animal models:** the files in `assets/models/` and `src/models/studio/` are under
  [CC BY-NC 4.0](assets/models/LICENSE). You can use, change, and share
  them, but not for commercial purposes.
- **Your output:** you own the videos, images, and audio that you make with Pawchestra. You can use
  them for any purpose, including commercial use. This grant covers the animals as they appear in
  your output. It does not cover the model files.
- **Name and logo:** the licenses do not cover the name "Pawchestra" or the paw logo. Give a fork a
  different name. It can say that it is "based on Pawchestra".
- **Third-party files:** the demo files, the SoundFont, and the hall reverb keep their own
  licenses. The credits dialog of the app and the README file of each folder list them.

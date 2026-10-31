# 1. Goals and budgets

### Goals

- The app is a static site on Vercel. It has no server.
- Desktop browsers come first. Phones must play the music, with lower visual quality.
- The code license is Apache-2.0. The animal models are under CC BY-NC 4.0 (the license
  section of `README.md`).

### Budgets

- **First download.** Less than 1 MB after gzip. Design 7.2 defines what the check counts.
- **Samples.** The app loads the instrument samples after the first frame, and only the presets
  that the file uses.
- **Frame time.** The scene renders at 60 fps on a laptop with an integrated GPU. Design 9.7
  gives the limit and its check.
- **Triangles.** The triangle budget of a studio body allows round forms (4.4). The first
  download and the frame time stay the limits.

### Reference images

The images in `docs/reference/` are the target of each visual change. They win over the values
in the code, because these values describe the current models. Design 4 gives the look that
they set.

| Image | It shows | It wins for |
|---|---|---|
| `orchestra-latest.png` | The newest target: our cast, the logo, and the title | The scene, over each other scene image |
| `orchestra-side.png` | The same scene from the front left | A second side of the forms |
| `lowpoly-animals.png` | Well-made low-poly animals | The forms and the facets |
| `mockup.png`, `scene.png` | The app during play, and nine views of the scene | The look, over `orchestra.webp` and the prototype of 2.8 |
| `animals.webp` | Three views of the first animals | The proportions and the colors, over `orchestra.webp` |
| `orchestra.webp` | The first target scene | Only what no newer image shows |
| `*-views.png`, `*-turnaround.png` | One species from each side | The form, the face, and the colors of the species |

The navigation menu at the top of `mockup.png` is out of scope.

These rules decide where two sources differ:

- A newer product choice wins over an image, and this section names it.
- The source mesh of a species wins over its sheet for the form and the colors.
- A turnaround sheet wins over an older sheet of the same species. A turnaround sheet has no
  scale, so the size comes from the rules below and from design 4.4.

### The animals

The facets are large, flat, and clean, and they follow the form of each animal. Each species
keeps its own anatomy, with short animal legs, small paws, and a tail that shows. These product
choices win over the images:

- **Seat.** The feet of a seated player rest on the floor, also where a sheet shows them above it.

- **Conductor.** The bear holds one baton, in the right paw. Its sheet shows a baton in each paw.
- **Species with no reference image.** The mouse, the beaver, the pig, the rhino, the badger,
  the monkey, and the deer have no image. The source mesh sets the form. The head top keeps the
  height of the earlier body of the species (`height` of `ANIMALS` in `tools/studio-body.ts`),
  and the monkey and the deer are a little larger.
- **Penguin.** The source mesh sets the form, and the crown keeps the height of the earlier
  penguin. The orchestra images set the white front, the black back, and the folder.
- **Wolf.** The body is lower and wider than the orchestra images give, with a head of the size
  of the red fox. Thus the seated wolf is about as high as the dog cellists.
- **Badger.** The bass drum stands in front of the badger, as for a real player. Thus from the
  front, the drum hides the right arm and the beater.
- **Polar bear.** The size comes from the keys of the piano, because the label "180 cm" of
  `polar-bear-views.png` ends above the head top. The body keeps the part ratios and the legs of
  its mesh, because longer legs made the bear look human. Thus the bear sits on a lower bench
  than in the image, with the feet flat. The piano is larger than a real piano (`PIANO_SCALE`),
  so that the elbows stand a little above the keys.
- **Cat.** A seated cat curls its tail on the seat.

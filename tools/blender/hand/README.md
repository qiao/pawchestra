# Hand chains

Each folder `<species>/` holds the chain that makes the hand rig of one Tripo body
(`assets/models/<species>/tripo-hand/`, design 4.4, "Hand rig"). The chain is the source of the
body. The `.blend` and the files after it are outputs of the chain.

```text
tools/blender/hand/<species>/params.json + base-config.json
  ->  make_config.py (uv, python -I)    ->  tools/mesh-rigs/simple/<species>-tripo.json
  ->  build.py (headless Blender)       ->  assets/models/<species>/tripo-hand/<species>.blend
  ->  pnpm rig-export <species>         ->  <species>.rig.glb + <species>.rig.json
  ->  pnpm studio-body <species>        ->  src/models/studio/<species>.ts + studio-heights.ts
```

## Run

```bash
pnpm hand-chain <species>            # the four steps above
pnpm hand-chain <species> --build    # the four steps, then pnpm build
```

`tools/hand-chain.sh` stops at the first fault and prints the tail of its log. The logs and the
side files of the build (`build.log`, `band-near.json`) go into `scratch/hand/<species>/`, which
git ignores. At the end, the script prints the head height and the seat height of the body.
Blender comes from the variable `BLENDER`, or from the path.

## Files of a chain

| File | Job |
|---|---|
| `params.json` | The values of the body: the point edits, the rings, the rows, the seat, the eyes, and the scale `metersPerUnit` |
| `base-config.json` | The start of the rig config: the studio settings, the colors, and the notes |
| `make_config.py` | Maps the joints of the source through the point edits, and writes the rig config |
| `build.py` | Builds the `.blend` from the source FBX file: the point edits, the rings, the armature, the weights, the bind, the eyes, and the facts |
| `redits.py` | The point edits that `make_config.py` and `build.py` share |
| `rings.py`, `rimport.py`, `tail.py` | The ring splits, the import of the source, and the tail rows |
| `eye-centers.json` | The eye faces of the source, for a body whose params name it in `eyeFaces` |

The scripts also import `studio_armature.py`, `studio_eyes.py`, and `bind_edit.py` of
`tools/blender/`.

## Change a body

1. Edit the chain. A size change is `metersPerUnit` (meters for each unit) in `params.json`: the
   body scales by the ratio of the new value to the old value.
2. Run `pnpm hand-chain <species>`, and check the body in the app.
3. Commit the change of the chain with its outputs, and update the `README.md` of the species.

Do not edit a `.blend` of a chain in Blender, because the next run of the chain writes it again.
A run writes the `.blend` with other bytes each time. The rig file, its summary, the studio module,
and the rig config are the same byte for byte for the same chain.

## One copy of build.py for each species

Each `build.py` is a copy that grew from the build of another species. The copies share most
functions, but the eyes, the lids, the tail rows, and the hooves differ in code. `TODO.md` gives
the plan to merge them into one shared `build.py`.

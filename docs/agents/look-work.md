# Look work

This module of `AGENTS.md` gives the tools of a round of the light, the colors, or the grade, and
their traps. The head comment of each tool file gives its options.

## The loop of a round

1. Probe the direct light with no render: `pnpm light-probe` (about 1 s). `--grid` and `--goal`
   solve the lux of the back-row lights for each cell.
2. Render the variants: `pnpm look-variants <file> --out <dir>` (about 40 s for each variant). Each
   variant holds look paths and values, and the key `solo`. The tool prints one row of the measures
   for each variant.
3. Change the code to the chosen variant, and compare it with `pnpm look-lab <dir> --base <start>`.
4. After each look change of a venue, render the close shots of `beethoven-9` at 28 s and 146 s
   (`pnpm close-views play <dir> --demo beethoven-9 --scene <id> --cinematic --time 28 --time
   146`), and compare them with the base. The default view alone does not show a glare of the
   light toward the camera.
5. Put the chosen values and their reason into design 4.1 or 4.5.

A kit or mesh change that adds more than 1.5 times the triangles runs
`pnpm frame-compare <base> HEAD --runs 3` directly after its lineup, because the main-thread tail
of the forest grew with the size of its kit.

## The look override

- The dev server reads the query `look`: JSON of look paths, such as `BACK_ROW_LIGHT.position.1`,
  and their values (`src/app/look-override.ts`). Add a new constant of the look to `LOOK_ROOTS` of
  `src/scene/look-values.ts`.
- A value that a module reads at its load needs a read at use time, as `gradeLutData()` reads the
  tone curve. Until then, `LOAD_TIME_PATHS` refuses its path.
- The query `solo` takes seats or species, such as `panda` or `13,14`. It clicks the solo buttons
  after the load, so the light, the sound, and the poses follow the solo.
- The regions of the camera `default` of `pnpm look-lab` come from the layout of the default demo
  (`tools/look-regions.ts`). Check `regions-default.png` after a change of the layout or the camera.

## Traps

- **Pixel sets.** The white-fur mask (a saturation below 0.4) moves with the color of the light,
  so the pixel counts of two variants can differ by a factor of 2 or more. Compare variants on one
  pixel set, as `pnpm look-variants` and the row "pixel sets of base" of `pnpm look-lab` do.
- **Hot spot.** On the high and the medium tier, `SPOT_POOL_GLSL` multiplies each spotlight with a
  shadow map by the hot spot. On the players, the hot spot holds only the podium
  (`LIGHT_POOL.playerSpot`). Keep the hot spot of `pnpm light-probe` on, and use `--tier low` for
  the low tier.
- **Shared palettes.** Another species can use the face colors of a mesh rig through `palettes`, as
  the tan fox uses the red fox rig. A color rule of a rig changes only `COLOR_0`, and each palette
  maps from the colors before the rule (`COLOR_1`). Check that `pnpm body-probe` shows only the
  target species.
- **Floor light.** The captured environment (`captureEnvironmentSteps()`) sees the lit floor, so a
  stronger hot spot on the floor can clip a close shot with no more light on the player. After a
  change of the light of the floor, measure the close shots too.
- **Gamut.** A darker color reaches the sRGB gamut early, and a larger chroma factor then has no
  effect. Read the gamut count of the `shift:` line of the `pnpm rig-mesh` log for each variant.

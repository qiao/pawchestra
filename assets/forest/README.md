# Forest kit

This folder holds the GLB file of the forest kit: the low-poly parts of the forest scene of
`docs/reference/forest.webp`, and their places around the stage of the default demo. The app does
not serve this file. It loads the module `src/models/forest/kit-data.ts`, which this chain writes:

```text
tools/forest-kit/build-kit.py      own script: each point from one seed
   │  blender -b --factory-startup -P tools/forest-kit/build-kit.py -- assets/forest/forest-kit.glb
   v
forest-kit.glb                     parts, places, rope ends
   │  pnpm forest-kit
   v
src/models/forest/kit-data.ts      packed parts and places of the app
```

`docs/agents/commands.md` gives the commands. Run both after each change of the script, and
update the size and the SHA-256 below.

## forest-kit.glb

| Item | Value |
|---|---|
| Size | 416,700 bytes |
| SHA-256 | `65b11a57db3c05097e2df1dfa3483bb70cc9ec667eeb60494bcdc3446b56a7a2` |
| Origin | Own work of the project. The script makes each point itself from one seed. It imports, downloads, and generates no model |
| License | Apache License 2.0, as the project (`../../LICENSE`). It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Blender 5.2.2 LTS, Khronos glTF Blender I/O v5.2.40 |
| Contents | 27 mesh nodes, one for each part, at the origin. One empty for each place, with the part name in the property `part`. One empty for each rope end, as a child of the empty of its tree. The empty `stage` with the stage side of the places in the property `side` |
| Faces | One color for each face in the color attribute `COLOR_0`, and one material for each kind of face: `matte`, `glow`, `water`, and `foliage`. No normal, no texture coordinate, and no texture |

The axes are those of the app: one unit is one meter, y is up, and the audience is at +z. The
origin of a part is on the ground, except for the hanging lantern, whose origin is the top of its
ring. The origin of the lantern on a branch is on the axis of its tree, so that the app cuts it
with its tree.

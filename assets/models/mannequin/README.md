# Test mannequin

This folder holds the test mannequin: a test body for the rig chain of the app and for the Mixamo
route (design 4.4, "Test mannequin"). The app does not serve these files. A script makes each file,
so the mannequin is an original model.

## Source and license

| Item | Value |
|---|---|
| Source | `tools/blender/mannequin.py`, an original script of the project |
| License | CC BY-NC 4.0 (`../LICENSE`), as the other models of this folder. It is no third-party file, so the third-party license file (design 7.3) has no entry for it |
| Writer | Blender 5.2.2 LTS: Khronos glTF Blender I/O v5.2.40, and the FBX exporter 5.15.0 |

## Steps

Run the script from the root of the tree, one time for each preset:

```sh
blender -b --factory-startup --python tools/blender/mannequin.py -- human --out assets/models/mannequin
blender -b --factory-startup --python tools/blender/mannequin.py -- animal --out assets/models/mannequin
```

Two runs give the same bytes. The script runs Blender again with `PYTHONHASHSEED=0`, because the
FBX exporter makes its ids from the string hash. The docstring of the script gives the steps.

## Files

Each preset has four files. The places are in meters in the GLB files, and in centimeters in the
FBX files.

| File | Contents | Use |
|---|---|---|
| `mannequin-<preset>.glb` | The mesh in an A-pose (each arm 40 degrees down), with no skeleton | The input of `pnpm rig-mesh` |
| `mannequin-<preset>-tpose.fbx` | The mesh in a T-pose, with no skeleton | An upload to mixamo.com |
| `mannequin-<preset>-mixamo.glb` | The T-pose mesh with the Mixamo skeleton (65 bones), weights of at most 4 bones, and the test clips | The input of the Mixamo adapter |
| `mannequin-<preset>-mixamo.fbx` | The same as an FBX file in centimeters, with one take for each clip (`Armature\|<clip>`) | The input of the Mixamo adapter |
| `mannequin.rig.glb` | The studio rig of `mannequin-animal.glb` (`tools/mesh-rigs/mannequin.json`) | The input of `pnpm studio-body mannequin` |

The presets:

- `human`: an adult of 1.8 m, with the segment lengths of Winter, "Biomechanics and Motor Control
  of Human Movement", figure 4.1. 3,768 quads (7,536 triangles).
- `animal`: 1.6 m, with the mean proportions of the wolf and the rabbit of the app: a big head,
  short legs, and short arms. 2,152 quads (4,304 triangles).

## Markers

Each face has one color of a palette texture.

- A band around the middle of each upper arm (red), forearm (yellow), thigh (blue), and shin
  (green): the front half has the light color and the back half a dark color. A stripe of the
  light color runs along the front of each segment. A twisted limb turns the stripe into a
  spiral and moves the edge of the two halves.
- The palm is magenta, the back of the hand is white, and the thumb is cyan. In the T-pose, the
  palm faces down and the thumb points forward.
- The face has two black eyes and an orange nose on the front of the head.
- The plain skin of the left side (+x) is warm, and the right side is cool. A mirrored side shows
  at once.
- Each joint has quad rings of 16 vertices: the shoulder, the elbow, the wrist, the hip, the knee,
  the ankle, and the neck. Each arm has 17 rings from the shoulder to the wrist.

## Clips

The clips are on the Mixamo skeleton, at 30 frames per second. Each frame has a key of each bone.

| Clip | Frames | Motion |
|---|---|---|
| `TPose` | 1 | The rest pose |
| `Wave` | 73 | The right arm rises, the palm faces forward, and the forearm waves 3 times |
| `Bow` | 56 | The trunk bends 30 degrees forward (10 degrees on each spine bone), holds, and comes back |
| `Clap` | 79 | The arms come forward, and the paws meet in front of the chest 4 times |
| `ForearmTwist` | 61 | Each forearm turns about its own axis from -90 degrees (the palm forward) to +90 degrees (the palm back), and back to 0. The two sides mirror each other |

## Mixamo facts

The Mixamo help pages of Adobe refused the download (HTTP 403), so these facts come from two
public files that Mixamo wrote, in the three.js examples at the tag `r170`:

- `examples/models/gltf/Xbot.glb` (SHA-256
  `002f8d269de68e5dce3d25195caf390d1aa359bbfaae3fcf4c8dc78ec36c3ba5`), a Mixamo character that
  Blender converted to glTF.
- `examples/models/fbx/Samba Dancing.fbx` (SHA-256
  `b9003ee562c87bf03051c3a502411b0808d3513f1d74a2011f7530d9f067069f`), an FBX file with the
  `ApplicationVendor` "Mixamo, Inc." and the FBX SDK 2014.2.1.

| Fact | Source | Mannequin |
|---|---|---|
| Each bone name has the prefix `mixamorig:`: `Hips`, `Spine`, `Spine1`, `Spine2`, `Neck`, `Head`, `HeadTop_End`, and for each side `LeftShoulder`, `LeftArm`, `LeftForeArm`, `LeftHand`, `LeftHandThumb1` to `LeftHandThumb4` (and Index, Middle, Ring, Pinky), `LeftUpLeg`, `LeftLeg`, `LeftFoot`, `LeftToeBase`, `LeftToe_End` | Both files | Same names |
| These are 65 bones, and 25 with no fingers. The two files also have the bones `LeftEye` and `RightEye` (67 joints in the skin of `Xbot.glb`) | Both files. An Adobe community thread names the standard skeleton of 65 joints ([thread](https://community.adobe.com/t5/mixamo/the-skeleton-has-1-finger-on-each-hand-although-i-want-all-fingers/m-p/12029210)). The skeleton options of the auto-rigger are not confirmed | 65 bones, no eye bones |
| `Hips` is the root joint. In `Xbot.glb`, the node above it is the node `Armature`, which is no joint | `Xbot.glb` | Same |
| `Hips` carries the moves of the body: in the 7 clips of `Xbot.glb`, only `Hips` has a translation that changes by more than 0.5 cm, except some leg joints in `sneak_pose`. The `walk` and `run` clips stay in place | `Xbot.glb` | The clips key the translation of `Hips` only, at 0 |
| The rest pose is a T-pose: the arm joints lie on one level line along x | `Xbot.glb` | Same |
| Each joint has no turn in the rest pose: each joint is a pure move from its parent | `Xbot.glb` | Same |
| Y is up, and the character faces +Z: the toes and the thumbs are at +Z from their joints, and the left arm is at +X | `Xbot.glb`. `Samba Dancing.fbx` has `UpAxis` 1 (Y), `FrontAxis` 2 (Z), and `CoordAxis` 0 (X), each with the sign +1 | Same |
| An FBX file of Mixamo is in centimeters | `Samba Dancing.fbx` has `UnitScaleFactor` 1.0 (1 unit is 1 cm) | Same. The node `Armature` has no scale |
| The joints of `Xbot.glb` are in centimeters under the node `Armature` with the scale 0.01 | `Xbot.glb` | Same in `mannequin-<preset>-mixamo.glb` |

The choice of 65 bones: a Mixamo download of the auto-rigger has the finger bones by default, so
the adapter must map them. The adapter maps the fingers to one curl, so the hand bones matter more
than the finger joints. The paw of the mannequin is a mitten, and the four finger chains lie side
by side in it.

## Checksums

| File | Size (bytes) | SHA-256 |
|---|---|---|
| `mannequin-human.glb` | 192,300 | `52d0cdefbe82107d572069e7a2a562231571400240aef68521b0499251d58a0c` |
| `mannequin-human-tpose.fbx` | 161,196 | `fc573bbd6cad5711ca848bc60423250bce728baabff78e33f8471c03d963d58b` |
| `mannequin-human-mixamo.glb` | 675,804 | `1c1fa2d7541dc696b469ec622374f4951e9de33b1fecaaf34fba32711f753905` |
| `mannequin-human-mixamo.fbx` | 1,937,068 | `baf117ad7f52f7584b8ca968435c0f35df26b039c696b14a70db32fee730a21c` |
| `mannequin-animal.glb` | 116,076 | `c4b94597490424d88e8c8ede9c98b2748f39e6552896e93b1e02c4137cd4438f` |
| `mannequin-animal-tpose.fbx` | 103,980 | `3b9ac703f7e7ad66a98cb453476d6aa5b5b5a762e86d12f9a99147de7452996f` |
| `mannequin-animal-mixamo.glb` | 564,632 | `973682ee26bff0c1f405d50436bf744ab5b75bd3facff9f855694acb185562d6` |
| `mannequin-animal-mixamo.fbx` | 1,870,156 | `d65c2d482fd1d1d28d280b513a2571611993c537de08c8b0394b04e6bde2cbc7` |

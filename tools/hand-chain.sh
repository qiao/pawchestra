#!/bin/zsh
# Usage: tools/hand-chain.sh <species> [--build]
#
# Rebuilds the hand rig of a Tripo body from its chain in tools/blender/hand/<species>/
# (tools/blender/hand/README.md). The steps run in this order, and the script stops at the first
# fault with the tail of its log:
#
#   1. make_config.py writes tools/mesh-rigs/simple/<species>-tripo.json.
#   2. build.py writes assets/models/<species>/tripo-hand/<species>.blend in headless Blender.
#   3. pnpm rig-export writes <species>.rig.glb and <species>.rig.json.
#   4. pnpm body-module writes src/models/bodies/<species>.ts and src/models/body-heights.ts.
#   5. With --build, pnpm build builds the app.
#
# The logs go into scratch/hand/<species>/. Blender comes from the variable BLENDER, or from the
# path. At the end, the script prints the head height and the seat height of the body.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
species="${1:-}"
chain="tools/blender/hand/$species"
if [[ -z "$species" || ! -f "$root/$chain/build.py" ]]; then
  echo "hand-chain: give a species with a chain in tools/blender/hand/" >&2
  print -l "$root"/tools/blender/hand/*(/:t) >&2
  exit 2
fi

cd "$root"
export BLENDER="${BLENDER:-blender}"
out="scratch/hand/$species"
rig="assets/models/$species/tripo-hand/$species"
mkdir -p "$out"

# Runs one step with its output in a log, and prints the tail of the log after a fault.
step() {
  local name="$1"
  shift
  if ! "$@" > "$out/$name.log" 2>&1; then
    echo "hand-chain: step $name failed ($out/$name.log):" >&2
    command grep -v '^Fra' "$out/$name.log" | tail -25 >&2
    exit 1
  fi
}

step config uv run -q --no-project --with numpy python -I "$chain/make_config.py"
step blender "$BLENDER" -b --factory-startup --python-exit-code 1 --python "$chain/build.py" -- \
  --out "$rig.blend"
step export pnpm rig-export "$species" --blend "$rig.blend" --out "$rig.rig.glb"
step body pnpm body-module "$species"
if [[ "${2:-}" == "--build" ]]; then
  step app-build pnpm build
fi

command grep -oE '(headHeight|seatHeight): [0-9.]+' "src/models/bodies/$species.ts"

#!/usr/bin/env bash
# Usage: tools/regen-bodies.sh [<animal>...], or --heights
#
# Writes the body module of each animal again with `node tools/body-module.ts <animal>`, then the
# heights module with `--heights`, in the git checkout of the current folder. With no animal, it
# writes each module of src/models/bodies/. It compares each written file with HEAD and prints one
# line for each file: `same <name>`, `DIFF <name>`, `NEW <name>` (no file in HEAD), or
# `FAIL <name>` (the tool failed, with the end of its log). The logs go into scratch/regen/. A DIFF
# is a result, and the caller decides about it. --heights writes only the heights module.
#
# Exit codes: 0 no FAIL, 1 one or more FAIL.
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"
LOG_DIR=scratch/regen
mkdir -p "$LOG_DIR"

ANIMALS=()
if [ $# -eq 0 ]; then
  for file in src/models/bodies/*.ts; do
    ANIMALS+=("$(basename "$file" .ts)")
  done
elif [ "$1" != --heights ]; then
  ANIMALS=("$@")
fi

FAIL=0

# Compares one written file with HEAD, and prints its line. $1 is the name, $2 the path.
compare() {
  if ! git cat-file -e "HEAD:$2" 2>/dev/null; then
    echo "NEW $1"
  elif git diff --quiet HEAD -- "$2"; then
    echo "same $1"
  else
    echo "DIFF $1"
  fi
}

# Runs body-module with the arguments $2..., and prints its line. $1 is the name of the log.
# $2 is the path of the written file.
regen() {
  local name=$1 path=$2
  shift 2
  if node tools/body-module.ts "$@" >"$LOG_DIR/$name.log" 2>&1; then
    compare "$name" "$path"
  else
    echo "FAIL $name"
    tail -3 "$LOG_DIR/$name.log"
    FAIL=1
  fi
}

# body-module also writes the heights module, so the runs go one after the other.
for animal in ${ANIMALS[@]+"${ANIMALS[@]}"}; do
  regen "$animal" "src/models/bodies/$animal.ts" "$animal"
done
regen heights src/models/body-heights.ts --heights

exit "$FAIL"

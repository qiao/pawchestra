#!/usr/bin/env bash
# Extracts the paths of a commit into a new temporary folder with a link to the node_modules of
# the repository, and prints the folder. Thus a tool with no --base runs on the code of the commit:
# copy a newer tool into the folder if the commit does not have it, and run it there. The default
# paths are the paths of a probe of a commit (PROBE_PATHS of tools/ref-tree.ts). A tool that reads
# a model or a reference file needs its path too, such as assets/models/wolf.
#
# Usage: tools/base-tree.sh <ref> [<path>...]
#
# The folder is outside the repository and is an empty git repository, so that a git command of a
# tool stays in it. It has no index, so run a tool with a cache by tree with PROBE_NO_CACHE=1.
# Remove the folder at the end: rm -rf <folder>.
#
#   dir=$(tools/base-tree.sh 4fca86e5)
#   cp tools/bind-supination.ts "$dir/tools/"
#   (cd "$dir" && PROBE_NO_CACHE=1 node tools/bind-supination.ts wolf)
#   rm -rf "$dir"
#
# Exit codes: 0 with the folder on the output, 2 for a wrong call or a ref that git does not know.
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: tools/base-tree.sh <ref> [<path>...]" >&2
  exit 2
fi
ref=$1
shift
if [ $# -eq 0 ]; then
  set -- src package.json demos/src demos/patches.json demos/README.md tools
fi

top=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "base-tree: run it in a git worktree." >&2
  exit 2
}
if ! git rev-parse --verify --quiet "$ref^{commit}" >/dev/null; then
  echo "base-tree: git does not know the commit $ref." >&2
  exit 2
fi

dir=$(mktemp -d "${TMPDIR:-/tmp}/base-tree-XXXXXX")
if ! git -C "$top" archive "$ref" -- "$@" | tar -x -C "$dir"; then
  rm -rf "$dir"
  echo "base-tree: git archive of $ref failed." >&2
  exit 2
fi
ln -s "$top/node_modules" "$dir/node_modules"
git -C "$dir" init --quiet
echo "$dir"

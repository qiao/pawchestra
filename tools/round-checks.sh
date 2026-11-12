#!/usr/bin/env bash
# Usage: tools/round-checks.sh [--fast] [<log dir>]
#
# Runs the end checks of a round (AGENTS.md, "Checks") in the git checkout of the current folder:
# the typecheck, the lint, the format check, the build, the size, and the smoke test. Each check
# runs alone and writes its output to <log dir>/<check>.log. The log folder is relative to the
# root of the checkout (default scratch/checks/). The script prints one line `<check> exit <n>`
# for each check, and it continues after a failure. The size check reads the output of the build,
# so it does not run after a failed build. --fast does not run the smoke test. Use it for a change
# with no effect on the app or the UI.
#
# Exit codes: 0 all checks passed, 1 one or more checks failed, 2 bad use.
set -uo pipefail

FAST=0
if [ "${1:-}" = --fast ]; then
  FAST=1
  shift
fi
if [ $# -gt 1 ] || [ "${1:-}" = -h ] || [ "${1:-}" = --help ]; then
  echo "Usage: tools/round-checks.sh [--fast] [<log dir>]" >&2
  exit 2
fi
LOG_DIR=${1:-scratch/checks}

cd "$(git rev-parse --show-toplevel)"
mkdir -p "$LOG_DIR"

FAILED=()
BUILD_STATUS=0

# Runs one check alone. $1 is the name of the check and of its log. The other arguments are the
# command. The status of the command is the status of the check, because no pipe follows it.
run_check() {
  local name=$1 status=0
  shift
  "$@" >"$LOG_DIR/$name.log" 2>&1 || status=$?
  echo "$name exit $status"
  if [ "$status" -ne 0 ]; then
    FAILED+=("$name")
  fi
  return "$status"
}

run_check typecheck pnpm -s typecheck || true
run_check lint pnpm -s lint || true
run_check format pnpm -s format:check || true
run_check build pnpm -s build || BUILD_STATUS=$?
if [ "$BUILD_STATUS" -eq 0 ]; then
  run_check size pnpm -s size || true
else
  echo "size skipped (the build failed)"
  FAILED+=(size)
fi
if [ "$FAST" = 1 ]; then
  echo "smoke skipped (--fast)"
else
  run_check smoke pnpm -s smoke || true
fi

if [ "${#FAILED[@]}" -gt 0 ]; then
  echo "Failed: ${FAILED[*]}. The logs are in $LOG_DIR/."
  exit 1
fi
echo "All checks passed. The logs are in $LOG_DIR/."

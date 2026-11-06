#!/usr/bin/env bash
# Usage: tools/merge-branch.sh [--check-only] [--no-arm-check] <branch> [worktree]
#
# Rebases <branch> onto main, checks each commit, and fast-forwards main to it.
# <worktree> is the worktree that holds <branch>. With no <worktree>, the script
# adds a temporary worktree. The script stops at the first failure and keeps the
# branch and the worktree. It removes them only after a successful merge.
#
# tools/check-commits.sh, from the folder of this script, checks each commit. It
# keeps each passed result in a cache by tree, so a commit that an agent checked
# before prints "hit" and runs no check. MERGE_NO_CACHE=1 runs each check again.
# The full unit suite on the last commit always runs, with no cache, as a second
# guard against a wrong entry.
#
# --check-only runs each check and stops before the merge. The script rebases the
# branch onto main, but it does not change main, and it keeps the branch and the
# worktree.
#
# A branch that changes a file of src/pose/, src/models/, or tools/blender/ can twist
# or deform an arm, so after the unit suite the script runs the arm gate
# `pnpm arm-check --all --base main` (docs/agents/rigging.md, "The arm gate"), prints
# its table, and stops on a value that fails. The gate takes about 3 minutes with the
# base in the cache, so it runs all roles. --no-arm-check skips the gate. Use it only
# for a change that moves no arm, such as a color or a face, and give the reason in
# the merge report.
#
# The end-to-end tests are paused with all tests (design 9.3), so the script does
# not run them. MERGE_E2E=1 runs them.
#
# The end-to-end tests fail on a busy machine (a load average above about 30),
# and main fails in the same way. Before each run of these tests, the script waits
# until the 1-minute load average is at most MERGE_E2E_MAX_LOAD (default 20) and
# the test port (PAWCHESTRA_E2E_PORT, default 4182) is free, for MERGE_E2E_WAIT
# seconds at most (default 900). It prints the cause of each wait. After a failure,
# the tests run one more time. A second failure stops the script. MERGE_E2E_CMD
# replaces the test command (for a test of this script).
#
# Exit codes: 1 bad use or bad state, 2 rebase conflict, 3 a commit or the full
# unit suite failed a check, 4 the commit hashes changed, 5 build or size failed,
# 6 the Chromium end-to-end tests failed two times, 7 a value of the arm gate failed,
# 8 main moved during the checks.
set -euo pipefail

CHECK_ONLY=0
ARM_CHECK=1
while [ "${1:-}" = --check-only ] || [ "${1:-}" = --no-arm-check ]; do
  if [ "$1" = --check-only ]; then
    CHECK_ONLY=1
  else
    ARM_CHECK=0
  fi
  shift
done
if [ $# -lt 1 ] || [ $# -gt 2 ]; then
  echo "Usage: tools/merge-branch.sh [--check-only] [--no-arm-check] <branch> [worktree]" >&2
  exit 1
fi

BRANCH=$1
# The folder of this script, which holds the check script of the commits.
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
WORKTREE=
if [ $# -eq 2 ]; then
  WORKTREE=$(cd "$2" && pwd)
fi
REPO=$(git rev-parse --show-toplevel)
TMP_ROOT=${TMPDIR:-/tmp}
MERGE_TMP=$(mktemp -d "${TMP_ROOT%/}/merge-branch.XXXXXX")
export MERGE_TMP
LOG=$MERGE_TMP/merge.log

cd "$REPO"
if [ "$(git branch --show-current)" != main ]; then
  echo "The worktree at $REPO must have main checked out." >&2
  exit 1
fi
git rev-parse --verify --quiet "refs/heads/$BRANCH" >/dev/null || {
  echo "No branch $BRANCH." >&2
  exit 1
}

TEMP_WORKTREE=0
if [ -z "$WORKTREE" ]; then
  WORKTREE=$MERGE_TMP/worktree
  TEMP_WORKTREE=1
  git worktree add -q "$WORKTREE" "$BRANCH"
fi

E2E_RUN=${MERGE_E2E:-0}
E2E_MAX_LOAD=${MERGE_E2E_MAX_LOAD:-20}
E2E_WAIT=${MERGE_E2E_WAIT:-900}
E2E_CMD=${MERGE_E2E_CMD:-pnpm -s test:e2e --project=chromium}
# The port of `vite preview` in playwright.config.ts. A second test run on the same port fails.
E2E_PORT=${PAWCHESTRA_E2E_PORT:-4182}

# Prints the 1-minute load average (Linux: /proc/loadavg, macOS: sysctl).
load_average() {
  if [ -r /proc/loadavg ]; then
    cut -d' ' -f1 /proc/loadavg
  else
    sysctl -n vm.loadavg | tr -d '{}' | awk '{ print $1 }'
  fi
}

# Waits until the load average is at most E2E_MAX_LOAD and the test port is free, for E2E_WAIT
# seconds at most. Prints the cause of the wait every 30 seconds.
wait_for_quiet() {
  local start=$SECONDS next=0 load why waited
  while :; do
    load=$(load_average)
    why=
    if awk -v l="$load" -v m="$E2E_MAX_LOAD" 'BEGIN { exit !(l > m) }'; then
      why="the load average is $load (the limit is $E2E_MAX_LOAD)"
    fi
    if lsof -nP -iTCP:"$E2E_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      why="${why:+$why, and }port $E2E_PORT is in use"
    fi
    if [ -z "$why" ]; then
      return 0
    fi
    waited=$((SECONDS - start))
    if [ "$waited" -ge "$E2E_WAIT" ]; then
      echo "Waited ${waited}s, and $why. The end-to-end tests run now."
      return 0
    fi
    if [ "$waited" -ge "$next" ]; then
      echo "The end-to-end tests wait: $why. Waited ${waited}s of at most ${E2E_WAIT}s."
      next=$((waited + 30))
    fi
    sleep 5
  done
}

# Runs the end-to-end tests after the wait. $1 is the number of the run. The log is
# $MERGE_TMP/e2e-<n>.log.
run_e2e() {
  wait_for_quiet
  echo "Run $1 of the Chromium end-to-end tests starts (load average $(load_average))."
  bash -c "$E2E_CMD" >"$MERGE_TMP/e2e-$1.log" 2>&1
}

cd "$WORKTREE"
if [ "$(git branch --show-current)" != "$BRANCH" ]; then
  echo "The worktree $WORKTREE does not have $BRANCH checked out." >&2
  exit 1
fi
pnpm install --frozen-lockfile >>"$LOG" 2>&1

if ! git rebase main >>"$LOG" 2>&1; then
  echo "Rebase conflict. Resolve it in $WORKTREE, then run the script again."
  git status --short | head -20
  exit 2
fi

# The check script checks each commit in a temporary worktree, and it changes no commit
# and no file of $WORKTREE. Each commit runs only the unit tests that its changes reach
# through the imports (`--changed`). The other tests give the result of its parent, which
# the step before checked. A test that reads a file with no import does not see a change of
# that file, so the full suite runs one time on the last commit, with no cache. A commit
# with an entry in the cache prints "hit".
HEAD_BEFORE=$(git rev-parse HEAD)
CHECK_ARGS=()
if [ "${MERGE_NO_CACHE:-0}" = 1 ]; then
  CHECK_ARGS=(--no-cache)
fi
CHECK_STATUS=0
"$SCRIPT_DIR/check-commits.sh" ${CHECK_ARGS[@]+"${CHECK_ARGS[@]}"} main || CHECK_STATUS=$?
case $CHECK_STATUS in
  0) ;;
  1)
    echo "The commit checks could not start in $WORKTREE." >&2
    exit 1
    ;;
  4)
    echo "HEAD of $WORKTREE moved during the commit checks. Examine $WORKTREE." >&2
    exit 4
    ;;
  *)
    echo "A commit failed a check. The branch is unchanged."
    exit 3
    ;;
esac
if [ "$(git rev-parse HEAD)" != "$HEAD_BEFORE" ]; then
  echo "HEAD of $WORKTREE moved during the commit checks. Examine $WORKTREE." >&2
  exit 4
fi
echo "Checked $(git rev-list --count main..HEAD) commits in ${SECONDS}s."

pnpm -s test >"$MERGE_TMP/test-full.log" 2>&1 || {
  tail -30 "$MERGE_TMP/test-full.log"
  echo "The full unit suite failed on the last commit. The log is $MERGE_TMP/test-full.log."
  exit 3
}
echo "Ran the full unit suite with no cache at ${SECONDS}s."

ARM_FILES=$(git diff --name-only main HEAD | grep -E '^(src/pose|src/models|tools/blender)/' || true)
if [ -z "$ARM_FILES" ]; then
  echo "The branch changes no file of src/pose/, src/models/, or tools/blender/, so the arm gate does not run."
elif [ "$ARM_CHECK" = 0 ]; then
  echo "The arm gate does not run (--no-arm-check). Give the reason in the merge report."
else
  ARM_STATUS=0
  pnpm -s arm-check --all --base main >"$MERGE_TMP/arm-check.log" 2>&1 || ARM_STATUS=$?
  cat "$MERGE_TMP/arm-check.log"
  case $ARM_STATUS in
    0) echo "The arm gate passed at ${SECONDS}s." ;;
    1)
      echo "A value of the arm gate failed. The log is $MERGE_TMP/arm-check.log."
      exit 7
      ;;
    *)
      echo "The arm gate could not run. The log is $MERGE_TMP/arm-check.log."
      exit 7
      ;;
  esac
fi

# A branch that changes only docs cannot change the site.
SITE_FILES=$(git diff --name-only main HEAD | grep -vE '^docs/|\.md$' || true)
if [ -z "$SITE_FILES" ]; then
  echo "The branch changes only docs, so the build, size, and end-to-end checks do not run."
else
  pnpm -s build >"$MERGE_TMP/build.log" 2>&1 || {
    echo "The build failed. The log is $MERGE_TMP/build.log."
    exit 5
  }
  pnpm -s size >"$MERGE_TMP/size.log" 2>&1 || {
    cat "$MERGE_TMP/size.log"
    echo "The size check failed."
    exit 5
  }
  tail -2 "$MERGE_TMP/size.log"
  if [ "$E2E_RUN" = 1 ]; then
    # CI blocks a merge on the Chromium end-to-end tests (design 9.2). The merge of step 8
    # broke three of them, because no branch ran them (review of step 8, H1).
    # A failure on a busy machine can pass on a second run. A real failure fails two times.
    if run_e2e 1; then
      E2E_LOG=$MERGE_TMP/e2e-1.log
    else
      tail -15 "$MERGE_TMP/e2e-1.log"
      echo "Run 1 of the end-to-end tests failed (the log tail is above). The tests run again."
      if run_e2e 2; then
        E2E_LOG=$MERGE_TMP/e2e-2.log
        echo "Run 2 of the end-to-end tests passed."
      else
        tail -30 "$MERGE_TMP/e2e-2.log"
        echo "The Chromium end-to-end tests failed two times. The logs are" \
          "$MERGE_TMP/e2e-1.log and $MERGE_TMP/e2e-2.log."
        exit 6
      fi
    fi
    tail -2 "$E2E_LOG"
    echo "Ran the build, size, and end-to-end checks at ${SECONDS}s."
  else
    echo "Ran the build and size checks at ${SECONDS}s. The end-to-end tests are paused."
  fi
fi

if [ "$CHECK_ONLY" = 1 ]; then
  cd "$REPO"
  if [ "$TEMP_WORKTREE" = 1 ]; then
    git worktree remove --force "$WORKTREE"
  fi
  rm -rf "$MERGE_TMP"
  echo "Each check passed in ${SECONDS}s. With --check-only, main and $BRANCH stay as they are."
  exit 0
fi

cd "$REPO"
# Another session can commit on main while the checks run. Then main is no longer an
# ancestor of the branch, and the fast-forward is not possible.
if ! git merge-base --is-ancestor main "$BRANCH"; then
  echo "main moved during the checks, so main and $BRANCH stay as they are. Run the script again."
  exit 8
fi
git merge --ff-only "$BRANCH"
git log --oneline -1
# Git ignores reports/, so a forced remove of the worktree deletes the report images of the
# round. Copy them into the main checkout first (docs/agents/workflow.md, "Report images").
if [ -d "$WORKTREE/reports" ] && [ "$(cd "$WORKTREE" && pwd -P)" != "$(pwd -P)" ]; then
  mkdir -p reports
  cp -R "$WORKTREE/reports/." reports/
  echo "Copied the report folders of $WORKTREE into reports/."
fi
# Git also ignores scratch/, which holds the try files of a round (kept rigs, patches, configs).
# Keep them in scratch/merged/<branch>/ of the main checkout, with no package folder.
if [ -d "$WORKTREE/scratch" ] && [ "$(cd "$WORKTREE" && pwd -P)" != "$(pwd -P)" ]; then
  mkdir -p "scratch/merged/$BRANCH"
  rsync -a --exclude node_modules --exclude .git "$WORKTREE/scratch/" "scratch/merged/$BRANCH/"
  echo "Copied the scratch files of $WORKTREE into scratch/merged/$BRANCH/."
fi
git worktree remove --force "$WORKTREE"
git branch -D "$BRANCH"
rm -rf "$MERGE_TMP"
echo "Merged $BRANCH in ${SECONDS}s."

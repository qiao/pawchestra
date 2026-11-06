#!/usr/bin/env bash
# Usage: tools/check-commits.sh [--tip] [--no-cache] <base>
#
# Checks each commit of <base>..HEAD with the checks of a merge, and keeps the result of each
# passed commit in a cache that each worktree shares: $(git rev-parse --git-common-dir)/check-cache/.
# The result of a check is a fact of the tree, so a commit with a known key prints "hit" and runs
# no check. Each other commit prints the time of each check.
#
# tools/check-cache.ts gives the plan and the key of each commit. The key holds the tree of the
# commit, the tree of its parent, the check commands, the hash of this script and of the module,
# the versions of Node and pnpm, PAWCHESTRA_BASE, and the hash of the installed lockfile. A commit
# that changes code runs the lint, the typecheck, the unit tests that its changes reach, and the
# format check. A commit that changes only docs/ and Markdown files runs the format check and the
# tests that read docs paths.
#
# --tip also runs the full unit suite on the last commit. --no-cache reads no entry, and it
# still writes an entry for each passed check. Only this script writes an entry, after each
# check of the commit exits with 0 on an unchanged tree, through a temporary file and `mv`.
#
# The checks run in a temporary detached worktree of HEAD, which the script adds only when a
# commit has no entry. The script never changes the checkout where you call it, and it needs no
# clean tree there: an edit during the run changes no check. The temporary worktree gets a link to
# the node_modules of the caller when its installed lockfile is the lockfile of HEAD, else
# `pnpm install --frozen-lockfile --offline`. The script and the module run from a copy in a
# temporary folder, because the caller can edit them during the run.
#
# The script refuses a range with a merge commit, because the checks of a commit read only the
# diff to its first parent. It stops with 4 when HEAD of the caller moved during the run. The
# temporary worktree goes away after a pass, after a failure, and after a stop (INT or TERM). A
# `kill -9` leaves it: `git worktree list` shows it, and `git worktree remove --force` removes it.
#
# Exit codes: 1 bad use or bad state, 3 a check failed (the branch is unchanged), 4 HEAD moved
# during the run, 130 a stop.
set -euo pipefail

usage() {
  echo "Usage: tools/check-commits.sh [--tip] [--no-cache] <base>" >&2
  exit 1
}

# Prints the time now in seconds, with one decimal.
now() {
  perl -MTime::HiRes=time -e 'printf "%.1f\n", time'
}

# Prints the seconds since the time $1, with one decimal.
since() {
  awk -v start="$1" -v end="$(now)" 'BEGIN { printf "%.1f", end - start }'
}

# Writes the cache entry $1 of the commit $2 with the subject $3 and the times $4. The entry goes
# into a temporary file first, so a reader never sees a part of an entry.
write_entry() {
  local tmp
  mkdir -p "$CHECK_CACHE"
  tmp=$(mktemp "$CHECK_CACHE/.entry.XXXXXX")
  printf 'commit %s\nsubject %s\nchecks %s\ndate %s\n' "$2" "$3" "$4" \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$tmp"
  mv -f "$tmp" "$CHECK_CACHE/$1"
}

# Runs the plan in the file $1, which holds one commit line and its check lines, in the current
# folder. $2 goes before the report line. Prints "hit" for a known key, or the time of each check.
# Returns 1 at the first failed check, after the tail of its log.
run_plan() {
  local plan=$1 label=$2 tag commit key name cmd short subject log start report=
  IFS=$'\t' read -r tag commit key <"$plan"
  if [ "$tag" != commit ]; then
    echo "The plan $plan has no commit line." >&2
    return 1
  fi
  short=$(git rev-parse --short "$commit")
  subject=$(git log -1 --format=%s "$commit")
  if [ "$CHECK_NO_CACHE" = 0 ] && [ -f "$CHECK_CACHE/$key" ]; then
    echo "${label}${short} hit  $subject"
    return 0
  fi

  while IFS=$'\t' read -r tag name cmd; do
    if [ "$tag" != check ]; then
      continue
    fi
    log="$CHECK_TMP/$short-${name// /-}.log"
    start=$(now)
    if ! bash -c "$cmd" >"$log" 2>&1 </dev/null; then
      tail -20 "$log"
      echo "RED ${label}${short} $name failed after $(since "$start")s: $subject"
      echo "The log is $log."
      return 1
    fi
    report="${report:+$report, }$name $(since "$start")s"
  done <"$plan"
  if [ -z "$report" ]; then
    echo "RED ${label}${short} the plan has no check: $subject"
    return 1
  fi

  # A check result is a fact of the tree only when the checks saw the tree of the commit. A file
  # that a check writes or changes, or a move of HEAD, gives no entry. The link to the
  # node_modules of the caller is not a file of the tree.
  local changed
  changed=$(git status --porcelain --untracked-files=all -- ':(exclude)node_modules')
  if [ -n "$changed" ] || [ "$(git rev-parse HEAD)" != "$commit" ]; then
    echo "$changed" | head -20
    echo "RED ${label}${short} a check changed the temporary worktree or its HEAD: $subject"
    echo "The commit has no entry."
    return 1
  fi
  write_entry "$key" "$commit" "$subject" "$report"
  echo "${label}${short} $report  $subject"
}

# Prints the process IDs of each descendant of the process $1.
descendants() {
  local child
  for child in $(pgrep -P "$1" || true); do
    echo "$child"
    descendants "$child"
  done
}

# Removes the temporary worktree, if it exists. The link to the node_modules of the caller goes
# first, so that no removal can reach the files of the caller. An EXIT trap runs it.
remove_worktree() {
  if [ -z "${CHECK_WT:-}" ] || [ ! -e "$CHECK_WT" ]; then
    return 0
  fi
  if [ -L "$CHECK_WT/node_modules" ]; then
    rm -f "$CHECK_WT/node_modules"
  fi
  if ! git -C "$TOP" worktree remove --force "$CHECK_WT" >/dev/null 2>&1; then
    rm -rf "$CHECK_WT"
    git -C "$TOP" worktree prune
  fi
}

# Stops the checks and each of their processes, and removes the temporary worktree. A trap on INT
# and TERM runs it.
stop_checks() {
  trap - INT TERM
  if [ -n "${CHECK_PID:-}" ]; then
    # shellcheck disable=SC2046 # Each process ID is one word.
    kill -TERM "$CHECK_PID" $(descendants "$CHECK_PID") 2>/dev/null || true
    wait "$CHECK_PID" 2>/dev/null || true
  fi
  remove_worktree
  echo "The check stopped. The temporary worktree is removed, and $TOP is unchanged." >&2
  exit 130
}

# Adds the temporary worktree at HEAD, and gives it the dependencies: a link to the node_modules
# of the caller when its installed lockfile is the lockfile of HEAD, else an offline install from
# the store of pnpm. A tree with no lockfile takes the node_modules of the caller, if it has one.
# Sets DEPS to the way.
make_worktree() {
  local lock="$CHECK_TMP/lock.yaml"
  git -c core.hooksPath=/dev/null worktree add --detach -q "$CHECK_WT" "$HEAD_BEFORE"
  if ! git show "$HEAD_BEFORE:pnpm-lock.yaml" >"$lock" 2>/dev/null; then
    lock=
  fi
  if [ -d "$TOP/node_modules" ] &&
    { [ -z "$lock" ] || cmp -s "$TOP/node_modules/.pnpm/lock.yaml" "$lock"; }; then
    ln -s "$TOP/node_modules" "$CHECK_WT/node_modules"
    DEPS="a link to $TOP/node_modules"
  elif [ -n "$lock" ]; then
    if ! (cd "$CHECK_WT" && pnpm install --frozen-lockfile --offline) \
      >"$CHECK_TMP/install.log" 2>&1 </dev/null; then
      tail -20 "$CHECK_TMP/install.log"
      echo "The offline install failed. Run pnpm install --frozen-lockfile in $TOP first." >&2
      return 1
    fi
    DEPS="an offline install, because $TOP/node_modules does not hold the lockfile of HEAD"
  else
    DEPS="no node_modules"
  fi
}

# Checks each commit of the file $CHECK_TMP/todo.txt in the temporary worktree, in its order,
# then the last commit with the full unit suite for --tip. Returns 3 at the first failure.
check_in_worktree() {
  local commit
  cd "$CHECK_WT"
  for commit in $(cat "$CHECK_TMP/todo.txt"); do
    git -c core.hooksPath=/dev/null checkout --detach -q "$commit"
    node "$CHECK_BIN/check-cache.ts" plan commit HEAD >"$CHECK_TMP/plan-one.txt"
    run_plan "$CHECK_TMP/plan-one.txt" '' || return 3
  done
  if [ "$TIP" = 1 ]; then
    git -c core.hooksPath=/dev/null checkout --detach -q "$HEAD_BEFORE"
    node "$CHECK_BIN/check-cache.ts" plan tip HEAD >"$CHECK_TMP/plan-tip.txt"
    run_plan "$CHECK_TMP/plan-tip.txt" 'tip ' || {
      echo "The full unit suite failed on the last commit."
      return 3
    }
  fi
}

main() {
  TIP=0
  CHECK_NO_CACHE=0
  while [ $# -gt 0 ]; do
    case $1 in
      --tip) TIP=1 ;;
      --no-cache) CHECK_NO_CACHE=1 ;;
      -*) usage ;;
      *) break ;;
    esac
    shift
  done
  if [ $# -ne 1 ]; then
    usage
  fi
  BASE=$1
  local source_dir
  source_dir=$(cd "$(dirname "$0")" && pwd)

  TOP=$(git rev-parse --show-toplevel)
  cd "$TOP"
  # During a rebase, HEAD is not the tip of the branch.
  if [ -d "$(git rev-parse --git-path rebase-merge)" ]; then
    echo "A rebase is in progress. Finish it or abort it first." >&2
    exit 1
  fi
  git rev-parse --verify --quiet "$BASE^{commit}" >/dev/null || {
    echo "No commit $BASE." >&2
    exit 1
  }
  local merges
  merges=$(git rev-list --merges "$BASE..HEAD")
  if [ -n "$merges" ]; then
    echo "$BASE..HEAD has a merge commit. Rebase the branch onto $BASE first:" >&2
    echo "$merges" | head -5 >&2
    exit 1
  fi
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "The working tree has changes. The script checks only the commits."
  fi

  CHECK_CACHE="$(git rev-parse --path-format=absolute --git-common-dir)/check-cache"
  local tmp_root=${TMPDIR:-/tmp}
  CHECK_TMP=$(mktemp -d "${tmp_root%/}/check-commits.XXXXXX")
  CHECK_BIN=$CHECK_TMP/bin
  CHECK_WT=
  mkdir "$CHECK_BIN"
  cp "$source_dir/check-commits.sh" "$source_dir/check-cache.ts" "$CHECK_BIN/"
  export CHECK_CACHE CHECK_TMP CHECK_BIN CHECK_NO_CACHE

  # The keys of this first pass use the node_modules of the caller. With a link, the temporary
  # worktree gives the same keys. Else each commit gets its plan again in the temporary worktree.
  HEAD_BEFORE=$(git rev-parse HEAD)
  local commits count=0 first_miss= tag commit key
  commits=$(git rev-list --reverse "$BASE..HEAD")
  : >"$CHECK_TMP/todo.txt"
  if [ -n "$commits" ]; then
    # shellcheck disable=SC2086 # Each hash is one word.
    node "$CHECK_BIN/check-cache.ts" plan commit $commits >"$CHECK_TMP/plan-all.txt"
    while IFS=$'\t' read -r tag commit key; do
      if [ "$tag" != commit ]; then
        continue
      fi
      count=$((count + 1))
      if [ -z "$first_miss" ] && [ "$CHECK_NO_CACHE" = 0 ] && [ -f "$CHECK_CACHE/$key" ]; then
        echo "$(git rev-parse --short "$commit") hit  $(git log -1 --format=%s "$commit")"
        continue
      fi
      first_miss=${first_miss:-$commit}
      echo "$commit" >>"$CHECK_TMP/todo.txt"
    done <"$CHECK_TMP/plan-all.txt"
  fi
  local expected
  expected=$(git rev-list --count "$BASE..HEAD")
  if [ "$count" != "$expected" ]; then
    echo "The plan has $count commits, and $BASE..HEAD has $expected. The plan is wrong." >&2
    exit 1
  fi

  local need_tree=0
  if [ -n "$first_miss" ]; then
    need_tree=1
  elif [ "$TIP" = 1 ]; then
    node "$CHECK_BIN/check-cache.ts" plan tip HEAD >"$CHECK_TMP/plan-tip.txt"
    IFS=$'\t' read -r tag commit key <"$CHECK_TMP/plan-tip.txt"
    if [ "$CHECK_NO_CACHE" = 0 ] && [ -f "$CHECK_CACHE/$key" ]; then
      echo "tip $(git rev-parse --short "$commit") hit  $(git log -1 --format=%s "$commit")"
    else
      need_tree=1
    fi
  fi

  # A stop (Ctrl-C, kill, or the time limit of a tool) runs stop_checks(): it stops the checks
  # and removes the temporary worktree. The checks run in the background, because bash runs a
  # trap only after the foreground command.
  if [ "$need_tree" = 1 ]; then
    CHECK_WT=$CHECK_TMP/worktree
    trap remove_worktree EXIT
    trap stop_checks INT TERM
    local start status=0
    start=$(now)
    make_worktree
    echo "The checks run in the temporary worktree $CHECK_WT, with $DEPS ($(since "$start")s)."
    check_in_worktree &
    CHECK_PID=$!
    wait "$CHECK_PID" || status=$?
    CHECK_PID=
    trap - INT TERM
    remove_worktree
    if [ "$status" != 0 ]; then
      echo "A commit failed a check. The branch is unchanged, and that commit has no entry."
      echo "The logs are in $CHECK_TMP."
      exit 3
    fi
  fi

  local head_now
  head_now=$(git rev-parse HEAD)
  if [ "$head_now" != "$HEAD_BEFORE" ]; then
    echo "HEAD moved from $(git rev-parse --short "$HEAD_BEFORE") to" \
      "$(git rev-parse --short "$head_now") during the run. The run checked the commits up to" \
      "$(git rev-parse --short "$HEAD_BEFORE"), with an entry for each passed commit. Run the" \
      "script again for the new commits." >&2
    rm -rf "$CHECK_TMP"
    exit 4
  fi
  rm -rf "$CHECK_TMP"
  echo "Checked $count commits of $BASE..HEAD in ${SECONDS}s."
}

# The caller can edit this file during the run. Bash reads a script while it runs it, so the call
# and the exit are on one line, which bash reads in full before it runs it.
main "$@"; exit "$?"

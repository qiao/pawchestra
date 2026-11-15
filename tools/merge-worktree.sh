#!/usr/bin/env bash
# Usage: tools/merge-worktree.sh [--into <path>] [--resume] <name> [<base>]
#
# Merges the commits of the worktree .claude/worktrees/<name> of the main checkout into the
# checkout <path> (default: the main checkout) with cherry-picks, and removes the worktree. It
# never pushes. <base> is the commit before the first commit of the round (default: the merge-base
# of the worktree HEAD and the HEAD of <path>). The steps:
#
#   1. Stop when the worktree has uncommitted or untracked files, or when <path> has an uncommitted
#      edit of a file that the commits touch, or of src/models/body-heights.ts. Name the files.
#   2. Cherry-pick <base>..<worktree HEAD> into <path>. A commit that becomes empty is dropped. On a
#      conflict in a body module or in the heights module, write the files again with
#      tools/regen-bodies.sh, and continue. Stop on a conflict in another file.
#   3. Write the touched body modules and the heights module again. Stop when a file differs.
#   4. Copy scratch/ and reports/ of the worktree into <path> with `rsync -a --update`, and replace
#      the absolute path of the worktree with <path> in each copied text file of scratch/.
#   5. Remove the worktree, and delete its branch if it has one.
#   6. Run tools/round-checks.sh in <path>, with --fast when no file of the app changed. The logs go
#      into scratch/checks/merge-<name>/.
#
# --resume starts at step 3. Use it after you resolve a conflict by hand and finish the cherry-pick.
#
# Exit codes: 1 bad use or bad state, 2 an uncommitted edit in <path> (step 1), 3 a cherry-pick
# conflict to resolve by hand, 4 a regenerated file failed or differs, 5 a round check failed.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
USAGE="Usage: tools/merge-worktree.sh [--into <path>] [--resume] <name> [<base>]"

INTO=
RESUME=0
while [ $# -gt 0 ]; do
  case $1 in
    --into)
      [ $# -ge 2 ] || { echo "$USAGE" >&2; exit 1; }
      INTO=$(cd "$2" && pwd)
      shift 2
      ;;
    --resume)
      RESUME=1
      shift
      ;;
    -*)
      echo "$USAGE" >&2
      exit 1
      ;;
    *) break ;;
  esac
done
if [ $# -lt 1 ] || [ $# -gt 2 ]; then
  echo "$USAGE" >&2
  exit 1
fi
NAME=$1

# The main checkout is the first entry of the worktree list.
MAIN=$(git -C "$SCRIPT_DIR" worktree list --porcelain | awk '/^worktree /{ print substr($0, 10); exit }')
INTO=${INTO:-$MAIN}
WT=$MAIN/.claude/worktrees/$NAME
if [ ! -d "$WT" ]; then
  echo "No worktree $WT." >&2
  exit 1
fi
WT=$(cd "$WT" && pwd)
if [ "$WT" = "$INTO" ]; then
  echo "The worktree and the target are the same checkout." >&2
  exit 1
fi

cd "$INTO"
if [ "$INTO" = "$MAIN" ] && [ "$(git branch --show-current)" != main ]; then
  echo "The main checkout $MAIN must have main checked out." >&2
  exit 1
fi
for ref in CHERRY_PICK_HEAD MERGE_HEAD REVERT_HEAD; do
  if git rev-parse -q --verify "$ref" >/dev/null; then
    echo "$INTO has a $ref. Finish or abort that operation first." >&2
    exit 1
  fi
done
if [ -d "$(git rev-parse --git-path rebase-merge)" ] || [ -d "$(git rev-parse --git-path rebase-apply)" ]; then
  echo "$INTO has a rebase in progress. Finish or abort it first." >&2
  exit 1
fi

WT_HEAD=$(git -C "$WT" rev-parse HEAD)
WT_BRANCH=$(git -C "$WT" branch --show-current)
BASE=${2:-$(git merge-base "$WT_HEAD" HEAD)}
BASE=$(git rev-parse --verify "$BASE^{commit}")
TOUCHED=()
while IFS= read -r path; do
  TOUCHED+=("$path")
done < <(git diff --name-only "$BASE" "$WT_HEAD")
if [ "${#TOUCHED[@]}" -eq 0 ]; then
  echo "The commits of $BASE..$WT_HEAD change no file. Nothing to merge." >&2
  exit 1
fi

# Uncommitted work in the worktree is lost at the forced remove of step 5.
WT_DIRTY=$(git -C "$WT" status --porcelain)
if [ -n "$WT_DIRTY" ]; then
  echo "The worktree $WT has uncommitted or untracked files:" >&2
  echo "$WT_DIRTY" >&2
  exit 1
fi

# Prints the tracked files of the target with an uncommitted change, one in each line.
dirty_files() {
  git status --porcelain --untracked-files=no | cut -c4-
}

# Writes the named body modules (each one a path of src/models/bodies/) and the heights module
# again in the target. Returns the status of tools/regen-bodies.sh.
regen_modules() {
  local animals=(--heights) path
  if [ $# -gt 0 ]; then
    animals=()
  fi
  for path in "$@"; do
    animals+=("$(basename "$path" .ts)")
  done
  "$SCRIPT_DIR/regen-bodies.sh" "${animals[@]}"
}

# Prints the body modules among the paths of the arguments that exist in the target.
body_modules() {
  local path
  for path in "$@"; do
    case $path in
      src/models/bodies/*.ts) [ -f "$path" ] && echo "$path" ;;
    esac
  done
  return 0
}

if [ "$RESUME" = 0 ]; then
  BUSY=$(git status --porcelain --untracked-files=all -- "${TOUCHED[@]}" src/models/body-heights.ts)
  if [ -n "$BUSY" ]; then
    echo "$INTO has uncommitted edits of files that the commits touch. Wait, or commit them first:"
    echo "$BUSY"
    exit 2
  fi

  echo "Picking $(git rev-list --count "$BASE..$WT_HEAD") commits of $NAME into $INTO."
  BEFORE=$(git rev-parse HEAD)
  PICK=(env GIT_EDITOR=true git -c core.hooksPath=tools/git-hooks cherry-pick)
  STATUS=0
  "${PICK[@]}" --empty=drop "$BASE..$WT_HEAD" || STATUS=$?
  while [ "$STATUS" -ne 0 ]; do
    CONFLICTS=()
    GENERATED=()
    while IFS= read -r path; do
      CONFLICTS+=("$path")
      case $path in
        src/models/bodies/*.ts | src/models/body-heights.ts) GENERATED+=("$path") ;;
      esac
    done < <(git diff --name-only --diff-filter=U)
    if [ "${#CONFLICTS[@]}" -eq 0 ] || [ "${#CONFLICTS[@]}" -ne "${#GENERATED[@]}" ]; then
      echo "The cherry-pick stopped in $INTO. Conflicts:"
      git diff --name-only --diff-filter=U
      echo "Resolve each file by hand, and never a generated file."
      echo "Then run \`git add <file>\` and \`GIT_EDITOR=true git cherry-pick --continue\`, and"
      echo "run this script again with --resume."
      exit 3
    fi
    # Take the version of the picked commit, so that each module parses, then write each file
    # again from the merged tree.
    git checkout --theirs -- "${GENERATED[@]}"
    echo "Writing the conflicted generated files again: ${GENERATED[*]}"
    MODULES=()
    while IFS= read -r path; do
      MODULES+=("$path")
    done < <(body_modules "${GENERATED[@]}")
    regen_modules ${MODULES[@]+"${MODULES[@]}"} || {
      echo "A generated file failed. Examine $INTO (cherry-pick in progress)."
      exit 4
    }
    git add -- "${GENERATED[@]}" src/models/body-heights.ts
    STATUS=0
    "${PICK[@]}" --continue || STATUS=$?
  done
  git log --oneline "$BEFORE..HEAD"
fi

# Step 3: the touched modules and the heights module, from the merged tree.
DIRTY_BEFORE=$(dirty_files | sort)
MODULES=()
while IFS= read -r path; do
  MODULES+=("$path")
done < <(body_modules "${TOUCHED[@]}")
regen_modules ${MODULES[@]+"${MODULES[@]}"} || {
  echo "A generated file failed. The worktree $WT stays."
  exit 4
}
NEW_DIRTY=$(comm -13 <(echo "$DIRTY_BEFORE") <(dirty_files | sort))
if [ -n "$NEW_DIRTY" ]; then
  echo "A regenerated file differs from the picked commits:"
  echo "$NEW_DIRTY"
  echo "Examine the diff, commit the files in $INTO, and run this script again with --resume."
  exit 4
fi

# Step 4: git ignores scratch/ and reports/, so the forced remove deletes them. Copy them first.
for dir in scratch reports; do
  if [ -d "$WT/$dir" ]; then
    mkdir -p "$dir"
    rsync -a --update --exclude node_modules --exclude .git "$WT/$dir/" "$dir/"
    echo "Copied $dir/ of the worktree into $INTO/$dir/."
  fi
done
# A copied script with the absolute path of the worktree runs in the removed folder. Point it to
# the target.
if [ -d "$WT/scratch" ]; then
  REWRITTEN=0
  while IFS= read -r source; do
    copy=scratch/${source#"$WT/scratch/"}
    if [ -f "$copy" ] && grep -qIF -- "$WT" "$copy"; then
      OLD=$WT NEW=$INTO perl -pi -e 's/\Q$ENV{OLD}\E/$ENV{NEW}/g' "$copy"
      REWRITTEN=$((REWRITTEN + 1))
    fi
  done < <(grep -rlIF --exclude-dir=node_modules --exclude-dir=.git -- "$WT" "$WT/scratch" || true)
  echo "Replaced the worktree path with $INTO in $REWRITTEN copied files of scratch/."
fi

# Step 5.
git worktree remove --force "$WT"
echo "Removed the worktree $WT."
if [ -n "$WT_BRANCH" ]; then
  echo "Deleting the branch $WT_BRANCH (tip $WT_HEAD)."
  git branch -D "$WT_BRANCH"
fi

# Step 6.
if printf '%s\n' "${TOUCHED[@]}" | grep -E '^(package\.json|pnpm-lock\.yaml)$' >/dev/null; then
  pnpm install --frozen-lockfile >/dev/null
fi
# The files of the app. A change of one of them needs the smoke test (AGENTS.md, "Checks").
APP_FILES='^(src|public|assets)/|^(index\.html|vite\.config\.ts|package\.json)$'
CHECK_ARGS=(--fast)
if printf '%s\n' "${TOUCHED[@]}" | grep -E "$APP_FILES" >/dev/null; then
  CHECK_ARGS=()
fi
STATUS=0
"$SCRIPT_DIR/round-checks.sh" ${CHECK_ARGS[@]+"${CHECK_ARGS[@]}"} "scratch/checks/merge-$NAME" || STATUS=$?
if [ "$STATUS" -ne 0 ]; then
  echo "A round check failed after the merge of $NAME."
  exit 5
fi
echo "Merged $NAME into $INTO in ${SECONDS}s."

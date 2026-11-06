#!/usr/bin/env bash
# Usage: tools/deploy-vercel.sh [--preview]
#
# Builds the site at the base path `/`, and deploys `dist/` with the cache headers of `vercel.json`
# to the Vercel project `pawchestra` (design 9.2). Only this build counts the page views with Vercel
# Web Analytics (`PAWCHESTRA_ANALYTICS=1`, design 2.7). The script copies `dist/` and
# `vercel.json` into a temporary folder that has the name of the project, so that Vercel serves
# the files as they are and runs no build. The Vercel CLI must be logged in. VERCEL_SCOPE selects
# a team.
#
# Without --preview, the deploy goes to production.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
target=(--prod)
if [[ "${1:-}" == "--preview" ]]; then
  target=()
fi
scope=()
if [[ -n "${VERCEL_SCOPE:-}" ]]; then
  scope=(--scope "$VERCEL_SCOPE")
fi

cd "$root"
PAWCHESTRA_BASE=/ PAWCHESTRA_ANALYTICS=1 pnpm build

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
mkdir "$stage/pawchestra"
cp -R dist/. "$stage/pawchestra/"
cp vercel.json "$stage/pawchestra/"

cd "$stage/pawchestra"
# The `+` form keeps an empty array valid under `set -u` in bash 3.2 of macOS.
vercel deploy --yes ${target[@]+"${target[@]}"} ${scope[@]+"${scope[@]}"}

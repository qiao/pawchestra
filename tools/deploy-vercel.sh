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
# Without --preview, the deploy goes to production. With --preview, the script then points the
# stable alias pawchestra-preview.vercel.app to the new deploy (team VERCEL_SCOPE, default algoart),
# because each deploy has a new URL. It prints the deploy URL and the alias URL.
set -euo pipefail

preview_alias=pawchestra-preview.vercel.app

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
# The `+` form keeps an empty array valid under `set -u` in bash 3.2 of macOS. The CLI writes the
# deploy URL to stdout, and its progress to stderr.
vercel deploy --yes ${target[@]+"${target[@]}"} ${scope[@]+"${scope[@]}"} >"$stage/deploy.out"
cat "$stage/deploy.out"
if [[ ${#target[@]} -gt 0 ]]; then
  exit 0
fi

url="$(grep -Eo 'https://[A-Za-z0-9.-]+\.vercel\.app' "$stage/deploy.out" | tail -1 || true)"
if [[ -z "$url" ]]; then
  echo "No deploy URL in the output of vercel deploy, so the alias $preview_alias stays." >&2
  exit 1
fi
vercel alias set "$url" "$preview_alias" --scope "${VERCEL_SCOPE:-algoart}"
echo "Deploy: $url"
echo "Preview: https://$preview_alias"

#!/usr/bin/env bash
# sync-public.sh — Push current master to the public frogop-pub repo,
# stripping out docs/, .github/workflows/, and internal planning files.
#
# Usage:  bash scripts/sync-public.sh
#
# This creates a temporary orphan commit from your current HEAD,
# removes excluded paths, and force-pushes to the "public" remote.
# The private repo is never modified.

set -euo pipefail

REMOTE="public"
EXCLUDED_PATHS=(
    "docs/"
    ".github/workflows/"
    "SPRINTBOARD.md"
    "AGENTS.md"
    "indexer/.wrangler/"
    "tests/dist/"
    "proxy/"
    "docker-compose.dev.yml"
    "docker-compose.prod.yml"
    "frontend/Dockerfile.dev"
    "frontend/Dockerfile.prod"
    "frontend/nginx/"
    "scripts/"
    "indexer/wrangler.toml"
)

# Verify we're in the repo root
if [[ ! -d .git ]]; then
    echo "ERROR: Run this from the repo root (where .git/ lives)."
    exit 1
fi

# Verify remote exists
if ! git remote get-url "$REMOTE" &>/dev/null; then
    echo "ERROR: Remote '$REMOTE' not found. Add it with:"
    echo "  git remote add public https://github.com/shoebillrexmail-cmyk/frogop-pub.git"
    exit 1
fi

echo "==> Creating clean snapshot from HEAD..."

# Work in a temporary directory
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# Export current HEAD into the temp dir
git archive HEAD | tar -x -C "$TMPDIR"

# Remove excluded paths
for path in "${EXCLUDED_PATHS[@]}"; do
    if [[ -e "$TMPDIR/$path" ]]; then
        rm -rf "${TMPDIR:?}/$path"
        echo "    removed $path"
    fi
done

# Create a new git repo in temp dir, commit, and push
cd "$TMPDIR"
git init -q
git checkout -q -b master
git add -A
git commit -q -m "Sync from private repo — $(date -u '+%Y-%m-%d %H:%M UTC')"

git remote add "$REMOTE" "$(cd "$OLDPWD" && git remote get-url "$REMOTE")"
echo "==> Pushing to $REMOTE (force)..."
git push --force "$REMOTE" master

echo "==> Done. Public repo updated."

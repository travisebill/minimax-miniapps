#!/usr/bin/env bash
# One-shot setup for this repository.
#
# Binary assets (plugin icons) cannot travel through a text-only Git push, so they live in
# assets/*.b64 and are decoded into place by this script (and by the embed-assets workflow).
#
# Run it once inside a fresh clone:
#   git clone --depth 1 https://github.com/travisebill/minimax-miniapps.git
#   cd minimax-miniapps && bash bootstrap.sh

set -euo pipefail
cd "$(dirname "$0")"

echo "==> decoding binary assets"
bash assets/decode-assets.sh

echo "==> installing the asset workflow"
mkdir -p .github/workflows
cp assets/embed-assets.yml .github/workflows/embed-assets.yml

echo "==> committing"
git add -A
if git diff --cached --quiet; then
  echo "nothing to commit"
else
  git commit -m "chore: embed plugin icons and asset workflow"
  git push
  echo "pushed"
fi

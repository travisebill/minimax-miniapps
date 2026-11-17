#!/usr/bin/env bash
# Decodes assets/*.b64 into the target paths listed in each manifest.
# Binary assets cannot travel through a text-only Git push; this is how they land in the repo.
set -euo pipefail
cd "$(dirname "$0")/.."
for manifest in assets/*.b64; do
  [ -e "$manifest" ] || continue
  while read -r path data; do
    case "$path" in ''|\#*) continue ;; esac
    [ -n "$data" ] || continue
    mkdir -p "$(dirname "$path")"
    printf '%s' "$data" | base64 -d > "$path"
    echo "wrote $path"
  done < "$manifest"
done

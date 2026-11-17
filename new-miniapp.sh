#!/usr/bin/env bash
# Scaffold a new Mini App package from templates/hello-miniapp.
#
#   bash new-miniapp.sh <plugin-id> "<顯示名稱>" "<一句話描述>"
#
# Creates plugins/<author>/<plugin-id>/ and writes a fresh manifest for it.
# The icon comes from the template; to use your own, drop the file in as a base64 asset
# under assets/ and run assets/decode-assets.sh (or let the embed-assets workflow do it).

set -euo pipefail
cd "$(dirname "$0")"

ID="${1:-}"
DISPLAY="${2:-}"
DESCRIPTION="${3:-}"
AUTHOR="${MINIAPP_AUTHOR:-travisebill}"

if [ -z "$ID" ] || [ -z "$DISPLAY" ]; then
  echo "usage: bash new-miniapp.sh <plugin-id> \"<顯示名稱>\" \"<一句話描述>\"" >&2
  exit 1
fi

TARGET="plugins/$AUTHOR/$ID"
if [ -e "$TARGET" ]; then
  echo "target already exists: $TARGET" >&2
  exit 1
fi

mkdir -p "$(dirname "$TARGET")"
cp -r templates/hello-miniapp "$TARGET"

if [ ! -f "$TARGET/icon.png" ]; then
  echo "note: the template icon is missing; run 'bash assets/decode-assets.sh' first" >&2
  exit 1
fi

cat > "$TARGET/.minimax-plugin/plugin.json" <<JSON
{
  "schemaVersion": 1,
  "name": "$ID",
  "displayName": "$DISPLAY",
  "version": "0.1.0",
  "description": "$DESCRIPTION",
  "author": "$AUTHOR",
  "icon": "icon.png",
  "category": "Other",
  "exampleQueries": ["打開$DISPLAY"],
  "apps": [],
  "mcpServers": [],
  "skills": []
}
JSON

echo "created $TARGET"
echo
echo "接下來："
echo "  1. 改 $TARGET/miniapp/client/index.html 與 $TARGET/miniapp/node/server.mjs"
echo "  2. 寫 $TARGET/README.md，必須有 '## Tested environment' 與 '## Data & access'"
echo "  3. 有自己的圖示 → 放進 assets/<name>.b64，再跑 bash assets/decode-assets.sh"
echo "  4. 驗證（在 MiniMax-Code-MiniApps 的 checkout 裡）：node scripts/validate.mjs $TARGET"
echo "  5. git add -A && git commit -m 'feat: $ID' && git push"

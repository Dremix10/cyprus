#!/usr/bin/env bash
# Start an isolated Cyprus QA server for the Playwright suite.
#
# - Copies the already-built server (packages/server/dist) and client
#   (packages/client/dist-prod) into e2e/web/.qa-server so the SQLite DB,
#   persisted rooms and logs land there instead of packages/server/data.
# - Wipes .qa-server on every start, so each run gets a fresh database.
# - Never touches production. Binds to 127.0.0.1 only.
#
# Build first if needed:  (cd ../.. && npm run build)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
R="$(cd "$HERE/../../.." && pwd)"           # repo root
QA="$R/e2e/web/.qa-server"
PORT="${QA_PORT:-3311}"

if [[ ! -f "$R/packages/server/dist/index.js" || ! -f "$R/packages/client/dist-prod/index.html" ]]; then
  echo "[qa-server] Missing build output. Run 'npm run build' at the repo root first." >&2
  exit 1
fi

rm -rf "$QA"
mkdir -p "$QA/packages/server" "$QA/packages/client"
cp -R "$R/packages/server/dist" "$QA/packages/server/dist"
cp "$R/packages/server/package.json" "$QA/packages/server/"
cp -R "$R/packages/client/dist-prod" "$QA/packages/client/dist-prod"
ln -s "$R/node_modules" "$QA/node_modules"

cd "$QA"
echo "[qa-server] starting on 127.0.0.1:$PORT (data dir: $QA/packages/server/data, log: $QA/server.log)"
# Server output goes to .qa-server/server.log (kept until the next run).
exec >"$QA/server.log" 2>&1
# Strip anything that could make the QA server talk to real services.
exec env \
  -u NODE_ENV -u DATA_API_KEY -u ADMIN_PASSWORD_HASH \
  -u SMTP_HOST -u SMTP_PORT -u SMTP_USER -u SMTP_PASS -u SMTP_FROM \
  -u GOOGLE_CLIENT_ID -u GOOGLE_IOS_CLIENT_ID -u GOOGLE_CLIENT_SECRET \
  -u TELEGRAM_BOT_TOKEN -u TELEGRAM_CHAT_ID -u ANTHROPIC_API_KEY \
  PORT="$PORT" HOST=127.0.0.1 APP_URL="http://127.0.0.1:$PORT" \
  node packages/server/dist/index.js

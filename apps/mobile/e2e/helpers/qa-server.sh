#!/usr/bin/env bash
# Disposable local game server for iPhone simulator QA (never production).
#   apps/mobile/e2e/helpers/qa-server.sh start   # copies built server + client into $QA, fresh SQLite, port 3301
#   apps/mobile/e2e/helpers/qa-server.sh seed    # qa_host / qa_friend / qa_friend2 + 15 ranked players
#   apps/mobile/e2e/helpers/qa-server.sh stop
# PORT=3321 runs a second, separate server (its own $QA dir) for another simulator.
# Needs `npm run build` at the repo root first (packages/server/dist, packages/client/dist-prod).
set -euo pipefail
R="$(cd "$(dirname "$0")/../../../.." && pwd)"
PORT="${PORT:-3301}"
QA="${QA:-${TMPDIR:-/tmp}/titsu-qa-server-$PORT}"

case "${1:-}" in
  start)
    rm -rf "$QA" && mkdir -p "$QA/packages/server" "$QA/packages/client"
    cp -R "$R/packages/server/dist" "$QA/packages/server/dist"
    cp "$R/packages/server/package.json" "$QA/packages/server/"
    cp -R "$R/packages/client/dist-prod" "$QA/packages/client/dist-prod"
    ln -s "$R/node_modules" "$QA/node_modules"
    # `&` must apply to node alone so $! is the server's pid (not a wrapping subshell).
    (cd "$QA"; PORT="$PORT" HOST=127.0.0.1 nohup node packages/server/dist/index.js > "$QA/server.log" 2>&1 & echo $! > "$QA/server.pid")
    for _ in $(seq 1 30); do curl -sf "localhost:$PORT/health" >/dev/null && break; sleep 0.5; done
    curl -s "localhost:$PORT/health"; echo
    echo "QA server dir: $QA (db: $QA/packages/server/data/cyprus.db)"
    ;;
  seed)
    QA_SERVER_URL="http://localhost:$PORT" QA_DB="$QA/packages/server/data/cyprus.db" node "$R/apps/mobile/e2e/helpers/qa-seed.mjs"
    ;;
  stop)
    [ -f "$QA/server.pid" ] && kill "$(cat "$QA/server.pid")" 2>/dev/null || true
    rm -f "$QA/server.pid"
    echo stopped
    ;;
  *)
    echo "usage: $0 start|seed|stop" >&2
    exit 2
    ;;
esac

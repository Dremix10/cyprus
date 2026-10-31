#!/usr/bin/env bash
# Disposable local game server for App Store screenshots: port 3321, its own temp dir and DB.
# Never production, never the other agents' QA servers (3301 / 3311).
#
#   shots-server.sh start    # copy built server + client into $SHOTS_QA, fresh SQLite, listen on 127.0.0.1:3321
#   shots-server.sh seed     # Greek-named leaderboard, showcase account, friends, game history
#   shots-server.sh friends  # keep 3 showcase friends online (auto-accept invites) until Ctrl-C
#   shots-server.sh status | stop | logs
#
# Uses the existing packages/server/dist + packages/client/dist-prod. It does NOT run `npm run build`.
# If dist is missing or stale, build only what you need (ask first in shared sessions):
#   npm run build -w packages/shared && npm run build -w packages/server
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
R="$(cd "$HERE/../../../../.." && pwd)"          # repo root (cyprus)
SHOTS_QA="${SHOTS_QA:-${TMPDIR:-/tmp}/titsu-shots-server}"
PORT="${PORT:-3321}"

case "$PORT" in
  3301|3311|3001) echo "Refusing port $PORT: reserved for other QA servers / production." >&2; exit 2 ;;
esac

server_up() { curl -sf "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; }

case "${1:-}" in
  start)
    [ -f "$R/packages/server/dist/index.js" ] || { echo "Missing packages/server/dist. Build the server first (see header)." >&2; exit 1; }
    [ -f "$R/packages/client/dist-prod/index.html" ] || { echo "Missing packages/client/dist-prod. Build the client first." >&2; exit 1; }
    if server_up; then echo "Something already answers on :$PORT. Run '$0 stop' first." >&2; exit 1; fi
    rm -rf "$SHOTS_QA" && mkdir -p "$SHOTS_QA/packages/server" "$SHOTS_QA/packages/client"
    cp -R "$R/packages/server/dist" "$SHOTS_QA/packages/server/dist"
    cp "$R/packages/server/package.json" "$SHOTS_QA/packages/server/"
    cp -R "$R/packages/client/dist-prod" "$SHOTS_QA/packages/client/dist-prod"
    ln -s "$R/node_modules" "$SHOTS_QA/node_modules"
    # Generous connection limits: the friend bots and Maestro reconnect a lot.
    (cd "$SHOTS_QA"; PORT="$PORT" HOST=127.0.0.1 CONN_RATE_MAX=1000 RECONNECT_RATE_MAX=1000 RECONNECT_IP_MAX=1000 \
      nohup node packages/server/dist/index.js > "$SHOTS_QA/server.log" 2>&1 & echo $! > "$SHOTS_QA/server.pid")
    for _ in $(seq 1 40); do server_up && break; sleep 0.5; done
    server_up || { echo "Server did not come up; see $SHOTS_QA/server.log" >&2; exit 1; }
    curl -s "http://127.0.0.1:$PORT/health"; echo
    echo "shots server: $SHOTS_QA (db: $SHOTS_QA/packages/server/data/cyprus.db)"
    ;;
  seed)
    SHOTS_SERVER_URL="http://localhost:$PORT" SHOTS_DB="$SHOTS_QA/packages/server/data/cyprus.db" \
      node "$HERE/seed-showcase.mjs" "${@:2}"
    ;;
  friends)
    SHOTS_SERVER_URL="http://localhost:$PORT" node "$HERE/friends-online.mjs" "${@:2}"
    ;;
  status)
    server_up && curl -s "http://127.0.0.1:$PORT/health" && echo || echo "not running on :$PORT"
    ;;
  logs)
    tail -n 80 "$SHOTS_QA/server.log"
    ;;
  stop)
    [ -f "$SHOTS_QA/server.pid" ] && kill "$(cat "$SHOTS_QA/server.pid")" 2>/dev/null || true
    rm -f "$SHOTS_QA/server.pid"
    echo stopped
    ;;
  *)
    echo "usage: $0 start|seed [--reset-bots]|friends|status|logs|stop" >&2
    exit 2
    ;;
esac

#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/dev/cyprus"
ENTRY="packages/server/dist/index.js"
LOG_FILE="server.log"
LOCK_FILE="${LOCK_FILE:-/home/dev/cyprus-deploy.lock}"
SERVICE_NAME="${SERVICE_NAME:-cyprus.service}"

echo "=== Deploy started at $(date) ==="

touch "$LOCK_FILE"
chmod 666 "$LOCK_FILE" 2>/dev/null || true
exec 9>"$LOCK_FILE"
if ! flock -w 300 9; then
  echo "ERROR: Another deploy is still running; could not acquire $LOCK_FILE"
  exit 1
fi

cd "$APP_DIR"

service_exists() {
  command -v systemctl >/dev/null 2>&1 && systemctl cat "$SERVICE_NAME" >/dev/null 2>&1
}

can_manage_service() {
  [ "$(id -u)" -eq 0 ] && return 0
  command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null
}

systemctl_cmd() {
  if [ "$(id -u)" -eq 0 ]; then
    systemctl "$@"
  else
    sudo systemctl "$@"
  fi
}

port_in_use() {
  ss -tlnp 2>/dev/null | grep -q ":3001 "
}

wait_for_port_free() {
  echo "Waiting for port to be freed..."
  for i in $(seq 1 15); do
    if ! port_in_use; then
      echo "Port is free."
      return 0
    fi
    if [ "$i" = "10" ]; then
      echo "Force killing by port..."
      fuser -k 3001/tcp 2>/dev/null || true
    fi
    sleep 1
  done

  if port_in_use; then
    echo "ERROR: Port 3001 still in use!"
    ss -tlnp | grep ":3001 "
    return 1
  fi
}

wait_for_health() {
  echo "Waiting for health check..."
  for _ in $(seq 1 20); do
    if curl -fsS http://localhost:3001/health >/tmp/cyprus-health.json 2>/dev/null; then
      cat /tmp/cyprus-health.json
      echo ""
      echo "=== Deploy successful ==="
      return 0
    fi
    sleep 1
  done

  return 1
}

echo "Resetting local changes before pull..."
git checkout -- packages/server/data/ 2>/dev/null || true
git stash --include-untracked 2>/dev/null || true

echo "Pulling latest from main..."
git pull --ff-only origin main

# Load env for API key before drain + build.
set -a; [ -f .env ] && source .env; set +a

# Start draining on the old server NOW so active games have time to finish while we build.
DRAIN_DEADLINE_SECS="${DRAIN_DEADLINE_SECS:-180}"
if [ -n "${DATA_API_KEY:-}" ]; then
  echo "Signalling drain to old server (block new games)..."
  curl -s -X POST http://localhost:3001/admin/api/drain \
    -H "Authorization: Bearer $DATA_API_KEY" \
    --max-time 5 2>/dev/null || echo "  (drain signal failed — old server may already be down)"
fi

echo "Installing dependencies..."
npm install

echo "Building..."
npm run build

# Wait for active games to finish (bounded).
if [ -n "${DATA_API_KEY:-}" ]; then
  echo "Waiting for active games to finish (up to ${DRAIN_DEADLINE_SECS}s)..."
  end=$(( $(date +%s) + DRAIN_DEADLINE_SECS ))
  while [ "$(date +%s)" -lt "$end" ]; do
    status=$(curl -s http://localhost:3001/admin/api/drain-status \
      -H "Authorization: Bearer $DATA_API_KEY" --max-time 3 2>/dev/null || echo '{}')
    active=$(echo "$status" | grep -o '"activeGames":[0-9]*' | cut -d: -f2 || echo 0)
    active=${active:-0}
    if [ "$active" = "0" ]; then
      echo "  No active games — proceeding."
      break
    fi
    echo "  $active active game(s) still running..."
    sleep 5
  done
fi

echo "Stopping old process..."
if service_exists; then
  if can_manage_service; then
    echo "Stopping $SERVICE_NAME..."
    systemctl_cmd stop "$SERVICE_NAME"
    sleep 2
  else
    echo "$SERVICE_NAME exists, but this user cannot manage systemd directly."
    if [ -z "${DATA_API_KEY:-}" ]; then
      echo "ERROR: DATA_API_KEY is required to trigger an application restart without systemd permissions."
      exit 1
    fi
    echo "Requesting graceful shutdown; systemd will auto-restart the service..."
    curl -s -X POST http://localhost:3001/admin/api/shutdown \
      -H "Authorization: Bearer $DATA_API_KEY" \
      -H "Content-Type: application/json" \
      --max-time 5 2>/dev/null || true
    echo ""
    if wait_for_health; then
      exit 0
    fi
    echo "ERROR: Service did not become healthy after application restart. Check $LOG_FILE for details."
    tail -20 "$LOG_FILE"
    exit 1
  fi
fi
if port_in_use && [ -n "${DATA_API_KEY:-}" ]; then
  echo "Requesting graceful shutdown via API..."
  curl -s -X POST http://localhost:3001/admin/api/shutdown \
    -H "Authorization: Bearer $DATA_API_KEY" \
    -H "Content-Type: application/json" \
    --max-time 5 2>/dev/null || true
  sleep 3
fi
# Fallback: try pkill in case API shutdown didn't work
pkill -f "node.*packages/server" 2>/dev/null || true
sleep 2
# Force kill anything still alive
pkill -9 -f "node.*packages/server" 2>/dev/null || true
sleep 1
# Also kill by port if something else grabbed it
fuser -k 3001/tcp 2>/dev/null || true
wait_for_port_free

echo "Starting new process..."
set -a; [ -f .env ] && source .env; set +a
if service_exists; then
  echo "Starting $SERVICE_NAME..."
  systemctl_cmd reset-failed "$SERVICE_NAME" 2>/dev/null || true
  systemctl_cmd start "$SERVICE_NAME"
  if wait_for_health; then
    exit 0
  fi
  echo "ERROR: $SERVICE_NAME started but health check failed. Check $LOG_FILE for details."
  systemctl_cmd status "$SERVICE_NAME" --no-pager -l || true
  tail -20 "$LOG_FILE"
  exit 1
fi

nohup node "$ENTRY" >> "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "New process started (PID: $NEW_PID)"

# Brief pause to catch immediate crashes
sleep 2
if kill -0 "$NEW_PID" 2>/dev/null; then
  if wait_for_health; then
    exit 0
  fi
  echo "ERROR: New process stayed up but health check failed. Check $LOG_FILE for details."
  tail -20 "$LOG_FILE"
  exit 1
else
  echo "ERROR: Process exited immediately. Check $LOG_FILE for details."
  tail -20 "$LOG_FILE"
  exit 1
fi

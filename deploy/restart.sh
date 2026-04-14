#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/dev/cyprus"
ENTRY="packages/server/dist/index.js"
LOG_FILE="server.log"

echo "=== Deploy started at $(date) ==="

cd "$APP_DIR"

echo "Resetting local changes before pull..."
git checkout -- packages/server/data/ 2>/dev/null || true
git stash --include-untracked 2>/dev/null || true

echo "Pulling latest from main..."
git pull origin main

echo "Installing dependencies..."
npm install

echo "Building..."
npm run build

echo "Stopping old process..."
# Ask the server to shut itself down gracefully (works even if process is owned by root)
set -a; [ -f .env ] && source .env; set +a
if [ -n "${DATA_API_KEY:-}" ]; then
  echo "Requesting graceful shutdown via API..."
  curl -s -X POST http://localhost:3001/admin/api/shutdown \
    -H "Authorization: Bearer $DATA_API_KEY" \
    -H "Content-Type: application/json" \
    --max-time 5 2>/dev/null || true
  sleep 3
fi
# Fallback: try pkill in case API shutdown didn't work
pkill -f "node.*packages/server" 2>/dev/null || true
sleep 1
pkill -9 -f "node.*packages/server" 2>/dev/null || true
# Wait for port to be released
echo "Waiting for port to be freed..."
for i in $(seq 1 10); do
  if ! ss -tlnp 2>/dev/null | grep -q ":3001 "; then
    echo "Port is free."
    break
  fi
  sleep 1
done

echo "Starting new process..."
set -a; [ -f .env ] && source .env; set +a
nohup node "$ENTRY" >> "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "New process started (PID: $NEW_PID)"

# Brief pause to catch immediate crashes
sleep 2
if kill -0 "$NEW_PID" 2>/dev/null; then
  echo "=== Deploy successful ==="
else
  echo "ERROR: Process exited immediately. Check $LOG_FILE for details."
  tail -20 "$LOG_FILE"
  exit 1
fi

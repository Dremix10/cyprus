#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/dev/cyprus"
ENTRY="packages/server/dist/index.js"
LOG_FILE="server.log"

echo "=== Deploy started at $(date) ==="

cd "$APP_DIR"

echo "Pulling latest from main..."
git pull origin main

echo "Installing dependencies..."
npm install

echo "Building..."
npm run build

echo "Stopping old process..."
OLD_PID=$(pgrep -f "node ${ENTRY}" || true)
if [ -n "$OLD_PID" ]; then
  echo "Killing old process (PID: $OLD_PID)..."
  kill "$OLD_PID" 2>/dev/null || true
  # Wait up to 5 seconds for graceful shutdown
  for i in $(seq 1 5); do
    if ! kill -0 "$OLD_PID" 2>/dev/null; then break; fi
    sleep 1
  done
  # Force kill if still running
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Force killing old process..."
    kill -9 "$OLD_PID" 2>/dev/null || true
  fi
  # Wait for port to be released
  echo "Waiting for port to be freed..."
  for i in $(seq 1 10); do
    if ! ss -tlnp 2>/dev/null | grep -q ":3001 "; then break; fi
    sleep 1
  done
else
  echo "No old process found."
fi

echo "Starting new process..."
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

#!/usr/bin/env bash
set -euo pipefail
cd /home/dev/cyprus
echo "Killing old server..."
pkill -9 -f "node packages/server" 2>/dev/null || true
echo "Waiting for port 3001 to free up..."
for i in $(seq 1 15); do
  if ! ss -tlnp | grep -q ":3001 "; then
    echo "Port is free."
    break
  fi
  sleep 1
done
if ss -tlnp | grep -q ":3001 "; then
  echo "ERROR: Port 3001 still in use!"
  ss -tlnp | grep ":3001 "
  exit 1
fi
echo "Starting server..."
nohup node packages/server/dist/index.js >> server.log 2>&1 &
sleep 2
curl -s http://localhost:3001/health && echo "" && echo "Server is live!"

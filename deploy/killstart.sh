#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-cyprus.service}"

service_exists() {
  command -v systemctl >/dev/null 2>&1 && systemctl cat "$SERVICE_NAME" >/dev/null 2>&1
}

port_in_use() {
  ss -tlnp 2>/dev/null | grep -q ":3001 "
}

wait_for_health() {
  for _ in $(seq 1 20); do
    if curl -fsS http://localhost:3001/health >/tmp/cyprus-health.json 2>/dev/null; then
      cat /tmp/cyprus-health.json
      echo ""
      echo "Server is live!"
      return 0
    fi
    sleep 1
  done

  return 1
}

cd /home/dev/cyprus
echo "Killing old server..."
if service_exists; then
  echo "Stopping $SERVICE_NAME..."
  systemctl stop "$SERVICE_NAME"
fi
pkill -9 -f "node packages/server" 2>/dev/null || true
echo "Waiting for port 3001 to free up..."
for i in $(seq 1 15); do
  if ! port_in_use; then
    echo "Port is free."
    break
  fi
  sleep 1
done
if port_in_use; then
  echo "ERROR: Port 3001 still in use!"
  ss -tlnp | grep ":3001 "
  exit 1
fi
echo "Starting server..."
set -a; [ -f .env ] && source .env; set +a
if service_exists; then
  systemctl reset-failed "$SERVICE_NAME" 2>/dev/null || true
  systemctl start "$SERVICE_NAME"
  wait_for_health
  exit $?
fi

nohup node packages/server/dist/index.js >> server.log 2>&1 &
wait_for_health

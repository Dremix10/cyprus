#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-cyprus.service}"

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
set -a; [ -f .env ] && source .env; set +a
echo "Killing old server..."
if service_exists; then
  if can_manage_service; then
    echo "Stopping $SERVICE_NAME..."
    systemctl_cmd stop "$SERVICE_NAME"
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
    wait_for_health
    exit $?
  fi
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
if service_exists; then
  systemctl_cmd reset-failed "$SERVICE_NAME" 2>/dev/null || true
  systemctl_cmd start "$SERVICE_NAME"
  wait_for_health
  exit $?
fi

nohup node packages/server/dist/index.js >> server.log 2>&1 &
wait_for_health

#!/usr/bin/env bash
# Put the app into each scene with Maestro, then capture it.
#
#   shoot.sh <locale> <scene...>     locale: en-US | el
#   scenes: 03 02 01 04 06 07 08 greek   or   all
#     01 = burst while autoplaying a round (pick the hero frame + the gods frame by hand)
#     greek = Greek home screen saved into the en-US set as 08-greek-ui (en-US only)
#   SIM_UDID picks the device: the iPhone 17 Pro Max (6.9", default) or the 6.3" shots simulator.
#
# Prereqs: shots-server.sh start + seed, the screenshot build installed on the simulator
# (EXPO_PUBLIC_SERVER_URL=http://localhost:3321), capture.sh prep. Scene 04 also needs
# `shots-server.sh friends` running in another terminal.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
FLOWS="$HERE/flows"
SIM_UDID="${SIM_UDID:-AAE1CDC7-7B0C-4E4E-A904-8CAF1491E1A7}"
export SIM_UDID
CAP="$HERE/capture.sh"
LOGS="$HERE/../raw/logs"; mkdir -p "$LOGS"

[ $# -ge 2 ] || { echo "usage: $0 <en-US|el> <scene...|all>" >&2; exit 2; }
LOC="$1"; shift
case "$LOC" in en-US) LANG_ENV=en ;; el) LANG_ENV=el ;; *) echo "locale must be en-US or el" >&2; exit 2 ;; esac
curl -sf http://127.0.0.1:3321/health >/dev/null || { echo "screenshot server not running on :3321 (shots-server.sh start)" >&2; exit 1; }

mae() { # lang flow
  maestro --device "$SIM_UDID" test -e "LOCALE=$1" "$FLOWS/$2" > "$LOGS/${SIM_UDID:0:4}-$LOC-$2.log" 2>&1 \
    || { echo "maestro $2 failed, see $LOGS/${SIM_UDID:0:4}-$LOC-$2.log" >&2; return 1; }
}

scene() {
  case "$1" in
    03) mae "$LANG_ENV" 03-lobby.yaml && "$CAP" shot "$LOC" 03-play-your-way ;;
    02) mae "$LANG_ENV" 02-grand-tichu.yaml && "$CAP" shot "$LOC" 02-grand-tichu ;;
    01)
      mae "$LANG_ENV" 02-grand-tichu.yaml
      local stop; stop="$(mktemp -u)"
      ( mae "$LANG_ENV" 01-table-autoplay.yaml || true; touch "$stop" ) &
      local pid=$!
      STOP_FILE="$stop" "$CAP" burst "$LOC" table "${BURST_COUNT:-150}" "${BURST_INTERVAL:-1.0}"
      wait "$pid" || true
      rm -f "$stop"
      echo "Pick frames from raw/<size>/$LOC/burst/ -> 01-hero-table.png and 05-gods.png"
      ;;
    04)
      pgrep -f friends-online.mjs >/dev/null || { echo "start 'shots-server.sh friends' first" >&2; return 1; }
      mae "$LANG_ENV" 04-friends-table.yaml && "$CAP" shot "$LOC" 04-friends-table
      mae "$LANG_ENV" 99-leave-room.yaml || true
      ;;
    06) "$HERE/shots-server.sh" seed --reset-bots >/dev/null && mae "$LANG_ENV" 06-leaderboard.yaml && "$CAP" shot "$LOC" 06-leaderboard ;;
    07) mae "$LANG_ENV" 07-victory.yaml && "$CAP" shot "$LOC" 07-victory ;;
    08) mae "$LANG_ENV" 08-how-to-play.yaml && "$CAP" shot "$LOC" 08-how-to-play ;;
    greek)
      [ "$LOC" = en-US ] || { echo "'greek' is only for the en-US set" >&2; return 1; }
      mae el 03-lobby.yaml && "$CAP" shot en-US 08-greek-ui
      ;;
    *) echo "unknown scene $1" >&2; return 1 ;;
  esac
}

if [ "$1" = all ]; then
  set -- 03 02 01 04 06 07
  if [ "$LOC" = en-US ]; then set -- "$@" greek; else set -- "$@" 08; fi
fi
for s in "$@"; do echo "== $LOC scene $s ($SIM_UDID)"; scene "$s" || echo "!! scene $s failed"; done

#!/usr/bin/env bash
# Put the app into each scene with Maestro, then capture it (6.9", iPhone 17 Pro Max simulator).
#
#   shoot.sh <locale> <scene...>     locale: en-US | el
#   scenes: 03 02 01 04 06 07 08 greek   or   all
#     01 = burst while autoplaying a round (pick the hero frame + the gods frame by hand)
#     greek = Greek lobby saved into the en-US set as 08-greek-ui (en-US only)
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

[ $# -ge 2 ] || { echo "usage: $0 <en-US|el> <scene...|all>" >&2; exit 2; }
LOC="$1"; shift
case "$LOC" in en-US) LANG_ENV=en ;; el) LANG_ENV=el ;; *) echo "locale must be en-US or el" >&2; exit 2 ;; esac
curl -sf http://127.0.0.1:3321/health >/dev/null || { echo "screenshot server not running on :3321 (shots-server.sh start)" >&2; exit 1; }

mae() { maestro --device "$SIM_UDID" test -e "LOCALE=$1" "$FLOWS/$2"; }

scene() {
  case "$1" in
    03) mae "$LANG_ENV" 03-lobby.yaml && "$CAP" shot "$LOC" 03-play-your-way ;;
    02) mae "$LANG_ENV" 02-grand-tichu.yaml && "$CAP" shot "$LOC" 02-grand-tichu ;;
    01)
      mae "$LANG_ENV" 02-grand-tichu.yaml
      mae "$LANG_ENV" 01-table-autoplay.yaml > "$HERE/../raw/autoplay-$LOC.log" 2>&1 &
      local pid=$!
      "$CAP" burst "$LOC" table "${BURST_COUNT:-90}" "${BURST_INTERVAL:-1.2}"
      wait "$pid" || echo "(autoplay flow ended with an error; frames are still usable)"
      echo "Pick frames from raw/$LOC/burst/ and copy them to raw/$LOC/01-hero-table.png and raw/$LOC/05-gods.png"
      ;;
    04)
      pgrep -f friends-online.mjs >/dev/null || { echo "start 'shots-server.sh friends' in another terminal first" >&2; return 1; }
      mae "$LANG_ENV" 04-friends-table.yaml && "$CAP" shot "$LOC" 04-friends-table
      ;;
    06) "$HERE/shots-server.sh" seed --reset-bots && mae "$LANG_ENV" 06-leaderboard.yaml && "$CAP" shot "$LOC" 06-leaderboard ;;
    07) mae "$LANG_ENV" 07-victory.yaml && "$CAP" shot "$LOC" 07-victory ;;
    08) mae "$LANG_ENV" 08-how-to-play.yaml && "$CAP" shot "$LOC" 08-how-to-play ;;
    greek)
      [ "$LOC" = en-US ] || { echo "'greek' is only for the en-US set" >&2; return 1; }
      mae el 03-lobby.yaml && "$CAP" shot en-US 08-greek-ui
      mae en 03-lobby.yaml >/dev/null   # put the language back to English
      ;;
    *) echo "unknown scene $1" >&2; return 1 ;;
  esac
}

if [ "$1" = all ]; then
  set -- 03 02 01 04 06 07
  if [ "$LOC" = en-US ]; then set -- "$@" greek; else set -- "$@" 08; fi
fi
for s in "$@"; do echo "== $LOC scene $s"; scene "$s"; done

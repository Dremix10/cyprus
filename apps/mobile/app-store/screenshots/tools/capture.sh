#!/usr/bin/env bash
# Screenshot capture for the App Store, on the iPhone 17 Pro Max simulator (6.9", 1320x2868).
#
#   capture.sh prep                         # boot the simulator + clean status bar (9:41, full battery)
#   capture.sh shot <locale> <name>         # one PNG -> ../raw/<locale>/<name>.png
#   capture.sh burst <locale> <prefix> [count=60] [interval=1.5]
#                                           # many PNGs (to catch a Dragon / bomb mid-trick); pick later
#   capture.sh clear                        # remove the status bar override
#
# <locale> is en-US or el. Env: SIM_UDID (default: the iPhone 17 Pro Max below).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
RAW="$HERE/../raw"
SIM_UDID="${SIM_UDID:-AAE1CDC7-7B0C-4E4E-A904-8CAF1491E1A7}"   # iPhone 17 Pro Max, iOS 26.5

# Simulators other agents use. Never touch them.
case "$SIM_UDID" in
  4D4CE469-3F76-4BFA-B799-39EB9B649F68|C998FB4F-ED07-4558-AF27-E424AFF17462|17B796B5-37BB-4DA5-AE74-5734B53C6FEE)
    echo "Refusing $SIM_UDID: that simulator (iPhone 17 Pro / 16e) belongs to another agent." >&2; exit 2 ;;
esac

status_bar() {
  xcrun simctl status_bar "$SIM_UDID" override --time 9:41 --batteryState charged --batteryLevel 100 \
    --cellularBars 4 --wifiBars 3
}

flatten() {
  # App Store Connect rejects alpha channels. Flatten onto black, keep PNG, verify the size.
  magick "$1" -background black -alpha remove -alpha off "$1"
  local size
  size="$(magick identify -format '%wx%h' "$1")"
  [ "$size" = "1320x2868" ] || echo "WARNING: $1 is $size (expected 1320x2868 for 6.9\")" >&2
}

snap() {
  local out="$1"
  mkdir -p "$(dirname "$out")"
  status_bar   # re-apply: some apps / reboots reset it
  xcrun simctl io "$SIM_UDID" screenshot --type=png "$out" >/dev/null 2>&1
  flatten "$out"
  echo "$out"
}

case "${1:-}" in
  prep)
    xcrun simctl boot "$SIM_UDID" 2>/dev/null || true
    xcrun simctl bootstatus "$SIM_UDID" -b >/dev/null
    open -a Simulator --args -CurrentDeviceUDID "$SIM_UDID"
    xcrun simctl ui "$SIM_UDID" appearance dark || true
    status_bar
    xcrun simctl status_bar "$SIM_UDID" list
    ;;
  shot)
    [ $# -ge 3 ] || { echo "usage: $0 shot <locale> <name>" >&2; exit 2; }
    snap "$RAW/$2/$3.png"
    ;;
  burst)
    [ $# -ge 3 ] || { echo "usage: $0 burst <locale> <prefix> [count] [interval]" >&2; exit 2; }
    count="${4:-60}"; interval="${5:-1.5}"
    for i in $(seq -w 1 "$count"); do
      snap "$RAW/$2/burst/$3-$i.png" >/dev/null
      sleep "$interval"
    done
    echo "burst done: $RAW/$2/burst/$3-*.png"
    ;;
  clear)
    xcrun simctl status_bar "$SIM_UDID" clear
    ;;
  *)
    echo "usage: $0 prep | shot <locale> <name> | burst <locale> <prefix> [count] [interval] | clear" >&2
    exit 2
    ;;
esac

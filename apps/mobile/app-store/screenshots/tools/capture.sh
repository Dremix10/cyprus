#!/usr/bin/env bash
# Screenshot capture for the App Store.
#   6.9" = iPhone 17 Pro Max simulator, 1320x2868 (default SIM_UDID)
#   6.3" = dedicated "Titsu Shots 6.3 (17 Pro)" simulator, 1206x2622 (SIM_UDID=$SIM_63)
#
#   capture.sh prep                         # boot SIM_UDID + clean status bar (9:41, 100 % battery, full signal)
#   capture.sh shot <locale> <name>         # one PNG -> ../raw/<size>/<locale>/<name>.png
#   capture.sh burst <locale> <prefix> [count=60] [interval=1.5]
#                                           # many PNGs (to catch a Dragon / bomb mid-trick); pick later
#   capture.sh clear                        # remove the status bar override
#
# <locale> is en-US or el. <size> (6.9 / 6.3) comes from the captured pixel size.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
RAW="$HERE/../raw"
SIM_UDID="${SIM_UDID:-AAE1CDC7-7B0C-4E4E-A904-8CAF1491E1A7}"   # iPhone 17 Pro Max, iOS 26.5

# Simulators other agents use. Never touch them.
case "$SIM_UDID" in
  4D4CE469-3F76-4BFA-B799-39EB9B649F68|C998FB4F-ED07-4558-AF27-E424AFF17462|17B796B5-37BB-4DA5-AE74-5734B53C6FEE)
    echo "Refusing $SIM_UDID: that simulator (shared iPhone 17 Pro / 16e) belongs to another agent." >&2; exit 2 ;;
esac

status_bar() {
  # 100 % and not charging draws a plain white full battery (charged/charging adds a green bolt).
  xcrun simctl status_bar "$SIM_UDID" override --time 9:41 --batteryState discharging --batteryLevel 100 \
    --cellularMode active --cellularBars 4 --wifiMode active --wifiBars 3 --dataNetwork wifi
}

size_label() {
  case "$(magick identify -format '%wx%h' "$1")" in
    1320x2868) echo 6.9 ;;
    1206x2622) echo 6.3 ;;
    *) echo other ;;
  esac
}

snap() { # locale relative-name
  local tmp; tmp="$(mktemp -t titsu-shot).png"
  status_bar   # re-apply: some app launches / reboots reset it
  xcrun simctl io "$SIM_UDID" screenshot --type=png "$tmp" >/dev/null 2>&1
  # App Store Connect rejects alpha channels. Flatten onto black.
  magick "$tmp" -background black -alpha remove -alpha off "$tmp"
  local size; size="$(size_label "$tmp")"
  [ "$size" != other ] || echo "WARNING: unexpected size $(magick identify -format '%wx%h' "$tmp")" >&2
  local out="$RAW/$size/$1/$2.png"
  mkdir -p "$(dirname "$out")"
  mv "$tmp" "$out"
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
    snap "$2" "$3"
    ;;
  burst)
    [ $# -ge 3 ] || { echo "usage: $0 burst <locale> <prefix> [count] [interval]" >&2; exit 2; }
    count="${4:-60}"; interval="${5:-1.5}"
    for i in $(seq -w 1 "$count"); do
      [ -n "${STOP_FILE:-}" ] && [ -e "$STOP_FILE" ] && break
      snap "$2" "burst/$3-$i" >/dev/null
      sleep "$interval"
    done
    echo "burst done: $RAW/<size>/$2/burst/$3-*.png"
    ;;
  clear)
    xcrun simctl status_bar "$SIM_UDID" clear
    ;;
  *)
    echo "usage: $0 prep | shot <locale> <name> | burst <locale> <prefix> [count] [interval] | clear" >&2
    exit 2
    ;;
esac

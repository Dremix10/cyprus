#!/usr/bin/env bash
# Thumbnail grid of a capture burst, to pick 01-hero-table / 05-gods quickly.
#   contact-sheet.sh <size> <locale> [prefix=table]   -> ../raw/<size>/<locale>/burst/sheet-<n>.png
# Near-duplicate frames (under 1.5 % of pixels changed vs the last kept frame) are skipped.
# Each thumbnail is labelled with its frame name; then copy the chosen frame, e.g.
#   cp ../raw/6.9/en-US/burst/table-042.png ../raw/6.9/en-US/01-hero-table.png
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DIR="$HERE/../raw/$1/$2/burst"
PREFIX="${3:-table}"
FONT="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
all=("$DIR/$PREFIX"-*.png)
[ -e "${all[0]}" ] || { echo "no frames in $DIR" >&2; exit 1; }
kept=(); last=""
for f in "${all[@]}"; do
  if [ -n "$last" ]; then
    diff="$(magick compare -metric AE -fuzz 4% "$last" "$f" null: 2>&1 | awk '{printf "%d", $1}')" || true
    total="$(magick identify -format '%w %h' "$f" | awk '{printf "%d", $1 * $2}')"
    [ "$((diff * 1000 / total))" -lt 15 ] && continue
  fi
  kept+=("$f"); last="$f"
done
echo "${#kept[@]} of ${#all[@]} frames kept" >&2
rm -f "$DIR"/sheet-*.png
per=24; n=0
for ((i = 0; i < ${#kept[@]}; i += per)); do
  n=$((n + 1))
  magick montage -font "$FONT" -pointsize 20 -label '%t' "${kept[@]:i:per}" \
    -tile 8x -geometry 200x435+4+4 -background '#222' -fill white "$DIR/sheet-$n.png"
  echo "$DIR/sheet-$n.png"
done

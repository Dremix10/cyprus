#!/usr/bin/env bash
# Turn the picked raw captures into upload-ready files.
#
#   finalize.sh              # plain screenshots
#   finalize.sh --captions   # marketing frames: gold caption on navy, screenshot below (captions.tsv)
#
# Input : ../raw/<locale>/NN-*.png          (1320x2868 from the iPhone 17 Pro Max simulator)
# Output: ../final/6.9/<locale>/NN-*.png    1320x2868  "iPhone 6.9-inch" (Dynamic Island, large)
#         ../final/6.3/<locale>/NN-*.png    1206x2622  "iPhone 6.3-inch" (Dynamic Island, medium) = the REQUIRED size
# 6.3 is a uniform downscale (2622/2868) plus a 1 px centre crop; the aspect ratios differ by 0.07 %.
# For pixel-native 6.3 shots instead, create a separate simulator (do not reuse the shared iPhone 17 Pro):
#   xcrun simctl create "Titsu Shots 6.3" "iPhone 17 Pro"   then SIM_UDID=<new udid> with 1206x2622 checks.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
RAW="$HERE/../raw"
OUT="$HERE/../final"
CAPTIONS=0; [ "${1:-}" = "--captions" ] && CAPTIONS=1
FONT="/System/Library/Fonts/Supplemental/Georgia Bold.ttf"   # has Greek glyphs; the app uses Georgia for titles
GOLD='#E2C26B'; TOP='#16264A'; BOTTOM='#0A1424'

caption_for() { # scene-name locale
  awk -F'\t' -v s="$1" -v l="$2" 'NR==1{for(i=1;i<=NF;i++) if($i==l) c=i; next} $1==s{print $c}' "$HERE/captions.tsv"
}

frame() { # in out caption
  local tmp; tmp="$(mktemp -d)"
  local h=2200 w r=64
  magick "$1" -resize "x$h" "$tmp/s.png"
  w="$(magick identify -format '%w' "$tmp/s.png")"
  magick -size "${w}x${h}" xc:black -fill white -draw "roundrectangle 0,0,$((w-1)),$((h-1)),$r,$r" "$tmp/m.png"
  magick "$tmp/s.png" "$tmp/m.png" -alpha off -compose CopyOpacity -composite "$tmp/r.png"
  magick -size 1320x2868 "gradient:$TOP-$BOTTOM" \
    \( -size 1160x380 -background none -fill "$GOLD" -font "$FONT" -gravity center caption:"$3" \) \
    -gravity north -geometry +0+140 -composite \
    "$tmp/r.png" -gravity south -geometry +0+90 -composite \
    -background black -alpha remove -alpha off "$2"
  rm -rf "$tmp"
}

n=0
for locdir in "$RAW"/*/; do
  loc="$(basename "$locdir")"
  for src in "$locdir"[0-9][0-9]-*.png; do
    [ -e "$src" ] || continue
    name="$(basename "$src" .png)"
    big="$OUT/6.9/$loc/$name.png"; small="$OUT/6.3/$loc/$name.png"
    mkdir -p "$(dirname "$big")" "$(dirname "$small")"
    if [ "$CAPTIONS" = 1 ]; then
      text="$(caption_for "$name" "$loc")"
      [ -n "$text" ] || { echo "no caption for $name ($loc) in captions.tsv" >&2; exit 1; }
      frame "$src" "$big" "$text"
    else
      magick "$src" -background black -alpha remove -alpha off "$big"
    fi
    magick "$big" -resize x2622 -gravity center -extent 1206x2622 -background black -alpha remove -alpha off "$small"
    for f in "$big" "$small"; do
      printf '%-70s %s\n' "${f#"$OUT"/}" "$(magick identify -format '%wx%h %[channels]' "$f")"
    done
    n=$((n + 1))
  done
done
echo "$n screenshots finalized into $OUT (upload 6.9 and 6.3 sets per locale; max 10 each)"

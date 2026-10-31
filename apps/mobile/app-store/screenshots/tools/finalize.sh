#!/usr/bin/env bash
# Turn the picked raw captures into upload-ready files.
#
#   finalize.sh
#
# Input : ../raw/6.9/<locale>/NN-*.png   1320x2868 (iPhone 17 Pro Max simulator)
#         ../raw/6.3/<locale>/NN-*.png   1206x2622 (Titsu Shots 6.3 = iPhone 17 Pro simulator)
# Output: ../final/<locale>/<size>/NN-*.png        caption frames (gold caption on navy, captions.tsv)
#         ../final-plain/<locale>/<size>/NN-*.png  the same screenshots without a frame
# Sizes are Apple's accepted portrait sizes: 6.9 = 1320x2868 (Dynamic Island, large),
# 6.3 = 1206x2622 (Dynamic Island, medium; the required slot). 8-bit RGB PNG, no alpha, no metadata.
# If a 6.3 capture is missing, it is derived from the 6.9 one (uniform downscale + 1 px crop) with a warning.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
RAW="$HERE/../raw"
OUT="$HERE/../final"
PLAIN="$HERE/../final-plain"
FONT="/System/Library/Fonts/Supplemental/Georgia Bold.ttf"   # has Greek glyphs; the app uses Georgia for titles
GOLD='#E2C26B'; TOP='#16264A'; BOTTOM='#0A1424'

caption_for() { # scene-name locale
  awk -F'\t' -v s="$1" -v l="$2" 'NR==1{for(i=1;i<=NF;i++) if($i==l) c=i; next} $1==s{print $c}' "$HERE/captions.tsv"
}

dims() { case "$1" in 6.9) echo "1320 2868" ;; 6.3) echo "1206 2622" ;; esac; }

frame() { # in out caption W H
  local W=$4 H=$5 tmp; tmp="$(mktemp -d)"
  local sh=$((H * 767 / 1000)) cw=$((W - 160)) ch=$((H * 1325 / 10000)) top=$((H * 49 / 1000)) bottom=$((H * 31 / 1000))
  local r=$((W * 48 / 1000)) pt=$((W * 96 / 1320)) sw
  magick "$1" -resize "x$sh" "$tmp/s.png"
  sw="$(magick identify -format '%w' "$tmp/s.png")"
  magick -size "${sw}x${sh}" xc:black -fill white -draw "roundrectangle 0,0,$((sw - 1)),$((sh - 1)),$r,$r" "$tmp/m.png"
  magick "$tmp/s.png" "$tmp/m.png" -alpha off -compose CopyOpacity -composite "$tmp/r.png"
  magick -size "${W}x${H}" "gradient:$TOP-$BOTTOM" \
    \( -size "${cw}x" -background none -fill "$GOLD" -font "$FONT" -pointsize "$pt" -gravity center caption:"$3" \
       -gravity center -background none -extent "${cw}x${ch}" \) \
    -gravity north -geometry "+0+$top" -composite \
    "$tmp/r.png" -gravity south -geometry "+0+$bottom" -composite \
    -background black -alpha remove -alpha off -depth 8 -strip "PNG24:$2"
  rm -rf "$tmp"
}

n=0
for size in 6.9 6.3; do
  read -r W H <<<"$(dims "$size")"
  for loc in en-US el; do
    # Scene list = union of both sizes for this locale.
    names="$( (ls "$RAW/6.9/$loc" "$RAW/6.3/$loc" 2>/dev/null || true) | grep -E '^[0-9]{2}-.*\.png$' | sort -u)"
    for file in $names; do
      name="${file%.png}"
      src="$RAW/$size/$loc/$file"
      if [ ! -e "$src" ]; then
        [ "$size" = 6.3 ] && [ -e "$RAW/6.9/$loc/$file" ] || { echo "skip $size/$loc/$file (no capture)" >&2; continue; }
        echo "WARNING: deriving 6.3/$loc/$file from the 6.9 capture" >&2
        src="$(mktemp -t titsu63).png"
        magick "$RAW/6.9/$loc/$file" -resize x2622 -gravity center -extent 1206x2622 "$src"
      fi
      [ "$(magick identify -format '%wx%h' "$src")" = "${W}x${H}" ] || { echo "ERROR: $src is not ${W}x${H}" >&2; exit 1; }
      text="$(caption_for "$name" "$loc")"
      [ -n "$text" ] || { echo "ERROR: no caption for $name ($loc) in captions.tsv" >&2; exit 1; }
      mkdir -p "$OUT/$loc/$size" "$PLAIN/$loc/$size"
      frame "$src" "$OUT/$loc/$size/$file" "$text" "$W" "$H"
      magick "$src" -background black -alpha remove -alpha off -depth 8 -strip "PNG24:$PLAIN/$loc/$size/$file"
      for f in "$OUT/$loc/$size/$file" "$PLAIN/$loc/$size/$file"; do
        printf '%-58s %s\n' "${f#"$HERE/../"}" "$(magick identify -format '%wx%h %[channels]' "$f")"
      done
      n=$((n + 1))
    done
  done
done
echo "$n screenshots finalized (framed: final/, plain: final-plain/). Max 10 per size per locale."

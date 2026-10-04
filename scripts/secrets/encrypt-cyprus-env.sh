#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
recipient_file="${RECIPIENT_FILE:-$repo_root/secrets/age-recipients.txt}"
output_file="${OUTPUT_FILE:-$repo_root/secrets/cyprus.production.env.age}"
input_file="${1:-}"

if ! command -v age >/dev/null 2>&1; then
  echo "age is required. Install with: brew install age" >&2
  exit 1
fi

if [ ! -s "$recipient_file" ]; then
  echo "Missing recipients. Add age public keys to: $recipient_file" >&2
  exit 1
fi

mkdir -p "$(dirname "$output_file")"
tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file"' EXIT

if [ -n "$input_file" ]; then
  cp "$input_file" "$tmp_file"
else
  ssh cyprus "awk -F= '\$1==\"DATA_API_KEY\" { print \"DATA_API_KEY=\" \$2 }' /home/dev/cyprus/.env" > "$tmp_file"
fi

if ! grep -q '^DATA_API_KEY=' "$tmp_file"; then
  echo "Input does not contain DATA_API_KEY." >&2
  exit 1
fi

age -R "$recipient_file" -o "$output_file" "$tmp_file"
echo "Wrote encrypted secret: $output_file"

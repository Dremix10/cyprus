#!/usr/bin/env bash
set -euo pipefail

key_file="${1:-$HOME/.config/cyprus/age.txt}"

if ! command -v age-keygen >/dev/null 2>&1; then
  echo "age-keygen is required. Install with: brew install age" >&2
  exit 1
fi

mkdir -p "$(dirname "$key_file")"
chmod 700 "$(dirname "$key_file")"

if [ -f "$key_file" ]; then
  echo "Age identity already exists: $key_file" >&2
else
  age-keygen -o "$key_file" >&2
  chmod 600 "$key_file"
fi

public_key="$(awk '/^# public key:/ { print $4 }' "$key_file")"
if [ -z "$public_key" ]; then
  echo "Could not read public key from $key_file" >&2
  exit 1
fi

echo "$public_key"

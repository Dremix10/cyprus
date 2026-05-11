#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
identity_file="${AGE_IDENTITY_FILE:-$HOME/.config/cyprus/age.txt}"
input_file="${1:-$repo_root/secrets/cyprus.production.env.age}"
output_file="${2:-$repo_root/.env.production.local}"

if ! command -v age >/dev/null 2>&1; then
  echo "age is required. Install with: brew install age" >&2
  exit 1
fi

if [ ! -f "$identity_file" ]; then
  echo "Missing age identity: $identity_file" >&2
  echo "Run: scripts/secrets/generate-age-identity.sh" >&2
  exit 1
fi

if [ ! -f "$input_file" ]; then
  echo "Missing encrypted env file: $input_file" >&2
  exit 1
fi

age -d -i "$identity_file" -o "$output_file" "$input_file"
chmod 600 "$output_file"
echo "Wrote decrypted env file: $output_file"

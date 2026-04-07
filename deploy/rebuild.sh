#!/usr/bin/env bash
set -euo pipefail
cd /home/dev/cyprus
echo "Cleaning build cache..."
find . -name "*.tsbuildinfo" -delete
echo "Building shared..."
npm run build --workspace=packages/shared
echo "Building server..."
npm run build --workspace=packages/server
echo "Building client..."
npm run build --workspace=packages/client
echo "Build complete!"

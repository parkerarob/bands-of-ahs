#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -L node_modules ]]; then
  echo "Setup blocked: node_modules is a symlink. Remove that link and rerun setup:checkout." >&2
  exit 1
fi
npm ci --no-audit --no-fund
node scripts/release-ready.mjs --setup

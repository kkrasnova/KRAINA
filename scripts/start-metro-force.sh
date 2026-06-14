#!/usr/bin/env bash
# Звільняє 8081 (якщо залишився старий Metro), потім стартує з Node 20 + поліфілом.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if command -v lsof >/dev/null 2>&1; then
  for pid in $(lsof -t -iTCP:8081 -sTCP:LISTEN 2>/dev/null || true); do
    kill "$pid" 2>/dev/null || true
  done
fi
exec bash ./scripts/with-node20.sh npx react-native start --host 0.0.0.0 --reset-cache

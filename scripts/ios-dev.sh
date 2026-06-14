#!/usr/bin/env bash
# Metro на :8081 (якщо ще не слухає), потім react-native run-ios.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if lsof -i :8081 -sTCP:LISTEN -P >/dev/null 2>&1; then
  echo "Metro already listening on :8081"
else
  echo "Starting Metro on :8081 (background)..."
  bash ./scripts/with-node20.sh npx react-native start --host 0.0.0.0 >/tmp/kraina-metro.log 2>&1 &
  for _ in $(seq 1 90); do
    if lsof -i :8081 -sTCP:LISTEN -P >/dev/null 2>&1; then
      echo "Metro ready."
      break
    fi
    sleep 1
  done
  if ! lsof -i :8081 -sTCP:LISTEN -P >/dev/null 2>&1; then
    echo "Metro did not start on :8081. See /tmp/kraina-metro.log" >&2
    exit 1
  fi
fi

exec bash ./scripts/with-node20.sh npx react-native run-ios "$@"

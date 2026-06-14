#!/usr/bin/env bash
# Запускає Metro на :8081 (якщо ще не слухає), потім react-native run-android.
# Потрібно для debug: емулятор звертається до 10.0.2.2:8081 — без Metro буде червоний екран.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# USB-пристрої: перенаправляємо порт Metro на localhost пристрою (як 10.0.2.2 на емуляторі).
if command -v adb >/dev/null 2>&1; then
  if adb devices 2>/dev/null | grep -qE '^\S+\s+device$'; then
    adb reverse tcp:8081 tcp:8081 2>/dev/null || true
  fi
fi

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

exec bash ./scripts/with-node20.sh npx react-native run-android "$@"

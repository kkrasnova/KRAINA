#!/usr/bin/env bash
# Жорсткий скид Metro + React Native кешів + старт.
# Використання: npm run start:force
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "--- start:force ---"
echo "[1/4] Зупиняємо старий Metro (порт 8081)..."
if command -v lsof >/dev/null 2>&1; then
  for pid in $(lsof -t -iTCP:8081 -sTCP:LISTEN 2>/dev/null || true); do
    echo "  Убиваємо PID $pid"
    kill "$pid" 2>/dev/null || true
  done
fi

echo "[2/4] Видаляємо Metro bundler cache..."
rm -rf "$ROOT/node_modules/.cache/metro" 2>/dev/null || true
rm -rf "$TMPDIR/metro-*" 2>/dev/null || true
rm -rf "$TMPDIR/react-native-*" 2>/dev/null || true
rm -rf "$ROOT/node_modules/.cache" 2>/dev/null || true

echo "[3/4] Видаляємо React Native / Hermes cache..."
rm -rf "$ROOT/ios/build" 2>/dev/null || true
rm -rf "$ROOT/android/.gradle" 2>/dev/null || true
rm -rf "$ROOT/android/app/build" 2>/dev/null || true
rm -rf "$ROOT/android/.cxx" 2>/dev/null || true

echo "[4/4] Запускаємо Metro з --reset-cache..."
exec bash ./scripts/with-node20.sh npx react-native start --host 0.0.0.0 --reset-cache

#!/usr/bin/env bash
# Запускає Metro на :8081 лише якщо він не відповідає; чекає HTTP /status.
# Використовується android-dev.sh / ios-dev.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

METRO_PORT="${METRO_PORT:-8081}"
METRO_LOG="${METRO_LOG:-/tmp/kraina-metro.log}"
METRO_RESET="${METRO_RESET:-0}"

metro_status_ok() {
  curl -sf "http://127.0.0.1:${METRO_PORT}/status" 2>/dev/null | grep -q 'packager-status:running'
}

if command -v adb >/dev/null 2>&1; then
  if adb devices 2>/dev/null | grep -qE '^\S+\s+device$'; then
    adb reverse "tcp:${METRO_PORT}" "tcp:${METRO_PORT}" 2>/dev/null || true
  fi
fi

if [ "$METRO_RESET" != "1" ] && metro_status_ok; then
  echo "Metro already running on :${METRO_PORT}."
  exit 0
fi

if command -v lsof >/dev/null 2>&1; then
  for pid in $(lsof -t -iTCP:"${METRO_PORT}" -sTCP:LISTEN 2>/dev/null || true); do
    kill "$pid" 2>/dev/null || true
  done
fi

echo "Starting Metro on :${METRO_PORT} with reset cache (background)..."
bash ./scripts/with-node20.sh npx react-native start --host 0.0.0.0 --reset-cache >"$METRO_LOG" 2>&1 &

for _ in $(seq 1 90); do
  if metro_status_ok; then
    echo "Metro ready."
    exit 0
  fi
  sleep 1
done

echo "Metro did not respond on :${METRO_PORT}. See ${METRO_LOG}" >&2
exit 1

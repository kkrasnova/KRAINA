#!/usr/bin/env bash
# Запускає Metro на :8081 (якщо ще не слухає), потім react-native run-android.
# Потрібно для debug: емулятор звертається до 10.0.2.2:8081 — без Metro буде червоний екран.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash ./scripts/ensure-metro.sh

exec bash ./scripts/with-node20.sh npx react-native run-android "$@"

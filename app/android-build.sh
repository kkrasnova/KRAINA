#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
export EXPO_USE_COMMUNITY_AUTOLINKING=1
cd "$ROOT"
cd android
./gradlew :app:assembleDebug

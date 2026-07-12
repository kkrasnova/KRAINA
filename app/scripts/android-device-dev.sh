#!/usr/bin/env bash
# Metro + install on a connected Android device (not emulator).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash ./scripts/ensure-metro.sh

PHYSICAL_ID="$(adb devices | awk 'NR>1 && $2=="device" && $1 !~ /^emulator-/ { print $1; exit }')"
if [ -z "$PHYSICAL_ID" ]; then
  echo "Connect Android via USB and enable USB debugging." >&2
  adb devices -l >&2 || true
  exit 1
fi

echo "Installing on $PHYSICAL_ID"
exec bash ./scripts/with-node20.sh npx react-native run-android --deviceId "$PHYSICAL_ID"

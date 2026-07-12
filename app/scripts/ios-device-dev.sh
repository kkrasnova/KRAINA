#!/usr/bin/env bash
# Metro + install on a connected iPhone (Apple Developer).
# iPhone reaches Metro over Wi-Fi (same LAN or iPhone Personal Hotspot).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash ./scripts/ensure-metro.sh

pick_device() {
  if [ -n "${1:-}" ]; then
    echo "$1"
    return
  fi

  xcrun xctrace list devices 2>/dev/null \
    | awk -F'[()]' '/iPhone|iPad/ && !/Simulator/ {
        udid = $(NF-1)
        gsub(/^[ \t]+|[ \t]+$/, "", udid)
        if (udid ~ /^[0-9A-F-]{8}-/) { print udid; exit }
      }'
}

DEVICE_ID="$(pick_device "${1:-}")"
if [ -z "$DEVICE_ID" ]; then
  echo "Connect iPhone via USB, unlock it, tap Trust, and enable Developer Mode." >&2
  xcrun xctrace list devices 2>/dev/null | rg "iPhone|iPad" >&2 || true
  exit 1
fi

METRO_PORT="${METRO_PORT:-8081}"
METRO_HOST="$(bash ./scripts/metro-host.sh)"

# Stop stale iproxy — it does not forward device->Mac and can block port 8081.
if pgrep -f "iproxy ${METRO_PORT}" >/dev/null 2>&1; then
  pkill -f "iproxy ${METRO_PORT}" 2>/dev/null || true
  sleep 0.5
fi

NODE_BIN="$(bash ./scripts/with-node20.sh bash -lc 'command -v node' 2>/dev/null || command -v node || true)"
if [ -n "$NODE_BIN" ] && [ -x /usr/libexec/ApplicationFirewall/socketfilterfw ]; then
  /usr/libexec/ApplicationFirewall/socketfilterfw --add "$NODE_BIN" >/dev/null 2>&1 || true
  /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp "$NODE_BIN" >/dev/null 2>&1 || true
fi

echo "Metro on iPhone should use: http://${METRO_HOST}:${METRO_PORT}"
echo "Mac and iPhone must be on the same Wi-Fi."
echo "If it fails: enable iPhone Personal Hotspot, connect Mac to it, rerun this script."
echo "On first launch allow Local Network access for KRAÏNA."
echo "Installing on $DEVICE_ID"

exec bash ./scripts/with-node20.sh npx react-native run-ios --udid "$DEVICE_ID"

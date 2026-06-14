#!/usr/bin/env bash
set -euo pipefail

REQ_NODE_VERSION="${REQ_NODE_VERSION:-20.19.4}"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  echo "nvm not found at $NVM_DIR. Install nvm or run with Node $REQ_NODE_VERSION+." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$NVM_DIR/nvm.sh"

nvm use "$REQ_NODE_VERSION" >/dev/null || {
  nvm install "$REQ_NODE_VERSION" >/dev/null
  nvm use "$REQ_NODE_VERSION" >/dev/null
}

if [ "$#" -eq 0 ]; then
  echo "Usage: with-node20.sh <command> [args...]" >&2
  exit 1
fi

# Поліфіл toReversed до будь-якого require (metro-config mergeConfig викликається до metro.config.js).
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
POLYFILL="${SCRIPT_DIR}/metro-polyfill.cjs"
if [ -f "$POLYFILL" ]; then
  export NODE_OPTIONS="${NODE_OPTIONS:+${NODE_OPTIONS} }--require ${POLYFILL}"
fi

exec "$@"

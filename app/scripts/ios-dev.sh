#!/usr/bin/env bash
# Metro на :8081 (перезапуск з --reset-cache), потім react-native run-ios.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ccache: пришвидшує повторні збірки Swift/ObjC коду
if command -v ccache >/dev/null 2>&1; then
  export USE_CCACHE=1
  export CCACHE_DIR="$ROOT/.ccache"
  export CCACHE_SLOPPINESS=clang_index_store,file_stat_matches,include_file_ctime,include_file_mtime,ivfsoverlay,pch_defines,modules,system_headers,time_macros
  export CCACHE_FILECLONE=true
  export CCACHE_DEPEND=true
  echo "✅ ccache enabled (CCACHE_DIR=$CCACHE_DIR)"
fi

if command -v lsof >/dev/null 2>&1; then
  for pid in $(lsof -t -iTCP:8081 -sTCP:LISTEN 2>/dev/null || true); do
    kill "$pid" 2>/dev/null || true
  done
fi

echo "Starting Metro on :8081 with reset cache (background)..."
bash ./scripts/with-node20.sh npx react-native start --host 0.0.0.0 --reset-cache >/tmp/kraina-metro.log 2>&1 &
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

exec bash ./scripts/with-node20.sh npx react-native run-ios "$@"

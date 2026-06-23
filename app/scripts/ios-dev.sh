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

bash ./scripts/ensure-metro.sh

if [ "$#" -eq 0 ]; then
  exec bash ./scripts/with-node20.sh npx react-native run-ios --simulator "iPhone 17 Pro"
fi

exec bash ./scripts/with-node20.sh npx react-native run-ios "$@"

#!/usr/bin/env bash
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# React Native codegen artifacts are generated during pod install.
if [ ! -f "$ROOT/ios/build/generated/ios/ReactCodegen/ReactCodegen.podspec" ]; then
  echo "⚠️  Codegen artifacts missing — running pod install..."
  (cd ios && pod install)
fi

# ccache: пришвидшує повторні збірки Swift/ObjC коду
if command -v ccache >/dev/null 2>&1; then
  export USE_CCACHE=1
  export CCACHE_DIR="$ROOT/.ccache"
  export CCACHE_SLOPPINESS=clang_index_store,file_stat_matches,include_file_ctime,include_file_mtime,ivfsoverlay,pch_defines,modules,system_headers,time_macros
  export CCACHE_FILECLONE=true
  export CCACHE_DEPEND=true
  echo "✅ ccache enabled (CCACHE_DIR=$CCACHE_DIR)"
fi

(cd ios && pod install)
(cd ios && xcodebuild -workspace KRANA.xcworkspace -scheme KRANA -configuration Debug -destination "generic/platform=iOS Simulator" build)

#!/usr/bin/env bash
# Відкриває KRANA.xcworkspace (з CocoaPods), не .xcodeproj — інакше сотні помилок module map.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WS="$ROOT/ios/KRANA.xcworkspace"
if [[ ! -d "$WS" ]]; then
  echo "Workspace not found. Run: cd app/ios && pod install"
  exit 1
fi
open "$WS"

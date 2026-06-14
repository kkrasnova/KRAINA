#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
(cd ios && pod install)
(cd ios && xcodebuild -workspace KRANA.xcworkspace -scheme KRANA -configuration Debug -destination "generic/platform=iOS Simulator" build)

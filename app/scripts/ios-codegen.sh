#!/usr/bin/env bash
# Regenerate React Native Fabric/codegen files under ios/build/generated/ios.
# Required after Product → Clean Build Folder or deleting ios/build.
set -euo pipefail

export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MARKER="$ROOT/ios/build/generated/ios/ReactCodegen/ReactCodegen.podspec"
if [ -f "$MARKER" ]; then
  echo "✅ iOS codegen already present"
  exit 0
fi

echo "⚙️  Generating iOS React Native codegen..."
bash ./scripts/with-node20.sh npx react-native codegen --path . --outputPath ios/build/generated/ios

if [ ! -f "$MARKER" ]; then
  echo "❌ Codegen failed: $MARKER not found" >&2
  exit 1
fi

echo "✅ iOS codegen generated"

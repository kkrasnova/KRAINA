#!/usr/bin/env bash
# Скидає кеш Xcode, коли зʼявляється:
#   "Could not compute dependency graph: MsgHandlingError"
#   "accessing build database ... build.db: interface is read-only"
#   70+ попереджень main.jsbundle (Promise, setTimeout, …)
#   або дивні падіння збірки / "Message from debugger: killed".
set -euo pipefail
cd "$(dirname "$0")/.."

echo ""
echo "== 1. Закрий Xcode повністю (Cmd+Q) перед продовженням =="
echo ""

echo "== 2. DerivedData KRANA… =="
rm -rf "${HOME}/Library/Developer/Xcode/DerivedData/KRANA-"* 2>/dev/null || true

echo "== 3. ModuleCache Xcode… =="
rm -rf "${HOME}/Library/Developer/Xcode/DerivedData/ModuleCache.noindex" 2>/dev/null || true

echo "== 4. ios/build + xcuserdata… =="
rm -rf ios/build 2>/dev/null || true
rm -rf ios/KRANA.xcodeproj/xcuserdata 2>/dev/null || true
rm -rf ios/KRANA.xcworkspace/xcuserdata 2>/dev/null || true

echo "== 5. patch-package… =="
npx patch-package 2>/dev/null || true

echo "== 6. pod install… =="
(cd ios && pod install)

echo "== 7. expo-modules-jsi modulemap… =="
PODS_ROOT="$(cd ios && pwd)/Pods" bash node_modules/expo-modules-jsi/apple/scripts/generate-modulemap.sh 2>/dev/null || true

echo ""
echo "Готово. Далі:"
echo "  1. Відкрий ios/KRANA.xcworkspace (не .xcodeproj)"
echo "  2. Product → Clean Build Folder (Shift+Cmd+K)"
echo "  3. Запусти Metro: cd app && npm run start:ios-only"
echo "  4. Run на симуляторі (Debug)"
echo ""
echo "Issue Navigator може показувати старі помилки — після Clean Build вони зникнуть."
echo ""

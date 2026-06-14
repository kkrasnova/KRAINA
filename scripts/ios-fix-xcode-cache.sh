#!/usr/bin/env bash
# Скидає кеш Xcode, коли зʼявляється:
#   "accessing build database ... build.db: interface is read-only"
# або дивні падіння збірки / "Message from debugger: killed".
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== Закрий Xcode повністю (Cmd+Q), потім запусти цей скрипт знову, якщо ще відкритий. =="
echo "== Чищу DerivedData для KRANA… =="
rm -rf "${HOME}/Library/Developer/Xcode/DerivedData/KRANA-"* 2>/dev/null || true
echo "== Чищу ios/build… =="
rm -rf ios/build 2>/dev/null || true
echo "== pod install… =="
(cd ios && pod install)

echo ""
echo "Готово. Далі у Xcode:"
echo "  Product → Clean Build Folder (Shift+Cmd+K)"
echo "  Потім Run на симуляторі."
echo ""
echo "Якщо проєкт лежить у Desktop з увімкненим iCloud Desktop — краще перенеси репо в ~/Developer,"

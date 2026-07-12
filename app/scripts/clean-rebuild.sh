#!/usr/bin/env bash
# =============================================================================
# clean-rebuild.sh — повне очищення всіх кешів + перевстановлення залежностей.
#
# Режими:
#   ./scripts/clean-rebuild.sh          — очищення + npm install + pod install
#   ./scripts/clean-rebuild.sh --start  — те саме + запуск Metro
#   ./scripts/clean-rebuild.sh --soft   — тільки кеші Metro/RN (без node_modules)
#   ./scripts/clean-rebuild.sh --help   — ця довідка
# =============================================================================
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODE="${1:-full}"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║           KRAÏNA — Clean Rebuild                        ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

case "$MODE" in
  --help|-h)
    echo "Використання: $0 [--start | --soft | --help]"
    echo ""
    echo "  (без прапорів)   Очищення всього + npm install + pod install"
    echo "  --start          Очищення + встановлення + запуск Metro"
    echo "  --soft           Тільки кеші Metro/RN (без node_modules)"
    echo "  --help           Ця довідка"
    exit 0
    ;;
  --start)
    DO_START=true
    ;;
  --soft)
    SOFT=true
    ;;
  *)
    DO_START=false
    ;;
esac

# -------------------------------------------------------------------------
# 1. Зупиняємо Metro
# -------------------------------------------------------------------------
echo "🔹 [1/8] Зупиняємо Metro (порт 8081)..."
if command -v lsof >/dev/null 2>&1; then
  for pid in $(lsof -t -iTCP:8081 -sTCP:LISTEN 2>/dev/null || true); do
    echo "    → kill PID $pid"
    kill "$pid" 2>/dev/null || true
  done
fi
sleep 1

# -------------------------------------------------------------------------
# 2. Metro / Hermes / RN temp cache
# -------------------------------------------------------------------------
echo "🔹 [2/8] Видаляємо Metro + Hermes + RN кеші..."
rm -rf "$ROOT/node_modules/.cache" 2>/dev/null || true
rm -rf "$TMPDIR/metro-*" 2>/dev/null || true
rm -rf "$TMPDIR/react-native-*" 2>/dev/null || true
rm -rf "$TMPDIR/hermes-*" 2>/dev/null || true
rm -rf "$TMPDIR/react-*" 2>/dev/null || true
rm -rf "$TMPDIR/expo-*" 2>/dev/null || true
rm -rf "$ROOT/ios/build" 2>/dev/null || true
if [ "${SOFT:-false}" != true ]; then
  rm -rf "$ROOT/ios/Pods" "$ROOT/ios/Podfile.lock" 2>/dev/null || true
fi

# -------------------------------------------------------------------------
# 3. Watchman (якщо встановлено)
# -------------------------------------------------------------------------
echo "🔹 [3/8] Скидаємо Watchman (якщо є)..."
if command -v watchman >/dev/null 2>&1; then
  watchman watch-del-all 2>/dev/null || true
  echo "    → watch-del-all виконано"
else
  echo "    → Watchman не знайдено (пропускаємо)"
fi

# -------------------------------------------------------------------------
# 4. Android build cache
# -------------------------------------------------------------------------
echo "🔹 [4/8] Очищаємо Android build cache..."
rm -rf "$ROOT/android/.gradle" 2>/dev/null || true
rm -rf "$ROOT/android/app/build" 2>/dev/null || true
rm -rf "$ROOT/android/.cxx" 2>/dev/null || true
rm -rf "$ROOT/android/build" 2>/dev/null || true
rm -rf "$ROOT/android/captures" 2>/dev/null || true

# -------------------------------------------------------------------------
# 5. iOS DerivedData + Xcode cache
# -------------------------------------------------------------------------
echo "🔹 [5/8] Очищаємо iOS DerivedData + Xcode cache..."
rm -rf "$HOME/Library/Developer/Xcode/DerivedData/kraina-*" 2>/dev/null || true
rm -rf "$HOME/Library/Caches/com.apple.dt.Xcode" 2>/dev/null || true
rm -rf "$ROOT/ios/build" 2>/dev/null || true

# -------------------------------------------------------------------------
# 6. node_modules
# -------------------------------------------------------------------------
if [ "${SOFT:-false}" = true ]; then
  echo "🔹 [6/8] ⏭ Soft mode — пропускаємо node_modules"
else
  echo "🔹 [6/8] Видаляємо node_modules..."
  rm -rf "$ROOT/node_modules" 2>/dev/null || true
fi

# -------------------------------------------------------------------------
# 7. npm cache (опціонально — чистимо лише expo/related)
# -------------------------------------------------------------------------
echo "🔹 [7/8] Очищаємо npm cache..."
npm cache clean --force 2>/dev/null || true

# -------------------------------------------------------------------------
# 8. Перевстановлення
# -------------------------------------------------------------------------
if [ "${SOFT:-false}" = true ]; then
  echo ""
  echo "✅ Soft clean завершено! Кеші Metro/RN/Android/iOS очищено."
  echo "   Щоб запустити Metro: npm start"
  exit 0
fi

echo ""
echo "🔹 [8/8] Встановлюємо залежності..."

echo ""
echo "  ┌─ npm install ─────────────────────────────────────┐"
npm install --legacy-peer-deps 2>&1 | tail -5
echo "  └────────────────────────────────────────────────────┘"

echo ""
echo "  ┌─ patch-package ───────────────────────────────────┐"
npx patch-package 2>/dev/null || true
echo "  └────────────────────────────────────────────────────┘"

# iOS: Pod install (тільки на macOS)
if [[ "$(uname)" == "Darwin" ]]; then
  echo ""
  echo "  ┌─ pod install ──────────────────────────────────────┐"
  cd ios && pod install --repo-update 2>&1 | tail -5
  cd "$ROOT"
  echo "  └────────────────────────────────────────────────────┘"
  echo ""
  echo "  ┌─ iOS codegen ──────────────────────────────────────┐"
  bash ./scripts/ios-codegen.sh 2>&1 | tail -3
  echo "  └────────────────────────────────────────────────────┘"
else
  echo ""
  echo "  ⏭ Не macOS — пропускаємо pod install"
fi

# -------------------------------------------------------------------------
# Готово
# -------------------------------------------------------------------------
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ Clean rebuild завершено!                            ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

if [ "${DO_START:-false}" = true ]; then
  echo "▶️  Запускаємо Metro..."
  exec bash ./scripts/with-node20.sh npx react-native start --host 0.0.0.0 --reset-cache
else
  echo "▶️  Щоб запустити Metro:  npm start"
  echo "▶️  Щоб запустити iOS:    npm run ios"
  echo "▶️  Щоб запустити Android: npm run android"
  echo "▶️  Clean + start одразу:  npm run clean:start"
  echo ""
fi

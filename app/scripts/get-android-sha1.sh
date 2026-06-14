#!/usr/bin/env bash



set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

echo "=== SHA-1 для Android (Google Sign-In) ==="
echo ""


if [ -d "android" ] && [ -f "android/gradlew" ]; then
  echo "Отримуємо SHA-1 з android/gradlew signingReport..."
  cd android
  ./gradlew signingReport 2>/dev/null | grep -A 2 "Variant: debug" | grep "SHA1:" || true

  SHA1=$(./gradlew signingReport 2>/dev/null | grep "SHA1:" | head -1 | sed 's/.*SHA1: *//' | tr -d ' ')
  cd "$APP_DIR"
  if [ -n "$SHA1" ]; then
    echo ""
    echo "SHA-1 (скопіюй у Google Console): $SHA1"
    exit 0
  fi
fi


KEYSTORE="$HOME/.android/debug.keystore"
if [ -f "$KEYSTORE" ]; then
  echo "Отримуємо SHA-1 з $KEYSTORE..."
  keytool -list -v -keystore "$KEYSTORE" -alias androiddebugkey -storepass android -keypass android 2>/dev/null | grep "SHA1:"
  echo ""
  SHA1=$(keytool -list -v -keystore "$KEYSTORE" -alias androiddebugkey -storepass android -keypass android 2>/dev/null | grep "SHA1:" | sed 's/.*SHA1: *//' | tr -d ' ' | tr -d ':')
  echo "SHA-1 (скопіюй у Google Console): $SHA1"
  exit 0
fi

echo "Не знайдено android/ з gradlew і немає ~/.android/debug.keystore."
echo "Спочатку виконай: cd app && npx expo prebuild --platform android --clean"
echo "або збери проект в Android Studio один раз — тоді з’явиться debug.keystore."
exit 1

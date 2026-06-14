#!/usr/bin/env bash
# Створює кореневий package.json та app/package.json, app/app.json, app/index.js
# Запускайте з кореня проєкту: bash setup-project-files.sh

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

mkdir -p app

# Кореневий package.json
cat > package.json << 'ROOTPKG'
{
  "name": "kraina",
  "private": true,
  "scripts": {
    "start": "cd app && npx expo start --port 8083",
    "start:dev": "cd app && env -u CI npx expo start --port 8083",
    "android": "cd app && npx expo run:android",
    "ios": "cd app && npx expo run:ios",
    "web": "cd app && npx expo start --web"
  }
}
ROOTPKG

# app/package.json
cat > app/package.json << 'APPPKG'
{
  "name": "app",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "expo start --port 8081",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "web": "expo start --web"
  },
  "dependencies": {
    "@react-native-async-storage/async-storage": "2.2.0",
    "firebase": "^11.0.2",
    "@react-native-google-signin/google-signin": "^13.1.0",
    "@react-navigation/native": "^7.1.28",
    "@react-navigation/native-stack": "^7.13.0",
    "expo": "~54.0.33",
    "expo-auth-session": "~7.0.10",
    "expo-crypto": "~15.0.0",
    "expo-dev-client": "~6.0.20",
    "expo-splash-screen": "~31.0.13",
    "expo-status-bar": "~3.0.9",
    "expo-web-browser": "~15.0.0",
    "react": "19.1.0",
    "react-native": "0.81.5",
    "react-native-safe-area-context": "~5.6.0",
    "react-native-screens": "~4.16.0"
  },
  "private": true,
  "engines": { "node": ">=20.19.4" }
}
APPPKG

# app/app.json (мінімум для prebuild)
cat > app/app.json << 'APPJSON'
{
  "expo": {
    "name": "KRAÏNA",
    "slug": "kraina",
    "scheme": "com.kraina.app",
    "version": "1.0.0",
    "orientation": "portrait",
    "backgroundColor": "#101010",
    "ios": { "bundleIdentifier": "com.kraina.app" },
    "android": { "package": "com.kraina.app" }
  }
}
APPJSON

# app/index.js
cat > app/index.js << 'INDEXJS'
import { registerRootComponent } from 'expo';
import App from './App';
registerRootComponent(App);
INDEXJS

echo "OK: створено package.json, app/package.json, app/app.json, app/index.js"
echo ""
echo "Важливо: у папці app мають бути також App.js, ThirdPage.js, MainPage.js, assets/ тощо."
echo "Якщо їх немає — скопіюйте їх у app/ на диску."
echo ""
echo "Далі:"
echo "  cd app && npm install && cd .."
echo "  npm run ios"

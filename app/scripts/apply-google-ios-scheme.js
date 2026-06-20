#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const appRoot = path.join(__dirname, '..');

function schemeFromIosClientId(iosClientId) {
  const id = String(iosClientId || '').trim();
  if (!id || !id.endsWith('.apps.googleusercontent.com')) {
    return null;
  }
  const prefix = id.replace('.apps.googleusercontent.com', '');
  return `com.googleusercontent.apps.${prefix}`;
}

function readIosClientId() {
  const fromEnv = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim();
  try {
    const p = path.join(appRoot, 'google-ios-client.json');
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    const id = (j.iosClientId && String(j.iosClientId).trim()) || '';
    return id;
  } catch {
    return '';
  }
}

const iosClientId = readIosClientId();
const scheme = schemeFromIosClientId(iosClientId);

if (!scheme) {
  console.warn(
    '[apply-google-ios-scheme] Пропуск: iosClientId порожній.\n' +
      '  Заповни app/google-ios-client.json (CLIENT_ID з GoogleService-Info.plist) або EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,\n' +
      '  потім знову: npm run google:ios-scheme\n' +
      '  Див. AUTH_SETUP.md',
  );
  process.exit(0);
}

const plistPath = path.join(appRoot, 'ios', 'KRANA', 'Info.plist');
if (fs.existsSync(plistPath)) {
  let plist = fs.readFileSync(plistPath, 'utf8');
  plist = plist.replace(/com\.googleusercontent\.apps\.[0-9A-Za-z-]+/g, scheme);
  plist = plist.replace(
    /com\.googleusercontent\.apps\.YOUR_IOS_OAUTH_CLIENT_SUFFIX/g,
    scheme,
  );
  plist = plist.replace(
    /com\.googleusercontent\.apps\.[0-9A-Za-z-]+_IOS_OAUTH_CLIENT_SUFFIX/g,
    scheme,
  );
  fs.writeFileSync(plistPath, plist);
  console.log('[apply-google-ios-scheme] Info.plist →', scheme);
  if (iosClientId) {
    let updated = fs.readFileSync(plistPath, 'utf8');
    if (updated.includes('<key>GIDClientID</key>')) {
      updated = updated.replace(
        /<key>GIDClientID<\/key>\s*<string>[^<]*<\/string>/,
        `<key>GIDClientID</key>\n\t<string>${iosClientId}</string>`,
      );
    } else {
      updated = updated.replace(
        /<key>CFBundleVersion<\/key>\s*<string>[^<]*<\/string>/,
        `<key>CFBundleVersion</key>\n\t<string>1</string>\n\t<key>GIDClientID</key>\n\t<string>${iosClientId}</string>`,
      );
    }
    fs.writeFileSync(plistPath, updated);
    console.log('[apply-google-ios-scheme] GIDClientID →', iosClientId.slice(0, 28) + '…');
  }
} else {
  console.warn('[apply-google-ios-scheme] Пропущено Info.plist (немає шляху)', plistPath);
}

const appJsonPath = path.join(appRoot, 'app.json');
if (fs.existsSync(appJsonPath)) {
  const raw = fs.readFileSync(appJsonPath, 'utf8');
  const appJson = JSON.parse(raw);
  const plugins = appJson.expo?.plugins;
  if (Array.isArray(plugins)) {
    const idx = plugins.findIndex(
      (p) => Array.isArray(p) && p[0] === '@react-native-google-signin/google-signin',
    );
    if (idx >= 0) {
      plugins[idx][1] = { ...(plugins[idx][1] || {}), iosUrlScheme: scheme };
      fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');
      console.log('[apply-google-ios-scheme] app.json plugin iosUrlScheme →', scheme);
    } else {
      console.warn('[apply-google-ios-scheme] Плагін @react-native-google-signin не знайдено в app.json');
    }
  }
} else {
  console.warn('[apply-google-ios-scheme] Немає app.json');
}

console.log('[apply-google-ios-scheme] Готово. iosClientId:', iosClientId.slice(0, 24) + '…');

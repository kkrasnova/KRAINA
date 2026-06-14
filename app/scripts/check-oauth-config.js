#!/usr/bin/env node
/**
 * Перевірка конфігурації Google / Facebook / Apple Sign-In.
 * Запуск: cd app && node scripts/check-oauth-config.js
 */

const fs = require('fs');
const path = require('path');

const appRoot = path.join(__dirname, '..');
const ok = (msg) => console.log('  ✓', msg);
const warn = (msg) => console.warn('  ⚠', msg);
const fail = (msg) => console.error('  ✗', msg);

function readText(rel) {
  const p = path.join(appRoot, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

function parsePlistClientId(xml) {
  const m = xml?.match(/<key>CLIENT_ID<\/key>\s*<string>([^<]+)<\/string>/);
  return m?.[1]?.trim() || '';
}

function parsePlistReversedClientId(xml) {
  const m = xml?.match(/<key>REVERSED_CLIENT_ID<\/key>\s*<string>([^<]+)<\/string>/);
  return m?.[1]?.trim() || '';
}

let issues = 0;

console.log('\n=== KRAÏNA OAuth config check ===\n');

// Google Android
console.log('Google (Android):');
const gs = readText('google-services.json');
if (!gs) {
  fail('google-services.json відсутній');
  issues += 1;
} else {
  const web = gs.match(/"client_type":\s*3[\s\S]*?"client_id":\s*"([^"]+)"/);
  const android = gs.match(/"client_type":\s*1[\s\S]*?"client_id":\s*"([^"]+)"/);
  const pkg = gs.match(/"package_name":\s*"([^"]+)"/);
  if (web?.[1]) ok(`Web client (idToken): ${web[1].slice(0, 28)}…`);
  else {
    fail('Web OAuth client (type 3) не знайдено в google-services.json');
    issues += 1;
  }
  if (android?.[1]) ok(`Android client: ${android[1].slice(0, 28)}…`);
  if (pkg?.[1]) ok(`Package: ${pkg[1]}`);
}

// Google iOS
console.log('\nGoogle (iOS):');
const plist = readText('ios/KRANA/GoogleService-Info.plist');
const iosJson = readText('google-ios-client.json');
const iosClientFromPlist = parsePlistClientId(plist);
const reversedFromPlist = parsePlistReversedClientId(plist);
let iosClientFromJson = '';
try {
  iosClientFromJson = JSON.parse(iosJson || '{}').iosClientId || '';
} catch {
  /* ignore */
}

if (iosClientFromPlist && !iosClientFromPlist.includes('YOUR_')) {
  ok(`CLIENT_ID у GoogleService-Info.plist: ${iosClientFromPlist.slice(0, 28)}…`);
} else {
  fail('GoogleService-Info.plist без CLIENT_ID');
  issues += 1;
}

if (iosClientFromJson && !iosClientFromJson.includes('YOUR_')) {
  ok(`google-ios-client.json: ${iosClientFromJson.slice(0, 28)}…`);
  if (iosClientFromPlist && iosClientFromJson !== iosClientFromPlist) {
    warn('iosClientId у json не збігається з plist');
    issues += 1;
  }
} else {
  fail('google-ios-client.json — placeholder або порожньо. Запустіть: npm run google:ios-scheme');
  issues += 1;
}

const infoPlist = readText('ios/KRANA/Info.plist');
if (reversedFromPlist && infoPlist?.includes(reversedFromPlist)) {
  ok(`Info.plist URL scheme: ${reversedFromPlist}`);
} else if (infoPlist?.includes('YOUR_IOS_OAUTH_CLIENT_SUFFIX')) {
  fail('Info.plist має placeholder YOUR_IOS_OAUTH_CLIENT_SUFFIX — npm run google:ios-scheme');
  issues += 1;
} else {
  warn('Google URL scheme у Info.plist не знайдено або не збігається з REVERSED_CLIENT_ID');
  issues += 1;
}

const appJson = readText('app.json');
if (appJson?.includes('@react-native-google-signin/google-signin')) {
  ok('app.json: плагін @react-native-google-signin/google-signin');
} else {
  fail('app.json без плагіна @react-native-google-signin/google-signin');
  issues += 1;
}

// Apple
console.log('\nApple Sign-In (iOS):');
const entitlements = readText('ios/KRANA/KRANA.entitlements');
if (entitlements?.includes('com.apple.developer.applesignin')) {
  ok('Entitlements: Sign in with Apple увімкнено');
} else {
  fail('KRANA.entitlements без com.apple.developer.applesignin');
  issues += 1;
}
if (readText('app.json')?.includes('"usesAppleSignIn": true')) {
  ok('app.json: usesAppleSignIn');
} else {
  warn('app.json: usesAppleSignIn не задано');
}

// Facebook
console.log('\nFacebook:');
const authConfig = readText('authConfig.js') || '';
const fbMatch = authConfig.match(/FACEBOOK_APP_ID = process\.env\.EXPO_PUBLIC_FACEBOOK_APP_ID \|\| '(\d+)'/);
const fbId = fbMatch?.[1] || process.env.EXPO_PUBLIC_FACEBOOK_APP_ID || '';
if (fbId) ok(`App ID: ${fbId}`);
else {
  fail('FACEBOOK_APP_ID не задано');
  issues += 1;
}
// Backend API (Google / Apple token verification for /api/auth/google and /api/auth/apple)
console.log('\nBackend (backend/.env):');
const backendEnv = readText('../backend/.env') || readText('../../backend/.env') || '';
const googleBackend = backendEnv.match(/^GOOGLE_CLIENT_ID=(.+)$/m)?.[1]?.trim() || '';
const appleBackend = backendEnv.match(/^APPLE_CLIENT_ID=(.+)$/m)?.[1]?.trim() || '';
if (googleBackend) ok(`GOOGLE_CLIENT_ID: ${googleBackend.slice(0, 28)}…`);
else {
  warn('backend/.env: GOOGLE_CLIENT_ID порожній — /api/auth/google не прийме токени');
}
if (appleBackend) ok(`APPLE_CLIENT_ID: ${appleBackend}`);
else {
  warn('backend/.env: APPLE_CLIENT_ID порожній — /api/auth/apple не прийме токени');
}
warn('Render/production: задайте ті самі GOOGLE_CLIENT_ID і APPLE_CLIENT_ID у змінних середовища');

// UI
console.log('\nUI (екран входу):');
ok('Android: Google + Facebook (Apple приховано)');
ok('iOS: Google + Facebook + Apple');
warn('Facebook Meta Console: Valid OAuth Redirect URIs → com.kraina.app://oauth');

// Firebase / env
console.log('\nFirebase (.env):');
const env = readText('.env') || '';
const required = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
];
for (const key of required) {
  if (new RegExp(`^${key}=.+`, 'm').test(env)) ok(key);
  else {
    warn(`${key} не задано в app/.env (Firebase auth може не працювати)`);
  }
}

console.log('\n---');
if (issues === 0) {
  console.log('Усі ключові перевірки пройдено. Перезберіть iOS/Android після змін нативних файлів.\n');
} else {
  console.log(`Знайдено проблем: ${issues}. Виправте й знову: node scripts/check-oauth-config.js\n`);
  process.exit(1);
}

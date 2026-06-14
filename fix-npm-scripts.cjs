#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = __dirname;
const pkgPath = path.join(root, 'package.json');
if (!fs.existsSync(pkgPath)) {
  console.error('Нет package.json в', root);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const scripts = {
  'install:app': 'npm install',
  start: 'node -r ./metro-polyfill.js ./node_modules/expo/bin/cli start --port 8083',
  android: 'node -r ./metro-polyfill.js ./node_modules/expo/bin/cli run:android',
  'android:build':
    'node -r ./metro-polyfill.js ./node_modules/expo/bin/cli prebuild --clean --platform android && node -r ./metro-polyfill.js ./node_modules/expo/bin/cli run:android',
  ios: 'node -r ./metro-polyfill.js ./node_modules/expo/bin/cli run:ios',
  'ios:build':
    'node -r ./metro-polyfill.js ./node_modules/expo/bin/cli prebuild --clean --platform ios && (cd ios && pod install) && node -r ./metro-polyfill.js ./node_modules/expo/bin/cli run:ios',
  'ios:prebuild': 'node -r ./metro-polyfill.js ./node_modules/expo/bin/cli prebuild --clean --platform ios',
  'ios:pod': 'cd ios && pod install',
  web: 'node -r ./metro-polyfill.js ./node_modules/expo/bin/cli start --web',
};

pkg.scripts = { ...pkg.scripts, ...scripts };
if (!pkg.engines) pkg.engines = {};
pkg.engines.node = pkg.engines.node || '>=20.19.4';

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const appJsonPath = path.join(root, 'app.json');
if (fs.existsSync(appJsonPath)) {
  try {
    const appCfg = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    const plugins = appCfg?.expo?.plugins;
    if (Array.isArray(plugins)) {
      const filtered = plugins.filter((p) => {
        if (p === 'expo-build-properties') return false;
        if (Array.isArray(p) && p[0] === 'expo-build-properties') return false;
        return true;
      });
      if (filtered.length !== plugins.length) {
        appCfg.expo.plugins = filtered;
        fs.writeFileSync(appJsonPath, JSON.stringify(appCfg, null, 2) + '\n');
        console.log('Из app.json убран плагин expo-build-properties (вызывал PluginError без пакета).');
      }
    }
  } catch (e) {
    console.warn('app.json не обновлён:', e.message);
  }
}

const polyfill = `try {
  const dns = require('dns');
  if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
  }
} catch (_) {}
`;
fs.writeFileSync(path.join(root, 'metro-polyfill.js'), polyfill);

const androidSh = `#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
node -r ./metro-polyfill.js ./node_modules/expo/bin/cli prebuild --clean --platform android
node -r ./metro-polyfill.js ./node_modules/expo/bin/cli run:android
`;
const shPath = path.join(root, 'android-build.sh');
fs.writeFileSync(shPath, androidSh);
try {
  fs.chmodSync(shPath, 0o755);
} catch (_) {}

const nvmrcPath = path.join(root, '.nvmrc');
fs.writeFileSync(nvmrcPath, '20.19.4\n');

console.log('Готово:', pkgPath);
console.log('  + scripts: install:app, android:build, ios:build, …');
console.log('  + metro-polyfill.js, android-build.sh, .nvmrc');
console.log('Дальше: nvm use 20  &&  npm uninstall expo-build-properties 2>/dev/null; npm install  &&  npm run android:build');
console.log('Если node fix-npm-scripts.cjs пишет MODULE_NOT_FOUND — ты в ДРУГОЙ папке (см. ВАЖНО-ДВЕ-ПАПКИ.txt).');

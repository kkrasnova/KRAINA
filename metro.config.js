const path = require('path');

// Завантажує app/.env у process.env до Babel: inline-env-vars підставляє EXPO_PUBLIC_* у бандл.
try {
  require('dotenv').config({ path: path.resolve(__dirname, '.env') });
} catch (_) {
  /* dotenv не встановлено — змінні можуть бути з shell / Xcode */
}

const { getDefaultConfig: getRNMetroDefaultConfig } = require('@react-native/metro-config');
const { getDefaultConfig: getExpoMetroDefaultConfig } = require('expo/metro-config');

// RN CLI expects @react-native/metro-config#getDefaultConfig to run (sets global flag).
getRNMetroDefaultConfig(__dirname);

const config = getExpoMetroDefaultConfig(__dirname);

// Node's `events` is not bundled by default; some deps do `require('events').EventEmitter`.
config.resolver = {
  ...config.resolver,
  extraNodeModules: {
    ...config.resolver.extraNodeModules,
    events: path.resolve(__dirname, 'node_modules/events'),
  },
};

module.exports = config;

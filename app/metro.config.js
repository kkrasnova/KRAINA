const path = require('path');
const os = require('os');

const appNodeModules = path.resolve(__dirname, 'node_modules');

require('./scripts/metro-polyfill.cjs');

// Завантажує app/.env у process.env до Babel: inline-env-vars підставляє EXPO_PUBLIC_* у бандл.
try {
  require('dotenv').config({ path: path.resolve(__dirname, '.env') });
} catch (_) {
  /* dotenv не встановлено — змінні можуть бути з shell / Xcode */
}



const { getDefaultConfig: getRNMetroDefaultConfig } = require('@react-native/metro-config');

const { getDefaultConfig: getExpoMetroDefaultConfig } = require('@expo/metro-config');

// Prefer the @expo/metro-config version bundled with expo (56.0.14) over the hoisted root copy (56.0.13).
function resolveExpoMetroConfigRoot() {
  try {
    return path.dirname(
      require.resolve('@expo/metro-config/package.json', {
        paths: [path.join(appNodeModules, 'expo'), appNodeModules, __dirname],
      }),
    );
  } catch {
    return path.dirname(require.resolve('@expo/metro-config/package.json', { paths: [__dirname] }));
  }
}

const expoMetroConfigRoot = resolveExpoMetroConfigRoot();
const expoSourceMap = require(path.join(expoMetroConfigRoot, 'build/serializer/sourceMap'));

// Metro's .map requests bypass customSerializer. Patch the app-local Metro instance
// (monorepo hoisting can leave a second copy in the repo root that never runs).
function patchExpoSourceMapSerializer() {
  const stock = require(path.join(
    appNodeModules,
    'metro/src/DeltaBundler/Serializers/sourceMapString.js',
  ));
  stock.sourceMapString = expoSourceMap.sourceMapString;
  stock.sourceMapStringNonBlocking = expoSourceMap.sourceMapStringNonBlocking;
}

patchExpoSourceMapSerializer();

// RN CLI expects @react-native/metro-config#getDefaultConfig to run (sets global flag).
getRNMetroDefaultConfig(__dirname);

const config = getExpoMetroDefaultConfig(__dirname);

// App sources live entirely under app/; watching the monorepo root pulled in
// duplicate node_modules paths and broke DevTools source maps.

const pinnedPackages = [

  'react-native',

  '@react-native/codegen',

  '@react-native/babel-plugin-codegen',

  '@react-native/babel-preset',

  '@react-native/metro-config',

  '@expo/metro-config',

  'expo',

  'metro-runtime',

  'events',

];



const extraNodeModules = { ...config.resolver?.extraNodeModules };

for (const pkg of pinnedPackages) {

  try {

    extraNodeModules[pkg] = path.dirname(

      require.resolve(`${pkg}/package.json`, { paths: [appNodeModules] }),

    );

  } catch (_) {

    /* optional dep */

  }

}



const defaultResolveRequest = config.resolver?.resolveRequest;







// Metro 0.83 schema has no server.tls; Expo sets tls:false for newer Metro.

if (config.server && 'tls' in config.server) {

  delete config.server.tls;

}



// inlineRequires: модулі (зокрема важкі екрани) виконуються лише при першому зверненні,
const __origGetTransformOptions = config.transformer && config.transformer.getTransformOptions;
config.transformer = {
  ...config.transformer,
  // enableBabelRCLookup: false — не шукати .babelrc у node_modules, пришвидшує трансформацію
  enableBabelRCLookup: false,
  // Minifier: для production-збірок Terser з 1 проходом (швидше, ніж дефолтні 3) + деревогой
  minifierConfig: {
    compress: {
      passes: 1,
      drop_console: true,
      drop_debugger: true,
      pure_funcs: ['console.log', 'console.warn', 'console.error'],
    },
    mangle: {
      toplevel: true,
      safari10: true,
    },
    output: {
      ascii_only: true,
      comments: false,
    },
  },
  async getTransformOptions(entryPoints, options, getDependenciesOf) {
    const base = __origGetTransformOptions
      ? await __origGetTransformOptions(entryPoints, options, getDependenciesOf)
      : {};
    return {
      ...base,
      transform: {
        ...(base.transform || {}),
        inlineRequires: true,
      },
    };
  },
};

// Resolver: пришвидшуємо резолюцію модулів
config.resolver = {
  ...config.resolver,
  unstable_enablePackageExports: true,
  emptyModulePath: path.resolve(
    appNodeModules,
    'metro-runtime/src/modules/empty-module.js',
  ),
  // Do not fall back to repo-root node_modules — mixed RN/babel versions break codegen.
  nodeModulesPaths: [appNodeModules],
  extraNodeModules,
  resolveRequest(context, moduleName, platform) {
    if (moduleName === 'expo-av') {
      return {
        type: 'sourceFile',
        filePath: path.resolve(__dirname, 'expoAvCompat.js'),
      };
    }
    if (moduleName === 'events') {
      return {
        type: 'sourceFile',
        filePath: path.join(appNodeModules, 'events', 'events.js'),
      };
    }
    if (defaultResolveRequest) {
      return defaultResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};



// cacheVersion: форсувати скидання кешу при зміні конфігурації трансформера
config.cacheVersion = '2.0';

// Додаємо hashing для кешу — пришвидшує повторний бандлінг
if (config.transformer) {
  config.transformer.assetPlugins = config.transformer.assetPlugins || [];
}

// maxWorkers: явно обмежуємо до CPU - 1 (залишаємо один для системи)
// Використовуємо більше воркерів для швидшого бандлінгу
config.maxWorkers = Math.min(os.cpus().length, 6);

// Ensure the patch wins even if a dependency re-required Metro during config setup.
patchExpoSourceMapSerializer();

module.exports = config;



const fs = require('fs');
const path = require('path');

const providerFile = path.join(
  __dirname,
  '..',
  'ios',
  'build',
  'generated',
  'ios',
  'ReactCodegen',
  'RCTModuleProviders.mm',
);

if (!fs.existsSync(providerFile)) {
  process.exit(0);
}

const marker = '@"RNMapsAirModule": @"RNMapsAirModule"';
let source = fs.readFileSync(providerFile, 'utf8');

if (source.includes(marker)) {
  process.exit(0);
}

const insertion =
  '\t\t\t@"RNMapsAirModule": @"RNMapsAirModule", // react-native-maps\n';

const updated = source.replace(
  /(NSDictionary<NSString \*, NSString \*> \* moduleMapping = @\{)\n/,
  `$1\n${insertion}`,
);

if (updated === source) {
  console.warn('[patch-maps] Could not patch RCTModuleProviders.mm');
  process.exit(1);
}

fs.writeFileSync(providerFile, updated);
console.log('[patch-maps] Registered RNMapsAirModule in RCTModuleProviders.mm');


const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'node_modules', 'metro-config', 'src', 'loadConfig.js');
if (!fs.existsSync(file)) {
  process.exit(0);
}
let s = fs.readFileSync(file, 'utf8');
if (!s.includes('toReversed')) {
  process.exit(0);
}
const orig = s;
s = s
  .replace(/const reversedConfigs = configs\.toReversed\(\);/g, 'const reversedConfigs = [...configs].reverse();')
  .replace(
    /return mergeConfigAsync\(nextConfig, reversedConfigs\.toReversed\(\)\);/g,
    'return mergeConfigAsync(nextConfig, [...reversedConfigs].reverse());',
  );
if (s === orig) {
  process.exit(0);
}
fs.writeFileSync(file, s);
console.log('[patch-metro] Patched metro-config loadConfig.js (toReversed → reverse).');

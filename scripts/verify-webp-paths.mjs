import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const cwd = process.cwd();
const assetsDir = path.join(cwd, 'assets');

// Find all require() references to .webp in JS files
const result = execSync(
  `grep -rn "require.*\\.webp'" *.js */*.js 2>/dev/null | grep -v node_modules | grep -v ".json"`,
  { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, cwd },
);

const lines = result.trim().split('\n').filter(Boolean);

const webpFiles = {};
const missing = [];

for (const line of lines) {
  const match = line.match(/require\(['"]\.\/assets\/([^'"]+)['"]\)/);
  if (!match) continue;
  const filename = match[1];
  const filePath = path.join(assetsDir, filename);
  
  if (!webpFiles[filename]) {
    webpFiles[filename] = { count: 1, files: [line.split(':')[0]] };
    if (!fs.existsSync(filePath)) {
      missing.push(filename);
    }
  } else {
    webpFiles[filename].count++;
    if (!webpFiles[filename].files.includes(line.split(':')[0])) {
      webpFiles[filename].files.push(line.split(':')[0]);
    }
  }
}

console.log('=== WebP require() paths in code ===');
for (const [name, info] of Object.entries(webpFiles).sort((a, b) => a[0].localeCompare(b[0]))) {
  const status = missing.includes(name) ? '❌ MISSING' : '✅ OK';
  console.log(`${status}  ${name}  (×${info.count}, in: ${info.files.length} files)`);
}

console.log('\n=== Missing files ===');
if (missing.length === 0) {
  console.log('✅ All WebP files referenced in code exist on disk!');
} else {
  for (const m of missing) {
    console.log(`❌ ${m} — referenced in code but file does not exist`);
  }
}

console.log('\n=== Files referencing WebP ===');
const fileSet = new Set();
for (const info of Object.values(webpFiles)) {
  for (const f of info.files) fileSet.add(f);
}
for (const f of [...fileSet].sort()) {
  console.log(`  ${f}`);
}

console.log(`\nUnique WebP require() paths: ${Object.keys(webpFiles).length}`);
console.log(`Referencing ${fileSet.size} source files`);
console.log(`Missing files: ${missing.length}`);



import fs from 'fs';
import path from 'path';


const APP_LANG_IDS = [
  'en',
  'uk',
  'de',
  'pl',
  'nl',
  'es',
  'lt',
  'lv',
  'ro',
  'it',
  'hy',
];

const appDir = path.join(process.cwd(), 'app');

function auditFile(absPath) {
  const text = fs.readFileSync(absPath, 'utf8');
  const lines = text.split(/\n/);
  const issues = [];
  let inS = false;
  let brace = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (/^const S = \{/.test(trimmed)) {
      inS = true;
      brace =
        (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      continue;
    }
    if (!inS) continue;
    brace += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    if (brace <= 0 && line.includes('};')) break;
    if (!trimmed || trimmed.startsWith('//')) continue;
    const m = trimmed.match(/^([a-zA-Z0-9_]+):\s*\{/);
    if (!m) continue;
    const idx = line.indexOf('{');
    const rest = line.slice(idx);
    const langsInLine = new Set();
    const p = /\b(en|uk|de|pl|nl|es|lt|lv|ro|it|hy):/g;
    let mm;
    while ((mm = p.exec(rest)) !== null) langsInLine.add(mm[1]);
    if (langsInLine.size > 0 && langsInLine.size < APP_LANG_IDS.length) {
      const missing = APP_LANG_IDS.filter((id) => !langsInLine.has(id));
      issues.push({ line: i + 1, key: m[1], missing });
    }
  }
  return issues;
}

const files = fs.readdirSync(appDir).filter((f) => f.endsWith('I18n.js')).sort();
let total = 0;
for (const f of files) {
  const p = path.join(appDir, f);
  const issues = auditFile(p);
  if (issues.length) {
    console.log(`\n### ${f} (${issues.length} incomplete rows)`);
    const cap = 25;
    issues.slice(0, cap).forEach((i) =>
      console.log(`  L${i.line} ${i.key} missing: ${i.missing.join(', ')}`),
    );
    if (issues.length > cap) console.log(`  ... ${issues.length - cap} more`);
    total += issues.length;
  }
}
console.log(`\nTotal incomplete rows: ${total}`);
console.log(`Expected langs per row: ${APP_LANG_IDS.join(', ')}`);


const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP_LANG_IDS = ['uk', 'en', 'de', 'pl', 'nl', 'es', 'lt', 'lv', 'ro', 'it', 'hy'];

function readQuotedAt(src, pos) {
  const q = src[pos];
  if (q !== "'" && q !== '"') return null;
  let i = pos + 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === q) return { value: src.slice(pos + 1, i), end: i + 1 };
    i++;
  }
  return null;
}


function readBlock(src, from) {
  let i = from;
  while (i < src.length && src[i] !== '{') i++;
  if (src[i] !== '{') return null;
  let depth = 1;
  let str = null;
  let j = i + 1;
  while (j < src.length) {
    const c = src[j];
    if (str) {
      if (c === '\\') {
        j += 2;
        continue;
      }
      if (c === str) str = null;
      j++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      str = c;
      j++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth
      if (depth === 0) return { body: src.slice(i + 1, j), end: j + 1 };
    }
    j++;
  }
  return null;
}

function parseTopLevelLangRow(rowBody) {
  const out = {};
  for (const lang of APP_LANG_IDS) {
    const re = new RegExp(`(^|[\\s,])${lang}:\\s*`, 'gm');
    let m;
    let found = '';
    while ((m = re.exec(rowBody))) {
      const startQuote = m.index + m[0].length;
      const r = readQuotedAt(rowBody, startQuote);
      if (r) {
        found = r.value;
        break;
      }
    }
    out[lang] = found;
  }
  return out;
}

function checkRow(label, row, problems) {
  const empties = APP_LANG_IDS.filter((l) => !String(row?.[l] || '').trim());
  if (empties.length) {
    console.log(`  ${label}: empty for ${empties.join(',')}`);
    problems.push(label);
  } else {
    console.log(`  ${label}: OK`);
  }
}

function findRow(text, prefix) {
  const re = new RegExp(prefix + '\\s*=\\s*\\{');
  const m = re.exec(text);
  if (!m) return null;
  const block = readBlock(text, m.index + m[0].length - 1);
  if (!block) return null;
  return parseTopLevelLangRow(block.body);
}

const problems = [];

console.log('=== app/landmarkSophiaI18n.js ===');
const sophiaSrc = fs.readFileSync(path.resolve(ROOT, 'app/landmarkSophiaI18n.js'), 'utf8');
checkRow('SOPHIA_DESC_I18N', findRow(sophiaSrc, 'SOPHIA_DESC_I18N'), problems);
checkRow('SOPHIA_BEFORE_AFTER_HINT_I18N', findRow(sophiaSrc, 'SOPHIA_BEFORE_AFTER_HINT_I18N'), problems);

console.log('\n=== app/landmarkAndriivskyiI18n.js ===');
const andriivskyiSrc = fs.readFileSync(
  path.resolve(ROOT, 'app/landmarkAndriivskyiI18n.js'),
  'utf8',
);
checkRow('ANDRIIVSKY_DESC_I18N', findRow(andriivskyiSrc, 'ANDRIIVSKY_DESC_I18N'), problems);

console.log('\n=== app/landmarkStoriesI18n.js ===');
const autoSrc = fs.readFileSync(path.resolve(ROOT, 'app/landmarkStoriesI18n.js'), 'utf8');
const TARGETS = [
  'kyiv:sophia',
  'kyiv:kyiv_andriivskyi_uzviz',
  'kyiv:kyiv_mykhailivskyi',
  'kyiv:kyiv_volodymyrskyi',
];
for (const key of TARGETS) {
  const re = new RegExp(`'${key.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}':\\s*\\{`);
  const m = re.exec(autoSrc);
  if (!m) {
    console.log(`  ${key}: MISSING`);
    problems.push(key);
    continue;
  }
  const block = readBlock(autoSrc, m.index + m[0].length - 1);
  if (!block) continue;
  const inner = block.body;
  const descMatch = /desc:\s*\{/.exec(inner);
  if (!descMatch) {
    console.log(`  ${key} desc: MISSING`);
    problems.push(`${key}/desc`);
  } else {
    const dBlock = readBlock(inner, descMatch.index + descMatch[0].length - 1);
    const dRow = parseTopLevelLangRow(dBlock.body);
    checkRow(`${key} desc`, dRow, problems);
  }
  const slidesMatch = /slides:\s*\{/.exec(inner);
  if (slidesMatch) {
    const sBlock = readBlock(inner, slidesMatch.index + slidesMatch[0].length - 1);
    const slideHeader = /(['"])(story-[a-z-]+)\1:\s*\{/g;
    let mh;
    while ((mh = slideHeader.exec(sBlock.body))) {
      const id = mh[2];
      const slBlock = readBlock(sBlock.body, mh.index + mh[0].length - 1);
      if (!slBlock) continue;
      const factHeader = /fact:\s*\{/.exec(slBlock.body);
      if (factHeader) {
        const fBlock = readBlock(slBlock.body, factHeader.index + factHeader[0].length - 1);
        const fRow = parseTopLevelLangRow(fBlock.body);
        checkRow(`${key} ${id} fact`, fRow, problems);
      }
    }
  }
  const quizMatch = /quiz:\s*\{/.exec(inner);
  if (quizMatch) {
    const qBlock = readBlock(inner, quizMatch.index + quizMatch[0].length - 1);
    const questionMatch = /question:\s*\{/.exec(qBlock.body);
    if (questionMatch) {
      const qq = readBlock(qBlock.body, questionMatch.index + questionMatch[0].length - 1);
      checkRow(`${key} quiz.question`, parseTopLevelLangRow(qq.body), problems);
    }
  }
}

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log('  -', p);
  process.exit(1);
}
console.log('\nAll bundles cover 11 UI languages.');

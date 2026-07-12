
import fs from 'fs';

const REGION_HEADER_RE = /^  (\w+): \{$/;
const LANDMARK_OPEN_RE = /^      \{$/;
const LANDMARK_CLOSE_RE = /^      \},?$/;


function decodeJsString(quoted) {
  let out = '';
  for (let i = 0; i < quoted.length; i++) {
    const c = quoted[i];
    if (c !== '\\') {
      out += c;
      continue;
    }
    const next = quoted[i + 1];
    if (next == null) break;
    i++;
    if (next === 'n') out += '\n';
    else if (next === 't') out += '\t';
    else if (next === 'r') out += '\r';
    else if (next === 'u') {
      const hex = quoted.slice(i + 1, i + 5);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        out += String.fromCharCode(parseInt(hex, 16));
        i += 4;
      } else {
        out += next;
      }
    } else {
      out += next;
    }
  }
  return out;
}


function readQuotedString(src, i) {
  const q = src[i];
  if (q !== "'" && q !== '"') return null;
  let j = i + 1;
  while (j < src.length) {
    const c = src[j];
    if (c === '\\') {
      j += 2;
      continue;
    }
    if (c === q) {
      return { body: src.slice(i + 1, j), end: j + 1 };
    }
    j++;
  }
  return null;
}


function readFieldString(block, field, fromIdx = 0) {
  
  const re = new RegExp(`(?:^|\\n|,\\s*)\\s*${field}:`, 'g');
  re.lastIndex = fromIdx;
  const m = re.exec(block);
  if (!m) return null;
  let p = m.index + m[0].length;
  while (p < block.length && /\s/.test(block[p])) p++;
  const c = block[p];
  if (c !== "'" && c !== '"') return null;
  const r = readQuotedString(block, p);
  if (!r) return null;
  return { value: decodeJsString(r.body), end: r.end };
}


function readFieldBlock(block, field) {
  const re = new RegExp(`(^|\\n)\\s*${field}:\\s*\\{`, 'g');
  const m = re.exec(block);
  if (!m) return null;
  const openIdx = m.index + m[0].length - 1;
  let depth = 1;
  let inStr = null;
  for (let i = openIdx + 1; i < block.length; i++) {
    const ch = block[i];
    if (inStr) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inStr = ch;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return block.slice(openIdx + 1, i);
      }
    }
  }
  return null;
}

function readQuizOptions(quizBlock) {
  const optsRe = /options:\s*\[/;
  const m = optsRe.exec(quizBlock);
  if (!m) return [];
  let i = m.index + m[0].length;
  let depth = 1;
  let inStr = null;
  let arr = '';
  while (i < quizBlock.length) {
    const ch = quizBlock[i];
    if (inStr) {
      if (ch === '\\') {
        arr += ch + (quizBlock[i + 1] || '');
        i += 2;
        continue;
      }
      if (ch === inStr) inStr = null;
      arr += ch;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inStr = ch;
      arr += ch;
      i++;
      continue;
    }
    if (ch === '[') depth++;
    if (ch === ']') {
      depth--;
      if (depth === 0) break;
    }
    arr += ch;
    i++;
  }
  const out = [];
  const optRe = /\{[^{}]*\}/g;
  for (const om of arr.match(optRe) || []) {
    let inner = String(om || '').trim();
    if (inner.startsWith('{') && inner.endsWith('}')) inner = inner.slice(1, -1).trim();
    const uk = readFieldString(inner, 'textUk')?.value || '';
    const en = readFieldString(inner, 'textEn')?.value || '';
    const correctMatch = /correct:\s*(true|false)/.exec(om);
    out.push({ uk, en, correct: correctMatch ? correctMatch[1] === 'true' : false });
  }
  return out;
}


export function extractLandmarkStories(srcPath) {
  const text = fs.readFileSync(srcPath, 'utf8');
  const lines = text.split('\n');
  const out = [];
  let regionId = null;
  let inLandmarks = false;
  let curBlock = '';
  let inLandmark = false;

  const flush = () => {
    if (!curBlock || !regionId) return;
    const idMatch = /^\s+id:\s*'([^']+)'/m.exec(curBlock);
    if (!idMatch) return;
    const lmId = idMatch[1];
    const titleUk = readFieldString(curBlock, 'titleUk')?.value || '';
    const titleEn = readFieldString(curBlock, 'titleEn')?.value || '';
    const desc = {
      uk: readFieldString(curBlock, 'descUk')?.value || '',
      en: readFieldString(curBlock, 'descEn')?.value || '',
    };
    const storyBlock = readFieldBlock(curBlock, 'story');
    let story = null;
    if (storyBlock) {
      const photoFactBlock = readFieldBlock(storyBlock, 'photoFact');
      const secondFactBlock = readFieldBlock(storyBlock, 'secondFact');
      const thirdFactBlock = readFieldBlock(storyBlock, 'thirdFact');
      const fourthFactBlock = readFieldBlock(storyBlock, 'fourthFact');
      const beforeAfterBlock = readFieldBlock(storyBlock, 'beforeAfter');
      const quizBlock = readFieldBlock(storyBlock, 'quiz');
      const factPair = (b) =>
        b
          ? {
              titleUk: readFieldString(b, 'titleUk')?.value || '',
              titleEn: readFieldString(b, 'titleEn')?.value || '',
              bodyUk: readFieldString(b, 'bodyUk')?.value || '',
              bodyEn: readFieldString(b, 'bodyEn')?.value || '',
            }
          : null;
      let hasBeforeAfter = false;
      if (beforeAfterBlock) {
        const oldStr = readFieldString(beforeAfterBlock, 'oldUri')?.value || '';
        const newStr = readFieldString(beforeAfterBlock, 'newUri')?.value || '';
        if (oldStr || newStr) hasBeforeAfter = true;
        if (!hasBeforeAfter) {
          
          if (/oldUri:\s*\w+\s*[,}]/.test(beforeAfterBlock)) hasBeforeAfter = true;
          if (/newUri:\s*\w+\s*[,}]/.test(beforeAfterBlock)) hasBeforeAfter = true;
        }
      }
      story = {
        photoFact: factPair(photoFactBlock),
        secondFact: factPair(secondFactBlock),
        thirdFact: factPair(thirdFactBlock),
        fourthFact: factPair(fourthFactBlock),
        hasBeforeAfter,
        closing: {
          titleUk: readFieldString(storyBlock, 'closingTitleUk')?.value || '',
          titleEn: readFieldString(storyBlock, 'closingTitleEn')?.value || '',
          bodyUk: readFieldString(storyBlock, 'closingUk')?.value || '',
          bodyEn: readFieldString(storyBlock, 'closingEn')?.value || '',
        },
        quiz: quizBlock
          ? {
              questionUk: readFieldString(quizBlock, 'questionUk')?.value || '',
              questionEn: readFieldString(quizBlock, 'questionEn')?.value || '',
              hintUk: readFieldString(quizBlock, 'multiHintUk')?.value || '',
              hintEn: readFieldString(quizBlock, 'multiHintEn')?.value || '',
              options: readQuizOptions(quizBlock),
            }
          : null,
      };
    }
    out.push({
      key: `${regionId}:${lmId}`,
      regionId,
      landmarkId: lmId,
      titleUk,
      titleEn,
      desc,
      story,
    });
  };

  for (const line of lines) {
    const rh = REGION_HEADER_RE.exec(line);
    if (rh) {
      regionId = rh[1];
      inLandmarks = false;
      inLandmark = false;
      curBlock = '';
      continue;
    }
    if (/^    landmarks: \[$/.test(line)) {
      inLandmarks = true;
      continue;
    }
    if (inLandmarks && /^    \],/.test(line)) {
      inLandmarks = false;
      continue;
    }
    if (!inLandmarks) continue;
    if (LANDMARK_OPEN_RE.test(line)) {
      inLandmark = true;
      curBlock = line + '\n';
      continue;
    }
    if (inLandmark) {
      curBlock += line + '\n';
      if (LANDMARK_CLOSE_RE.test(line)) {
        flush();
        curBlock = '';
        inLandmark = false;
      }
    }
  }

  return out;
}

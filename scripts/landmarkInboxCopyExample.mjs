import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'data/landmarks/sofia_cathedral.json');
const DEST = path.join(ROOT, 'data/landmarks/inbox/landmark_example.json');

const force = process.argv.includes('

try {
  await stat(SRC);
} catch {
  
  console.error('Не знайдено вихідний файл:', SRC);
  process.exit(1);
}

if (!force) {
  try {
    await stat(DEST);
    
    console.error(
      `Вже існує: ${DEST}\nВидаліть його або: npm run location:inbox:copy-example 
    );
    process.exit(1);
  } catch {
    
  }
}

await mkdir(path.dirname(DEST), { recursive: true });
const raw = await readFile(SRC, 'utf8');
const data = JSON.parse(raw);
if (!String(data.region_id || data.regionId || '').trim()) {
  data.region_id = 'kyiv';
}
await writeFile(DEST, `${JSON.stringify(data, null, 2)}\n`, 'utf8');

console.log('OK →', DEST);

console.log('Далі: npm run location:inbox:build');

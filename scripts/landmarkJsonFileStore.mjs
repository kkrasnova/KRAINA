


import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function deepMerge(target, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return target;
  for (const key of Object.keys(patch)) {
    const pv = patch[key];
    const tv = target[key];
    if (pv && typeof pv === 'object' && !Array.isArray(pv) && tv && typeof tv === 'object' && !Array.isArray(tv)) {
      deepMerge(tv, pv);
    } else {
      target[key] = pv;
    }
  }
  return target;
}


export function processLandmarkJson(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') errors.push('Корінь не є об’єктом');
  if (!String(raw?.id || '').trim()) errors.push('Поле id обов’язкове');
  if (!String(raw?.title || '').trim()) errors.push('Поле title обов’язкове');
  const lat = raw?.coordinates?.lat;
  const lng = raw?.coordinates?.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    errors.push('coordinates.lat / coordinates.lng мають бути скінченними числами');
  }

  const slides = Array.isArray(raw.slides) ? raw.slides : [];
  const facts = Array.isArray(raw.facts) ? raw.facts : [];
  const quiz = Array.isArray(raw.quiz) ? raw.quiz : [];

  slides.forEach((s, i) => {
    if (!s || typeof s !== 'object') errors.push(`slides[${i}] не об’єкт`);
    else if (!String(s.id || '').trim()) errors.push(`slides[${i}].id порожній`);
  });

  facts.forEach((f, i) => {
    if (!f || typeof f !== 'object') errors.push(`facts[${i}] не об’єкт`);
    else if (f.id == null || String(f.id).trim() === '') errors.push(`facts[${i}].id порожній`);
    else if (!String(f.text || '').trim()) errors.push(`facts[${i}].text порожній`);
  });

  const summary = {
    id: raw?.id,
    title: raw?.title,
    city: raw?.city,
    slideCount: slides.length,
    factCount: facts.length,
    quizCount: quiz.length,
    unesco: !!raw?.is_unesco,
    introChars: String(raw?.intro_text || '').length,
  };

  return {
    ok: errors.length === 0,
    errors,
    summary,
    
    normalizedForWrite: (data) => {
      const out = structuredClone(data);
      if (!out.created_at) out.created_at = todayIsoDate();
      out.updated_at = todayIsoDate();
      return out;
    },
  };
}

export async function readLandmarkJsonFile(filePath) {
  const abs = path.resolve(filePath);
  const text = await readFile(abs, 'utf8');
  return JSON.parse(text);
}

export async function writeLandmarkJsonFile(filePath, data) {
  const abs = path.resolve(filePath);
  const body = `${JSON.stringify(data, null, 2)}\n`;
  await writeFile(abs, body, 'utf8');
}

function deleteFactById(data, factId) {
  const idNum = Number(factId);
  const idStr = String(factId).trim();
  const facts = Array.isArray(data.facts) ? data.facts : [];
  const next = facts.filter((f) => String(f.id) !== idStr && Number(f.id) !== idNum);
  if (next.length === facts.length) throw new Error(`Факт з id=${factId} не знайдено`);
  data.facts = next;
}

function deleteSlideById(data, slideId) {
  const sid = String(slideId || '').trim();
  const slides = Array.isArray(data.slides) ? data.slides : [];
  const next = slides.filter((s) => String(s?.id || '') !== sid);
  if (next.length === slides.length) throw new Error(`Слайд id=${slideId} не знайдено`);
  data.slides = next;
}

function usage() {
  console.error(`Використання:
  node scripts/landmarkJsonFileStore.mjs read <file.json>
  node scripts/landmarkJsonFileStore.mjs process <file.json>
  node scripts/landmarkJsonFileStore.mjs write <src.json> <dest.json>
  node scripts/landmarkJsonFileStore.mjs update <file.json> '<json patch>'
  node scripts/landmarkJsonFileStore.mjs delete-fact <file.json> <numericId>
  node scripts/landmarkJsonFileStore.mjs delete-slide <file.json> <slideId>
`);
}

async function main() {
  const [, , cmd, a1, a2] = process.argv;
  if (!cmd || !a1) {
    usage();
    process.exit(1);
  }

  if (cmd === 'read' || cmd === 'process') {
    const raw = await readLandmarkJsonFile(a1);
    const result = processLandmarkJson(raw);
    console.log(JSON.stringify({ cmd, file: path.resolve(a1), ...result, summary: result.summary }, null, 2));
    if (!result.ok) process.exit(2);
    return;
  }

  if (cmd === 'write') {
    if (!a2) {
      usage();
      process.exit(1);
    }
    const raw = await readLandmarkJsonFile(a1);
    const result = processLandmarkJson(raw);
    if (!result.ok) {
      console.error('Помилки обробки:', result.errors);
      process.exit(2);
    }
    const out = result.normalizedForWrite(raw);
    await writeLandmarkJsonFile(a2, out);
    console.log(`Записано: ${path.resolve(a2)}`);
    return;
  }

  if (cmd === 'update') {
    if (!a2) {
      usage();
      process.exit(1);
    }
    let patch;
    try {
      patch = JSON.parse(a2);
    } catch (e) {
      console.error('Другий аргумент має бути валідним JSON-об’єктом:', e.message);
      process.exit(1);
    }
    const data = await readLandmarkJsonFile(a1);
    deepMerge(data, patch);
    data.updated_at = todayIsoDate();
    const result = processLandmarkJson(data);
    if (!result.ok) {
      console.error('Після оновлення валідація не пройшла:', result.errors);
      process.exit(2);
    }
    await writeLandmarkJsonFile(a1, data);
    console.log(`Оновлено файл: ${path.resolve(a1)}`);
    return;
  }

  if (cmd === 'delete-fact') {
    if (!a2) {
      usage();
      process.exit(1);
    }
    const data = await readLandmarkJsonFile(a1);
    deleteFactById(data, a2);
    data.updated_at = todayIsoDate();
    await writeLandmarkJsonFile(a1, data);
    console.log(`Видалено факт id=${a2} у ${path.resolve(a1)}`);
    return;
  }

  if (cmd === 'delete-slide') {
    if (!a2) {
      usage();
      process.exit(1);
    }
    const data = await readLandmarkJsonFile(a1);
    deleteSlideById(data, a2);
    data.updated_at = todayIsoDate();
    await writeLandmarkJsonFile(a1, data);
    console.log(`Видалено слайд id=${a2} у ${path.resolve(a1)}`);
    return;
  }

  usage();
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

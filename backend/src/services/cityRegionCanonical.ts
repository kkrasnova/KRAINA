/**
 * Single source of truth for city → regionId so "Київ" / "Kyiv" / "Kiev"
 * always map to the same region (`kyiv`), never duplicate cities in the app.
 */

export type CanonicalCity = {
  id: string;
  titleUk: string;
  titleEn: string;
  aliases: string[];
};

function norm(s: unknown) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`]/g, '')
    .replace(/[\s\-_/\\.]+/g, '')
    .replace(/[^a-zа-яіїєґ0-9]/gi, '');
}

function slugAscii(name: unknown) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/** Capitals + major cities used by the app / AI import. */
export const CANONICAL_CITIES: CanonicalCity[] = [
  { id: 'kyiv', titleUk: 'Київ', titleEn: 'Kyiv', aliases: ['київ', 'kyiv', 'kiev', 'киев', 'києва', 'kyiva'] },
  { id: 'lviv', titleUk: 'Львів', titleEn: 'Lviv', aliases: ['львів', 'lviv', 'lwow', 'лемберг', 'львов', 'львова'] },
  { id: 'odesa', titleUk: 'Одеса', titleEn: 'Odesa', aliases: ['одеса', 'odesa', 'odessa', 'одесса'] },
  { id: 'kharkiv', titleUk: 'Харків', titleEn: 'Kharkiv', aliases: ['харків', 'kharkiv', 'kharkov', 'харьков'] },
  { id: 'dnipro', titleUk: 'Дніпро', titleEn: 'Dnipro', aliases: ['дніпро', 'dnipro', 'dnepr', 'дніпропетровськ'] },
  { id: 'zaporizhzhia', titleUk: 'Запоріжжя', titleEn: 'Zaporizhzhia', aliases: ['запоріжжя', 'zaporizhzhia', 'zaporozhye'] },
  { id: 'paris', titleUk: 'Париж', titleEn: 'Paris', aliases: ['париж', 'paris'] },
  { id: 'rome', titleUk: 'Рим', titleEn: 'Rome', aliases: ['рим', 'rome', 'roma'] },
  { id: 'warsaw', titleUk: 'Варшава', titleEn: 'Warsaw', aliases: ['варшава', 'warsaw', 'warszawa'] },
  { id: 'berlin', titleUk: 'Берлін', titleEn: 'Berlin', aliases: ['берлін', 'berlin'] },
  { id: 'madrid', titleUk: 'Мадрид', titleEn: 'Madrid', aliases: ['мадрид', 'madrid'] },
  { id: 'amsterdam', titleUk: 'Амстердам', titleEn: 'Amsterdam', aliases: ['амстердам', 'amsterdam'] },
  { id: 'vilnius', titleUk: 'Вільнюс', titleEn: 'Vilnius', aliases: ['вільнюс', 'vilnius'] },
  { id: 'riga', titleUk: 'Рига', titleEn: 'Riga', aliases: ['рига', 'riga'] },
  { id: 'bucharest', titleUk: 'Бухарест', titleEn: 'Bucharest', aliases: ['бухарест', 'bucharest', 'bucuresti'] },
  { id: 'yerevan', titleUk: 'Єреван', titleEn: 'Yerevan', aliases: ['єреван', 'yerevan', 'ереван'] },
  { id: 'lisbon', titleUk: 'Лісабон', titleEn: 'Lisbon', aliases: ['лісабон', 'lisbon', 'lisboa'] },
  { id: 'brussels', titleUk: 'Брюссель', titleEn: 'Brussels', aliases: ['брюссель', 'brussels', 'bruxelles', 'brussel'] },
  { id: 'vienna', titleUk: 'Відень', titleEn: 'Vienna', aliases: ['відень', 'vienna', 'wien'] },
  { id: 'prague', titleUk: 'Прага', titleEn: 'Prague', aliases: ['прага', 'prague', 'praha'] },
  { id: 'bratislava', titleUk: 'Братислава', titleEn: 'Bratislava', aliases: ['братислава', 'bratislava'] },
  { id: 'budapest', titleUk: 'Будапешт', titleEn: 'Budapest', aliases: ['будапешт', 'budapest'] },
  { id: 'dublin', titleUk: 'Дублін', titleEn: 'Dublin', aliases: ['дублін', 'dublin'] },
  { id: 'london', titleUk: 'Лондон', titleEn: 'London', aliases: ['лондон', 'london'] },
  { id: 'stockholm', titleUk: 'Стокгольм', titleEn: 'Stockholm', aliases: ['стокгольм', 'stockholm'] },
  { id: 'oslo', titleUk: 'Осло', titleEn: 'Oslo', aliases: ['осло', 'oslo'] },
  { id: 'copenhagen', titleUk: 'Копенгаген', titleEn: 'Copenhagen', aliases: ['копенгаген', 'copenhagen', 'kobenhavn'] },
  { id: 'helsinki', titleUk: 'Гельсінкі', titleEn: 'Helsinki', aliases: ['гельсінкі', 'helsinki'] },
  { id: 'reykjavik', titleUk: 'Рейк\'явік', titleEn: 'Reykjavik', aliases: ['рейкявік', 'reykjavik'] },
  { id: 'tallinn', titleUk: 'Таллінн', titleEn: 'Tallinn', aliases: ['таллінн', 'tallinn'] },
  { id: 'athens', titleUk: 'Афіни', titleEn: 'Athens', aliases: ['афіни', 'athens', 'athina'] },
  { id: 'sofia', titleUk: 'Софія', titleEn: 'Sofia', aliases: ['софія', 'sofia'] },
  { id: 'zagreb', titleUk: 'Загреб', titleEn: 'Zagreb', aliases: ['загреб', 'zagreb'] },
  { id: 'ljubljana', titleUk: 'Любляна', titleEn: 'Ljubljana', aliases: ['любляна', 'ljubljana'] },
  { id: 'belgrade', titleUk: 'Белград', titleEn: 'Belgrade', aliases: ['белград', 'belgrade', 'beograd'] },
  { id: 'sarajevo', titleUk: 'Сараєво', titleEn: 'Sarajevo', aliases: ['сараєво', 'sarajevo'] },
  { id: 'podgorica', titleUk: 'Подгориця', titleEn: 'Podgorica', aliases: ['подгориця', 'podgorica'] },
  { id: 'skopje', titleUk: 'Скоп\'є', titleEn: 'Skopje', aliases: ['скопє', 'skopje'] },
  { id: 'tirana', titleUk: 'Тирана', titleEn: 'Tirana', aliases: ['тирана', 'tirana'] },
  { id: 'pristina', titleUk: 'Приштина', titleEn: 'Pristina', aliases: ['приштина', 'pristina', 'prishtina'] },
  { id: 'chisinau', titleUk: 'Кишинів', titleEn: 'Chisinau', aliases: ['кишинів', 'chisinau', 'kishinev'] },
  { id: 'luxembourg', titleUk: 'Люксембург', titleEn: 'Luxembourg', aliases: ['люксембург', 'luxembourg'] },
  { id: 'valletta', titleUk: 'Валлетта', titleEn: 'Valletta', aliases: ['валлетта', 'valletta'] },
  { id: 'nicosia', titleUk: 'Нікосія', titleEn: 'Nicosia', aliases: ['нікосія', 'nicosia'] },
  { id: 'monaco', titleUk: 'Монако', titleEn: 'Monaco', aliases: ['монако', 'monaco'] },
  { id: 'bern', titleUk: 'Берн', titleEn: 'Bern', aliases: ['берн', 'bern', 'berne'] },
  { id: 'zurich', titleUk: 'Цюрих', titleEn: 'Zurich', aliases: ['цюрих', 'zurich', 'zürich'] },
];

const byAlias = new Map<string, CanonicalCity>();
for (const city of CANONICAL_CITIES) {
  byAlias.set(norm(city.id), city);
  byAlias.set(norm(city.titleUk), city);
  byAlias.set(norm(city.titleEn), city);
  for (const a of city.aliases) byAlias.set(norm(a), city);
}

export function resolveCanonicalCity(input: {
  regionId?: string;
  cityUk?: string;
  cityEn?: string;
  city?: string;
}): { id: string; titleUk: string; titleEn: string } {
  const candidates = [input.regionId, input.cityUk, input.cityEn, input.city]
    .map((x) => norm(x))
    .filter(Boolean);

  for (const key of candidates) {
    const hit = byAlias.get(key);
    if (hit) return { id: hit.id, titleUk: hit.titleUk, titleEn: hit.titleEn };
  }

  // Prefer Latin slug from English label when possible
  const en = String(input.cityEn || input.city || input.cityUk || '').trim();
  const uk = String(input.cityUk || input.city || input.cityEn || '').trim();
  let id = slugAscii(en) || slugAscii(uk) || String(input.regionId || '').trim();
  // Never keep raw Cyrillic as region id (causes Kyiv / Київ duplicates)
  if (!id || /[^a-z0-9_]/.test(id)) {
    id = `city_${Date.now().toString(36)}`;
  }
  return {
    id,
    titleUk: uk || en || id,
    titleEn: en || uk || id,
  };
}

/**
 * If a matching city region already exists under any alias id/title, return the
 * canonical id (caller creates/merges into that id after dedupe).
 */
export function findExistingRegionId(
  regions: Record<string, any>,
  canonical: { id: string; titleUk: string; titleEn: string },
): string {
  if (!regions || typeof regions !== 'object') return '';
  if (regions[canonical.id]) return canonical.id;

  const want = new Set([norm(canonical.id), norm(canonical.titleUk), norm(canonical.titleEn)]);
  const city = byAlias.get(norm(canonical.id));
  if (city) {
    want.add(norm(city.titleUk));
    want.add(norm(city.titleEn));
    city.aliases.forEach((a) => want.add(norm(a)));
  }

  for (const rid of Object.keys(regions)) {
    const r = regions[rid];
    if (want.has(norm(rid)) || want.has(norm(r?.id)) || want.has(norm(r?.titleUk)) || want.has(norm(r?.titleEn))) {
      return canonical.id;
    }
  }
  return '';
}

/**
 * Merge duplicate city regions (e.g. `київ` → `kyiv`) inside a landmark bundle.
 */
export function dedupeCityRegionsInBundle(bundle: Record<string, any>): Record<string, any> {
  const next = JSON.parse(JSON.stringify(bundle && typeof bundle === 'object' ? bundle : {}));
  if (!next.regions || typeof next.regions !== 'object') return next;
  if (!next.homeRegionIdsByCountry || typeof next.homeRegionIdsByCountry !== 'object') {
    next.homeRegionIdsByCountry = {};
  }

  const rename: Record<string, string> = {};
  for (const rid of Object.keys(next.regions)) {
    const r = next.regions[rid] || {};
    const can = resolveCanonicalCity({
      regionId: rid,
      cityUk: r.titleUk,
      cityEn: r.titleEn,
    });
    if (can.id !== rid) rename[rid] = can.id;
  }

  for (const [from, to] of Object.entries(rename)) {
    const src = next.regions[from];
    if (!src) continue;
    if (!next.regions[to]) {
      next.regions[to] = {
        ...src,
        id: to,
        titleUk: resolveCanonicalCity({ regionId: to }).titleUk || src.titleUk,
        titleEn: resolveCanonicalCity({ regionId: to }).titleEn || src.titleEn,
        landmarks: Array.isArray(src.landmarks) ? [...src.landmarks] : [],
      };
    } else {
      const dst = next.regions[to];
      dst.landmarks = Array.isArray(dst.landmarks) ? dst.landmarks : [];
      const existingIds = new Set(dst.landmarks.map((lm: any) => String(lm?.id || '')));
      const existingTitles = new Set(
        dst.landmarks.flatMap((lm: any) => [norm(lm?.titleUk), norm(lm?.titleEn)]).filter(Boolean),
      );
      for (const lm of Array.isArray(src.landmarks) ? src.landmarks : []) {
        const titleKey = norm(lm?.titleUk || lm?.titleEn);
        if ((lm?.id && existingIds.has(String(lm.id))) || (titleKey && existingTitles.has(titleKey))) {
          continue;
        }
        dst.landmarks.push(lm);
        if (lm?.id) existingIds.add(String(lm.id));
        if (titleKey) existingTitles.add(titleKey);
      }
      if (!dst.heroUri && src.heroUri) dst.heroUri = src.heroUri;
      if (!dst.center?.latitude && src.center?.latitude) dst.center = src.center;
      const can = resolveCanonicalCity({ regionId: to });
      dst.titleUk = can.titleUk;
      dst.titleEn = can.titleEn;
      dst.id = to;
    }
    delete next.regions[from];
  }

  for (const countryId of Object.keys(next.homeRegionIdsByCountry)) {
    const ids = Array.isArray(next.homeRegionIdsByCountry[countryId])
      ? next.homeRegionIdsByCountry[countryId]
      : [];
    const mapped = ids.map((id: string) => rename[id] || id);
    next.homeRegionIdsByCountry[countryId] = [...new Set(mapped)].filter(
      (id: string) => next.regions[id],
    );
  }

  return next;
}

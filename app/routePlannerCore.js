import { getRegion, landmarkTitle } from './routeRegionsData';

/** @typedef {'landmark' | 'park' | 'museum' | 'cafe' | 'architecture' | 'secret'} InterestTag */

/** Категорії для фільтра інтересів (за текстом назви/опису). */
export function inferLandmarkInterestTags(lm) {
  const s = `${lm.titleUk || ''} ${lm.titleEn || ''} ${lm.descUk || ''} ${lm.descEn || ''}`.toLowerCase();
  /** @type {Set<InterestTag>} */
  const tags = new Set();
  if (
    /(музей|museum|musée|museo|gallery|галерея|louvre|rijks|prado|uffizi|pinacoteca|pinakothek|національн|exposition|виставк|картинн|cultural center)/i.test(
      s,
    )
  ) {
    tags.add('museum');
  }
  if (/(парк|park|garden|сад|jardin|botan|tiergarten|borghese|retiro|villa d'este|зоопарк|zoo)/i.test(s)) {
    tags.add('park');
  }
  if (/(кафе|caffè|caffe|cafe|coffee|trattoria|gelateria|osteria|bistro|brasserie|ресторан|restaurant|wine bar)/i.test(s)) {
    tags.add('cafe');
  }
  if (
    /(архітектур|architecture|facade|фасад|будівл|площа|square|вулиця|streetscape|historic|бароко|gothic)/i.test(s)
  ) {
    tags.add('architecture');
  }
  if (/(прихован|таємн|secret|маловідом|hidden|off the beaten|незвичайн)/i.test(s)) {
    tags.add('secret');
  }
  if (tags.size === 0) tags.add('landmark');
  return tags;
}

/** @param {{ landmark?: boolean, park?: boolean, museum?: boolean, cafe?: boolean, architecture?: boolean, secret?: boolean } | null | undefined} interests */
export function landmarkMatchesInterestFilters(lm, interests) {
  if (!interests) return true;
  const any =
    interests.landmark === true ||
    interests.park === true ||
    interests.museum === true ||
    interests.cafe === true ||
    interests.architecture === true ||
    interests.secret === true;
  if (!any) return true;
  const tags = inferLandmarkInterestTags(lm);
  if (interests.museum && tags.has('museum')) return true;
  if (interests.park && tags.has('park')) return true;
  if (interests.cafe && tags.has('cafe')) return true;
  if (interests.landmark && tags.has('landmark')) return true;
  if (interests.architecture && tags.has('architecture')) return true;
  if (interests.secret && tags.has('secret')) return true;
  return false;
}

function toRad(d) {
  return (d * Math.PI) / 180;
}

export function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function speedKmh(transport) {
  switch (transport) {
    case 'car':
      return 28;
    case 'bus':
      return 18;
    case 'train':
      return 35;
    case 'walk':
    default:
      return 5;
  }
}

function pickStartLandmark(pool, query, variant) {
  if (!pool.length) return [];
  const q = (query || '').toLowerCase();
  let best = pool[0];
  let bestScore = -1;
  for (const lm of pool) {
    const uk = lm.titleUk.toLowerCase();
    const en = lm.titleEn.toLowerCase();
    let score = 0;
    if (q.includes(uk) || q.includes(en)) score += 100;
    for (const w of uk.split(/[\s–-]+/)) {
      if (w.length > 3 && q.includes(w)) score += 20;
    }
    for (const w of en.split(/[\s–-]+/)) {
      if (w.length > 3 && q.includes(w)) score += 20;
    }
    if (score > bestScore) {
      bestScore = score;
      best = lm;
    }
  }
  const others = pool.filter((l) => l.id !== best.id);
  const n = others.length;
  const v = n ? Math.abs(variant) % n : 0;
  const rotated = n ? [...others.slice(v), ...others.slice(0, v)] : [];
  return [best, ...rotated];
}

function resolveBudgetTier(opts) {
  const t = opts.budgetTier;
  if (t === 'free' || t === 'budget' || t === 'medium' || t === 'premium') return t;
  return opts.freeOnly ? 'free' : 'medium';
}

/** Якщо користувач «далеко» від усіх точок регіону (інша країна / емулятор), не рахуємо переліт у бюджет часу прогулянки. */
const MAX_ORIGIN_KM_FOR_TIME_BUDGET = 100;

function minKmFromOriginToPool(origin, pool) {
  if (!origin || !pool.length) return 0;
  let min = Infinity;
  for (const lm of pool) {
    const d = haversineKm(origin, lm);
    if (d < min) min = d;
  }
  return min;
}

/**
 * Будує маршрут лише в межах одного регіону.
 * @param {{ regionId: string, query: string, hours: number, transport: string, freeOnly?: boolean, budgetTier?: 'free'|'budget'|'medium'|'premium', interests?: { landmark?: boolean, park?: boolean, museum?: boolean, cafe?: boolean, architecture?: boolean, secret?: boolean }, variant?: number, language?: string, userOrigin?: { lat: number, lng: number } | null }} opts
 */
export function buildRoutePlan(opts) {
  const region = getRegion(opts.regionId);
  const langIsUk = (opts.language || 'uk').split(/[-_]/)[0].toLowerCase() !== 'en';
  const budgetTier = resolveBudgetTier(opts);
  const timeMult = budgetTier === 'premium' ? 1.12 : budgetTier === 'budget' ? 0.88 : 1;
  const effectiveFreeOnly = budgetTier === 'free';

  let pool = [...region.landmarks].filter((l) => landmarkMatchesInterestFilters(l, opts.interests));
  if (budgetTier === 'budget') {
    pool = [...pool].sort((a, b) => (a.free === b.free ? 0 : a.free ? -1 : 1));
  } else if (budgetTier === 'premium') {
    pool = [...pool].sort((a, b) => (a.free === b.free ? 0 : a.free ? 1 : -1));
  }
  if (effectiveFreeOnly) {
    const freePool = pool.filter((l) => l.free);
    if (freePool.length >= 1) pool = freePool;
  }

  const hours = Math.min(Math.max(Number(opts.hours) || 4, 1), 240);
  const budgetMin = hours * 60 * timeMult;
  const speed = speedKmh(opts.transport);
  const variant = Number(opts.variant) || 0;

  const userOrigin =
    opts.userOrigin &&
    typeof opts.userOrigin.lat === 'number' &&
    typeof opts.userOrigin.lng === 'number'
      ? { lat: opts.userOrigin.lat, lng: opts.userOrigin.lng }
      : null;

  const ordered = pickStartLandmark(pool, opts.query, variant);
  const stops = [];
  let usedTime = 0;
  /** Геолокація для оцінки тривалості лише якщо користувач у межах міста; інакше маршрут лишається в межах регіону, лінія на карті — від користувача. */
  /** @type {{ lat: number, lng: number } | null} */
  let prevCoord =
    userOrigin && minKmFromOriginToPool(userOrigin, pool) <= MAX_ORIGIN_KM_FOR_TIME_BUDGET
      ? userOrigin
      : null;

  const tryAdd = (lm) => {
    const travelMin = prevCoord ? (haversineKm(prevCoord, lm) / speed) * 60 : 0;
    const need = travelMin + lm.minutes;
    if (usedTime + need <= budgetMin) {
      stops.push(lm);
      usedTime += need;
      prevCoord = lm;
      return true;
    }
    return false;
  };

  if (ordered[0]) tryAdd(ordered[0]);
  const rest = ordered.slice(1);

  while (rest.length) {
    const prevLm = stops[stops.length - 1];
    if (!prevLm) break;
    rest.sort((a, b) => haversineKm(prevLm, a) - haversineKm(prevLm, b));
    let added = false;
    for (let i = 0; i < rest.length; i += 1) {
      const c = rest[i];
      const d = haversineKm(prevLm, c);
      const travelMin = (d / speed) * 60;
      if (usedTime + travelMin + c.minutes <= budgetMin) {
        stops.push(c);
        usedTime += travelMin + c.minutes;
        prevCoord = c;
        rest.splice(i, 1);
        added = true;
        break;
      }
    }
    if (!added) break;
  }

  if (stops.length === 1 && pool.length >= 2 && stops[0]) {
    const candidates = pool
      .filter((l) => l.id !== stops[0].id)
      .map((l) => ({ l, d: haversineKm(stops[0], l) }))
      .sort((a, b) => a.d - b.d);
    const first = candidates[0];
    if (first) {
      const travelMin = (first.d / speed) * 60;
      if (usedTime + travelMin + first.l.minutes <= budgetMin) {
        stops.push(first.l);
        usedTime += travelMin + first.l.minutes;
      }
    }
  }

  let totalKm = 0;
  if (userOrigin && stops[0]) {
    totalKm += haversineKm(userOrigin, stops[0]);
  }
  for (let i = 1; i < stops.length; i += 1) {
    totalKm += haversineKm(stops[i - 1], stops[i]);
  }

  const coordinates = [];
  if (userOrigin) {
    coordinates.push({ latitude: userOrigin.lat, longitude: userOrigin.lng });
  }
  for (const s of stops) {
    coordinates.push({ latitude: s.lat, longitude: s.lng });
  }

  const stopsOut = stops.map((s, idx) => ({
    order: idx + 1,
    id: s.id,
    titleUk: s.titleUk,
    titleEn: s.titleEn,
    title: landmarkTitle(s, langIsUk),
    lat: s.lat,
    lng: s.lng,
    minutes: s.minutes,
    thumb: s.thumb,
  }));

  return {
    regionId: region.id,
    regionTitleUk: region.titleUk,
    regionTitleEn: region.titleEn,
    countryUk: region.countryUk,
    countryEn: region.countryEn,
    flag: region.flag,
    stops: stopsOut,
    coordinates,
    totalKm,
    totalMinutes: Math.round(usedTime),
    transport: opts.transport,
    freeOnly: effectiveFreeOnly,
    budgetTier,
    interests: opts.interests || null,
    userOrigin,
  };
}

export function formatDurationUk(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m} хв`;
  if (m === 0) return `${h} год`;
  return `${h}:${String(m).padStart(2, '0')} год`;
}

export function formatDurationEn(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h}h ${m}m`;
}

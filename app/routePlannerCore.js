import { getRegion } from './routeRegionsData';
import { resolveCatalogLandmarkTitle } from './catalogDisplayI18n';
import { appLangBase } from './appLang';

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

function coordLat(c) {
  const v = c?.lat ?? c?.latitude;
  return Number.isFinite(v) ? v : null;
}

function coordLng(c) {
  const v = c?.lng ?? c?.longitude;
  return Number.isFinite(v) ? v : null;
}

export function haversineKm(a, b) {
  const aLat = coordLat(a);
  const aLng = coordLng(a);
  const bLat = coordLat(b);
  const bLng = coordLng(b);
  if (aLat == null || aLng == null || bLat == null || bLng == null) return 0;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function speedKmh(transport) {
  switch (transport) {
    case 'car':
      return 28;
    case 'bike':
      return 16;
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
  // Запит лише про місто — чергуємо стартову точку, щоб «інший маршрут» дав інші комбінації.
  if (bestScore <= 0) {
    const v = Math.abs(Number(variant) || 0) % pool.length;
    return [...pool.slice(v), ...pool.slice(0, v)];
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
export const MAX_ORIGIN_KM_FOR_ROUTE = 100;

function minKmFromOriginToPool(origin, pool) {
  if (!origin || !pool.length) return Infinity;
  let min = Infinity;
  for (const lm of pool) {
    const d = haversineKm(origin, lm);
    if (d < min) min = d;
  }
  return min;
}

/** @param {{ lat: number, lng: number } | null | undefined} origin */
export function isUserOriginNearRoute(origin, stopsOrLandmarks) {
  if (!origin || !stopsOrLandmarks?.length) return false;
  return minKmFromOriginToPool(origin, stopsOrLandmarks) <= MAX_ORIGIN_KM_FOR_ROUTE;
}

function hasUserOriginCoords(userOrigin) {
  return (
    userOrigin &&
    typeof userOrigin.lat === 'number' &&
    typeof userOrigin.lng === 'number' &&
    Number.isFinite(userOrigin.lat) &&
    Number.isFinite(userOrigin.lng)
  );
}

/** @param {{ lat: number, lng: number } | null | undefined} userOrigin */
export function buildRouteCoordinates(userOrigin, stops) {
  const coordinates = [];
  if (hasUserOriginCoords(userOrigin) && isUserOriginNearRoute(userOrigin, stops)) {
    coordinates.push({ latitude: userOrigin.lat, longitude: userOrigin.lng });
  }
  for (const s of stops) {
    coordinates.push({ latitude: s.lat, longitude: s.lng });
  }
  return coordinates;
}

/** @param {{ lat: number, lng: number } | null | undefined} userOrigin */
export function computeRouteTotalKm(userOrigin, stops) {
  if (!stops.length) return 0;
  let totalKm = 0;
  if (hasUserOriginCoords(userOrigin) && isUserOriginNearRoute(userOrigin, stops)) {
    totalKm += haversineKm(userOrigin, stops[0]);
  }
  for (let i = 1; i < stops.length; i += 1) {
    totalKm += haversineKm(stops[i - 1], stops[i]);
  }
  return totalKm;
}

/** Найкоротший порядок зупинок від поточної геолокації. */
export function orderStopsFromUserOrigin(stops, userOrigin) {
  if (!Array.isArray(stops) || !stops.length) return [];
  if (!hasUserOriginCoords(userOrigin)) return [...stops];
  if (stops.length === 2) {
    const d0 = haversineKm(userOrigin, stops[0]);
    const d1 = haversineKm(userOrigin, stops[1]);
    return d0 <= d1 ? [...stops] : [stops[1], stops[0]];
  }
  if (stops.length >= 3) return optimizeStopOrder(stops, userOrigin);
  return [...stops];
}

export function computeBearingDegrees(from, to) {
  if (!from || !to) return 0;
  const lat1 = toRad(from.latitude ?? from.lat);
  const lat2 = toRad(to.latitude ?? to.lat);
  const dLon = toRad((to.longitude ?? to.lng) - (from.longitude ?? from.lng));
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

/** Зміщує точку вздовж азимуту на distanceM метрів. */
export function offsetCoordinateMeters(coord, bearingDeg, distanceM) {
  if (!coord || !Number.isFinite(distanceM) || distanceM === 0) return coord;
  const lat1 = toRad(coord.latitude ?? coord.lat);
  const lng1 = toRad(coord.longitude ?? coord.lng);
  const brng = toRad(bearingDeg);
  const angular = distanceM / 6371000;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(brng),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { latitude: (lat2 * 180) / Math.PI, longitude: (lng2 * 180) / Math.PI };
}

/** Рухає точку вперед уздовж полілінії на distanceM метрів. */
export function advanceAlongPolyline(polyline, pos, distanceM) {
  if (!Array.isArray(polyline) || polyline.length < 2 || !pos || !Number.isFinite(distanceM) || distanceM <= 0) {
    return pos;
  }
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < polyline.length; i += 1) {
    const p = polyline[i];
    const d = haversineKm(pos, p) * 1000;
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  let remaining = distanceM;
  let current = {
    latitude: polyline[bestIdx].latitude,
    longitude: polyline[bestIdx].longitude,
  };
  for (let i = bestIdx; i < polyline.length - 1 && remaining > 0; i += 1) {
    const a = i === bestIdx ? current : polyline[i];
    const b = polyline[i + 1];
    const segM = haversineKm(a, b) * 1000;
    if (segM <= 0.01) continue;
    if (remaining <= segM) {
      const frac = remaining / segM;
      return {
        latitude: a.latitude + (b.latitude - a.latitude) * frac,
        longitude: a.longitude + (b.longitude - a.longitude) * frac,
      };
    }
    remaining -= segM;
    current = { latitude: b.latitude, longitude: b.longitude };
  }
  const last = polyline[polyline.length - 1];
  return { latitude: last.latitude, longitude: last.longitude };
}

/** Найближча точка на полілінії до pos. */
export function nearestPointOnPolyline(polyline, pos) {
  if (!Array.isArray(polyline) || polyline.length < 2 || !pos) return pos;
  const px = pos.longitude;
  const py = pos.latitude;
  let bestPoint = polyline[0];
  let bestDistM = Infinity;
  for (let i = 0; i < polyline.length - 1; i += 1) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const ax = a.longitude;
    const ay = a.latitude;
    const bx = b.longitude;
    const by = b.latitude;
    const mLng = 111320 * Math.cos((ay * Math.PI) / 180);
    const mLat = 110540;
    const abx = (bx - ax) * mLng;
    const aby = (by - ay) * mLat;
    const apx = (px - ax) * mLng;
    const apy = (py - ay) * mLat;
    const abLenSq = abx * abx + aby * aby;
    let t = abLenSq > 0 ? (apx * abx + apy * aby) / abLenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + (bx - ax) * t;
    const cy = ay + (by - ay) * t;
    const km = haversineKm({ latitude: py, longitude: px }, { latitude: cy, longitude: cx });
    const m = km * 1000;
    if (m < bestDistM) {
      bestDistM = m;
      bestPoint = { latitude: cy, longitude: cx };
    }
  }
  return bestPoint;
}

/**
 * Розрізає полілінію в точці найближчого підходу до pos.
 * @returns {{ remaining: object[], traveled: object[], snap: object }}
 */
export function slicePolylineFromPosition(polyline, pos) {
  if (!Array.isArray(polyline) || polyline.length < 2 || !pos) {
    return { remaining: polyline || [], traveled: [], snap: pos };
  }
  const px = pos.longitude;
  const py = pos.latitude;
  let bestSeg = 0;
  let bestT = 0;
  let bestDistM = Infinity;
  let snap = polyline[0];

  for (let i = 0; i < polyline.length - 1; i += 1) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const ax = a.longitude;
    const ay = a.latitude;
    const bx = b.longitude;
    const by = b.latitude;
    const mLng = 111320 * Math.cos((ay * Math.PI) / 180);
    const mLat = 110540;
    const abx = (bx - ax) * mLng;
    const aby = (by - ay) * mLat;
    const apx = (px - ax) * mLng;
    const apy = (py - ay) * mLat;
    const abLenSq = abx * abx + aby * aby;
    let t = abLenSq > 0 ? (apx * abx + apy * aby) / abLenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + (bx - ax) * t;
    const cy = ay + (by - ay) * t;
    const m = haversineKm({ latitude: py, longitude: px }, { latitude: cy, longitude: cx }) * 1000;
    if (m < bestDistM) {
      bestDistM = m;
      bestSeg = i;
      bestT = t;
      snap = { latitude: cy, longitude: cx };
    }
  }

  const remaining = [snap];
  for (let j = bestSeg + 1; j < polyline.length; j += 1) {
    remaining.push(polyline[j]);
  }

  const traveled = [];
  for (let j = 0; j <= bestSeg; j += 1) {
    traveled.push(polyline[j]);
  }
  if (traveled.length) {
    const last = traveled[traveled.length - 1];
    if (
      Math.abs(last.latitude - snap.latitude) > 1e-7 ||
      Math.abs(last.longitude - snap.longitude) > 1e-7
    ) {
      traveled.push(snap);
    }
  }

  return { remaining, traveled, snap };
}

/** Напрямок руху вздовж маршруту (градуси, 0 = північ). */
export function bearingAlongPolyline(polyline, pos, aheadM = 24) {
  if (!polyline?.length || !pos) return null;
  const ahead = advanceAlongPolyline(polyline, pos, aheadM);
  if (!ahead) return null;
  if (haversineKm(pos, ahead) * 1000 < 2 && polyline.length >= 2) {
    const a = polyline[Math.max(0, polyline.length - 2)];
    const b = polyline[polyline.length - 1];
    return computeBearingDegrees(a, b);
  }
  return computeBearingDegrees(pos, ahead);
}

export function estimateMinutesForKm(km, transport = 'walk') {
  if (!Number.isFinite(km) || km <= 0) return 0;
  return Math.max(1, Math.round((km / speedKmh(transport)) * 60));
}

/**
 * Сумарний час маршруту у хвилинах: дорога між сусідніми точками + час огляду
 * кожної зупинки. anchor (геолокація поруч) додає дорогу до першої зупинки.
 * @param {{ lat: number, lng: number } | null | undefined} anchor
 * @param {Array<{ lat: number, lng: number }>} stops
 * @param {number} speed км/год
 * @param {(stop: any) => number} minutesOf хвилини огляду конкретної зупинки
 */
export function computeUsedMinutes(anchor, stops, speed, minutesOf) {
  if (!Array.isArray(stops) || !stops.length) return 0;
  let used = 0;
  let prev = anchor || null;
  for (const s of stops) {
    if (prev) used += (haversineKm(prev, s) / speed) * 60;
    used += minutesOf(s);
    prev = s;
  }
  return used;
}

/**
 * 2-opt оптимізація порядку зупинок (відкритий шлях). Прибирає «зигзаги» та
 * самоперетини, скорочуючи сумарну дорогу — маршрут стає послідовним і логічним.
 * Перша точка шляху лишається фіксованою: це або геолокація користувача (anchor),
 * або найрелевантніша стартова локація. Решту зупинок переставляємо.
 * @param {Array<{ lat: number, lng: number }>} stops
 * @param {{ lat: number, lng: number } | null} [anchor] геолокація як нульова точка
 * @returns {Array} новий масив зупинок в оптимізованому порядку
 */
export function optimizeStopOrder(stops, anchor = null) {
  if (!Array.isArray(stops) || stops.length < 3) {
    return Array.isArray(stops) ? [...stops] : [];
  }
  // Вузли шляху: [anchor?, ...stops]. Індекс 0 завжди фіксований.
  const nodes = anchor ? [anchor, ...stops] : [...stops];
  const FIXED = 1;
  const dist = (a, b) => haversineKm(a, b);
  let improved = true;
  let guard = 0;
  const MAX_PASSES = 12;
  while (improved && guard < MAX_PASSES) {
    improved = false;
    guard += 1;
    for (let i = FIXED; i < nodes.length - 1; i += 1) {
      for (let k = i + 1; k < nodes.length; k += 1) {
        const a = nodes[i - 1];
        const b = nodes[i];
        const c = nodes[k];
        const d = k + 1 < nodes.length ? nodes[k + 1] : null; // хвіст відкритого шляху
        const before = dist(a, b) + (d ? dist(c, d) : 0);
        const after = dist(a, c) + (d ? dist(b, d) : 0);
        if (after + 1e-9 < before) {
          // Реверс сегмента [i..k].
          let lo = i;
          let hi = k;
          while (lo < hi) {
            const t = nodes[lo];
            nodes[lo] = nodes[hi];
            nodes[hi] = t;
            lo += 1;
            hi -= 1;
          }
          improved = true;
        }
      }
    }
  }
  return anchor ? nodes.slice(1) : nodes;
}

/**
 * Будує маршрут лише в межах одного регіону.
 * @param {{ regionId: string, query: string, hours: number, transport: string, freeOnly?: boolean, budgetTier?: 'free'|'budget'|'medium'|'premium', interests?: { landmark?: boolean, park?: boolean, museum?: boolean, cafe?: boolean, architecture?: boolean, secret?: boolean }, variant?: number, language?: string, userOrigin?: { lat: number, lng: number } | null }} opts
 */
export function buildRoutePlan(opts) {
  const region = getRegion(opts.regionId);
  const lang = appLangBase(opts.language || 'en');
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
  let prevCoord = isUserOriginNearRoute(userOrigin, pool) ? userOrigin : null;

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

  // 2-opt: прибираємо зигзаги в порядку зупинок (старт фіксований).
  const anchorForOpt = isUserOriginNearRoute(userOrigin, stops) ? userOrigin : null;
  let finalStops = optimizeStopOrder(stops, anchorForOpt);

  // Дозаповнення: коротший шлях вивільнив час — пробуємо додати ще локації.
  const minutesOf = (s) => s.minutes;
  let timeNow = computeUsedMinutes(anchorForOpt, finalStops, speed, minutesOf);
  const usedIds = new Set(finalStops.map((s) => s.id));
  const leftover = pool.filter((l) => !usedIds.has(l.id));
  let progressed = true;
  while (progressed && leftover.length) {
    progressed = false;
    const last = finalStops[finalStops.length - 1];
    if (!last) break;
    leftover.sort((a, b) => haversineKm(last, a) - haversineKm(last, b));
    for (let i = 0; i < leftover.length; i += 1) {
      const c = leftover[i];
      const add = (haversineKm(last, c) / speed) * 60 + c.minutes;
      if (timeNow + add <= budgetMin) {
        finalStops.push(c);
        timeNow += add;
        usedIds.add(c.id);
        leftover.splice(i, 1);
        progressed = true;
        break;
      }
    }
  }

  // Повторна оптимізація після дозаповнення + точний перерахунок часу.
  finalStops = optimizeStopOrder(finalStops, anchorForOpt);
  timeNow = computeUsedMinutes(anchorForOpt, finalStops, speed, minutesOf);

  const totalKm = computeRouteTotalKm(userOrigin, finalStops);
  const coordinates = buildRouteCoordinates(userOrigin, finalStops);
  const originNearRegion = isUserOriginNearRoute(userOrigin, finalStops.length ? finalStops : pool);

  const stopsOut = finalStops.map((s, idx) => ({
    order: idx + 1,
    id: s.id,
    titleUk: s.titleUk,
    titleEn: s.titleEn,
    title: resolveCatalogLandmarkTitle(s, lang, { regionId: region.id, landmarkId: s.id }),
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
    totalMinutes: Math.round(timeNow),
    transport: opts.transport,
    freeOnly: effectiveFreeOnly,
    budgetTier,
    interests: opts.interests || null,
    userOrigin: originNearRegion ? userOrigin : null,
    originNearRegion,
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

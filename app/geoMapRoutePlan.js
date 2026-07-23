import { haversineKm, isUserOriginNearRoute, orderStopsFromUserOrigin, estimateMinutesForKm } from './routePlannerCore';

/** До ~12 км — пішки в застосунку; далі — авто з дорожнім Directions. */
export const IN_APP_WALK_MAX_KM = 12;

/**
 * Маршрут від поточної геолокації до однієї точки (пам’ятка) для in-app навігації.
 * @param {{ latitude?: number, longitude?: number, lat?: number, lng?: number }} userPos
 * @param {object} dest
 * @param {{ transport?: 'walk'|'car'|'bike'|'bus'|'train' }} [opts]
 */
export function buildWalkPlanFromUserToPoint(userPos, dest, opts = {}) {
  if (!userPos || !dest) return null;
  const originLat = Number(userPos.latitude ?? userPos.lat);
  const originLng = Number(userPos.longitude ?? userPos.lng);
  const destLat = Number(dest.lat);
  const destLng = Number(dest.lng);
  if (
    !Number.isFinite(originLat) ||
    !Number.isFinite(originLng) ||
    !Number.isFinite(destLat) ||
    !Number.isFinite(destLng)
  ) {
    return null;
  }

  const origin = { lat: originLat, lng: originLng };
  const title = String(dest.title || '').trim() || '—';
  const stop = {
    order: 1,
    id: String(dest.id || `dest_${destLat}_${destLng}`),
    title,
    titleUk: String(dest.titleUk || title).trim() || title,
    titleEn: String(dest.titleEn || title).trim() || title,
    lat: destLat,
    lng: destLng,
    minutes: Math.max(10, Number(dest.minutes) || 15),
    thumb: dest.cover_image_url || dest.thumb || null,
  };

  const totalKm = haversineKm(origin, stop);
  const transport =
    opts.transport ||
    (Number.isFinite(totalKm) && totalKm <= IN_APP_WALK_MAX_KM ? 'walk' : 'car');
  const totalMinutes = Math.max(3, estimateMinutesForKm(totalKm, transport));
  const latSpan = Math.abs(originLat - destLat);
  const lngSpan = Math.abs(originLng - destLng);

  return {
    regionId: String(dest.regionId || 'direct'),
    regionTitleUk: 'Маршрут',
    regionTitleEn: 'Route',
    countryUk: String(dest.country || dest.city || '').trim(),
    countryEn: String(dest.country || dest.city || '').trim(),
    flag: String(dest.flag || '📍'),
    stops: [stop],
    coordinates: [
      { latitude: originLat, longitude: originLng },
      { latitude: destLat, longitude: destLng },
    ],
    totalKm,
    totalMinutes,
    transport,
    freeOnly: transport === 'walk',
    budgetTier: 'free',
    generatedFromLandmarkActions: true,
    mapRegion: {
      latitude: (originLat + destLat) / 2,
      longitude: (originLng + destLng) / 2,
      latitudeDelta: Math.max(0.035, latSpan * 2.4 + 0.02),
      longitudeDelta: Math.max(0.035, lngSpan * 2.4 + 0.02),
    },
    userOrigin: origin,
    originNearRegion: transport === 'walk' && totalKm <= IN_APP_WALK_MAX_KM,
  };
}

/** Мінімальний plan для RouteNavigation з довільних точок на карті. */
export function buildGeoMapWalkPlan(points, { distanceM, durationSec } = {}, userOrigin = null) {
  const list = Array.isArray(points) ? points.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)) : [];
  if (list.length < 2) return null;

  const anchor =
    userOrigin && Number.isFinite(userOrigin.latitude) && Number.isFinite(userOrigin.longitude)
      ? { lat: userOrigin.latitude, lng: userOrigin.longitude }
      : null;
  const ordered = anchor ? orderStopsFromUserOrigin(list, anchor) : list;

  const stops = ordered.map((p, idx) => ({
    order: idx + 1,
    id: String(p.id || `geo_${p.lat}_${p.lng}`),
    title: String(p.title || '').trim() || `Point ${idx + 1}`,
    titleUk: String(p.title || '').trim() || `Точка ${idx + 1}`,
    titleEn: String(p.title || '').trim() || `Point ${idx + 1}`,
    lat: p.lat,
    lng: p.lng,
    minutes: 12,
    thumb: p.cover_image_url || null,
  }));

  let totalKm = distanceM != null && distanceM > 0 ? distanceM / 1000 : 0;
  if (!totalKm) {
    let prev = anchor && isUserOriginNearRoute(anchor, ordered) ? anchor : null;
    for (const p of ordered) {
      if (prev) totalKm += haversineKm(prev, p);
      prev = p;
    }
  }

  const totalMinutes =
    durationSec != null && durationSec > 0
      ? Math.max(1, Math.round(durationSec / 60))
      : Math.max(5, Math.round((totalKm / 5) * 60));

  const coordinates = [];
  if (anchor && isUserOriginNearRoute(anchor, ordered)) {
    coordinates.push({ latitude: userOrigin.latitude, longitude: userOrigin.longitude });
  }
  for (const s of stops) {
    coordinates.push({ latitude: s.lat, longitude: s.lng });
  }

  const first = stops[0];

  return {
    regionId: 'kyiv',
    regionTitleUk: 'Маршрут',
    regionTitleEn: 'Route',
    countryUk: String(list[0]?.country || list[0]?.city || '').trim(),
    countryEn: String(list[0]?.country || list[0]?.city || '').trim(),
    flag: '📍',
    stops,
    coordinates,
    totalKm,
    totalMinutes,
    transport: 'walk',
    freeOnly: true,
    budgetTier: 'free',
    generatedFromGeoMap: true,
    mapRegion: {
      latitude: first.lat,
      longitude: first.lng,
      latitudeDelta: 0.12,
      longitudeDelta: 0.12,
    },
    userOrigin: anchor && isUserOriginNearRoute(anchor, ordered) ? anchor : null,
    originNearRegion: !!(anchor && isUserOriginNearRoute(anchor, ordered)),
  };
}

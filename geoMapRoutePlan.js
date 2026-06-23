import { haversineKm } from './routePlannerCore';

/** Мінімальний plan для RouteNavigation з довільних точок на карті. */
export function buildGeoMapWalkPlan(points, { distanceM, durationSec } = {}, userOrigin = null) {
  const list = Array.isArray(points) ? points.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)) : [];
  if (list.length < 2) return null;

  const stops = list.map((p, idx) => ({
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
    for (let i = 1; i < list.length; i += 1) {
      totalKm += haversineKm(list[i - 1], list[i]);
    }
  }

  const totalMinutes =
    durationSec != null && durationSec > 0
      ? Math.max(1, Math.round(durationSec / 60))
      : Math.max(5, Math.round((totalKm / 5) * 60));

  const coordinates = stops.map((s) => ({ latitude: s.lat, longitude: s.lng }));
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
    userOrigin:
      userOrigin && Number.isFinite(userOrigin.latitude) && Number.isFinite(userOrigin.longitude)
        ? { lat: userOrigin.latitude, lng: userOrigin.longitude }
        : null,
  };
}

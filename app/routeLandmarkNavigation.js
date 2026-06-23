import * as Location from 'expo-location';
import { getRegion, getLandmarkInRegion, landmarkTitle } from './routeRegionsData';
import { buildRoutePlan, buildRouteCoordinates, computeRouteTotalKm, isUserOriginNearRoute } from './routePlannerCore';
import { buildLandmarkResultParamsFromHomeLandmark } from './homeLandmarkResultParams';
import { distanceMetersFromCoords } from './landmarkProximity';
import { routeStopAssetMeta } from './routeStopThumb';

/** Маршрут із пріоритетом обраної пам’ятки + сусідні зупинки в регіоні. */
export async function buildLandmarkFocusedRoutePlan({
  regionId,
  landmarkId,
  language,
  hours = 4,
  transport = 'walk',
}) {
  const region = getRegion(regionId);
  const lm = getLandmarkInRegion(regionId, landmarkId);
  if (!region || !lm) return null;

  let userOrigin = null;
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        maximumAge: 15000,
      });
      userOrigin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    }
  } catch {
    /* optional */
  }

  const langUk = String(language || 'uk').split(/[-_]/)[0].toLowerCase() !== 'en';
  const title = landmarkTitle(lm, langUk);
  const plan = buildRoutePlan({
    regionId,
    query: title,
    hours,
    transport,
    budgetTier: 'medium',
    variant: 0,
    language,
    userOrigin,
    interests: null,
  });

  if (!plan?.stops?.length) return null;

  const hasTarget = plan.stops.some((s) => s.id === lm.id);
  if (!hasTarget) {
    const focused = {
      order: 1,
      id: lm.id,
      titleUk: lm.titleUk,
      titleEn: lm.titleEn,
      title,
      lat: lm.lat,
      lng: lm.lng,
      minutes: lm.minutes || 30,
      thumb: lm.thumb,
    };
    plan.stops = [focused, ...plan.stops.filter((s) => s.id !== lm.id)].map((s, idx) => ({
      ...s,
      order: idx + 1,
    }));
    plan.coordinates = buildRouteCoordinates(userOrigin, plan.stops);
    plan.totalKm = computeRouteTotalKm(userOrigin, plan.stops);
    plan.originNearRegion = isUserOriginNearRoute(userOrigin, plan.stops);
  }

  plan.focusedLandmarkId = lm.id;
  return plan;
}

export function buildLandmarkResultParamsForRouteStop({
  plan,
  stop,
  shell,
  distM,
  countryId,
}) {
  const visitKm = distM != null && Number.isFinite(Number(distM)) ? Number(distM) / 1000 : undefined;
  const physicalParams = {
    countAsPhysicalVisit: true,
    fromRouteNavigation: true,
    routePlanRegionId: plan.regionId,
    ...(visitKm != null ? { visitKm } : {}),
    ...(typeof stop.lat === 'number' && typeof stop.lng === 'number'
      ? { visitLat: stop.lat, visitLng: stop.lng }
      : {}),
  };

  if (plan.aiGenerated) {
    const meta = routeStopAssetMeta(stop.thumb);
    const photoUri = meta?.uri || null;
    const city =
      String(plan.regionTitleUk || '').trim() ||
      String(plan.regionTitleEn || '').trim() ||
      '';
    const c = String(stop.category || '').toLowerCase();
    const visitCategory =
      c === 'museum' ? 'museum' : c === 'park' ? 'park' : c === 'monument' || c === 'church' ? 'monument' : 'other';
    return {
      screen: 'LandmarkResult',
      params: {
        ...shell,
        startPhase: 'full',
        title: stop.title,
        headerTitle: stop.title,
        subtitle: `${plan.flag || ''} ${city}`.trim(),
        extract: '',
        source: 'geoCatalog',
        visitCity: city,
        visitCategory,
        ...physicalParams,
        ...(photoUri ? { photoUri } : {}),
      },
    };
  }

  const lm = getLandmarkInRegion(plan.regionId, stop.id);
  if (!lm) return null;
  const region = getRegion(plan.regionId);
  return {
    screen: 'LandmarkResult',
    params: {
      ...buildLandmarkResultParamsFromHomeLandmark({
        lm,
        region,
        countryId,
        language: shell.language,
        appTheme: shell.appTheme,
        user: shell.user,
      }),
      ...physicalParams,
    },
  };
}

export function distanceToStopMeters(userPos, stop) {
  if (!userPos || !stop) return null;
  return distanceMetersFromCoords(userPos.latitude, userPos.longitude, stop.lat, stop.lng);
}

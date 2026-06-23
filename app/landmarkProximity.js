import { haversineKm } from './routePlannerCore';

/** Фізичний візит / відкриття історії на маршруті — 100 м (як у макеті навігації). */
export const PHYSICAL_VISIT_RADIUS_M = 100;
export const PHYSICAL_VISIT_RADIUS_KM = PHYSICAL_VISIT_RADIUS_M / 1000;

export function distanceMetersFromCoords(userLat, userLng, targetLat, targetLng) {
  if (
    !Number.isFinite(userLat) ||
    !Number.isFinite(userLng) ||
    !Number.isFinite(targetLat) ||
    !Number.isFinite(targetLng)
  ) {
    return null;
  }
  const km = haversineKm({ lat: userLat, lng: userLng }, { lat: targetLat, lng: targetLng });
  return Math.max(0, Math.round(km * 1000));
}

export function isWithinPhysicalVisitRadiusMeters(distanceM) {
  return distanceM != null && Number.isFinite(distanceM) && distanceM <= PHYSICAL_VISIT_RADIUS_M;
}

export function isWithinPhysicalVisitRadiusKm(distanceKm) {
  return (
    distanceKm != null &&
    Number.isFinite(Number(distanceKm)) &&
    Number(distanceKm) >= 0 &&
    Number(distanceKm) <= PHYSICAL_VISIT_RADIUS_KM
  );
}

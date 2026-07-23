import { haversineKm } from './routePlannerCore';

/** Фізичний візит / XP — у радіусі 100 м від пам’ятки. */
export const PHYSICAL_VISIT_RADIUS_M = 100;
export const PHYSICAL_VISIT_RADIUS_KM = PHYSICAL_VISIT_RADIUS_M / 1000;

/** Підказка «скоро історія» з’являється з цієї відстані. */
export const HISTORY_APPROACH_RADIUS_M = 100;
/** Кнопка «Переглянути історію» активна з цієї відстані. */
export const HISTORY_UNLOCK_RADIUS_M = 50;

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

/** 50–100 м: ще підходимо, історію вже анонсуємо. */
export function isApproachingHistoryMeters(distanceM) {
  return (
    distanceM != null &&
    Number.isFinite(distanceM) &&
    distanceM > HISTORY_UNLOCK_RADIUS_M &&
    distanceM <= HISTORY_APPROACH_RADIUS_M
  );
}

/** ≤50 м: можна відкрити повну картку локації. */
export function isHistoryUnlockedMeters(distanceM) {
  return distanceM != null && Number.isFinite(distanceM) && distanceM <= HISTORY_UNLOCK_RADIUS_M;
}

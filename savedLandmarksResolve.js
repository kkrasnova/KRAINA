import { getHomeRegionsForCountry } from './homeExploreData';

/**
 * Знаходить об’єкт пам’ятки з каталогу за ключем збереження (після перезапуску / на іншому екрані).
 * @param {{ countryId: string, regionId: string, landmarkId: string }} row
 * @returns {{ lm: object, region: object } | null}
 */
export function resolveSavedLandmarkRow(row) {
  if (!row?.countryId || !row?.regionId || !row?.landmarkId) return null;
  const regions = getHomeRegionsForCountry(row.countryId);
  const region = regions.find((r) => r.id === row.regionId);
  if (!region) return null;
  const lm = (region.landmarks || []).find((l) => String(l.id) === String(row.landmarkId));
  if (!lm) return null;
  return { lm, region };
}

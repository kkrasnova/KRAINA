import AsyncStorage from '@react-native-async-storage/async-storage';
import { stableUserKey, isValidCountryId } from './countryStorage';
import { isValidHomeRegionForCountry } from './homeExploreData';

const PREFIX = '@kraina_home_city_v1:';

function storageKey(user, countryId) {
  return `${PREFIX}${stableUserKey(user)}:${countryId}`;
}

export async function getSavedHomeCityRegionId(user, countryId) {
  if (!isValidCountryId(countryId)) return null;
  try {
    const v = await AsyncStorage.getItem(storageKey(user, countryId));
    if (typeof v === 'string' && v && isValidHomeRegionForCountry(countryId, v)) return v;
  } catch (_) {}
  return null;
}

export async function saveHomeCityRegionId(user, countryId, regionId) {
  if (!isValidCountryId(countryId) || !isValidHomeRegionForCountry(countryId, regionId)) return;
  try {
    await AsyncStorage.setItem(storageKey(user, countryId), regionId);
  } catch (_) {}
}

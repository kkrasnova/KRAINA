import { useEffect, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { KRAINA_ADMIN_LOCATION_EVENT } from './adminLocationData';
import { invalidateHomeExploreCache } from './homeExploreData';

/** Bumps when admin location bundle changes so lists re-read ROUTE_REGIONS. */
export function useHomeLocationsEpoch() {
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(KRAINA_ADMIN_LOCATION_EVENT, () => {
      invalidateHomeExploreCache();
      setEpoch((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  return epoch;
}

import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuthStore } from './authStore';
import { authColors } from './theme';
import type { AuthStackParamList } from './navigation.types';
import { navigationRef } from '../navigationRef';
import { setAppTheme } from '../themeStorage';

type Props = NativeStackScreenProps<AuthStackParamList, 'PostAuthHome'>;

export default function PostAuthHomeScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);
  const loadProfileMeIfStale = useAuthStore((s) => s.loadProfileMeIfStale);
  const didNavigate = useRef(false);

  useEffect(() => {
    if (didNavigate.current) return;
    const u = user ?? useAuthStore.getState().user;
    if (!u) {
      // No user in store — go back to login
      navigation.replace('AuthMain');
      return;
    }

    (async () => {
      // Load profile to get language — non-critical, proceed even on failure
      try { await loadProfileMeIfStale(); } catch { /* ignore */ }

      if (didNavigate.current) return;

      const authUser = useAuthStore.getState().user;
      if (!authUser) {
        // Session was cleared during profile load (token expired) — go back to login
        if (!didNavigate.current) {
          didNavigate.current = true;
          navigation.replace('AuthMain');
        }
        return;
      }

      // Save session to AsyncStorage so appBootstrap recognises the user on next cold start
      try {
        const { saveSession } = await import('../db');
        await saveSession({ id: authUser.id, email: authUser.email, role: authUser.role });
      } catch { /* ignore */ }

      if (didNavigate.current) return;
      didNavigate.current = true;

      const pm = useAuthStore.getState().profileMe;
      const lang = pm?.profile?.language || 'uk';
      const sessionUser = { id: authUser.id, email: authUser.email };
      await setAppTheme('dark');

      // Check if user already picked a country (local cache first, then Firestore profile fallback
      // for users signing in on a fresh install / new device — avoids re-running onboarding).
      let countryId: string | null = null;
      try {
        const { getSavedCountryIdForUser, saveCountryForUser, isValidCountryId } = await import('../countryStorage');
        countryId = await getSavedCountryIdForUser(sessionUser);
        if (!countryId) {
          const remote = pm?.profile?.countryId;
          if (remote && isValidCountryId(remote)) {
            countryId = remote;
            await saveCountryForUser(sessionUser, remote);
          }
        }
      } catch { /* ignore */ }

      // Sync step-sync toggle and walk reminder prefs from profile → local storage.
      // Fire-and-forget: user should not wait on notification scheduling before the main screen loads.
      void (async () => {
        try {
          const remoteStepSync = pm?.profile?.stepSyncEnabled;
          if (typeof remoteStepSync === 'boolean') {
            const { getStepSyncEnabled, applyStepSyncEnabledLocal } = await import('../stepSyncStorage');
            const local = await getStepSyncEnabled();
            if (local !== remoteStepSync) await applyStepSyncEnabledLocal(remoteStepSync);
          }
        } catch { /* ignore */ }
        try {
          const remoteWalk = pm?.profile?.walkReminder;
          if (remoteWalk && typeof remoteWalk === 'object') {
            const { applyWalkReminderPrefsLocal } = await import('../walkReminderStorage');
            const merged = await applyWalkReminderPrefsLocal(remoteWalk);
            if (merged?.enabled) {
              // Reschedule local notification on this device (OS schedule id is device-scoped).
              const { resyncWalkReminderOnAppColdStart } = require('../walkReminderSync');
              await resyncWalkReminderOnAppColdStart();
            }
          }
        } catch { /* ignore */ }
      })();

      // Wait for navigation to be ready (up to 3s)
      for (let i = 0; i < 30 && !navigationRef.isReady(); i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!navigationRef.isReady()) return;

      if (!countryId) {
        navigationRef.reset({
          index: 0,
          routes: [{ name: 'SelectCountry', params: { user: sessionUser, language: lang, appTheme: 'dark' } }],
        });
      } else {
        navigationRef.reset({
          index: 0,
          routes: [
            {
              name: 'HomeTabPager',
              params: {
                user: sessionUser,
                language: lang,
                countryId,
                appTheme: 'dark',
                tabIndex: 0,
                routeFinderExtras: {},
              },
            },
          ],
        });
      }
    })();
  }, [user, loadProfileMeIfStale, navigation]);

  return (
    <View style={{ flex: 1, backgroundColor: authColors.bg, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color={authColors.accent} />
    </View>
  );
}

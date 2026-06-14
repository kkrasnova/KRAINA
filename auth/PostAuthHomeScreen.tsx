import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuthStore } from './authStore';
import { authColors } from './theme';
import type { AuthStackParamList } from './navigation.types';
import { navigationRef } from '../navigationRef';

type Props = NativeStackScreenProps<AuthStackParamList, 'PostAuthHome'>;

export default function PostAuthHomeScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);
  const loadProfileMe = useAuthStore((s) => s.loadProfileMe);
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
      try { await loadProfileMe(); } catch { /* ignore */ }

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

      // Check if user already picked a country
      let countryId: string | null = null;
      try {
        const { getSavedCountryIdForUser } = await import('../countryStorage');
        countryId = await getSavedCountryIdForUser(sessionUser);
      } catch { /* ignore */ }

      // Wait for navigation to be ready (up to 3s)
      for (let i = 0; i < 30 && !navigationRef.isReady(); i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!navigationRef.isReady()) return;

      if (!countryId) {
        navigationRef.reset({
          index: 0,
          routes: [{ name: 'SelectCountry', params: { user: sessionUser, language: lang } }],
        });
      } else {
        navigationRef.reset({
          index: 0,
          routes: [
            {
              name: 'HomeTabPager',
              params: { user: sessionUser, language: lang, countryId, tabIndex: 0, routeFinderExtras: {} },
            },
          ],
        });
      }
    })();
  }, [user, loadProfileMe, navigation]);

  return (
    <View style={{ flex: 1, backgroundColor: authColors.bg, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color={authColors.accent} />
    </View>
  );
}

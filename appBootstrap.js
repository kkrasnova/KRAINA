import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from './auth/authStore';
import { clearSession, getSession, saveSession } from './db';
import { loadAdminLocationBundleOnStartup } from './adminLocationData';
import { getSavedCountryIdForUser, saveCountryForUser } from './countryStorage';
import { HOME_COUNTRY_ORDER } from './homeExploreData';
import { isAppAdminUser } from './adminGate';
import { getSubscriptionState } from './subscriptionStorage';
import { initOfflineRuntime } from './offline/runtime';
import { prepareOfflineMediaPack } from './offline/mediaOfflinePack';
import { warmOfflineMediaCache } from './offline/localCacheStore';
import { shouldSkipOnboardingIntroOnColdStart } from './onboardingStorage';

/**
 * Сесія, маршрут після заставки та префетч асетів (спільно для звичайного старту і після force-update).
 *
 * @param {{ getCancelled: () => boolean }} opts
 * @param {{
 *   setMainPageInitialParams: (v: unknown) => void;
 *   setFirstPageNextRoute: (v: string | null) => void;
 *   setFirstPageNextParams: (v: unknown) => void;
 *   setSavedLanguage: (v: string | null) => void;
 * }} api
 */
export async function runAppBootstrap(opts, api) {
  const { getCancelled } = opts;
  const {
    setMainPageInitialParams,
    setFirstPageNextRoute,
    setFirstPageNextParams,
    setSavedLanguage,
  } = api;

  try {
    await initOfflineRuntime();
    await warmOfflineMediaCache();
    await useAuthStore.getState().hydrate();
    await loadAdminLocationBundleOnStartup();
    if (getCancelled()) return;
    let session = await getSession();
    const hasAccessToken = !!useAuthStore.getState().accessToken;
    if (session?.user && !hasAccessToken) {
      // Never trust stale local session without backend auth token.
      await clearSession();
      session = null;
    }
    const language = await AsyncStorage.getItem('@kraina_app_language');
    if (getCancelled()) return;
    if (session?.user && hasAccessToken) {
      try {
        await useAuthStore.getState().loadProfileMe();
        const pm = useAuthStore.getState().profileMe?.profile;
        const authUser = useAuthStore.getState().user;
        const uid = authUser?.id || pm?.user_id;
        if (uid && String(session.user.id) !== String(uid)) {
          await saveSession({
            ...session.user,
            id: uid,
            email: authUser?.email || session.user.email,
          });
          session = await getSession();
        }
      } catch {
        // Token/session mismatch or expired auth: force a clean login.
        await useAuthStore.getState().clearLocalSession();
        await clearSession();
        session = null;
      }
    }
    if (getCancelled()) return;
    if (session?.user) {
      let countryId = await getSavedCountryIdForUser(session.user);
      if (!countryId && isAppAdminUser(session.user) && HOME_COUNTRY_ORDER[0]) {
        countryId = HOME_COUNTRY_ORDER[0];
        await saveCountryForUser(session.user, countryId);
      }
      let langForMain = 'en';
      const stored = language && typeof language === 'string' ? language : null;
      const fromAccount = session.user.appLanguage;
      const raw = stored || fromAccount;
      if (raw && typeof raw === 'string') {
        const base = raw.split(/[-_]/)[0].toLowerCase();
        langForMain = base === 'ru' ? 'uk' : base;
      }
      if (!stored && fromAccount && typeof fromAccount === 'string') {
        AsyncStorage.setItem('@kraina_app_language', fromAccount).catch(() => {});
      }
      const baseParams = {
        user: session.user,
        language: langForMain,
        ...(countryId ? { countryId } : {}),
      };
      setMainPageInitialParams(baseParams);
      if (!countryId) {
        setFirstPageNextRoute('SelectCountry');
        setFirstPageNextParams({ user: session.user, language: langForMain });
      } else {
        const sub = await getSubscriptionState(session.user);
        if (getCancelled()) return;
        if (sub.needsPlanChoice) {
          setFirstPageNextRoute('ChoosePlan');
          setFirstPageNextParams(baseParams);
        } else {
          setFirstPageNextRoute('HomeTabPager');
          setFirstPageNextParams({ ...baseParams, tabIndex: 0, routeFinderExtras: {} });
        }
      }
    } else {
      setMainPageInitialParams(null);
      const skipIntro = await shouldSkipOnboardingIntroOnColdStart();
      if (skipIntro) {
        setFirstPageNextRoute('BackendAuth');
        setFirstPageNextParams(null);
      } else {
        let langForSelect = 'en';
        if (language && typeof language === 'string') {
          const base = language.split(/[-_]/)[0].toLowerCase();
          langForSelect = base === 'ru' ? 'uk' : base;
        }
        setFirstPageNextRoute('SecondPage');
        setFirstPageNextParams({ language: langForSelect });
      }
    }
    if (language && typeof language === 'string') {
      const base = language.split(/[-_]/)[0].toLowerCase();
      setSavedLanguage(base === 'ru' ? 'uk' : language);
      if (base === 'ru') {
        AsyncStorage.setItem('@kraina_app_language', 'uk').catch(() => {});
      }
    }
  } catch {
    if (!getCancelled()) {
      setMainPageInitialParams(null);
      setFirstPageNextRoute('SecondPage');
      setFirstPageNextParams(null);
    }
  }

  if (getCancelled()) return;
  void prepareOfflineMediaPack({ limit: 120 });

}

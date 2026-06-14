import { Asset } from 'expo-asset';
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
    // Паралельно: offline runtime + hydrate + admin bundle + session
    // Офлайн-кеш та адмін-бандл — не блокують навігацію (дефернуті)
    await useAuthStore.getState().hydrate();
    if (getCancelled()) return;
    let session = await getSession();
    const hasAccessToken = !!useAuthStore.getState().accessToken;

    // Дефернуті операції: не блокують навігацію
    void initOfflineRuntime().catch(() => {});
    void warmOfflineMediaCache().catch(() => {});
    void loadAdminLocationBundleOnStartup().catch(() => {});
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
          // Cached session belongs to a different account than the current token.
          // Discard stale fields (name, avatar, etc.) — keep only the new identity
          // so the UI doesn't flash the previous user on cold start.
          await saveSession({
            id: uid,
            email: authUser?.email || pm?.email || '',
            name: pm?.display_name || pm?.username || (authUser?.email ? String(authUser.email).split('@')[0] : 'User'),
            role: authUser?.role || 'user',
            status: authUser?.status || 'active',
            provider: session.user.provider || 'email',
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
      let langForSelect = 'en';
      if (language && typeof language === 'string') {
        const base = language.split(/[-_]/)[0].toLowerCase();
        langForSelect = base === 'ru' ? 'uk' : base;
      }
      setFirstPageNextRoute('SecondPage');
      setFirstPageNextParams({ language: langForSelect, firstLaunchOnboarding: true });
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
      setFirstPageNextParams({ firstLaunchOnboarding: true });
    }
  }

  if (getCancelled()) return;
  // Фонові prefetch-операції — не блокують навігацію
  scheduleDeferredWork(() => {
    void prepareOfflineMediaPack({ limit: 120 }).catch(() => {});
    void Asset.loadAsync([
      require('./assets/kraina-logo-dark.png'),
      require('./assets/kraina-logo-light.png'),
      require('./assets/122.png'),
      require('./assets/15.png'),
      require('./assets/11221.png'),
      require('./assets/Frame 1.png'),
      require('./assets/16.png'),
      require('./assets/kraina-title-light.png'),
      require('./assets/Zoom Glass - Copy - Copy-Zoom 2-@720x-3.mp4'),
      require('./assets/icon_frame1.png'),
      require('./assets/person-12.png'),
      require('./assets/55.png'),
      require('./assets/Снимок экрана 2026-04-05 в 15.59.46.png'),
      require('./assets/Rectangle 37.png'),
      require('./assets/Снимок экрана 2026-04-05 в 15.52.15.png'),
      require('./assets/Снимок экрана 2026-04-05 в 15.55.36.png'),
      require('./assets/kling_20260405_IMAGE____________5495_1.png'),
      require('./assets/Frame 23.png'),
      require('./assets/11.png'),
    ]).catch(() => {});
  });
}

/**
 * Виконує роботу після того, як JS-потік звільниться (після першого рендера та навігації).
 */
function scheduleDeferredWork(fn) {
  if (typeof globalThis.requestIdleCallback === 'function') {
    globalThis.requestIdleCallback(() => { fn(); }, { timeout: 3000 });
  } else {
    setTimeout(fn, 50);
  }
}

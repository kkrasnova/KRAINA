import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from './auth/authStore';
import { clearSession, getSession } from './db';
import { loadAdminLocationBundleOnStartup } from './adminLocationData';
import { getSavedCountryIdForUser, saveCountryForUser } from './countryStorage';
import { HOME_COUNTRY_ORDER } from './homeExploreData';
import { isAppAdminUser } from './adminGate';
import { getSubscriptionState } from './subscriptionStorage';
import { initOfflineRuntime } from './offline/runtime';
import { prepareOfflineMediaPack } from './offline/mediaOfflinePack';
import { warmOfflineMediaCache } from './offline/localCacheStore';
import { clearMemoryCaches } from './cacheCleanup';
import { getHasUsedAppBefore } from './onboardingStorage';
import { markStart, markEnd } from './performanceMetrics';
import { prefetchChatsBundle } from './screenLoaders';
import { setupCallKeep } from './callkeepService';
import { installVoIPListeners } from './voipPushService';
import { ensureBackendSession } from './syncBackendSessionBridge';

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

  markStart('app_bootstrap');

  try {
    // Очищуємо in-memory TTL кеш при холодному старті
    clearMemoryCaches();

    // Паралельно: offline runtime + hydrate + admin bundle + session
    // Офлайн-кеш та адмін-бандл — не блокують навігацію (дефернуті)
    await useAuthStore.getState().hydrate();
    if (getCancelled()) return;
    let session = await getSession();
    let hasAccessToken = !!useAuthStore.getState().accessToken;

    // Дефернуті операції: не блокують навігацію
    void initOfflineRuntime().catch(() => {});
    void warmOfflineMediaCache().catch(() => {});
    void loadAdminLocationBundleOnStartup().catch(() => {});
    if (session?.user && !hasAccessToken) {
      const refreshed = await useAuthStore.getState().refreshSession();
      if (refreshed) {
        hasAccessToken = !!useAuthStore.getState().accessToken;
      } else {
        await ensureBackendSession(session.user);
        hasAccessToken = !!useAuthStore.getState().accessToken;
      }
      // Локальна сесія без JWT (офлайн / legacy) — не скидаємо; користувач лишається в акаунті.
    }
    const language = await AsyncStorage.getItem('@kraina_app_language');
    if (getCancelled()) return;
    if (session?.user && hasAccessToken) {
      // loadProfileMe() is deferred to after navigation — hydrate() already built
      // profileMe from local session data, which is sufficient for route selection.
      // The full profile fetch was blocking cold start by ~4s (network request).
      // It will fire in the background after navigation completes.
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
      const hasUsedBefore = await getHasUsedAppBefore();
      if (getCancelled()) return;
      if (hasUsedBefore) {
        setFirstPageNextRoute('ThirdPage');
        setFirstPageNextParams({ language: langForSelect });
      } else {
        setFirstPageNextRoute('SecondPage');
        setFirstPageNextParams({ language: langForSelect, firstLaunchOnboarding: true });
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
      let langForSelect = 'en';
      try {
        const language = await AsyncStorage.getItem('@kraina_app_language');
        if (language && typeof language === 'string') {
          const base = language.split(/[-_]/)[0].toLowerCase();
          langForSelect = base === 'ru' ? 'uk' : base;
        }
      } catch {
        /* ignore */
      }
      const hasUsedBefore = await getHasUsedAppBefore().catch(() => false);
      if (hasUsedBefore) {
        setFirstPageNextRoute('ThirdPage');
        setFirstPageNextParams({ language: langForSelect });
      } else {
        setFirstPageNextRoute('SecondPage');
        setFirstPageNextParams({ language: langForSelect, firstLaunchOnboarding: true });
      }
    }
  }

  if (getCancelled()) return;

  markEnd('app_bootstrap');

  // Фонові prefetch-операції — не блокують навігацію
  scheduleDeferredWork(() => {
    prefetchChatsBundle();
    void prepareOfflineMediaPack({ limit: 120 }).catch(() => {});
  });

  // CallKit + VoIP push — ініціалізація
  scheduleDeferredWork(() => {
    setupCallKeep();
    installVoIPListeners();
  });

  // Профіль з бекенду — теж не блокусмо навігацію.
  // hydrate() уже побудував profileMe з локальної сесії.
  scheduleDeferredWork(() => {
    markStart('profile_load');
    void useAuthStore.getState()
      .loadProfileMe()
      .catch(() => {})
      .finally(() => {
        markEnd('profile_load');
      });
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

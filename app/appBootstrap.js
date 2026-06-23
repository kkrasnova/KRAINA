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
import { runChatMigrations } from './chatService';
import { markStart, markEnd } from './performanceMetrics';
import { prefetchArchiveBundle, prefetchChatsBundle, prefetchDiscoverBundle, prefetchFeedBundle, prefetchProfileBundle } from './screenLoaders';
import { setupCallKeep } from './callkeepService';
import { installVoIPListeners } from './voipPushService';
import { ensureBackendSession } from './syncBackendSessionBridge';
import { connectChatWebSocket } from './chatRealtime';
import { isBackendJwt } from './backendAuthApi';
import { warmChatsInboxCache, warmMutualsCache } from './chatsDataPrefetch';
import { hydrateChatsCachesFromDisk, seedChatsCachesIfMissing } from './chatsThreadsCache';
import { getAppTheme } from './themeStorage';
import { socialWarmupSearchCache } from './socialApi';
import { prewarmBackend, startBackendKeepWarm } from './backendWarmup';

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

  // ⚡ Будимо Render якнайраніше (поки видно заставку) + тримаємо теплим, поки застосунок
  // відкритий — щоб натискання після першого відкривались швидко, а не чекали cold start.
  prewarmBackend();
  startBackendKeepWarm();

  try {
    // Run AsyncStorage-level migrations (e.g. clean up old demo threads)
    void runChatMigrations().catch(() => {});

    // Очищуємо in-memory TTL кеш при холодному старті
    clearMemoryCaches();

    // hydrate + локальна сесія паралельно — не чекаємо мережу для вибору маршруту
    const [, session] = await Promise.all([
      useAuthStore.getState().hydrate(),
      getSession(),
    ]);
    if (getCancelled()) return;

    // Дефернуті операції: не блокують навігацію
    void initOfflineRuntime().catch(() => {});
    void warmOfflineMediaCache().catch(() => {});
    void loadAdminLocationBundleOnStartup().catch(() => {});
    void socialWarmupSearchCache().catch(() => {}); // ⚡ Префетч профілів для швидкого пошуку

    // JWT-відновлення (до 7 с ретраїв) — у фоні; маршрут будується з локальної сесії
    if (session?.user) {
      const localUser = session.user;
      const prefetchLang = String(localUser.appLanguage || 'uk').split(/[-_]/)[0].toLowerCase();
      const prefetchLangUk = prefetchLang === 'uk';
      seedChatsCachesIfMissing(localUser, prefetchLangUk);
      void hydrateChatsCachesFromDisk(localUser, prefetchLangUk).catch(() => {});

      const wsAuthState = useAuthStore.getState();
      if (isBackendJwt(wsAuthState.accessToken) && wsAuthState.user?.id) {
        void connectChatWebSocket(String(wsAuthState.user.id)).catch(() => {});
        void warmChatsInboxCache(localUser, prefetchLangUk).catch(() => {});
        void warmMutualsCache(localUser).catch(() => {});
      }

      void (async () => {
        await ensureBackendSession(localUser);
        const authAfter = useAuthStore.getState();
        if (isBackendJwt(authAfter.accessToken) && authAfter.user?.id) {
          void connectChatWebSocket(String(authAfter.user.id)).catch(() => {});
          void warmChatsInboxCache(localUser, prefetchLangUk).catch(() => {});
          void warmMutualsCache(localUser).catch(() => {});
        }
      })();
    }

    if (getCancelled()) return;
    if (session?.user) {
      const [language, countryIdRaw, theme, sub] = await Promise.all([
        AsyncStorage.getItem('@kraina_app_language'),
        getSavedCountryIdForUser(session.user),
        getAppTheme(),
        getSubscriptionState(session.user),
      ]);
      if (getCancelled()) return;

      let countryId = countryIdRaw;
      if (!countryId && isAppAdminUser(session.user) && HOME_COUNTRY_ORDER[0]) {
        countryId = HOME_COUNTRY_ORDER[0];
        void saveCountryForUser(session.user, countryId).catch(() => {});
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
        appTheme: theme,
        ...(countryId ? { countryId } : {}),
      };
      setMainPageInitialParams(baseParams);
      if (sub.needsPlanChoice) {
        setFirstPageNextRoute('ChoosePlan');
        setFirstPageNextParams(baseParams);
      } else {
        setFirstPageNextRoute('HomeTabPager');
        setFirstPageNextParams({ ...baseParams, tabIndex: 0, routeFinderExtras: {} });
      }
      if (language && typeof language === 'string') {
        const base = language.split(/[-_]/)[0].toLowerCase();
        setSavedLanguage(base === 'ru' ? 'uk' : language);
        if (base === 'ru') {
          AsyncStorage.setItem('@kraina_app_language', 'uk').catch(() => {});
        }
      }
    } else {
      setMainPageInitialParams(null);
      const [language, hasUsedBefore] = await Promise.all([
        AsyncStorage.getItem('@kraina_app_language'),
        getHasUsedAppBefore(),
      ]);
      if (getCancelled()) return;
      let langForSelect = 'en';
      if (language && typeof language === 'string') {
        const base = language.split(/[-_]/)[0].toLowerCase();
        langForSelect = base === 'ru' ? 'uk' : base;
      }
      if (hasUsedBefore) {
        setFirstPageNextRoute('ThirdPage');
        setFirstPageNextParams({ language: langForSelect });
      } else {
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

  // Фонові prefetch-операції запускаються порціями, щоб не забивати JS-потік після навігації.
  scheduleDeferredWork(prefetchChatsBundle, 250);
  scheduleDeferredWork(() => {
    try {
      const { prefetchLandmarkBundle } = require('./screenLoaders');
      prefetchLandmarkBundle();
    } catch {
      /* optional */
    }
  }, 400);
  scheduleDeferredWork(prefetchArchiveBundle, 650);
  scheduleDeferredWork(prefetchDiscoverBundle, 950);
  scheduleDeferredWork(() => {
    const sessionUser = useAuthStore.getState().user;
    if (sessionUser) prefetchFeedBundle(sessionUser);
  }, 1250);
  scheduleDeferredWork(() => {
    const sessionUser = useAuthStore.getState().user;
    if (sessionUser) prefetchProfileBundle(sessionUser);
  }, 1550);
  scheduleDeferredWork(() => {
    void prepareOfflineMediaPack({ limit: 60 }).catch(() => {});
  }, 2200);

  // CallKit + VoIP push — ініціалізація
  scheduleDeferredWork(() => {
    setupCallKeep();
    installVoIPListeners();
  }, 1800);

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
  }, 500);
}

/**
 * Виконує роботу після того, як JS-потік звільниться (після першого рендера та навігації).
 */
function scheduleDeferredWork(fn, delayMs = 50) {
  setTimeout(() => {
    if (typeof globalThis.requestIdleCallback === 'function') {
      globalThis.requestIdleCallback(() => { fn(); }, { timeout: 3000 });
    } else {
      fn();
    }
  }, delayMs);
}

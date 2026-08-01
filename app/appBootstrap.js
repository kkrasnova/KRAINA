import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from './auth/authStore';
import { getSession, saveSession } from './db';
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
import { getSignedInUser, markSignedIn } from './signedInStorage';
import { runChatMigrations } from './chatService';
import { markStart, markEnd } from './performanceMetrics';
import { prefetchArchiveBundle, prefetchChatsBundle, prefetchDiscoverBundle, prefetchFeedBundle, prefetchProfileBundle } from './screenLoaders';
import { setupCallKeep } from './callkeepService';
import { installVoIPListeners } from './voipPushService';
import { ensureBackendSession, mergeBackendUserIntoLocalSession } from './syncBackendSessionBridge';
import { retryAllUnsyncedLocalFeedPosts } from './feedPostSyncBridge';
import { connectChatWebSocket } from './chatRealtime';
import { isBackendJwt } from './backendAuthApi';
import { warmChatsInboxCache, warmMutualsCache } from './chatsDataPrefetch';
import { hydrateChatsCachesFromDisk, seedChatsCachesIfMissing } from './chatsThreadsCache';
import { getAppTheme } from './themeStorage';
import { socialWarmupSearchCache } from './socialApi';
import { prewarmBackend, startBackendKeepWarm } from './backendWarmup';
import { clearExplicitLogout, isExplicitLogout } from './authSecureStorage';

function normalizeLang(raw, fallback = 'en') {
  if (!raw || typeof raw !== 'string') return fallback;
  const base = raw.split(/[-_]/)[0].toLowerCase();
  return base === 'ru' ? 'uk' : base;
}

function markedToUser(marked) {
  if (!marked?.id && !marked?.email) return null;
  return {
    id: String(marked.id || marked.email),
    email: String(marked.email || ''),
    role: marked.role || 'user',
    ...(marked.name ? { name: marked.name } : {}),
    ...(marked.provider ? { provider: marked.provider } : {}),
  };
}

/**
 * Вхід/реєстрація — ЛИШЕ після явного виходу з акаунту.
 * Якщо є сесія / signed-in мітка / JWT user — завжди Home (або ChoosePlan).
 */
async function resolveLoggedInUser() {
  // Спочатку сесія з диска — якщо є, знімаємо застарілий «logout» ДО hydrate,
  // щоб hydrate не витер JWT.
  const sessionBefore = await getSession().catch(() => null);
  const markedBefore = await getSignedInUser().catch(() => null);
  if (sessionBefore?.user || markedBefore) {
    await clearExplicitLogout();
  }

  await useAuthStore.getState().hydrate();
  const session = await getSession();
  const marked = await getSignedInUser().catch(() => null);
  const authUser = useAuthStore.getState().user;

  const user =
    session?.user ||
    authUser ||
    markedToUser(marked) ||
    sessionBefore?.user ||
    markedToUser(markedBefore) ||
    null;

  if (user) {
    await clearExplicitLogout();
    return user;
  }

  return null;
}

async function routeToHome(api, user, languageHint) {
  const { setMainPageInitialParams, setFirstPageNextRoute, setFirstPageNextParams, setSavedLanguage } = api;
  try {
    await markSignedIn(user);
  } catch {
    /* ignore */
  }
  try {
    await saveSession(user);
  } catch {
    /* ignore */
  }
  try {
    await mergeBackendUserIntoLocalSession();
  } catch {
    /* ignore */
  }

  let language = languageHint;
  let countryId = null;
  let theme = 'light';
  let sub = { needsPlanChoice: false };
  try {
    const [langStored, countryIdRaw, themeStored, subState] = await Promise.all([
      AsyncStorage.getItem('@kraina_app_language'),
      getSavedCountryIdForUser(user).catch(() => null),
      getAppTheme().catch(() => 'light'),
      getSubscriptionState(user).catch(() => ({ needsPlanChoice: false })),
    ]);
    language = normalizeLang(langStored || user.appLanguage || languageHint || 'uk');
    countryId = countryIdRaw;
    theme = themeStored === 'dark' ? 'dark' : 'light';
    sub = subState || sub;
  } catch {
    language = normalizeLang(user.appLanguage || languageHint || 'uk');
  }

  if (!countryId && isAppAdminUser(user) && HOME_COUNTRY_ORDER[0]) {
    countryId = HOME_COUNTRY_ORDER[0];
    void saveCountryForUser(user, countryId).catch(() => {});
  }

  const baseParams = {
    user,
    language,
    appTheme: theme,
    ...(countryId ? { countryId } : {}),
  };
  setMainPageInitialParams(baseParams);
  if (sub?.needsPlanChoice) {
    setFirstPageNextRoute('ChoosePlan');
    setFirstPageNextParams(baseParams);
  } else {
    setFirstPageNextRoute('HomeTabPager');
    setFirstPageNextParams({ ...baseParams, tabIndex: 0, routeFinderExtras: {} });
  }
  setSavedLanguage(language);
  if (language === 'uk') {
    AsyncStorage.setItem('@kraina_app_language', 'uk').catch(() => {});
  }
}

async function routeToAuth(api, { firstLaunch }) {
  const { setMainPageInitialParams, setFirstPageNextRoute, setFirstPageNextParams, setSavedLanguage } = api;
  setMainPageInitialParams(null);
  let lang = 'en';
  try {
    const language = await AsyncStorage.getItem('@kraina_app_language');
    lang = normalizeLang(language, 'en');
  } catch {
    /* ignore */
  }
  setSavedLanguage(lang);
  if (firstLaunch) {
    setFirstPageNextRoute('SecondPage');
    setFirstPageNextParams({ language: lang, firstLaunchOnboarding: true });
  } else {
    setFirstPageNextRoute('ThirdPage');
    setFirstPageNextParams({ language: lang });
  }
}

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

  markStart('app_bootstrap');
  prewarmBackend();
  startBackendKeepWarm();

  let userForBootstrap = null;

  try {
    void runChatMigrations().catch(() => {});
    clearMemoryCaches();

    userForBootstrap = await resolveLoggedInUser();
    if (getCancelled()) return;

    // Тихе відновлення JWT у фоні — НЕ блокує і НЕ відправляє на логін при збої.
    if (!userForBootstrap) {
      const loggedOut = await isExplicitLogout().catch(() => false);
      const hasUsedBefore = await getHasUsedAppBefore().catch(() => false);
      const marked = await getSignedInUser().catch(() => null);
      if (!loggedOut && (hasUsedBefore || marked)) {
        try {
          await clearExplicitLogout();
          const stub = markedToUser(marked) || { id: 'recovery', email: '', provider: 'email' };
          await Promise.race([
            ensureBackendSession(stub),
            new Promise((r) => setTimeout(r, 2500)),
          ]);
          const session = await getSession();
          userForBootstrap =
            session?.user || useAuthStore.getState().user || markedToUser(marked) || null;
        } catch {
          userForBootstrap = markedToUser(marked);
        }
      }
    }

    if (getCancelled()) return;

    if (userForBootstrap) {
      void markSignedIn(userForBootstrap).catch(() => {});
      try {
        const prefetchLang = String(userForBootstrap.appLanguage || 'uk').split(/[-_]/)[0].toLowerCase();
        const prefetchLangUk = prefetchLang === 'uk';
        try {
          seedChatsCachesIfMissing(userForBootstrap, prefetchLangUk);
        } catch {
          /* ignore */
        }
        void hydrateChatsCachesFromDisk(userForBootstrap, prefetchLangUk).catch(() => {});
        const wsAuthState = useAuthStore.getState();
        if (isBackendJwt(wsAuthState.accessToken) && wsAuthState.user?.id) {
          void connectChatWebSocket(String(wsAuthState.user.id)).catch(() => {});
          void warmChatsInboxCache(userForBootstrap, prefetchLangUk).catch(() => {});
          void warmMutualsCache(userForBootstrap).catch(() => {});
        }
        void (async () => {
          await ensureBackendSession(userForBootstrap);
          const authAfter = useAuthStore.getState();
          if (isBackendJwt(authAfter.accessToken) && authAfter.user?.id) {
            void connectChatWebSocket(String(authAfter.user.id)).catch(() => {});
            void warmChatsInboxCache(userForBootstrap, prefetchLangUk).catch(() => {});
            void warmMutualsCache(userForBootstrap).catch(() => {});
            void retryAllUnsyncedLocalFeedPosts(userForBootstrap).catch(() => {});
          }
        })();
      } catch {
        /* не блокуємо home */
      }

      await routeToHome(api, userForBootstrap);
      if (__DEV__) {
        console.log('[bootstrap] → HomeTabPager', userForBootstrap?.email || userForBootstrap?.id);
      }
    } else {
      const loggedOut = await isExplicitLogout().catch(() => false);
      const hasUsedBefore = await getHasUsedAppBefore().catch(() => false);
      // Вхід лише якщо явний вихід АБО справді перший запуск без будь-якої мітки.
      if (loggedOut || !hasUsedBefore) {
        await routeToAuth(api, { firstLaunch: !loggedOut && !hasUsedBefore });
        if (__DEV__) {
          console.log('[bootstrap] → auth', { loggedOut, hasUsedBefore });
        }
      } else {
        // hasUsedBefore, не logout, але user зник — все одно не просимо логін: stub home.
        const marked = await getSignedInUser().catch(() => null);
        const stub =
          markedToUser(marked) || {
            id: 'local_returning',
            email: '',
            role: 'user',
          };
        await routeToHome(api, stub);
        if (__DEV__) {
          console.log('[bootstrap] → Home (returning stub)');
        }
      }
    }

    void initOfflineRuntime().catch(() => {});
    void warmOfflineMediaCache().catch(() => {});
    void loadAdminLocationBundleOnStartup().catch(() => {});
    void socialWarmupSearchCache().catch(() => {});
  } catch (e) {
    if (__DEV__) console.warn('[bootstrap] error', e?.message || e);
    if (!getCancelled()) {
      // Навіть у catch: якщо сесія є — HOME, не логін.
      try {
        const session = await getSession();
        const marked = await getSignedInUser().catch(() => null);
        const user =
          session?.user || useAuthStore.getState().user || markedToUser(marked) || userForBootstrap;
        if (user) {
          await routeToHome(api, user);
        } else {
          const loggedOut = await isExplicitLogout().catch(() => false);
          const hasUsedBefore = await getHasUsedAppBefore().catch(() => false);
          await routeToAuth(api, { firstLaunch: !loggedOut && !hasUsedBefore });
        }
      } catch {
        await routeToAuth(api, { firstLaunch: true });
      }
    }
  }

  if (getCancelled()) return;

  markEnd('app_bootstrap');

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

  scheduleDeferredWork(() => {
    setupCallKeep();
    installVoIPListeners();
  }, 1800);

  scheduleDeferredWork(() => {
    markStart('profile_load');
    void useAuthStore
      .getState()
      .loadProfileMe()
      .catch(() => {})
      .finally(() => {
        markEnd('profile_load');
      });
  }, 500);
}

function scheduleDeferredWork(fn, delayMs = 50) {
  setTimeout(() => {
    if (typeof globalThis.requestIdleCallback === 'function') {
      globalThis.requestIdleCallback(() => {
        fn();
      }, { timeout: 3000 });
    } else {
      fn();
    }
  }, delayMs);
}

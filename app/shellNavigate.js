import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { StackActions } from '@react-navigation/native';
import { navigationRef, subscribeNavState } from './navigationRef';
import { appLangBase } from './appLang';
import { KRAINA_APP_LANGUAGE_CHANGED } from './appLanguageEvents';

const APP_LANGUAGE_STORAGE_KEY = '@kraina_app_language';

let cachedAppLanguage = null;
let cachedShellParams = {};

function normalizeLang(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const base = raw.split(/[-_]/)[0].toLowerCase();
  return base === 'ru' ? 'uk' : base;
}

(async () => {
  try {
    const raw = await AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
    const n = normalizeLang(raw);
    if (n) cachedAppLanguage = n;
  } catch (_) {
    /* ignore */
  }
})();

DeviceEventEmitter.addListener(KRAINA_APP_LANGUAGE_CHANGED, (v) => {
  const n = normalizeLang(v);
  if (n) cachedAppLanguage = n;
});

function walkRoutes(state, visitor) {
  if (!state?.routes) return;
  for (const r of state.routes) {
    visitor(r);
    if (r.state) walkRoutes(r.state, visitor);
  }
}

function rebuildShellParamsCache() {
  if (!navigationRef.isReady()) return;
  const merged = {};
  walkRoutes(navigationRef.getRootState(), (r) => {
    const p = r.params;
    if (p && typeof p === 'object') {
      if (p.user) merged.user = p.user;
      if (p.language) merged.language = p.language;
      if (p.countryId != null) merged.countryId = p.countryId;
      if (p.appTheme) merged.appTheme = p.appTheme;
    }
  });
  cachedShellParams = merged;
}

subscribeNavState(rebuildShellParamsCache);

function getShellParams() {
  if (!cachedShellParams.user && navigationRef.isReady()) {
    rebuildShellParamsCache();
  }
  return cachedShellParams;
}

function buildShellParams(extra = {}, themeOverride) {
  const shell = getShellParams();
  const lang = appLangBase(cachedAppLanguage || shell.language || 'uk');
  const theme =
    themeOverride === 'light' || themeOverride === 'dark'
      ? themeOverride
      : shell.appTheme === 'light' || shell.appTheme === 'dark'
        ? shell.appTheme
        : 'dark';
  return {
    user: shell.user,
    language: lang,
    ...(shell.countryId != null ? { countryId: shell.countryId } : {}),
    appTheme: theme,
    ...extra,
  };
}

function refreshLanguageCacheBestEffort() {
  if (cachedAppLanguage == null) {
    AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY)
      .then((raw) => {
        const n = normalizeLang(raw);
        if (n) cachedAppLanguage = n;
      })
      .catch(() => {});
  }
}

export function shellNavigate(name, extra = {}, themeOverride) {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate(name, buildShellParams(extra, themeOverride));
  refreshLanguageCacheBestEffort();
}

export function shellPush(name, extra = {}, themeOverride) {
  if (!navigationRef.isReady()) return;
  navigationRef.dispatch(StackActions.push(name, buildShellParams(extra, themeOverride)));
  refreshLanguageCacheBestEffort();
}

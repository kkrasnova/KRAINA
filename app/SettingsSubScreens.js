import { resolveAppTheme } from './themeStorage';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Platform,
  Linking,
  Alert,
  Share,
  AppState,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, CommonActions } from '@react-navigation/native';
import * as Location from 'expo-location';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { useAppTheme } from './useAppTheme';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';
import { st } from './settingsI18n';
import { APP_LANGUAGE_OPTIONS } from './appLanguageOptions';
import { setAppLanguagePreference, getSession } from './db';
import { emitAppLanguageChanged } from './appLanguageEvents';
import { useAuthStore } from './auth/authStore';
import { patchProfileMe } from './profileApi';
import { getPrivacyContactEmail, getPrivacyPolicyUrl, getTermsOfServiceUrl } from './privacyLinks';
import { privacyRequestMailBody, submitPrivacyUserRequest } from './privacyRequestApi';
import { getPrivacyContentForLanguage } from './privacyContentI18n';
import { getTermsContentForLanguage } from './termsContentI18n';
import { getHelpDocsUrl, getHelpFaqUrl, getSupportEmail } from './helpLinks';
import { getAppDownloadUrl, getKrainaWebsiteUrl } from './aboutLinks';
import { requestWalkReminderNotificationPermission, openWalkReminderNotificationSettings, getWalkReminderNotificationPermissionStatus } from './walkReminderSync';
import {
  DEFAULT_NOTIFICATION_PREFS,
  NOTIFICATION_SOUND_KEYS,
  allCategorySoundPrefsTrue,
  persistInAppNotificationPrefs,
  prefetchInAppNotificationPrefs,
  readInAppNotificationPrefsSnapshot,
} from './inAppNotificationPrefs';
import { brandFontHeadBold } from './brandFont';

/** @deprecated import from `./inAppNotificationPrefs` */
export { getInAppNotificationPrefs, prefetchInAppNotificationPrefs as prefetchNotificationPrefs } from './inAppNotificationPrefs';

const ROW_ICON_DARK = '#F2F2EA';
const PRIVACY_PERSONALIZE_KEY = '@kraina_settings_privacy_personalization';
const BORDER_DARK = 'rgba(255, 255, 255, 0.08)';
const BORDER_LIGHT = 'rgba(30, 30, 30, 0.12)';
const BRAND_BLUE = '#6286E4';
const ACCENT = '#E1FF00';
const FIGMA_TEXT = '#1E1E1E';
const FIGMA_ICON_MUTED = '#727272';
const FIGMA_LSP = -0.14;

/** Чи дозволена персоналізація (AsyncStorage); за замовчуванням true. */
export async function getPrivacyPersonalizationAllowed() {
  try {
    const v = await AsyncStorage.getItem(PRIVACY_PERSONALIZE_KEY);
    if (v === '0' || v === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

function privacyShellParams(route, appThemeOverride) {
  const p = route?.params || {};
  const appTheme =
    appThemeOverride === 'light' || appThemeOverride === 'dark'
      ? appThemeOverride
      : p.appTheme === 'light'
        ? 'light'
        : 'dark';
  return {
    user: p.user || {},
    language: appLangBase(p.language || 'uk'),
    ...(p.countryId ? { countryId: p.countryId } : {}),
    appTheme,
  };
}

function buildMailto(email, subject, body) {
  const e = String(email || '').trim();
  if (!e) return '';
  const sub = subject != null ? String(subject) : '';
  const bod = body != null ? String(body) : '';
  if (!sub && !bod) return `mailto:${e}`;
  const parts = [];
  if (sub) parts.push(`subject=${encodeURIComponent(sub)}`);
  if (bod) parts.push(`body=${encodeURIComponent(bod)}`);
  return `mailto:${e}?${parts.join('&')}`;
}

async function tryOpenMailto(url) {
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

async function openMailtoWithFallback(language, { email, subject, body, failKey = 'privacyMailFail' }) {
  const e = String(email || '').trim();
  if (!e) {
    Alert.alert('', st(language, failKey));
    return;
  }
  const fullUrl = buildMailto(e, subject, body);
  const simpleUrl = `mailto:${e}`;
  if (await tryOpenMailto(fullUrl)) return;
  if (fullUrl !== simpleUrl && (await tryOpenMailto(simpleUrl))) return;
  Alert.alert(
    st(language, failKey),
    `${e}\n\n${st(language, 'privacyMailManualHint')}`,
    [
      { text: st(language, 'adminCancel'), style: 'cancel' },
      {
        text: st(language, 'privacyShareEmailLabel'),
        onPress: () => {
          void Share.share({
            message: [e, subject, body].filter(Boolean).join('\n\n'),
            title: e,
          });
        },
      },
    ],
  );
}

const FAST_PRESS = { delayPressIn: 0, delayPressOut: 0 };
/** Рядки в ScrollView: невелика затримка, щоб свайп не сприймався як tap і не мигав opacity. */
const SCROLL_ROW_PRESS = { delayPressIn: 80, delayPressOut: 0 };

const GUIDE_CHAPTERS = [
  { icon: 'earth-outline', titleKey: 'guideCh1Title', bodyKey: 'guideCh1Body' },
  { icon: 'person-circle-outline', titleKey: 'guideCh2Title', bodyKey: 'guideCh2Body' },
  { icon: 'home-outline', titleKey: 'guideCh3Title', bodyKey: 'guideCh3Body' },
  { icon: 'map-outline', titleKey: 'guideCh4Title', bodyKey: 'guideCh4Body' },
  { icon: 'chatbubbles-outline', titleKey: 'guideCh5Title', bodyKey: 'guideCh5Body' },
  { icon: 'card-outline', titleKey: 'guideCh6Title', bodyKey: 'guideCh6Body' },
];

function notificationSwitchPalette(light, on) {
  return {
    trackColor: light
      ? { false: '#D8D8D4', true: '#B4C4F0' }
      : { false: '#2A2A2A', true: '#5a6a00' },
    thumbColor: light ? (on ? BRAND_BLUE : '#AEAEAA') : on ? ACCENT : '#888888',
    ios_backgroundColor: light ? '#D8D8D4' : '#2A2A2A',
  };
}

function SettingsSubScreenShell({ navigation, route, titleKey, children }) {
  const insets = useSafeAreaInsets();
  const user = route?.params?.user || {};
  const countryId = route?.params?.countryId;
  const language = useSyncedAppLanguage(route, 'uk');
  const { appTheme, isLight: light, screenBg } = useAppTheme(route?.params?.appTheme);

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        centerSubtitle={st(language, titleKey)}
        hideSendButton
        lightBarBackgroundColor={light ? LIGHT_BAR_BG : undefined}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: Math.max(28, insets.bottom + 24),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={Platform.OS === 'android'}
        {...(Platform.OS === 'ios'
          ? { contentInsetAdjustmentBehavior: 'automatic', decelerationRate: 'normal' }
          : { overScrollMode: 'never' })}
      >
        {children({ language, light, appTheme })}
      </ScrollView>
    </View>
  );
}

export function SettingsLanguagePage({ navigation, route }) {
  const current = useSyncedAppLanguage(route, 'uk');

  const onPick = useCallback(
    (id) => {
      const norm = id === 'ru' ? 'uk' : String(id).split(/[-_]/)[0].toLowerCase();
      if (norm === current) {
        navigation.goBack();
        return;
      }
      const base = appLangBase(norm);
      emitAppLanguageChanged(norm);
      const state = navigation.getState();
      for (let i = state.index - 1; i >= 0; i -= 1) {
        const r = state.routes[i];
        if (r.name === 'Settings' && r.key) {
          navigation.dispatch({
            ...CommonActions.setParams({ language: base }),
            source: r.key,
          });
          break;
        }
      }
      navigation.goBack();
      void (async () => {
        await setAppLanguagePreference(norm);
        const token = useAuthStore.getState().accessToken;
        if (token) {
          try {
            await patchProfileMe(token, { language: norm });
            await useAuthStore.getState().loadProfileMe();
          } catch {
            /* offline — локальна мова вже збережена */
          }
        }
      })();
    },
    [current, navigation],
  );

  return (
    <SettingsSubScreenShell navigation={navigation} route={route} titleKey="language">
      {({ language, light }) => (
        <View style={light ? styles.lightList : styles.darkListWrap}>
          {APP_LANGUAGE_OPTIONS.map((item) => {
            const selected = current === item.id;
            const iconColor = light ? FIGMA_ICON_MUTED : ROW_ICON_DARK;
            const labelColor = light ? FIGMA_TEXT : '#FFFFFF';
            const borderColor = light ? 'rgba(30, 30, 30, 0.1)' : BORDER_DARK;
            const ripple = light ? rippleOnLightSurface : rippleOnDarkSurface;
            const pressedBg = light ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.04)';
            return (
              <Pressable
                key={item.id}
                {...FAST_PRESS}
                hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                style={({ pressed }) => [
                  styles.row,
                  { borderBottomColor: borderColor },
                  pressed && { backgroundColor: pressedBg },
                ]}
                onPress={() => onPick(item.id)}
                android_ripple={ripple}
              >
                <Text style={[styles.flagCell, { color: labelColor }]}>{item.flag}</Text>
                <Text
                  style={[
                    styles.rowLabel,
                    { color: labelColor, flex: 1 },
                  ]}
                >
                  {item.label}
                </Text>
                {selected ? (
                  <Ionicons name="checkmark-circle" size={22} color={light ? BRAND_BLUE : ACCENT} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </SettingsSubScreenShell>
  );
}

function geoPermLabel(language, status) {
  if (status === 'granted') return st(language, 'subGeoPermGranted');
  if (status === 'denied') return st(language, 'subGeoPermDenied');
  return st(language, 'subGeoPermUndetermined');
}

const geoStatusCache = {
  servicesOn: null,
  permStatus: null,
  permCanAskAgain: true,
  fetchedAt: 0,
};

let geoRefreshPromise = null;

async function refreshGeoStatusCache() {
  const [svc, fg] = await Promise.all([
    Location.hasServicesEnabledAsync(),
    Location.getForegroundPermissionsAsync(),
  ]);
  geoStatusCache.servicesOn = !!svc;
  geoStatusCache.permStatus = fg?.status ?? null;
  geoStatusCache.permCanAskAgain = fg?.canAskAgain !== false;
  geoStatusCache.fetchedAt = Date.now();
  return {
    servicesOn: geoStatusCache.servicesOn,
    permStatus: geoStatusCache.permStatus,
    permCanAskAgain: geoStatusCache.permCanAskAgain,
  };
}

/** Попередньо зчитати статус геолокації (кеш у памʼяті — екран відкривається миттєво). */
export function prefetchGeoStatus() {
  if (geoRefreshPromise) return geoRefreshPromise;
  geoRefreshPromise = refreshGeoStatusCache()
    .catch(() => null)
    .finally(() => {
      geoRefreshPromise = null;
    });
  return geoRefreshPromise;
}

function readGeoCacheSnapshot() {
  if (geoStatusCache.fetchedAt === 0) return null;
  return {
    servicesOn: geoStatusCache.servicesOn,
    permStatus: geoStatusCache.permStatus,
    permCanAskAgain: geoStatusCache.permCanAskAgain,
  };
}

/** Підпис стану для бейджа: добре / погано / нейтрально. */
function geoSvcTone(servicesOn) {
  if (servicesOn === true) return 'good';
  if (servicesOn === false) return 'bad';
  return 'neutral';
}

function geoPermTone(status) {
  if (status === 'granted') return 'good';
  if (status === 'denied') return 'bad';
  return 'neutral';
}

function geoBadgeStyles(light, tone) {
  if (tone === 'good') {
    return light
      ? { bg: 'rgba(30, 64, 175, 0.12)', text: '#1E40AF' }
      : { bg: 'rgba(98, 134, 228, 0.24)', text: '#D6E2FF' };
  }
  if (tone === 'bad') {
    return light
      ? { bg: 'rgba(220, 53, 69, 0.12)', text: '#9B2226' }
      : { bg: 'rgba(255, 130, 122, 0.32)', text: '#FFEBE9' };
  }
  return light
    ? { bg: 'rgba(114, 114, 114, 0.12)', text: FIGMA_ICON_MUTED }
    : { bg: 'rgba(255, 255, 255, 0.18)', text: '#F2F2EA' };
}

export function SettingsGeoPage({ navigation, route }) {
  const cached = readGeoCacheSnapshot();
  const [servicesOn, setServicesOn] = useState(cached?.servicesOn ?? null);
  const [permStatus, setPermStatus] = useState(cached?.permStatus ?? null);
  const [permCanAskAgain, setPermCanAskAgain] = useState(cached?.permCanAskAgain ?? true);
  const [busyKey, setBusyKey] = useState(null);
  const [testNote, setTestNote] = useState('');

  const applyGeoSnapshot = useCallback((snap) => {
    if (!snap) return;
    setServicesOn(snap.servicesOn);
    setPermStatus(snap.permStatus);
    setPermCanAskAgain(snap.permCanAskAgain);
  }, []);

  const refreshGeo = useCallback(async () => {
    try {
      const snap = await prefetchGeoStatus();
      applyGeoSnapshot(snap);
    } catch (_) {
      /* ignore */
    }
  }, [applyGeoSnapshot]);

  useFocusEffect(
    useCallback(() => {
      refreshGeo();
      const sub = AppState.addEventListener('change', (s) => {
        if (s === 'active') refreshGeo();
      });
      return () => sub.remove();
    }, [refreshGeo]),
  );

  const openAppSettings = useCallback(() => {
    Linking.openSettings().catch(() => {});
  }, []);

  const openAndroidLocationSource = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    try {
      if (typeof Linking.sendIntent === 'function') {
        await Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS');
        return;
      }
    } catch (_) {
      /* fallback below */
    }
    try {
      await Linking.openURL('android.settings.LOCATION_SOURCE_SETTINGS');
    } catch (_) {
      openAppSettings();
    }
  }, [openAppSettings]);

  const requestForeground = useCallback(async () => {
    setBusyKey('geo-req');
    setTestNote('');
    try {
      const r = await Location.requestForegroundPermissionsAsync();
      geoStatusCache.permStatus = r?.status ?? null;
      geoStatusCache.permCanAskAgain = r?.canAskAgain !== false;
      geoStatusCache.fetchedAt = Date.now();
      const svc = await Location.hasServicesEnabledAsync();
      geoStatusCache.servicesOn = !!svc;
      applyGeoSnapshot({
        servicesOn: geoStatusCache.servicesOn,
        permStatus: geoStatusCache.permStatus,
        permCanAskAgain: geoStatusCache.permCanAskAgain,
      });
    } catch (_) {
      /* ignore */
    } finally {
      setBusyKey(null);
    }
  }, [applyGeoSnapshot]);

  const runGeoTest = useCallback(async (language) => {
    setBusyKey('geo-test');
    setTestNote('');
    try {
      const snap = (await prefetchGeoStatus()) ?? readGeoCacheSnapshot();
      if (snap) applyGeoSnapshot(snap);
      if (snap?.servicesOn === false) {
        setTestNote(st(language, 'subGeoTestNeedGps'));
        return;
      }
      if (snap?.permStatus !== 'granted') {
        setTestNote(st(language, 'subGeoTestNeedPerm'));
        return;
      }
      let pos = null;
      try {
        pos = await Location.getLastKnownPositionAsync({ maxAge: 120000 });
      } catch (_) {
        /* try fresh fix below */
      }
      if (!pos) {
        pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
          ...(Platform.OS === 'android' ? { mayShowUserSettingsDialog: true } : {}),
        });
      }
      const acc =
        pos?.coords?.accuracy != null && Number.isFinite(pos.coords.accuracy)
          ? Math.round(pos.coords.accuracy)
          : null;
      const accStr = acc != null ? ` ~${acc} m` : '';
      setTestNote(`${st(language, 'subGeoTestWorking')}${accStr}`);
    } catch (e) {
      if (__DEV__) console.warn('[SettingsGeo] test', e?.message);
      setTestNote(st(language, 'subGeoTestFail'));
    } finally {
      setBusyKey(null);
    }
  }, [applyGeoSnapshot]);

  return (
    <SettingsSubScreenShell navigation={navigation} route={route} titleKey="geoSettings">
      {({ language, light }) => {
        const labelColor = light ? FIGMA_TEXT : '#FFFFFF';
        const mutedColor = light ? FIGMA_ICON_MUTED : 'rgba(255, 248, 235, 0.86)';
        const hairline = light ? 'rgba(30, 30, 30, 0.1)' : 'rgba(255, 255, 255, 0.1)';
        const ripple = light ? rippleOnLightSurface : rippleOnDarkSurface;
        const pressedBg = light ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.08)';
        const accent = light ? BRAND_BLUE : ACCENT;
        const rowSubtitleMuted = light ? FIGMA_ICON_MUTED : '#D2DAE8';
        const svcLabel =
          servicesOn === null ? st(language, 'subGeoStateUnknown') : servicesOn
            ? st(language, 'subGeoStateOn')
            : st(language, 'subGeoStateOff');
        const permLabel = permStatus ? geoPermLabel(language, permStatus) : st(language, 'subGeoStateUnknown');
        const showRequest =
          permStatus === 'undetermined' ||
          (Platform.OS === 'android' && permStatus === 'denied' && permCanAskAgain);

        const svcBadge = geoBadgeStyles(light, geoSvcTone(servicesOn));
        const permBadge = geoBadgeStyles(light, geoPermTone(permStatus));

        const actions = [];
        if (showRequest) {
          actions.push({
            key: 'geo-req',
            icon: 'hand-left-outline',
            label: st(language, 'subGeoBtnRequest'),
            onPress: requestForeground,
          });
        }
        actions.push({
          key: 'geo-app',
          icon: 'settings-outline',
          label: st(language, 'subGeoBtnAppSettings'),
          onPress: openAppSettings,
        });
        if (Platform.OS === 'android' && servicesOn === false) {
          actions.push({
            key: 'geo-gps',
            icon: 'navigate-circle-outline',
            label: st(language, 'subGeoBtnGpsSettings'),
            onPress: openAndroidLocationSource,
          });
        }
        actions.push({
          key: 'geo-test',
          icon: 'locate-outline',
          label: st(language, 'subGeoBtnTest'),
          onPress: () => runGeoTest(language),
        });

        const renderStatusRow = ({ icon, label, badge, isLast }) => (
          <View
            style={[
              styles.notifCleanRow,
              !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: hairline },
            ]}
          >
            <View style={styles.notifCleanIcon}>
              <Ionicons name={icon} size={22} color={accent} />
            </View>
            <View style={styles.notifRowTexts}>
              <Text style={[styles.notifCleanSubtitle, { color: rowSubtitleMuted }]}>{label}</Text>
              <View style={[styles.geoBadge, { backgroundColor: badge.bg }]}>
                <Text style={[styles.geoBadgeText, { color: badge.text }]}>{badge.label}</Text>
              </View>
            </View>
          </View>
        );

        const geoActionRow = (item, index, total) => {
          const rowBusy = busyKey === item.key;
          const isLast = index >= total - 1;
          return (
            <Pressable
              key={item.key}
              {...FAST_PRESS}
              disabled={rowBusy}
              hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
              style={({ pressed }) => [
                styles.notifCleanRow,
                !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: hairline },
                pressed && !rowBusy && { backgroundColor: pressedBg },
              ]}
              onPress={() => {
                const out = item.onPress?.();
                if (out != null && typeof out.then === 'function') {
                  void out.catch(() => {});
                }
              }}
              android_ripple={rowBusy ? undefined : ripple}
            >
              <View style={styles.notifCleanIcon}>
                <Ionicons name={item.icon} size={22} color={accent} />
              </View>
              <View style={styles.notifRowTexts}>
                <Text style={[styles.notifCleanTitle, { color: labelColor }]}>{item.label}</Text>
              </View>
              {rowBusy ? (
                <ActivityIndicator size="small" color={accent} />
              ) : (
                <Ionicons name="chevron-forward" size={20} color={mutedColor} />
              )}
            </Pressable>
          );
        };

        return (
          <View style={[light ? styles.lightList : styles.darkListWrap, styles.notifCleanPage, styles.geoCleanPage]}>
            <View style={styles.privacyFlatHero}>
              <View style={styles.privacyFlatHeroRow}>
                <View style={styles.privacyFlatHeroTexts}>
                  <Text
                    style={[
                      styles.notifCleanHeroTitle,
                      brandFontHeadBold,
                      styles.geoHeroTitleTight,
                      { color: labelColor, textAlign: 'left', maxWidth: '100%' },
                    ]}
                  >
                    {st(language, 'subGeoHeroTitle')}
                  </Text>
                  <Text
                    style={[
                      styles.notifCleanHeroLead,
                      styles.geoHeroLeadTight,
                      { color: rowSubtitleMuted, textAlign: 'left', maxWidth: '100%' },
                    ]}
                  >
                    {st(language, 'subGeoHeroSubtitle')}
                  </Text>
                </View>
              </View>
            </View>

            <Text style={[styles.notifCleanSection, { color: mutedColor, marginTop: 4 }]}>
              {st(language, 'subGeoSectionStatus')}
            </Text>
            {renderStatusRow({
              icon: 'earth-outline',
              label: st(language, 'subGeoDeviceLocation'),
              badge: { label: svcLabel, ...svcBadge },
              isLast: false,
            })}
            {renderStatusRow({
              icon: 'shield-checkmark-outline',
              label: st(language, 'subGeoAppAccess'),
              badge: { label: permLabel, ...permBadge },
              isLast: true,
            })}

            <Text style={[styles.notifCleanSection, { color: mutedColor }]}>
              {st(language, 'subGeoSectionActions')}
            </Text>
            {actions.map((a, i) => geoActionRow(a, i, actions.length))}

            {testNote ? (
              <Text style={[styles.notifCleanFootnote, { color: rowSubtitleMuted, textAlign: 'left' }]}>
                {testNote}
              </Text>
            ) : null}
          </View>
        );
      }}
    </SettingsSubScreenShell>
  );
}

const NOTIFICATION_CATEGORY_ROWS = [
  {
    key: 'messages',
    icon: 'chatbubbles-outline',
    titleKey: 'notifCatMessagesTitle',
    descKey: 'notifCatMessagesDesc',
    screenName: 'SettingsNotificationMessages',
    screenTitleKey: 'notifMessagesScreenTitle',
    screenDescKey: 'notifMessagesScreenDesc',
  },
  {
    key: 'feed',
    icon: 'newspaper-outline',
    titleKey: 'notifCatFeedTitle',
    descKey: 'notifCatFeedDesc',
    screenName: 'SettingsNotificationFeed',
    screenTitleKey: 'notifFeedScreenTitle',
    screenDescKey: 'notifFeedScreenDesc',
  },
  {
    key: 'routesTips',
    icon: 'map-outline',
    titleKey: 'notifCatRoutesTitle',
    descKey: 'notifCatRoutesDesc',
    screenName: 'SettingsNotificationRoutes',
    screenTitleKey: 'notifRoutesScreenTitle',
    screenDescKey: 'notifRoutesScreenDesc',
  },
  {
    key: 'productNews',
    icon: 'sparkles-outline',
    titleKey: 'notifCatProductTitle',
    descKey: 'notifCatProductDesc',
    screenName: 'SettingsNotificationProduct',
    screenTitleKey: 'notifProductScreenTitle',
    screenDescKey: 'notifProductScreenDesc',
  },
];

export function SettingsNotificationsPage({ navigation, route }) {
  const language = useSyncedAppLanguage(route, 'uk');
  const cachedPrefs = readInAppNotificationPrefsSnapshot();
  const [prefs, setPrefs] = useState(() => cachedPrefs ?? { ...DEFAULT_NOTIFICATION_PREFS });
  const pendingMasterEnableRef = useRef(false);
  const masterBusyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void prefetchInAppNotificationPrefs().then((next) => {
      if (cancelled || !next) return;
      setPrefs({ ...next });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const patchPref = useCallback((key, value) => {
    setPrefs((prev) => {
      const next = persistInAppNotificationPrefs({ ...prev, [key]: value });
      return next;
    });
  }, []);

  const patchPrefs = useCallback((patch) => {
    setPrefs((prev) => {
      const next = persistInAppNotificationPrefs({ ...prev, ...patch });
      return next;
    });
  }, []);

  const onSoundMasterChange = useCallback(
    (next) => {
      if (!prefs.master) return;
      if (next) {
        patchPrefs({ soundMaster: true, ...allCategorySoundPrefsTrue() });
        return;
      }
      patchPref('soundMaster', false);
    },
    [patchPref, patchPrefs, prefs.master],
  );

  const tryCompletePendingMasterEnable = useCallback(async () => {
    if (!pendingMasterEnableRef.current) return;
    const status = await getWalkReminderNotificationPermissionStatus();
    if (!status.granted) return;
    pendingMasterEnableRef.current = false;
    patchPref('master', true);
  }, [patchPref]);

  useFocusEffect(
    useCallback(() => {
      void tryCompletePendingMasterEnable();
    }, [tryCompletePendingMasterEnable]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void tryCompletePendingMasterEnable();
      }
    });
    return () => sub.remove();
  }, [tryCompletePendingMasterEnable]);

  const onMasterPrefChange = useCallback(
    async (next) => {
      if (masterBusyRef.current) return;
      if (!next) {
        pendingMasterEnableRef.current = false;
        patchPref('master', false);
        return;
      }
      masterBusyRef.current = true;
      try {
        const ok = await requestWalkReminderNotificationPermission();
        if (!ok) {
          pendingMasterEnableRef.current = true;
          Alert.alert('', st(language, 'walkReminderPermissionDenied'), [
            {
              text: st(language, 'notifSystemButton'),
              onPress: () => {
                void openWalkReminderNotificationSettings();
              },
            },
            { text: 'OK', style: 'cancel' },
          ]);
          return;
        }
        pendingMasterEnableRef.current = false;
        patchPref('master', true);
      } finally {
        masterBusyRef.current = false;
      }
    },
    [language, patchPref],
  );

  const openSystemSettings = useCallback(() => {
    void openWalkReminderNotificationSettings();
  }, []);

  const goToNotifCategory = useCallback((screenName) => {
    navigation.navigate(screenName, {
      user: route?.params?.user,
      language,
      ...(route?.params?.countryId ? { countryId: route.params.countryId } : {}),
      appTheme: resolveAppTheme(route?.params?.appTheme),
    });
  }, [navigation, language, route?.params?.user, route?.params?.countryId, route?.params?.appTheme]);

  return (
    <SettingsSubScreenShell navigation={navigation} route={route} titleKey="notifications">
      {({ language, light }) => {
        const labelColor = light ? FIGMA_TEXT : '#FFFFFF';
        const mutedColor = light ? FIGMA_ICON_MUTED : 'rgba(255, 248, 235, 0.86)';
        const hairline = light ? 'rgba(30, 30, 30, 0.1)' : 'rgba(255, 255, 255, 0.1)';
        const ripple = light ? rippleOnLightSurface : rippleOnDarkSurface;
        const pressedBg = light ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.08)';
        const accent = light ? BRAND_BLUE : ACCENT;
        const masterOn = prefs.master;
        const soundMasterOn = prefs.soundMaster !== false;
        const rowSubtitleMuted = light ? FIGMA_ICON_MUTED : '#D2DAE8';

        const renderSwitchRow = ({
          icon,
          title,
          subtitle,
          value,
          onValueChange,
          dimmed = false,
          switchPointerEvents = 'auto',
          showChevron = false,
          onPress,
          isLast = false,
          isMasterSwitch = false,
        }) => {
          const pal = isMasterSwitch
            ? notificationSwitchPalette(light, value)
            : notificationSwitchPalette(light, value && masterOn);
          const content = (
            <>
              <View style={styles.notifCleanIcon}>
                <Ionicons name={icon} size={22} color={accent} />
              </View>
              <View style={styles.notifRowTexts}>
                <Text style={[styles.notifCleanTitle, { color: labelColor }]}>{title}</Text>
                {subtitle ? (
                  <Text style={[styles.notifCleanSubtitle, { color: rowSubtitleMuted }]}>{subtitle}</Text>
                ) : null}
              </View>
              {onValueChange != null ? (
                <Switch
                  value={value}
                  onValueChange={onValueChange}
                  pointerEvents={switchPointerEvents}
                  trackColor={pal.trackColor}
                  thumbColor={pal.thumbColor}
                  ios_backgroundColor={pal.ios_backgroundColor}
                />
              ) : showChevron ? (
                <Ionicons name="chevron-forward" size={20} color={mutedColor} />
              ) : null}
            </>
          );

          const rowStyle = [
            styles.notifCleanRow,
            dimmed && styles.notifRowDimmed,
            !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: hairline },
          ];

          if (onPress) {
            return (
              <Pressable
                {...FAST_PRESS}
                hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                style={({ pressed }) => [...rowStyle, pressed && { backgroundColor: pressedBg }]}
                onPress={onPress}
                android_ripple={ripple}
              >
                {content}
              </Pressable>
            );
          }

          return <View style={rowStyle}>{content}</View>;
        };

        return (
          <View style={[light ? styles.lightList : styles.darkListWrap, styles.notifCleanPage, styles.notifCleanPageTight]}>
            <View style={styles.privacyFlatHero}>
              <View style={styles.privacyFlatHeroRow}>
                <View style={styles.privacyFlatHeroTexts}>
                  <Text
                    style={[
                      styles.notifCleanHeroTitle,
                      brandFontHeadBold,
                      styles.notifHeroTitleTight,
                      { color: labelColor, textAlign: 'left', maxWidth: '100%' },
                    ]}
                  >
                    {st(language, 'notifHeroTitle')}
                  </Text>
                  <Text
                    style={[
                      styles.notifCleanHeroLead,
                      styles.notifHeroLeadTight,
                      { color: rowSubtitleMuted, textAlign: 'left', maxWidth: '100%' },
                    ]}
                  >
                    {st(language, 'notifHeroSubtitle')}
                  </Text>
                </View>
              </View>
            </View>

            <Text style={[styles.notifCleanSection, { color: mutedColor, marginTop: 4 }]}>{st(language, 'notifSectionMain')}</Text>
            {renderSwitchRow({
              icon: 'notifications-outline',
              title: st(language, 'notifMasterTitle'),
              subtitle: st(language, 'notifMasterSubtitle'),
              value: masterOn,
              onValueChange: onMasterPrefChange,
              isMasterSwitch: true,
              isLast: true,
            })}

            <Text style={[styles.notifCleanSection, { color: mutedColor }]}>
              {st(language, 'notifSectionTypes')}
            </Text>
            {NOTIFICATION_CATEGORY_ROWS.map((row, index) => {
              const on = prefs[row.key];
              const isLast = index === NOTIFICATION_CATEGORY_ROWS.length - 1;
              return (
                <View key={row.key}>
                  {renderSwitchRow({
                    icon: row.icon,
                    title: st(language, row.titleKey),
                    subtitle: st(language, row.descKey),
                    value: on,
                    onValueChange: undefined,
                    onPress: () => goToNotifCategory(row.screenName),
                    showChevron: true,
                    dimmed: !masterOn,
                    isLast,
                  })}
                </View>
              );
            })}

            <Text style={[styles.notifCleanSection, { color: mutedColor }]}>
              {st(language, 'notifSectionSound')}
            </Text>
            {renderSwitchRow({
              icon: 'volume-high-outline',
              title: st(language, 'notifSoundMasterTitle'),
              subtitle: st(language, 'notifSoundMasterSubtitle'),
              value: soundMasterOn,
              onValueChange: onSoundMasterChange,
              dimmed: !masterOn,
              switchPointerEvents: masterOn ? 'auto' : 'none',
              isLast: false,
            })}
            {NOTIFICATION_CATEGORY_ROWS.map((row, index) => {
              const soundKey = NOTIFICATION_SOUND_KEYS[row.key];
              const on = prefs[soundKey] !== false;
              const isLast = index === NOTIFICATION_CATEGORY_ROWS.length - 1;
              const categoryOn = prefs[row.key] !== false;
              const soundActive = masterOn && soundMasterOn && categoryOn;
              return (
                <View key={`sound-${row.key}`}>
                  {renderSwitchRow({
                    icon: 'musical-notes-outline',
                    title: st(language, row.titleKey),
                    subtitle: st(language, 'notifSoundCatSubtitle'),
                    value: on && soundActive,
                    onValueChange: (v) => {
                      if (!soundActive) return;
                      patchPref(soundKey, v);
                    },
                    dimmed: !soundActive,
                    switchPointerEvents: soundActive ? 'auto' : 'none',
                    isLast,
                  })}
                </View>
              );
            })}

            <Text style={[styles.notifCleanSection, { color: mutedColor }]}>
              {st(language, 'notifSectionSystem')}
            </Text>
            {renderSwitchRow({
              icon: 'phone-portrait-outline',
              title: st(language, 'notifSystemTitle'),
              subtitle: st(language, 'notifSystemDesc'),
              value: false,
              onValueChange: null,
              isLast: false,
            })}
            {renderSwitchRow({
              icon: 'open-outline',
              title: st(language, 'notifSystemButton'),
              subtitle: null,
              value: false,
              onValueChange: null,
              showChevron: true,
              onPress: openSystemSettings,
              isLast: true,
            })}

            <Text style={[styles.notifCleanFootnote, { color: rowSubtitleMuted }]}>
              {st(language, 'notifFooterHint')}
            </Text>
          </View>
        );
      }}
    </SettingsSubScreenShell>
  );
}

/** Конфіг категорій сповіщень для детальних екранів. */
const NOTIF_CATEGORY_CONFIG = {
  messages: {
    icon: 'chatbubbles-outline',
    prefsKey: 'messages',
    soundKey: 'soundMessages',
    titleKey: 'notifCatMessagesTitle',
    descKey: 'notifCatMessagesDesc',
    screenTitleKey: 'notifMessagesScreenTitle',
    screenDescKey: 'notifMessagesScreenDesc',
    pushNoteKey: 'notifMessagesPushNote',
  },
  feed: {
    icon: 'newspaper-outline',
    prefsKey: 'feed',
    soundKey: 'soundFeed',
    titleKey: 'notifCatFeedTitle',
    descKey: 'notifCatFeedDesc',
    screenTitleKey: 'notifFeedScreenTitle',
    screenDescKey: 'notifFeedScreenDesc',
  },
  routesTips: {
    icon: 'map-outline',
    prefsKey: 'routesTips',
    soundKey: 'soundRoutesTips',
    titleKey: 'notifCatRoutesTitle',
    descKey: 'notifCatRoutesDesc',
    screenTitleKey: 'notifRoutesScreenTitle',
    screenDescKey: 'notifRoutesScreenDesc',
    pushNoteKey: 'notifRoutesPushNote',
  },
  productNews: {
    icon: 'sparkles-outline',
    prefsKey: 'productNews',
    soundKey: 'soundProductNews',
    titleKey: 'notifCatProductTitle',
    descKey: 'notifCatProductDesc',
    screenTitleKey: 'notifProductScreenTitle',
    screenDescKey: 'notifProductScreenDesc',
  },
};

/**
 * Універсальний компонент екрану налаштувань для однієї категорії сповіщень.
 * Використовує `config` з `NOTIF_CATEGORY_CONFIG` для заповнення даних.
 */
function NotifCategoryScreen({ navigation, route, config }) {
  const language = useSyncedAppLanguage(route, 'uk');
  const [prefs, setPrefs] = useState(() => {
    const snap = readInAppNotificationPrefsSnapshot();
    return snap ?? { ...DEFAULT_NOTIFICATION_PREFS };
  });

  useEffect(() => {
    let cancelled = false;
    void prefetchInAppNotificationPrefs().then((next) => {
      if (cancelled || !next) return;
      setPrefs({ ...next });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const patchPref = useCallback((key, value) => {
    setPrefs((prev) => {
      const next = persistInAppNotificationPrefs({ ...prev, [key]: value });
      return next;
    });
  }, []);

  const openSystemSettings = useCallback(() => {
    Linking.openSettings().catch(() => {});
  }, []);

  const cfg = config;

  return (
    <SettingsSubScreenShell navigation={navigation} route={route} titleKey={cfg.screenTitleKey}>
      {({ language, light }) => {
        const labelColor = light ? FIGMA_TEXT : '#FFFFFF';
        const mutedColor = light ? FIGMA_ICON_MUTED : 'rgba(255, 248, 235, 0.86)';
        const hairline = light ? 'rgba(30, 30, 30, 0.1)' : 'rgba(255, 255, 255, 0.1)';
        const accent = light ? BRAND_BLUE : ACCENT;
        const rowSubtitleMuted = light ? FIGMA_ICON_MUTED : '#D2DAE8';
        const masterOn = prefs.master;
        const categoryOn = prefs[cfg.prefsKey] !== false;
        const categorySoundOn = prefs[cfg.soundKey] !== false;
        const soundMasterOn = prefs.soundMaster !== false;
        const soundActive = masterOn && soundMasterOn && categoryOn;

        const renderSwitchRow = ({ icon, title, subtitle, value, onValueChange, dimmed = false, isLast = false }) => {
          const pal = notificationSwitchPalette(light, value);
          return (
            <View
              style={[
                styles.notifCleanRow,
                dimmed && styles.notifRowDimmed,
                !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: hairline },
              ]}
            >
              <View style={styles.notifCleanIcon}>
                <Ionicons name={icon} size={22} color={accent} />
              </View>
              <View style={styles.notifRowTexts}>
                <Text style={[styles.notifCleanTitle, { color: labelColor }]}>{title}</Text>
                {subtitle ? (
                  <Text style={[styles.notifCleanSubtitle, { color: rowSubtitleMuted }]}>{subtitle}</Text>
                ) : null}
              </View>
              {onValueChange != null ? (
                <Switch
                  value={value}
                  onValueChange={onValueChange}
                  trackColor={pal.trackColor}
                  thumbColor={pal.thumbColor}
                  ios_backgroundColor={pal.ios_backgroundColor}
                />
              ) : null}
            </View>
          );
        };

        return (
          <View style={[light ? styles.lightList : styles.darkListWrap, styles.notifCleanPage, styles.notifCleanPageTight]}>
            <View style={styles.privacyFlatHero}>
              <View style={styles.privacyFlatHeroRow}>
                <View style={styles.privacyFlatHeroTexts}>
                  <Text
                    style={[
                      styles.notifCleanHeroTitle,
                      brandFontHeadBold,
                      styles.notifHeroTitleTight,
                      { color: labelColor, textAlign: 'left', maxWidth: '100%' },
                    ]}
                  >
                    {st(language, cfg.screenTitleKey)}
                  </Text>
                  <Text
                    style={[
                      styles.notifCleanHeroLead,
                      styles.notifHeroLeadTight,
                      { color: rowSubtitleMuted, textAlign: 'left', maxWidth: '100%' },
                    ]}
                  >
                    {st(language, cfg.screenDescKey)}
                  </Text>
                </View>
              </View>
            </View>

            <Text style={[styles.notifCleanSection, { color: mutedColor, marginTop: 4 }]}>{st(language, 'notifSectionMain')}</Text>
            {renderSwitchRow({
              icon: cfg.icon,
              title: st(language, cfg.titleKey),
              subtitle: st(language, cfg.descKey),
              value: categoryOn && masterOn,
              onValueChange: masterOn ? (v) => patchPref(cfg.prefsKey, v) : undefined,
              dimmed: !masterOn,
              isLast: true,
            })}

            <Text style={[styles.notifCleanSection, { color: mutedColor }]}>
              {st(language, 'notifSectionSound')}
            </Text>
            {renderSwitchRow({
              icon: 'musical-notes-outline',
              title: st(language, 'notifSoundCatSubtitle'),
              subtitle: st(language, 'notifSoundCatSubtitle'),
              value: categorySoundOn && soundActive,
              onValueChange: soundActive ? (v) => patchPref(cfg.soundKey, v) : undefined,
              dimmed: !soundActive,
              isLast: cfg.pushNoteKey ? false : true,
            })}

            {cfg.pushNoteKey ? (
              <>
                <Text style={[styles.notifCleanSection, { color: mutedColor }]}>
                  {st(language, 'notifSectionSystem')}
                </Text>
                <Text style={[styles.notifCleanFootnote, { color: rowSubtitleMuted, textAlign: 'left', marginBottom: 4 }]}>
                  {st(language, cfg.pushNoteKey)}
                </Text>
                <Pressable
                  {...FAST_PRESS}
                  hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                  style={({ pressed }) => [
                    styles.notifCleanRow,
                    pressed && { opacity: 0.72 },
                  ]}
                  onPress={openSystemSettings}
                  android_ripple={ripple}
                >
                  <View style={styles.notifCleanIcon}>
                    <Ionicons name="open-outline" size={22} color={accent} />
                  </View>
                  <View style={styles.notifRowTexts}>
                    <Text style={[styles.notifCleanTitle, { color: labelColor }]}>
                      {st(language, 'notifSystemButton')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={mutedColor} />
                </Pressable>
              </>
            ) : null}

            <Text style={[styles.notifCleanFootnote, { color: rowSubtitleMuted }]}>
              {st(language, 'notifFooterHint')}
            </Text>
          </View>
        );
      }}
    </SettingsSubScreenShell>
  );
}

/** Спеціалізовані сторінки для кожної категорії. */
export function SettingsNotificationMessagesPage({ navigation, route }) {
  return <NotifCategoryScreen navigation={navigation} route={route} config={NOTIF_CATEGORY_CONFIG.messages} />;
}

export function SettingsNotificationFeedPage({ navigation, route }) {
  return <NotifCategoryScreen navigation={navigation} route={route} config={NOTIF_CATEGORY_CONFIG.feed} />;
}

export function SettingsNotificationRoutesPage({ navigation, route }) {
  return <NotifCategoryScreen navigation={navigation} route={route} config={NOTIF_CATEGORY_CONFIG.routesTips} />;
}

export function SettingsNotificationProductPage({ navigation, route }) {
  return <NotifCategoryScreen navigation={navigation} route={route} config={NOTIF_CATEGORY_CONFIG.productNews} />;
}

function StaticTextSubPage({ navigation, route, titleKey, bodyKey }) {
  return (
    <SettingsSubScreenShell navigation={navigation} route={route} titleKey={titleKey}>
      {({ language, light }) => {
        const labelColor = light ? FIGMA_TEXT : '#FFFFFF';
        return (
          <View style={light ? styles.lightList : styles.darkListWrap}>
            <Text style={[styles.bodyText, { color: labelColor }]}>
              {st(language, bodyKey)}
            </Text>
          </View>
        );
      }}
    </SettingsSubScreenShell>
  );
}

/** Повний текст політики або умов у застосунку (якщо немає веб-URL). */
export function SettingsLegalDocPage({ navigation, route }) {
  const doc = route?.params?.legalDoc === 'terms' ? 'terms' : 'privacy';
  const titleKey = doc === 'terms' ? 'legalDocTermsTitle' : 'legalDocPrivacyTitle';

  return (
    <SettingsSubScreenShell navigation={navigation} route={route} titleKey={titleKey}>
      {({ language, light }) => {
        const labelColor = light ? FIGMA_TEXT : '#FFFFFF';
        const text =
          doc === 'terms' ? getTermsContentForLanguage(language) : getPrivacyContentForLanguage(language);
        return (
          <View style={[light ? styles.lightList : styles.darkListWrap, styles.notifCleanPage]}>
            <Text selectable style={[styles.privacyProseBody, { color: labelColor }]}>
              {text}
            </Text>
          </View>
        );
      }}
    </SettingsSubScreenShell>
  );
}

export function SettingsPrivacyPage({ navigation, route }) {
  const [personalize, setPersonalize] = useState(true);
  const [sessionEmail, setSessionEmail] = useState('');

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const raw = await AsyncStorage.getItem(PRIVACY_PERSONALIZE_KEY);
          if (!cancelled) {
            if (raw === '0' || raw === 'false') setPersonalize(false);
            else setPersonalize(true);
          }
        } catch {
          /* ignore */
        }
        let email = '';
        try {
          const s = await getSession();
          if (s?.user?.email) email = String(s.user.email).trim();
        } catch {
          /* ignore */
        }
        const authEmail = (useAuthStore.getState().user?.email && String(useAuthStore.getState().user.email).trim()) || '';
        if (authEmail) email = email || authEmail;
        const routeEmail =
          route?.params?.user?.email != null ? String(route.params.user.email).trim() : '';
        if (!email && routeEmail) email = routeEmail;
        if (!cancelled) setSessionEmail(email);
      })();
      return () => {
        cancelled = true;
      };
    }, [route?.params?.user?.email]),
  );

  const setPersonalizePersist = useCallback(async (v) => {
    setPersonalize(v);
    try {
      await AsyncStorage.setItem(PRIVACY_PERSONALIZE_KEY, v ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

  const openHttp = useCallback(
    async (language, url) => {
      if (!url) {
        Alert.alert(st(language, 'privacyUrlMissingTitle'), st(language, 'privacyUrlMissingBody'));
        return;
      }
      try {
        await WebBrowser.openBrowserAsync(url);
      } catch {
        try {
          await Linking.openURL(url);
        } catch {
          Alert.alert(st(language, 'privacyUrlMissingTitle'), st(language, 'privacyUrlMissingBody'));
        }
      }
    },
    [],
  );

  const openMail = useCallback(async (language, subject, body) => {
    await openMailtoWithFallback(language, {
      email: getPrivacyContactEmail(),
      subject,
      body,
    });
  }, []);

  const submitPrivacyRequest = useCallback(
    async (language, requestType, email) => {
      const subjectKey =
        requestType === 'export' ? 'privacyMailSubjectExport' : 'privacyMailSubjectDelete';
      const successTitleKey =
        requestType === 'export' ? 'privacyExportSuccessTitle' : 'privacyDeleteSuccessTitle';
      const successBodyKey =
        requestType === 'export' ? 'privacyExportSuccessBody' : 'privacyDeleteSuccessBody';
      try {
        const { channel } = await submitPrivacyUserRequest(requestType, {
          appLanguage: language,
          userEmail: email || null,
        });
        if (channel === 'guest') {
          await openMail(
            language,
            st(language, subjectKey),
            privacyRequestMailBody(requestType, email),
          );
          return;
        }
        Alert.alert(st(language, successTitleKey), st(language, successBodyKey));
      } catch {
        await openMail(
          language,
          st(language, subjectKey),
          privacyRequestMailBody(requestType, email),
        );
      }
    },
    [openMail],
  );

  const shareSupportEmail = useCallback(
    async (language) => {
      const email = getPrivacyContactEmail();
      try {
        await Share.share({ message: email, title: email });
      } catch {
        Alert.alert('', st(language, 'privacyMailFail'));
      }
    },
    [],
  );

  const openSystemSettingsSafe = useCallback(async (language) => {
    try {
      await Linking.openSettings();
    } catch {
      Alert.alert(st(language, 'privacyUrlMissingTitle'), st(language, 'privacySettingsOpenFailed'));
    }
  }, []);

  return (
    <SettingsSubScreenShell navigation={navigation} route={route} titleKey="privacy">
      {({ language, light, appTheme }) => {
        const labelColor = light ? FIGMA_TEXT : '#FFFFFF';
        const mutedColor = light ? FIGMA_ICON_MUTED : 'rgba(255, 248, 235, 0.86)';
        const borderColor = light ? BORDER_LIGHT : 'rgba(255, 255, 255, 0.26)';
        const ripple = light ? rippleOnLightSurface : rippleOnDarkSurface;
        const palSwitch = notificationSwitchPalette(light, personalize);
        const shell = privacyShellParams(route, appTheme);
        const iconTint = light ? BRAND_BLUE : ACCENT;

        const overviewItems = [
          { titleKey: 'privacySectionCollectTitle', bodyKey: 'privacySectionCollectBody' },
          { titleKey: 'privacySectionUseTitle', bodyKey: 'privacySectionUseBody' },
          { titleKey: 'privacySectionDeviceTitle', bodyKey: 'privacySectionDeviceBody' },
        ];

        const openPrivacyPolicy = () => {
          const url = getPrivacyPolicyUrl();
          if (url) void openHttp(language, url);
          else navigation.navigate('SettingsLegalDoc', { ...shell, legalDoc: 'privacy' });
        };

        const openTermsOfUse = () => {
          const url = getTermsOfServiceUrl();
          if (url) void openHttp(language, url);
          else navigation.navigate('SettingsLegalDoc', { ...shell, legalDoc: 'terms' });
        };

        const docActions = [
          {
            key: 'privacy_doc_policy',
            icon: 'document-text-outline',
            title: st(language, 'privacyOpenPolicy'),
            onPress: openPrivacyPolicy,
          },
          {
            key: 'privacy_doc_terms',
            icon: 'reader-outline',
            title: st(language, 'privacyOpenTerms'),
            onPress: openTermsOfUse,
          },
        ];

        const contactActions = [
          {
            key: 'privacy_contact_mail',
            icon: 'mail-outline',
            title: st(language, 'privacyContactEmailLabel'),
            onPress: () =>
              void openMail(
                language,
                st(language, 'privacyMailSubjectGeneral'),
                sessionEmail ? `Account / акаунт: ${sessionEmail}` : '',
              ),
          },
          {
            key: 'privacy_contact_share',
            icon: 'share-outline',
            title: st(language, 'privacyShareEmailLabel'),
            onPress: () => void shareSupportEmail(language),
          },
          {
            key: 'privacy_export',
            icon: 'cloud-download-outline',
            title: st(language, 'privacyRequestExport'),
            onPress: () => void submitPrivacyRequest(language, 'export', sessionEmail),
          },
          {
            key: 'privacy_delete',
            icon: 'trash-outline',
            title: st(language, 'privacyRequestDelete'),
            onPress: () => void submitPrivacyRequest(language, 'delete', sessionEmail),
          },
          {
            key: 'privacy_system_settings',
            icon: 'settings-outline',
            title: st(language, 'privacyOpenSystemSettings'),
            onPress: () => void openSystemSettingsSafe(language),
          },
        ];

        const moreActions = [
          {
            key: 'privacy_more_help',
            icon: 'help-circle-outline',
            title: st(language, 'privacyOpenHelp'),
            onPress: () => navigation.navigate('SettingsHelp', shell),
          },
          {
            key: 'privacy_more_notif',
            icon: 'notifications-outline',
            title: st(language, 'privacyOpenNotifications'),
            onPress: () => navigation.navigate('SettingsNotifications', shell),
          },
        ];

        const privacyActionRow = (item, index, total) => (
          <Pressable
            key={item.key}
            {...SCROLL_ROW_PRESS}
            hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
            style={({ pressed }) => [
              styles.notifCleanRow,
              index < total - 1 && {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: borderColor,
              },
              pressed && { opacity: 0.72 },
            ]}
            onPress={() => {
              const out = item.onPress?.();
              if (out != null && typeof out.then === 'function') void out.catch(() => {});
            }}
            android_ripple={ripple}
          >
            <View style={styles.notifCleanIcon}>
              <Ionicons name={item.icon} size={22} color={iconTint} />
            </View>
            <View style={styles.notifRowTexts}>
              <Text style={[styles.notifCleanTitle, { color: labelColor }]}>{item.title}</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={light ? mutedColor : 'rgba(255, 255, 255, 0.72)'}
            />
          </Pressable>
        );

        return (
          <View style={[light ? styles.lightList : styles.darkListWrap, styles.notifCleanPage]}>
            <View style={styles.privacyFlatHero}>
              <View style={styles.privacyFlatHeroRow}>
                <View style={styles.privacyFlatHeroTexts}>
                  <Text
                    style={[
                      styles.notifCleanHeroTitle,
                      brandFontHeadBold,
                      { color: labelColor, textAlign: 'left', maxWidth: '100%' },
                    ]}
                  >
                    {st(language, 'privacyHeroTitle')}
                  </Text>
                  <Text
                    style={[styles.notifCleanHeroLead, { color: mutedColor, textAlign: 'left', maxWidth: '100%' }]}
                  >
                    {st(language, 'privacyHeroSubtitle')}
                  </Text>
                </View>
                <Ionicons
                  name="shield-checkmark"
                  size={32}
                  color={iconTint}
                  style={styles.privacyFlatHeroIconRight}
                />
              </View>
            </View>

            <Text style={[styles.notifCleanSection, { color: mutedColor, marginTop: 4 }]}>
              {st(language, 'privacyOverviewSection')}
            </Text>
            {overviewItems.map((item) => (
              <View key={item.titleKey} style={styles.privacyProseBlock}>
                <Text style={[styles.privacyProseTitle, { color: labelColor }]}>
                  {st(language, item.titleKey)}
                </Text>
                <Text style={[styles.privacyProseBody, { color: mutedColor }]}>
                  {st(language, item.bodyKey)}
                </Text>
              </View>
            ))}

            <Text style={[styles.notifCleanSection, { color: mutedColor }]}>
              {st(language, 'privacyPersonalizeSection')}
            </Text>
            <View
              style={[
                styles.notifCleanRow,
                { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: borderColor },
              ]}
            >
              <View style={styles.notifCleanIcon}>
                <Ionicons name="sparkles-outline" size={22} color={iconTint} />
              </View>
              <View style={styles.notifRowTexts}>
                <Text style={[styles.notifCleanTitle, { color: labelColor }]}>
                  {st(language, 'privacyPersonalizeTitle')}
                </Text>
                <Text style={[styles.notifCleanSubtitle, { color: mutedColor }]}>
                  {st(language, 'privacyPersonalizeSubtitle')}
                </Text>
              </View>
              <Switch
                value={personalize}
                onValueChange={setPersonalizePersist}
                trackColor={palSwitch.trackColor}
                thumbColor={palSwitch.thumbColor}
                ios_backgroundColor={palSwitch.ios_backgroundColor}
              />
            </View>

            <Text style={[styles.notifCleanSection, { color: mutedColor }]}>
              {st(language, 'privacySectionDocsTitle')}
            </Text>
            {docActions.map((item, i) => privacyActionRow(item, i, docActions.length))}

            <Text style={[styles.notifCleanSection, { color: mutedColor }]}>
              {st(language, 'privacySectionContactTitle')}
            </Text>
            {contactActions.map((item, i) => privacyActionRow(item, i, contactActions.length))}

            <Text style={[styles.notifCleanSection, { color: mutedColor }]}>
              {st(language, 'privacySectionMoreTitle')}
            </Text>
            {moreActions.map((item, i) => privacyActionRow(item, i, moreActions.length))}

            <Text style={[styles.notifCleanSection, { color: mutedColor }]}>
              {st(language, 'privacyAccountHint')}
            </Text>
            <View style={styles.notifCleanRow}>
              <View style={styles.notifCleanIcon}>
                <Ionicons name="person-circle-outline" size={22} color={iconTint} />
              </View>
              <View style={styles.notifRowTexts}>
                <Text style={[styles.notifCleanTitle, { color: labelColor }]}>
                  {st(language, 'privacyAccountHint')}
                </Text>
                <Text style={[styles.notifCleanSubtitle, { color: mutedColor }]}>
                  {sessionEmail || st(language, 'privacyGuestHint')}
                </Text>
              </View>
            </View>

            <Text style={[styles.notifCleanFootnote, { color: mutedColor, textAlign: 'left' }]}>
              {`${st(language, 'privacyFooterNote')} ${getPrivacyContactEmail()}`}
            </Text>
          </View>
        );
      }}
    </SettingsSubScreenShell>
  );
}

export function SettingsHelpPage({ navigation, route }) {
  const [sessionEmail, setSessionEmail] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getSession();
        if (!cancelled && s?.user?.email) setSessionEmail(String(s.user.email));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openHelpHttp = useCallback(async (language, url) => {
    if (!url) {
      Alert.alert(st(language, 'helpUrlMissingTitle'), st(language, 'helpUrlMissingBody'));
      return;
    }
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      try {
        await Linking.openURL(url);
      } catch {
        Alert.alert(st(language, 'helpUrlMissingTitle'), st(language, 'helpUrlMissingBody'));
      }
    }
  }, []);

  const openSupportMail = useCallback(async (language, subject, body) => {
    await openMailtoWithFallback(language, {
      email: getSupportEmail(),
      subject,
      body,
      failKey: 'helpMailFail',
    });
  }, []);

  const shareSupportEmail = useCallback(async (language) => {
    const email = getSupportEmail();
    try {
      await Share.share({ message: email, title: email });
    } catch {
      Alert.alert('', st(language, 'helpMailFail'));
    }
  }, []);

  const reportBug = useCallback(
    (language) => {
      const ver = Constants.expoConfig?.version || Constants.manifest?.version || 'unknown';
      Alert.alert(st(language, 'helpReportAlertTitle'), st(language, 'helpReportAlertBody'), [
        { text: st(language, 'adminCancel'), style: 'cancel' },
        {
          text: st(language, 'helpOpenMail'),
          onPress: () =>
            openSupportMail(
              language,
              st(language, 'helpMailSubjectBug'),
              `App version / версія: ${ver}\n${sessionEmail ? `Account: ${sessionEmail}\n` : ''}\n`,
            ),
        },
      ]);
    },
    [openSupportMail, sessionEmail],
  );

  return (
    <SettingsSubScreenShell navigation={navigation} route={route} titleKey="help">
      {({ language, light, appTheme }) => {
        const labelColor = light ? FIGMA_TEXT : '#FFFFFF';
        const mutedColor = light ? FIGMA_ICON_MUTED : 'rgba(255, 248, 235, 0.86)';
        const borderColor = light ? BORDER_LIGHT : 'rgba(255, 255, 255, 0.26)';
        const ripple = light ? rippleOnLightSurface : rippleOnDarkSurface;
        const shell = privacyShellParams(route, appTheme);
        const iconTint = light ? BRAND_BLUE : ACCENT;

        const helpRow = (key, icon, title, onPress, last) => (
          <Pressable
            key={key}
            {...SCROLL_ROW_PRESS}
            hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
            style={({ pressed }) => [
              styles.notifCleanRow,
              !last && {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: borderColor,
              },
              pressed && { opacity: 0.72 },
            ]}
            onPress={onPress}
            android_ripple={ripple}
          >
            <View style={styles.notifCleanIcon}>
              <Ionicons name={icon} size={22} color={iconTint} />
            </View>
            <View style={styles.notifRowTexts}>
              <Text style={[styles.notifCleanTitle, { color: labelColor }]}>{title}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={mutedColor} />
          </Pressable>
        );

        const openChatsFromHelp = () => {
          navigation.navigate('Chats', {
            user: shell.user,
            language: shell.language,
            ...(shell.countryId ? { countryId: shell.countryId } : {}),
            appTheme: shell.appTheme,
          });
        };

        const quickActions = [
          {
            key: 'help_chats',
            icon: 'chatbubbles-outline',
            title: st(language, 'helpOpenChats'),
            onPress: openChatsFromHelp,
          },
          {
            key: 'help_faq',
            icon: 'library-outline',
            title: st(language, 'helpOpenFaq'),
            onPress: () => openHelpHttp(language, getHelpFaqUrl()),
          },
          {
            key: 'help_docs',
            icon: 'book-outline',
            title: st(language, 'helpOpenDocs'),
            onPress: () => openHelpHttp(language, getHelpDocsUrl()),
          },
          {
            key: 'help_mail',
            icon: 'mail-outline',
            title: st(language, 'helpEmailSupport'),
            onPress: () =>
              openSupportMail(
                language,
                st(language, 'helpMailSubjectGeneral'),
                sessionEmail ? `Account / акаунт: ${sessionEmail}` : '',
              ),
          },
          {
            key: 'help_share',
            icon: 'share-outline',
            title: st(language, 'helpShareEmail'),
            onPress: () => shareSupportEmail(language),
          },
          {
            key: 'help_bug',
            icon: 'bug-outline',
            title: st(language, 'helpReportBug'),
            onPress: () => reportBug(language),
          },
        ];

        const moreActions = [
          {
            key: 'help_privacy',
            icon: 'shield-checkmark-outline',
            title: st(language, 'helpOpenPrivacy'),
            onPress: () => navigation.navigate('SettingsPrivacy', shell),
          },
          {
            key: 'help_notif',
            icon: 'notifications-outline',
            title: st(language, 'helpOpenNotifications'),
            onPress: () => navigation.navigate('SettingsNotifications', shell),
          },
          {
            key: 'help_geo',
            icon: 'location-outline',
            title: st(language, 'helpOpenGeo'),
            onPress: () => navigation.navigate('SettingsGeo', shell),
          },
          {
            key: 'help_about',
            icon: 'information-circle-outline',
            title: st(language, 'helpOpenAbout'),
            onPress: () => navigation.navigate('SettingsAbout', shell),
          },
          {
            key: 'help_system',
            icon: 'settings-outline',
            title: st(language, 'helpOpenSystem'),
            onPress: () => {
              Linking.openSettings().catch(() => {});
            },
          },
        ];

        return (
          <View style={[light ? styles.lightList : styles.darkListWrap, styles.notifCleanPage]}>
            <View style={styles.privacyFlatHero}>
              <View style={styles.privacyFlatHeroRow}>
                <View style={styles.privacyFlatHeroTexts}>
                  <Text
                    style={[
                      styles.notifCleanHeroTitle,
                      brandFontHeadBold,
                      { color: labelColor, textAlign: 'left', maxWidth: '100%' },
                    ]}
                  >
                    {st(language, 'helpHeroTitle')}
                  </Text>
                  <Text
                    style={[styles.notifCleanHeroLead, { color: mutedColor, textAlign: 'left', maxWidth: '100%' }]}
                  >
                    {st(language, 'helpHeroSubtitle')}
                  </Text>
                </View>
              </View>
            </View>

            <Text style={[styles.notifCleanSection, { color: mutedColor, marginTop: 4 }]}>
              {st(language, 'helpSectionTipsTitle')}
            </Text>
            <Text style={[styles.privacyProseBody, { color: mutedColor, marginBottom: 16 }]}>
              {st(language, 'helpSectionTipsBody')}
            </Text>

            <Text style={[styles.notifCleanSection, { color: mutedColor }]}>
              {st(language, 'helpSectionWhenTitle')}
            </Text>
            <Text style={[styles.privacyProseBody, { color: mutedColor, marginBottom: 8 }]}>
              {st(language, 'helpSectionWhenBody')}
            </Text>

            <Text style={[styles.notifCleanSection, { color: mutedColor }]}>
              {st(language, 'helpQuickTitle')}
            </Text>
            {quickActions.map((item, i) =>
              helpRow(item.key, item.icon, item.title, item.onPress, i === quickActions.length - 1),
            )}

            <Text style={[styles.notifCleanSection, { color: mutedColor }]}>
              {st(language, 'helpMoreTitle')}
            </Text>
            {moreActions.map((item, i) =>
              helpRow(item.key, item.icon, item.title, item.onPress, i === moreActions.length - 1),
            )}

            <Text style={[styles.notifCleanSection, { color: mutedColor }]}>
              {st(language, 'helpAccountHint')}
            </Text>
            <View style={styles.notifCleanRow}>
              <View style={styles.notifCleanIcon}>
                <Ionicons name="person-circle-outline" size={22} color={iconTint} />
              </View>
              <View style={styles.notifRowTexts}>
                <Text style={[styles.notifCleanTitle, { color: labelColor }]}>
                  {st(language, 'helpAccountHint')}
                </Text>
                <Text style={[styles.notifCleanSubtitle, { color: mutedColor }]}>
                  {sessionEmail || st(language, 'helpGuestHint')}
                </Text>
              </View>
            </View>

            <Text style={[styles.notifCleanFootnote, { color: mutedColor, textAlign: 'left' }]}>
              {`${st(language, 'helpFooterNote')} ${getSupportEmail()}`}
            </Text>
          </View>
        );
      }}
    </SettingsSubScreenShell>
  );
}

export function SettingsAboutPage({ navigation, route }) {
  const ver = Constants.expoConfig?.version || Constants.manifest?.version || '—';
  const [sessionEmail, setSessionEmail] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getSession();
        if (!cancelled && s?.user?.email) setSessionEmail(String(s.user.email));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openAboutHttp = useCallback(async (language, url) => {
    if (!url) {
      Alert.alert(st(language, 'guideUrlMissingTitle'), st(language, 'guideUrlMissingBody'));
      return;
    }
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      try {
        await Linking.openURL(url);
      } catch {
        Alert.alert(st(language, 'guideUrlMissingTitle'), st(language, 'guideUrlMissingBody'));
      }
    }
  }, []);

  const shareApp = useCallback(
    async (language) => {
      const link = getAppDownloadUrl();
      const msg = `${st(language, 'guideShareMessage')}${link ? `\n${link}` : ''}`;
      try {
        await Share.share({ message: msg, title: 'KRAÏNA' });
      } catch {
        /* user dismissed */
      }
    },
    [],
  );

  return (
    <SettingsSubScreenShell navigation={navigation} route={route} titleKey="info">
      {({ language, light, appTheme }) => {
        const labelColor = light ? FIGMA_TEXT : '#FFFFFF';
        const mutedColor = light ? FIGMA_ICON_MUTED : 'rgba(255, 248, 235, 0.86)';
        const borderColor = light ? BORDER_LIGHT : 'rgba(255, 255, 255, 0.26)';
        const ripple = light ? rippleOnLightSurface : rippleOnDarkSurface;
        const shell = privacyShellParams(route, appTheme);
        const iconTint = light ? BRAND_BLUE : ACCENT;

        const aboutRow = (key, icon, title, onPress, last) => (
          <Pressable
            key={key}
            {...SCROLL_ROW_PRESS}
            hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
            style={({ pressed }) => [
              styles.notifCleanRow,
              !last && {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: borderColor,
              },
              pressed && { opacity: 0.72 },
            ]}
            onPress={onPress}
            android_ripple={ripple}
          >
            <View style={styles.notifCleanIcon}>
              <Ionicons name={icon} size={22} color={iconTint} />
            </View>
            <View style={styles.notifRowTexts}>
              <Text style={[styles.notifCleanTitle, { color: labelColor }]}>{title}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={mutedColor} />
          </Pressable>
        );

        const quickActions = [
          {
            key: 'guide_help',
            icon: 'help-circle-outline',
            title: st(language, 'guideOpenHelp'),
            onPress: () => navigation.navigate('SettingsHelp', shell),
          },
          {
            key: 'guide_privacy',
            icon: 'shield-checkmark-outline',
            title: st(language, 'guideOpenPrivacy'),
            onPress: () => navigation.navigate('SettingsPrivacy', shell),
          },
          {
            key: 'guide_lang',
            icon: 'language-outline',
            title: st(language, 'guideOpenLanguage'),
            onPress: () => navigation.navigate('SettingsLanguage', shell),
          },
          {
            key: 'guide_plans',
            icon: 'apps-outline',
            title: st(language, 'guideOpenPlans'),
            onPress: () =>
              navigation.navigate('ChoosePlan', {
                user: shell.user,
                language: shell.language,
                appTheme: shell.appTheme,
                fromSettings: true,
                ...(shell.countryId ? { countryId: shell.countryId } : {}),
              }),
          },
          {
            key: 'guide_web',
            icon: 'globe-outline',
            title: st(language, 'guideOpenWebsite'),
            onPress: () => openAboutHttp(language, getKrainaWebsiteUrl()),
          },
          {
            key: 'guide_faq',
            icon: 'library-outline',
            title: st(language, 'guideOpenFaq'),
            onPress: () => openAboutHttp(language, getHelpFaqUrl()),
          },
          {
            key: 'guide_share',
            icon: 'share-social-outline',
            title: st(language, 'guideShareApp'),
            onPress: () => shareApp(language),
          },
        ];

        return (
          <View style={[light ? styles.lightList : styles.darkListWrap, styles.notifCleanPage]}>
            <View style={styles.privacyFlatHero}>
              <View style={styles.privacyFlatHeroRow}>
                <View style={styles.privacyFlatHeroTexts}>
                  <Text
                    style={[
                      styles.notifCleanHeroTitle,
                      brandFontHeadBold,
                      { color: labelColor, textAlign: 'left', maxWidth: '100%' },
                    ]}
                  >
                    {st(language, 'guideHeroTitle')}
                  </Text>
                  <Text
                    style={[styles.notifCleanHeroLead, { color: mutedColor, textAlign: 'left', maxWidth: '100%' }]}
                  >
                    {st(language, 'guideHeroSubtitle')}
                  </Text>
                </View>
                <Ionicons name="book-outline" size={32} color={iconTint} style={styles.privacyFlatHeroIconRight} />
              </View>
            </View>

            <Text style={[styles.notifCleanSection, { color: mutedColor, marginTop: 4 }]}>
              {st(language, 'guideVersionLabel')}
            </Text>
            <Text style={[styles.guideVersionFlat, { color: labelColor }]}>{ver}</Text>

            {GUIDE_CHAPTERS.map((ch) => (
              <View key={ch.titleKey} style={styles.guideFlatChapter}>
                <View style={styles.notifCleanIcon}>
                  <Ionicons name={ch.icon} size={22} color={iconTint} />
                </View>
                <View style={styles.guideFlatChapterTexts}>
                  <Text style={[styles.privacyProseTitle, { color: labelColor }]}>
                    {st(language, ch.titleKey)}
                  </Text>
                  <Text style={[styles.privacyProseBody, { color: mutedColor }]}>
                    {st(language, ch.bodyKey)}
                  </Text>
                </View>
              </View>
            ))}

            <Text style={[styles.notifCleanSection, { color: mutedColor }]}>
              {st(language, 'guideQuickTitle')}
            </Text>
            {quickActions.map((item, i) =>
              aboutRow(item.key, item.icon, item.title, item.onPress, i === quickActions.length - 1),
            )}

            <Text style={[styles.notifCleanSection, { color: mutedColor }]}>
              {st(language, 'guideAccountHint')}
            </Text>
            <View style={styles.notifCleanRow}>
              <View style={styles.notifCleanIcon}>
                <Ionicons name="person-circle-outline" size={22} color={iconTint} />
              </View>
              <View style={styles.notifRowTexts}>
                <Text style={[styles.notifCleanTitle, { color: labelColor }]}>
                  {st(language, 'guideAccountHint')}
                </Text>
                <Text style={[styles.notifCleanSubtitle, { color: mutedColor }]}>
                  {sessionEmail || st(language, 'guideGuestHint')}
                </Text>
              </View>
            </View>

            <Text style={[styles.notifCleanFootnote, { color: mutedColor, textAlign: 'left' }]}>
              {st(language, 'guideFooterNote')}
            </Text>
          </View>
        );
      }}
    </SettingsSubScreenShell>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 0,
    paddingTop: 4,
  },
  lightList: {
    alignSelf: 'stretch',
    backgroundColor: LIGHT_BAR_BG,
  },
  darkListWrap: {
    alignSelf: 'stretch',
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: FIGMA_LSP,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  versionLine: {
    fontSize: 14,
    paddingHorizontal: 20,
    paddingBottom: 20,
    letterSpacing: 0.1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  ctaRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
  },
  geoHeroShell: {
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 20,
    borderRadius: 20,
    borderWidth: 1,
  },
  geoHeroGradient: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderRadius: 20,
    overflow: 'hidden',
  },
  geoHeroTitle: {
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.35,
    marginBottom: 8,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  geoHeroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: FIGMA_LSP,
    maxWidth: '100%',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  geoHeroIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  geoHeroIconWrapLight: {
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(98, 134, 228, 0.35)',
    ...Platform.select({
      ios: {
        shadowColor: BRAND_BLUE,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 10,
      },
      android: { elevation: 3 },
    }),
  },
  geoHeroIconWrapDark: {
    backgroundColor: 'rgba(225, 255, 0, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(225, 255, 0, 0.45)',
    ...Platform.select({
      ios: {
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
    }),
  },
  geoSectionLabel: {
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  geoBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
  },
  geoBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  geoRingOuterCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 15,
    padding: 1,
  },
  /** Без overflow:hidden — на Android інакше інколи обрізається весь текст усередині картки. */
  geoRingInnerCard: {
    borderRadius: 14,
  },
  geoHintRingOuter: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 4,
    borderRadius: 15,
    padding: 1,
  },
  geoHintRingInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  geoHintText: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: FIGMA_LSP,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  themeRow: {
    paddingRight: 16,
    marginTop: 4,
  },
  rowIcon: { marginRight: 12 },
  rowLabel: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: FIGMA_LSP,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  flagCell: {
    fontSize: 22,
    marginRight: 12,
    minWidth: 32,
  },
  notifHero: {
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 18,
    padding: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  notifHeroLight: {
    backgroundColor: 'rgba(98, 134, 228, 0.09)',
  },
  notifHeroDark: {
    backgroundColor: 'rgba(225, 255, 0, 0.06)',
  },
  notifHeroIcon: {
    marginBottom: 10,
  },
  notifHeroTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.25,
    marginBottom: 6,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  notifHeroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: FIGMA_LSP,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  notifCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 58,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  notifRowSingle: {
    borderBottomWidth: 0,
  },
  notifRowDimmed: {
    opacity: 0.48,
  },
  notifCleanPage: {
    paddingHorizontal: 20,
  },
  /** Трохи більше повітря зверху (екрани з hero). */
  notifCleanPageTight: {
    paddingTop: 12,
  },
  /** Компактніший hero на екрані сповіщень. */
  notifHeroTitleTight: {
    fontSize: 24,
    lineHeight: 30,
    marginBottom: 8,
    maxWidth: 340,
  },
  notifHeroLeadTight: {
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 340,
  },
  /** Тільки екран гео: більше повітря зверху. */
  geoCleanPage: {
    paddingTop: 12,
  },
  /** Тільки екран гео: компактніший hero заголовок/опис. */
  geoHeroTitleTight: {
    fontSize: 24,
    lineHeight: 30,
    marginBottom: 8,
    maxWidth: 340,
  },
  geoHeroLeadTight: {
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 340,
  },
  notifCleanHeroTitle: {
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 10,
    maxWidth: 320,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  notifCleanHeroLead: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 320,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  notifCleanSection: {
    marginTop: 18,
    marginBottom: 6,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.35,
    textTransform: 'uppercase',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  notifCleanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 58,
    paddingVertical: 11,
    gap: 12,
  },
  notifCleanIcon: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifCleanTitle: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: FIGMA_LSP,
    marginBottom: 2,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  notifCleanSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: FIGMA_LSP,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  notifCleanFootnote: {
    marginTop: 28,
    marginBottom: 8,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    opacity: 0.78,
    paddingHorizontal: 6,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  geoCleanStatus: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  notifIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  notifIconWrapLight: {
    backgroundColor: 'rgba(98, 134, 228, 0.14)',
  },
  notifIconWrapDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  /** Тільки екран гео: темна тема — контрастніші кружки під іконки. */
  geoNotifIconWrapDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  notifRowTexts: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  notifRowTitle: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: FIGMA_LSP,
    marginBottom: 2,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  notifRowSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: FIGMA_LSP,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  notifSectionLabel: {
    marginHorizontal: 20,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.55,
    textTransform: 'uppercase',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  notifSystemTitle: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: FIGMA_LSP,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  notifSystemDesc: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: FIGMA_LSP,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  notifSystemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  notifFooter: {
    marginHorizontal: 24,
    marginTop: 4,
    marginBottom: 12,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    letterSpacing: 0.15,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  privacyFlatHero: {
    paddingTop: 6,
    paddingBottom: 20,
    alignItems: 'flex-start',
  },
  privacyFlatHeroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    width: '100%',
  },
  privacyFlatHeroTexts: {
    flex: 1,
    minWidth: 0,
  },
  privacyFlatHeroIconRight: {
    flexShrink: 0,
    marginTop: 4,
  },
  privacyProseBlock: {
    marginBottom: 16,
  },
  privacyProseTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: FIGMA_LSP,
    marginBottom: 6,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  privacyProseBody: {
    fontSize: 14,
    lineHeight: 21,
    letterSpacing: FIGMA_LSP,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  privacyRingSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: FIGMA_LSP,
    marginBottom: 6,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  privacyProseDivider: {
    height: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginVertical: 12,
  },
  privacySectionBody: {
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 6,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: FIGMA_LSP,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  privacyParagraph: {
    marginHorizontal: 20,
    marginBottom: 4,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: FIGMA_LSP,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  guideVersionFlat: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.25,
    marginBottom: 20,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  guideFlatChapter: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
    gap: 12,
  },
  guideFlatChapterTexts: {
    flex: 1,
    minWidth: 0,
  },
  guideVersionBanner: {
    marginHorizontal: 20,
    marginBottom: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  guideVersionLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  guideVersionValue: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.2,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  guideChapterCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  guideIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  guideChapterTextCol: {
    flex: 1,
    minWidth: 0,
  },
  guideChapterTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: FIGMA_LSP,
    marginBottom: 6,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  guideChapterBody: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: FIGMA_LSP,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
});

import React, { useState, useEffect, useCallback } from 'react';
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
  DeviceEventEmitter,
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
import { getAppTheme, THEME_CHANGED_EVENT } from './themeStorage';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';
import { st } from './settingsI18n';
import { lightTabBarExtraScrollPadding } from './LightBottomTabBar';
import { APP_LANGUAGE_OPTIONS } from './appLanguageOptions';
import { setAppLanguagePreference, getSession } from './db';
import { emitAppLanguageChanged } from './appLanguageEvents';
import { useAuthStore } from './auth/authStore';
import { patchProfileMe } from './auth/endpoints';
import { getPrivacyContactEmail, getPrivacyPolicyUrl, getTermsOfServiceUrl } from './privacyLinks';
import { getPrivacyContentForLanguage } from './privacyContentI18n';
import { getTermsContentForLanguage } from './termsContentI18n';
import { getHelpDocsUrl, getHelpFaqUrl, getSupportEmail } from './helpLinks';
import { getAppDownloadUrl, getKrainaWebsiteUrl } from './aboutLinks';
import { requestWalkReminderNotificationPermission } from './walkReminderSync';

const ROW_ICON_DARK = '#F2F2EA';
const BORDER_DARK = 'rgba(255, 255, 255, 0.08)';
const BORDER_LIGHT = 'rgba(30, 30, 30, 0.12)';
const BRAND_BLUE = '#6286E4';
const ACCENT = '#E1FF00';
const FIGMA_TEXT = '#1E1E1E';
const FIGMA_ICON_MUTED = '#727272';
const FIGMA_LSP = -0.14;

const NOTIFICATIONS_PREFS_KEY = '@kraina_settings_inapp_notifications';
const PRIVACY_PERSONALIZE_KEY = '@kraina_settings_privacy_personalization';

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

function privacyShellParams(route) {
  const p = route?.params || {};
  return {
    user: p.user || {},
    language: appLangBase(p.language || 'uk'),
    ...(p.countryId ? { countryId: p.countryId } : {}),
    appTheme: p.appTheme === 'light' ? 'light' : 'dark',
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

const DEFAULT_NOTIFICATION_PREFS = {
  master: true,
  messages: true,
  feed: true,
  routesTips: true,
  productNews: true,
};

function parseNotificationPrefsRaw(raw) {
  if (raw == null || raw === '') {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
  const s = String(raw).trim();
  if (s === '0' || s === 'false') {
    return { ...DEFAULT_NOTIFICATION_PREFS, master: false };
  }
  if (s === '1' || s === 'true') {
    return { ...DEFAULT_NOTIFICATION_PREFS, master: true };
  }
  try {
    const o = JSON.parse(s);
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      return {
        master: o.master !== false,
        messages: o.messages !== false,
        feed: o.feed !== false,
        routesTips: o.routesTips !== false,
        productNews: o.productNews !== false,
      };
    }
  } catch (_) {
    /* ignore */
  }
  return { ...DEFAULT_NOTIFICATION_PREFS };
}

const FAST_PRESS = { delayPressIn: 0, delayPressOut: 0 };

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

/** Read in-app notification toggles (AsyncStorage); migrates legacy `'0'`/`'1'` values. */
export async function getInAppNotificationPrefs() {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATIONS_PREFS_KEY);
    return parseNotificationPrefsRaw(raw);
  } catch (_) {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
}

function SettingsSubScreenShell({ navigation, route, titleKey, children }) {
  const insets = useSafeAreaInsets();
  const user = route?.params?.user || {};
  const countryId = route?.params?.countryId;
  const language = useSyncedAppLanguage(route, 'uk');
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await getAppTheme();
      if (!cancelled) setAppTheme(t === 'light' ? 'light' : 'dark');
    })();
    const sub = DeviceEventEmitter.addListener(THEME_CHANGED_EVENT, (v) => {
      setAppTheme(v === 'light' ? 'light' : 'dark');
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  const light = appTheme === 'light';
  const screenBg = light ? LIGHT_BAR_BG : APP_SCREEN_BG;

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
            paddingBottom: Math.max(28, insets.bottom + 24) + lightTabBarExtraScrollPadding(),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
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
      ? { bg: 'rgba(52, 199, 89, 0.14)', text: '#1B5E20' }
      : { bg: 'rgba(225, 255, 0, 0.28)', text: '#F9FFCC' };
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
        const borderColor = light ? BORDER_LIGHT : 'rgba(255, 255, 255, 0.26)';
        const ripple = light ? rippleOnLightSurface : rippleOnDarkSurface;
        const pressedBg = light ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.11)';
        /** Темна тема: суцільна панель (не напівпрозора) + контраст з #000 фоном екрана. */
        const cardFill = light ? '#FFFFFF' : '#1E2128';
        const geoIconWrap = [styles.notifIconWrap, light ? styles.notifIconWrapLight : styles.geoNotifIconWrapDark];
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

        const geoActionRow = (item, index, total) => {
          const rowBusy = busyKey === item.key;
          return (
            <Pressable
              key={item.key}
              {...FAST_PRESS}
              disabled={rowBusy}
              hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
              style={({ pressed }) => [
                styles.notifRow,
                index < total - 1 ? { borderBottomColor: borderColor } : styles.notifRowSingle,
                pressed && !busyKey && { backgroundColor: pressedBg },
              ]}
              onPress={() => {
                const out = item.onPress?.();
                if (out != null && typeof out.then === 'function') {
                  void out.catch(() => {});
                }
              }}
              android_ripple={busyKey ? undefined : ripple}
            >
              <View style={geoIconWrap}>
                <Ionicons name={item.icon} size={22} color={light ? BRAND_BLUE : ACCENT} />
              </View>
              <View style={styles.notifRowTexts}>
                <Text style={[styles.notifRowTitle, { color: labelColor }]}>
                  {item.label}
                </Text>
              </View>
              {rowBusy ? (
                <ActivityIndicator size="small" color={light ? BRAND_BLUE : ACCENT} />
              ) : (
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={light ? mutedColor : 'rgba(255, 255, 255, 0.72)'}
                />
              )}
            </Pressable>
          );
        };

        const hintRingColor = light ? 'rgba(98, 134, 228, 0.42)' : 'rgba(225, 255, 0, 0.42)';
        const hintFill = light ? 'rgba(98, 134, 228, 0.08)' : 'rgba(225, 255, 0, 0.14)';

        const heroStroke = light ? 'rgba(98, 134, 228, 0.28)' : 'rgba(225, 255, 0, 0.38)';
        const heroGradColors = light
          ? ['#C9D7FA', '#E8EEFF', '#F6F8FF']
          : ['#343A28', '#1E2218', '#12150E'];
        const heroGradEnd = light ? { x: 1, y: 1 } : { x: 1, y: 0.85 };
        const heroShadowStyle = light
          ? {
              shadowColor: BRAND_BLUE,
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.2,
              shadowRadius: 22,
              elevation: 6,
            }
          : {
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.65,
              shadowRadius: 28,
              elevation: 14,
            };
        const heroSubtitleColor = light ? 'rgba(30, 30, 30, 0.62)' : 'rgba(255, 255, 255, 0.82)';

        return (
          <View style={light ? styles.lightList : styles.darkListWrap}>
            <View
              collapsable={false}
              style={[styles.geoHeroShell, heroShadowStyle, { borderColor: heroStroke }]}
            >
              <LinearGradient
                colors={heroGradColors}
                locations={light ? [0, 0.55, 1] : [0, 0.45, 1]}
                start={{ x: 0, y: 0 }}
                end={heroGradEnd}
                style={styles.geoHeroGradient}
              >
                <View style={[styles.geoHeroIconWrap, light ? styles.geoHeroIconWrapLight : styles.geoHeroIconWrapDark]}>
                  <Ionicons name="location" size={30} color={light ? BRAND_BLUE : ACCENT} />
                </View>
                <Text style={[styles.geoHeroTitle, { color: labelColor }]}>{st(language, 'subGeoHeroTitle')}</Text>
                <Text style={[styles.geoHeroSubtitle, { color: heroSubtitleColor }]}>
                  {st(language, 'subGeoHeroSubtitle')}
                </Text>
              </LinearGradient>
            </View>

            <Text style={[styles.geoSectionLabel, { color: mutedColor }]}>{st(language, 'subGeoSectionStatus')}</Text>
            <View style={[styles.geoRingOuterCard, { backgroundColor: borderColor }]}>
              <View
                style={[styles.geoRingInnerCard, { backgroundColor: cardFill }]}
                collapsable={false}
              >
                <View style={[styles.notifRow, { borderBottomColor: borderColor }]}>
                  <View style={geoIconWrap}>
                    <Ionicons name="earth-outline" size={22} color={light ? BRAND_BLUE : ACCENT} />
                  </View>
                  <View style={styles.notifRowTexts}>
                    <Text
                      style={[
                        styles.notifRowSubtitle,
                        { color: light ? FIGMA_ICON_MUTED : '#D2DAE8' },
                      ]}
                    >
                      {st(language, 'subGeoDeviceLocation')}
                    </Text>
                    <View style={[styles.geoBadge, { backgroundColor: svcBadge.bg }]}>
                      <Text style={[styles.geoBadgeText, { color: svcBadge.text }]}>{svcLabel}</Text>
                    </View>
                  </View>
                </View>
                <View style={[styles.notifRow, styles.notifRowSingle]}>
                  <View style={geoIconWrap}>
                    <Ionicons name="shield-checkmark-outline" size={22} color={light ? BRAND_BLUE : ACCENT} />
                  </View>
                  <View style={styles.notifRowTexts}>
                    <Text
                      style={[
                        styles.notifRowSubtitle,
                        { color: light ? FIGMA_ICON_MUTED : '#D2DAE8' },
                      ]}
                    >
                      {st(language, 'subGeoAppAccess')}
                    </Text>
                    <View style={[styles.geoBadge, { backgroundColor: permBadge.bg }]}>
                      <Text style={[styles.geoBadgeText, { color: permBadge.text }]}>{permLabel}</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            <Text style={[styles.geoSectionLabel, { color: mutedColor }]}>{st(language, 'subGeoSectionActions')}</Text>
            <View style={[styles.geoRingOuterCard, { backgroundColor: borderColor }]}>
              <View style={[styles.geoRingInnerCard, { backgroundColor: cardFill }]} collapsable={false}>
                {actions.map((a, i) => geoActionRow(a, i, actions.length))}
              </View>
            </View>

            {testNote ? (
              <View style={[styles.geoHintRingOuter, { backgroundColor: hintRingColor }]}>
                <View style={[styles.geoHintRingInner, { backgroundColor: hintFill }]} collapsable={false}>
                  <Ionicons
                    name="information-circle-outline"
                    size={22}
                    color={light ? BRAND_BLUE : ACCENT}
                    style={{ marginRight: 10, marginTop: 1 }}
                  />
                  <Text style={[styles.geoHintText, { color: labelColor, flex: 1 }]}>
                    {testNote}
                  </Text>
                </View>
              </View>
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
  },
  {
    key: 'feed',
    icon: 'newspaper-outline',
    titleKey: 'notifCatFeedTitle',
    descKey: 'notifCatFeedDesc',
  },
  {
    key: 'routesTips',
    icon: 'map-outline',
    titleKey: 'notifCatRoutesTitle',
    descKey: 'notifCatRoutesDesc',
  },
  {
    key: 'productNews',
    icon: 'sparkles-outline',
    titleKey: 'notifCatProductTitle',
    descKey: 'notifCatProductDesc',
  },
];

export function SettingsNotificationsPage({ navigation, route }) {
  const language = useSyncedAppLanguage(route, 'uk');
  const [prefs, setPrefs] = useState(() => ({ ...DEFAULT_NOTIFICATION_PREFS }));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(NOTIFICATIONS_PREFS_KEY);
        if (cancelled) return;
        setPrefs(parseNotificationPrefsRaw(raw));
      } catch (_) {
        /* ignore */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const patchPref = useCallback((key, value) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      AsyncStorage.setItem(NOTIFICATIONS_PREFS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const onMasterPrefChange = useCallback(
    async (next) => {
      if (!next) {
        patchPref('master', false);
        return;
      }
      const ok = await requestWalkReminderNotificationPermission();
      if (!ok) {
        Alert.alert('', st(language, 'walkReminderPermissionDenied'), [
          {
            text: st(language, 'notifSystemButton'),
            onPress: () => {
              Linking.openSettings().catch(() => {});
            },
          },
          { text: 'OK', style: 'cancel' },
        ]);
        return;
      }
      patchPref('master', true);
    },
    [language, patchPref],
  );

  const openSystemSettings = useCallback(() => {
    Linking.openSettings().catch(() => {});
  }, []);

  return (
    <SettingsSubScreenShell navigation={navigation} route={route} titleKey="notifications">
      {({ language, light }) => {
        const labelColor = light ? FIGMA_TEXT : '#FFFFFF';
        const mutedColor = light ? FIGMA_ICON_MUTED : 'rgba(255, 248, 235, 0.86)';
        const borderColor = light ? BORDER_LIGHT : 'rgba(255, 255, 255, 0.26)';
        const ripple = light ? rippleOnLightSurface : rippleOnDarkSurface;
        const pressedBg = light ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.11)';
        const cardFill = light ? '#FFFFFF' : '#1E2128';
        const masterOn = prefs.master;
        const masterPal = notificationSwitchPalette(light, masterOn);
        const geoIconWrap = [styles.notifIconWrap, light ? styles.notifIconWrapLight : styles.geoNotifIconWrapDark];

        const heroStroke = light ? 'rgba(98, 134, 228, 0.28)' : 'rgba(225, 255, 0, 0.38)';
        const heroGradColors = light
          ? ['#C9D7FA', '#E8EEFF', '#F6F8FF']
          : ['#343A28', '#1E2218', '#12150E'];
        const heroGradEnd = light ? { x: 1, y: 1 } : { x: 1, y: 0.85 };
        const heroShadowStyle = light
          ? {
              shadowColor: BRAND_BLUE,
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.2,
              shadowRadius: 22,
              elevation: 6,
            }
          : {
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.65,
              shadowRadius: 28,
              elevation: 14,
            };
        const heroSubtitleColor = light ? 'rgba(30, 30, 30, 0.62)' : 'rgba(255, 255, 255, 0.82)';
        const hintRingColor = light ? 'rgba(98, 134, 228, 0.42)' : 'rgba(225, 255, 0, 0.42)';
        const hintFill = light ? 'rgba(98, 134, 228, 0.08)' : 'rgba(225, 255, 0, 0.14)';
        const rowSubtitleMuted = light ? FIGMA_ICON_MUTED : '#D2DAE8';

        return (
          <View style={light ? styles.lightList : styles.darkListWrap}>
            <View
              collapsable={false}
              style={[styles.geoHeroShell, heroShadowStyle, { borderColor: heroStroke }]}
            >
              <LinearGradient
                colors={heroGradColors}
                locations={light ? [0, 0.55, 1] : [0, 0.45, 1]}
                start={{ x: 0, y: 0 }}
                end={heroGradEnd}
                style={styles.geoHeroGradient}
              >
                <View
                  style={[
                    styles.geoHeroIconWrap,
                    light ? styles.geoHeroIconWrapLight : styles.geoHeroIconWrapDark,
                  ]}
                >
                  <Ionicons name="notifications" size={30} color={light ? BRAND_BLUE : ACCENT} />
                </View>
                <Text style={[styles.geoHeroTitle, { color: labelColor }]}>{st(language, 'notifHeroTitle')}</Text>
                <Text style={[styles.geoHeroSubtitle, { color: heroSubtitleColor }]}>
                  {st(language, 'notifHeroSubtitle')}
                </Text>
              </LinearGradient>
            </View>

            <Text style={[styles.geoSectionLabel, { color: mutedColor }]}>{st(language, 'notifSectionMain')}</Text>
            <View style={[styles.geoRingOuterCard, { backgroundColor: borderColor }]}>
              <View style={[styles.geoRingInnerCard, { backgroundColor: cardFill }]} collapsable={false}>
                <View style={[styles.notifRow, styles.notifRowSingle]}>
                  <View style={geoIconWrap}>
                    <Ionicons name="notifications-outline" size={22} color={light ? BRAND_BLUE : ACCENT} />
                  </View>
                  <View style={styles.notifRowTexts}>
                    <Text style={[styles.notifRowTitle, { color: labelColor }]}>
                      {st(language, 'notifMasterTitle')}
                    </Text>
                    <Text style={[styles.notifRowSubtitle, { color: rowSubtitleMuted }]}>
                      {st(language, 'notifMasterSubtitle')}
                    </Text>
                  </View>
                  <Switch
                    value={masterOn}
                    onValueChange={onMasterPrefChange}
                    disabled={!loaded}
                    trackColor={masterPal.trackColor}
                    thumbColor={masterPal.thumbColor}
                    ios_backgroundColor={masterPal.ios_backgroundColor}
                  />
                </View>
              </View>
            </View>

            <Text style={[styles.geoSectionLabel, { color: mutedColor }]}>{st(language, 'notifSectionTypes')}</Text>
            <View style={[styles.geoRingOuterCard, { backgroundColor: borderColor }]}>
              <View style={[styles.geoRingInnerCard, { backgroundColor: cardFill }]} collapsable={false}>
                {NOTIFICATION_CATEGORY_ROWS.map((row, index) => {
                  const on = prefs[row.key];
                  const pal = notificationSwitchPalette(light, on && masterOn);
                  const isLast = index === NOTIFICATION_CATEGORY_ROWS.length - 1;
                  return (
                    <View
                      key={row.key}
                      style={[
                        styles.notifRow,
                        !isLast ? { borderBottomColor: borderColor } : styles.notifRowSingle,
                        !masterOn && styles.notifRowDimmed,
                      ]}
                    >
                      <View style={geoIconWrap}>
                        <Ionicons name={row.icon} size={22} color={light ? BRAND_BLUE : ACCENT} />
                      </View>
                      <View style={styles.notifRowTexts}>
                        <Text style={[styles.notifRowTitle, { color: labelColor }]}>
                          {st(language, row.titleKey)}
                        </Text>
                        <Text style={[styles.notifRowSubtitle, { color: rowSubtitleMuted }]}>
                          {st(language, row.descKey)}
                        </Text>
                      </View>
                      <Switch
                        value={on}
                        onValueChange={(v) => patchPref(row.key, v)}
                        disabled={!loaded || !masterOn}
                        trackColor={pal.trackColor}
                        thumbColor={pal.thumbColor}
                        ios_backgroundColor={pal.ios_backgroundColor}
                      />
                    </View>
                  );
                })}
              </View>
            </View>

            <Text style={[styles.geoSectionLabel, { color: mutedColor }]}>{st(language, 'notifSectionSystem')}</Text>
            <View style={[styles.geoRingOuterCard, { backgroundColor: borderColor }]}>
              <View style={[styles.geoRingInnerCard, { backgroundColor: cardFill }]} collapsable={false}>
                <View style={[styles.notifRow, { borderBottomColor: borderColor }]}>
                  <View style={geoIconWrap}>
                    <Ionicons name="phone-portrait-outline" size={22} color={light ? BRAND_BLUE : ACCENT} />
                  </View>
                  <View style={styles.notifRowTexts}>
                    <Text style={[styles.notifRowTitle, { color: labelColor }]}>
                      {st(language, 'notifSystemTitle')}
                    </Text>
                    <Text style={[styles.notifRowSubtitle, { color: rowSubtitleMuted }]}>
                      {st(language, 'notifSystemDesc')}
                    </Text>
                  </View>
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.notifRow,
                    styles.notifRowSingle,
                    pressed && { backgroundColor: pressedBg },
                  ]}
                  onPress={openSystemSettings}
                  android_ripple={ripple}
                >
                  <View style={geoIconWrap}>
                    <Ionicons name="open-outline" size={22} color={light ? BRAND_BLUE : ACCENT} />
                  </View>
                  <View style={styles.notifRowTexts}>
                    <Text style={[styles.notifRowTitle, { color: labelColor }]}>
                      {st(language, 'notifSystemButton')}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={light ? mutedColor : 'rgba(255, 255, 255, 0.72)'}
                  />
                </Pressable>
              </View>
            </View>

            <View style={[styles.geoHintRingOuter, { backgroundColor: hintRingColor }]}>
              <View style={[styles.geoHintRingInner, { backgroundColor: hintFill }]} collapsable={false}>
                <Ionicons
                  name="information-circle-outline"
                  size={22}
                  color={light ? BRAND_BLUE : ACCENT}
                  style={{ marginRight: 10, marginTop: 1 }}
                />
                <Text style={[styles.geoHintText, { color: labelColor, flex: 1 }]}>
                  {st(language, 'notifFooterHint')}
                </Text>
              </View>
            </View>
          </View>
        );
      }}
    </SettingsSubScreenShell>
  );
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
        const mutedColor = light ? FIGMA_ICON_MUTED : 'rgba(255, 248, 235, 0.86)';
        const borderColor = light ? BORDER_LIGHT : 'rgba(255, 255, 255, 0.26)';
        const cardFill = light ? '#FFFFFF' : '#1E2128';
        const text =
          doc === 'terms' ? getTermsContentForLanguage(language) : getPrivacyContentForLanguage(language);
        return (
          <View style={light ? styles.lightList : styles.darkListWrap}>
            <View style={[styles.geoRingOuterCard, { backgroundColor: borderColor }]}>
              <View
                style={[
                  styles.geoRingInnerCard,
                  { backgroundColor: cardFill, paddingHorizontal: 16, paddingVertical: 16 },
                ]}
                collapsable={false}
              >
                <Text selectable style={[styles.bodyText, { color: labelColor, lineHeight: 22, fontSize: 14 }]}>
                  {text}
                </Text>
              </View>
            </View>
            <View style={[styles.geoHintRingOuter, { backgroundColor: light ? 'rgba(98, 134, 228, 0.42)' : 'rgba(225, 255, 0, 0.42)' }]}>
              <View
                style={[
                  styles.geoHintRingInner,
                  {
                    backgroundColor: light ? 'rgba(98, 134, 228, 0.08)' : 'rgba(225, 255, 0, 0.14)',
                  },
                ]}
                collapsable={false}
              >
                <Ionicons
                  name="information-circle-outline"
                  size={22}
                  color={light ? BRAND_BLUE : ACCENT}
                  style={{ marginRight: 10, marginTop: 1 }}
                />
                <Text style={[styles.geoHintText, { color: mutedColor, flex: 1 }]}>
                  {st(language, 'legalDocScrollHint')}
                </Text>
              </View>
            </View>
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
    const email = getPrivacyContactEmail();
    const url = buildMailto(email, subject, body);
    try {
      const can = await Linking.canOpenURL(url).catch(() => false);
      if (!can) {
        Alert.alert(
          st(language, 'privacyMailFail'),
          `${email}\n\n${st(language, 'privacyMailManualHint')}`,
          [
            { text: st(language, 'adminCancel'), style: 'cancel' },
            {
              text: st(language, 'privacyShareEmailLabel'),
              onPress: () => {
                void Share.share({
                  message: subject ? `${email}\n\n${subject}` : email,
                  title: email,
                });
              },
            },
          ],
        );
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('', st(language, 'privacyMailFail'));
    }
  }, []);

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
      {({ language, light }) => {
        const labelColor = light ? FIGMA_TEXT : '#FFFFFF';
        const mutedColor = light ? FIGMA_ICON_MUTED : 'rgba(255, 248, 235, 0.86)';
        const borderColor = light ? BORDER_LIGHT : 'rgba(255, 255, 255, 0.26)';
        const ripple = light ? rippleOnLightSurface : rippleOnDarkSurface;
        const pressedBg = light ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.11)';
        const cardFill = light ? '#FFFFFF' : '#1E2128';
        const palSwitch = notificationSwitchPalette(light, personalize);
        const shell = privacyShellParams(route);
        const geoIconWrap = [styles.notifIconWrap, light ? styles.notifIconWrapLight : styles.geoNotifIconWrapDark];

        const hintRingColor = light ? 'rgba(98, 134, 228, 0.42)' : 'rgba(225, 255, 0, 0.42)';
        const hintFill = light ? 'rgba(98, 134, 228, 0.08)' : 'rgba(225, 255, 0, 0.14)';
        const heroStroke = light ? 'rgba(98, 134, 228, 0.28)' : 'rgba(225, 255, 0, 0.38)';
        const heroGradColors = light
          ? ['#C9D7FA', '#E8EEFF', '#F6F8FF']
          : ['#343A28', '#1E2218', '#12150E'];
        const heroGradEnd = light ? { x: 1, y: 1 } : { x: 1, y: 0.85 };
        const heroShadowStyle = light
          ? {
              shadowColor: BRAND_BLUE,
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.2,
              shadowRadius: 22,
              elevation: 6,
            }
          : {
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.65,
              shadowRadius: 28,
              elevation: 14,
            };
        const heroSubtitleColor = light ? 'rgba(30, 30, 30, 0.62)' : 'rgba(255, 255, 255, 0.82)';

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
            onPress: () =>
              Alert.alert(st(language, 'privacyExportAlertTitle'), st(language, 'privacyExportAlertBody'), [
                { text: st(language, 'adminCancel'), style: 'cancel' },
                {
                  text: st(language, 'privacyOpenMailApp'),
                  onPress: () =>
                    void openMail(
                      language,
                      st(language, 'privacyMailSubjectExport'),
                      sessionEmail ? `Account: ${sessionEmail}` : '',
                    ),
                },
              ]),
          },
          {
            key: 'privacy_delete',
            icon: 'trash-outline',
            title: st(language, 'privacyRequestDelete'),
            onPress: () =>
              Alert.alert(st(language, 'privacyDeleteAlertTitle'), st(language, 'privacyDeleteAlertBody'), [
                { text: st(language, 'adminCancel'), style: 'cancel' },
                {
                  text: st(language, 'privacyWriteEmail'),
                  style: 'destructive',
                  onPress: () =>
                    void openMail(
                      language,
                      st(language, 'privacyMailSubjectDelete'),
                      sessionEmail ? `Account: ${sessionEmail}` : '',
                    ),
                },
              ]),
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
            delayPressIn={0}
            hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
            style={({ pressed }) => [
              styles.notifRow,
              index < total - 1 ? { borderBottomColor: borderColor } : styles.notifRowSingle,
              pressed && { backgroundColor: pressedBg },
            ]}
            onPress={() => {
              const out = item.onPress?.();
              if (out != null && typeof out.then === 'function') void out.catch(() => {});
            }}
            android_ripple={ripple}
          >
            <View style={geoIconWrap}>
              <Ionicons name={item.icon} size={22} color={light ? BRAND_BLUE : ACCENT} />
            </View>
            <View style={styles.notifRowTexts}>
              <Text style={[styles.notifRowTitle, { color: labelColor }]}>{item.title}</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={light ? mutedColor : 'rgba(255, 255, 255, 0.72)'}
            />
          </Pressable>
        );

        return (
          <View style={light ? styles.lightList : styles.darkListWrap}>
            <View collapsable={false} style={[styles.geoHeroShell, heroShadowStyle, { borderColor: heroStroke }]}>
              <LinearGradient
                colors={heroGradColors}
                locations={light ? [0, 0.55, 1] : [0, 0.45, 1]}
                start={{ x: 0, y: 0 }}
                end={heroGradEnd}
                style={styles.geoHeroGradient}
              >
                <View style={[styles.geoHeroIconWrap, light ? styles.geoHeroIconWrapLight : styles.geoHeroIconWrapDark]}>
                  <Ionicons name="shield-checkmark" size={30} color={light ? BRAND_BLUE : ACCENT} />
                </View>
                <Text style={[styles.geoHeroTitle, { color: labelColor }]}>{st(language, 'privacyHeroTitle')}</Text>
                <Text style={[styles.geoHeroSubtitle, { color: heroSubtitleColor }]}>
                  {st(language, 'privacyHeroSubtitle')}
                </Text>
              </LinearGradient>
            </View>

            <Text style={[styles.geoSectionLabel, { color: mutedColor }]}>
              {st(language, 'privacyOverviewSection')}
            </Text>
            <View style={[styles.geoRingOuterCard, { backgroundColor: borderColor }]}>
              <View
                style={[styles.geoRingInnerCard, { backgroundColor: cardFill, paddingHorizontal: 16, paddingVertical: 16 }]}
                collapsable={false}
              >
                <Text style={[styles.privacyRingSectionTitle, { color: labelColor }]}>
                  {st(language, 'privacySectionCollectTitle')}
                </Text>
                <Text style={[styles.geoHintText, { color: mutedColor, marginBottom: 4 }]}>
                  {st(language, 'privacySectionCollectBody')}
                </Text>
                <View style={[styles.privacyProseDivider, { backgroundColor: borderColor }]} />
                <Text style={[styles.privacyRingSectionTitle, { color: labelColor, marginTop: 4 }]}>
                  {st(language, 'privacySectionUseTitle')}
                </Text>
                <Text style={[styles.geoHintText, { color: mutedColor, marginBottom: 4 }]}>
                  {st(language, 'privacySectionUseBody')}
                </Text>
                <View style={[styles.privacyProseDivider, { backgroundColor: borderColor }]} />
                <Text style={[styles.privacyRingSectionTitle, { color: labelColor, marginTop: 4 }]}>
                  {st(language, 'privacySectionDeviceTitle')}
                </Text>
                <Text style={[styles.geoHintText, { color: mutedColor }]}>{st(language, 'privacySectionDeviceBody')}</Text>
              </View>
            </View>

            <Text style={[styles.geoSectionLabel, { color: mutedColor }]}>
              {st(language, 'privacyPersonalizeSection')}
            </Text>
            <View style={[styles.geoRingOuterCard, { backgroundColor: borderColor }]}>
              <View style={[styles.geoRingInnerCard, { backgroundColor: cardFill }]} collapsable={false}>
                <View style={[styles.notifRow, styles.notifRowSingle]}>
                  <View style={geoIconWrap}>
                    <Ionicons name="sparkles-outline" size={22} color={light ? BRAND_BLUE : ACCENT} />
                  </View>
                  <View style={styles.notifRowTexts}>
                    <Text style={[styles.notifRowTitle, { color: labelColor }]}>
                      {st(language, 'privacyPersonalizeTitle')}
                    </Text>
                    <Text style={[styles.notifRowSubtitle, { color: mutedColor }]}>
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
              </View>
            </View>

            <Text style={[styles.geoSectionLabel, { color: mutedColor }]}>
              {st(language, 'privacySectionDocsTitle')}
            </Text>
            <View style={[styles.geoRingOuterCard, { backgroundColor: borderColor }]}>
              <View style={[styles.geoRingInnerCard, { backgroundColor: cardFill }]} collapsable={false}>
                {docActions.map((item, i) => privacyActionRow(item, i, docActions.length))}
              </View>
            </View>

            <Text style={[styles.geoSectionLabel, { color: mutedColor }]}>
              {st(language, 'privacySectionContactTitle')}
            </Text>
            <View style={[styles.geoRingOuterCard, { backgroundColor: borderColor }]}>
              <View style={[styles.geoRingInnerCard, { backgroundColor: cardFill }]} collapsable={false}>
                {contactActions.map((item, i) => privacyActionRow(item, i, contactActions.length))}
              </View>
            </View>

            <Text style={[styles.geoSectionLabel, { color: mutedColor }]}>
              {st(language, 'privacySectionMoreTitle')}
            </Text>
            <View style={[styles.geoRingOuterCard, { backgroundColor: borderColor }]}>
              <View style={[styles.geoRingInnerCard, { backgroundColor: cardFill }]} collapsable={false}>
                {moreActions.map((item, i) => privacyActionRow(item, i, moreActions.length))}
              </View>
            </View>

            <Text style={[styles.geoSectionLabel, { color: mutedColor }]}>{st(language, 'privacyAccountHint')}</Text>
            <View style={[styles.geoRingOuterCard, { backgroundColor: borderColor }]}>
              <View style={[styles.geoRingInnerCard, { backgroundColor: cardFill }]} collapsable={false}>
                <View style={[styles.notifRow, styles.notifRowSingle]}>
                  <View style={geoIconWrap}>
                    <Ionicons name="person-circle-outline" size={22} color={light ? BRAND_BLUE : ACCENT} />
                  </View>
                  <View style={styles.notifRowTexts}>
                    <Text style={[styles.notifRowTitle, { color: labelColor }]}>
                      {st(language, 'privacyAccountHint')}
                    </Text>
                    <Text style={[styles.notifRowSubtitle, { color: mutedColor }]}>
                      {sessionEmail || st(language, 'privacyGuestHint')}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={[styles.geoHintRingOuter, { backgroundColor: hintRingColor, marginTop: 8 }]}>
              <View style={[styles.geoHintRingInner, { backgroundColor: hintFill }]} collapsable={false}>
                <Ionicons
                  name="mail-outline"
                  size={22}
                  color={light ? BRAND_BLUE : ACCENT}
                  style={{ marginRight: 10, marginTop: 1 }}
                />
                <Text style={[styles.geoHintText, { color: labelColor, flex: 1 }]}>
                  {`${st(language, 'privacyFooterNote')} ${getPrivacyContactEmail()}`}
                </Text>
              </View>
            </View>
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
    const email = getSupportEmail();
    const url = buildMailto(email, subject, body);
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('', st(language, 'helpMailFail'));
    }
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
      {({ language, light }) => {
        const labelColor = light ? FIGMA_TEXT : '#FFFFFF';
        const mutedColor = light ? FIGMA_ICON_MUTED : 'rgba(255,255,255,0.55)';
        const borderColor = light ? BORDER_LIGHT : BORDER_DARK;
        const ripple = light ? rippleOnLightSurface : rippleOnDarkSurface;
        const pressedBg = light ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.04)';
        const shell = privacyShellParams(route);

        const helpRow = (icon, title, onPress, last) => (
          <Pressable
            key={title}
            style={({ pressed }) => [
              styles.notifSystemButton,
              { borderTopColor: borderColor },
              !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: borderColor },
              pressed && { backgroundColor: pressedBg },
            ]}
            onPress={onPress}
            android_ripple={ripple}
          >
            <Ionicons name={icon} size={20} color={light ? BRAND_BLUE : ACCENT} style={styles.rowIcon} />
            <Text
              style={[
                styles.rowLabel,
                { color: light ? BRAND_BLUE : ACCENT, flex: 1 },
              ]}
            >
              {title}
            </Text>
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

        return (
          <View style={light ? styles.lightList : styles.darkListWrap}>
            <View
              style={[
                styles.notifHero,
                light ? styles.notifHeroLight : styles.notifHeroDark,
                { borderColor: light ? 'rgba(98, 134, 228, 0.35)' : 'rgba(255,255,255,0.12)' },
              ]}
            >
              <Ionicons name="help-buoy" size={28} color={light ? BRAND_BLUE : ACCENT} style={styles.notifHeroIcon} />
              <Text style={[styles.notifHeroTitle, { color: labelColor }]}>{st(language, 'helpHeroTitle')}</Text>
              <Text style={[styles.notifHeroSubtitle, { color: mutedColor }]}>
                {st(language, 'helpHeroSubtitle')}
              </Text>
            </View>

            <Text style={[styles.privacySectionBody, { color: labelColor }]}>
              {st(language, 'helpSectionTipsTitle')}
            </Text>
            <Text style={[styles.privacyParagraph, { color: mutedColor }]}>
              {st(language, 'helpSectionTipsBody')}
            </Text>

            <Text style={[styles.privacySectionBody, { color: labelColor }]}>
              {st(language, 'helpSectionWhenTitle')}
            </Text>
            <Text style={[styles.privacyParagraph, { color: mutedColor }]}>
              {st(language, 'helpSectionWhenBody')}
            </Text>

            <Text style={[styles.notifSectionLabel, { color: mutedColor }]}>
              {st(language, 'helpQuickTitle')}
            </Text>
            <View style={[styles.notifCard, { borderColor, backgroundColor: light ? '#FFFFFF' : 'rgba(255,255,255,0.05)' }]}>
              {helpRow('chatbubbles-outline', st(language, 'helpOpenChats'), openChatsFromHelp, false)}
              {helpRow('library-outline', st(language, 'helpOpenFaq'), () => openHelpHttp(language, getHelpFaqUrl()), false)}
              {helpRow('book-outline', st(language, 'helpOpenDocs'), () => openHelpHttp(language, getHelpDocsUrl()), false)}
              {helpRow('mail-outline', st(language, 'helpEmailSupport'), () => {
                openSupportMail(
                  language,
                  st(language, 'helpMailSubjectGeneral'),
                  sessionEmail ? `Account / акаунт: ${sessionEmail}` : '',
                );
              }, false)}
              {helpRow('share-outline', st(language, 'helpShareEmail'), () => shareSupportEmail(language), false)}
              {helpRow('bug-outline', st(language, 'helpReportBug'), () => reportBug(language), true)}
            </View>

            <Text style={[styles.notifSectionLabel, { color: mutedColor }]}>
              {st(language, 'helpMoreTitle')}
            </Text>
            <View style={[styles.notifCard, { borderColor, backgroundColor: light ? '#FFFFFF' : 'rgba(255,255,255,0.05)' }]}>
              {helpRow('shield-checkmark-outline', st(language, 'helpOpenPrivacy'), () => {
                navigation.navigate('SettingsPrivacy', shell);
              }, false)}
              {helpRow('notifications-outline', st(language, 'helpOpenNotifications'), () => {
                navigation.navigate('SettingsNotifications', shell);
              }, false)}
              {helpRow('location-outline', st(language, 'helpOpenGeo'), () => {
                navigation.navigate('SettingsGeo', shell);
              }, false)}
              {helpRow('information-circle-outline', st(language, 'helpOpenAbout'), () => {
                navigation.navigate('SettingsAbout', shell);
              }, false)}
              {helpRow('settings-outline', st(language, 'helpOpenSystem'), () => {
                Linking.openSettings().catch(() => {});
              }, true)}
            </View>

            <View style={[styles.notifCard, { borderColor, marginTop: 4, backgroundColor: light ? '#FFFFFF' : 'rgba(255,255,255,0.05)' }]}>
              <View style={[styles.notifRow, styles.notifRowSingle]}>
                <Ionicons name="person-circle-outline" size={22} color={light ? FIGMA_ICON_MUTED : ROW_ICON_DARK} style={styles.rowIcon} />
                <View style={styles.notifRowTexts}>
                  <Text style={[styles.notifRowTitle, { color: labelColor }]}>
                    {st(language, 'helpAccountHint')}
                  </Text>
                  <Text style={[styles.notifRowSubtitle, { color: mutedColor }]}>
                    {sessionEmail || st(language, 'helpGuestHint')}
                  </Text>
                </View>
              </View>
            </View>

            <Text style={[styles.notifFooter, { color: mutedColor }]}>
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
      {({ language, light }) => {
        const labelColor = light ? FIGMA_TEXT : '#FFFFFF';
        const mutedColor = light ? FIGMA_ICON_MUTED : 'rgba(255,255,255,0.55)';
        const borderColor = light ? BORDER_LIGHT : BORDER_DARK;
        const ripple = light ? rippleOnLightSurface : rippleOnDarkSurface;
        const pressedBg = light ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.04)';
        const shell = privacyShellParams(route);
        const cardFill = light ? '#FFFFFF' : 'rgba(255,255,255,0.05)';
        const iconTint = light ? BRAND_BLUE : ACCENT;

        const aboutRow = (icon, title, onPress, last) => (
          <Pressable
            key={title}
            style={({ pressed }) => [
              styles.notifSystemButton,
              { borderTopColor: borderColor },
              !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: borderColor },
              pressed && { backgroundColor: pressedBg },
            ]}
            onPress={onPress}
            android_ripple={ripple}
          >
            <Ionicons name={icon} size={20} color={light ? BRAND_BLUE : ACCENT} style={styles.rowIcon} />
            <Text
              style={[
                styles.rowLabel,
                { color: light ? BRAND_BLUE : ACCENT, flex: 1 },
              ]}
            >
              {title}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={mutedColor} />
          </Pressable>
        );

        return (
          <View style={light ? styles.lightList : styles.darkListWrap}>
            <View
              style={[
                styles.notifHero,
                light ? styles.notifHeroLight : styles.notifHeroDark,
                { borderColor: light ? 'rgba(98, 134, 228, 0.35)' : 'rgba(255,255,255,0.12)' },
              ]}
            >
              <Ionicons name="book-outline" size={28} color={iconTint} style={styles.notifHeroIcon} />
              <Text style={[styles.notifHeroTitle, { color: labelColor }]}>{st(language, 'guideHeroTitle')}</Text>
              <Text style={[styles.notifHeroSubtitle, { color: mutedColor }]}>
                {st(language, 'guideHeroSubtitle')}
              </Text>
            </View>

            <View
              style={[
                styles.guideVersionBanner,
                { borderColor, backgroundColor: cardFill },
              ]}
            >
              <Text style={[styles.guideVersionLabel, { color: mutedColor }]}>
                {st(language, 'guideVersionLabel')}
              </Text>
              <Text style={[styles.guideVersionValue, { color: labelColor }]}>{ver}</Text>
            </View>

            {GUIDE_CHAPTERS.map((ch) => (
              <View
                key={ch.titleKey}
                style={[
                  styles.guideChapterCard,
                  { borderColor, backgroundColor: cardFill },
                ]}
              >
                <View style={[styles.guideIconCircle, light ? styles.notifIconWrapLight : styles.notifIconWrapDark]}>
                  <Ionicons name={ch.icon} size={22} color={iconTint} />
                </View>
                <View style={styles.guideChapterTextCol}>
                  <Text style={[styles.guideChapterTitle, { color: labelColor }]}>
                    {st(language, ch.titleKey)}
                  </Text>
                  <Text style={[styles.guideChapterBody, { color: mutedColor }]}>
                    {st(language, ch.bodyKey)}
                  </Text>
                </View>
              </View>
            ))}

            <Text style={[styles.notifSectionLabel, { color: mutedColor }]}>
              {st(language, 'guideQuickTitle')}
            </Text>
            <View style={[styles.notifCard, { borderColor, backgroundColor: cardFill }]}>
              {aboutRow('help-circle-outline', st(language, 'guideOpenHelp'), () => {
                navigation.navigate('SettingsHelp', shell);
              }, false)}
              {aboutRow('shield-checkmark-outline', st(language, 'guideOpenPrivacy'), () => {
                navigation.navigate('SettingsPrivacy', shell);
              }, false)}
              {aboutRow('language-outline', st(language, 'guideOpenLanguage'), () => {
                navigation.navigate('SettingsLanguage', shell);
              }, false)}
              {aboutRow('apps-outline', st(language, 'guideOpenPlans'), () => {
                navigation.navigate('ChoosePlan', {
                  user: shell.user,
                  language: shell.language,
                  appTheme: shell.appTheme,
                  fromSettings: true,
                  ...(shell.countryId ? { countryId: shell.countryId } : {}),
                });
              }, false)}
              {aboutRow('globe-outline', st(language, 'guideOpenWebsite'), () => {
                openAboutHttp(language, getKrainaWebsiteUrl());
              }, false)}
              {aboutRow('library-outline', st(language, 'guideOpenFaq'), () => {
                openAboutHttp(language, getHelpFaqUrl());
              }, false)}
              {aboutRow('share-social-outline', st(language, 'guideShareApp'), () => shareApp(language), true)}
            </View>

            <View style={[styles.notifCard, { borderColor, marginTop: 4, backgroundColor: cardFill }]}>
              <View style={[styles.notifRow, styles.notifRowSingle]}>
                <Ionicons name="person-circle-outline" size={22} color={light ? FIGMA_ICON_MUTED : ROW_ICON_DARK} style={styles.rowIcon} />
                <View style={styles.notifRowTexts}>
                  <Text style={[styles.notifRowTitle, { color: labelColor }]}>
                    {st(language, 'guideAccountHint')}
                  </Text>
                  <Text style={[styles.notifRowSubtitle, { color: mutedColor }]}>
                    {sessionEmail || st(language, 'guideGuestHint')}
                  </Text>
                </View>
              </View>
            </View>

            <Text style={[styles.notifFooter, { color: mutedColor }]}>
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

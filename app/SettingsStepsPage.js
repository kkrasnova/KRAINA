import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Pressable,
  Platform,
  Alert,
  Linking,
  DeviceEventEmitter,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { getAppTheme, THEME_CHANGED_EVENT } from './themeStorage';
import { useSyncedAppLanguage } from './useAppLanguage';
import { st } from './settingsI18n';
import { brandFontSans, brandFontSansSemibold, brandFontHeadMedium } from './brandFont';
import { getStepSyncEnabled, setStepSyncEnabled } from './stepSyncStorage';
import {
  requestStepsAccessOutcome,
  isStepsPlatformSupported,
  resetIosHealthSession,
} from './healthSteps';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';

export default function SettingsStepsPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const onAccentTxt = onAccentButtonText(isLight);
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const textMuted = isLight ? '#5C5C5C' : 'rgba(255,255,255,0.68)';
  const screenBg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const cardBg = isLight ? '#FFFFFF' : 'rgba(255,255,255,0.07)';
  const border = isLight ? 'rgba(2, 18, 235, 0.12)' : 'rgba(255,255,255,0.12)';
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const heroGrad0 = isLight ? 'rgba(2,18,235,0.11)' : 'rgba(225,255,0,0.14)';
  const pageGradColors = isLight
    ? [heroGrad0, 'rgba(230, 234, 248, 0.88)', LIGHT_BAR_BG]
    : [heroGrad0, 'rgba(22, 22, 22, 0.96)', APP_SCREEN_BG];
  const pageGradLocations = isLight ? [0, 0.22, 0.92] : [0, 0.2, 0.88];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await getAppTheme();
      if (!cancelled) setAppTheme(t === 'light' ? 'light' : 'dark');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(THEME_CHANGED_EVENT, (v) => {
      setAppTheme(v === 'light' ? 'light' : 'dark');
    });
    return () => sub.remove();
  }, []);

  const reload = useCallback(async () => {
    setEnabled(await getStepSyncEnabled());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const openIosHealth = useCallback(async () => {
    const healthUrl = 'x-apple-health://';
    try {
      if (await Linking.canOpenURL(healthUrl)) {
        await Linking.openURL(healthUrl);
        return;
      }
    } catch {
      /* */
    }
    Linking.openSettings();
  }, []);

  const showStepsDeniedAlert = useCallback(() => {
    const sys = st(language, 'notifSystemButton');
    if (Platform.OS === 'android') {
      Alert.alert('', st(language, 'stepsSyncDenied'), [
        {
          text: st(language, 'stepsSyncOpenHc'),
          onPress: () => {
            try {
              const hc = require('react-native-health-connect');
              hc.openHealthConnectSettings();
            } catch {
              /* */
            }
          },
        },
        { text: sys, onPress: () => void Linking.openSettings().catch(() => {}) },
        { text: 'OK', style: 'cancel' },
      ]);
      return;
    }
    Alert.alert('', st(language, 'stepsSyncDenied'), [
      { text: st(language, 'stepsSyncOpenHealth'), onPress: () => void openIosHealth() },
      { text: sys, onPress: () => void Linking.openSettings().catch(() => {}) },
      { text: 'OK', style: 'cancel' },
    ]);
  }, [language, openIosHealth]);

  const onToggle = async (next) => {
    if (!isStepsPlatformSupported()) {
      return;
    }
    if (!next) {
      await setStepSyncEnabled(false);
      resetIosHealthSession();
      setEnabled(false);
      return;
    }
    setBusy(true);
    try {
      const outcome = await requestStepsAccessOutcome();
      if (outcome === 'ok') {
        await setStepSyncEnabled(true);
        setEnabled(true);
        return;
      }
      await setStepSyncEnabled(false);
      setEnabled(false);
      if (outcome === 'hc_unavailable') {
        Alert.alert('', st(language, 'stepsSyncHcUnavailable'));
      } else {
        showStepsDeniedAlert();
      }
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.includes('health_connect') || msg.includes('SDK')) {
        Alert.alert('', st(language, 'stepsSyncHcUnavailable'));
      } else {
        showStepsDeniedAlert();
      }
      await setStepSyncEnabled(false);
      setEnabled(false);
    } finally {
      setBusy(false);
    }
  };

  const openHc = () => {
    if (Platform.OS !== 'android') return;
    try {
      const hc = require('react-native-health-connect');
      hc.openHealthConnectSettings();
    } catch {
      /* */
    }
  };

  const cardShadow = isLight
    ? {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 14,
        elevation: 3,
      }
    : { elevation: 0 };

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      <LinearGradient
        colors={pageGradColors}
        locations={pageGradLocations}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        replaceCenterTitle={st(language, 'stepsSyncNavShort')}
        hideSendButton
        transparentHeader
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: insets.bottom + 28,
        }}
        showsVerticalScrollIndicator={false}
        {...(Platform.OS === 'ios' ? { contentInsetAdjustmentBehavior: 'never' } : {})}
      >
        <LinearGradient
          colors={
            isLight
              ? ['rgba(2,18,235,0.12)', 'rgba(2,18,235,0.02)']
              : ['rgba(225,255,0,0.18)', 'rgba(225,255,0,0.04)']
          }
          style={[styles.hero, { borderColor: border }]}
        >
          <View style={[styles.heroIcon, { borderColor: accent }]}>
            <Ionicons name="footsteps" size={30} color={accent} />
          </View>
          <Text style={[styles.heroKicker, brandFontHeadMedium, { color: accent }]} numberOfLines={1}>
            {st(language, 'stepsSyncHeroKicker')}
          </Text>
          <Text style={[styles.heroTitle, brandFontHeadMedium, { color: textMain }]} numberOfLines={3}>
            {st(language, 'stepsSyncTitle')}
          </Text>
          <Text style={[styles.heroBody, brandFontSans, { color: textMuted }]}>{st(language, 'stepsSyncBody')}</Text>
        </LinearGradient>

        <View style={[styles.card, { backgroundColor: cardBg, borderColor: border }, cardShadow]}>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: textMain }, brandFontSansSemibold]}>
              {st(language, 'stepsSyncToggle')}
            </Text>
            <Switch
              value={enabled}
              disabled={busy}
              onValueChange={(v) => void onToggle(v)}
              trackColor={{
                false: isLight ? '#D4D4D4' : '#3A3A3E',
                true: isLight ? 'rgba(2,18,235,0.45)' : 'rgba(225,255,0,0.45)',
              }}
              thumbColor={enabled ? accent : isLight ? '#F0F0F0' : '#888'}
            />
          </View>
        </View>

        {Platform.OS === 'android' ? (
          <Pressable
            onPress={openHc}
            android_ripple={ripple}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: accent, opacity: pressed ? 0.92 : busy ? 0.65 : 1 },
            ]}
            disabled={busy}
          >
            <Ionicons name="open-outline" size={22} color={onAccentTxt} />
            <Text style={[styles.ctaText, brandFontSansSemibold, { color: onAccentTxt }]}>
              {st(language, 'stepsSyncOpenHc')}
            </Text>
          </Pressable>
        ) : Platform.OS === 'ios' ? (
          <Pressable
            onPress={() => void openIosHealth()}
            android_ripple={ripple}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: accent, opacity: pressed ? 0.92 : busy ? 0.65 : 1 },
            ]}
            disabled={busy}
          >
            <Ionicons name="heart-outline" size={22} color={onAccentTxt} />
            <Text style={[styles.ctaText, brandFontSansSemibold, { color: onAccentTxt }]}>
              {st(language, 'stepsSyncOpenHealth')}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  scroll: { flex: 1, backgroundColor: 'transparent' },
  hero: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    marginBottom: 18,
    alignItems: 'center',
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  heroKicker: {
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: 20,
    lineHeight: 26,
    textAlign: 'center',
    marginBottom: 10,
    maxWidth: 360,
  },
  heroBody: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 360,
  },
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { flex: 1, marginRight: 12, fontSize: 16 },
  cta: {
    marginTop: 16,
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  ctaText: { fontSize: 16 },
});

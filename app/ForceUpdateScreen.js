import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Linking,
  Alert,
  Pressable,
  DeviceEventEmitter,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAppTheme, THEME_CHANGED_EVENT } from './themeStorage';
import { fetchAppVersionGate } from './fetchAppVersionGate';
import { getForceUpdateTexts } from './appUpdateGateI18n';
import { appLangBase } from './appLang';
import Lemon3DButton from './Lemon3DButton';
import { brandFontText } from './brandFont';
import { LIGHT_BAR_BG } from './AppTopBar';

const BRAND_BLUE = '#6286E4';
const ACCENT = '#E1FF00';
const BG_TOP = '#0A0A0F';
const BG_BOTTOM = '#12121a';

export default function ForceUpdateScreen({ gate, onRecheckResult }) {
  const insets = useSafeAreaInsets();
  const [appTheme, setAppTheme] = useState(() => getAppThemeSync());
  const [lang, setLang] = useState('en');
  const [rechecking, setRechecking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await getAppTheme();
      if (!cancelled) setAppTheme(t === 'light' ? 'light' : 'dark');
      try {
        const raw = await AsyncStorage.getItem('@kraina_app_language');
        if (!cancelled && raw && typeof raw === 'string') {
          const b = raw.split(/[-_]/)[0].toLowerCase();
          setLang(b === 'ru' ? 'uk' : appLangBase(b));
        }
      } catch {
        /* ignore */
      }
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

  const texts = getForceUpdateTexts(lang);
  const light = appTheme === 'light';
  const pal = light
    ? {
        grad0: '#E8EDF7',
        grad1: LIGHT_BAR_BG,
        title: BRAND_BLUE,
        body: '#3A3A3A',
        cardBg: '#FFFFFF',
        cardBorder: 'rgba(98, 134, 228, 0.35)',
        metaBg: 'rgba(98, 134, 228, 0.1)',
        metaText: '#1E1E1E',
        metaMuted: '#5C5C5C',
      }
    : {
        grad0: BG_TOP,
        grad1: BG_BOTTOM,
        title: ACCENT,
        body: 'rgba(255,255,255,0.88)',
        cardBg: 'rgba(225, 255, 0, 0.08)',
        cardBorder: 'rgba(225, 255, 0, 0.35)',
        metaBg: 'rgba(255,255,255,0.06)',
        metaText: '#FFFFFF',
        metaMuted: 'rgba(255,255,255,0.65)',
      };

  const openStore = useCallback(async () => {
    const u = gate?.storeUrl && String(gate.storeUrl).trim();
    if (!u) {
      Alert.alert('', texts.openStoreFail);
      return;
    }
    try {
      const ok = await Linking.canOpenURL(u).catch(() => true);
      if (ok) await Linking.openURL(u);
      else Alert.alert('', texts.openStoreFail);
    } catch {
      Alert.alert('', texts.openStoreFail);
    }
  }, [gate?.storeUrl, texts.openStoreFail]);

  const recheck = useCallback(async () => {
    setRechecking(true);
    try {
      const next = await fetchAppVersionGate();
      onRecheckResult?.(next);
    } finally {
      setRechecking(false);
    }
  }, [onRecheckResult]);

  const logo = light ? require('./assets/kraina-logo-light.png') : require('./assets/kraina-logo-dark.png');

  return (
    <View style={styles.root}>
      <LinearGradient colors={[pal.grad0, pal.grad1]} style={StyleSheet.absoluteFillObject} />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 28,
            paddingHorizontal: 22,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ExpoImage source={logo} style={styles.logo} contentFit="contain" accessibilityLabel="KRAÏNA" />

        <View style={[styles.iconRing, { borderColor: pal.cardBorder }]}>
          <Ionicons name="cloud-download-outline" size={42} color={light ? BRAND_BLUE : ACCENT} />
        </View>

        <Text style={[styles.title, brandFontText, { color: pal.title }]}>{texts.title}</Text>
        <Text style={[styles.body, brandFontText, { color: pal.body }]}>{texts.body}</Text>

        <View style={[styles.metaCard, { backgroundColor: pal.metaBg, borderColor: pal.cardBorder }]}>
          <View style={styles.metaRow}>
            <Text style={[styles.metaLabel, brandFontText, { color: pal.metaMuted }]}>{texts.currentLabel}</Text>
            <Text style={[styles.metaValue, brandFontText, { color: pal.metaText }]}>{gate?.currentVersion}</Text>
          </View>
          <View style={[styles.metaDivider, { backgroundColor: pal.cardBorder }]} />
          <View style={styles.metaRow}>
            <Text style={[styles.metaLabel, brandFontText, { color: pal.metaMuted }]}>{texts.requiredLabel}</Text>
            <Text style={[styles.metaValue, brandFontText, { color: pal.metaText }]}>{gate?.minVersion}</Text>
          </View>
        </View>

        <Lemon3DButton
          label={texts.ctaUpdate}
          onPress={openStore}
          disabled={rechecking}
          minHeight={52}
          textStyle={styles.btnPrimaryText}
          style={styles.btnPrimaryWrap}
        />

        <Pressable
          onPress={recheck}
          disabled={rechecking}
          style={({ pressed }) => [styles.secondaryWrap, { opacity: rechecking ? 0.55 : pressed ? 0.85 : 1 }]}
        >
          {rechecking ? (
            <ActivityIndicator color={light ? BRAND_BLUE : ACCENT} />
          ) : (
            <Text style={[styles.secondaryText, brandFontText, { color: light ? BRAND_BLUE : ACCENT }]}>
              {texts.ctaRecheck}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG_TOP },
  scroll: { flexGrow: 1, alignItems: 'center' },
  logo: { width: 160, height: 36, marginBottom: 20 },
  iconRing: {
    width: 96,
    height: 96,
    borderRadius: 28,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    fontWeight: '400',
    marginBottom: 22,
    maxWidth: 360,
  },
  metaCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 28,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  metaLabel: { fontSize: 13, fontWeight: '500', flexShrink: 0 },
  metaValue: { fontSize: 15, fontWeight: '700', textAlign: 'right', flex: 1 },
  metaDivider: { height: StyleSheet.hairlineWidth, marginVertical: 12 },
  btnPrimaryWrap: { width: '100%', maxWidth: 360, marginBottom: 14 },
  btnPrimaryText: {
    ...brandFontText,
    fontWeight: '700',
    fontSize: 16,
    color: '#101010',
  },
  secondaryWrap: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});

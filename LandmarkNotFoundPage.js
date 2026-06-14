import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Linking,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';

import { ls } from './landmarkScannerI18n';
import { getAppTheme } from './themeStorage';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { persistLandmarkStoryRequest } from './landmarkStoryRequest';

const COORD_RED = '#FF4D4D';

export default function LandmarkNotFoundPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');
  const requestRef = route?.params?.requestRef || '';
  const photoUri = route?.params?.photoUri;
  const scanLatitude =
    typeof route?.params?.scanLatitude === 'number' ? route.params.scanLatitude : null;
  const scanLongitude =
    typeof route?.params?.scanLongitude === 'number' ? route.params.scanLongitude : null;
  const visionHintTitle = route?.params?.visionHintTitle || null;
  const user = route?.params?.user;

  const [attachedLat, setAttachedLat] = useState(
    typeof route?.params?.attachedLatitude === 'number' ? route.params.attachedLatitude : null,
  );
  const [attachedLng, setAttachedLng] = useState(
    typeof route?.params?.attachedLongitude === 'number' ? route.params.attachedLongitude : null,
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let c = false;
    (async () => {
      const t = await getAppTheme();
      if (!c) setAppTheme(t === 'light' ? 'light' : 'dark');
    })();
    return () => {
      c = true;
    };
  }, []);

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const sheetBg = isLight ? '#FFFFFF' : '#1A1A1A';
  const titleColor = isLight ? '#1E1E1E' : '#FFFFFF';
  const subColor = isLight ? '#727272' : '#A8A8A8';

  const openCoordinatesOnMap = useCallback(async () => {
    let lat = attachedLat ?? scanLatitude;
    let lng = attachedLng ?? scanLongitude;
    if (lat == null || lng == null) {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('', ls(language, 'needLocationCoords'));
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        setAttachedLat(lat);
        setAttachedLng(lng);
      } catch {
        Alert.alert('', ls(language, 'needLocationCoords'));
        return;
      }
    }
    const q = `${lat},${lng}`;
    const url =
      Platform.OS === 'ios'
        ? `maps:0,0?q=${encodeURIComponent(q)}`
        : Platform.OS === 'android'
          ? `geo:0,0?q=${lat},${lng}`
          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
    Linking.openURL(url).catch(() => {});
  }, [attachedLat, attachedLng, scanLatitude, scanLongitude, language]);

  const onRequestHistory = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const uid =
        user?.id != null
          ? String(user.id)
          : user?.firebaseUid != null
            ? String(user.firebaseUid)
            : null;
      const res = await persistLandmarkStoryRequest({
        requestRef,
        language,
        userId: uid,
        userEmail: typeof user?.email === 'string' ? user.email : null,
        scanLatitude,
        scanLongitude,
        attachedLatitude: attachedLat,
        attachedLongitude: attachedLng,
        visionHintTitle,
        hasPhoto: !!photoUri,
      });
      if (res.ok) {
        Alert.alert(
          '',
          res.remote ? ls(language, 'requestSent') : ls(language, 'requestSavedLocal'),
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
      } else {
        Alert.alert('', ls(language, 'requestFailed'));
      }
    } catch {
      Alert.alert('', ls(language, 'requestFailed'));
    } finally {
      setSubmitting(false);
    }
  }, [
    submitting,
    requestRef,
    language,
    user,
    scanLatitude,
    scanLongitude,
    attachedLat,
    attachedLng,
    visionHintTitle,
    photoUri,
    navigation,
  ]);

  const onMenu = useCallback(() => {
    Alert.alert('', language === 'uk' ? 'Незабаром' : 'Coming soon');
  }, [language]);

  return (
    <View style={styles.screen}>
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.heroPlaceholder]} />
      )}
      <View style={styles.dim} pointerEvents="none" />
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          style={styles.iconCircle}
          onPress={() => navigation.goBack()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={[styles.headerId, { color: '#FFF' }]} numberOfLines={1}>
          {requestRef}
        </Text>
        <Pressable style={styles.iconCircle} onPress={onMenu} hitSlop={10} accessibilityRole="button">
          <Ionicons name="ellipsis-vertical" size={18} color="#FFF" />
        </Pressable>
      </View>
      <View
        style={[
          styles.sheet,
          {
            paddingBottom: Math.max(insets.bottom, 20),
            backgroundColor: sheetBg,
          },
        ]}
      >
        <Text style={[styles.chevronHint, { color: subColor }]}>⌄</Text>
        <View style={[styles.handle, { backgroundColor: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.2)' }]} />
        <View style={styles.titleRow}>
          <Text style={[styles.refLine, { color: titleColor }]} selectable>
            {requestRef}{' '}
          </Text>
          <Pressable onPress={openCoordinatesOnMap} hitSlop={6}>
            <Text style={styles.coordLink}>{ls(language, 'coordinatesOnMap')}</Text>
          </Pressable>
        </View>
        {visionHintTitle ? (
          <Text style={[styles.hintVision, { color: subColor }]} numberOfLines={2}>
            {visionHintTitle}
          </Text>
        ) : null}
        <Text style={[styles.body, { color: titleColor }]}>{ls(language, 'notInDatabaseBody')}</Text>
        <Pressable
          onPress={onRequestHistory}
          disabled={submitting}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: accent },
            (pressed || submitting) && { opacity: 0.88 },
          ]}
        >
          {submitting ? (
            <ActivityIndicator color={onAccentButtonText(isLight)} />
          ) : (
            <Text style={[styles.ctaText, { color: onAccentButtonText(isLight) }]}>
              {ls(language, 'requestHistory')}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000',
  },
  heroPlaceholder: {
    backgroundColor: '#111',
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    zIndex: 4,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '300',
    marginTop: -2,
  },
  headerId: {
    flex: 1,
    marginHorizontal: 8,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 10,
  },
  chevronHint: {
    alignSelf: 'center',
    fontSize: 14,
    marginBottom: 2,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 10,
  },
  refLine: {
    fontSize: 16,
    fontWeight: '700',
  },
  coordLink: {
    fontSize: 15,
    fontWeight: '600',
    color: COORD_RED,
    textDecorationLine: 'underline',
  },
  hintVision: {
    fontSize: 13,
    marginBottom: 12,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 22,
  },
  cta: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
  },
});

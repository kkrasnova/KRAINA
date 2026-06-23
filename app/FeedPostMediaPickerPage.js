import { resolveAppTheme } from './themeStorage';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  FlatList,
  Platform,
  useWindowDimensions,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from './expoAvCompat';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';

import { fc } from './feedComposerI18n';
import { persistCapturedImage } from './feedMediaPersist';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { useFocusEffect } from '@react-navigation/native';
import { fetchDeviceGalleryPreview, resolveDeviceAssetUri } from './deviceGallerySync';

const GRID_GAP = 4;
const MAX_PICK = 10;
const PAGE_SIZE = 90;

export default function FeedPostMediaPickerPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const language = useSyncedAppLanguage(route, 'uk');
  const user = route?.params?.user;
  const countryId = route?.params?.countryId;
  const appTheme = resolveAppTheme(route?.params?.appTheme);
  const isLight = appTheme === 'light';
  const pickerMode = route?.params?.pickerMode === 'story' ? 'story' : 'post';
  const maxPick = pickerMode === 'story' ? 1 : MAX_PICK;
  const publishVisibility = route?.params?.publishVisibility === 'public' ? 'public' : 'followers';
  const initialUris = Array.isArray(route?.params?.initialUris) ? route.params.initialUris.filter(Boolean) : [];
  const pickedLat =
    typeof route?.params?.pickedLat === 'number' && Number.isFinite(route.params.pickedLat)
      ? route.params.pickedLat
      : null;
  const pickedLng =
    typeof route?.params?.pickedLng === 'number' && Number.isFinite(route.params.pickedLng)
      ? route.params.pickedLng
      : null;
  const pickedLabel =
    typeof route?.params?.pickedLabel === 'string' ? route.params.pickedLabel.trim() : '';

  const shell = useMemo(
    () => ({
      user,
      language,
      appTheme,
      ...(countryId != null ? { countryId } : {}),
      publishVisibility,
      ...(pickedLat != null && pickedLng != null
        ? {
            pickedLat,
            pickedLng,
            ...(pickedLabel ? { pickedLabel } : {}),
          }
        : {}),
    }),
    [user, language, appTheme, countryId, publishVisibility, pickedLat, pickedLng, pickedLabel],
  );

  const [pinnedUris] = useState(() => [...initialUris]);
  const [pickedIds, setPickedIds] = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [heroUri, setHeroUri] = useState(initialUris[0] || null);
  const [heroIsVideo, setHeroIsVideo] = useState(() =>
    /\.(mp4|mov|m4v)(\?|$)/i.test(String(initialUris[0] || '')),
  );
  const [busy, setBusy] = useState(false);
  const [pickedExternalUris, setPickedExternalUris] = useState([]);

  const accent = accentForTheme(isLight);

  const thumbSize = useMemo(() => {
    const pad = 12;
    return Math.floor((width - pad * 2 - GRID_GAP * 2) / 3);
  }, [width]);

  const heroH = useMemo(() => Math.min(Math.round(width * 0.92), 420), [width]);

  const loadGalleryAssets = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchDeviceGalleryPreview({ limit: PAGE_SIZE });
      if (!result.granted) {
        Alert.alert('', fc(language, 'galleryDenied'));
        setAssets([]);
        return;
      }
      const rows = [];
      for (const item of result.items || []) {
        rows.push({
          id: item.id,
          uri: item.thumbUri || item.uri,
          mediaType: item.isVideo ? MediaLibrary.MediaType.video : MediaLibrary.MediaType.photo,
          _fullUri: item.uri,
        });
      }
      setAssets(rows);
    } catch {
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => {
    void loadGalleryAssets();
  }, [loadGalleryAssets]);

  useFocusEffect(
    useCallback(() => {
      void loadGalleryAssets();
    }, [loadGalleryAssets]),
  );

  const initialUrisKey = useMemo(() => JSON.stringify(initialUris), [route?.params?.initialUris]);
  useEffect(() => {
    const list = Array.isArray(route?.params?.initialUris) ? route.params.initialUris.filter(Boolean) : [];
    const first = list[0];
    if (!first) return;
    setHeroUri(first);
    setHeroIsVideo(/\.(mp4|mov|m4v)(\?|$)/i.test(String(first)));
  }, [initialUrisKey, route?.params?.initialUris]);

  const totalCount = pinnedUris.length + pickedIds.length + pickedExternalUris.length;
  const canNext = totalCount > 0;

  const toggleLibrary = useCallback(
    (asset) => {
      if (pickerMode === 'story') {
        setPickedExternalUris([]);
      }
      setPickedIds((prev) => {
        const i = prev.indexOf(asset.id);
        if (i >= 0) return prev.filter((id) => id !== asset.id);
        if (pickerMode === 'story') return [asset.id];
        if (pinnedUris.length + prev.length + pickedExternalUris.length >= maxPick) return prev;
        return [...prev, asset.id];
      });
      setHeroUri(asset.uri);
      setHeroIsVideo(asset.mediaType === MediaLibrary.MediaType.video);
    },
    [pinnedUris.length, pickedExternalUris.length, pickerMode, maxPick],
  );

  const openCameraFromPicker = useCallback(() => {
    if (busy) return;
    navigation.navigate('FeedCamera', {
      ...shell,
      publishVisibility,
      cameraInitialMode: pickerMode === 'story' ? 'story' : 'post',
    });
  }, [busy, navigation, shell, publishVisibility, pickerMode]);

  const pickWithSystemGallery = useCallback(async () => {
    if (busy) return;
    const remaining = Math.max(
      0,
      maxPick - (pinnedUris.length + pickedIds.length + pickedExternalUris.length),
    );
    if (remaining <= 0) {
      Alert.alert('', fc(language, 'pickError'));
      return;
    }
    try {
      // iOS: системний PHPicker працює без дозволу на фотогалерею — не блокуємо
      // запуск, інакше галерея «не відкривається» при обмеженому/відхиленому доступі.
      // Android: дозвіл обов'язковий.
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted && Platform.OS !== 'ios') {
        Alert.alert('', fc(language, 'galleryDenied'), [
          { text: fc(language, 'openSettings'), onPress: () => Linking.openSettings().catch(() => {}) },
          { text: fc(language, 'cancel'), style: 'cancel' },
        ]);
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: pickerMode !== 'story',
        quality: 0.92,
        selectionLimit: remaining,
        videoMaxDuration: 180,
      });
      if (res.canceled) return;
      const fresh = (res.assets || [])
        .map((a) => String(a?.uri || '').trim())
        .filter(Boolean);
      if (!fresh.length) return;
      if (pickerMode === 'story') {
        setPickedIds([]);
        setPickedExternalUris(fresh.slice(0, 1));
      } else {
        setPickedExternalUris((prev) => {
          const next = [...prev];
          fresh.forEach((u) => {
            if (!next.includes(u) && next.length < maxPick - pinnedUris.length - pickedIds.length) {
              next.push(u);
            }
          });
          return next.slice(0, maxPick - pinnedUris.length - pickedIds.length);
        });
      }
      const first = fresh[0];
      if (first) {
        setHeroUri(first);
        setHeroIsVideo(/\.(mp4|mov|m4v)(\?|$)/i.test(first));
      }
    } catch {
      Alert.alert('', fc(language, 'pickError'));
    }
  }, [busy, pinnedUris.length, pickedIds.length, pickedExternalUris.length, pickerMode, maxPick, language]);

  const goNext = useCallback(async () => {
    if (!canNext || busy) return;
    setBusy(true);
    try {
      const libParts = [];
      for (const id of pickedIds) {
        const asset = assets.find((a) => a.id === id);
        if (!asset) continue;
        try {
          const u =
            asset._fullUri ||
            (await resolveDeviceAssetUri(asset)) ||
            asset.uri;
          if (u) {
            libParts.push({
              uri: u,
              mimeType: asset.mediaType === MediaLibrary.MediaType.video ? 'video/mp4' : 'image/jpeg',
            });
          }
        } catch {
          if (asset.uri) {
            libParts.push({
              uri: asset._fullUri || asset.uri,
              mimeType: asset.mediaType === MediaLibrary.MediaType.video ? 'video/mp4' : 'image/jpeg',
            });
          }
        }
      }
      const pinnedParts = pinnedUris.map((u) => ({
        uri: u,
        mimeType: /\.(mp4|mov|m4v)(\?|$)/i.test(String(u)) ? 'video/mp4' : undefined,
      }));
      const externalParts = pickedExternalUris.map((u) => ({
        uri: u,
        mimeType: /\.(mp4|mov|m4v)(\?|$)/i.test(String(u)) ? 'video/mp4' : 'image/jpeg',
      }));
      const ordered = [...pinnedParts, ...externalParts, ...libParts];
      const persisted = [];
      for (const part of ordered) {
        const p = await persistCapturedImage(part.uri, { mimeType: part.mimeType });
        if (p) persisted.push(p);
      }
      if (!persisted.length) {
        Alert.alert('', fc(language, 'pickError'));
        return;
      }
      if (pickerMode === 'story') {
        navigation.replace('FeedStoryShare', {
          ...shell,
          uri: persisted[0],
        });
        return;
      }
      navigation.navigate('FeedPostComposer', {
        ...shell,
        uris: persisted,
        publishVisibility,
      });
    } catch {
      Alert.alert('', fc(language, 'pickError'));
    } finally {
      setBusy(false);
    }
  }, [
    canNext,
    busy,
    pickedIds,
    pinnedUris,
    pickedExternalUris,
    assets,
    navigation,
    shell,
    publishVisibility,
    language,
    pickerMode,
  ]);

  const gridData = useMemo(() => [{ __cam: true, id: '__camera__' }, ...assets], [assets]);

  const bg = isLight ? '#FFFFFF' : '#000000';
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const textMuted = isLight ? 'rgba(30,30,30,0.45)' : 'rgba(255,255,255,0.5)';
  const tileBorder = isLight ? 'rgba(30,30,30,0.12)' : 'rgba(255,255,255,0.12)';
  const camTileBg = isLight ? 'rgba(30,30,30,0.06)' : 'rgba(255,255,255,0.08)';

  const renderThumb = ({ item }) => {
    if (item.__cam) {
      return (
        <Pressable
          onPress={openCameraFromPicker}
          disabled={busy}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={fc(language, 'openCamera')}
          style={[
            styles.thumbWrap,
            {
              width: thumbSize,
              height: thumbSize,
              marginBottom: GRID_GAP,
              backgroundColor: camTileBg,
              borderColor: tileBorder,
              opacity: busy ? 0.5 : 1,
            },
          ]}
        >
          <Ionicons name="camera-outline" size={28} color={textMain} />
        </Pressable>
      );
    }
    const selected = pickedIds.includes(item.id);
    const orderNum = selected
      ? pinnedUris.length + pickedExternalUris.length + pickedIds.indexOf(item.id) + 1
      : null;
    return (
      <Pressable
        onPress={() => toggleLibrary(item)}
        style={[
          styles.thumbWrap,
          {
            width: thumbSize,
            height: thumbSize,
            marginBottom: GRID_GAP,
            borderColor: selected ? accent : tileBorder,
            borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
          },
        ]}
      >
        <Image source={{ uri: item.uri }} style={styles.thumbImg} resizeMode="cover" />
        {selected ? (
          <View style={[styles.badge, { backgroundColor: accent, borderColor: accent }]}>
            <Text style={[styles.badgeTxt, { color: onAccentButtonText(isLight) }]}>{orderNum}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: bg, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={[styles.iconBtn, isLight && styles.iconBtnLight]} onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="close" size={24} color={textMain} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: textMain }]}>
          {fc(language, pickerMode === 'story' ? 'story' : 'publication')}
        </Text>
        <Pressable onPress={goNext} disabled={!canNext || busy} hitSlop={12} style={{ minWidth: 56, alignItems: 'flex-end' }}>
          {busy ? (
            <ActivityIndicator color={accent} />
          ) : (
            <Text style={[styles.nextTxt, { color: canNext ? accent : textMuted }]}>{fc(language, 'next')}</Text>
          )}
        </Pressable>
      </View>

      <View style={[styles.heroBox, { height: heroH }]}>
        {heroUri ? (
          heroIsVideo ? (
            <Video
              source={{ uri: heroUri }}
              style={[styles.hero, { borderColor: tileBorder }]}
              resizeMode={ResizeMode.COVER}
              shouldPlay
              isLooping
              isMuted
              useNativeControls={false}
              showPoster
            />
          ) : (
            <Image source={{ uri: heroUri }} style={[styles.hero, { borderColor: tileBorder }]} resizeMode="cover" />
          )
        ) : loading ? (
          <View style={[styles.hero, styles.heroEmpty, { borderColor: tileBorder }]}>
            <ActivityIndicator color={accent} size="large" />
          </View>
        ) : (
          <View style={[styles.hero, styles.heroEmpty, { borderColor: tileBorder }]}>
            <Text style={{ color: textMuted, textAlign: 'center' }}>{fc(language, 'pickError')}</Text>
          </View>
        )}
      </View>

      {loading && !assets.length ? (
        <View style={styles.loaderRow}>
          <ActivityIndicator color={accent} />
        </View>
      ) : (
        <FlatList
          data={gridData}
          keyExtractor={(it) => it.id}
          numColumns={3}
          columnWrapperStyle={styles.colWrap}
          contentContainerStyle={[styles.gridContent, { paddingBottom: insets.bottom + 12 }]}
          renderItem={renderThumb}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS === 'android'}
          maxToRenderPerBatch={12}
          windowSize={5}
          initialNumToRender={12}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnLight: {
    backgroundColor: 'rgba(30,30,30,0.06)',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
  nextTxt: { fontSize: 16, fontWeight: '700' },
  externalPickRow: {
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: 8,
  },
  externalPickBtn: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  externalPickText: { fontSize: 14, fontWeight: '700' },
  heroBox: { paddingHorizontal: 12, marginTop: 4 },
  hero: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: '#222',
  },
  heroEmpty: { alignItems: 'center', justifyContent: 'center' },
  loaderRow: { paddingVertical: 24, alignItems: 'center' },
  gridContent: { paddingHorizontal: 12, paddingTop: 10 },
  colWrap: { justifyContent: 'flex-start', gap: GRID_GAP },
  thumbWrap: {
    marginRight: GRID_GAP,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  thumbImg: { width: '100%', height: '100%' },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  badgeTxt: { fontSize: 12, fontWeight: '800' },
  videoCorner: {
    position: 'absolute',
    bottom: 5,
    left: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
});

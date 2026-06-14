import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  TextInput,
  FlatList,
  useWindowDimensions,
  Modal,
  Platform,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { Video, ResizeMode } from './expoAvCompat';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';

import { fc } from './feedComposerI18n';
import { prependUserFeedPost } from './feedLocalStorage';
import {
  hasFeedApiToken,
  feedUploadMediaFromUri,
  feedCreatePost,
} from './feedApi';
import { getSavedRoutes, stripRoutePlanForStorage } from './profileStorage';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { useAuthStore } from './auth/authStore';
import { emitFeedMediaUpdated } from './feedSyncEvents';
import { errorToUserText } from './errorText';

export default function FeedPostComposerPage({ navigation, route }) {
  const uris = route.params?.uris || [];
  const publishVisibility = route.params?.publishVisibility === 'followers' ? 'followers' : 'public';
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const language = useSyncedAppLanguage(route, 'uk');
  const authUser = useAuthStore((s) => s.user);
  const user = route?.params?.user || authUser;
  const countryId = route?.params?.countryId;
  const appTheme = route?.params?.appTheme || 'dark';
  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const textMuted = isLight ? 'rgba(30,30,30,0.5)' : 'rgba(255,255,255,0.35)';

  const [caption, setCaption] = useState('');
  const [place, setPlace] = useState('');
  const [mapLat, setMapLat] = useState(null);
  const [mapLng, setMapLng] = useState(null);
  const [busy, setBusy] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [savedRoutes, setSavedRoutes] = useState([]);
  const [routeModal, setRouteModal] = useState(false);
  const [routePick, setRoutePick] = useState(null);
  const langUk = language.split(/[-_]/)[0].toLowerCase() === 'uk';
  const mediaListRef = useRef(null);

  const shell = {
    user,
    language,
    appTheme,
    ...(countryId != null ? { countryId } : {}),
    uris,
  };

  useEffect(() => {
    const { pickedLat, pickedLng, pickedLabel } = route.params || {};
    if (pickedLat != null && pickedLng != null) {
      setMapLat(pickedLat);
      setMapLng(pickedLng);
      if (pickedLabel) setPlace(pickedLabel);
      navigation.setParams({
        pickedLat: undefined,
        pickedLng: undefined,
        pickedLabel: undefined,
      });
    }
  }, [route.params?.pickedLat, route.params?.pickedLng, route.params?.pickedLabel, navigation]);

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const r = await getSavedRoutes();
        if (!c) setSavedRoutes(Array.isArray(r) ? r : []);
      } catch {
        if (!c) setSavedRoutes([]);
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  const slideW = width - 48;

  const openCityPicker = useCallback(() => {
    navigation.navigate('PostMapPicker', {
      ...shell,
      previewUri: uris[0],
      pickerMode: 'city',
      initialLat: mapLat ?? 50.45,
      initialLng: mapLng ?? 30.5233,
    });
  }, [navigation, shell, uris, mapLat, mapLng]);

  const openMap = useCallback(() => {
    navigation.navigate('PostMapPicker', {
      ...shell,
      previewUri: uris[0],
      pickerMode: 'map',
      initialLat: mapLat ?? 50.45,
      initialLng: mapLng ?? 30.5233,
    });
  }, [navigation, shell, uris, mapLat, mapLng]);

  const openGalleryPicker = useCallback(() => {
    navigation.navigate('FeedPostMediaPicker', {
      ...shell,
      publishVisibility,
      initialUris: Array.isArray(uris) ? uris : [],
    });
  }, [navigation, shell, publishVisibility, uris]);

  const publish = async () => {
    if (!user || !uris.length || busy) return;
    setBusy(true);
    try {
      const placeLine =
        place.trim() ||
        (mapLat != null && mapLng != null ? `${mapLat.toFixed(3)}, ${mapLng.toFixed(3)}` : '');
      if (hasFeedApiToken()) {
        const remoteUrls = [];
        for (const u of uris) {
          const up = await feedUploadMediaFromUri(u);
          if (up?.url) remoteUrls.push(up.url);
        }
        if (remoteUrls.length) {
          await feedCreatePost({
            media_urls: remoteUrls,
            content_text: caption.trim() || null,
            visibility: publishVisibility,
            place_label: placeLine || null,
            lat: mapLat,
            lng: mapLng,
            route_plan: routePick,
          });
        } else {
          throw new Error('upload');
        }
      } else {
        await prependUserFeedPost(user, {
          uris,
          uri: uris[0],
          caption: caption.trim(),
          place: placeLine,
          lat: mapLat,
          lng: mapLng,
          route_plan: routePick,
        });
      }
      emitFeedMediaUpdated({
        kind: 'post',
        userId: user?.id ? String(user.id) : '',
      });
      Alert.alert('', fc(language, 'publishOk'), [
        {
          text: 'OK',
          onPress: () =>
            navigation.navigate('HomeTabPager', {
              user,
              language,
              appTheme,
              ...(countryId != null ? { countryId } : {}),
              tabIndex: 1,
            }),
        },
      ]);
    } catch (e) {
      Alert.alert('', errorToUserText(e, language));
    } finally {
      setBusy(false);
    }
  };

  if (!uris.length) {
    return (
      <View style={[styles.screen, isLight && styles.screenLight, { paddingTop: insets.top + 20 }]}>
        <Pressable
          style={[styles.iconBtn, isLight && styles.iconBtnLight]}
          onPress={() => navigation.goBack()}
          hitSlop={12}
        >
          <Ionicons name="close" size={26} color={textMain} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.screen, isLight && styles.screenLight]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable style={[styles.iconBtn, isLight && styles.iconBtnLight]} onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="close" size={26} color={textMain} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: textMain }]}>{fc(language, 'newPublication')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.bottom}
      >
        <FlatList
          ref={mediaListRef}
          data={uris}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item, i) => `${i}_${item}`}
          onMomentumScrollEnd={(e) => {
            const x = e.nativeEvent.contentOffset.x;
            const i = Math.round(x / width);
            setSlideIndex(Math.max(0, Math.min(i, uris.length - 1)));
          }}
          renderItem={({ item, index }) => {
            const isVid = /\.(mp4|mov)(\?|$)/i.test(String(item));
            const showOrder = uris.length > 1;
            return (
              <View style={[styles.slide, { width }]}>
                <View style={[styles.heroFrame, { width: slideW }]}>
                  {isVid ? (
                    <Video
                      source={{ uri: item }}
                      style={styles.heroFill}
                      resizeMode={ResizeMode.COVER}
                      shouldPlay
                      isLooping
                      isMuted
                      useNativeControls={false}
                    />
                  ) : (
                    <Image source={{ uri: item }} style={styles.heroFill} resizeMode="cover" />
                  )}
                  {showOrder ? (
                    <View style={[styles.orderBadge, { backgroundColor: accent }]}>
                      <Text style={[styles.orderBadgeText, { color: onAccentButtonText(isLight) }]}>
                        {index + 1}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          }}
        />
        {uris.length > 1 ? (
          <View style={[styles.barRow, { paddingHorizontal: 20 }]}>
            {uris.map((_, i) => (
              <Pressable
                key={i}
                style={styles.barSegWrap}
                onPress={() => {
                  mediaListRef.current?.scrollToOffset({ offset: i * width, animated: true });
                  setSlideIndex(i);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${i + 1} / ${uris.length}`}
              >
                <View
                  style={[
                    styles.barSeg,
                    i === slideIndex && { backgroundColor: accent },
                    isLight && i !== slideIndex && styles.barSegInactiveLight,
                    !isLight && i !== slideIndex && styles.barSegInactiveDark,
                  ]}
                />
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.row2}>
          <Pressable
            style={({ pressed }) => [
              styles.outlineBtn,
              isLight && styles.outlineBtnLight,
              pressed && { opacity: 0.85 },
            ]}
            onPress={openCityPicker}
            android_ripple={ripple}
          >
            <Text style={[styles.outlineBtnText, { color: textMain }]}>{fc(language, 'addCity')}</Text>
            <Ionicons name="chevron-forward" size={18} color={textMain} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.outlineBtn,
              isLight && styles.outlineBtnLight,
              pressed && { opacity: 0.85 },
            ]}
            onPress={openMap}
            android_ripple={ripple}
          >
            <Text style={[styles.outlineBtnText, { color: textMain }]}>{fc(language, 'markOnMap')}</Text>
            <Ionicons name="chevron-forward" size={18} color={textMain} />
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.galleryAddBtn,
            isLight && styles.galleryAddBtnLight,
            pressed && { opacity: 0.88 },
          ]}
          onPress={openGalleryPicker}
          android_ripple={ripple}
        >
          <Ionicons name="images-outline" size={19} color={textMain} />
          <Text style={[styles.galleryAddBtnText, { color: textMain }]}>
            {langUk ? 'Додати з галереї' : 'Add from gallery'}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={textMain} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.routeAttachBtn, pressed && { opacity: 0.88 }]}
          onPress={() => setRouteModal(true)}
          android_ripple={ripple}
        >
          <Ionicons name="navigate-outline" size={18} color="#101010" />
          <Text style={styles.routeAttachBtnText}>{fc(language, 'attachSavedRoute')}</Text>
        </Pressable>
        {routePick ? (
          <View style={[styles.routeHintBox, isLight && styles.routeHintBoxLight]}>
            <Text
              style={[
                styles.routeHintText,
                { color: isLight ? 'rgba(30,30,30,0.75)' : 'rgba(255,255,255,0.85)' },
              ]}
            >
              {fc(language, 'routeAttachedHint')}
            </Text>
            <Pressable onPress={() => setRoutePick(null)} hitSlop={8}>
              <Text style={[styles.routeClearText, { color: accent }]}>{fc(language, 'clearRoute')}</Text>
            </Pressable>
          </View>
        ) : null}

        <TextInput
          style={[
            styles.caption,
            {
              borderColor: isLight ? 'rgba(30,30,30,0.15)' : 'rgba(255,255,255,0.2)',
              color: isLight ? '#1E1E1E' : '#FFFFFF',
            },
          ]}
          placeholder={fc(language, 'captionPlaceholder')}
          placeholderTextColor={textMuted}
          value={caption}
          onChangeText={setCaption}
          multiline
          maxLength={2000}
        />

        <View style={{ flex: 1, minHeight: 8 }} />

        <Pressable
          style={[
            styles.publishBtn,
            { marginBottom: insets.bottom + 16, backgroundColor: accent },
            busy && { opacity: 0.55 },
          ]}
          onPress={publish}
          disabled={busy}
        >
          <Text style={[styles.publishBtnText, { color: onAccentButtonText(isLight) }]}>
            {fc(language, 'publish')}
          </Text>
        </Pressable>
      </KeyboardAvoidingView>

      <Modal visible={routeModal} transparent animationType="fade" onRequestClose={() => setRouteModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: '70%' }]}>
            <Text style={styles.modalTitle}>{fc(language, 'pickRouteTitle')}</Text>
            {savedRoutes.length === 0 ? (
              <Text style={styles.routeEmptyList}>{fc(language, 'noSavedRoutes')}</Text>
            ) : (
              <FlatList
                data={savedRoutes}
                keyExtractor={(it) => String(it.id)}
                style={{ maxHeight: 360 }}
                renderItem={({ item }) => {
                  const plan = item.routePlan;
                  const title =
                    (langUk ? plan?.regionTitleUk : plan?.regionTitleEn || plan?.regionTitleUk) || '—';
                  return (
                    <Pressable
                      style={({ pressed }) => [styles.routePickRow, pressed && { opacity: 0.85 }]}
                      onPress={() => {
                        const stripped = stripRoutePlanForStorage(plan);
                        setRoutePick(stripped);
                        setPlace(
                          (langUk ? stripped?.regionTitleUk : stripped?.regionTitleEn || stripped?.regionTitleUk) ||
                            title,
                        );
                        setRouteModal(false);
                      }}
                    >
                      <Text style={styles.routePickTitle}>{title}</Text>
                      <Ionicons name="chevron-forward" size={18} color="#111" />
                    </Pressable>
                  );
                }}
              />
            )}
            <Pressable style={styles.modalCancel} onPress={() => setRouteModal(false)}>
              <Text style={styles.modalCancelText}>{fc(language, 'cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0A0A' },
  screenLight: { backgroundColor: '#F6F6F6' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 17, fontWeight: '700' },
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
  slide: { alignItems: 'center', paddingTop: 8 },
  heroFrame: {
    height: 280,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#222',
  },
  heroFill: { width: '100%', height: '100%' },
  orderBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderBadgeText: { fontSize: 11, fontWeight: '800' },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 6,
  },
  barSegWrap: { flex: 1 },
  barSeg: {
    height: 3,
    borderRadius: 2,
  },
  barSegInactiveDark: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  barSegInactiveLight: {
    backgroundColor: 'rgba(30,30,30,0.14)',
  },
  row2: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 18,
  },
  outlineBtn: {
    flex: 1,
    marginHorizontal: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  outlineBtnLight: {
    borderColor: 'rgba(30,30,30,0.18)',
  },
  outlineBtnText: { fontSize: 13, fontWeight: '600', flex: 1 },
  galleryAddBtn: {
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  galleryAddBtnLight: {
    borderColor: 'rgba(30,30,30,0.18)',
    backgroundColor: 'rgba(30,30,30,0.04)',
  },
  galleryAddBtnText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '700',
  },
  caption: {
    marginHorizontal: 20,
    marginTop: 16,
    minHeight: 100,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  publishBtn: {
    marginHorizontal: 20,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  publishBtnText: { fontSize: 17, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#F2F2F2',
    borderRadius: 16,
    padding: 18,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 10 },
  modalInput: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: '#111',
  },
  modalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 14 },
  modalCancelText: { color: '#444', fontSize: 16 },
  modalSave: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 18 },
  modalSaveText: { fontWeight: '700', fontSize: 16 },
  routeAttachBtn: {
    marginHorizontal: 20,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F2F2EA',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  routeAttachBtnText: { color: '#101010', fontSize: 14, fontWeight: '700' },
  routeHintBox: {
    marginHorizontal: 20,
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  routeHintBoxLight: {
    backgroundColor: 'rgba(30,30,30,0.06)',
  },
  routeHintText: { fontSize: 12, lineHeight: 16 },
  routeClearText: { fontSize: 13, fontWeight: '700', marginTop: 8 },
  routeEmptyList: { color: '#333', fontSize: 14, marginVertical: 12 },
  routePickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  routePickTitle: { color: '#111', fontSize: 15, fontWeight: '600', flex: 1, marginRight: 8 },
});

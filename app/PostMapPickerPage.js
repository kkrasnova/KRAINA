import { resolveAppTheme } from './themeStorage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Image,
  Platform,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Alert,
  useWindowDimensions,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import Ionicons from '@expo/vector-icons/Ionicons';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';

import { fc } from './feedComposerI18n';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { geocodeAddress, reverseGeocodeLabel } from './googleGeocode';
import { getGoogleMapsApiKey } from './googleMapsRoute';
import { RenderProfiler } from './performanceMetrics';
import { rememberComposerDraft } from './feedComposerDraft';

export default function PostMapPickerPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const language = useSyncedAppLanguage(route, 'uk');
  const previewUri = route.params?.previewUri;
  const initialLat = route.params?.initialLat ?? 50.45;
  const initialLng = route.params?.initialLng ?? 30.5233;
  const pickerMode = route.params?.pickerMode === 'city' ? 'city' : 'map';
  const isLight = (resolveAppTheme(route.params?.appTheme)) === 'light';

  const accent = accentForTheme(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const textMuted = isLight ? 'rgba(30,30,30,0.55)' : 'rgba(255,255,255,0.55)';
  const cardBg = isLight ? 'rgba(255,255,255,0.96)' : 'rgba(28,28,28,0.94)';
  const rowBorder = isLight ? 'rgba(30,30,30,0.08)' : 'rgba(255,255,255,0.08)';

  const mapRef = useRef(null);
  const debounceRef = useRef(null);

  const draftPlace =
    typeof route.params?.composerDraft?.place === 'string'
      ? route.params.composerDraft.place.trim()
      : '';

  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  /** map mode: pin after user taps map */
  const [pin, setPin] = useState(() =>
    pickerMode === 'map' && Number.isFinite(initialLat) && Number.isFinite(initialLng)
      ? { latitude: initialLat, longitude: initialLng }
      : null,
  );
  const [placeName, setPlaceName] = useState(draftPlace);
  const [busyConfirm, setBusyConfirm] = useState(false);

  const hasApiKey = getGoogleMapsApiKey().length > 0;

  const initialCoord = useMemo(
    () => ({ latitude: initialLat, longitude: initialLng }),
    [initialLat, initialLng],
  );

  const finishPlacePick = useCallback(
    (lat, lng, label) => {
      const safeLabel = String(label || '').trim() || fc(language, 'userPin');
      rememberComposerDraft({
        mapLat: lat,
        mapLng: lng,
        place: safeLabel,
      });
      Keyboard.dismiss();
      navigation.goBack();
    },
    [navigation, language],
  );

  const onPickCityRow = useCallback(
    (item) => {
      if (!item || !Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return;
      finishPlacePick(item.lat, item.lng, item.label);
    },
    [finishPlacePick],
  );

  useEffect(() => {
    const q = searchQuery.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!hasApiKey || q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const list = await geocodeAddress(q, language);
      setResults(list);
      setLoading(false);
    }, 450);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, language, hasApiKey]);

  const onPickSearchForMap = useCallback(
    (item) => {
      setPin(null);
      setPlaceName('');
      mapRef.current?.animateToRegion(
        {
          latitude: item.lat,
          longitude: item.lng,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        },
        380,
      );
    },
    [],
  );

  const onMapPress = useCallback(
    (e) => {
      if (pickerMode !== 'map') return;
      const c = e.nativeEvent.coordinate;
      setPin(c);
      (async () => {
        const rev = await reverseGeocodeLabel(c.latitude, c.longitude, language);
        if (rev) setPlaceName(rev);
      })();
    },
    [pickerMode, language],
  );

  const onConfirmMap = useCallback(async () => {
    if (!pin || busyConfirm) return;
    setBusyConfirm(true);
    try {
      let label = placeName.trim();
      if (!label) {
        label = (await reverseGeocodeLabel(pin.latitude, pin.longitude, language)) || '';
      }
      if (!label) label = fc(language, 'userPin');
      finishPlacePick(pin.latitude, pin.longitude, label);
    } finally {
      setBusyConfirm(false);
    }
  }, [pin, placeName, language, busyConfirm, finishPlacePick]);

  const mapReadyCoord = pin || initialCoord;

  return (
    <RenderProfiler id="PostMapPickerPage">
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        pointerEvents={pickerMode === 'city' ? 'none' : 'auto'}
        initialRegion={{
          latitude: initialCoord.latitude,
          longitude: initialCoord.longitude,
          latitudeDelta: 0.06,
          longitudeDelta: 0.06,
        }}
        onPress={pickerMode === 'map' ? onMapPress : undefined}
      >
        {pickerMode === 'map' && pin ? (
          <Marker
            coordinate={pin}
            draggable
            onDragEnd={(e) => {
              const c = e.nativeEvent.coordinate;
              setPin(c);
              (async () => {
                const rev = await reverseGeocodeLabel(c.latitude, c.longitude, language);
                if (rev) setPlaceName(rev);
              })();
            }}
            title={fc(language, 'userPin')}
          />
        ) : null}
      </MapView>

      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top}
        pointerEvents="box-none"
      >
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable style={[styles.iconBtn, isLight && styles.iconBtnLight]} onPress={() => navigation.goBack()} android_ripple={ripple}>
            <Ionicons name="close" size={22} color={textMain} />
          </Pressable>
          <TextInput
            style={[styles.search, isLight && styles.searchLight, { marginLeft: 10 }]}
            placeholder={fc(language, 'search')}
            placeholderTextColor={textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCorrect={false}
            editable={hasApiKey}
            onSubmitEditing={() => {
              if (!hasApiKey) {
                Alert.alert('', fc(language, 'geocodeNoKey'));
                return;
              }
              if (pickerMode === 'city' && results.length === 1) {
                onPickCityRow(results[0]);
              }
            }}
          />
        </View>

        <View
          style={[styles.resultsCard, { top: insets.top + 62, maxHeight: winH * 0.36, backgroundColor: cardBg }]}
          pointerEvents="box-none"
        >
          {!hasApiKey ? (
            <Text style={[styles.hint, { color: textMain }]}>{fc(language, 'geocodeNoKey')}</Text>
          ) : loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={accent} />
            </View>
          ) : results.length ? (
            <FlatList
              data={results}
              keyExtractor={(it) => it.id}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="on-drag"
              removeClippedSubviews={Platform.OS === 'android'}
              maxToRenderPerBatch={10}
              windowSize={3}
              initialNumToRender={5}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [
                    styles.resultRow,
                    { borderBottomColor: rowBorder },
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={() => {
                    Keyboard.dismiss();
                    if (pickerMode === 'city') onPickCityRow(item);
                    else onPickSearchForMap(item);
                  }}
                  hitSlop={6}
                  android_ripple={ripple}
                >
                  <Text style={[styles.resultText, { color: textMain }]} numberOfLines={2}>
                    {item.label}
                  </Text>
                </Pressable>
              )}
            />
          ) : (
            <Text style={[styles.hint, { color: textMuted }]}>
              {searchQuery.trim().length >= 2 ? fc(language, 'geocodeEmpty') : fc(language, 'searchHint')}
            </Text>
          )}
        </View>

        {pickerMode === 'map' ? (
          <View
            style={[
              styles.bottomBar,
              { paddingBottom: insets.bottom + 14 },
              isLight && styles.bottomBarLight,
            ]}
          >
            {!pin ? (
              <Text
                style={[
                  styles.mapHint,
                  { color: isLight ? '#1E1E1E' : '#FFFFFF' },
                  !isLight && {
                    textShadowColor: 'rgba(0,0,0,0.75)',
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 3,
                  },
                ]}
              >
                {fc(language, 'tapMapToPlace')}
              </Text>
            ) : null}
            <TextInput
              style={[styles.labelInput, isLight && styles.labelInputLight]}
              placeholder={fc(language, 'userPin')}
              placeholderTextColor={textMuted}
              value={placeName}
              onChangeText={setPlaceName}
            />
            <Pressable
              style={[
                styles.cta,
                { backgroundColor: accent },
                (!pin || busyConfirm) && { opacity: 0.45 },
              ]}
              onPress={onConfirmMap}
              disabled={!pin || busyConfirm}
              android_ripple={ripple}
            >
              {busyConfirm ? (
                <ActivityIndicator color={onAccentButtonText(isLight)} />
              ) : (
                <Text style={[styles.ctaText, { color: onAccentButtonText(isLight) }]}>
                  {fc(language, 'selectPlace')}
                </Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      {previewUri ? (
        <Pressable
          style={[styles.preview, { top: insets.top + 70, borderColor: accent }]}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={fc(language, 'backToPost')}
        >
          <Image source={{ uri: previewUri }} style={styles.previewImg} resizeMode="cover" />
        </Pressable>
      ) : null}
    </View>
    </RenderProfiler>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  topBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      android: { elevation: 2 },
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
      },
    }),
  },
  iconBtnLight: {
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(30,30,30,0.12)',
  },
  search: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#111',
  },
  searchLight: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(30,30,30,0.1)',
  },
  resultsCard: {
    position: 'absolute',
    left: 12,
    right: 72,
    borderRadius: 12,
    overflow: 'hidden',
    zIndex: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128,128,128,0.2)',
  },
  resultRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultText: { fontSize: 14, lineHeight: 20 },
  hint: { padding: 14, fontSize: 13, lineHeight: 18 },
  loadingRow: { paddingVertical: 20, alignItems: 'center' },
  preview: {
    position: 'absolute',
    right: 16,
    width: 56,
    height: 80,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    zIndex: 20,
  },
  previewImg: { width: '100%', height: '100%' },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  bottomBarLight: {
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  mapHint: {
    fontSize: 13,
    marginBottom: 8,
    textAlign: 'center',
  },
  labelInput: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    marginBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  labelInputLight: {
    borderColor: 'rgba(30,30,30,0.15)',
    color: '#1E1E1E',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  cta: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: { fontSize: 17, fontWeight: '700' },
});

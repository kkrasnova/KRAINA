import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  Platform,
  Keyboard,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSyncedAppLanguage } from './useAppLanguage';
import { brandFontSansMedium } from './brandFont';

import { getAppTheme } from './themeStorage';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { gm } from './geoMapI18n';
import { fetchPublishedLocations, searchLocationsPublished } from './locationsApi';
import { fetchGoogleDirectionsPolyline, getGoogleMapsApiKey, openGoogleMapsDirections } from './googleMapsRoute';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { getSavedLandmarks } from './savedLandmarksStorage';
import { resolveSavedLandmarkRow } from './savedLandmarksResolve';

const UA_CENTER = { latitude: 48.45, longitude: 31.18, latitudeDelta: 6.5, longitudeDelta: 6.5 };

function visitCategoryFromDb(category) {
  const c = String(category || '').toLowerCase();
  if (c === 'museum') return 'museum';
  if (c === 'park') return 'park';
  if (c === 'monument' || c === 'church' || c === 'art') return 'monument';
  return 'other';
}

function normLoc(row) {
  if (!row || !row.id) return null;
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id: String(row.id),
    title: String(row.title || ''),
    city: String(row.city || ''),
    country: String(row.country || ''),
    category: row.category,
    lat,
    lng,
    cover_image_url: row.cover_image_url,
  };
}

function straightCoords(points) {
  if (!points || points.length < 2) return [];
  return points.map((p) => ({ latitude: p.lat, longitude: p.lng }));
}

/**
 * @param {{ navigation: any, route: any, bottomInset?: number, topContentInset?: number | null }} props
 */
export default function GeoMapExplorer({ navigation, route, bottomInset = 0, topContentInset = null }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');
  const mapRef = useRef(null);
  const debounceRef = useRef(null);
  const searchInputRef = useRef(null);

  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [catalog, setCatalog] = useState([]);
  const [searchHits, setSearchHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchNetworkError, setSearchNetworkError] = useState(false);
  const [searchRetryNonce, setSearchRetryNonce] = useState(0);
  const [catalogHint, setCatalogHint] = useState(null);
  const [routeSeq, setRouteSeq] = useState([]);
  const [roadPath, setRoadPath] = useState(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const [userPos, setUserPos] = useState(null);
  const [meta, setMeta] = useState({ distanceM: null, durationSec: null });
  const [mapReady, setMapReady] = useState(false);
  const [savedList, setSavedList] = useState([]);
  const [showSaved, setShowSaved] = useState(false);

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

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(query.trim()), 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { rows, networkError } = await fetchPublishedLocations(45);
      if (cancelled) return;
      const list = rows.map(normLoc).filter(Boolean);
      setCatalog(list);
      if (networkError) setCatalogHint('network');
      else if (!list.length) setCatalogHint('empty');
      else setCatalogHint(null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const q = debouncedQ;
    if (q.length < 2) {
      setSearchHits([]);
      setSearching(false);
      setSearchNetworkError(false);
      return;
    }
    setSearching(true);
    setSearchNetworkError(false);
    (async () => {
      const { rows, networkError } = await searchLocationsPublished(q, 24);
      if (!cancelled) {
        setSearchHits(rows.map(normLoc).filter(Boolean));
        setSearchNetworkError(networkError);
        setSearching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, searchRetryNonce]);

  useEffect(() => {
    let sub;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 30, timeInterval: 8000 },
        (loc) => setUserPos(loc.coords),
      );
    })();
    return () => sub?.remove();
  }, []);

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const textMain = isLight ? '#1E1E1E' : '#F7F7F2';
  const textMuted = isLight ? '#5C5C5C' : '#A8A8A8';
  const cardBg = isLight ? 'rgba(255,255,255,0.96)' : 'rgba(26,26,26,0.94)';
  const cardBorder = isLight ? 'rgba(30,30,30,0.1)' : 'rgba(255,255,255,0.12)';

  const shell = useMemo(
    () => ({
      user: route?.params?.user,
      language,
      ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
      appTheme: isLight ? 'light' : 'dark',
    }),
    [route?.params?.user, route?.params?.countryId, language, isLight],
  );

  const displayPins = useMemo(() => {
    if (debouncedQ.length >= 2) return searchHits;
    return catalog;
  }, [debouncedQ, searchHits, catalog]);

  const drawCoords = useMemo(() => {
    if (roadPath && roadPath.length >= 2) return roadPath;
    return straightCoords(routeSeq);
  }, [roadPath, routeSeq]);

  useEffect(() => {
    if (routeSeq.length < 2) {
      setRoadPath(null);
      setMeta({ distanceM: null, durationSec: null });
      return;
    }
    let cancelled = false;
    setRouteBusy(true);
    const pts = routeSeq.map((p) => ({ latitude: p.lat, longitude: p.lng }));
    const key = getGoogleMapsApiKey();
    (async () => {
      if (key) {
        const { path, distanceM, durationSec } = await fetchGoogleDirectionsPolyline(pts, 'walk', key);
        if (!cancelled) {
          setRoadPath(path && path.length >= 2 ? path : straightCoords(routeSeq));
          setMeta({ distanceM, durationSec });
        }
      } else if (!cancelled) {
        setRoadPath(straightCoords(routeSeq));
        setMeta({ distanceM: null, durationSec: null });
      }
    })().finally(() => {
      if (!cancelled) setRouteBusy(false);
    });
    return () => {
      cancelled = true;
    };
  }, [routeSeq]);

  const fitAll = useCallback(() => {
    const coords = [];
    if (userPos) coords.push({ latitude: userPos.latitude, longitude: userPos.longitude });
    for (const p of displayPins.slice(0, 40)) {
      coords.push({ latitude: p.lat, longitude: p.lng });
    }
    for (const p of routeSeq) coords.push({ latitude: p.lat, longitude: p.lng });
    if (drawCoords.length >= 2) coords.push(...drawCoords);
    if (!mapRef.current || coords.length < 1) return;
    const topPadSafe =
      topContentInset != null && Number.isFinite(Number(topContentInset))
        ? Number(topContentInset)
        : insets.top + 10;
    mapRef.current.fitToCoordinates(coords, {
      edgePadding: {
        top: Math.round(topPadSafe + 100),
        right: 36,
        bottom: 160 + bottomInset,
        left: 36,
      },
      animated: true,
    });
  }, [displayPins, routeSeq, drawCoords, userPos, bottomInset, topContentInset, insets.top]);

  useEffect(() => {
    if (!mapReady) return;
    const t = setTimeout(fitAll, 500);
    return () => clearTimeout(t);
  }, [fitAll, displayPins.length, routeSeq.length, mapReady]);

  const toggleInRoute = useCallback((loc) => {
    if (!loc) return;
    Keyboard.dismiss();
    setRouteSeq((prev) => {
      const i = prev.findIndex((x) => x.id === loc.id);
      if (i >= 0) return prev.filter((x) => x.id !== loc.id);
      if (prev.length >= 12) return prev;
      return [...prev, loc];
    });
  }, []);

  const clearRoute = useCallback(() => {
    setRouteSeq([]);
    setRoadPath(null);
    setMeta({ distanceM: null, durationSec: null });
  }, []);

  const toggleSavedPanel = useCallback(async () => {
    if (showSaved) {
      setShowSaved(false);
      return;
    }
    const rows = await getSavedLandmarks();
    const resolved = rows
      .map((r) => {
        const res = resolveSavedLandmarkRow(r);
        if (!res?.lm) return null;
        const lm = res.lm;
        const lat = Number(lm.lat);
        const lng = Number(lm.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
          id: r.key || `${r.countryId}_${r.landmarkId}`,
          title: language === 'en' ? (r.titleEn || r.titleUk || lm.title || '') : (r.titleUk || r.titleEn || lm.title || ''),
          city: language === 'en' ? (r.regionTitleEn || '') : (r.regionTitleUk || ''),
          country: r.flag || '',
          category: lm.category || 'other',
          lat,
          lng,
          cover_image_url: null,
        };
      })
      .filter(Boolean);
    setSavedList(resolved);
    setShowSaved(true);
  }, [showSaved, language]);

  const navigateRoute = useCallback(() => {
    if (routeSeq.length < 2) return;
    const coords = routeSeq.map((p) => ({ latitude: p.lat, longitude: p.lng }));
    openGoogleMapsDirections(coords, 'walk');
  }, [routeSeq]);

  const centerUser = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted' || !mapRef.current) return;
    const pos = userPos
      ? { latitude: userPos.latitude, longitude: userPos.longitude }
      : await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then((p) => ({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
        }));
    mapRef.current.animateToRegion(
      {
        ...pos,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      },
      420,
    );
  }, [userPos]);

  const openCard = useCallback(
    (loc) => {
      const countryPart = String(loc.country || '').trim();
      const headerTitle =
        countryPart && loc.title ? `${countryPart} — ${loc.title}` : String(loc.title || '').trim();
      const photoUri =
        loc.cover_image_url && /^https?:\/\//i.test(String(loc.cover_image_url))
          ? String(loc.cover_image_url).trim()
          : undefined;
      navigation.navigate('LandmarkResult', {
        ...shell,
        title: loc.title,
        headerTitle: headerTitle || loc.title,
        subtitle: loc.city || loc.country || '',
        extract: '',
        source: 'geoCatalog',
        startPhase: 'full',
        visitCity: loc.city || '',
        visitCategory: visitCategoryFromDb(loc.category),
        visitLat: loc.lat,
        visitLng: loc.lng,
        ...(photoUri ? { photoUri } : {}),
      });
    },
    [navigation, shell],
  );

  const topPad =
    topContentInset != null && Number.isFinite(Number(topContentInset))
      ? Number(topContentInset)
      : insets.top + 10;

  const kmLabel =
    meta.distanceM != null && meta.distanceM > 0
      ? `${(meta.distanceM / 1000).toFixed(1)} ${gm(language, 'routeKm')}`
      : '';
  const minLabel =
    meta.durationSec != null && meta.durationSec > 0
      ? `${Math.round(meta.durationSec / 60)} ${gm(language, 'routeMin')}`
      : '';

  const listData = debouncedQ.length >= 2 ? searchHits : [];

  const handleMapReady = useCallback(() => {
    setMapReady(true);
    fitAll();
  }, [fitAll]);

  return (
    <View style={styles.flex}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={UA_CENTER}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass
        showsScale
        toolbarEnabled
        mapType="standard"
        onMapReady={handleMapReady}
        onPress={() => Keyboard.dismiss()}
      >
        {drawCoords.length >= 2 ? (
          <Polyline
            coordinates={drawCoords}
            strokeColor={accent}
            strokeWidth={4}
            lineDashPattern={roadPath && roadPath.length >= 2 ? undefined : [12, 8]}
          />
        ) : null}
        {displayPins.map((p) => {
          const ord = routeSeq.findIndex((x) => x.id === p.id);
          const inRoute = ord >= 0;
          return (
            <Marker
              key={p.id}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              title={p.title}
              description={p.city}
              onPress={() => toggleInRoute(p)}
              pinColor={inRoute ? accent : undefined}
            />
          );
        })}
      </MapView>

      <View pointerEvents="box-none" collapsable={false} style={StyleSheet.absoluteFill}>
        <View style={[styles.topBlock, { paddingTop: topPad }]}>
          {Platform.OS === 'ios' ? (
            <BlurView
              intensity={isLight ? 72 : 42}
              tint={isLight ? 'light' : 'dark'}
              style={[styles.searchBlur, { borderColor: cardBorder }]}
            >
              <View style={styles.searchRow}>
                <View style={[styles.searchIconWrap, { backgroundColor: isLight ? 'rgba(2,18,235,0.10)' : 'rgba(225,255,0,0.12)' }]}>
                  <Ionicons name="search" size={20} color={accent} />
                </View>
                <TextInput
                  ref={searchInputRef}
                  value={query}
                  onChangeText={setQuery}
                  placeholder={gm(language, 'searchPlaceholder')}
                  placeholderTextColor={textMuted}
                  style={[styles.input, brandFontSansMedium, { color: textMain }]}
                  returnKeyType="search"
                  blurOnSubmit={false}
                  autoCorrect={false}
                  autoCapitalize="none"
                  clearButtonMode="never"
                  underlineColorAndroid="transparent"
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
                {query.length > 0 ? (
                  <Pressable
                    onPress={() => {
                      setQuery('');
                      Keyboard.dismiss();
                    }}
                    hitSlop={12}
                    style={({ pressed }) => [styles.clearSearch, pressed && { opacity: 0.65 }]}
                  >
                    <Ionicons name="close-circle" size={22} color={textMuted} />
                  </Pressable>
                ) : null}
              </View>
            </BlurView>
          ) : (
            <View style={[styles.searchCardAndroid, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <View style={styles.searchRow}>
                <View style={[styles.searchIconWrap, { backgroundColor: isLight ? 'rgba(2,18,235,0.10)' : 'rgba(225,255,0,0.12)' }]}>
                  <Ionicons name="search" size={20} color={accent} />
                </View>
                <TextInput
                  ref={searchInputRef}
                  value={query}
                  onChangeText={setQuery}
                  placeholder={gm(language, 'searchPlaceholder')}
                  placeholderTextColor={textMuted}
                  style={[styles.input, brandFontSansMedium, { color: textMain }]}
                  returnKeyType="search"
                  blurOnSubmit={false}
                  autoCorrect={false}
                  autoCapitalize="none"
                  underlineColorAndroid="transparent"
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
                {query.length > 0 ? (
                  <Pressable
                    onPress={() => {
                      setQuery('');
                      Keyboard.dismiss();
                    }}
                    hitSlop={12}
                    style={({ pressed }) => [styles.clearSearch, pressed && { opacity: 0.65 }]}
                  >
                    <Ionicons name="close-circle" size={22} color={textMuted} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          )}

          {debouncedQ.length > 0 && debouncedQ.length < 2 ? (
            <Text style={[styles.hint, brandFontSansMedium, { color: textMuted }]}>{gm(language, 'searchHint')}</Text>
          ) : null}

          {catalogHint === 'network' && !catalog.length ? (
            <Text style={[styles.hint, brandFontSansMedium, { color: textMuted }]}>{gm(language, 'apiOffline')}</Text>
          ) : null}
          {catalogHint === 'empty' && !catalog.length ? (
            <Text style={[styles.hint, brandFontSansMedium, { color: textMuted }]}>{gm(language, 'catalogEmpty')}</Text>
          ) : null}

          {searchNetworkError && debouncedQ.length >= 2 && !searching ? (
            <View style={[styles.searchErrBox, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <Ionicons name="cloud-offline-outline" size={20} color={accent} style={{ marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.searchErrTxt, brandFontSansMedium, { color: textMain }]}>
                  {gm(language, 'searchFailed')}
                </Text>
                <Pressable
                  onPress={() => setSearchRetryNonce((n) => n + 1)}
                  hitSlop={8}
                  style={({ pressed }) => ({ marginTop: 8, opacity: pressed ? 0.8 : 1 })}
                >
                  <Text style={[styles.searchRetry, { color: accent }]}>{gm(language, 'searchRetry')}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {listData.length > 0 ? (
            <View
              style={[
                styles.listCard,
                { backgroundColor: cardBg, borderColor: cardBorder, maxHeight: 268 },
              ]}
            >
              {searching ? (
                <ActivityIndicator style={{ padding: 20 }} color={accent} />
              ) : (
                <FlatList
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  data={listData}
                  keyExtractor={(it) => it.id}
                  renderItem={({ item }) => {
                    const inR = routeSeq.some((x) => x.id === item.id);
                    return (
                      <View style={[styles.rowOuter, { borderBottomColor: cardBorder }]}>
                        <Pressable
                          onPress={() => toggleInRoute(item)}
                          android_ripple={ripple}
                          style={({ pressed }) => [styles.rowToggle, pressed && { opacity: 0.92 }]}
                        >
                          <View style={styles.rowTextCol}>
                            <Text style={[styles.rowTitle, brandFontSansMedium, { color: textMain }]} numberOfLines={2}>
                              {item.title}
                            </Text>
                            <Text style={[styles.rowSub, { color: textMuted }]} numberOfLines={1}>
                              {item.city}
                              {item.country ? ` · ${item.country}` : ''}
                            </Text>
                          </View>
                          <Ionicons
                            name={inR ? 'checkmark-circle' : 'add-circle-outline'}
                            size={26}
                            color={accent}
                            style={styles.rowRouteIcon}
                          />
                        </Pressable>
                        <Pressable
                          onPress={() => openCard(item)}
                          android_ripple={ripple}
                          style={({ pressed }) => [
                            styles.rowCardBtn,
                            { borderLeftColor: cardBorder, opacity: pressed ? 0.88 : 1 },
                          ]}
                          hitSlop={6}
                        >
                          <Text style={[styles.miniBtnTxt, brandFontSansMedium, { color: accent }]}>
                            {gm(language, 'openCard')}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  }}
                />
              )}
            </View>
          ) : debouncedQ.length >= 2 && !searching && !searchNetworkError ? (
            <Text style={[styles.hint, brandFontSansMedium, { color: textMuted }]}>{gm(language, 'noResults')}</Text>
          ) : null}
        </View>

        <Pressable
          style={[
            styles.fab,
            {
              backgroundColor: isLight ? '#FFFFFF' : '#1E1E1E',
              bottom: 190 + bottomInset + insets.bottom,
            },
          ]}
          onPress={toggleSavedPanel}
          accessibilityRole="button"
          accessibilityLabel={gm(language, 'savedPlaces')}
        >
          <Ionicons name={showSaved ? 'heart' : 'heart-outline'} size={22} color={accent} />
        </Pressable>

        <Pressable
          style={[
            styles.fab,
            {
              backgroundColor: isLight ? '#FFFFFF' : '#1E1E1E',
              bottom: 132 + bottomInset + insets.bottom,
            },
          ]}
          onPress={centerUser}
          accessibilityRole="button"
          accessibilityLabel={gm(language, 'recenter')}
        >
          <Ionicons name="locate" size={22} color={accent} />
        </Pressable>

        {showSaved ? (
          <View
            style={[
              styles.savedPanel,
              {
                backgroundColor: cardBg,
                borderColor: cardBorder,
                bottom: 250 + bottomInset + insets.bottom,
                maxHeight: 200,
              },
            ]}
          >
            {savedList.length === 0 ? (
              <Text style={[styles.hint, { color: textMuted, padding: 16 }]}>
                {gm(language, 'noSaved')}
              </Text>
            ) : (
              <FlatList
                keyboardShouldPersistTaps="handled"
                data={savedList}
                keyExtractor={(it) => it.id}
                renderItem={({ item }) => {
                  const inR = routeSeq.some((x) => x.id === item.id);
                  return (
                    <Pressable
                      onPress={() => toggleInRoute(item)}
                      android_ripple={ripple}
                      style={({ pressed }) => [
                        styles.row,
                        { borderBottomColor: cardBorder, opacity: pressed ? 0.88 : 1 },
                      ]}
                    >
                      <Ionicons name="heart" size={18} color={accent} style={{ marginRight: 10 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowTitle, { color: textMain }]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={[styles.rowSub, { color: textMuted }]} numberOfLines={1}>
                          {item.city} {item.country}
                        </Text>
                      </View>
                      <Ionicons
                        name={inR ? 'checkmark-circle' : 'add-circle-outline'}
                        size={24}
                        color={accent}
                      />
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        ) : null}

        <View
          style={[
            styles.bottomSheet,
            {
              paddingBottom: Math.max(insets.bottom, 10) + bottomInset + 8,
              backgroundColor: cardBg,
              borderTopColor: cardBorder,
            },
          ]}
        >
          <Text style={[styles.sheetTitle, { color: textMain }]}>{gm(language, 'routePoints')}</Text>
          <Text style={[styles.sheetHint, { color: textMuted }]}>{gm(language, 'addHint')}</Text>
          {routeSeq.length > 0 ? (
            <Text style={[styles.seqLine, { color: textMain }]} numberOfLines={2}>
              {routeSeq.map((p, i) => `${i + 1}. ${p.title}`).join(' → ')}
            </Text>
          ) : null}
          {routeBusy ? (
            <View style={styles.busyRow}>
              <ActivityIndicator size="small" color={accent} style={{ marginRight: 8 }} />
              <Text style={[styles.busyTxt, { color: textMuted }]}>{gm(language, 'routeLoading')}</Text>
            </View>
          ) : null}
          {(kmLabel || minLabel) && routeSeq.length >= 2 ? (
            <Text style={[styles.metaLine, { color: accent }]}>
              {[kmLabel, minLabel].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
          <View style={styles.btnRow}>
            <Pressable
              onPress={clearRoute}
              style={({ pressed }) => [
                styles.btnGhost,
                { borderColor: accent, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={[styles.btnGhostTxt, { color: accent }]}>{gm(language, 'clearRoute')}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (routeSeq.length < 2) return;
                fitAll();
              }}
              style={({ pressed }) => [
                styles.btnPrimary,
                { backgroundColor: accent, opacity: pressed ? 0.9 : routeSeq.length < 2 ? 0.45 : 1 },
              ]}
              disabled={routeSeq.length < 2}
            >
              <Text style={[styles.btnPrimaryTxt, { color: onAccentButtonText(isLight) }]}>
                {gm(language, 'buildRoute')}
              </Text>
            </Pressable>
          </View>
          {routeSeq.length >= 2 ? (
            <Pressable
              onPress={navigateRoute}
              style={({ pressed }) => [
                styles.navBtn,
                { backgroundColor: accent, opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <Ionicons name="navigate" size={20} color={onAccentButtonText(isLight)} style={{ marginRight: 8 }} />
              <Text style={[styles.btnPrimaryTxt, { color: onAccentButtonText(isLight) }]}>
                {gm(language, 'navigate') || 'Навігація'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0A0A0A' },
  topBlock: { paddingHorizontal: 16, zIndex: 20 },
  searchBlur: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.11,
        shadowRadius: 14,
      },
    }),
  },
  searchCardAndroid: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    ...Platform.select({
      android: { elevation: 6 },
    }),
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 12,
    minHeight: 48,
  },
  searchIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    paddingHorizontal: 0,
    minHeight: 44,
  },
  clearSearch: { paddingLeft: 4, justifyContent: 'center' },
  searchErrBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchErrTxt: { fontSize: 13, lineHeight: 19 },
  searchRetry: { fontSize: 14, fontWeight: '600' },
  hint: { fontSize: 13, marginTop: 10, marginHorizontal: 2, lineHeight: 18 },
  listCard: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  rowOuter: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 8,
    minHeight: 56,
  },
  rowTextCol: { flex: 1, paddingRight: 6 },
  rowRouteIcon: { marginLeft: 4 },
  rowTitle: { fontSize: 15, lineHeight: 20 },
  rowSub: { fontSize: 12, marginTop: 3, lineHeight: 16 },
  rowCardBtn: {
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderLeftWidth: StyleSheet.hairlineWidth,
    minWidth: 88,
    alignItems: 'center',
  },
  miniBtnTxt: { fontSize: 12, fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: { elevation: 4 },
    }),
  },
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
    zIndex: 25,
  },
  sheetTitle: { fontSize: 16, fontWeight: '700' },
  sheetHint: { fontSize: 12, marginTop: 4, marginBottom: 6 },
  seqLine: { fontSize: 13, lineHeight: 18, marginBottom: 6 },
  busyRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 4 },
  busyTxt: { fontSize: 13 },
  metaLine: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  keyHint: { fontSize: 11, lineHeight: 15, marginBottom: 6 },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  btnGhost: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  btnGhostTxt: { fontSize: 15, fontWeight: '600' },
  btnPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  btnPrimaryTxt: { fontSize: 15, fontWeight: '700' },
  savedPanel: {
    position: 'absolute',
    right: 16,
    width: 280,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    zIndex: 35,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
    }),
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 10,
  },
});

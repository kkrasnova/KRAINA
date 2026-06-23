import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
  Animated,
  DeviceEventEmitter,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { getAppTheme, THEME_CHANGED_EVENT, resolveAppTheme } from './themeStorage';
import { useSyncedAppLanguage } from './useAppLanguage';
import { brandFontHeadBold, brandFontSansMedium, brandFontSansBold, brandFontSansSemibold } from './brandFont';

import { rp } from './routePlannerI18n';
import { lightTabBarScrollContentPadding } from './LightBottomTabBar';
import { resolveRegionIdFromQuery, resolveRegionIdFromOrigin } from './routeRegionsData';
import { buildRoutePlan, haversineKm, buildRouteCoordinates, computeRouteTotalKm, isUserOriginNearRoute, optimizeStopOrder, computeUsedMinutes } from './routePlannerCore';
import { stripRoutePlanForStorage } from './profileStorage';
import { buildRoutePlanCacheId, writeRoutePlanCache } from './routePlanFileCache';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { postSuggestAiRoute } from './aiRouteApi';
import { fetchPublishedLocations } from './locationsApi';

const ROUTE_TRANSPORT = 'walk';
const ROUTE_BUDGET_TIER = 'medium';

const TIME_OPTIONS = [
  { id: '1', hours: 1, key: 'time1h', icon: 'flash-outline' },
  { id: '2', hours: 2, key: 'time2h', icon: 'time-outline' },
  { id: '3', hours: 3, key: 'time3h', icon: 'hourglass-outline' },
  { id: '5', hours: 5, key: 'timeHalfDay', icon: 'sunny-outline' },
  { id: '8', hours: 8, key: 'timeFullDay', icon: 'today-outline' },
  { id: '16', hours: 16, key: 'timeWeekend', icon: 'calendar-outline' },
  { id: '24', hours: 24, key: 'time3days', icon: 'map-outline' },
  { id: '56', hours: 56, key: 'timeWeek', icon: 'globe-outline' },
  { id: '80', hours: 80, key: 'time10days', icon: 'airplane-outline' },
];

const INTEREST_ITEMS = [
  { key: 'landmark', rpKey: 'interestLandmark', icon: 'flag-outline', em: '\u{1F3DB}' },
  { key: 'park', rpKey: 'interestPark', icon: 'leaf-outline', em: '\u{1F333}' },
  { key: 'museum', rpKey: 'interestMuseum', icon: 'easel-outline', em: '\u{1F3A8}' },
  { key: 'cafe', rpKey: 'interestCafe', icon: 'cafe-outline', em: '\u2615' },
  { key: 'architecture', rpKey: 'interestArchitecture', icon: 'business-outline', em: '\u{1F3D7}' },
  { key: 'secret', rpKey: 'interestSecret', icon: 'eye-off-outline', em: '\u{1F510}' },
];

function parseHours(text) {
  const m = String(text || '').match(/(\d+[.,]?\d*)/);
  if (m) return Math.min(240, Math.max(1, parseFloat(m[1].replace(',', '.')) || 6));
  return 6;
}

function normalizeLocationRow(row) {
  const lat = Number(row?.lat);
  const lng = Number(row?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id: String(row?.id || ''),
    title: String(row?.title || '').trim(),
    city: String(row?.city || '').trim(),
    country: String(row?.country || '').trim(),
    category: String(row?.category || '').toLowerCase(),
    lat,
    lng,
  };
}

function categoryMatchesInterests(loc, interests) {
  const c = String(loc?.category || '').toLowerCase();
  const title = String(loc?.title || '').toLowerCase();
  if (interests?.museum && c === 'museum') return true;
  if (interests?.park && c === 'park') return true;
  if (interests?.cafe && (c === 'cafe' || c === 'restaurant')) return true;
  if (interests?.landmark && ['monument', 'church', 'art', 'other'].includes(c)) return true;
  if (
    interests?.architecture &&
    (c === 'art' ||
      c === 'monument' ||
      c === 'church' ||
      /архітектур|фасад|площ|вулиц|facade|square/.test(title))
  ) {
    return true;
  }
  if (interests?.secret && (c === 'other' || /прихован|таємн|secret|маловідом|hidden/.test(title))) {
    return true;
  }
  const anyOn =
    interests?.museum ||
    interests?.park ||
    interests?.cafe ||
    interests?.landmark ||
    interests?.architecture ||
    interests?.secret;
  return !anyOn;
}

function queryTokensForMatch(query) {
  const raw = String(query || '')
    .toLowerCase()
    .replace(/^напр\.?\s*/i, '')
    .replace(/\bнаприклад\b/g, '')
    .trim();
  const chunks = raw
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const tokens = new Set();
  for (const ch of chunks.length ? chunks : raw ? [raw] : []) {
    tokens.add(ch);
    for (const w of ch.split(/\s+/)) {
      if (w.length >= 2) tokens.add(w);
    }
  }
  return [...tokens];
}

function textMatchScore(loc, query) {
  const tokens = queryTokensForMatch(query);
  if (!tokens.length) return 0;
  const inTitle = String(loc.title || '').toLowerCase();
  const inCity = String(loc.city || '').toLowerCase();
  const inCountry = String(loc.country || '').toLowerCase();
  let best = 0;
  for (const q of tokens) {
    if (q.length < 2) continue;
    let score = 0;
    if (inTitle.includes(q)) score += 4;
    if (inCity.includes(q)) score += 3;
    if (inCountry.includes(q)) score += 2;
    if (score > best) best = score;
  }
  return best;
}

function speedKmhLocal(transport) {
  switch (transport) {
    case 'car': return 28;
    case 'bus': return 18;
    case 'train': return 35;
    case 'walk':
    default: return 5;
  }
}

const MAX_ORIGIN_KM = 100;

async function readCurrentUserOrigin() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;
  try {
    const last = await Location.getLastKnownPositionAsync();
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      maximumAge: 15000,
    });
    const coords = pos?.coords || last?.coords;
    if (!coords) return null;
    return { lat: coords.latitude, lng: coords.longitude };
  } catch {
    return null;
  }
}

function buildPlanFromPublishedLocations({
  rows,
  query,
  hours,
  transport,
  language,
  interests,
  userOrigin,
  budgetTier,
}) {
  // Adapt visit time and proximity radius for multi-day trips
  const visitMinutes = hours > 16 ? 50 : hours > 8 ? 45 : 35;
  const nearbyRadiusKm = hours > 16 ? 200 : hours > 8 ? 100 : 50;

  const normalized = rows.map(normalizeLocationRow).filter(Boolean);
  let pool = normalized.filter((loc) => categoryMatchesInterests(loc, interests));
  if (budgetTier === 'free') {
    const freePool = pool.filter((loc) => {
      const c = loc.category;
      return c === 'park' || c === 'monument' || c === 'church' || c === 'other';
    });
    if (freePool.length >= 2) pool = freePool;
  }
  const base =
    userOrigin && Number.isFinite(userOrigin.lat) && Number.isFinite(userOrigin.lng)
      ? { lat: userOrigin.lat, lng: userOrigin.lng }
      : null;
  const scored = pool.map((loc) => {
    const textScore = textMatchScore(loc, query);
    const dist = base ? haversineKm(base, loc) : 0;
    const proximityScore = base ? Math.max(0, 10 - dist * 2) : 0;
    return { loc, score: textScore + proximityScore, dist };
  });
  const candidates = scored.filter(
    ({ score, dist }) => score > 0 || (base && dist <= nearbyRadiusKm),
  );
  if (candidates.length < 2) return null;
  candidates.sort((a, b) => b.score - a.score);
  const speed = speedKmhLocal(transport);
  const timeMult = budgetTier === 'premium' ? 1.12 : budgetTier === 'budget' ? 0.88 : 1;
  const budgetMin = Math.max(1, hours) * 60 * timeMult;
  const startPool = candidates.slice(0, Math.min(5, candidates.length));
  if (base) startPool.sort((a, b) => a.dist - b.dist);
  const start = startPool[0].loc;
  const stops = [start];
  let usedTime = 0;
  let prevCoord = base && haversineKm(base, start) <= MAX_ORIGIN_KM ? base : null;
  if (prevCoord) usedTime += (haversineKm(prevCoord, start) / speed) * 60;
  usedTime += visitMinutes;
  prevCoord = start;
  const remaining = candidates.filter(({ loc }) => loc.id !== start.id).map(({ loc }) => loc);
  while (remaining.length > 0) {
    remaining.sort((a, b) => haversineKm(prevCoord, a) - haversineKm(prevCoord, b));
    let added = false;
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const travelMin = (haversineKm(prevCoord, candidate) / speed) * 60;
      if (usedTime + travelMin + visitMinutes <= budgetMin) {
        stops.push(candidate);
        usedTime += travelMin + visitMinutes;
        prevCoord = candidate;
        remaining.splice(i, 1);
        added = true;
        break;
      }
    }
    if (!added) break;
  }
  if (stops.length < 2) return null;

  // 2-opt: прибираємо зигзаги в порядку зупинок (старт фіксований).
  const anchorForOpt = isUserOriginNearRoute(base, stops) ? base : null;
  let finalStops = optimizeStopOrder(stops, anchorForOpt);

  // Дозаповнення вивільненим часом + точний перерахунок.
  let timeNow = computeUsedMinutes(anchorForOpt, finalStops, speed, () => visitMinutes);
  const usedIds = new Set(finalStops.map((s) => s.id));
  const leftover = candidates.filter(({ loc }) => !usedIds.has(loc.id)).map(({ loc }) => loc);
  let progressed = true;
  while (progressed && leftover.length) {
    progressed = false;
    const last = finalStops[finalStops.length - 1];
    if (!last) break;
    leftover.sort((a, b) => haversineKm(last, a) - haversineKm(last, b));
    for (let i = 0; i < leftover.length; i++) {
      const c = leftover[i];
      const add = (haversineKm(last, c) / speed) * 60 + visitMinutes;
      if (timeNow + add <= budgetMin) {
        finalStops.push(c);
        timeNow += add;
        usedIds.add(c.id);
        leftover.splice(i, 1);
        progressed = true;
        break;
      }
    }
  }
  finalStops = optimizeStopOrder(finalStops, anchorForOpt);
  timeNow = computeUsedMinutes(anchorForOpt, finalStops, speed, () => visitMinutes);

  const stops2 = finalStops;
  const originNear = isUserOriginNearRoute(base, stops2);
  const totalKm = computeRouteTotalKm(originNear ? base : null, stops2);
  const regionCountry = stops2[0]?.country || '';
  const regionCity = stops2[0]?.city || '';
  const regionTitleUk =
    regionCity && regionCountry
      ? `${regionCity}, ${regionCountry}`
      : regionCountry || regionCity || 'Маршрут';
  const coordinates = buildRouteCoordinates(originNear ? base : null, stops2);
  return {
    regionId: `published:${regionCountry || 'global'}`,
    regionTitleUk,
    regionTitleEn: regionTitleUk,
    countryUk: regionCountry || 'Світ',
    countryEn: regionCountry || 'World',
    flag: '\u{1F5FA}\uFE0F',
    stops: stops2.map((s, idx) => ({
      order: idx + 1,
      id: s.id,
      titleUk: s.title || 'Локація',
      titleEn: s.title || 'Location',
      title: s.title || 'Location',
      lat: s.lat,
      lng: s.lng,
      minutes: visitMinutes,
      thumb: null,
    })),
    coordinates,
    totalKm,
    totalMinutes: Math.round(timeNow),
    transport,
    freeOnly: budgetTier === 'free',
    budgetTier: budgetTier || 'medium',
    interests: interests || null,
    userOrigin: originNear ? base : null,
    originNearRegion: originNear,
    aiGenerated: false,
    generatedFromLocations: true,
    language,
  };
}

/**
 * @param {{ navigation: any, route: any, embedHeroPaddingTop?: number }} props
 * embedHeroPaddingTop — коли вкладка під плаваючим перемикачем (напр. MapTab): верхній відступ героя під сегментом.
 */
export default function RouteFinderPage({ navigation, route, embedHeroPaddingTop }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const [appTheme, setAppTheme] = useState(resolveAppTheme(route?.params?.appTheme));
  const initialPlace = route?.params?.initialPlace;
  const [place, setPlace] = useState(() =>
    typeof initialPlace === 'string' && initialPlace.trim()
      ? initialPlace.trim()
      : '',
  );

  useEffect(() => {
    if (typeof route?.params?.initialPlace === 'string' && route.params.initialPlace.trim()) {
      setPlace(route.params.initialPlace.trim());
    }
  }, [route?.params?.initialPlace]);
  const [selectedTime, setSelectedTime] = useState('2');
  const hoursText = String(TIME_OPTIONS.find((t) => t.id === selectedTime)?.hours || 2);
  const [interests, setInterests] = useState({
    landmark: true,
    park: true,
    museum: true,
    cafe: true,
    architecture: false,
    secret: false,
  });
  const [userOrigin, setUserOrigin] = useState(null);
  const [locStatus, setLocStatus] = useState('unknown');
  const [useGeo, setUseGeo] = useState(true);
  const [aiBusy, setAiBusy] = useState(false);
  const [buildStep, setBuildStep] = useState('');

  /* pulse animation for CTA — only when not showing full overlay */
  const ctaPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (aiBusy) {
      ctaPulse.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ctaPulse, { toValue: 1.02, duration: 1400, useNativeDriver: true }),
        Animated.timing(ctaPulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [aiBusy, ctaPulse]);

  useEffect(() => {
    let c = false;
    (async () => {
      const t = await getAppTheme();
      if (!c) setAppTheme(t === 'light' ? 'light' : 'dark');
    })();
    const sub = DeviceEventEmitter.addListener(THEME_CHANGED_EVENT, (v) => {
      setAppTheme(v === 'light' ? 'light' : 'dark');
    });
    return () => {
      c = true;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (route?.params?.appTheme === 'light' || route?.params?.appTheme === 'dark') {
      setAppTheme(route.params.appTheme);
    }
  }, [route?.params?.appTheme]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const origin = await readCurrentUserOrigin();
      if (cancelled) return;
      if (origin) {
        setUserOrigin(origin);
        setLocStatus('granted');
      } else {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (!cancelled) setLocStatus(status === 'granted' ? 'error' : 'denied');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const textMain = isLight ? '#141414' : '#F7F7F2';
  const textMuted = isLight ? '#5E5E5E' : '#9A9A9A';
  const pageBg = isLight ? '#F2F2EA' : '#0A0A0A';
  const surfaceBg = isLight ? '#FFFFFF' : '#161618';
  const fieldBg = isLight ? '#F4F4F0' : 'rgba(255,255,255,0.05)';
  const sectionBg = isLight ? '#FAFAF7' : 'rgba(255,255,255,0.03)';
  const cardBorder = isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.08)';
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const selectedPillBg = isLight ? 'rgba(2,18,235,0.10)' : 'rgba(225,255,0,0.12)';

  const shell = {
    user: route?.params?.user,
    language,
    ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
    appTheme: isLight ? 'light' : 'dark',
  };

  const interestsPayload = useMemo(
    () => ({
      landmark: !!interests.landmark,
      park: !!interests.park,
      museum: !!interests.museum,
      cafe: !!interests.cafe,
      architecture: !!interests.architecture,
      secret: !!interests.secret,
    }),
    [interests.landmark, interests.park, interests.museum, interests.cafe, interests.architecture, interests.secret],
  );

  const toggleInterest = useCallback((key) => {
    setInterests((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (Object.values(next).filter(Boolean).length === 0) return prev;
      return next;
    });
  }, []);

  const resolveUserOrigin = useCallback(async () => {
    if (userOrigin) return userOrigin;
    const origin = await readCurrentUserOrigin();
    if (origin) {
      setUserOrigin(origin);
      setLocStatus('granted');
    }
    return origin;
  }, [userOrigin]);

  const cacheAndNavigate = async (plan) => {
    try {
      const cacheId = buildRoutePlanCacheId(plan.regionId, place, hoursText, ROUTE_BUDGET_TIER);
      await writeRoutePlanCache(cacheId, {
        ...stripRoutePlanForStorage(plan),
        placeQuery: place,
        hoursText,
        budgetTier: ROUTE_BUDGET_TIER,
        interests: interestsPayload,
        cachedAt: new Date().toISOString(),
      });
    } catch (e) {
      if (__DEV__) console.warn('[routePlanFileCache]', e?.message);
    }
    navigation.navigate('RouteResults', {
      ...shell,
      routePlan: plan,
      routeVariant: 0,
      placeQuery: place,
      hoursText,
      budgetTier: ROUTE_BUDGET_TIER,
      interests: interestsPayload,
      freeOnly: false,
      transport: ROUTE_TRANSPORT,
    });
  };

  const onGenerateRoute = async () => {
    const hours = parseHours(hoursText);
    const trimmedPlace = place.trim();
    const origin = useGeo ? await resolveUserOrigin() : null;
    if (!trimmedPlace && !origin) {
      Alert.alert(
        '',
        language === 'en'
          ? 'Enter a city or district, or enable location to build a route nearby.'
          : 'Вкажіть місто чи район або увімкніть геолокацію для маршруту поруч.',
      );
      return;
    }
    setAiBusy(true);
    setBuildStep(rp(language, 'buildingStepCatalog'));
    try {
      let plan = null;
      try {
        const fetchLimit = hours > 16 ? 500 : hours > 8 ? 300 : 160;
        const { rows } = await fetchPublishedLocations(fetchLimit);
        plan = buildPlanFromPublishedLocations({
          rows,
          query: trimmedPlace,
          hours,
          transport: ROUTE_TRANSPORT,
          language,
          interests: interestsPayload,
          userOrigin: origin,
          budgetTier: ROUTE_BUDGET_TIER,
        });
      } catch {
        /* local catalog optional */
      }

      if (!plan?.stops?.length) {
        setBuildStep(rp(language, 'buildingStepRoute'));
        const regionId = trimmedPlace
          ? resolveRegionIdFromQuery(trimmedPlace)
          : resolveRegionIdFromOrigin(origin);
        plan = buildRoutePlan({
          regionId,
          query: trimmedPlace,
          hours,
          transport: ROUTE_TRANSPORT,
          budgetTier: ROUTE_BUDGET_TIER,
          interests: interestsPayload,
          variant: 0,
          language,
          userOrigin: origin,
        });
      }

      if (!plan?.stops?.length) {
        setBuildStep(rp(language, 'aiBuilding'));
        const res = await postSuggestAiRoute({
          place: trimmedPlace,
          hours,
          transport: ROUTE_TRANSPORT,
          interests: interestsPayload,
          budgetTier: ROUTE_BUDGET_TIER,
          language,
          userOrigin: origin ? { lat: origin.lat, lng: origin.lng } : null,
        });
        if (res?.routePlan?.stops?.length) {
          plan = res.routePlan;
        }
      }

      if (!plan?.stops?.length) {
        Alert.alert('', rp(language, 'noStops'));
        return;
      }
      await cacheAndNavigate(plan);
    } catch (e) {
      if (__DEV__) console.warn('[onGenerateRoute]', e?.message);
      Alert.alert('', rp(language, 'aiFail'));
    } finally {
      setAiBusy(false);
      setBuildStep('');
    }
  };

  const isEmbedded =
    embedHeroPaddingTop != null && Number.isFinite(Number(embedHeroPaddingTop));

  /* header gradient colors */
  const gradTop = isLight
    ? [pageBg, pageBg]
    : [pageBg, pageBg];

  const heroPadTop =
    embedHeroPaddingTop != null && Number.isFinite(embedHeroPaddingTop)
      ? embedHeroPaddingTop
      : insets.top + 12;

  const cardShadow = isLight
    ? {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.06,
        shadowRadius: 24,
      }
    : {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.35,
        shadowRadius: 28,
      };

  const section = (children, key) => (
    <View key={key} style={[s.sectionBlock, { backgroundColor: sectionBg, borderColor: cardBorder }]}>
      {children}
    </View>
  );

  return (
    <View style={[s.screen, { backgroundColor: pageBg }]}>
      {aiBusy ? (
        <View style={s.buildOverlay} pointerEvents="auto">
          <View style={[s.buildCard, { backgroundColor: surfaceBg, borderColor: cardBorder }]}>
            <ActivityIndicator size="large" color={accent} />
            <Text style={[s.buildTitle, brandFontSansBold, { color: textMain }]}>
              {rp(language, 'aiBuilding')}
            </Text>
            {buildStep ? (
              <Text style={[s.buildStep, brandFontSansMedium, { color: textMuted }]}>{buildStep}</Text>
            ) : null}
          </View>
        </View>
      ) : null}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: lightTabBarScrollContentPadding(insets.bottom, 32),
          paddingHorizontal: isEmbedded ? 14 : 16,
        }}
        keyboardShouldPersistTaps="handled"
        {...(Platform.OS === 'ios' ? { contentInsetAdjustmentBehavior: 'never' } : {})}
      >
        {/* ─── Hero header ─── */}
        <LinearGradient
          colors={gradTop}
          style={[
            s.heroGrad,
            {
              paddingTop: heroPadTop,
              paddingBottom: isEmbedded ? 12 : 16,
              borderRadius: isEmbedded ? 0 : 0,
            },
          ]}
        >
          <View style={[s.heroPathRow, isEmbedded && { marginTop: 0, marginBottom: 10 }]}>
            <View style={[s.heroPathDot, { backgroundColor: accent, width: 10, height: 10, borderRadius: 5 }]} />
            <View style={[s.heroPathLine, { backgroundColor: accent, opacity: 0.28 }]} />
            <View style={[s.heroPathDotSm, { borderColor: accent }]} />
            <View style={[s.heroPathLine, { backgroundColor: accent, opacity: 0.28 }]} />
            <Ionicons name="flag" size={15} color={accent} />
          </View>

          <Text style={[s.heroTitle, brandFontHeadBold, { color: textMain, fontSize: isEmbedded ? 24 : 28 }]}>
            {rp(language, 'findRoute')}
          </Text>
          <Text style={[s.heroSub, brandFontSansMedium, { color: textMuted }]}>
            {rp(language, 'hintRegion')}
          </Text>
        </LinearGradient>

        <View
          style={[
            s.mainCard,
            isEmbedded && s.mainCardEmbedded,
            {
              backgroundColor: surfaceBg,
              borderColor: cardBorder,
              ...cardShadow,
            },
          ]}
        >
          <View style={s.mainCardInner}>
          <Pressable
            style={({ pressed }) => [
              s.locBanner,
              { backgroundColor: fieldBg, borderColor: useGeo && userOrigin ? accent : cardBorder },
              pressed && { opacity: 0.85 },
            ]}
            onPress={async () => {
              if (useGeo) {
                setUseGeo(false);
              } else {
                setUseGeo(true);
                await resolveUserOrigin();
              }
            }}
            android_ripple={ripple}
          >
            <View style={[s.locIconCircle, { backgroundColor: useGeo && userOrigin ? (isLight ? 'rgba(2,18,235,0.10)' : 'rgba(225,255,0,0.12)') : fieldBg }]}>
              <Ionicons name={useGeo && userOrigin ? 'navigate' : 'navigate-outline'} size={20} color={useGeo ? accent : textMuted} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[s.locTitle, brandFontSansSemibold, { color: textMain }]}>
                {rp(language, 'myLocation')}
              </Text>
              <Text style={[s.locSub, { color: textMuted }]}>
                {!useGeo
                  ? (language === 'en' ? 'Tap to enable — route starts from your location' : 'Натисніть щоб увімкнути — маршрут від вашої геолокації')
                  : userOrigin
                    ? rp(language, 'myLocationHint')
                    : locStatus === 'denied'
                      ? rp(language, 'locationOff')
                      : rp(language, 'myLocationHint')}
              </Text>
            </View>
            {useGeo && userOrigin ? (
              <View style={[s.locCheck, { backgroundColor: accent }]}>
                <Ionicons name="checkmark" size={14} color={isLight ? '#FFF' : '#000'} />
              </View>
            ) : !useGeo ? (
              <Ionicons name="location-outline" size={20} color={textMuted} />
            ) : null}
          </Pressable>

          {/* Place input */}
          <View style={[s.inputWrap, { backgroundColor: fieldBg, borderColor: cardBorder }]}>
            <View style={[s.inputIconWrap, { backgroundColor: isLight ? 'rgba(2,18,235,0.10)' : 'rgba(225,255,0,0.12)' }]}>
              <Ionicons name="search" size={20} color={accent} />
            </View>
            <TextInput
              value={place}
              onChangeText={setPlace}
              placeholder={rp(language, 'placePlaceholder')}
              placeholderTextColor={textMuted}
              style={[s.input, brandFontSansMedium, { color: textMain }]}
            />
            {place.length > 0 ? (
              <Pressable onPress={() => setPlace('')} hitSlop={10}>
                <Ionicons name="close-circle" size={20} color={textMuted} />
              </Pressable>
            ) : null}
          </View>

          {section(
            <>
              <Text style={[s.miniLabel, brandFontSansSemibold, { color: textMuted }]}>
                {rp(language, 'timeSection')}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScrollInner}>
                {TIME_OPTIONS.map((opt) => {
                  const sel = selectedTime === opt.id;
                  return (
                    <Pressable
                      key={opt.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: sel }}
                      onPress={() => setSelectedTime(opt.id)}
                      style={({ pressed }) => [
                        s.slidePill,
                        {
                          backgroundColor: sel ? accent : pageBg,
                          borderColor: sel ? accent : cardBorder,
                        },
                        pressed && { opacity: 0.9 },
                      ]}
                      android_ripple={ripple}
                    >
                      <Ionicons
                        name={opt.icon}
                        size={15}
                        color={sel ? onAccentButtonText(isLight) : textMuted}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          s.slidePillTxt,
                          brandFontSansSemibold,
                          { color: sel ? onAccentButtonText(isLight) : textMain },
                        ]}
                      >
                        {rp(language, opt.key)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>,
            'time',
          )}

          {section(
            <>
              <Text style={[s.miniLabel, brandFontSansSemibold, { color: textMuted }]}>
                {rp(language, 'interestsSection')}
              </Text>
              <View style={s.bubbleGrid}>
                {INTEREST_ITEMS.map(({ key, rpKey, em }) => {
                  const on = !!interests[key];
                  return (
                    <Pressable
                      key={key}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      onPress={() => toggleInterest(key)}
                      style={({ pressed }) => [
                        s.bubble,
                        {
                          backgroundColor: on ? selectedPillBg : pageBg,
                          borderColor: on ? accent : cardBorder,
                        },
                        pressed && { opacity: 0.9 },
                      ]}
                      android_ripple={ripple}
                    >
                      <Text style={s.bubbleEmoji}>{em}</Text>
                      <Text
                        style={[s.bubbleTxt, brandFontSansMedium, { color: on ? accent : textMain }]}
                        numberOfLines={1}
                      >
                        {rp(language, rpKey)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>,
            'interests',
          )}

          {/* ─── CTA Button ─── */}
          <Animated.View style={{ transform: [{ scale: ctaPulse }] }}>
            <Pressable
              onPress={onGenerateRoute}
              disabled={aiBusy}
              style={({ pressed }) => [
                s.cta,
                {
                  opacity: aiBusy ? 0.55 : pressed ? 0.94 : 1,
                },
              ]}
              android_ripple={ripple}
            >
              <LinearGradient
                colors={isLight ? ['#0212EB', '#1A3AFF'] : ['#E1FF00', '#C8E600']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.ctaGrad}
              >
                {aiBusy ? (
                  <ActivityIndicator color={onAccentButtonText(isLight)} style={{ marginRight: 10 }} />
                ) : (
                  <Ionicons name="map-outline" size={22} color={onAccentButtonText(isLight)} style={{ marginRight: 10 }} />
                )}
                <Text style={[s.ctaText, brandFontSansBold, { color: onAccentButtonText(isLight) }]}>
                  {rp(language, 'generateRoute')}
                </Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  buildOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  buildCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  buildTitle: {
    fontSize: 17,
    marginTop: 16,
    textAlign: 'center',
  },
  buildStep: {
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  sectionBlock: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 12,
  },

  /* Hero */
  heroGrad: {
    paddingHorizontal: 4,
    paddingBottom: 14,
    overflow: 'hidden',
  },
  heroPathRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 8,
    paddingHorizontal: 10,
  },
  heroPathDot: {},
  heroPathDotSm: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  heroPathLine: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    marginHorizontal: 4,
  },
  heroTitle: {
    fontSize: 28,
    lineHeight: 34,
    marginBottom: 6,
  },
  heroSub: {
    fontSize: 14,
    lineHeight: 20,
  },

  /* Main card */
  mainCard: {
    marginTop: 4,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    ...Platform.select({
      android: { elevation: 6 },
    }),
  },
  mainCardEmbedded: {
    marginTop: 0,
  },
  mainCardInner: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 12,
  },

  /* Location banner */
  locBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  locIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locTitle: { fontSize: 15 },
  locSub: { fontSize: 12, marginTop: 3, lineHeight: 16 },
  locCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Input */
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 16,
  },
  inputIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 8,
    minHeight: 42,
  },

  /* Mini label */
  miniLabel: {
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 10,
  },

  hScrollInner: {
    gap: 8,
    paddingRight: 4,
  },
  slidePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
  },
  slidePillTxt: {
    fontSize: 13,
  },

  /* Budget — toggle strip */
  toggleStrip: {
    flexDirection: 'row',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
  },
  toggleStripItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 999,
  },
  toggleStripTxt: {
    fontSize: 12,
  },

  /* Interests — emoji bubbles */
  bubbleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    gap: 5,
  },
  bubbleEmoji: {
    fontSize: 16,
  },
  bubbleTxt: {
    fontSize: 13,
  },

  /* Transport — pill row */
  transportRow: {
    flexDirection: 'row',
    gap: 8,
  },
  transportPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    gap: 5,
  },
  transportPillTxt: {
    fontSize: 12,
  },

  /* CTA */
  cta: {
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 14,
  },
  ctaGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 17,
    borderRadius: 999,
  },
  ctaText: {
    fontSize: 17,
  },
});

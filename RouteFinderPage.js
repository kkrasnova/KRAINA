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
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { getAppTheme } from './themeStorage';
import { useSyncedAppLanguage } from './useAppLanguage';
import { brandFontHeadBold, brandFontSansMedium, brandFontSansBold, brandFontSansSemibold } from './brandFont';

import { rp } from './routePlannerI18n';
import { lightTabBarExtraScrollPadding } from './LightBottomTabBar';
import { resolveRegionIdFromQuery } from './routeRegionsData';
import { buildRoutePlan, haversineKm } from './routePlannerCore';
import { stripRoutePlanForStorage } from './profileStorage';
import { buildRoutePlanCacheId, writeRoutePlanCache } from './routePlanFileCache';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { postSuggestAiRoute } from './aiRouteApi';
import { fetchPublishedLocations } from './locationsApi';

const { width: SCREEN_W } = Dimensions.get('window');

const BUDGET_ORDER = ['free', 'budget', 'medium'];
const BUDGET_RP_KEY = {
  free: 'budgetFree',
  budget: 'budgetLow',
  medium: 'budgetMid',
};
const BUDGET_ICON = {
  free: 'gift-outline',
  budget: 'wallet-outline',
  medium: 'card-outline',
};

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
  let totalKm = 0;
  if (base) totalKm += haversineKm(base, stops[0]);
  for (let i = 1; i < stops.length; i++) totalKm += haversineKm(stops[i - 1], stops[i]);
  const regionCountry = stops[0]?.country || '';
  const regionCity = stops[0]?.city || '';
  const regionTitleUk =
    regionCity && regionCountry
      ? `${regionCity}, ${regionCountry}`
      : regionCountry || regionCity || 'Маршрут';
  const coordinates = [];
  if (base) coordinates.push({ latitude: base.lat, longitude: base.lng });
  stops.forEach((s) => coordinates.push({ latitude: s.lat, longitude: s.lng }));
  return {
    regionId: `published:${regionCountry || 'global'}`,
    regionTitleUk,
    regionTitleEn: regionTitleUk,
    countryUk: regionCountry || 'Світ',
    countryEn: regionCountry || 'World',
    flag: '\u{1F5FA}\uFE0F',
    stops: stops.map((s, idx) => ({
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
    totalMinutes: Math.round(usedTime),
    transport,
    freeOnly: budgetTier === 'free',
    budgetTier: budgetTier || 'medium',
    interests: interests || null,
    userOrigin: base,
    aiGenerated: false,
    generatedFromLocations: true,
    language,
  };
}

/* ─── Animated floating dot for the header ─── */
function FloatingDot({ delay, size, left, top, color }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 2800 + delay, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 2800 + delay, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, delay]);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -12] });
  const opacity = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.35, 0.8, 0.35] });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left,
        top,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity,
        transform: [{ translateY }],
      }}
    />
  );
}


/**
 * @param {{ navigation: any, route: any, embedHeroPaddingTop?: number }} props
 * embedHeroPaddingTop — коли вкладка під плаваючим перемикачем (напр. MapTab): верхній відступ героя під сегментом.
 */
export default function RouteFinderPage({ navigation, route, embedHeroPaddingTop }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');
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
  const [budgetTier, setBudgetTier] = useState('free');
  const [interests, setInterests] = useState({
    landmark: true,
    park: true,
    museum: true,
    cafe: true,
    architecture: false,
    secret: false,
  });
  const [transport, setTransport] = useState('walk');
  const [userOrigin, setUserOrigin] = useState(null);
  const [locStatus, setLocStatus] = useState('unknown');
  const [useGeo, setUseGeo] = useState(true);
  const [aiBusy, setAiBusy] = useState(false);

  /* pulse animation for CTA */
  const ctaPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (aiBusy) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(ctaPulse, { toValue: 0.96, duration: 600, useNativeDriver: true }),
          Animated.timing(ctaPulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      ).start();
    } else {
      ctaPulse.setValue(1);
    }
  }, [aiBusy, ctaPulse]);

  useEffect(() => {
    let c = false;
    (async () => {
      const t = await getAppTheme();
      if (!c) setAppTheme(t === 'light' ? 'light' : 'dark');
    })();
    return () => { c = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== 'granted') { setLocStatus('denied'); return; }
      setLocStatus('granted');
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) setUserOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {
        if (!cancelled) setLocStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const textMain = isLight ? '#1A1A1A' : '#F5F5F0';
  const textMuted = isLight ? '#6B6B6B' : '#8A8A8A';
  const surfaceBg = isLight ? '#FFFFFF' : '#111111';
  const fieldBg = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)';
  const cardBorder = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
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
    let origin = userOrigin;
    if (!origin) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        try {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserOrigin(origin);
          setLocStatus('granted');
        } catch { /* ignore */ }
      }
    }
    return origin;
  }, [userOrigin]);

  const cacheAndNavigate = async (plan) => {
    try {
      const cacheId = buildRoutePlanCacheId(plan.regionId, place, hoursText, budgetTier);
      await writeRoutePlanCache(cacheId, {
        ...stripRoutePlanForStorage(plan),
        placeQuery: place,
        hoursText,
        budgetTier,
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
      budgetTier,
      interests: interestsPayload,
      freeOnly: budgetTier === 'free',
      transport,
    });
  };

  const onGenerateRoute = async () => {
    const hours = parseHours(hoursText);
    const origin = useGeo ? await resolveUserOrigin() : null;
    setAiBusy(true);
    try {
      const res = await postSuggestAiRoute({
        place,
        hours,
        transport,
        interests: interestsPayload,
        budgetTier,
        language,
        userOrigin: origin ? { lat: origin.lat, lng: origin.lng } : null,
      });
      if (res?.routePlan?.stops?.length) {
        await cacheAndNavigate(res.routePlan);
        return;
      }
      let plan = null;
      try {
        const fetchLimit = hours > 16 ? 500 : hours > 8 ? 300 : 160;
        const { rows } = await fetchPublishedLocations(fetchLimit);
        plan = buildPlanFromPublishedLocations({
          rows,
          query: place,
          hours,
          transport,
          language,
          interests: interestsPayload,
          userOrigin: origin,
          budgetTier,
        });
      } catch { /* fallback below */ }
      if (!plan) {
        const regionId = resolveRegionIdFromQuery(place);
        plan = buildRoutePlan({
          regionId,
          query: place,
          hours,
          transport,
          budgetTier,
          interests: interestsPayload,
          variant: 0,
          language,
          userOrigin: origin,
        });
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
    }
  };

  const modes = [
    { id: 'walk', icon: 'walk-outline', label: language === 'en' ? 'Walk' : 'Пішки' },
    { id: 'car', icon: 'car-outline', label: language === 'en' ? 'Car' : 'Авто' },
    { id: 'train', icon: 'train-outline', label: language === 'en' ? 'Train' : 'Потяг' },
    { id: 'bus', icon: 'bus-outline', label: language === 'en' ? 'Bus' : 'Автобус' },
  ];

  /* header gradient colors */
  const gradTop = isLight
    ? ['#E8ECFF', '#D4DFFF', '#F2F2EA']
    : ['#0A0E1A', '#101828', '#000000'];
  const dotColor = isLight ? '#0212EB' : '#E1FF00';

  const heroPadTop =
    embedHeroPaddingTop != null && Number.isFinite(embedHeroPaddingTop)
      ? embedHeroPaddingTop
      : insets.top + 12;
  const dotEmbedded = embedHeroPaddingTop != null && Number.isFinite(embedHeroPaddingTop);
  const d0 = dotEmbedded ? 26 : insets.top + 38;
  const d1 = dotEmbedded ? 18 : insets.top + 28;
  const d2 = dotEmbedded ? 44 : insets.top + 60;
  const d3 = dotEmbedded ? 34 : insets.top + 52;
  const d4 = dotEmbedded ? 32 : insets.top + 50;

  return (
    <View style={[s.screen, { backgroundColor: isLight ? '#F2F2EA' : '#000' }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + lightTabBarExtraScrollPadding() + 32 }}
        keyboardShouldPersistTaps="handled"
        {...(Platform.OS === 'ios' ? { contentInsetAdjustmentBehavior: 'never' } : {})}
      >
        {/* ─── Hero header with animated dots & route path illustration ─── */}
        <LinearGradient colors={gradTop} style={[s.heroGrad, { paddingTop: heroPadTop }]}>
          {/* floating dots */}
          <FloatingDot delay={0} size={6} left={SCREEN_W * 0.12} top={d0} color={dotColor} />
          <FloatingDot delay={400} size={8} left={SCREEN_W * 0.75} top={d1} color={dotColor} />
          <FloatingDot delay={800} size={5} left={SCREEN_W * 0.55} top={d2} color={dotColor} />
          <FloatingDot delay={200} size={7} left={SCREEN_W * 0.30} top={d3} color={dotColor} />
          <FloatingDot delay={600} size={4} left={SCREEN_W * 0.88} top={d4} color={dotColor} />

          {/* route path illustration */}
          <View style={s.heroPathRow}>
            <View style={[s.heroPathDot, { backgroundColor: accent, width: 14, height: 14, borderRadius: 7 }]} />
            <View style={[s.heroPathLine, { backgroundColor: accent, opacity: 0.3 }]} />
            <View style={[s.heroPathDotSm, { borderColor: accent }]} />
            <View style={[s.heroPathLine, { backgroundColor: accent, opacity: 0.3 }]} />
            <View style={[s.heroPathDotSm, { borderColor: accent }]} />
            <View style={[s.heroPathLine, { backgroundColor: accent, opacity: 0.3 }]} />
            <Ionicons name="flag" size={18} color={accent} />
          </View>

          <Text style={[s.heroTitle, brandFontHeadBold, { color: textMain }]}>
            {rp(language, 'findRoute')}
          </Text>
          <Text style={[s.heroSub, brandFontSansMedium, { color: textMuted }]}>
            {rp(language, 'hintRegion')}
          </Text>
        </LinearGradient>

        {/* ─── Main card ─── */}
        <View style={[s.mainCard, { backgroundColor: surfaceBg, borderColor: cardBorder }]}>

          {/* Location banner */}
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
            <Ionicons name="search-outline" size={20} color={textMuted} style={{ marginRight: 10 }} />
            <TextInput
              value={place}
              onChangeText={(t) => { setPlace(t); if (t.trim().length > 0) setUseGeo(false); }}
              placeholder={rp(language, 'placePlaceholder')}
              placeholderTextColor={textMuted}
              style={[s.input, brandFontSansMedium, { color: textMain }]}
            />
            {place.length > 0 ? (
              <Pressable onPress={() => setPlace('')} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={textMuted} />
              </Pressable>
            ) : null}
          </View>

          {/* ─── Compact inline selectors ─── */}

          {/* Time — horizontal slider pills */}
          <Text style={[s.miniLabel, brandFontSansSemibold, { color: textMuted }]}>
            {rp(language, 'timeSection')}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.hScroll} contentContainerStyle={s.hScrollInner}>
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
                      backgroundColor: sel ? accent : fieldBg,
                      borderColor: sel ? accent : cardBorder,
                    },
                    pressed && { transform: [{ scale: 0.95 }] },
                  ]}
                  android_ripple={ripple}
                >
                  <Ionicons
                    name={opt.icon}
                    size={16}
                    color={sel ? onAccentButtonText(isLight) : textMuted}
                    style={{ marginRight: 5 }}
                  />
                  <Text style={[
                    s.slidePillTxt,
                    brandFontSansSemibold,
                    { color: sel ? onAccentButtonText(isLight) : textMain },
                  ]}>
                    {rp(language, opt.key)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Budget — inline toggle strip */}
          <Text style={[s.miniLabel, brandFontSansSemibold, { color: textMuted }]}>
            {rp(language, 'budgetSection')}
          </Text>
          <View style={[s.toggleStrip, { backgroundColor: fieldBg, borderColor: cardBorder }]}>
            {BUDGET_ORDER.map((id) => {
              const sel = budgetTier === id;
              return (
                <Pressable
                  key={id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: sel }}
                  onPress={() => setBudgetTier(id)}
                  style={[
                    s.toggleStripItem,
                    sel && { backgroundColor: accent, borderRadius: 10 },
                  ]}
                  android_ripple={ripple}
                >
                  <Ionicons
                    name={BUDGET_ICON[id]}
                    size={15}
                    color={sel ? onAccentButtonText(isLight) : textMuted}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[
                    s.toggleStripTxt,
                    brandFontSansMedium,
                    { color: sel ? onAccentButtonText(isLight) : textMain },
                  ]}>
                    {rp(language, BUDGET_RP_KEY[id])}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Interests — emoji bubble grid */}
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
                      backgroundColor: on ? selectedPillBg : fieldBg,
                      borderColor: on ? accent : cardBorder,
                    },
                    pressed && { transform: [{ scale: 0.94 }] },
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

          {/* Transport — compact icon row */}
          <Text style={[s.miniLabel, brandFontSansSemibold, { color: textMuted }]}>
            {rp(language, 'transportSection')}
          </Text>
          <View style={s.transportRow}>
            {modes.map((m) => {
              const sel = transport === m.id;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => setTransport(m.id)}
                  style={({ pressed }) => [
                    s.transportPill,
                    {
                      backgroundColor: sel ? accent : fieldBg,
                      borderColor: sel ? accent : cardBorder,
                    },
                    pressed && { transform: [{ scale: 0.93 }] },
                  ]}
                  android_ripple={ripple}
                >
                  <Ionicons name={m.icon} size={20} color={sel ? onAccentButtonText(isLight) : textMuted} />
                  <Text style={[
                    s.transportPillTxt,
                    brandFontSansMedium,
                    { color: sel ? onAccentButtonText(isLight) : textMuted },
                  ]}>
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* ─── CTA Button ─── */}
          <Animated.View style={{ transform: [{ scale: ctaPulse }] }}>
            <Pressable
              onPress={onGenerateRoute}
              disabled={aiBusy}
              style={({ pressed }) => [
                s.cta,
                { opacity: aiBusy ? 0.7 : pressed ? 0.92 : 1 },
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
                  <Ionicons name="sparkles" size={22} color={onAccentButtonText(isLight)} style={{ marginRight: 10 }} />
                )}
                <Text style={[s.ctaText, brandFontSansBold, { color: onAccentButtonText(isLight) }]}>
                  {rp(language, 'generateRoute')}
                </Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },

  /* Hero */
  heroGrad: {
    paddingHorizontal: 24,
    paddingBottom: 40,
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
    fontSize: 26,
    lineHeight: 32,
    marginBottom: 8,
  },
  heroSub: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.8,
  },

  /* Main card */
  mainCard: {
    marginTop: -24,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.06, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },

  /* Location banner */
  locBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1.5,
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
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 20,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },

  /* Mini label */
  miniLabel: {
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 6,
  },

  /* Time — horizontal scroll pills */
  hScroll: {
    marginHorizontal: -20,
    marginBottom: 18,
  },
  hScrollInner: {
    paddingHorizontal: 20,
    gap: 8,
  },
  slidePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    borderWidth: 1,
  },
  slidePillTxt: {
    fontSize: 13,
  },

  /* Budget — toggle strip */
  toggleStrip: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    marginBottom: 18,
  },
  toggleStripItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  toggleStripTxt: {
    fontSize: 12,
  },

  /* Interests — emoji bubbles */
  bubbleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
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
    marginBottom: 20,
  },
  transportPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 24,
    borderWidth: 1,
    gap: 5,
  },
  transportPillTxt: {
    fontSize: 12,
  },

  /* CTA */
  cta: {
    borderRadius: 18,
    overflow: 'hidden',
    marginTop: 4,
  },
  ctaGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 18,
  },
  ctaText: {
    fontSize: 17,
  },
});

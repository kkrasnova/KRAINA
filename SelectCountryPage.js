import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  ScrollView,
  Platform,
  Image,
  ActivityIndicator,
  TextInput,
  Alert,
  Linking,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useResponsive } from './useResponsive';
import { noAndroidRipple, rippleOnDarkSurface } from './androidFeedback';
import { getSavedCountryIdForUser, saveCountryForUser, LEGACY_COUNTRY_STORAGE_KEY } from './countryStorage';
import Lemon3DButton from './Lemon3DButton';
import {
  appLangBase,
  countriesAlignedWithAppLanguages,
  countriesForSelectCountryScreen,
  resolveSupportedCountryIdFromDisplayName,
} from './appLang';
import { normalizeForSearch, countryMatchesSearchQuery } from './countrySearch';
import { useAppLanguage } from './useAppLanguage';
import { GOOGLE_GEOCODING_API_KEY } from './authConfig';
import { brandFontText } from './brandFont';


export const COUNTRY_STORAGE_KEY = LEGACY_COUNTRY_STORAGE_KEY;

/**
 * Якщо нативний ExpoImage не злінкований (типова помилка iOS після змін pods без clean build),
 * require кинеться одразу — тоді плитки країн рендеряться через RN Image (без contentPosition).
 */
let ExpoImageNative = null;
try {
  ExpoImageNative = require('expo-image').Image;
} catch {
  ExpoImageNative = null;
}

function CountryTilePhotoImage({ expoProps, style }) {
  if (ExpoImageNative) {
    return <ExpoImageNative {...expoProps} style={style} />;
  }
  return (
    <Image
      source={expoProps.source}
      style={style}
      resizeMode="cover"
      accessibilityIgnoresInvertColors={expoProps.accessibilityIgnoresInvertColors}
      onError={expoProps.onError}
    />
  );
}

/** Лише країни, що відповідають мовам з екрана вибору мови (SecondPage / APP_LANG_IDS). */
const COUNTRIES = countriesAlignedWithAppLanguages();
const SUPPORTED_COUNTRY_IDS = new Set(COUNTRIES.map((c) => c.id));

const GRID_GAP = 10;

/** Маленьке «вікно» для плиток (зараз порожньо — усі країни з фото на всю плитку). */
const COUNTRY_TILE_PHOTO_INSET_IDS = new Set();
/** Для цих плиток піднімаємо текст у верхню частину кадру (зона неба). */
const COUNTRY_TILE_LABEL_ON_SKY_IDS = new Set(['UA', 'PL', 'ES', 'NL', 'LT', 'LV', 'RO', 'IT', 'AM']);

/** Фото всередині плитки країни (решта країн — градієнт). AVIF → jpg/png у кандидатах. */
const COUNTRY_TILE_BACKGROUND_CANDIDATES = {
  DE: [
    require('./assets/country-tile-germany-castle.png'),
    require('./assets/country-tile-germany-hero.jpg'),
  ],
  NL: [
    require('./assets/country-tile-netherlands-hero.jpg'),
    require('./assets/country-tile-netherlands.png'),
  ],
  UA: [
    require('./assets/photo-1639341267320-2d062b250c0d.avif'),
    require('./assets/country-tile-ua.jpg'),
  ],
  PL: [
    require('./assets/photo-1519197924294-4ba991a11128.avif'),
    require('./assets/country-tile-pl.jpg'),
  ],
  ES: [
    require('./assets/spain-card-hero.png'),
    require('./assets/photo-1579282240050-352db0a14c21.avif'),
  ],
  LT: [require('./assets/country-tile-lithuania.png')],
  LV: [
    require('./assets/country-tile-latvia-hero.jpg'),
    require('./assets/country-tile-latvia.jpg'),
  ],
  RO: [require('./assets/country-tile-romania-hero.jpg')],
  IT: [require('./assets/country-tile-italy-hero.jpg')],
  AM: [require('./assets/tyquxnnd.jpg')],
};

function getCountryTilePhotoCandidates(countryId) {
  const list = COUNTRY_TILE_BACKGROUND_CANDIDATES[countryId];
  return Array.isArray(list) ? list : [];
}

/** expo-image: object-position; NL/RO — додатково pan через COUNTRY_TILE_EXPO_EXTRA_PAN. */
const COUNTRY_TILE_EXPO_CONTENT_POSITION = {
  DE: 'center',
  NL: 'center',
  UA: 'top center',
  PL: 'top center',
  ES: 'center',
  LT: 'bottom center',
  LV: 'bottom center',
  RO: 'bottom center',
  IT: 'top center',
  AM: 'top center',
};

/**
 * scale + translateY від висоти плитки (expo-image).
 * translateYFrac < 0 — зсунути кадр вгору (RO).
 */
const COUNTRY_TILE_EXPO_EXTRA_PAN = {
  NL: { scale: 1.14, translateYFrac: 0.045 },
  RO: { scale: 1.34, translateYFrac: -0.08 },
};

function countryTileExpoContentPosition(countryId) {
  return COUNTRY_TILE_EXPO_CONTENT_POSITION[countryId] ?? 'center';
}

function countryTileExpoExtraStyle(countryId, layoutHeight) {
  const cfg = COUNTRY_TILE_EXPO_EXTRA_PAN[countryId];
  if (!cfg || !layoutHeight) return undefined;
  const scale = cfg.scale ?? 1;
  const translateYFrac = cfg.translateYFrac ?? 0;
  const transform = [];
  if (scale !== 1) transform.push({ scale });
  if (translateYFrac !== 0) transform.push({ translateY: Math.round(layoutHeight * translateYFrac) });
  if (!transform.length) return undefined;
  return { transform };
}

const TILE_PALETTES = [
  ['#1B2838', '#0F1623'],
  ['#2A1F35', '#151020'],
  ['#1F2F28', '#0F1814'],
  ['#30261E', '#18130F'],
  ['#1E2630', '#10151A'],
  ['#252031', '#14101A'],
  ['#1A2F2C', '#0E1A18'],
  ['#2B2218', '#16110C'],
];

function countryGradientColors(iso) {
  const s = String(iso || 'XX');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = s.charCodeAt(i) + ((h << 5) - h);
  }
  return TILE_PALETTES[Math.abs(h) % TILE_PALETTES.length];
}

/** Точні збіги з поля `country` у відповіді геокодера. */
const GEO_COUNTRY_NAME_TO_ISO = {
  Ukraine: 'UA',
  Poland: 'PL',
  Germany: 'DE',
  Spain: 'ES',
  Netherlands: 'NL',
  Lithuania: 'LT',
  Latvia: 'LV',
  Romania: 'RO',
  Italy: 'IT',
  Armenia: 'AM',
  'United Kingdom': 'GB',
  'Great Britain': 'GB',
};

/** Додаткові написи країн (EN / локальні) → ISO для підтримуваних країн. */
const GEO_COUNTRY_NAME_ALIASES = [
  ['UA', ['Ukraine', 'Україна', 'Ucrania', 'Ucraina']],
  ['PL', ['Poland', 'Polska', 'Polen', 'Pologne', 'Polonia', 'Rzeczpospolita Polska']],
  ['DE', ['Germany', 'Deutschland', 'Alemania', 'Allemagne', 'Germania', 'Bundesrepublik Deutschland', 'Niemcy']],
  ['ES', ['Spain', 'España', 'Espana', 'Kingdom of Spain', 'Spanje', 'Hiszpania']],
  ['NL', ['The Netherlands', 'Holland', 'Nederland', 'Netherlands', 'Pays-Bas', 'Niederlande', 'Holandia']],
  ['LT', ['Lithuania', 'Lietuva', 'Litauen', 'Lituanie', 'Republic of Lithuania']],
  ['LV', ['Latvia', 'Latvija', 'Lettland', 'Letonia', 'Republic of Latvia']],
  ['RO', ['Romania', 'România', 'Rumania', 'Roumanie', 'Rumänien']],
  [
    'IT',
    [
      'Italy',
      'Italia',
      'Italian Republic',
      'Repubblica Italiana',
      'Italie',
      'Italien',
      'Włochy',
      'Италия',
    ],
  ],
  [
    'AM',
    [
      'Armenia',
      'Հայաստան',
      'Republic of Armenia',
      'Армения',
      'Арменія',
      'Armenien',
      'Arménie',
      'Armenië',
      'Armênia',
      'Armėnija',
      'Armēnija',
    ],
  ],
  [
    'GB',
    [
      'United Kingdom',
      'Great Britain',
      'Britain',
      'UK',
      'U.K.',
      'England',
      'Scotland',
      'Wales',
      'Northern Ireland',
      'Royaume-Uni',
      'Regno Unito',
      'Велика Британія',
      'Обʼєднане Королівство',
    ],
  ],
];

const GEO_NORMALIZED_NAME_TO_ISO = (() => {
  const m = Object.create(null);
  for (const [iso, names] of GEO_COUNTRY_NAME_ALIASES) {
    for (const n of names) {
      const t = String(n || '').trim();
      if (!t) continue;
      m[normalizeForSearch(t)] = iso;
      m[t.toLowerCase()] = iso;
    }
  }
  return m;
})();

function countryStringToSupportedIso(countryField) {
  if (!countryField || typeof countryField !== 'string') return '';
  const trimmed = countryField.trim();
  if (!trimmed) return '';
  if (GEO_COUNTRY_NAME_TO_ISO[trimmed]) return GEO_COUNTRY_NAME_TO_ISO[trimmed];
  const k = normalizeForSearch(trimmed);
  return GEO_NORMALIZED_NAME_TO_ISO[k] || '';
}

function pickBetterPosition(a, b) {
  if (!a) return b;
  if (!b) return a;
  const ac = a.coords?.accuracy;
  const bc = b.coords?.accuracy;
  if (bc != null && ac != null) return bc < ac ? b : a;
  if (bc != null && ac == null) return b;
  return a;
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Пауза перед повторним зчитуванням, якщо перша точка дуже груба (мілісекунди). */
const GEO_RETRY_AFTER_MS = 650;
/** Уточнення GPS через watch при середній/поганій точності (мілісекунди). */
const GEO_REFINE_WATCH_MS = 3200;

/**
 * Координати для країни: Highest + коротке уточнення — зменшує хибні країни через грубий сигнал.
 */
async function getHighAccuracyCoords(Location) {
  const Acc = Location.Accuracy || {};
  const accuracy = Acc.Highest != null ? Acc.Highest : Acc.High != null ? Acc.High : Acc.Balanced;
  const opts = {
    accuracy,
    /** Android: не брати дуже старий кеш. */
    ...(Platform.OS === 'android' ? { mayShowUserSettingsDialog: true, maximumAge: 0 } : {}),
  };
  let best = await Location.getCurrentPositionAsync(opts);
  const acc = best?.coords?.accuracy;
  if (acc != null && acc > 6000) {
    await new Promise((resolve) => setTimeout(resolve, GEO_RETRY_AFTER_MS));
    try {
      const pos2 = await Location.getCurrentPositionAsync(opts);
      best = pickBetterPosition(best, pos2);
    } catch (_) {
      /* залишаємо best */
    }
  }
  const accAfter = best?.coords?.accuracy;
  const needsRefine = accAfter == null || accAfter > 2500;
  if (needsRefine && typeof Location.watchPositionAsync === 'function') {
    let sub;
    try {
      let watchBest = best;
      sub = await Location.watchPositionAsync(opts, (loc) => {
        watchBest = pickBetterPosition(watchBest, loc);
      });
      await new Promise((resolve) => setTimeout(resolve, GEO_REFINE_WATCH_MS));
      best = pickBetterPosition(best, watchBest);
    } catch (_) {
      /* лишаємо best */
    } finally {
      try {
        sub?.remove?.();
      } catch (_) {}
    }
  }
  return best;
}

/** Приблизні межі (прямокутник) — лише для підтримуваних країн; порядок: менший перетин з сусідами вище. */
const COUNTRY_BBOX = [
  { id: 'AM', minLat: 38.75, maxLat: 41.45, minLng: 43.35, maxLng: 46.75 },
  { id: 'NL', minLat: 50.55, maxLat: 53.95, minLng: 3.05, maxLng: 7.45 },
  { id: 'LT', minLat: 53.75, maxLat: 56.6, minLng: 20.75, maxLng: 27.05 },
  { id: 'LV', minLat: 55.55, maxLat: 58.2, minLng: 20.8, maxLng: 28.45 },
  { id: 'UA', minLat: 44.2, maxLat: 52.55, minLng: 21.85, maxLng: 40.35 },
  { id: 'RO', minLat: 43.45, maxLat: 48.45, minLng: 20.05, maxLng: 29.95 },
  { id: 'PL', minLat: 48.9, maxLat: 55.05, minLng: 13.95, maxLng: 24.35 },
  { id: 'ES', minLat: 35.75, maxLat: 44.05, minLng: -9.65, maxLng: 4.55 },
  { id: 'IT', minLat: 36.5, maxLat: 47.15, minLng: 6.4, maxLng: 18.85 },
  { id: 'DE', minLat: 47.1, maxLat: 55.2, minLng: 5.75, maxLng: 15.35 },
];

function countryIdFromBoundingBox(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
    return '';
  }
  for (const b of COUNTRY_BBOX) {
    if (lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng) {
      return COUNTRIES.some((c) => c.id === b.id) ? b.id : '';
    }
  }
  return '';
}

/**
 * Смуга, де живуть усі наші країни крім США (плюс UK/IE для відсічі хибного US з iOS).
 * Якщо точка тут, а Apple/expo повертає країну US — це майже завжди помилка геокодера / approximate location.
 */
function coordsInEuropeSupportBand(lat, lng) {
  /** До ~48°E — Україна, Кавказ (в т.ч. Вірменія), щоб хибний «US» з геокодера коригувався bbox. */
  return lat >= 34 && lat <= 72 && lng >= -12 && lng <= 48;
}

/** Деякі геокодери повертають ISO 3166-1 alpha-3. */
const ISO3_TO_2 = {
  USA: 'US',
  GBR: 'GB',
  NLD: 'NL',
  UKR: 'UA',
  POL: 'PL',
  DEU: 'DE',
  ESP: 'ES',
  LTU: 'LT',
  LVA: 'LV',
  ROU: 'RO',
  ITA: 'IT',
  ARM: 'AM',
};

function normalizeIsoCountryCode(rawIso) {
  const raw = String(rawIso || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (raw.length === 3 && ISO3_TO_2[raw]) return ISO3_TO_2[raw];
  if (raw.length === 2) return raw;
  return '';
}

/**
 * Лише пряма підтримка ISO + явні сусідні мапінги (без «найближчого центроїду» — він давав чужі країни).
 * Без довільного FR→ES тощо: інакше геолокація «стрибала» на не ту державу.
 */
function mapIsoToSupportedForGeo(iso2, _lat, _lng) {
  const iso = normalizeIsoCountryCode(iso2);
  if (!iso) return '';
  if (SUPPORTED_COUNTRY_IDS.has(iso)) return iso;

  const fallbackByIso = {
    GB: 'NL',
    IE: 'NL',
    JE: 'NL',
    GG: 'NL',
    IM: 'NL',
    CA: 'NL',
    AU: 'NL',
    NZ: 'NL',
    AT: 'DE',
    CH: 'DE',
    LI: 'DE',
    LU: 'DE',
    MD: 'RO',
    EE: 'LV',
    CZ: 'PL',
    SK: 'PL',
    SI: 'PL',
    HR: 'PL',
    HU: 'PL',
    BG: 'RO',
    PT: 'ES',
    BE: 'NL',
  };
  const mapped = fallbackByIso[iso];
  if (mapped && SUPPORTED_COUNTRY_IDS.has(mapped)) return mapped;
  return '';
}

function resolveCountryIdFromRev(rev) {
  if (!rev) return '';
  const rawIso = rev.isoCountryCode ? String(rev.isoCountryCode) : '';
  let iso = rawIso.replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (iso.length === 3 && ISO3_TO_2[iso]) iso = ISO3_TO_2[iso];
  if (iso.length === 2 && COUNTRIES.some((c) => c.id === iso)) return iso;

  const fromName = countryStringToSupportedIso(rev.country || '');
  if (fromName && COUNTRIES.some((c) => c.id === fromName)) return fromName;

  const name = (rev.country || '').trim();
  const fromDisplay = resolveSupportedCountryIdFromDisplayName(name);
  if (fromDisplay && COUNTRIES.some((c) => c.id === fromDisplay)) return fromDisplay;
  return '';
}

function resolveAnyIsoFromRev(rev) {
  if (!rev) return '';
  const iso = normalizeIsoCountryCode(rev.isoCountryCode);
  if (iso) return iso;
  const byName = countryStringToSupportedIso(rev.country || '');
  if (byName) return byName;
  return '';
}

/** Більша вага — у «детальніших» placemark (адреса, місто), щоб один хибний запис не перебивав країну. */
function placemarkDetailWeight(rev) {
  if (!rev) return 1;
  let w = 1;
  if (rev.streetNumber && rev.street) w += 5;
  else if (rev.street) w += 3;
  if (rev.city) w += 3;
  if (rev.district) w += 1;
  if (rev.postalCode) w += 2;
  if (rev.region) w += 1;
  if (rev.isoCountryCode) w += 2;
  if (rev.country) w += 2;
  return w;
}

function pickCountryIdFromGeocodeResults(revList) {
  if (!Array.isArray(revList) || revList.length === 0) return '';
  const tally = Object.create(null);
  for (const rev of revList) {
    const id = resolveCountryIdFromRev(rev);
    if (!id) continue;
    const w = placemarkDetailWeight(rev);
    tally[id] = (tally[id] || 0) + w;
  }
  let bestId = '';
  let bestScore = 0;
  for (const id of Object.keys(tally)) {
    if (tally[id] > bestScore) {
      bestScore = tally[id];
      bestId = id;
    }
  }
  if (bestId) return bestId;
  for (const rev of revList) {
    const id = resolveCountryIdFromRev(rev);
    if (id) return id;
  }
  return '';
}

function pickAnyIsoFromGeocodeResults(revList) {
  if (!Array.isArray(revList) || revList.length === 0) return '';
  for (const rev of revList) {
    const iso = resolveAnyIsoFromRev(rev);
    if (iso) return iso;
  }
  return '';
}

async function fetchJsonWithTimeout(url, timeoutMs = 4500) {
  if (typeof fetch !== 'function') return null;
  const hasAbort = typeof AbortController === 'function';
  const controller = hasAbort ? new AbortController() : null;
  let timer = null;
  try {
    if (controller) {
      timer = setTimeout(() => controller.abort(), timeoutMs);
    }
    const nominatim = typeof url === 'string' && url.includes('nominatim.openstreetmap.org');
    const init = {};
    if (controller) init.signal = controller.signal;
    if (nominatim) {
      init.headers = {
        Accept: 'application/json',
        'User-Agent': 'KrainaSafe/1.0.1 (KRAÏNA app; country picker)',
      };
    }
    const res = await fetch(url, Object.keys(init).length ? init : undefined);
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function numberFromMaybe(v) {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

function parseIpGeoPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const iso = normalizeIsoCountryCode(
    payload.country_code || payload.countryCode || payload.country || payload.country_code_iso3166alpha2,
  );
  let lat = numberFromMaybe(payload.latitude ?? payload.lat);
  let lng = numberFromMaybe(payload.longitude ?? payload.lon ?? payload.lng);
  if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && typeof payload.loc === 'string') {
    const [la, lo] = payload.loc.split(',');
    lat = numberFromMaybe(la);
    lng = numberFromMaybe(lo);
  }
  return {
    iso: iso || '',
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
}

async function detectCountryByIpBackend() {
  const urls = [
    'https://ipapi.co/json/',
    'https://ipwho.is/',
    'https://ipinfo.io/json',
  ];
  const results = await Promise.all(urls.map((u) => fetchJsonWithTimeout(u)));
  for (const payload of results) {
    const parsed = parseIpGeoPayload(payload);
    if (!parsed) continue;
    const id = mapIsoToSupportedForGeo(parsed.iso, parsed.lat, parsed.lng);
    if (id && SUPPORTED_COUNTRY_IDS.has(id)) return id;
  }
  return '';
}

function rawIsoFromReversePayload(p) {
  if (!p || typeof p !== 'object') return '';
  return normalizeIsoCountryCode(
    p?.address?.country_code ||
      p?.countryCode ||
      p?.country_code ||
      p?.countryCodeIso2 ||
      p?.countryCodeISO2,
  );
}

/** Google Geocoding API: lat/lng → країна (надійніше за безкоштовні бекенди при валідному ключі). */
async function googleReverseCountryIso(lat, lng, apiKey) {
  const empty = { rawIso: '', supportedId: '' };
  if (!apiKey || typeof apiKey !== 'string' || !isFiniteNumber(lat) || !isFiniteNumber(lng)) return empty;
  const latQ = Number(lat).toFixed(7);
  const lngQ = Number(lng).toFixed(7);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(`${latQ},${lngQ}`)}&result_type=country&language=en&key=${encodeURIComponent(apiKey.trim())}`;
  const data = await fetchJsonWithTimeout(url, 8000);
  if (!data || data.status !== 'OK' || !Array.isArray(data.results) || data.results.length === 0) {
    if (__DEV__ && data?.status && data.status !== 'ZERO_RESULTS') {
      console.warn('[SelectCountry] Google Geocoding:', data.status, data.error_message || '');
    }
    return empty;
  }
  const components = data.results[0]?.address_components;
  if (!Array.isArray(components)) return empty;
  const countryComp = components.find((c) => Array.isArray(c.types) && c.types.includes('country'));
  const iso = normalizeIsoCountryCode(countryComp?.short_name || '');
  if (!iso) return empty;
  const mapped = mapIsoToSupportedForGeo(iso, lat, lng);
  const supportedId = mapped && SUPPORTED_COUNTRY_IDS.has(mapped) ? mapped : '';
  return { rawIso: iso, supportedId };
}

/** Сирий ISO з бекендів + мапінг лише в підтримувані (без «найближчої» країни). Спочатку Google, далі Nominatim / BigDataCloud. */
async function reverseGeocodeBackendCountry(lat, lng) {
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return { rawIso: '', supportedId: '' };
  const latFixed = Number(lat).toFixed(6);
  const lngFixed = Number(lng).toFixed(6);
  const urls = [
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latFixed)}&lon=${encodeURIComponent(lngFixed)}&zoom=5&accept-language=en`,
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(latFixed)}&longitude=${encodeURIComponent(lngFixed)}&localityLanguage=en`,
  ];

  const googlePromise = GOOGLE_GEOCODING_API_KEY
    ? googleReverseCountryIso(lat, lng, GOOGLE_GEOCODING_API_KEY)
    : Promise.resolve({ rawIso: '', supportedId: '' });

  const [googleRes, ...otherResults] = await Promise.all([
    googlePromise,
    ...urls.map((u) => fetchJsonWithTimeout(u, 5500)),
  ]);

  let rawIso = googleRes.rawIso || '';
  let supportedId = googleRes.supportedId || '';

  for (const p of otherResults) {
    if (!p || typeof p !== 'object') continue;
    const iso = rawIsoFromReversePayload(p);
    if (!iso) continue;
    if (!rawIso) rawIso = iso;
    const mapped = mapIsoToSupportedForGeo(iso, lat, lng);
    if (mapped && SUPPORTED_COUNTRY_IDS.has(mapped) && !supportedId) supportedId = mapped;
  }
  return { rawIso, supportedId };
}

function pickCountryBySignals({
  fromGeoId,
  fromBoxId,
  mappedFromGeoAnyIso,
  backendCoordsCountryId,
  ipCountryId,
  accuracy,
}) {
  const score = Object.create(null);
  const add = (id, w) => {
    if (!id || !SUPPORTED_COUNTRY_IDS.has(id)) return;
    score[id] = (score[id] || 0) + w;
  };

  add(fromBoxId, 6);
  add(backendCoordsCountryId, 7);
  add(fromGeoId, 5);
  add(mappedFromGeoAnyIso, 4);
  add(ipCountryId, 2);

  if (accuracy == null || accuracy > 5500) {
    add(fromBoxId, 3);
    add(backendCoordsCountryId, 2);
  }

  let bestId = '';
  let bestScore = -1;
  for (const id of Object.keys(score)) {
    const sc = score[id];
    if (sc > bestScore) {
      bestScore = sc;
      bestId = id;
    }
  }

  if (bestId) return bestId;
  if (backendCoordsCountryId && SUPPORTED_COUNTRY_IDS.has(backendCoordsCountryId)) return backendCoordsCountryId;
  if (fromBoxId && SUPPORTED_COUNTRY_IDS.has(fromBoxId)) return fromBoxId;
  if (fromGeoId && SUPPORTED_COUNTRY_IDS.has(fromGeoId)) return fromGeoId;
  if (ipCountryId && SUPPORTED_COUNTRY_IDS.has(ipCountryId)) return ipCountryId;
  return '';
}

const TEXTS = {
  uk: {
    chooseCountry: 'Оберіть свою країну',
    countryHint: 'Для подорожей і сповіщень — оберіть країну або визначте її за геолокацією',
    stepLabel: 'Крок 2 з 3',
    continue: 'Продовжити',
    scrollHint: 'Прокрутіть сітку, щоб побачити всі країни',
    useLocation: 'Геолокація',
    useLocationA11y: 'Визначити країну за геолокацією',
    locationDenied: 'Доступ до геолокації відхилено',
    locationUnavailable: 'Не вдалося визначити країну',
    locationServicesOff: 'Увімкніть геолокацію в налаштуваннях телефону (Служби локації / Location Services)',
    geoRegionUnsupportedTitle: 'Вашого регіону ще немає в списку',
    geoRegionUnsupportedBody:
      'За геолокацією ви в країні, яку ми поки не підключаємо в застосунку. Нижче вже є багато інших країн — оберіть вручну ту, що вам підходить. Ми працюємо над тим, щоб незабаром додати ваш регіон у тому ж стилі та з тією ж увагою до деталей, що й решту KRAÏNA.',
    locationDetecting: 'Визначаємо…',
    searchCountry: 'Пошук',
    noCountryFound: 'Нічого не знайдено',
    openSettings: 'Налаштування',
    locationEnableInSettingsHint:
      'Натисніть картку «Геолокація» ще раз — система може знову запропонувати доступ. Якщо вікна вже не буде, увімкніть локацію в Налаштуваннях для цього застосунку.',
    alertOk: 'Зрозуміло',
  },
  en: {
    chooseCountry: 'Choose your country',
    countryHint: 'For trips and alerts — pick a country or detect it with your location',
    stepLabel: 'Step 2 of 3',
    continue: 'Continue',
    scrollHint: 'Scroll the grid to see all countries',
    useLocation: 'Geolocation',
    useLocationA11y: 'Detect your country using device location',
    locationDenied: 'Location access denied',
    locationUnavailable: 'Could not detect country',
    locationServicesOff: 'Turn on location services in your device settings',
    geoRegionUnsupportedTitle: 'Your region isn’t in the list yet',
    geoRegionUnsupportedBody:
      'Based on your location, you’re in a country we don’t support in the app yet. Many other countries are available below — pick one manually. We’re working on adding your region soon, in the same style and level of care as the rest of KRAÏNA.',
    locationDetecting: 'Detecting…',
    searchCountry: 'Search',
    noCountryFound: 'No matches',
    openSettings: 'Settings',
    locationEnableInSettingsHint:
      'Tap Geolocation again — the system may ask again. If the dialog no longer appears, turn on location for this app in Settings.',
    alertOk: 'OK',
  },
  pl: {
    chooseCountry: 'Wybierz swój kraj',
    countryHint: 'Na podróże i alerty — wybierz kraj lub wykryj go lokalizacją',
    stepLabel: 'Krok 2 z 3',
    continue: 'Kontynuuj',
    scrollHint: 'Przewiń siatkę, by zobaczyć wszystkie kraje',
    useLocation: 'Geolokalizacja',
    useLocationA11y: 'Wykryj kraj na podstawie lokalizacji',
    locationDenied: 'Odmówiono dostępu do lokalizacji',
    locationUnavailable: 'Nie udało się wykryć kraju',
    locationDetecting: 'Wykrywanie…',
    searchCountry: 'Szukaj',
    noCountryFound: 'Brak wyników',
  },
  de: {
    chooseCountry: 'Wähle dein Land',
    countryHint: 'Für Reisen und Hinweise — Land wählen oder per Standort erkennen',
    stepLabel: 'Schritt 2 von 3',
    continue: 'Weiter',
    scrollHint: 'Raster scrollen, um alle Länder zu sehen',
    useLocation: 'Standort',
    useLocationA11y: 'Land per Gerätestandort erkennen',
    locationDenied: 'Standortzugriff verweigert',
    locationUnavailable: 'Land konnte nicht erkannt werden',
    locationDetecting: 'Erkennung…',
    searchCountry: 'Suchen',
    noCountryFound: 'Keine Treffer',
  },
  es: {
    chooseCountry: 'Elige tu país',
    countryHint: 'Para viajes y avisos — elige un país o detéctalo con tu ubicación',
    stepLabel: 'Paso 2 de 3',
    continue: 'Continuar',
    scrollHint: 'Desplaza la cuadrícula para ver todos los países',
    useLocation: 'Geolocalización',
    useLocationA11y: 'Detectar el país con la ubicación del dispositivo',
    locationDenied: 'Acceso a la ubicación denegado',
    locationUnavailable: 'No se pudo detectar el país',
    locationDetecting: 'Detectando…',
    searchCountry: 'Buscar',
    noCountryFound: 'Sin resultados',
  },
  nl: {
    chooseCountry: 'Kies je land',
    countryHint: 'Voor reizen en meldingen — kies een land of bepaal het met locatie',
    stepLabel: 'Stap 2 van 3',
    continue: 'Doorgaan',
    scrollHint: 'Scroll het raster om alle landen te zien',
    useLocation: 'Geolocatie',
    useLocationA11y: 'Land bepalen met apparaatlocatie',
    locationDenied: 'Locatietoegang geweigerd',
    locationUnavailable: 'Land niet gevonden',
    locationDetecting: 'Detecteren…',
    searchCountry: 'Zoeken',
    noCountryFound: 'Niets gevonden',
  },
  lt: {
    chooseCountry: 'Pasirinkite savo šalį',
    countryHint: 'Kelionėms ir pranešimams — pasirinkite šalį arba nustatykite pagal vietą',
    stepLabel: '2 iš 3 žingsnių',
    continue: 'Tęsti',
    scrollHint: 'Slinkite tinklelį, kad matytumėte visas šalis',
    useLocation: 'Geolokacija',
    useLocationA11y: 'Nustatyti šalį pagal įrenginio vietą',
    locationDenied: 'Prieiga prie vietos atmesta',
    locationUnavailable: 'Nepavyko nustatyti šalies',
    locationDetecting: 'Nustatoma…',
    searchCountry: 'Ieškoti',
    noCountryFound: 'Nieko nerasta',
  },
  lv: {
    chooseCountry: 'Izvēlieties savu valsti',
    countryHint: 'Ceļojumiem un paziņojumiem — izvēlieties valsti vai nosakiet pēc atrašanās vietas',
    stepLabel: '2. solis no 3',
    continue: 'Turpināt',
    scrollHint: 'Ritiniet režģi, lai redzētu visas valstis',
    useLocation: 'Ģeolokācija',
    useLocationA11y: 'Noteikt valsti pēc ierīces atrašanās vietas',
    locationDenied: 'Piekļuve atrašanās vietai liegta',
    locationUnavailable: 'Neizdevās noteikt valsti',
    locationDetecting: 'Nosaka…',
    searchCountry: 'Meklēt',
    noCountryFound: 'Nekas nav atrasts',
  },
  ro: {
    chooseCountry: 'Alege-ți țara',
    countryHint: 'Pentru călătorii și notificări — alege țara sau detecteaz-o cu locația',
    stepLabel: 'Pasul 2 din 3',
    continue: 'Continuă',
    scrollHint: 'Derulează grila pentru toate țările',
    useLocation: 'Geolocație',
    useLocationA11y: 'Detectează țara folosind locația dispozitivului',
    locationDenied: 'Acces la locație refuzat',
    locationUnavailable: 'Nu s-a putut detecta țara',
    locationDetecting: 'Se detectează…',
    searchCountry: 'Caută',
    noCountryFound: 'Niciun rezultat',
  },
  it: {
    chooseCountry: 'Scegli il tuo paese',
    countryHint: 'Per viaggi e avvisi — scegli un paese o rilevane uno con la posizione',
    stepLabel: 'Passaggio 2 di 3',
    continue: 'Continua',
    scrollHint: 'Scorri la griglia per vedere tutti i paesi',
    useLocation: 'Geolocalizzazione',
    useLocationA11y: 'Rileva il paese con la posizione del dispositivo',
    locationDenied: 'Accesso alla posizione negato',
    locationUnavailable: 'Impossibile rilevare il paese',
    locationDetecting: 'Rilevamento…',
    searchCountry: 'Cerca',
    noCountryFound: 'Nessun risultato',
  },
  hy: {
    chooseCountry: 'Ընտրեք ձեր երկիրը',
    countryHint: 'Ճանապարհորդությունների և ծանուցումների համար — ընտրեք երկիր կամ որոշեք այն տեղորոշմամբ',
    stepLabel: 'Քայլ 2-ը 3-ից',
    continue: 'Շարունակել',
    scrollHint: 'Ոլորեք ցանցը՝ բոլոր երկրները տեսնելու համար',
    useLocation: 'Տեղորոշում',
    useLocationA11y: 'Որոշել երկիրը սարքի տեղորոշմամբ',
    locationDenied: 'Մուտքը տեղորոշմանը մերժվել է',
    locationUnavailable: 'Չհաջողվեց որոշել երկիրը',
    locationDetecting: 'Որոշվում է…',
    searchCountry: 'Որոնում',
    noCountryFound: 'Չկա համընկնում',
    openSettings: 'Կարգավորումներ',
    locationEnableInSettingsHint:
      'Կրկին հպեք «Տեղորոշում» քարտը — համակարգը կարող է նորից հարցնել թույլտվություն: Եթե պատուհանը այլևս չի երևում, միացրեք տեղորոշումը այս հավելվածի կարգավորումներում:',
    alertOk: 'Լավ',
  },
};

const DEFAULT_TEXTS = {
  chooseCountry: 'Choose your country',
  countryHint: 'For trips and alerts — pick a country or detect it with your location',
  stepLabel: 'Step 2 of 3',
  continue: 'Continue',
  scrollHint: 'Scroll the grid to see all countries',
  useLocation: 'Geolocation',
  useLocationA11y: 'Detect your country using device location',
  locationDenied: 'Location access denied',
  locationUnavailable: 'Could not detect country',
  locationServicesOff: 'Turn on location services in your device settings',
  geoRegionUnsupportedTitle: 'Your region isn’t in the list yet',
  geoRegionUnsupportedBody:
    'Based on your location, you’re in a country we don’t support in the app yet. Many other countries are available below — pick one manually. We’re working on adding your region soon, in the same style and level of care as the rest of KRAÏNA.',
  locationDetecting: 'Detecting…',
  searchCountry: 'Search',
  noCountryFound: 'No matches',
  openSettings: 'Settings',
  locationEnableInSettingsHint:
    'Tap Geolocation again — the system may ask again. If the dialog no longer appears, turn on location for this app in Settings.',
  alertOk: 'OK',
};

function getTexts(langId) {
  const en = { ...DEFAULT_TEXTS, ...TEXTS.en };
  const base = appLangBase(typeof langId === 'string' ? langId : 'en');
  const t = TEXTS[base];
  return t ? { ...en, ...t } : en;
}

function getLocationModuleSafe() {
  try {
    return require('expo-location');
  } catch (_) {
    return null;
  }
}

export default function SelectCountryPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const lang = useAppLanguage(route);
  const user = route?.params?.user || {};
  const previewBeforeAuth = route?.params?.previewBeforeAuth === true;
  const texts = getTexts(lang);

  const [countryId, setCountryId] = useState(null);
  /** Звідки поточний вибір: збережений / гео / ручна плитка — щоб підсвітити картку геолокації як «рекомендовану», як мова за замовчуванням. */
  const [selectionSource, setSelectionSource] = useState('none');
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState(null);
  /** Гео визначило країну, якої ще немає в списку — показуємо дружнє повідомлення в стилі застосунку. */
  const [geoUnsupportedRegion, setGeoUnsupportedRegion] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [tilePhotoFallbackIndexById, setTilePhotoFallbackIndexById] = useState({});

  const countriesForUi = useMemo(() => countriesForSelectCountryScreen(lang), [lang]);

  /** Порядок країн фіксований (як у `countriesForUi`); вибрана плитка не піднімається нагору — зверху завжди лише картка геолокації. */
  const filteredCountries = useMemo(() => {
    const q = normalizeForSearch(String(searchQuery || '').trim());
    return q
      ? countriesForUi.filter((c) => countryMatchesSearchQuery(c, searchQuery))
      : countriesForUi;
  }, [countriesForUi, searchQuery]);

  const handleUseLocation = useCallback(async () => {
    const t = getTexts(lang);
    setGeoError(null);
    setGeoUnsupportedRegion(false);
    setLocating(true);
    try {
      const Location = getLocationModuleSafe();
      if (!Location || typeof Location.requestForegroundPermissionsAsync !== 'function') {
        if (__DEV__) console.warn('[SelectCountry] expo-location native module not linked');
        const byIp = await detectCountryByIpBackend();
        if (byIp && SUPPORTED_COUNTRY_IDS.has(byIp)) {
          setCountryId(byIp);
          setSelectionSource('geo');
          setGeoError(null);
          setGeoUnsupportedRegion(false);
          return;
        }
        setGeoUnsupportedRegion(false);
        setGeoError(t.locationUnavailable);
        return;
      }
      const perm = await Location.requestForegroundPermissionsAsync();
      const { status, canAskAgain } = perm;
      if (status !== 'granted') {
        const byIp = await detectCountryByIpBackend();
        if (byIp && SUPPORTED_COUNTRY_IDS.has(byIp)) {
          setCountryId(byIp);
          setSelectionSource('geo');
          setGeoError(null);
          setGeoUnsupportedRegion(false);
          return;
        }
        setGeoUnsupportedRegion(false);
        setGeoError(t.locationDenied);
        const systemWontShowDialogAgain =
          canAskAgain === false || (Platform.OS === 'ios' && status === 'denied');
        if (systemWontShowDialogAgain) {
          Alert.alert(t.locationDenied, t.locationEnableInSettingsHint, [
            { text: t.alertOk, style: 'cancel' },
            {
              text: t.openSettings,
              onPress: () => {
                if (typeof Linking.openSettings === 'function') {
                  Linking.openSettings().catch(() => {});
                } else {
                  Linking.openURL('app-settings:').catch(() => {});
                }
              },
            },
          ]);
        }
        return;
      }
      if (typeof Location.hasServicesEnabledAsync === 'function') {
        const servicesOn = await Location.hasServicesEnabledAsync();
        if (!servicesOn) {
          const byIpSvc = await detectCountryByIpBackend();
          if (byIpSvc && SUPPORTED_COUNTRY_IDS.has(byIpSvc)) {
            setCountryId(byIpSvc);
            setSelectionSource('geo');
            setGeoError(null);
            setGeoUnsupportedRegion(false);
            return;
          }
          setGeoUnsupportedRegion(false);
          setGeoError(t.locationServicesOff);
          return;
        }
      }
      const pos = await getHighAccuracyCoords(Location);
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const fromBox = countryIdFromBoundingBox(lat, lng);
      const [revList, backendGeo, byIp] = await Promise.all([
        (async () => {
          try {
            const raw = await Location.reverseGeocodeAsync({
              latitude: lat,
              longitude: lng,
            });
            return Array.isArray(raw) ? raw : [];
          } catch (revErr) {
            if (__DEV__) console.warn('[SelectCountry] reverseGeocodeAsync', revErr?.message);
            return [];
          }
        })(),
        reverseGeocodeBackendCountry(lat, lng),
        detectCountryByIpBackend(),
      ]);
      const { rawIso: backendRawIso, supportedId: byCoordsBackend } = backendGeo;
      const fromGeoId = pickCountryIdFromGeocodeResults(revList);
      const fromGeoAnyIso = pickAnyIsoFromGeocodeResults(revList);
      const fromGeoMappedAny = mapIsoToSupportedForGeo(normalizeIsoCountryCode(fromGeoAnyIso), lat, lng);
      const countryIdResolved = pickCountryBySignals({
        fromGeoId,
        fromBoxId: fromBox,
        mappedFromGeoAnyIso: fromGeoMappedAny,
        backendCoordsCountryId: byCoordsBackend,
        ipCountryId: byIp,
        accuracy: pos.coords.accuracy,
      });
      const rawIsoForNotice = normalizeIsoCountryCode(backendRawIso || fromGeoAnyIso || '');
      const mapsToSupported = rawIsoForNotice ? !!mapIsoToSupportedForGeo(rawIsoForNotice, lat, lng) : false;
      const boxSupported = !!(fromBox && SUPPORTED_COUNTRY_IDS.has(fromBox));
      if (__DEV__) {
        console.warn('[SelectCountry] geo', {
          lat: Number(lat.toFixed(5)),
          lng: Number(lng.toFixed(5)),
          accuracy: pos.coords.accuracy,
          inEuropeBand: coordsInEuropeSupportBand(lat, lng),
          fromGeoId,
          fromBox,
          fromGeoAnyIso,
          backendRawIso,
          fromGeoMappedAny,
          byCoordsBackend,
          byIp,
          picked: countryIdResolved,
        });
      }
      if (countryIdResolved && SUPPORTED_COUNTRY_IDS.has(countryIdResolved)) {
        setCountryId(countryIdResolved);
        setSelectionSource('geo');
        setGeoUnsupportedRegion(false);
        setGeoError(null);
      } else if (rawIsoForNotice && !mapsToSupported && !boxSupported) {
        setGeoUnsupportedRegion(true);
        setGeoError(null);
      } else {
        setGeoUnsupportedRegion(false);
        setGeoError(t.locationUnavailable);
      }
    } catch (e) {
      if (__DEV__) console.warn('[SelectCountry] geolocation', e?.message);
      try {
        const byIp = await detectCountryByIpBackend();
        if (byIp && SUPPORTED_COUNTRY_IDS.has(byIp)) {
          setCountryId(byIp);
          setSelectionSource('geo');
          setGeoError(null);
          setGeoUnsupportedRegion(false);
          return;
        }
      } catch (_) {
        /* ignore */
      }
      setGeoUnsupportedRegion(false);
      setGeoError(getTexts(lang).locationUnavailable);
    } finally {
      setLocating(false);
    }
  }, [lang]);

  const handleUseLocationRef = useRef(handleUseLocation);
  handleUseLocationRef.current = handleUseLocation;

  /**
   * Збережена країна — підставляємо (джерело «saved»); інакше один раз геолокація як за замовчуванням.
   * Не залежить від identity `handleUseLocation` — щоб повторний запуск ефекту не скидав ручний вибір плитки.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await getSavedCountryIdForUser(user);
      if (cancelled) return;
      if (saved && COUNTRIES.some((c) => c.id === saved)) {
        setCountryId(saved);
        setSelectionSource('saved');
        return;
      }
      await handleUseLocationRef.current();
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.email, user?.firebaseUid]);

  const handleContinue = async () => {
    if (!countryId) return;
    await saveCountryForUser(user, countryId);
    if (previewBeforeAuth) {
      navigation?.replace?.('BackendAuth');
      return;
    }
    const payload = { user, language: lang, countryId };
    navigation?.replace?.('WalkReminderSetup', { ...payload, fromOnboarding: true });
  };

  const headerMarginBottom = r.isShortScreen ? 14 : 18;
  const headerMarginTop = r.isShortScreen ? 6 : 8;

  const checkmarkSize = Math.round(20 * r.scale);
  const buttonMinHeight = Math.max(48, Math.round(48 * r.scale));
  const searchBorderColor = searchFocused ? 'rgba(225, 255, 0, 0.55)' : 'rgba(255, 255, 255, 0.12)';
  const searchIconSize = Math.max(14, Math.round(14 * r.scale));
  const geoCardHeight = Math.max(110, Math.round(110 * r.scale));
  const geoLocIconSize = Math.max(20, Math.round(20 * r.scale));
  const tileW = useMemo(
    () => Math.max(132, Math.floor((r.contentMaxWidth - GRID_GAP) / 2)),
    [r.contentMaxWidth],
  );
  const gridInnerW = tileW * 2 + GRID_GAP;
  const geoGlobeW = Math.min(Math.round(tileW * 2.05), Math.round(280 * r.scale));
  const geoGlobeH = Math.round(geoCardHeight * 1.18);
  const geoCardPrimary =
    locating || (selectionSource === 'geo' && !!countryId);
  const titleLimeSize = Math.min(27, Math.round((r.titleFontSize + 3) * (r.isNarrow ? 0.92 : 0.96)));
  const fontUkraine = brandFontText;

  return (
    <View style={styles.container}>
      <Pressable
        style={[
          styles.content,
          {
            paddingTop: insets.top + 10,
            paddingBottom: r.bottomPadding,
            paddingHorizontal: r.horizontalPadding,
          },
        ]}
        onPress={Keyboard.dismiss}
      >
        <View
          style={[
            styles.headerBlock,
            { marginTop: headerMarginTop, marginBottom: headerMarginBottom, maxWidth: r.titleBlockWidth, alignSelf: 'center' },
          ]}
        >
          <Text
            style={[
              styles.screenTitleLime,
              {
                fontSize: titleLimeSize,
                lineHeight: titleLimeSize + 8,
                ...fontUkraine,
              },
            ]}
          >
            {texts.chooseCountry}
          </Text>
        </View>

        <View style={styles.searchWrap}>
          <View style={[styles.searchField, { borderColor: searchBorderColor }]}>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={texts.searchCountry}
              placeholderTextColor="rgba(161, 161, 161, 0.85)"
              style={[
                styles.searchInput,
                {
                  fontSize: Math.max(15, r.optionFontSize),
                  ...brandFontText,
                },
              ]}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardAppearance="dark"
              selectionColor="#E1FF00"
              underlineColorAndroid="transparent"
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
            />
            {searchQuery ? (
              <Pressable
                onPress={() => setSearchQuery('')}
                hitSlop={8}
                accessibilityRole="button"
                style={styles.searchClearHit}
              >
                <Ionicons name="close-circle" size={22} color="rgba(255,255,255,0.4)" />
              </Pressable>
            ) : null}
            <Image
              source={require('./assets/Vector2121.png')}
              style={{ width: searchIconSize, height: searchIconSize, tintColor: '#FFFFFF' }}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
              importantForAccessibility="no"
            />
          </View>
        </View>

        {geoUnsupportedRegion ? (
          <View
            style={[styles.geoNoticeCard, { maxWidth: r.titleBlockWidth || gridInnerW }]}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <LinearGradient
              colors={['rgba(42, 44, 18, 0.97)', 'rgba(8, 9, 6, 0.99)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.geoNoticeInner}>
              <View style={styles.geoNoticeAccent} />
              <Text
                style={[
                  styles.geoNoticeTitle,
                  {
                    fontSize: Math.max(15, r.hintFontSize + 1),
                    lineHeight: Math.max(20, r.hintFontSize + 6),
                    ...fontUkraine,
                  },
                ]}
              >
                {texts.geoRegionUnsupportedTitle}
              </Text>
              <Text
                style={[
                  styles.geoNoticeBody,
                  {
                    fontSize: r.hintFontSize,
                    lineHeight: Math.round(r.hintFontSize * 1.48),
                    ...fontUkraine,
                  },
                ]}
              >
                {texts.geoRegionUnsupportedBody}
              </Text>
            </View>
          </View>
        ) : geoError ? (
          <Text style={[styles.geoError, { fontSize: r.hintFontSize }]}>{geoError}</Text>
        ) : null}

        <View style={styles.listSection}>
          <Text style={[styles.hintMuted, { fontSize: r.hintFontSize - 1 }]}>{texts.scrollHint}</Text>

          <ScrollView
            style={styles.gridScroll}
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator
            indicatorStyle="white"
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View style={[styles.grid, { gap: GRID_GAP, width: gridInnerW, alignSelf: 'center' }]}>
              <Pressable
                onPress={handleUseLocation}
                disabled={locating}
                style={({ pressed }) => [
                  styles.tileOuter,
                  { width: tileW, minHeight: geoCardHeight },
                  geoCardPrimary && styles.tileSelected,
                  !geoCardPrimary && {
                    borderColor: 'rgba(255, 255, 255, 0.12)',
                  },
                  pressed && !locating && styles.tilePressed,
                  locating && styles.tileDisabled,
                ]}
                android_ripple={locating ? undefined : rippleOnDarkSurface}
                accessibilityRole="button"
                accessibilityLabel={texts.useLocationA11y || texts.useLocation}
                accessibilityState={{ disabled: locating }}
              >
                <View
                  style={[styles.geoCardInner, { minHeight: geoCardHeight }]}
                  pointerEvents="box-none"
                  collapsable={false}
                >
                  <View
                    style={[
                      styles.geoGlobeWrap,
                      { height: Math.round(geoCardHeight * 0.88), bottom: Math.round(-42 * r.scale) },
                    ]}
                    pointerEvents="none"
                  >
                    <Image
                      source={require('./assets/globe.png')}
                      style={{ width: geoGlobeW, height: geoGlobeH }}
                      resizeMode="contain"
                      accessibilityIgnoresInvertColors
                    />
                  </View>
                  <View style={styles.geoCardForeground} pointerEvents="box-none" collapsable={false}>
                    <View style={styles.geoLabelRow}>
                      {locating ? (
                        <ActivityIndicator color="#E1FF00" size="small" style={styles.geoActivitySlot} />
                      ) : (
                        <Image
                          source={require('./assets/mage_location-fill.png')}
                          style={{ width: geoLocIconSize, height: geoLocIconSize }}
                          resizeMode="contain"
                          accessibilityIgnoresInvertColors
                          importantForAccessibility="no"
                        />
                      )}
                      <Text
                        style={[
                          styles.geoCardLabel,
                          {
                            fontSize: Math.max(13, Math.round(14 * r.scale)),
                            ...fontUkraine,
                            fontWeight: '300',
                          },
                        ]}
                        numberOfLines={2}
                      >
                        {locating ? texts.locationDetecting : texts.useLocation}
                      </Text>
                    </View>
                  </View>
                </View>
              </Pressable>

              {filteredCountries.map((opt) => {
                const selected = countryId === opt.id;
                const [c1, c2] = countryGradientColors(opt.id);
                const tilePhotoCandidates = getCountryTilePhotoCandidates(opt.id);
                const tilePhotoIndex = tilePhotoFallbackIndexById[opt.id] ?? 0;
                const tilePhoto =
                  tilePhotoCandidates[tilePhotoIndex] || tilePhotoCandidates[0] || null;
                const hasNextTilePhotoFallback = tilePhotoIndex < tilePhotoCandidates.length - 1;
                const handleTilePhotoError = () => {
                  if (!hasNextTilePhotoFallback) return;
                  setTilePhotoFallbackIndexById((prev) => {
                    const current = prev[opt.id] ?? 0;
                    if (current >= tilePhotoCandidates.length - 1) return prev;
                    return { ...prev, [opt.id]: current + 1 };
                  });
                };
                const nameStyle = [
                  styles.countryTileName,
                  {
                    fontSize: Math.max(13, Math.round(14 * r.scale)),
                    ...fontUkraine,
                    fontWeight: '300',
                  },
                ];
                const flagStyle = styles.countryTileFlag;
                const labelBlock = (
                  <View
                    style={[
                      styles.countryTileInner,
                      COUNTRY_TILE_LABEL_ON_SKY_IDS.has(opt.id) && styles.countryTileInnerSky,
                    ]}
                  >
                    <View style={styles.countryTileLabelRow}>
                      <Text style={flagStyle}>{opt.flag}</Text>
                      <Text style={nameStyle} numberOfLines={2}>
                        {opt.label}
                      </Text>
                    </View>
                  </View>
                );
                const checkBlock =
                  selected ? (
                    <View style={styles.countryTileCheck} pointerEvents="none">
                      <Image
                        source={require('./assets/checkmark.png')}
                        style={{ width: checkmarkSize, height: checkmarkSize }}
                        resizeMode="contain"
                      />
                    </View>
                  ) : null;
                const tileContentPosition = countryTileExpoContentPosition(opt.id);
                const photoInset = COUNTRY_TILE_PHOTO_INSET_IDS.has(opt.id);
                const expoTileSharedProps = {
                  source: tilePhoto,
                  contentFit: 'cover',
                  contentPosition: tileContentPosition,
                  transition: null,
                  cachePolicy: 'memory-disk',
                  allowDownscaling: true,
                  recyclingKey: `country-tile-${opt.id}-${tilePhotoIndex}`,
                  accessibilityIgnoresInvertColors: true,
                  onError: handleTilePhotoError,
                };
                const photoFrameW = Math.max(62, Math.round(tileW * 0.46));
                const photoFrameH = Math.max(54, Math.round(geoCardHeight * 0.34));
                const photoFrameTop = Math.round(geoCardHeight * 0.2);
                const photoFrameLeft = Math.round((tileW - photoFrameW) / 2);
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => {
                      setGeoError(null);
                      setGeoUnsupportedRegion(false);
                      setCountryId(opt.id);
                      setSelectionSource('manual');
                    }}
                    style={({ pressed }) => [
                      styles.tileOuter,
                      { width: tileW, minHeight: geoCardHeight },
                      selected && styles.tileSelected,
                      pressed && styles.tilePressed,
                    ]}
                    android_ripple={selected ? noAndroidRipple : rippleOnDarkSurface}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={opt.label}
                  >
                    {tilePhoto ? (
                      <View
                        style={[StyleSheet.absoluteFillObject, styles.countryTilePhotoWrap]}
                        pointerEvents="box-none"
                        collapsable={false}
                      >
                        {photoInset ? (
                          <View
                            style={[
                              styles.countryTilePhotoFrame,
                              {
                                top: photoFrameTop,
                                left: photoFrameLeft,
                                width: photoFrameW,
                                height: photoFrameH,
                              },
                            ]}
                          >
                            <CountryTilePhotoImage
                              expoProps={expoTileSharedProps}
                              style={[
                                styles.countryTilePhotoFrameImage,
                                countryTileExpoExtraStyle(opt.id, photoFrameH),
                              ]}
                            />
                          </View>
                        ) : (
                          <CountryTilePhotoImage
                            expoProps={expoTileSharedProps}
                            style={[
                              styles.countryTilePhotoImage,
                              countryTileExpoExtraStyle(opt.id, geoCardHeight),
                            ]}
                          />
                        )}
                        {labelBlock}
                        {checkBlock}
                      </View>
                    ) : (
                      <>
                        <LinearGradient
                          colors={[c2, c1]}
                          start={{ x: 0, y: 1 }}
                          end={{ x: 1, y: 0 }}
                          style={StyleSheet.absoluteFillObject}
                        />
                        {labelBlock}
                        {checkBlock}
                      </>
                    )}
                  </Pressable>
                );
              })}

              {!filteredCountries.length ? (
                <View style={[styles.emptyGridBanner, { width: gridInnerW }]}>
                  <Text style={styles.emptyText}>{texts.noCountryFound}</Text>
                </View>
              ) : null}
            </View>
          </ScrollView>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerDivider} />
          <Lemon3DButton
            label={texts.continue}
            onPress={handleContinue}
            disabled={!countryId}
            minHeight={buttonMinHeight}
            textStyle={{
              fontSize: Math.max(16, r.buttonFontSize),
              fontWeight: '600',
              letterSpacing: 0.3,
            }}
            accessibilityLabel={texts.continue}
          />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: '#000000',
  },
  headerBlock: {
    alignItems: 'center',
    width: '100%',
  },
  screenTitleLime: {
    fontWeight: '700',
    color: '#E1FF00',
    letterSpacing: -0.4,
    textAlign: 'center',
    width: '100%',
  },
  tileOuter: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: '#010103',
    overflow: 'hidden',
  },
  tileSelected: {
    borderColor: '#E1FF00',
  },
  tilePressed: {
    opacity: 0.92,
  },
  countryTilePhotoWrap: {
    backgroundColor: '#06060a',
  },
  /** Маленьке «вікно» з фото по центру плитки; навколо темне поле. */
  countryTilePhotoFrame: {
    position: 'absolute',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    backgroundColor: '#0a0a10',
  },
  countryTilePhotoFrameImage: {
    ...StyleSheet.absoluteFillObject,
  },
  /** Повна плитка (UA, PL, ES). */
  countryTilePhotoImage: {
    ...StyleSheet.absoluteFillObject,
  },
  tileDisabled: {
    opacity: 0.88,
  },
  geoCardInner: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#010103',
  },
  geoGlobeWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  geoCardForeground: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    zIndex: 2,
  },
  geoLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  geoActivitySlot: {
    width: 20,
    height: 20,
  },
  geoCardLabel: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.38)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  geoError: {
    marginTop: 10,
    ...brandFontText,
    color: '#F08080',
    lineHeight: 20,
    textAlign: 'center',
    width: '100%',
  },
  geoNoticeCard: {
    marginTop: 12,
    alignSelf: 'center',
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(225, 255, 0, 0.38)',
    overflow: 'hidden',
  },
  geoNoticeInner: {
    position: 'relative',
    paddingVertical: 14,
    paddingRight: 14,
    paddingLeft: 16,
  },
  geoNoticeAccent: {
    position: 'absolute',
    left: 0,
    top: 12,
    bottom: 12,
    width: 3,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
    backgroundColor: '#E1FF00',
  },
  geoNoticeTitle: {
    color: '#E1FF00',
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 10,
    letterSpacing: -0.2,
  },
  geoNoticeBody: {
    color: 'rgba(255, 255, 255, 0.84)',
    fontWeight: '400',
    marginLeft: 10,
    letterSpacing: -0.1,
  },
  searchWrap: {
    marginTop: 6,
    width: '100%',
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(105, 105, 105, 0.1)',
    borderWidth: 1,
    gap: 10,
  },
  searchClearHit: {
    marginRight: -2,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
    minHeight: 22,
    color: '#FFFFFF',
    fontWeight: '400',
  },
  listSection: {
    flex: 1,
    minHeight: 0,
    marginTop: 10,
  },
  hintMuted: {
    marginTop: 2,
    marginBottom: 10,
    ...brandFontText,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.36)',
    textAlign: 'center',
    width: '100%',
  },
  gridScroll: {
    flex: 1,
  },
  gridContent: {
    paddingTop: 4,
    paddingBottom: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  countryTileInner: {
    flex: 1,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 8,
    zIndex: 1,
    justifyContent: 'flex-start',
    minHeight: 48,
  },
  countryTileInnerSky: {
    paddingTop: 6,
  },
  countryTileLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  countryTileFlag: {
    fontSize: 17,
    lineHeight: 20,
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  countryTileName: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.38)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  countryTileCheck: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    zIndex: 2,
  },
  emptyGridBanner: {
    paddingVertical: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...brandFontText,
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  footer: {
    paddingTop: 16,
    paddingBottom: 4,
  },
  footerDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 18,
  },
});

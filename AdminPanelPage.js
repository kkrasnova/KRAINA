import React, { useCallback, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  Platform,
  DeviceEventEmitter,
  Image,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { THEME_CHANGED_EVENT } from './themeStorage';
import { lightTabBarExtraScrollPadding } from './LightBottomTabBar';
import { appLangBase, countriesForSelectCountryScreen, resolveSupportedCountryIdFromDisplayName } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';
import * as ImagePicker from 'expo-image-picker';

import { accentForTheme, onAccentButtonText } from './themeAccent';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { st } from './settingsI18n';
import {
  buildSnapshotFromRuntime,
  saveAdminLocationBundle,
  resetAdminLocationsToDefaults,
  KRAINA_ADMIN_LOCATION_EVENT,
} from './adminLocationData';
import { HERO_THUMB_MAP, HERO_THUMB_KEYS } from './krainaHeroThumbs';
import AdminLandmarkStoryFields from './AdminLandmarkStoryFields';
import AdminSubscriptionGrantSection from './AdminSubscriptionGrantSection';
import AdminSubscriptionCancelFeedbackSection from './AdminSubscriptionCancelFeedbackSection';
import { emptyLandmarkStory, normalizeLandmarkStory } from './landmarkStorySchema';
import { parseGoogleMapsLatLng } from './adminLandmarkAiAssist';
import { OFFLINE_OUTBOX_CHANGED, getOutboxItems } from './offline/outboxStore';
import { flushOutboxNow } from './offline/syncEngine';

const CARD_DARK = '#141414';
const BORDER_DARK = '#2A2A2A';
const MUTED = '#888888';

function normalizePickedUri(uri) {
  if (typeof uri !== 'string') return '';
  return uri.trim();
}

function isAcceptedImageUri(uri) {
  const u = normalizePickedUri(uri);
  if (!u) return false;
  return /^(https?:\/\/|file:\/\/|content:\/\/|asset:\/\/|ph:\/\/)/i.test(u);
}

function slugifyRegionName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function normalizeTextKey(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/[\s'’`".,;:()\-_/\\]+/g, '');
}

const CITY_TRANSLATIONS = {
  kyiv: { uk: 'Київ', en: 'Kyiv' },
  kiev: { uk: 'Київ', en: 'Kyiv' },
  odessa: { uk: 'Одеса', en: 'Odesa' },
  odesa: { uk: 'Одеса', en: 'Odesa' },
  kharkiv: { uk: 'Харків', en: 'Kharkiv' },
  zaporizhzhia: { uk: 'Запоріжжя', en: 'Zaporizhzhia' },
  zaporozhye: { uk: 'Запоріжжя', en: 'Zaporizhzhia' },
  dnipro: { uk: 'Дніпро', en: 'Dnipro' },
  lviv: { uk: 'Львів', en: 'Lviv' },
  odesa: { uk: 'Одеса', en: 'Odesa' },
  odessa: { uk: 'Одеса', en: 'Odesa' },
  vinnytsia: { uk: 'Вінниця', en: 'Vinnytsia' },
  poltava: { uk: 'Полтава', en: 'Poltava' },
  ivanofrankivsk: { uk: 'Івано-Франківськ', en: 'Ivano-Frankivsk' },
  ivanofrankovsk: { uk: 'Івано-Франківськ', en: 'Ivano-Frankivsk' },
};

const ALL_CITIES_PRESETS = {
  UA: [
    'Київ',
    'Одеса',
    'Харків',
    'Дніпро',
    'Львів',
    'Запоріжжя',
    'Вінниця',
    'Полтава',
    'Івано-Франківськ',
  ],
};

function translateCityPair(rawName) {
  const n = String(rawName || '').trim();
  const k = normalizeTextKey(n);
  const exact = CITY_TRANSLATIONS[k];
  if (exact) return { titleUk: exact.uk, titleEn: exact.en };
  return { titleUk: n, titleEn: n };
}

function splitCitiesFromCommand(text) {
  return String(text || '')
    .split(/[,;|\n]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

const COUNTRY_ALIASES = {
  ukraine: 'UA',
  украина: 'UA',
  україна: 'UA',
  ucrania: 'UA',
  ucraina: 'UA',
  germany: 'DE',
  deutschland: 'DE',
  німеччина: 'DE',
  германия: 'DE',
  poland: 'PL',
  polska: 'PL',
  польща: 'PL',
  польша: 'PL',
  italy: 'IT',
  italia: 'IT',
  италия: 'IT',
  італія: 'IT',
  spain: 'ES',
  espana: 'ES',
  españa: 'ES',
  испания: 'ES',
  іспанія: 'ES',
  netherlands: 'NL',
  nederland: 'NL',
  нідерланди: 'NL',
  нидерланды: 'NL',
  lithuania: 'LT',
  lietuva: 'LT',
  литва: 'LT',
  латвия: 'LV',
  latvia: 'LV',
  latvija: 'LV',
  romania: 'RO',
  românia: 'RO',
  румунія: 'RO',
  румыния: 'RO',
  armenia: 'AM',
  հայաստան: 'AM',
  вірменія: 'AM',
  армения: 'AM',
};

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

export default function AdminPanelPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const routeUser = route?.params?.user || {};
  const countryId = route?.params?.countryId;
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme === 'light' ? 'light' : 'dark');
  const [draft, setDraft] = useState(() => clone(buildSnapshotFromRuntime()));
  const [selectedCountryId, setSelectedCountryId] = useState(null);
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [newCountryCode, setNewCountryCode] = useState('');
  const [newRegionSlug, setNewRegionSlug] = useState('');
  const [hubOpen, setHubOpen] = useState(false);
  const [regionMapsUrl, setRegionMapsUrl] = useState('');
  const [landmarkMapsUrls, setLandmarkMapsUrls] = useState({});
  const [aiAdminPrompt, setAiAdminPrompt] = useState('');
  const [aiAdminPhotoUris, setAiAdminPhotoUris] = useState([]);
  const [offlinePendingCount, setOfflinePendingCount] = useState(0);
  const scrollRef = useRef(null);
  const sectionY = useRef({ intro: 0, countries: 0, regions: 0, city: 0 });

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const muted = isLight ? '#5C5C5C' : MUTED;
  const cardBg = isLight ? '#FFFFFF' : CARD_DARK;
  const border = isLight ? 'rgba(30,30,30,0.08)' : BORDER_DARK;

  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener(THEME_CHANGED_EVENT, (v) => {
      setAppTheme(v === 'light' ? 'light' : 'dark');
    });
    return () => sub.remove();
  }, []);

  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener(KRAINA_ADMIN_LOCATION_EVENT, () => {
      setDraft(clone(buildSnapshotFromRuntime()));
    });
    return () => sub.remove();
  }, []);

  React.useEffect(() => {
    let mounted = true;
    void getOutboxItems().then((arr) => {
      if (mounted) setOfflinePendingCount(Array.isArray(arr) ? arr.length : 0);
    });
    const sub = DeviceEventEmitter.addListener(OFFLINE_OUTBOX_CHANGED, (meta) => {
      setOfflinePendingCount(Number(meta?.pending || 0));
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const countryLabels = useMemo(() => {
    const list = countriesForSelectCountryScreen(language);
    return Object.fromEntries(list.map((c) => [c.id, c.label]));
  }, [language]);

  const countryLabelsEn = useMemo(() => {
    const list = countriesForSelectCountryScreen('en');
    return Object.fromEntries(list.map((c) => [c.id, c.label]));
  }, []);

  const countryResolver = useMemo(() => {
    const lists = [
      ...countriesForSelectCountryScreen('uk'),
      ...countriesForSelectCountryScreen('en'),
      ...countriesForSelectCountryScreen(language),
    ];
    const map = new Map();
    lists.forEach((c) => {
      const id = String(c.id || '').toUpperCase();
      if (!id || id.length !== 2) return;
      map.set(normalizeTextKey(id), id);
      map.set(normalizeTextKey(c.label), id);
    });
    return (rawCountry) => {
      const t = String(rawCountry || '').trim();
      const key = normalizeTextKey(t);
      if (COUNTRY_ALIASES[key]) return COUNTRY_ALIASES[key];
      const byGlobal = resolveSupportedCountryIdFromDisplayName(t);
      if (byGlobal) return byGlobal;
      if (map.has(key)) return map.get(key);
      if (t.length === 2 && map.has(normalizeTextKey(t.toUpperCase()))) {
        return t.toUpperCase();
      }
      return null;
    };
  }, [language]);

  const onSave = useCallback(async () => {
    const { homeCountryOrder, homeRegionIdsByCountry, regions } = draft;
    for (const cid of homeCountryOrder) {
      const rids = homeRegionIdsByCountry[cid];
      if (!Array.isArray(rids)) continue;
      for (const rid of rids) {
        if (!regions[rid]) {
          Alert.alert('', st(language, 'adminErrMissingRegion') + `: ${cid} → ${rid}`);
          return;
        }
      }
    }
    try {
      await saveAdminLocationBundle(clone(draft));
      Alert.alert('', st(language, 'adminSaved'));
    } catch {
      Alert.alert('', st(language, 'adminSaveFailed'));
    }
  }, [draft, language]);

  const onReset = useCallback(() => {
    Alert.alert(st(language, 'adminResetTitle'), st(language, 'adminResetBody'), [
      { text: st(language, 'adminCancel'), style: 'cancel' },
      {
        text: st(language, 'adminResetConfirm'),
        style: 'destructive',
        onPress: async () => {
          await resetAdminLocationsToDefaults();
          setDraft(clone(buildSnapshotFromRuntime()));
          setSelectedCountryId(null);
          setSelectedRegionId(null);
          Alert.alert('', st(language, 'adminResetDone'));
        },
      },
    ]);
  }, [language]);

  const moveCountry = useCallback((index, dir) => {
    setDraft((d) => {
      const next = clone(d);
      const arr = next.homeCountryOrder;
      const j = index + dir;
      if (j < 0 || j >= arr.length) return d;
      const t = arr[index];
      arr[index] = arr[j];
      arr[j] = t;
      return next;
    });
  }, []);

  const removeCountry = useCallback((cid) => {
    setDraft((d) => {
      const next = clone(d);
      next.homeCountryOrder = next.homeCountryOrder.filter((id) => id !== cid);
      delete next.homeRegionIdsByCountry[cid];
      if (next.homeCountryHeroRefs) delete next.homeCountryHeroRefs[cid];
      if (next.homeCountryHeroUris) delete next.homeCountryHeroUris[cid];
      return next;
    });
    setSelectedCountryId((cur) => (cur === cid ? null : cur));
  }, []);

  const addCountry = useCallback(() => {
    const raw = (newCountryCode || '').trim().toUpperCase();
    if (raw.length !== 2) {
      Alert.alert('', st(language, 'adminCountryCodeHint'));
      return;
    }
    if (!countryLabels[raw]) {
      Alert.alert('', st(language, 'adminUnknownCountry'));
      return;
    }
    setDraft((d) => {
      const next = clone(d);
      if (!next.homeCountryOrder.includes(raw)) next.homeCountryOrder.push(raw);
      if (!next.homeRegionIdsByCountry[raw]) next.homeRegionIdsByCountry[raw] = [];
      next.homeCountryHeroRefs = { ...(next.homeCountryHeroRefs || {}) };
      next.homeCountryHeroUris = { ...(next.homeCountryHeroUris || {}) };
      return next;
    });
    setNewCountryCode('');
    setSelectedCountryId(raw);
  }, [countryLabels, language, newCountryCode]);

  const addRegionSlug = useCallback(() => {
    if (!selectedCountryId) return;
    const slug = (newRegionSlug || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!slug) {
      Alert.alert('', st(language, 'adminRegionSlugHint'));
      return;
    }
    setDraft((d) => {
      const next = clone(d);
      if (!next.homeRegionIdsByCountry[selectedCountryId]) {
        next.homeRegionIdsByCountry[selectedCountryId] = [];
      }
      if (!next.homeRegionIdsByCountry[selectedCountryId].includes(slug)) {
        next.homeRegionIdsByCountry[selectedCountryId].push(slug);
      }
      if (!next.regions[slug]) {
        next.regions[slug] = {
          id: slug,
          titleUk: st(language, 'adminNewRegionUk'),
          titleEn: st(language, 'adminNewRegionEn'),
          countryUk: '',
          countryEn: '',
          flag: '🏳️',
          center: { latitude: 0, longitude: 0, latitudeDelta: 0.12, longitudeDelta: 0.12 },
          heroThumbRef: 't1',
          landmarks: [],
        };
      }
      return next;
    });
    setNewRegionSlug('');
    setSelectedRegionId(slug);
  }, [language, newRegionSlug, selectedCountryId]);

  const moveRegionInCountry = useCallback((cid, index, dir) => {
    setDraft((d) => {
      const next = clone(d);
      const arr = [...(next.homeRegionIdsByCountry[cid] || [])];
      const j = index + dir;
      if (j < 0 || j >= arr.length) return d;
      const t = arr[index];
      arr[index] = arr[j];
      arr[j] = t;
      next.homeRegionIdsByCountry[cid] = arr;
      return next;
    });
  }, []);

  const removeRegionFromCountry = useCallback(
    (cid, rid) => {
      Alert.alert(st(language, 'adminRemoveRegion'), st(language, 'adminRemoveRegionConfirm'), [
        { text: st(language, 'adminCancel'), style: 'cancel' },
        {
          text: st(language, 'adminRemoveRegionAction'),
          style: 'destructive',
          onPress: () => {
            setDraft((d) => {
              const next = clone(d);
              next.homeRegionIdsByCountry[cid] = (next.homeRegionIdsByCountry[cid] || []).filter((x) => x !== rid);
              const stillUsed = next.homeCountryOrder.some((c) =>
                (next.homeRegionIdsByCountry[c] || []).includes(rid),
              );
              if (!stillUsed) delete next.regions[rid];
              return next;
            });
            setSelectedRegionId((cur) => (cur === rid ? null : cur));
          },
        },
      ]);
    },
    [language],
  );

  const updateRegionField = useCallback((rid, key, value) => {
    setDraft((d) => {
      const next = clone(d);
      if (!next.regions[rid]) return d;
      if (key === 'flag' || key === 'titleUk' || key === 'titleEn' || key === 'countryUk' || key === 'countryEn') {
        next.regions[rid][key] = value;
      } else if (key === 'heroUri') {
        next.regions[rid].heroUri = value;
      } else if (key === 'heroThumbRef') {
        next.regions[rid].heroThumbRef = HERO_THUMB_KEYS.includes(value) ? value : 't1';
      } else if (key.startsWith('center.')) {
        const k = key.slice(7);
        next.regions[rid].center[k] = parseFloat(value) || 0;
      }
      return next;
    });
  }, []);

  const setCountryHeroThumbRef = useCallback((cid, ref) => {
    setDraft((d) => {
      const next = clone(d);
      next.homeCountryHeroRefs = { ...(next.homeCountryHeroRefs || {}) };
      next.homeCountryHeroRefs[cid] = ref;
      return next;
    });
  }, []);

  const setCountryHeroUri = useCallback((cid, text) => {
    setDraft((d) => {
      const next = clone(d);
      next.homeCountryHeroUris = { ...(next.homeCountryHeroUris || {}) };
      const t = (text || '').trim();
      if (t) next.homeCountryHeroUris[cid] = t;
      else delete next.homeCountryHeroUris[cid];
      return next;
    });
  }, []);

  const clearCountryHeroOverrides = useCallback((cid) => {
    setDraft((d) => {
      const next = clone(d);
      next.homeCountryHeroRefs = { ...(next.homeCountryHeroRefs || {}) };
      next.homeCountryHeroUris = { ...(next.homeCountryHeroUris || {}) };
      delete next.homeCountryHeroRefs[cid];
      delete next.homeCountryHeroUris[cid];
      return next;
    });
  }, []);

  const clearRegionHeroOverrides = useCallback((rid) => {
    setDraft((d) => {
      const next = clone(d);
      const r = next.regions[rid];
      if (!r) return d;
      delete r.heroThumbRef;
      r.heroUri = '';
      return next;
    });
  }, []);

  const requestMediaPermission = useCallback(async () => {
    const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!p.granted) {
      Alert.alert('', st(language, 'adminSaveFailed'));
      return false;
    }
    return true;
  }, [language]);

  const pickImages = useCallback(
    async ({ multiple = false } = {}) => {
      const ok = await requestMediaPermission();
      if (!ok) return [];
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: !multiple,
        allowsMultipleSelection: multiple,
        quality: 0.95,
        selectionLimit: 0,
      });
      if (res.canceled) return [];
      const uris = (res.assets || [])
        .map((a) => normalizePickedUri(a?.uri))
        .filter((u) => isAcceptedImageUri(u));
      return uris;
    },
    [requestMediaPermission],
  );

  const pickAiAdminPhotos = useCallback(async () => {
    const uris = await pickImages({ multiple: true });
    if (!uris.length) return;
    setAiAdminPhotoUris((prev) => {
      const next = [...prev];
      uris.forEach((u) => {
        if (!next.includes(u)) next.push(u);
      });
      return next.slice(0, 12);
    });
  }, [pickImages]);

  const removeAiAdminPhoto = useCallback((idx) => {
    setAiAdminPhotoUris((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const updateLandmark = useCallback((rid, lmIndex, key, value) => {
    setDraft((d) => {
      const next = clone(d);
      const r = next.regions[rid];
      if (!r?.landmarks?.[lmIndex]) return d;
      const lm = { ...r.landmarks[lmIndex] };
      if (key === 'lat' || key === 'lng' || key === 'minutes' || key === 'distKm') {
        lm[key] = value === '' ? undefined : Number(value);
      } else if (key === 'free') {
        lm.free = value === '1' || value === 'true';
      } else if (key === 'thumbRef') {
        lm.thumbRef = ['t1', 't2', 't3', 't4'].includes(value) ? value : 't1';
      } else if (key === 'thumbUri') {
        const u = String(value || '').trim();
        lm.thumbUri = isAcceptedImageUri(u) ? u : '';
      } else {
        lm[key] = value;
      }
      r.landmarks[lmIndex] = lm;
      return next;
    });
  }, []);

  const applyRegionMapsUrl = useCallback(() => {
    if (!selectedRegionId) return;
    const parsed = parseGoogleMapsLatLng(regionMapsUrl);
    if (!parsed) {
      Alert.alert('', 'Google Maps URL не містить координат.');
      return;
    }
    updateRegionField(selectedRegionId, 'center.latitude', String(parsed.lat));
    updateRegionField(selectedRegionId, 'center.longitude', String(parsed.lng));
  }, [regionMapsUrl, selectedRegionId, updateRegionField]);

  const applyLandmarkMapsUrl = useCallback(
    (rid, lmIndex) => {
      const key = `${rid}:${lmIndex}`;
      const parsed = parseGoogleMapsLatLng(landmarkMapsUrls[key] || '');
      if (!parsed) {
        Alert.alert('', 'Google Maps URL не містить координат.');
        return;
      }
      updateLandmark(rid, lmIndex, 'lat', String(parsed.lat));
      updateLandmark(rid, lmIndex, 'lng', String(parsed.lng));
    },
    [landmarkMapsUrls, updateLandmark],
  );

  const pickRegionHeroFromGallery = useCallback(async () => {
    if (!selectedRegionId) return;
    const uris = await pickImages({ multiple: false });
    if (!uris.length) return;
    updateRegionField(selectedRegionId, 'heroUri', uris[0]);
  }, [pickImages, selectedRegionId, updateRegionField]);

  const pickLandmarkThumbFromGallery = useCallback(
    async (rid, lmIndex) => {
      const uris = await pickImages({ multiple: false });
      if (!uris.length) return;
      updateLandmark(rid, lmIndex, 'thumbUri', uris[0]);
    },
    [pickImages, updateLandmark],
  );

  const pickLandmarkGallery = useCallback(
    async (rid, lmIndex) => {
      const uris = await pickImages({ multiple: true });
      if (!uris.length) return;
      setDraft((d) => {
        const n = clone(d);
        const x = n.regions[rid]?.landmarks?.[lmIndex];
        if (!x) return d;
        const prev = Array.isArray(x.galleryUris) ? x.galleryUris : [];
        const merged = [...prev];
        for (const u of uris) {
          if (!merged.includes(u)) merged.push(u);
        }
        x.galleryUris = merged;
        if (!x.thumbUri && merged[0]) x.thumbUri = merged[0];
        return n;
      });
    },
    [pickImages],
  );

  const moveLandmarkGalleryPhoto = useCallback((rid, lmIndex, photoIndex, dir) => {
    setDraft((d) => {
      const n = clone(d);
      const x = n.regions[rid]?.landmarks?.[lmIndex];
      if (!x || !Array.isArray(x.galleryUris)) return d;
      const j = photoIndex + dir;
      if (j < 0 || j >= x.galleryUris.length) return d;
      const t = x.galleryUris[photoIndex];
      x.galleryUris[photoIndex] = x.galleryUris[j];
      x.galleryUris[j] = t;
      if (x.galleryUris[0] && x.thumbUri && x.galleryUris.includes(x.thumbUri) && photoIndex === 0) {
        x.thumbUri = x.galleryUris[0];
      }
      return n;
    });
  }, []);

  const removeLandmarkGalleryPhoto = useCallback((rid, lmIndex, photoIndex) => {
    setDraft((d) => {
      const n = clone(d);
      const x = n.regions[rid]?.landmarks?.[lmIndex];
      if (!x || !Array.isArray(x.galleryUris)) return d;
      const removed = x.galleryUris[photoIndex];
      x.galleryUris.splice(photoIndex, 1);
      if (x.thumbUri === removed) x.thumbUri = x.galleryUris[0] || '';
      return n;
    });
  }, []);

  const pickLandmarkThumbPreset = useCallback((rid, lmIndex, ref) => {
    const k = HERO_THUMB_KEYS.includes(ref) ? ref : 't1';
    setDraft((d) => {
      const next = clone(d);
      const lm = next.regions[rid]?.landmarks?.[lmIndex];
      if (!lm) return d;
      lm.thumbRef = k;
      delete lm.thumbUri;
      return next;
    });
  }, []);

  const addLandmark = useCallback((rid) => {
    setDraft((d) => {
      const next = clone(d);
      const r = next.regions[rid];
      if (!r) return d;
      const id = `lm_${Date.now().toString(36)}`;
      r.landmarks = r.landmarks || [];
      r.landmarks.push({
        id,
        titleUk: '',
        titleEn: '',
        lat: 0,
        lng: 0,
        minutes: 30,
        free: true,
        thumbRef: 't1',
        descUk: '',
        descEn: '',
        story: emptyLandmarkStory(),
      });
      return next;
    });
  }, []);

  const removeLandmark = useCallback((rid, lmIndex) => {
    setDraft((d) => {
      const next = clone(d);
      const r = next.regions[rid];
      if (!r?.landmarks) return d;
      r.landmarks.splice(lmIndex, 1);
      return next;
    });
  }, []);

  const region = selectedRegionId ? draft.regions[selectedRegionId] : null;

  const runAiAdminAssistant = useCallback(() => {
    const prompt = String(aiAdminPrompt || '').trim();
    if (!prompt) {
      Alert.alert('', 'Напиши команду для AI-помічника.');
      return;
    }
    const countryMatch =
      prompt.match(/(?:країн[ауеиы]|краина|стран[ауеы]|country)\s*[:\-]?\s*([^\n,;]+)/i) ||
      prompt.match(/дод(?:ай|ати|ать)\s+(?:країн[ауеиы]|краину|страну)\s*[:\-]?\s*([^\n,;]+)/i);
    const countryRaw = countryMatch?.[1]?.trim() || '';
    let countryId = countryResolver(countryRaw) || selectedCountryId;
    if (!countryId) {
      const tokens = prompt
        .split(/[\s,;:.!?()[\]{}"“”'’`|/\\+-]+/g)
        .map((t) => t.trim())
        .filter(Boolean);
      for (const tk of tokens) {
        const hit = countryResolver(tk);
        if (hit) {
          countryId = hit;
          break;
        }
      }
      if (!countryId) {
        for (let i = 0; i < tokens.length - 1; i += 1) {
          const pair = `${tokens[i]} ${tokens[i + 1]}`;
          const hit = countryResolver(pair);
          if (hit) {
            countryId = hit;
            break;
          }
        }
      }
    }
    if (!countryId) {
      Alert.alert('', 'Не вдалося визначити країну. Додай назву країни в запит.');
      return;
    }

    const cityPartMatch =
      prompt.match(/(?:міста|города|cities|city)\s*[:\-]\s*([\s\S]+)/i) ||
      prompt.match(/дод(?:ай|ати|ать)\s+(?:міста?|города?)\s+(?:в|у|to)\s+[^\n:]+[:\-]?\s*([\s\S]+)/i);
    const wantsAllCities = /(?:всі|все|all)\s+(?:міста|города|cities|city)/i.test(prompt);
    const fallbackCityChunk = cityPartMatch
      ? ''
      : prompt
          .replace(/дод(?:ай|ати|ать)/gi, '')
          .replace(/(?:країн[ауеиы]|краина|стран[ауеы]|country)/gi, '')
          .replace(/(?:міста|місто|города|город|cities|city)/gi, '')
          .replace(/[0-9]/g, ' ');
    let cities = splitCitiesFromCommand(cityPartMatch?.[1] || fallbackCityChunk || '')
      .map((x) => x.trim())
      .filter((x) => x.length >= 2)
      .filter((x) => !/^(додай|додати|добавь|add)$/i.test(x))
      .filter((x) => !countryResolver(x))
      .filter(Boolean);
    if (wantsAllCities && cities.length === 0) {
      cities = [...(ALL_CITIES_PRESETS[countryId] || [])];
    }

    setDraft((d) => {
      const next = clone(d);
      if (!next.homeCountryOrder.includes(countryId)) next.homeCountryOrder.push(countryId);
      if (!next.homeRegionIdsByCountry[countryId]) next.homeRegionIdsByCountry[countryId] = [];
      next.homeCountryHeroUris = { ...(next.homeCountryHeroUris || {}) };
      next.homeCountryHeroRefs = { ...(next.homeCountryHeroRefs || {}) };
      if (aiAdminPhotoUris[0]) {
        next.homeCountryHeroUris[countryId] = aiAdminPhotoUris[0];
      }

      cities.forEach((cityName, idx) => {
        const pair = translateCityPair(cityName);
        let baseSlug = slugifyRegionName(pair.titleEn || pair.titleUk || cityName);
        if (!baseSlug) baseSlug = `region_${Date.now().toString(36)}_${idx}`;
        let slug = baseSlug;
        let attempts = 0;
        while (next.regions[slug] && attempts < 20) {
          attempts += 1;
          slug = `${baseSlug}_${attempts}`;
        }

        if (!next.regions[slug]) {
          next.regions[slug] = {
            id: slug,
            titleUk: pair.titleUk,
            titleEn: pair.titleEn,
            countryUk: countryLabels[countryId] || countryId,
            countryEn: countryLabelsEn[countryId] || countryId,
            flag: '🏳️',
            center: { latitude: 0, longitude: 0, latitudeDelta: 0.12, longitudeDelta: 0.12 },
            heroThumbRef: 't1',
            landmarks: [],
          };
        }
        if (!next.homeRegionIdsByCountry[countryId].includes(slug)) {
          next.homeRegionIdsByCountry[countryId].push(slug);
        }

        const img = aiAdminPhotoUris[idx + 1] || aiAdminPhotoUris[idx % Math.max(1, aiAdminPhotoUris.length)];
        if (img) {
          next.regions[slug].heroUri = img;
        }
      });
      return next;
    });

    setSelectedCountryId(countryId);
    setAiAdminPrompt('');
    Alert.alert('', `AI-помічник застосував зміни: ${countryId}${cities.length ? `, міст: ${cities.length}` : ''}.`);
  }, [aiAdminPrompt, aiAdminPhotoUris, countryLabels, countryLabelsEn, countryResolver, selectedCountryId]);

  const goAdminSecurity = useCallback(() => {
    navigation.navigate('AdminSecurity', {
      user: routeUser,
      language,
      appTheme,
      ...(countryId != null ? { countryId } : {}),
    });
  }, [navigation, routeUser, language, appTheme, countryId]);

  const onSectionLayout = useCallback((key) => (e) => {
    sectionY.current[key] = e.nativeEvent.layout.y;
  }, []);

  const scrollToSection = useCallback((key) => {
    const y = sectionY.current[key];
    if (typeof y !== 'number') return;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    setHubOpen(false);
  }, []);

  const openHubSecurity = useCallback(() => {
    setHubOpen(false);
    goAdminSecurity();
  }, [goAdminSecurity]);

  const hubMenuIconColor = isLight ? '#1E1E1E' : '#FFFFFF';

  return (
    <View style={[styles.root, { backgroundColor: isLight ? LIGHT_BAR_BG : APP_SCREEN_BG }]}>
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        replaceCenterTitle={st(language, 'adminPanelTitle')}
        hideSendButton
        lightBarBackgroundColor={isLight ? '#FFFFFF' : undefined}
        rightSlot={
          <Pressable
            onPress={() => setHubOpen(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1, padding: 4 }]}
            android_ripple={ripple}
            accessibilityRole="button"
            accessibilityLabel={st(language, 'adminHubMenuA11y')}
          >
            <Ionicons name="menu-outline" size={28} color={hubMenuIconColor} />
          </Pressable>
        }
      />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{
          paddingTop: 12,
          paddingBottom: insets.bottom + lightTabBarExtraScrollPadding() + 72,
          paddingHorizontal: 16,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View onLayout={onSectionLayout('intro')}>
        <Pressable
          onPress={goAdminSecurity}
          style={({ pressed }) => [
            styles.securityLink,
            {
              borderColor: border,
              backgroundColor: isLight ? 'rgba(2,18,235,0.06)' : 'rgba(225,255,0,0.08)',
              opacity: pressed ? 0.88 : 1,
            },
          ]}
          android_ripple={ripple}
        >
          <Ionicons name="shield-checkmark-outline" size={20} color={accent} style={{ marginRight: 10 }} />
          <Text style={[styles.securityLinkText, { color: textMain }]}>{st(language, 'adminSecurityAudit')}</Text>
          <Ionicons name="chevron-forward" size={18} color={muted} />
        </Pressable>

        <AdminSubscriptionGrantSection
          language={language}
          textMain={textMain}
          muted={muted}
          border={border}
          cardBg={cardBg}
          accent={accent}
          ripple={ripple}
          onAccentText={onAccentButtonText(isLight)}
        />

        <AdminSubscriptionCancelFeedbackSection
          language={language}
          textMain={textMain}
          muted={muted}
          border={border}
          cardBg={cardBg}
          accent={accent}
          ripple={ripple}
        />

        <View style={[styles.workflowBox, { borderColor: border, backgroundColor: isLight ? '#F6F7FB' : 'rgba(255,255,255,0.04)' }]}>
          <Text style={[styles.workflowTitle, { color: textMain }]}>{st(language, 'adminWorkflowTitle')}</Text>
          <Text style={[styles.workflowBody, { color: muted }]}>{st(language, 'adminWorkflowBody')}</Text>
          <Text style={[styles.sectionHint, { color: muted, marginTop: 10 }]}>
            Offline queue: {offlinePendingCount}
          </Text>
          <Pressable onPress={() => void flushOutboxNow({ reason: 'admin_manual' })} style={styles.clearHeroBtn}>
            <Text style={{ color: accent, fontWeight: '700' }}>Синхронізувати офлайн-чергу</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              try {
                navigation.navigate('OfflineOutbox');
              } catch {
                Alert.alert('', 'Екран OfflineOutbox ще не додано в navigator.');
              }
            }}
            style={styles.clearHeroBtn}
          >
            <Text style={{ color: accent, fontWeight: '700' }}>Відкрити чергу офлайн-синху</Text>
          </Pressable>
        </View>

        <View style={[styles.aiAdminCard, { borderColor: border, backgroundColor: cardBg }]}>
          <Text style={[styles.workflowTitle, { color: textMain }]}>AI-помічник адміна</Text>
          <Text style={[styles.sectionHint, { color: muted }]}>
            Напиши задачу текстом: "Додай країну Ukraine; міста: Kyiv, Odesa, Kharkiv". Можна додати 1-3+ фото.
          </Text>
          <View style={styles.fieldBlock}>
            <Text style={[styles.label, { color: muted }]}>Команда для AI</Text>
            <TextInput
              value={aiAdminPrompt}
              onChangeText={setAiAdminPrompt}
              placeholder="Додай країну Україна; міста: Київ, Одеса, Харків"
              placeholderTextColor={muted}
              style={[styles.input, styles.storyInput, { color: textMain, borderColor: border }]}
              multiline
              textAlignVertical="top"
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
            <Pressable onPress={pickAiAdminPhotos} style={styles.clearHeroBtn} android_ripple={ripple}>
              <Text style={{ color: accent, fontWeight: '600' }}>Додати фото (multi-select)</Text>
            </Pressable>
            <Pressable onPress={runAiAdminAssistant} style={styles.clearHeroBtn} android_ripple={ripple}>
              <Text style={{ color: accent, fontWeight: '700' }}>Виконати команду</Text>
            </Pressable>
          </View>
          {aiAdminPhotoUris.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryRow}>
              {aiAdminPhotoUris.map((uri, i) => (
                <View key={`${uri}:${i}`} style={[styles.galleryCard, { borderColor: border }]}>
                  <Image source={{ uri }} style={styles.galleryImg} resizeMode="cover" />
                  <View style={styles.galleryActions}>
                    <Text style={{ color: muted, fontSize: 12 }}>#{i + 1}</Text>
                    <Pressable onPress={() => removeAiAdminPhoto(i)} hitSlop={6}>
                      <Ionicons name="trash-outline" size={16} color="#EB4335" />
                    </Pressable>
                  </View>
                </View>
              ))}
            </ScrollView>
          ) : null}
        </View>

        <View style={styles.actionsRow}>
          <Pressable
            onPress={onSave}
            style={({ pressed }) => [styles.cta, { backgroundColor: accent, opacity: pressed ? 0.9 : 1 }]}
            android_ripple={ripple}
          >
            <Text style={[styles.ctaText, { color: onAccentButtonText(isLight) }]}>
              {st(language, 'adminSave')}
            </Text>
          </Pressable>
          <Pressable
            onPress={onReset}
            style={({ pressed }) => [
              styles.ctaOutline,
              { borderColor: accent, opacity: pressed ? 0.85 : 1 },
            ]}
            android_ripple={ripple}
          >
            <Text style={[styles.ctaOutlineText, { color: accent }]}>{st(language, 'adminReset')}</Text>
          </Pressable>
        </View>
        </View>

        <View onLayout={onSectionLayout('countries')}>
        <Text style={[styles.h2, { color: textMain }]}>{st(language, 'adminCountries')}</Text>
        {draft.homeCountryOrder.map((cid, idx) => (
          <Pressable
            key={cid}
            onPress={() => {
              setSelectedCountryId(cid);
              setSelectedRegionId(null);
            }}
            style={({ pressed }) => [
              styles.card,
              { backgroundColor: cardBg, borderColor: border, opacity: pressed ? 0.92 : 1 },
              selectedCountryId === cid && { borderColor: accent, borderWidth: 1.5 },
            ]}
            android_ripple={ripple}
          >
            <Text style={[styles.cardTitle, { color: textMain }]}>
              {countryLabels[cid] || cid} ({cid})
            </Text>
            <View style={styles.rowBtns}>
              <Pressable onPress={() => moveCountry(idx, -1)} style={styles.iconBtn} android_ripple={ripple}>
                <Ionicons name="arrow-up" size={20} color={accent} />
              </Pressable>
              <Pressable onPress={() => moveCountry(idx, 1)} style={styles.iconBtn} android_ripple={ripple}>
                <Ionicons name="arrow-down" size={20} color={accent} />
              </Pressable>
              <Pressable onPress={() => removeCountry(cid)} style={styles.iconBtn} android_ripple={ripple}>
                <Ionicons name="trash-outline" size={20} color="#EB4335" />
              </Pressable>
            </View>
          </Pressable>
        ))}

        <View style={[styles.inlineAdd, { borderColor: border }]}>
          <TextInput
            value={newCountryCode}
            onChangeText={setNewCountryCode}
            placeholder={st(language, 'adminCountryCodePlaceholder')}
            placeholderTextColor={muted}
            autoCapitalize="characters"
            maxLength={2}
            style={[styles.input, { color: textMain, borderColor: border }]}
          />
          <Pressable onPress={addCountry} style={({ pressed }) => [styles.smallCta, { opacity: pressed ? 0.9 : 1 }]}>
            <Text style={{ color: accent, fontWeight: '600' }}>{st(language, 'adminAddCountry')}</Text>
          </Pressable>
        </View>

        {!selectedCountryId ? (
          <View style={[styles.callout, { borderColor: border, backgroundColor: isLight ? '#FFF8E6' : 'rgba(255,200,80,0.12)' }]}>
            <Ionicons name="hand-left-outline" size={22} color={accent} style={{ marginRight: 10 }} />
            <Text style={[styles.calloutText, { color: textMain }]}>{st(language, 'adminPickCountryHint')}</Text>
          </View>
        ) : null}
        </View>

        {selectedCountryId ? (
          <View onLayout={onSectionLayout('regions')}>
            <Text style={[styles.h2, { color: textMain, marginTop: 20 }]}>
              {st(language, 'adminRegions')} — {countryLabels[selectedCountryId] || selectedCountryId} ({selectedCountryId})
            </Text>
            <Text style={[styles.subH, { color: textMain }]}>{st(language, 'adminHomeCountryHeroTitle')}</Text>
            <Text style={[styles.sectionHint, { color: muted, marginBottom: 8 }]}>
              {st(language, 'adminHomeCountryHeroHint')}
            </Text>
            <View style={styles.heroPickRow}>
              {HERO_THUMB_KEYS.map((k) => {
                const sel = (draft.homeCountryHeroRefs || {})[selectedCountryId] === k;
                return (
                  <Pressable
                    key={k}
                    onPress={() => setCountryHeroThumbRef(selectedCountryId, k)}
                    style={[
                      styles.heroPickBtn,
                      { borderColor: sel ? accent : border, backgroundColor: isLight ? '#F0F0F0' : '#222' },
                    ]}
                    android_ripple={ripple}
                  >
                    <Image source={HERO_THUMB_MAP[k]} style={styles.heroPickImg} resizeMode="cover" />
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.fieldBlock}>
              <Text style={[styles.label, { color: muted }]}>{st(language, 'adminHomeCountryHeroUri')}</Text>
              <TextInput
                value={(draft.homeCountryHeroUris || {})[selectedCountryId] || ''}
                onChangeText={(t) => setCountryHeroUri(selectedCountryId, t)}
                placeholder="https://…"
                placeholderTextColor={muted}
                autoCapitalize="none"
                keyboardType="url"
                style={[styles.input, { color: textMain, borderColor: border }]}
              />
            </View>
            <Pressable onPress={() => clearCountryHeroOverrides(selectedCountryId)} style={styles.clearHeroBtn}>
              <Text style={{ color: accent, fontWeight: '600' }}>{st(language, 'adminHomeCountryHeroClear')}</Text>
            </Pressable>
            <Text style={[styles.sectionHint, { color: muted, marginBottom: 10, marginTop: 14 }]}>
              {st(language, 'adminAddRegionBelowHint')}
            </Text>
            {(draft.homeRegionIdsByCountry[selectedCountryId] || []).map((rid, ridx) => (
              <View
                key={rid}
                style={[
                  styles.regionRowCard,
                  { backgroundColor: cardBg, borderColor: border },
                  selectedRegionId === rid && { borderColor: accent, borderWidth: 1.5 },
                ]}
              >
                <Pressable
                  onPress={() => setSelectedRegionId(rid)}
                  style={({ pressed }) => [styles.regionRowMain, { opacity: pressed ? 0.88 : 1 }]}
                  android_ripple={ripple}
                >
                  <Text style={[styles.cardTitle, { color: textMain }]} numberOfLines={2}>
                    {draft.regions[rid]?.titleUk || '—'}
                  </Text>
                  <Text style={[styles.regionSub, { color: muted }]} numberOfLines={1}>
                    {draft.regions[rid]?.titleEn || rid} · id: {rid}
                  </Text>
                </Pressable>
                <View style={styles.regionRowActions}>
                  <Pressable
                    onPress={() => moveRegionInCountry(selectedCountryId, ridx, -1)}
                    style={styles.iconBtn}
                    android_ripple={ripple}
                  >
                    <Ionicons name="arrow-up" size={18} color={accent} />
                  </Pressable>
                  <Pressable
                    onPress={() => moveRegionInCountry(selectedCountryId, ridx, 1)}
                    style={styles.iconBtn}
                    android_ripple={ripple}
                  >
                    <Ionicons name="arrow-down" size={18} color={accent} />
                  </Pressable>
                  <Pressable
                    onPress={() => removeRegionFromCountry(selectedCountryId, rid)}
                    style={styles.iconBtn}
                    android_ripple={ripple}
                  >
                    <Ionicons name="trash-outline" size={18} color="#EB4335" />
                  </Pressable>
                </View>
              </View>
            ))}
            <View style={[styles.inlineAdd, { borderColor: border }]}>
              <TextInput
                value={newRegionSlug}
                onChangeText={setNewRegionSlug}
                placeholder={st(language, 'adminRegionSlugPlaceholder')}
                placeholderTextColor={muted}
                autoCapitalize="none"
                style={[styles.input, { color: textMain, borderColor: border }]}
              />
              <Pressable onPress={addRegionSlug} style={({ pressed }) => [styles.smallCta, { opacity: pressed ? 0.9 : 1 }]}>
                <Text style={{ color: accent, fontWeight: '600' }}>{st(language, 'adminAddRegion')}</Text>
              </Pressable>
            </View>
            {!selectedRegionId && (draft.homeRegionIdsByCountry[selectedCountryId] || []).length > 0 ? (
              <View style={[styles.callout, { borderColor: border, marginTop: 12, backgroundColor: isLight ? '#EEF6FF' : 'rgba(98,134,228,0.12)' }]}>
                <Ionicons name="information-circle-outline" size={22} color={accent} style={{ marginRight: 10 }} />
                <Text style={[styles.calloutText, { color: textMain, fontWeight: '500' }]}>
                  {st(language, 'adminPickCityHint')}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {region ? (
          <View onLayout={onSectionLayout('city')}>
            <Text style={[styles.h2, { color: textMain, marginTop: 20 }]}>{st(language, 'adminRegionFields')}</Text>
            {[
              ['titleUk', st(language, 'adminTitleUk')],
              ['titleEn', st(language, 'adminTitleEn')],
              ['countryUk', st(language, 'adminCountryUk')],
              ['countryEn', st(language, 'adminCountryEn')],
              ['flag', st(language, 'adminFlag')],
            ].map(([key, label]) => (
              <View key={key} style={styles.fieldBlock}>
                <Text style={[styles.label, { color: muted }]}>{label}</Text>
                <TextInput
                  value={String(region[key] ?? '')}
                  onChangeText={(t) => updateRegionField(selectedRegionId, key, t)}
                  style={[styles.input, { color: textMain, borderColor: border }]}
                  placeholderTextColor={muted}
                />
              </View>
            ))}
            <Text style={[styles.label, { color: muted, marginTop: 8 }]}>{st(language, 'adminCenter')}</Text>
            <View style={styles.row4}>
              {['latitude', 'longitude', 'latitudeDelta', 'longitudeDelta'].map((k) => (
                <View key={k} style={{ flex: 1, marginRight: 6 }}>
                  <Text style={[styles.miniLabel, { color: muted }]}>{k}</Text>
                  <TextInput
                    value={String(region.center?.[k] ?? '')}
                    onChangeText={(t) => updateRegionField(selectedRegionId, `center.${k}`, t)}
                    keyboardType="decimal-pad"
                    style={[styles.input, { color: textMain, borderColor: border }]}
                    placeholderTextColor={muted}
                  />
                </View>
              ))}
            </View>
            <View style={styles.fieldBlock}>
              <Text style={[styles.label, { color: muted }]}>Google Maps URL (центр регіону)</Text>
              <TextInput
                value={regionMapsUrl}
                onChangeText={setRegionMapsUrl}
                placeholder="https://maps.google.com/..."
                placeholderTextColor={muted}
                autoCapitalize="none"
                keyboardType="url"
                style={[styles.input, { color: textMain, borderColor: border }]}
              />
            </View>
            <Pressable onPress={applyRegionMapsUrl} style={styles.clearHeroBtn} android_ripple={ripple}>
              <Text style={{ color: accent, fontWeight: '600' }}>Підставити lat/lng з URL</Text>
            </Pressable>

            <Text style={[styles.subH, { color: textMain, marginTop: 16 }]}>{st(language, 'adminRegionHeroTitle')}</Text>
            <Text style={[styles.sectionHint, { color: muted, marginBottom: 8 }]}>
              {st(language, 'adminRegionHeroHint')}
            </Text>
            <View style={styles.heroPickRow}>
              {HERO_THUMB_KEYS.map((k) => {
                const sel = region.heroThumbRef === k;
                return (
                  <Pressable
                    key={k}
                    onPress={() => updateRegionField(selectedRegionId, 'heroThumbRef', k)}
                    style={[
                      styles.heroPickBtn,
                      { borderColor: sel ? accent : border, backgroundColor: isLight ? '#F0F0F0' : '#222' },
                    ]}
                    android_ripple={ripple}
                  >
                    <Image source={HERO_THUMB_MAP[k]} style={styles.heroPickImg} resizeMode="cover" />
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.fieldBlock}>
              <Text style={[styles.label, { color: muted }]}>{st(language, 'adminRegionHeroUri')}</Text>
              <TextInput
                value={String(region.heroUri ?? '')}
                onChangeText={(t) => updateRegionField(selectedRegionId, 'heroUri', t)}
                placeholder="https://…"
                placeholderTextColor={muted}
                autoCapitalize="none"
                keyboardType="url"
                style={[styles.input, { color: textMain, borderColor: border }]}
              />
            </View>
            <Pressable onPress={pickRegionHeroFromGallery} style={styles.clearHeroBtn} android_ripple={ripple}>
              <Text style={{ color: accent, fontWeight: '600' }}>Обрати фото з галереї</Text>
            </Pressable>
            <Pressable onPress={() => clearRegionHeroOverrides(selectedRegionId)} style={styles.clearHeroBtn}>
              <Text style={{ color: accent, fontWeight: '600' }}>{st(language, 'adminRegionHeroClear')}</Text>
            </Pressable>

            <View style={styles.lmHeader}>
              <Text style={[styles.h2, { color: textMain }]}>{st(language, 'adminLandmarks')}</Text>
              <Pressable onPress={() => addLandmark(selectedRegionId)} android_ripple={ripple}>
                <Text style={{ color: accent, fontWeight: '600' }}>{st(language, 'adminAddLandmark')}</Text>
              </Pressable>
            </View>
            {(region.landmarks || []).map((lm, i) => (
              <View key={lm.id || i} style={[styles.lmCard, { backgroundColor: cardBg, borderColor: border }]}>
                <View style={styles.lmTop}>
                  <Text style={[styles.cardTitle, { color: textMain, flex: 1 }]} numberOfLines={2}>
                    {lm.titleUk || lm.titleEn || lm.id}
                  </Text>
                  <Pressable onPress={() => removeLandmark(selectedRegionId, i)} hitSlop={10}>
                    <Ionicons name="close-circle" size={22} color="#EB4335" />
                  </Pressable>
                </View>
                <Text style={[styles.lmSectionLabel, { color: accent }]}>{st(language, 'adminLandmarkBasics')}</Text>
                {[
                  ['titleUk', st(language, 'adminTitleUk')],
                  ['titleEn', st(language, 'adminTitleEn')],
                  ['id', st(language, 'adminLandmarkIdKey')],
                  ['lat', 'lat'],
                  ['lng', 'lng'],
                  ['minutes', 'min'],
                  ['distKm', 'km'],
                ].map(([key, label]) => (
                  <View key={key} style={styles.fieldBlock}>
                    <Text style={[styles.label, { color: muted }]}>{label}</Text>
                    <TextInput
                      value={String(lm[key] ?? '')}
                      onChangeText={(t) => updateLandmark(selectedRegionId, i, key, t)}
                      style={[styles.input, { color: textMain, borderColor: border }]}
                      placeholderTextColor={muted}
                      keyboardType={
                        key === 'lat' || key === 'lng' || key === 'minutes' || key === 'distKm'
                          ? 'decimal-pad'
                          : 'default'
                      }
                    />
                  </View>
                ))}
                <View style={styles.fieldBlock}>
                  <Text style={[styles.label, { color: muted }]}>Google Maps URL (пам'ятка)</Text>
                  <TextInput
                    value={landmarkMapsUrls[`${selectedRegionId}:${i}`] || ''}
                    onChangeText={(t) =>
                      setLandmarkMapsUrls((s) => ({
                        ...s,
                        [`${selectedRegionId}:${i}`]: t,
                      }))
                    }
                    placeholder="https://maps.google.com/..."
                    placeholderTextColor={muted}
                    autoCapitalize="none"
                    keyboardType="url"
                    style={[styles.input, { color: textMain, borderColor: border }]}
                  />
                </View>
                <Pressable
                  onPress={() => applyLandmarkMapsUrl(selectedRegionId, i)}
                  style={styles.clearHeroBtn}
                  android_ripple={ripple}
                >
                  <Text style={{ color: accent, fontWeight: '600' }}>Підставити lat/lng з URL</Text>
                </Pressable>
                <View style={styles.fieldBlock}>
                  <Text style={[styles.label, { color: muted }]}>{st(language, 'adminLandmarkFreeHint')}</Text>
                  <TextInput
                    value={lm.free ? '1' : '0'}
                    onChangeText={(t) => updateLandmark(selectedRegionId, i, 'free', t)}
                    style={[styles.input, { color: textMain, borderColor: border }]}
                    placeholderTextColor={muted}
                    keyboardType="number-pad"
                  />
                </View>
                <Text style={[styles.lmSectionLabel, { color: accent, marginTop: 10 }]}>
                  {st(language, 'adminLandmarkPhotoTitle')}
                </Text>
                <Text style={[styles.sectionHint, { color: muted, marginBottom: 8 }]}>
                  {st(language, 'adminLandmarkPhotoHint')}
                </Text>
                <View style={styles.lmPreviewRow}>
                  <Image
                    source={
                      lm.thumbUri && /^https?:\/\//i.test(String(lm.thumbUri).trim())
                        ? { uri: String(lm.thumbUri).trim() }
                        : HERO_THUMB_MAP[lm.thumbRef] || HERO_THUMB_MAP.t1
                    }
                    style={styles.lmPreviewImg}
                    resizeMode="cover"
                  />
                </View>
                <View style={styles.heroPickRow}>
                  {HERO_THUMB_KEYS.map((k) => {
                    const sel = (lm.thumbRef || 't1') === k && !String(lm.thumbUri || '').trim();
                    return (
                      <Pressable
                        key={k}
                        onPress={() => pickLandmarkThumbPreset(selectedRegionId, i, k)}
                        style={[
                          styles.heroPickBtn,
                          { borderColor: sel ? accent : border, backgroundColor: isLight ? '#F0F0F0' : '#222' },
                        ]}
                        android_ripple={ripple}
                      >
                        <Image source={HERO_THUMB_MAP[k]} style={styles.heroPickImg} resizeMode="cover" />
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.fieldBlock}>
                  <Text style={[styles.label, { color: muted }]}>{st(language, 'adminLandmarkThumbUri')}</Text>
                  <TextInput
                    value={String(lm.thumbUri ?? '')}
                    onChangeText={(t) => updateLandmark(selectedRegionId, i, 'thumbUri', t)}
                    placeholder="https://…"
                    placeholderTextColor={muted}
                    autoCapitalize="none"
                    keyboardType="url"
                    style={[styles.input, { color: textMain, borderColor: border }]}
                  />
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 4 }}>
                  <Pressable onPress={() => pickLandmarkThumbFromGallery(selectedRegionId, i)} style={styles.clearHeroBtn} android_ripple={ripple}>
                    <Text style={{ color: accent, fontWeight: '600' }}>Обрати головне фото</Text>
                  </Pressable>
                  <Pressable onPress={() => pickLandmarkGallery(selectedRegionId, i)} style={styles.clearHeroBtn} android_ripple={ripple}>
                    <Text style={{ color: accent, fontWeight: '600' }}>Додати багато фото</Text>
                  </Pressable>
                </View>
                {Array.isArray(lm.galleryUris) && lm.galleryUris.length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryRow}>
                    {lm.galleryUris.map((uri, gi) => (
                      <View key={`${uri}:${gi}`} style={[styles.galleryCard, { borderColor: border }]}>
                        <Image source={{ uri }} style={styles.galleryImg} resizeMode="cover" />
                        <View style={styles.galleryActions}>
                          <Pressable onPress={() => moveLandmarkGalleryPhoto(selectedRegionId, i, gi, -1)} hitSlop={6}>
                            <Ionicons name="arrow-back" size={16} color={accent} />
                          </Pressable>
                          <Pressable onPress={() => moveLandmarkGalleryPhoto(selectedRegionId, i, gi, 1)} hitSlop={6}>
                            <Ionicons name="arrow-forward" size={16} color={accent} />
                          </Pressable>
                          <Pressable onPress={() => removeLandmarkGalleryPhoto(selectedRegionId, i, gi)} hitSlop={6}>
                            <Ionicons name="trash-outline" size={16} color="#EB4335" />
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                ) : null}
                <Pressable
                  onPress={() => {
                    setDraft((d) => {
                      const n = clone(d);
                      const x = n.regions[selectedRegionId]?.landmarks?.[i];
                      if (!x) return d;
                      delete x.thumbUri;
                      if (!HERO_THUMB_KEYS.includes(x.thumbRef)) x.thumbRef = 't1';
                      return n;
                    });
                  }}
                  style={styles.clearHeroBtn}
                >
                  <Text style={{ color: accent, fontWeight: '600' }}>{st(language, 'adminLandmarkThumbClear')}</Text>
                </Pressable>
                <Text style={[styles.lmSectionLabel, { color: accent, marginTop: 14 }]}>
                  {st(language, 'adminLandmarkStory')}
                </Text>
                {[
                  ['descUk', st(language, 'adminDescUk')],
                  ['descEn', st(language, 'adminDescEn')],
                ].map(([key, label]) => (
                  <View key={key} style={styles.fieldBlock}>
                    <Text style={[styles.label, { color: muted }]}>{label}</Text>
                    <TextInput
                      value={String(lm[key] ?? '')}
                      onChangeText={(t) => updateLandmark(selectedRegionId, i, key, t)}
                      style={[styles.input, styles.storyInput, { color: textMain, borderColor: border }]}
                      placeholderTextColor={muted}
                      multiline
                      textAlignVertical="top"
                    />
                  </View>
                ))}
                <AdminLandmarkStoryFields
                  language={language}
                  story={lm.story}
                  onChangeStory={(next) => {
                    setDraft((d) => {
                      const n = clone(d);
                      const x = n.regions[selectedRegionId]?.landmarks?.[i];
                      if (!x) return d;
                      x.story = normalizeLandmarkStory(next);
                      return n;
                    });
                  }}
                  textMain={textMain}
                  muted={muted}
                  border={border}
                  accent={accent}
                  ripple={ripple}
                  isLight={isLight}
                />
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={hubOpen} animationType="fade" transparent onRequestClose={() => setHubOpen(false)}>
        <View style={styles.hubRoot}>
          <Pressable style={styles.hubBackdrop} onPress={() => setHubOpen(false)} />
          <View
            style={[
              styles.hubDrawer,
              {
                backgroundColor: cardBg,
                borderColor: border,
                paddingTop: insets.top + 12,
                paddingBottom: insets.bottom + 20,
              },
            ]}
          >
            <Text style={[styles.hubTitle, { color: textMain }]}>{st(language, 'adminHubTitle')}</Text>
            <Pressable
              onPress={() => scrollToSection('intro')}
              style={({ pressed }) => [styles.hubRow, { borderColor: border, opacity: pressed ? 0.85 : 1 }]}
              android_ripple={ripple}
            >
              <Ionicons name="document-text-outline" size={22} color={accent} style={{ marginRight: 12 }} />
              <Text style={[styles.hubRowLabel, { color: textMain }]}>{st(language, 'adminHubNavIntro')}</Text>
              <Ionicons name="chevron-forward" size={18} color={muted} />
            </Pressable>
            <Pressable
              onPress={() => scrollToSection('countries')}
              style={({ pressed }) => [styles.hubRow, { borderColor: border, opacity: pressed ? 0.85 : 1 }]}
              android_ripple={ripple}
            >
              <Ionicons name="earth-outline" size={22} color={accent} style={{ marginRight: 12 }} />
              <Text style={[styles.hubRowLabel, { color: textMain }]}>{st(language, 'adminHubNavCountries')}</Text>
              <Ionicons name="chevron-forward" size={18} color={muted} />
            </Pressable>
            <Pressable
              onPress={() => scrollToSection('regions')}
              style={({ pressed }) => [
                styles.hubRow,
                {
                  borderColor: border,
                  opacity: pressed ? 0.85 : !selectedCountryId ? 0.45 : 1,
                },
              ]}
              android_ripple={ripple}
              disabled={!selectedCountryId}
            >
              <Ionicons name="business-outline" size={22} color={accent} style={{ marginRight: 12 }} />
              <Text style={[styles.hubRowLabel, { color: textMain }]}>{st(language, 'adminHubNavRegions')}</Text>
              <Ionicons name="chevron-forward" size={18} color={muted} />
            </Pressable>
            <Pressable
              onPress={() => scrollToSection('city')}
              style={({ pressed }) => [
                styles.hubRow,
                { borderColor: border, opacity: pressed ? 0.85 : !region ? 0.45 : 1 },
              ]}
              android_ripple={ripple}
              disabled={!region}
            >
              <Ionicons name="location-outline" size={22} color={accent} style={{ marginRight: 12 }} />
              <Text style={[styles.hubRowLabel, { color: textMain }]}>{st(language, 'adminHubNavCity')}</Text>
              <Ionicons name="chevron-forward" size={18} color={muted} />
            </Pressable>
            <Pressable
              onPress={openHubSecurity}
              style={({ pressed }) => [styles.hubRow, { borderColor: border, opacity: pressed ? 0.85 : 1 }]}
              android_ripple={ripple}
            >
              <Ionicons name="shield-checkmark-outline" size={22} color={accent} style={{ marginRight: 12 }} />
              <Text style={[styles.hubRowLabel, { color: textMain }]}>{st(language, 'adminSecurityAudit')}</Text>
              <Ionicons name="chevron-forward" size={18} color={muted} />
            </Pressable>
            <Pressable
              onPress={() => {
                setHubOpen(false);
                void onSave();
              }}
              style={({ pressed }) => [styles.hubRow, { borderColor: border, opacity: pressed ? 0.85 : 1 }]}
              android_ripple={ripple}
            >
              <Ionicons name="save-outline" size={22} color={accent} style={{ marginRight: 12 }} />
              <Text style={[styles.hubRowLabel, { color: textMain }]}>{st(language, 'adminSave')}</Text>
            </Pressable>
            <Pressable
              onPress={() => setHubOpen(false)}
              style={({ pressed }) => [styles.hubRow, { borderColor: border, opacity: pressed ? 0.85 : 1, marginTop: 8 }]}
              android_ripple={ripple}
            >
              <Ionicons name="close-outline" size={22} color={muted} style={{ marginRight: 12 }} />
              <Text style={[styles.hubRowLabel, { color: muted }]}>{st(language, 'adminHubClose')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Pressable
        onPress={onSave}
        style={({ pressed }) => [
          styles.fab,
          {
            bottom: Math.max(20, insets.bottom + 12),
            backgroundColor: accent,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
        android_ripple={ripple}
        accessibilityRole="button"
        accessibilityLabel={st(language, 'adminFabSaveA11y')}
      >
        <Ionicons name="save" size={26} color={onAccentButtonText(isLight)} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  securityLink: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 14,
  },
  securityLinkText: { fontSize: 15, fontWeight: '700', flex: 1 },
  actionsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  cta: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  ctaText: { fontWeight: '700', fontSize: 15 },
  ctaOutline: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  ctaOutlineText: { fontWeight: '700', fontSize: 15 },
  h2: { fontSize: 18, fontWeight: '700', marginBottom: 10 },
  subH: { fontSize: 15, fontWeight: '700', marginBottom: 6, marginTop: 4 },
  heroPickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  heroPickBtn: {
    width: 64,
    height: 64,
    borderRadius: 10,
    borderWidth: 2,
    overflow: 'hidden',
  },
  heroPickImg: { width: '100%', height: '100%' },
  clearHeroBtn: { alignSelf: 'flex-start', marginBottom: 4, paddingVertical: 6 },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  rowBtns: { flexDirection: 'row', marginTop: 10, gap: 8 },
  iconBtn: { padding: 8 },
  inlineAdd: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, marginBottom: 8 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
    flex: 1,
  },
  smallCta: { paddingVertical: 10, paddingHorizontal: 8 },
  fieldBlock: { marginBottom: 10 },
  label: { fontSize: 13, marginBottom: 4 },
  miniLabel: { fontSize: 11, marginBottom: 2 },
  row4: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  lmHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  lmCard: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, marginBottom: 12 },
  lmTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  lmPreviewRow: { marginBottom: 10 },
  lmPreviewImg: {
    width: 88,
    height: 88,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128,128,128,0.35)',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  galleryRow: { gap: 10, paddingBottom: 6, marginBottom: 6 },
  galleryCard: {
    width: 108,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    backgroundColor: 'rgba(128,128,128,0.08)',
  },
  galleryImg: { width: '100%', height: 78 },
  galleryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  workflowBox: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 14,
  },
  aiAdminCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 14,
  },
  workflowTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  workflowBody: { fontSize: 14, lineHeight: 21 },
  callout: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  calloutText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  sectionHint: { fontSize: 13, lineHeight: 19, marginBottom: 8 },
  regionRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
    overflow: 'hidden',
  },
  regionRowMain: { flex: 1, paddingVertical: 12, paddingHorizontal: 14 },
  regionSub: { fontSize: 13, marginTop: 4, fontWeight: '500' },
  regionRowActions: { flexDirection: 'row', alignItems: 'center', paddingRight: 6 },
  lmSectionLabel: { fontSize: 13, fontWeight: '700', marginBottom: 8, letterSpacing: 0.2 },
  storyInput: { minHeight: 100, paddingTop: Platform.OS === 'ios' ? 10 : 8 },
  hubRoot: { flex: 1, flexDirection: 'row' },
  hubBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  hubDrawer: {
    width: 300,
    maxWidth: '88%',
    borderLeftWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
  },
  hubTitle: { fontSize: 18, fontWeight: '800', marginBottom: 6 },
  hubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  hubRowLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: 18,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
});

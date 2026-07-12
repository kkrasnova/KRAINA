import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Platform,
  Alert,
  Modal,
  FlatList,
  Image,
  ActivityIndicator,
  Switch,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { brandFontSans, brandFontSansSemibold } from './brandFont';
import { getAppTheme, resolveAppTheme } from './themeStorage';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { useSyncedAppLanguage } from './useAppLanguage';
import { pf } from './profileI18n';
import { lightTabBarScrollContentPadding } from './LightBottomTabBar';
import {
  getProfileDisplayName,
  setProfileDisplayName,
  getProfileUsername,
  setProfileUsername,
  getProfileCity,
  setProfileCity,
  getProfileBio,
  setProfileBio,
  getProfileBirthDate,
  setProfileBirthDate,
  getProfileBirthPublic,
  setProfileBirthPublic,
  getProfileAvatarLocalUri,
  setProfileAvatarLocalUri,
  clearProfileAvatarLocalUri,
} from './profileStorage';
import { useAuthStore } from './auth/authStore';
import ProfileAvatarCircle, { resolveProfileAvatarUri } from './ProfileAvatarCircle';
import { patchProfileMe, postProfileAvatar, deleteProfileAvatar, ensureProfileBackendSession, applyProfileMeOptimisticPatch } from './profileApi';
import { applyServerProfileToLocal } from './profileMeSync';
import { ApiError } from './auth/types';
import { emitProfileMeUpdated } from './profileMeSync';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { listRouteCitiesForProfilePicker } from './routeRegionsData';
import { APP_LANGUAGE_OPTIONS } from './appLanguageOptions';
import { ensureUploadableImageUri } from './feedMediaPersist';
import { errorToUserText } from './errorText';

const INPUT_BG_LIGHT = 'rgba(0,0,0,0.06)';
const PROFILE_USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

function normalizeUsernameRaw(raw) {
  return String(raw || '').trim().replace(/^@/, '');
}

function isValidProfileUsername(uRaw) {
  return PROFILE_USERNAME_RE.test(uRaw);
}
const AVATAR_RING_SIZE = 100;
const AVATAR_RING_BORDER = 3;
const AVATAR_INNER_SIZE = AVATAR_RING_SIZE - AVATAR_RING_BORDER * 2;

function parseBirthToDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return null;
  const [y, m, d] = iso.trim().split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

function formatBirthIso(d) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function formatBirthLabel(iso, lang) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return '';
  const [y, m, d] = iso.trim().split('-');
  const base = String(lang || 'en').split(/[-_]/)[0].toLowerCase();
  return base === 'uk' ? `${d}.${m}.${y}` : `${m}/${d}/${y}`;
}

function daysInMonth(year, month1to12) {
  return new Date(year, month1to12, 0).getDate();
}

function isValidCalendarDate(y, m, d) {
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function BirthDateSteppers({ pickY, pickM, pickD, onChangeY, onChangeM, onChangeD, textMain, ripple, langUk }) {
  const cy = new Date().getFullYear();
  const cm = new Date().getMonth() + 1;
  const cd = new Date().getDate();
  const maxM = pickY < cy ? 12 : cm;
  const dim = daysInMonth(pickY, pickM);
  const maxD =
    pickY < cy || pickM < cm ? dim : pickY === cy && pickM === cm ? Math.min(cd, dim) : dim;

  const decYear = () => onChangeY((y) => Math.max(1920, y - 1));
  const incYear = () => onChangeY((y) => Math.min(cy, y + 1));

  const decMonth = () => {
    if (pickM > 1) onChangeM((m) => m - 1);
    else if (pickY > 1920) {
      onChangeY((y) => y - 1);
      onChangeM(() => 12);
    }
  };

  const incMonth = () => {
    if (pickM < maxM) onChangeM((m) => m + 1);
    else if (pickY < cy && pickM === 12) {
      onChangeY((y) => y + 1);
      onChangeM(() => 1);
    }
  };

  const decDay = () => onChangeD((d) => Math.max(1, d - 1));
  const incDay = () => onChangeD((d) => Math.min(maxD, d + 1));

  const stepBtn = (onPress, icon, disabled) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.birthStepBtn,
        pressed && !disabled && { opacity: 0.75 },
        disabled && { opacity: 0.35 },
      ]}
      android_ripple={ripple}
      hitSlop={8}
    >
      <Ionicons name={icon} size={28} color={textMain} />
    </Pressable>
  );

  const col = (label, value, dec, inc, decDisabled, incDisabled) => (
    <View style={styles.birthStepCol}>
      <Text style={[styles.birthStepHead, { color: textMain }, brandFontSansSemibold]}>{label}</Text>
      <View style={styles.birthStepControlRow}>
        {stepBtn(dec, 'remove-circle-outline', decDisabled)}
        <Text style={[styles.birthStepVal, { color: textMain }, brandFontSansSemibold]}>{value}</Text>
        {stepBtn(inc, 'add-circle-outline', incDisabled)}
      </View>
    </View>
  );

  return (
    <View style={styles.birthStepWrap}>
      {col(
        langUk ? 'Рік' : 'Year',
        pickY,
        decYear,
        incYear,
        pickY <= 1920,
        pickY >= cy,
      )}
      {col(
        langUk ? 'Місяць' : 'Month',
        String(pickM).padStart(2, '0'),
        decMonth,
        incMonth,
        pickY <= 1920 && pickM <= 1,
        pickY >= cy && pickM >= maxM,
      )}
      {col(
        langUk ? 'День' : 'Day',
        String(pickD).padStart(2, '0'),
        decDay,
        incDay,
        pickD <= 1,
        pickD >= maxD,
      )}
    </View>
  );
}

export default function ProfileEditPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const user = route?.params?.user || {};
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [city, setCity] = useState('');
  const [cityModalOpen, setCityModalOpen] = useState(false);
  const [cityFilter, setCityFilter] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [birthPickerOpen, setBirthPickerOpen] = useState(false);
  const [pickY, setPickY] = useState(2000);
  const [pickM, setPickM] = useState(1);
  const [pickD, setPickD] = useState(15);
  const [showBirthPublic, setShowBirthPublic] = useState(false);
  const localeForUi = useSyncedAppLanguage(route, 'uk');
  const [appTheme, setAppTheme] = useState(resolveAppTheme(route?.params?.appTheme));
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [localAvatarUri, setLocalAvatarUri] = useState('');
  const saveTimerRef = useRef(null);
  const saveInFlightRef = useRef(null);

  const profileMe = useAuthStore((s) => s.profileMe);
  const accessToken = useAuthStore((s) => s.accessToken);
  const avatarUrl = profileMe?.profile?.avatar_url || null;
  const avatarDisplayUri = resolveProfileAvatarUri({
    isOwnProfile: true,
    accessToken,
    profileAvatarUrlRaw: avatarUrl,
    localAvatarUri,
    userAvatar: user?.avatar,
  });

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const screenBg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const inputBg = isLight ? INPUT_BG_LIGHT : 'rgba(255,255,255,0.08)';
  const cardBg = isLight ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.06)';
  const cardBorder = isLight ? 'rgba(2, 18, 235, 0.14)' : 'rgba(255,255,255,0.12)';
  const inputBorder = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)';
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;

  const openBirthPicker = useCallback(() => {
    const d = parseBirthToDate(birthDate) || new Date(2000, 0, 15);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    let day = d.getDate();
    const max = daysInMonth(y, m);
    if (day > max) day = max;
    setPickY(y);
    setPickM(m);
    setPickD(day);
    setBirthPickerOpen(true);
  }, [birthDate]);

  useEffect(() => {
    if (!birthPickerOpen) return;
    const cy = new Date().getFullYear();
    const cm = new Date().getMonth() + 1;
    const cd = new Date().getDate();
    const y = Math.min(Math.max(1920, pickY), cy);
    const m = Math.min(Math.max(1, pickM), y < cy ? 12 : cm);
    const dim = daysInMonth(y, m);
    const capD = y === cy && m === cm ? Math.min(cd, dim) : dim;
    const d = Math.min(Math.max(1, pickD), capD);
    if (y !== pickY) setPickY(y);
    if (m !== pickM) setPickM(m);
    if (d !== pickD) setPickD(d);
  }, [birthPickerOpen, pickY, pickM, pickD]);

  const load = useCallback(async () => {
    const [t, n, u, b, c, bd, bp, avLo] = await Promise.all([
      getAppTheme(),
      getProfileDisplayName(user?.name || "Мар'яна Роза"),
      getProfileUsername(),
      getProfileBio(),
      getProfileCity(),
      getProfileBirthDate(),
      getProfileBirthPublic(),
      getProfileAvatarLocalUri(),
    ]);
    setAppTheme(t === 'light' ? 'light' : 'dark');
    setName(n);
    setUsername(u);
    setBio(b);
    setCity(c);
    setBirthDate(bd);
    setShowBirthPublic(bp);
    setLocalAvatarUri(avLo || '');
  }, [user?.name]);

  const mergeServerProfileIfEmpty = useCallback((p) => {
    if (!p || typeof p !== 'object') return;
    setUsername((prev) => {
      const cur = normalizeUsernameRaw(prev);
      if (cur) return prev;
      return p.username ? `@${String(p.username).replace(/^@/, '')}` : prev;
    });
    setBio((prev) => (prev.trim() ? prev : p.bio != null ? String(p.bio) : prev));
    setName((prev) =>
      prev.trim()
        ? prev
        : p.display_name != null && String(p.display_name).trim()
          ? String(p.display_name).trim()
          : prev,
    );
    setCity((prev) =>
      prev.trim()
        ? prev
        : p.location_label != null && String(p.location_label).trim()
          ? String(p.location_label).trim()
          : prev,
    );
    setBirthDate((prev) => (prev.trim() ? prev : p.birth_date ? String(p.birth_date).slice(0, 10) : prev));
    setShowBirthPublic((prev) =>
      prev ? prev : p.birth_date_public != null ? Boolean(p.birth_date_public) : prev,
    );
  }, []);

  const uploadAvatarToServer = useCallback(
    async (persisted, mime = 'image/jpeg') => {
      const hasSession = await ensureProfileBackendSession(user);
      if (!hasSession) return false;

      setAvatarBusy(true);
      try {
        const res = await postProfileAvatar(useAuthStore.getState().accessToken, persisted, mime);
        const serverUrl = res?.avatar_url ? String(res.avatar_url) : '';
        if (serverUrl) {
          applyProfileMeOptimisticPatch({ avatar_url: serverUrl });
          await clearProfileAvatarLocalUri();
          setLocalAvatarUri('');
        }
        emitProfileMeUpdated({ source: 'avatar_upload' });
        void useAuthStore.getState().loadProfileMeIfStale(2500);
        return !!serverUrl;
      } catch (e) {
        if (__DEV__) console.warn('[ProfileEdit] avatar upload:', e?.message);
        return false;
      } finally {
        setAvatarBusy(false);
      }
    },
    [user],
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        await load();
        if (cancelled) return;
        const cached = useAuthStore.getState().profileMe?.profile;
        if (cached) mergeServerProfileIfEmpty(cached);

        const hasSession = await ensureProfileBackendSession(user);
        if (cancelled || !hasSession) return;
        try {
          await useAuthStore.getState().loadProfileMeIfStale(4000);
          if (cancelled) return;
          const fresh = useAuthStore.getState().profileMe?.profile;
          if (!fresh) return;
          mergeServerProfileIfEmpty(fresh);
          if (fresh.username) {
            await setProfileUsername(String(fresh.username).replace(/^@/, ''));
          }
          await applyServerProfileToLocal(fresh);
        } catch {
          /* */
        }
        const pendingAvatar = await getProfileAvatarLocalUri();
        if (!cancelled && pendingAvatar) {
          await uploadAvatarToServer(pendingAvatar);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [load, user, mergeServerProfileIfEmpty, uploadAvatarToServer]),
  );

  const applyAvatarFromAsset = useCallback(
    async (asset) => {
      if (!asset?.uri) return;
      const mime = asset.mimeType || 'image/jpeg';
      const persisted = await ensureUploadableImageUri(asset.uri, {
        mimeType: mime,
        assetId: asset.assetId,
      });
      if (!persisted) {
        Alert.alert('', pf(localeForUi, 'avatarUploadError'));
        return;
      }

      await setProfileAvatarLocalUri(persisted);
      setLocalAvatarUri(persisted);
      emitProfileMeUpdated({ source: 'avatar_pick_local' });

      await uploadAvatarToServer(persisted, mime);
    },
    [localeForUi, uploadAvatarToServer],
  );

  const pickAvatar = useCallback(async () => {
    if (avatarBusy) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('', pf(localeForUi, 'needGalleryPermission'));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.82,
      allowsEditing: false,
    });
    if (res.canceled || !res.assets?.[0]) return;
    void applyAvatarFromAsset(res.assets[0]);
  }, [avatarBusy, applyAvatarFromAsset, localeForUi]);

  const takeAvatarPhoto = useCallback(async () => {
    if (avatarBusy) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('', pf(localeForUi, 'needCameraPermission'));
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.82,
      allowsEditing: false,
    });
    if (res.canceled || !res.assets?.[0]) return;
    void applyAvatarFromAsset(res.assets[0]);
  }, [avatarBusy, applyAvatarFromAsset, localeForUi]);

  const confirmRemoveAvatar = useCallback(() => {
    if (!avatarDisplayUri) return;
    Alert.alert('', pf(localeForUi, 'removeAvatarConfirm'), [
      { text: pf(localeForUi, 'cancel'), style: 'cancel' },
      {
        text: pf(localeForUi, 'removeAvatar'),
        style: 'destructive',
        onPress: async () => {
          setAvatarBusy(true);
          try {
            await clearProfileAvatarLocalUri();
            setLocalAvatarUri('');
            const hasSession = await ensureProfileBackendSession(user);
            if (!hasSession) {
              emitProfileMeUpdated({ source: 'avatar_remove_local' });
              return;
            }
            await deleteProfileAvatar(useAuthStore.getState().accessToken);
            applyProfileMeOptimisticPatch({ avatar_url: null });
            emitProfileMeUpdated({ source: 'avatar_remove' });
            void useAuthStore.getState().loadProfileMeIfStale(2500);
          } catch (e) {
            const msg = errorToUserText(e, localeForUi);
            Alert.alert('', msg || pf(localeForUi, 'avatarUploadError'));
          } finally {
            setAvatarBusy(false);
          }
        },
      },
    ]);
  }, [localeForUi, avatarDisplayUri, user]);

  const cityRows = useMemo(() => listRouteCitiesForProfilePicker(localeForUi), [localeForUi]);
  const filteredCityRows = useMemo(() => {
    const q = cityFilter.trim().toLowerCase();
    if (!q) return cityRows;
    return cityRows.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        (r.subtitle && r.subtitle.toLowerCase().includes(q)),
    );
  }, [cityRows, cityFilter]);

  const languageLabel =
    APP_LANGUAGE_OPTIONS.find((o) => o.id === localeForUi)?.label || localeForUi;

  const shell = {
    user,
    language: localeForUi,
    ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
    appTheme,
  };

  const flushProfileSave = useCallback(
    async (overrides = {}) => {
      const snapshot = {
        name,
        username,
        bio,
        city,
        birthDate,
        showBirthPublic,
        ...overrides,
      };
      const uRaw = normalizeUsernameRaw(snapshot.username);
      const bd = String(snapshot.birthDate || '').trim();
      if (bd) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(bd)) return false;
        const [y, m, d] = bd.split('-').map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d));
        if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
          return false;
        }
      }

      await Promise.all([
        setProfileDisplayName(snapshot.name),
        setProfileUsername(uRaw),
        setProfileBio(snapshot.bio),
        setProfileCity(snapshot.city),
        setProfileBirthDate(bd),
        setProfileBirthPublic(snapshot.showBirthPublic),
      ]);

      const patchBody = {
        bio: String(snapshot.bio || '').trim() || null,
        language: localeForUi,
        display_name: String(snapshot.name || '').trim() || null,
        birth_date: bd || null,
        birth_date_public: !!snapshot.showBirthPublic,
        location_label: String(snapshot.city || '').trim() || null,
      };
      if (uRaw.length >= 3 && isValidProfileUsername(uRaw)) {
        patchBody.username = uRaw;
      }
      applyProfileMeOptimisticPatch(patchBody);
      emitProfileMeUpdated({ source: 'profile_edit' });

      const hasSession = await ensureProfileBackendSession(user);
      if (!hasSession) return true;

      try {
        try {
          await patchProfileMe(useAuthStore.getState().accessToken, patchBody);
        } catch (e) {
          const isNetwork =
            e instanceof ApiError && (e.status === 0 || String(e.message || '').toUpperCase() === 'NETWORK_ERROR');
          if (isNetwork && (await ensureProfileBackendSession(user))) {
            await patchProfileMe(useAuthStore.getState().accessToken, patchBody);
          } else {
            throw e;
          }
        }
        void useAuthStore.getState().loadProfileMeIfStale(2000);
        const saved = useAuthStore.getState().profileMe?.profile?.username;
        if (saved) setUsername(`@${String(saved).replace(/^@/, '')}`);
        return true;
      } catch (e) {
        const msg = errorToUserText(e, localeForUi);
        if (msg) Alert.alert('', msg);
        return false;
      }
    },
    [name, username, bio, city, birthDate, showBirthPublic, localeForUi, user],
  );

  const scheduleProfileSave = useCallback(
    (overrides = {}, delayMs = 350) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        if (saveInFlightRef.current) {
          saveInFlightRef.current = saveInFlightRef.current.finally(() => flushProfileSave(overrides));
        } else {
          saveInFlightRef.current = flushProfileSave(overrides).finally(() => {
            saveInFlightRef.current = null;
          });
        }
      }, delayMs);
    },
    [flushProfileSave],
  );

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    [],
  );

  const persistUsernameField = useCallback(
    async (rawValue) => {
      const uRaw = normalizeUsernameRaw(rawValue);
      if (uRaw.length > 0 && uRaw.length < 3) return;
      if (uRaw.length >= 3 && !isValidProfileUsername(uRaw)) {
        Alert.alert('', pf(localeForUi, 'editUsernameShort'));
        return;
      }
      await flushProfileSave({ username: uRaw.length ? `@${uRaw}` : '' });
    },
    [flushProfileSave, localeForUi],
  );

  const onDone = async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const uRaw = normalizeUsernameRaw(username);
    if (uRaw.length > 0 && (uRaw.length < 3 || !isValidProfileUsername(uRaw))) {
      Alert.alert('', pf(localeForUi, 'editUsernameShort'));
      return;
    }
    const bd = birthDate.trim();
    if (bd && !/^\d{4}-\d{2}-\d{2}$/.test(bd)) {
      Alert.alert('', pf(localeForUi, 'invalidBirthDate'));
      return;
    }
    const ok = await flushProfileSave();
    if (ok === false) return;
    navigation.goBack();
  };

  return (
    <View style={[styles.screen, { backgroundColor: screenBg }]}>
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => {
          if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
          }
          void flushProfileSave().finally(() => navigation.goBack());
        }}
        centerSubtitle={pf(localeForUi, 'editProfile')}
        hideSendButton
      />
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 22,
          paddingTop: 4,
          paddingBottom: lightTabBarScrollContentPadding(insets.bottom, 32),
        }}
        keyboardShouldPersistTaps="handled"
        {...(Platform.OS === 'ios' ? { contentInsetAdjustmentBehavior: 'never' } : {})}
      >
        <View style={[styles.sectionCard, { borderColor: cardBorder, backgroundColor: cardBg }]}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatarRow}>
              <View style={[styles.avatarRing, { borderColor: accent }]}>
                <ProfileAvatarCircle uri={avatarDisplayUri} size={AVATAR_INNER_SIZE} isLight={isLight} />
                {avatarBusy ? (
                  <View style={styles.avatarBusyOverlay}>
                    <ActivityIndicator color={accent} />
                  </View>
                ) : null}
              </View>
              <View style={styles.avatarActions}>
                <Pressable
                  onPress={() => void takeAvatarPhoto()}
                  disabled={avatarBusy}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.avatarActionBtn,
                    pressed && !avatarBusy && { opacity: 0.75 },
                    avatarBusy && { opacity: 0.45 },
                  ]}
                  android_ripple={ripple}
                  accessibilityRole="button"
                  accessibilityLabel={pf(localeForUi, 'takeAvatarPhoto')}
                >
                  <Ionicons name="camera-outline" size={22} color={textMain} />
                </Pressable>
                <Pressable
                  onPress={() => void pickAvatar()}
                  disabled={avatarBusy}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.avatarActionBtn,
                    pressed && !avatarBusy && { opacity: 0.75 },
                    avatarBusy && { opacity: 0.45 },
                  ]}
                  android_ripple={ripple}
                  accessibilityRole="button"
                  accessibilityLabel={pf(localeForUi, 'pickAvatar')}
                >
                  <Ionicons name="images-outline" size={22} color={textMain} />
                </Pressable>
              </View>
            </View>
            {avatarDisplayUri ? (
              <Pressable onPress={confirmRemoveAvatar} disabled={avatarBusy} style={{ marginTop: 10 }}>
                <Text style={[styles.changePhoto, { color: '#EB4335' }, brandFontSansSemibold]}>
                  {pf(localeForUi, 'removeAvatar')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={[styles.sectionCard, { borderColor: cardBorder, backgroundColor: cardBg }]}>
          <Text style={[styles.fieldLabel, { color: textMain }, brandFontSansSemibold]}>
            {pf(localeForUi, 'name')}
          </Text>
          <TextInput
            value={name}
            onChangeText={(v) => {
              setName(v);
              scheduleProfileSave({ name: v });
            }}
            onBlur={() => void flushProfileSave()}
            style={[
              styles.input,
              brandFontSans,
              { backgroundColor: inputBg, color: textMain, borderColor: inputBorder },
            ]}
            placeholderTextColor={isLight ? '#888' : '#888'}
            autoCapitalize="words"
          />

          <Text style={[styles.fieldLabel, { color: textMain }, brandFontSansSemibold]}>
            {pf(localeForUi, 'username')}
          </Text>
          <TextInput
            value={username}
            onChangeText={(v) => {
              setUsername(v);
              scheduleProfileSave({ username: v }, 600);
            }}
            onBlur={() => {
              void persistUsernameField(username);
            }}
            style={[
              styles.input,
              brandFontSans,
              { backgroundColor: inputBg, color: textMain, borderColor: inputBorder },
            ]}
            autoCapitalize="none"
            placeholderTextColor={isLight ? '#888' : '#888'}
          />

          <Text style={[styles.fieldLabel, { color: textMain }, brandFontSansSemibold]}>
            {pf(localeForUi, 'bio')}
          </Text>
          <TextInput
            value={bio}
            onChangeText={(v) => {
              setBio(v);
              scheduleProfileSave({ bio: v });
            }}
            onBlur={() => void flushProfileSave()}
            style={[
              styles.input,
              styles.inputMultiline,
              brandFontSans,
              { backgroundColor: inputBg, color: textMain, borderColor: inputBorder },
            ]}
            multiline
            maxLength={300}
            placeholderTextColor={isLight ? '#888' : '#888'}
            textAlignVertical="top"
          />
        </View>

        <View style={[styles.sectionCard, { borderColor: cardBorder, backgroundColor: cardBg }]}>
          <Text style={[styles.fieldLabel, { color: textMain }, brandFontSansSemibold]}>
            {pf(localeForUi, 'birthDate')}
          </Text>
          <Pressable
            onPress={openBirthPicker}
            style={({ pressed }) => [
              styles.input,
              styles.rowPick,
              styles.birthTapRow,
              brandFontSans,
              {
                backgroundColor: inputBg,
                borderColor: inputBorder,
                opacity: pressed ? 0.92 : 1,
              },
            ]}
            android_ripple={ripple}
          >
            <Ionicons name="calendar-number-outline" size={22} color={accent} style={{ marginRight: 12 }} />
            <Text
              style={[
                { fontSize: 16, flex: 1 },
                birthDate ? { color: textMain } : { color: '#888' },
                brandFontSans,
              ]}
            >
              {birthDate
                ? formatBirthLabel(birthDate, localeForUi)
                : pf(localeForUi, 'pickBirthDateTitle')}
            </Text>
            <Ionicons name="chevron-down" size={20} color={textMain} />
          </Pressable>
          <Text style={[styles.hint, { color: isLight ? '#666' : '#AAA' }, brandFontSans]}>
            {pf(localeForUi, 'birthDateTapHint')}
          </Text>
          <View
            style={[
              styles.switchRow,
              {
                backgroundColor: inputBg,
                borderColor: inputBorder,
              },
            ]}
          >
            <Text
              style={[
                { color: textMain, fontSize: 16, flex: 1, paddingRight: 12 },
                brandFontSans,
              ]}
            >
              {pf(localeForUi, 'showBirthOnProfile')}
            </Text>
            <Switch
              value={showBirthPublic}
              onValueChange={(v) => {
                setShowBirthPublic(v);
                scheduleProfileSave({ showBirthPublic: v }, 0);
              }}
              trackColor={{
                false: isLight ? '#CCC' : '#555',
                true: isLight ? 'rgba(2,18,235,0.35)' : 'rgba(225,255,0,0.35)',
              }}
              thumbColor={showBirthPublic ? accent : isLight ? '#f4f4f4' : '#888'}
            />
          </View>
        </View>

        <View style={[styles.sectionCard, { borderColor: cardBorder, backgroundColor: cardBg }]}>
          <Text style={[styles.fieldLabel, { color: textMain }, brandFontSansSemibold]}>
            {pf(localeForUi, 'interfaceLanguage')}
          </Text>
          <Pressable
            onPress={() => navigation.navigate('SettingsLanguage', shell)}
            style={({ pressed }) => [
              styles.input,
              styles.rowPick,
              brandFontSans,
              {
                backgroundColor: inputBg,
                borderColor: inputBorder,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
            android_ripple={ripple}
          >
            <Text style={[{ color: textMain, fontSize: 16, flex: 1 }, brandFontSans]}>{languageLabel}</Text>
            <Ionicons name="chevron-forward" size={20} color={textMain} />
          </Pressable>

          <Text style={[styles.fieldLabel, { color: textMain, marginTop: 4 }, brandFontSansSemibold]}>
            {pf(localeForUi, 'city')}
          </Text>
          <Pressable
            onPress={() => {
              setCityFilter('');
              setCityModalOpen(true);
            }}
            style={({ pressed }) => [
              styles.input,
              styles.rowPick,
              brandFontSans,
              {
                backgroundColor: inputBg,
                borderColor: inputBorder,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
            android_ripple={ripple}
          >
            <Text style={[{ color: city ? textMain : '#888', fontSize: 16, flex: 1 }, brandFontSans]}>
              {city || pf(localeForUi, 'pickCity')}
            </Text>
            <Ionicons name="chevron-down" size={20} color={textMain} />
          </Pressable>
          <Text style={[styles.hint, { color: isLight ? '#666' : '#AAA' }, brandFontSans]}>
            {pf(localeForUi, 'cityManualHint')}
          </Text>
          <TextInput
            value={city}
            onChangeText={(v) => {
              setCity(v);
              scheduleProfileSave({ city: v });
            }}
            onBlur={() => void flushProfileSave()}
            style={[
              styles.input,
              styles.inputLastInCard,
              brandFontSans,
              { backgroundColor: inputBg, color: textMain, borderColor: inputBorder },
            ]}
            placeholderTextColor={isLight ? '#888' : '#888'}
          />
        </View>

        <View style={[styles.sectionCard, { borderColor: cardBorder, backgroundColor: cardBg, paddingVertical: 12 }]}>
          <Pressable
            style={({ pressed }) => [styles.btnBlack, pressed && { opacity: 0.9 }]}
            android_ripple={ripple}
            onPress={() => Alert.alert('', pf(localeForUi, 'comingSoon'))}
          >
            <Text style={[styles.btnBlackText, brandFontSansSemibold]}>{pf(localeForUi, 'changePassword')}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.btnRed, pressed && { opacity: 0.9 }]}
            android_ripple={ripple}
            onPress={() =>
              Alert.alert('', pf(localeForUi, 'deleteProfile'), [
                { text: 'OK', style: 'cancel' },
              ])
            }
          >
            <Ionicons name="trash-outline" size={20} color="#FFF" style={{ marginRight: 8 }} />
            <Text style={[styles.btnBlackText, brandFontSansSemibold]}>{pf(localeForUi, 'deleteProfile')}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.btnBlue,
              { backgroundColor: accent },
              pressed && { opacity: 0.92 },
            ]}
            android_ripple={ripple}
            onPress={onDone}
          >
            <Text style={[styles.btnBlackText, { color: onAccentButtonText(isLight) }, brandFontSansSemibold]}>
              {pf(localeForUi, 'pickBirthDateDone')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal
        visible={birthPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setBirthPickerOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalDim} onPress={() => setBirthPickerOpen(false)} />
          <View
            style={[
              styles.sheet,
              styles.birthSheet,
              { paddingBottom: insets.bottom + 16, backgroundColor: isLight ? '#FFF' : '#2C2C2E' },
            ]}
          >
            <Text style={[styles.sheetTitle, { color: textMain }, brandFontSansSemibold]}>
              {pf(localeForUi, 'pickBirthDateTitle')}
            </Text>
            <BirthDateSteppers
              pickY={pickY}
              pickM={pickM}
              pickD={pickD}
              onChangeY={setPickY}
              onChangeM={setPickM}
              onChangeD={setPickD}
              textMain={textMain}
              ripple={ripple}
              langUk={String(localeForUi || 'en').split(/[-_]/)[0].toLowerCase() === 'uk'}
            />
            <View style={styles.sheetBtnRow}>
              <Pressable
                onPress={() => {
                  setBirthDate('');
                  setBirthPickerOpen(false);
                  scheduleProfileSave({ birthDate: '' }, 0);
                }}
                style={({ pressed }) => [styles.sheetGhostBtn, pressed && { opacity: 0.85 }]}
                android_ripple={ripple}
              >
                <Text style={[{ color: '#EB4335', fontSize: 16, fontWeight: '600' }, brandFontSansSemibold]}>
                  {pf(localeForUi, 'pickBirthDateClear')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setBirthPickerOpen(false)}
                style={({ pressed }) => [styles.sheetGhostBtn, pressed && { opacity: 0.85 }]}
                android_ripple={ripple}
              >
                <Text style={[{ color: textMain, fontSize: 16, fontWeight: '600' }, brandFontSansSemibold]}>
                  {pf(localeForUi, 'cancel')}
                </Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => {
                if (!isValidCalendarDate(pickY, pickM, pickD)) {
                  Alert.alert('', pf(localeForUi, 'invalidBirthDate'));
                  return;
                }
                const sel = new Date(pickY, pickM - 1, pickD);
                const today = new Date();
                today.setHours(23, 59, 59, 999);
                if (sel > today) {
                  Alert.alert('', pf(localeForUi, 'invalidBirthDate'));
                  return;
                }
                if (pickY < 1920) {
                  Alert.alert('', pf(localeForUi, 'invalidBirthDate'));
                  return;
                }
                setBirthDate(formatBirthIso(sel));
                setShowBirthPublic(true);
                setBirthPickerOpen(false);
                scheduleProfileSave({ birthDate: formatBirthIso(sel), showBirthPublic: true }, 0);
              }}
              style={({ pressed }) => [
                styles.sheetPrimaryBtn,
                { backgroundColor: accent },
                pressed && { opacity: 0.92 },
              ]}
              android_ripple={ripple}
            >
              <Text style={[{ color: onAccentButtonText(isLight), fontSize: 16, fontWeight: '700' }, brandFontSansSemibold]}>
                {pf(localeForUi, 'pickBirthDateDone')}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={cityModalOpen} animationType="slide" transparent onRequestClose={() => setCityModalOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalDim} onPress={() => setCityModalOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16, backgroundColor: isLight ? '#FFF' : '#2C2C2E' }]}>
            <Text style={[styles.sheetTitle, { color: textMain }]}>{pf(localeForUi, 'cityListTitle')}</Text>
            <TextInput
              value={cityFilter}
              onChangeText={setCityFilter}
              placeholder={pf(localeForUi, 'citySearchPlaceholder')}
              placeholderTextColor="#888"
              style={[
                styles.sheetSearch,
                { backgroundColor: isLight ? INPUT_BG_LIGHT : 'rgba(255,255,255,0.08)', color: textMain },
              ]}
            />
            <FlatList
              data={filteredCityRows}
              keyExtractor={(item) => item.regionId}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 320 }}
              removeClippedSubviews={Platform.OS === 'android'}
              maxToRenderPerBatch={10}
              windowSize={5}
              initialNumToRender={8}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [
                    styles.sheetRow,
                    { borderBottomColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)' },
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={() => {
                    setCity(item.label);
                    setCityModalOpen(false);
                    scheduleProfileSave({ city: item.label }, 0);
                  }}
                  android_ripple={ripple}
                >
                  <Text style={{ fontSize: 20, marginRight: 10 }}>{item.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: textMain, fontSize: 16, fontWeight: '600' }}>{item.label}</Text>
                    <Text style={{ color: '#888', fontSize: 13, marginTop: 2 }}>{item.subtitle}</Text>
                  </View>
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  sectionCard: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 14,
  },
  avatarWrap: { alignItems: 'center', marginTop: 4, marginBottom: 4 },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  avatarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarActionBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: {
    width: AVATAR_RING_SIZE,
    height: AVATAR_RING_SIZE,
    borderRadius: AVATAR_RING_SIZE / 2,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: AVATAR_RING_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  avatarImg: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarBusyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  changePhoto: { marginTop: 10, fontSize: 14, fontWeight: '600' },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8, letterSpacing: 0.2 },
  input: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  inputMultiline: { minHeight: 88, marginBottom: 0 },
  inputLastInCard: { marginBottom: 0 },
  birthTapRow: { marginBottom: 8 },
  btnBlack: {
    backgroundColor: '#1E1E1E',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnRed: {
    backgroundColor: '#EB4335',
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  btnBlue: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 0,
  },
  btnBlackText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  rowPick: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 0,
    marginTop: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  hint: { fontSize: 12, marginTop: 2, marginBottom: 10, lineHeight: 16 },
  birthSheet: { paddingTop: 16 },
  sheetBtnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 12,
    gap: 8,
  },
  sheetGhostBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
  },
  sheetPrimaryBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  birthStepWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    paddingVertical: 4,
  },
  birthStepCol: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  birthStepHead: { fontSize: 12, marginBottom: 8, opacity: 0.85 },
  birthStepControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  birthStepVal: { fontSize: 18, minWidth: 40, textAlign: 'center' },
  birthStepBtn: { padding: 4 },
  sheetSearch: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 8,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});

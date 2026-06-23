import React, { useMemo, useState, useRef, useEffect, useLayoutEffect, useCallback, memo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  Keyboard,
  Image,
  LayoutAnimation,
  UIManager,
  PanResponder,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { normalizeForSearch } from './countrySearch';
import {
  buildHomeSearchRows,
  buildHomeBrowseRows,
  mergeLocalAndProfileRows,
  filterHomeSearchRowsByKinds,
} from './homeUnifiedSearch';
import { mt } from './mainPageI18n';
import HomeSearchBar from './HomeSearchBar';
import { useAuthStore } from './auth/authStore';
import { hasSocialApi, socialSearchProfiles } from './socialApi';

const ACCENT_LIME = '#E1FF00';
const ACCENT_LIME_SOFT = 'rgba(225, 255, 0, 0.14)';
const ACCENT_LIME_BORDER = 'rgba(225, 255, 0, 0.32)';
/** Темно-синій «бегунок» / акцент світлої теми */
const SCROLL_THUMB_LIGHT = '#0F3A73';
const SCROLL_TRACK_LIGHT = 'rgba(15, 58, 115, 0.12)';

const ROW_H = 52;
const VISIBLE_ROWS = 7;
const LIST_MAX_H = ROW_H * VISIBLE_ROWS;
const ACCENT_STRIP_H = 4;
const PANEL_BODY_MIN_H = 240;
const COUNTRY_FLAG_IMAGES = {
  ua: require('./assets/flags/ua.png'),
  pl: require('./assets/flags/pl.png'),
  de: require('./assets/flags/de.png'),
  es: require('./assets/flags/es.png'),
  fr: require('./assets/flags/fr.png'),
  it: require('./assets/flags/it.png'),
  nl: require('./assets/flags/nl.png'),
  lt: require('./assets/flags/lt.png'),
  lv: require('./assets/flags/lv.png'),
  ro: require('./assets/flags/ro.png'),
  am: require('./assets/flags/am.png'),
};

/** Шари каталогу в «лінзі» — іконка + ключ фільтра + рядок i18n. */
const LENS_KIND_SPECS = [
  { key: 'countries', icon: 'earth-outline', labelKey: 'homeSearchKindCountry' },
  { key: 'cities', icon: 'business-outline', labelKey: 'homeSearchKindCity' },
  { key: 'landmarks', icon: 'sparkles-outline', labelKey: 'homeSearchKindLandmark' },
];

/**
 * Рядок пошуку + список країн: light — синій градієнт + 16.png; dark — Frame 1.png + 16.png.
 * Панель: акцентна смуга, легкий градієнт.
 */
export default memo(function LightHomeCountrySearch({
  variant = 'light',
  placeholder,
  value: valueProp,
  onChangeText: onChangeTextProp,
  editable = true,
  language,
  selectedCountryId,
  onUnifiedPick,
  onParentScrollLockChange,
  dismissSignal = 0,
  onRequestDismiss,
  resetToken = 0,
  onMenuGeometryChange,
  presentedInOverlay = false,
  onClusterLayout,
  profileSearchEnabled = false,
  peopleOnlyMode = false,
}) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const isDark = variant === 'dark';
  const [localQuery, setLocalQuery] = useState('');
  const isControlled = valueProp !== undefined;
  const value = isControlled ? valueProp : localQuery;
  const onChangeText = useCallback(
    (text) => {
      if (isControlled) onChangeTextProp?.(text);
      else setLocalQuery(typeof text === 'string' ? text : '');
    },
    [isControlled, onChangeTextProp],
  );
  const [menuOpen, setMenuOpen] = useState(() => presentedInOverlay);
  const [barFocused, setBarFocused] = useState(() => presentedInOverlay);
  const [showPlaces, setShowPlaces] = useState(!peopleOnlyMode);
  const [showProfiles, setShowProfiles] = useState(true);
  const [scopedCountryId, setScopedCountryId] = useState(null);
  const [scopedRegionId, setScopedRegionId] = useState(null);
  const [scopedLandmarkKey, setScopedLandmarkKey] = useState(null);
  const [pendingPickByType, setPendingPickByType] = useState({});
  const effectiveCountryScope = scopedCountryId || selectedCountryId || null;
  const [placeFilters, setPlaceFilters] = useState({
    countries: true,
    cities: true,
    landmarks: true,
  });
  const [profileHits, setProfileHits] = useState([]);
  const textInputRef = useRef(null);
  const searchKeyboardIntentRef = useRef(false);
  const [searchKeyboardEnabled, setSearchKeyboardEnabled] = useState(false);
  const blurTimerRef = useRef(null);
  const lastDismissSignal = useRef(0);
  const lastResetToken = useRef(0);

  const menuOpenRef = useRef(menuOpen);
  menuOpenRef.current = menuOpen;
  const onRequestDismissRef = useRef(onRequestDismiss);
  onRequestDismissRef.current = onRequestDismiss;
  const listScrollYRef = useRef(0);

  const clearBlurTimer = useCallback(() => {
    if (blurTimerRef.current != null) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  }, []);

  const resetSearchKeyboard = useCallback(() => {
    searchKeyboardIntentRef.current = false;
    setSearchKeyboardEnabled(false);
  }, []);

  const dismissMenu = useCallback(() => {
    clearBlurTimer();
    setBarFocused(false);
    setMenuOpen(false);
    resetSearchKeyboard();
    Keyboard.dismiss();
    onMenuGeometryChange?.(null);
  }, [clearBlurTimer, onMenuGeometryChange, resetSearchKeyboard]);

  const applyPendingLabel = useMemo(
    () => (String(language || '').startsWith('uk') ? 'Застосувати вибір' : 'Apply selection'),
    [language],
  );

  useEffect(() => () => clearBlurTimer(), [clearBlurTimer]);

  useEffect(() => {
    onParentScrollLockChange?.(menuOpen);
    return () => onParentScrollLockChange?.(false);
  }, [menuOpen, onParentScrollLockChange]);

  useEffect(() => {
    if (dismissSignal > lastDismissSignal.current) {
      lastDismissSignal.current = dismissSignal;
      if (menuOpen || barFocused) {
        onChangeText('');
        setPendingPickByType({});
        setScopedRegionId(null);
        setScopedLandmarkKey(null);
        setPlaceFilters({ countries: true, cities: true, landmarks: true });
        dismissMenu();
      }
    }
  }, [dismissSignal, menuOpen, barFocused, dismissMenu, onChangeText]);

  useEffect(() => {
    if (resetToken > lastResetToken.current) {
      lastResetToken.current = resetToken;
      onChangeText('');
      if (menuOpen) dismissMenu();
    }
  }, [resetToken, menuOpen, dismissMenu, onChangeText]);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useLayoutEffect(() => {
    if (!presentedInOverlay) return;
    const id = requestAnimationFrame(() => {
      searchKeyboardIntentRef.current = true;
      setSearchKeyboardEnabled(true);
      textInputRef.current?.focus?.();
    });
    return () => cancelAnimationFrame(id);
  }, [presentedInOverlay]);

  const openSearchMenu = useCallback(() => {
    clearBlurTimer();
    setPendingPickByType({});
    setScopedRegionId(null);
    setScopedLandmarkKey(null);
    setPlaceFilters({ countries: true, cities: true, landmarks: true });
    onChangeText?.('');
    setBarFocused(true);
    setMenuOpen(true);
  }, [clearBlurTimer, onChangeText]);

  const handleSearchBarPress = useCallback(() => {
    resetSearchKeyboard();
    textInputRef.current?.blur?.();
    Keyboard.dismiss();
    openSearchMenu();
  }, [openSearchMenu, resetSearchKeyboard]);

  const handleSearchInputPressIn = useCallback(() => {
    searchKeyboardIntentRef.current = true;
    setSearchKeyboardEnabled(true);
  }, []);

  const handleSearchFocus = useCallback(() => {
    openSearchMenu();
    if (searchKeyboardIntentRef.current) {
      searchKeyboardIntentRef.current = false;
      if (!searchKeyboardEnabled) {
        setSearchKeyboardEnabled(true);
        requestAnimationFrame(() => {
          textInputRef.current?.focus?.();
        });
      }
      return;
    }
    if (!searchKeyboardEnabled) {
      requestAnimationFrame(() => {
        textInputRef.current?.blur?.();
        Keyboard.dismiss();
      });
    }
  }, [openSearchMenu, searchKeyboardEnabled]);

  const handleSearchBlur = useCallback(() => {
    setBarFocused(false);
    // Не закрываем фильтрацию по blur: пользователь может переключать чипы,
    // скрывать клавиатуру и оставаться в этом же списке.
    clearBlurTimer();
  }, [clearBlurTimer]);

  const queryRaw = String(value || '').trim();
  const queryHasChars = normalizeForSearch(queryRaw) !== '';
  const [debouncedQuery, setDebouncedQuery] = useState(queryRaw);
  useEffect(() => {
    if (!queryHasChars) {
      setDebouncedQuery('');
      return undefined;
    }
    const t = setTimeout(() => setDebouncedQuery(queryRaw), 70);
    return () => clearTimeout(t);
  }, [queryRaw, queryHasChars]);
  const searchQueryForRows = queryHasChars ? debouncedQuery : value;
  const singleKindMode =
    (placeFilters.countries ? 1 : 0) + (placeFilters.cities ? 1 : 0) + (placeFilters.landmarks ? 1 : 0) === 1;
  const localRows = useMemo(() => {
    if (peopleOnlyMode) return [];
    if (!menuOpen && !barFocused) return [];
    if (!queryHasChars) return buildHomeBrowseRows(language);
    return buildHomeSearchRows(searchQueryForRows, language);
  }, [peopleOnlyMode, menuOpen, barFocused, queryHasChars, searchQueryForRows, language]);
  const countRows = useMemo(() => {
    if (!effectiveCountryScope) return localRows;
    return localRows.filter((r) => r.type === 'country' || r.countryId === effectiveCountryScope);
  }, [localRows, effectiveCountryScope]);
  const kindCounts = useMemo(() => {
    let countries = 0;
    let cities = 0;
    let landmarks = 0;
    for (const r of countRows) {
      if (r.type === 'country') countries += 1;
      else if (r.type === 'city') cities += 1;
      else if (r.type === 'landmark') landmarks += 1;
    }
    return { countries, cities, landmarks };
  }, [countRows]);
  const effectivePlaceFilters = useMemo(
    () => ({
      countries: placeFilters.countries,
      cities: placeFilters.cities,
      landmarks: placeFilters.landmarks,
    }),
    [placeFilters.countries, placeFilters.cities, placeFilters.landmarks],
  );
  const filteredLocalRows = useMemo(
    () => filterHomeSearchRowsByKinds(localRows, effectivePlaceFilters),
    [localRows, effectivePlaceFilters],
  );
  const scopedLocalRows = useMemo(() => {
    if (!effectiveCountryScope) return filteredLocalRows;
    // Когда смотрим города/локации — показываем только из выбранной страны.
    if (placeFilters.countries) return filteredLocalRows;
    const byCountry = filteredLocalRows.filter((r) => r.countryId === effectiveCountryScope);
    // Если выбран город, то в режиме локаций показываем локации только этого города.
    const landmarkMode = placeFilters.landmarks && !placeFilters.countries;
    if (landmarkMode && scopedRegionId) {
      return byCountry.filter((r) => r.type !== 'landmark' || r.regionId === scopedRegionId);
    }
    return byCountry;
  }, [filteredLocalRows, effectiveCountryScope, scopedRegionId, placeFilters.countries, placeFilters.landmarks]);
  const profileRows = useMemo(
    () =>
      (Array.isArray(profileHits) ? profileHits : []).map((u) => {
        const username = String(u?.username || '').trim();
        const displayName = u?.display_name != null ? String(u.display_name).trim() : '';
        const bioRaw = u?.bio != null ? String(u.bio) : '';
        const bio = bioRaw.replace(/\s+/g, ' ').trim().slice(0, 120);
        const title = displayName || (username ? `@${username}` : '@');
        const detailParts = [];
        if (displayName && username) detailParts.push(`@${username}`);
        if (bio) detailParts.push(bio);
        const detail = detailParts.join(' · ');
        return {
          type: 'profile',
          key: `p-${u?.user_id || username}`,
          user_id: u?.user_id,
          username,
          title,
          detail,
          flag: '👤',
        };
      }),
    [profileHits],
  );
  const searchRows = useMemo(
    () => mergeLocalAndProfileRows(scopedLocalRows, profileRows, { showPlaces, showProfiles }),
    [scopedLocalRows, profileRows, showPlaces, showProfiles],
  );
  const showFilterRow = menuOpen && queryHasChars && profileSearchEnabled && !peopleOnlyMode;
  const hasBrowseModeList = !peopleOnlyMode && !queryHasChars && scopedLocalRows.length > 0;
  const showPlaceKindFilterRow = menuOpen && !peopleOnlyMode;
  const showResultsPanel =
    menuOpen && (queryHasChars || hasBrowseModeList || (!queryHasChars && showPlaceKindFilterRow));
  const showEmptyState = menuOpen && showResultsPanel && searchRows.length === 0;

  useEffect(() => {
    if (showPlaceKindFilterRow) {
      LayoutAnimation.configureNext({
        duration: 120,
        create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        update: { type: LayoutAnimation.Types.easeInEaseOut },
        delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      });
    }
  }, [showPlaceKindFilterRow]);

  useEffect(() => {
    if (!profileSearchEnabled || !showProfiles || !menuOpen) {
      setProfileHits([]);
      return;
    }
    const raw = String(value || '').trim();
    const norm = normalizeForSearch(raw);
    if (norm.length < 1) {
      setProfileHits([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const users = await socialSearchProfiles(raw, 32);
        if (!cancelled) setProfileHits(Array.isArray(users) ? users : []);
      } catch {
        if (!cancelled) setProfileHits([]);
      }
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value, profileSearchEnabled, showProfiles, accessToken]);

  useEffect(() => {
    if (!peopleOnlyMode) return;
    setShowPlaces(false);
    setShowProfiles(true);
  }, [peopleOnlyMode]);

  const toggleShowPlaces = useCallback(() => {
    setShowPlaces((prev) => {
      if (prev && !showProfiles) return true;
      return !prev;
    });
  }, [showProfiles]);

  const toggleShowProfiles = useCallback(() => {
    setShowProfiles((prev) => {
      if (prev && !showPlaces) return true;
      return !prev;
    });
  }, [showPlaces]);

  const togglePlaceFilter = useCallback(
    (key) => {
      clearBlurTimer();
      resetSearchKeyboard();
      textInputRef.current?.blur?.();
      Keyboard.dismiss();
      // Один активный тип за раз: страны ИЛИ города ИЛИ локации.
      setPlaceFilters({
        countries: key === 'countries',
        cities: key === 'cities',
        landmarks: key === 'landmarks',
      });
      setMenuOpen(true);
      setBarFocused(false);
    },
    [clearBlurTimer, resetSearchKeyboard],
  );

  const resetSearchChanges = useCallback(() => {
    clearBlurTimer();
    resetSearchKeyboard();
    textInputRef.current?.blur?.();
    Keyboard.dismiss();
    onChangeText('');
    setPendingPickByType({});
    setScopedCountryId(null);
    setScopedRegionId(null);
    setScopedLandmarkKey(null);
    setPlaceFilters({ countries: true, cities: true, landmarks: true });
    setMenuOpen(true);
    setBarFocused(false);
  }, [clearBlurTimer, resetSearchKeyboard, onChangeText]);

  const handleBackToHome = useCallback(() => {
    if (onRequestDismiss) {
      onRequestDismiss();
      return;
    }
    clearBlurTimer();
    onChangeText?.('');
    setPlaceFilters({ countries: true, cities: true, landmarks: true });
    dismissMenu();
  }, [clearBlurTimer, dismissMenu, onChangeText, onRequestDismiss]);

  const dockedToDropdown =
    showResultsPanel || showEmptyState || showPlaceKindFilterRow || showFilterRow;

  const sublineForRow = useCallback(
    (row) => {
      const kind =
        row.type === 'country'
          ? mt(language, 'homeSearchKindCountry')
          : row.type === 'city'
            ? mt(language, 'homeSearchKindCity')
            : row.type === 'profile'
              ? mt(language, 'homeSearchKindProfile')
              : mt(language, 'homeSearchKindLandmark');
      return row.detail ? `${kind} · ${row.detail}` : kind;
    },
    [language],
  );

  const pickRow = useCallback(
    (row) => {
      clearBlurTimer();
      setBarFocused(false);
      Keyboard.dismiss();
      if (!row?.type) return;
      if (row?.type === 'country') {
        setScopedCountryId(row.countryId || null);
        setScopedRegionId(null);
        setScopedLandmarkKey(null);
        // Страна — главный выбор: сбрасываем зависимые pending-выборы.
        setPendingPickByType({ country: row });
        return;
      } else if (row?.type === 'city') {
        setScopedCountryId(row.countryId || null);
        setScopedRegionId(row.regionId || null);
        setScopedLandmarkKey(null);
        // Город заменяет только выбор города/локации, страну оставляем контекстом.
        setPendingPickByType((prev) => ({
          ...prev,
          city: row,
          landmark: undefined,
        }));
        return;
      } else if (row?.type === 'landmark') {
        // Локация фиксирует и страну, и город.
        setScopedCountryId(row.countryId || null);
        setScopedRegionId(row.regionId || null);
        setScopedLandmarkKey(row.key || null);
        setPendingPickByType((prev) => ({ ...prev, landmark: row }));
        return;
      }
      setPendingPickByType((prev) => ({ ...prev, [row.type]: row }));
    },
    [clearBlurTimer],
  );

  const applyPendingPick = useCallback(() => {
    const row =
      pendingPickByType.landmark ||
      pendingPickByType.city ||
      pendingPickByType.country ||
      pendingPickByType.profile ||
      null;
    if (!row) return;
    onUnifiedPick?.(row);
    dismissMenu();
  }, [pendingPickByType, onUnifiedPick, dismissMenu]);

  useEffect(() => {
    if (!menuOpen) {
      onMenuGeometryChange?.(null);
      return;
    }
    const id = requestAnimationFrame(() => {
      if (!menuOpenRef.current) return;
      onMenuGeometryChange?.({ active: true });
    });
    return () => cancelAnimationFrame(id);
  }, [
    menuOpen,
    showResultsPanel,
    showEmptyState,
    searchRows.length,
    showFilterRow,
    showPlaceKindFilterRow,
    value,
    onMenuGeometryChange,
  ]);

  const dismissSearchToHome = useCallback(() => {
    onRequestDismiss?.();
  }, [onRequestDismiss]);

  const dismissBackdropA11y = useMemo(
    () => (String(language || '').startsWith('uk') ? 'Закрити пошук' : 'Close search'),
    [language],
  );

  const dismissPadPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dy < -10 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.2,
      onPanResponderRelease: (_, gesture) => {
        // Свідомий свайп вгору (а не легкий доторк) закриває пошук. Тап лишається.
        if (gesture.dy < -32 || gesture.vy < -0.55) {
          onRequestDismissRef.current?.();
        }
      },
    }),
  ).current;

  const onScrollList = useCallback((e) => {
    listScrollYRef.current = e.nativeEvent.contentOffset.y;
  }, []);

  const onScrollListEndDrag = useCallback(
    (e) => {
      if (!menuOpen || !onRequestDismiss) return;
      const vy = e.nativeEvent.velocity?.y ?? 0;
      const y = e.nativeEvent.contentOffset?.y ?? listScrollYRef.current;
      listScrollYRef.current = y;
      // Закриваємо пошук лише на свідомий сильний протяг вниз від самого верху.
      // Раніше слабкий поріг (vy < -0.22) випадково викидав на головну під час
      // звичайного скролу списку біля верху.
      if (y <= 2 && vy < -0.9) {
        onRequestDismiss();
      }
    },
    [menuOpen, onRequestDismiss],
  );

  const listPanelHeader = null;

  const panelBodyHeight = Math.max(PANEL_BODY_MIN_H, LIST_MAX_H - ACCENT_STRIP_H);

  const rowPreviewSource = useCallback(
    (row) => {
      if (row?.type === 'landmark') {
        const thumb = row?.landmark?.thumb;
        if (thumb && typeof thumb === 'object') return thumb;
      }
      if (row?.type === 'city') {
        const hero = row?.region?.heroThumb;
        if (hero && typeof hero === 'object') return hero;
      }
      return null;
    },
    [],
  );

  return (
    <View
      style={[styles.block, menuOpen && styles.blockMenuOpen]}
      collapsable={false}
      onLayout={(e) => onClusterLayout?.(e.nativeEvent.layout.height)}
    >
      <View style={styles.searchForeground}>
      <HomeSearchBar
        variant={variant}
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        textInputRef={textInputRef}
        wrapStyle={[styles.barWrap, dockedToDropdown && styles.barWrapDocked]}
        focused={barFocused}
        keyboardOnFocus={searchKeyboardEnabled}
        onBarPress={handleSearchBarPress}
        onInputPressIn={handleSearchInputPressIn}
        onFocus={handleSearchFocus}
        onBlur={handleSearchBlur}
      />
      {showPlaceKindFilterRow ? (
        <>
          <View
            style={[styles.lensCard, isDark ? styles.lensCardDark : styles.lensCardLight]}
            accessible
            accessibilityLabel={mt(language, 'homeSearchLensA11ySummary')}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.lensChipsScroll}
            >
              <Pressable
                accessibilityRole="button"
                onPress={handleBackToHome}
                accessibilityLabel={mt(language, 'homeSearchBackToHomeAction')}
                style={({ pressed }) => [
                  styles.lensChip,
                  isDark ? styles.lensChipBaseDark : styles.lensChipBaseLight,
                  pressed && styles.lensChipPressed,
                ]}
              >
                <Ionicons
                  name="arrow-back-outline"
                  size={16}
                  color={isDark ? 'rgba(244,244,244,0.85)' : SCROLL_THUMB_LIGHT}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={resetSearchChanges}
                accessibilityLabel={mt(language, 'homeSearchResetAction')}
                style={({ pressed }) => [
                  styles.lensChip,
                  isDark ? styles.lensChipBaseDark : styles.lensChipBaseLight,
                  pressed && styles.lensChipPressed,
                ]}
              >
                <Ionicons
                  name="refresh-outline"
                  size={16}
                  color={isDark ? 'rgba(244,244,244,0.85)' : SCROLL_THUMB_LIGHT}
                />
                <Text
                  style={[
                    styles.lensChipLabel,
                    isDark ? styles.lensChipLabelOffDark : styles.lensChipLabelOffLight,
                  ]}
                  numberOfLines={1}
                >
                  {mt(language, 'homeSearchResetAction')}
                </Text>
              </Pressable>
              {LENS_KIND_SPECS.map((spec) => {
                const on = placeFilters[spec.key];
                const count = kindCounts[spec.key];
                const label = mt(language, spec.labelKey);
                return (
                  <Pressable
                    key={spec.key}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityHint={mt(language, 'homeSearchLensChipHint')}
                    accessibilityLabel={`${label}, ${count}`}
                    onPressIn={clearBlurTimer}
                    onPress={() => togglePlaceFilter(spec.key)}
                    style={({ pressed }) => [
                      styles.lensChip,
                      isDark ? styles.lensChipBaseDark : styles.lensChipBaseLight,
                      on && (isDark ? styles.lensChipOnDark : styles.lensChipOnLight),
                      pressed && styles.lensChipPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.lensChipLabel,
                        on
                          ? isDark
                            ? styles.lensChipLabelOnDark
                            : styles.lensChipLabelOnLight
                          : isDark
                            ? styles.lensChipLabelOffDark
                            : styles.lensChipLabelOffLight,
                      ]}
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                    <View
                      style={[
                        styles.lensChipCount,
                        on
                          ? isDark
                            ? styles.lensChipCountOnDark
                            : styles.lensChipCountOnLight
                          : isDark
                            ? styles.lensChipCountOffDark
                            : styles.lensChipCountOffLight,
                      ]}
                    >
                      <Text
                        style={[
                          styles.lensChipCountText,
                          {
                            color: on
                              ? isDark
                                ? '#101010'
                                : '#FFFFFF'
                              : isDark
                                ? 'rgba(244,244,244,0.85)'
                                : SCROLL_THUMB_LIGHT,
                          },
                        ]}
                      >
                        {count}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </>
      ) : null}
      {showFilterRow ? (
        <View style={styles.filterRow}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: showPlaces }}
            onPress={toggleShowPlaces}
            style={({ pressed }) => [styles.filterChip, pressed && styles.filterChipPressed]}
          >
            <Ionicons
              name={showPlaces ? 'checkmark-square' : 'square-outline'}
              size={20}
              color={isDark ? ACCENT_LIME : SCROLL_THUMB_LIGHT}
            />
            <Text
              style={[
                styles.filterChipLabel,
                { color: isDark ? '#E8E8E8' : '#0F3A73' },
              ]}
            >
              {mt(language, 'homeSearchFilterPlaces')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: showProfiles }}
            onPress={toggleShowProfiles}
            style={({ pressed }) => [styles.filterChip, pressed && styles.filterChipPressed]}
          >
            <Ionicons
              name={showProfiles ? 'checkmark-square' : 'square-outline'}
              size={20}
              color={isDark ? ACCENT_LIME : SCROLL_THUMB_LIGHT}
            />
            <Text
              style={[
                styles.filterChipLabel,
                { color: isDark ? '#E8E8E8' : '#0F3A73' },
              ]}
            >
              {mt(language, 'homeSearchFilterProfiles')}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {showResultsPanel ? (
        <View
          style={[
            styles.menuShadowHost,
            isDark ? styles.menuShadowHostDark : styles.menuShadowHostLight,
            dockedToDropdown && styles.menuShadowHostDocked,
          ]}
        >
          <View style={[styles.menuOuter, isDark && styles.menuOuterDark]}>
            {isDark ? (
              <LinearGradient
                colors={['#E1FF00', '#9FB82A']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.accentStrip}
              />
            ) : (
              <LinearGradient
                colors={['#0212EB', '#6286E4', '#6BA3FF']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.accentStrip}
              />
            )}
            {isDark ? (
              <View style={styles.menuInnerDark}>
                {showEmptyState ? (
                  <View style={styles.emptyWrap}>
                    <Text
                      style={[
                        styles.emptyText,
                        { color: 'rgba(240,240,240,0.75)' },
                      ]}
                    >
                      {mt(language, 'homeSearchEmpty')}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.menuColumn}>
                    {listPanelHeader}
                    <View style={[styles.scrollRow, { minHeight: panelBodyHeight }]}>
                      <ScrollView
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="none"
                        style={styles.scroll}
                        contentContainerStyle={styles.scrollContentTight}
                        showsVerticalScrollIndicator={false}
                        scrollEventThrottle={16}
                        bounces={Platform.OS === 'ios'}
                        onScroll={onScrollList}
                        onScrollEndDrag={onScrollListEndDrag}
                      >
                        {searchRows.map((row) => {
                          const hasPendingCountry = !!pendingPickByType.country;
                          const hasPendingCity = !!pendingPickByType.city;
                          const hasPendingLandmark = !!pendingPickByType.landmark;
                          const selected =
                            (row.type === 'country' &&
                              row.countryId === effectiveCountryScope &&
                              !hasPendingCountry) ||
                            (row.type === 'city' &&
                              row.regionId != null &&
                              row.regionId === scopedRegionId &&
                              !hasPendingCity) ||
                            (row.type === 'landmark' &&
                              row.key != null &&
                              row.key === scopedLandmarkKey &&
                              !hasPendingLandmark);
                          return (
                            <Pressable
                              key={row.key}
                              accessibilityRole="button"
                              accessibilityLabel={`${row.title}. ${sublineForRow(row)}`}
                              onPressIn={clearBlurTimer}
                              onPress={() => pickRow(row)}
                              style={({ pressed }) => [
                                styles.row,
                                styles.rowTall,
                                styles.rowDark,
                                selected && styles.rowSelectedDark,
                                pendingPickByType[row.type]?.key === row.key && styles.rowSelectedPendingDark,
                                pressed && styles.rowPressed,
                              ]}
                              android_ripple={{ color: 'rgba(225, 255, 0, 0.18)' }}
                            >
                              <View style={styles.rowPreviewWrap} importantForAccessibility="no">
                                {row.type === 'country' ? (
                                  COUNTRY_FLAG_IMAGES[row.countryId] ? (
                                    <Image
                                      source={COUNTRY_FLAG_IMAGES[row.countryId]}
                                      style={styles.countryFlagImage}
                                      resizeMode="contain"
                                    />
                                  ) : (
                                    <Text style={styles.flag} importantForAccessibility="no">
                                      {row.flag || '🏳️'}
                                    </Text>
                                  )
                                ) : rowPreviewSource(row) ? (
                                  <Image source={rowPreviewSource(row)} style={styles.rowPreviewImage} resizeMode="cover" />
                                ) : (
                                  <Ionicons
                                    name="image-outline"
                                    size={16}
                                    color={isDark ? 'rgba(240,240,240,0.72)' : 'rgba(15,58,115,0.7)'}
                                  />
                                )}
                              </View>
                              <View style={styles.rowTextCol}>
                                <Text
                                  style={[
                                    styles.listRowTitle,
                                    { color: '#F0F0F0' },
                                    selected && { color: ACCENT_LIME, fontWeight: '600' },
                                  ]}
                                  numberOfLines={2}
                                >
                                  {row.title}
                                </Text>
                                <Text
                                  style={[
                                    styles.subline,
                                    { color: 'rgba(240,240,240,0.55)' },
                                  ]}
                                  numberOfLines={2}
                                >
                                  {sublineForRow(row)}
                                </Text>
                              </View>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  </View>
                )}
              </View>
            ) : (
              <LinearGradient
                colors={['#F4F7FD', '#FFFFFF']}
                locations={[0, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.menuInnerLight}
              >
                {showEmptyState ? (
                  <View style={styles.emptyWrap}>
                    <Text
                      style={[
                        styles.emptyText,
                        { color: 'rgba(30,30,30,0.72)' },
                      ]}
                    >
                      {mt(language, 'homeSearchEmpty')}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.menuColumn}>
                    {listPanelHeader}
                    <View style={[styles.scrollRow, { minHeight: panelBodyHeight }]}>
                      <ScrollView
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="none"
                        style={styles.scroll}
                        contentContainerStyle={styles.scrollContentTight}
                        showsVerticalScrollIndicator={false}
                        scrollEventThrottle={16}
                        bounces={Platform.OS === 'ios'}
                        onScroll={onScrollList}
                        onScrollEndDrag={onScrollListEndDrag}
                      >
                        {searchRows.map((row) => {
                          const hasPendingCountry = !!pendingPickByType.country;
                          const hasPendingCity = !!pendingPickByType.city;
                          const hasPendingLandmark = !!pendingPickByType.landmark;
                          const selected =
                            (row.type === 'country' &&
                              row.countryId === effectiveCountryScope &&
                              !hasPendingCountry) ||
                            (row.type === 'city' &&
                              row.regionId != null &&
                              row.regionId === scopedRegionId &&
                              !hasPendingCity) ||
                            (row.type === 'landmark' &&
                              row.key != null &&
                              row.key === scopedLandmarkKey &&
                              !hasPendingLandmark);
                          return (
                            <Pressable
                              key={row.key}
                              accessibilityRole="button"
                              accessibilityLabel={`${row.title}. ${sublineForRow(row)}`}
                              onPressIn={clearBlurTimer}
                              onPress={() => pickRow(row)}
                              style={({ pressed }) => [
                                styles.row,
                                styles.rowTall,
                                selected && styles.rowSelected,
                                pendingPickByType[row.type]?.key === row.key && styles.rowSelectedPending,
                                pressed && styles.rowPressed,
                              ]}
                              android_ripple={{ color: 'rgba(98, 182, 228, 0.25)' }}
                            >
                              <View style={styles.rowPreviewWrap} importantForAccessibility="no">
                                {row.type === 'country' ? (
                                  COUNTRY_FLAG_IMAGES[row.countryId] ? (
                                    <Image
                                      source={COUNTRY_FLAG_IMAGES[row.countryId]}
                                      style={styles.countryFlagImage}
                                      resizeMode="contain"
                                    />
                                  ) : (
                                    <Text style={styles.flag} importantForAccessibility="no">
                                      {row.flag || '🏳️'}
                                    </Text>
                                  )
                                ) : rowPreviewSource(row) ? (
                                  <Image source={rowPreviewSource(row)} style={styles.rowPreviewImage} resizeMode="cover" />
                                ) : (
                                  <Ionicons
                                    name="image-outline"
                                    size={16}
                                    color={isDark ? 'rgba(240,240,240,0.72)' : 'rgba(15,58,115,0.7)'}
                                  />
                                )}
                              </View>
                              <View style={styles.rowTextCol}>
                                <Text
                                  style={[
                                    styles.listRowTitle,
                                    { color: '#1E1E1E' },
                                    selected && { color: '#1E6A9E', fontWeight: '600' },
                                  ]}
                                  numberOfLines={2}
                                >
                                  {row.title}
                                </Text>
                                <Text
                                  style={[
                                    styles.subline,
                                    { color: 'rgba(30,30,30,0.55)' },
                                  ]}
                                  numberOfLines={2}
                                >
                                  {sublineForRow(row)}
                                </Text>
                              </View>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  </View>
                )}
              </LinearGradient>
            )}
          </View>
        </View>
      ) : null}
      {showPlaceKindFilterRow &&
      (pendingPickByType.country || pendingPickByType.city || pendingPickByType.landmark || pendingPickByType.profile) ? (
        <Pressable
          accessibilityRole="button"
          onPress={applyPendingPick}
          style={({ pressed }) => [
            styles.applyPickBtn,
            isDark ? styles.applyPickBtnDark : styles.applyPickBtnLight,
            pressed && styles.applyPickBtnPressed,
          ]}
        >
          <Ionicons name="checkmark-circle-outline" size={18} color={isDark ? '#101010' : '#FFFFFF'} />
          <Text style={[styles.applyPickBtnText, { color: isDark ? '#101010' : '#FFFFFF' }]}>
            {applyPendingLabel}
          </Text>
        </Pressable>
      ) : null}
      </View>
      {menuOpen && onRequestDismiss ? (
        <View style={styles.searchDismissPad} {...dismissPadPan.panHandlers}>
          <Pressable
            style={styles.searchDismissPadPressable}
            onPress={dismissSearchToHome}
            accessibilityRole="button"
            accessibilityLabel={dismissBackdropA11y}
          />
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  block: {
    marginBottom: 18,
    alignSelf: 'stretch',
    width: '100%',
  },
  blockMenuOpen: {
    flex: 1,
    marginBottom: 0,
  },
  searchDismissPad: {
    flex: 1,
    minHeight: 140,
    alignSelf: 'stretch',
  },
  searchDismissPadPressable: {
    flex: 1,
    alignSelf: 'stretch',
  },
  searchForeground: {
    alignSelf: 'stretch',
    width: '100%',
  },
  barWrap: {
    marginBottom: 0,
    alignSelf: 'stretch',
    width: '100%',
  },
  barWrapDocked: {
    marginBottom: 4,
  },
  lensCard: {
    alignSelf: 'stretch',
    marginTop: 4,
    marginBottom: 6,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  lensCardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(15, 58, 115, 0.14)',
    ...Platform.select({
      ios: {
        shadowColor: '#0F3A73',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.09,
        shadowRadius: 18,
      },
    }),
  },
  lensCardDark: {
    backgroundColor: 'rgba(26, 26, 26, 0.98)',
    borderColor: ACCENT_LIME_BORDER,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
    }),
  },
  lensChipsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 4,
    paddingRight: 4,
  },
  lensChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginRight: 8,
    gap: 6,
    borderWidth: 1,
    minWidth: 0,
    minHeight: 38,
  },
  lensChipBaseLight: {
    backgroundColor: 'rgba(243, 246, 252, 0.98)',
    borderColor: 'rgba(15, 58, 115, 0.12)',
  },
  lensChipBaseDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  lensChipOnLight: {
    backgroundColor: 'rgba(15, 58, 115, 0.14)',
    borderColor: 'rgba(15, 58, 115, 0.45)',
  },
  lensChipOnDark: {
    backgroundColor: ACCENT_LIME_SOFT,
    borderColor: ACCENT_LIME_BORDER,
  },
  lensChipPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  lensChipLabel: {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.1,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  lensChipLabelOnLight: {
    color: '#0F172A',
  },
  lensChipLabelOnDark: {
    color: '#F8F8F8',
  },
  lensChipLabelOffLight: {
    color: 'rgba(15,23,42,0.72)',
  },
  lensChipLabelOffDark: {
    color: 'rgba(244,244,244,0.72)',
  },
  lensChipCount: {
    minWidth: 24,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lensChipCountOffLight: {
    backgroundColor: 'rgba(15, 58, 115, 0.1)',
  },
  lensChipCountOnLight: {
    backgroundColor: SCROLL_THUMB_LIGHT,
  },
  lensChipCountOffDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  lensChipCountOnDark: {
    backgroundColor: ACCENT_LIME,
  },
  lensChipCountText: {
    fontSize: 12,
    fontWeight: '800',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 7,
    gap: 12,
  },
  panelHeaderBorderLight: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15, 23, 42, 0.08)',
  },
  panelHeaderBorderDark: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  panelHeaderTitle: {
    flex: 1,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.35,
    textTransform: 'none',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  panelHeaderBadge: {
    minWidth: 28,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelHeaderBadgeLight: {
    backgroundColor: 'rgba(15, 58, 115, 0.82)',
  },
  panelHeaderBadgeDark: {
    backgroundColor: ACCENT_LIME,
  },
  panelHeaderBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  menuColumn: {
    height: LIST_MAX_H - ACCENT_STRIP_H,
    minHeight: PANEL_BODY_MIN_H,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingRight: 4,
  },
  filterChipPressed: {
    opacity: 0.85,
  },
  filterChipLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  menuShadowHost: {
    marginTop: 8,
    alignSelf: 'stretch',
    maxHeight: LIST_MAX_H,
    borderRadius: 16,
  },
  /** Тінь лише на Android — на iOS тінь дає RCT ADVICE разом із градієнтом/overflow. */
  menuShadowHostLight: {
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      android: { elevation: 4 },
    }),
  },
  menuShadowHostDark: {
    backgroundColor: '#161616',
    ...Platform.select({
      android: { elevation: 6 },
    }),
  },
  menuShadowHostDocked: {
    marginTop: 2,
  },
  menuOuter: {
    maxHeight: LIST_MAX_H,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(98, 134, 228, 0.14)',
    backgroundColor: '#FFFFFF',
  },
  menuOuterDark: {
    borderColor: 'rgba(225, 255, 0, 0.22)',
    backgroundColor: '#161616',
  },
  accentStrip: {
    width: '100%',
    height: ACCENT_STRIP_H,
  },
  menuInnerLight: {
    minHeight: 120,
    maxHeight: LIST_MAX_H - ACCENT_STRIP_H,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    overflow: 'hidden',
  },
  menuInnerDark: {
    minHeight: 120,
    maxHeight: LIST_MAX_H - ACCENT_STRIP_H,
    backgroundColor: '#1C1C1C',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: 'hidden',
  },
  scrollRow: {
    flex: 1,
    minHeight: 0,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContentTight: {
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ROW_H,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    marginVertical: 3,
    marginHorizontal: 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowTall: {
    alignItems: 'center',
    minHeight: 58,
    paddingVertical: 10,
  },
  rowTextCol: {
    flex: 1,
    minWidth: 0,
  },
  subline: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  emptyWrap: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    minHeight: 88,
    maxHeight: LIST_MAX_H - ACCENT_STRIP_H,
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  rowSelected: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(2, 18, 235, 0.58)',
  },
  rowDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  rowSelectedDark: {
    backgroundColor: 'transparent',
    borderWidth: 1.4,
    borderColor: 'rgba(225, 255, 0, 0.72)',
  },
  rowSelectedPending: {
    borderColor: 'rgba(2, 18, 235, 0.82)',
    borderWidth: 1.8,
  },
  rowSelectedPendingDark: {
    borderColor: 'rgba(225, 255, 0, 0.9)',
    borderWidth: 1.8,
  },
  rowPressed: {
    opacity: 0.9,
  },
  rowPreviewWrap: {
    width: 30,
    height: 30,
    marginRight: 10,
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  rowPreviewImage: {
    width: '100%',
    height: '100%',
  },
  countryFlagImage: {
    width: 28,
    height: 20,
  },
  flag: {
    fontSize: 22,
    marginRight: 10,
    lineHeight: 26,
    width: 30,
    textAlign: 'center',
  },
  listRowTitle: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 21,
    letterSpacing: 0.2,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  applyPickBtn: {
    alignSelf: 'stretch',
    marginTop: 10,
    marginBottom: 2,
    minHeight: 44,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  applyPickBtnLight: {
    backgroundColor: '#0212EB',
  },
  applyPickBtnDark: {
    backgroundColor: ACCENT_LIME,
  },
  applyPickBtnPressed: {
    opacity: 0.9,
  },
  applyPickBtnText: {
    fontSize: 14,
    fontWeight: '700',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
});

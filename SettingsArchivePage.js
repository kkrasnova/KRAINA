import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Image,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { getAppTheme } from './themeStorage';
import { useSyncedAppLanguage } from './useAppLanguage';
import { pf } from './profileI18n';
import { ft } from './feedI18n';
import { getChoosePlanTexts } from './choosePlanI18n';
import { feedListMyArchivedPosts, feedPatchPostArchive } from './feedApi';
import { useAuthStore } from './auth/authStore';
import { resolveFeedMediaUrl } from './feedMediaUrl';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { hydrateRoutePlan } from './profileStorage';
import { routeRegionTitle } from './routePlanTitles';
import { brandFontHeadMedium } from './brandFont';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';

function formatArchiveDate(iso, langUk) {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString(langUk ? 'uk-UA' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function visibilityLabel(language, vis) {
  const v = String(vis || '').toLowerCase();
  if (v === 'followers') return pf(language, 'archiveVisFollowers');
  return pf(language, 'archiveVisPublic');
}

function ArchivePostCard({
  item,
  cardWidth,
  isLight,
  textMain,
  textMuted,
  subtleBorder,
  cardBg,
  accent,
  onAccentTxt,
  langUk,
  language,
  busy,
  onRestore,
}) {
  const [photoPage, setPhotoPage] = useState(0);
  const urls = (Array.isArray(item.media_urls) ? item.media_urls : [])
    .map((u) => resolveFeedMediaUrl(u))
    .filter(Boolean);
  const mediaH = Math.min(320, Math.max(200, Math.round(cardWidth * 0.56)));
  const plan = item.route_plan ? hydrateRoutePlan(item.route_plan) : null;
  const routeTitle = plan ? routeRegionTitle(language, plan) : '';
  const caption = (item.content_text && String(item.content_text).trim()) || '';
  const place = (item.place_label && String(item.place_label).trim()) || '';

  const pagerTpl = pf(language, 'archivePhotoPager');

  return (
    <View
      style={[
        styles.card,
        {
          width: cardWidth,
          backgroundColor: cardBg,
          borderColor: subtleBorder,
          ...(isLight
            ? {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.08,
                shadowRadius: 14,
                elevation: 4,
              }
            : { elevation: 0 }),
        },
      ]}
    >
      <View style={[styles.mediaShell, { height: urls.length ? mediaH : Math.min(120, mediaH) }]}>
        {urls.length === 0 ? (
          <View style={[styles.mediaEmpty, { backgroundColor: isLight ? '#EEF0F4' : '#2A2A2A' }]}>
            <Ionicons name="images-outline" size={36} color={textMuted} />
            <Text style={[styles.mediaEmptyTxt, { color: textMuted }]}>{langUk ? 'Без медіа' : 'No media'}</Text>
          </View>
        ) : urls.length === 1 ? (
          <Image source={{ uri: urls[0] }} style={{ width: cardWidth, height: '100%' }} resizeMode="cover" />
        ) : (
          <>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
              decelerationRate="fast"
              onMomentumScrollEnd={(e) => {
                const w = e.nativeEvent.layoutMeasurement.width;
                const x = e.nativeEvent.contentOffset.x;
                setPhotoPage(Math.min(urls.length - 1, Math.max(0, Math.round(x / w))));
              }}
            >
              {urls.map((uri, idx) => (
                <View key={`${String(item.id)}-${String(idx)}`} style={{ width: cardWidth, height: '100%' }}>
                  <Image source={{ uri }} style={{ width: cardWidth, height: '100%' }} resizeMode="cover" />
                </View>
              ))}
            </ScrollView>
            <View style={styles.photoBadge} pointerEvents="none">
              <Text style={styles.photoBadgeTxt}>
                {pagerTpl.replace('{current}', String(photoPage + 1)).replace('{total}', String(urls.length))}
              </Text>
            </View>
            <View style={styles.dotRow} pointerEvents="none">
              {urls.map((_, i) => (
                <View
                  key={`dot-${String(i)}`}
                  style={[
                    styles.dot,
                    { backgroundColor: i === photoPage ? '#FFFFFF' : 'rgba(255,255,255,0.45)' },
                  ]}
                />
              ))}
            </View>
          </>
        )}
      </View>

      <View style={styles.cardBody}>
        <View style={styles.metaRow}>
          <View style={[styles.badge, { backgroundColor: isLight ? 'rgba(2,18,235,0.08)' : 'rgba(225,255,0,0.12)' }]}>
            <Ionicons name="archive-outline" size={14} color={accent} />
            <Text style={[styles.badgeTxt, { color: textMain }]}>{pf(language, 'archiveBadge')}</Text>
          </View>
          <View style={[styles.visPill, { borderColor: subtleBorder }]}>
            <Text style={[styles.visPillTxt, { color: textMuted }]}>{visibilityLabel(language, item.visibility)}</Text>
          </View>
        </View>

        <Text style={[styles.dateLine, { color: textMuted }]}>{formatArchiveDate(item.created_at, langUk)}</Text>

        {caption ? (
          <Text style={[styles.captionFull, { color: textMain }]} selectable>
            {caption}
          </Text>
        ) : (
          <Text style={[styles.captionPlaceholder, { color: textMuted }]}>{langUk ? 'Без тексту' : 'No caption'}</Text>
        )}

        {place ? (
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={18} color={accent} style={styles.infoIcon} />
            <Text style={[styles.infoTxt, { color: textMain }]} selectable>
              {place}
            </Text>
          </View>
        ) : null}

        {routeTitle ? (
          <View style={styles.infoRow}>
            <Ionicons name="map-outline" size={18} color={accent} style={styles.infoIcon} />
            <Text style={[styles.infoTxt, { color: textMain }]} selectable>
              {pf(language, 'route')}: {routeTitle}
            </Text>
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.restorePill,
            { backgroundColor: accent, opacity: busy ? 0.55 : pressed ? 0.92 : 1 },
          ]}
          onPress={() => onRestore(item.id)}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={onAccentTxt} size="small" />
          ) : (
            <>
              <Ionicons name="arrow-undo-outline" size={22} color={onAccentTxt} />
              <Text style={[styles.restorePillTxt, { color: onAccentTxt }]}>{pf(language, 'restorePost')}</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function ArchiveScreenPlaceholder({
  language,
  isLight,
  winW,
  insetsBottom,
  accent,
  onAccentTxt,
  textMain,
  textMuted,
  title,
  body,
  showCta = false,
  ctaLabel,
  onCta,
  ripple,
}) {
  return (
    <ScrollView
      style={styles.placeholderScroll}
      contentContainerStyle={[
        styles.placeholderInner,
        {
          paddingHorizontal: Math.max(20, (winW - 400) / 2 + 20),
          paddingBottom: Math.max(insetsBottom, 20) + 16,
        },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      {...(Platform.OS === 'ios' ? { contentInsetAdjustmentBehavior: 'never' } : {})}
    >
      <View style={styles.archiveHeroIconRing}>
        <LinearGradient
          colors={
            isLight
              ? ['rgba(2,18,235,0.2)', 'rgba(2,18,235,0.05)']
              : ['rgba(225,255,0,0.38)', 'rgba(225,255,0,0.09)']
          }
          style={StyleSheet.absoluteFillObject}
        />
        <Ionicons name="archive-outline" size={34} color={accent} />
      </View>
      <Text style={[styles.archiveHeroKicker, brandFontHeadMedium, { color: accent }]} numberOfLines={2}>
        {pf(language, 'archiveHeroKicker')}
      </Text>
      <Text style={[styles.archiveHeroTitle, brandFontHeadMedium, { color: textMain }]} numberOfLines={2}>
        {title}
      </Text>
      <Text style={[styles.archiveHeroBody, { color: textMuted }]}>{body}</Text>
      {showCta && ctaLabel && onCta ? (
        <Pressable
          onPress={onCta}
          style={({ pressed }) => [
            styles.archiveLoginCta,
            { backgroundColor: accent, opacity: pressed ? 0.92 : 1 },
          ]}
          android_ripple={ripple}
        >
          <Ionicons name="log-in-outline" size={22} color={onAccentTxt} />
          <Text style={[styles.archiveLoginCtaTxt, { color: onAccentTxt }]}>{ctaLabel}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

export default function SettingsArchivePage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const language = useSyncedAppLanguage(route, 'uk');
  const langUk = language.split(/[-_]/)[0].toLowerCase() === 'uk';
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [listContentW, setListContentW] = useState(0);

  const viewportW = listContentW > 0 ? listContentW : winW;
  const cardWidth = Math.max(280, viewportW - 32);
  const planTexts = getChoosePlanTexts(language);

  const reload = useCallback(async () => {
    const t = await getAppTheme();
    setAppTheme(t === 'light' ? 'light' : 'dark');
    if (!hasFeedApiToken()) {
      setPosts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await feedListMyArchivedPosts(80);
      setPosts(Array.isArray(list) ? list : []);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const isLight = appTheme === 'light';
  const screenBg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const textMuted = isLight ? '#727272' : '#A8A8A8';
  const subtleBorder = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)';
  const cardBg = isLight ? '#FFFFFF' : '#1A1A1A';
  const accent = accentForTheme(isLight);
  const onAccentTxt = onAccentButtonText(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const heroGrad0 = isLight ? 'rgba(2,18,235,0.11)' : 'rgba(225,255,0,0.14)';
  const pageGradColors = isLight
    ? [heroGrad0, 'rgba(230, 234, 248, 0.88)', LIGHT_BAR_BG]
    : [heroGrad0, 'rgba(22, 22, 22, 0.96)', APP_SCREEN_BG];
  const pageGradLocations = isLight ? [0, 0.22, 0.92] : [0, 0.2, 0.88];

  const goLogin = useCallback(() => {
    navigation.navigate('BackendAuth');
  }, [navigation, language, appTheme]);

  const onRestore = (id) => {
    if (!useAuthStore.getState().accessToken) return;
    Alert.alert('', pf(language, 'restorePost'), [
      { text: pf(language, 'cancel'), style: 'cancel' },
      {
        text: pf(language, 'restorePost'),
        onPress: async () => {
          setBusyId(id);
          try {
            await feedPatchPostArchive(id, false);
            Alert.alert('', pf(language, 'postRestored'));
            await reload();
          } catch (e) {
            Alert.alert('', e?.message || 'API');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const listHeader = (
    <View style={styles.listHeader}>
      <Text style={[styles.intro, { color: textMuted }]}>{pf(language, 'archiveSubtitle')}</Text>
    </View>
  );

  const goChoosePlanCancel = useCallback(() => {
    navigation.navigate('ChoosePlan', {
      user: route?.params?.user,
      language,
      appTheme,
      fromSettings: true,
      openCancelSubscription: true,
      ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
    });
  }, [navigation, route?.params?.user, route?.params?.countryId, language, appTheme]);

  const listFooter = (
    <View style={styles.footer}>
      <Pressable
        onPress={goChoosePlanCancel}
        style={({ pressed }) => [
          styles.footerCancelBtn,
          {
            borderColor: isLight ? 'rgba(179,38,30,0.35)' : 'rgba(255,138,128,0.45)',
            opacity: pressed ? 0.88 : 1,
          },
        ]}
        android_ripple={{ color: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)' }}
      >
        <Ionicons name="close-circle-outline" size={22} color={isLight ? '#B3261E' : '#FF8A80'} />
        <Text style={[styles.footerCancelTxt, { color: isLight ? '#B3261E' : '#FF8A80' }]}>
          {planTexts.cancelSubscriptionCta}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      <LinearGradient
        colors={pageGradColors}
        locations={pageGradLocations}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        centerSubtitle={pf(language, 'archiveTitle')}
        hideSendButton
        transparentHeader
      />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={isLight ? '#0212EB' : '#E1FF00'} />
        </View>
      ) : !feedOk && !hasShellUser ? (
        <ArchiveScreenPlaceholder
          language={language}
          isLight={isLight}
          winW={winW}
          insetsBottom={insets.bottom}
          accent={accent}
          onAccentTxt={onAccentTxt}
          textMain={textMain}
          textMuted={textMuted}
          title={pf(language, 'archiveTitle')}
          body={ft(language, 'composerNeedLogin')}
          showCta
          ctaLabel={pf(language, 'archiveLoginCta')}
          onCta={goLogin}
          ripple={ripple}
        />
      ) : posts.length === 0 ? (
        <ArchiveScreenPlaceholder
          language={language}
          isLight={isLight}
          winW={winW}
          insetsBottom={insets.bottom}
          accent={accent}
          onAccentTxt={onAccentTxt}
          textMain={textMain}
          textMuted={textMuted}
          title={pf(language, 'archiveTitle')}
          body={pf(language, 'archiveEmpty')}
          ripple={ripple}
        />
      ) : (
        <View
          style={styles.listFlex}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0 && Math.abs(w - listContentW) > 0.5) setListContentW(w);
          }}
        >
          <FlatList
            style={styles.listFlexTransparent}
            data={posts}
            keyExtractor={(p) => String(p.id)}
            ListHeaderComponent={listHeader}
            ListFooterComponent={listFooter}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 4,
              paddingBottom: Math.max(insets.bottom, 12) + 24,
            }}
            renderItem={({ item }) => (
              <ArchivePostCard
                item={item}
                cardWidth={cardWidth}
                isLight={isLight}
                textMain={textMain}
                textMuted={textMuted}
                subtleBorder={subtleBorder}
                cardBg={cardBg}
                accent={accent}
                onAccentTxt={onAccentTxt}
                langUk={langUk}
                language={language}
                busy={busyId === item.id}
                onRestore={onRestore}
              />
            )}
            ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  listFlex: { flex: 1, alignSelf: 'stretch' },
  listFlexTransparent: { flex: 1, alignSelf: 'stretch', backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  placeholderScroll: { flex: 1, alignSelf: 'stretch', backgroundColor: 'transparent' },
  placeholderInner: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 12,
    minHeight: 360,
  },
  archiveHeroIconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.14,
        shadowRadius: 16,
      },
      android: { elevation: 4 },
    }),
  },
  archiveHeroKicker: {
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 8,
    maxWidth: 320,
  },
  archiveHeroTitle: {
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'center',
    maxWidth: 340,
    marginBottom: 12,
  },
  archiveHeroBody: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 340,
    marginBottom: 8,
  },
  archiveLoginCta: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 22,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
  },
  archiveLoginCtaTxt: { fontSize: 16, fontWeight: '800' },
  listHeader: { paddingBottom: 10, paddingHorizontal: 0, width: '100%' },
  intro: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  footer: { width: '100%', paddingTop: 8, paddingBottom: 4 },
  footerCancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 50,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: 16,
  },
  footerCancelTxt: { fontSize: 15, fontWeight: '800' },
  card: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  mediaShell: {
    width: '100%',
    backgroundColor: '#111',
    position: 'relative',
  },
  mediaEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mediaEmptyTxt: { fontSize: 14, fontWeight: '600' },
  photoBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  photoBadgeTxt: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  dotRow: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  cardBody: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  badgeTxt: { fontSize: 12, fontWeight: '800' },
  visPill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  visPillTxt: { fontSize: 12, fontWeight: '700' },
  dateLine: { fontSize: 13, fontWeight: '600', marginBottom: 10 },
  captionFull: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  captionPlaceholder: { fontSize: 15, fontStyle: 'italic', marginBottom: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 12, gap: 8 },
  infoIcon: { marginTop: 2 },
  infoTxt: { flex: 1, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  restorePill: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 52,
    borderRadius: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
  },
  restorePillTxt: { fontSize: 16, fontWeight: '800' },
});

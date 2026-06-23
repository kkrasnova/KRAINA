import React, { useCallback, useState } from 'react';
import { FlashList } from '@shopify/flash-list';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { useAppTheme } from './useAppTheme';
import { useSyncedAppLanguage } from './useAppLanguage';
import { pf } from './profileI18n';
import { ft } from './feedI18n';
import { getChoosePlanTexts } from './choosePlanI18n';
import { feedPatchPostArchive, hasFeedApiToken } from './feedApi';
import { useAuthStore } from './auth/authStore';
import { getUserFeedStories } from './feedLocalStorage';
import {
  archiveCacheKey,
  fetchArchiveData,
  readArchiveCache,
  seedArchiveCacheIfMissing,
  writeArchiveCache,
} from './archivePostsCache';
import { resolveFeedMediaUrl } from './feedMediaUrl';
import { RenderProfiler } from './performanceMetrics';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { hydrateRoutePlan } from './profileStorage';
import { routeRegionTitle } from './routePlanTitles';
import { brandFontHeadMedium } from './brandFont';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import { errorToUserText } from './errorText';

const STORY_TTL_MS = 24 * 60 * 60 * 1000;
const STORY_COLS = 3;
const STORY_GAP = 8;

const ARCHIVE_EMPTY_POST_PHOTOS = [
  require('./assets/carousel/photo-1580072624564-1fe6b660b7e2.webp'),
  require('./assets/carousel/photo-1615119449152-d94284eafa45.webp'),
  require('./assets/carousel/photo-1630227286297-f7cc7c97f415.webp'),
];

const ARCHIVE_EMPTY_STORY_PHOTOS = [
  require('./assets/carousel/premium_photo-1676319876974-3c9759cb8c4a.webp'),
  require('./assets/carousel/photo-1518684079-3c830dcef090.webp'),
  require('./assets/carousel/premium_photo-1689371089286-6f75a9ecd4ca.webp'),
];

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

function formatArchiveShortDate(iso, langUk) {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString(langUk ? 'uk-UA' : 'en-US', {
    day: 'numeric',
    month: 'short',
  });
}

async function loadLocalArchivedStories(user) {
  if (!user?.id) return [];
  const rows = await getUserFeedStories(user);
  const now = Date.now();
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => !r.createdAt || now - Number(r.createdAt) >= STORY_TTL_MS)
    .map((r) => ({
      id: String(r.id),
      user_id: String(user.id),
      media_url: String(r.uri || ''),
      media_kind: /\.(mp4|mov)(\?|$)/i.test(String(r.uri)) ? 'video' : 'image',
      caption: r.caption || '',
      created_at: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
      view_count: 0,
      expired: true,
      local: true,
    }));
}

function ArchiveSegmentBar({ tab, onTab, language, isLight, accent, onAccentTxt, textMuted, postsCount, storiesCount }) {
  const tabs = [
    { key: 'posts', label: pf(language, 'archiveTabPosts'), count: postsCount },
    { key: 'stories', label: pf(language, 'archiveTabStories'), count: storiesCount },
  ];
  return (
    <View style={styles.segmentWrap}>
      {tabs.map(({ key, label, count }) => {
        const active = tab === key;
        return (
          <Pressable
            key={key}
            onPress={() => onTab(key)}
            style={({ pressed }) => [styles.segmentBtn, { opacity: pressed ? 0.72 : 1 }]}
          >
            <Text
              style={[
                styles.segmentLabel,
                { color: active ? accent : textMuted, opacity: active ? 1 : 0.72 },
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
            {count > 0 ? (
              <Text style={[styles.segmentCountTxt, { color: active ? accent : textMuted }]}>
                {count}
              </Text>
            ) : null}
            {active ? <View style={[styles.segmentUnderline, { backgroundColor: accent }]} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function ArchiveStoryTile({
  item,
  tileW,
  tileH,
  isLight,
  language,
  langUk,
  accent,
  onPress,
}) {
  const uri = resolveFeedMediaUrl(item.media_url);
  const isVideo = String(item.media_kind || '').toLowerCase() === 'video';
  const viewsTpl = pf(language, 'archiveStoryViews');
  const viewsLabel = viewsTpl.replace('{count}', String(Number(item.view_count) || 0));

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.storyTile,
        {
          width: tileW,
          height: tileH,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, styles.storyTileEmpty, { backgroundColor: isLight ? '#EEF0F4' : '#2A2A2A' }]}>
          <Ionicons name="image-outline" size={28} color={isLight ? '#727272' : '#A8A8A8'} />
        </View>
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.72)']}
        style={styles.storyTileGrad}
        pointerEvents="none"
      />
      {isVideo ? (
        <View style={styles.storyVideoBadge} pointerEvents="none">
          <Ionicons name="play" size={14} color="#FFF" />
        </View>
      ) : null}
      <View style={styles.storyTileMeta} pointerEvents="none">
        <Text style={styles.storyTileDate}>{formatArchiveShortDate(item.created_at, langUk)}</Text>
        {Number(item.view_count) > 0 ? (
          <Text style={styles.storyTileViews} numberOfLines={1}>{viewsLabel}</Text>
        ) : (
          <Text style={styles.storyTileViews}>{pf(language, 'archiveStoryExpired')}</Text>
        )}
      </View>
      <View style={[styles.storyTileRing, { borderColor: accent }]} pointerEvents="none" />
    </Pressable>
  );
}

function ArchiveStoriesGrid({
  stories,
  contentW,
  isLight,
  language,
  langUk,
  accent,
  onOpenStory,
}) {
  const tileW = Math.floor((contentW - STORY_GAP * (STORY_COLS - 1)) / STORY_COLS);
  const tileH = Math.round(tileW * (16 / 9));

  return (
    <View style={styles.storyGrid}>
      {stories.map((item, idx) => (
        <View
          key={String(item.id)}
          style={{
            marginRight: (idx + 1) % STORY_COLS === 0 ? 0 : STORY_GAP,
            marginBottom: STORY_GAP,
          }}
        >
          <ArchiveStoryTile
            item={item}
            tileW={tileW}
            tileH={tileH}
            isLight={isLight}
            language={language}
            langUk={langUk}
            accent={accent}
            onPress={() => onOpenStory(item, stories)}
          />
        </View>
      ))}
    </View>
  );
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

        <Text style={[styles.dateLine, { color: textMuted }]}>
          {formatArchiveDate(item.archived_at || item.created_at, langUk)}
        </Text>

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
  tab = 'posts',
  variant = 'empty',
  showCta = false,
  ctaLabel,
  onCta,
  ripple,
}) {
  const photos = tab === 'stories' ? ARCHIVE_EMPTY_STORY_PHOTOS : ARCHIVE_EMPTY_POST_PHOTOS;
  const photoBorder = isLight ? '#FFFFFF' : 'rgba(255, 255, 255, 0.16)';
  const photoShadow = isLight ? '#0212EB' : '#000000';
  const headline =
    variant === 'login'
      ? pf(language, 'archiveTitle')
      : tab === 'stories'
        ? pf(language, 'archiveStoriesEmptyHeadline')
        : pf(language, 'archiveEmptyHeadline');
  const hintText =
    variant === 'login'
      ? ft(language, 'composerNeedLogin')
      : tab === 'posts'
        ? pf(language, 'archiveSubtitle')
        : pf(language, 'archiveStoriesSubtitle');
  const contentPad = Math.max(24, (winW - 380) / 2 + 24);

  return (
    <ScrollView
      style={styles.placeholderScroll}
      contentContainerStyle={[
        styles.placeholderInner,
        {
          paddingHorizontal: contentPad,
          paddingBottom: Math.max(insetsBottom, 20) + 16,
        },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      {...(Platform.OS === 'ios' ? { contentInsetAdjustmentBehavior: 'never' } : {})}
    >
      <View style={styles.emptyStage}>
        <View style={styles.emptyPhotoRow} pointerEvents="none">
          {photos.map((source, idx) => {
            const center = idx === 1;
            return (
              <Image
                key={`empty-photo-${String(idx)}`}
                source={source}
                style={[
                  styles.emptyPhoto,
                  center ? styles.emptyPhotoCenter : null,
                  {
                    borderColor: photoBorder,
                    transform: [{ rotate: idx === 0 ? '-10deg' : idx === 2 ? '10deg' : '0deg' }],
                    marginLeft: idx === 0 ? 0 : -26,
                    zIndex: center ? 3 : idx === 0 ? 1 : 2,
                    opacity: center ? 1 : 0.88,
                    ...(Platform.OS === 'ios'
                      ? {
                          shadowColor: photoShadow,
                          shadowOffset: { width: 0, height: center ? 10 : 6 },
                          shadowOpacity: isLight ? 0.18 : 0.35,
                          shadowRadius: center ? 16 : 10,
                        }
                      : { elevation: center ? 6 : 3 }),
                  },
                ]}
                resizeMode="cover"
              />
            );
          })}
        </View>

        <Text style={[styles.emptyTitle, brandFontHeadMedium, { color: textMain }]} numberOfLines={2}>
          {headline}
        </Text>
        <Text style={[styles.emptyHint, { color: textMuted }]}>{hintText}</Text>
      </View>

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
  const initialCacheKey = archiveCacheKey();
  seedArchiveCacheIfMissing(initialCacheKey);
  const initialCache = readArchiveCache(initialCacheKey);
  const { appTheme, isLight } = useAppTheme(route?.params?.appTheme);
  const [posts, setPosts] = useState(initialCache?.posts ?? []);
  const [stories, setStories] = useState(initialCache?.stories ?? []);
  const [tab, setTab] = useState('posts');
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [listContentW, setListContentW] = useState(0);

  const feedOk = hasFeedApiToken();
  const shellUser = route?.params?.user || useAuthStore.getState().user;
  const hasShellUser = !!shellUser?.id;

  const viewportW = listContentW > 0 ? listContentW : winW;
  const cardWidth = Math.max(280, viewportW - 32);
  const planTexts = getChoosePlanTexts(language);

  const reload = useCallback(async ({ silent = false } = {}) => {
    const key = archiveCacheKey();
    const cached = readArchiveCache(key);
    if (!hasFeedApiToken()) {
      const localStories = hasShellUser ? await loadLocalArchivedStories(shellUser) : [];
      setPosts([]);
      setStories(localStories);
      if (localStories.length) writeArchiveCache(key, { posts: [], stories: localStories });
      setSyncing(false);
      return;
    }
    if (!silent) setSyncing(true);
    try {
      const { posts: nextPosts, stories: nextStories } = await fetchArchiveData(80);
      let resolvedStories = nextStories;
      if (!resolvedStories.length && hasShellUser) {
        resolvedStories = await loadLocalArchivedStories(shellUser);
      }
      setPosts(nextPosts);
      setStories(resolvedStories);
      writeArchiveCache(key, { posts: nextPosts, stories: resolvedStories });
    } catch {
      if (!cached) {
        setPosts([]);
        const localStories = hasShellUser ? await loadLocalArchivedStories(shellUser) : [];
        setStories(localStories);
      }
    } finally {
      setSyncing(false);
      setRefreshing(false);
    }
  }, [hasShellUser, shellUser]);

  useFocusEffect(
    useCallback(() => {
      const cached = readArchiveCache(archiveCacheKey());
      void reload({ silent: !!cached });
    }, [reload]),
  );

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

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void reload({ silent: true });
  }, [reload]);

  const goLogin = useCallback(() => {
    navigation.navigate('BackendAuth');
  }, [navigation]);

  const onRestore = (id) => {
    if (!hasFeedApiToken()) return;
    Alert.alert('', pf(language, 'restorePost'), [
      { text: pf(language, 'cancel'), style: 'cancel' },
      {
        text: pf(language, 'restorePost'),
        onPress: async () => {
          setBusyId(id);
          try {
            await feedPatchPostArchive(id, false);
            Alert.alert('', pf(language, 'postRestored'));
            setPosts((prev) => {
              const next = prev.filter((p) => String(p.id) !== String(id));
              writeArchiveCache(archiveCacheKey(), { posts: next, stories });
              return next;
            });
            await reload({ silent: true });
          } catch (e) {
            Alert.alert('', errorToUserText(e, language));
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const openArchivedStory = useCallback(
    (item, allStories) => {
      const user = shellUser;
      if (!user?.id) return;
      navigation.navigate('FeedStoryViewer', {
        user,
        userId: String(user.id),
        storyId: String(item.id),
        prefetchedStories: allStories,
        language,
        appTheme,
        ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
      });
    },
    [navigation, shellUser, language, appTheme, route?.params?.countryId],
  );

  const activeItems = tab === 'posts' ? posts : stories;
  const isEmpty = activeItems.length === 0;

  const listHeader = (
    <View style={styles.listHeader}>
      <ArchiveSegmentBar
        tab={tab}
        onTab={setTab}
        language={language}
        isLight={isLight}
        accent={accent}
        onAccentTxt={onAccentTxt}
        textMuted={textMuted}
        postsCount={posts.length}
        storiesCount={stories.length}
      />
      {syncing ? (
        <View style={styles.syncRow}>
          <ActivityIndicator size="small" color={isLight ? '#0212EB' : '#E1FF00'} />
        </View>
      ) : null}
      <Text style={[styles.intro, { color: textMuted }]}>
        {tab === 'posts' ? pf(language, 'archiveSubtitle') : pf(language, 'archiveStoriesSubtitle')}
      </Text>
    </View>
  );

  const goChoosePlanCancel = useCallback(() => {
    navigation.navigate('CancelSubscription', {
      user: route?.params?.user,
      language,
      appTheme,
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
      {!feedOk && !hasShellUser ? (
        <ArchiveScreenPlaceholder
          language={language}
          isLight={isLight}
          winW={winW}
          insetsBottom={insets.bottom}
          accent={accent}
          onAccentTxt={onAccentTxt}
          textMain={textMain}
          textMuted={textMuted}
          variant="login"
          showCta
          ctaLabel={pf(language, 'archiveLoginCta')}
          onCta={goLogin}
          ripple={ripple}
        />
      ) : isEmpty ? (
        <ScrollView
          style={styles.placeholderScroll}
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={
            feedOk || hasShellUser ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={isLight ? '#0212EB' : '#E1FF00'}
              />
            ) : undefined
          }
        >
          <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
            <ArchiveSegmentBar
              tab={tab}
              onTab={setTab}
              language={language}
              isLight={isLight}
              accent={accent}
              onAccentTxt={onAccentTxt}
              textMuted={textMuted}
              postsCount={posts.length}
              storiesCount={stories.length}
            />
            {syncing ? (
              <View style={styles.syncRow}>
                <ActivityIndicator size="small" color={isLight ? '#0212EB' : '#E1FF00'} />
              </View>
            ) : null}
          </View>
          <ArchiveScreenPlaceholder
            language={language}
            isLight={isLight}
            winW={winW}
            insetsBottom={insets.bottom}
            accent={accent}
            onAccentTxt={onAccentTxt}
            textMain={textMain}
            textMuted={textMuted}
            tab={tab}
            ripple={ripple}
          />
        </ScrollView>
      ) : tab === 'stories' ? (
        <ScrollView
          style={styles.listFlexTransparent}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 4,
            paddingBottom: Math.max(insets.bottom, 12) + 24,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={isLight ? '#0212EB' : '#E1FF00'}
            />
          }
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0 && Math.abs(w - listContentW) > 0.5) setListContentW(w);
          }}
        >
          {listHeader}
          <ArchiveStoriesGrid
            stories={stories}
            contentW={Math.max(280, viewportW - 32)}
            isLight={isLight}
            language={language}
            langUk={langUk}
            accent={accent}
            onOpenStory={openArchivedStory}
          />
          {listFooter}
        </ScrollView>
      ) : (
        <View
          style={styles.listFlex}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0 && Math.abs(w - listContentW) > 0.5) setListContentW(w);
          }}
        >
          <RenderProfiler id="SettingsArchivePage">
          <FlashList
            style={styles.listFlexTransparent}
            data={posts}
            keyExtractor={(p) => String(p.id)}
            estimatedItemSize={500}
            ListHeaderComponent={listHeader}
            ListFooterComponent={listFooter}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={isLight ? '#0212EB' : '#E1FF00'}
              />
            }
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
          </RenderProfiler>
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
    minHeight: 420,
  },
  emptyStage: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  emptyPhotoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 118,
    marginBottom: 26,
    paddingHorizontal: 8,
  },
  emptyPhoto: {
    width: 74,
    height: 98,
    borderRadius: 16,
    borderWidth: 2.5,
  },
  emptyPhotoCenter: {
    width: 84,
    height: 108,
    borderRadius: 18,
  },
  emptyTitle: {
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.5,
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: 12,
  },
  emptyHint: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 320,
    opacity: 0.88,
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
  syncRow: { alignItems: 'flex-start', paddingBottom: 6, paddingLeft: 4 },
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
  segmentWrap: {
    flexDirection: 'row',
    marginBottom: 10,
    gap: 24,
    paddingHorizontal: 4,
  },
  segmentBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 40,
    paddingBottom: 6,
  },
  segmentLabel: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  segmentCountTxt: { fontSize: 12, fontWeight: '700', opacity: 0.85 },
  segmentUnderline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    borderRadius: 1,
  },
  storyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
  storyTile: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#111',
    position: 'relative',
  },
  storyTileEmpty: { alignItems: 'center', justifyContent: 'center' },
  storyTileGrad: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
  },
  storyTileRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: 1.5,
    opacity: 0.35,
  },
  storyVideoBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyTileMeta: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
  },
  storyTileDate: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  storyTileViews: { color: 'rgba(255,255,255,0.82)', fontSize: 11, fontWeight: '600', marginTop: 2 },
});

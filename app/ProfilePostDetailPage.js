import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  FlatList,
  Modal,
  Platform,
  Alert,
} from 'react-native';
import { Video, ResizeMode } from './expoAvCompat';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { getAppTheme } from './themeStorage';
import { accentForTheme } from './themeAccent';
import { useSyncedAppLanguage } from './useAppLanguage';

import { pf } from './profileI18n';
import {
  getPostLikeState,
  togglePostLike,
  getPostCaption,
  getProfileDisplayName,
  POST_ID,
} from './profileStorage';
import {
  hasFeedApiToken,
  feedListMyPosts,
  feedPatchPostArchive,
  feedDeletePost,
  feedTogglePostLike,
} from './feedApi';
import { useAuthStore } from './auth/authStore';
import { lightTabBarExtraScrollPadding } from './LightBottomTabBar';
import { emitFeedMediaUpdated } from './feedSyncEvents';
import { errorToUserText } from './errorText';

const POST_IMG = require('./assets/kling_20260405_IMAGE____________5495_1.png');

function formatPostAge(iso, language, langUk) {
  if (!iso) return '';
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '';
  const diff = Date.now() - ms;
  const h = Math.floor(diff / 3600000);
  if (h < 1) return langUk ? 'щойно' : 'just now';
  if (h < 24) return `${h} ${pf(language, 'hoursAgo')}`;
  const d = Math.floor(h / 24);
  return `${d} ${langUk ? 'дн.' : 'd'}`;
}

export default function ProfilePostDetailPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const langUk = language.split(/[-_]/)[0].toLowerCase() === 'uk';
  const postId = route?.params?.postId;
  const routeCover = route?.params?.coverUrl;
  const user = route?.params?.user || {};

  const [likes, setLikes] = useState({ liked: false, count: 0 });
  const [caption, setCaption] = useState('');
  const [author, setAuthor] = useState('');
  const [placeLine, setPlaceLine] = useState('');
  const [postedAt, setPostedAt] = useState(null);
  const [feedPost, setFeedPost] = useState(null);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [authorAvatarUri, setAuthorAvatarUri] = useState(null);
  const [menu, setMenu] = useState(false);
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');
  const [menuBusy, setMenuBusy] = useState(false);

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const screenBg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const textMuted = isLight ? '#727272' : '#A8A8A8';
  const cardBg = isLight ? '#FFF' : '#1A1A1A';

  const coverUrl = (feedPost?.media_urls && feedPost.media_urls[0]) || routeCover;
  const mediaUrls = Array.isArray(feedPost?.media_urls) ? feedPost.media_urls.filter(Boolean) : [];
  const canArchive =
    hasFeedApiToken() && feedPost != null && postId != null && String(postId).trim() !== '' && String(postId) !== POST_ID;
  const canDeleteBackendPost =
    postId != null && String(postId).trim() !== '' && String(postId) !== POST_ID;

  const shell = {
    user,
    language,
    ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
    appTheme,
    ...(postId != null ? { postId } : {}),
    ...(coverUrl ? { coverUrl } : {}),
  };

  const reload = useCallback(async () => {
    const t = await getAppTheme();
    setAppTheme(t === 'light' ? 'light' : 'dark');

    await useAuthStore.getState().hydrate();
    if (!useAuthStore.getState().accessToken) {
      await useAuthStore.getState().refreshSession().catch(() => {});
    }
    const token = useAuthStore.getState().accessToken;
    if (token) {
      try {
        await useAuthStore.getState().loadProfileMeIfStale();
      } catch {
        /* */
      }
    }

    const pid = postId;
    const useFeed =
      hasFeedApiToken() && pid != null && String(pid).trim() !== '' && String(pid) !== POST_ID;

    let loaded = null;
    if (useFeed) {
      try {
        const posts = await feedListMyPosts(80);
        loaded = (Array.isArray(posts) ? posts : []).find((p) => String(p.id) === String(pid)) || null;
      } catch {
        loaded = null;
      }
    }
    setFeedPost(loaded);
    setMediaIndex(0);

    if (loaded) {
      setAuthorAvatarUri(loaded.avatar_url || null);
      const capDefault = loaded.content_text || pf(language, 'postCaption');
      setCaption(await getPostCaption(pid, capDefault));
      setPlaceLine(loaded.place_label || '');
      setPostedAt(loaded.created_at || null);
      const uname = (loaded.username || '').replace(/^@/, '');
      const display = await getProfileDisplayName(user?.name || user?.email || uname || '');
      const label = uname || display;
      setAuthor((label.split(/\s+/)[0] || label).trim() || '—');
    } else if (useFeed) {
      const pm = useAuthStore.getState().profileMe?.profile;
      setAuthorAvatarUri(pm?.avatar_url || null);
      setCaption(await getPostCaption(pid, pf(language, 'postCaption')));
      setPlaceLine('');
      setPostedAt(null);
      const n = await getProfileDisplayName(user?.name || user?.email || '');
      const short = n.split(/\s+/)[0] || n || '—';
      setAuthor(short);
    } else {
      setAuthorAvatarUri(null);
      const cap = await getPostCaption(pid, pf(language, 'postCaption'));
      setCaption(cap);
      const n = await getProfileDisplayName(user?.name || user?.email || '');
      const short = n.split(/\s+/)[0] || n || '—';
      setAuthor(short);
      setPlaceLine('');
      setPostedAt(null);
    }

    if (loaded) {
      setLikes({
        liked: !!loaded.liked_by_viewer,
        count: Number(loaded.likes_count) || 0,
      });
    } else {
      setLikes(await getPostLikeState(pid));
    }
  }, [language, postId, user?.name, user?.email, langUk]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const onLike = async () => {
    const useFeed =
      hasFeedApiToken() &&
      postId != null &&
      String(postId).trim() !== '' &&
      String(postId) !== POST_ID;
    if (useFeed) {
      const out = await feedTogglePostLike(String(postId));
      setLikes({ liked: !!out.liked, count: Number(out.likes_count) || 0 });
      emitFeedMediaUpdated({ postId: String(postId) });
      return;
    }
    setLikes(await togglePostLike(postId));
  };

  const param = (label, icon, onPress, danger) => (
    <Pressable
      key={label}
      style={({ pressed }) => [
        styles.menuRow,
        {
          borderBottomColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)',
        },
        pressed && { opacity: 0.75 },
      ]}
      onPress={() => {
        setMenu(false);
        onPress();
      }}
    >
      <Ionicons name={icon} size={22} color={danger ? '#EB4335' : textMain} style={{ width: 28 }} />
      <Text style={[styles.menuLabel, { color: textMain }, danger && { color: '#EB4335' }]}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={[styles.screen, { backgroundColor: screenBg }]}>
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        centerSubtitle={pf(language, 'postDetailHeader')}
        hideSendButton
      />
      <ScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + lightTabBarExtraScrollPadding() + 20,
        }}
        {...(Platform.OS === 'ios' ? { contentInsetAdjustmentBehavior: 'never' } : {})}
      >
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <View style={styles.postHead}>
            {authorAvatarUri ? (
              <Image source={{ uri: authorAvatarUri }} style={styles.smAvatar} resizeMode="cover" />
            ) : (
              <View
                style={[
                  styles.smAvatar,
                  !isLight && { backgroundColor: 'rgba(255,255,255,0.12)' },
                ]}
              />
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.postName, { color: textMain }]}>{author}</Text>
              <Text style={[styles.postLoc, { color: textMuted }]}>{placeLine}</Text>
            </View>
            <Pressable onPress={() => setMenu(true)} hitSlop={12}>
              <Ionicons name="ellipsis-vertical" size={20} color={textMain} />
            </Pressable>
          </View>
          {mediaUrls.length > 1 ? (
            <View>
              <FlatList
                data={mediaUrls}
                horizontal
                pagingEnabled
                keyExtractor={(it, i) => `${i}_${it}`}
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => {
                  const w = e?.nativeEvent?.layoutMeasurement?.width || 1;
                  const x = e?.nativeEvent?.contentOffset?.x || 0;
                  const idx = Math.max(0, Math.min(mediaUrls.length - 1, Math.round(x / w)));
                  setMediaIndex(idx);
                }}
                maxToRenderPerBatch={3}
                windowSize={3}
                removeClippedSubviews={Platform.OS === 'android'}
                initialNumToRender={3}
                renderItem={({ item }) => {
                  const u = String(item || '');
                  const isVid = /\.(mp4|mov|m4v)(\?|$)/i.test(u);
                  return isVid ? (
                    <Video
                      source={{ uri: u }}
                      style={styles.postImg}
                      resizeMode={ResizeMode.COVER}
                      useNativeControls
                      shouldPlay={false}
                    />
                  ) : (
                    <Image source={{ uri: u }} style={styles.postImg} resizeMode="cover" />
                  );
                }}
              />
              <View style={styles.mediaDots}>
                {mediaUrls.map((_, i) => (
                  <View
                    key={`pd_${i}`}
                    style={[styles.mediaDot, i === mediaIndex ? { backgroundColor: accent, opacity: 1 } : null]}
                  />
                ))}
              </View>
            </View>
          ) : (
            <Image
              source={coverUrl ? { uri: coverUrl } : POST_IMG}
              style={styles.postImg}
              resizeMode="cover"
            />
          )}
          <View style={styles.actions}>
            <View style={styles.actionsLeft}>
              <Pressable onPress={onLike} hitSlop={8}>
                <Ionicons
                  name={likes.liked ? 'heart' : 'heart-outline'}
                  size={24}
                  color={likes.liked ? '#EB4335' : textMain}
                />
              </Pressable>
              <Pressable
                onPress={() =>
                  navigation.navigate('ProfileComments', {
                    ...shell,
                    useBackendComments:
                      hasFeedApiToken() &&
                      postId != null &&
                      String(postId).trim() !== '' &&
                      String(postId) !== POST_ID,
                  })
                }
                hitSlop={8}
                style={{ marginLeft: 16 }}
              >
                <Ionicons name="chatbubble-outline" size={22} color={textMain} />
              </Pressable>
              <Pressable hitSlop={8} style={{ marginLeft: 16 }} onPress={() => Alert.alert('', pf(language, 'comingSoon'))}>
                <Ionicons name="paper-plane-outline" size={22} color={textMain} />
              </Pressable>
            </View>
            <View style={styles.actionsRight}>
              <Pressable hitSlop={8} onPress={() => Alert.alert('', pf(language, 'comingSoon'))}>
                <Ionicons name="bookmark-outline" size={24} color={textMain} />
              </Pressable>
              <Pressable
                style={[
                  styles.routeBtn,
                  { backgroundColor: isLight ? '#0F1F4A' : accent },
                ]}
                onPress={() => navigation.navigate('RouteFinder', shell)}
              >
                <Text
                  style={[
                    styles.routeBtnText,
                    { color: isLight ? '#FFF' : '#1E1E1E' },
                  ]}
                >
                  {pf(language, 'route')}
                </Text>
              </Pressable>
            </View>
          </View>
          <Text style={[styles.likeLine, { color: textMain }]}>
            {pf(language, 'likedBy')} <Text style={styles.bold}>{likes.count}</Text>
          </Text>
          <Text style={[styles.caption, { color: textMain }]}>
            <Text style={styles.bold}>{author}: </Text>
            {caption}
          </Text>
          <Text style={[styles.time, { color: isLight ? '#999' : '#777' }]}>
            {postedAt ? formatPostAge(postedAt, language, langUk) : `2 ${pf(language, 'hoursAgo')}`}
          </Text>
        </View>
      </ScrollView>

      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setMenu(false)} />
        <View
          style={[
            styles.sheet,
            {
              paddingBottom: insets.bottom + 20,
              backgroundColor: isLight ? LIGHT_BAR_BG : '#252525',
            },
          ]}
        >
          <View style={styles.sheetHandle} />
          <Text style={[styles.sheetTitle, { color: textMain }]}>{pf(language, 'parameters')}</Text>
          {param(pf(language, 'paramEdit'), 'create-outline', () =>
            navigation.navigate('ProfileEditPublication', shell),
          )}
          {canArchive
            ? param(pf(language, 'archivePost'), 'archive-outline', () =>
                Alert.alert('', pf(language, 'archivePost'), [
                  { text: pf(language, 'cancel'), style: 'cancel' },
                  {
                    text: pf(language, 'save'),
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await feedPatchPostArchive(String(postId), true);
                        Alert.alert('', pf(language, 'postArchived'));
                        navigation.goBack();
                      } catch (e) {
                        Alert.alert('', errorToUserText(e, language));
                      }
                    },
                  },
                ]),
              )
            : null}
          {param(pf(language, 'paramMessage'), 'paper-plane-outline', () =>
            navigation.navigate('Chats', shell),
          )}
          {param(pf(language, 'paramSave'), 'bookmark-outline', () => Alert.alert('', pf(language, 'comingSoon')))}
          {param(pf(language, 'paramLikes'), 'heart-outline', () => navigation.navigate('ProfileLikes', shell))}
          {param(pf(language, 'paramNoComments'), 'ban-outline', () => Alert.alert('', pf(language, 'comingSoon')))}
          {param(pf(language, 'paramSharePost'), 'share-social-outline', () => Alert.alert('', pf(language, 'comingSoon')))}
          {param(pf(language, 'paramShareLoc'), 'location-outline', () => Alert.alert('', pf(language, 'comingSoon')))}
          {param(
            pf(language, 'paramDelete'),
            'trash-outline',
            () =>
              Alert.alert('', pf(language, 'paramDelete'), [
                { text: pf(language, 'cancel'), style: 'cancel' },
                {
                  text: pf(language, 'paramDelete'),
                  style: 'destructive',
                  onPress: async () => {
                    if (!canDeleteBackendPost || menuBusy) {
                      Alert.alert('', pf(language, 'needBackendSocial'));
                      return;
                    }
                    setMenuBusy(true);
                    try {
                      await useAuthStore.getState().hydrate();
                      if (!useAuthStore.getState().accessToken) {
                        await useAuthStore.getState().refreshSession().catch(() => {});
                      }
                      if (!useAuthStore.getState().accessToken) {
                        Alert.alert('', pf(language, 'needBackendSocial'));
                        return;
                      }
                      await feedDeletePost(String(postId));
                      Alert.alert('', pf(language, 'paramDelete'));
                      navigation.goBack();
                    } catch (e) {
                      Alert.alert('', errorToUserText(e, language));
                    } finally {
                      setMenuBusy(false);
                    }
                  },
                },
              ]),
            true,
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  card: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 20,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
      android: { elevation: 3 },
    }),
  },
  postHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  smAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginRight: 10,
  },
  postName: { fontSize: 15, fontWeight: '700' },
  postLoc: { fontSize: 13, marginTop: 2 },
  postImg: { width: '100%', aspectRatio: 1 },
  mediaDots: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  mediaDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.72)',
    opacity: 0.55,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionsLeft: { flexDirection: 'row', alignItems: 'center' },
  actionsRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  routeBtnText: { fontSize: 13, fontWeight: '600' },
  likeLine: { fontSize: 14, paddingHorizontal: 14, marginBottom: 6 },
  bold: { fontWeight: '700' },
  caption: { fontSize: 14, lineHeight: 20, paddingHorizontal: 14 },
  time: { fontSize: 12, paddingHorizontal: 14, marginTop: 8, marginBottom: 14 },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.15)',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuLabel: { fontSize: 16, marginLeft: 8 },
});

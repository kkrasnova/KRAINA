import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlashList } from '@shopify/flash-list';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  Alert,
  ActivityIndicator,
  DeviceEventEmitter,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { useSyncedAppLanguage } from './useAppLanguage';
import ProfileAvatarCircle, { useViewerProfileAvatarUri } from './ProfileAvatarCircle';

import { pf } from './profileI18n';
import { ft } from './feedI18n';
import { lightTabBarScrollContentPadding } from './LightBottomTabBar';
import { getPostComments, addPostComment, toggleCommentLike, POST_ID } from './profileStorage';
import { useAppTheme } from './useAppTheme';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import {
  ensureFeedSocialReady,
  feedListPostComments,
  feedAddPostComment,
  feedToggleCommentLike,
} from './feedApi';
import { hasBackendSession } from './backendAuthApi';
import { isLocalFeedPostId, isServerFeedPostId, resolveBackendFeedPostId } from './feedPostSyncBridge';
import { resolveFeedLocalUser } from './feedLocalStorage';
import {
  addLocalFeedPostComment,
  getLocalFeedPostComments,
  isLocalFeedCommentId,
  toggleLocalFeedPostCommentLike,
} from './feedLocalInteractions';
import { resolveFeedMediaUrl } from './feedMediaUrl';
import { emitFeedMediaUpdated, KRAINA_FEED_MEDIA_UPDATED } from './feedSyncEvents';
import { peekPostComments } from './feedInteractionHotCache';
import { errorToUserText } from './errorText';
import { useAuthStore } from './auth/authStore';

function formatCommentAge(iso, language) {
  if (!iso) return '';
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '';
  const langUk = language.split(/[-_]/)[0].toLowerCase() === 'uk';
  const diff = Date.now() - ms;
  const h = Math.floor(diff / 3600000);
  if (h < 1) return langUk ? 'щойно' : 'just now';
  if (h < 24) return `${h} ${pf(language, 'hoursAgo')}`;
  const d = Math.floor(h / 24);
  return `${d} ${langUk ? 'дн.' : 'd'}`;
}

function mapBackendComment(row, language) {
  return {
    id: String(row.id),
    author: `@${row.username || 'user'}`,
    time: formatCommentAge(row.created_at, language),
    text: row.content || '',
    likes: Number(row.likes_count) || 0,
    liked: !!row.liked_by_viewer,
    avatarUrl: row.avatar_url ? resolveFeedMediaUrl(String(row.avatar_url)) : '',
    _backend: true,
  };
}

function mapLocalComment(row, language) {
  const username =
    row.username ||
    row.author?.username ||
    row.author?.display_name ||
    'user';
  return {
    id: String(row.id),
    author: `@${String(username).replace(/^@/, '')}`,
    time: formatCommentAge(row.created_at, language),
    text: row.content || '',
    likes: Number(row.likes_count) || 0,
    liked: !!row.liked_by_viewer,
    avatarUrl: row.avatar_url ? resolveFeedMediaUrl(String(row.avatar_url)) : '',
    _local: true,
  };
}

function mapHotComment(row, language) {
  if (!row) return null;
  if (row.content != null && row.username != null) return mapBackendComment(row, language);
  return mapLocalComment(row, language);
}

export default function ProfileCommentsPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const [list, setList] = useState([]);
  const [draft, setDraft] = useState('');
  const { appTheme, isLight } = useAppTheme(route?.params?.appTheme, route);
  const [backendReady, setBackendReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const accent = accentForTheme(isLight);
  const screenBg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const textMain = isLight ? '#333' : 'rgba(255,255,255,0.92)';
  const textMuted = isLight ? '#727272' : '#A0A0A0';
  const panelBg = isLight ? '#FFF' : '#1A1A1A';
  const panelBorder = isLight ? '#6286E4' : accent;

  const postId = route?.params?.postId;
  const routeUser = route?.params?.user;
  const authUser = useAuthStore((s) => s.user);
  const profileMeUserId = useAuthStore((s) => s.profileMe?.profile?.user_id);
  const profileMeDisplayName = useAuthStore((s) => {
    const dn = s.profileMe?.profile?.display_name;
    return dn != null && String(dn).trim() ? String(dn).trim() : '';
  });
  const feedLocalUser = useMemo(
    () => resolveFeedLocalUser(routeUser, { authUser, profileUserId: profileMeUserId }),
    [routeUser, authUser, profileMeUserId],
  );
  const localUser = feedLocalUser || routeUser;
  const viewerUserId = profileMeUserId ? String(profileMeUserId) : String(localUser?.id || '');
  const viewerAvatarUri = useViewerProfileAvatarUri(localUser);

  const reload = useCallback(async () => {
    const pid = String(postId || '');
    const hot = peekPostComments(pid);

    if (pid && isLocalFeedPostId(pid)) {
      setBackendReady(false);
      if (!hot.has) setLoading(true);
      try {
        const rows = await getLocalFeedPostComments(localUser, pid);
        let merged = (Array.isArray(rows) ? rows : []).map((row) => mapLocalComment(row, language));
        const backendId = await resolveBackendFeedPostId(pid, { user: localUser });
        if (isServerFeedPostId(backendId)) {
          const ready = await ensureFeedSocialReady(localUser);
          setBackendReady(ready && hasBackendSession());
          if (ready && hasBackendSession()) {
            const serverRows = await feedListPostComments(backendId, 120);
            const serverMapped = (Array.isArray(serverRows) ? serverRows : []).map((row) =>
              mapBackendComment(row, language),
            );
            const seen = new Set(merged.map((c) => `${c.author}:${c.text}`));
            for (const row of serverMapped) {
              const key = `${row.author}:${row.text}`;
              if (!seen.has(key)) {
                seen.add(key);
                merged.push(row);
              }
            }
          }
        }
        setList(merged);
      } catch {
        setList([]);
      } finally {
        setLoading(false);
      }
      return;
    }

    const canUseBackend = pid && pid !== POST_ID && isServerFeedPostId(pid);

    if (canUseBackend) {
      if (!hot.has) setLoading(true);
      try {
        const ready = await ensureFeedSocialReady(localUser);
        setBackendReady(ready && hasBackendSession());
        if (ready && hasBackendSession()) {
          const rows = await feedListPostComments(pid, 120);
          setList((Array.isArray(rows) ? rows : []).map((row) => mapBackendComment(row, language)));
          return;
        }
      } catch (e) {
        Alert.alert('', errorToUserText(e, language) || ft(language, 'feedActionFailed'));
        setList([]);
        return;
      } finally {
        setLoading(false);
      }
    }

    setBackendReady(false);
    setList(await getPostComments(postId));
  }, [postId, localUser, language]);

  useEffect(() => {
    const pid = String(postId || '');
    if (!pid) return;
    const hot = peekPostComments(pid);
    if (!hot.has || !hot.items.length) return;
    setList((prev) => {
      if (prev.length) return prev;
      return hot.items.map((row) => mapHotComment(row, language)).filter(Boolean);
    });
  }, [postId, language]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  useEffect(() => {
    const pid = String(postId || '');
    if (!pid) return undefined;
    const sub = DeviceEventEmitter.addListener(KRAINA_FEED_MEDIA_UPDATED, (payload) => {
      if (payload?.kind && payload.kind !== 'interaction') return;
      if (payload?.comments_count == null) return;
      void (async () => {
        const eventIds = new Set(
          [payload?.postId, payload?.localPostId].map((v) => String(v || '')).filter(Boolean),
        );
        const backendId = await resolveBackendFeedPostId(pid, { user: localUser });
        const profileIds = new Set([pid, backendId].filter(Boolean));
        const matches = [...profileIds].some((id) => eventIds.has(id));
        if (!matches) return;
        void reload();
      })();
    });
    return () => sub.remove();
  }, [postId, reload, localUser]);

  const send = async () => {
    const t = draft.trim();
    if (!t || sending) return;
    const pid = String(postId || '');
    setSending(true);
    setDraft('');

    if (pid && isLocalFeedPostId(pid)) {
      try {
        const row = await addLocalFeedPostComment(localUser, pid, {
          content: t,
          author: {
            userId: viewerUserId,
            displayName:
              profileMeDisplayName ||
              localUser?.name ||
              localUser?.email?.split('@')[0] ||
              'User',
            username: localUser?.username || '',
            avatarUrl: viewerAvatarUri || null,
          },
        });
        setList((prev) => [...prev, mapLocalComment(row, language)]);
        emitFeedMediaUpdated({
          kind: 'interaction',
          postId: pid,
          comments_count: list.length + 1,
        });
        void (async () => {
          try {
            const backendId = await resolveBackendFeedPostId(pid, { user: localUser });
            if (!isServerFeedPostId(backendId)) return;
            await feedAddPostComment(backendId, t);
            emitFeedMediaUpdated({
              kind: 'interaction',
              postId: backendId,
              localPostId: pid,
              comments_count: list.length + 1,
            });
          } catch {
            /* локальний коментар уже збережено */
          }
        })();
      } catch (e) {
        setDraft(t);
        Alert.alert('', errorToUserText(e, language) || ft(language, 'feedActionFailed'));
      } finally {
        setSending(false);
      }
      return;
    }

    if (backendReady && hasBackendSession()) {
      try {
        const row = await feedAddPostComment(pid, t);
        setList((prev) => [...prev, mapBackendComment(row, language)]);
        emitFeedMediaUpdated({
          kind: 'interaction',
          postId: pid,
          comments_count: list.length + 1,
        });
      } catch (e) {
        setDraft(t);
        Alert.alert('', errorToUserText(e, language) || ft(language, 'feedActionFailed'));
      } finally {
        setSending(false);
      }
      return;
    }
    try {
      setList(await addPostComment(postId, t));
    } finally {
      setSending(false);
    }
  };

  const onHeart = async (id) => {
    const pid = String(postId || '');
    const row = list.find((c) => c.id === id);
    if (!row) return;

    if ((pid && isLocalFeedPostId(pid)) || isLocalFeedCommentId(id)) {
      const wasLiked = !!row.liked;
      setList((rows) =>
        rows.map((c) =>
          c.id === id
            ? {
                ...c,
                liked: !wasLiked,
                likes: Math.max(0, (Number(c.likes) || 0) + (wasLiked ? -1 : 1)),
              }
            : c,
        ),
      );
      try {
        const out = await toggleLocalFeedPostCommentLike(localUser, pid, id);
        setList((rows) =>
          rows.map((c) =>
            c.id === id ? { ...c, liked: !!out.liked, likes: Number(out.likes_count) || 0 } : c,
          ),
        );
      } catch (e) {
        setList((rows) =>
          rows.map((c) =>
            c.id === id ? { ...c, liked: wasLiked, likes: Number(row.likes) || 0 } : c,
          ),
        );
        Alert.alert('', errorToUserText(e, language) || ft(language, 'feedActionFailed'));
      }
      return;
    }

    if (backendReady && hasBackendSession()) {
      const wasLiked = !!row.liked;
      setList((rows) =>
        rows.map((c) =>
          c.id === id
            ? {
                ...c,
                liked: !wasLiked,
                likes: Math.max(0, (Number(c.likes) || 0) + (wasLiked ? -1 : 1)),
              }
            : c,
        ),
      );
      try {
        const out = await feedToggleCommentLike(id);
        setList((rows) =>
          rows.map((c) =>
            c.id === id
              ? { ...c, liked: !!out.liked, likes: Number(out.likes_count) || 0 }
              : c,
          ),
        );
      } catch (e) {
        setList((rows) =>
          rows.map((c) =>
            c.id === id ? { ...c, liked: wasLiked, likes: Number(row.likes) || 0 } : c,
          ),
        );
        Alert.alert('', errorToUserText(e, language) || ft(language, 'feedActionFailed'));
      }
      return;
    }
    setList(await toggleCommentLike(postId, id));
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: screenBg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        centerSubtitle={pf(language, 'commentsTitle')}
        hideSendButton
      />
      <View style={[styles.panel, { backgroundColor: panelBg, borderColor: panelBorder }]}>
        <View style={styles.panelBar} />
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={accent} />
          </View>
        ) : (
          <FlashList
            data={list}
            keyExtractor={(item) => item.id}
            estimatedItemSize={100}
            contentContainerStyle={{ paddingTop: 4, paddingBottom: 12 }}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: textMuted }]}>{ft(language, 'postCommentsEmpty')}</Text>
            }
            renderItem={({ item }) => (
              <View
                style={[
                  styles.comment,
                  { borderBottomColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)' },
                ]}
              >
                <ProfileAvatarCircle uri={item.avatarUrl || ''} size={36} isLight={isLight} style={styles.cAvatar} />
                <View style={{ flex: 1 }}>
                  <View style={styles.cHead}>
                    <Text style={[styles.cAuthor, { color: textMain }]}>{item.author}</Text>
                    <Text style={[styles.cTime, { color: textMuted }]}> {item.time}</Text>
                  </View>
                  <Text style={[styles.cText, { color: textMain }]}>{item.text}</Text>
                </View>
                <Pressable style={styles.likeCol} onPress={() => onHeart(item.id)}>
                  <Ionicons
                    name={item.liked ? 'heart' : 'heart-outline'}
                    size={20}
                    color={item.liked ? '#EB4335' : textMain}
                  />
                  {(Number(item.likes) || 0) > 0 ? (
                    <Text style={[styles.likeNum, { color: textMain }]}>{item.likes}</Text>
                  ) : null}
                </Pressable>
              </View>
            )}
          />
        )}
      </View>
      <View
        style={[
          styles.inputRow,
          {
            paddingBottom: lightTabBarScrollContentPadding(insets.bottom, 8),
            backgroundColor: screenBg,
          },
        ]}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={ft(language, 'postCommentPlaceholder')}
          placeholderTextColor={isLight ? '#888' : '#777'}
          style={[
            styles.input,
            {
              backgroundColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)',
              color: textMain,
            },
          ]}
          multiline
          maxLength={500}
          editable={!sending}
        />
        <Pressable
          style={[styles.sendBtn, { backgroundColor: accent, opacity: sending ? 0.6 : 1 }]}
          onPress={send}
          disabled={sending || !draft.trim()}
        >
          {sending ? (
            <ActivityIndicator color={onAccentButtonText(isLight)} size="small" />
          ) : (
            <Ionicons name="arrow-up" size={22} color={onAccentButtonText(isLight)} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  panel: {
    flex: 1,
    marginTop: 8,
    marginHorizontal: 12,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 3,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  panelBar: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.12)',
    marginBottom: 10,
  },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 32 },
  empty: { textAlign: 'center', paddingVertical: 24, fontSize: 14 },
  comment: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cAvatar: {
    marginRight: 10,
  },
  cHead: { flexDirection: 'row', flexWrap: 'wrap' },
  cAuthor: { fontSize: 14, fontWeight: '700' },
  cTime: { fontSize: 13 },
  cText: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  likeCol: { alignItems: 'center', marginLeft: 8, minWidth: 28 },
  likeNum: { fontSize: 12, marginTop: 2 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 10,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

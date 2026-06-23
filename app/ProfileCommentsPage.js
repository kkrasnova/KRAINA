import React, { useCallback, useState } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { useSyncedAppLanguage } from './useAppLanguage';
import ProfileAvatarCircle from './ProfileAvatarCircle';

import { pf } from './profileI18n';
import { ft } from './feedI18n';
import { lightTabBarScrollContentPadding } from './LightBottomTabBar';
import { getPostComments, addPostComment, toggleCommentLike, POST_ID } from './profileStorage';
import { getAppTheme, resolveAppTheme } from './themeStorage';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import {
  ensureFeedSocialReady,
  feedListPostComments,
  feedAddPostComment,
  feedToggleCommentLike,
} from './feedApi';
import { hasBackendSession } from './backendAuthApi';
import { isServerFeedPostId } from './feedPostSyncBridge';
import { resolveFeedMediaUrl } from './feedMediaUrl';
import { emitFeedMediaUpdated } from './feedSyncEvents';
import { errorToUserText } from './errorText';

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

export default function ProfileCommentsPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const [list, setList] = useState([]);
  const [draft, setDraft] = useState('');
  const [appTheme, setAppTheme] = useState(resolveAppTheme(route?.params?.appTheme));
  const [backendReady, setBackendReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const screenBg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const textMain = isLight ? '#333' : 'rgba(255,255,255,0.92)';
  const textMuted = isLight ? '#727272' : '#A0A0A0';
  const panelBg = isLight ? '#FFF' : '#1A1A1A';
  const panelBorder = isLight ? '#6286E4' : accent;

  const postId = route?.params?.postId;
  const localUser = route?.params?.user;

  const reload = useCallback(async () => {
    const t = await getAppTheme();
    setAppTheme(t === 'light' ? 'light' : 'dark');
    const pid = String(postId || '');
    const canUseBackend = pid && pid !== POST_ID && isServerFeedPostId(pid);

    if (canUseBackend) {
      setLoading(true);
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

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const send = async () => {
    const t = draft.trim();
    if (!t || sending) return;
    setSending(true);
    setDraft('');
    if (backendReady && hasBackendSession()) {
      try {
        const row = await feedAddPostComment(String(postId), t);
        setList((prev) => [...prev, mapBackendComment(row, language)]);
        emitFeedMediaUpdated({ postId: String(postId) });
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
    if (backendReady && hasBackendSession()) {
      const prev = list.find((c) => c.id === id);
      if (!prev) return;
      const wasLiked = !!prev.liked;
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
            c.id === id ? { ...c, liked: wasLiked, likes: Number(prev.likes) || 0 } : c,
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

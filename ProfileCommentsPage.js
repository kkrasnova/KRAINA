import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import { useSyncedAppLanguage } from './useAppLanguage';

import { pf } from './profileI18n';
import { lightTabBarExtraScrollPadding } from './LightBottomTabBar';
import { getPostComments, addPostComment, toggleCommentLike, POST_ID } from './profileStorage';
import { getAppTheme } from './themeStorage';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { hasFeedApiToken, feedListPostComments, feedAddPostComment } from './feedApi';
import { emitFeedMediaUpdated } from './feedSyncEvents';

export default function ProfileCommentsPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const [list, setList] = useState([]);
  const [draft, setDraft] = useState('');
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const screenBg = isLight ? LIGHT_BAR_BG : APP_SCREEN_BG;
  const textMain = isLight ? '#333' : 'rgba(255,255,255,0.92)';
  const textMuted = isLight ? '#727272' : '#A0A0A0';
  const panelBg = isLight ? '#FFF' : '#1A1A1A';
  const panelBorder = isLight ? '#6286E4' : accent;

  const postId = route?.params?.postId;
  const useBackendComments =
    route?.params?.useBackendComments === true &&
    hasFeedApiToken() &&
    postId != null &&
    String(postId).trim() !== '' &&
    String(postId) !== POST_ID;

  const shell = {
    user: route?.params?.user,
    language,
    ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
    appTheme,
    ...(postId != null ? { postId } : {}),
  };

  const reload = useCallback(async () => {
    const t = await getAppTheme();
    setAppTheme(t === 'light' ? 'light' : 'dark');
    if (useBackendComments) {
      try {
        const rows = await feedListPostComments(String(postId), 120);
        setList(
          (Array.isArray(rows) ? rows : []).map((row) => ({
            id: String(row.id),
            author: `@${row.username || 'user'}`,
            time: row.created_at || '',
            text: row.content || '',
            likes: 0,
            liked: false,
            _backend: true,
          })),
        );
      } catch {
        setList([]);
      }
      return;
    }
    setList(await getPostComments(postId));
  }, [postId, useBackendComments]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const send = async () => {
    const t = draft.trim();
    if (!t) return;
    setDraft('');
    if (useBackendComments) {
      try {
        const row = await feedAddPostComment(String(postId), t);
        setList((prev) => [
          ...prev,
          {
            id: String(row.id),
            author: `@${row.username || 'user'}`,
            time: row.created_at || '',
            text: row.content || '',
            likes: 0,
            liked: false,
            _backend: true,
          },
        ]);
        emitFeedMediaUpdated({ postId: String(postId) });
      } catch {
        /* */
      }
      return;
    }
    setList(await addPostComment(postId, t));
  };

  const onHeart = async (id) => {
    if (useBackendComments) return;
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
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 12 }}
          renderItem={({ item }) => (
            <View
              style={[
                styles.comment,
                { borderBottomColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)' },
              ]}
            >
              <View
                style={[
                  styles.cAvatar,
                  { backgroundColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)' },
                ]}
              />
              <View style={{ flex: 1 }}>
                <View style={styles.cHead}>
                  <Text style={[styles.cAuthor, { color: textMain }]}>{item.author}</Text>
                  <Text style={[styles.cTime, { color: textMuted }]}> {item.time}</Text>
                </View>
                <Text style={[styles.cText, { color: textMain }]}>{item.text}</Text>
                <Pressable>
                  <Text style={[styles.reply, { color: accent }]}>{pf(language, 'reply')}</Text>
                </Pressable>
                <Text style={[styles.viewRep, { color: textMuted }]}>{pf(language, 'viewReplies')}</Text>
              </View>
              <Pressable style={styles.likeCol} onPress={() => onHeart(item.id)}>
                <Ionicons
                  name={item.liked ? 'heart' : 'heart-outline'}
                  size={20}
                  color={item.liked ? '#EB4335' : textMain}
                />
                <Text style={[styles.likeNum, { color: textMain }]}>{item.likes}</Text>
              </Pressable>
            </View>
          )}
        />
      </View>
      <View
        style={[
          styles.inputRow,
          {
            paddingBottom: insets.bottom + lightTabBarExtraScrollPadding() + 8,
            backgroundColor: screenBg,
          },
        ]}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="@angelina Привіт, цікава локація"
          placeholderTextColor={isLight ? '#888' : '#777'}
          style={[
            styles.input,
            {
              backgroundColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)',
              color: textMain,
            },
          ]}
          multiline
        />
        <Pressable style={[styles.sendBtn, { backgroundColor: accent }]} onPress={send}>
          <Ionicons name="arrow-up" size={22} color={onAccentButtonText(isLight)} />
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
  comment: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  cHead: { flexDirection: 'row', flexWrap: 'wrap' },
  cAuthor: { fontSize: 14, fontWeight: '700' },
  cTime: { fontSize: 13 },
  cText: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  reply: { fontSize: 13, marginTop: 6 },
  viewRep: { fontSize: 13, marginTop: 4 },
  likeCol: { alignItems: 'center', marginLeft: 8 },
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

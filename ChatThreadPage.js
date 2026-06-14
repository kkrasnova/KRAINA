import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  Image,
  Modal,
  Platform,
  Alert,
  KeyboardAvoidingView,
  Share,
  Linking,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getAppTheme } from './themeStorage';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';

import { st } from './chatsI18n';
import { lightTabBarExtraScrollPadding } from './LightBottomTabBar';
import { accentForTheme, onAccentButtonText } from './themeAccent';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import {
  getThreadById,
  markThreadRead,
  sendTextMessage,
  sendImageMessage,
  deleteThread,
  deleteChatHistory,
} from './chatService';
import {
  messagesListMessages,
  messagesSendText,
  messagesMarkRead,
  messagesAcceptThread,
  messagesListThreads,
} from './messageApi';
import { feedUploadMediaFromUri } from './feedApi';
import { HOME_TAB_ROUTE, HOME_TAB } from './homeTabPagerConstants';
import { getRegion } from './routeRegionsData';
import { getSavedRoutes, stripRoutePlanForStorage } from './profileStorage';
import { pf } from './profileI18n';

const APP_BG = '#000000';
const LIGHT_BG = '#F2F2EA';
const ACCENT = '#E1FF00';

function firstUrl(text) {
  const s = String(text || '');
  const m = s.match(/https?:\/\/[^\s]+/i);
  return m ? m[0] : '';
}

function isImageUrl(url) {
  return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(String(url || ''));
}

function mapBackendMessage(raw, language) {
  const content = String(raw?.content || '');
  const url = firstUrl(content);
  try {
    const parsed = JSON.parse(content);
    if (parsed && parsed.type === 'kraina_saved_route' && parsed.plan) {
      const plan = parsed.plan || {};
      const regionId = String(plan.regionId || plan?.meta?.regionId || 'kyiv');
      return {
        id: raw.id,
        createdAt: new Date(raw.sent_at).getTime(),
        fromMe: raw.from_me,
        type: 'route',
        routeCard: {
          regionId,
          title: String(parsed.title || 'Route'),
          subtitle: language?.startsWith('uk') ? 'Маршрут' : 'Route',
        },
      };
    }
  } catch {
    /* not json */
  }
  if (url && isImageUrl(url)) {
    return {
      id: raw.id,
      createdAt: new Date(raw.sent_at).getTime(),
      fromMe: raw.from_me,
      type: 'image',
      imageUri: url,
    };
  }
  return {
    id: raw.id,
    createdAt: new Date(raw.sent_at).getTime(),
    fromMe: raw.from_me,
    type: 'text',
    text: content,
  };
}

export default function ChatThreadPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const langUk = language.split(/[-_]/)[0].toLowerCase() === 'uk';
  const user = route?.params?.user;
  const threadId = route?.params?.threadId;
  const [peerName, setPeerName] = useState(route?.params?.peerName || '');
  const [peerAvatarUrl, setPeerAvatarUrl] = useState(route?.params?.peerAvatarUrl || '');
  const useMessageApi = route?.params?.useMessageApi === true;
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');
  const [thread, setThread] = useState(null);
  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingForMe, setPendingForMe] = useState(route?.params?.pendingForMe === true);
  const [acceptBusy, setAcceptBusy] = useState(false);
  const listRef = useRef(null);

  const shell = useMemo(
    () => ({
      user,
      language,
      ...(route?.params?.countryId != null ? { countryId: route.params.countryId } : {}),
      appTheme: appTheme === 'light' ? 'light' : 'dark',
    }),
    [user, language, route?.params?.countryId, appTheme],
  );

  const reload = useCallback(async () => {
    const t = await getAppTheme();
    setAppTheme(t === 'light' ? 'light' : 'dark');
    if (useMessageApi) {
      try {
        const [inbox, requests] = await Promise.all([
          messagesListThreads('inbox').catch(() => []),
          messagesListThreads('requests').catch(() => []),
        ]);
        const allThreads = [...(Array.isArray(inbox) ? inbox : []), ...(Array.isArray(requests) ? requests : [])];
        const meta = allThreads.find((t) => String(t.id) === String(threadId));
        if (meta) {
          const normalized = meta.peer_username?.startsWith('@') ? meta.peer_username : `@${meta.peer_username}`;
          setPeerName(normalized || peerName);
          setPeerAvatarUrl(String(meta.peer_avatar_url || '').trim());
          setPendingForMe(!!meta.pending_for_me);
        }
        const msgs = await messagesListMessages(threadId);
        setThread({
          messages: msgs.map((m) => mapBackendMessage(m, language)),
        });
        void messagesMarkRead(threadId);
      } catch (e) {
        if (__DEV__) console.warn('[ChatThread] api messages', e?.message);
        setThread({ messages: [] });
      }
    } else {
      const th = await getThreadById(user, threadId, langUk);
      setThread(th);
    }
  }, [user, threadId, langUk, useMessageApi]);

  useFocusEffect(
    useCallback(() => {
      reload();
      if (!useMessageApi) void markThreadRead(user, threadId, langUk);
      if (useMessageApi) {
        const timer = setInterval(() => {
          void reload();
        }, 2500);
        return () => clearInterval(timer);
      }
      return undefined;
    }, [reload, user, threadId, langUk, useMessageApi]),
  );

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const bg = isLight ? LIGHT_BG : APP_BG;
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const incomingBg = isLight ? '#FFFFFF' : '#2B2B2F';
  const outgoingBg = isLight ? '#0212EB' : ACCENT;

  const messages = thread?.messages || [];

  const scrollEnd = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  useEffect(() => {
    scrollEnd();
  }, [messages.length, scrollEnd]);

  const onSend = async () => {
    const t = draft.trim();
    if (!t) return;
    setDraft('');
    try {
      if (useMessageApi) {
        await messagesSendText(threadId, t);
      } else {
        await sendTextMessage(user, threadId, t, langUk);
      }
      reload();
    } catch (e) {
      Alert.alert('', e?.message || 'Error');
    }
  };

  const onAcceptRequest = async () => {
    setAcceptBusy(true);
    try {
      await messagesAcceptThread(threadId);
      setPendingForMe(false);
      reload();
    } catch (e) {
      Alert.alert('', e?.message || 'Error');
    } finally {
      setAcceptBusy(false);
    }
  };

  const routeThumb = (regionId) => {
    try {
      const r = getRegion(regionId || 'kyiv');
      const lm = r?.landmarks?.[0];
      return lm?.thumb || null;
    } catch {
      return null;
    }
  };

  const renderMessage = useCallback(
    ({ item }) => {
      const mine = item.fromMe;
      if (item.type === 'route' && item.routeCard) {
        const thumb = routeThumb(item.routeCard.regionId);
        return (
          <View style={[styles.bubbleRow, mine ? styles.rowEnd : styles.rowStart]}>
            {!mine ? (
              <View style={[styles.tinyAvatar, { backgroundColor: 'rgba(255,255,255,0.25)' }]} />
            ) : null}
            <View style={styles.routeCard}>
              {thumb ? (
                <Image source={thumb} style={styles.routeImg} resizeMode="cover" />
              ) : (
                <View style={[styles.routeImg, { backgroundColor: '#333' }]} />
              )}
              <View style={styles.routeOverlay}>
                <Text style={styles.routeOverlayName}>{item.routeCard.subtitle}</Text>
                <Text style={styles.routeOverlayTitle}>{item.routeCard.title}</Text>
              </View>
              <Pressable
                style={styles.routeBtn}
                onPress={() =>
                  navigation.navigate(HOME_TAB_ROUTE, {
                    ...shell,
                    tabIndex: HOME_TAB.MAP,
                    routeFinderExtras: { initialPlace: item.routeCard.title },
                  })
                }
              >
            <Text style={styles.routeBtnText}>{st(language, 'routeCta')}</Text>
            <Ionicons name="arrow-forward" size={18} color="#1E1E1E" style={{ marginLeft: 8 }} />
              </Pressable>
            </View>
          </View>
        );
      }
      if (item.type === 'image' && item.imageUri) {
        return (
          <View style={[styles.bubbleRow, mine ? styles.rowEnd : styles.rowStart]}>
            {!mine ? (
              <View style={[styles.tinyAvatar, { backgroundColor: 'rgba(255,255,255,0.25)' }]} />
            ) : null}
            <Image source={{ uri: item.imageUri }} style={styles.chatImage} resizeMode="cover" />
          </View>
        );
      }
      return (
        <View style={[styles.bubbleRow, mine ? styles.rowEnd : styles.rowStart]}>
          {!mine ? (
            <View style={[styles.tinyAvatar, { backgroundColor: 'rgba(255,255,255,0.25)' }]} />
          ) : null}
          <View
            style={[
              styles.bubble,
              {
                backgroundColor: mine ? outgoingBg : incomingBg,
                borderTopLeftRadius: mine ? 16 : 4,
                borderTopRightRadius: mine ? 4 : 16,
              },
            ]}
          >
            <Text style={[styles.bubbleText, { color: mine ? (isLight ? '#FFFFFF' : '#101010') : textMain }]}>{item.text}</Text>
          </View>
        </View>
      );
    },
    [language, navigation, shell, isLight, textMain],
  );

  const pickPhoto = async () => {
    setMenuOpen(false);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!res.canceled && res.assets?.[0]?.uri) {
      if (useMessageApi) {
        try {
          const up = await feedUploadMediaFromUri(res.assets[0].uri);
          if (!up?.url) throw new Error('upload');
          await messagesSendText(threadId, up.url);
          reload();
        } catch (e) {
          Alert.alert('', e?.message || 'Error');
        }
      } else {
        await sendImageMessage(user, threadId, res.assets[0].uri, langUk);
        reload();
      }
    }
  };

  const shareLocation = async () => {
    setMenuOpen(false);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('', st(language, 'needLocation'));
      return;
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const { latitude, longitude } = pos.coords;
    const mapsLink = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    const content = `📍 ${latitude.toFixed(5)}, ${longitude.toFixed(5)}\n${mapsLink}`;
    if (useMessageApi) {
      await messagesSendText(threadId, content);
    } else {
      await sendTextMessage(user, threadId, content, langUk);
    }
    Linking.openURL(
      mapsLink,
    ).catch(() => {});
    reload();
    Alert.alert('', st(language, 'locationShared'));
  };

  const shareSavedRoute = async () => {
    setMenuOpen(false);
    if (!useMessageApi || !threadId) return;
    try {
      const list = await getSavedRoutes();
      if (!list.length) {
        Alert.alert('', pf(language, 'noSavedRoutes'));
        return;
      }
      const maxBtns = Platform.OS === 'ios' ? 6 : 3;
      const slice = list.slice(0, maxBtns);
      const sendOne = async (entry) => {
        try {
          const stripped = stripRoutePlanForStorage(entry.routePlan);
          const payload = JSON.stringify({
            type: 'kraina_saved_route',
            title: entry.titleHint || 'Route',
            plan: stripped,
          });
          const msg = payload.length > 4000 ? payload.slice(0, 4000) : payload;
          await messagesSendText(threadId, msg);
          reload();
        } catch (e) {
          Alert.alert('', e?.message || 'Error');
        }
      };
      const buttons = slice.map((r, i) => ({
        text: String(r.titleHint || `Route ${i + 1}`).slice(0, 36),
        onPress: () => {
          void sendOne(r);
        },
      }));
      Alert.alert(pf(language, 'pickRouteToShare'), '', [
        ...buttons,
        { text: pf(language, 'cancel'), style: 'cancel' },
      ]);
    } catch (e) {
      Alert.alert('', e?.message || 'Error');
    }
  };

  const shareContact = async () => {
    setMenuOpen(false);
    try {
      await Share.share({ message: `${peerName}\n(KRAÏNA)` });
    } catch {
      /* */
    }
  };

  const confirmDeleteChat = () => {
    setMenuOpen(false);
    if (useMessageApi) {
      Alert.alert('', st(language, 'apiMediaSoon'));
      return;
    }
    Alert.alert('', st(language, 'deleteThreadConfirm'), [
      { text: pf(language, 'cancel'), style: 'cancel' },
      {
        text: st(language, 'delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteThread(user, threadId, langUk);
          navigation.goBack();
        },
      },
    ]);
  };

  const clearHistory = async () => {
    setMenuOpen(false);
    if (useMessageApi) {
      Alert.alert('', st(language, 'apiMediaSoon'));
      return;
    }
    await deleteChatHistory(user, threadId, langUk);
    reload();
    Alert.alert('', st(language, 'chatCleared'));
  };

  return (
    <View style={[styles.screen, { backgroundColor: bg }]}>
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + 8,
            borderBottomColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)',
            backgroundColor: bg,
          },
        ]}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.circleBtn}>
          <Ionicons name="chevron-back" size={24} color={textMain} />
        </Pressable>
        <View style={styles.topCenter}>
          {peerAvatarUrl ? (
            <Image source={{ uri: peerAvatarUrl }} style={styles.headAvatar} resizeMode="cover" />
          ) : (
            <View style={[styles.headAvatar, { backgroundColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)' }]} />
          )}
          <Text style={[styles.topTitle, { color: textMain }]} numberOfLines={1}>
            {peerName}
          </Text>
        </View>
        <Pressable onPress={() => setMenuOpen(true)} hitSlop={12} style={styles.circleBtn}>
          <Ionicons name="ellipsis-vertical" size={20} color={textMain} />
        </Pressable>
      </View>

      {useMessageApi && pendingForMe ? (
        <View
          style={[
            styles.requestBanner,
            { backgroundColor: isLight ? 'rgba(225,255,0,0.25)' : 'rgba(225,255,0,0.12)' },
          ]}
        >
          <Text style={[styles.requestBannerText, { color: textMain }]}>{st(language, 'requestBanner')}</Text>
          <Pressable
            onPress={onAcceptRequest}
            disabled={acceptBusy}
            style={({ pressed }) => [
              styles.acceptBtn,
              { backgroundColor: accent, opacity: acceptBusy ? 0.6 : pressed ? 0.9 : 1 },
            ]}
          >
            <Text style={[styles.acceptBtnText, { color: '#1E1E1E' }]}>{st(language, 'acceptRequest')}</Text>
          </Pressable>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingTop: 12,
            paddingBottom: 12,
          }}
          onContentSizeChange={scrollEnd}
          ListEmptyComponent={
            <Text style={{ color: textMain, opacity: 0.5, textAlign: 'center', marginTop: 24 }}>
              —
            </Text>
          }
        />

        <View
          style={[
            styles.inputBar,
            {
              paddingBottom: Math.max(insets.bottom, 10) + lightTabBarExtraScrollPadding(),
              backgroundColor: isLight ? 'rgba(255,255,255,0.88)' : '#161619',
            },
          ]}
        >
          <Pressable
            onPress={() => setMenuOpen(true)}
            style={[
              styles.attachBtn,
              { backgroundColor: isLight ? 'rgba(2,18,235,0.08)' : 'rgba(225,255,0,0.12)' },
            ]}
            android_ripple={ripple}
          >
            <Ionicons name="add" size={22} color={isLight ? '#0212EB' : '#E1FF00'} />
          </Pressable>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={st(language, 'write')}
            placeholderTextColor={isLight ? '#888' : '#8E8E93'}
            style={[
              styles.input,
              {
                color: textMain,
                backgroundColor: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.12)',
                borderColor: isLight ? 'rgba(2,18,235,0.14)' : 'rgba(255,255,255,0.14)',
              },
            ]}
            multiline
            editable
            blurOnSubmit={false}
            textAlignVertical="center"
            accessibilityLabel={st(language, 'write')}
          />
          <Pressable
            onPress={onSend}
            style={[styles.sendFab, { backgroundColor: accent, marginLeft: 10 }]}
            android_ripple={ripple}
          >
            <Ionicons name="arrow-forward" size={22} color={onAccentButtonText(isLight)} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalDim} onPress={() => setMenuOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.sheetTitle}>{st(language, 'parameters')}</Text>
          <Pressable style={styles.sheetRow} onPress={pickPhoto}>
            <Ionicons name="camera-outline" size={22} color="#FFF" style={{ marginRight: 14 }} />
            <Text style={styles.sheetRowText}>{st(language, 'sendPhoto')}</Text>
          </Pressable>
          <Pressable
            style={styles.sheetRow}
            onPress={() => {
              setMenuOpen(false);
              const uname = String(peerName || '').replace(/^@/, '').trim();
              if (!uname) {
                Alert.alert('', st(language, 'profileSoon'));
                return;
              }
              navigation.navigate('SocialUserProfile', {
                ...shell,
                username: uname,
              });
            }}
          >
            <Ionicons name="person-outline" size={22} color="#FFF" style={{ marginRight: 14 }} />
            <Text style={styles.sheetRowText}>{st(language, 'viewProfile')}</Text>
          </Pressable>
          <Pressable style={styles.sheetRow} onPress={shareContact}>
            <Ionicons name="share-outline" size={22} color="#FFF" style={{ marginRight: 14 }} />
            <Text style={styles.sheetRowText}>{st(language, 'shareContact')}</Text>
          </Pressable>
          <Pressable style={styles.sheetRow} onPress={shareLocation}>
            <Ionicons name="location-outline" size={22} color="#FFF" style={{ marginRight: 14 }} />
            <Text style={styles.sheetRowText}>{st(language, 'shareLocation')}</Text>
          </Pressable>
          {useMessageApi ? (
            <Pressable style={styles.sheetRow} onPress={shareSavedRoute}>
              <Ionicons name="map-outline" size={22} color="#FFF" style={{ marginRight: 14 }} />
              <Text style={styles.sheetRowText}>{pf(language, 'shareRouteInChat')}</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.sheetRow} onPress={clearHistory}>
            <Ionicons name="trash-outline" size={22} color="#FF8A80" style={{ marginRight: 14 }} />
            <Text style={[styles.sheetRowText, { color: '#FF8A80' }]}>{st(language, 'clearMessages')}</Text>
          </Pressable>
          <Pressable style={styles.sheetRow} onPress={confirmDeleteChat}>
            <Ionicons name="trash-outline" size={22} color="#FF5252" style={{ marginRight: 14 }} />
            <Text style={[styles.sheetRowText, { color: '#FF5252' }]}>{st(language, 'deleteChat')}</Text>
          </Pressable>
        </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topCenter: { flex: 1, alignItems: 'center' },
  headAvatar: { width: 36, height: 36, borderRadius: 18, marginBottom: 4 },
  topTitle: { fontSize: 15, fontWeight: '700', maxWidth: '85%', textAlign: 'center' },
  requestBanner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  requestBannerText: { fontSize: 13, lineHeight: 18, marginBottom: 10 },
  acceptBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  acceptBtnText: { fontSize: 15, fontWeight: '800' },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 10,
    maxWidth: '100%',
  },
  rowStart: { justifyContent: 'flex-start' },
  rowEnd: { justifyContent: 'flex-end' },
  tinyAvatar: { width: 28, height: 28, borderRadius: 14, marginRight: 6 },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleText: { fontSize: 16, lineHeight: 22 },
  routeCard: {
    maxWidth: '85%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  routeImg: { width: '100%', height: 140, backgroundColor: '#222' },
  routeOverlay: {
    position: 'absolute',
    left: 12,
    top: 12,
    right: 12,
  },
  routeOverlayName: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  routeOverlayTitle: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  routeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    paddingVertical: 12,
  },
  routeBtnText: { fontSize: 16, fontWeight: '700', color: '#1E1E1E' },
  chatImage: { width: 220, height: 160, borderRadius: 12 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  attachBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 3,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  sendFab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: '#2C2C2E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  sheetTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  sheetRowText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});

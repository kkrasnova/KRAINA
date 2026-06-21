import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { FlashList } from '@shopify/flash-list';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Image,
  Modal,
  Platform,
  Alert,
  KeyboardAvoidingView,
  Share,
  PanResponder,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import {
  createAudioPlayer,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  APP_PLAYBACK_AUDIO_MODE,
  configureBackgroundMusicFriendlyAudio,
  VOICE_RECORDING_AUDIO_MODE,
} from './audioSession';
import { appLangBase } from './appLang';
import { useSyncedAppLanguage } from './useAppLanguage';

import { RenderProfiler } from './performanceMetrics';
import { runAfterInteractions } from './runAfterInteractions';
import { st } from './chatsI18n';
import { accentForTheme } from './themeAccent';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import {
  getThreadById,
  markThreadRead,
  sendTextMessage,
  sendImageMessage,
  sendVoiceMessage,
  deleteThread,
  deleteChatHistory,
} from './chatService';
import {
  messagesListMessages,
  messagesSendText,
  messagesMarkRead,
  messagesAcceptThread,
  messagesListThreads,
  messagesClearThread,
  messagesDeleteThread,
  messagesUploadVoice,
} from './messageApi';
import { initChatPushNotifications, teardownChatPushNotifications } from './chatPushService';
import { feedUploadMediaFromUri } from './feedApi';
import { HOME_TAB_ROUTE, HOME_TAB } from './homeTabPagerConstants';
import { getRegion } from './routeRegionsData';
import { getSavedRoutes, stripRoutePlanForStorage } from './profileStorage';
import { pf } from './profileI18n';
import { errorToUserText } from './errorText';
import { readThreadCache, threadCacheKey, writeThreadCache } from './chatThreadCache';
import {
  isValidPeerAvatarUri,
  peerAvatarUriFromMeta,
  peerDisplayNameFromMeta,
  peerUsernameFromMeta,
} from './chatPeerDisplay';
import { formatVoiceDuration, mapBackendMessage } from './chatMessageTypes';

/** Instagram DM */
const IG_SCREEN_LIGHT = '#FFFFFF';
const IG_SCREEN_DARK = '#000000';
const IG_BLUE = '#0095F6';
const IG_INCOMING_LIGHT = '#EFEFEF';
const IG_INCOMING_DARK = '#262626';
const IG_INCOMING_TEXT_LIGHT = '#101010';
const IG_INCOMING_TEXT_DARK = '#FFFFFF';
const IG_INPUT_BG_LIGHT = '#EFEFEF';
const IG_INPUT_BG_DARK = '#262626';
const IG_BAR_BG_LIGHT = '#FFFFFF';
const IG_BAR_BG_DARK = '#000000';
const BUBBLE_RADIUS = 22;
const BUBBLE_RADIUS_STACK = 4;
const MIN_VOICE_MS = 600;
const VOICE_SPEEDS = [1, 1.5, 2];

function formatVoiceClock(totalSec) {
  const sec = Math.max(0, Math.floor(Number(totalSec) || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`;
}

function VoiceMessageBubble({
  item,
  mine,
  group,
  avatarNode,
  outgoingBg,
  incomingBg,
  incomingText,
  isActive,
  playState,
  playbackRate,
  onTogglePlay,
  onSeek,
  onCycleRate,
}) {
  const trackWidthRef = useRef(0);
  const durationSec = Math.max(
    playState?.durationSec || 0,
    (Number(item.durationMs) || 0) / 1000,
    1,
  );
  const currentSec = isActive ? playState?.currentSec || 0 : 0;
  const progress = Math.min(1, currentSec / durationSec);
  const tint = mine ? '#FFFFFF' : incomingText;
  const bg = mine ? outgoingBg : incomingBg;
  const playing = isActive && !!playState?.playing;

  return (
    <View
      style={[
        styles.bubbleRow,
        mine ? styles.rowEnd : styles.rowStart,
        { marginBottom: group.marginBottom },
      ]}
    >
      {!mine ? avatarNode : null}
      <View
        style={[
          styles.voiceBubble,
          igBubbleRadii(mine, group.isFirstInGroup, group.isLastInGroup),
          { backgroundColor: bg, opacity: item.optimistic || item.uploading ? 0.72 : 1 },
        ]}
      >
        <Pressable
          onPress={onTogglePlay}
          style={styles.voicePlayBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voice"
        >
          <Ionicons name={playing ? 'pause' : 'play'} size={18} color={tint} />
        </Pressable>
        <View style={styles.voiceTrackWrap}>
          <Pressable
            style={styles.voiceTrack}
            onLayout={(e) => {
              trackWidthRef.current = e.nativeEvent.layout.width;
            }}
            onPress={(e) => {
              const w = trackWidthRef.current || 1;
              onSeek(Math.max(0, Math.min(1, e.nativeEvent.locationX / w)));
            }}
          >
            <View
              style={[
                styles.voiceTrackBg,
                { backgroundColor: mine ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.14)' },
              ]}
            />
            <View
              style={[
                styles.voiceTrackFill,
                { width: `${progress * 100}%`, backgroundColor: tint },
              ]}
            />
          </Pressable>
          <View style={styles.voiceTimeRow}>
            <Text style={[styles.voiceTimeText, { color: tint }]}>
              {formatVoiceClock(currentSec)}
            </Text>
            <Text style={[styles.voiceTimeText, { color: tint, opacity: 0.7 }]}>
              {formatVoiceClock(durationSec)}
            </Text>
          </View>
        </View>
        <Pressable onPress={onCycleRate} style={styles.voiceRateBtn} hitSlop={6}>
          <Text style={[styles.voiceRateText, { color: tint }]}>
            {playbackRate === 1 ? '1x' : `${playbackRate}x`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function igBubbleRadii(mine, isFirstInGroup, isLastInGroup) {
  if (mine) {
    return {
      borderTopLeftRadius: BUBBLE_RADIUS,
      borderTopRightRadius: isFirstInGroup ? BUBBLE_RADIUS : BUBBLE_RADIUS_STACK,
      borderBottomLeftRadius: BUBBLE_RADIUS,
      borderBottomRightRadius: isLastInGroup ? BUBBLE_RADIUS : BUBBLE_RADIUS_STACK,
    };
  }
  return {
    borderTopLeftRadius: isFirstInGroup ? BUBBLE_RADIUS : BUBBLE_RADIUS_STACK,
    borderTopRightRadius: BUBBLE_RADIUS,
    borderBottomLeftRadius: isLastInGroup ? BUBBLE_RADIUS : BUBBLE_RADIUS_STACK,
    borderBottomRightRadius: BUBBLE_RADIUS,
  };
}

function messageGroupMeta(list, index) {
  const item = list[index];
  const prev = index > 0 ? list[index - 1] : null;
  const next = index < list.length - 1 ? list[index + 1] : null;
  const sameSender = (a, b) => a && b && a.fromMe === b.fromMe;
  const textStack = (a, b) => sameSender(a, b) && a.type === 'text' && b.type === 'text';
  const samePrev = textStack(prev, item);
  const sameNext = textStack(item, next);
  return {
    isFirstInGroup: !samePrev,
    isLastInGroup: !sameNext,
    showAvatar: !item.fromMe && !textStack(item, next),
    marginBottom: sameNext ? 2 : 10,
  };
}

function ChatPeerAvatar({ uri, size, isLight, style }) {
  const dim = { width: size, height: size, borderRadius: size / 2 };
  if (isValidPeerAvatarUri(uri)) {
    return <Image source={{ uri }} style={[dim, style]} resizeMode="cover" />;
  }
  return (
    <View
      style={[
        dim,
        styles.peerAvatarFallback,
        { backgroundColor: isLight ? '#D1D1D6' : '#3A3A3C' },
        style,
      ]}
    >
      <Ionicons name="person" size={Math.round(size * 0.48)} color={isLight ? '#8E8E93' : '#AEAEB2'} />
    </View>
  );
}

function applyPeerMeta(setters, meta) {
  const displayName = peerDisplayNameFromMeta(meta);
  const username = peerUsernameFromMeta(meta);
  const avatarUrl = peerAvatarUriFromMeta(meta) || '';
  setters.setPeerDisplayName(displayName);
  setters.setPeerUsername(username);
  setters.setPeerName(username || displayName);
  setters.setPeerAvatarUrl(avatarUrl);
  return { displayName, username, avatarUrl };
}

export default function ChatThreadPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const langUk = language.split(/[-_]/)[0].toLowerCase() === 'uk';
  const user = route?.params?.user;
  const threadId = route?.params?.threadId;
  const cacheKey = threadCacheKey(threadId, route?.params?.useMessageApi === true);
  const initialCache = readThreadCache(cacheKey);
  const routePeerMeta = {
    peer_display_name: route?.params?.peerDisplayName,
    peer_username: route?.params?.peerUsername || route?.params?.peerName,
    peer_avatar_url: route?.params?.peerAvatarUrl,
    peerName: route?.params?.peerName,
  };
  const [peerDisplayName, setPeerDisplayName] = useState(
    route?.params?.peerDisplayName ||
      initialCache?.peerDisplayName ||
      peerDisplayNameFromMeta(routePeerMeta),
  );
  const [peerUsername, setPeerUsername] = useState(
    route?.params?.peerUsername ||
      initialCache?.peerUsername ||
      peerUsernameFromMeta(routePeerMeta),
  );
  const [peerName, setPeerName] = useState(
    peerUsername || route?.params?.peerName || initialCache?.peerName || '',
  );
  const [peerAvatarUrl, setPeerAvatarUrl] = useState(
    route?.params?.peerAvatarUrl || initialCache?.peerAvatarUrl || '',
  );
  const [peerUserId, setPeerUserId] = useState(route?.params?.peerUserId || '');
  const useMessageApi = route?.params?.useMessageApi === true;
  const [appTheme, setAppTheme] = useState(route?.params?.appTheme || 'dark');
  const [thread, setThread] = useState(() =>
    initialCache?.messages?.length ? { messages: initialCache.messages } : null,
  );
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingForMe, setPendingForMe] = useState(
    route?.params?.pendingForMe === true || initialCache?.pendingForMe === true,
  );
  const [acceptBusy, setAcceptBusy] = useState(false);
  const listRef = useRef(null);
  const voiceRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(voiceRecorder, 200);
  const voicePlayerRef = useRef(null);
  const voiceRatesRef = useRef({});
  const [playingVoiceId, setPlayingVoiceId] = useState(null);
  const [voicePlayState, setVoicePlayState] = useState(null);
  const [voiceRates, setVoiceRates] = useState({});
  const recordingBusyRef = useRef(false);
  const voiceUploadingRef = useRef(false);
  const pendingVoiceIdRef = useRef(null);
  const voiceRecordingRef = useRef(false);
  const isRecordingVoice = recorderState.isRecording;
  const [voiceUploading, setVoiceUploading] = useState(false);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const closeMenuRef = useRef(closeMenu);
  useEffect(() => {
    closeMenuRef.current = closeMenu;
  }, [closeMenu]);

  const runMenuAction = useCallback(
    (action) => {
      closeMenu();
      runAfterInteractions(() => {
        void Promise.resolve(action()).catch((e) => {
          Alert.alert('', errorToUserText(e, language));
        });
      });
    },
    [closeMenu, language],
  );

  const menuSheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) =>
          g.dy > 10 && g.dy > Math.abs(g.dx) * 1.05,
        onMoveShouldSetPanResponderCapture: (_, g) =>
          g.dy > 16 && g.dy > Math.abs(g.dx) * 1.12,
        onPanResponderTerminationRequest: () => true,
        onPanResponderRelease: (_, g) => {
          if (g.dy > 52 || g.vy > 0.3) {
            closeMenuRef.current();
          }
        },
      }),
    [],
  );

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
          messagesListThreads('inbox', langUk).catch(() => []),
          messagesListThreads('requests', langUk).catch(() => []),
        ]);
        const allThreads = [...(Array.isArray(inbox) ? inbox : []), ...(Array.isArray(requests) ? requests : [])];
        const meta = allThreads.find((row) => String(row.id) === String(threadId));
        let nextPending = pendingForMe;
        let peerSnapshot = {
          displayName: peerDisplayName,
          username: peerUsername,
          avatarUrl: peerAvatarUrl,
        };
        if (meta) {
          nextPending = !!meta.pending_for_me;
          setPendingForMe(nextPending);
          if (meta.peer_user_id) setPeerUserId(String(meta.peer_user_id));
          peerSnapshot = applyPeerMeta(
            {
              setPeerDisplayName,
              setPeerUsername,
              setPeerName,
              setPeerAvatarUrl,
            },
            meta,
          );
        }
        const msgs = await messagesListMessages(threadId);
        const mapped = msgs.map((m) => mapBackendMessage(m, language));
        const pendingVoiceId = pendingVoiceIdRef.current;
        const pendingVoice =
          pendingVoiceId &&
          (thread?.messages || []).find((m) => m.id === pendingVoiceId && m.optimistic);
        const merged = pendingVoice
          ? [...mapped.filter((m) => m.id !== pendingVoiceId), pendingVoice]
          : mapped;
        setThread({ messages: merged });
        writeThreadCache(cacheKey, {
          messages: merged,
          peerName: peerSnapshot.username || peerSnapshot.displayName,
          peerDisplayName: peerSnapshot.displayName,
          peerUsername: peerSnapshot.username,
          peerAvatarUrl: peerSnapshot.avatarUrl,
          pendingForMe: nextPending,
        });
        void messagesMarkRead(threadId);
      } catch (e) {
        if (__DEV__) console.warn('[ChatThread] api messages', e?.message);
        if (!thread?.messages?.length) setThread({ messages: [] });
      }
    } else {
      const th = await getThreadById(user, threadId, langUk);
      setThread(th);
      if (th) {
        const peerSnapshot = applyPeerMeta(
          {
            setPeerDisplayName,
            setPeerUsername,
            setPeerName,
            setPeerAvatarUrl,
          },
          {
            peer_display_name: th.peerDisplayName || th.peerName,
            peer_username: th.peerUsername || th.peerName,
            peer_avatar_url: th.peerAvatarUri,
          },
        );
        if (th.messages) {
          writeThreadCache(cacheKey, {
            messages: th.messages,
            peerName: peerSnapshot.username || peerSnapshot.displayName,
            peerDisplayName: peerSnapshot.displayName,
            peerUsername: peerSnapshot.username,
            peerAvatarUrl: peerSnapshot.avatarUrl,
            pendingForMe,
          });
        }
      }
    }
  }, [user, threadId, langUk, useMessageApi, language, cacheKey, peerDisplayName, peerUsername, peerAvatarUrl, pendingForMe, thread?.messages?.length]);

  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useFocusEffect(
    useCallback(() => {
      reloadRef.current();
      if (!useMessageApi) void markThreadRead(user, threadId, langUk);
      void (async () => {
        try {
          /** Запитуємо дозвіл мікрофона ЗАВЧАСНО — щоб системний діалог
           *  не з'являвся під час утримування кнопки запису. */
          await requestRecordingPermissionsAsync();
        } catch (e) {
          if (__DEV__) console.warn('[ChatThread] mic permission', e?.message);
        }
      })();
      if (useMessageApi) {
        const timer = setInterval(() => {
          if (!voiceUploadingRef.current) reloadRef.current();
        }, 3000);
        return () => clearInterval(timer);
      }
      return undefined;
    }, [user, threadId, langUk, useMessageApi, voiceRecorder]),
  );

  const isLight = appTheme === 'light';
  const accent = accentForTheme(isLight);
  const ripple = isLight ? rippleOnLightSurface : rippleOnDarkSurface;
  const bg = isLight ? IG_SCREEN_LIGHT : IG_SCREEN_DARK;
  const textMain = isLight ? '#1E1E1E' : '#FFFFFF';
  const incomingBg = isLight ? IG_INCOMING_LIGHT : IG_INCOMING_DARK;
  const incomingText = isLight ? IG_INCOMING_TEXT_LIGHT : IG_INCOMING_TEXT_DARK;
  const outgoingBg = IG_BLUE;
  const canSend = draft.trim().length > 0 && !sending;

  const messages = thread?.messages || [];

  const scrollEnd = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  const prevMessageCount = useRef(0);
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      scrollEnd();
    }
    prevMessageCount.current = messages.length;
  }, [messages.length, scrollEnd]);

  useEffect(() => {
    if (useMessageApi && threadId) {
      initChatPushNotifications((tId) => {
        navigation.navigate('ChatThread', {
          ...shell,
          threadId: tId,
          useMessageApi: true,
        });
      }).catch(() => {});
    }
    return () => {
      teardownChatPushNotifications();
    };
  }, [useMessageApi, threadId]);

  useEffect(
    () => () => {
      voicePlayerRef.current?.remove?.();
      voicePlayerRef.current = null;
    },
    [],
  );

  useEffect(() => {
    voiceRatesRef.current = voiceRates;
  }, [voiceRates]);

  const ensureVoicePlayer = useCallback(() => {
    if (!voicePlayerRef.current) {
      const player = createAudioPlayer(null);
      player.addListener?.('playbackStatusUpdate', (status) => {
        setVoicePlayState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            currentSec: status.currentTime || 0,
            durationSec: status.duration || prev.durationSec,
            playing: !!status.playing,
          };
        });
        if (status.didJustFinish) {
          setVoicePlayState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              playing: false,
              currentSec: status.duration || prev.durationSec || prev.currentSec,
            };
          });
        }
      });
      voicePlayerRef.current = player;
    }
    return voicePlayerRef.current;
  }, []);

  const playVoiceMessage = useCallback(
    async (messageId, uri, durationMs) => {
      const src = String(uri || '').trim();
      if (!src) return;
      const durationSec = Math.max(1, (Number(durationMs) || 0) / 1000);
      try {
        await setAudioModeAsync(APP_PLAYBACK_AUDIO_MODE);
        const player = ensureVoicePlayer();
        const rate = voiceRatesRef.current[messageId] || 1;

        if (playingVoiceId === messageId) {
          if (voicePlayState?.playing) {
            player.pause?.();
            setVoicePlayState((prev) => (prev ? { ...prev, playing: false } : prev));
            return;
          }
          const currentSec = voicePlayState?.currentSec || 0;
          const atEnd = currentSec >= durationSec - 0.2;
          if (atEnd) {
            await player.seekTo?.(0);
          }
          player.setPlaybackRate?.(rate);
          await player.play?.();
          setVoicePlayState({
            id: messageId,
            currentSec: atEnd ? 0 : currentSec,
            durationSec,
            playing: true,
          });
          return;
        }

        if (playingVoiceId) {
          player.pause?.();
        }
        player.replace?.(src);
        player.setPlaybackRate?.(rate);
        await player.seekTo?.(0);
        await player.play?.();
        setPlayingVoiceId(messageId);
        setVoicePlayState({
          id: messageId,
          currentSec: 0,
          durationSec,
          playing: true,
        });
      } catch (e) {
        if (__DEV__) console.warn('[ChatThread] voice play', e?.message);
      }
    },
    [ensureVoicePlayer, playingVoiceId, voicePlayState?.playing, voicePlayState?.currentSec],
  );

  const seekVoiceMessage = useCallback(
    (messageId, uri, durationMs, ratio) => {
      const src = String(uri || '').trim();
      if (!src) return;
      const durationSec = Math.max(1, (Number(durationMs) || 0) / 1000);
      const seekSec = Math.max(0, Math.min(durationSec, ratio * durationSec));
      try {
        const player = ensureVoicePlayer();
        const rate = voiceRatesRef.current[messageId] || 1;
        if (playingVoiceId !== messageId) {
          player.replace?.(src);
          player.setPlaybackRate?.(rate);
          setPlayingVoiceId(messageId);
        }
        player.seekTo?.(seekSec);
        if (!voicePlayState?.playing || playingVoiceId !== messageId) {
          player.play?.();
        }
        setVoicePlayState({
          id: messageId,
          currentSec: seekSec,
          durationSec,
          playing: true,
        });
      } catch (e) {
        if (__DEV__) console.warn('[ChatThread] voice seek', e?.message);
      }
    },
    [ensureVoicePlayer, playingVoiceId, voicePlayState?.playing],
  );

  const cycleVoiceRate = useCallback(
    (messageId) => {
      const cur = voiceRatesRef.current[messageId] || 1;
      const idx = VOICE_SPEEDS.indexOf(cur);
      const next = VOICE_SPEEDS[(idx >= 0 ? idx + 1 : 0) % VOICE_SPEEDS.length];
      setVoiceRates((prev) => ({ ...prev, [messageId]: next }));
      if (playingVoiceId === messageId) {
        voicePlayerRef.current?.setPlaybackRate?.(next);
      }
    },
    [playingVoiceId],
  );

  const sendImageFromUri = useCallback(
    async (uri) => {
      if (!uri) return;
      if (useMessageApi) {
        const up = await feedUploadMediaFromUri(uri);
        if (!up?.url && !up?.media_url) throw new Error('upload');
        await messagesSendText(threadId, up.url || up.media_url);
        await reload();
        return;
      }
      const th = await sendImageMessage(user, threadId, uri, langUk);
      if (th) {
        setThread(th);
        writeThreadCache(cacheKey, {
          messages: th.messages || [],
          peerName: peerUsername || peerDisplayName,
          peerDisplayName,
          peerUsername,
          peerAvatarUrl,
          pendingForMe,
        });
      }
    },
    [
      useMessageApi,
      threadId,
      reload,
      user,
      langUk,
      cacheKey,
      peerUsername,
      peerDisplayName,
      peerAvatarUrl,
      pendingForMe,
    ],
  );

  const replaceVoiceOptimistic = useCallback(
    (optimisticId, nextMessage) => {
      pendingVoiceIdRef.current = null;
      setThread((prev) => {
        const list = (prev?.messages || []).filter((m) => m.id !== optimisticId);
        return { messages: [...list, nextMessage] };
      });
      writeThreadCache(cacheKey, {
        messages: [
          ...((readThreadCache(cacheKey)?.messages || []).filter((m) => m.id !== optimisticId)),
          nextMessage,
        ],
        peerName: peerUsername || peerDisplayName,
        peerDisplayName,
        peerUsername,
        peerAvatarUrl,
        pendingForMe,
      });
    },
    [cacheKey, peerUsername, peerDisplayName, peerAvatarUrl, pendingForMe],
  );

  const sendVoiceFromUri = useCallback(
    async (uri, durationMs, optimisticId) => {
      if (!uri) return;
      const duration = Math.max(0, Number(durationMs) || 0);
      if (useMessageApi) {
        let remoteUrl = null;
        try {
          remoteUrl = await messagesUploadVoice(uri);
        } catch (uploadErr) {
          if (__DEV__) console.warn('[ChatThread] backend voice upload', uploadErr?.message);
          const up = await feedUploadMediaFromUri(uri);
          remoteUrl = up?.url || up?.media_url || null;
        }
        if (!remoteUrl) throw new Error('upload');
        const payload = JSON.stringify({
          type: 'kraina_voice',
          url: remoteUrl,
          durationMs: duration,
        });
        const sent = await messagesSendText(threadId, payload);
        const mapped = mapBackendMessage(
          {
            id: sent?.id || `msg_${Date.now()}`,
            content: payload,
            sent_at: new Date().toISOString(),
            from_me: true,
          },
          language,
        );
        if (optimisticId) {
          replaceVoiceOptimistic(optimisticId, mapped);
        } else {
          setThread((prev) => ({ messages: [...(prev?.messages || []), mapped] }));
        }
        void messagesMarkRead(threadId);
        return mapped;
      }
      const th = await sendVoiceMessage(user, threadId, uri, duration, langUk);
      if (!th) return null;
      const saved = (th.messages || []).slice(-1)[0];
      if (optimisticId && saved) {
        replaceVoiceOptimistic(optimisticId, saved);
      } else {
        setThread(th);
        writeThreadCache(cacheKey, {
          messages: th.messages || [],
          peerName: peerUsername || peerDisplayName,
          peerDisplayName,
          peerUsername,
          peerAvatarUrl,
          pendingForMe,
        });
      }
      return saved;
    },
    [
      useMessageApi,
      threadId,
      language,
      user,
      langUk,
      cacheKey,
      peerUsername,
      peerDisplayName,
      peerAvatarUrl,
      pendingForMe,
      replaceVoiceOptimistic,
    ],
  );

  const onSend = async () => {
    const t = draft.trim();
    if (!t || sending) return;
    if (!useMessageApi) {
      Alert.alert('', st(language, 'needBackendLogin'));
      return;
    }
    setDraft('');
    const optimisticId = `opt_${Date.now()}`;
    const optimistic = {
      id: optimisticId,
      createdAt: Date.now(),
      fromMe: true,
      type: 'text',
      text: t,
      optimistic: true,
    };
    setThread((prev) => ({
      messages: [...(prev?.messages || []), optimistic],
    }));
    scrollEnd();
    setSending(true);
    try {
      if (useMessageApi) {
        await messagesSendText(threadId, t);
        await reload();
      } else {
        const th = await sendTextMessage(user, threadId, t, langUk);
        if (th) {
          setThread(th);
          writeThreadCache(cacheKey, {
            messages: th.messages || [],
            peerName: peerUsername || peerDisplayName,
            peerDisplayName,
            peerUsername,
            peerAvatarUrl,
            pendingForMe,
          });
        }
      }
    } catch (e) {
      setThread((prev) => ({
        messages: (prev?.messages || []).filter((m) => m.id !== optimisticId),
      }));
      setDraft(t);
      Alert.alert('', errorToUserText(e, language));
    } finally {
      setSending(false);
    }
  };

  const openPeerProfile = useCallback(() => {
    let uname = String(peerUsername || '').replace(/^@/, '').trim();
    if (!uname) {
      Alert.alert('', st(language, 'profileSoon'));
      return;
    }
    navigation.navigate('SocialUserProfile', {
      ...shell,
      username: uname,
    });
  }, [navigation, shell, peerUsername, threadId, language]);

  const onAcceptRequest = async () => {
    setAcceptBusy(true);
    try {
      await messagesAcceptThread(threadId);
      setPendingForMe(false);
      reload();
    } catch (e) {
      Alert.alert('', errorToUserText(e, language));
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
    ({ item, index }) => {
      const mine = item.fromMe;
      const group = messageGroupMeta(messages, index);
      const avatarNode = group.showAvatar ? (
        <ChatPeerAvatar uri={peerAvatarUrl} size={28} isLight={isLight} style={{ marginRight: 8 }} />
      ) : (
        <View style={styles.tinyAvatarSpacer} />
      );
      if (item.type === 'route' && item.routeCard) {
        const thumb = routeThumb(item.routeCard.regionId);
        return (
          <View
            style={[
              styles.bubbleRow,
              mine ? styles.rowEnd : styles.rowStart,
              { marginBottom: group.marginBottom },
            ]}
          >
            {!mine ? avatarNode : null}
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
              </Pressable>
            </View>
          </View>
        );
      }
      if (item.type === 'image' && item.imageUri) {
        return (
          <View
            style={[
              styles.bubbleRow,
              mine ? styles.rowEnd : styles.rowStart,
              { marginBottom: group.marginBottom },
            ]}
          >
            {!mine ? avatarNode : null}
            <Image source={{ uri: item.imageUri }} style={styles.chatImage} resizeMode="cover" />
          </View>
        );
      }
      if (item.type === 'voice' && item.voiceUri) {
        const isActive = playingVoiceId === item.id;
        return (
          <VoiceMessageBubble
            item={item}
            mine={mine}
            group={group}
            avatarNode={avatarNode}
            outgoingBg={outgoingBg}
            incomingBg={incomingBg}
            incomingText={incomingText}
            isActive={isActive}
            playState={isActive ? voicePlayState : null}
            playbackRate={voiceRates[item.id] || 1}
            onTogglePlay={() => playVoiceMessage(item.id, item.voiceUri, item.durationMs)}
            onSeek={(ratio) => seekVoiceMessage(item.id, item.voiceUri, item.durationMs, ratio)}
            onCycleRate={() => cycleVoiceRate(item.id)}
          />
        );
      }
      return (
        <View
          style={[
            styles.bubbleRow,
            mine ? styles.rowEnd : styles.rowStart,
            { marginBottom: group.marginBottom },
          ]}
        >
          {!mine ? avatarNode : null}
          <View
            style={[
              styles.bubble,
              igBubbleRadii(mine, group.isFirstInGroup, group.isLastInGroup),
              {
                backgroundColor: mine ? outgoingBg : incomingBg,
                opacity: item.optimistic ? 0.72 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.bubbleText,
                { color: mine ? '#FFFFFF' : incomingText },
              ]}
            >
              {item.text}
            </Text>
          </View>
        </View>
      );
    },
    [language, navigation, shell, isLight, peerAvatarUrl, peerDisplayName, outgoingBg, incomingBg, incomingText, messages, playingVoiceId, voicePlayState, voiceRates, playVoiceMessage, seekVoiceMessage, cycleVoiceRate],
  );

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('', st(language, 'openGallery'));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
    });
    if (!res.canceled && res.assets?.[0]?.uri) {
      await sendImageFromUri(res.assets[0].uri);
    }
  };

  const startVoiceRecording = useCallback(async () => {
    if (recordingBusyRef.current || voiceUploadingRef.current || voiceRecordingRef.current) return;
    recordingBusyRef.current = true;
    try {
      await setAudioModeAsync(VOICE_RECORDING_AUDIO_MODE);
      try {
        await voiceRecorder.prepareToRecordAsync();
      } catch {
        /* already prepared */
      }
      voiceRecordingRef.current = true;
      await voiceRecorder.record();
    } catch (e) {
      voiceRecordingRef.current = false;
      if (__DEV__) console.warn('[ChatThread] voice record start', e?.message);
      Alert.alert('', st(language, 'needMicPermission'));
    } finally {
      recordingBusyRef.current = false;
    }
  }, [voiceRecorder, language]);

  const finishVoiceRecording = useCallback(async () => {
    if (!voiceRecordingRef.current) return;
    voiceRecordingRef.current = false;
    const optimisticId = `vopt_${Date.now()}`;
    try {
      await voiceRecorder.stop();
      const status = voiceRecorder.getStatus?.() || recorderState;
      const uri = voiceRecorder.uri;
      const durationMs = status.durationMillis || recorderState.durationMillis || 0;
      if (!uri || durationMs < MIN_VOICE_MS) return;

      const optimistic = {
        id: optimisticId,
        createdAt: Date.now(),
        fromMe: true,
        type: 'voice',
        voiceUri: uri,
        durationMs,
        optimistic: true,
        uploading: true,
      };
      pendingVoiceIdRef.current = optimisticId;
      setThread((prev) => ({
        messages: [...(prev?.messages || []), optimistic],
      }));
      scrollEnd();

      voiceUploadingRef.current = true;
      setVoiceUploading(true);
      void sendVoiceFromUri(uri, durationMs, optimisticId)
        .then(() => scrollEnd())
        .catch((e) => {
          pendingVoiceIdRef.current = null;
          setThread((prev) => ({
            messages: (prev?.messages || []).filter((m) => m.id !== optimisticId),
          }));
          Alert.alert('', errorToUserText(e, language));
        })
        .finally(() => {
          voiceUploadingRef.current = false;
          setVoiceUploading(false);
          void configureBackgroundMusicFriendlyAudio().catch(() => {});
        });
    } catch (e) {
      Alert.alert('', errorToUserText(e, language));
    } finally {
      void configureBackgroundMusicFriendlyAudio().catch(() => {});
    }
  }, [
    voiceRecorder,
    recorderState,
    recorderState.durationMillis,
    sendVoiceFromUri,
    scrollEnd,
    language,
  ]);

  const shareLocation = async () => {
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
      const th = await sendTextMessage(user, threadId, content, langUk);
      if (th) setThread(th);
    }
    await reload();
    scrollEnd();
  };

  const shareSavedRoute = async () => {
    if (!useMessageApi || !threadId) return;
    const list = await getSavedRoutes();
    if (!list.length) {
      Alert.alert('', pf(language, 'noSavedRoutes'));
      return;
    }
    const maxBtns = Platform.OS === 'ios' ? 6 : 3;
    const slice = list.slice(0, maxBtns);
    const sendOne = async (entry) => {
      const stripped = stripRoutePlanForStorage(entry.routePlan);
      const payload = JSON.stringify({
        type: 'kraina_saved_route',
        title: entry.titleHint || 'Route',
        plan: stripped,
      });
      const msg = payload.length > 4000 ? payload.slice(0, 4000) : payload;
      await messagesSendText(threadId, msg);
      await reload();
      scrollEnd();
    };
    const buttons = slice.map((r, i) => ({
      text: String(r.titleHint || `Route ${i + 1}`).slice(0, 36),
      onPress: () => {
        void sendOne(r).catch((e) => Alert.alert('', errorToUserText(e, language)));
      },
    }));
    Alert.alert(pf(language, 'pickRouteToShare'), '', [
      ...buttons,
      { text: pf(language, 'cancel'), style: 'cancel' },
    ]);
  };

  const shareContact = async () => {
    const uname = String(peerUsername || peerName || '').replace(/^@/, '').trim();
    const lines = [
      peerDisplayName || peerName || '',
      uname ? `@${uname}` : '',
      'KRAÏNA',
    ].filter(Boolean);
    await Share.share({ message: lines.join('\n') });
  };

  const confirmDeleteChat = () => {
    Alert.alert('', st(language, 'deleteThreadConfirm'), [
      { text: pf(language, 'cancel'), style: 'cancel' },
      {
        text: st(language, 'delete'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              if (useMessageApi) {
                await messagesDeleteThread(threadId);
              } else {
                await deleteThread(user, threadId, langUk);
              }
              navigation.goBack();
            } catch (e) {
              Alert.alert('', errorToUserText(e, language));
            }
          })();
        },
      },
    ]);
  };

  const clearHistory = () => {
    Alert.alert('', st(language, 'clearMessagesConfirm'), [
      { text: pf(language, 'cancel'), style: 'cancel' },
      {
        text: st(language, 'clearMessages'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              if (useMessageApi) {
                await messagesClearThread(threadId);
                setThread({ messages: [] });
                writeThreadCache(cacheKey, {
                  messages: [],
                  peerName: peerUsername || peerDisplayName,
                  peerDisplayName,
                  peerUsername,
                  peerAvatarUrl,
                  pendingForMe,
                });
              } else {
                await deleteChatHistory(user, threadId, langUk);
                await reload();
              }
              Alert.alert('', st(language, 'chatCleared'));
            } catch (e) {
              Alert.alert('', errorToUserText(e, language));
            }
          })();
        },
      },
    ]);
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
        <Pressable
          onPress={openPeerProfile}
          style={styles.topCenter}
          accessibilityRole="button"
          accessibilityLabel={peerDisplayName}
        >
          <ChatPeerAvatar uri={peerAvatarUrl} size={36} isLight={isLight} style={styles.headAvatar} />
          <Text style={[styles.topTitle, { color: textMain }]} numberOfLines={1}>
            {peerDisplayName}
          </Text>
        </Pressable>
        {useMessageApi && peerUserId ? (
          <>
            <Pressable
              onPress={() =>
                navigation.navigate('Call', {
                  mode: 'outgoing',
                  peerUserId,
                  peerDisplayName,
                  peerAvatarUrl,
                  user,
                  language,
                })
              }
              hitSlop={12}
              style={styles.circleBtn}
            >
              <Ionicons name="call-outline" size={20} color={textMain} />
            </Pressable>
            <Pressable
              onPress={() =>
                navigation.navigate('Call', {
                  mode: 'outgoing',
                  isVideo: true,
                  peerUserId,
                  peerDisplayName,
                  peerAvatarUrl,
                  user,
                  language,
                })
              }
              hitSlop={12}
              style={styles.circleBtn}
            >
              <Ionicons name="videocam-outline" size={20} color={textMain} />
            </Pressable>
          </>
        ) : null}
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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 56 : 0}
      >
        <RenderProfiler id="ChatThreadPage">
        <FlashList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item, index }) => renderMessage({ item, index })}
          estimatedItemSize={90}
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
        </RenderProfiler>

        <View
          style={[
            styles.inputBar,
            {
              paddingBottom: Math.max(insets.bottom, 8),
              backgroundColor: isLight ? IG_BAR_BG_LIGHT : IG_BAR_BG_DARK,
              borderTopColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
            },
          ]}
        >
          {isRecordingVoice ? (
            <View style={styles.recordingRow}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>
                {st(language, 'recordingVoice')}{' '}
                {formatVoiceDuration(recorderState.durationMillis)}
              </Text>
            </View>
          ) : null}
          <View style={styles.inputBarRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={st(language, 'messagePlaceholder')}
              placeholderTextColor={isLight ? '#8E8E93' : '#8E8E93'}
              style={[
                styles.input,
                {
                  color: textMain,
                  backgroundColor: isLight ? IG_INPUT_BG_LIGHT : IG_INPUT_BG_DARK,
                },
              ]}
              multiline
              returnKeyType="send"
              submitBehavior="submit"
              enablesReturnKeyAutomatically
              editable={!sending && !isRecordingVoice}
              blurOnSubmit={false}
              textAlignVertical="center"
              accessibilityLabel={st(language, 'messagePlaceholder')}
              onSubmitEditing={() => {
                if (canSend) void onSend();
              }}
            />
            <Pressable
              onPressIn={startVoiceRecording}
              onPressOut={finishVoiceRecording}
              delayPressIn={0}
              disabled={voiceUploading}
              style={[
                styles.inputSideBtn,
                (isRecordingVoice || voiceUploading) && { backgroundColor: 'rgba(229,57,53,0.15)' },
              ]}
              android_ripple={ripple}
              accessibilityRole="button"
              accessibilityLabel={st(language, 'holdToRecord')}
            >
              <Ionicons
                name={isRecordingVoice || voiceUploading ? 'mic' : 'mic-outline'}
                size={24}
                color={isRecordingVoice || voiceUploading ? '#E53935' : textMain}
              />
            </Pressable>
            <Pressable
              onPress={pickFromGallery}
              disabled={sending || isRecordingVoice}
              style={styles.inputSideBtn}
              android_ripple={ripple}
              accessibilityRole="button"
              accessibilityLabel={st(language, 'openGallery')}
            >
              <Ionicons name="images-outline" size={24} color={textMain} />
            </Pressable>
            {canSend ? (
              <Pressable
                onPress={() => void onSend()}
                style={[styles.sendFab, { backgroundColor: IG_BLUE }]}
                android_ripple={ripple}
                accessibilityRole="button"
                accessibilityLabel={st(language, 'send')}
              >
                <Ionicons name="arrow-up" size={22} color="#FFFFFF" />
              </Pressable>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={closeMenu}>
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={closeMenu}
            accessibilityRole="button"
            accessibilityLabel={st(language, 'parameters')}
          />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandleWrap} {...menuSheetPanResponder.panHandlers}>
              <View style={styles.sheetHandle} />
            </View>
            <Text style={styles.sheetTitle}>{st(language, 'parameters')}</Text>
            <Pressable
              style={styles.sheetRow}
              onPress={() => runMenuAction(pickFromGallery)}
              android_ripple={rippleOnDarkSurface}
            >
              <Ionicons name="images-outline" size={22} color="#FFF" style={{ marginRight: 14 }} />
              <Text style={styles.sheetRowText}>{st(language, 'openGallery')}</Text>
            </Pressable>
            <Pressable
              style={styles.sheetRow}
              onPress={() => runMenuAction(openPeerProfile)}
              android_ripple={rippleOnDarkSurface}
            >
              <Ionicons name="person-outline" size={22} color="#FFF" style={{ marginRight: 14 }} />
              <Text style={styles.sheetRowText}>{st(language, 'viewProfile')}</Text>
            </Pressable>
            <Pressable
              style={styles.sheetRow}
              onPress={() => runMenuAction(shareContact)}
              android_ripple={rippleOnDarkSurface}
            >
              <Ionicons name="share-outline" size={22} color="#FFF" style={{ marginRight: 14 }} />
              <Text style={styles.sheetRowText}>{st(language, 'shareContact')}</Text>
            </Pressable>
            <Pressable
              style={styles.sheetRow}
              onPress={() => runMenuAction(shareLocation)}
              android_ripple={rippleOnDarkSurface}
            >
              <Ionicons name="location-outline" size={22} color="#FFF" style={{ marginRight: 14 }} />
              <Text style={styles.sheetRowText}>{st(language, 'shareLocation')}</Text>
            </Pressable>
            {useMessageApi ? (
              <Pressable
                style={styles.sheetRow}
                onPress={() => runMenuAction(shareSavedRoute)}
                android_ripple={rippleOnDarkSurface}
              >
                <Ionicons name="map-outline" size={22} color="#FFF" style={{ marginRight: 14 }} />
                <Text style={styles.sheetRowText}>{pf(language, 'shareRouteInChat')}</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={styles.sheetRow}
              onPress={() => runMenuAction(clearHistory)}
              android_ripple={rippleOnDarkSurface}
            >
              <Ionicons name="trash-outline" size={22} color="#FF8A80" style={{ marginRight: 14 }} />
              <Text style={[styles.sheetRowText, { color: '#FF8A80' }]}>{st(language, 'clearMessages')}</Text>
            </Pressable>
            <Pressable
              style={styles.sheetRow}
              onPress={() => runMenuAction(confirmDeleteChat)}
              android_ripple={rippleOnDarkSurface}
            >
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
  headAvatar: { marginBottom: 4 },
  peerAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    maxWidth: '100%',
    marginTop: 2,
  },
  rowStart: { justifyContent: 'flex-start' },
  rowEnd: { justifyContent: 'flex-end' },
  tinyAvatarSpacer: { width: 36 },
  bubble: {
    maxWidth: '76%',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  bubbleText: { fontSize: 15, lineHeight: 20 },
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
  voiceBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 220,
    maxWidth: 280,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  voicePlayBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceTrackWrap: {
    flex: 1,
    minWidth: 110,
  },
  voiceTrack: {
    height: 22,
    justifyContent: 'center',
  },
  voiceTrackBg: {
    height: 4,
    borderRadius: 2,
    width: '100%',
  },
  voiceTrackFill: {
    position: 'absolute',
    left: 0,
    height: 4,
    borderRadius: 2,
  },
  voiceTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  voiceTimeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  voiceRateBtn: {
    minWidth: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceRateText: {
    fontSize: 12,
    fontWeight: '700',
  },
  inputBar: {
    paddingHorizontal: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputBarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 6,
    gap: 8,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E53935',
  },
  recordingText: {
    color: '#E53935',
    fontSize: 13,
    fontWeight: '600',
  },
  inputSideBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 40,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
    marginHorizontal: 4,
    marginBottom: 2,
  },
  sendFab: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    marginLeft: 2,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: '#2C2C2E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  sheetHandleWrap: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginBottom: 10,
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

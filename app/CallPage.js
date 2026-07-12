/**
 * Audio/Video call screen.
 *
 * Incoming call — user sees accept / decline.
 * Outgoing / active call — user sees mute, speaker, end, and call duration.
 * Video mode — shows local & remote camera, flip camera, switch to audio.
 *
 * Relies on @livekit/react-native for WebRTC audio/video transport.
 * Native build (expo-dev-client / bare RN) is required.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  StatusBar,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ExpoAudio from 'expo-audio';
import { CALL_AUDIO_MODE, configureBackgroundMusicFriendlyAudio } from './audioSession';
import {
  callsGetStatus,
  callsInitiate,
  callsAccept,
  callsEnd,
  callsDecline,
} from './callApi';
import { st } from './chatsI18n';
import { useSyncedAppLanguage } from './useAppLanguage';
import { errorToUserText } from './errorText';
import ProfileAvatarCircle from './ProfileAvatarCircle';
import { resolveFeedMediaUrl } from './feedMediaUrl';

// LiveKit SDK — guarded import for when the native module isn't linked yet.
let LiveKit = null;
try {
  LiveKit = require('@livekit/react-native');
} catch {
  // native module not installed — calls UI will show a placeholder
}

// livekit-client Track enum — guarded import
let LKTrack = null;
try {
  LKTrack = require('livekit-client').Track;
} catch {
  /* livekit-client not installed */
}

const ACCENT = '#E1FF00';
const END_RED = '#E53935';
const BTN_GREEN = '#34C759';

// ---------------------------------------------------------------------------
// Inner component that lives inside <LiveKitRoom> and uses useTracks hook
// ---------------------------------------------------------------------------

function CallRoomContent({
  LiveKit,
  LKTrack,
  isCameraEnabled,
  peerDisplayName,
  peerAvatarUrl,
  formattedDuration,
  remoteConnected,
  callStatus,
  language,
  isMuted,
  isSpeaker,
  onEnd,
  onDecline,
  onAccept,
  toggleMute,
  toggleSpeaker,
  toggleCamera,
  switchCamera,
  insets,
}) {
  // This hook is unconditionally called but only meaningful when video is enabled.
  // It must be inside a <LiveKitRoom> context.
  const cameraTracks = LiveKit?.useTracks && LKTrack
    ? LiveKit.useTracks([LKTrack.Source.Camera])
    : [];

  const remoteTrack = cameraTracks.find((t) => !t.participant?.isLocal);
  const localTrack = cameraTracks.find((t) => t.participant?.isLocal);

  const showVideo = isCameraEnabled && LiveKit && LKTrack;

  return (
    <View style={styles.roomContentRoot}>
      {/* ---- Video area ---- */}
      {showVideo ? (
        <View style={styles.videoContainer}>
          {remoteTrack && LiveKit.isTrackReference(remoteTrack) ? (
            <LiveKit.VideoTrack
              trackRef={remoteTrack}
              style={styles.remoteVideo}
            />
          ) : (
            <View style={styles.waitingContainer}>
              <Ionicons name="videocam-outline" size={48} color="#444" />
              <Text style={styles.waitingText}>
                {st(language, 'callWaitingVideo')}
              </Text>
            </View>
          )}
          {localTrack && LiveKit.isTrackReference(localTrack) ? (
            <View style={styles.localVideoWrapper}>
              <LiveKit.VideoTrack
                trackRef={localTrack}
                style={styles.localVideo}
              />
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.header}>
          <ProfileAvatarCircle uri={resolveFeedMediaUrl(peerAvatarUrl)} size={96} isLight={false} style={styles.callAvatar} />
          <Text style={styles.peerName}>{peerDisplayName}</Text>
          <Text style={styles.statusText}>
            {callStatus === 'incoming'
              ? st(language, 'callIncoming')
              : callStatus === 'outgoing'
                ? st(language, 'callOutgoing')
                : formattedDuration}
          </Text>
          {remoteConnected && callStatus === 'active' ? (
            <Text style={styles.remoteIndicator}>
              {st(language, 'callConnected')}
            </Text>
          ) : null}
        </View>
      )}

      {/* ---- Status overlay when video is on ---- */}
      {showVideo ? (
        <View style={[styles.videoStatusOverlay, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.videoPeerName}>{peerDisplayName}</Text>
          <Text style={styles.videoStatusText}>
            {callStatus === 'active' ? formattedDuration : ''}
          </Text>
          {remoteConnected && callStatus === 'active' ? (
            <Text style={styles.remoteIndicator}>
              {st(language, 'callConnected')}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* ---- Controls ---- */}
      <View style={styles.controlsRow}>
        {callStatus === 'incoming' ? (
          <>
            <CallButton
              icon="close"
              label={st(language, 'callDecline')}
              color={END_RED}
              onPress={onDecline}
            />
            <CallButton
              icon="call"
              label={st(language, 'callAccept')}
              color={BTN_GREEN}
              onPress={onAccept}
            />
          </>
        ) : (
          <>
            <CallButton
              icon={isMuted ? 'mic-off' : 'mic'}
              label={
                isMuted
                  ? st(language, 'callUnmute')
                  : st(language, 'callMute')
              }
              color={isMuted ? ACCENT : '#555'}
              onPress={toggleMute}
            />
            <CallButton
              icon="call"
              label={st(language, 'callEnd')}
              color={END_RED}
              onPress={onEnd}
            />
            <CallButton
              icon={isSpeaker ? 'volume-high' : 'volume-mute'}
              label={
                isSpeaker
                  ? st(language, 'callSpeakerOff')
                  : st(language, 'callSpeakerOn')
              }
              color={isSpeaker ? ACCENT : '#555'}
              onPress={toggleSpeaker}
            />
            {/* Camera toggle — switch between audio-only and video */}
            <CallButton
              icon={isCameraEnabled ? 'videocam' : 'videocam-off'}
              label={
                isCameraEnabled
                  ? st(language, 'callSwitchToAudio')
                  : st(language, 'callSwitchToVideo')
              }
              color={isCameraEnabled ? ACCENT : '#555'}
              onPress={toggleCamera}
            />
            {/* Flip camera — only visible when camera is enabled */}
            {isCameraEnabled ? (
              <CallButton
                icon="camera-reverse-outline"
                label={st(language, 'callSwitchCamera')}
                color="#555"
                onPress={switchCamera}
              />
            ) : null}
          </>
        )}
      </View>

      {!LiveKit && callStatus === 'active' ? (
        <Text style={styles.noNativeText}>
          {st(language, 'callNoNative')}
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main CallPage component
// ---------------------------------------------------------------------------

export default function CallPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const langBase = language.split(/[-_]/)[0].toLowerCase() === 'uk' ? 'uk' : 'en';
  const callErrorText = (err) => errorToUserText(err, langBase);

  const mode = route?.params?.mode || 'outgoing';
  const peerUserId = route?.params?.peerUserId || '';
  const peerDisplayName =
    route?.params?.peerDisplayName || route?.params?.peerName || '';
  const peerAvatarUrl = route?.params?.peerAvatarUrl || '';
  const existingCallId = route?.params?.callId || null;
  const isVideoParam = route?.params?.isVideo === true;

  const [callId, setCallId] = useState(existingCallId);
  const [callStatus, setCallStatus] = useState(mode);
  const [livekitToken, setLivekitToken] = useState(null);
  const [livekitUrl, setLivekitUrl] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(isVideoParam);
  const [durationSec, setDurationSec] = useState(0);
  const [remoteConnected, setRemoteConnected] = useState(false);
  const timerRef = useRef(null);
  const endedRef = useRef(false);
  const roomRef = useRef(null); // LiveKit Room instance

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      void configureBackgroundMusicFriendlyAudio().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (callStatus !== 'active') return undefined;
    void ExpoAudio.setAudioModeAsync({
      ...CALL_AUDIO_MODE,
      ...(Platform.OS === 'ios' ? { shouldPlayInBackground: true } : {}),
    }).catch(() => {});
    return undefined;
  }, [callStatus]);

  // Initiate call on mount
  useEffect(() => {
    if (endedRef.current) return;
    if (callStatus === 'outgoing' && !existingCallId) {
      void (async () => {
        try {
          const res = await callsInitiate(peerUserId, { isVideo: isVideoParam });
          setCallId(res.call.id);
          setLivekitToken(res.token);
          setLivekitUrl(res.livekitUrl);
        } catch (e) {
          Alert.alert('', callErrorText(e));
          navigation.goBack();
        }
      })();
    }
  }, []);

  // Start duration timer when call becomes active + LiveKit token is ready
  useEffect(() => {
    if (callStatus === 'active' && livekitToken) {
      timerRef.current = setInterval(() => {
        setDurationSec((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callStatus, livekitToken]);

  // Outgoing call: poll call status endpoint
  useEffect(() => {
    if (callStatus !== 'outgoing' || !callId) return;
    const pollTimer = setInterval(async () => {
      try {
        const data = await callsGetStatus(callId);
        const c = data.call;
        if (c.status === 'active') {
          clearInterval(pollTimer);
          setCallStatus('active');
        } else if (c.status === 'ended' || c.status === 'declined' || c.status === 'missed') {
          clearInterval(pollTimer);
          Alert.alert('', st(language, 'callEnded'));
          navigation.goBack();
        }
      } catch {
        // ignore
      }
    }, 2000);
    return () => clearInterval(pollTimer);
  }, [callStatus, callId, language, navigation]);

  const onAccept = useCallback(async () => {
    if (!callId) return;
    try {
      const res = await callsAccept(callId);
      setLivekitToken(res.token);
      setLivekitUrl(res.livekitUrl);
      setCallStatus('active');
    } catch (e) {
      Alert.alert('', callErrorText(e));
      navigation.goBack();
    }
  }, [callId, navigation, langBase]);

  const onDecline = useCallback(async () => {
    endedRef.current = true;
    if (callId) {
      try {
        await callsDecline(callId);
      } catch {
        /* ignore */
      }
    }
    navigation.goBack();
  }, [callId, navigation]);

  const onEnd = useCallback(async () => {
    endedRef.current = true;
    if (callId) {
      try {
        await callsEnd(callId);
      } catch {
        /* ignore */
      }
    }
    void configureBackgroundMusicFriendlyAudio().catch(() => {});
    navigation.goBack();
  }, [callId, navigation]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (roomRef.current?.localParticipant) {
        roomRef.current.localParticipant.setMicrophoneEnabled(!next).catch(() => {});
      }
      return next;
    });
  }, []);

  const toggleSpeaker = useCallback(async () => {
    setIsSpeaker((prev) => !prev);
    try {
      await ExpoAudio.setAudioModeAsync({
        ...CALL_AUDIO_MODE,
        ...(Platform.OS === 'ios'
          ? { shouldPlayInBackground: true }
          : {}),
      });
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCamera = useCallback(() => {
    setIsCameraEnabled((prev) => {
      const next = !prev;
      if (roomRef.current?.localParticipant) {
        roomRef.current.localParticipant.setCameraEnabled(next).catch(() => {});
      }
      return next;
    });
  }, []);

  const switchCamera = useCallback(async () => {
    if (roomRef.current?.localParticipant) {
      try {
        await roomRef.current.localParticipant.switchCamera();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const onRoomConnected = useCallback((room) => {
    roomRef.current = room;
    if (!room) return;
    const checkRemote = () => {
      const participants = Array.from(room.remoteParticipants?.values() || []);
      const hasAudio = participants.some((p) => {
        const pub = p.getTrackPublication('microphone');
        return pub?.isSubscribed && pub?.track;
      }) || participants.some((p) => {
        const pub = p.getTrackPublication('camera');
        return pub?.isSubscribed && pub?.track;
      });
      if (hasAudio) setRemoteConnected(true);
    };
    checkRemote();
    room.on('participantConnected', checkRemote);
    room.on('trackSubscribed', checkRemote);
    return () => {
      room.off('participantConnected', checkRemote);
      room.off('trackSubscribed', checkRemote);
    };
  }, []);

  // ---------- LiveKit room rendering ----------

  const needsLiveKit = callStatus === 'active' && livekitToken && livekitUrl;

  const liveKitRoom = needsLiveKit && LiveKit ? (
    <LiveKit.LiveKitRoom
      serverUrl={livekitUrl}
      token={livekitToken}
      connect={true}
      audio={!isMuted}
      video={isCameraEnabled}
      onDisconnected={onEnd}
      onRoomConnected={onRoomConnected}
    >
      <CallRoomContent
        LiveKit={LiveKit}
        LKTrack={LKTrack}
        isCameraEnabled={isCameraEnabled}
        peerDisplayName={peerDisplayName}
        peerAvatarUrl={peerAvatarUrl}
        formattedDuration={formatCallDuration(durationSec)}
        remoteConnected={remoteConnected}
        callStatus={callStatus}
        language={language}
        isMuted={isMuted}
        isSpeaker={isSpeaker}
        onEnd={onEnd}
        onDecline={onDecline}
        onAccept={onAccept}
        toggleMute={toggleMute}
        toggleSpeaker={toggleSpeaker}
        toggleCamera={toggleCamera}
        switchCamera={switchCamera}
        insets={insets}
      />
    </LiveKit.LiveKitRoom>
  ) : null;

  // ---------- Render ----------

  const formattedDuration = formatCallDuration(durationSec);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {Platform.OS === 'android' ? <StatusBar barStyle="light-content" /> : null}

      {liveKitRoom}

      {/* Fallback UI when LiveKit room is not yet connected */}
      {!needsLiveKit ? (
        <View style={styles.roomContentRoot}>
          <View style={styles.header}>
            <ProfileAvatarCircle uri={resolveFeedMediaUrl(peerAvatarUrl)} size={96} isLight={false} style={styles.callAvatar} />
            <Text style={styles.peerName}>{peerDisplayName}</Text>
            <Text style={styles.statusText}>
              {callStatus === 'incoming'
                ? st(language, 'callIncoming')
                : callStatus === 'outgoing'
                  ? st(language, 'callOutgoing')
                  : formattedDuration}
            </Text>
            {remoteConnected && callStatus === 'active' ? (
              <Text style={styles.remoteIndicator}>
                {st(language, 'callConnected')}
              </Text>
            ) : null}
          </View>

          {/* ---- Controls ---- */}
          <View style={styles.controlsRow}>
            {callStatus === 'incoming' ? (
              <>
                <CallButton
                  icon="close"
                  label={st(language, 'callDecline')}
                  color={END_RED}
                  onPress={onDecline}
                />
                <CallButton
                  icon="call"
                  label={st(language, 'callAccept')}
                  color={BTN_GREEN}
                  onPress={onAccept}
                />
              </>
            ) : (
              <>
                <CallButton
                  icon={isMuted ? 'mic-off' : 'mic'}
                  label={
                    isMuted
                      ? st(language, 'callUnmute')
                      : st(language, 'callMute')
                  }
                  color={isMuted ? ACCENT : '#555'}
                  onPress={toggleMute}
                />
                <CallButton
                  icon="call"
                  label={st(language, 'callEnd')}
                  color={END_RED}
                  onPress={onEnd}
                />
                <CallButton
                  icon={isSpeaker ? 'volume-high' : 'volume-mute'}
                  label={
                    isSpeaker
                      ? st(language, 'callSpeakerOff')
                      : st(language, 'callSpeakerOn')
                  }
                  color={isSpeaker ? ACCENT : '#555'}
                  onPress={toggleSpeaker}
                />
              </>
            )}
          </View>

          {!LiveKit && callStatus === 'active' ? (
            <Text style={styles.noNativeText}>
              {st(language, 'callNoNative')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// CallButton
// ---------------------------------------------------------------------------

function CallButton({ icon, label, color, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.callBtn,
        { borderColor: color, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View
        style={[styles.callBtnIconWrap, { backgroundColor: color + '22' }]}
      >
        <Ionicons name={icon} size={26} color={color} />
      </View>
      <Text style={[styles.callBtnLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCallDuration(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000',
  },
  roomContentRoot: {
    flex: 1,
    justifyContent: 'space-between',
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    paddingTop: 40,
  },
  callAvatar: { marginBottom: 20 },
  peerName: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  statusText: {
    color: '#AAA',
    fontSize: 16,
    fontWeight: '500',
  },
  remoteIndicator: {
    color: '#34C759',
    fontSize: 13,
    marginTop: 6,
    fontWeight: '600',
  },
  // --- Video ---
  videoContainer: {
    flex: 1,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  remoteVideo: {
    ...StyleSheet.absoluteFillObject,
  },
  localVideoWrapper: {
    position: 'absolute',
    top: 80,
    right: 12,
    width: 100,
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    elevation: 6,
    zIndex: 10,
  },
  localVideo: {
    width: '100%',
    height: '100%',
    transform: [{ scaleX: -1 }],
  },
  waitingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  waitingText: {
    color: '#666',
    fontSize: 15,
    fontWeight: '500',
  },
  videoStatusOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 12,
  },
  videoPeerName: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  videoStatusText: {
    color: '#CCC',
    fontSize: 14,
    fontWeight: '500',
  },
  // --- Controls ---
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    flexWrap: 'wrap',
  },
  callBtn: {
    alignItems: 'center',
    minWidth: 64,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderColor: '#555',
  },
  callBtnIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  callBtnLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  noNativeText: {
    color: '#FF8A80',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});

/**
 * CallKit integration via react-native-callkeep.
 *
 * Handles:
 *  - Setup and registration of CallKit
 *  - Displaying incoming call UI
 *  - Answer/end call events
 *  - Navigation to CallPage on answer
 */

import { Platform, NativeModules } from 'react-native';
import { navigationRef } from './navigationRef';

// CallKit / react-native-callkeep is iOS-only. On Android the native module is
// incompatible with the New Architecture (duplicate @ReactMethod names) and we
// do not use ConnectionService yet — skip loading entirely.
const isIosCallKeep = Platform.OS === 'ios';

let RNCallKeep = null;
if (isIosCallKeep) {
  try {
    RNCallKeep = require('react-native-callkeep').default;
  } catch {
    // react-native-callkeep not installed — skip
  }
}

const hasNativeCallKeep = isIosCallKeep && !!NativeModules.RNCallKeep;
const CALLKEEP_APP_NAME = 'KRAÏNA';
let callKeepInitialized = false;
let pendingCallData = null;
let answerCallListener = null;
let endCallListener = null;

/** Initialize CallKit. Should be called once on app start. */
export function setupCallKeep() {
  if (callKeepInitialized || !RNCallKeep || !hasNativeCallKeep || Platform.OS !== 'ios') return;

  try {
    void RNCallKeep.setup({
      ios: {
        appName: CALLKEEP_APP_NAME,
        supportsVideo: true,
        maximumCallGroups: 1,
        maximumCallsPerCallGroup: 1,
      },
      android: {
        alertTitle: 'Permissions required',
        alertDescription: 'This application needs to access your phone accounts',
        cancelButton: 'Cancel',
        okButton: 'OK',
        additionalPermissions: [],
      },
    }).catch((e) => {
      if (__DEV__) console.warn('[CallKeep] setup failed:', e?.message || e);
    });
    callKeepInitialized = true;

    answerCallListener = RNCallKeep.addEventListener('answerCall', onAnswerCall);
    endCallListener = RNCallKeep.addEventListener('endCall', onEndCall);
  } catch (e) {
    if (__DEV__) console.warn('[CallKeep] setup failed:', e?.message);
  }
}

/** Report an incoming call to CallKit (from VoIP push event). */
export function reportIncomingCall({
  uuid,
  callerName,
  handle,
  hasVideo = false,
  callId,
  callerId,
}) {
  if (!RNCallKeep || !callKeepInitialized) return;

  try {
    RNCallKeep.displayIncomingCall(
      uuid,
      handle || 'unknown',
      callerName || 'KRAÏNA',
      'generic',
      !!hasVideo,
    );

    // Store call data for when the user answers
    pendingCallData = { uuid, callId, callerId, callerName, isVideo: hasVideo };
  } catch (e) {
    if (__DEV__) console.warn('[CallKeep] reportIncomingCall:', e?.message);
  }
}

/** End a call in CallKit (when user hangs up or call is declined). */
export function endCallInCallKeep(uuid) {
  if (!RNCallKeep || !callKeepInitialized) return;
  try {
    RNCallKeep.endCall(uuid);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

function onAnswerCall({ callUUID }) {
  if (!pendingCallData) return;

  const { callId, callerId, callerName, isVideo } = pendingCallData;
  pendingCallData = null;

  // Navigate to CallPage with incoming call data
  const nav = navigationRef.current;
  if (nav) {
    nav.navigate('Call', {
      mode: 'incoming',
      callId,
      peerUserId: callerId,
      peerDisplayName: callerName,
      isVideo: !!isVideo,
    });
  }
}

function onEndCall({ callUUID }) {
  pendingCallData = null;
  // The call was declined by the system or user before answering
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

export function tearDownCallKeep() {
  if (!RNCallKeep || !callKeepInitialized) return;
  try {
    answerCallListener?.remove?.();
    endCallListener?.remove?.();
  } catch {
    /* ignore */
  }
  answerCallListener = null;
  endCallListener = null;
  callKeepInitialized = false;
}

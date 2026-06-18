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

let RNCallKeep = null;
try {
  RNCallKeep = require('react-native-callkeep').default;
} catch {
  // react-native-callkeep not installed — skip
}

const CALLKEEP_APP_NAME = 'KRAÏNA';
let callKeepInitialized = false;
let pendingCallData = null;

/** Initialize CallKit. Should be called once on app start. */
export function setupCallKeep() {
  if (callKeepInitialized || !RNCallKeep || Platform.OS !== 'ios') return;

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

    // Register event listeners (react-native-callkeep v2+ uses .on())
    RNCallKeep.on('answerCall', onAnswerCall);
    RNCallKeep.on('endCall', onEndCall);
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
    RNCallKeep.reportNewIncomingCall(
      uuid,
      handle || 'unknown',
      'generic',
      !!hasVideo,
      callerName || 'KRAÏNA',
      true, // fromPushKit
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
    RNCallKeep.removeListener('answerCall', onAnswerCall);
    RNCallKeep.removeListener('endCall', onEndCall);
  } catch {
    /* ignore */
  }
  callKeepInitialized = false;
}

/**
 * VoIP push notification service.
 *
 * Receives PushKit events from the native VoIPPushHandler (RCTEventEmitter),
 * stores the push token, and registers it with the backend once
 * the user is authenticated.
 *
 * Endpoint: POST /api/calls/push-token  { voip_token, device_family }
 *           DELETE /api/calls/push-token (on logout)
 */

import { Platform, NativeEventEmitter, NativeModules } from 'react-native';
import { backendAuthFetch } from './backendAuthApi';
import { reportIncomingCall } from './callkeepService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const VOIP_TOKEN_STORAGE_KEY = '@kraina_voip_push_token';

let voipToken = null;
let listenersInstalled = false;
let voipEmitter = null;
let authUnsub = null;

/** Get the native VoIPPushHandler module (iOS only). */
function getVoIPHandler() {
  if (Platform.OS !== 'ios') return null;
  try {
    return NativeModules.VoIPPushHandler;
  } catch {
    return null;
  }
}

/**
 * Register the push token with the backend.
 * Uses backendAuthFetch which handles JWT auth + auto-refresh.
 * If the user is not logged in yet, the token is stored locally and
 * will be sent after login.
 */
async function registerTokenWithBackend(token) {
  if (!token) return;

  try {
    await backendAuthFetch('POST', '/api/calls/push-token', {
      voip_token: token,
      device_family: 'ios',
    });
  } catch (e) {
    // If 401 — user might not be logged in yet. Store token for later.
    if (e?.status === 401) {
      await AsyncStorage.setItem(VOIP_TOKEN_STORAGE_KEY, token).catch(() => {});
      return;
    }
    if (__DEV__) console.warn('[VoIPPush] register token:', e?.message);
  }
}

/**
 * Register event listeners from the native VoIP handler.
 * Should be called once after the app boots (deferred).
 */
export function installVoIPListeners() {
  if (listenersInstalled || Platform.OS !== 'ios') return;
  listenersInstalled = true;

  const handler = getVoIPHandler();
  if (!handler) return;

  // Create NativeEventEmitter for the RCTEventEmitter subclass
  voipEmitter = new NativeEventEmitter(handler);

  // Request current token from native layer (if PushKit already registered)
  handler
    .getVoIPToken()
    .then((token) => {
      if (token) {
        voipToken = `apns_${token}`;
        void registerTokenWithBackend(voipToken).catch(() => {});
      }
    })
    .catch(() => {});

  // Listen for token updates from native (PushKit registration / re-registration)
  voipEmitter.addListener('voipPushTokenUpdated', (token) => {
    voipToken = `apns_${token}`;
    void registerTokenWithBackend(voipToken).catch(() => {});
  });

  // Listen for incoming calls from native (VoIP push received)
  voipEmitter.addListener('voipIncomingCallReceived', (data) => {
    handleIncomingCall(data);
  });

  // Subscribe to Zustand auth store — when user logs in, flush pending token
  setupAuthTokenSync();
}

/**
 * Subscribe to Zustand auth store state changes.
 * When a user logs in (accessToken changes from null to non-null),
 * register any stored VoIP push token.
 */
function setupAuthTokenSync() {
  try {
    const { useAuthStore } = require('./auth/authStore');
    let prevToken = useAuthStore.getState().accessToken;

    authUnsub = useAuthStore.subscribe((state) => {
      const nextToken = state.accessToken;
      // Token changed from null/undefined to a valid value → user just logged in
      if (!prevToken && nextToken) {
        void flushPendingVoIPToken();
      }
      prevToken = nextToken;
    });
  } catch {
    // auth store not available — skip
  }
}

/**
 * Public method: explicitly try to register a pending token
 * (called from auth code after successful login).
 */
export async function flushPendingVoIPToken() {
  try {
    const stored = await AsyncStorage.getItem(VOIP_TOKEN_STORAGE_KEY);
    if (stored) {
      await AsyncStorage.removeItem(VOIP_TOKEN_STORAGE_KEY).catch(() => {});
      voipToken = stored;
      await registerTokenWithBackend(stored);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Delete the push token from the backend (on logout).
 */
export async function unregisterVoIPToken() {
  voipToken = null;
  await AsyncStorage.removeItem(VOIP_TOKEN_STORAGE_KEY).catch(() => {});
  try {
    await backendAuthFetch('DELETE', '/api/calls/push-token');
  } catch {
    /* backend token deletion is best-effort */
  }
}

// ---------------------------------------------------------------------------
// Incoming call handling
// ---------------------------------------------------------------------------

/**
 * Handle incoming call from VoIP push.
 * Report to CallKit immediately.
 */
function handleIncomingCall(data) {
  const { callId, callerId, callerName, isVideo, uuid } = data;

  reportIncomingCall({
    uuid,
    callerName: callerName || 'KRAÏNA',
    handle: callerId || 'unknown',
    hasVideo: !!isVideo,
    callId,
    callerId,
  });
}

/** Get the current VoIP push token (for debugging). */
export function getVoIPToken() {
  return voipToken;
}

/**
 * Cleanup: remove listeners (on app shutdown).
 */
export function tearDownVoIPListeners() {
  if (voipEmitter) {
    try {
      voipEmitter.removeAllListeners('voipPushTokenUpdated');
      voipEmitter.removeAllListeners('voipIncomingCallReceived');
    } catch {
      /* ignore */
    }
  }
  if (authUnsub) {
    authUnsub();
    authUnsub = null;
  }
  listenersInstalled = false;
}

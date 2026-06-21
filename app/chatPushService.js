/**
 * Chat push notification service.
 *
 * 1. Requests notification permission and gets an Expo Push Token
 * 2. Registers the token with the backend (POST /api/messages/push-token)
 * 3. Handles incoming notification taps → navigates to the correct chat thread
 * 4. Unregisters the token on logout
 */
import { Platform } from 'react-native';
import { backendAuthFetch } from './backendAuthApi';

let notificationsModule = null;
let notificationResponseSubscription = null;
let navigateToChat = null;

/**
 * Lazy-load expo-notifications module (avoids native runtime crash in Expo Go).
 */
function getExpoNotifications() {
  if (notificationsModule !== undefined) return notificationsModule;
  try {
    const { TurboModuleRegistry, NativeModules } = require('react-native');
    const hasNative = !!(TurboModuleRegistry?.get('ExpoPushTokenManager') || NativeModules?.ExpoPushTokenManager);
    if (!hasNative) {
      notificationsModule = null;
      return null;
    }
    notificationsModule = require('expo-notifications');
  } catch {
    notificationsModule = null;
  }
  return notificationsModule;
}

/**
 * Request notification permission and get the Expo push token.
 * Returns null if permission denied or native module unavailable.
 */
export async function getExpoPushToken() {
  const Notifications = getExpoNotifications();
  if (!Notifications) return null;

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      if (__DEV__) console.log('[chatPush] Notification permission denied');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData?.data || tokenData?.toString();
    if (!token || typeof token !== 'string') return null;

    // Configure notification handler for foreground notifications
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    return token;
  } catch (e) {
    if (__DEV__) console.warn('[chatPush] getExpoPushToken error:', e?.message);
    return null;
  }
}

/**
 * Register the Expo push token with the backend.
 */
export async function registerChatPushToken(token) {
  if (!token) return;
  try {
    await backendAuthFetch('POST', '/api/messages/push-token', {
      expo_push_token: token,
    });
    if (__DEV__) console.log('[chatPush] Token registered');
  } catch (e) {
    if (__DEV__) console.warn('[chatPush] Register error:', e?.message);
  }
}

/**
 * Unregister the push token (on logout).
 */
export async function unregisterChatPushToken() {
  try {
    await backendAuthFetch('DELETE', '/api/messages/push-token');
  } catch {
    /* best-effort */
  }
}

/**
 * Set up notification tap handler.
 * When user taps a push notification, navigate to the chat thread.
 *
 * @param {function} navigateFn - (threadId) => navigation.navigate('ChatThread', { threadId })
 */
export function setupChatNotificationTapHandler(navigateFn) {
  navigateToChat = navigateFn;

  const Notifications = getExpoNotifications();
  if (!Notifications) return () => {};

  // Handle notification tap while app is in background
  if (notificationResponseSubscription) {
    notificationResponseSubscription.remove();
  }

  notificationResponseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response?.notification?.request?.content?.data;
    if (!data) return;

    const type = data.type || data.notifType;
    const threadId = data.threadId;

    if (type === 'chat_message' && threadId && typeof navigateToChat === 'function') {
      navigateToChat(threadId);
    }
  });

  // Also check if the app was opened from a notification (cold start)
  Notifications.getLastNotificationResponseAsync().then((lastResponse) => {
    if (!lastResponse) return;
    const data = lastResponse?.notification?.request?.content?.data;
    if (data?.type === 'chat_message' && data?.threadId && typeof navigateToChat === 'function') {
      // Delay to allow navigation to be ready
      setTimeout(() => navigateToChat(data.threadId), 500);
    }
  }).catch(() => {});

  return () => {
    if (notificationResponseSubscription) {
      notificationResponseSubscription.remove();
      notificationResponseSubscription = null;
    }
  };
}

/**
 * Full setup: get token, register, set up tap handler.
 * Call once after user is authenticated.
 */
export async function initChatPushNotifications(navigateFn) {
  const Notifications = getExpoNotifications();
  if (!Notifications) return;

  // Set up Android notification channel
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('chat-messages', {
        name: 'KRAЇNA — повідомлення',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 100, 50, 100],
      });
    } catch {
      /* ignore */
    }
  }

  // Set up tap handler
  setupChatNotificationTapHandler(navigateFn);

  // Get and register push token
  const token = await getExpoPushToken();
  if (token) {
    await registerChatPushToken(token);
  }
}

/**
 * Cleanup: remove notification listener.
 */
export function teardownChatPushNotifications() {
  if (notificationResponseSubscription) {
    notificationResponseSubscription.remove();
    notificationResponseSubscription = null;
  }
}

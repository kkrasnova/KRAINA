/**
 * Real-time chat WebSocket client.
 *
 * Connects to the backend WebSocket server (/ws?token=JWT) and:
 * - Receives new messages instantly
 * - Sends/receives typing indicators
 * - Handles message status (delivered, read)
 * - Auto-reconnects on disconnect
 */
import { DeviceEventEmitter } from 'react-native';
import { getValidBackendAccessToken, isBackendJwt } from './backendAuthApi';
import { getKrainaRestApiBase } from './krainaApiBase';
import { useAuthStore } from './auth/authStore';
import { logError } from './errorLogger';

// ─── Events emitted for the rest of the app ───────────────────────────────────

export const WS_EVENT_NEW_MESSAGE = 'ws_new_message';
export const WS_EVENT_TYPING = 'ws_typing';
export const WS_EVENT_STOPPED_TYPING = 'ws_stopped_typing';
export const WS_EVENT_MESSAGE_STATUS = 'ws_message_status';
export const WS_EVENT_THREAD_UPDATED = 'ws_thread_updated';
export const WS_EVENT_THREAD_DELETED = 'ws_thread_deleted';
export const WS_EVENT_CONNECTED = 'ws_connected';
export const WS_EVENT_DISCONNECTED = 'ws_disconnected';
export const WS_EVENT_ERROR = 'ws_error';

// ─── State ─────────────────────────────────────────────────────────────────────

let ws = null;
let reconnectTimer = null;
let heartbeatTimer = null;
let isConnecting = false;
let currentUserId = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000; // 30s max
const BASE_RECONNECT_DELAY = 500; // 500ms

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Connect to the WebSocket server.
 * @param {string} userId - Current user's backend ID.
 * @returns {Promise<boolean>} - True if connection was established.
 */
export async function connectChatWebSocket(userId) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    if (currentUserId === userId) return true;
    // User changed — disconnect first
    disconnectChatWebSocket();
  }

  currentUserId = userId;
  if (!userId) return false;

  const baseUrl = getKrainaRestApiBase();
  if (!baseUrl) return false;

  if (isConnecting) return false;
  isConnecting = true;

  try {
    const token = await getValidBackendAccessToken();
    if (!token) {
      isConnecting = false;
      return false;
    }

    // Build WebSocket URL: replace http(s) with ws(s)
    const wsBase = baseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
    const wsUrl = `${wsBase}/ws?token=${encodeURIComponent(token)}`;

    // Close any existing connection
    if (ws) {
      try { ws.close(); } catch { /* ignore */ }
      ws = null;
    }

    ws = new WebSocket(wsUrl);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (ws && ws.readyState !== WebSocket.OPEN) {
          cleanup();
          isConnecting = false;
          resolve(false);
        }
      }, 3000);

      const cleanup = () => {
        clearTimeout(timeout);
        if (ws) {
          ws.onopen = null;
          ws.onmessage = null;
          ws.onclose = null;
          ws.onerror = null;
        }
      };

      ws.onopen = () => {
        cleanup();
        isConnecting = false;
        reconnectAttempts = 0;
        startHeartbeat();
        DeviceEventEmitter.emit(WS_EVENT_CONNECTED, { userId });
        resolve(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleIncomingEvent(data);
        } catch (e) {
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.warn('[chatRealtime] Invalid message', e?.message);
          }
        }
      };

      ws.onclose = (event) => {
        cleanup();
        isConnecting = false;
        stopHeartbeat();
        DeviceEventEmitter.emit(WS_EVENT_DISCONNECTED, { code: event.code });
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose will fire after onerror
      };
    });
  } catch (e) {
    isConnecting = false;
    logError('chat_ws', String(e?.message || 'connect_failed'), {
      userId: currentUserId,
      baseUrl,
      reconnectAttempts,
    });
    if (__DEV__) console.warn('[chatRealtime] Connection error', e?.message);
    scheduleReconnect();
    return false;
  }
}

/**
 * Disconnect from the WebSocket server.
 */
export function disconnectChatWebSocket() {
  reconnectAttempts = MAX_RECONNECT_DELAY; // Prevent reconnection
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  stopHeartbeat();
  if (ws) {
    try {
      ws.onclose = null; // Prevent reconnect
      ws.close(1000, 'Client disconnect');
    } catch { /* ignore */ }
    ws = null;
  }
  currentUserId = null;
}

/**
 * Send a typing indicator via WebSocket.
 * @param {string} threadId
 * @param {boolean} isTyping
 */
export function sendTypingIndicator(threadId, isTyping) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify({
      type: isTyping ? 'typing' : 'stopped_typing',
      threadId,
    }));
  } catch { /* ignore */ }
}

/**
 * Mark a message as delivered via WebSocket.
 * @param {string} threadId
 * @param {string} messageId
 */
export function sendMarkDelivered(threadId, messageId) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify({
      type: 'mark_delivered',
      threadId,
      messageId,
    }));
  } catch { /* ignore */ }
}

/**
 * Mark messages as read via WebSocket.
 * @param {string} threadId
 * @param {string} [messageId] - Optional specific message ID.
 */
export function sendMarkRead(threadId, messageId) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    const payload = { type: 'mark_read', threadId };
    if (messageId) payload.messageId = messageId;
    ws.send(JSON.stringify(payload));
  } catch { /* ignore */ }
}

/**
 * Check if the WebSocket is connected.
 */
export function isWsConnected() {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}

/**
 * Get the current reconnect attempt count.
 */
export function getWsReconnectAttempts() {
  return reconnectAttempts;
}

// ─── Internal ──────────────────────────────────────────────────────────────────

function handleIncomingEvent(data) {
  switch (data.type) {
    case 'new_message':
      DeviceEventEmitter.emit(WS_EVENT_NEW_MESSAGE, {
        threadId: data.threadId,
        message: data.message,
      });
      break;

    case 'typing':
      DeviceEventEmitter.emit(WS_EVENT_TYPING, {
        threadId: data.threadId,
        userId: data.userId,
      });
      break;

    case 'stopped_typing':
      DeviceEventEmitter.emit(WS_EVENT_STOPPED_TYPING, {
        threadId: data.threadId,
        userId: data.userId,
      });
      break;

    case 'message_status':
      DeviceEventEmitter.emit(WS_EVENT_MESSAGE_STATUS, {
        threadId: data.threadId,
        messageId: data.messageId,
        status: data.status,
      });
      break;

    case 'thread_updated':
      DeviceEventEmitter.emit(WS_EVENT_THREAD_UPDATED, {
        threadId: data.threadId,
      });
      break;

    case 'thread_deleted':
      DeviceEventEmitter.emit(WS_EVENT_THREAD_DELETED, {
        threadId: data.threadId,
      });
      break;

    case 'connected':
      // Welcome event — connection is ready
      break;

    case 'error':
      DeviceEventEmitter.emit(WS_EVENT_ERROR, {
        message: data.message,
      });
      logError('chat_ws', 'Server error: ' + String(data.message || ''), { userId: currentUserId });
      break;

    default:
      break;
  }
}

function scheduleReconnect() {
  if (reconnectAttempts >= 10) {
    logError('chat_ws', 'Max reconnect attempts reached', {
      userId: currentUserId,
      attempts: reconnectAttempts,
      baseUrl: getKrainaRestApiBase(),
    });
    return;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }

  reconnectAttempts++;
  const delay = Math.min(
    BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1),
    MAX_RECONNECT_DELAY,
  );

  if (__DEV__) {
    console.log(`[chatRealtime] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (currentUserId) {
      void connectChatWebSocket(currentUserId);
    }
  }, delay);
}

function startHeartbeat() {
  stopHeartbeat();
  // Send a ping every 25s to keep the connection alive
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'ping' }));
      } catch { /* ignore */ }
    }
  }, 25000);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

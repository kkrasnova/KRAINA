/**
 * Persistent error logger for production debugging.
 *
 * Stores the last N errors in AsyncStorage so they can be inspected
 * even when __DEV__ is false. Errors are tagged by category and
 * include a timestamp and human-readable description.
 *
 * Usage:
 *   import { logError, getErrorLog, clearErrorLog } from './errorLogger';
 *
 *   logError('chat_session', 'Failed to establish backend session', {
 *     status: 401,
 *     provider: 'google',
 *   });
 *
 *   const errors = await getErrorLog();
 *   console.log(errors); // [{ category, message, details, timestamp }, ...]
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@kraina_error_log_v1';
const MAX_ERRORS = 50;

/**
 * Categories used across the app:
 *   - 'chat_session' — backend JWT session recovery (syncBackendSessionBridge)
 *   - 'chat_api'     — REST API calls (backendAuthApi, messageApi)
 *   - 'chat_ws'      — WebSocket connection (chatRealtime)
 *   - 'chat_send'    — Message sending (ChatThreadPage)
 *   - 'chat_list'    — Thread listing (ChatsPage)
 */
export async function logError(category, message, details) {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    list.push({
      category,
      message: String(message || '').trim(),
      details: details || {},
      timestamp: Date.now(),
    });
    // Keep only the last MAX_ERRORS
    const trimmed = list.length > MAX_ERRORS ? list.slice(-MAX_ERRORS) : list;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));

    // Also log to console when available
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(`[errorLogger] ${category}: ${message}`, details);
    }
  } catch {
    // Never throw from the logger itself
  }
}

/**
 * Get the full error log.
 * @returns {Promise<Array<{category: string, message: string, details: object, timestamp: number}>>}
 */
export async function getErrorLog() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Clear the error log.
 */
export async function clearErrorLog() {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Format error details into a readable multiline string for display.
 */
export function formatErrorEntry(entry) {
  const date = new Date(entry.timestamp).toLocaleString();
  let s = `[${date}] ${entry.category}: ${entry.message}`;
  if (entry.details && Object.keys(entry.details).length > 0) {
    try {
      s += '\n' + JSON.stringify(entry.details, null, 2);
    } catch {
      s += '\n[details omitted]';
    }
  }
  return s;
}

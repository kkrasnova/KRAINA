/**
 * Утиліта для очищення всіх локальних кешів додатку.
 * Видаляє тимчасові дані, які безпечно скинути без втрати
 * критичної інформації (сесія, мова, підписка).
 *
 * БЕЗПЕЧНІ КЛЮЧІ (можна видаляти):
 *   - feedLocalStorage (пости/сторіс)
 *   - profileStorage (кеш профілю)
 *   - savedLandmarksStorage
 *   - visitStatsStorage
 *   - adminSecurityStorage (журнали)
 *   - offline/outboxStore (історія + черга)
 *   - audioGuideCache (файли)
 *   - routePlanFileCache (файли)
 *   - TTL-cache (feedApi, locationsApi)
 *
 * НЕ ЧІПАЄМО (критичні для UX):
 *   - Сесія (db.js, authStore)
 *   - Мова (appLanguage)
 *   - Тема (themeStorage)
 *   - Країна/місто (countryStorage, homeCityStorage)
 *   - Онбординг (onboardingStorage — щоб не показувати знову)
 *   - Підписка (subscriptionStorage)
 *   - Нагадування прогулянок (walkReminderStorage)
 *   - StepSync (stepSyncStorage)
 *   - Налаштування сповіщень/приватності (SettingsSubScreens)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { ttlInvalidate } from './ttlCache';

/** Ключі AsyncStorage, які безпечно скинути */
const SAFE_TO_CLEAR = [
  // Feed локальний кеш
  '@kraina_feed_posts_v1:',
  '@kraina_feed_stories_v1:',
  '@kraina_feed_story_likes_v1:',

  // Профіль (кешовані дані)
  '@kraina_profile_display_name',
  '@kraina_profile_username',
  '@kraina_profile_bio_v1',
  '@kraina_profile_city',
  '@kraina_profile_avatar_local_uri_v1',
  '@kraina_profile_birth_iso_v1',
  '@kraina_profile_birth_public_v1',
  '@kraina_profile_friends_json',
  '@kraina_profile_invitations_json',
  '@kraina_profile_saved_routes_json',
  '@kraina_profile_post_comments_json',
  '@kraina_profile_post_like_state_json',

  // Збережені пам'ятки
  '@kraina_saved_landmarks_v1',

  // Статистика відвідувань
  '@kraina_visit_log_v1',

  // Адмін-гейт (журнали спроб)
  '@kraina_admin_gate_blocked_v1',
  '@kraina_admin_gate_log_v1',

  // Офлайн-кеш медіа (включаючи outbox)
  '@kraina_offline_outbox_v1',
  '@kraina_offline_outbox_history_v1',
  '@kraina_offline_media_map_v1',
  '@kraina_offline_bundle_meta_v1',

  // Чати (локальний кеш)
  '@kraina_chat_hidden_threads_v1',

  // Вікторини (кеш)
  '@kraina_landmark_quiz_scores_v1',

  // Заявки на історії
  '@kraina_landmark_story_request_queue_v1',

  // OTP (одноразові коди)
  '@kraina_otp_',
];

/** Каталоги файлового кешу для очищення */
const FILE_CACHE_DIRS = [
  ['audioguides', FileSystem.cacheDirectory, 'kraina_audioguides'],
  ['route_plans', FileSystem.documentDirectory, 'kraina_route_cache'],
  ['offline_media', FileSystem.documentDirectory, 'offline-media'],
];

/**
 * Повне очищення всіх безпечних кешів.
 * @returns {{ clearedKeys: number, clearedFiles: string[] }}
 */
export async function clearAllAppCaches() {
  const result = {
    clearedKeys: 0,
    clearedFiles: [],
  };

  // 1. Очищення AsyncStorage
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const toRemove = allKeys.filter((key) =>
      SAFE_TO_CLEAR.some((prefix) => key.startsWith(prefix)),
    );
    if (toRemove.length > 0) {
      await AsyncStorage.multiRemove(toRemove);
      result.clearedKeys = toRemove.length;
    }
  } catch (e) {
    console.warn('[cacheCleanup] AsyncStorage очищення:', e?.message);
  }

  // 2. Очищення TTL-кешу (in-memory)
  try {
    ttlInvalidate('');
  } catch {
    /* ignore */
  }

  // 3. Очищення файлових кешів
  for (const [, baseDir, dirName] of FILE_CACHE_DIRS) {
    try {
      const dirPath = `${baseDir}${dirName}/`;
      const info = await FileSystem.getInfoAsync(dirPath);
      if (info.exists) {
        await FileSystem.deleteAsync(dirPath, { idempotent: true });
        result.clearedFiles.push(dirPath);
      }
    } catch {
      /* ігнор — можливо, директорії не існує */
    }
  }

  return result;
}

/**
 * Швидке очищення лише пам'яті (in-memory TTL cache) — 
 * викликати при виході з облікового запису.
 */
export function clearMemoryCaches() {
  try {
    ttlInvalidate('');
  } catch {
    /* ignore */
  }
}

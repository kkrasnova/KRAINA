/**
 * Озвучка аудіогідів: хмарний TTS (Google / OpenAI через бекенд) + покращений device TTS.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { sha256 } from 'js-sha256';
import { appLangBase } from './appLang';
import { apiHttp } from './apiHttp';
import { normalizeLandmarkStory } from './landmarkStorySchema';
import { getLandmarkInRegion } from './routeRegionsData';
import { introPagesFromStory, resolveIntroStoryField } from './landmarkIntroStoryResolve';
import { stripIntroEmphasis } from './landmarkTextUtils';

const TTS_CACHE_DIR = `${FileSystem.cacheDirectory}kraina_tts/`;
const MIN_TTS_FILE_BYTES = 128;

/** Нормалізує локальний шлях для expo-audio / FileSystem. */
export function normalizePlaybackUri(uri) {
  const u = String(uri || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u) || u.startsWith('file://')) return u;
  if (u.startsWith('/')) return `file://${u}`;
  return u;
}

/** Текст озвучки з nav params або з каталогу пам'ятки (усі мови інтерфейсу). */
export function resolveLandmarkAudioScript(route, language) {
  const lang = appLangBase(language);
  const fromParams =
    lang === 'uk'
      ? route?.params?.audioScriptUk
      : lang === 'en'
        ? route?.params?.audioScriptEn
        : '';
  if (typeof fromParams === 'string' && fromParams.trim()) return fromParams.trim();

  const landmarkId = route?.params?.visitLandmarkSave?.landmarkId;
  const regionId = route?.params?.visitLandmarkSave?.regionId;
  if (!landmarkId || !regionId) return '';

  const lm = getLandmarkInRegion(regionId, landmarkId);
  const rawStory = lm?.story && typeof lm.story === 'object' ? lm.story : null;
  const story = rawStory ? normalizeLandmarkStory(rawStory) : null;
  if (!story?.ttsEnabled) return '';

  const ctx = { regionId, landmarkId };
  const introPage1 = resolveIntroStoryField(rawStory, 'introPage1', language, ctx);
  const pages = introPagesFromStory(rawStory, language, ctx);
  if (Array.isArray(pages) && pages.length > 0) {
    const parts = [
      introPage1,
      ...pages.flatMap((page) => {
        const chunks = [];
        if (page?.body) chunks.push(stripIntroEmphasis(page.body));
        if (page?.bodyAfterHero) chunks.push(stripIntroEmphasis(page.bodyAfterHero));
        return chunks;
      }),
    ]
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
    if (parts.length) return parts.join('\n\n');
  }

  return lang === 'uk'
    ? String(story.audioScriptUk || '').trim()
    : String(story.audioScriptEn || story.audioScriptUk || '').trim();
}

function isUsableCachedAudioFile(info) {
  return !!info?.exists && (typeof info.size !== 'number' || info.size >= MIN_TTS_FILE_BYTES);
}

/** Мова озвучки = мова інтерфейсу (de, pl, …). Хмарний TTS бекенду — лише uk/en. */
export function ttsContentLang(appLanguage) {
  return appLangBase(appLanguage);
}

function cloudTtsApiLang(appLanguage) {
  const lang = ttsContentLang(appLanguage);
  return lang === 'uk' || lang === 'en' ? lang : null;
}

export const TTS_LOCALE_BY_CONTENT = {
  uk: 'uk-UA',
  en: 'en-US',
  de: 'de-DE',
  pl: 'pl-PL',
  nl: 'nl-NL',
  es: 'es-ES',
  lt: 'lt-LT',
  lv: 'lv-LV',
  ro: 'ro-RO',
  it: 'it-IT',
  hy: 'hy-AM',
};

export function ttsLocaleForContent(appLanguage) {
  const contentLang = ttsContentLang(appLanguage);
  return TTS_LOCALE_BY_CONTENT[contentLang] || 'en-US';
}

/** iOS: 0.5 ≈ нормальна швидкість; Android: ближче до 1.0. */
export function naturalSpeechRate() {
  return Platform.OS === 'ios' ? 0.5 : 0.92;
}

const voicePickCache = Object.create(null);

export async function pickBestVoiceIdentifier(Speech, locale) {
  const key = String(locale || 'en-US');
  if (voicePickCache[key]) return voicePickCache[key];
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const langPrefix = key.split('-')[0].toLowerCase();
    const matching = (voices || []).filter((v) => {
      const lang = String(v.language || '').toLowerCase().replace('_', '-');
      return lang === key.toLowerCase() || lang.startsWith(`${langPrefix}-`) || lang === langPrefix;
    });
    const enhanced = matching.find((v) => String(v.quality || '').toLowerCase() === 'enhanced');
    const picked = enhanced?.identifier || matching[0]?.identifier || undefined;
    voicePickCache[key] = picked;
    return picked;
  } catch {
    return undefined;
  }
}

async function ensureTtsCacheDir() {
  await FileSystem.makeDirectoryAsync(TTS_CACHE_DIR, { intermediates: true }).catch(() => {});
}

/** Завантажує MP3 з бекенду або повертає закешований file:// URI. */
export async function fetchCloudTtsFileUri(text, appLanguage) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  const contentLang = ttsContentLang(appLanguage);
  const apiLang = cloudTtsApiLang(appLanguage);
  if (!apiLang) return null;
  const cacheKey = sha256(`${contentLang}:${trimmed}`);
  const localPath = `${TTS_CACHE_DIR}${cacheKey.slice(0, 32)}.mp3`;

  await ensureTtsCacheDir();
  const info = await FileSystem.getInfoAsync(localPath);
  if (isUsableCachedAudioFile(info)) return normalizePlaybackUri(localPath);
  if (info.exists) {
    await FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => {});
  }

  try {
    const res = await apiHttp.post(
      '/api/ai/landmark-tts',
      { text: trimmed, language: apiLang },
      { timeout: 120000, validateStatus: (status) => status < 500 },
    );
    const b64 = res?.data?.audioBase64;
    if (res.status !== 200 || !b64 || typeof b64 !== 'string') return null;
    await FileSystem.writeAsStringAsync(localPath, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const written = await FileSystem.getInfoAsync(localPath);
    if (!isUsableCachedAudioFile(written)) {
      await FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => {});
      return null;
    }
    return normalizePlaybackUri(localPath);
  } catch (e) {
    if (__DEV__) console.warn('[landmarkTts] cloud', e?.response?.data || e?.message);
    return null;
  }
}

export function splitTextForDeviceSpeech(text, maxLen = 360) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxLen) return [trimmed];
  const parts = [];
  let rest = trimmed;
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf('\n\n', maxLen);
    if (cut < maxLen * 0.35) cut = rest.lastIndexOf('. ', maxLen);
    if (cut < maxLen * 0.35) cut = rest.lastIndexOf(' ', maxLen);
    if (cut <= 0) cut = maxLen;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

function deviceSpeechLocales(appLanguage) {
  const primary = ttsLocaleForContent(appLanguage);
  const locales = [primary];
  if (primary !== 'en-US') locales.push('en-US');
  locales.push(undefined);
  return locales;
}

function speakChunksWithLocale(Speech, chunks, locale, useVoice, isCancelled) {
  const voicePromise =
    useVoice && locale ? pickBestVoiceIdentifier(Speech, locale) : Promise.resolve(undefined);

  return voicePromise.then((voice) =>
    new Promise((resolve, reject) => {
      let stopped = false;
      let index = 0;

      const speakNext = () => {
        if (stopped || isCancelled?.()) {
          stopped = true;
          resolve();
          return;
        }
        if (index >= chunks.length) {
          resolve();
          return;
        }
        const chunk = chunks[index];
        index += 1;
        const opts = {
          rate: naturalSpeechRate(),
          pitch: 1.0,
          volume: 1.0,
          onDone: () => speakNext(),
          onStopped: () => {
            stopped = true;
            resolve();
          },
          onError: (e) => {
            stopped = true;
            reject(e);
          },
        };
        if (locale) opts.language = locale;
        if (voice) opts.voice = voice;
        Speech.speak(chunk, opts);
      };

      speakNext();
    }),
  );
}

export async function speakWithDeviceTts(Speech, text, appLanguage, callbacks, isCancelled) {
  const chunks = splitTextForDeviceSpeech(text);
  if (!chunks.length) return;

  const locales = deviceSpeechLocales(appLanguage);
  let lastError = null;

  for (let i = 0; i < locales.length; i += 1) {
    if (isCancelled?.()) {
      callbacks?.onStopped?.();
      return;
    }
    try {
      await speakChunksWithLocale(Speech, chunks, locales[i], i === 0, isCancelled);
      if (isCancelled?.()) {
        callbacks?.onStopped?.();
        return;
      }
      callbacks?.onDone?.();
      return;
    } catch (e) {
      lastError = e;
      Speech.stop?.();
      if (__DEV__) {
        console.warn(
          '[landmarkTts] device locale failed',
          locales[i] || 'default',
          e?.message || e,
        );
      }
    }
  }

  callbacks?.onError?.(lastError || new Error('device_tts_failed'));
}

/**
 * Озвучує один слайд (хмара → device TTS). Повертає true, якщо відтворення завершилось.
 */
export async function playSlideNarration({
  Speech,
  text,
  appLanguage,
  playFileAudio,
  isCancelled,
}) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return false;
  if (isCancelled?.()) return false;

  const cloudUri = await fetchCloudTtsFileUri(trimmed, appLanguage);
  if (isCancelled?.()) return false;
  if (cloudUri && typeof playFileAudio === 'function') {
    try {
      await playFileAudio(cloudUri);
      return !isCancelled?.();
    } catch (e) {
      if (isCancelled?.()) return false;
      if (__DEV__) {
        console.warn('[landmarkTts] slide cloud playback failed', e?.message || e);
      }
    }
  }

  if (isCancelled?.()) return false;
  await new Promise((resolve, reject) => {
    speakWithDeviceTts(
      Speech,
      trimmed,
      appLanguage,
      {
        onDone: () => resolve(),
        onStopped: () => resolve(),
        onError: (e) => reject(e),
      },
      isCancelled,
    );
  });
  return !isCancelled?.();
}

/**
 * Спроба хмарної озвучки; якщо недоступна — природний device TTS.
 * @returns {'file'|'speech'|null}
 */
export async function startLandmarkNarration({
  Speech,
  text,
  fallbackTexts = [],
  appLanguage,
  playFileAudio,
  callbacks,
}) {
  const scripts = [
    ...new Set(
      [text, ...fallbackTexts]
        .map((entry) => String(entry || '').trim())
        .filter(Boolean),
    ),
  ];
  if (!scripts.length) return null;

  let lastError = null;
  for (const trimmed of scripts) {
    const cloudUri = await fetchCloudTtsFileUri(trimmed, appLanguage);
    if (cloudUri && typeof playFileAudio === 'function') {
      try {
        await playFileAudio(cloudUri);
        return 'file';
      } catch (e) {
        if (__DEV__) {
          console.warn('[landmarkTts] cloud playback failed, fallback to device', e?.message || e);
        }
      }
    }

    try {
      await new Promise((resolve, reject) => {
        speakWithDeviceTts(Speech, trimmed, appLanguage, {
          onDone: () => {
            callbacks?.onDone?.();
            resolve();
          },
          onStopped: () => {
            callbacks?.onStopped?.();
            resolve();
          },
          onError: (e) => reject(e),
        });
      });
      return 'speech';
    } catch (e) {
      lastError = e;
      Speech.stop?.();
    }
  }

  callbacks?.onError?.(lastError || new Error('narration_failed'));
  return null;
}

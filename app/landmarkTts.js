/**
 * Озвучка аудіогідів: хмарний TTS (Google / OpenAI через бекенд) + покращений device TTS.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { sha256 } from 'js-sha256';
import { appLangBase } from './appLang';
import { apiHttp } from './apiHttp';

const TTS_CACHE_DIR = `${FileSystem.cacheDirectory}kraina_tts/`;

/** Мова тексту для озвучки (контент лише UK / EN). */
export function ttsContentLang(appLanguage) {
  return appLangBase(appLanguage) === 'uk' ? 'uk' : 'en';
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
  const cacheKey = sha256(`${contentLang}:${trimmed}`);
  const localPath = `${TTS_CACHE_DIR}${cacheKey.slice(0, 32)}.mp3`;

  await ensureTtsCacheDir();
  const info = await FileSystem.getInfoAsync(localPath);
  if (info.exists) return localPath;

  try {
    const res = await apiHttp.post(
      '/api/ai/landmark-tts',
      { text: trimmed, language: contentLang },
      { timeout: 120000 },
    );
    const b64 = res?.data?.audioBase64;
    if (!b64 || typeof b64 !== 'string') return null;
    await FileSystem.writeAsStringAsync(localPath, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return localPath;
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

export async function speakWithDeviceTts(Speech, text, appLanguage, callbacks) {
  const locale = ttsLocaleForContent(appLanguage);
  const voice = await pickBestVoiceIdentifier(Speech, locale);
  const chunks = splitTextForDeviceSpeech(text);
  if (!chunks.length) return;

  let stopped = false;
  let index = 0;

  const finish = () => {
    if (!stopped) callbacks?.onDone?.();
  };

  const speakNext = () => {
    if (stopped || index >= chunks.length) {
      finish();
      return;
    }
    const chunk = chunks[index];
    index += 1;
    Speech.speak(chunk, {
      language: locale,
      ...(voice ? { voice } : {}),
      rate: naturalSpeechRate(),
      pitch: 1.0,
      volume: 1.0,
      onDone: () => speakNext(),
      onStopped: () => {
        stopped = true;
        callbacks?.onStopped?.();
      },
      onError: (e) => {
        stopped = true;
        callbacks?.onError?.(e);
      },
    });
  };

  speakNext();
}

/**
 * Спроба хмарної озвучки; якщо недоступна — природний device TTS.
 * @returns {'file'|'speech'|null}
 */
export async function startLandmarkNarration({ Speech, text, appLanguage, playFileAudio, callbacks }) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

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

  await speakWithDeviceTts(Speech, trimmed, appLanguage, callbacks);
  return 'speech';
}

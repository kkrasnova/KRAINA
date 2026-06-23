import { setAudioModeAsync } from 'expo-audio';

/** Не перебиває Spotify та інші музичні додатки. */
export const BACKGROUND_MUSIC_FRIENDLY_AUDIO_MODE = {
  interruptionMode: 'mixWithOthers',
  playsInSilentMode: true,
  allowsRecording: false,
};

/** Відтворення голосових / аудіогідів — музика лишається, наш звук зверху. */
export const APP_PLAYBACK_AUDIO_MODE = {
  interruptionMode: 'mixWithOthers',
  playsInSilentMode: true,
  allowsRecording: false,
};

/** Запис голосового — тимчасово перемикаємо сесію під мікрофон. */
export const VOICE_RECORDING_AUDIO_MODE = {
  interruptionMode: 'duckOthers',
  playsInSilentMode: true,
  allowsRecording: true,
};

/** Дзвінки — ексклюзивний аудіофокус. */
export const CALL_AUDIO_MODE = {
  interruptionMode: 'doNotMix',
  playsInSilentMode: true,
  allowsRecording: true,
};

export async function configureBackgroundMusicFriendlyAudio() {
  return setAudioModeAsync(BACKGROUND_MUSIC_FRIENDLY_AUDIO_MODE);
}

import { DeviceEventEmitter } from 'react-native';

export const KRAINA_APP_LANGUAGE_CHANGED = 'kraina_app_language_changed';

export function emitAppLanguageChanged(languageId) {
  if (languageId == null || typeof languageId !== 'string') return;
  DeviceEventEmitter.emit(KRAINA_APP_LANGUAGE_CHANGED, languageId);
}

/**
 * Безпечне завантаження expo-camera: не валить застосунок, якщо в APK немає нативного ExpoCamera
 * (застаріла збірка). Після додавання модуля виконайте clean + run-android.
 */
export function tryLoadExpoCamera() {
  try {
    return require('expo-camera');
  } catch {
    return null;
  }
}

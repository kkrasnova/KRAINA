import AsyncStorage from '@react-native-async-storage/async-storage';

/** Користувач пройшов карусель банерів (OnboardingIntro) — далі запускаємо без повторних банерів. */
export const ONBOARDING_SLIDES_SEEN_KEY = '@kraina_onboarding_slides_seen_v1';

/**
 * Той самий ключ, що в SecondPage (`LANG_PICKER_DONE_KEY`): міграція для вже встановлених застосунків —
 * не показувати банери знову, якщо мову вже обирали раніше.
 */
export const LANG_PICKER_DONE_KEY = '@kraina_language_picker_done_v2';

export async function setOnboardingSlidesSeenFlag() {
  try {
    await AsyncStorage.setItem(ONBOARDING_SLIDES_SEEN_KEY, '1');
  } catch (_) {}
}

export async function getOnboardingSlidesSeenFlag() {
  try {
    return (await AsyncStorage.getItem(ONBOARDING_SLIDES_SEEN_KEY)) === '1';
  } catch {
    return false;
  }
}

/** Чи пропускати карусель при холодному старті без сесії (вже бачили банери або раніше обирали мову). */
export async function shouldSkipOnboardingIntroOnColdStart() {
  try {
    const [slides, picker] = await Promise.all([
      AsyncStorage.getItem(ONBOARDING_SLIDES_SEEN_KEY),
      AsyncStorage.getItem(LANG_PICKER_DONE_KEY),
    ]);
    return slides === '1' || picker === '1';
  } catch {
    return false;
  }
}

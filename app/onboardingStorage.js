import AsyncStorage from '@react-native-async-storage/async-storage';

/** Користувач пройшов карусель банерів (OnboardingIntro) — далі запускаємо без повторних банерів. */
export const ONBOARDING_SLIDES_SEEN_KEY = '@kraina_onboarding_slides_seen_v1';

/**
 * Той самий ключ, що в SecondPage (`LANG_PICKER_DONE_KEY`): міграція для вже встановлених застосунків —
 * не показувати банери знову, якщо мову вже обирали раніше.
 */
export const LANG_PICKER_DONE_KEY = '@kraina_language_picker_done_v2';

/**
 * Хоч раз успішно увійшли/зареєструвались ТА реально дійшли до головної сторінки (HomeTabPager) на цьому пристрої.
 * Зберігається в AsyncStorage (зникає при видаленні застосунку) — після виходу не гоняємо знову мову/карусель.
 *
 * Версія v2: стара v1 встановлювалась одразу на успіху логіну (до досягнення головної),
 * тому її треба ігнорувати й одноразово прибрати з пам’яті пристрою.
 */
export const HAS_COMPLETED_APP_AUTHENTICATION_KEY = '@kraina_has_completed_auth_v2';
const LEGACY_HAS_COMPLETED_APP_AUTHENTICATION_KEY_V1 = '@kraina_has_completed_auth_v1';

let legacyCleanupPromise = null;
function ensureLegacyCleanupOnce() {
  if (!legacyCleanupPromise) {
    legacyCleanupPromise = AsyncStorage.removeItem(LEGACY_HAS_COMPLETED_APP_AUTHENTICATION_KEY_V1).catch(() => {});
  }
  return legacyCleanupPromise;
}

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

/**
 * Чи пристрій уже бачив ПОВНИЙ перший вхід (користувач реально досяг головної сторінки).
 * Вибір мови / перегляд слайдів самі по собі не рахуються: поки людина не пройшла реєстрацію/логін
 * до головного екрану, при повторному запуску банери мають з’являтися знову.
 */
export async function getHasUsedAppBefore() {
  try {
    void ensureLegacyCleanupOnce();
    const authDone = await AsyncStorage.getItem(HAS_COMPLETED_APP_AUTHENTICATION_KEY);
    return authDone === '1';
  } catch {
    return false;
  }
}

/**
 * Після того, як користувач реально досяг головної сторінки (HomeTabPager) — наступні холодні старти
 * без активної сесії показують FirstPage → BackendAuth (SplashAuth відновить з Keychain або покаже вхід),
 * без банерів/вибору мови.
 */
export async function markReturningUserAfterSuccessfulAuth() {
  try {
    await AsyncStorage.setItem(HAS_COMPLETED_APP_AUTHENTICATION_KEY, '1');
  } catch (_) {}
}

/** Після першого успішного входу до головної — без каруселі банерів на холодному старті. */
export async function shouldSkipOnboardingIntroOnColdStart() {
  return getHasUsedAppBefore();
}

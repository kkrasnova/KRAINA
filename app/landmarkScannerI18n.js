import { fillBundleMissingLangs, pickI18n } from './i18nBundle';

function pick(lang, table) {
  return pickI18n(lang, table);
}

const S = {
  nativeCameraMissing: {
    uk: 'Нативний модуль камери недоступний у цій збірці. Зробіть clean і перезберіть Android (наприклад cd android && ./gradlew clean, потім npx react-native run-android).',
    en: 'The camera native module is missing in this build. Run a clean rebuild of the Android app (e.g. cd android && ./gradlew clean, then npx react-native run-android).',
  },
  goBack: {
    uk: 'Назад',
    en: 'Go back',
  },
  needCamera: {
    uk: 'Потрібен доступ до камери, щоб сканувати пам’ятки.',
    en: 'Camera access is required to scan landmarks.',
  },
  grant: {
    uk: 'Надати доступ',
    en: 'Allow',
  },
  analyzing: {
    uk: 'Шукаємо інформацію…',
    en: 'Looking up information…',
  },
  captureHint: {
    uk: 'AR-скан: наведіть пам’ятку в жовту рамку й натисніть затвор. Працює з Wikipedia; з ключем Vision — також за фото.',
    en: 'AR scan: frame the landmark in the yellow box and tap the shutter. Uses Wikipedia; with a Vision key also matches from the photo.',
  },
  more: {
    uk: 'Детальніше',
    en: 'Read more',
  },
  sourceVision: {
    uk: 'Розпізнано за фото (Google Vision + Wikipedia)',
    en: 'Matched from photo (Google Vision + Wikipedia)',
  },
  sourceGeo: {
    uk: 'Найближча стаття Wikipedia за вашим місцем',
    en: 'Nearest Wikipedia article from your location',
  },
  sourceDemo: {
    uk: 'Демо-режим',
    en: 'Demo mode',
  },
  sourceScannerAr: {
    uk: 'AR-скан: камера + Wikipedia / Vision',
    en: 'AR scan: camera + Wikipedia / Vision',
  },
  audioGuide: {
    uk: 'Аудіогід',
    en: 'Audio guide',
  },
  audioPlayingHint: {
    uk: 'Відтворення…',
    en: 'Playing…',
  },
  audioGuideError: {
    uk: 'Не вдалося завантажити аудіогід. Перевірте інтернет або спробуйте пізніше.',
    en: 'Could not load the audio guide. Check your connection or try again later.',
  },
  /** Меню «⋯» на екрані пам’ятки, поки немає додаткових дій. */
  landmarkMoreMenuPlaceholder: {
    uk: 'Додаткові дії з’являться згодом.',
    en: 'More actions will be available later.',
  },
  paramMenuTitle: {
    uk: 'Параметри',
    en: 'Options',
  },
  paramMenuPostStory: {
    uk: 'Зробити пост/сторіз',
    en: 'Create post / story',
  },
  paramMenuSave: {
    uk: 'Зберегти',
    en: 'Save',
  },
  paramMenuUnsave: {
    uk: 'Прибрати зі збережених',
    en: 'Remove from saved',
  },
  paramMenuRoute: {
    uk: 'Прокласти маршрут',
    en: 'Get directions',
  },
  paramMenuSharePublication: {
    uk: 'Поділитись публікацією',
    en: 'Share this page',
  },
  paramMenuShareLocation: {
    uk: 'Поділитись локацією',
    en: 'Share location',
  },
  paramMenuWikipedia: {
    uk: 'Відкрити у Wikipedia',
    en: 'Open in Wikipedia',
  },
  paramMenuReport: {
    uk: 'Повідомити про помилку',
    en: 'Report an error',
  },
  paramMenuNeedLogin: {
    uk: 'Увійдіть у профіль, щоб створити пост.',
    en: 'Sign in to create a post.',
  },
  paramMenuSaveUnavailable: {
    uk: 'Збереження для цієї пам’ятки поки недоступне.',
    en: 'Saving is not available for this landmark yet.',
  },
  paramMenuReportHint: {
    uk: 'Опишіть помилку в підтримці застосунку або надішліть скриншот з екрана «Налаштування».',
    en: 'Describe the issue via app support or send a screenshot from Settings.',
  },
  notInDatabaseBody: {
    uk: 'На жаль, цієї історії ще немає в нашій базі.',
    en: 'Unfortunately, this story is not in our database yet.',
  },
  coordinatesOnMap: {
    uk: '(координати на карті)',
    en: '(coordinates on the map)',
  },
  requestHistory: {
    uk: 'Запросити історію',
    en: 'Request this story',
  },
  requestSent: {
    uk: 'Дякуємо! Заявку отримано — додамо історію згодом.',
    en: 'Thanks! We received your request and will add the story later.',
  },
  requestSavedLocal: {
    uk: 'Заявку збережено локально — синхронізується, коли з’явиться зв’язок із сервером.',
    en: 'Request saved on device — it will sync when the server is available.',
  },
  requestFailed: {
    uk: 'Не вдалося надіслати заявку. Спробуйте ще раз.',
    en: 'Could not send the request. Please try again.',
  },
  needLocationCoords: {
    uk: 'Увімкніть доступ до геолокації, щоб передати координати на карті.',
    en: 'Allow location access to share coordinates on the map.',
  },
  requestSending: {
    uk: 'Надсилаємо…',
    en: 'Sending…',
  },
};

fillBundleMissingLangs(S);

export function ls(lang, key) {
  return pick(lang, S[key] || {});
}

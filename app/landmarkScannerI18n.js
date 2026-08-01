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
  openSettings: {
    uk: 'Налаштування',
    en: 'Settings',
  },
  cancel: {
    uk: 'Скасувати',
    en: 'Cancel',
  },
  cameraDenied: {
    uk: 'Доступ до камери вимкнено. Увімкніть його в налаштуваннях пристрою.',
    en: 'Camera access is off. Enable it in your device settings.',
  },
  analyzing: {
    uk: 'Шукаємо інформацію…',
    en: 'Looking up information…',
  },
  cameraNotReady: {
    uk: 'Камера ще завантажується. Зачекайте секунду й спробуйте знову.',
    en: 'The camera is still loading. Wait a moment and try again.',
  },
  captureFailed: {
    uk: 'Не вдалося зробити знімок. Спробуйте ще раз.',
    en: 'Could not take a photo. Please try again.',
  },
  tapToScan: {
    uk: 'Натисніть синю кнопку сканера внизу по центру',
    en: 'Tap the blue scanner button in the center of the tab bar',
  },
  simulatorScanHint: {
    uk: 'У симуляторі немає камери — натисніть кнопку сканера внизу або оберіть фото з галереї.',
    en: 'No camera in the simulator — tap the scanner button below or pick a photo from the gallery.',
  },
  addFromGallery: {
    uk: 'Обрати з галереї',
    en: 'Pick from gallery',
  },
  cameraError: {
    uk: 'Не вдалося запустити камеру. Спробуйте обрати фото з галереї.',
    en: 'Could not start the camera. Try picking a photo from the gallery.',
  },
  captureHint: {
    uk: '3D Scanner: зробіть фото — ми зчитаємо вашу геопозицію й покажемо інформацію про локацію, якщо вона вже є в базі.',
    en: '3D Scanner: take a photo — we’ll read your geolocation and show info about this place if it exists in our database.',
  },
  more: {
    uk: 'Детальніше',
    en: 'Read more',
  },
  miniSwipeHint: {
    uk: 'Свайп вгору або вліво — детальніше',
    en: 'Swipe up or left for details',
  },
  pagerPrevPage: {
    uk: 'Попередня сторінка',
    en: 'Previous page',
  },
  pagerNextPage: {
    uk: 'Наступна сторінка',
    en: 'Next page',
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
  audioPause: {
    uk: 'Пауза',
    en: 'Pause',
  },
  audioResume: {
    uk: 'Продовжити',
    en: 'Resume',
  },
  audioPrevSlide: {
    uk: 'Попередній слайд',
    en: 'Previous slide',
  },
  audioNextSlide: {
    uk: 'Наступний слайд',
    en: 'Next slide',
  },
  audioScrubber: {
    uk: 'Перемотка аудіогіда',
    en: 'Audio guide scrubber',
  },
  audioSlideCounter: {
    uk: 'Слайд {current} з {total}',
    en: 'Slide {current} of {total}',
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
  actionsShare: {
    uk: 'Поділитись',
    en: 'Share',
  },
  actionsSources: {
    uk: 'Джерела інформації',
    en: 'Information sources',
  },
  actionsSourcesTitle: {
    uk: 'Звідки ця інформація',
    en: 'Where this info comes from',
  },
  actionsSourcesLead: {
    uk: 'Матеріал зібрано з відкритих джерел. Натисніть, щоб відкрити:',
    en: 'Content was collected from public sources. Tap to open:',
  },
  actionsSourcesEmpty: {
    uk: 'Список джерел для цієї локації поки порожній.',
    en: 'No source links are available for this landmark yet.',
  },
  actionsSourcesClose: {
    uk: 'Закрити',
    en: 'Close',
  },
  actionsSourcesOpenSlide: {
    uk: 'Відкрити слайд із джерелами',
    en: 'Open sources slide',
  },
  actionsContinue: {
    uk: 'Продовжити',
    en: 'Continue',
  },
  actionsCategoryMonument: {
    uk: 'Історична памʼятка',
    en: 'Historical landmark',
  },
  actionsCategoryMuseum: {
    uk: 'Музей',
    en: 'Museum',
  },
  actionsCategoryPark: {
    uk: 'Парк',
    en: 'Park',
  },
  actionsCategoryOther: {
    uk: 'Памʼятка',
    en: 'Landmark',
  },
  actionsRouteBuilding: {
    uk: 'Будуємо маршрут…',
    en: 'Building route…',
  },
  actionsRouteFailed: {
    uk: 'Не вдалося побудувати маршрут. Спробуйте ще раз.',
    en: 'Could not build the route. Please try again.',
  },
  actionsRouteNoRoad: {
    uk: 'Немає доступного маршруту для цього транспорту від вашої поточної точки. Спробуйте інший спосіб (пішки / авто / автобус).',
    en: 'No route available for this transport from your current location. Try another mode (walk / car / bus).',
  },
  actionsRoutePickTransport: {
    uk: 'Оберіть, як дістатися до локації. Маршрут побудуємо від вашої реальної геолокації.',
    en: 'Choose how to get there. We’ll build the route from your real location.',
  },
  actionsRouteTooFar: {
    uk: 'Ви далеко від цієї локації (~{km} км). Піша навігація в застосунку працює лише поруч. Відкрити маршрут у Google Maps від вашого місця?',
    en: 'You are far from this place (~{km} km). In-app walking navigation works nearby only. Open Google Maps directions from your location?',
  },
  actionsRouteOpenMaps: {
    uk: 'Відкрити Maps',
    en: 'Open Maps',
  },
  actionsRouteCancel: {
    uk: 'Скасувати',
    en: 'Cancel',
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
  paramMenuShareEmpty: {
    uk: 'Немає тексту для поширення.',
    en: 'Nothing to share yet.',
  },
  paramMenuReportPrompt: {
    uk: 'Надіслати лист у підтримку з даними про цю пам’ятку?',
    en: 'Send an email to support with details about this landmark?',
  },
  paramMenuReportSend: {
    uk: 'Надіслати',
    en: 'Send',
  },
  paramMenuReportCancel: {
    uk: 'Скасувати',
    en: 'Cancel',
  },
  paramMenuReportBodyIntro: {
    uk: 'Повідомлення про помилку в тексті пам’ятки:',
    en: 'Report an error in landmark content:',
  },
  paramMenuReportBodyFooter: {
    uk: 'Опишіть, що саме не так (текст, фото, переклад тощо):',
    en: 'Describe what is wrong (text, photo, translation, etc.):',
  },
  paramMenuReportOk: {
    uk: 'Дякуємо',
    en: 'Thank you',
  },
  notInDatabaseBody: {
    uk: 'На жаль, цієї локації ще немає в нашій базі. Поділіться геопозицією — і ми додамо її найближчим часом.',
    en: 'This location is not in our database yet. Share your geolocation and we’ll add it soon.',
  },
  coordinatesOnMap: {
    uk: '(координати на карті)',
    en: '(coordinates on the map)',
  },
  requestHistory: {
    uk: 'Поділитися геопозицією',
    en: 'Share my location',
  },
  requestSent: {
    uk: 'Дякуємо! Ми отримали вашу геопозицію — додамо цю локацію найближчим часом.',
    en: 'Thanks! We received your location — we’ll add this place soon.',
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
    uk: 'Увімкніть «Геолокація» для KRAÏNA. Кнопка відкриє саме сторінку цього застосунку в Налаштуваннях — не шукайте вручну. Потім поверніться сюди.',
    en: 'Turn on Location for KRAÏNA. The button opens this app’s Settings page directly. Then return here.',
  },
  needGpsFix: {
    uk: 'Дозвіл на геолокацію вже є, але координати ще не отримано. Зачекайте кілька секунд і натисніть «Спробувати ще» (на симуляторі увімкніть Features → Location).',
    en: 'Location permission is already on, but we still don’t have coordinates. Wait a moment and tap Retry (on Simulator: Features → Location).',
  },
  openLocationSettings: {
    uk: 'Відкрити KRAÏNA',
    en: 'Open KRAÏNA Settings',
  },
  locationRetry: {
    uk: 'Спробувати ще',
    en: 'Retry',
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

import { fillBundleMissingLangs, pickI18n } from './i18nBundle';

function pick(lang, table) {
  return pickI18n(lang, table);
}

const S = {
  nativeCameraMissing: {
    uk: 'Модуль камери недоступний у цій збірці. Перезберіть Android-додаток (clean + run-android).',
    en: 'Camera module is missing in this build. Rebuild the Android app (clean + run-android).',
  },
  goBack: { uk: 'Назад', en: 'Go back' },
  needCamera: {
    uk: 'Потрібен доступ до камери для зйомки.',
    en: 'Camera access is required to take photos.',
  },
  grant: { uk: 'Дозволити', en: 'Allow' },
  story: { uk: 'Історія', en: 'Story' },
  publication: { uk: 'Публікація', en: 'Post' },
  addDescription: { uk: 'Додайте опис…', en: 'Add a description…' },
  share: { uk: 'Поділитись', en: 'Share' },
  shareStory: { uk: 'Поділитись історією', en: 'Share story' },
  next: { uk: 'Далі', en: 'Next' },
  newPublication: { uk: 'Нова публікація', en: 'New post' },
  publicationTitle: { uk: 'Публікація', en: 'Post' },
  addFromGallery: { uk: 'Додати з галереї', en: 'Add from gallery' },
  addCity: { uk: 'Додати місто', en: 'Add city' },
  markOnMap: { uk: 'Відмітити на карті', en: 'Mark on map' },
  captionPlaceholder: { uk: 'Напишіть свою історію…', en: 'Write your story…' },
  publish: { uk: 'Опублікувати', en: 'Publish' },
  search: { uk: 'Пошук', en: 'Search' },
  selectPlace: { uk: 'Обрати місце', en: 'Select place' },
  userPin: { uk: 'Пам’ятка користувача', en: 'Your place' },
  cityTitle: { uk: 'Місто / місце', en: 'City or place' },
  cityPlaceholder: { uk: 'Наприклад, Київ', en: 'e.g. Kyiv' },
  saveCity: { uk: 'Зберегти', en: 'Save' },
  cancel: { uk: 'Скасувати', en: 'Cancel' },
  galleryDenied: {
    uk: 'Потрібен доступ до фотогалереї.',
    en: 'Photo library access is required.',
  },
  openSettings: { uk: 'Налаштування', en: 'Settings' },
  pinchZoomHint: {
    uk: 'Зведіть / розведіть два пальці в області прев’ю, щоб наблизити.',
    en: 'Pinch on the preview to zoom in or out.',
  },
  pickError: { uk: 'Не вдалося обрати фото.', en: 'Could not pick photos.' },
  publishOk: { uk: 'Публікація збережена.', en: 'Your post is published.' },
  attachSavedRoute: { uk: 'Маршрут зі збережених', en: 'Attach saved route' },
  routeAttachedHint: { uk: 'До поста додано маршрут — кнопка «Маршрут» відкриє його для інших.', en: 'A route is attached — the Route button opens it for others.' },
  clearRoute: { uk: 'Прибрати маршрут', en: 'Remove route' },
  pickRouteTitle: { uk: 'Оберіть маршрут', en: 'Pick a route' },
  noSavedRoutes: {
    uk: 'Немає збережених маршрутів. Збережіть маршрут на екрані результатів пошуку.',
    en: 'No saved routes yet. Save a route from the route results screen.',
  },
  storyOk: { uk: 'Історія додана.', en: 'Story added.' },
  geocodeNoKey: {
    uk: 'Додайте googleMapsApiKey у app.json (Geocoding API), щоб працював пошук міста на карті.',
    en: 'Add googleMapsApiKey in app.json (Geocoding API) to enable city search on the map.',
  },
  geocodeEmpty: { uk: 'Нічого не знайдено. Спробуйте інший запит.', en: 'Nothing found. Try a different query.' },
  searchHint: {
    uk: 'Введіть щонайменше 2 символи для пошуку.',
    en: 'Type at least 2 characters to search.',
  },
  tapMapToPlace: {
    uk: 'Знайдіть місце в пошуку або пальцем поставте точку на карті, потім натисніть «Обрати місце».',
    en: 'Search to move the map, then tap the map to place your pin. Tap Select place when done.',
  },
  backToPost: { uk: 'Назад до публікації', en: 'Back to post' },
};

fillBundleMissingLangs(S);

export function fc(lang, key) {
  return pick(lang, S[key] || {});
}

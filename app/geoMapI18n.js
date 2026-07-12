/** Рядки геомодуля (карта + пошук + маршрут). */
import { fillBundleMissingLangs, pickI18n } from './i18nBundle';

const STR = {
  mapTab: { uk: 'Карта', en: 'Map' },
  plannerTab: { uk: 'Маршрут', en: 'Route' },
  searchPlaceholder: { uk: 'Місто, адреса, заклад…', en: 'City, address, place…' },
  searchHint: {
    uk: 'Введіть від 2 символів — знайдемо будь-де у світі',
    en: 'Type 2+ characters — search anywhere in the world',
  },
  searchWorldSource: { uk: 'По всьому світу', en: 'Worldwide' },
  searchCatalogSource: { uk: 'KRAÏNA', en: 'KRAÏNA' },
  tapMapHint: { uk: 'Торкніться карти, щоб додати точку', en: 'Tap the map to add a point' },
  routeReadyHint: {
    uk: 'Маршрут готовий — натисніть «Іти» внизу',
    en: 'Route is ready — tap Go at the bottom',
  },
  needOneMore: {
    uk: 'Додайте ще одну точку на карті',
    en: 'Add one more point on the map',
  },
  customPoint: { uk: 'Обрана точка', en: 'Selected point' },
  startWalk: { uk: 'Почати прогулянку', en: 'Start walking' },
  goWalk: { uk: 'Іти', en: 'Go' },
  openInMaps: { uk: 'Відкрити в Google Maps', en: 'Open in Google Maps' },
  noResults: { uk: 'Нічого не знайдено', en: 'Nothing found' },
  searchFailed: {
    uk: 'Не вдалося виконати пошук. Перевірте з’єднання та спробуйте ще раз.',
    en: 'Search failed. Check your connection and try again.',
  },
  searchRetry: { uk: 'Спробувати знову', en: 'Try again' },
  apiOffline: { uk: 'Немає зв’язку з сервером (перевірте API та мережу)', en: 'Cannot reach the server (check API and network)' },
  catalogEmpty: {
    uk: 'У каталозі ще немає опублікованих локацій — додайте їх у адмінці або застосуйте міграції з сідами.',
    en: 'No published locations in the catalog yet — add them in admin or apply seed migrations.',
  },
  routePoints: { uk: 'Точки маршруту', en: 'Route points' },
  addHint: { uk: 'Торкніться маркера або рядка в списку', en: 'Tap a marker or a list row' },
  buildRoute: { uk: 'Показати на карті', en: 'Show on map' },
  clearRoute: { uk: 'Скинути', en: 'Clear' },
  openCard: { uk: 'Картка', en: 'Details' },
  recenter: { uk: 'Моя позиція', en: 'My location' },
  routeLoading: { uk: 'Будуємо маршрут…', en: 'Building route…' },
  routeKm: { uk: 'км', en: 'km' },
  routeMin: { uk: 'хв', en: 'min' },
  needTwo: { uk: 'Оберіть щонайменше дві точки', en: 'Pick at least two points' },
  mapsKeyHint: { uk: 'Додайте ключ Google Maps у збірку для дорожньої лінії', en: 'Add a Google Maps API key for the road polyline' },
  navigate: { uk: 'Навігація', en: 'Navigate' },
  savedPlaces: { uk: 'Збережені', en: 'Saved' },
  noSaved: { uk: 'Немає збережених локацій', en: 'No saved locations' },
  mapLoading: { uk: 'Завантажуємо карту…', en: 'Loading map…' },
  mapLoadFailed: {
    uk: 'Карта не відобразилась. Натисніть, щоб оновити.',
    en: 'Map did not load. Tap to refresh.',
  },
  mapRetry: { uk: 'Оновити карту', en: 'Refresh map' },
};

fillBundleMissingLangs(STR);

export function gm(lang, key) {
  const row = STR[key];
  if (!row) return key;
  const s = pickI18n(lang, row);
  return s || key;
}

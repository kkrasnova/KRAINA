import { fillBundleMissingLangs, pickI18n } from './i18nBundle';

function pick(lang, table) {
  return pickI18n(lang, table);
}

const S = {
  findRoute: {
    uk: 'Генерація маршруту',
    en: 'Generate a route',
  },
  placePlaceholder: {
    uk: 'Напр.: Поділ, Центр Києва',
    en: 'e.g. Podil, Kyiv centre',
  },
  hoursPlaceholder: {
    uk: '6 годин',
    en: '6 hours',
  },
  transportSection: {
    uk: 'Транспорт',
    en: 'Transport',
  },
  navActions: {
    uk: 'Дії',
    en: 'Actions',
  },
  freeRoutes: {
    uk: 'Безкоштовні маршрути',
    en: 'Free routes only',
  },
  budgetSection: {
    uk: 'Бюджет поїздки',
    en: 'Trip budget',
  },
  budgetFree: {
    uk: 'Безкоштовно',
    en: 'Free',
  },
  budgetLow: {
    uk: 'До 200 грн',
    en: 'Up to 200 UAH',
  },
  budgetMid: {
    uk: 'До 500 грн',
    en: 'Up to 500 UAH',
  },
  budgetPremium: {
    uk: 'Преміум',
    en: 'Premium',
  },
  interestsSection: {
    uk: 'Інтереси в маршруті',
    en: 'Route interests',
  },
  interestLandmark: {
    uk: "Пам'ятки",
    en: 'Landmarks',
  },
  interestPark: {
    uk: 'Парки',
    en: 'Parks',
  },
  interestMuseum: {
    uk: 'Музеї',
    en: 'Museums',
  },
  interestCafe: {
    uk: 'Кафе',
    en: 'Cafés',
  },
  interestArchitecture: {
    uk: 'Вулична архітектура',
    en: 'Street architecture',
  },
  interestSecret: {
    uk: 'Таємні місця',
    en: 'Secret places',
  },
  timeSection: {
    uk: 'Скільки у вас часу?',
    en: 'How much time do you have?',
  },
  time1h: { uk: '1 година', en: '1 hour' },
  time2h: { uk: '2 години', en: '2 hours' },
  time3h: { uk: '3 години', en: '3 hours' },
  timeHalfDay: { uk: 'Пів дня', en: 'Half day' },
  timeFullDay: { uk: 'Цілий день', en: 'Full day' },
  timeWeekend: { uk: 'Вихідні', en: 'Weekend' },
  time3days: { uk: '3 дні', en: '3 days' },
  timeWeek: { uk: 'Тиждень', en: 'Week' },
  time10days: { uk: '10 днів', en: '10 days' },
  generateRoute: {
    uk: 'Згенерувати маршрут',
    en: 'Generate route',
  },
  search: {
    uk: 'Пошук',
    en: 'Search',
  },
  anotherRoute: {
    uk: 'Інший маршрут',
    en: 'Another route',
  },
  choose: {
    uk: 'Обрати',
    en: 'Choose',
  },
  km: {
    uk: 'км',
    en: 'km',
  },
  m: {
    uk: 'м',
    en: 'm',
  },
  locations: {
    uk: 'локації',
    en: 'places',
  },
  minShort: {
    uk: 'хв',
    en: 'min',
  },
  onTheWay: {
    uk: 'В дорогу',
    en: 'Let’s go',
  },
  historyRadius: {
    uk: '(Історія доступна в радіусі 100 метрів)',
    en: '(Story unlocks within 100 meters)',
  },
  changePath: {
    uk: 'Змінити шлях',
    en: 'Change route',
  },
  walk: {
    uk: 'Пішки',
    en: 'Walk',
  },
  drive: {
    uk: 'Авто',
    en: 'Drive',
  },
  hintRegion: {
    uk: 'Місто, район або ваша геолокація — підберемо піший маршрут під ваш час.',
    en: 'City, district, or your location — we’ll plan a walking route for your time.',
  },
  noStops: {
    uk: 'Не вдалося скласти маршрут. Спробуйте більше годин або ширший набір інтересів.',
    en: 'Could not build a route. Try more hours or broader interests.',
  },
  myLocation: {
    uk: 'Моє місцеположення',
    en: 'My location',
  },
  myLocationHint: {
    uk: 'Старт маршруту з вашої геолокації (якщо дозволено).',
    en: 'Start the route from your location (if allowed).',
  },
  locationOff: {
    uk: 'Геолокація вимкнена — маршрут від першої пам’ятки в місті.',
    en: 'Location off — route starts from the first landmark in the city.',
  },
  openGoogleMaps: {
    uk: 'Відкрити в Google Maps',
    en: 'Open in Google Maps',
  },
  startTrip: {
    uk: 'В дорогу',
    en: 'Start trip',
  },
  previewRoute: {
    uk: 'Переглянути',
    en: 'Preview',
  },
  farFromCityHint: {
    uk: 'Ви далеко від міста — маршрут починається з першої пам’ятки.',
    en: 'You are far from the city — the route starts at the first landmark.',
  },
  etaToStop: {
    uk: '~{min} хв до зупинки',
    en: '~{min} min to stop',
  },
  rerouting: {
    uk: 'Перебудовуємо маршрут…',
    en: 'Rerouting…',
  },
  tapMapToWalk: {
    uk: 'Натисніть на карту, щоб стати на маршрут і піти пішки',
    en: 'Tap the map to stand on the route and start walking',
  },
  tapMapWalkActive: {
    uk: 'Рухайтеся за жовтою лінією на карті',
    en: 'Follow the yellow line on the map',
  },
  fitFullRoute: {
    uk: 'Весь маршрут',
    en: 'Full route',
  },
  headingTo: {
    uk: 'Рух до',
    en: 'Heading to',
  },
  shareRoute: {
    uk: 'Поділитись маршрутом',
    en: 'Share route',
  },
  recenterMap: {
    uk: 'Моя позиція на карті',
    en: 'My position on map',
  },
  loadingRoutePath: {
    uk: 'Будуємо шлях…',
    en: 'Building route…',
  },
  skipRoute: {
    uk: 'Пропустити маршрут',
    en: 'Skip route',
  },
  viewHistory: {
    uk: 'Переглянути історію',
    en: 'View story',
  },
  metersToHistory: {
    uk: 'До історії',
    en: 'To story',
  },
  navFollowMap: {
    uk: 'Рухайтеся за жовтою лінією на карті.',
    en: 'Follow the yellow line on the map.',
  },
  addMapsKeyHint: {
    uk: 'Додайте googleMapsApiKey у app.json (Directions API), щоб лінія маршруту збігалася з дорогами.',
    en: 'Add googleMapsApiKey in app.json (Directions API) to snap the route to roads.',
  },
  moveCloserForHistory: {
    uk: 'Підійдіть ближче до пам’ятки (до 100 м), щоб відкрити історію.',
    en: 'Move closer to the landmark (within 100 m) to open the story.',
  },
  historyToGo: {
    uk: 'До історії {dist} м',
    en: '{dist} m to story',
  },
  stopProgress: {
    uk: 'Зупинка {current} з {total}',
    en: 'Stop {current} of {total}',
  },
  routeCompleteTitle: {
    uk: 'Маршрут пройдено',
    en: 'Route complete',
  },
  routeCompleteBody: {
    uk: 'Ви відвідали {stops} місць і заробили {xp} балів.',
    en: 'You visited {stops} places and earned {xp} points.',
  },
  routeAutoOpenHint: {
    uk: 'Підійдіть на 50 м — історія відкриється автоматично.',
    en: 'Come within 50 m — the story opens automatically.',
  },
  aiRouteButton: {
    uk: 'ШІ-маршрут (каталог)',
    en: 'AI route (catalog)',
  },
  aiRouteHint: {
    uk: 'Зупинки з опублікованих локацій на сервері. Без OPENAI_API_KEY — безкоштовний порядок по відстані; з ключем (OpenAI або Groq) — підказка моделі.',
    en: 'Stops from published locations on the server. Without OPENAI_API_KEY a free distance-based order runs; with a key (OpenAI or Groq) the model suggests the order.',
  },
  aiBuilding: {
    uk: 'Складаємо маршрут…',
    en: 'Building your route…',
  },
  buildingStepCatalog: {
    uk: 'Шукаємо локації…',
    en: 'Finding places…',
  },
  buildingStepRoute: {
    uk: 'Будуємо маршрут…',
    en: 'Building route…',
  },
  aiNoStops: {
    uk: 'Немає даних у каталозі або запит занадто вузький. Додайте локації в адмінці або змініть пошук.',
    en: 'No catalog data or query too narrow. Publish locations in admin or widen the search.',
  },
  aiFail: {
    uk: 'Не вдалося отримати маршрут. Перевірте мережу та бекенд.',
    en: 'Could not fetch the route. Check network and backend.',
  },
};

fillBundleMissingLangs(S);

export function rp(lang, key, vars) {
  let s = pick(lang, S[key] || {});
  if (vars && typeof vars === 'object') {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return s;
}

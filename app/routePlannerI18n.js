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
  walkShort: {
    uk: 'Пішки',
    en: 'Walk',
  },
  bikeShort: {
    uk: 'Вело',
    en: 'Bike',
  },
  driveShort: {
    uk: 'Авто',
    en: 'Car',
  },
  busShort: {
    uk: 'Автобус',
    en: 'Bus',
  },
  routeUnlockTeaser: {
    uk: 'Історії місць відкриються за 50 м — як живий гід на місці.',
    en: 'Place stories unlock at 50 m — like a live guide on the spot.',
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
    uk: 'Історія місця відкривається за 50 м. Доти кнопка заблокована — натисніть, щоб побачити, скільки лишилось.',
    en: 'The place story unlocks at 50 m. Until then the button stays locked — tap to see how far is left.',
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
  bike: {
    uk: 'Велосипед',
    en: 'Bicycle',
  },
  bus: {
    uk: 'Автобус',
    en: 'Bus',
  },
  train: {
    uk: 'Поїзд',
    en: 'Train',
  },
  hintRegion: {
    uk: 'Місто, район або ваша геолокація — підберемо маршрут під ваш час.',
    en: 'City, district, or your location — we’ll plan a route for your time.',
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
    uk: 'Натисніть на карту, щоб стати на маршрут і почати рух',
    en: 'Tap the map to stand on the route and start navigation',
  },
  tapMapWalkActive: {
    uk: 'Камера слідує за маршрутом',
    en: 'Camera follows the route',
  },
  pinchMapHint: {
    uk: 'Натисніть ▶ або пішехода — вид з-за спини',
    en: 'Tap ▶ or the walker for a behind-the-back view',
  },
  autoWalking: {
    uk: 'Рухаємося по синій лінії',
    en: 'Following the blue route line',
  },
  zoomInMap: {
    uk: 'Наблизити',
    en: 'Zoom in',
  },
  followWalker: {
    uk: 'Слідкувати за пешеходом',
    en: 'Follow walker',
  },
  youAreHere: {
    uk: 'Ви тут',
    en: 'You are here',
  },
  tapFollowCamera: {
    uk: 'Натисніть — камера слідує за вами',
    en: 'Tap — camera follows you',
  },
  navGoalPin: {
    uk: 'Ціль',
    en: 'Goal',
  },
  followBlueRoute: {
    uk: 'Йдіть по синій лінії',
    en: 'Follow the blue line',
  },
  posModeGps: {
    uk: 'Ваш GPS',
    en: 'Your GPS',
  },
  posModeManual: {
    uk: 'Вручну на карті',
    en: 'Placed on map',
  },
  tapMapToMove: {
    uk: 'Натисніть або перетягніть маркер — переставити себе',
    en: 'Tap the map or drag the marker to move yourself',
  },
  switchToGps: {
    uk: 'Знову GPS',
    en: 'Use GPS again',
  },
  zoomOutMap: {
    uk: 'Віддалити',
    en: 'Zoom out',
  },
  zoomToTurn: {
    uk: 'Приблизити поворот',
    en: 'Zoom to turn',
  },
  tapTurnToZoom: {
    uk: 'Натисніть пішехода — вид з-за спини',
    en: 'Tap the walker for a behind-the-back view',
  },
  fitFullRoute: {
    uk: 'Весь маршрут',
    en: 'Full route',
  },
  headingTo: {
    uk: 'Рух до',
    en: 'Heading to',
  },
  goThisWay: {
    uk: 'Йдіть сюди',
    en: 'Go this way',
  },
  followBlueLine: {
    uk: 'Рухайтеся по синій лінії на карті',
    en: 'Follow the blue line on the map',
  },
  navThenStreet: {
    uk: 'Далі по вулиці',
    en: 'Then follow the street',
  },
  navEtaBanner: {
    uk: '{eta} хв · {dist} до цілі',
    en: '{eta} min · {dist} to destination',
  },
  navGpsActive: {
    uk: 'Навігація за GPS',
    en: 'GPS navigation',
  },
  walkTowardStop: {
    uk: '{dist} — до «{stop}»',
    en: '{dist} — toward «{stop}»',
  },
  navTooFarNoSteps: {
    uk: 'Підійдіть ближче — тоді з’являться повороти: ліворуч / праворуч / прямо',
    en: 'Move closer — then you’ll get turns: left / right / straight',
  },
  navWaitingDirections: {
    uk: 'Будуємо покроковий маршрут…',
    en: 'Building turn-by-turn directions…',
  },
  navRerouting: {
    uk: 'Ви зійшли з маршруту — будуємо новий шлях звідси…',
    en: 'You’re off the route — rebuilding from here…',
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
  skipRouteConfirm: {
    uk: 'Повернутися назад чи згенерувати інший варіант?',
    en: 'Go back or generate another option?',
  },
  routeForTrip: {
    uk: 'Маршрут для подорожі',
    en: 'Route for your trip',
  },
  routeChoiceHint: {
    uk: '✕ біля зупинки — пропустити. «Обрати» — наступний крок.',
    en: '✕ on a stop — skip it. «Choose» — next step.',
  },
  notThisRoute: {
    uk: 'Не підходить',
    en: 'Not for me',
  },
  chooseRoute: {
    uk: 'Обрати',
    en: 'Choose',
  },
  scrollStopsHint: {
    uk: 'Листайте список · ✕ прибрати з маршруту',
    en: 'Scroll the list · ✕ to remove from route',
  },
  chooseRouteSaved: {
    uk: 'Маршрут збережено. Натисніть «В дорогу», коли будете готові.',
    en: 'Route saved. Tap «Start trip» when you are ready.',
  },
  exitNavigation: {
    uk: 'Вийти з навігації',
    en: 'Exit navigation',
  },
  goBack: {
    uk: 'Назад',
    en: 'Go back',
  },
  skipStop: {
    uk: 'Пропустити локацію',
    en: 'Skip this stop',
  },
  restoreStop: {
    uk: 'Повернути',
    en: 'Restore',
  },
  stopSkipped: {
    uk: 'Пропущено',
    en: 'Skipped',
  },
  needOneStop: {
    uk: 'Залиште хоча б одну зупинку в маршруті',
    en: 'Keep at least one stop in the route',
  },
  allStopsSkipped: {
    uk: 'Усі локації пропущено',
    en: 'All locations were skipped',
  },
  remainingStops: {
    uk: 'Залишилось {count} локацій',
    en: '{count} locations left',
  },
  viewHistory: {
    uk: 'Переглянути історію',
    en: 'View story',
  },
  tapBannerForHistory: {
    uk: 'Натисніть сюди або кнопку внизу',
    en: 'Tap here or the button below',
  },
  metersToHistory: {
    uk: 'До місця',
    en: 'To place',
  },
  navFollowMap: {
    uk: 'Рухайтеся за лінією маршруту на карті.',
    en: 'Follow the route line on the map.',
  },
  addMapsKeyHint: {
    uk: 'Додайте googleMapsApiKey у app.json (Directions API), щоб лінія маршруту збігалася з дорогами.',
    en: 'Add googleMapsApiKey in app.json (Directions API) to snap the route to roads.',
  },
  moveCloserForHistory: {
    uk: 'Підійдіть ближче (до 50 м), щоб відкрити історію цього місця.',
    en: 'Move closer (within 50 m) to open this place’s story.',
  },
  historyLockedTitle: {
    uk: 'Зараз заблоковано',
    en: 'Currently locked',
  },
  historyLockedHint: {
    uk: 'Історію можна відкрити лише за {unlock} м від місця.\n\nЗалишилось ще {dist}. Підійдіть ближче — тоді «Переглянути історію» відкриється.',
    en: 'The story unlocks only within {unlock} m of the place.\n\n{dist} left. Move closer — then «View story» will open.',
  },
  historyToGo: {
    uk: 'Заблоковано · ще {dist}',
    en: 'Locked · {dist} left',
  },
  historyApproachHint: {
    uk: 'Через ~50 м ви зможете подивитись історію про «{stop}». Залишилось {dist}.',
    en: 'In ~50 m you can open the story about «{stop}». {dist} left.',
  },
  historyUnlockedHint: {
    uk: 'Ви вже біля місця — відкрийте історію. Назад у будь-який момент поверне на маршрут.',
    en: 'You’re at the place — open the story. Back anytime returns to the route.',
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
    uk: 'За 50 м з’явиться кнопка — відкрийте історію місця.',
    en: 'At 50 m a button appears — open the place story.',
  },
  audioGuide: {
    uk: 'Аудіогід',
    en: 'Audio guide',
  },
  audioGuideOn: {
    uk: 'Аудіогід увімкнено — розповідаємо історію вулиць і будинків по дорозі',
    en: 'Audio guide on — stories about streets and buildings along the way',
  },
  audioGuideOff: {
    uk: 'Аудіогід вимкнено',
    en: 'Audio guide off',
  },
  audioGuideLoading: {
    uk: 'Шукаємо історію поруч…',
    en: 'Looking up nearby history…',
  },
  audioGuidePlaying: {
    uk: 'Аудіогід',
    en: 'Audio guide',
  },
  audioGuideEmpty: {
    uk: 'Поруч поки немає статті — йдіть далі, спробуємо знову.',
    en: 'No nearby story yet — keep walking, we’ll try again.',
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

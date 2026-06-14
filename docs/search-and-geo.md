

KRAÏNA задовольняє обидва підпункти вимоги «Пошук АБО геопросторовий модуль»:

- **Геопросторовий модуль** — карта з відображенням знайдених локацій, побудовою маршруту між точками, навігацією через Google Directions і визначенням позиції користувача.
- **Пошук у застосунку через текстове поле з індексуванням** — універсальний пошук по країнах / містах / пам’ятках / профілях з токенізацією, кешуванням і повнотекстовим індексом на бекенді (PostgreSQL FTS, GIN).








| Файл                                                                | Призначення                                                                                                  |
| 
| `[app/HomeSearchBar.js](../app/HomeSearchBar.js)`                   | Універсальне поле пошуку (light/dark, бейдж-іконка, фокус-стейт).                                            |
| `[app/LightHomeCountrySearch.js](../app/LightHomeCountrySearch.js)` | «Лінза» пошуку на головній: фільтри (країни/міста/локації), історія запитів, чипи, геолокація → місто.       |
| `[app/homeUnifiedSearch.js](../app/homeUnifiedSearch.js)`           | Побудова рядків результатів, мердж локальних рядів і профілів, фільтрація за типом.                          |
| `[app/countrySearch.js](../app/countrySearch.js)`                   | Нормалізація запиту, транслітерація Cyr↔Lat, варіанти клавіатур, токенізатор `multiFieldMatchesSearchQuery`. |
| `[app/locationsApi.js](../app/locationsApi.js)`                     | In-memory кеш + токенізований індекс опублікованих локацій (`buildIndex`, `searchLocationsPublished`).       |




1. Запит нормалізується (`NFD` + видалення діакритики + lower-case + видалення пунктуації).
2. Будуються три варіанти токенів запиту:
  - `base` (нормалізований),
  - `cyrToLat` (наприклад, `Львів` → `lviv`),
  - `cyrillicKeyboardVariants` (рос./укр. розкладка: `и` ↔ `і`).
3. Для кожного поля об’єкта (назва, місто, країна, опис, story-чанки) будуються ті самі форми.
4. Збіг — `AND` по всіх токенах запиту, `OR` по полях/формах. Короткі (`<= 2`) токени матчаться через `startsWith`, інші — через `includes`.
5. Локальний індекс будується один раз і повторно використовується (`catalogIndex`); кеш живе 5 хв.

Приклади, які гарантовано спрацьовують:

- `lviv` → знаходить «Львів» (Cyr→Lat).
- `исп` (рос. розкладка) → «Іспанія» (`и` ↔ `і`, alias `испания`).
- `cathedral` → «Софійський собор», «Sofia Cathedral» (поле `descEn`).



- `[backend/src/routes/locationsRoutes.ts](../backend/src/routes/locationsRoutes.ts)` — `GET /api/locations/search?q=…&limit=…`.
- `[backend/src/services/locationsCrudService.ts](../backend/src/services/locationsCrudService.ts)` — `searchPublishedLocationsFTS` через `plainto_tsquery('simple', :q)` + ранжування `ts_rank_cd`.
- `[backend/src/migrations/sql/016_locations_fts_index.sql](../backend/src/migrations/sql/016_locations_fts_index.sql)` — GIN-індекс на `to_tsvector('simple', title || city || country)`.

```sql
CREATE INDEX IF NOT EXISTS locations_fts_document_idx ON locations USING gin (
  to_tsvector(
    'simple',
    coalesce(title, '') || ' ' || coalesce(city, '') || ' ' || coalesce(country, '')
  )
);
```

Перевірка:

```bash
curl "http://localhost:3000/api/locations/search?q=sofia&limit=10"

```



`LightHomeCountrySearch` зберігає до 8 останніх запитів у `AsyncStorage` під ключем `home.search.recent.names.v1:<identity>` (per-user). Чипи відображаються в «лінзі» пошуку, окрема дія `Очистити` стирає історію.








| Файл                                                  | Опис                                                                                         |
| 
| `[app/MapTabPage.js](../app/MapTabPage.js)`           | Вкладка «Карта/Маршрут» у `HomeTabPager` з перемикачем сегментів.                            |
| `[app/GeoMapExplorer.js](../app/GeoMapExplorer.js)`   | Основний геомодуль: карта `react-native-maps`, маркери, пошук, побудова маршруту, навігація. |
| `[app/ExploreMapPage.js](../app/ExploreMapPage.js)`   | Повноекранна версія геомодуля зі стеку (відкривається з налаштувань / посилань).             |
| `[app/RouteFinderPage.js](../app/RouteFinderPage.js)` | Класичний планувальник маршрутів KRAÏNA (категорія, тривалість, бюджет).                     |




- **Відображення локацій пошуку**. Поки користувач не ввів запит — на карті світяться `250` опублікованих маркерів каталогу (UA-міста йдуть першими, бо стартовий центр = `UA_CENTER`). Коли вводиться `>= 2` символів — маркери замінюються на результати пошуку.
- **Список «Популярні локації»**. Без вводу запиту під полем пошуку видно топ-12 локацій каталогу, відсортованих за відстанню до центру України або до позиції користувача. Будь-який рядок одразу додає точку в маршрут — мапа з тайлами не обов’язкова.
- **Швидкий маршрут одним тапом**. Кнопка `Швидкий маршрут` у нижньому листку додає 5 найближчих точок із каталогу до маршруту, після чого `Polyline` малюється автоматично — зручно для демонстрації.
- **Побудова маршруту**. Тап по маркеру / рядку списку додає точку в маршрут (до 12 точок). Видно порядок (`1. Lviv → 2. Rynok Square → …`) та сегменти `Polyline`.
- **Реальний шлях**. Якщо є Google Maps API key, викликається `fetchGoogleDirectionsPolyline` (`mode=walk`) — отримуємо реальну ламану + дистанцію + час. Без ключа малюємо пунктирну пряму між точками.
- **Навігація назовні**. Кнопка «Навігація» викликає `openGoogleMapsDirections` — відкриває нативний Google Maps із побудованим маршрутом.
- **Геолокація користувача**. `expo-location` запитує дозвіл, підписується на `watchPositionAsync` (інтервал 8с / 30м) і центрує карту по тапу на FAB `locate`.
- **Збережені пам’ятки** на карті. Окремий FAB перемикає панель з улюбленими локаціями користувача (`getSavedLandmarks`). Тап додає в маршрут.
- **Зворотна геокодеризація**. У головному пошуку кнопка «Визначити мою геолокацію» (`Location.reverseGeocodeAsync` + `nearestCityFromCoords` як fallback) знаходить найближче місто з каталогу і ставить його як scope пошуку.



1. Користувач відкриває вкладку **Карта**.
2. Без вводу — бачить топ-12 «Популярні локації» (відсортовані по відстані) і кнопку **Швидкий маршрут** (5 найближчих точок).
3. Або вводить запит у пошуковому полі — список фільтрується + маркери на карті оновлюються.
4. Тап по маркеру / рядку списку / `Швидкий маршрут` додає точки в маршрут — на карті малюється `Polyline`.
5. Внизу видно `routePoints` (порядок), кнопки `Очистити` / `Побудувати маршрут` / `Навігація`.
6. `Побудувати маршрут` (≥ 2 точки) викликає `fitAll` — карта вписує всі точки в один кадр.
7. `Навігація` відкриває Google Maps із готовим маршрутом.



Окрема вкладка «Маршрут» (`RouteFinderPage`) генерує цілий план поїздки:

- AI-сугестор `postSuggestAiRoute` (бекенд) повертає готовий `routePlan`.
- Якщо AI недоступний — клієнт сам будує план з `fetchPublishedLocations(160…500)` через `buildPlanFromPublishedLocations`: фільтрація за категорією/інтересами/бюджетом, оцінка релевантності (`textMatchScore` + `proximityScore`), пошук стартової точки і greedy-вибір наступних так, щоб укластись у бюджет часу (з урахуванням `transport`).
- Як остання лінія оборони — `buildRoutePlan` з `routePlannerCore` працює лише в межах одного `ROUTE_REGIONS` (Київ, Львів, Париж, Рим…).



`app/locationsApi.js` будує **локальний каталог** з `ROUTE_REGIONS` (Київ, Львів, Одеса, Париж, Рим, Берлін, Варшава, Амстердам, Рига, Вільнюс, Бухарест, Єреван — кожне місто з landmark’ами та lat/lng).

- При запуску застосунку: запитується Firestore `locations`, paged до 800 документів.
- Якщо Firestore не відповів (offline / порожня колекція / помилка правил) — **повертається локальний індекс**, тому карта одразу показує маркери і пошук повертає реальні рядки.
- Якщо Firestore відповів — локальні рядки **дописуються** після видалених дублікатів (унікальність по `id`).

Це робить геомодуль стійким до проблем мережі, нової установки або порожньої БД.



`firestore.rules`:

```firebase
match /locations/{locationId} {
  allow read: if true;   
  allow write: if false; 
}
```

`firestore.indexes.json` — складених індексів не потребує: запит `where('published','==',true)` обмежується одним полем і автоматично індексується Firestore.



- `react-native-maps` (Apple Maps на iOS, Google Maps на Android).
- `expo-location` (дозвіл `ACCESS_FINE_LOCATION`/`NSLocationWhenInUseUsageDescription`).
- Google Maps Directions API: ключ через `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` або `app/googleMapsRoute.js → getGoogleMapsApiKey()`.
- Apple/Google billing і ключі — `app/google-services.json`, `GoogleService-Info.plist`.







1. `cd app && npx expo start` (або `npm run ios` / `npm run android`).
2. На головній: тапнути по полю пошуку → ввести `киев`, `lviv`, `cathedral`, `италия` — лінза показує групи `Країна / Місто / Локація`.
3. Перейти на вкладку **Карта** → під полем пошуку відразу видно **Популярні локації** (топ-12 поруч із UA-центром або вашою позицією).
4. Натиснути **Швидкий маршрут** → у маршрут одразу додаються 5 найближчих точок, на карті малюється `Polyline`.
5. Або ввести `lviv` → у списку з’являться локації Львова, маркери відфільтруються; тапнути 2 рядки/маркери → видно маршрут.
6. Натиснути **Побудувати шлях** → камера вписує всі точки в один кадр; **Навігація** → відкриває Google Maps.
7. Перейти на вкладку **Маршрут** → ввести місто (`Київ`, `Lviv`, `Paris` …), задати час/інтереси/бюджет → **Згенерувати маршрут** → відкриється `RouteResults` з готовим планом.



```bash
cd backend
npm run dev

curl "http://localhost:3000/api/locations/search?q=sofia&limit=5" | jq
curl "http://localhost:3000/api/locations?city=Kyiv&limit=5" | jq
```



```bash
cd backend && npm run dev   
open http://localhost:3000/landmarks-cms/
```

CMS використовує `POST /api/admin/landmark-content` для редагування каталогу. Після `push` нові локації потрапляють у бандл, який підхоплюється мобільним додатком (через `app/location_bundle.injected.json` або `KRAINA_ADMIN_LOCATION_EVENT`).





- Текстовий пошук з полем введення на головній (`HomeSearchBar` + `LightHomeCountrySearch`).
- Індексування на клієнті (токенізатор + `Set` токенів у `locationsApi.buildIndex`).
- Індексування на сервері (PostgreSQL GIN `to_tsvector('simple', …)` + `plainto_tsquery`).
- Геопросторовий модуль із картою (`react-native-maps`).
- Відображення локацій з пошуку на карті (`displayPins` = `searchHits` коли є запит).
- Побудова маршруту між обраними точками (`routeSeq` + `Polyline` + Directions API).
- Геолокація користувача та центрування карти (`expo-location` + `centerUser`).
- Документація (цей файл) і user-guide (`[docs/user-guide.md](./user-guide.md)`, розділи 3-4).


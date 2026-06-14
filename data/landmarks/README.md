

Можна **не заходити в адмін‑панель** і **не вставляти JSON у застосунок**: тримайте файли в цій папці на ПК, збирайте бандл скриптом, у **dev** знімок підхоплюється після перезавантаження.



- Швидко: з кореня репо або з `app/` виконайте `npm run location:inbox:copy-example` — з’явиться `inbox/landmark_example.json` (копія `data/landmarks/sofia_cathedral.json`). Повторний запит без зміни файлу: додайте `
- Вручну: скопіюйте, наприклад, `data/landmarks/sofia_cathedral.json` у `data/landmarks/inbox/my_place.json` або створіть свій файл у тому ж форматі, що для імпорту в додатку.
- Щоб id регіону не став випадково `region` (якщо в JSON лише кириличні місто/назва), додайте в JSON поля: `region_id` / `landmark_id` (латиницею), наприклад `"region_id": "kyiv"`.



Без нього обробляються **усі** `*.json` в `inbox/`, крім `manifest.json`, у алфавитному порядку.

```json
{
  "items": [
    {
      "file": "one.json",
      "countryId": "UA",
      "attachToRegionId": null
    },
    {
      "file": "two.json",
      "countryId": "UA",
      "attachToRegionId": "kyiv"
    }
  ]
}
```

`attachToRegionId` має **вже існувати** у **базовому** знімку (див. нижче).



Щоб додавати пам’ятки в **уже наявні** з додатка міста (регіони як у застосунку), збережіть повний знімок у `data/landmarks/bundle_base.json` (той самий об’єкт, що пишеться в AsyncStorage), або вкажіть файл при збірці:

```bash
npm run location:inbox:build 
```

Без `bundle_base` використовується **мінімальна порожня** карта: підходить лише для **нових** регіонів з JSON.



З **кореня** репозиторію або з папки **`app/`** (однакові команди):

```bash
npm run location:inbox:build
```

Скрипт:

- пише `app/location_bundle.injected.json` (у **__DEV__** додаток застосовує його **після** AsyncStorage);
- додатково кладе копію в `data/landmarks/out/kraina_admin_location_bundle.json` (ігнорується git, для резерву / передачі).

Перезавантажте **Metro** та застосунок (ab reload).



```bash
npm run location:inbox:reset
```

Файл `app/location_bundle.injected.json` знову стає `{ "_skip": true }` — dev‑підгрузка з inbox вимкнена.



Збірка з inbox все ще дає лише **локальний dev‑інжект** (`location_bundle.injected.json`). Щоб ті самі пам’ятки з’явилися у **всіх користувачів** на карті й у текстовому пошуку (`locationsApi` читає колекцію Firestore `locations`), опублікуйте зібраний бандл через **Admin SDK**:

1. У каталозі `backend/` задайте облікові дані Firebase (як для `npm run migrate:firestore`): **`FIREBASE_SERVICE_ACCOUNT_JSON`** або **`FIREBASE_SERVICE_ACCOUNT_PATH`** до JSON сервісного акаунта (проект повинен збігатися з додатком).
2. З кореня репозиторію після збірки inbox:

```bash
npm run location:inbox:publish
```

Це виконає `location:inbox:build`, потім завантажить `data/landmarks/out/kraina_admin_location_bundle.json` у Firestore (`locations/{regionId}__{landmarkId}`, `published: true`).

Окремо лише завантаження вже готового JSON без повторної збірки:

```bash
npm run location:firestore:publish

cd backend && node scripts/publish-bundle-to-firestore.mjs 
```

Перевірка без запису:

```bash
cd backend && node scripts/publish-bundle-to-firestore.mjs 
```

Якщо бандл порожній або містить лише `_skip`, скрипт завершиться з помилкою або попередженням.

**Примітка:** `__DEV__` інжект у застосунку на проді не працює; для масового каталогу потрібен саме цей крок або еквівалентний запис через адмін‑бекенд.



`__DEV__` = true — підхоплення `location_bundle.injected.json` після `npm run location:inbox:build`; для перевірки на ПК без Firebase достатньо цього кроку.



Є два додаткові локальні джерела каталогу для карти/пошуку:

- `app/worldLocationsCode.js` — масив `WORLD_LOCATIONS_CODE` (додаєте вручну через код);
- `app/worldLocations.json` — масив JSON-обʼєктів (додаєте через файл).

Формат елемента:

```json
{
  "id": "world:eiffel_tower",
  "title": "Eiffel Tower",
  "title_en": "Eiffel Tower",
  "title_uk": "Ейфелева вежа",
  "city": "Paris",
  "country": "France",
  "category": "monument",
  "lat": 48.85837,
  "lng": 2.294481,
  "extract": "Короткий опис",
  "facts": ["Факт 1", "Факт 2"],
  "cover_image_url": "https://...",
  "source": "world-json"
}
```

Ці локації автоматично потрапляють у локальний каталог, відображаються на карті, шукаються по `facts/extract` і можуть відкриватися як картки.

Масовий імпорт у `app/worldLocations.json`:

```bash
npm run locations:world:import 
```

Очікується масив обʼєктів з полями `id`, `title`, `lat`, `lng` (решта — опційно).

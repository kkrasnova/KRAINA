# Продакшен: Firebase + API + PostgreSQL

Цей гайд піднімає інфраструктуру для **App Store / Google Play**: користувачі ходять у **хмару**, не на ваш Mac.

| Компонент | Сервіс | У репозиторії |
|-----------|--------|----------------|
| Auth, Firestore, Storage, Functions | **Firebase** `kraina-207c5` | `.firebaserc`, `firebase.json`, `firestore.rules` |
| REST API (стрічка, профілі, auth API) | **Render** (Docker) | `render.yaml`, `backend/Dockerfile` |
| База для API | **Render PostgreSQL** | підключається через `DATABASE_URL` |

Орієнтовна вартість на старті: Firebase Spark (безкоштовний ліміт) + Render Starter/Basic (~$7–14/міс за API + БД). Точні ціни — на [render.com/pricing](https://render.com/pricing).

---

## Крок 0. Передумови

- Акаунт [Firebase](https://console.firebase.google.com) (проєкт **kraina-207c5** уже в `.firebaserc`)
- Акаунт [Render](https://render.com)
- Репозиторій на **GitHub** (Render деплоїть з git)
- Локально: Node 20+, `npm install -g firebase-tools`

---

## Крок 1. Firebase (вже частково є)

1. Відкрийте [Firebase Console](https://console.firebase.google.com) → проєкт **kraina-207c5**.
2. **Authentication** → увімкніть Email/Password, Google, Apple (як у додатку).
3. **Firestore** + **Storage** — увімкніть, якщо ще ні.
4. Завантажте конфіги в додаток (не комітити):
   - Android: `app/google-services.json`
   - iOS: `app/ios/KRANA/GoogleService-Info.plist`  
   Шаблон: `google-services.json.example`
5. **Service account** (для бекенду / Functions): Project settings → Service accounts → Generate key → збережіть JSON локально (`backend/secrets/` — у `.gitignore`).

Деплой правил і функцій з кореня репо:

```bash
firebase login
cd functions && npm install && cd ..
npm run firebase:deploy
```

(або окремо: `npm run firebase:deploy:rules`, `npm run firebase:deploy:functions`)

У **Functions** на Render/Firebase Console задайте (для листів скидання пароля):

- `RESEND_API_KEY`
- `RESET_MAIL_FROM`, `RESET_MAIL_REPLY_TO`
- `RESET_PASSWORD_CONTINUE_URL=com.kraina.app://reset-password`

---

## Крок 2. Render: API + PostgreSQL

1. Запуште репозиторій на GitHub.
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**.
3. Підключіть репозиторій KrainaSafe — Render прочитає `render.yaml` і створить:
   - **kraina-db** (PostgreSQL)
   - **kraina-api** (Docker з `backend/Dockerfile`)
4. Дочекайтесь першого деплою. URL API буде на кшталт:  
   `https://kraina-api-xxxx.onrender.com`
5. **kraina-api** → **Environment** — додайте / оновіть (див. `backend/.env.production.example`):

| Змінна | Значення |
|--------|----------|
| `PUBLIC_BASE_URL` | `https://ваш-kraina-api.onrender.com` (без `/` в кінці) |
| `GOOGLE_CLIENT_ID` | Web client ID з Google Cloud / Firebase |
| `APPLE_CLIENT_ID` | Services ID для Sign in with Apple |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Весь JSON service account **одним рядком** (опційно, для social/bundle) |

`JWT_SECRET` і `REFRESH_SECRET` Render згенерує з blueprint; за потреби замініть на свої довгі рядки.

6. Перевірка:

```bash
curl https://ваш-kraina-api.onrender.com/health
# {"ok":true}
```

Міграції SQL запускаються **автоматично** при старті контейнера (`node dist/db/runMigrate.js`).

### Перший адмін (опційно)

Локально з URL продакшен-БД (External Database URL з Render → kraina-db):

```bash
cd backend
export DATABASE_URL="postgresql://..."
export DATABASE_SSL=true
npm run migrate
node scripts/create-admin.mjs --email you@example.com
```

---

## Крок 3. Збірка додатку для сторів

1. Скопіюйте `app/.env.production.example` → `app/.env` (або EAS Secrets).
2. Обов’язково:

```env
EXPO_PUBLIC_KRAINA_API_URL=https://ваш-kraina-api.onrender.com
```

3. Firebase-ключі — з `google-services.json` / plist або `EXPO_PUBLIC_FIREBASE_*`.
4. Збірка з чистим кешем:

```bash
cd app && npm run start:clear   # dev
# production: EAS Build або ios/android release з app/.env
```

**Не вказуйте** `localhost` у production — на телефонах це не працює.

---

## Крок 4. Локальна розробка (як і раніше)

| Що | Команда |
|----|---------|
| Postgres локально | `npm run db:up` (Docker) **або** ваш Homebrew Postgres |
| Міграції | `npm run db:migrate` |
| API локально | `npm run dev:api` |
| Додаток | `npm run start:ios` + `EXPO_PUBLIC_KRAINA_API_URL=http://localhost:3000` у `app/.env` |

`DATABASE_URL` у `backend/.env` на Mac **не пов’язаний** з продакшен-БД на Render.

---

## Важливо

- **Завантаження медіа** (аватари, стрічка) на Render зберігаються на диску контейнера — при передеплої можуть зникнути. Для серйозного продакшену плануйте Firebase Storage або S3; зараз MVP на Render прийнятний для тестів.
- **Free tier Render** «засинає» — для релізу в сторах краще план **Starter**.
- Альтернатива Postgres: [Neon](https://neon.tech) — тоді в Render лише Web Service, а `DATABASE_URL` вставляєте з Neon вручну.

---

## Чеклист перед релізом

- [ ] `curl …/health` → `ok`
- [ ] Реєстрація / логін у додатку на TestFlight / internal testing
- [ ] Firebase rules задеплоєні (`npm run firebase:deploy:rules`)
- [ ] `EXPO_PUBLIC_KRAINA_API_URL` вказує на HTTPS API
- [ ] Apple / Google OAuth client IDs збігаються з бекендом
- [ ] Privacy Policy URL, App Store Connect, Play Console

Питання по кроку — пишіть, на якому етапі застрягли (Firebase / Render / збірка).

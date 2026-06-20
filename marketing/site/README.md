# KRAINA — релізний сайт

Лендинг для App Store / Google Play: опис застосунку, тарифи, гайд, FAQ, EULA.

## Локально

```bash
npm run site:serve
```

Відкрийте http://localhost:5173

## Деплой (Firebase Hosting)

```bash
firebase login
npm run firebase:deploy:hosting
```

Після деплою сайт буде на `https://kraina-207c5.web.app`. Домен `kraina.world` підключіть у Firebase Console → Hosting → Custom domain.

## Скріншоти

Покладіть PNG/JPG у `assets/screens/` — імена файлів відповідають шляхам у `index.html` (див. `marketing/screenshots/shot-list.md`).

## Застосунок

У `app/app.json` → `extra.krainaSiteUrl`, `helpFaqUrl`, `helpDocsUrl` вказують на цей сайт. Пункт **«Сайт KRAÏNA»** у Налаштування → Допомога відкриває `/#faq`.

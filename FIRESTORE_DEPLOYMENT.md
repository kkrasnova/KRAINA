



1. Firebase CLI встановлено: `npm install -g firebase-tools`
2. Авторизація Firebase: `firebase login`
3. Налаштування проекту: `firebase init` або `firebase use <project-id>`



```bash
cd /Users/anastasiia.krasnova/Desktop/KrainaSafe
firebase deploy 
```



```bash
firebase rules:list
```

Повинні бачити `firestore` у списку.



```bash
firebase deploy 
```



```bash
firebase firestore:indexes
```

Повинні бачити індекси для:

- `messageThreads` (memberIds + updatedAt)
- `socialFollows` (followerId, followingId)
- `socialFollowRequests` (toUserId + createdAt, fromUserId + createdAt)

Заповнення індексів може тривати **15-30 хвилин**!



Якщо бази дані порожні, ви можете вручну створити тестові документи у Firebase Console:



```
Collection: profiles
Document ID: test-user-123
Data:
{
  "username": "testuser",
  "display_name": "Test User",
  "avatar_url": "https://...",
  "is_private": false,
  "firebase_uid": "test-user-123"
}
```



```
Collection: messageThreads
Document ID: aaa-111__zzz-999
Data:
{
  "memberIds": ["aaa-111", "zzz-999"],
  "acceptedBy": {"aaa-111": true, "zzz-999": true},
  "createdAt": Timestamp.now(),
  "updatedAt": Timestamp.now()
}
```





```bash
cd app
npm run start:dev

```



```bash
cd app
npm run start:dev

```



1. Увійти через Firebase (email/password або Google/Apple)
2. Перейти на `DiscoverPeoplePage`
3. Спробувати слідкувати за користувачем
4. Перейти на `ChatsPage` → `Inbox`
5. Запустити новий чат





```bash
firebase functions:log
```



```bash
firebase firestore:backup 
```



```bash
firebase firestore:delete 
```



Станом на **28 квітня 2026 р:**

- ✅ firestore.rules завантажені
- ✅ firestore.indexes.json завантажено
- ✅ Двостороння синхронізація закінчена
- ✅ Обробка помилок для сообщений
- ✅ Автоматичне прийняття діалогів



- [ ] Усі індекси заповнені (15-30 хв очікування)
- [ ] Правила безпеки активні
- [ ] Користувачі можуть підписуватися
- [ ] Користувачі можуть писати один одному
- [ ] Запити на підписку працюють
- [ ] Синхронізація з Postgres працює
- [ ] Нема витоків даних у консолі
- [ ] Покриття правил >=80%





```bash






```



Якщо індекси не достатні, ви побачите помилку:

```
The query requires indexes
FAILED:Code: 9, State: RESOURCE_EXHAUSTED
```

Тоді перевірте `firebase firestore:indexes` і додайте потрібні індекси.



**Документ:** Deploy guide для社會 мережі
**Версія:** 2.0
**Останнє оновлення:** 28 квітня 2026

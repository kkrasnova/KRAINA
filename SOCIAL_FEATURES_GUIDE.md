



Соціальна мережа KrainaSafe дозволяє користувачам:

- ✅ Підписуватися/відписуватися на інших користувачів
- ✅ Приватні/публічні профіли з запитами на підписку
- ✅ Надсилати та отримувати приватні повідомлення (DM)
- ✅ Взаємні підписки (друзі)
- ✅ Пошук користувачів та відкриття профілів





- **socialApi.js** - управління підписками, профілями, пошуком
- **messageApi.js** - управління私私 повідомленнями через Firestore
- **DiscoverPeoplePage.js** - знайти та слідкувати за користувачами
- **ChatsPage.js** - список діалогів (Inbox & Requests)
- **ChatThreadPage.js** - окремий чат з користувачем



- **socialRoutes.ts** - API для управління підписками
- **messageRoutes.ts** - API для управління чатами
- **socialService.ts** - бізнес-логіка підписок у Postgres
- **messageService.ts** - управління потоками чатів



- **Firebase Firestore** (основна) - реал-тайм синхронізація
- **PostgreSQL** (допоміжна) - надійність та синхронізація





```javascript
import { socialFollowUserId, socialFollowUsername } from "./socialApi";


const result = await socialFollowUserId(userId);




const result = await socialFollowUsername("@username");
```

**Сценарії:**

- **Публічний профіль**: Підписка одразу
- **Приватний профіль**: Надсилається запит на підписку (Firestore `socialFollowRequests`)



```javascript
import { socialUnfollowUserId, socialUnfollowUsername } from "./socialApi";

await socialUnfollowUserId(userId);
await socialUnfollowUsername("@username");
```



```javascript
import {
  socialListIncomingRequests, 
  socialListOutgoingRequests, 
  socialAcceptRequest, 
  socialDeclineRequest, 
  socialCancelOutgoingRequest, 
} from "./socialApi";


const requests = await socialListIncomingRequests();


await socialAcceptRequest(userId);


await socialDeclineRequest(userId);
```



```javascript
import { socialSearchProfiles, socialListTopProfiles } from "./socialApi";


const results = await socialSearchProfiles("anna", 24);



const top = await socialListTopProfiles(24);
```



```javascript
import { messagesOpenThread, messagesSendText } from "./messageApi";


const thread = await messagesOpenThread({ peerUsername: "@anna" });



await messagesSendText(threadId, "Привіт, Анна!");
```



```javascript
import { messagesListThreads, messagesListMessages } from "./messageApi";


const threads = await messagesListThreads("inbox");


const requests = await messagesListThreads("requests");


const messages = await messagesListMessages(threadId, (limit = 80));
```





Коли користувач з приватним профілем **приймає запит на підписку** в Firestore, система автоматично:

1. **Створює дві грані у Firestore** (`socialFollows`):
   - fromUserId → toUserId
   - toUserId → fromUserId (обопільна)

2. **Синхронізує з Postgres** через:
   ```bash
   POST /api/social/pending-follow/{firebaseUid}/accept-postgres
   ```
   (Містить обробку помилок)



```javascript

if (base) {
  await fetch(`${base}/api/social/pending-follow/${fromUserId}/accept-postgres`, ...)
    .catch(() => {}); 
}
```



```firestore

match /socialFollows/{edgeId} {
  allow read: if true;
  allow create: if followerId == auth.uid;
  allow delete: if followerId == auth.uid;
}


match /socialFollowRequests/{reqId} {
  allow read: if auth.uid == fromUserId OR auth.uid == toUserId;
  allow create: if auth.uid == fromUserId;
  allow delete: if auth.uid == fromUserId OR auth.uid == toUserId;
}


match /messageThreads/{threadId}/messages/{messageId} {
  allow read: if auth.uid in thread.memberIds;
  allow create: if auth.uid in thread.memberIds;
}
```



Визначено у `firestore.indexes.json`:

```json
[
  {
    "collectionGroup": "messageThreads",
    "fields": [
      { "fieldPath": "memberIds", "arrayConfig": "CONTAINS" },
      { "fieldPath": "updatedAt", "order": "DESCENDING" }
    ]
  },
  {
    "collectionGroup": "socialFollows",
    "fields": [{ "fieldPath": "followerId" }, { "fieldPath": "followingId" }]
  },
  {
    "collectionGroup": "socialFollowRequests",
    "fields": [
      { "fieldPath": "toUserId", "order": "ASCENDING" },
      { "fieldPath": "createdAt", "order": "DESCENDING" }
    ]
  }
]
```





```bash

curl -H "Authorization: Bearer $JWT" \
  https://api.kraina.app/api/social/mutuals


curl -H "Authorization: Bearer $JWT" \
  https://api.kraina.app/api/social/requests/incoming


curl -X POST -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"username": "anna"}' \
  https://api.kraina.app/api/social/follow
```



- Відкрити `ChatsPage` у додатку
- Перейти на `DiscoverPeoplePage`
- Натиснути "Слідкувати"
- Після прийняття запиту - новий чат має з'явитися



```javascript

if (__DEV__) {
  console.warn("[socialApi]", "message");
  console.warn("[messageApi]", "message");
}
```



| Помилка                  | Причина                              | Рішення                           |
| 
| `firebase_auth_required` | Користувач не залогінений у Firebase | Потрібен повторний вхід у app     |
| `peer_not_found`         | Неправильне ім'я користувача         | Перевірити імʼя користувача       |
| `cannot_follow_self`     | Спроба підписатися на себе           | Заблокувати у UI                  |
| Синхронізація затримана  | Дво-хід Firestore ↔ Postgres         | Почекати 2-5 сек, потім оновити   |
| Чат не з'являється       | Діалог у статусі "Requests"          | Прийняти запит або оновити список |



- ❌ Немає видалення/редагування повідомлень
- ❌ Немає типінг-індикаторів (typing...)
- ❌ Немає статусу online (остання активність)
- ❌ Немає пошуку по повідомленнях
- ❌ Немає груп-чатів (тільки 1-на-1)
- ❌ Немає блокування користувачів
- ❌ Немає звітів про зловживання



- [ ]群組 чати (>2 користувачів)
- [ ] Видалення/редагування повідомлень
- [ ] Відповіді (threads)
- [ ] Медіа у чатах (фото, відео)
- [ ] Голосові повідомлення
- [ ] Видалення профілів
- [ ] Блокування користувачів
- [ ] End-to-end encryption



**Останнє оновлення**: 28 квітня 2026 р.
**Версія**: 2.0 (Fullstack integration)

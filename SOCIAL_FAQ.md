





**Відповідь:** Firestore - це облікова база даних від Google Firebase, яка дозволяє реал-тайм синхронізацію. Коли один користувач слідкує за іншим, це одразу видно всім іншим клієнтам.



**Відповідь:**

- **Firestore** - швидка, реал-тайм, public за замовчуванням
- **Postgres** - надійна, з трансакціями, приватна

Використовуємо обидві для найкращого з обидв світів.



**Відповідь:**

1. Відкривають додаток
2. Натискають "Вхід" → "Email" або "Google" / "Apple"
3. Система створює Firebase Auth user (uid)
4. Sync з Postgres user за `firebase_uid`



**Відповідь:** Вони поступово синхронізуються:

1. При першому вході через Firebase
2. Система автоматично пов'язує `users.firebase_uid` з їхнім Postgres id
3. Старі дані залишаються безпечними







**Для публічного профілю B:**

1. A натискає "Слідкувати B"
2. Firestore отримує: `socialFollows` edge "A\_\_B"
3. Postgres отримує: запис в таблицю `follows`
4. B відразу бачить +1 до `followers_count`

**Для приватного профілю B:**

1. A натискає "Запросити"
2. Firestore отримує: `socialFollowRequests` "A\_\_B"
3. B отримує нотсулт (якщо включено)
4. B обирає "Прийняти" або "Відхилити"
5. При прийняті:
   - Обоє отримують ребра підписок
   - Postgres синхронізується асинхронно



|             | Follow              | Mutuals (Друзі)                       |
| 
| A слідкує B | Edge: A→B           | Edges: A→B AND B→A                    |
| B слідкує A | Їхній               | A AND B видають один одного як друзів |
| Переквисити | A → B               | Автоматичне взаємно                   |
| Чати        | B - нижче в запитах | Обидва у звичайному списку            |



**Відповідь:**

```javascript
import { socialCancelOutgoingRequest } from "./socialApi";
await socialCancelOutgoingRequest(targetUserId);
```



**Відповідь:** Так! Система дозволяє A слідкувати B, а B слідкувати C. A не автоматично слідкує C - це функція рекомендацій майбутнього.







**Відповідь:** Лише у **Firestore** (в `messageThreads/{id}/messages`). Postgres зберігає лише метадані діалогу.



**Відповідь:** Коли користувач, якого ви не слідкуєте, вам пише:

1. Його повідомлення потрапляє в `messageThreads` з `pending_for_me: true`
2. Діалог з'являється у розділі "Запити"
3. Коли ви чи відповідаєте, він переходить до "Чати"



```javascript
import { messagesOpenThread } from "./messageApi";
const thread = await messagesOpenThread({ peerUsername: "@anna" });

```



```javascript
import { messagesSendText } from "./messageApi";
await messagesSendText(threadId, "Привіт!");
```

**Важливо:** При від્મправці повідомлення система автоматично:

1. Позначає вас як прийнявши цей діалог
2. Оновлює `updatedAt`
3. Повториться до 3 разів, если перший спробі faild



| Проблема                 | Рішення                        |
| 
| Нема інтернету           | Перевірити з'єднання Wi-Fi/LTE |
| Firebase Auth не активна | Перезайти у додаток            |
| Неправильний threadId    | Перевірити ID у console        |
| Quotum Firestore         | Почекати 1 хвилину             |
| Правила безпеки          | Перевірити `firestore.rules`   |



```javascript
const more = await messagesListMessages(threadId, (limit = 100));

```







```
Firestore Front-End
    ↓
Backend API (Node.js)
    ↓
Postgres Database
```

**Де:**

- Front-end мітко на Firestore (реал-тайм)
- Backend автоматично синхронізує до Postgres

**Затримка:** Зазвичай <5 секунд



```javascript

import { socialListMutuals } from "./socialApi";
const mutuals = await socialListMutuals(); 
```

**Якщо дані не синхронізовані:**

1. Перезавантажити додаток
2. Перевірити мережу
3. Перевірити Firestore Console → logs
4. Скласти звіт з часовою міткою



**Відповідь:** Користувач не залогінений у Firebase. Потрібен вхід поново:

1. Поточна сесія Firebase закінчилась
2. Або альт користувач (інший email)
3. Вирішення: натиснути "Вхід" і залogy повторно



**Відповідь:** Firestore потребує багатопольних індексів для деяких запитів.

1. Запускаємо: `firebase deploy 
2. Чекаємо 15-30 хвилин на заповнення індексів
3. Перевіряємо: `firebase firestore:indexes`







**Відповідь:**

- **Лише ви** - список людей, яких ви слідкуєте
- **Публічно** - список людей, які слідкують за вами (якщо публічний профіль)
- **Приватно** - якщо профіль приватний, список видно лише вам



**Відповідь:** Поточно **НЕ**. Вони:

- Зберігаються у Firestore (доступні лише користувачам діалогу)
- Передаються по HTTPS (в транзиті захищені)
- **Майбутнім**: планується end-to-end encryption



**Відповідь:**

1. Відкрити Налаштування → Профіль → Видалити профіль
2. Підтвердити пароль
3. Профіль видаляється з усіх баз даних
4. Повідомлення залишаються (privacy других користувачів)



**Відповідь:** Поточно **не підтримується**.計畫:

- [ ] Функція блокування користувачів
- [ ] Звіти про зловживання
- [ ] Пряма фільтрація повідомлень







**Відповідь:** Їм немає в production. Ви можете створити тистови користувачі:

```bash



```



**Відповідь:**

```bash

firebase firestore:export 


curl -H "Authorization: Bearer $JWT" \
  https://api.kraina.app/api/profiles?limit=100
```



```javascript
import { auth } from "./firebaseConfig";
const uid = auth.currentUser?.uid;
console.log("Firebase UID:", uid);
```



1. **Emulator Suite:**

```bash
firebase emulators:start
```

2. **Підключити додаток:**

```javascript

if (__DEV__) {
  connectEmulator(db, "localhost", 8080);
}
```



```bash
firebase functions:log 
```





- 🐛 Bug Reports: [GitHub Issues](https://github.com/your-repo)
- 💬 Питання: [Discord Community](https://discord.gg/your-server)
- 📧 Email: dev@kraina.app



**Останнє оновлення:** 28 квітня 2026
**Версія:** 2.0

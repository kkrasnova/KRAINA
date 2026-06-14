/**
 * Повний текст політики конфіденційності для екрана в застосунку (якщо немає веб-URL).
 */
import { appLangBase } from './appLang';

const PRIVACY_UK = `Політика конфіденційності мобільного застосунку KRAÏNA

1. Хто ми
Цю політику застосовує ITty Company щодо застосунку KRAÏNA («ми», «наш сервіс»). Реєструючись або користуючись застосунком, ви погоджуєтеся з цією політикою.

2. Які дані ми можемо збирати
• Дані облікового запису: електронна пошта, ім’я або псевдонім, пароль (у захищеному вигляді), ідентифікатор облікового запису.
• Профіль і активність у застосунку: біо, аватар, мова інтерфейсу, статистика використання функцій, якщо ви їх надаєте.
• Геолокація та маршрути: якщо ви дозволяєте доступ до геолокації — для маршрутів, пошуку поруч і пов’язаних функцій; ви можете відкликати дозвіл у системних налаштуваннях.
• Камера та медіа: якщо ви використовуєте AR, сканування або публікацію фото/відео — відповідно до ваших дій у застосунку.
• Технічні дані: тип пристрою, версія ОС, діагностичні журнали (за потреби для стабільності та безпеки).
• Повідомлення та соціальні функції: контент, який ви надсилаєте в чатах або публікуєте у стрічці, згідно з функціями сервісу.

3. Навіщо ми обробляємо дані
• Надання та підтримка функцій KRAÏNA (авторизація, профіль, контент, маршрути, сповіщення).
• Безпека, запобігання зловживанням, покращення якості сервісу.
• Виконання законних вимог та відповідь на звернення користувачів (зокрема щодо експорту чи видалення даних).

4. Правова основа
Залежно від контексту: виконання угоди з вами (надання сервісу), згода (де її явно запитано), законний інтерес (безпека, аналітика в агрегованому вигляді) або юридичний обов’язок.

5. Передача третім особам
Ми не продаємо ваші персональні дані. Доступ можуть мати обмежено: інфраструктурні та хмарні постачальники, платіжні/магазин застосунків (для підписок), аналітика лише в мірі, необхідній для роботи продукту, згідно з їхніми політиками та договорами.

6. Зберігання та видалення
Термін зберігання залежить від типу даних і вимог закону. Ви можете надіслати запит на експорт або видалення облікового запису — використайте контакт у розділі «Конфіденційність» або email підтримки, вказаний у застосунку.

7. Ваші права
Залежно від юрисдикції, зокрема GDPR: доступ, виправлення, видалення, обмеження обробки, заперечення, переносимість даних, відкликання згоди. Звертайтеся до нас на email підтримки.

8. Діти
Сервіс не призначений для дітей молодше віку, передбаченого законом вашої країни, без згоди батьків. Якщо ви батько і вважаєте, що дитина надала дані — напишіть нам.

9. Зміни політики
Ми можемо оновлювати цю політику. Актуальна версія доступна в застосунку; про суттєві зміни можемо повідомити через застосунок або email, де це доречно.

10. Контакти
Питання щодо конфіденційності: використайте форму звернення в застосунку або email, показаний на екрані конфіденційності (налаштовується для збірки).`;

const PRIVACY_EN = `Privacy policy for the KRAÏNA mobile app

1. Who we are
This policy is provided by ITty Company for the KRAÏNA application (“we”, “our service”). By registering or using the app, you agree to this policy.

2. Data we may collect
• Account data: email, display name or username, password (stored securely), account identifiers.
• Profile and in-app activity: bio, avatar, UI language, feature usage you choose to provide.
• Location and routes: if you allow location access — for routes, nearby search and related features; you can revoke permission in system settings.
• Camera and media: when you use AR, scanning or publishing photos/video — according to your actions in the app.
• Technical data: device type, OS version, diagnostic logs where needed for stability and security.
• Messaging and social features: content you send in chats or publish in feeds, as enabled by the product.

3. Why we process data
• To provide and maintain KRAÏNA features (sign-in, profile, content, routes, notifications).
• Security, abuse prevention, and service quality improvements.
• Legal compliance and responding to user requests (including export or deletion).

4. Legal bases
Depending on context: performance of a contract with you, consent where explicitly requested, legitimate interests (security, aggregated analytics), or legal obligation.

5. Sharing with third parties
We do not sell your personal data. Limited access may be given to infrastructure/cloud providers, app-store billing for subscriptions, and analytics only as needed for the product, subject to their policies and agreements.

6. Retention and deletion
Retention depends on data type and legal requirements. You may request export or account deletion using the contact options in the Privacy screen or the support email shown in the app.

7. Your rights
Depending on your jurisdiction (including GDPR): access, rectification, erasure, restriction, objection, portability, withdrawal of consent. Contact us at the support email.

8. Children
The service is not directed at children below the age required in your country without parental consent. If you believe a child provided data, contact us.

9. Changes
We may update this policy. The current version is available in the app; we may notify you of material changes via the app or email where appropriate.

10. Contact
For privacy questions, use the in-app contact options or the email shown on the Privacy screen (configurable per build).`;

const PRIVACY_BODIES = {
  uk: PRIVACY_UK,
  en: PRIVACY_EN,
};

export function getPrivacyContentForLanguage(langId) {
  const base = appLangBase(typeof langId === 'string' ? langId : 'en');
  return PRIVACY_BODIES[base] || PRIVACY_BODIES.en;
}

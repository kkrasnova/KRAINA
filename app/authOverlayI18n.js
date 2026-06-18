import { pick } from './thirdPageUiStrings';

function normalizeAuthErrorCode(code) {
  const c = String(code || '').trim();
  const aliases = {
    email_taken: 'EMAIL_EXISTS',
    email_exists: 'EMAIL_EXISTS',
    invalid_credentials: 'WRONG_CREDENTIALS',
    invalid_email: 'INVALID_EMAIL',
    weak_password: 'WEAK_PASSWORD',
    rate_limited: 'TOO_MANY_REQUESTS',
    API_UNAVAILABLE: 'NETWORK_ERROR',
  };
  return aliases[c] || c;
}

/** Firebase/auth overlay copy — non-English falls back to `en` in `pick`. */
export function authOverlayFromErrorCode(language, code) {
  switch (normalizeAuthErrorCode(code)) {
    case 'USER_NOT_FOUND':
      return {
        title: pick(
          {
            uk: 'Акаунта з таким email немає',
            en: 'No account for this email',
            de: 'Kein Konto für diese E-Mail',
            ro: 'Nu există cont pentru acest e-mail',
          },
          language,
        ),
        body: pick(
          {
            uk: 'Користувача з цією електронною поштою не знайдено. Перевірте email або зареєструйтесь.',
            en: 'No user with this email was found. Check the address or create an account.',
            de: 'Kein Benutzer mit dieser E-Mail. Adresse prüfen oder Konto erstellen.',
            ro: 'Nu s-a găsit utilizator cu acest e-mail. Verifică adresa sau creează un cont.',
          },
          language,
        ),
        suggestRegister: true,
      };
    case 'WRONG_PASSWORD':
      return {
        title: pick(
          {
            uk: 'Невірний пароль',
            en: 'Wrong password',
            de: 'Falsches Passwort',
            ro: 'Parolă incorectă',
          },
          language,
        ),
        body: pick(
          {
            uk: 'Такий email зареєстрований, але пароль не підходить. Спробуйте ще раз або «Забули пароль».',
            en: 'This email is registered, but the password is incorrect. Try again or use Forgot password.',
            de: 'Diese E-Mail ist registriert, aber das Passwort ist falsch. Erneut versuchen oder Passwort vergessen.',
            ro: 'E-mailul este înregistrat, dar parola este greșită. Încearcă din nou sau folosește „Am uitat parola”.',
          },
          language,
        ),
        suggestRegister: false,
      };
    case 'WRONG_CREDENTIALS':
      return {
        title: pick(
          {
            uk: 'Невірний email або пароль',
            en: 'Wrong email or password',
            de: 'Falsche E-Mail oder Passwort',
            ro: 'E-mail sau parolă incorectă',
          },
          language,
        ),
        body: pick(
          {
            uk: 'Увійти не вдалося: перевірте email і пароль (або обидва). Можна відновити пароль через «Забули пароль».',
            en: 'Sign-in failed: check your email and password (or both). You can reset the password via Forgot password.',
            de: 'Anmeldung fehlgeschlagen: E-Mail und Passwort prüfen. Passwort über „Passwort vergessen“ zurücksetzen.',
            ro: 'Autentificare eșuată: verifică e-mailul și parola. Poți reseta parola prin „Am uitat parola”.',
          },
          language,
        ),
        suggestRegister: true,
      };
    case 'EMAIL_EXISTS':
      return {
        title: pick(
          {
            uk: 'Пошта вже зайнята',
            en: 'Email already in use',
            de: 'E-Mail bereits vergeben',
            ro: 'E-mail deja folosit',
          },
          language,
        ),
        body: pick(
          {
            uk: 'Користувач з такою поштою вже є. Увійдіть або вкажіть іншу адресу.',
            en: 'An account with this email already exists. Sign in or use a different email.',
            de: 'Ein Konto mit dieser E-Mail existiert bereits. Anmelden oder andere Adresse verwenden.',
            ro: 'Există deja un cont cu acest e-mail. Autentifică-te sau folosește altă adresă.',
          },
          language,
        ),
        suggestRegister: false,
      };
    case 'INVALID_EMAIL':
      return {
        title: pick(
          {
            uk: 'Некоректний email',
            en: 'Invalid email',
            de: 'Ungültige E-Mail',
            ro: 'E-mail invalid',
          },
          language,
        ),
        body: pick(
          {
            uk: 'Формат адреси не прийнято. Перевірте email (наприклад, name@domain.com).',
            en: 'This email format was rejected. Check the address (e.g. name@domain.com).',
            de: 'Dieses E-Mail-Format wurde abgelehnt. Adresse prüfen (z. B. name@domain.com).',
            ro: 'Formatul e-mailului nu este acceptat. Verifică adresa (ex. name@domain.com).',
          },
          language,
        ),
        suggestRegister: false,
      };
    case 'WEAK_PASSWORD':
      return {
        title: pick(
          {
            uk: 'Слабкий пароль',
            en: 'Weak password',
            de: 'Schwaches Passwort',
            ro: 'Parolă slabă',
          },
          language,
        ),
        body: pick(
          {
            uk: 'Пароль занадто простий або короткий. Додайте довжину й складність.',
            en: 'Password is too weak or short. Use a longer, stronger password.',
            de: 'Passwort zu schwach oder kurz. Längeres, stärkeres Passwort verwenden.',
            ro: 'Parola este prea slabă sau scurtă. Folosește o parolă mai lungă și mai complexă.',
          },
          language,
        ),
        suggestRegister: false,
      };
    case 'NETWORK_ERROR':
      return {
        title: pick(
          {
            uk: 'Проблема з мережею',
            en: 'Network problem',
            de: 'Netzwerkproblem',
            ro: 'Problemă de rețea',
          },
          language,
        ),
        body: pick(
          {
            uk: 'Не вдалося зв’язатися з сервером (мережа або тимчасовий збій). Спробуйте ще раз.',
            en: 'Could not reach the server (network or temporary failure). Please try again.',
            de: 'Server nicht erreichbar (Netzwerk oder temporärer Fehler). Bitte erneut versuchen.',
            ro: 'Nu s-a putut contacta serverul (rețea sau eroare temporară). Încearcă din nou.',
          },
          language,
        ),
        suggestRegister: false,
      };
    case 'AUTH_INTERNAL_ERROR':
      return {
        title: pick(
          {
            uk: 'Внутрішня помилка Firebase',
            en: 'Firebase internal error',
            de: 'Interner Firebase-Fehler',
            ro: 'Eroare internă Firebase',
          },
          language,
        ),
        body: pick(
          {
            uk: 'Це часто через налаштування проєкту. У Firebase Console увімкніть Email/Password, перевірте google-services.json, пакет Android com.kraina.app і реєстрацію SHA-1.',
            en: 'This is often a project configuration issue. In Firebase Console enable Email/Password, and verify google-services.json, Android package com.kraina.app, and SHA-1 registration.',
            de: 'Oft eine Projektkonfiguration. In der Firebase Console E-Mail/Passwort aktivieren und google-services.json, Android-Paket com.kraina.app und SHA-1 prüfen.',
            ro: 'Adesea e o problemă de configurare. În Firebase Console activează Email/Parolă și verifică google-services.json, pachetul Android și SHA-1.',
          },
          language,
        ),
        suggestRegister: false,
      };
    case 'TOO_MANY_REQUESTS':
      return {
        title: pick(
          {
            uk: 'Забагато спроб',
            en: 'Too many attempts',
            de: 'Zu viele Versuche',
            ro: 'Prea multe încercări',
          },
          language,
        ),
        body: pick(
          {
            uk: 'Зачекайте кілька хвилин і спробуйте знову.',
            en: 'Please wait a few minutes and try again.',
            de: 'Bitte einige Minuten warten und erneut versuchen.',
            ro: 'Așteaptă câteva minute și încearcă din nou.',
          },
          language,
        ),
        suggestRegister: false,
      };
    case 'USER_DISABLED':
      return {
        title: pick(
          {
            uk: 'Обліковий запис вимкнено',
            en: 'Account disabled',
            de: 'Konto deaktiviert',
            ro: 'Cont dezactivat',
          },
          language,
        ),
        body: pick(
          {
            uk: 'Цей акаунт заблоковано. Зверніться до підтримки.',
            en: 'This account has been disabled. Contact support.',
            de: 'Dieses Konto wurde deaktiviert. Support kontaktieren.',
            ro: 'Acest cont a fost dezactivat. Contactează suportul.',
          },
          language,
        ),
        suggestRegister: false,
      };
    case 'OPERATION_NOT_ALLOWED':
      return {
        title: pick(
          {
            uk: 'Вхід недоступний',
            en: 'Sign-in not allowed',
            de: 'Anmeldung nicht erlaubt',
            ro: 'Autentificare indisponibilă',
          },
          language,
        ),
        body: pick(
          {
            uk: 'Email/пароль увімкнено не в консолі Firebase. Увімкніть спосіб входу для цього проєкту.',
            en: 'Email/password sign-in is not enabled in Firebase Console for this project.',
            de: 'E-Mail/Passwort-Anmeldung ist in der Firebase Console für dieses Projekt nicht aktiviert.',
            ro: 'Autentificarea cu e-mail/parolă nu este activată în Firebase Console pentru acest proiect.',
          },
          language,
        ),
        suggestRegister: false,
      };
    case 'FIREBASE_AUTH_ERROR':
      return {
        title: pick(
          {
            uk: 'Помилка авторизації',
            en: 'Authentication error',
            de: 'Authentifizierungsfehler',
            ro: 'Eroare de autentificare',
          },
          language,
        ),
        body: pick(
          {
            uk: 'Сервіс авторизації відхилив запит. Перевірте налаштування Firebase або спробуйте пізніше.',
            en: 'The auth service rejected the request. Check Firebase settings or try again later.',
            de: 'Der Authentifizierungsdienst hat die Anfrage abgelehnt. Firebase-Einstellungen prüfen oder später erneut versuchen.',
            ro: 'Serviciul de autentificare a respins cererea. Verifică setările Firebase sau încearcă mai târziu.',
          },
          language,
        ),
        suggestRegister: false,
      };
    case 'username_taken':
      return {
        title: pick(
          {
            uk: 'Нікнейм зайнятий',
            en: 'Username taken',
            de: 'Benutzername vergeben',
            ro: 'Nume de utilizator indisponibil',
          },
          language,
        ),
        body: pick(
          {
            uk: 'Цей нікнейм уже використовується. Спробуйте ще раз — ми підберемо інший.',
            en: 'This username is already taken. Try again and we will pick another one.',
            de: 'Dieser Benutzername ist vergeben. Erneut versuchen — wir wählen einen anderen.',
            ro: 'Acest nume de utilizator este deja folosit. Încearcă din nou.',
          },
          language,
        ),
        suggestRegister: false,
      };
    case 'invalid_username':
      return {
        title: pick(
          {
            uk: 'Некоректний нікнейм',
            en: 'Invalid username',
            de: 'Ungültiger Benutzername',
            ro: 'Nume de utilizator invalid',
          },
          language,
        ),
        body: pick(
          {
            uk: 'Нікнейм має містити 3–32 латинські літери, цифри або _. Спробуйте ще раз.',
            en: 'Username must be 3–32 characters: Latin letters, digits, or underscore. Try again.',
            de: 'Benutzername: 3–32 Zeichen, lateinische Buchstaben, Ziffern oder _. Erneut versuchen.',
            ro: 'Numele de utilizator: 3–32 caractere, litere latine, cifre sau _. Încearcă din nou.',
          },
          language,
        ),
        suggestRegister: false,
      };
    case 'username_generation_failed':
      return {
        title: pick(
          {
            uk: 'Не вдалося створити нікнейм',
            en: 'Could not create username',
            de: 'Benutzername konnte nicht erstellt werden',
            ro: 'Nu s-a putut crea numele de utilizator',
          },
          language,
        ),
        body: pick(
          {
            uk: 'Сервер не зміг згенерувати нікнейм. Спробуйте ще раз через хвилину.',
            en: 'The server could not generate a username. Try again in a minute.',
            de: 'Der Server konnte keinen Benutzernamen erzeugen. In einer Minute erneut versuchen.',
            ro: 'Serverul nu a putut genera un nume de utilizator. Încearcă din nou peste un minut.',
          },
          language,
        ),
        suggestRegister: false,
      };
    default:
      return null;
  }
}

const ACCENT = '#C6DB00';
const ACCENT_BRIGHT = '#E1FF00';
const ACCENT_DARK = '#5A6600';
const PAGE_BG = '#F3F3EF';
const CARD_BG = '#FFFFFF';
const TEXT = '#1A1A1A';
const TEXT_MUTED = '#5C5C58';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeLang(lang) {
  const raw = String(lang || 'en').split('-')[0].toLowerCase();
  return COPY[raw] ? raw : 'en';
}

function brandLogoBlock() {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;">
    <tr>
      <td align="center">
        <span style="font-size:32px;line-height:1;font-weight:700;letter-spacing:0.14em;color:${TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">KRA</span><span style="font-size:32px;line-height:1;font-weight:700;letter-spacing:0.14em;color:${ACCENT_DARK};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Ï</span><span style="font-size:32px;line-height:1;font-weight:700;letter-spacing:0.14em;color:${TEXT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">NA</span>
      </td>
    </tr>
  </table>`;
}

function digitCell(digit, isLast) {
  const gap = isLast ? '' : '<td width="8" style="width:8px;font-size:0;line-height:0;">&nbsp;</td>';
  return `<td align="center" valign="middle" class="otp-digit" style="width:44px;height:52px;border-radius:12px;background:${CARD_BG};border:1.5px solid rgba(198,219,0,0.55);font-size:28px;line-height:1;font-weight:700;color:${TEXT};font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,'Courier New',monospace;">${escapeHtml(digit)}</td>${gap}`;
}

function codeBlock(code, codeLabel, expiresLabel) {
  const digits = String(code || '')
    .replace(/[^\d]/g, '')
    .slice(0, 6)
    .split('');
  while (digits.length < 6) digits.push('0');

  const digitRow = digits
    .map((digit, index) => digitCell(digit, index === digits.length - 1))
    .join('');

  const safeCode = escapeHtml(digits.join(''));
  const label = escapeHtml(codeLabel);
  const expires = escapeHtml(expiresLabel);

  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0 22px;">
    <tr>
      <td style="padding:24px 16px 22px;border-radius:18px;background:linear-gradient(180deg,#FCFFE8 0%,#F4FAD1 100%);border:1px solid rgba(198,219,0,0.42);">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td align="center" style="padding-bottom:14px;">
              <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,0.72);font-size:11px;line-height:1.4;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${ACCENT_DARK};">${label}</span>
            </td>
          </tr>
          <tr>
            <td align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>${digitRow}</tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:14px;">
              <span style="font-size:12px;line-height:1.4;color:${ACCENT_DARK};font-weight:600;">⏱ ${expires}</span>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:10px;">
              <span style="font-size:11px;line-height:1.4;color:#8A8A86;letter-spacing:0.04em;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${safeCode}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

function paragraph(text) {
  return `<p style="margin:0 0 14px;font-size:16px;line-height:1.65;color:${TEXT_MUTED};text-align:center;">${text}</p>`;
}

function footer(text) {
  return `<p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#8A8A86;text-align:center;">${text}</p>`;
}

export function buildResetOtpEmailHtml({ code, intro, hint, ignore, codeLabel, expiresLabel, preheader, lang }) {
  const langAttr = escapeHtml(lang || 'en');
  const safePreheader = escapeHtml(preheader);

  return `<!DOCTYPE html>
<html lang="${langAttr}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>KRAÏNA</title>
  <style>
    @media only screen and (max-width: 480px) {
      .otp-digit { width: 38px !important; height: 46px !important; font-size: 24px !important; }
      .card-pad { padding: 28px 20px 24px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${safePreheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG};padding:36px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${CARD_BG};border:1px solid #E6E6E0;border-radius:22px;overflow:hidden;box-shadow:0 12px 36px rgba(0,0,0,0.07);">
          <tr>
            <td style="height:6px;background:linear-gradient(90deg,${ACCENT_BRIGHT},${ACCENT});font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td class="card-pad" style="padding:36px 30px 30px;">
              ${brandLogoBlock()}
              ${paragraph(intro)}
              ${codeBlock(code, codeLabel, expiresLabel)}
              ${paragraph(hint)}
              ${footer(ignore)}
            </td>
          </tr>
        </table>
        <p style="margin:20px 0 0;font-size:11px;line-height:1.4;color:#A0A09A;letter-spacing:0.06em;">© KRAÏNA</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const COPY = {
  uk: {
    subject: 'KRAÏNA — код для відновлення пароля',
    preheader: 'Ваш код для відновлення пароля в KRAÏNA',
    codeLabel: 'Ваш код',
    expiresLabel: 'Дійсний 15 хвилин',
    intro: 'Вітаємо! Ось код для відновлення пароля у додатку <strong style="color:#1A1A1A;">KRAÏNA</strong>.',
    hint: 'Введіть його на екрані <strong style="color:#5A6600;">«Забули пароль»</strong> у додатку.',
    ignore: 'Якщо ви не запитували відновлення пароля — проігноруйте цей лист.',
    textIntro: 'Вітаємо! Ось код для відновлення пароля у додатку KRAÏNA.',
    textHint: 'Введіть його на екрані «Забули пароль». Код дійсний 15 хвилин.',
    textIgnore: 'Якщо ви не запитували відновлення пароля — проігноруйте цей лист.',
  },
  ru: {
    subject: 'KRAÏNA — код для восстановления пароля',
    preheader: 'Ваш код для восстановления пароля в KRAÏNA',
    codeLabel: 'Ваш код',
    expiresLabel: 'Действителен 15 минут',
    intro: 'Здравствуйте! Вот ваш код подтверждения для сброса пароля в <strong style="color:#1A1A1A;">KRAÏNA</strong>.',
    hint: 'Введите его в приложении на экране <strong style="color:#5A6600;">«Забыли пароль»</strong>.',
    ignore: 'Если вы не запрашивали сброс пароля, можете смело проигнорировать это письмо.',
    textIntro: 'Здравствуйте! Вот ваш код подтверждения для сброса пароля в KRAÏNA.',
    textHint: 'Введите его в приложении на экране «Забыли пароль». Код действителен 15 минут.',
    textIgnore: 'Если вы не запрашивали сброс пароля, можете смело проигнорировать это письмо.',
  },
  en: {
    subject: 'KRAÏNA — password reset code',
    preheader: 'Your KRAÏNA password reset verification code',
    codeLabel: 'Your code',
    expiresLabel: 'Valid for 15 minutes',
    intro: 'Hello! Here is your password reset verification code for <strong style="color:#1A1A1A;">KRAÏNA</strong>.',
    hint: 'Enter it in the app on the <strong style="color:#5A6600;">Forgot password</strong> screen.',
    ignore: 'If you did not request a password reset, you can safely ignore this email.',
    textIntro: 'Hello! Here is your password reset verification code for KRAÏNA.',
    textHint: 'Enter it in the app on the Forgot password screen. The code expires in 15 minutes.',
    textIgnore: 'If you did not request a password reset, you can safely ignore this email.',
  },
  de: {
    subject: 'KRAÏNA — Code zum Zurücksetzen des Passworts',
    preheader: 'Ihr Bestätigungscode für KRAÏNA',
    codeLabel: 'Ihr Code',
    expiresLabel: '15 Minuten gültig',
    intro: 'Hallo! Hier ist Ihr Bestätigungscode zum Zurücksetzen des Passworts in <strong style="color:#1A1A1A;">KRAÏNA</strong>.',
    hint: 'Geben Sie ihn in der App unter <strong style="color:#5A6600;">„Passwort vergessen“</strong> ein.',
    ignore: 'Wenn Sie das nicht angefordert haben, ignorieren Sie diese E-Mail.',
    textIntro: 'Hallo! Hier ist Ihr Bestätigungscode zum Zurücksetzen des Passworts in KRAÏNA.',
    textHint: 'Geben Sie ihn in der App unter „Passwort vergessen“ ein. Gültig für 15 Minuten.',
    textIgnore: 'Wenn Sie das nicht angefordert haben, ignorieren Sie diese E-Mail.',
  },
  pl: {
    subject: 'KRAÏNA — kod resetowania hasła',
    preheader: 'Twój kod resetowania hasła w KRAÏNA',
    codeLabel: 'Twój kod',
    expiresLabel: 'Ważny 15 minut',
    intro: 'Witaj! Oto kod weryfikacyjny do resetowania hasła w <strong style="color:#1A1A1A;">KRAÏNA</strong>.',
    hint: 'Wpisz go w aplikacji na ekranie <strong style="color:#5A6600;">„Zapomniałeś hasła?“</strong>.',
    ignore: 'Jeśli nie prosiłeś o reset, zignoruj tę wiadomość.',
    textIntro: 'Witaj! Oto kod weryfikacyjny do resetowania hasła w KRAÏNA.',
    textHint: 'Wpisz go w aplikacji na ekranie „Zapomniałeś hasła?”. Ważny 15 minut.',
    textIgnore: 'Jeśli nie prosiłeś o reset, zignoruj tę wiadomość.',
  },
  nl: {
    subject: 'KRAÏNA — code om je wachtwoord te resetten',
    preheader: 'Je verificatiecode voor KRAÏNA',
    codeLabel: 'Je code',
    expiresLabel: '15 minuten geldig',
    intro: 'Hallo! Hier is je verificatiecode om je wachtwoord te resetten in <strong style="color:#1A1A1A;">KRAÏNA</strong>.',
    hint: 'Voer deze in de app in bij <strong style="color:#5A6600;">„Wachtwoord vergeten?“</strong>.',
    ignore: 'Heb je dit niet aangevraagd? Negeer deze e-mail.',
    textIntro: 'Hallo! Hier is je verificatiecode om je wachtwoord te resetten in KRAÏNA.',
    textHint: 'Voer deze in de app in bij „Wachtwoord vergeten?”. Geldig voor 15 minuten.',
    textIgnore: 'Heb je dit niet aangevraagd? Negeer deze e-mail.',
  },
  es: {
    subject: 'KRAÏNA — código para restablecer la contraseña',
    preheader: 'Tu código de verificación de KRAÏNA',
    codeLabel: 'Tu código',
    expiresLabel: 'Válido 15 minutos',
    intro: 'Hola! Este es tu código de verificación para restablecer la contraseña en <strong style="color:#1A1A1A;">KRAÏNA</strong>.',
    hint: 'Introdúcelo en la app en <strong style="color:#5A6600;">«¿Olvidaste tu contraseña?»</strong>.',
    ignore: 'Si no lo solicitaste, ignora este correo.',
    textIntro: 'Hola! Este es tu código de verificación para restablecer la contraseña en KRAÏNA.',
    textHint: 'Introdúcelo en la app en «¿Olvidaste tu contraseña?». Caduca en 15 minutos.',
    textIgnore: 'Si no lo solicitaste, ignora este correo.',
  },
  lt: {
    subject: 'KRAÏNA — slaptažodžio atkūrimo kodas',
    preheader: 'Jūsų KRAÏNA slaptažodžio atkūrimo kodas',
    codeLabel: 'Jūsų kodas',
    expiresLabel: 'Galioja 15 min',
    intro: 'Sveiki! Štai jūsų slaptažodžio atkūrimo kodas programėlėje <strong style="color:#1A1A1A;">KRAÏNA</strong>.',
    hint: 'Įveskite jį programėlėje skiltyje <strong style="color:#5A6600;">„Pamiršote slaptažodį?“</strong>.',
    ignore: 'Jei neprašėte atkūrimo, ignoruokite šį laišką.',
    textIntro: 'Sveiki! Štai jūsų slaptažodžio atkūrimo kodas programėlėje KRAÏNA.',
    textHint: 'Įveskite jį programėlėje skiltyje „Pamiršote slaptažodį?“. Galioja 15 min.',
    textIgnore: 'Jei neprašėte atkūrimo, ignoruokite šį laišką.',
  },
  lv: {
    subject: 'KRAÏNA — paroles atiestatīšanas kods',
    preheader: 'Jūsu KRAÏNA paroles atiestatīšanas kods',
    codeLabel: 'Jūsu kods',
    expiresLabel: 'Derīgs 15 minūtes',
    intro: 'Sveiki! Šis ir jūsu paroles atiestatīšanas kods lietotnē <strong style="color:#1A1A1A;">KRAÏNA</strong>.',
    hint: 'Ievadiet to lietotnē sadaļā <strong style="color:#5A6600;">«Aizmirsi paroli?»</strong>.',
    ignore: 'Ja nepieprasījāt atiestatīšanu, ignorējiet šo e-pastu.',
    textIntro: 'Sveiki! Šis ir jūsu paroles atiestatīšanas kods lietotnē KRAÏNA.',
    textHint: 'Ievadiet to lietotnē sadaļā «Aizmirsi paroli?». Derīgs 15 minūtes.',
    textIgnore: 'Ja nepieprasījāt atiestatīšanu, ignorējiet šo e-pastu.',
  },
  ro: {
    subject: 'KRAÏNA — cod pentru resetarea parolei',
    preheader: 'Codul tău de resetare parolă KRAÏNA',
    codeLabel: 'Codul tău',
    expiresLabel: 'Valabil 15 minute',
    intro: 'Bună! Iată codul tău de verificare pentru resetarea parolei în <strong style="color:#1A1A1A;">KRAÏNA</strong>.',
    hint: 'Introdu-l în aplicație la <strong style="color:#5A6600;">„Ai uitat parola?“</strong>.',
    ignore: 'Dacă nu ai solicitat resetarea, ignoră acest e-mail.',
    textIntro: 'Bună! Iată codul tău de verificare pentru resetarea parolei în KRAÏNA.',
    textHint: 'Introdu-l în aplicație la „Ai uitat parola?”. Valabil 15 minute.',
    textIgnore: 'Dacă nu ai solicitat resetarea, ignoră acest e-mail.',
  },
};

export function resetOtpEmailPayload(code, lang) {
  const langNorm = normalizeLang(lang);
  const pack = COPY[langNorm];
  const safeCode = String(code || '').replace(/[^\d]/g, '').slice(0, 6);

  const text = [
    'KRAÏNA',
    '',
    pack.textIntro,
    '',
    `${pack.codeLabel}: ${safeCode}`,
    '',
    pack.textHint,
    '',
    pack.textIgnore,
    '',
    '© KRAÏNA',
  ].join('\n');

  return {
    subject: pack.subject,
    text,
    html: buildResetOtpEmailHtml({
      code: safeCode,
      intro: pack.intro,
      hint: pack.hint,
      ignore: pack.ignore,
      codeLabel: pack.codeLabel,
      expiresLabel: pack.expiresLabel,
      preheader: pack.preheader,
      lang: langNorm,
    }),
  };
}

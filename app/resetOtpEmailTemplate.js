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

function brandLogoBlock() {
  return `<div style="text-align:center;margin:0 0 22px;">
    <span style="display:inline-block;font-size:30px;line-height:1;font-weight:700;letter-spacing:0.16em;color:${TEXT};font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">KRA</span><span style="display:inline-block;font-size:30px;line-height:1;font-weight:700;letter-spacing:0.16em;color:${ACCENT_DARK};font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Ï</span><span style="display:inline-block;font-size:30px;line-height:1;font-weight:700;letter-spacing:0.16em;color:${TEXT};font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">NA</span>
  </div>`;
}

function codeBlock(code, codeLabel) {
  const safe = escapeHtml(code);
  const label = escapeHtml(codeLabel);
  return `<div style="margin:6px 0 20px;padding:22px 18px 20px;border-radius:16px;background:linear-gradient(180deg,#FCFFE8 0%,#F4FAD1 100%);border:1px solid rgba(198,219,0,0.45);">
    <div style="font-size:12px;line-height:1.4;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${ACCENT_DARK};margin-bottom:12px;">${label}</div>
    <span style="display:inline-block;font-size:36px;line-height:1;font-weight:700;letter-spacing:12px;color:${TEXT};font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${safe}</span>
  </div>`;
}

function paragraph(text) {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${TEXT_MUTED};text-align:center;">${text}</p>`;
}

function footer(text) {
  return `<p style="margin:18px 0 0;font-size:12px;line-height:1.55;color:#8A8A86;text-align:center;">${text}</p>`;
}

export function buildResetOtpEmailHtml({ code, intro, hint, ignore, codeLabel }) {
  return `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>KRAÏNA</title>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG};padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${CARD_BG};border:1px solid #E6E6E0;border-radius:20px;overflow:hidden;box-shadow:0 10px 32px rgba(0,0,0,0.06);">
          <tr>
            <td style="height:5px;background:linear-gradient(90deg,${ACCENT_BRIGHT},${ACCENT});"></td>
          </tr>
          <tr>
            <td style="padding:34px 28px 28px;">
              ${brandLogoBlock()}
              ${paragraph(intro)}
              ${codeBlock(code, codeLabel)}
              ${paragraph(hint)}
              ${footer(ignore)}
            </td>
          </tr>
        </table>
        <p style="margin:18px 0 0;font-size:11px;line-height:1.4;color:#A0A09A;letter-spacing:0.06em;">© KRAÏNA</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const COPY = {
  uk: {
    subject: 'KRAÏNA — код для відновлення пароля',
    codeLabel: 'Ваш код',
    intro: 'Вітаємо! Ось код для відновлення пароля у додатку.',
    hint: 'Введіть його на екрані «Забули пароль». Код дійсний <strong style="color:#5A6600;">15 хвилин</strong>.',
    ignore: 'Якщо ви не запитували відновлення пароля — проігноруйте цей лист.',
  },
  en: {
    subject: 'KRAÏNA — password reset code',
    codeLabel: 'Your code',
    intro: 'Hello! Here is your password reset verification code.',
    hint: 'Enter it in the app on the <strong style="color:#5A6600;">Forgot password</strong> screen. Expires in <strong style="color:#5A6600;">15 minutes</strong>.',
    ignore: 'If you did not request a password reset, you can safely ignore this email.',
  },
  de: {
    subject: 'KRAÏNA — Code zum Zurücksetzen des Passworts',
    codeLabel: 'Ihr Code',
    intro: 'Hallo! Hier ist Ihr Bestätigungscode zum Zurücksetzen des Passworts.',
    hint: 'Geben Sie ihn in der App unter „Passwort vergessen“ ein. Gültig für <strong style="color:#5A6600;">15 Minuten</strong>.',
    ignore: 'Wenn Sie das nicht angefordert haben, ignorieren Sie diese E-Mail.',
  },
  pl: {
    subject: 'KRAÏNA — kod resetowania hasła',
    codeLabel: 'Twój kod',
    intro: 'Witaj! Oto kod weryfikacyjny do resetowania hasła.',
    hint: 'Wpisz go w aplikacji na ekranie „Zapomniałeś hasła?”. Ważny <strong style="color:#5A6600;">15 minut</strong>.',
    ignore: 'Jeśli nie prosiłeś o reset, zignoruj tę wiadomość.',
  },
  nl: {
    subject: 'KRAÏNA — code om je wachtwoord te resetten',
    codeLabel: 'Je code',
    intro: 'Hallo! Hier is je verificatiecode om je wachtwoord te resetten.',
    hint: 'Voer deze in de app in bij „Wachtwoord vergeten?”. Geldig voor <strong style="color:#5A6600;">15 minuten</strong>.',
    ignore: 'Heb je dit niet aangevraagd? Negeer deze e-mail.',
  },
  es: {
    subject: 'KRAÏNA — código para restablecer la contraseña',
    codeLabel: 'Tu código',
    intro: 'Hola! Este es tu código de verificación para restablecer la contraseña.',
    hint: 'Introdúcelo en la app en «¿Olvidaste tu contraseña?». Caduca en <strong style="color:#5A6600;">15 minutos</strong>.',
    ignore: 'Si no lo solicitaste, ignora este correo.',
  },
  lt: {
    subject: 'KRAÏNA — slaptažodžio atkūrimo kodas',
    codeLabel: 'Jūsų kodas',
    intro: 'Sveiki! Štai jūsų slaptažodžio atkūrimo kodas.',
    hint: 'Įveskite jį programėlėje skiltyje „Pamiršote slaptažodį?“. Galioja <strong style="color:#5A6600;">15 min</strong>.',
    ignore: 'Jei neprašėte atkūrimo, ignoruokite šį laišką.',
  },
  lv: {
    subject: 'KRAÏNA — paroles atiestatīšanas kods',
    codeLabel: 'Jūsu kods',
    intro: 'Sveiki! Šis ir jūsu paroles atiestatīšanas kods.',
    hint: 'Ievadiet to lietotnē sadaļā «Aizmirsi paroli?». Derīgs <strong style="color:#5A6600;">15 minūtes</strong>.',
    ignore: 'Ja nepieprasījāt atiestatīšanu, ignorējiet šo e-pastu.',
  },
  ro: {
    subject: 'KRAÏNA — cod pentru resetarea parolei',
    codeLabel: 'Codul tău',
    intro: 'Bună! Iată codul tău de verificare pentru resetarea parolei.',
    hint: 'Introdu-l în aplicație la „Ai uitat parola?”. Valabil <strong style="color:#5A6600;">15 minute</strong>.',
    ignore: 'Dacă nu ai solicitat resetarea, ignoră acest e-mail.',
  },
};

export function resetOtpEmailPayload(code, lang) {
  const raw = String(lang || 'en').split('-')[0].toLowerCase();
  const langNorm = raw === 'ru' ? 'uk' : raw;
  const pack = COPY[langNorm] || COPY.en;
  return {
    subject: pack.subject,
    html: buildResetOtpEmailHtml({
      code,
      intro: pack.intro,
      hint: pack.hint,
      ignore: pack.ignore,
      codeLabel: pack.codeLabel,
    }),
  };
}


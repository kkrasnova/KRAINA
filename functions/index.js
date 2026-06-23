const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const MAIL_FROM = process.env.RESET_MAIL_FROM || 'KRAINA <noreply@kraina.app>';
const MAIL_REPLY_TO = process.env.RESET_MAIL_REPLY_TO || 'support@kraina.world';
const RESET_CONTINUE_URL = process.env.RESET_PASSWORD_CONTINUE_URL || 'com.kraina.app://reset-password';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

function normalizeLang(raw) {
  const l = String(raw || 'en').toLowerCase().split(/[-_]/)[0];
  return l === 'ru' ? 'uk' : l;
}

function resetTemplate(lang, link) {
  const t = {
    uk: {
      subject: 'Скидання пароля в KRAINA',
      html: `<p>Вітаємо!</p><p>Ми отримали запит на скидання пароля для вашого акаунта KRAINA.</p><p><a href="${link}">Скинути пароль</a></p><p>Якщо це були не ви, просто проігноруйте цей лист.</p><p>З повагою,<br/>Команда KRAINA</p>`,
    },
    en: {
      subject: 'Reset your KRAINA password',
      html: `<p>Hello,</p><p>We received a request to reset the password for your KRAINA account.</p><p><a href="${link}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p><p>Best regards,<br/>KRAINA Team</p>`,
    },
    pl: {
      subject: 'Reset hasla w KRAINA',
      html: `<p>Czesc!</p><p>Otrzymalismy prosbe o zresetowanie hasla do Twojego konta KRAINA.</p><p><a href="${link}">Zresetuj haslo</a></p><p>Jesli to nie Ty, zignoruj te wiadomosc.</p><p>Pozdrawiamy,<br/>Zespol KRAINA</p>`,
    },
    nl: {
      subject: 'Wachtwoord opnieuw instellen in KRAINA',
      html: `<p>Hallo,</p><p>We hebben een verzoek ontvangen om je KRAINA-wachtwoord opnieuw in te stellen.</p><p><a href="${link}">Wachtwoord resetten</a></p><p>Heb je dit niet aangevraagd? Dan kun je deze e-mail negeren.</p><p>Met vriendelijke groet,<br/>KRAINA Team</p>`,
    },
    es: {
      subject: 'Restablece tu contrasena de KRAINA',
      html: `<p>Hola,</p><p>Hemos recibido una solicitud para restablecer la contrasena de tu cuenta KRAINA.</p><p><a href="${link}">Restablecer contrasena</a></p><p>Si no hiciste esta solicitud, ignora este correo.</p><p>Saludos,<br/>Equipo KRAINA</p>`,
    },
    de: {
      subject: 'Passwort fur KRAINA zurucksetzen',
      html: `<p>Hallo,</p><p>Wir haben eine Anfrage zum Zurucksetzen deines KRAINA-Passworts erhalten.</p><p><a href="${link}">Passwort zurucksetzen</a></p><p>Falls du das nicht angefordert hast, ignoriere diese E-Mail.</p><p>Viele Grusse,<br/>KRAINA Team</p>`,
    },
    lt: {
      subject: 'KRAINA slaptazodzio atkurimas',
      html: `<p>Sveiki,</p><p>Gavome uzklausa atkurti jusu KRAINA paskyros slaptazodi.</p><p><a href="${link}">Atkurti slaptazodi</a></p><p>Jei to neprasete, ignoruokite si laiska.</p><p>Pagarbiai,<br/>KRAINA komanda</p>`,
    },
    lv: {
      subject: 'KRAINA paroles atjaunosana',
      html: `<p>Sveiki,</p><p>Mes sanemam pieprasijumu atjaunot jusu KRAINA konta paroli.</p><p><a href="${link}">Atjaunot paroli</a></p><p>Ja to neprasijat, ignorejiet so e-pastu.</p><p>Ar cienu,<br/>KRAINA komanda</p>`,
    },
    ro: {
      subject: 'Resetarea parolei in KRAINA',
      html: `<p>Buna,</p><p>Am primit o solicitare de resetare a parolei pentru contul tau KRAINA.</p><p><a href="${link}">Reseteaza parola</a></p><p>Daca nu tu ai facut solicitarea, ignora acest email.</p><p>Cu drag,<br/>Echipa KRAINA</p>`,
    },
    it: {
      subject: 'Reimposta la password di KRAINA',
      html: `<p>Ciao,</p><p>Abbiamo ricevuto una richiesta di reimpostazione password per il tuo account KRAINA.</p><p><a href="${link}">Reimposta password</a></p><p>Se non sei stato tu, ignora questa email.</p><p>Cordiali saluti,<br/>Team KRAINA</p>`,
    },
    hy: {
      subject: 'KRAINA gaxnabarri verakangnum',
      html: `<p>Barev,</p><p>Stacel enq KRAINA hashvi gaxnabarri verakangnman harcum.</p><p><a href="${link}">Verakangnel gaxnabarry</a></p><p>Yete duq ch'ek harce, antsanek namaky:</p><p>Harganqov,<br/>KRAINA team</p>`,
    },
  };
  return t[normalizeLang(lang)] || t.en;
}

async function sendResetEmailViaResend(to, subject, html) {
  if (!RESEND_API_KEY || !/^re_/.test(RESEND_API_KEY)) {
    throw new Error('RESEND_NOT_CONFIGURED');
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: [to],
      reply_to: MAIL_REPLY_TO,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`RESEND_SEND_FAILED:${res.status}:${body.slice(0, 240)}`);
  }
}

exports.verifyBilling = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new Error('unauthenticated');
  }
  const uid = request.auth.uid;
  const payload = request.data || {};
  const subscription = {
    plan_type: payload.planType || 'premium',
    billing_period: payload.billingPeriod || 'monthly',
    is_active: true,
    expires_at: payload.expiresAt || null,
    payment_provider: payload.provider || 'iap',
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };
  await db.collection('subscriptions').doc(uid).set(subscription, { merge: true });
  return { subscription };
});

exports.suggestRoute = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new Error('unauthenticated');
  }
  const input = request.data || {};
  const stops = Array.isArray(input.candidateStops) ? input.candidateStops : [];
  const ranked = stops
    .slice()
    .sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0))
    .slice(0, 12);
  return {
    routePlan: {
      title: input.title || 'Smart route',
      stops: ranked,
    },
    usedAi: false,
    rationale: 'Firestore/cloud function heuristic',
  };
});

exports.cleanupExpiredStories = onSchedule('every 6 hours', async () => {
  const now = Date.now();
  const snap = await db.collection('feedStories').where('expiresAt', '<=', now).get();
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  if (!snap.empty) {
    await batch.commit();
  }
});

exports.sendPasswordResetEmailCustom = onCall(async (request) => {
  const emailRaw = String(request.data?.email || '').trim();
  const language = String(request.data?.language || 'en');
  if (!emailRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    throw new HttpsError('invalid-argument', 'INVALID_EMAIL');
  }
  const actionCodeSettings = {
    url: RESET_CONTINUE_URL,
    handleCodeInApp: false,
  };
  let link = '';
  try {
    link = await admin.auth().generatePasswordResetLink(emailRaw, actionCodeSettings);
  } catch (e) {
    
    if (String(e?.errorInfo?.code || '').includes('user-not-found')) {
      return { ok: true, masked: true };
    }
    throw new HttpsError('internal', 'RESET_LINK_FAILED');
  }
  const tpl = resetTemplate(language, link);
  try {
    await sendResetEmailViaResend(emailRaw, tpl.subject, tpl.html);
  } catch (e) {
    const msg = String(e?.message || 'RESET_MAIL_FAILED');
    if (msg.includes('RESEND_NOT_CONFIGURED')) {
      throw new HttpsError('failed-precondition', 'RESEND_NOT_CONFIGURED');
    }
    if (msg.startsWith('RESEND_SEND_FAILED')) {
      throw new HttpsError('internal', msg);
    }
    throw new HttpsError('internal', msg);
  }
  return { ok: true };
});


async function loadFcmTokens(uid) {
  if (!uid) return [];
  try {
    const snap = await db.collection('profiles').doc(String(uid)).get();
    if (!snap.exists) return [];
    const data = snap.data() || {};
    const map = data.fcmTokens && typeof data.fcmTokens === 'object' ? data.fcmTokens : {};
    return Object.keys(map).filter((k) => k && typeof k === 'string');
  } catch (_e) {
    return [];
  }
}

async function loadProfileLabel(uid) {
  if (!uid) return '';
  try {
    const snap = await db.collection('profiles').doc(String(uid)).get();
    if (!snap.exists) return '';
    const data = snap.data() || {};
    const u = String(data.username || '').trim();
    if (u) return `@${u}`;
    return String(data.display_name || data.displayName || '').trim();
  } catch (_e) {
    return '';
  }
}

async function pruneInvalidTokens(uid, responses, tokens) {
  const stale = [];
  responses.forEach((r, i) => {
    if (r.success) return;
    const code = String(r.error?.code || '');
    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token' ||
      code === 'messaging/invalid-argument'
    ) {
      stale.push(tokens[i]);
    }
  });
  if (!stale.length) return;
  const update = {};
  for (const t of stale) {
    update[`fcmTokens.${t}`] = admin.firestore.FieldValue.delete();
  }
  try {
    await db.collection('profiles').doc(String(uid)).update(update);
  } catch (_e) {
    
  }
}

async function pushTo(uid, title, body, data = {}) {
  const tokens = await loadFcmTokens(uid);
  if (!tokens.length) return;
  const message = {
    notification: { title, body },
    data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v == null ? '' : v)])),
    tokens,
  };
  try {
    const resp = await admin.messaging().sendEachForMulticast(message);
    await pruneInvalidTokens(uid, resp.responses || [], tokens);
  } catch (e) {
    console.warn('[pushTo]', uid, e?.message || e);
  }
}


exports.onSocialFollowCreated = onDocumentCreated(
  'socialFollows/{edgeId}',
  async (event) => {
    const data = event.data?.data() || {};
    const followerId = String(data.followerId || '');
    const followingId = String(data.followingId || '');
    if (!followerId || !followingId || followerId === followingId) return;
    const label = (await loadProfileLabel(followerId)) || 'Хтось';
    await pushTo(followingId, 'KRAÏNA', `${label} підписався на вас`, {
      type: 'follow',
      followerId,
    });
  },
);


exports.onSocialFollowRequestCreated = onDocumentCreated(
  'socialFollowRequests/{reqId}',
  async (event) => {
    const data = event.data?.data() || {};
    const fromUserId = String(data.fromUserId || '');
    const toUserId = String(data.toUserId || '');
    if (!fromUserId || !toUserId || fromUserId === toUserId) return;
    const label = (await loadProfileLabel(fromUserId)) || 'Хтось';
    await pushTo(toUserId, 'KRAÏNA', `${label} хоче на вас підписатися`, {
      type: 'follow_request',
      fromUserId,
    });
  },
);


exports.onMessageThreadMessageCreated = onDocumentCreated(
  'messageThreads/{threadId}/messages/{messageId}',
  async (event) => {
    const data = event.data?.data() || {};
    const senderId = String(data.senderId || '');
    const threadId = String(event.params?.threadId || '');
    if (!senderId || !threadId) return;
    let memberIds = [];
    try {
      const t = await db.collection('messageThreads').doc(threadId).get();
      const td = t.exists ? t.data() : null;
      memberIds = Array.isArray(td?.memberIds) ? td.memberIds.map(String) : [];
    } catch (_e) {
      return;
    }
    const recipients = memberIds.filter((id) => id && id !== senderId);
    if (!recipients.length) return;
    const label = (await loadProfileLabel(senderId)) || 'KRAÏNA';
    const text = String(data.content || '').slice(0, 140) || 'Нове повідомлення';
    await Promise.all(
      recipients.map((rid) =>
        pushTo(rid, label, text, {
          type: 'dm',
          threadId,
          senderId,
        }),
      ),
    );
  },
);

import { Alert, InteractionManager, Linking, Platform, Share } from 'react-native';
import { getSupportEmail } from './helpLinks';
import { ls } from './landmarkScannerI18n';

function buildMailto(email, subject, body) {
  const e = String(email || '').trim();
  if (!e) return '';
  const sub = subject != null ? String(subject) : '';
  const bod = body != null ? String(body) : '';
  if (!sub && !bod) return `mailto:${e}`;
  const parts = [];
  if (sub) parts.push(`subject=${encodeURIComponent(sub)}`);
  if (bod) parts.push(`body=${encodeURIComponent(bod)}`);
  return `mailto:${e}?${parts.join('&')}`;
}

async function tryOpenMailto(url) {
  if (!url) return false;
  try {
    const can = await Linking.canOpenURL(url);
    if (!can) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** Дочекатися закриття bottom sheet, щоб Share / mailto не блокувались модалкою. */
export function runAfterParamMenuDismiss(fn) {
  InteractionManager.runAfterInteractions(() => {
    setTimeout(fn, 320);
  });
}

export function buildLandmarkShareText({ headerTitle, subtitle, body }) {
  const parts = [String(headerTitle || '').trim()];
  const sub = String(subtitle || '').trim();
  if (sub) parts.push(sub);
  const b = String(body || '').trim();
  if (b) parts.push(b.slice(0, 2000));
  return parts.filter(Boolean).join('\n\n');
}

export function buildLandmarkMapsUrl({ visitLat, visitLng, headerTitle }) {
  if (
    visitLat != null &&
    visitLng != null &&
    Number.isFinite(Number(visitLat)) &&
    Number.isFinite(Number(visitLng))
  ) {
    return `https://www.google.com/maps/search/?api=1&query=${visitLat},${visitLng}`;
  }
  const q = encodeURIComponent(String(headerTitle || '').trim());
  return q ? `https://www.google.com/maps/search/?api=1&query=${q}` : '';
}

export async function shareLandmarkPublication({ language, headerTitle, subtitle, body }) {
  const message = buildLandmarkShareText({ headerTitle, subtitle, body });
  if (!message.trim()) {
    Alert.alert('', ls(language, 'paramMenuShareEmpty'));
    return;
  }
  const title = String(headerTitle || 'KRAÏNA').trim();
  try {
    await Share.share(
      Platform.OS === 'ios' ? { message, title } : { message, title, subject: title },
    );
  } catch {
    /* dismissed */
  }
}

export async function shareLandmarkLocation({ language, headerTitle, visitLat, visitLng }) {
  const url = buildLandmarkMapsUrl({ visitLat, visitLng, headerTitle });
  const title = String(headerTitle || '').trim();
  const message = [title, url].filter(Boolean).join('\n\n');
  if (!message.trim()) {
    Alert.alert('', ls(language, 'paramMenuShareEmpty'));
    return;
  }
  try {
    if (Platform.OS === 'ios' && url) {
      await Share.share({ message, url, title });
      return;
    }
    await Share.share(
      Platform.OS === 'android'
        ? { message, title, subject: title }
        : { message, title },
    );
  } catch {
    if (url) Linking.openURL(url).catch(() => {});
  }
}

export async function reportLandmarkIssue({
  language,
  headerTitle,
  subtitle,
  landmarkKey,
  visitLat,
  visitLng,
}) {
  const email = getSupportEmail();
  const subject = `KRAÏNA — ${String(headerTitle || 'landmark').trim()}`;
  const body = [
    ls(language, 'paramMenuReportBodyIntro'),
    '',
    `«${String(headerTitle || '').trim()}»`,
    subtitle ? String(subtitle).trim() : '',
    landmarkKey ? `ID: ${landmarkKey}` : '',
    visitLat != null && visitLng != null ? `GPS: ${visitLat}, ${visitLng}` : '',
    '',
    ls(language, 'paramMenuReportBodyFooter'),
  ]
    .filter(Boolean)
    .join('\n');

  Alert.alert(ls(language, 'paramMenuReport'), ls(language, 'paramMenuReportPrompt'), [
    { text: ls(language, 'paramMenuReportCancel'), style: 'cancel' },
    {
      text: ls(language, 'paramMenuReportSend'),
      onPress: () => {
        void (async () => {
          const mailto = buildMailto(email, subject, body);
          if (await tryOpenMailto(mailto)) return;
          if (await tryOpenMailto(`mailto:${email}`)) return;
          try {
            await Share.share({
              message: `${subject}\n\n${body}\n\n${email}`,
              title: email,
            });
          } catch {
            Alert.alert(ls(language, 'paramMenuReport'), `${email}\n\n${ls(language, 'paramMenuReportHint')}`);
          }
        })();
      },
    },
  ]);
}

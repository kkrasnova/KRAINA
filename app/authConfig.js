


function readFirebaseAndroidGoogleServices() {
  try {
    const gs = require('./google-services.json');
    const client = gs?.client?.[0];
    const packageName = client?.client_info?.android_client_info?.package_name || '';
    const oauthClients = client?.oauth_client || [];
    const web = oauthClients.find((c) => c.client_type === 3);
    const pi = gs?.project_info || {};
    return {
      webClientId: web?.client_id || '',
      androidPackage: packageName,
      projectId: pi.project_id || '',
      projectNumber: String(pi.project_number || ''),
    };
  } catch {
    return { webClientId: '', androidPackage: '', projectId: '', projectNumber: '' };
  }
}

function readIosClientIdFromPlist() {
  try {
    const fs = require('fs');
    const path = require('path');
    const candidates = [
      path.join(__dirname, 'ios', 'KRANA', 'GoogleService-Info.plist'),
      path.join(__dirname, 'GoogleService-Info.plist'),
    ];
    for (const plistPath of candidates) {
      if (!fs.existsSync(plistPath)) continue;
      const xml = fs.readFileSync(plistPath, 'utf8');
      const m = xml.match(/<key>CLIENT_ID<\/key>\s*<string>([^<]+)<\/string>/);
      const id = m?.[1]?.trim() || '';
      if (id && !id.includes('YOUR_')) return id;
    }
    return '';
  } catch {
    return '';
  }
}

function readIosClientIdFromJson() {
  try {
    const j = require('./google-ios-client.json');
    const id = j && typeof j.iosClientId === 'string' ? j.iosClientId.trim() : '';
    if (id && !id.includes('YOUR_')) return id;
    return readIosClientIdFromPlist();
  } catch {
    return readIosClientIdFromPlist();
  }
}

const firebaseGs = readFirebaseAndroidGoogleServices();


export const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || firebaseGs.webClientId || '';


export const GOOGLE_ANDROID_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID || firebaseGs.webClientId || GOOGLE_WEB_CLIENT_ID;


export const GOOGLE_SIGNIN_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_SIGNIN_WEB_CLIENT_ID ||
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID ||
  firebaseGs.webClientId ||
  GOOGLE_WEB_CLIENT_ID;


export const GOOGLE_OAUTH_ANDROID_PACKAGE =
  firebaseGs.androidPackage || 'com.kraina.app';


export const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';

export const GOOGLE_IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || readIosClientIdFromJson() || '';

/**
 * Для bare RN краще порожньо → у ThirdPage буде com.kraina.app://oauth (додай цей URI в Google Cloud → OAuth Web client).
 * HTTPS-проксі auth.expo.io часто ламається поза Expo Go — тільки якщо явно задати в .env.
 */
export const GOOGLE_REDIRECT_URI = process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_URI || '';

/** Geocoding API (обернене геокодування lat/lng → країна). Обмеж ключа в GCP за пакетом Android / bundle iOS. */
export const GOOGLE_GEOCODING_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_GEOCODING_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  '';


export const FACEBOOK_APP_ID = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID || '882763648264545';

const facebookLoginDisabledFlag = ['1', 'true', 'yes'].includes(
  String(process.env.EXPO_PUBLIC_FACEBOOK_LOGIN_DISABLED || '').toLowerCase(),
);

export const hasGoogleConfig = !!GOOGLE_SIGNIN_WEB_CLIENT_ID;
export const hasFacebookConfig = !!FACEBOOK_APP_ID;

export const showFacebookLogin = !!FACEBOOK_APP_ID && !facebookLoginDisabledFlag;

if (__DEV__) {
  if (firebaseGs.webClientId && GOOGLE_WEB_CLIENT_ID !== firebaseGs.webClientId) {
    console.warn(
      '[authConfig] EXPO_PUBLIC_GOOGLE_CLIENT_ID не збігається з Web client у google-services.json — можливий DEVELOPER_ERROR на Android.',
    );
  }
  if (GOOGLE_IOS_CLIENT_ID && firebaseGs.projectNumber && !GOOGLE_IOS_CLIENT_ID.startsWith(firebaseGs.projectNumber)) {
    console.warn(
      '[authConfig] GOOGLE_IOS_CLIENT_ID з іншого GCP-проєкту, ніж google-services.json — Firebase Google login може не прийняти idToken. Додай iOS у Firebase kraina-207c5 і онови google-ios-client.json',
    );
  }
  if (!GOOGLE_IOS_CLIENT_ID) {
    console.warn(
      '[authConfig] Не задано GOOGLE_IOS_CLIENT_ID (google-ios-client.json порожній). Для iOS нативного Google: Firebase → iOS app → CLIENT_ID у google-ios-client.json, потім npm run google:ios-scheme',
    );
  }
}



import { Platform } from 'react-native';

function readBuiltinOAuthClients() {
  try {
    return require('./oauthClients.json');
  } catch {
    return {};
  }
}

function readFirebaseAndroidGoogleServices() {
  try {
    const gs = require('./google-services.json');
    const client = gs?.client?.[0];
    const packageName = client?.client_info?.android_client_info?.package_name || '';
    const oauthClients = client?.oauth_client || [];
    const web = oauthClients.find((c) => c.client_type === 3);
    const android = oauthClients.find((c) => c.client_type === 1);
    const pi = gs?.project_info || {};
    return {
      webClientId: web?.client_id || '',
      androidClientId: android?.client_id || '',
      androidPackage: packageName,
      projectId: pi.project_id || '',
      projectNumber: String(pi.project_number || ''),
    };
  } catch {
    return {
      webClientId: '',
      androidClientId: '',
      androidPackage: '',
      projectId: '',
      projectNumber: '',
    };
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
const builtinOAuth = readBuiltinOAuthClients();

export const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ||
  firebaseGs.webClientId ||
  builtinOAuth.webClientId ||
  '';

export const GOOGLE_ANDROID_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID ||
  firebaseGs.webClientId ||
  GOOGLE_WEB_CLIENT_ID;

export const GOOGLE_SIGNIN_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_SIGNIN_WEB_CLIENT_ID ||
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID ||
  firebaseGs.webClientId ||
  builtinOAuth.webClientId ||
  GOOGLE_WEB_CLIENT_ID;

export const GOOGLE_OAUTH_ANDROID_PACKAGE =
  firebaseGs.androidPackage || 'com.kraina.app';

export const GOOGLE_ANDROID_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
  firebaseGs.androidClientId ||
  builtinOAuth.androidClientId ||
  '';

export const GOOGLE_IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
  readIosClientIdFromJson() ||
  builtinOAuth.iosClientId ||
  '';

/**
 * Для bare RN краще порожньо → у ThirdPage буде com.kraina.app:/oauthredirect (додай цей URI в Google Cloud → OAuth Web client).
 */
export const GOOGLE_REDIRECT_URI = process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_URI || '';

export const GOOGLE_OAUTH_REDIRECT_PATH = builtinOAuth.googleRedirectPath || 'oauthredirect';
export const FACEBOOK_OAUTH_REDIRECT_PATH = builtinOAuth.facebookRedirectPath || 'oauth';

/** iOS OAuth client expects reversed-client-id redirect, not com.kraina.app://… */
export function resolveGoogleOAuthRedirectUri(path = GOOGLE_OAUTH_REDIRECT_PATH) {
  const envUri = typeof GOOGLE_REDIRECT_URI === 'string' ? GOOGLE_REDIRECT_URI.trim() : '';
  if (envUri) return envUri;
  if (Platform.OS === 'ios' && GOOGLE_IOS_CLIENT_ID) {
    const prefix = GOOGLE_IOS_CLIENT_ID.replace(/\.apps\.googleusercontent\.com$/i, '');
    if (prefix && !prefix.includes('YOUR_')) {
      return `com.googleusercontent.apps.${prefix}:/${path}`;
    }
  }
  return '';
}

/** Geocoding API (обернене геокодування lat/lng → країна). Обмеж ключа в GCP за пакетом Android / bundle iOS. */
export const GOOGLE_GEOCODING_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_GEOCODING_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  '';

/** Лише з EXPO_PUBLIC_FACEBOOK_APP_ID — старий fallback App ID недійсний у Meta. */
export const FACEBOOK_APP_ID =
  typeof process.env.EXPO_PUBLIC_FACEBOOK_APP_ID === 'string'
    ? process.env.EXPO_PUBLIC_FACEBOOK_APP_ID.trim()
    : '';

export const FACEBOOK_REDIRECT_URI =
  typeof process.env.EXPO_PUBLIC_FACEBOOK_REDIRECT_URI === 'string'
    ? process.env.EXPO_PUBLIC_FACEBOOK_REDIRECT_URI.trim()
    : '';

const facebookLoginDisabledFlag = ['1', 'true', 'yes'].includes(
  String(process.env.EXPO_PUBLIC_FACEBOOK_LOGIN_DISABLED || '').toLowerCase(),
);

export const hasGoogleConfig =
  !!GOOGLE_SIGNIN_WEB_CLIENT_ID &&
  (Platform.OS !== 'ios' || !!GOOGLE_IOS_CLIENT_ID);

export const hasFacebookConfig = !!FACEBOOK_APP_ID;

export const showFacebookLogin = false;

if (__DEV__) {
  if (!FACEBOOK_APP_ID && !facebookLoginDisabledFlag) {
    console.warn(
      '[authConfig] EXPO_PUBLIC_FACEBOOK_APP_ID не задано — кнопка Facebook прихована. Додай App ID з Meta Developers у app/.env.',
    );
  }
  if (firebaseGs.webClientId && GOOGLE_WEB_CLIENT_ID !== firebaseGs.webClientId) {
    console.warn(
      '[authConfig] EXPO_PUBLIC_GOOGLE_CLIENT_ID не збігається з Web client у google-services.json — можливий DEVELOPER_ERROR на Android.',
    );
  }
  if (Platform.OS === 'ios') {
    if (GOOGLE_IOS_CLIENT_ID && firebaseGs.projectNumber && !GOOGLE_IOS_CLIENT_ID.startsWith(firebaseGs.projectNumber)) {
      console.warn(
        '[authConfig] GOOGLE_IOS_CLIENT_ID з іншого GCP-проєкту, ніж google-services.json — Firebase Google login може не прийняти idToken.',
      );
    }
    if (!GOOGLE_IOS_CLIENT_ID) {
      console.warn(
        '[authConfig] Не задано GOOGLE_IOS_CLIENT_ID — нативний Google Sign-In на iOS не працюватиме.',
      );
    }
  }
}

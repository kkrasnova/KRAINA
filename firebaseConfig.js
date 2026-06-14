
import AsyncStorage from '@react-native-async-storage/async-storage';

let app = null;
let db = null;
let auth = null;
let firebaseEnabled = false;
let firebaseAuthEnabled = false;

let firebaseWebConfig = null;

try {
  const { initializeApp, getApps, getApp } = require('firebase/app');
  const { getFirestore } = require('firebase/firestore');
  const { getAuth, initializeAuth, getReactNativePersistence } = require('firebase/auth');
  let googleServices = null;

  try {
    googleServices = require('./google-services.json');
  } catch {
    googleServices = null;
  }

  const googleProjectInfo = googleServices?.project_info || {};
  const googleClient = googleServices?.client?.[0] || {};
  const googleApiKey = googleClient?.api_key?.[0]?.current_key;

  const config = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || googleApiKey,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || (googleProjectInfo.project_id ? `${googleProjectInfo.project_id}.firebaseapp.com` : undefined),
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || googleProjectInfo.project_id,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || googleProjectInfo.storage_bucket,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || googleProjectInfo.project_number,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || googleClient?.client_info?.mobilesdk_app_id,
  };

  if (config.apiKey && config.projectId) {
    firebaseWebConfig = {
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      storageBucket: config.storageBucket,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId,
    };
    app = getApps().length ? getApp() : initializeApp(config);
    db = getFirestore(app);
    try {
      auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    } catch {
      auth = getAuth(app);
    }
    firebaseEnabled = true;
    firebaseAuthEnabled = true;
  }
} catch (e) {
  if (__DEV__) console.warn('[Firebase] not available:', e?.message);
}

export { app, db, auth, firebaseEnabled, firebaseAuthEnabled, firebaseWebConfig };

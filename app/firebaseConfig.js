
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

let app = null;
let db = null;
let auth = null;
let firebaseEnabled = false;
let firebaseAuthEnabled = false;

let firebaseWebConfig = null;

try {
  const { initializeApp, getApps, getApp } = require('firebase/app');
  const { getFirestore, initializeFirestore, connectFirestoreEmulator } = require('firebase/firestore');
  const { getAuth, initializeAuth, getReactNativePersistence, connectAuthEmulator } = require('firebase/auth');
  const { connectStorageEmulator, getStorage } = require('firebase/storage');
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
    if (Platform.OS === 'web') {
      db = getFirestore(app);
    } else {
      // Android/iOS emulators often fail WebChannel; long polling is more reliable.
      db = initializeFirestore(app, {
        experimentalForceLongPolling: true,
      });
    }
    try {
      auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    } catch {
      auth = getAuth(app);
    }
    firebaseEnabled = true;
    firebaseAuthEnabled = true;

    // Підключення до локальних Firebase-емуляторів у dev-режимі
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      const shouldUseEmulator = process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === '1';
      if (shouldUseEmulator) {
        // Android emulator использует 10.0.2.2 для доступа к host-машине
        const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
        if (db) {
          connectFirestoreEmulator(db, host, 8080);
        }
        if (auth) {
          connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
        }
        const storage = getStorage(app);
        connectStorageEmulator(storage, host, 9199);
        if (__DEV__) {
          console.log('[Firebase] Connected to local emulators:', { host, firestore: 8080, auth: 9099, storage: 9199 });
        }
      }
    }
  }
} catch (e) {
  if (__DEV__) console.warn('[Firebase] not available:', e?.message);
}

export { app, db, auth, firebaseEnabled, firebaseAuthEnabled, firebaseWebConfig };

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Alert,
  Modal,
  AppState,
  ActivityIndicator,
  Animated,
  Easing,
  Dimensions,
  InteractionManager,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useResponsive } from './useResponsive';
import { brandFontText } from './brandFont';
import { authOverlayFromErrorCode } from './authOverlayI18n';
import { thirdPageUi } from './thirdPageUiStrings';
import { getTermsContentForLanguage } from './termsContentI18n';
import {
  GOOGLE_WEB_CLIENT_ID,
  GOOGLE_SIGNIN_WEB_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_REDIRECT_URI,
  hasGoogleConfig,
  FACEBOOK_APP_ID,
  showFacebookLogin,
} from './authConfig';
import {
  registerUser,
  loginUser,
  loginOrRegisterGoogle,
  saveSession,
  getSession,
  updateUserPassword,
  requestPasswordResetCode,
  verifyPasswordResetCode,
  clearPasswordResetOtp,
  signInWithGoogleIdToken,
  signInWithFacebookAccessToken,
  signInWithAppleFirebase,
  completeAdminLoginWithCredentials,
  loginOrRegisterApple,
} from './db';
import {
  syncBackendSessionAfterThirdPageEmailAuth,
  syncBackendSessionAfterGoogleIdToken,
  syncBackendSessionAfterAppleIdentityToken,
} from './syncBackendSessionBridge';
import { useAuthStore } from './auth/authStore';
import { ApiError } from './auth/types';
import {
  isAdminGateEmail,
  isAppAdminUser,
  verifyAdminPasswordGate,
  verifyAdminPinGate,
} from './adminGate';
import { isAdminGateDeviceBlocked, recordAdminGateWrongPinAttempt } from './adminSecurityStorage';
import { getSavedCountryIdForUser, saveCountryForUser } from './countryStorage';
import { HOME_COUNTRY_ORDER } from './homeExploreData';
import { appLangBase } from './appLang';
import { getSubscriptionState } from './subscriptionStorage';
import { noAndroidRipple, rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';

let AuthSessionModule = null;

let FacebookAuthSessionProvider = null;
let GoogleSigninNative = null;

let SecureStoreModule = null;
let secureStoreRequireAttempted = false;
function getSecureStoreModule() {
  if (secureStoreRequireAttempted) return SecureStoreModule;
  secureStoreRequireAttempted = true;
  try {
    SecureStoreModule = require('expo-secure-store');
  } catch (_) {
    SecureStoreModule = null;
  }
  return SecureStoreModule;
}
try {
  GoogleSigninNative = require('@react-native-google-signin/google-signin');
  if (GoogleSigninNative && !GoogleSigninNative.GoogleSignin && GoogleSigninNative.default?.GoogleSignin) {
    GoogleSigninNative = GoogleSigninNative.default;
  }
} catch (_) {}
try {
  require('expo-web-browser');
  AuthSessionModule = require('expo-auth-session');
  FacebookAuthSessionProvider = require('expo-auth-session/providers/facebook');
} catch (e) {
  AuthSessionModule = null;
  FacebookAuthSessionProvider = null;

}


function devLogGoogleRedirectOnce(label, uri) {
  if (!__DEV__ || !uri) return;
  try {
    if (globalThis.__krainaGoogleRedirectUriLogged) return;
    globalThis.__krainaGoogleRedirectUriLogged = true;
    console.log(`[Google OAuth] ${label}:`, uri);
  } catch (_) {}
}

const LANGUAGE_STORAGE_KEY = '@kraina_app_language';
let storage = null;
try {
  storage = require('@react-native-async-storage/async-storage').default;
} catch (e) {
  storage = { getItem: async () => null, setItem: async () => {} };
}
const safeGetItem = async (key) => {
  try {
    return await storage.getItem(key);
  } catch (e) {
    return null;
  }
};
const safeSetItem = async (key, value) => {
  try {
    await storage.setItem(key, value);
  } catch (e) {}
};

const REMEMBER_ME_KEY = '@kraina_remember_me';
const REMEMBER_EMAIL_KEY = '@kraina_remember_email';
const REMEMBER_EMAIL_SECURE_KEY = '@kraina_remember_email_secure';
const REMEMBER_PASSWORD_SECURE_KEY = '@kraina_remember_password_secure';

const AUTH_FORM_DRAFT_KEY = '@kraina_auth_form_draft_v1';
const AUTH_DRAFT_PASSWORD_SECURE_KEY = '@kraina_auth_draft_password_secure';
const SECURE_STORE_OPTIONS = { keychainService: 'kraina.saved-login' };

const safeSecureGetItem = async (key) => {
  try {
    const SS = getSecureStoreModule();
    if (!SS?.getItemAsync) return null;
    return await SS.getItemAsync(key, SECURE_STORE_OPTIONS);
  } catch (e) {
    return null;
  }
};

const safeSecureSetItem = async (key, value) => {
  try {
    const SS = getSecureStoreModule();
    if (!SS?.setItemAsync) return;
    await SS.setItemAsync(key, value, SECURE_STORE_OPTIONS);
  } catch (e) {}
};

const safeSecureDeleteItem = async (key) => {
  try {
    const SS = getSecureStoreModule();
    if (!SS?.deleteItemAsync) return;
    await SS.deleteItemAsync(key, SECURE_STORE_OPTIONS);
  } catch (e) {}
};

function deriveBackendUsername(displayName, email) {
  const fromEmail = String(email || '')
    .split('@')[0]
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 28);

  let s = String(displayName || '')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 28);

  if (s.length < 3) s = fromEmail;
  if (s.length < 3) s = 'user';
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${s}_${rnd}`.slice(0, 32);
}

const ACCENT = '#E1FF00';

const ACCENT_PRESSED = '#C4D800';
const BG_DARK = '#000000';
const TEXT_DARK = '#1E1E1E';
const TEXT_LIGHT = '#FFFFFF';

const ANDROID_ACCENT_TEXT = {
  fontFamily: 'sans-serif-medium',
  color: '#000000',
  includeFontPadding: false,
};
const BRAND_TEXT_FONT = brandFontText;
const BORDER = 'rgba(255, 255, 255, 0.18)';
const INPUT_BG = 'rgba(225, 255, 0, 0.05)';

const LEMON_BRIGHT = '#EEFF66';


const LEMON_LINK_GLOW = Platform.select({
  ios: {
    textShadowColor: 'rgba(245, 255, 140, 0.95)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 11,
  },
  android: {
    textShadowColor: 'rgba(225, 255, 90, 0.9)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 5,
  },
  default: {},
});


const DESIGN_CONTENT_WIDTH = 335;
const DESIGN_INPUT_WIDTH = 273;
const DESIGN_TITLE_HEIGHT = 29;
const DESIGN_TITLE_FONT_SIZE = 24;

const AUTH_FORM_GAP = 16;

function normalizeAppLanguage(lang) {
  return appLangBase(lang || 'en');
}


const AUTH_LOAD_PULSE_HALF_MS = 620;

const AUTH_LOAD_LINE_MS = 980;


function authLoadingWaveLabel(language) {
  return thirdPageUi(language, 'loading');
}



const authSimpleLoaderStyles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
    paddingHorizontal: 8,
    ...Platform.select({
      ios: {
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.22,
        shadowRadius: 6,
      },
      android: { elevation: 0 },
      default: {},
    }),
  },
  wordWrap: {
    minHeight: 54,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  wordText: {
    fontSize: 34,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.1,
    textAlign: 'center',

    textShadowColor: 'rgba(225,255,0,0.65)',
    textShadowRadius: 16,
    textShadowOffset: { width: 0, height: 0 },
  },
  lineOuter: {
    position: 'relative',
    marginTop: 16,
    width: 112,
    maxWidth: '50%',
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(225, 255, 0, 0.2)',
  },
  lineHighlight: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    borderRadius: 2,
    backgroundColor: LEMON_BRIGHT,
    opacity: 0.92,
  },
});


function AuthLemonWaveTextLoader({ running, language }) {
  const pulse = useRef(new Animated.Value(1)).current;
  const lineT = useRef(new Animated.Value(0)).current;
  const pulseLoopRef = useRef(null);
  const lineLoopRef = useRef(null);

  const label = authLoadingWaveLabel(language);
  const letters = useMemo(() => Array.from(String(label)), [label]);

  const letterT = useMemo(() => letters.map(() => new Animated.Value(0)), [label]);
  const revealAnimationsRef = useRef([]);

  useEffect(() => {
    const stopAll = () => {
      if (pulseLoopRef.current) {
        pulseLoopRef.current.stop();
        pulseLoopRef.current = null;
      }
      if (lineLoopRef.current) {
        lineLoopRef.current.stop();
        lineLoopRef.current = null;
      }
      if (revealAnimationsRef.current.length) {
        revealAnimationsRef.current.forEach((a) => a?.stop?.());
        revealAnimationsRef.current = [];
      }

      letterT.forEach((v) => v.setValue(0));
      pulse.stopAnimation();
      lineT.stopAnimation();
      pulse.setValue(1);
      lineT.setValue(0);
    };

    if (!running) {
      stopAll();
      return;
    }

    pulse.setValue(1);
    lineT.setValue(0);

    let cancelled = false;
    let started = false;

    const startLoops = () => {
      if (cancelled || started) return;
      started = true;

      const easeLine = Easing.bezier(0.5, 0.8, 0.5, 0.2);

      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 0.86,
            duration: AUTH_LOAD_PULSE_HALF_MS,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 1,
            duration: AUTH_LOAD_PULSE_HALF_MS,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        { resetBeforeIteration: true },
      );
      pulseLoopRef.current = pulseLoop;
      pulseLoop.start();

      const lineSeq = Animated.sequence([
        Animated.timing(lineT, {
          toValue: 0.5,
          duration: AUTH_LOAD_LINE_MS / 2,
          easing: easeLine,
          useNativeDriver: true,
        }),
        Animated.timing(lineT, {
          toValue: 1,
          duration: AUTH_LOAD_LINE_MS / 2,
          easing: easeLine,
          useNativeDriver: true,
        }),
      ]);
      const lineLoop = Animated.loop(lineSeq, { resetBeforeIteration: true });
      lineLoopRef.current = lineLoop;
      lineLoop.start();


      const LETTER_STAGGER_MS = 48;
      const LETTER_REVEAL_MS = 520;
      const easeReveal = Easing.out(Easing.quad);


      letterT.forEach((v) => v.setValue(0));

      const revealAnims = letterT.map((v, idx) =>
        Animated.timing(v, {
          toValue: 1,
          duration: LETTER_REVEAL_MS,
          delay: idx * LETTER_STAGGER_MS,
          easing: easeReveal,
          useNativeDriver: false,
        }),
      );
      revealAnimationsRef.current = revealAnims;
      Animated.parallel(revealAnims).start();
    };

    const deferMs = Platform.OS === 'android' ? 40 : 16;
    const interactionTask = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) startLoops();
    });
    const timeoutId = setTimeout(() => {
      if (!cancelled) startLoops();
    }, deferMs);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      if (typeof interactionTask?.cancel === 'function') {
        interactionTask.cancel();
      }
      stopAll();
    };
  }, [running, pulse, lineT]);

  const lineTrackPx = 112;
  const lineTravel = lineTrackPx * 0.82;
  const lineTx = lineT.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [-lineTravel, lineTravel, -lineTravel],
    extrapolate: 'clamp',
  });



  /** Benzin лише якщо є в бандлі; на iOS без файлу шрифту — системний напис. */
  const font =
    Platform.OS === 'android'
      ? { fontFamily: 'Benzin-Regular', includeFontPadding: false }
      : { fontWeight: '600' };

  return (
    <View style={authSimpleLoaderStyles.root}>
      <View style={authSimpleLoaderStyles.wordWrap}>
        <Animated.View
          collapsable={false}
          style={{

            transform: [{ scale: pulse }],
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
            {letters.map((ch, idx) => {
              const revealOpacity = letterT[idx].interpolate({
                inputRange: [0, 1],
                outputRange: [0, 1],
              });
              const revealY = letterT[idx].interpolate({
                inputRange: [0, 1],
                outputRange: [14, 0],
              });
              const revealColor = letterT[idx].interpolate({
                inputRange: [0, 1],
                outputRange: ['#FFFFFF', ACCENT],
              });

              return (
                <Animated.Text
                  key={`${idx}-${ch}`}
                  style={[
                    authSimpleLoaderStyles.wordText,
                    font,
                    {
                      opacity: revealOpacity,
                      transform: [{ translateY: revealY }],
                      color: revealColor,
                      includeFontPadding: false,
                    },
                  ]}
                >
                  {ch === ' ' ? '\u00A0' : ch}
                </Animated.Text>
              );
            })}
          </View>
        </Animated.View>
      </View>
      <View style={authSimpleLoaderStyles.lineOuter}>
        <Animated.View
          collapsable={false}
          style={[authSimpleLoaderStyles.lineHighlight, { transform: [{ translateX: lineTx }] }]}
        />
      </View>
    </View>
  );
}


function AuthLemonBlockingOverlay({
  visible,
  phase,
  errorTitle,
  errorBody,
  suggestRegister,
  language,
  onDismiss,
  onGoRegister,
}) {
  const { width: winW, height: winH } = Dimensions.get('window');
  const scan = useRef(new Animated.Value(0)).current;
  const band = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible || (phase !== 'loading' && phase !== 'error')) {
      scan.setValue(0);
      band.setValue(0);
      return;
    }
    const scanLoop = Animated.loop(
      Animated.timing(scan, {
        toValue: 1,
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const bandOsc = Animated.loop(
      Animated.sequence([
        Animated.timing(band, {
          toValue: 1,
          duration: 5000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(band, {
          toValue: 0,
          duration: 5000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    scanLoop.start();
    bandOsc.start();
    return () => {
      scanLoop.stop();
      bandOsc.stop();
    };
  }, [visible, phase, scan, band]);

  const scanTx = scan.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -56],
  });
  const scanTy = scan.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -36],
  });
  const bandTx = band.interpolate({
    inputRange: [0, 1],
    outputRange: [-winW * 0.5, winW * 0.5],
  });

  const errorCardOpacity = useRef(new Animated.Value(0)).current;
  const errorCardSlide = useRef(new Animated.Value(22)).current;
  useEffect(() => {
    if (!visible || phase !== 'error') {
      errorCardOpacity.setValue(0);
      errorCardSlide.setValue(22);
      return;
    }
    errorCardOpacity.setValue(0);
    errorCardSlide.setValue(22);
    Animated.parallel([
      Animated.timing(errorCardOpacity, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(errorCardSlide, {
        toValue: 0,
        friction: 9,
        tension: 68,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, phase, errorTitle, errorCardOpacity, errorCardSlide]);

  if (!visible) return null;

  const dots = [];
  if (phase === 'loading' || phase === 'error') {
    const step = 7;
    for (let row = 0; row < 10; row += 1) {
      for (let col = 0; col < 16; col += 1) {
        if ((row + col) % 2 === 0) {
          dots.push(
            <View
              key={`d-${row}-${col}`}
              style={{
                position: 'absolute',
                left: col * step,
                top: row * step,
                width: 2,
                height: 2,
                backgroundColor: 'rgba(255, 255, 255, 0.14)',
              }}
            />,
          );
        }
      }
    }
  }

  return (
    <View style={authLemonOverlayStyles.root}>
      <View style={authLemonOverlayStyles.backdrop} />
      {phase === 'loading' || phase === 'error' ? (
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              authLemonOverlayStyles.patternPlane,
              { transform: [{ translateX: scanTx }, { translateY: scanTy }] },
            ]}
          >
            {dots}
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[
              authLemonOverlayStyles.lemonBand,
              {
                width: winW * 2.2,
                height: winH * 1.1,
                left: -winW * 0.35,
                top: winH * 0.12,
                transform: [{ rotate: '-62deg' }, { translateX: bandTx }],
              },
            ]}
          />
          <View style={authLemonOverlayStyles.multiplyTint} pointerEvents="none" />
          {phase === 'error' ? (
            <View style={authLemonOverlayStyles.errorVignette} pointerEvents="none" />
          ) : null}
        </>
      ) : null}
      {phase === 'loading' ? (
        <View style={authLemonOverlayStyles.loadingOnlyWrap}>
          <AuthLemonWaveTextLoader running={phase === 'loading'} language={language} />
        </View>
      ) : (
        <Animated.View
          style={[
            authLemonOverlayStyles.errorCardOuter,
            {
              opacity: errorCardOpacity,
              transform: [{ translateY: errorCardSlide }],
            },
          ]}
        >
          <View style={authLemonOverlayStyles.errorCardGlow} pointerEvents="none" />
          <View style={authLemonOverlayStyles.errorCard}>
            <View style={authLemonOverlayStyles.errorIconRing}>
              <Ionicons name="alert-circle-outline" size={32} color={ACCENT} />
            </View>
            <Text style={authLemonOverlayStyles.errorTitle}>{errorTitle}</Text>
            <View style={authLemonOverlayStyles.errorDivider} />
            <Text style={authLemonOverlayStyles.errorBody}>{errorBody}</Text>
            {suggestRegister ? (
              <Pressable
                onPress={onGoRegister}
                style={({ pressed }) => [
                  authLemonOverlayStyles.errorPrimaryBtn,
                  pressed && authLemonOverlayStyles.errorPrimaryBtnPressed,
                ]}
                android_ripple={noAndroidRipple}
              >
                <Text style={authLemonOverlayStyles.errorPrimaryBtnText}>{authOverlayRegisterCta(language)}</Text>
                <Ionicons name="arrow-forward-circle" size={22} color={TEXT_DARK} style={authLemonOverlayStyles.errorPrimaryBtnIcon} />
              </Pressable>
            ) : null}
            <Pressable
              onPress={onDismiss}
              style={({ pressed }) => [
                authLemonOverlayStyles.errorSecondaryBtn,
                pressed && authLemonOverlayStyles.errorSecondaryBtnPressed,
              ]}
              android_ripple={rippleOnDarkSurface}
            >
              <Text style={authLemonOverlayStyles.errorSecondaryBtnText}>
                {thirdPageUi(language, 'close')}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

function authOverlayRegisterCta(language) {
  return thirdPageUi(language, 'createAccount');
}

const authLemonOverlayStyles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    zIndex: 9999,
    elevation: 9999,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG_DARK,
  },
  loadingOnlyWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    zIndex: 20,
    ...Platform.select({
      android: { elevation: 24 },
      default: {},
    }),
  },
  patternPlane: {
    position: 'absolute',
    width: 200,
    height: 120,
    left: '12%',
    top: '18%',
    opacity: 0.45,
    zIndex: 0,
  },
  lemonBand: {
    position: 'absolute',
    backgroundColor: ACCENT,
    opacity: 0.11,
    zIndex: 0,
  },
  multiplyTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(225, 255, 0, 0.06)',
    zIndex: 1,
  },
  errorVignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12, 14, 8, 0.55)',
  },
  centerBlock: {
    paddingHorizontal: 28,
    maxWidth: 340,
    alignItems: 'center',
  },
  errorCardOuter: {
    position: 'relative',
    width: '100%',
    maxWidth: 352,
    paddingHorizontal: 20,
    alignItems: 'center',
    alignSelf: 'center',
  },
  errorCardGlow: {
    ...StyleSheet.absoluteFillObject,
    top: 8,
    bottom: 8,
    left: 28,
    right: 28,
    borderRadius: 28,
    backgroundColor: ACCENT,
    opacity: 0.08,
  },
  errorCard: {
    width: '100%',
    borderRadius: 22,
    paddingTop: 26,
    paddingBottom: 22,
    paddingHorizontal: 22,
    backgroundColor: 'rgba(22, 24, 18, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(225, 255, 100, 0.28)',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.18,
        shadowRadius: 28,
      },
      android: {
        elevation: 14,
      },
      default: {},
    }),
  },
  errorIconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    borderColor: 'rgba(238, 255, 102, 0.45)',
    backgroundColor: 'rgba(225, 255, 0, 0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  errorTitle: {
    fontSize: 22,
    lineHeight: 28,
    color: ACCENT,
    textAlign: 'center',
    letterSpacing: 0.2,
    ...(Platform.OS === 'android'
      ? { fontFamily: 'sans-serif-medium', includeFontPadding: false }
      : { ...BRAND_TEXT_FONT, fontWeight: '700' }),
  },
  errorDivider: {
    width: 56,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(225, 255, 0, 0.45)',
    marginTop: 14,
    marginBottom: 14,
  },
  errorBody: {
    fontSize: 15,
    lineHeight: 23,
    color: 'rgba(248, 248, 242, 0.92)',
    textAlign: 'center',
    marginBottom: 22,
    ...(Platform.OS === 'android' ? { fontFamily: 'sans-serif', includeFontPadding: false } : { ...BRAND_TEXT_FONT }),
  },
  errorPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT,
    paddingVertical: 15,
    paddingHorizontal: 22,
    borderRadius: 14,
    marginBottom: 12,
    minWidth: '100%',
    ...Platform.select({
      ios: {
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  errorPrimaryBtnPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  errorPrimaryBtnText: {
    color: TEXT_DARK,
    fontSize: 16,
    fontWeight: '600',
    ...(Platform.OS === 'android' ? { fontFamily: 'sans-serif-medium', includeFontPadding: false } : { ...BRAND_TEXT_FONT }),
  },
  errorPrimaryBtnIcon: {
    marginLeft: 10,
  },
  errorSecondaryBtn: {
    marginTop: 2,
    paddingVertical: 13,
    paddingHorizontal: 28,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    minWidth: '100%',
    alignItems: 'center',
  },
  errorSecondaryBtnPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  errorSecondaryBtnText: {
    color: LEMON_BRIGHT,
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.3,
    ...(Platform.OS === 'android' ? { fontFamily: 'sans-serif-medium', includeFontPadding: false } : { ...BRAND_TEXT_FONT }),
  },
});

const AUTH_PLACEHOLDER = '#8E8E8E';

const DEFAULT_LOGIN = {
  title: 'Login to the system',
  registerTitle: 'Registration',
  loginTab: 'Login',
  registerTab: 'Register',
  namePlaceholder: 'Name',
  emailPlaceholder: 'Email',
  passwordPlaceholder: 'Password',
  confirmPasswordPlaceholder: 'Confirm password',
  rememberMe: 'Remember me',
  forgotPassword: 'Forgot password?',
  loginButton: 'Login',
  orLoginWith: 'Or log in with',
  orRegisterWith: 'Or register with',
  hidePassword: 'Hide password',
  showPassword: 'Show password',
  loginWithGoogle: 'Log in with Google',
  loginWithFacebook: 'Log in with Facebook',
  loginWithApple: 'Log in with Apple',
  loginWithPhone: 'Log in with phone',
  registerWithGoogle: 'Register with Google',
  registerWithFacebook: 'Register with Facebook',
  registerWithApple: 'Register with Apple',
  errorInvalidEmail: 'Please enter a valid email address',
  errorEmptyEmail: 'Enter your email address',
  errorEmptyName: 'Enter your name',
  errorEmptyPassword: 'Enter your password',
  errorPasswordTooShort: 'Password must contain at least 6 characters',
  errorConfirmPassword: 'Confirm your password',
  errorPasswordMismatch: "Passwords don't match",
  errorTermsRequired: 'Confirm that you agree to the Terms of Use',
  errorWrongEmailOrPassword: 'Wrong email or password',
  errorEmptyFields: 'Enter your email and password',
  registerButton: 'Register',
  registerSuccess: 'You have been registered',
  errorEmailExists: 'This email is already registered',
  termsAgreement: 'I agree to the Terms of Use',
  termsOpen: 'Open Terms',
  termsTitle: 'Terms of Use',
  termsAccept: 'Accept Terms',
  termsBack: 'Back',
  forgotTitle: 'Recover password',
  forgotSendCode: 'Send code to email',
  forgotSendingEmail: 'Sending…',
  forgotYourCodeTitle: 'Your recovery code',
  forgotYourCodeHint:
    'The code is shown below — it stays on this device (no email/SMS server in the app). Enter it to continue.',
  forgotEnterCodeBelow: 'Enter the 6-digit code',
  forgotCodeExpired: 'This code has expired. Tap «Send again».',
  forgotCodeContinue: 'Continue',
  forgotCodeSent: 'Code sent',
  forgotEnterCode: 'Enter the code',
  forgotConfirmCode: 'Confirm',
  forgotNewPassword: 'New password',
  forgotConfirmPassword: 'Confirm password',
  forgotChangePassword: 'Change password',
  forgotSuccess: 'Password changed',
  forgotClose: 'Close',
  forgotWrongCode: 'Wrong code',
  forgotUserNotFound: 'User not found',
  forgotNoProfile: 'No profile with this email',
  forgotCreateProfile: 'Create an account',
  forgotCodeSentToEmail: 'Code sent to your email',
  forgotSuccessCanLogin: 'Password changed. You can log in.',
  forgotEmailNotRegistered:
    'This email is not registered in the app. Check the spelling or create a new account.',
  forgotInAppResetHint: 'No email will be sent. Enter a new password for your account below.',
  forgotNewPasswordAfterCode: 'Enter and confirm a new password. Then sign in with it.',
  forgotSendFailed: 'Could not send the reset email. Try again later.',
  forgotEmailCodeTitle: 'Code from email',
  forgotCheckEmailForCode:
    'We sent a 6-digit code to your email. Open the message and enter or paste the code below.',
  forgotEmailSendFailed: 'Could not send the email. Check internet or try again later.',
  forgotNoEmailConfigured:
    'Email code is not configured (add EXPO_PUBLIC_RESEND_API_KEY). The code is shown below instead.',
  forgotInvalidResendKey:
    'Invalid Resend API key in app/.env — it must start with re_ (create a key at resend.com → API Keys). Then npm run start:clear.',
  forgotResendSandbox:
    'Resend test mode: you can only send to your Resend account email (or add a verified domain and EXPO_PUBLIC_RESEND_FROM). Try the email you use to log in at resend.com.',
  forgotResendDomain:
    'Resend rejected the sender. Verify your domain in Resend and set EXPO_PUBLIC_RESEND_FROM (e.g. noreply@yourdomain.com).',
  forgotResendNetworkFailed:
    'Could not reach the email service (network). On Android emulator: open Chrome and visit a website; check Wi‑Fi; try a real device or disable VPN/firewall.',
};

/** Повний набір рядків «забули пароль» для мов з неповним LOGIN_TEXTS (uk/en уже в LOGIN_TEXTS / DEFAULT_LOGIN). */
const FORGOT_FLOW_I18N = {
  pl: {
    forgotTitle: 'Odzyskiwanie hasła',
    forgotSendCode: 'Wyślij 6-cyfrowy kod na e-mail',
    forgotSendingEmail: 'Wysyłanie…',
    forgotYourCodeTitle: 'Twój kod odzyskiwania',
    forgotYourCodeHint:
      'Kod jest poniżej — zapisany tylko na tym urządzeniu (brak serwera e-mail w aplikacji). Wpisz go, aby kontynuować.',
    forgotEnterCodeBelow: 'Wpisz 6-cyfrowy kod',
    forgotCodeExpired: 'Kod wygasł. Dotknij „Wyślij kod ponownie”.',
    forgotCodeContinue: 'Dalej',
    forgotCodeSent: 'Kod wysłany',
    forgotEnterCode: 'Wpisz kod',
    forgotConfirmCode: 'Potwierdź',
    forgotNewPassword: 'Nowe hasło',
    forgotConfirmPassword: 'Potwierdź hasło',
    forgotChangePassword: 'Zmień hasło',
    forgotSuccess: 'Hasło zmienione',
    forgotClose: 'Zamknij',
    forgotWrongCode: 'Nieprawidłowy kod',
    forgotUserNotFound: 'Nie znaleziono użytkownika',
    forgotNoProfile: 'Brak profilu dla tego adresu e-mail',
    forgotCreateProfile: 'Utwórz konto',
    forgotCodeSentToEmail: 'Wysłano kod na Twój e-mail',
    forgotSuccessCanLogin: 'Hasło zmienione. Możesz się zalogować.',
    forgotEmailNotRegistered:
      'Ten adres nie jest zarejestrowany w aplikacji. Sprawdź pisownię lub utwórz konto.',
    forgotInAppResetHint: 'E-mail nie zostanie wysłany. Wpisz nowe hasło do konta poniżej.',
    forgotNewPasswordAfterCode: 'Wpisz i potwierdź nowe hasło, potem zaloguj się nim.',
    forgotSendFailed: 'Nie udało się wysłać wiadomości resetującej. Spróbuj później.',
    forgotEmailCodeTitle: 'Kod z e-maila',
    forgotCheckEmailForCode:
      'Wysłaliśmy 6-cyfrowy kod na Twój e-mail. Otwórz wiadomość i wpisz lub wklej kod poniżej.',
    forgotEmailSendFailed: 'Nie udało się wysłać e-maila. Sprawdź internet i spróbuj ponownie.',
    forgotNoEmailConfigured:
      'Wysyłka e-maila nie jest skonfigurowana (dodaj EXPO_PUBLIC_RESEND_API_KEY). Kod pokazano poniżej.',
    forgotInvalidResendKey:
      'Nieprawidłowy klucz API Resend w app/.env — musi zaczynać się od re_ (resend.com → API Keys). Potem npm run start:clear.',
    forgotResendSandbox:
      'Tryb testowy Resend: możesz wysłać tylko na e-mail konta Resend lub po weryfikacji domeny i EXPO_PUBLIC_RESEND_FROM.',
    forgotResendDomain:
      'Resend odrzucił nadawcę. Zweryfikuj domenę w Resend i ustaw EXPO_PUBLIC_RESEND_FROM (np. noreply@twojadomena.pl).',
    forgotResendNetworkFailed:
      'Brak połączenia z serwisem e-mail. Na emulatorze Android: sprawdź internet w Chrome; spróbuj na prawdziwym urządzeniu.',
  },
  de: {
    forgotTitle: 'Passwort wiederherstellen',
    forgotSendCode: '6-stelligen Code per E-Mail senden',
    forgotSendingEmail: 'Wird gesendet…',
    forgotYourCodeTitle: 'Ihr Wiederherstellungscode',
    forgotYourCodeHint:
      'Der Code wird unten angezeigt — nur auf diesem Gerät gespeichert (kein E-Mail-Server in der App). Geben Sie ihn ein, um fortzufahren.',
    forgotEnterCodeBelow: '6-stelligen Code eingeben',
    forgotCodeExpired: 'Code abgelaufen. Tippen Sie auf „Code erneut senden“.',
    forgotCodeContinue: 'Weiter',
    forgotCodeSent: 'Code gesendet',
    forgotEnterCode: 'Code eingeben',
    forgotConfirmCode: 'Bestätigen',
    forgotNewPassword: 'Neues Passwort',
    forgotConfirmPassword: 'Passwort bestätigen',
    forgotChangePassword: 'Passwort ändern',
    forgotSuccess: 'Passwort geändert',
    forgotClose: 'Schließen',
    forgotWrongCode: 'Falscher Code',
    forgotUserNotFound: 'Benutzer nicht gefunden',
    forgotNoProfile: 'Kein Profil für diese E-Mail',
    forgotCreateProfile: 'Konto erstellen',
    forgotCodeSentToEmail: 'Code an Ihre E-Mail gesendet',
    forgotSuccessCanLogin: 'Passwort geändert. Sie können sich anmelden.',
    forgotEmailNotRegistered:
      'Diese E-Mail ist in der App nicht registriert. Schreibweise prüfen oder neues Konto erstellen.',
    forgotInAppResetHint: 'Es wird keine E-Mail gesendet. Neues Passwort unten eingeben.',
    forgotNewPasswordAfterCode: 'Neues Passwort eingeben und bestätigen, dann damit anmelden.',
    forgotSendFailed: 'Zurücksetzen-E-Mail konnte nicht gesendet werden. Später erneut versuchen.',
    forgotEmailCodeTitle: 'Code aus der E-Mail',
    forgotCheckEmailForCode:
      'Wir haben einen 6-stelligen Code an Ihre E-Mail gesendet. Öffnen Sie die Nachricht und geben Sie den Code unten ein.',
    forgotEmailSendFailed: 'E-Mail konnte nicht gesendet werden. Internet prüfen und erneut versuchen.',
    forgotNoEmailConfigured:
      'E-Mail-Versand nicht konfiguriert (EXPO_PUBLIC_RESEND_API_KEY hinzufügen). Code wird unten angezeigt.',
    forgotInvalidResendKey:
      'Ungültiger Resend-API-Schlüssel in app/.env — muss mit re_ beginnen (resend.com → API Keys). Dann npm run start:clear.',
    forgotResendSandbox:
      'Resend-Testmodus: nur an Ihre Resend-Konto-E-Mail oder nach Domain-Verifizierung und EXPO_PUBLIC_RESEND_FROM.',
    forgotResendDomain:
      'Resend hat den Absender abgelehnt. Domain in Resend verifizieren und EXPO_PUBLIC_RESEND_FROM setzen.',
    forgotResendNetworkFailed:
      'E-Mail-Dienst nicht erreichbar. Auf dem Android-Emulator: Internet in Chrome testen; echtes Gerät versuchen.',
  },
  es: {
    forgotTitle: 'Recuperar contraseña',
    forgotSendCode: 'Enviar código de 6 dígitos al correo',
    forgotSendingEmail: 'Enviando…',
    forgotYourCodeTitle: 'Tu código de recuperación',
    forgotYourCodeHint:
      'El código aparece abajo — solo en este dispositivo (la app no tiene servidor de correo). Introdúcelo para continuar.',
    forgotEnterCodeBelow: 'Introduce el código de 6 dígitos',
    forgotCodeExpired: 'El código caducó. Pulsa «Reenviar código».',
    forgotCodeContinue: 'Continuar',
    forgotCodeSent: 'Código enviado',
    forgotEnterCode: 'Introduce el código',
    forgotConfirmCode: 'Confirmar',
    forgotNewPassword: 'Nueva contraseña',
    forgotConfirmPassword: 'Confirmar contraseña',
    forgotChangePassword: 'Cambiar contraseña',
    forgotSuccess: 'Contraseña cambiada',
    forgotClose: 'Cerrar',
    forgotWrongCode: 'Código incorrecto',
    forgotUserNotFound: 'Usuario no encontrado',
    forgotNoProfile: 'No hay perfil con este correo',
    forgotCreateProfile: 'Crear una cuenta',
    forgotCodeSentToEmail: 'Código enviado a tu correo',
    forgotSuccessCanLogin: 'Contraseña cambiada. Ya puedes iniciar sesión.',
    forgotEmailNotRegistered:
      'Este correo no está registrado en la app. Revisa la dirección o crea una cuenta nueva.',
    forgotInAppResetHint: 'No se enviará correo. Escribe una nueva contraseña abajo.',
    forgotNewPasswordAfterCode: 'Escribe y confirma la nueva contraseña, luego inicia sesión.',
    forgotSendFailed: 'No se pudo enviar el correo de recuperación. Inténtalo más tarde.',
    forgotEmailCodeTitle: 'Código del correo',
    forgotCheckEmailForCode:
      'Enviamos un código de 6 dígitos a tu correo. Abre el mensaje e introdúcelo o pégalo abajo.',
    forgotEmailSendFailed: 'No se pudo enviar el correo. Comprueba la conexión e inténtalo de nuevo.',
    forgotNoEmailConfigured:
      'El envío por correo no está configurado (añade EXPO_PUBLIC_RESEND_API_KEY). El código se muestra abajo.',
    forgotInvalidResendKey:
      'Clave API de Resend no válida en app/.env — debe empezar por re_ (resend.com → API Keys). Luego npm run start:clear.',
    forgotResendSandbox:
      'Modo prueba de Resend: solo al correo de tu cuenta Resend o tras verificar dominio y EXPO_PUBLIC_RESEND_FROM.',
    forgotResendDomain:
      'Resend rechazó el remitente. Verifica el dominio en Resend y configura EXPO_PUBLIC_RESEND_FROM.',
    forgotResendNetworkFailed:
      'No se pudo contactar con el servicio de correo. En el emulador Android: prueba internet en Chrome.',
  },
  nl: {
    forgotTitle: 'Wachtwoord herstellen',
    forgotSendCode: 'Stuur een 6-cijferige code naar e-mail',
    forgotSendingEmail: 'Verzenden…',
    forgotYourCodeTitle: 'Je herstelcode',
    forgotYourCodeHint:
      'De code staat hieronder — alleen op dit apparaat (geen e-mailserver in de app). Voer hem in om verder te gaan.',
    forgotEnterCodeBelow: 'Voer de code van 6 cijfers in',
    forgotCodeExpired: 'Code verlopen. Tik op «Code opnieuw versturen».',
    forgotCodeContinue: 'Doorgaan',
    forgotCodeSent: 'Code verzonden',
    forgotEnterCode: 'Voer de code in',
    forgotConfirmCode: 'Bevestigen',
    forgotNewPassword: 'Nieuw wachtwoord',
    forgotConfirmPassword: 'Bevestig wachtwoord',
    forgotChangePassword: 'Wachtwoord wijzigen',
    forgotSuccess: 'Wachtwoord gewijzigd',
    forgotClose: 'Sluiten',
    forgotWrongCode: 'Onjuiste code',
    forgotUserNotFound: 'Gebruiker niet gevonden',
    forgotNoProfile: 'Geen profiel voor dit e-mailadres',
    forgotCreateProfile: 'Account aanmaken',
    forgotCodeSentToEmail: 'Code naar je e-mail verzonden',
    forgotSuccessCanLogin: 'Wachtwoord gewijzigd. Je kunt nu inloggen.',
    forgotEmailNotRegistered:
      'Dit e-mailadres is niet geregistreerd in de app. Controleer de spelling of maak een account.',
    forgotInAppResetHint: 'Er wordt geen e-mail verstuurd. Voer hieronder een nieuw wachtwoord in.',
    forgotNewPasswordAfterCode: 'Voer een nieuw wachtwoord in en bevestig het, log daarna in.',
    forgotSendFailed: 'Herstel-e-mail kon niet worden verzonden. Probeer het later opnieuw.',
    forgotEmailCodeTitle: 'Code uit e-mail',
    forgotCheckEmailForCode:
      'We hebben een code van 6 cijfers naar je e-mail gestuurd. Open het bericht en voer de code hieronder in.',
    forgotEmailSendFailed: 'E-mail kon niet worden verzonden. Controleer internet en probeer opnieuw.',
    forgotNoEmailConfigured:
      'E-mail niet geconfigureerd (voeg EXPO_PUBLIC_RESEND_API_KEY toe). Code staat hieronder.',
    forgotInvalidResendKey:
      'Ongeldige Resend API-sleutel in app/.env — moet beginnen met re_ (resend.com → API Keys). Daarna npm run start:clear.',
    forgotResendSandbox:
      'Resend-testmodus: alleen naar je Resend-accountmail of na domeinverificatie en EXPO_PUBLIC_RESEND_FROM.',
    forgotResendDomain:
      'Resend weigerde de afzender. Verifieer je domein in Resend en stel EXPO_PUBLIC_RESEND_FROM in.',
    forgotResendNetworkFailed:
      'Kan e-mailservice niet bereiken. Op Android-emulator: test internet in Chrome; probeer een echt apparaat.',
  },
  lt: {
    forgotTitle: 'Slaptažodžio atkūrimas',
    forgotSendCode: 'Siųsti 6 skaitmenų kodą el. paštu',
    forgotSendingEmail: 'Siunčiama…',
    forgotYourCodeTitle: 'Jūsų atkūrimo kodas',
    forgotYourCodeHint:
      'Kodas rodomas žemiau — tik šiame įrenginyje (programėlėje nėra el. pašto serverio). Įveskite jį tęsti.',
    forgotEnterCodeBelow: 'Įveskite 6 skaitmenų kodą',
    forgotCodeExpired: 'Kodas nebegalioja. Paspauskite „Siųsti kodą dar kartą“.',
    forgotCodeContinue: 'Toliau',
    forgotCodeSent: 'Kodas išsiųstas',
    forgotEnterCode: 'Įveskite kodą',
    forgotConfirmCode: 'Patvirtinti',
    forgotNewPassword: 'Naujas slaptažodis',
    forgotConfirmPassword: 'Patvirtinkite slaptažodį',
    forgotChangePassword: 'Pakeisti slaptažodį',
    forgotSuccess: 'Slaptažodis pakeistas',
    forgotClose: 'Uždaryti',
    forgotWrongCode: 'Neteisingas kodas',
    forgotUserNotFound: 'Naudotojas nerastas',
    forgotNoProfile: 'Nėra profilio šiam el. paštui',
    forgotCreateProfile: 'Sukurti paskyrą',
    forgotCodeSentToEmail: 'Kodas išsiųstas į jūsų el. paštą',
    forgotSuccessCanLogin: 'Slaptažodis pakeistas. Galite prisijungti.',
    forgotEmailNotRegistered:
      'Šis el. paštas neregistruotas programėlėje. Patikrinkite rašybą arba sukurkite paskyrą.',
    forgotInAppResetHint: 'Laiškas nebus išsiųstas. Įveskite naują slaptažodį žemiau.',
    forgotNewPasswordAfterCode: 'Įveskite ir patvirtinkite naują slaptažodį, tada prisijunkite.',
    forgotSendFailed: 'Nepavyko išsiųsti atkūrimo laiško. Bandykite vėliau.',
    forgotEmailCodeTitle: 'Kodas iš laiško',
    forgotCheckEmailForCode:
      'Išsiuntėme 6 skaitmenų kodą į jūsų el. paštą. Atidarykite laišką ir įveskite kodą žemiau.',
    forgotEmailSendFailed: 'Nepavyko išsiųsti laiško. Patikrinkite internetą ir bandykite dar kartą.',
    forgotNoEmailConfigured:
      'El. paštas nesukonfigūruotas (pridėkite EXPO_PUBLIC_RESEND_API_KEY). Kodas rodomas žemiau.',
    forgotInvalidResendKey:
      'Neteisingas Resend API raktas app/.env — turi prasidėti re_ (resend.com → API Keys). Tada npm run start:clear.',
    forgotResendSandbox:
      'Resend bandomasis režimas: tik į jūsų Resend paskyros el. paštą arba po domeno patvirtinimo.',
    forgotResendDomain:
      'Resend atmetė siuntėją. Patvirtinkite domeną Resend ir nustatykite EXPO_PUBLIC_RESEND_FROM.',
    forgotResendNetworkFailed:
      'Nepavyko pasiekti el. pašto paslaugos. Android emuliatoriuje: patikrinkite internetą.',
  },
  lv: {
    forgotTitle: 'Paroles atjaunošana',
    forgotSendCode: 'Nosūtīt 6 ciparu kodu uz e-pastu',
    forgotSendingEmail: 'Nosūta…',
    forgotYourCodeTitle: 'Jūsu atjaunošanas kods',
    forgotYourCodeHint:
      'Kods redzams zemāk — tikai šajā ierīcē (lietotnē nav e-pasta servera). Ievadiet to, lai turpinātu.',
    forgotEnterCodeBelow: 'Ievadiet 6 ciparu kodu',
    forgotCodeExpired: 'Kods beidzies derīgums. Pieskarieties «Nosūtīt kodu vēlreiz».',
    forgotCodeContinue: 'Tālāk',
    forgotCodeSent: 'Kods nosūtīts',
    forgotEnterCode: 'Ievadiet kodu',
    forgotConfirmCode: 'Apstiprināt',
    forgotNewPassword: 'Jauna parole',
    forgotConfirmPassword: 'Apstipriniet paroli',
    forgotChangePassword: 'Mainīt paroli',
    forgotSuccess: 'Parole nomainīta',
    forgotClose: 'Aizvērt',
    forgotWrongCode: 'Nepareizs kods',
    forgotUserNotFound: 'Lietotājs nav atrasts',
    forgotNoProfile: 'Nav profila šim e-pastam',
    forgotCreateProfile: 'Izveidot kontu',
    forgotCodeSentToEmail: 'Kods nosūtīts uz jūsu e-pastu',
    forgotSuccessCanLogin: 'Parole nomainīta. Varat pierakstīties.',
    forgotEmailNotRegistered:
      'Šis e-pasts nav reģistrēts lietotnē. Pārbaudiet rakstību vai izveidojiet kontu.',
    forgotInAppResetHint: 'E-pasts netiks nosūtīts. Ievadiet jaunu paroli zemāk.',
    forgotNewPasswordAfterCode: 'Ievadiet un apstipriniet jauno paroli, tad pierakstieties.',
    forgotSendFailed: 'Neizdevās nosūtīt atjaunošanas e-pastu. Mēģiniet vēlāk.',
    forgotEmailCodeTitle: 'Kods no e-pasta',
    forgotCheckEmailForCode:
      'Mēs nosūtījām 6 ciparu kodu uz jūsu e-pastu. Atveriet vēstuli un ievadiet kodu zemāk.',
    forgotEmailSendFailed: 'Neizdevās nosūtīt e-pastu. Pārbaudiet internetu un mēģiniet vēlreiz.',
    forgotNoEmailConfigured:
      'E-pasts nav konfigurēts (pievienojiet EXPO_PUBLIC_RESEND_API_KEY). Kods redzams zemāk.',
    forgotInvalidResendKey:
      'Nederīga Resend API atslēga app/.env — jāsākas ar re_ (resend.com → API Keys). Tad npm run start:clear.',
    forgotResendSandbox:
      'Resend testa režīms: tikai uz jūsu Resend konta e-pastu vai pēc domēna verifikācijas.',
    forgotResendDomain:
      'Resend noraidīja sūtītāju. Verificējiet domēnu Resend un iestatiet EXPO_PUBLIC_RESEND_FROM.',
    forgotResendNetworkFailed:
      'Nevar sasniegt e-pasta pakalpojumu. Android emulators: pārbaudiet internetu.',
  },
  ro: {
    forgotTitle: 'Recuperare parolă',
    forgotSendCode: 'Trimite cod din 6 cifre pe e-mail',
    forgotSendingEmail: 'Se trimite…',
    forgotYourCodeTitle: 'Codul tău de recuperare',
    forgotYourCodeHint:
      'Codul este afișat mai jos — doar pe acest dispozitiv (aplicația nu are server de e-mail). Introdu-l pentru a continua.',
    forgotEnterCodeBelow: 'Introdu codul din 6 cifre',
    forgotCodeExpired: 'Codul a expirat. Atinge „Trimite codul din nou”.',
    forgotCodeContinue: 'Continuă',
    forgotCodeSent: 'Cod trimis',
    forgotEnterCode: 'Introdu codul',
    forgotConfirmCode: 'Confirmă',
    forgotNewPassword: 'Parolă nouă',
    forgotConfirmPassword: 'Confirmă parola',
    forgotChangePassword: 'Schimbă parola',
    forgotSuccess: 'Parolă schimbată',
    forgotClose: 'Închide',
    forgotWrongCode: 'Cod incorect',
    forgotUserNotFound: 'Utilizator negăsit',
    forgotNoProfile: 'Nu există profil pentru acest e-mail',
    forgotCreateProfile: 'Creează un cont',
    forgotCodeSentToEmail: 'Cod trimis pe e-mailul tău',
    forgotSuccessCanLogin: 'Parolă schimbată. Te poți autentifica.',
    forgotEmailNotRegistered:
      'Acest e-mail nu este înregistrat în aplicație. Verifică adresa sau creează un cont nou.',
    forgotInAppResetHint: 'Nu se trimite e-mail. Introdu o parolă nouă mai jos.',
    forgotNewPasswordAfterCode: 'Introdu și confirmă parola nouă, apoi autentifică-te.',
    forgotSendFailed: 'Nu s-a putut trimite e-mailul de recuperare. Încearcă mai târziu.',
    forgotEmailCodeTitle: 'Codul din e-mail',
    forgotCheckEmailForCode:
      'Am trimis un cod din 6 cifre pe e-mail. Deschide mesajul și introdu codul mai jos.',
    forgotEmailSendFailed: 'Nu s-a putut trimite e-mailul. Verifică internetul și încearcă din nou.',
    forgotNoEmailConfigured:
      'E-mailul nu e configurat (adaugă EXPO_PUBLIC_RESEND_API_KEY). Codul e afișat mai jos.',
    forgotInvalidResendKey:
      'Cheie API Resend nevalidă în app/.env — trebuie să înceapă cu re_ (resend.com → API Keys). Apoi npm run start:clear.',
    forgotResendSandbox:
      'Mod test Resend: doar la e-mailul contului Resend sau după verificarea domeniului.',
    forgotResendDomain:
      'Resend a respins expeditorul. Verifică domeniul în Resend și setează EXPO_PUBLIC_RESEND_FROM.',
    forgotResendNetworkFailed:
      'Nu se poate contacta serviciul de e-mail. Pe emulator Android: verifică internetul.',
  },
  hy: {
    forgotTitle: 'Գաղտնաբառի վերականգնում',
    forgotSendCode: 'Ուղարկել 6 նիշ կոդ էլեկտրոնային փոստով',
    forgotSendingEmail: 'Ուղարկվում է…',
    forgotYourCodeTitle: 'Ձեր վերականգնման կոդը',
    forgotYourCodeHint:
      'Կոդը ցուցադրվում է ստորև՝ միայն այս սարքում (ծրագրում նամակների սերվեր չկա): Մուտքագրեք այն՝ շարունակելու համար:',
    forgotEnterCodeBelow: 'Մուտքագրեք 6 նիշ կոդը',
    forgotCodeExpired: 'Կոդը ժամկետանց է: Հպեք «Կրկին ուղարկել կոդը»:',
    forgotCodeContinue: 'Շարունակել',
    forgotCodeSent: 'Կոդը ուղարկված է',
    forgotEnterCode: 'Մուտքագրեք կոդը',
    forgotConfirmCode: 'Հաստատել',
    forgotNewPassword: 'Նոր գաղտնաբառ',
    forgotConfirmPassword: 'Հաստատեք գաղտնաբառը',
    forgotChangePassword: 'Փոխել գաղտնաբառը',
    forgotSuccess: 'Գաղտնաբառը փոխվել է',
    forgotClose: 'Փակել',
    forgotWrongCode: 'Սխալ կոդ',
    forgotUserNotFound: 'Օգտատեր չի գտնվել',
    forgotNoProfile: 'Այս էլ. փոստի համար պրոֆիլ չկա',
    forgotCreateProfile: 'Ստեղծել հաշիվ',
    forgotCodeSentToEmail: 'Կոդը ուղարկվել է ձեր էլ. փոստ',
    forgotSuccessCanLogin: 'Գաղտնաբառը փոխվել է: Կարող եք մուտք գործել:',
    forgotEmailNotRegistered:
      'Այս էլ. փոստը գրանցված չէ հավելվածում: Ստուգեք հասցեն կամ ստեղծեք նոր հաշիվ:',
    forgotInAppResetHint: 'Էլ. նամակ չի ուղարկվի: Մուտքագրեք նոր գաղտնաբառ ստորև:',
    forgotNewPasswordAfterCode: 'Մուտքագրեք և հաստատեք նոր գաղտնաբառը, ապա մուտք գործեք:',
    forgotSendFailed: 'Չհաջողվեց ուղարկել վերականգնման նամակը: Փորձեք ավելի ուշ:',
    forgotEmailCodeTitle: 'Կոդը նամակից',
    forgotCheckEmailForCode:
      'Մենք 6 նիշ կոդ ենք ուղարկել ձեր էլ. փոստ: Բացեք նամակը և մուտքագրեք կոդը ստորև:',
    forgotEmailSendFailed: 'Չհաջողվեց ուղարկել նամակը: Ստուգեք ինտերնետը և կրկին փորձեք:',
    forgotNoEmailConfigured:
      'Էլ. փոստը կարգավորված չէ (ավելացրեք EXPO_PUBLIC_RESEND_API_KEY): Կոդը ցուցադրվում է ստորև:',
    forgotInvalidResendKey:
      'Անվավեր Resend API բանալի app/.env-ում — պետք է սկսվի re_-ով (resend.com → API Keys): Այնուհետ npm run start:clear:',
    forgotResendSandbox:
      'Resend փորձարկման ռեժիմ՝ միայն ձեր Resend հաշվի էլ. փոստ կամ դոմենի հաստատումից հետո:',
    forgotResendDomain:
      'Resend-ը մերժել է ուղարկողին: Հաստատեք դոմենը Resend-ում և կարգավորեք EXPO_PUBLIC_RESEND_FROM:',
    forgotResendNetworkFailed:
      'Չհաջողվեց կապ հաստատել նամակների ծառայության հետ: Android էմուլյատորում՝ ստուգեք ինտերնետը:',
  },
};

/** Рядки модалки та чекбокса «Умови» для мов без повного LOGIN_TEXTS. */
const TERMS_LOGIN_I18N = {
  pl: {
    termsAgreement: 'Akceptuję Regulamin',
    termsOpen: 'Otwórz regulamin',
    termsTitle: 'Regulamin',
    termsAccept: 'Akceptuję regulamin',
    termsBack: 'Wstecz',
    errorTermsRequired: 'Potwierdź akceptację Regulaminu',
  },
  de: {
    termsAgreement: 'Ich stimme den Nutzungsbedingungen zu',
    termsOpen: 'Bedingungen öffnen',
    termsTitle: 'Nutzungsbedingungen',
    termsAccept: 'Bedingungen akzeptieren',
    termsBack: 'Zurück',
    errorTermsRequired: 'Bitte bestätigen Sie die Zustimmung zu den Nutzungsbedingungen',
  },
  nl: {
    termsAgreement: 'Ik ga akkoord met de gebruiksvoorwaarden',
    termsOpen: 'Voorwaarden openen',
    termsTitle: 'Gebruiksvoorwaarden',
    termsAccept: 'Voorwaarden accepteren',
    termsBack: 'Terug',
    errorTermsRequired: 'Bevestig dat u akkoord gaat met de gebruiksvoorwaarden',
  },
  es: {
    termsAgreement: 'Acepto los términos de uso',
    termsOpen: 'Abrir términos',
    termsTitle: 'Términos de uso',
    termsAccept: 'Aceptar términos',
    termsBack: 'Atrás',
    errorTermsRequired: 'Confirma que aceptas los términos de uso',
  },
  lt: {
    termsAgreement: 'Sutinku su naudojimo sąlygomis',
    termsOpen: 'Atidaryti sąlygas',
    termsTitle: 'Naudojimo sąlygos',
    termsAccept: 'Priimti sąlygas',
    termsBack: 'Atgal',
    errorTermsRequired: 'Patvirtinkite, kad sutinkate su naudojimo sąlygomis',
  },
  lv: {
    termsAgreement: 'Es piekrītu lietošanas noteikumiem',
    termsOpen: 'Atvērt noteikumus',
    termsTitle: 'Lietošanas noteikumi',
    termsAccept: 'Pieņemt noteikumus',
    termsBack: 'Atpakaļ',
    errorTermsRequired: 'Apstipriniet piekrišanu lietošanas noteikumiem',
  },
  ro: {
    termsAgreement: 'Sunt de acord cu termenii de utilizare',
    termsOpen: 'Deschide termenii',
    termsTitle: 'Termeni de utilizare',
    termsAccept: 'Accept termenii',
    termsBack: 'Înapoi',
    errorTermsRequired: 'Confirmă că ești de acord cu termenii de utilizare',
  },
  hy: {
    termsAgreement: 'Համաձայն եմ օգտագործման պայմանների հետ',
    termsOpen: 'Բացել պայմանները',
    termsTitle: 'Օգտագործման պայմաններ',
    termsAccept: 'Ընդունել պայմանները',
    termsBack: 'Հետ',
    errorTermsRequired: 'Հաստատեք, որ համաձայն եք օգտագործման պայմանների հետ',
  },
};

const LOGIN_TEXTS = {
  uk: {
    title: 'Вхід у систему',
    registerTitle: 'Реєстрація',
    loginTab: 'Увійти',
    registerTab: 'Зареєструвати',
    namePlaceholder: "Ім'я",
    emailPlaceholder: 'Пошта',
    passwordPlaceholder: 'Пароль',
    confirmPasswordPlaceholder: 'Підтвердіть пароль',
    rememberMe: "Запам'ятати мене",
    forgotPassword: 'Забули пароль?',
    loginButton: 'Вхід',
    orLoginWith: 'Або увійдіть за допомогою',
    orRegisterWith: 'Або зареєструйтеся за допомогою',
    hidePassword: 'Сховати пароль',
    showPassword: 'Показати пароль',
    errorInvalidEmail: 'Введіть коректну адресу електронної пошти',
    errorEmptyEmail: 'Введіть адресу електронної пошти',
    errorEmptyName: "Введіть ім'я",
    errorEmptyPassword: 'Введіть пароль',
    errorPasswordTooShort: 'Пароль має містити щонайменше 6 символів',
    errorConfirmPassword: 'Підтвердіть пароль',
    errorPasswordMismatch: 'Паролі не збігаються',
    errorTermsRequired: 'Підтвердіть згоду з Умовами користування',
    errorWrongEmailOrPassword: 'Невірна пошта або пароль',
    errorEmptyFields: 'Введіть пошту та пароль',
    registerButton: 'Зареєструвати',
    registerSuccess: 'Ви успішно зареєстровані',
    errorEmailExists: 'Ця пошта вже зареєстрована',
    termsAgreement: 'Погоджуюся з Умовами користування',
    termsOpen: 'Відкрити умови',
    termsTitle: 'Умови користування',
    termsAccept: 'Прийняти умови',
    termsBack: 'Назад',
    forgotTitle: 'Відновлення пароля',
    forgotSendCode: 'Надіслати код на пошту',
    forgotSendingEmail: 'Надсилаємо…',
    forgotYourCodeTitle: 'Ваш код відновлення',
    forgotYourCodeHint:
      'Код показано нижче — він зберігається лише на цьому пристрої (у додатку немає сервера для SMS/листів). Введіть його, щоб продовжити.',
    forgotEnterCodeBelow: 'Введіть 6-значний код',
    forgotCodeExpired: 'Код прострочено. Натисніть «Надіслати знову».',
    forgotCodeContinue: 'Далі',
    forgotCodeSent: 'Код надіслано',
    forgotEnterCode: 'Введіть код',
    forgotConfirmCode: 'Підтвердити',
    forgotNewPassword: 'Новий пароль',
    forgotConfirmPassword: 'Підтвердіть пароль',
    forgotChangePassword: 'Змінити пароль',
    forgotSuccess: 'Пароль змінено',
    forgotClose: 'Закрити',
    forgotWrongCode: 'Невірний код',
    forgotUserNotFound: 'Користувача не знайдено',
    forgotNoProfile: 'На цю пошту немає профілю',
    forgotCreateProfile: 'Створити акаунт',
    forgotCodeSentToEmail: 'Код надіслано на вашу пошту',
    forgotSuccessCanLogin: 'Пароль змінено. Можете увійти в систему.',
    forgotEmailNotRegistered:
      'Ця пошта не зареєстрована в додатку. Перевірте написання або створіть новий акаунт.',
    forgotInAppResetHint: 'Лист не надсилається. Введіть новий пароль для облікового запису нижче.',
    forgotNewPasswordAfterCode: 'Введіть і підтвердіть новий пароль, потім увійдіть з ним.',
    forgotSendFailed: 'Не вдалося надіслати лист для відновлення. Спробуйте пізніше.',
    forgotEmailCodeTitle: 'Код з пошти',
    forgotCheckEmailForCode:
      'Ми надіслали 6-значний код на вашу пошту. Відкрийте лист і введіть або вставте код нижче.',
    forgotEmailSendFailed: 'Не вдалося надіслати лист. Перевірте інтернет або спробуйте пізніше.',
    forgotNoEmailConfigured:
      'Лист з кодом не налаштовано (додайте EXPO_PUBLIC_RESEND_API_KEY). Код показано нижче.',
    forgotInvalidResendKey:
      'Невірний ключ Resend у app/.env — має починатися з re_ (ключ на resend.com → API Keys). Потім npm run start:clear.',
    forgotResendSandbox:
      'Режим тесту Resend: лист можна надіслати лише на пошту вашого акаунта Resend або після верифікації домену та EXPO_PUBLIC_RESEND_FROM. Спробуйте ту саму пошту, якою входите в resend.com.',
    forgotResendDomain:
      'Resend відхилив відправника. Підтвердіть домен у Resend і вкажіть EXPO_PUBLIC_RESEND_FROM (наприклад noreply@ваш-домен).',
    forgotResendNetworkFailed:
      'Не вдалося з’єднатися з сервісом листів (мережа). На Android-емуляторі: відкрийте Chrome і перевірте інтернет; спробуйте реальний телефон або вимкніть VPN/фаєрвол.',
    loginWithGoogle: 'Увійти через Google',
    loginWithFacebook: 'Увійти через Facebook',
    loginWithApple: 'Увійти через Apple',
    loginWithPhone: 'Увійти по телефону',
    registerWithGoogle: 'Зареєструватися через Google',
    registerWithFacebook: 'Зареєструватися через Facebook',
    registerWithApple: 'Зареєструватися через Apple',
  },
  en: DEFAULT_LOGIN,
  pl: {
    title: 'Logowanie do systemu',
    loginTab: 'Zaloguj',
    registerTab: 'Zarejestruj się',
    emailPlaceholder: 'E-mail',
    passwordPlaceholder: 'Hasło',
    rememberMe: 'Zapamiętaj mnie',
    forgotPassword: 'Zapomniałeś hasła?',
    loginButton: 'Zaloguj',
    orLoginWith: 'Lub zaloguj się przez',
    orRegisterWith: 'Lub zarejestruj się przez',
    hidePassword: 'Ukryj hasło',
    showPassword: 'Pokaż hasło',
    loginWithGoogle: 'Zaloguj przez Google',
    loginWithFacebook: 'Zaloguj przez Facebook',
    loginWithApple: 'Zaloguj przez Apple',
    loginWithPhone: 'Zaloguj przez telefon',
    registerWithGoogle: 'Zarejestruj przez Google',
    registerWithFacebook: 'Zarejestruj przez Facebook',
    registerWithApple: 'Zarejestruj przez Apple',
  },
  de: {
    title: 'Systemanmeldung',
    loginTab: 'Anmelden',
    registerTab: 'Registrieren',
    emailPlaceholder: 'E-Mail',
    passwordPlaceholder: 'Passwort',
    rememberMe: 'Angemeldet bleiben',
    forgotPassword: 'Passwort vergessen?',
    loginButton: 'Anmelden',
    orLoginWith: 'Oder anmelden mit',
    orRegisterWith: 'Oder registrieren mit',
    hidePassword: 'Passwort verbergen',
    showPassword: 'Passwort anzeigen',
    loginWithGoogle: 'Mit Google anmelden',
    loginWithFacebook: 'Mit Facebook anmelden',
    loginWithApple: 'Mit Apple anmelden',
    loginWithPhone: 'Mit Telefon anmelden',
    registerWithGoogle: 'Mit Google registrieren',
    registerWithFacebook: 'Mit Facebook registrieren',
    registerWithApple: 'Mit Apple registrieren',
  },
  es: {
    title: 'Inicio de sesión',
    loginTab: 'Iniciar sesión',
    registerTab: 'Registrarse',
    emailPlaceholder: 'Correo',
    passwordPlaceholder: 'Contraseña',
    rememberMe: 'Recordarme',
    forgotPassword: '¿Olvidaste tu contraseña?',
    loginButton: 'Entrar',
    orLoginWith: 'O inicia sesión con',
    orRegisterWith: 'O regístrate con',
    hidePassword: 'Ocultar contraseña',
    showPassword: 'Mostrar contraseña',
    loginWithGoogle: 'Entrar con Google',
    loginWithFacebook: 'Entrar con Facebook',
    loginWithApple: 'Entrar con Apple',
    loginWithPhone: 'Entrar con teléfono',
    registerWithGoogle: 'Registrarse con Google',
    registerWithFacebook: 'Registrarse con Facebook',
    registerWithApple: 'Registrarse con Apple',
  },
  nl: {
    title: 'Inloggen op het systeem',
    loginTab: 'Inloggen',
    registerTab: 'Registreren',
    emailPlaceholder: 'E-mail',
    passwordPlaceholder: 'Wachtwoord',
    rememberMe: 'Onthoud mij',
    forgotPassword: 'Wachtwoord vergeten?',
    loginButton: 'Inloggen',
    orLoginWith: 'Of log in met',
    orRegisterWith: 'Of registreer met',
    hidePassword: 'Wachtwoord verbergen',
    showPassword: 'Wachtwoord tonen',
    loginWithGoogle: 'Inloggen met Google',
    loginWithFacebook: 'Inloggen met Facebook',
    loginWithApple: 'Inloggen met Apple',
    loginWithPhone: 'Inloggen met telefoon',
    registerWithGoogle: 'Registreren met Google',
    registerWithFacebook: 'Registreren met Facebook',
    registerWithApple: 'Registreren met Apple',
  },
  lt: { title: 'Prisijungimas prie sistemos', loginTab: 'Prisijungti', registerTab: 'Registruotis', emailPlaceholder: 'El. paštas', passwordPlaceholder: 'Slaptažodis', rememberMe: 'Prisiminti mane', forgotPassword: 'Pamiršote slaptažodį?', loginButton: 'Prisijungti', orLoginWith: 'Arba prisijunkite su', hidePassword: 'Slėpti slaptažodį', showPassword: 'Rodyti slaptažodį', loginWithGoogle: 'Prisijungti su Google', loginWithFacebook: 'Prisijungti su Facebook', loginWithApple: 'Prisijungti su Apple', loginWithPhone: 'Prisijungti su telefonu' },
  lv: { title: 'Pieslēgties sistēmai', loginTab: 'Pieslēgties', registerTab: 'Reģistrēties', emailPlaceholder: 'E-pasts', passwordPlaceholder: 'Parole', rememberMe: 'Atcerēties mani', forgotPassword: 'Aizmirsi paroli?', loginButton: 'Pieslēgties', orLoginWith: 'Vai pieslēdzieties ar', hidePassword: 'Slēpt paroli', showPassword: 'Rādīt paroli', loginWithGoogle: 'Pieslēgties ar Google', loginWithFacebook: 'Pieslēgties ar Facebook', loginWithApple: 'Pieslēgties ar Apple', loginWithPhone: 'Pieslēgties ar tālruni' },
  ro: { title: 'Autentificare în sistem', loginTab: 'Autentificare', registerTab: 'Înregistrare', emailPlaceholder: 'E-mail', passwordPlaceholder: 'Parolă', rememberMe: 'Ține-mă minte', forgotPassword: 'Ai uitat parola?', loginButton: 'Autentificare', orLoginWith: 'Sau conectează-te cu', hidePassword: 'Ascunde parola', showPassword: 'Arată parola', loginWithGoogle: 'Conectare cu Google', loginWithFacebook: 'Conectare cu Facebook', loginWithApple: 'Conectare cu Apple', loginWithPhone: 'Conectare cu telefonul' },
  hy: {
    title: 'Մուտք համակարգ',
    registerTitle: 'Գրանցում',
    loginTab: 'Մուտք',
    registerTab: 'Գրանցվել',
    namePlaceholder: 'Անուն',
    emailPlaceholder: 'Էլ. փոստ',
    passwordPlaceholder: 'Գաղտնաբառ',
    confirmPasswordPlaceholder: 'Հաստատեք գաղտնաբառը',
    rememberMe: 'Հիշել ինձ',
    forgotPassword: 'Մոռացե՞լ եք գաղտնաբառը',
    loginButton: 'Մուտք',
    orLoginWith: 'Կամ մուտք գործել',
    orRegisterWith: 'Կամ գրանցվել',
    hidePassword: 'Թաքցնել գաղտնաբառը',
    showPassword: 'Ցուցադրել գաղտնաբառը',
    loginWithGoogle: 'Մուտք Google-ով',
    loginWithFacebook: 'Մուտք Facebook-ով',
    loginWithApple: 'Մուտք Apple-ով',
    loginWithPhone: 'Մուտք հեռախոսով',
    registerWithGoogle: 'Գրանցվել Google-ով',
    registerWithFacebook: 'Գրանցվել Facebook-ով',
    registerWithApple: 'Գրանցվել Apple-ով',
  },
};

function getLoginTexts(langId) {
  const en = { ...DEFAULT_LOGIN };
  if (!langId || typeof langId !== 'string') return en;
  const normalized = normalizeAppLanguage(langId);
  const baseId = String(normalized).split('-')[0];
  const forgotExtra = FORGOT_FLOW_I18N[baseId];
  const termsExtra = TERMS_LOGIN_I18N[baseId];
  const mergedBase = { ...en, ...(forgotExtra || {}), ...(termsExtra || {}) };
  const t = LOGIN_TEXTS[normalized] || LOGIN_TEXTS[baseId];
  if (!t) return mergedBase;
  return { ...mergedBase, ...t };
}

function getTermsContent(langId) {
  return getTermsContentForLanguage(langId);
}

function ThirdPageWithGoogleOAuth({ navigation, route }) {
  const { useAuthRequest, useAutoDiscovery } = AuthSessionModule;
  const makeRedirectUri = AuthSessionModule.makeRedirectUri;
  const [, facebookResponse, facebookPromptAsync] = FacebookAuthSessionProvider.useAuthRequest({
    clientId: FACEBOOK_APP_ID || '0000000000000000',
  });
  const redirectUri = useMemo(() => {
    const envUri = typeof GOOGLE_REDIRECT_URI === 'string' ? GOOGLE_REDIRECT_URI.trim() : '';
    if (envUri) {
      devLogGoogleRedirectOnce('Redirect URI (from EXPO_PUBLIC_GOOGLE_REDIRECT_URI)', envUri);
      return envUri;
    }
    if (typeof makeRedirectUri === 'function') {
      const nativeUri = makeRedirectUri({ scheme: 'com.kraina.app', path: 'oauth' });
      if (nativeUri && typeof nativeUri === 'string') {
        devLogGoogleRedirectOnce('Redirect URI (native app)', nativeUri);
        return nativeUri;
      }
    }
    return 'com.kraina.app://oauth';
  }, [makeRedirectUri]);
  const googleAuthUseProxy = useMemo(
    () => typeof redirectUri === 'string' && redirectUri.startsWith('https://'),
    [redirectUri],
  );
  const googleDiscovery = useAutoDiscovery('https://accounts.google.com');
  const googleDiscoverySafe = googleDiscovery || {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
  };
  const [googleRequest, googleResponse, googlePromptAsync] = useAuthRequest(
    {
      clientId: GOOGLE_WEB_CLIENT_ID || 'dummy-client-id.apps.googleusercontent.com',
      scopes: ['openid', 'profile', 'email'],
      redirectUri,
    },
    googleDiscoverySafe
  );
  useEffect(() => {
    const tryComplete = () => {
      try {
        const WB = require('expo-web-browser');
        if (WB?.maybeCompleteAuthSession) WB.maybeCompleteAuthSession();
      } catch (_) {}
    };
    tryComplete();
    const t = setTimeout(tryComplete, 300);
    const t2 = setTimeout(tryComplete, 800);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        tryComplete();
        setTimeout(tryComplete, 100);
        setTimeout(tryComplete, 400);
      }
    });
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
      sub?.remove?.();
    };
  }, []);
  return (
    <ThirdPageContent
      googleRequest={googleRequest}
      googleResponse={googleResponse}
      googlePromptAsync={googlePromptAsync}
      googleAuthUseProxy={googleAuthUseProxy}
      facebookResponse={facebookResponse}
      facebookPromptAsync={facebookPromptAsync}
      hasFacebookConfig={showFacebookLogin}
      navigation={navigation}
      route={route}
    />
  );
}

function ThirdPageContent({
  googleRequest = null,
  googleResponse = null,
  googlePromptAsync = null,
  googleAuthUseProxy = false,
  facebookResponse = null,
  facebookPromptAsync = null,
  hasFacebookConfig: hasFacebookFromProps = false,
  navigation = null,
  route = null,
}) {
  const r = useResponsive();
  const [language, setLanguage] = useState(() =>
    normalizeAppLanguage(route?.params?.language || 'en'),
  );
  const texts = getLoginTexts(language);
  const [activeTab, setActiveTab] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const [focusedAuthField, setFocusedAuthField] = useState(null);
  const [focusedForgotField, setFocusedForgotField] = useState(null);
  const [loginError, setLoginError] = useState(null);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [adminPinModalOpen, setAdminPinModalOpen] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState('');
  const [adminPinBusy, setAdminPinBusy] = useState(false);
  const [forgotInput, setForgotInput] = useState('');
  const [forgotStep, setForgotStep] = useState('input');
  const [forgotGeneratedCode, setForgotGeneratedCode] = useState('');
  const [forgotCodeInput, setForgotCodeInput] = useState('');
  const [forgotNewPass, setForgotNewPass] = useState('');
  const [forgotNewPassConfirm, setForgotNewPassConfirm] = useState('');

  const [forgotFieldError, setForgotFieldError] = useState(null);

  const [forgotDelivery, setForgotDelivery] = useState(null);

  const [forgotSuggestRegister, setForgotSuggestRegister] = useState(false);

  const [forgotSending, setForgotSending] = useState(false);

  const [, setForgotDisplayCode] = useState('');
  const [forgotCodeVerifying, setForgotCodeVerifying] = useState(false);
  const [rememberLoaded, setRememberLoaded] = useState(false);
  const nameInputRef = useRef(null);
  const emailInputRef = useRef(null);
  const passwordInputRef = useRef(null);
  const confirmPasswordInputRef = useRef(null);
  const forgotCodeInputRef = useRef(null);
  const forgotNewPassInputRef = useRef(null);
  const forgotConfirmPassInputRef = useRef(null);
  const forgotEmailInputRef = useRef(null);
  const adminGatePasswordRef = useRef('');

  const authSubmitCtaPressAnim = useRef(new Animated.Value(0)).current;
  const authSubmitCtaFrontTranslateY = authSubmitCtaPressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-8, 0],
  });
  const [authSlideSubmitting, setAuthSlideSubmitting] = useState(false);

  const registerWithPassword = useAuthStore((s) => s.registerWithPassword);
  const loginWithPasswordBackend = useAuthStore((s) => s.loginWithPassword);
  const authUser = useAuthStore((s) => s.user);
  const [authBlockingOverlay, setAuthBlockingOverlay] = useState({
    visible: false,
    phase: 'loading',
    errorTitle: '',
    errorBody: '',
    suggestRegister: false,
  });
  const lastAuthOverlayOutcomeRef = useRef({
    title: '',
    body: '',
    suggestRegister: false,
  });
  const performAuthFullscreenRef = useRef(async () => {});
  const googlePromptInProgressRef = useRef(false);

  const googleRequestRef = useRef(googleRequest);
  useEffect(() => {
    googleRequestRef.current = googleRequest;
  }, [googleRequest]);
  const facebookPromptInProgressRef = useRef(false);

  const authHydrationGuardRef = useRef({
    tab: false,
    name: false,
    email: false,
    password: false,
    confirmPassword: false,
    terms: false,
  });


  useEffect(() => {
    if (GoogleSigninNative?.GoogleSignin && hasGoogleConfig) {
      GoogleSigninNative.GoogleSignin.configure({
        webClientId: GOOGLE_SIGNIN_WEB_CLIENT_ID,
        ...(GOOGLE_IOS_CLIENT_ID ? { iosClientId: GOOGLE_IOS_CLIENT_ID } : {}),
      });
    }
  }, []);

  useEffect(() => {
    const fromRoute = route?.params?.language;
    if (fromRoute != null && String(fromRoute).trim() !== '') {
      const next = normalizeAppLanguage(fromRoute);
      setLanguage(next);
      safeSetItem(LANGUAGE_STORAGE_KEY, next).catch(() => {});
      return;
    }
    let cancelled = false;
    (async () => {
      const saved = await safeGetItem(LANGUAGE_STORAGE_KEY);
      if (cancelled) return;
      if (saved && typeof saved === 'string') {
        const next = normalizeAppLanguage(saved);
        setLanguage(next);
        if (next !== saved) await safeSetItem(LANGUAGE_STORAGE_KEY, next);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [route?.params?.language]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const savedRemember = await safeGetItem(REMEMBER_ME_KEY);
      const shouldRemember = savedRemember === 'true';
      const savedEmail = (await safeSecureGetItem(REMEMBER_EMAIL_SECURE_KEY)) || (await safeGetItem(REMEMBER_EMAIL_KEY));
      const savedPassword = await safeSecureGetItem(REMEMBER_PASSWORD_SECURE_KEY);
      const rawDraft = await safeGetItem(AUTH_FORM_DRAFT_KEY);
      const draftPassword = await safeSecureGetItem(AUTH_DRAFT_PASSWORD_SECURE_KEY);
      let draft = null;
      try {
        if (rawDraft) draft = JSON.parse(rawDraft);
      } catch (_) {}
      if (cancelled) return;
      const g = authHydrationGuardRef.current;
      setRememberMe(shouldRemember);
      if (!g.email) {
        if (shouldRemember && savedEmail && typeof savedEmail === 'string') setEmail(savedEmail);
        else if (!shouldRemember && draft && typeof draft.email === 'string') setEmail(draft.email);
      }
      if (!g.password) {
        if (shouldRemember && savedPassword && typeof savedPassword === 'string') setPassword(savedPassword);
        else if (!shouldRemember && draftPassword && typeof draftPassword === 'string') setPassword(draftPassword);
      }
      if (draft && typeof draft === 'object') {
        if (!g.tab && (draft.activeTab === 'login' || draft.activeTab === 'register')) setActiveTab(draft.activeTab);
        if (!g.name && typeof draft.name === 'string') setName(draft.name);
        if (!g.confirmPassword && typeof draft.confirmPassword === 'string') setConfirmPassword(draft.confirmPassword);
        if (!g.terms && typeof draft.termsAccepted === 'boolean') setTermsAccepted(draft.termsAccepted);
      }
      setRememberLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const clearAuthFormDraft = async () => {
    await safeSetItem(AUTH_FORM_DRAFT_KEY, '');
    await safeSecureDeleteItem(AUTH_DRAFT_PASSWORD_SECURE_KEY);
  };

  useEffect(() => {
    if (!rememberLoaded) return;
    const t = setTimeout(() => {
      const payload = {
        v: 1,
        activeTab,
        name,
        email,
        confirmPassword,
        termsAccepted,
      };
      safeSetItem(AUTH_FORM_DRAFT_KEY, JSON.stringify(payload));
      if (password) safeSecureSetItem(AUTH_DRAFT_PASSWORD_SECURE_KEY, password);
      else safeSecureDeleteItem(AUTH_DRAFT_PASSWORD_SECURE_KEY);
    }, 400);
    return () => clearTimeout(t);
  }, [rememberLoaded, activeTab, name, email, password, confirmPassword, termsAccepted]);

  useEffect(() => {
    if (!rememberLoaded || rememberMe) return;
    safeSetItem(REMEMBER_ME_KEY, 'false');
    safeSetItem(REMEMBER_EMAIL_KEY, '');
    safeSecureDeleteItem(REMEMBER_EMAIL_SECURE_KEY);
    safeSecureDeleteItem(REMEMBER_PASSWORD_SECURE_KEY);
  }, [rememberLoaded, rememberMe]);

  const persistRememberedLogin = async (savedEmail, savedPassword) => {
    await safeSetItem(REMEMBER_ME_KEY, 'true');
    await safeSetItem(REMEMBER_EMAIL_KEY, savedEmail);
    await safeSecureSetItem(REMEMBER_EMAIL_SECURE_KEY, savedEmail);
    await safeSecureSetItem(REMEMBER_PASSWORD_SECURE_KEY, savedPassword);
  };


  const navigateAfterAuth = useCallback(
    async (user, isNewUser) => {
      /** Адмін: одразу головна (країна за замовчуванням без екранів вибору країни/тарифу). */
      if (isAppAdminUser(user)) {
        let countryId = await getSavedCountryIdForUser(user);
        if (!countryId && HOME_COUNTRY_ORDER[0]) {
          countryId = HOME_COUNTRY_ORDER[0];
          await saveCountryForUser(user, countryId);
        }
        navigation?.replace?.('HomeTabPager', {
          user,
          language,
          tabIndex: 0,
          routeFinderExtras: {},
          ...(countryId ? { countryId } : {}),
        });
        return;
      }
      const countryId = await getSavedCountryIdForUser(user);
      /** Нова реєстрація або акаунт без збереженої країни — екран країни; повторний вхід з країною — одразу далі. */
      if (isNewUser || !countryId) {
        navigation?.navigate?.('SelectCountry', { user, language });
        return;
      }
      const sub = await getSubscriptionState(user);
      const payload = { user, language, countryId };
      if (sub.needsPlanChoice) {
        navigation?.replace?.('ChoosePlan', payload);
      } else {
        navigation?.replace?.('HomeTabPager', { ...payload, tabIndex: 0, routeFinderExtras: {} });
      }
    },
    [navigation, language],
  );

  const closeAdminPinModal = useCallback(() => {
    setAdminPinModalOpen(false);
    setAdminPinInput('');
    adminGatePasswordRef.current = '';
  }, []);

  const showAlertAfterPinModalDismiss = useCallback((title, body, buttons) => {
    closeAdminPinModal();
    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          Alert.alert(title, body, buttons);
        }, Platform.OS === 'ios' ? 420 : 200);
      });
    });
  }, [closeAdminPinModal]);

  const confirmAdminPinLogin = useCallback(async () => {
    const pin = adminPinInput.trim();
    if (!verifyAdminPinGate(pin)) {
      try {
        await recordAdminGateWrongPinAttempt({ email: (email || '').trim() });
      } catch {
        /* */
      }
      showAlertAfterPinModalDismiss(
        thirdPageUi(language, 'adminPinWrongBlockedTitle'),
        thirdPageUi(language, 'adminPinWrongBlockedBody'),
        [{ text: thirdPageUi(language, 'close'), style: 'default' }],
      );
      return;
    }
    setAdminPinBusy(true);
    try {
      const em = (email || '').trim();
      const pw = adminGatePasswordRef.current;
      const user = await completeAdminLoginWithCredentials({ email: em, password: pw });
      adminGatePasswordRef.current = '';
      setAdminPinModalOpen(false);
      setAdminPinInput('');
      if (rememberMe) {
        await persistRememberedLogin(em, pw);
      }
      await saveSession(user);
      await clearAuthFormDraft();
      await navigateAfterAuth(user, false);
    } catch (err) {
      const code = err?.message || '';
      const mapped = authOverlayFromErrorCode(language, code);
      if (mapped) {
        showAlertAfterPinModalDismiss(mapped.title || '', mapped.body, [
          { text: thirdPageUi(language, 'close'), style: 'default' },
        ]);
      } else {
        showAlertAfterPinModalDismiss('', thirdPageUi(language, 'signInFailedBody'), [
          { text: thirdPageUi(language, 'close'), style: 'default' },
        ]);
      }
    } finally {
      setAdminPinBusy(false);
    }
  }, [
    adminPinInput,
    email,
    rememberMe,
    language,
    navigateAfterAuth,
    closeAdminPinModal,
    recordAdminGateWrongPinAttempt,
    showAlertAfterPinModalDismiss,
  ]);

  useEffect(() => {
    if (googleResponse?.type !== 'success') return;
    const idToken =
      googleResponse.authentication?.idToken ||
      googleResponse.params?.id_token ||
      googleResponse.params?.idToken;
    if (idToken) {
      (async () => {
        try {
          const { user, isNewUser } = await signInWithGoogleIdToken(idToken);
          await saveSession(user);
          await syncBackendSessionAfterGoogleIdToken(idToken, user);
          const s = await getSession();
          const uNav = s?.user || user;
          await clearAuthFormDraft();
          await navigateAfterAuth(uNav, isNewUser);
        } catch (err) {
          if (__DEV__) console.warn('[Google OAuth idToken]', err?.message);
          const token = googleResponse.authentication?.accessToken;
          if (token) {
            fetch('https://www.googleapis.com/userinfo/v2/me', {
              headers: { Authorization: `Bearer ${token}` },
            })
              .then((r) => r.json())
              .then((info) => applySocialLoginSuccess('google', info))
              .catch(() => {});
          }
        }
      })();
      return;
    }
    const token = googleResponse.authentication?.accessToken;
    if (token) {
      fetch('https://www.googleapis.com/userinfo/v2/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((info) => applySocialLoginSuccess('google', info))
        .catch(() => {});
    }
  }, [googleResponse, navigateAfterAuth]);

  useEffect(() => {
    if (facebookResponse?.type !== 'success') return;
    const accessToken =
      facebookResponse.params?.access_token ||
      facebookResponse.authentication?.accessToken;
    if (!accessToken) return;
    (async () => {
      try {
        const { user, isNewUser } = await signInWithFacebookAccessToken(accessToken);
        await saveSession(user);
        await clearAuthFormDraft();
        await navigateAfterAuth(user, isNewUser);
      } catch (err) {
        if (__DEV__) console.warn('[Facebook OAuth]', err?.message);
        const code = err?.message || '';
        let msg;
        if (code === 'FIREBASE_AUTH_REQUIRED') {
          msg = thirdPageUi(language, 'fbFirebase');
        } else if (code === 'FACEBOOK_GRAPH_TIMEOUT' || code.startsWith('FACEBOOK_GRAPH_ERROR')) {
          msg = thirdPageUi(language, 'fbTimeout');
        } else if (code === 'INVALID_FACEBOOK_USER' || code === 'MISSING_FACEBOOK_ID') {
          msg = thirdPageUi(language, 'fbProfile');
        } else {
          msg = thirdPageUi(language, 'fbGeneric');
        }
        Alert.alert('', msg);
      }
    })();
  }, [facebookResponse, navigateAfterAuth]);

  const contentWidth = Math.min(r.width - r.horizontalPadding * 2, DESIGN_CONTENT_WIDTH);
  const contentHorizontalPadding = Math.max(r.horizontalPadding, (r.width - DESIGN_CONTENT_WIDTH) / 2);
  const tabSegmentWidth = Math.max(0, Math.floor((contentWidth - 8 - 6) / 2));
  const termsContent = getTermsContent(language);

  const switchAuthTab = (tab) => {
    if (tab !== 'login' && tab !== 'register') return;
    if (tab === activeTab) return;
    authHydrationGuardRef.current.tab = true;
    Keyboard.dismiss();
    setLoginError(null);
    setFocusedAuthField(null);
    setActiveTab(tab);
  };

  const onAuthSubmitCtaPressIn = useCallback(() => {
    Animated.timing(authSubmitCtaPressAnim, {
      toValue: 1,
      duration: 90,
      useNativeDriver: true,
    }).start();
  }, [authSubmitCtaPressAnim]);

  const onAuthSubmitCtaPressOut = useCallback(() => {
    Animated.timing(authSubmitCtaPressAnim, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start();
  }, [authSubmitCtaPressAnim]);

  useEffect(() => {
    setLoginError(null);
  }, [activeTab]);

  useEffect(() => {
    setFocusedAuthField(null);
  }, [activeTab]);


  useEffect(() => {
    if (activeTab !== 'register') return;
    const mismatchMsg = texts.errorPasswordMismatch ?? "Passwords don't match";
    const shortMsg = texts.errorPasswordTooShort ?? 'Password must contain at least 6 characters';
    const p = (password || '').trim();
    const c = (confirmPassword || '').trim();
    setLoginError((prev) => {
      if (prev === mismatchMsg && (p.length === 0 || c.length === 0 || p === c)) return null;
      if (prev === shortMsg && p.length >= 6) return null;
      return prev;
    });
  }, [activeTab, password, confirmPassword, texts.errorPasswordMismatch, texts.errorPasswordTooShort]);


  const applySocialLoginSuccess = async (provider, googleUserData) => {
    setLoginError(null);
    if (provider !== 'google' || !googleUserData) return;
    try {
      const { user, isNewUser } = await loginOrRegisterGoogle({
        email: googleUserData.email || '',
        name: googleUserData.name || googleUserData.givenName || '',
        googleId: googleUserData.id || googleUserData.sub || '',
        avatar: googleUserData.photo || googleUserData.picture || null,
      });
      await saveSession(user);
      await clearAuthFormDraft();
      await navigateAfterAuth(user, isNewUser);
    } catch (err) {
      const msg = thirdPageUi(language, 'loginError');
      Alert.alert('', msg);
    }
  };

  const getLoginFormError = () => {
    const trimmedEmail = (email || '').trim();
    const trimmedPassword = (password || '').trim();
    if (!trimmedEmail && !trimmedPassword) {
      return texts.errorEmptyFields ?? 'Enter your email and password';
    }
    const simpleEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail) {
      return texts.errorEmptyEmail ?? 'Enter your email address';
    }
    if (!simpleEmailRegex.test(trimmedEmail)) {
      return texts.errorInvalidEmail ?? 'Please enter a valid email address';
    }
    if (!trimmedPassword) {
      return texts.errorEmptyPassword ?? 'Enter your password';
    }
    return null;
  };

  const handleLogin = async () => {
    const validationError = getLoginFormError();
    if (validationError) {
      setLoginError(validationError);
      lastAuthOverlayOutcomeRef.current = {
        title: thirdPageUi(language, 'checkDetails'),
        body: validationError,
        suggestRegister: false,
      };
      return false;
    }
    setLoginError(null);
    const trimmedEmail = (email || '').trim();
    const trimmedPassword = (password || '').trim();
    try {
      if (isAdminGateEmail(trimmedEmail)) {
        if (await isAdminGateDeviceBlocked()) {
          const title = thirdPageUi(language, 'adminGateBlockedTitle');
          const body = thirdPageUi(language, 'adminGateBlockedBody');
          setLoginError(body);
          lastAuthOverlayOutcomeRef.current = { title, body, suggestRegister: false };
          return false;
        }
        if (!verifyAdminPasswordGate(trimmedPassword)) {
          const mapped = authOverlayFromErrorCode(language, 'WRONG_PASSWORD');
          if (mapped) {
            setLoginError(mapped.body);
            lastAuthOverlayOutcomeRef.current = mapped;
          } else {
            const body = thirdPageUi(language, 'signInFailedBody');
            setLoginError(body);
            lastAuthOverlayOutcomeRef.current = {
              title: thirdPageUi(language, 'signInFailedTitle'),
              body,
              suggestRegister: false,
            };
          }
          return false;
        }
        adminGatePasswordRef.current = trimmedPassword;
        setAuthBlockingOverlay((s) => ({ ...s, visible: false, phase: 'loading' }));
        setAdminPinInput('');
        setAdminPinModalOpen(true);
        /** Не `false` — інакше performAuthFullscreen показує помилковий оверлей поверх PIN (iOS: вкладені модалки). */
        return 'admin_pin';
      }

      await loginWithPasswordBackend(trimmedEmail, trimmedPassword);
      if (rememberMe) {
        await persistRememberedLogin(trimmedEmail, trimmedPassword);
      }
      await clearAuthFormDraft();
      const uBackend = useAuthStore.getState().user || authUser || { email: trimmedEmail };
      await navigateAfterAuth(uBackend, false);
      return true;
    } catch (err) {
      const code = err?.message || '';
      const mapped = authOverlayFromErrorCode(language, code);
      if (mapped) {
        setLoginError(mapped.body);
        lastAuthOverlayOutcomeRef.current = mapped;
        return false;
      }
      const title = thirdPageUi(language, 'signInFailedTitle');
      const body = thirdPageUi(language, 'signInFailedBody');
      setLoginError(body);
      lastAuthOverlayOutcomeRef.current = { title, body, suggestRegister: true };
      return false;
    }
  };

  const handleSocialLogin = async () => {
    // Соц‑логіни тимчасово вимкнені — залишаємо тільки email + пароль.
    Alert.alert(
      thirdPageUi(language, 'signInFailedTitle'),
      thirdPageUi(language, 'signInFailedBody'),
    );
  };

  const getRegisterFormError = () => {
    const trimmedName = (name || '').trim();
    const trimmedEmail = (email || '').trim();
    const trimmedPassword = (password || '').trim();
    const trimmedConfirmPassword = (confirmPassword || '').trim();
    const simpleEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedName && !trimmedEmail && !trimmedPassword && !trimmedConfirmPassword) {
      return texts.errorEmptyFields ?? 'Enter your email and password';
    }
    if (!trimmedName) {
      return texts.errorEmptyName ?? 'Enter your name';
    }
    if (!trimmedEmail) {
      return texts.errorEmptyEmail ?? 'Enter your email address';
    }
    if (!simpleEmailRegex.test(trimmedEmail)) {
      return texts.errorInvalidEmail ?? 'Please enter a valid email address';
    }
    if (!trimmedPassword) {
      return texts.errorEmptyPassword ?? 'Enter your password';
    }
    if (trimmedPassword.length < 6) {
      return texts.errorPasswordTooShort ?? 'Password must contain at least 6 characters';
    }
    if (!trimmedConfirmPassword) {
      return texts.errorConfirmPassword ?? 'Confirm your password';
    }
    if (trimmedPassword !== trimmedConfirmPassword) {
      return texts.errorPasswordMismatch ?? "Passwords don't match";
    }
    if (!termsAccepted) {
      return texts.errorTermsRequired ?? 'Confirm that you agree to the Terms of Use';
    }
    return null;
  };

  const handleRegister = async () => {
    const validationError = getRegisterFormError();
    if (validationError) {
      setLoginError(validationError);
      lastAuthOverlayOutcomeRef.current = {
        title: thirdPageUi(language, 'checkDetails'),
        body: validationError,
        suggestRegister: false,
      };
      return false;
    }
    setLoginError(null);
    const trimmedEmail = (email || '').trim();
    const trimmedPassword = (password || '').trim();
    const trimmedName = (name || '').trim();
    try {
      let registered = false;
      for (let attempt = 0; attempt < 4 && !registered; attempt++) {
        const username = deriveBackendUsername(trimmedName, trimmedEmail);
        try {
          await registerWithPassword(trimmedEmail, trimmedPassword, username);
          registered = true;
        } catch (regErr) {
          if (regErr instanceof ApiError && regErr.payload?.error === 'username_taken' && attempt < 3) {
            continue;
          }
          throw regErr;
        }
      }
      await clearAuthFormDraft();
      const uBackend = useAuthStore.getState().user || authUser || { email: trimmedEmail };
      await navigateAfterAuth(uBackend, true);
      return true;
    } catch (err) {
      const code = err?.message || '';
      const mapped = authOverlayFromErrorCode(language, code);
      if (mapped) {
        setLoginError(code === 'EMAIL_EXISTS' ? texts.errorEmailExists ?? mapped.body : mapped.body);
        lastAuthOverlayOutcomeRef.current = mapped;
        return false;
      }
      const title = thirdPageUi(language, 'registerFailedTitle');
      const body = thirdPageUi(language, 'registerFailedBody');
      setLoginError(texts.errorEmptyFields ?? body);
      lastAuthOverlayOutcomeRef.current = { title, body, suggestRegister: false };
      return false;
    }
  };

  const performAuthFullscreen = async (opts = {}) => {
    const skipSync = !!opts.skipSyncCheck;
    const isLogin = activeTab === 'login';
    if (!skipSync) {
      const syncErr = isLogin ? getLoginFormError() : getRegisterFormError();
      if (syncErr) {
        setLoginError(syncErr);
        return;
      }
    }
    setLoginError(null);
    setAuthSlideSubmitting(true);
    let ok = false;
    let loginOutcome = false;
    try {
      const run = isLogin ? handleLogin : handleRegister;
      loginOutcome = await run();
      ok = loginOutcome === true;
    } catch (e) {
      lastAuthOverlayOutcomeRef.current = {
        title: thirdPageUi(language, 'connectionProblemTitle'),
        body: String(
          e?.message || thirdPageUi(language, 'connectionProblemBody'),
        ),
        suggestRegister: false,
      };
    }
    if (isLogin && loginOutcome === 'admin_pin') {
      setAuthBlockingOverlay((s) => ({
        ...s,
        visible: false,
        phase: 'loading',
      }));
      setAuthSlideSubmitting(false);
      return;
    }
    if (ok) {
      setAuthBlockingOverlay((s) => ({
        ...s,
        visible: false,
        phase: 'loading',
      }));
      setAuthSlideSubmitting(false);
      return;
    }
    const o = lastAuthOverlayOutcomeRef.current;
    setAuthBlockingOverlay({
      visible: true,
      phase: 'error',
      errorTitle: o.title || thirdPageUi(language, 'somethingWrong'),
      errorBody: o.body || thirdPageUi(language, 'tryAgain'),
      suggestRegister: !!(o.suggestRegister && isLogin),
    });
    setAuthSlideSubmitting(false);
  };

  performAuthFullscreenRef.current = performAuthFullscreen;

  const openForgotModal = () => {
    setShowForgotModal(true);
    setForgotStep('input');
    setForgotInput('');
    setForgotGeneratedCode('');
    setForgotCodeInput('');
    setForgotNewPass('');
    setForgotNewPassConfirm('');
    setForgotFieldError(null);
    setForgotDelivery(null);
    setForgotSuggestRegister(false);
    setForgotSending(false);
    setForgotDisplayCode('');
    setForgotCodeVerifying(false);
  };

  const closeForgotModal = () => {
    setFocusedForgotField(null);
    setShowForgotModal(false);
    setForgotFieldError(null);
    setForgotSuggestRegister(false);
    setForgotSending(false);
    setForgotDisplayCode('');
    setForgotCodeVerifying(false);
  };

  const handleForgotBack = () => {
    if (forgotStep === 'newpassword') {
      setForgotStep('code');
      setForgotFieldError(null);
      return;
    }
    if (forgotStep === 'code') {
      setForgotStep('input');
      setForgotFieldError(null);
      setForgotSuggestRegister(false);
      setForgotDelivery(null);
      setForgotSending(false);
      setForgotDisplayCode('');
      setForgotCodeInput('');
      setForgotCodeVerifying(false);
      return;
    }
    if (forgotStep === 'input') {
      closeForgotModal();
      return;
    }
    if (forgotStep === 'no_profile') {
      setForgotStep('input');
      setForgotFieldError(null);
      return;
    }
    closeForgotModal();
  };

  const sendForgotCode = async () => {
    if (forgotSending) return;
    setForgotFieldError(null);
    setForgotSuggestRegister(false);
    const raw = (forgotInput || '').trim();
    if (!raw) {
      setForgotFieldError(texts.errorEmptyEmail ?? 'Enter your email address');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(raw)) {
      setForgotFieldError(texts.errorInvalidEmail ?? 'Please enter a valid email address');
      return;
    }
    const value = raw.toLowerCase();
    setForgotInput(value);
    setForgotSending(true);
    try {
      const langBase = String(language || 'en').split('-')[0];
      const result = await requestPasswordResetCode(value, { language: langBase });
      if (!result?.ok && result?.reason === 'NOT_FOUND') {
        setForgotFieldError(texts.forgotEmailNotRegistered ?? texts.forgotNoProfile);
        setForgotSuggestRegister(true);
        return;
      }
      if (!result?.ok && result?.reason === 'EMPTY') {
        setForgotFieldError(texts.errorEmptyEmail ?? 'Enter your email address');
        return;
      }
      if (!result?.ok && result?.reason === 'STORAGE_ERROR') {
        setForgotFieldError(texts.forgotSendFailed ?? 'Could not save the code. Try again.');
        return;
      }
      if (!result?.ok && result?.reason === 'INVALID_RESEND_KEY') {
        setForgotFieldError(texts.forgotInvalidResendKey ?? DEFAULT_LOGIN.forgotInvalidResendKey);
        return;
      }
      if (!result?.ok && result?.reason === 'RESEND_SANDBOX') {
        setForgotFieldError(texts.forgotResendSandbox ?? DEFAULT_LOGIN.forgotResendSandbox);
        return;
      }
      if (!result?.ok && result?.reason === 'RESEND_DOMAIN') {
        setForgotFieldError(texts.forgotResendDomain ?? DEFAULT_LOGIN.forgotResendDomain);
        return;
      }
      if (!result?.ok && result?.reason === 'EMAIL_NETWORK') {
        let msg = texts.forgotResendNetworkFailed ?? DEFAULT_LOGIN.forgotResendNetworkFailed;
        if (__DEV__ && result.resendHint) {
          msg += `\n\n${result.resendHint}`;
        }
        setForgotFieldError(msg);
        return;
      }
      if (!result?.ok && result?.reason === 'EMAIL_SEND_FAILED') {
        let msg = texts.forgotEmailSendFailed;
        if (__DEV__ && result.resendHint) {
          msg += `\n\n${result.resendHint}`;
        }
        setForgotFieldError(msg);
        return;
      }
      if (!result?.ok) {
        setForgotFieldError(texts.forgotSendFailed ?? 'Could not send the reset email.');
        return;
      }
      setForgotFieldError(null);
      setForgotSuggestRegister(false);
      setForgotDelivery(result.delivery || 'in_app_code');
      setForgotDisplayCode(result.code || '');
      setForgotGeneratedCode('');
      setForgotStep('code');
      setForgotCodeInput('');
    } finally {
      setForgotSending(false);
    }
  };

  const confirmForgotCode = async () => {
    if (forgotCodeVerifying) return;
    setForgotFieldError(null);
    const raw = (forgotCodeInput || '').replace(/\s/g, '');
    if (!raw || raw.length < 6) {
      setForgotFieldError(texts.forgotEnterCode ?? texts.forgotEnterCodeBelow);
      return;
    }
    setForgotCodeVerifying(true);
    try {
      const v = await verifyPasswordResetCode(forgotInput.trim(), raw);
      if (!v?.ok) {
        if (v?.reason === 'EXPIRED') {
          setForgotFieldError(texts.forgotCodeExpired);
        } else if (v?.reason === 'NO_CODE' || v?.reason === 'INVALID') {
          setForgotFieldError(texts.forgotCodeExpired);
        } else if (v?.reason === 'WRONG_CODE') {
          setForgotFieldError(texts.forgotWrongCode ?? 'Wrong code');
        } else {
          setForgotFieldError(texts.forgotWrongCode ?? 'Wrong code');
        }
        return;
      }
      setForgotFieldError(null);
      setForgotStep('newpassword');
    } finally {
      setForgotCodeVerifying(false);
    }
  };

  const submitNewPassword = async () => {
    const pass = forgotNewPass.trim();
    const pass2 = forgotNewPassConfirm.trim();
    if (!pass || !pass2) {
      Alert.alert('', texts.errorEmptyPassword ?? 'Enter your password');
      return;
    }
    if (pass.length < 6) {
      Alert.alert('', texts.errorPasswordTooShort ?? 'Password too short');
      return;
    }
    if (pass !== pass2) {
      Alert.alert('', texts.errorPasswordMismatch ?? "Passwords don't match");
      return;
    }
    const emailTrim = forgotInput.trim();
    const ok = await updateUserPassword({ email: emailTrim, newPassword: pass });
    if (!ok) {
      Alert.alert('', texts.forgotUserNotFound ?? 'User not found');
      return;
    }
    await clearPasswordResetOtp(emailTrim.toLowerCase());
    try {
      const user = await loginUser({ email: emailTrim, password: pass });
      await saveSession(user);
      await syncBackendSessionAfterThirdPageEmailAuth({
        email: emailTrim,
        password: pass,
        displayName: user?.name,
        mode: 'login',
        localUser: user,
      });
      const sFp = await getSession();
      const uFp = sFp?.user || user;
      closeForgotModal();
      setActiveTab('login');
      await navigateAfterAuth(uFp, false);
    } catch {
      Alert.alert('', thirdPageUi(language, 'passwordUpdated'));
      closeForgotModal();
      setActiveTab('login');
    }
  };


  const { height: bgH } = Dimensions.get('window');
  const formLayoutHeight = bgH;
  const backgroundImageSource =
    activeTab === 'register'
      ? require('./assets/226-2.png')
      : require('./assets/228.png');
  const registerLayoutNudgeUpPx = Math.round(
    Math.min(30, Math.max(16, formLayoutHeight * 0.024)),
  );

  const formOffsetTop = 0;

  const formTitleTabsShiftDown = 24;

  const formRaise = 32;

  const authContentPushDown = Math.min(32, Math.max(18, Math.round(formLayoutHeight * 0.036)));

  const registerFormLiftPx =
    activeTab === 'register'
      ? Math.min(112, Math.max(54, Math.round(formLayoutHeight * 0.078))) +
        24 +
        36 +
        -34 +
        registerLayoutNudgeUpPx
      : 0;

  const loginFormExtraRaise = activeTab === 'login' ? 32 : 0;

  /** Android: легкий зсув форми (логін + реєстрація). */
  const androidFormPushDownPx =
    Platform.OS === 'android'
      ? Math.round(Math.min(44, Math.max(26, formLayoutHeight * 0.034)))
      : 0;

  /** Додатковий відступ зверху в скролі (логін і реєстрація — трохи вище, ніж було). */
  const authScreenContentNudgeDownPx = Math.round(
    Math.max(4, formLayoutHeight * 0.007),
  );

  /** Форму (заголовок, поля, кнопки) трохи нижче; фон лишається на місці. */
  const AUTH_FORM_SHIFT_DOWN_PX = Math.round(
    Math.min(38, Math.max(26, formLayoutHeight * 0.033)),
  );

  /** Android + лише вхід (усі мови): форму трохи нижче, як було для румунської. */
  const authLoginAndroidExtraPushDownPx =
    Platform.OS === 'android' && activeTab === 'login'
      ? Math.round(Math.min(22, Math.max(14, formLayoutHeight * 0.016)))
      : 0;

  const formScrollPaddingTopBase =
    204 +
    formTitleTabsShiftDown -
    formRaise -
    loginFormExtraRaise +
    authContentPushDown -
    registerFormLiftPx +
    androidFormPushDownPx +
    authScreenContentNudgeDownPx +
    authLoginAndroidExtraPushDownPx +
    AUTH_FORM_SHIFT_DOWN_PX;

  const formScrollPaddingTop = Math.max(140, formScrollPaddingTopBase - 32);
  const termsModalHeight = Math.min(r.height * 0.78, 680);
  const forgotStepItems = [
    { id: 'input', label: thirdPageUi(language, 'forgotLabelEmail') },
    { id: 'code', label: thirdPageUi(language, 'forgotLabelCode') },
    {
      id: 'newpassword',
      label: thirdPageUi(language, 'forgotLabelPassword'),
    },
  ];
  const forgotSubtitle =
    forgotStep === 'input'
      ? thirdPageUi(language, 'forgotSubtitleEmail')
      : forgotStep === 'code'
        ? forgotDelivery === 'email'
          ? texts.forgotCheckEmailForCode
          : texts.forgotNoEmailConfigured
        : forgotStep === 'newpassword'
          ? thirdPageUi(language, 'forgotSubtitleNewPassword')
          : thirdPageUi(language, 'forgotSubtitleNoProfile');

  const dismissAuthBlockingOverlay = () => {
    setAuthBlockingOverlay((s) => ({ ...s, visible: false }));
  };

  const goRegisterFromAuthOverlay = () => {
    setAuthBlockingOverlay((s) => ({ ...s, visible: false }));
    authHydrationGuardRef.current.tab = true;
    setLoginError(null);
    Keyboard.dismiss();
    setActiveTab('register');
  };

  const mismatchMsg = texts.errorPasswordMismatch ?? "Passwords don't match";
  const shortPasswordMsg = texts.errorPasswordTooShort ?? 'Password must contain at least 6 characters';
  const trimmedRegisterPassword = (password || '').trim();
  const trimmedRegisterConfirm = (confirmPassword || '').trim();
  const registerPasswordMismatchLive =
    activeTab === 'register' &&
    trimmedRegisterPassword.length > 0 &&
    trimmedRegisterConfirm.length > 0 &&
    trimmedRegisterPassword !== trimmedRegisterConfirm;

  const registerPasswordInlineText =
    activeTab === 'register' &&
    (registerPasswordMismatchLive || loginError === mismatchMsg || loginError === shortPasswordMsg)
      ? registerPasswordMismatchLive || loginError === mismatchMsg
        ? mismatchMsg
        : shortPasswordMsg
      : null;
  const displayAuthFormError =
    loginError &&
    !(activeTab === 'register' && (loginError === mismatchMsg || loginError === shortPasswordMsg))
      ? loginError
      : null;

  return (
    <View style={styles.screen}>
      <Image
        source={backgroundImageSource}
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { zIndex: 0 }]}
        resizeMode="stretch"
      />
      <View
        style={[
          styles.contentOverlay,
          {
            paddingTop: (r.insets?.top ?? 0),
            paddingBottom: r.bottomPadding,
          },
        ]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardWrap}
          keyboardVerticalOffset={0}
        >
          <View style={styles.authFormOuter}>
            <View
              style={[
                styles.scrollContent,
                {
                  paddingHorizontal: contentHorizontalPadding,
                  paddingTop: formScrollPaddingTop,
                },
              ]}
            >
            <View style={[styles.content, { width: contentWidth, maxWidth: DESIGN_CONTENT_WIDTH, marginTop: formOffsetTop }]}>
              <Text style={[styles.title, styles.loginFormTitleCompact]}>
                {activeTab === 'register' ? texts.registerTitle : texts.title}
              </Text>

              <View style={[styles.tabs, styles.loginFormTabsCompact]} accessibilityRole="tablist">
                <View style={[styles.tabCol, { width: tabSegmentWidth, flexGrow: 0, flexShrink: 0 }]}>
                  <Pressable
                    onPress={() => switchAuthTab('login')}
                    style={({ pressed }) => [styles.tabTouchableFill, pressed && styles.tabTouchablePressed]}
                    android_ripple={rippleOnDarkSurface}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 2 }}
                    accessibilityRole="tab"
                    accessibilityLabel={texts.loginTab}
                    accessibilityState={{ selected: activeTab === 'login' }}
                  >
                    <View
                      style={[
                        styles.tabPill,
                        activeTab === 'login' && styles.tabPillActive,
                        styles.loginFormTabPillCompact,
                      ]}
                    >
                      <Text
                        style={[styles.tabText, activeTab === 'login' && styles.tabTextActive]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {texts.loginTab}
                      </Text>
                    </View>
                  </Pressable>
                </View>
                <View style={styles.tabMidGap} pointerEvents="none" />
                <View style={[styles.tabCol, { width: tabSegmentWidth, flexGrow: 0, flexShrink: 0 }]}>
                  <Pressable
                    onPress={() => switchAuthTab('register')}
                    style={({ pressed }) => [styles.tabTouchableFill, pressed && styles.tabTouchablePressed]}
                    android_ripple={rippleOnDarkSurface}
                    hitSlop={{ top: 8, bottom: 8, left: 2, right: 4 }}
                    accessibilityRole="tab"
                    accessibilityLabel={texts.registerTab}
                    accessibilityState={{ selected: activeTab === 'register' }}
                  >
                    <View
                      style={[
                        styles.tabPill,
                        activeTab === 'register' && styles.tabPillActive,
                        styles.loginFormTabPillCompact,
                      ]}
                    >
                      <Text
                        style={[styles.tabText, activeTab === 'register' && styles.tabTextActive]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {texts.registerTab}
                      </Text>
                    </View>
                  </Pressable>
                </View>
              </View>

              <View
                style={[
                  styles.inputWrap,
                  styles.loginFormInputWrapCompact,
                  { marginBottom: registerPasswordInlineText ? 0 : AUTH_FORM_GAP },
                ]}
              >
                {}
                <View
                  collapsable={false}
                  style={[
                    styles.authFieldRow,
                    activeTab !== 'register' && styles.authFieldRowHidden,
                    activeTab === 'register' &&
                      focusedAuthField === 'name' &&
                      styles.authFieldRowFocused,
                  ]}
                >
                  <TextInput
                    ref={nameInputRef}
                    editable={activeTab === 'register'}
                    style={[styles.authTextInput, { fontSize: r.optionFontSize }]}
                    value={name}
                    onChangeText={(text) => {
                      authHydrationGuardRef.current.name = true;
                      setLoginError(null);
                      setName(text);
                    }}
                    placeholder={texts.namePlaceholder}
                    placeholderTextColor={AUTH_PLACEHOLDER}
                    selectionColor={ACCENT}
                    autoCapitalize="words"
                    autoCorrect={false}
                    spellCheck={false}
                    autoComplete={activeTab === 'register' ? 'name' : 'off'}
                    textContentType="name"
                    importantForAutofill={activeTab === 'register' ? 'yes' : 'no'}
                    keyboardAppearance="dark"
                    returnKeyType="next"
                    blurOnSubmit={false}
                    enablesReturnKeyAutomatically
                    clearButtonMode="while-editing"
                    onSubmitEditing={() => emailInputRef.current?.focus()}
                    onFocus={() => activeTab === 'register' && setFocusedAuthField('name')}
                    onBlur={() => setFocusedAuthField((k) => (k === 'name' ? null : k))}
                  />
                </View>

                <View
                  collapsable={false}
                  style={[
                    styles.authFieldRow,
                    focusedAuthField === 'email' && styles.authFieldRowFocused,
                  ]}
                >
                  <TextInput
                    ref={emailInputRef}
                    style={[styles.authTextInput, { fontSize: r.optionFontSize }]}
                    value={email}
                    onChangeText={(text) => {
                      authHydrationGuardRef.current.email = true;
                      setLoginError(null);
                      setEmail(text);
                    }}
                    placeholder={texts.emailPlaceholder}
                    placeholderTextColor={AUTH_PLACEHOLDER}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    autoComplete={Platform.OS === 'android' ? 'username' : 'email'}
                    textContentType="emailAddress"
                    importantForAutofill={Platform.OS === 'android' ? 'no' : 'yes'}
                    keyboardAppearance="dark"
                    selectionColor={ACCENT}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    enablesReturnKeyAutomatically
                    clearButtonMode="while-editing"
                    onSubmitEditing={() => passwordInputRef.current?.focus()}
                    onFocus={() => setFocusedAuthField('email')}
                    onBlur={() => setFocusedAuthField((k) => (k === 'email' ? null : k))}
                  />
                </View>

                <View
                  collapsable={false}
                  style={[
                    styles.authFieldRow,
                    focusedAuthField === 'password' && styles.authFieldRowFocused,
                  ]}
                >
                  <TextInput
                    ref={passwordInputRef}
                    style={[styles.authTextInput, { fontSize: r.optionFontSize }]}
                    value={password}
                    onChangeText={(text) => {
                      authHydrationGuardRef.current.password = true;
                      setLoginError(null);
                      setPassword(text);
                    }}
                    placeholder={texts.passwordPlaceholder}
                    placeholderTextColor={AUTH_PLACEHOLDER}
                    secureTextEntry={!passwordVisible}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    autoComplete={activeTab === 'login' ? 'password' : 'new-password'}
                    textContentType={activeTab === 'login' ? 'password' : 'newPassword'}
                    importantForAutofill="yes"
                    keyboardAppearance="dark"
                    selectionColor={ACCENT}
                    returnKeyType={activeTab === 'login' ? 'go' : 'next'}
                    enablesReturnKeyAutomatically
                    onSubmitEditing={
                      activeTab === 'login'
                        ? () => void performAuthFullscreenRef.current({ skipSyncCheck: false })
                        : () => confirmPasswordInputRef.current?.focus()
                    }
                    onFocus={() => setFocusedAuthField('password')}
                    onBlur={() => setFocusedAuthField((k) => (k === 'password' ? null : k))}
                  />
                  <Pressable
                    onPress={() => setPasswordVisible((v) => !v)}
                    style={styles.eyeButton}
                    android_ripple={rippleOnDarkSurface}
                    accessibilityLabel={passwordVisible ? texts.hidePassword : texts.showPassword}
                  >
                    <Image
                      source={passwordVisible ? require('./assets/Vector-3.png') : require('./assets/Vector.png')}
                      style={[styles.eyeButtonIcon, { tintColor: passwordVisible ? ACCENT : '#B0B0B0' }]}
                      resizeMode="contain"
                    />
                  </Pressable>
                </View>

                <View
                  collapsable={false}
                  style={[
                    styles.authFieldRow,
                    activeTab !== 'register' && styles.authFieldRowHidden,
                    activeTab === 'register' &&
                      focusedAuthField === 'confirm' &&
                      styles.authFieldRowFocused,
                  ]}
                >
                  <TextInput
                    ref={confirmPasswordInputRef}
                    editable={activeTab === 'register'}
                    style={[styles.authTextInput, { fontSize: r.optionFontSize }]}
                    value={confirmPassword}
                    onChangeText={(text) => {
                      authHydrationGuardRef.current.confirmPassword = true;
                      setLoginError(null);
                      setConfirmPassword(text);
                    }}
                    placeholder={texts.confirmPasswordPlaceholder}
                    placeholderTextColor={AUTH_PLACEHOLDER}
                    secureTextEntry={!passwordVisible}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    autoComplete={activeTab === 'register' ? 'new-password' : 'off'}
                    textContentType="newPassword"
                    importantForAutofill={activeTab === 'register' ? 'yes' : 'no'}
                    keyboardAppearance="dark"
                    selectionColor={ACCENT}
                    returnKeyType="done"
                    enablesReturnKeyAutomatically
                    onSubmitEditing={() => void performAuthFullscreenRef.current({ skipSyncCheck: false })}
                    onFocus={() => activeTab === 'register' && setFocusedAuthField('confirm')}
                    onBlur={() => setFocusedAuthField((k) => (k === 'confirm' ? null : k))}
                  />
                </View>
              </View>

              {registerPasswordInlineText ? (
                <Text
                  style={[styles.authInlineFieldError, { fontSize: r.hintFontSize }]}
                  accessibilityLiveRegion="polite"
                >
                  {registerPasswordInlineText}
                </Text>
              ) : null}

              {activeTab === 'login' ? (
                <View style={styles.row}>
                  <Pressable
                    onPress={() => setRememberMe((v) => !v)}
                    style={({ pressed }) => [styles.checkboxWrap, pressed && styles.checkboxWrapPressed]}
                    android_ripple={rippleOnDarkSurface}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: rememberMe }}
                    hitSlop={8}
                    pressRetentionOffset={12}
                  >
                    <View style={[styles.checkboxBox, rememberMe && styles.checkboxBoxChecked]}>
                      <View style={[styles.checkboxSquare, rememberMe && styles.checkboxSquareChecked]} />
                      {rememberMe ? <Text style={styles.checkboxCheckIcon}>✓</Text> : null}
                    </View>
                    <Text style={styles.checkboxLabel}>{texts.rememberMe}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.forgotWrap}
                    hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                    android_ripple={noAndroidRipple}
                    accessibilityRole="link"
                    onPress={openForgotModal}
                  >
                    <Text style={styles.forgotText}>{texts.forgotPassword}</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.termsRow}>
                  <Pressable
                    onPress={() => {
                      authHydrationGuardRef.current.terms = true;
                      setTermsAccepted((v) => !v);
                    }}
                    style={({ pressed }) => [styles.checkboxWrap, styles.termsCheckboxWrap, pressed && styles.checkboxWrapPressed]}
                    android_ripple={rippleOnDarkSurface}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: termsAccepted }}
                    hitSlop={8}
                    pressRetentionOffset={12}
                  >
                    <View style={[styles.checkboxBox, termsAccepted && styles.checkboxBoxChecked]}>
                      <View style={[styles.checkboxSquare, termsAccepted && styles.checkboxSquareChecked]} />
                      {termsAccepted ? <Text style={styles.checkboxCheckIcon}>✓</Text> : null}
                    </View>
                    <View style={styles.termsLabelWrap}>
                      <Text style={styles.checkboxLabel}>
                        {thirdPageUi(language, 'agreePrefix')}
                      </Text>
                      <Pressable
                        onPress={() => setShowTermsModal(true)}
                        android_ripple={rippleOnDarkSurface}
                        accessibilityRole="link"
                        hitSlop={4}
                      >
                        <Text style={styles.termsInlineLink}>
                          {thirdPageUi(language, 'termsLink')}
                        </Text>
                      </Pressable>
                    </View>
                  </Pressable>
                </View>
              )}

              <View style={styles.primarySubmitWrap} importantForAccessibility="yes">
                <Pressable
                  disabled={authSlideSubmitting}
                  onPress={() => void performAuthFullscreenRef.current({ skipSyncCheck: false })}
                  onPressIn={onAuthSubmitCtaPressIn}
                  onPressOut={onAuthSubmitCtaPressOut}
                  style={[
                    styles.authOnboardCtaOuter,
                    styles.primarySubmitPressable,
                    {
                      width: contentWidth,
                      opacity: authSlideSubmitting ? 0.55 : 1,
                    },
                  ]}
                  android_ripple={rippleOnDarkSurface}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: authSlideSubmitting }}
                  accessibilityLabel={activeTab === 'login' ? texts.loginButton : texts.registerButton}
                >
                  <View style={styles.authOnboardCtaBack} />
                  <Animated.View
                    style={[
                      styles.authOnboardCtaFront,
                      {
                        transform: [{ translateY: authSubmitCtaFrontTranslateY }],
                      },
                    ]}
                  >
                    <Text style={styles.authOnboardCtaText}>
                      {activeTab === 'login' ? texts.loginButton : texts.registerButton}
                    </Text>
                  </Animated.View>
                </Pressable>
              </View>

              {displayAuthFormError ? (
                <View style={[styles.statusCard, styles.statusCardError]}>
                  <Text style={[styles.statusCardTitle, styles.statusCardTitleError]}>
                    {thirdPageUi(language, 'checkDetails')}
                  </Text>
                  <Text style={[styles.statusCardText, styles.statusCardTextError]}>
                    {displayAuthFormError}
                  </Text>
                </View>
              ) : null}

              <View style={styles.dividerWrap}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>
                  {activeTab === 'register' ? texts.orRegisterWith : texts.orLoginWith}
                </Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Соц‑логіни тимчасово вимкнені — залишаємо лише email + пароль. */}
            </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>

      <Modal visible={showForgotModal} transparent animationType="fade">
        <View style={styles.forgotModalKeyboardRoot}>
          <View style={styles.forgotModalOverlay}>
            <Pressable
              style={styles.forgotModalBackdrop}
              android_ripple={null}
              onPress={closeForgotModal}
              accessibilityRole="button"
              accessibilityLabel={thirdPageUi(language, 'close')}
            />
            <View style={styles.forgotModalBox}>
            <Pressable
              onPress={handleForgotBack}
              hitSlop={12}
              android_ripple={rippleOnDarkSurface}
              style={styles.forgotModalBackBtn}
              accessibilityRole="button"
              accessibilityLabel={thirdPageUi(language, 'back')}
            >
              <Ionicons name="chevron-back" size={24} color={ACCENT} />
            </Pressable>

            <View style={styles.forgotHero}>
              <View style={styles.forgotHeroIconWrap}>
                <Image source={require('./assets/Group-3.png')} style={styles.forgotHeroIcon} resizeMode="contain" />
              </View>
              <Text style={styles.forgotModalTitle}>{texts.forgotTitle}</Text>
              <Text style={styles.forgotModalSubtitle}>{forgotSubtitle}</Text>
            </View>

            <View
              style={[
                styles.forgotStepRow,
                (forgotStep === 'input' || forgotStep === 'newpassword') && styles.forgotStepRowTight,
              ]}
            >
              <Text style={styles.forgotStepRowText}>
                {forgotStepItems.map((step, index) => {
                  const active =
                    step.id === forgotStep ||
                    (forgotStep === 'code' && step.id === 'input') ||
                    (forgotStep === 'newpassword' &&
                      (step.id === 'input' || step.id === 'code' || step.id === 'newpassword')) ||
                    (forgotStep === 'no_profile' && step.id === 'input');
                  return (
                    <Text key={step.id}>
                      {index > 0 ? (
                        <Text style={styles.forgotStepPlainSep}> · </Text>
                      ) : null}
                      <Text style={active ? styles.forgotStepPlainActive : styles.forgotStepPlain}>
                        {index + 1}. {step.label}
                      </Text>
                    </Text>
                  );
                })}
              </Text>
            </View>

            {forgotStep === 'code' || forgotStep === 'no_profile' ? (
              <View style={styles.forgotModalHeader}>
                <Text style={styles.forgotSectionTitle}>
                  {forgotStep === 'code'
                    ? forgotDelivery === 'email'
                      ? texts.forgotEmailCodeTitle
                      : texts.forgotYourCodeTitle
                    : texts.forgotNoProfile}
                </Text>
                <View style={styles.forgotSectionDivider} />
              </View>
            ) : null}

            <ScrollView
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              bounces={false}
              nestedScrollEnabled
              automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
              contentContainerStyle={[
                styles.forgotModalBody,
                (forgotStep === 'input' || forgotStep === 'newpassword') && styles.forgotModalBodyNoSection,
              ]}
            >
              {forgotStep === 'input' && (
                <>
                  <View style={styles.forgotModalFieldsWrap}>
                    <View
                      collapsable={false}
                      style={[
                        styles.authFieldRow,
                        focusedForgotField === 'forgotEmail' && styles.authFieldRowFocused,
                      ]}
                    >
                      <TextInput
                        ref={forgotEmailInputRef}
                        style={[styles.authTextInput, { fontSize: r.optionFontSize }]}
                        value={forgotInput}
                        onChangeText={(t) => {
                          setForgotFieldError(null);
                          setForgotSuggestRegister(false);
                          setForgotInput(t);
                        }}
                        placeholder={texts.emailPlaceholder}
                        placeholderTextColor={AUTH_PLACEHOLDER}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        spellCheck={false}
                        autoComplete={Platform.OS === 'android' ? 'username' : 'email'}
                        textContentType="emailAddress"
                        importantForAutofill={Platform.OS === 'android' ? 'no' : 'yes'}
                        keyboardAppearance="dark"
                        selectionColor={ACCENT}
                        returnKeyType="done"
                        blurOnSubmit={false}
                        enablesReturnKeyAutomatically
                        clearButtonMode="while-editing"
                        onSubmitEditing={sendForgotCode}
                        onFocus={() => setFocusedForgotField('forgotEmail')}
                        onBlur={() => setFocusedForgotField((k) => (k === 'forgotEmail' ? null : k))}
                      />
                    </View>
                  </View>
                  {forgotFieldError ? (
                    <Text
                      style={[styles.forgotModalFieldError, { fontSize: r.hintFontSize }]}
                      accessibilityLiveRegion="polite"
                    >
                      {forgotFieldError}
                    </Text>
                  ) : null}
                  {forgotSuggestRegister ? (
                    <View style={styles.forgotSuggestRegisterBlock}>
                      <Text
                        style={[styles.forgotRegisterHintText, { fontSize: r.hintFontSize }]}
                        accessibilityRole="text"
                      >
                        {thirdPageUi(language, 'registerToCreateProfile')}
                      </Text>
                      <Pressable
                        onPress={() => {
                          closeForgotModal();
                          setActiveTab('register');
                        }}
                        style={({ pressed }) => [
                          styles.forgotSecondaryBtn,
                          pressed && styles.forgotSecondaryBtnPressed,
                        ]}
                        android_ripple={rippleOnDarkSurface}
                        accessibilityRole="button"
                        accessibilityLabel={texts.forgotCreateProfile}
                      >
                        <Text style={styles.forgotSecondaryBtnText}>{texts.forgotCreateProfile}</Text>
                      </Pressable>
                    </View>
                  ) : null}
                  <Pressable
                    style={({ pressed }) => [
                      styles.forgotPrimaryBtn,
                      styles.forgotPrimaryBtnAfterEmail,
                      pressed && !forgotSending && styles.forgotPrimaryBtnPressed,
                      forgotSending && styles.forgotPrimaryBtnDisabled,
                    ]}
                    android_ripple={noAndroidRipple}
                    onPress={sendForgotCode}
                    disabled={forgotSending}
                    accessibilityState={{ disabled: forgotSending, busy: forgotSending }}
                  >
                    {forgotSending ? (
                      <View style={styles.forgotPrimaryBtnRow}>
                        <ActivityIndicator color={TEXT_DARK} size="small" />
                        <Text style={styles.forgotPrimaryBtnText}>{texts.forgotSendingEmail}</Text>
                      </View>
                    ) : (
                      <Text style={styles.forgotPrimaryBtnText}>{texts.forgotSendCode}</Text>
                    )}
                  </Pressable>
                </>
              )}

              {forgotStep === 'code' && (
                <>
                  <Text style={[styles.forgotNoProfileSubtext, { marginBottom: 12 }]}>
                    {forgotDelivery === 'email'
                      ? texts.forgotCheckEmailForCode
                      : texts.forgotYourCodeHint}
                  </Text>
                  {/*
                    Intentionally hidden: we do not display in-app recovery code/token directly in UI.
                    User should always enter the code they received via recovery flow.
                  */}
                  <Text style={[styles.forgotModalLabel, { marginTop: 8, marginBottom: 8 }]}>
                    {texts.forgotEnterCodeBelow}
                  </Text>
                  <View style={styles.forgotModalFieldsWrap}>
                    <View
                      collapsable={false}
                      style={[
                        styles.authFieldRow,
                        focusedForgotField === 'forgotCode' && styles.authFieldRowFocused,
                      ]}
                    >
                      <TextInput
                        ref={forgotCodeInputRef}
                        style={[styles.authTextInput, { fontSize: r.optionFontSize }]}
                        value={forgotCodeInput}
                        onChangeText={(t) => {
                          setForgotFieldError(null);
                          setForgotCodeInput(t.replace(/[^\d]/g, '').slice(0, 6));
                        }}
                        placeholder={texts.forgotEnterCode}
                        placeholderTextColor={AUTH_PLACEHOLDER}
                        keyboardType="number-pad"
                        autoCapitalize="none"
                        autoCorrect={false}
                        maxLength={6}
                        keyboardAppearance="dark"
                        selectionColor={ACCENT}
                        returnKeyType="done"
                        blurOnSubmit={false}
                        enablesReturnKeyAutomatically
                        onSubmitEditing={confirmForgotCode}
                        onFocus={() => setFocusedForgotField('forgotCode')}
                        onBlur={() => setFocusedForgotField((k) => (k === 'forgotCode' ? null : k))}
                      />
                    </View>
                  </View>
                  {forgotFieldError ? (
                    <Text
                      style={[styles.forgotModalFieldError, { fontSize: r.hintFontSize }]}
                      accessibilityLiveRegion="polite"
                    >
                      {forgotFieldError}
                    </Text>
                  ) : null}
                  <Pressable
                    style={({ pressed }) => [
                      styles.forgotPrimaryBtn,
                      styles.forgotPrimaryBtnAfterEmail,
                      pressed && !forgotCodeVerifying && styles.forgotPrimaryBtnPressed,
                      forgotCodeVerifying && styles.forgotPrimaryBtnDisabled,
                    ]}
                    android_ripple={noAndroidRipple}
                    onPress={confirmForgotCode}
                    disabled={forgotCodeVerifying}
                    accessibilityState={{ disabled: forgotCodeVerifying, busy: forgotCodeVerifying }}
                  >
                    {forgotCodeVerifying ? (
                      <View style={styles.forgotPrimaryBtnRow}>
                        <ActivityIndicator color={TEXT_DARK} size="small" />
                        <Text style={styles.forgotPrimaryBtnText}>{texts.forgotSendingEmail}</Text>
                      </View>
                    ) : (
                      <Text style={styles.forgotPrimaryBtnText}>{texts.forgotCodeContinue}</Text>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={sendForgotCode}
                    style={[styles.forgotGhostBtn, forgotSending && styles.forgotGhostBtnDisabled]}
                    android_ripple={rippleOnDarkSurface}
                    disabled={forgotSending}
                  >
                    <Text style={[styles.forgotBackText, forgotSending && styles.forgotBackTextMuted]}>
                      {forgotSending
                        ? texts.forgotSendingEmail
                        : thirdPageUi(language, 'sendCodeAgain')}
                    </Text>
                  </Pressable>
                </>
              )}

              {forgotStep === 'no_profile' && (
                <>
                  <Text style={styles.forgotNoProfileText}>{texts.forgotNoProfile}</Text>
                  <Text style={styles.forgotNoProfileSubtext}>
                    {thirdPageUi(language, 'registerToCreateProfile')}
                  </Text>
                  <Pressable
                    style={({ pressed }) => [styles.forgotPrimaryBtn, pressed && styles.forgotPrimaryBtnPressed]}
                    android_ripple={noAndroidRipple}
                    onPress={() => { closeForgotModal(); setActiveTab('register'); }}
                  >
                    <Text style={styles.forgotPrimaryBtnText}>{texts.forgotCreateProfile}</Text>
                  </Pressable>
                  <Pressable onPress={() => setForgotStep('input')} style={styles.forgotGhostBtn} android_ripple={rippleOnDarkSurface}>
                    <Text style={styles.forgotBackText}>← {thirdPageUi(language, 'back')}</Text>
                  </Pressable>
                </>
              )}

              {forgotStep === 'newpassword' && (
                <>
                  {forgotDelivery === 'in_app' ||
                  forgotDelivery === 'in_app_code' ||
                  forgotDelivery === 'email' ? (
                    <Text style={[styles.forgotInAppBanner, { fontSize: r.hintFontSize }]}>
                      {forgotDelivery === 'in_app'
                        ? texts.forgotInAppResetHint
                        : texts.forgotNewPasswordAfterCode}
                    </Text>
                  ) : null}
                  <View style={styles.forgotModalFieldsWrap}>
                    <View
                      collapsable={false}
                      style={[
                        styles.authFieldRow,
                        focusedForgotField === 'forgotNew' && styles.authFieldRowFocused,
                      ]}
                    >
                      <TextInput
                        ref={forgotNewPassInputRef}
                        style={[styles.authTextInput, { fontSize: r.optionFontSize }]}
                        value={forgotNewPass}
                        onChangeText={setForgotNewPass}
                        placeholder={texts.forgotNewPassword}
                        placeholderTextColor={AUTH_PLACEHOLDER}
                        secureTextEntry
                        autoCapitalize="none"
                        autoCorrect={false}
                        spellCheck={false}
                        autoComplete="new-password"
                        textContentType="newPassword"
                        importantForAutofill="yes"
                        keyboardAppearance="dark"
                        selectionColor={ACCENT}
                        returnKeyType="next"
                        blurOnSubmit={false}
                        enablesReturnKeyAutomatically
                        onSubmitEditing={() => forgotConfirmPassInputRef.current?.focus()}
                        onFocus={() => setFocusedForgotField('forgotNew')}
                        onBlur={() => setFocusedForgotField((k) => (k === 'forgotNew' ? null : k))}
                      />
                    </View>
                    <View
                      collapsable={false}
                      style={[
                        styles.authFieldRow,
                        focusedForgotField === 'forgotConfirm' && styles.authFieldRowFocused,
                      ]}
                    >
                      <TextInput
                        ref={forgotConfirmPassInputRef}
                        style={[styles.authTextInput, { fontSize: r.optionFontSize }]}
                        value={forgotNewPassConfirm}
                        onChangeText={setForgotNewPassConfirm}
                        placeholder={texts.forgotConfirmPassword}
                        placeholderTextColor={AUTH_PLACEHOLDER}
                        secureTextEntry
                        autoCapitalize="none"
                        autoCorrect={false}
                        spellCheck={false}
                        autoComplete="new-password"
                        textContentType="newPassword"
                        importantForAutofill="yes"
                        keyboardAppearance="dark"
                        selectionColor={ACCENT}
                        returnKeyType="done"
                        blurOnSubmit={false}
                        enablesReturnKeyAutomatically
                        onSubmitEditing={submitNewPassword}
                        onFocus={() => setFocusedForgotField('forgotConfirm')}
                        onBlur={() => setFocusedForgotField((k) => (k === 'forgotConfirm' ? null : k))}
                      />
                    </View>
                  </View>
                  <Pressable
                    style={({ pressed }) => [styles.forgotPrimaryBtn, pressed && styles.forgotPrimaryBtnPressed]}
                    android_ripple={noAndroidRipple}
                    onPress={submitNewPassword}
                  >
                    <Text style={styles.forgotPrimaryBtnText}>{texts.forgotChangePassword}</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showTermsModal} transparent animationType="fade">
        <View style={styles.termsModalOverlay}>
          <View style={[styles.termsModalBox, { height: termsModalHeight }]}>
            <Pressable
              onPress={() => setShowTermsModal(false)}
              hitSlop={12}
              android_ripple={rippleOnDarkSurface}
              style={styles.termsModalBackBtn}
              accessibilityRole="button"
              accessibilityLabel={thirdPageUi(language, 'back')}
            >
              <Ionicons name="chevron-back" size={24} color={ACCENT} />
            </Pressable>

            <View style={styles.termsHandle} />
            <View style={styles.termsHeader}>
              <Text style={styles.termsTitle}>{texts.termsTitle}</Text>
              <Text style={styles.termsSubtitle}>KRAÏNA x ITty Company</Text>
            </View>
            <View style={styles.termsDivider} />

            <ScrollView
              style={styles.termsScroll}
              contentContainerStyle={styles.termsScrollContent}
              scrollEnabled
              showsVerticalScrollIndicator
              indicatorStyle="white"
              bounces
              alwaysBounceVertical
              nestedScrollEnabled
              overScrollMode="always"
              persistentScrollbar
              keyboardShouldPersistTaps="handled"
              contentInsetAdjustmentBehavior="automatic"
            >
              <Text style={styles.termsBodyText}>{termsContent}</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={authBlockingOverlay.visible && !adminPinModalOpen}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={dismissAuthBlockingOverlay}
      >
        <AuthLemonBlockingOverlay
          visible={authBlockingOverlay.visible && !adminPinModalOpen}
          phase={authBlockingOverlay.phase}
          errorTitle={authBlockingOverlay.errorTitle}
          errorBody={authBlockingOverlay.errorBody}
          suggestRegister={authBlockingOverlay.suggestRegister}
          language={language}
          onDismiss={dismissAuthBlockingOverlay}
          onGoRegister={goRegisterFromAuthOverlay}
        />
      </Modal>

      <Modal visible={adminPinModalOpen} transparent animationType="fade" onRequestClose={closeAdminPinModal}>
        <View style={styles.forgotModalKeyboardRoot}>
          <View style={styles.forgotModalOverlay}>
            <Pressable
              style={styles.forgotModalBackdrop}
              android_ripple={null}
              onPress={closeAdminPinModal}
              accessibilityRole="button"
              accessibilityLabel={thirdPageUi(language, 'close')}
            />
            <View style={styles.forgotModalBox}>
              <Text style={styles.forgotModalTitle}>{thirdPageUi(language, 'adminPinTitle')}</Text>
              <Text style={styles.forgotModalSubtitle}>{thirdPageUi(language, 'adminPinSubtitle')}</Text>
              <View style={[styles.authFieldRow, { marginTop: 16, width: '100%' }]}>
                <TextInput
                  value={adminPinInput}
                  onChangeText={setAdminPinInput}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  placeholder="PIN"
                  placeholderTextColor={AUTH_PLACEHOLDER}
                  style={[styles.authTextInput, { fontSize: r.optionFontSize }]}
                  editable={!adminPinBusy}
                  onSubmitEditing={confirmAdminPinLogin}
                  keyboardAppearance="dark"
                  selectionColor={ACCENT}
                />
              </View>
              <View style={{ flexDirection: 'row', marginTop: 20, gap: 12 }}>
                <Pressable
                  onPress={closeAdminPinModal}
                  style={[styles.forgotPrimaryBtn, { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)' }]}
                  disabled={adminPinBusy}
                >
                  <Text style={[styles.forgotPrimaryBtnText, { color: TEXT_LIGHT }]}>{thirdPageUi(language, 'close')}</Text>
                </Pressable>
                <Pressable
                  onPress={confirmAdminPinLogin}
                  style={[styles.forgotPrimaryBtn, { flex: 1 }]}
                  disabled={adminPinBusy}
                >
                  {adminPinBusy ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <Text style={[styles.forgotPrimaryBtnText, { color: '#000' }]}>
                      {thirdPageUi(language, 'adminPinConfirm')}
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
    backgroundColor: BG_DARK,
  },
  contentOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-start',
  },
  keyboardWrap: {
    flex: 1,
  },

  authFormOuter: {
    flex: 1,
    width: '100%',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    justifyContent: 'flex-start',
    paddingTop: 204,
    paddingBottom: AUTH_FORM_GAP * 2,
    alignItems: 'center',
  },
  content: {
    alignSelf: 'center',
  },
  title: {
    ...BRAND_TEXT_FONT,
    fontWeight: '400',
    fontSize: DESIGN_TITLE_FONT_SIZE,
    lineHeight: DESIGN_TITLE_HEIGHT,
    height: DESIGN_TITLE_HEIGHT,
    color: ACCENT,
    letterSpacing: 0,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: AUTH_FORM_GAP,
    backgroundColor: 'transparent',
    opacity: 1,
  },
  tabs: {
    flexDirection: 'row',
    width: '100%',
    marginTop: 6,
    marginBottom: AUTH_FORM_GAP,
    minHeight: 44,
    padding: 4,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: BORDER,
    backgroundColor: BG_DARK,
    alignItems: 'stretch',
  },
  tabCol: {
    overflow: 'hidden',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  tabTouchableFill: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  tabTouchablePressed: {
    opacity: 0.88,
  },
  tabMidGap: {
    width: 12,
    flexShrink: 0,
  },

  loginFormTitleCompact: {
    marginTop: AUTH_FORM_GAP,
    marginBottom: AUTH_FORM_GAP,
  },
  loginFormTabsCompact: {
    marginTop: 0,
    marginBottom: AUTH_FORM_GAP,
    minHeight: 44,
    padding: 4,
  },
  loginFormTabPillCompact: {
    minHeight: 36,
    paddingVertical: 8,
  },
  loginFormInputWrapCompact: {
    marginTop: 0,
    paddingTop: 0,
    gap: AUTH_FORM_GAP,
  },
  tabPill: {
    width: '100%',
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 8,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  tabPillActive: {
    backgroundColor: ACCENT,
    ...Platform.select({
      ios: {
        shadowColor: LEMON_BRIGHT,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.85,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  tabText: {
    fontSize: 14,
    letterSpacing: -0.5,
    color: 'rgba(255, 255, 255, 0.58)',
    backgroundColor: 'transparent',
    opacity: 1,
    textAlign: 'center',
    alignSelf: 'stretch',
    flexShrink: 1,
    ...(Platform.OS === 'android'
      ? { fontFamily: 'sans-serif', fontWeight: '400', includeFontPadding: false }
      : { ...BRAND_TEXT_FONT, fontWeight: '400' }),
  },
  tabTextActive: {
    letterSpacing: 0,
    ...(Platform.OS === 'android'
      ? ANDROID_ACCENT_TEXT
      : { ...BRAND_TEXT_FONT, fontWeight: '400', color: TEXT_DARK, includeFontPadding: false }),
  },
  primarySubmitWrap: {
    width: '100%',
    marginBottom: AUTH_FORM_GAP,
    overflow: 'visible',
  },
  primarySubmitPressable: {
    alignSelf: 'center',
  },
  /** Як кнопка «Пропустити» / «Продовжити» на онбордингу (OnboardingIntroPage). */
  authOnboardCtaOuter: {
    minHeight: 48,
    height: 52,
    borderRadius: 999,
    borderWidth: 5,
    borderColor: 'rgba(225, 255, 0, 0.45)',
    position: 'relative',
    overflow: 'visible',
    marginTop: 2,
  },
  authOnboardCtaBack: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#6F8500',
  },
  authOnboardCtaFront: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#7A9000',
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    shadowColor: '#6F8500',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 8,
    elevation: 5,
  },
  authOnboardCtaText: {
    fontWeight: '600',
    fontSize: 15,
    lineHeight: 19,
    color: '#000000',
    textAlign: 'center',
    ...Platform.select({
      ios: {},
      android: { fontFamily: 'sans-serif-medium' },
    }),
  },
  inputWrap: {
    width: '100%',
    marginTop: 6,
    paddingTop: 6,
    gap: 10,
  },

  authInlineFieldError: {
    width: '100%',
    marginTop: AUTH_FORM_GAP,
    marginBottom: AUTH_FORM_GAP,
    paddingHorizontal: 4,
    ...BRAND_TEXT_FONT,
    fontSize: 13,
    lineHeight: 18,
    color: '#FF9C9C',
    ...(Platform.OS === 'android' ? { fontFamily: 'sans-serif', includeFontPadding: false } : {}),
  },

  authFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    minHeight: 48,
    backgroundColor: 'rgba(225, 255, 0, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  authFieldRowFocused: {
    borderColor: LEMON_BRIGHT,
    ...Platform.select({
      ios: {
        shadowColor: LEMON_BRIGHT,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.65,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },

  authFieldRowHidden: {
    display: 'none',
  },
  authTextInput: {
    flex: 1,
    minWidth: 0,
    ...BRAND_TEXT_FONT,
    fontWeight: '400',
    color: TEXT_LIGHT,
    paddingVertical: Platform.OS === 'android' ? 8 : 10,
    paddingHorizontal: 4,
    ...(Platform.OS === 'android' ? { fontFamily: 'sans-serif', includeFontPadding: false } : {}),
  },
  eyeButton: {
    padding: 8,
    marginLeft: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 34,
  },
  eyeButtonIcon: {
    width: 17,
    height: 17,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: AUTH_FORM_GAP,
    minHeight: 48,
  },
  termsRow: {
    marginBottom: AUTH_FORM_GAP,
    minHeight: 48,
    justifyContent: 'center',
  },
  termsCheckboxWrap: {
    flex: 0,
    paddingRight: 0,
  },
  checkboxWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minHeight: 36,
    paddingVertical: 6,
    paddingRight: 12,
  },
  checkboxWrapPressed: {
    opacity: 0.85,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderRadius: 6,
    overflow: 'hidden',
  },
  checkboxBoxChecked: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  checkboxSquare: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  checkboxSquareChecked: {
    borderColor: 'rgba(255, 255, 255, 0.28)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  checkboxCheckIcon: {
    position: 'absolute',
    color: ACCENT,
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  checkboxEyeIcon: {
    width: 14,
    height: 14,
  },
  checkmark: {
    color: ACCENT,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    textAlign: 'center',
  },
  checkboxLabel: {
    ...BRAND_TEXT_FONT,
    fontWeight: '400',
    fontSize: 14,
    color: TEXT_LIGHT,
    backgroundColor: 'transparent',
    opacity: 1,
    flexShrink: 1,
    ...(Platform.OS === 'android' ? { fontFamily: 'sans-serif', includeFontPadding: false } : {}),
  },
  termsLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
  },
  termsInlineLink: {
    ...BRAND_TEXT_FONT,
    fontSize: 12,
    fontWeight: '500',
    color: LEMON_BRIGHT,
    textDecorationLine: 'underline',
    ...LEMON_LINK_GLOW,
  },
  termsLinkWrap: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingVertical: 4,
  },
  termsLink: {
    ...BRAND_TEXT_FONT,
    fontSize: 12,
    fontWeight: '500',
    color: LEMON_BRIGHT,
    textDecorationLine: 'underline',
    ...LEMON_LINK_GLOW,
  },
  forgotWrap: {
    flexShrink: 1,
    alignSelf: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  forgotIcon: {
    width: 14,
    height: 14,
    marginRight: 8,
    tintColor: ACCENT,
  },
  forgotText: {
    ...BRAND_TEXT_FONT,
    fontWeight: '400',
    fontSize: 14,
    color: ACCENT,
    backgroundColor: 'transparent',
    opacity: 1,
    ...(Platform.OS === 'android' ? { fontFamily: 'sans-serif', includeFontPadding: false } : {}),
  },
  primaryButtonText: {
    fontSize: 16,
    letterSpacing: 0,
    backgroundColor: 'transparent',
    opacity: 1,
    ...(Platform.OS === 'android'
      ? ANDROID_ACCENT_TEXT
      : { ...BRAND_TEXT_FONT, fontWeight: '400', color: TEXT_DARK }),
  },
  loginErrorText: {
    ...BRAND_TEXT_FONT,
    fontSize: 14,
    color: '#E57373',
    marginTop: 8,
    marginBottom: 4,
    textAlign: 'center',
  },
  statusCard: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 0,
    marginBottom: AUTH_FORM_GAP,
  },
  statusCardError: {
    backgroundColor: 'rgba(229,115,115,0.08)',
    borderColor: 'rgba(229,115,115,0.3)',
  },
  statusCardTitle: {
    ...BRAND_TEXT_FONT,
    fontSize: 13,
    fontWeight: '500',
    color: ACCENT,
    marginBottom: 6,
  },
  statusCardTitleError: {
    color: '#FF9C9C',
  },
  statusCardText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#D7D7D7',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  statusCardTextError: {
    color: '#FFD3D3',
  },
  dividerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    width: DESIGN_CONTENT_WIDTH,
    minHeight: 40,
    gap: 12,
    padding: 0,
    marginBottom: AUTH_FORM_GAP,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: TEXT_LIGHT,
  },
  dividerOrImage: {
    width: 40,
    height: 18,
    marginHorizontal: 12,
  },
  dividerText: {
    ...BRAND_TEXT_FONT,
    fontWeight: '300',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0,
    color: TEXT_LIGHT,
    marginHorizontal: 12,
    backgroundColor: 'transparent',
    opacity: 1,
    ...(Platform.OS === 'android' ? { fontFamily: 'sans-serif', includeFontPadding: false } : {}),
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: DESIGN_CONTENT_WIDTH,
    gap: AUTH_FORM_GAP,
    marginTop: 0,
  },
  socialRowTwoButtons: {
    justifyContent: 'center',
    gap: 16,
  },

  socialRowIosGrouped: {
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 16,
  },
  socialButton: {
    flex: 1,
    minWidth: 0,
    maxWidth: Platform.OS === 'android' ? 172 : 105,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EFF0F6',
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  socialButtonIos: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 96,
    width: 96,
    maxWidth: 96,
    minWidth: 96,
  },
  socialIcon: {
    fontSize: 22,
  },
  socialIconImage: {
    width: 22,
    height: 22,
  },

  socialIconFacebook: Platform.select({
    ios: { width: 26, height: 26 },
    default: {},
  }),
  socialIconImageApple: {
    width: 14.67,
    height: 18,
  },
  forgotModalKeyboardRoot: {
    flex: 1,
    backgroundColor: BG_DARK,
  },
  forgotModalOverlay: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
  },
  forgotModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    backgroundColor: '#000',
  },
  forgotModalBox: {
    zIndex: 2,
    width: '100%',
    maxWidth: '100%',
    minHeight: '100%',
    backgroundColor: '#000',
    borderRadius: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    paddingTop: 28,
    paddingHorizontal: 22,
    paddingBottom: 22,
    ...Platform.select({
      ios: {
        shadowColor: 'transparent',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0,
        shadowRadius: 0,
      },
      android: {
        elevation: 0,
      },
      default: {},
    }),
  },
  termsModalBackBtn: {
    position: 'absolute',
    top: 14,
    left: 14,
    zIndex: 2,
    minWidth: 40,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  termsModalOverlay: {
    flex: 1,
    backgroundColor: BG_DARK,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  termsModalBox: {
    width: '100%',
    maxWidth: 368,
    maxHeight: '88%',
    backgroundColor: BG_DARK,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(238, 255, 102, 0.5)',
    paddingTop: 22,
    paddingHorizontal: 18,
    paddingBottom: 18,
    shadowColor: LEMON_BRIGHT,
    shadowOpacity: 0.48,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
    elevation: 16,
  },
  termsHandle: {
    alignSelf: 'center',
    width: 48,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(238, 255, 102, 0.45)',
    marginBottom: 14,
    ...Platform.select({
      ios: {
        shadowColor: LEMON_BRIGHT,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 6,
      },
      default: {},
    }),
  },
  termsHeader: {
    alignItems: 'center',
    paddingTop: 8,
    marginBottom: 14,
  },
  termsTitle: {
    ...BRAND_TEXT_FONT,
    fontSize: 22,
    fontWeight: '500',
    color: TEXT_LIGHT,
    textAlign: 'center',
    marginBottom: 6,
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(238, 255, 102, 0.3)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
      },
      default: {},
    }),
  },
  termsSubtitle: {
    fontSize: 12,
    color: '#B5B5B5',
    textAlign: 'center',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  termsDivider: {
    height: 1,
    backgroundColor: 'rgba(238, 255, 102, 0.35)',
    marginBottom: 14,
  },
  termsScroll: {
    flex: 1,
  },
  termsScrollContent: {
    flexGrow: 1,
    paddingTop: 4,
    paddingBottom: 24,
    paddingRight: 4,
  },
  termsBodyText: {
    width: '100%',
    fontSize: 13,
    lineHeight: 20,
    color: '#D7D7D7',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  forgotModalHeader: {
    marginBottom: 16,
  },
  forgotModalBackBtn: {
    position: 'absolute',
    top: 14,
    left: 14,
    zIndex: 2,
    minWidth: 42,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    backgroundColor: 'rgba(238, 255, 102, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(238, 255, 102, 0.4)',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: LEMON_BRIGHT,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  forgotHero: {
    alignItems: 'center',
    paddingTop: 14,
    marginBottom: 18,
  },
  forgotHeroIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    borderColor: 'rgba(238, 255, 102, 0.5)',
    backgroundColor: 'rgba(238, 255, 102, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    ...Platform.select({
      ios: {
        shadowColor: LEMON_BRIGHT,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.45,
        shadowRadius: 14,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  forgotHeroIcon: {
    width: 28,
    height: 28,
    tintColor: ACCENT,
  },
  forgotStepRow: {
    marginBottom: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
  },

  forgotStepRowTight: {
    marginBottom: 12,
  },
  forgotStepRowText: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    ...(Platform.OS === 'android' ? { fontFamily: 'sans-serif', includeFontPadding: false } : { ...BRAND_TEXT_FONT }),
  },
  forgotStepPlainSep: {
    color: '#6A6A6A',
    fontSize: 12,
  },
  forgotStepPlain: {
    color: '#9A9A9A',
    fontSize: 12,
    fontWeight: '400',
  },
  forgotStepPlainActive: {
    color: LEMON_BRIGHT,
    fontSize: 12,
    fontWeight: '600',
  },
  forgotModalTitle: {
    ...BRAND_TEXT_FONT,
    fontSize: 22,
    fontWeight: '500',
    color: TEXT_LIGHT,
    textAlign: 'center',
    marginBottom: 8,
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(238, 255, 102, 0.35)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 12,
      },
      default: {},
    }),
  },
  forgotModalSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: '#B5B5B5',
    textAlign: 'center',
    maxWidth: 260,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  forgotModalBody: {
    paddingTop: 2,
    paddingBottom: 6,
  },

  forgotModalBodyNoSection: {
    paddingTop: 14,
    paddingBottom: 10,
  },
  forgotModalFieldsWrap: {
    width: '100%',
    gap: 20,
    marginTop: 6,
    marginBottom: 6,
  },
  forgotModalFieldError: {
    width: '100%',
    marginTop: 4,
    marginBottom: 10,
    paddingHorizontal: 6,
    lineHeight: 18,
    color: '#FF9C9C',
    ...(Platform.OS === 'android' ? { fontFamily: 'sans-serif', includeFontPadding: false } : { ...BRAND_TEXT_FONT }),
  },
  forgotRegisterLinkWrap: {
    alignSelf: 'flex-start',
    marginBottom: 14,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  forgotRegisterLinkText: {
    fontSize: 14,
    color: LEMON_BRIGHT,
    textDecorationLine: 'underline',
    ...(Platform.OS === 'android' ? { fontFamily: 'sans-serif' } : { ...BRAND_TEXT_FONT, fontWeight: '500' }),
  },
  forgotSuggestRegisterBlock: {
    width: '100%',
    marginBottom: 12,
    gap: 10,
  },
  forgotRegisterHintText: {
    width: '100%',
    lineHeight: 20,
    color: '#C8C8C8',
    ...(Platform.OS === 'android' ? { fontFamily: 'sans-serif', includeFontPadding: false } : { ...BRAND_TEXT_FONT }),
  },
  forgotSecondaryBtn: {
    width: '100%',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: ACCENT,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: 'rgba(225, 255, 0, 0.08)',
    marginBottom: 4,
  },
  forgotSecondaryBtnPressed: {
    backgroundColor: 'rgba(225, 255, 0, 0.16)',
  },
  forgotSecondaryBtnText: {
    fontSize: 15,
    color: LEMON_BRIGHT,
    ...(Platform.OS === 'android'
      ? { fontFamily: 'sans-serif-medium', includeFontPadding: false }
      : { ...BRAND_TEXT_FONT, fontWeight: '600' }),
  },
  forgotInAppBanner: {
    width: '100%',
    textAlign: 'center',
    lineHeight: 18,
    color: '#B8B8B8',
    marginBottom: 14,
    paddingHorizontal: 8,
    ...(Platform.OS === 'android' ? { fontFamily: 'sans-serif', includeFontPadding: false } : { ...BRAND_TEXT_FONT }),
  },
  forgotSectionTitle: {
    ...BRAND_TEXT_FONT,
    fontSize: 14,
    fontWeight: '500',
    color: TEXT_LIGHT,
    marginBottom: 10,
  },
  forgotSectionDivider: {
    height: 1,
    backgroundColor: 'rgba(238, 255, 102, 0.28)',
  },
  forgotModalLabel: {
    ...BRAND_TEXT_FONT,
    fontSize: 14,
    color: '#B0B0B0',
    marginBottom: 8,
  },
  forgotMethodRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  forgotMethodBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
  },
  forgotMethodBtnActive: {
    borderColor: ACCENT,
    backgroundColor: 'rgba(225, 255, 0, 0.15)',
  },
  forgotMethodBtnText: {
    ...BRAND_TEXT_FONT,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.58)',
  },
  forgotMethodBtnTextActive: {
    color: ACCENT,
  },
  forgotCodeDisplayBox: {
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(225, 255, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(238, 255, 102, 0.45)',
    alignItems: 'center',
  },
  forgotCodeDisplayDigits: {
    ...(Platform.OS === 'android'
      ? { fontFamily: 'monospace', fontWeight: '700' }
      : { ...BRAND_TEXT_FONT, fontWeight: '600' }),
    letterSpacing: 6,
    color: ACCENT,
  },
  forgotPrimaryBtnAfterEmail: {
    marginTop: 20,
  },
  forgotPrimaryBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  forgotPrimaryBtnDisabled: {
    opacity: 0.92,
  },
  forgotGhostBtnDisabled: {
    opacity: 0.55,
  },
  forgotBackTextMuted: {
    opacity: 0.85,
  },
  forgotPrimaryBtn: {
    backgroundColor: ACCENT,
    borderRadius: 8,
    overflow: 'hidden',
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
    minHeight: 47,
    ...Platform.select({
      ios: {
        shadowColor: LEMON_BRIGHT,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.45,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
        borderWidth: 1,
        borderColor: '#D0EC00',
      },
    }),
  },
  forgotPrimaryBtnPressed: {
    backgroundColor: ACCENT_PRESSED,
  },
  forgotPrimaryBtnText: {
    fontSize: 16,
    ...(Platform.OS === 'android'
      ? ANDROID_ACCENT_TEXT
      : { ...BRAND_TEXT_FONT, fontWeight: '500', color: TEXT_DARK }),
  },
  forgotBackText: {
    ...BRAND_TEXT_FONT,
    fontSize: 14,
    color: LEMON_BRIGHT,
    textAlign: 'center',
    textDecorationLine: 'underline',
    ...(Platform.OS === 'android' ? { fontFamily: 'sans-serif', includeFontPadding: false } : {}),
  },
  forgotGhostBtn: {
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 0,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  forgotNoProfileText: {
    ...BRAND_TEXT_FONT,
    fontSize: 16,
    fontWeight: '500',
    color: TEXT_LIGHT,
    textAlign: 'center',
    marginBottom: 10,
  },
  forgotNoProfileSubtext: {
    fontSize: 13,
    lineHeight: 18,
    color: '#AEAEAE',
    textAlign: 'center',
    marginBottom: 18,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  forgotCodeBoxWrap: {
    position: 'relative',
    marginBottom: 8,
    borderRadius: 14,
    overflow: 'hidden',
  },
  forgotCodeBoxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  forgotCodeBox: {
    flex: 1,
    height: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgotCodeBoxDigit: {
    ...BRAND_TEXT_FONT,
    fontSize: 24,
    fontWeight: '600',
    color: TEXT_LIGHT,
  },
  forgotCodeInputHidden: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    fontSize: 1,
  },
});

export default function ThirdPage({ navigation, route }) {
  if (!AuthSessionModule || !FacebookAuthSessionProvider) {
    return <ThirdPageContent navigation={navigation} route={route} />;
  }
  return <ThirdPageWithGoogleOAuth navigation={navigation} route={route} />;
}

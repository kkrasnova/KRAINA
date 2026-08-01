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
  StatusBar as RNStatusBar,
  PanResponder,
  BackHandler,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';
import AuthHeroHeader, { WAVE_STROKE_PAD as AUTH_HERO_WAVE_PAD } from './AuthHeroHeader';
import AuthTabSwitcher from './AuthTabSwitcher';
import ForgotPasswordLockAnimation from './ForgotPasswordLockAnimation';
import ForgotPasswordOtpInput from './ForgotPasswordOtpInput';
import { useResponsive } from './useResponsive';
import { useAuthTabSwipePanHandlers } from './useAuthTabSwipe';
import { runAfterInteractions } from './runAfterInteractions';
import { brandFontText } from './brandFont';
import { authOverlayFromErrorCode } from './authOverlayI18n';
import { thirdPageUi } from './thirdPageUiStrings';
import { getTermsContentForLanguage } from './termsContentI18n';
import TermsOfUseSheetModal from './TermsOfUseSheetModal';
import FittingText from './FittingText';
import {
  GOOGLE_WEB_CLIENT_ID,
  GOOGLE_SIGNIN_WEB_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_REDIRECT_URI,
  GOOGLE_OAUTH_REDIRECT_PATH,
  resolveGoogleOAuthRedirectUri,
  hasGoogleConfig,
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
  signInWithAppleFirebase,
  completeAdminLoginWithCredentials,
  loginOrRegisterApple,
} from './db';
import {
  ensureBackendSession,
  mergeBackendUserIntoLocalSession,
  syncBackendSessionAfterThirdPageEmailAuth,
  syncBackendSessionAfterGoogleIdToken,
  syncBackendSessionAfterAppleIdentityToken,
  persistSessionRecoveryCredentials,
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
import { getAppTheme } from './themeStorage';
import { noAndroidRipple, rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';

let AuthSessionModule = null;

let GoogleAuthSessionProvider = null;
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
} catch (e) { if (__DEV__) console.warn('[ThirdPage] swallowed:', e?.message); }
try {
  const { requireOptionalNativeModule } = require('expo-modules-core');
  // expo-auth-session → expo-crypto/aes needs ExpoCryptoAES in the native binary.
  if (requireOptionalNativeModule('ExpoCryptoAES')) {
    require('expo-web-browser');
    AuthSessionModule = require('expo-auth-session');
    GoogleAuthSessionProvider = require('expo-auth-session/providers/google');
  }
} catch (e) {
  if (__DEV__) console.warn('[ThirdPage] auth-session unavailable:', e?.message);
  AuthSessionModule = null;
  GoogleAuthSessionProvider = null;
}


function devLogGoogleRedirectOnce(label, uri) {
  if (!__DEV__ || !uri) return;
  try {
    if (globalThis.__krainaGoogleRedirectUriLogged) return;
    globalThis.__krainaGoogleRedirectUriLogged = true;
    console.log(`[Google OAuth] ${label}:`, uri);
  } catch (e) { if (__DEV__) console.warn('[ThirdPage] swallowed:', e?.message); }
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
  } catch (e) { if (__DEV__) console.warn('[ThirdPage] swallowed:', e?.message); }
};

const REMEMBER_ME_KEY = '@kraina_remember_me';
const REMEMBER_EMAIL_KEY = '@kraina_remember_email';
const REMEMBER_EMAIL_SECURE_KEY = 'kraina_remember_email_secure';
const REMEMBER_PASSWORD_SECURE_KEY = 'kraina_remember_password_secure';
const REMEMBER_EMAIL_SECURE_KEY_LEGACY = '@kraina_remember_email_secure';
const REMEMBER_PASSWORD_SECURE_KEY_LEGACY = '@kraina_remember_password_secure';

const AUTH_FORM_DRAFT_KEY = '@kraina_auth_form_draft_v1';
const AUTH_DRAFT_PASSWORD_SECURE_KEY = 'kraina_auth_draft_password_secure';
const AUTH_DRAFT_PASSWORD_SECURE_KEY_LEGACY = '@kraina_auth_draft_password_secure';
const SECURE_STORE_OPTIONS = { keychainService: 'kraina.saved-login' };

const safeSecureGetItem = async (key, legacyKey) => {
  try {
    const SS = getSecureStoreModule();
    if (!SS?.getItemAsync) return null;
    const value = await SS.getItemAsync(key, SECURE_STORE_OPTIONS);
    if (value != null && value !== '') return value;
    if (legacyKey) {
      return await SS.getItemAsync(legacyKey, SECURE_STORE_OPTIONS);
    }
    return null;
  } catch (e) {
    return null;
  }
};

const safeSecureSetItem = async (key, value) => {
  try {
    const SS = getSecureStoreModule();
    if (!SS?.setItemAsync) return;
    await SS.setItemAsync(key, value, SECURE_STORE_OPTIONS);
  } catch (e) { if (__DEV__) console.warn('[ThirdPage] swallowed:', e?.message); }
};

const safeSecureDeleteItem = async (key) => {
  try {
    const SS = getSecureStoreModule();
    if (!SS?.deleteItemAsync) return;
    await SS.deleteItemAsync(key, SECURE_STORE_OPTIONS);
  } catch (e) { if (__DEV__) console.warn('[ThirdPage] swallowed:', e?.message); }
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
const DESIGN_TITLE_HEIGHT = 26;
const DESIGN_TITLE_FONT_SIZE = 21;
/** iPhone: компактніший заголовок і вкладки на всіх мовах. */
const AUTH_IOS_TITLE_FONT_SIZE = 18;
const AUTH_IOS_TITLE_LINE_HEIGHT = 22;
const AUTH_INPUT_FONT_SIZE = 14;

const AUTH_FORM_GAP = 13;
const AUTH_HERO_HEIGHT_RATIO = 0.34;

function AuthFieldLeadingIcon({ name }) {
  return (
    <View style={authFieldIconStyles.wrap}>
      <Ionicons name={name} size={18} color="rgba(255,255,255,0.92)" />
    </View>
  );
}

const authFieldIconStyles = StyleSheet.create({
  wrap: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
});

function ForgotPasswordFieldIcon({ name, focused }) {
  return (
    <View style={[forgotFieldIconStyles.bubble, focused && forgotFieldIconStyles.bubbleFocused]}>
      <Ionicons name={name} size={19} color={focused ? ACCENT : 'rgba(238, 255, 102, 0.78)'} />
    </View>
  );
}

const forgotFieldIconStyles = StyleSheet.create({
  bubble: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    backgroundColor: 'rgba(225, 255, 0, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(238, 255, 102, 0.18)',
  },
  bubbleFocused: {
    backgroundColor: 'rgba(225, 255, 0, 0.14)',
    borderColor: 'rgba(238, 255, 102, 0.42)',
  },
});

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
    const interactionTask = runAfterInteractions(() => {
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
  forgotSendingEmailTitle: 'Sending your code',
  forgotSendingEmailSubtitle: 'Please wait — we are delivering a 6-digit code to your inbox.',
  forgotSendingCodeLabel: 'Your code',
  forgotEmailLetterIntro: 'Hello! Here is your verification code to reset your password.',
  forgotEmailLetterHint: 'Open the letter in your inbox and enter the code below.',
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
  it: {
    forgotTitle: 'Recupero password',
    forgotSendCode: 'Invia un codice a 6 cifre via email',
    forgotSendingEmail: 'Invio…',
    forgotYourCodeTitle: 'Il tuo codice di recupero',
    forgotYourCodeHint:
      'Il codice è mostrato qui sotto — salvato solo su questo dispositivo (nessun server email nell’app). Inseriscilo per continuare.',
    forgotEnterCodeBelow: 'Inserisci il codice a 6 cifre',
    forgotCodeExpired: 'Questo codice è scaduto. Tocca «Invia di nuovo».',
    forgotCodeContinue: 'Continua',
    forgotCodeSent: 'Codice inviato',
    forgotEnterCode: 'Inserisci il codice',
    forgotConfirmCode: 'Conferma',
    forgotNewPassword: 'Nuova password',
    forgotConfirmPassword: 'Conferma password',
    forgotChangePassword: 'Cambia password',
    forgotSuccess: 'Password modificata',
    forgotClose: 'Chiudi',
    forgotWrongCode: 'Codice errato',
    forgotUserNotFound: 'Utente non trovato',
    forgotNoProfile: 'Nessun profilo per questa email',
    forgotCreateProfile: 'Crea un account',
    forgotCodeSentToEmail: 'Codice inviato alla tua email',
    forgotSuccessCanLogin: 'Password modificata. Puoi accedere.',
    forgotEmailNotRegistered:
      'Questa email non è registrata nell’app. Controlla l’ortografia o crea un nuovo account.',
    forgotInAppResetHint: 'Nessuna email verrà inviata. Inserisci una nuova password qui sotto.',
    forgotNewPasswordAfterCode: 'Inserisci e conferma una nuova password, poi accedi con essa.',
    forgotSendFailed: 'Impossibile inviare l’email di reset. Riprova più tardi.',
    forgotEmailCodeTitle: 'Codice dall’email',
    forgotCheckEmailForCode:
      'Abbiamo inviato un codice a 6 cifre alla tua email. Apri il messaggio e inserisci o incolla il codice qui sotto.',
    forgotEmailSendFailed: 'Impossibile inviare l’email. Controlla Internet o riprova più tardi.',
    forgotNoEmailConfigured:
      'L’invio email non è configurato (aggiungi EXPO_PUBLIC_RESEND_API_KEY). Il codice è mostrato qui sotto.',
    forgotInvalidResendKey:
      'Chiave API Resend non valida in app/.env — deve iniziare con re_ (resend.com → API Keys). Poi npm run start:clear.',
    forgotResendSandbox:
      'Modalità test Resend: puoi inviare solo all’email del tuo account Resend o dopo la verifica del dominio e EXPO_PUBLIC_RESEND_FROM.',
    forgotResendDomain:
      'Resend ha rifiutato il mittente. Verifica il dominio in Resend e imposta EXPO_PUBLIC_RESEND_FROM.',
    forgotResendNetworkFailed:
      'Impossibile raggiungere il servizio email. Sull’emulatore Android: controlla Internet in Chrome.',
  },
  fr: {
    forgotTitle: 'Récupération du mot de passe',
    forgotSendCode: 'Envoyer un code à 6 chiffres par e-mail',
    forgotSendingEmail: 'Envoi…',
    forgotYourCodeTitle: 'Votre code de récupération',
    forgotYourCodeHint:
      'Le code est affiché ci-dessous — enregistré uniquement sur cet appareil (pas de serveur e-mail dans l’app). Saisissez-le pour continuer.',
    forgotEnterCodeBelow: 'Entrez le code à 6 chiffres',
    forgotCodeExpired: 'Ce code a expiré. Appuyez sur « Renvoyer ».',
    forgotCodeContinue: 'Continuer',
    forgotCodeSent: 'Code envoyé',
    forgotEnterCode: 'Entrez le code',
    forgotConfirmCode: 'Confirmer',
    forgotNewPassword: 'Nouveau mot de passe',
    forgotConfirmPassword: 'Confirmer le mot de passe',
    forgotChangePassword: 'Changer le mot de passe',
    forgotSuccess: 'Mot de passe modifié',
    forgotClose: 'Fermer',
    forgotWrongCode: 'Code incorrect',
    forgotUserNotFound: 'Utilisateur introuvable',
    forgotNoProfile: 'Aucun profil pour cet e-mail',
    forgotCreateProfile: 'Créer un compte',
    forgotCodeSentToEmail: 'Code envoyé à votre e-mail',
    forgotSuccessCanLogin: 'Mot de passe modifié. Vous pouvez vous connecter.',
    forgotEmailNotRegistered:
      'Cet e-mail n’est pas enregistré dans l’app. Vérifiez l’orthographe ou créez un compte.',
    forgotInAppResetHint: 'Aucun e-mail ne sera envoyé. Entrez un nouveau mot de passe ci-dessous.',
    forgotNewPasswordAfterCode: 'Entrez et confirmez un nouveau mot de passe, puis connectez-vous.',
    forgotSendFailed: 'Impossible d’envoyer l’e-mail de réinitialisation. Réessayez plus tard.',
    forgotEmailCodeTitle: 'Code de l’e-mail',
    forgotCheckEmailForCode:
      'Nous avons envoyé un code à 6 chiffres à votre e-mail. Ouvrez le message et saisissez ou collez le code ci-dessous.',
    forgotEmailSendFailed: 'Impossible d’envoyer l’e-mail. Vérifiez Internet ou réessayez plus tard.',
    forgotNoEmailConfigured:
      'L’envoi d’e-mail n’est pas configuré (ajoutez EXPO_PUBLIC_RESEND_API_KEY). Le code est affiché ci-dessous.',
    forgotInvalidResendKey:
      'Clé API Resend invalide dans app/.env — elle doit commencer par re_ (resend.com → API Keys). Puis npm run start:clear.',
    forgotResendSandbox:
      'Mode test Resend : envoi uniquement vers l’e-mail de votre compte Resend ou après vérification du domaine et EXPO_PUBLIC_RESEND_FROM.',
    forgotResendDomain:
      'Resend a rejeté l’expéditeur. Vérifiez le domaine dans Resend et définissez EXPO_PUBLIC_RESEND_FROM.',
    forgotResendNetworkFailed:
      'Impossible de joindre le service e-mail. Sur l’émulateur Android : vérifiez Internet dans Chrome.',
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
  it: {
    termsAgreement: 'Accetto i Termini di utilizzo',
    termsOpen: 'Apri i termini',
    termsTitle: 'Termini di utilizzo',
    termsAccept: 'Accetta i termini',
    termsBack: 'Indietro',
    errorTermsRequired: 'Conferma di accettare i Termini di utilizzo',
  },
  fr: {
    termsAgreement: 'J’accepte les Conditions d’utilisation',
    termsOpen: 'Ouvrir les conditions',
    termsTitle: 'Conditions d’utilisation',
    termsAccept: 'Accepter les conditions',
    termsBack: 'Retour',
    errorTermsRequired: 'Confirmez que vous acceptez les Conditions d’utilisation',
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
    forgotSendingEmailTitle: 'Надсилаємо код на пошту',
    forgotSendingEmailSubtitle: 'Зачекайте — 6-значний код уже в дорозі до вашої скриньки.',
    forgotSendingCodeLabel: 'Ваш код',
    forgotEmailLetterIntro: 'Вітаємо! Ось код для відновлення пароля у додатку.',
    forgotEmailLetterHint: 'Відкрийте лист у скринькі та введіть код нижче.',
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
    registerTitle: 'Rejestracja',
    loginTab: 'Zaloguj',
    registerTab: 'Zarejestruj się',
    namePlaceholder: 'Imię',
    emailPlaceholder: 'E-mail',
    passwordPlaceholder: 'Hasło',
    confirmPasswordPlaceholder: 'Potwierdź hasło',
    rememberMe: 'Zapamiętaj mnie',
    forgotPassword: 'Zapomniałeś hasła?',
    loginButton: 'Zaloguj',
    registerButton: 'Zarejestruj się',
    orLoginWith: 'Lub zaloguj się przez',
    orRegisterWith: 'Lub zarejestruj się przez',
    hidePassword: 'Ukryj hasło',
    showPassword: 'Pokaż hasło',
    errorInvalidEmail: 'Podaj prawidłowy adres e-mail',
    errorEmptyEmail: 'Podaj adres e-mail',
    errorEmptyName: 'Podaj imię',
    errorEmptyPassword: 'Podaj hasło',
    errorPasswordTooShort: 'Hasło musi mieć co najmniej 6 znaków',
    errorConfirmPassword: 'Potwierdź hasło',
    errorPasswordMismatch: 'Hasła nie są takie same',
    errorWrongEmailOrPassword: 'Nieprawidłowy e-mail lub hasło',
    errorEmptyFields: 'Podaj e-mail i hasło',
    registerSuccess: 'Konto zostało utworzone',
    errorEmailExists: 'Ten e-mail jest już zarejestrowany',
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
    registerTitle: 'Registrierung',
    loginTab: 'Anmelden',
    registerTab: 'Registrieren',
    namePlaceholder: 'Name',
    emailPlaceholder: 'E-Mail',
    passwordPlaceholder: 'Passwort',
    confirmPasswordPlaceholder: 'Passwort bestätigen',
    rememberMe: 'Angemeldet bleiben',
    forgotPassword: 'Passwort vergessen?',
    loginButton: 'Anmelden',
    registerButton: 'Registrieren',
    orLoginWith: 'Oder anmelden mit',
    orRegisterWith: 'Oder registrieren mit',
    hidePassword: 'Passwort verbergen',
    showPassword: 'Passwort anzeigen',
    errorInvalidEmail: 'Bitte gültige E-Mail-Adresse eingeben',
    errorEmptyEmail: 'E-Mail-Adresse eingeben',
    errorEmptyName: 'Namen eingeben',
    errorEmptyPassword: 'Passwort eingeben',
    errorPasswordTooShort: 'Passwort muss mindestens 6 Zeichen haben',
    errorConfirmPassword: 'Passwort bestätigen',
    errorPasswordMismatch: 'Passwörter stimmen nicht überein',
    errorWrongEmailOrPassword: 'Falsche E-Mail oder falsches Passwort',
    errorEmptyFields: 'E-Mail und Passwort eingeben',
    registerSuccess: 'Registrierung erfolgreich',
    errorEmailExists: 'Diese E-Mail ist bereits registriert',
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
    registerTitle: 'Registro',
    loginTab: 'Iniciar sesión',
    registerTab: 'Registrarse',
    namePlaceholder: 'Nombre',
    emailPlaceholder: 'Correo',
    passwordPlaceholder: 'Contraseña',
    confirmPasswordPlaceholder: 'Confirmar contraseña',
    rememberMe: 'Recordarme',
    forgotPassword: '¿Olvidaste tu contraseña?',
    loginButton: 'Entrar',
    registerButton: 'Registrarse',
    orLoginWith: 'O inicia sesión con',
    orRegisterWith: 'O regístrate con',
    hidePassword: 'Ocultar contraseña',
    showPassword: 'Mostrar contraseña',
    errorInvalidEmail: 'Introduce un correo válido',
    errorEmptyEmail: 'Introduce tu correo',
    errorEmptyName: 'Introduce tu nombre',
    errorEmptyPassword: 'Introduce tu contraseña',
    errorPasswordTooShort: 'La contraseña debe tener al menos 6 caracteres',
    errorConfirmPassword: 'Confirma tu contraseña',
    errorPasswordMismatch: 'Las contraseñas no coinciden',
    errorWrongEmailOrPassword: 'Correo o contraseña incorrectos',
    errorEmptyFields: 'Introduce correo y contraseña',
    registerSuccess: 'Te has registrado correctamente',
    errorEmailExists: 'Este correo ya está registrado',
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
    registerTitle: 'Registratie',
    loginTab: 'Inloggen',
    registerTab: 'Registreren',
    namePlaceholder: 'Naam',
    emailPlaceholder: 'E-mail',
    passwordPlaceholder: 'Wachtwoord',
    confirmPasswordPlaceholder: 'Bevestig wachtwoord',
    rememberMe: 'Onthoud mij',
    forgotPassword: 'Wachtwoord vergeten?',
    loginButton: 'Inloggen',
    registerButton: 'Registreren',
    orLoginWith: 'Of log in met',
    orRegisterWith: 'Of registreer met',
    hidePassword: 'Wachtwoord verbergen',
    showPassword: 'Wachtwoord tonen',
    errorInvalidEmail: 'Voer een geldig e-mailadres in',
    errorEmptyEmail: 'Voer je e-mailadres in',
    errorEmptyName: 'Voer je naam in',
    errorEmptyPassword: 'Voer je wachtwoord in',
    errorPasswordTooShort: 'Wachtwoord moet minstens 6 tekens hebben',
    errorConfirmPassword: 'Bevestig je wachtwoord',
    errorPasswordMismatch: 'Wachtwoorden komen niet overeen',
    errorWrongEmailOrPassword: 'Onjuiste e-mail of wachtwoord',
    errorEmptyFields: 'Voer e-mail en wachtwoord in',
    registerSuccess: 'Je bent geregistreerd',
    errorEmailExists: 'Dit e-mailadres is al geregistreerd',
    loginWithGoogle: 'Inloggen met Google',
    loginWithFacebook: 'Inloggen met Facebook',
    loginWithApple: 'Inloggen met Apple',
    loginWithPhone: 'Inloggen met telefoon',
    registerWithGoogle: 'Registreren met Google',
    registerWithFacebook: 'Registreren met Facebook',
    registerWithApple: 'Registreren met Apple',
  },
  lt: {
    title: 'Prisijungimas prie sistemos',
    registerTitle: 'Registracija',
    loginTab: 'Prisijungti',
    registerTab: 'Registruotis',
    namePlaceholder: 'Vardas',
    emailPlaceholder: 'El. paštas',
    passwordPlaceholder: 'Slaptažodis',
    confirmPasswordPlaceholder: 'Patvirtinkite slaptažodį',
    rememberMe: 'Prisiminti mane',
    forgotPassword: 'Pamiršote slaptažodį?',
    loginButton: 'Prisijungti',
    registerButton: 'Registruotis',
    orLoginWith: 'Arba prisijunkite su',
    orRegisterWith: 'Arba registruokitės su',
    hidePassword: 'Slėpti slaptažodį',
    showPassword: 'Rodyti slaptažodį',
    errorInvalidEmail: 'Įveskite galiojantį el. pašto adresą',
    errorEmptyEmail: 'Įveskite el. pašto adresą',
    errorEmptyName: 'Įveskite vardą',
    errorEmptyPassword: 'Įveskite slaptažodį',
    errorPasswordTooShort: 'Slaptažodis turi turėti bent 6 simbolius',
    errorConfirmPassword: 'Patvirtinkite slaptažodį',
    errorPasswordMismatch: 'Slaptažodžiai nesutampa',
    errorWrongEmailOrPassword: 'Neteisingas el. paštas arba slaptažodis',
    errorEmptyFields: 'Įveskite el. paštą ir slaptažodį',
    registerSuccess: 'Sėkmingai užsiregistravote',
    errorEmailExists: 'Šis el. paštas jau užregistruotas',
    loginWithGoogle: 'Prisijungti su Google',
    loginWithFacebook: 'Prisijungti su Facebook',
    loginWithApple: 'Prisijungti su Apple',
    loginWithPhone: 'Prisijungti su telefonu',
    registerWithGoogle: 'Registruotis su Google',
    registerWithFacebook: 'Registruotis su Facebook',
    registerWithApple: 'Registruotis su Apple',
  },
  lv: {
    title: 'Pieslēgties sistēmai',
    registerTitle: 'Reģistrācija',
    loginTab: 'Pieslēgties',
    registerTab: 'Reģistrēties',
    namePlaceholder: 'Vārds',
    emailPlaceholder: 'E-pasts',
    passwordPlaceholder: 'Parole',
    confirmPasswordPlaceholder: 'Apstipriniet paroli',
    rememberMe: 'Atcerēties mani',
    forgotPassword: 'Aizmirsi paroli?',
    loginButton: 'Pieslēgties',
    registerButton: 'Reģistrēties',
    orLoginWith: 'Vai pieslēdzieties ar',
    orRegisterWith: 'Vai reģistrējieties ar',
    hidePassword: 'Slēpt paroli',
    showPassword: 'Rādīt paroli',
    errorInvalidEmail: 'Ievadiet derīgu e-pasta adresi',
    errorEmptyEmail: 'Ievadiet e-pasta adresi',
    errorEmptyName: 'Ievadiet vārdu',
    errorEmptyPassword: 'Ievadiet paroli',
    errorPasswordTooShort: 'Parolei jābūt vismaz 6 rakstzīmēm',
    errorConfirmPassword: 'Apstipriniet paroli',
    errorPasswordMismatch: 'Paroles nesakrīt',
    errorWrongEmailOrPassword: 'Nepareizs e-pasts vai parole',
    errorEmptyFields: 'Ievadiet e-pastu un paroli',
    registerSuccess: 'Jūs esat reģistrēts',
    errorEmailExists: 'Šis e-pasts jau ir reģistrēts',
    loginWithGoogle: 'Pieslēgties ar Google',
    loginWithFacebook: 'Pieslēgties ar Facebook',
    loginWithApple: 'Pieslēgties ar Apple',
    loginWithPhone: 'Pieslēgties ar tālruni',
    registerWithGoogle: 'Reģistrēties ar Google',
    registerWithFacebook: 'Reģistrēties ar Facebook',
    registerWithApple: 'Reģistrēties ar Apple',
  },
  ro: {
    title: 'Autentificare în sistem',
    registerTitle: 'Înregistrare',
    loginTab: 'Autentificare',
    registerTab: 'Înregistrare',
    namePlaceholder: 'Nume',
    emailPlaceholder: 'E-mail',
    passwordPlaceholder: 'Parolă',
    confirmPasswordPlaceholder: 'Confirmă parola',
    rememberMe: 'Ține-mă minte',
    forgotPassword: 'Ai uitat parola?',
    loginButton: 'Autentificare',
    registerButton: 'Înregistrare',
    orLoginWith: 'Sau conectează-te cu',
    orRegisterWith: 'Sau înregistrează-te cu',
    hidePassword: 'Ascunde parola',
    showPassword: 'Arată parola',
    errorInvalidEmail: 'Introdu o adresă de e-mail validă',
    errorEmptyEmail: 'Introdu adresa de e-mail',
    errorEmptyName: 'Introdu numele',
    errorEmptyPassword: 'Introdu parola',
    errorPasswordTooShort: 'Parola trebuie să aibă cel puțin 6 caractere',
    errorConfirmPassword: 'Confirmă parola',
    errorPasswordMismatch: 'Parolele nu coincid',
    errorWrongEmailOrPassword: 'E-mail sau parolă greșită',
    errorEmptyFields: 'Introdu e-mailul și parola',
    registerSuccess: 'Te-ai înregistrat cu succes',
    errorEmailExists: 'Acest e-mail este deja înregistrat',
    loginWithGoogle: 'Conectare cu Google',
    loginWithFacebook: 'Conectare cu Facebook',
    loginWithApple: 'Conectare cu Apple',
    loginWithPhone: 'Conectare cu telefonul',
    registerWithGoogle: 'Înregistrare cu Google',
    registerWithFacebook: 'Înregistrare cu Facebook',
    registerWithApple: 'Înregistrare cu Apple',
  },
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
    registerButton: 'Գրանցվել',
    orLoginWith: 'Կամ մուտք գործել',
    orRegisterWith: 'Կամ գրանցվել',
    hidePassword: 'Թաքցնել գաղտնաբառը',
    showPassword: 'Ցուցադրել գաղտնաբառը',
    errorInvalidEmail: 'Մուտքագրեք վավեր էլ. փոստի հասցե',
    errorEmptyEmail: 'Մուտքագրեք էլ. փոստը',
    errorEmptyName: 'Մուտքագրեք անունը',
    errorEmptyPassword: 'Մուտքագրեք գաղտնաբառը',
    errorPasswordTooShort: 'Գաղտնաբառը պետք է ունենա առնվազն 6 նիշ',
    errorConfirmPassword: 'Հաստատեք գաղտնաբառը',
    errorPasswordMismatch: 'Գաղտնաբառները չեն համընկնում',
    errorWrongEmailOrPassword: 'Սխալ էլ. փոստ կամ գաղտնաբառ',
    errorEmptyFields: 'Մուտքագրեք էլ. փոստը և գաղտնաբառը',
    registerSuccess: 'Դուք հաջողությամբ գրանցվել եք',
    errorEmailExists: 'Այս էլ. փոստն արդեն գրանցված է',
    loginWithGoogle: 'Մուտք Google-ով',
    loginWithFacebook: 'Մուտք Facebook-ով',
    loginWithApple: 'Մուտք Apple-ով',
    loginWithPhone: 'Մուտք հեռախոսով',
    registerWithGoogle: 'Գրանցվել Google-ով',
    registerWithFacebook: 'Գրանցվել Facebook-ով',
    registerWithApple: 'Գրանցվել Apple-ով',
  },
  it: {
    title: 'Accesso al sistema',
    registerTitle: 'Registrazione',
    loginTab: 'Accedi',
    registerTab: 'Registrati',
    namePlaceholder: 'Nome',
    emailPlaceholder: 'Email',
    passwordPlaceholder: 'Password',
    confirmPasswordPlaceholder: 'Conferma password',
    rememberMe: 'Ricordami',
    forgotPassword: 'Password dimenticata?',
    loginButton: 'Accedi',
    registerButton: 'Registrati',
    orLoginWith: 'Oppure accedi con',
    orRegisterWith: 'Oppure registrati con',
    hidePassword: 'Nascondi password',
    showPassword: 'Mostra password',
    errorInvalidEmail: 'Inserisci un indirizzo email valido',
    errorEmptyEmail: 'Inserisci la tua email',
    errorEmptyName: 'Inserisci il tuo nome',
    errorEmptyPassword: 'Inserisci la password',
    errorPasswordTooShort: 'La password deve contenere almeno 6 caratteri',
    errorConfirmPassword: 'Conferma la password',
    errorPasswordMismatch: 'Le password non coincidono',
    errorWrongEmailOrPassword: 'Email o password errati',
    errorEmptyFields: 'Inserisci email e password',
    registerSuccess: 'Registrazione completata',
    errorEmailExists: 'Questa email è già registrata',
    loginWithGoogle: 'Accedi con Google',
    loginWithFacebook: 'Accedi con Facebook',
    loginWithApple: 'Accedi con Apple',
    loginWithPhone: 'Accedi con telefono',
    registerWithGoogle: 'Registrati con Google',
    registerWithFacebook: 'Registrati con Facebook',
    registerWithApple: 'Registrati con Apple',
  },
  fr: {
    title: 'Connexion au système',
    registerTitle: 'Inscription',
    loginTab: 'Connexion',
    registerTab: 'S’inscrire',
    namePlaceholder: 'Nom',
    emailPlaceholder: 'E-mail',
    passwordPlaceholder: 'Mot de passe',
    confirmPasswordPlaceholder: 'Confirmer le mot de passe',
    rememberMe: 'Se souvenir de moi',
    forgotPassword: 'Mot de passe oublié ?',
    loginButton: 'Connexion',
    registerButton: 'S’inscrire',
    orLoginWith: 'Ou connectez-vous avec',
    orRegisterWith: 'Ou inscrivez-vous avec',
    hidePassword: 'Masquer le mot de passe',
    showPassword: 'Afficher le mot de passe',
    errorInvalidEmail: 'Entrez une adresse e-mail valide',
    errorEmptyEmail: 'Entrez votre e-mail',
    errorEmptyName: 'Entrez votre nom',
    errorEmptyPassword: 'Entrez votre mot de passe',
    errorPasswordTooShort: 'Le mot de passe doit contenir au moins 6 caractères',
    errorConfirmPassword: 'Confirmez le mot de passe',
    errorPasswordMismatch: 'Les mots de passe ne correspondent pas',
    errorWrongEmailOrPassword: 'E-mail ou mot de passe incorrect',
    errorEmptyFields: 'Entrez e-mail et mot de passe',
    registerSuccess: 'Inscription réussie',
    errorEmailExists: 'Cet e-mail est déjà enregistré',
    loginWithGoogle: 'Connexion avec Google',
    loginWithFacebook: 'Connexion avec Facebook',
    loginWithApple: 'Connexion avec Apple',
    loginWithPhone: 'Connexion avec téléphone',
    registerWithGoogle: 'S’inscrire avec Google',
    registerWithFacebook: 'S’inscrire avec Facebook',
    registerWithApple: 'S’inscrire avec Apple',
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

function buildOAuthRedirectUri(makeRedirectUri, path, envOverride = '') {
  const envUri = typeof envOverride === 'string' ? envOverride.trim() : '';
  if (envUri) return envUri;
  if (typeof makeRedirectUri === 'function') {
    const nativeUri = makeRedirectUri({ scheme: 'com.kraina.app', path });
    if (nativeUri && typeof nativeUri === 'string') return nativeUri;
  }
  return `com.kraina.app:/${path}`;
}

function buildGoogleRedirectUri(makeRedirectUri) {
  const resolved = resolveGoogleOAuthRedirectUri(GOOGLE_OAUTH_REDIRECT_PATH);
  if (resolved) return resolved;
  return buildOAuthRedirectUri(makeRedirectUri, GOOGLE_OAUTH_REDIRECT_PATH, GOOGLE_REDIRECT_URI);
}

function ThirdPageWithGoogleOAuth({ navigation, route }) {
  const makeRedirectUri = AuthSessionModule?.makeRedirectUri;
  const googleRedirectUri = useMemo(
    () => buildGoogleRedirectUri(makeRedirectUri),
    [makeRedirectUri],
  );
  const googleAuthUseProxy = useMemo(
    () => typeof googleRedirectUri === 'string' && googleRedirectUri.startsWith('https://'),
    [googleRedirectUri],
  );
  const [googleRequest, googleResponse, googlePromptAsync] = GoogleAuthSessionProvider.useIdTokenAuthRequest(
    {
      webClientId: GOOGLE_SIGNIN_WEB_CLIENT_ID,
      iosClientId: GOOGLE_IOS_CLIENT_ID,
      androidClientId: GOOGLE_ANDROID_CLIENT_ID,
      redirectUri: googleRedirectUri,
    },
    { scheme: 'com.kraina.app', path: GOOGLE_OAUTH_REDIRECT_PATH },
  );
  useEffect(() => {
    devLogGoogleRedirectOnce('Google redirect URI', googleRedirectUri);
  }, [googleRedirectUri]);
  useEffect(() => {
    const tryComplete = () => {
      try {
        const WB = require('expo-web-browser');
        if (WB?.maybeCompleteAuthSession) WB.maybeCompleteAuthSession();
      } catch (e) { if (__DEV__) console.warn('[ThirdPage] swallowed:', e?.message); }
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
  navigation = null,
  route = null,
}) {
  const r = useResponsive();
  const [language, setLanguage] = useState(() =>
    normalizeAppLanguage(route?.params?.language || 'en'),
  );
  const texts = getLoginTexts(language);
  const showAppleLogin = Platform.OS === 'ios';
  const socialProviderCount = 1 + (showAppleLogin ? 1 : 0);
  const useWideSocialButtons = socialProviderCount >= 2;
  const useAndroidGoogleFullWidth = Platform.OS === 'android';
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
  const [forgotPasswordVisible, setForgotPasswordVisible] = useState(false);

  const [forgotFieldError, setForgotFieldError] = useState(null);

  const [forgotDelivery, setForgotDelivery] = useState(null);

  const [forgotSuggestRegister, setForgotSuggestRegister] = useState(false);

  const [forgotSending, setForgotSending] = useState(false);

  const [forgotDisplayCode, setForgotDisplayCode] = useState('');
  const [forgotCodeVerifying, setForgotCodeVerifying] = useState(false);
  const [forgotPasswordSubmitting, setForgotPasswordSubmitting] = useState(false);
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

  /** Після промо-відео онбордингу — екран входу «випливає» знизу. */
  const fromPromoVideo = route?.params?.fromPromoVideo === true;
  const promoEnterAnim = useRef(new Animated.Value(fromPromoVideo ? 0 : 1)).current;
  useEffect(() => {
    if (!fromPromoVideo) {
      promoEnterAnim.setValue(1);
      return undefined;
    }
    promoEnterAnim.setValue(0);
    Animated.timing(promoEnterAnim, {
      toValue: 1,
      duration: 880,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    return undefined;
  }, [fromPromoVideo, promoEnterAnim]);
  const promoEnterY = promoEnterAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [72, 0],
  });
  const promoEnterScale = promoEnterAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });
  const promoEnterStyle = fromPromoVideo
    ? {
        opacity: promoEnterAnim,
        transform: [{ translateY: promoEnterY }, { scale: promoEnterScale }],
      }
    : null;

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
        iosClientId: GOOGLE_IOS_CLIENT_ID,
        offlineAccess: false,
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
    const reauthEmail = route?.params?.reauthEmail || route?.params?.prefilledEmail;
    if (route?.params?.reauthForChats && reauthEmail) {
      setEmail(String(reauthEmail).trim());
      setActiveTab('login');
    }
  }, [route?.params?.reauthForChats, route?.params?.reauthEmail, route?.params?.prefilledEmail]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const savedRemember = await safeGetItem(REMEMBER_ME_KEY);
      const shouldRemember = savedRemember === 'true';
      const savedEmail =
        (await safeSecureGetItem(REMEMBER_EMAIL_SECURE_KEY, REMEMBER_EMAIL_SECURE_KEY_LEGACY)) ||
        (await safeGetItem(REMEMBER_EMAIL_KEY));
      const savedPassword = await safeSecureGetItem(
        REMEMBER_PASSWORD_SECURE_KEY,
        REMEMBER_PASSWORD_SECURE_KEY_LEGACY,
      );
      const rawDraft = await safeGetItem(AUTH_FORM_DRAFT_KEY);
      const draftPassword = await safeSecureGetItem(
        AUTH_DRAFT_PASSWORD_SECURE_KEY,
        AUTH_DRAFT_PASSWORD_SECURE_KEY_LEGACY,
      );
      let draft = null;
      try {
        if (rawDraft) draft = JSON.parse(rawDraft);
      } catch (e) { if (__DEV__) console.warn('[ThirdPage] swallowed:', e?.message); }
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
      /** Вибір країни — лише одразу після нової реєстрації; повторний вхід без повторного екрану. */
      if (isNewUser) {
        const appTheme = await getAppTheme();
        navigation?.navigate?.('SelectCountry', { user, language, appTheme });
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

  // Якщо сесія вже є (cold start / повернулись на ThirdPage) — не показуємо вхід/реєстрацію знову.
  const skippedAuthRedirectRef = useRef(false);
  useEffect(() => {
    if (skippedAuthRedirectRef.current) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const hydrate = useAuthStore.getState().hydrate;
        if (typeof hydrate === 'function') await hydrate();
        if (cancelled) return;
        const authUser = useAuthStore.getState().user;
        const session = await getSession();
        const user = session?.user || authUser;
        if (!user?.id && !user?.email) return;
        skippedAuthRedirectRef.current = true;
        await navigateAfterAuth(user, false);
      } catch {
        /* залишаємо форму входу */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigateAfterAuth]);

  const closeAdminPinModal = useCallback(() => {
    setAdminPinModalOpen(false);
    setAdminPinInput('');
    adminGatePasswordRef.current = '';
  }, []);

  const showAlertAfterPinModalDismiss = useCallback((title, body, buttons) => {
    closeAdminPinModal();
    runAfterInteractions(() => {
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
              .then((info) => applySocialLoginSuccess('google', info, idToken))
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
        .then((info) => applySocialLoginSuccess('google', info, idToken))
        .catch(() => {});
    }
  }, [googleResponse, navigateAfterAuth]);

  const contentWidth = Math.min(r.width - r.horizontalPadding * 2, DESIGN_CONTENT_WIDTH);
  const contentHorizontalPadding = Math.max(r.horizontalPadding, (r.width - DESIGN_CONTENT_WIDTH) / 2);
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

  const authTabSwipePanHandlers = useAuthTabSwipePanHandlers(activeTab, switchAuthTab);

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


  const applySocialLoginSuccess = async (provider, googleUserData, idTokenHint) => {
    setLoginError(null);
    if (provider !== 'google' || !googleUserData) return;
    try {
      const hintedToken = String(idTokenHint || '').trim();
      if (hintedToken) {
        const { user, isNewUser } = await signInWithGoogleIdToken(hintedToken);
        await saveSession(user);
        await syncBackendSessionAfterGoogleIdToken(hintedToken, user);
        await clearAuthFormDraft();
        const s = await getSession();
        await navigateAfterAuth(s?.user || user, isNewUser);
        return;
      }
      const { user, isNewUser } = await loginOrRegisterGoogle({
        email: googleUserData.email || '',
        name: googleUserData.name || googleUserData.givenName || '',
        googleId: googleUserData.id || googleUserData.sub || '',
        avatar: googleUserData.photo || googleUserData.picture || null,
      });
      await saveSession(user);
      await ensureBackendSession(user);
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
      // Завжди (незалежно від «Запамʼятати мене») зберігаємо дані для тихого відновлення чатів.
      await persistSessionRecoveryCredentials(trimmedEmail, trimmedPassword);
      await mergeBackendUserIntoLocalSession();
      await clearAuthFormDraft();
      const uBackend = useAuthStore.getState().user || authUser || { email: trimmedEmail };
      await navigateAfterAuth(uBackend, false);
      return true;
    } catch (err) {
      const code =
        err instanceof ApiError
          ? err.payload?.error || err.message || ''
          : err?.message || '';
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

  const handleGoogleLogin = async () => {
    if (googlePromptInProgressRef.current) return;
    googlePromptInProgressRef.current = true;
    setLoginError(null);
    try {
      if (!hasGoogleConfig) {
        Alert.alert('', thirdPageUi(language, 'signInFailedBody'));
        return;
      }
      const GoogleSignin = GoogleSigninNative?.GoogleSignin;
      if (GoogleSignin) {
        try {
          if (Platform.OS === 'android') {
            await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
          }
          const result = await GoogleSignin.signIn();
          const idToken = result?.data?.idToken || result?.idToken;
          if (!idToken) {
            throw new Error('MISSING_GOOGLE_ID_TOKEN');
          }
          const { user, isNewUser } = await signInWithGoogleIdToken(idToken);
          await saveSession(user);
          await syncBackendSessionAfterGoogleIdToken(idToken, user);
          const s = await getSession();
          const uNav = s?.user || user;
          await clearAuthFormDraft();
          await navigateAfterAuth(uNav, isNewUser);
          return;
        } catch (nativeErr) {
          const code = nativeErr?.code || nativeErr?.message || '';
          if (code === 'SIGN_IN_CANCELLED' || code === '12501' || code === 'ERR_REQUEST_CANCELED') return;
          if (__DEV__) console.warn('[Google native]', nativeErr?.message || nativeErr);
          if (Platform.OS === 'ios') {
            Alert.alert('', thirdPageUi(language, 'signInFailedBody'));
            return;
          }
        }
      }
      if (googlePromptAsync && googleRequestRef.current) {
        await googlePromptAsync();
        return;
      }
      Alert.alert('', thirdPageUi(language, 'signInFailedBody'));
    } catch (err) {
      const code = err?.code || err?.message || '';
      if (code === 'SIGN_IN_CANCELLED' || code === '12501' || code === 'ERR_REQUEST_CANCELED') return;
      if (__DEV__) console.warn('[Google OAuth]', err?.message || err);
      Alert.alert('', thirdPageUi(language, 'signInFailedBody'));
    } finally {
      googlePromptInProgressRef.current = false;
    }
  };

  const handleAppleLogin = async () => {
    if (Platform.OS !== 'ios') {
      Alert.alert('', thirdPageUi(language, 'signInFailedBody'));
      return;
    }
    setLoginError(null);
    try {
      const AppleAuthentication = require('expo-apple-authentication');
      const available = await AppleAuthentication.isAvailableAsync();
      if (!available) {
        Alert.alert('', thirdPageUi(language, 'signInFailedBody'));
        return;
      }
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        Alert.alert('', thirdPageUi(language, 'signInFailedBody'));
        return;
      }
      let fullName = null;
      if (credential.fullName) {
        const p = credential.fullName;
        const parts = [p.givenName, p.familyName].filter(Boolean);
        fullName = parts.length ? parts.join(' ') : null;
      }
      const { user, isNewUser } = await signInWithAppleFirebase(credential.identityToken, undefined, {
        fullName,
        email: credential.email || '',
      });
      await saveSession(user);
      await syncBackendSessionAfterAppleIdentityToken(credential.identityToken, fullName, user);
      await clearAuthFormDraft();
      await navigateAfterAuth(user, isNewUser);
    } catch (err) {
      const code = err?.code || '';
      if (code === 'ERR_REQUEST_CANCELED') return;
      if (__DEV__) console.warn('[Apple OAuth]', err?.message || err);
      Alert.alert('', thirdPageUi(language, 'signInFailedBody'));
    }
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
      for (let attempt = 0; attempt < 4 && !registered; attempt += 1) {
        const username = deriveBackendUsername(trimmedName, trimmedEmail);
        try {
          await registerWithPassword(trimmedEmail, trimmedPassword, trimmedName, username);
          registered = true;
        } catch (regErr) {
          if (
            regErr instanceof ApiError &&
            regErr.payload?.error === 'username_taken' &&
            attempt < 3
          ) {
            continue;
          }
          throw regErr;
        }
      }
      await clearAuthFormDraft();
      // Завжди зберігаємо дані для тихого відновлення чатів після реєстрації.
      await persistSessionRecoveryCredentials(trimmedEmail, trimmedPassword);
      await mergeBackendUserIntoLocalSession();
      const uBackend = useAuthStore.getState().user || authUser || { email: trimmedEmail };
      await navigateAfterAuth(uBackend, true);
      return true;
    } catch (err) {
      const code =
        err instanceof ApiError
          ? err.payload?.error || err.message || ''
          : err?.message || '';
      const mapped = authOverlayFromErrorCode(language, code);
      if (mapped) {
        const isEmailTaken =
          code === 'EMAIL_EXISTS' || code === 'email_taken' || code === 'email_exists';
        setLoginError(isEmailTaken ? texts.errorEmailExists ?? mapped.body : mapped.body);
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
    setForgotPasswordVisible(false);
    setForgotFieldError(null);
    setForgotDelivery(null);
    setForgotSuggestRegister(false);
    setForgotSending(false);
    setForgotDisplayCode('');
    setForgotCodeVerifying(false);
    setForgotPasswordSubmitting(false);
  };

  const closeForgotModal = useCallback(() => {
    setFocusedForgotField(null);
    setShowForgotModal(false);
    setForgotFieldError(null);
    setForgotSuggestRegister(false);
    setForgotSending(false);
    setForgotDisplayCode('');
    setForgotCodeVerifying(false);
    setForgotPasswordVisible(false);
    setForgotPasswordSubmitting(false);
  }, []);

  const dismissForgotKeyboard = useCallback(() => {
    Keyboard.dismiss();
    forgotEmailInputRef.current?.blur();
    forgotCodeInputRef.current?.blur();
    forgotNewPassInputRef.current?.blur();
    forgotConfirmPassInputRef.current?.blur();
    setFocusedForgotField(null);
  }, []);

  const handleForgotBack = useCallback(() => {
    if (forgotStep === 'newpassword') {
      setForgotStep('code');
      setForgotFieldError(null);
      setForgotPasswordSubmitting(false);
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
  }, [forgotStep, closeForgotModal]);

  const handleForgotBackRef = useRef(handleForgotBack);
  useEffect(() => {
    handleForgotBackRef.current = handleForgotBack;
  }, [handleForgotBack]);

  const forgotModalPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) => evt.nativeEvent.pageX <= 40,
        onStartShouldSetPanResponderCapture: (evt) => evt.nativeEvent.pageX <= 40,
        onMoveShouldSetPanResponder: (_, g) =>
          g.dx > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
        onMoveShouldSetPanResponderCapture: (_, g) =>
          g.dx > 22 && Math.abs(g.dx) > Math.abs(g.dy) * 1.75,
        onPanResponderTerminationRequest: () => true,
        onPanResponderRelease: (_, g) => {
          if (g.dx > 44 || (g.dx > 28 && g.vx > 0.28)) {
            handleForgotBackRef.current();
          }
        },
      }),
    [],
  );

  useEffect(() => {
    if (!showForgotModal) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleForgotBackRef.current();
      return true;
    });
    return () => sub.remove();
  }, [showForgotModal]);

  useEffect(() => {
    if (!showForgotModal || forgotStep !== 'code') return undefined;
    const timer = setTimeout(() => {
      forgotCodeInputRef.current?.focus();
    }, 320);
    return () => clearTimeout(timer);
  }, [showForgotModal, forgotStep]);

  const handleForgotStepPillPress = useCallback(
    (index) => {
      const currentIndex =
        forgotStep === 'input' || forgotStep === 'no_profile' ? 0 : forgotStep === 'code' ? 1 : 2;
      if (index >= currentIndex) return;
      setForgotFieldError(null);
      if (index === 0) {
        setForgotStep('input');
        setForgotSuggestRegister(false);
        setForgotDelivery(null);
        setForgotSending(false);
        setForgotDisplayCode('');
        setForgotCodeInput('');
        setForgotCodeVerifying(false);
        setForgotPasswordSubmitting(false);
        return;
      }
      if (index === 1) {
        setForgotStep('code');
        setForgotPasswordSubmitting(false);
      }
    },
    [forgotStep],
  );

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
    const sendStartedAt = Date.now();
    setForgotSending(true);
    try {
      const langBase = String(language || 'en').split('-')[0];
      const result = await requestPasswordResetCode(value, { language: langBase });
      if (!result?.ok && result?.reason === 'NOT_FOUND') {
        setForgotFieldError(texts.forgotEmailNotRegistered ?? texts.forgotNoProfile);
        setForgotSuggestRegister(true);
        return;
      }
      if (!result?.ok && result?.reason === 'NETWORK_ERROR') {
        setForgotFieldError(
          thirdPageUi(language, 'connectionProblemBody') ||
            texts.forgotSendFailed ||
            'Could not reach the server. Check your connection and try again.',
        );
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
    if (forgotPasswordSubmitting) return;
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
    setForgotPasswordSubmitting(true);
    try {
      const ok = await updateUserPassword({
        email: emailTrim,
        newPassword: pass,
        resetCode: forgotCodeInput,
      });
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
    } finally {
      setForgotPasswordSubmitting(false);
    }
  };


  const { height: bgH } = Dimensions.get('window');
  const formLayoutHeight = bgH;
  const authHeroHeightRatio =
    Platform.OS === 'android'
      ? !r.isShortScreen
        ? 0.3
        : r.isVeryShortScreen
          ? 0.24
          : 0.27
      : !r.isShortScreen
        ? 0.26
        : r.isVeryShortScreen
          ? 0.22
          : r.isShortScreen
            ? 0.24
            : AUTH_HERO_HEIGHT_RATIO;
  const authHeroHeight = Math.round(formLayoutHeight * authHeroHeightRatio);
  const authHeroTopInset = Math.max(
    Math.round(r.insets?.top ?? 0),
    Platform.OS === 'android' ? Math.round(RNStatusBar.currentHeight ?? 28) : 0,
  );
  /** iOS: лише візуально нижче; layout форми й нижнього фото без змін. */
  const authHeroExtraDownPx =
    Platform.OS === 'ios'
      ? Math.round(Math.min(62, Math.max(46, formLayoutHeight * 0.034)))
      : 0;
  const authHeroExtraLiftPx =
    Platform.OS === 'android'
      ? -Math.round(Math.min(14, Math.max(8, formLayoutHeight * 0.012)))
      : 0;
  const authHeroRenderHeight =
    Platform.OS === 'ios' ? authHeroHeight + authHeroExtraDownPx : authHeroHeight;
  const authHeroVisualBottom =
    authHeroHeight +
    AUTH_HERO_WAVE_PAD -
    authHeroTopInset +
    Math.max(0, authHeroExtraLiftPx);
  /** Невеликий зазор між хвилястою межею фото і текстом форми (логін / реєстрація). */
  const authPhotoFormGapPx = Math.round(
    Math.min(28, Math.max(18, formLayoutHeight * 0.022)),
  );
  /** Android: форму «Вхід» трохи вище — менший зазор під хвилею. */
  const authAndroidFormLiftPx =
    Platform.OS === 'android'
      ? Math.round(Math.min(36, Math.max(22, formLayoutHeight * 0.028)))
      : 0;
  const authHeroSpacerHeight = Math.max(
    authHeroVisualBottom + 8,
    Math.max(
      Math.round(authHeroHeight * (r.isVeryShortScreen ? 0.58 : r.isShortScreen ? 0.62 : 0.66)),
      authHeroVisualBottom + authPhotoFormGapPx,
    ) - authAndroidFormLiftPx,
  );
  /** Нижнє фото під соцкнопками — у потоці після Google/Facebook/Apple, до низу екрана. */
  const authFooterBottomBleedPx = Math.max(r.insets?.bottom ?? 0, 0);
  const authFooterHeroMinHeight = Math.round(
    formLayoutHeight * (r.isShortScreen ? 0.22 : 0.26),
  );
  const authFooterHeroMarginTopPx = Math.round(
    Math.max(18, formLayoutHeight * 0.024),
  );
  const authScrollViewportMinHeight = Math.max(
    0,
    formLayoutHeight -
      authHeroSpacerHeight -
      (Platform.OS === 'android' ? r.bottomPadding : 0),
  );
  const formGap = r.isVeryShortScreen ? 10 : r.isShortScreen ? 12 : AUTH_FORM_GAP;
  const registerFormGap = r.isVeryShortScreen ? 6 : 8;
  const activeFormGap = activeTab === 'register' ? registerFormGap : formGap;
  const activeTitleMarginTop = r.isShortScreen ? 2 : 4;
  const activeScrollPaddingTop =
    Math.round(Math.max(16, formLayoutHeight * 0.02)) +
    authPhotoFormGapPx -
    (Platform.OS === 'android' ? Math.round(authAndroidFormLiftPx * 0.4) : 0);
  const authScrollMinHeight = authScrollViewportMinHeight;
  const authFooterHeroBodyHeight = Math.max(
    80,
    authFooterHeroMinHeight - AUTH_HERO_WAVE_PAD - authFooterBottomBleedPx,
  );
  const forgotModalMaxWidth = Math.min(r.width - 32, 400);
  const backgroundImageSource =
    activeTab === 'register'
      ? require('./assets/auth-register-hero.webp')
      : require('./assets/auth-login-hero.webp');
  const authFooterImageSource =
    activeTab === 'register'
      ? require('./assets/auth-register-footer-hero.webp')
      : require('./assets/auth-login-footer-hero.webp');
  /** Лише зсув кадру фото вгорі на вході — хвиля й layout без змін. */
  const authLoginTopHeroImageNudgeUpPx = Math.round(
    Platform.OS === 'android'
      ? Math.min(140, Math.max(92, formLayoutHeight * 0.092))
      : Math.min(168, Math.max(108, formLayoutHeight * 0.108)),
  );
  const authIosLoginTopHeroImageNudgeDownPx = Math.round(
    Math.min(132, Math.max(116, formLayoutHeight * 0.104)),
  );
  /** iOS + реєстрація: кадр у верхньому фото трохи вище, ніж на вході. */
  const authIosRegisterTopHeroImageNudgeDownPx = Math.round(
    Math.min(72, Math.max(56, formLayoutHeight * 0.052)),
  );
  const authTopHeroImageNudgeY =
    Platform.OS === 'ios'
      ? activeTab === 'register'
        ? authIosRegisterTopHeroImageNudgeDownPx
        : authIosLoginTopHeroImageNudgeDownPx
      : activeTab === 'login'
        ? authLoginTopHeroImageNudgeUpPx
        : 0;
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

  const closeTermsModal = useCallback(() => {
    setShowTermsModal(false);
  }, []);

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

  const forgotStepIndex =
    forgotStep === 'input' || forgotStep === 'no_profile' ? 0 : forgotStep === 'code' ? 1 : 2;

  const renderForgotPrimaryCta = (label, onPress, { busy: ctaBusy = false, disabled = false } = {}) => (
    <Pressable
      disabled={disabled || ctaBusy}
      onPress={() => {
        if (typeof onPress === 'function') {
          void onPress();
        }
      }}
      style={({ pressed }) => [
        styles.authOnboardCtaOuter,
        styles.forgotCtaOuter,
        { width: '100%', opacity: disabled || ctaBusy ? 0.55 : 1 },
        pressed && !disabled && !ctaBusy && { opacity: 0.92 },
      ]}
      android_ripple={rippleOnDarkSurface}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || ctaBusy, busy: ctaBusy }}
    >
      <View style={styles.authOnboardCtaBack} />
      <View style={styles.authOnboardCtaFront}>
        {ctaBusy ? (
          <View style={styles.forgotPrimaryBtnRow}>
            <ActivityIndicator color={TEXT_DARK} size="small" />
            <Text style={styles.authOnboardCtaText}>{label}</Text>
          </View>
        ) : (
          <Text style={styles.authOnboardCtaText}>{label}</Text>
        )}
      </View>
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      {Platform.OS === 'android' ? <StatusBar style="light" translucent /> : null}
      {Platform.OS === 'android' ? (
        <RNStatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      ) : null}
      <Animated.View
        style={[styles.promoEnterWrap, promoEnterStyle]}
        {...authTabSwipePanHandlers}
      >
      <AuthHeroHeader
        source={backgroundImageSource}
        height={authHeroRenderHeight}
        topInset={authHeroTopInset}
        imageNudgeY={authTopHeroImageNudgeY}
        style={[
          styles.authHeroBackdrop,
          authHeroTopInset > 0 || authHeroExtraDownPx > 0
            ? {
                top:
                  -authHeroTopInset -
                  (Platform.OS === 'ios' ? authHeroExtraDownPx : 0),
              }
            : null,
          Platform.OS === 'ios' && authHeroExtraDownPx !== 0
            ? { transform: [{ translateY: authHeroExtraDownPx }] }
            : null,
          Platform.OS === 'android' && authHeroExtraLiftPx !== 0
            ? { transform: [{ translateY: authHeroExtraLiftPx }] }
            : null,
        ]}
      />
      <View style={{ height: authHeroSpacerHeight }} pointerEvents="none" />

      <View
        style={[
          styles.contentOverlay,
          {
            paddingTop: 0,
            paddingBottom: 0,
          },
        ]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardWrap}
          keyboardVerticalOffset={Platform.OS === 'ios' ? r.insets.top : 0}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingHorizontal: contentHorizontalPadding,
                paddingTop: activeScrollPaddingTop,
                paddingBottom: 0,
                flexGrow: 1,
                minHeight: authScrollMinHeight,
                justifyContent: 'flex-start',
              },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            scrollEnabled
            bounces
            alwaysBounceVertical={false}
            overScrollMode="never"
            nestedScrollEnabled
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
            keyboardDismissMode="on-drag"
          >
            <View
              style={[styles.content, { width: contentWidth, maxWidth: DESIGN_CONTENT_WIDTH, marginTop: formOffsetTop }]}
            >
              <FittingText
                style={[
                  styles.title,
                  styles.loginFormTitleCompact,
                  activeTab === 'register' && styles.registerFormTitleCompact,
                  Platform.OS === 'android' && styles.loginFormTitleAndroid,
                  Platform.OS === 'ios' && styles.loginFormTitleIos,
                  { marginTop: activeTitleMarginTop },
                ]}
                numberOfLines={2}
                minimumFontScale={0.72}
              >
                {activeTab === 'register' ? texts.registerTitle : texts.title}
              </FittingText>

              <AuthTabSwitcher
                activeTab={activeTab}
                onChange={switchAuthTab}
                loginLabel={texts.loginTab}
                registerLabel={texts.registerTab}
                style={{ marginTop: 4, marginBottom: activeFormGap + 4 }}
              />

              <View
                style={[
                  styles.inputWrap,
                  styles.loginFormInputWrapCompact,
                  activeTab === 'register' && styles.registerFormInputWrap,
                  { marginBottom: registerPasswordInlineText ? 0 : activeFormGap, gap: activeTab === 'register' ? 8 : 10 },
                ]}
              >
                {}
                <View
                  collapsable={false}
                  style={[
                    styles.authFieldRow,
                    activeTab === 'register' && styles.authFieldRowCompact,
                    activeTab !== 'register' && styles.authFieldRowHidden,
                    activeTab === 'register' &&
                      focusedAuthField === 'name' &&
                      styles.authFieldRowFocused,
                  ]}
                >
                  <AuthFieldLeadingIcon name="person-outline" />
                  <TextInput
                    ref={nameInputRef}
                    editable={activeTab === 'register'}
                    style={[styles.authTextInput, { fontSize: AUTH_INPUT_FONT_SIZE }]}
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
                    activeTab === 'register' && styles.authFieldRowCompact,
                    focusedAuthField === 'email' && styles.authFieldRowFocused,
                  ]}
                >
                  <AuthFieldLeadingIcon name="mail-outline" />
                  <TextInput
                    ref={emailInputRef}
                    style={[styles.authTextInput, { fontSize: AUTH_INPUT_FONT_SIZE }]}
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
                    activeTab === 'register' && styles.authFieldRowCompact,
                    focusedAuthField === 'password' && styles.authFieldRowFocused,
                  ]}
                >
                  <AuthFieldLeadingIcon name="lock-closed-outline" />
                  <TextInput
                    ref={passwordInputRef}
                    style={[styles.authTextInput, { fontSize: AUTH_INPUT_FONT_SIZE }]}
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
                    activeTab === 'register' && styles.authFieldRowCompact,
                    activeTab !== 'register' && styles.authFieldRowHidden,
                    activeTab === 'register' &&
                      focusedAuthField === 'confirm' &&
                      styles.authFieldRowFocused,
                  ]}
                >
                  <AuthFieldLeadingIcon name="lock-closed-outline" />
                  <TextInput
                    ref={confirmPasswordInputRef}
                    editable={activeTab === 'register'}
                    style={[styles.authTextInput, { fontSize: AUTH_INPUT_FONT_SIZE }]}
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
                    <FittingText style={styles.checkboxLabel} minimumFontScale={0.68}>
                      {texts.rememberMe}
                    </FittingText>
                  </Pressable>
                  <Pressable
                    style={styles.forgotWrap}
                    hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                    android_ripple={noAndroidRipple}
                    accessibilityRole="link"
                    onPress={openForgotModal}
                  >
                    <FittingText style={styles.forgotText} minimumFontScale={0.72}>
                      {texts.forgotPassword}
                    </FittingText>
                  </Pressable>
                </View>
              ) : (
                <View style={[styles.termsRow, styles.registerTermsRow]}>
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
                      <FittingText
                        style={[styles.checkboxLabel, styles.termsAgreeText]}
                        minimumFontScale={0.68}
                      >
                        {thirdPageUi(language, 'agreePrefix')}
                      </FittingText>
                      <Pressable
                        onPress={() => setShowTermsModal(true)}
                        android_ripple={rippleOnDarkSurface}
                        accessibilityRole="link"
                        hitSlop={4}
                        style={styles.termsLinkPressable}
                      >
                        <FittingText style={styles.termsInlineLink} minimumFontScale={0.68}>
                          {thirdPageUi(language, 'termsLink')}
                        </FittingText>
                      </Pressable>
                    </View>
                  </Pressable>
                </View>
              )}

              <View style={[styles.primarySubmitWrap, activeTab === 'register' && styles.registerPrimarySubmitWrap]} importantForAccessibility="yes">
                <Pressable
                  disabled={authSlideSubmitting}
                  onPress={() => void performAuthFullscreenRef.current({ skipSyncCheck: false })}
                  onPressIn={onAuthSubmitCtaPressIn}
                  onPressOut={onAuthSubmitCtaPressOut}
                  style={[
                    styles.authOnboardCtaOuter,
                    activeTab === 'register' && styles.registerAuthOnboardCtaOuter,
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

              <View style={[styles.dividerWrap, activeTab === 'register' && styles.registerDividerWrap]}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>
                  {activeTab === 'register' ? texts.orRegisterWith : texts.orLoginWith}
                </Text>
                <View style={styles.dividerLine} />
              </View>

              <View
                style={[
                  styles.socialRow,
                  activeTab === 'register' && styles.registerSocialRow,
                  Platform.OS === 'ios' && socialProviderCount >= 3 ? styles.socialRowIosGrouped : null,
                  useAndroidGoogleFullWidth
                    ? styles.socialRowFullWidth
                    : useWideSocialButtons
                      ? styles.socialRowTwoButtons
                      : styles.socialRowSingle,
                  { marginBottom: r.isShortScreen ? 8 : 0 },
                ]}
              >
                <Pressable
                  style={[
                    styles.socialButton,
                    useAndroidGoogleFullWidth
                      ? styles.socialButtonFullWidth
                      : useWideSocialButtons
                        ? styles.socialButtonWide
                        : styles.socialButtonCompact,
                  ]}
                  onPress={() => void handleGoogleLogin()}
                  android_ripple={rippleOnLightSurface}
                  accessibilityRole="button"
                  accessibilityLabel={activeTab === 'login' ? texts.loginWithGoogle : texts.registerWithGoogle}
                >
                  {useAndroidGoogleFullWidth ? (
                    <View style={styles.socialButtonContent}>
                      <Image
                        source={require('./assets/google.png')}
                        style={styles.socialIconImage}
                        resizeMode="contain"
                      />
                      <Text style={styles.socialButtonLabel}>
                        {activeTab === 'login' ? texts.loginWithGoogle : texts.registerWithGoogle}
                      </Text>
                    </View>
                  ) : (
                    <Image
                      source={require('./assets/google.png')}
                      style={styles.socialIconImage}
                      resizeMode="contain"
                    />
                  )}
                </Pressable>
                {showAppleLogin ? (
                  <Pressable
                    style={[
                      styles.socialButton,
                      useWideSocialButtons ? styles.socialButtonWide : styles.socialButtonCompact,
                    ]}
                    onPress={() => void handleAppleLogin()}
                    android_ripple={rippleOnLightSurface}
                    accessibilityRole="button"
                    accessibilityLabel={
                      activeTab === 'login' ? texts.loginWithApple : texts.registerWithApple
                    }
                  >
                    <Ionicons name="logo-apple" size={22} color="#000000" />
                  </Pressable>
                ) : null}
              </View>
            </View>

            <View
              style={[
                styles.authFooterHeroFlow,
                {
                  marginTop: authFooterHeroMarginTopPx,
                  marginHorizontal: -contentHorizontalPadding,
                  minHeight: authFooterHeroMinHeight,
                },
              ]}
              pointerEvents="none"
            >
              <AuthHeroHeader
                source={authFooterImageSource}
                height={authFooterHeroBodyHeight}
                waveEdge="top"
                bottomBleedPx={authFooterBottomBleedPx}
                style={{ width: r.width }}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
      </Animated.View>

      <Modal visible={showForgotModal} animationType="slide" statusBarTranslucent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.forgotModalKeyboardRoot}
          keyboardVerticalOffset={Platform.OS === 'ios' ? r.insets.top : 0}
          {...forgotModalPanResponder.panHandlers}
        >
          <Pressable style={styles.forgotModalOverlay} onPress={dismissForgotKeyboard}>
            <View
              style={[
                styles.forgotModalBox,
                {
                  paddingTop: r.insets.top + (r.isShortScreen ? 6 : 10),
                  paddingBottom: Math.max(r.insets.bottom + 12, 18),
                  maxWidth: forgotModalMaxWidth,
                },
              ]}
            >
              <Pressable
                onPress={handleForgotBack}
                hitSlop={12}
                android_ripple={rippleOnDarkSurface}
                style={[styles.forgotModalBackBtn, { top: r.insets.top + 8 }]}
                accessibilityRole="button"
                accessibilityLabel={thirdPageUi(language, 'back')}
              >
                <Ionicons name="chevron-back" size={24} color={ACCENT} />
              </Pressable>

              <ScrollView
                style={styles.forgotModalScroll}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
                bounces
                scrollEnabled
                nestedScrollEnabled
                automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
                contentContainerStyle={[
                  styles.forgotModalScrollContent,
                  {
                    minHeight: Math.max(0, r.height - r.insets.top - r.insets.bottom - 16),
                    paddingTop: r.insets.top + 32,
                    paddingBottom: Math.max(r.insets.bottom + 32, 28),
                  },
                ]}
              >
                <Pressable
                  style={styles.forgotModalScrollPressDismiss}
                  onPress={dismissForgotKeyboard}
                  accessible={false}
                >
                <View style={[styles.forgotModalInner, { maxWidth: forgotModalMaxWidth - 44 }]}>
                  <View style={styles.forgotHero}>
                    <ForgotPasswordLockAnimation />
                  </View>
                  <Text style={styles.forgotStepCounter}>
                    {forgotStepIndex + 1}/{forgotStepItems.length} · {forgotStepItems[forgotStepIndex]?.label}
                  </Text>
                  <FittingText style={styles.forgotModalTitle} numberOfLines={2} minimumFontScale={0.72}>
                    {texts.forgotTitle}
                  </FittingText>
                  {forgotSubtitle ? <Text style={styles.forgotModalSubtitle}>{forgotSubtitle}</Text> : null}

                  <View style={styles.forgotModalBody}>
              {forgotStep === 'input' && (
                <>
                  <View style={styles.forgotModalFieldsWrap}>
                    <View
                      collapsable={false}
                      style={[
                        styles.forgotFieldRow,
                        focusedForgotField === 'forgotEmail' && styles.forgotFieldRowFocused,
                        forgotSending && styles.forgotFieldRowDisabled,
                      ]}
                    >
                      <ForgotPasswordFieldIcon
                        name="mail-outline"
                        focused={focusedForgotField === 'forgotEmail'}
                      />
                      <TextInput
                        ref={forgotEmailInputRef}
                        style={[styles.forgotFieldInput, { fontSize: AUTH_INPUT_FONT_SIZE }]}
                        value={forgotInput}
                        editable={!forgotSending}
                        onChangeText={(t) => {
                          setForgotFieldError(null);
                          setForgotSuggestRegister(false);
                          setForgotInput(t);
                        }}
                        placeholder={texts.emailPlaceholder}
                        placeholderTextColor="rgba(255,255,255,0.34)"
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
                  {renderForgotPrimaryCta(
                    forgotSending ? texts.forgotSendingEmail : texts.forgotSendCode,
                    sendForgotCode,
                    { busy: forgotSending, disabled: forgotSending },
                  )}
                </>
              )}

              {forgotStep === 'code' && (
                <>
                  {forgotDelivery !== 'email' && forgotDisplayCode ? (
                    <View style={styles.forgotInAppCodeBox}>
                      <Text style={[styles.forgotInAppCodeTitle, { fontSize: r.hintFontSize + 1 }]}>
                        {texts.forgotYourCodeTitle}
                      </Text>
                      <Text style={styles.forgotInAppCodeValue}>{forgotDisplayCode}</Text>
                      <Text style={[styles.forgotInAppCodeHint, { fontSize: r.hintFontSize }]}>
                        {texts.forgotYourCodeHint}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.forgotOtpWrap}>
                    <ForgotPasswordOtpInput
                      inputRef={forgotCodeInputRef}
                      value={forgotCodeInput}
                      focused={focusedForgotField === 'forgotCode'}
                      digitFontSize={r.isShortScreen ? 22 : 24}
                      boxHeight={r.isShortScreen ? 52 : 56}
                      onChangeText={(t) => {
                        setForgotFieldError(null);
                        setForgotCodeInput(t);
                      }}
                      onSubmitEditing={confirmForgotCode}
                      onFocus={() => setFocusedForgotField('forgotCode')}
                      onBlur={() => setFocusedForgotField((k) => (k === 'forgotCode' ? null : k))}
                    />
                  </View>
                  {forgotFieldError ? (
                    <Text
                      style={[styles.forgotModalFieldError, { fontSize: r.hintFontSize }]}
                      accessibilityLiveRegion="polite"
                    >
                      {forgotFieldError}
                    </Text>
                  ) : null}
                  {renderForgotPrimaryCta(
                    forgotCodeVerifying ? texts.forgotSendingEmail : texts.forgotCodeContinue,
                    confirmForgotCode,
                    { busy: forgotCodeVerifying, disabled: forgotCodeVerifying },
                  )}
                  <Pressable
                    onPress={() => void sendForgotCode()}
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
                  {renderForgotPrimaryCta(texts.forgotCreateProfile, () => {
                    closeForgotModal();
                    setActiveTab('register');
                  })}
                  <Pressable onPress={() => setForgotStep('input')} style={styles.forgotGhostBtn} android_ripple={rippleOnDarkSurface}>
                    <Text style={styles.forgotBackText}>← {thirdPageUi(language, 'back')}</Text>
                  </Pressable>
                </>
              )}

              {forgotStep === 'newpassword' && (
                <>
                  <View style={styles.forgotModalFieldsWrap}>
                    <View
                      collapsable={false}
                      style={[
                        styles.forgotFieldRow,
                        focusedForgotField === 'forgotNew' && styles.forgotFieldRowFocused,
                      ]}
                    >
                      <ForgotPasswordFieldIcon
                        name="lock-closed-outline"
                        focused={focusedForgotField === 'forgotNew'}
                      />
                      <TextInput
                        ref={forgotNewPassInputRef}
                        style={[styles.forgotFieldInput, { fontSize: AUTH_INPUT_FONT_SIZE }]}
                        value={forgotNewPass}
                        onChangeText={setForgotNewPass}
                        placeholder={texts.forgotNewPassword}
                        placeholderTextColor="rgba(255,255,255,0.34)"
                        secureTextEntry={!forgotPasswordVisible}
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
                      <Pressable
                        onPress={() => setForgotPasswordVisible((v) => !v)}
                        style={styles.forgotFieldEyeButton}
                        android_ripple={rippleOnDarkSurface}
                        accessibilityLabel={forgotPasswordVisible ? texts.hidePassword : texts.showPassword}
                      >
                        <Image
                          source={
                            forgotPasswordVisible
                              ? require('./assets/Vector-3.png')
                              : require('./assets/Vector.png')
                          }
                          style={[styles.eyeButtonIcon, { tintColor: forgotPasswordVisible ? ACCENT : '#B0B0B0' }]}
                          resizeMode="contain"
                        />
                      </Pressable>
                    </View>
                    <View
                      collapsable={false}
                      style={[
                        styles.forgotFieldRow,
                        focusedForgotField === 'forgotConfirm' && styles.forgotFieldRowFocused,
                      ]}
                    >
                      <ForgotPasswordFieldIcon
                        name="lock-closed-outline"
                        focused={focusedForgotField === 'forgotConfirm'}
                      />
                      <TextInput
                        ref={forgotConfirmPassInputRef}
                        style={[styles.forgotFieldInput, { fontSize: AUTH_INPUT_FONT_SIZE }]}
                        value={forgotNewPassConfirm}
                        onChangeText={setForgotNewPassConfirm}
                        placeholder={texts.forgotConfirmPassword}
                        placeholderTextColor="rgba(255,255,255,0.34)"
                        secureTextEntry={!forgotPasswordVisible}
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
                  {renderForgotPrimaryCta(texts.forgotChangePassword, submitNewPassword, {
                    busy: forgotPasswordSubmitting,
                    disabled: forgotPasswordSubmitting,
                  })}
                </>
              )}
                </View>
                </View>
                </Pressable>
              </ScrollView>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <TermsOfUseSheetModal
        visible={showTermsModal}
        onClose={closeTermsModal}
        title={texts.termsTitle}
        content={termsContent}
        backAccessibilityLabel={thirdPageUi(language, 'back')}
      />

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
              <FittingText style={styles.forgotModalTitle} numberOfLines={2} minimumFontScale={0.72}>
                {thirdPageUi(language, 'adminPinTitle')}
              </FittingText>
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
                  style={[styles.authTextInput, { fontSize: AUTH_INPUT_FONT_SIZE }]}
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
    overflow: 'visible',
    backgroundColor: BG_DARK,
  },
  promoEnterWrap: {
    flex: 1,
    width: '100%',
  },
  authHeroBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  authFooterHeroFlow: {
    width: '100%',
    alignItems: 'center',
    overflow: 'visible',
  },
  contentOverlay: {
    flex: 1,
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
    paddingTop: 0,
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
    minHeight: 38,
    padding: 3,
    borderRadius: 9,
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
    marginTop: Platform.OS === 'ios' ? 0 : AUTH_FORM_GAP,
    marginBottom: Platform.OS === 'ios' ? 10 : AUTH_FORM_GAP,
  },
  registerFormTitleCompact: {
    marginTop: 0,
    marginBottom: Platform.OS === 'ios' ? 8 : 9,
  },
  loginFormTitleAndroid: {
    marginBottom: 10,
  },
  loginFormTitleIos: {
    fontSize: AUTH_IOS_TITLE_FONT_SIZE,
    lineHeight: AUTH_IOS_TITLE_LINE_HEIGHT,
    height: undefined,
    minHeight: AUTH_IOS_TITLE_LINE_HEIGHT,
    marginBottom: 10,
  },
  registerFormInputWrap: {
    marginTop: 0,
  },
  authFieldRowCompact: {
    minHeight: 38,
    paddingVertical: 2,
  },
  registerTermsRow: {
    minHeight: 36,
    marginBottom: 6,
  },
  registerPrimarySubmitWrap: {
    marginBottom: 6,
  },
  registerAuthOnboardCtaOuter: {
    minHeight: 40,
    height: 42,
  },
  registerDividerWrap: {
    minHeight: 24,
    marginBottom: 6,
  },
  registerSocialRow: {
    marginBottom: 3,
  },
  loginFormTabsCompact: {
    marginTop: 0,
    marginBottom: AUTH_FORM_GAP,
    minHeight: 38,
    padding: 3,
  },
  loginFormTabPillCompact: {
    minHeight: 32,
    paddingVertical: 6,
  },
  loginFormInputWrapCompact: {
    marginTop: 0,
    paddingTop: 0,
    gap: 0,
  },
  tabPill: {
    width: '100%',
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: 7,
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
    fontSize: 13,
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
    minHeight: 44,
    height: 46,
    borderRadius: 999,
    borderWidth: 4,
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
    fontSize: 14,
    lineHeight: 17,
    color: '#000000',
    textAlign: 'center',
    ...Platform.select({
      ios: {},
      android: { fontFamily: 'sans-serif-medium' },
    }),
  },
  inputWrap: {
    width: '100%',
    marginTop: 0,
    paddingTop: 0,
    gap: 0,
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
    minHeight: 42,
    backgroundColor: '#1C1C1E',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 10,
    paddingVertical: 3,
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
    paddingVertical: Platform.OS === 'android' ? 6 : 8,
    paddingHorizontal: 4,
    ...(Platform.OS === 'android' ? { fontFamily: 'sans-serif', includeFontPadding: false } : {}),
  },
  eyeButton: {
    padding: 6,
    marginLeft: 2,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 30,
  },
  eyeButtonIcon: {
    width: 15,
    height: 15,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: AUTH_FORM_GAP,
    minHeight: 42,
  },
  termsRow: {
    marginBottom: AUTH_FORM_GAP,
    minHeight: 42,
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
    minWidth: 0,
    minHeight: 32,
    paddingVertical: 4,
    paddingRight: 10,
  },
  checkboxWrapPressed: {
    opacity: 0.85,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderRadius: 5,
    overflow: 'hidden',
    flexShrink: 0,
  },
  checkboxBoxChecked: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  checkboxSquare: {
    width: 20,
    height: 20,
    borderRadius: 5,
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
    fontSize: 14,
    lineHeight: 16,
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
    fontSize: 13,
    color: TEXT_LIGHT,
    backgroundColor: 'transparent',
    opacity: 1,
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    ...(Platform.OS === 'android' ? { fontFamily: 'sans-serif', includeFontPadding: false } : {}),
  },
  termsLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  termsAgreeText: {
    flex: 0,
    flexGrow: 0,
    flexShrink: 1,
  },
  termsLinkPressable: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '58%',
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
    maxWidth: '46%',
    minWidth: 0,
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
    fontSize: 13,
    color: ACCENT,
    backgroundColor: 'transparent',
    opacity: 1,
    ...(Platform.OS === 'android' ? { fontFamily: 'sans-serif', includeFontPadding: false } : {}),
  },
  primaryButtonText: {
    fontSize: 14,
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
    minHeight: 34,
    gap: 10,
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
    fontSize: 13,
    lineHeight: 18,
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
    alignSelf: 'stretch',
    gap: 12,
  },
  socialRowSingle: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  socialRowFullWidth: {
    alignSelf: 'stretch',
    justifyContent: 'center',
  },

  socialRowIosGrouped: {
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 16,
  },
  socialButton: {
    height: 42,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EFF0F6',
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  socialButtonWide: {
    flex: 1,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    maxWidth: (DESIGN_CONTENT_WIDTH - 12) / 2,
    height: 48,
  },
  socialButtonCompact: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 88,
    width: 88,
    maxWidth: 88,
    minWidth: 88,
  },
  socialButtonFullWidth: {
    alignSelf: 'stretch',
    width: '100%',
    height: 48,
    paddingHorizontal: 16,
  },
  socialButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  socialButtonLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
    color: '#1F1F1F',
    ...(Platform.OS === 'android' ? { fontFamily: 'sans-serif-medium', includeFontPadding: false } : {}),
  },
  socialButtonIos: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 88,
    width: 88,
    maxWidth: 88,
    minWidth: 88,
  },
  socialButtonDisabled: {
    opacity: 0.45,
  },
  socialIcon: {
    fontSize: 20,
  },
  socialIconImage: {
    width: 20,
    height: 20,
  },

  socialIconImageApple: {
    width: 13,
    height: 16,
  },
  forgotModalKeyboardRoot: {
    flex: 1,
    backgroundColor: BG_DARK,
  },
  forgotModalOverlay: {
    flex: 1,
    backgroundColor: '#000',
  },
  forgotModalScrollPressDismiss: {
    flexGrow: 1,
    width: '100%',
  },
  forgotModalBox: {
    flex: 1,
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'center',
    backgroundColor: '#000',
    paddingHorizontal: 22,
  },
  forgotStepCounter: {
    ...BRAND_TEXT_FONT,
    fontSize: 12,
    fontWeight: '500',
    color: ACCENT,
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 0.3,
    ...(Platform.OS === 'android' ? { fontFamily: 'sans-serif-medium', includeFontPadding: false } : {}),
  },
  forgotHero: {
    alignItems: 'center',
    marginTop: 22,
    marginBottom: 10,
  },
  forgotInAppCodeBox: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(238, 255, 102, 0.28)',
    backgroundColor: 'rgba(225, 255, 0, 0.06)',
  },
  forgotInAppCodeTitle: {
    ...BRAND_TEXT_FONT,
    color: ACCENT,
    fontWeight: '600',
    marginBottom: 6,
    textAlign: 'center',
  },
  forgotInAppCodeValue: {
    ...BRAND_TEXT_FONT,
    color: LEMON_BRIGHT,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 6,
    marginBottom: 8,
    textAlign: 'center',
  },
  forgotInAppCodeHint: {
    color: 'rgba(255,255,255,0.58)',
    textAlign: 'center',
    lineHeight: 18,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  forgotModalScroll: {
    flex: 1,
    width: '100%',
  },
  forgotModalScrollContent: {
    flexGrow: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  forgotModalInner: {
    width: '100%',
    alignSelf: 'center',
  },
  forgotModalFieldsWrap: {
    width: '100%',
    gap: 12,
    marginTop: 0,
    marginBottom: 8,
  },
  forgotCtaOuter: {
    marginTop: 14,
    marginBottom: 4,
  },
  termsModalBackBtn: {
    position: 'absolute',
    top: 14,
    left: 14,
    zIndex: 20,
    elevation: 20,
    minWidth: 44,
    height: 44,
    borderRadius: 22,
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
  termsDragZone: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 2,
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
    left: 14,
    zIndex: 3,
    minWidth: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  forgotStepPills: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 20,
    flexWrap: 'nowrap',
  },
  forgotStepPill: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  forgotStepPillActive: {
    borderColor: 'rgba(238, 255, 102, 0.35)',
    backgroundColor: 'rgba(238, 255, 102, 0.08)',
  },
  forgotStepPillCurrent: {
    borderColor: ACCENT,
    backgroundColor: 'rgba(225, 255, 0, 0.14)',
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
  forgotStepPillPressed: {
    opacity: 0.82,
  },
  forgotStepPillText: {
    fontSize: 11,
    lineHeight: 14,
    color: '#8A8A8A',
    fontWeight: '700',
    marginBottom: 2,
    ...(Platform.OS === 'android' ? { fontFamily: 'sans-serif-medium', includeFontPadding: false } : {}),
  },
  forgotStepPillTextActive: {
    color: ACCENT,
  },
  forgotStepPillLabel: {
    fontSize: 11,
    lineHeight: 14,
    color: '#8A8A8A',
    textAlign: 'center',
    ...(Platform.OS === 'android' ? { fontFamily: 'sans-serif', includeFontPadding: false } : { ...BRAND_TEXT_FONT }),
  },
  forgotStepPillLabelActive: {
    color: LEMON_BRIGHT,
  },
  forgotStepConnector: {
    width: 14,
    height: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
    flexShrink: 0,
    marginHorizontal: 4,
  },
  forgotStepConnectorActive: {
    backgroundColor: 'rgba(238, 255, 102, 0.45)',
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
    color: ACCENT,
    textAlign: 'center',
    marginBottom: 8,
    width: '100%',
    paddingHorizontal: 28,
  },
  forgotModalSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.58)',
    textAlign: 'center',
    maxWidth: 320,
    paddingHorizontal: 8,
    marginBottom: 24,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  forgotModalBody: {
    width: '100%',
    paddingTop: 0,
    paddingBottom: 0,
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
    flex: 1,
    textAlign: 'left',
    lineHeight: 18,
    color: '#B8B8B8',
    ...(Platform.OS === 'android' ? { fontFamily: 'sans-serif', includeFontPadding: false } : { ...BRAND_TEXT_FONT }),
  },
  forgotInfoBanner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(238, 255, 102, 0.28)',
    backgroundColor: 'rgba(238, 255, 102, 0.08)',
  },
  forgotCodeInput: {
    letterSpacing: 4,
    textAlign: 'center',
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
  forgotOtpWrap: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  forgotFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  forgotFieldRowFocused: {
    borderColor: LEMON_BRIGHT,
    backgroundColor: 'rgba(225, 255, 0, 0.07)',
    ...Platform.select({
      ios: {
        shadowColor: LEMON_BRIGHT,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  forgotFieldRowDisabled: {
    opacity: 0.72,
  },
  forgotFieldInput: {
    flex: 1,
    minWidth: 0,
    ...BRAND_TEXT_FONT,
    fontWeight: '500',
    color: TEXT_LIGHT,
    paddingVertical: Platform.OS === 'android' ? 8 : 10,
    paddingHorizontal: 2,
    ...(Platform.OS === 'android' ? { fontFamily: 'sans-serif-medium', includeFontPadding: false } : {}),
  },
  forgotFieldEyeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
});

export default function ThirdPage({ navigation, route }) {
  if (!AuthSessionModule || !GoogleAuthSessionProvider) {
    return <ThirdPageContent navigation={navigation} route={route} />;
  }
  return <ThirdPageWithGoogleOAuth navigation={navigation} route={route} />;
}

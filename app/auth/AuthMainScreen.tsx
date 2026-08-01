import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInput as RNTextInput,
  View,
  Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { brandFontText } from '../brandFont';
import { noAndroidRipple, rippleOnDarkSurface } from '../androidFeedback';
import { getTermsContentForLanguage } from '../termsContentI18n';
import TermsOfUseSheetModal from '../TermsOfUseSheetModal';
import FittingText from '../FittingText';
import { thirdPageUi } from '../thirdPageUiStrings';
import { useAuthTabSwipePanHandlers } from '../useAuthTabSwipe';
import { useAuthStore } from './authStore';
import { formatAuthError } from './formatError';
import type { AuthStackParamList } from './navigation.types';
import { postForgotPassword } from './endpoints';
import {
  clearFormDraft,
  clearGlobalRememberLogin,
  getPerAccountPassword,
  loadAuthHydration,
  persistGlobalRememberLogin,
  readAccountIndex,
  saveFormDraft,
  upsertSavedAccount,
  type SavedAuthAccount,
} from './authFormPersistence';
import { ApiError } from './types';
import { mergeBackendUserIntoLocalSession, persistSessionRecoveryCredentials } from '../syncBackendSessionBridge';

type Props = NativeStackScreenProps<AuthStackParamList, 'AuthMain'>;

const ACCENT = '#E1FF00';
const BG = '#000000';
const BG_DARK = '#000000';
const BORDER = 'rgba(255, 255, 255, 0.18)';
const TEXT_LIGHT = '#FFFFFF';
const MUTED = 'rgba(255,255,255,0.5)';
const TEXT_DARK = '#1E1E1E';
const INPUT_BG_ROW = 'rgba(225, 255, 0, 0.05)';
const ERROR_COLOR = '#FF6B6B';
const MAX_WIDTH = 335;
const AUTH_PLACEHOLDER = '#8E8E8E';
const LEMON_BRIGHT = '#EEFF66';
const AUTH_FORM_GAP = 13;
const DESIGN_TITLE_FONT_SIZE = 21;
const DESIGN_TITLE_HEIGHT = 26;
const BRAND_TEXT_FONT = brandFontText;
const OPTION_FONT_SIZE = 14;

const ANDROID_ACCENT_TEXT = {
  fontFamily: 'sans-serif-medium',
  color: '#000000',
  includeFontPadding: false,
};

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

const EYE_OPEN = require('../assets/Vector.png');
const EYE_CLOSED = require('../assets/Vector-3.png');

const UI_LANG = 'uk';

function deriveBackendUsername(displayName: string, email: string) {
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
  // Always append a random suffix to avoid username collisions
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${s}_${rnd}`.slice(0, 32);
}

export default function AuthMainScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'login' | 'register'>(route?.params?.tab ?? 'login');
  const switchAuthTab = (next: string) => {
    if (next !== 'login' && next !== 'register') return;
    if (next === tab) return;
    Keyboard.dismiss();
    setTab(next);
  };
  const authTabSwipePanHandlers = useAuthTabSwipePanHandlers(tab, switchAuthTab);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [focusedField, setFocusedField] = useState<'name' | 'email' | 'password' | 'confirm' | null>(null);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [rememberLoaded, setRememberLoaded] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<SavedAuthAccount[]>([]);
  const nameInputRef = useRef<RNTextInput | null>(null);
  const emailInputRef = useRef<RNTextInput | null>(null);
  const passwordInputRef = useRef<RNTextInput | null>(null);
  const confirmPasswordInputRef = useRef<RNTextInput | null>(null);
  const forgotInputRef = useRef<RNTextInput | null>(null);

  const termsContent = useMemo(() => getTermsContentForLanguage(UI_LANG), []);

  const closeTermsModal = useCallback(() => {
    setShowTermsModal(false);
  }, []);

  const busy = useAuthStore((s) => s.busy);
  const loginWithPassword = useAuthStore((s) => s.loginWithPassword);
  const registerWithPassword = useAuthStore((s) => s.registerWithPassword);

  const win = Dimensions.get('window');
  const scr = Dimensions.get('screen');
  const { width } = win;
  const bgWidth = Math.max(win.width, scr.width);
  const bgHeight = Math.max(win.height, scr.height);
  const contentWidth = Math.min(width - 48, MAX_WIDTH);
  const hPad = Math.max(24, (width - MAX_WIDTH) / 2);
  const tabSegmentWidth = Math.max(0, Math.floor((contentWidth - 8 - 6) / 2));

  const mismatchMsg = 'Паролі не збігаються';
  const weakPasswordMsg = 'Пароль: мінімум 8 символів і хоча б одна цифра.';
  const trimmedPwd = password;
  const trimmedConf = confirmPassword;
  const registerPasswordMismatchLive =
    tab === 'register' && trimmedPwd.length > 0 && trimmedConf.length > 0 && trimmedPwd !== trimmedConf;
  const registerPasswordWeakLive =
    tab === 'register' && password.length > 0 && (trimmedPwd.length < 8 || !/\d/.test(trimmedPwd));
  const registerPasswordInlineText =
    tab === 'register' &&
    (registerPasswordMismatchLive || error === mismatchMsg || error === weakPasswordMsg)
      ? registerPasswordMismatchLive || error === mismatchMsg
        ? mismatchMsg
        : weakPasswordMsg
      : null;
  const displayFormError =
    error && !(tab === 'register' && (error === mismatchMsg || error === weakPasswordMsg))
      ? error
      : null;

  useEffect(() => {
    setError(null);
  }, [tab]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const h = await loadAuthHydration();
      const accounts = await readAccountIndex();
      if (cancelled) return;
      setRememberMe(h.rememberMe);
      if (h.rememberMe && h.emailFromRemember) {
        setEmail(h.emailFromRemember);
        if (h.passwordFromRemember) setPassword(h.passwordFromRemember);
      } else if (h.draft && typeof h.draft === 'object') {
        if (h.draft.activeTab === 'login' || h.draft.activeTab === 'register') setTab(h.draft.activeTab);
        if (typeof h.draft.name === 'string') setName(h.draft.name);
        if (typeof h.draft.email === 'string') setEmail(h.draft.email);
        if (typeof h.draft.confirmPassword === 'string') setConfirmPassword(h.draft.confirmPassword);
        if (typeof h.draft.termsAccepted === 'boolean') setTermsAccepted(h.draft.termsAccepted);
        if (h.draftPassword) setPassword(h.draftPassword);
      }
      setSavedAccounts(accounts);
      setRememberLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!rememberLoaded || rememberMe) return;
    void clearGlobalRememberLogin();
  }, [rememberLoaded, rememberMe]);

  useEffect(() => {
    if (!rememberLoaded) return;
    const t = setTimeout(() => {
      void saveFormDraft(
        {
          v: 1,
          activeTab: tab,
          name,
          email,
          confirmPassword,
          termsAccepted,
        },
        password,
      );
    }, 400);
    return () => clearTimeout(t);
  }, [rememberLoaded, tab, name, email, password, confirmPassword, termsAccepted]);

  const pickSavedAccount = async (acc: SavedAuthAccount) => {
    setError(null);
    setEmail(acc.email);
    const pw = acc.hasSavedPassword ? await getPerAccountPassword(acc.email) : null;
    if (pw) {
      setPassword(pw);
      setRememberMe(true);
    }
  };

  const simpleEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const onLogin = async () => {
    setError(null);
    const em = email.trim().toLowerCase();
    if (!em) {
      setError('Введіть email.');
      return;
    }
    if (!simpleEmailRegex.test(em)) {
      setError('Некоректна адреса email.');
      return;
    }
    if (!password) {
      setError('Введіть пароль.');
      return;
    }
    try {
      await loginWithPassword(em, password);
      await persistSessionRecoveryCredentials(em, password);
      await mergeBackendUserIntoLocalSession();
      await upsertSavedAccount(em, password);
      if (rememberMe) await persistGlobalRememberLogin(em, password);
      await clearFormDraft();
      setSavedAccounts(await readAccountIndex());
      navigation.replace('PostAuthHome');
    } catch (e) {
      if (e instanceof ApiError && e.payload.error === 'invalid_credentials') {
        setError('Невірний email або пароль. Спробуйте ще раз або відновіть пароль.');
        return;
      }
      setError(formatAuthError(e));
    }
  };

  const onRegister = async () => {
    setError(null);
    const trimmedName = name.trim();
    const em = email.trim().toLowerCase();
    const pwd = password;
    const conf = confirmPassword;

    if (!trimmedName) {
      setError("Введіть ім'я.");
      return;
    }
    if (!em) {
      setError('Введіть email.');
      return;
    }
    if (!simpleEmailRegex.test(em)) {
      setError('Некоректна адреса email.');
      return;
    }
    if (!pwd) {
      setError('Введіть пароль.');
      return;
    }
    if (pwd.length < 8 || !/\d/.test(pwd)) {
      setError(weakPasswordMsg);
      return;
    }
    if (!conf) {
      setError('Підтвердіть пароль.');
      return;
    }
    if (pwd !== conf) {
      setError(mismatchMsg);
      return;
    }
    if (!termsAccepted) {
      setError('Підтвердіть згоду з умовами користування.');
      return;
    }

    const tryRegister = async (): Promise<void> => {
      await registerWithPassword(em, pwd, trimmedName);
    };
    try {
      await tryRegister();
      await persistSessionRecoveryCredentials(em, pwd);
      await mergeBackendUserIntoLocalSession();
      await upsertSavedAccount(em, pwd);
      await clearFormDraft();
      setSavedAccounts(await readAccountIndex());
      navigation.replace('PostAuthHome');
    } catch (e) {
      if (e instanceof ApiError && e.payload.error === 'email_taken') {
        setTab('login');
        setError('Цей email вже зареєстрований. Увійдіть на вкладці «Увійти».');
        return;
      }
      setError(formatAuthError(e));
    }
  };

  const onForgot = async () => {
    const em = forgotEmail.trim();
    if (!em) {
      setError('Введіть email.');
      return;
    }
    setForgotBusy(true);
    setError(null);
    try {
      await postForgotPassword({ email: em });
      Alert.alert('Готово', 'Якщо акаунт існує — надіслано інструкції для скидання пароля.');
      setForgotMode(false);
      setForgotEmail('');
    } catch (e) {
      setError(formatAuthError(e));
    } finally {
      setForgotBusy(false);
    }
  };

  if (forgotMode) {
    const forgotCardW = Math.min(contentWidth, bgWidth - 40);
    return (
      <LinearGradient
        colors={['#000000', '#0c0c0e', '#050505']}
        locations={[0, 0.45, 1]}
        style={[s.forgotGradient, { width: bgWidth, minHeight: bgHeight }]}
      >
        <View style={[s.forgotSafe, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.kav}>
            <ScrollView
              keyboardShouldPersistTaps="always"
              contentContainerStyle={s.forgotScroll}
              showsVerticalScrollIndicator={false}
            >
              <View style={[s.forgotCard, { width: forgotCardW }]}>
                <View style={s.forgotAccentCap} />
                <FittingText style={s.forgotTitle} numberOfLines={2} minimumFontScale={0.72}>
                  Відновлення пароля
                </FittingText>
                <Text style={s.forgotHint}>Вкажіть email — надішлемо посилання для скидання пароля.</Text>
                <TextInput
                  ref={forgotInputRef}
                  style={s.forgotInput}
                  placeholder="you@example.com"
                  placeholderTextColor={MUTED}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  multiline={false}
                  contextMenuHidden={false}
                  textContentType="emailAddress"
                  autoComplete="email"
                  showSoftInputOnFocus
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                />
                {error ? <Text style={s.error}>{error}</Text> : null}
                <Pressable
                  style={({ pressed }) => [
                    s.forgotPrimary,
                    forgotBusy && s.btnDisabled,
                    pressed && !forgotBusy && { opacity: 0.92 },
                  ]}
                  onPress={onForgot}
                  disabled={forgotBusy}
                >
                  {forgotBusy ? (
                    <ActivityIndicator color={TEXT_DARK} size="small" />
                  ) : (
                    <Text style={s.submitBtnText}>Надіслати</Text>
                  )}
                </Pressable>
                <Pressable
                  style={s.forgotBackBtn}
                  onPress={() => {
                    setForgotMode(false);
                    setError(null);
                  }}
                  hitSlop={12}
                >
                  <Text style={s.forgotBackText}>← Назад до входу</Text>
                </Pressable>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </LinearGradient>
    );
  }

  return (
    <View style={s.screen}>
      <View
        style={[s.overlay, { paddingTop: insets.top, paddingBottom: insets.bottom + 16, flex: 1 }]}
        {...authTabSwipePanHandlers}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.kav}>
          <ScrollView
            style={s.scrollView}
            contentContainerStyle={[
              s.scroll,
              {
                paddingHorizontal: hPad,
                paddingTop: Platform.OS === 'android' ? 90 : 204,
              },
            ]}
            keyboardShouldPersistTaps="always"
            showsVerticalScrollIndicator={false}
            scrollEnabled
            bounces
            alwaysBounceVertical={false}
            overScrollMode="never"
            nestedScrollEnabled
            keyboardDismissMode="on-drag"
          >
            <View style={{ width: contentWidth, alignSelf: 'center' }}>
              <FittingText style={s.formTitle} numberOfLines={2} minimumFontScale={0.72}>
                {tab === 'register' ? 'Реєстрація' : 'Вхід'}
              </FittingText>

              <View style={[s.tabs, s.loginFormTabsCompact]} accessibilityRole="tablist">
                <View style={[s.tabCol, { width: tabSegmentWidth, flexGrow: 0, flexShrink: 0 }]}>
                  <Pressable
                    onPress={() => switchAuthTab('login')}
                    style={({ pressed }) => [s.tabTouchableFill, pressed && s.tabTouchablePressed]}
                    android_ripple={rippleOnDarkSurface}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 2 }}
                    accessibilityRole="tab"
                    accessibilityLabel="Увійти"
                    accessibilityState={{ selected: tab === 'login' }}
                  >
                    <View style={[s.tabPill, tab === 'login' && s.tabPillActive, s.loginFormTabPillCompact]}>
                      <FittingText
                        style={[s.tabText, tab === 'login' && s.tabTextActive]}
                        minimumFontScale={0.7}
                      >
                        Увійти
                      </FittingText>
                    </View>
                  </Pressable>
                </View>
                <View style={s.tabMidGap} pointerEvents="none" />
                <View style={[s.tabCol, { width: tabSegmentWidth, flexGrow: 0, flexShrink: 0 }]}>
                  <Pressable
                    onPress={() => switchAuthTab('register')}
                    style={({ pressed }) => [s.tabTouchableFill, pressed && s.tabTouchablePressed]}
                    android_ripple={rippleOnDarkSurface}
                    hitSlop={{ top: 8, bottom: 8, left: 2, right: 4 }}
                    accessibilityRole="tab"
                    accessibilityLabel="Реєстрація"
                    accessibilityState={{ selected: tab === 'register' }}
                  >
                    <View style={[s.tabPill, tab === 'register' && s.tabPillActive, s.loginFormTabPillCompact]}>
                      <FittingText
                        style={[s.tabText, tab === 'register' && s.tabTextActive]}
                        minimumFontScale={0.7}
                      >
                        Реєстрація
                      </FittingText>
                    </View>
                  </Pressable>
                </View>
              </View>

              {savedAccounts.length > 0 ? (
                <View style={s.savedAccountsBlock}>
                  <Text style={s.savedAccountsLabel}>Нещодавні акаунти</Text>
                  <ScrollView
                    horizontal
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="always"
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.savedAccountsScroll}
                  >
                    {savedAccounts.map((acc) => (
                      <Pressable
                        key={acc.email}
                        onPress={() => void pickSavedAccount(acc)}
                        style={({ pressed }) => [s.savedAccountChip, pressed && { opacity: 0.88 }]}
                        android_ripple={rippleOnDarkSurface}
                      >
                        <Text style={s.savedAccountChipText} numberOfLines={1}>
                          {acc.email}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              <View
                style={[
                  s.inputWrap,
                  s.loginFormInputWrapCompact,
                  { marginBottom: registerPasswordInlineText ? 0 : AUTH_FORM_GAP },
                ]}
              >
                <View
                  collapsable={false}
                  style={[
                    s.authFieldRow,
                    tab !== 'register' && s.authFieldRowHidden,
                    tab === 'register' && focusedField === 'name' && s.authFieldRowFocused,
                  ]}
                >
                  <TextInput
                    ref={nameInputRef}
                    editable={tab === 'register'}
                    style={[s.authTextInput, { fontSize: OPTION_FONT_SIZE }]}
                    value={name}
                    onChangeText={(t) => {
                      setError(null);
                      setName(t);
                    }}
                    placeholder="Ім'я"
                    placeholderTextColor={AUTH_PLACEHOLDER}
                    selectionColor={ACCENT}
                    autoCapitalize="words"
                    autoCorrect
                    spellCheck={false}
                    multiline={false}
                    contextMenuHidden={false}
                    autoComplete={tab === 'register' ? 'name' : 'off'}
                    textContentType="name"
                    importantForAutofill={tab === 'register' ? 'yes' : 'no'}
                    keyboardAppearance="dark"
                    returnKeyType="next"
                    blurOnSubmit={false}
                    enablesReturnKeyAutomatically
                    clearButtonMode="while-editing"
                    showSoftInputOnFocus
                    onPressIn={() => nameInputRef.current?.focus()}
                    onFocus={() => tab === 'register' && setFocusedField('name')}
                    onBlur={() => setFocusedField((k) => (k === 'name' ? null : k))}
                  />
                </View>

                <View
                  collapsable={false}
                  style={[s.authFieldRow, focusedField === 'email' && s.authFieldRowFocused]}
                >
                  <TextInput
                    ref={emailInputRef}
                    editable
                    style={[
                      s.authTextInput,
                      { fontSize: OPTION_FONT_SIZE },
                      Platform.OS === 'android' ? { textAlignVertical: 'center' as const } : null,
                    ]}
                    value={email}
                    onChangeText={(t) => {
                      setError(null);
                      setEmail(t);
                    }}
                    placeholder="Email"
                    placeholderTextColor={AUTH_PLACEHOLDER}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    multiline={false}
                    contextMenuHidden={false}
                    autoComplete={Platform.OS === 'android' ? 'email' : 'email'}
                    textContentType="emailAddress"
                    importantForAutofill={Platform.OS === 'android' ? 'no' : 'yes'}
                    keyboardAppearance="dark"
                    selectionColor={ACCENT}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    enablesReturnKeyAutomatically
                    clearButtonMode="while-editing"
                    showSoftInputOnFocus
                    onPressIn={() => emailInputRef.current?.focus()}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField((k) => (k === 'email' ? null : k))}
                  />
                </View>

                <View
                  collapsable={false}
                  style={[s.authFieldRow, focusedField === 'password' && s.authFieldRowFocused]}
                >
                  <TextInput
                    ref={passwordInputRef}
                    editable
                    style={[
                      s.authTextInput,
                      { fontSize: OPTION_FONT_SIZE },
                      Platform.OS === 'android' ? { textAlignVertical: 'center' as const } : null,
                    ]}
                    value={password}
                    onChangeText={(t) => {
                      setError(null);
                      setPassword(t);
                    }}
                    placeholder="Пароль"
                    placeholderTextColor={AUTH_PLACEHOLDER}
                    secureTextEntry={!passwordVisible}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    multiline={false}
                    contextMenuHidden={false}
                    keyboardType="default"
                    autoComplete={tab === 'login' ? 'password' : 'new-password'}
                    textContentType={tab === 'login' ? 'password' : 'newPassword'}
                    importantForAutofill="yes"
                    keyboardAppearance="dark"
                    selectionColor={ACCENT}
                    returnKeyType={tab === 'login' ? 'go' : 'next'}
                    enablesReturnKeyAutomatically
                    onSubmitEditing={tab === 'login' ? () => void onLogin() : undefined}
                    showSoftInputOnFocus
                    onPressIn={() => passwordInputRef.current?.focus()}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField((k) => (k === 'password' ? null : k))}
                  />
                  <Pressable
                    onPress={() => setPasswordVisible((v) => !v)}
                    style={s.eyeButton}
                    android_ripple={rippleOnDarkSurface}
                    accessibilityLabel={passwordVisible ? 'Приховати пароль' : 'Показати пароль'}
                  >
                    <Image
                      source={passwordVisible ? EYE_CLOSED : EYE_OPEN}
                      style={[s.eyeButtonIcon, { tintColor: passwordVisible ? ACCENT : '#B0B0B0' }]}
                      resizeMode="contain"
                    />
                  </Pressable>
                </View>

                <View
                  collapsable={false}
                  style={[
                    s.authFieldRow,
                    tab !== 'register' && s.authFieldRowHidden,
                    tab === 'register' && focusedField === 'confirm' && s.authFieldRowFocused,
                  ]}
                >
                  <TextInput
                    ref={confirmPasswordInputRef}
                    editable={tab === 'register'}
                    style={[
                      s.authTextInput,
                      { fontSize: OPTION_FONT_SIZE },
                      Platform.OS === 'android' ? { textAlignVertical: 'center' as const } : null,
                    ]}
                    value={confirmPassword}
                    onChangeText={(t) => {
                      setError(null);
                      setConfirmPassword(t);
                    }}
                    placeholder="Підтвердіть пароль"
                    placeholderTextColor={AUTH_PLACEHOLDER}
                    secureTextEntry={!passwordVisible}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    multiline={false}
                    contextMenuHidden={false}
                    keyboardType="default"
                    autoComplete={tab === 'register' ? 'new-password' : 'off'}
                    textContentType="newPassword"
                    importantForAutofill={tab === 'register' ? 'yes' : 'no'}
                    keyboardAppearance="dark"
                    selectionColor={ACCENT}
                    returnKeyType="done"
                    enablesReturnKeyAutomatically
                    onSubmitEditing={() => void onRegister()}
                    showSoftInputOnFocus
                    onPressIn={() => confirmPasswordInputRef.current?.focus()}
                    onFocus={() => tab === 'register' && setFocusedField('confirm')}
                    onBlur={() => setFocusedField((k) => (k === 'confirm' ? null : k))}
                  />
                </View>
              </View>

              {registerPasswordInlineText ? (
                <Text style={[s.authInlineFieldError, { fontSize: 13 }]} accessibilityLiveRegion="polite">
                  {registerPasswordInlineText}
                </Text>
              ) : null}

              {tab === 'login' ? (
                <View style={s.row}>
                  <Pressable
                    onPress={() => setRememberMe((v) => !v)}
                    style={({ pressed }) => [s.checkboxWrap, pressed && s.checkboxWrapPressed]}
                    android_ripple={rippleOnDarkSurface}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: rememberMe }}
                    hitSlop={8}
                    pressRetentionOffset={12}
                  >
                    <View style={[s.checkboxBox, rememberMe && s.checkboxBoxChecked]}>
                      <View style={[s.checkboxSquare, rememberMe && s.checkboxSquareChecked]} />
                      {rememberMe ? <Text style={s.checkboxCheckIcon}>✓</Text> : null}
                    </View>
                    <FittingText style={s.checkboxLabel} minimumFontScale={0.68}>
                      {"Запам'ятати мене"}
                    </FittingText>
                  </Pressable>
                  <Pressable
                    style={s.forgotWrap}
                    hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                    android_ripple={noAndroidRipple}
                    accessibilityRole="link"
                    onPress={() => {
                      setError(null);
                      setForgotMode(true);
                    }}
                  >
                    <FittingText style={s.forgotText} minimumFontScale={0.72}>
                      Забули пароль?
                    </FittingText>
                  </Pressable>
                </View>
              ) : (
                <View style={s.termsRow}>
                  <Pressable
                    onPress={() => setTermsAccepted((v) => !v)}
                    style={({ pressed }) => [s.checkboxWrap, s.termsCheckboxWrap, pressed && s.checkboxWrapPressed]}
                    android_ripple={rippleOnDarkSurface}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: termsAccepted }}
                    hitSlop={8}
                    pressRetentionOffset={12}
                  >
                    <View style={[s.checkboxBox, termsAccepted && s.checkboxBoxChecked]}>
                      <View style={[s.checkboxSquare, termsAccepted && s.checkboxSquareChecked]} />
                      {termsAccepted ? <Text style={s.checkboxCheckIcon}>✓</Text> : null}
                    </View>
                    <View style={s.termsLabelWrap}>
                      <FittingText style={[s.checkboxLabel, s.termsAgreeText]} minimumFontScale={0.68}>
                        {thirdPageUi(UI_LANG, 'agreePrefix')}
                      </FittingText>
                      <Pressable
                        onPress={() => setShowTermsModal(true)}
                        android_ripple={rippleOnDarkSurface}
                        accessibilityRole="link"
                        hitSlop={4}
                        style={s.termsLinkPressable}
                      >
                        <FittingText style={s.termsInlineLink} minimumFontScale={0.68}>
                          {thirdPageUi(UI_LANG, 'termsLink')}
                        </FittingText>
                      </Pressable>
                    </View>
                  </Pressable>
                </View>
              )}

              <View style={s.primarySubmitWrap} importantForAccessibility="yes">
                <Pressable
                  disabled={busy}
                  onPress={() => void (tab === 'login' ? onLogin() : onRegister())}
                  style={[
                    s.authOnboardCtaOuter,
                    s.primarySubmitPressable,
                    {
                      width: contentWidth,
                      opacity: busy ? 0.55 : 1,
                    },
                  ]}
                  android_ripple={rippleOnDarkSurface}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy }}
                  accessibilityLabel={tab === 'login' ? 'Увійти' : 'Зареєструватись'}
                >
                  <View style={s.authOnboardCtaBack} />
                  <View style={s.authOnboardCtaFront}>
                    {busy ? (
                      <ActivityIndicator color={TEXT_DARK} size="small" />
                    ) : (
                      <Text style={s.authOnboardCtaText}>
                        {tab === 'login' ? 'Увійти' : 'Зареєструватись'}
                      </Text>
                    )}
                  </View>
                </Pressable>
              </View>

              {displayFormError ? (
                <View style={[s.statusCard, s.statusCardError]}>
                  <Text style={[s.statusCardTitle, s.statusCardTitleError]}>
                    {thirdPageUi(UI_LANG, 'checkDetails')}
                  </Text>
                  <Text style={[s.statusCardText, s.statusCardTextError]}>{displayFormError}</Text>
                </View>
              ) : null}

            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      <TermsOfUseSheetModal
        visible={showTermsModal}
        onClose={closeTermsModal}
        title="Умови користування"
        content={termsContent}
        backAccessibilityLabel={thirdPageUi(UI_LANG, 'close')}
      />
    </View>
  );
}

const s = StyleSheet.create({
  forgotGradient: { flex: 1, overflow: 'hidden' },
  forgotSafe: { flex: 1 },
  forgotScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  forgotCard: {
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 22,
    backgroundColor: 'rgba(18, 18, 22, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(225, 255, 0, 0.22)',
    ...Platform.select({
      ios: {
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 22,
      },
      android: { elevation: 14 },
    }),
  },
  forgotAccentCap: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: ACCENT,
    marginBottom: 18,
    opacity: 0.95,
  },
  forgotTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: ACCENT,
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  forgotHint: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  forgotInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: TEXT_LIGHT,
    fontSize: 15,
    marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  forgotPrimary: {
    width: '100%',
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  forgotBackBtn: {
    marginTop: 18,
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  forgotBackText: {
    color: ACCENT,
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.95,
  },
  screen: { flex: 1, width: '100%', overflow: 'hidden', backgroundColor: BG },
  scrollView: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
    backgroundColor: 'transparent',
  },
  kav: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingBottom: 40,
    alignItems: 'center',
  },
  formTitle: {
    ...BRAND_TEXT_FONT,
    fontWeight: '400',
    fontSize: DESIGN_TITLE_FONT_SIZE,
    lineHeight: DESIGN_TITLE_HEIGHT,
    height: DESIGN_TITLE_HEIGHT,
    color: ACCENT,
    letterSpacing: 0,
    textAlign: 'center',
    marginTop: AUTH_FORM_GAP,
    marginBottom: AUTH_FORM_GAP,
    backgroundColor: 'transparent',
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
  loginFormTabsCompact: {
    marginTop: 0,
    marginBottom: AUTH_FORM_GAP,
    minHeight: 38,
    padding: 3,
  },
  savedAccountsBlock: {
    width: '100%',
    marginBottom: AUTH_FORM_GAP,
  },
  savedAccountsLabel: {
    ...BRAND_TEXT_FONT,
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 8,
    ...(Platform.OS === 'android' ? { fontFamily: 'sans-serif-medium', includeFontPadding: false } : {}),
  },
  savedAccountsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 4,
  },
  savedAccountChip: {
    maxWidth: 220,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: 'rgba(225, 255, 0, 0.06)',
  },
  savedAccountChipText: {
    ...BRAND_TEXT_FONT,
    fontSize: 13,
    color: LEMON_BRIGHT,
    ...(Platform.OS === 'android' ? { fontFamily: 'sans-serif', includeFontPadding: false } : {}),
  },
  loginFormTabPillCompact: {
    minHeight: 32,
    paddingVertical: 6,
  },
  loginFormInputWrapCompact: {
    marginTop: 0,
    paddingTop: 0,
    gap: AUTH_FORM_GAP,
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
      ? { fontFamily: 'sans-serif', fontWeight: '400' as const, includeFontPadding: false }
      : { ...BRAND_TEXT_FONT, fontWeight: '400' as const }),
  },
  tabTextActive: {
    letterSpacing: 0,
    ...(Platform.OS === 'android'
      ? ANDROID_ACCENT_TEXT
      : { ...BRAND_TEXT_FONT, fontWeight: '400' as const, color: TEXT_DARK, includeFontPadding: false }),
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
    minHeight: 42,
    backgroundColor: INPUT_BG_ROW,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 12,
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
    flexShrink: 0,
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
  forgotWrap: {
    flexShrink: 1,
    maxWidth: '46%',
    minWidth: 0,
    alignSelf: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
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
  primarySubmitWrap: {
    width: '100%',
    marginBottom: AUTH_FORM_GAP,
    overflow: 'visible',
  },
  primarySubmitPressable: {
    alignSelf: 'center',
  },
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
  btnDisabled: { opacity: 0.6 },
  submitBtnText: {
    color: TEXT_DARK,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  error: {
    color: ERROR_COLOR,
    fontSize: 13,
    marginBottom: 8,
    textAlign: 'center',
  },
});

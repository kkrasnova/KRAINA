import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  Platform,
  Alert,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { LIGHT_BAR_BG, mainContentTopBelowTopBar } from './AppTopBar';
import { getAppTheme } from './themeStorage';
import { useResponsive } from './useResponsive';
import Lemon3DButton from './Lemon3DButton';
import {
  setPlanChoice,
  extendPaidSubscription,
  applyBackendSubscriptionToLocal,
  getSubscriptionState,
  PRO_PRICE_USD,
  PRO_LIST_PRICE_USD,
  EXPLORER_PRICE_USD,
} from './subscriptionStorage';
import { postBillingVerify, postBillingCancelFeedback } from './auth/endpoints';
import { useAuthStore } from './auth/authStore';
import { ApiError } from './auth/types';
import { isAppAdminUser } from './adminGate';
import {
  getSubscriptionIdForPlatform,
  getSubscriptionIdsForFetch,
  getExplorerSubscriptionIdForPlatform,
} from './iapConfig';
import { resolveProExpirationIso, findSubscriptionProduct, tierFromSubscriptionProductId } from './iapHelpers';
import { safeInitIapConnection } from './iapConnection';
import { getChoosePlanTexts } from './choosePlanI18n';
import { brandFontText } from './brandFont';
import { useAppLanguage } from './useAppLanguage';
import { getSavedCountryIdForUser } from './countryStorage';

const ANDROID_PACKAGE = 'com.kraina.app';

const BG_TOP = '#0A0A0F';
const BG_BOTTOM = '#12121a';
const ACCENT = '#E1FF00';
const ACCENT_DIM = 'rgba(225, 255, 0, 0.14)';
const BRAND_BLUE = '#6286E4';

const CANCEL_REASON_DEFS = [
  { id: 'too_expensive', labelKey: 'cancelReasonTooExpensive' },
  { id: 'rarely_use', labelKey: 'cancelReasonRarelyUse' },
  { id: 'missing_features', labelKey: 'cancelReasonMissingFeatures' },
  { id: 'bugs_crash', labelKey: 'cancelReasonBugs' },
  { id: 'switched_app', labelKey: 'cancelReasonOtherApp' },
  { id: 'other', labelKey: 'cancelReasonOther' },
];

export default function ChoosePlanPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const lang = useAppLanguage(route);
  const user = route?.params?.user || {};
  const countryId = route?.params?.countryId;
  const fromSettings = !!route?.params?.fromSettings;
  const routeTheme = route?.params?.appTheme;
  const [appTheme, setAppTheme] = useState(() =>
    routeTheme === 'light' || routeTheme === 'dark' ? routeTheme : 'dark',
  );
  const texts = getChoosePlanTexts(lang);
  const authUser = useAuthStore((s) => s.user);
  const [busy, setBusy] = useState(null);
  const [planTab, setPlanTab] = useState('explorer');
  const [paidSnapshot, setPaidSnapshot] = useState({ isPaid: false, tier: null });
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReasons, setCancelReasons] = useState([]);
  const [cancelComment, setCancelComment] = useState('');

  const userRef = useRef(user);
  userRef.current = user;

  const accountDisplay = useMemo(() => {
    const t = getChoosePlanTexts(lang);
    const email =
      (authUser?.email && String(authUser.email).trim()) || (user?.email && String(user.email).trim());
    if (email) return email;
    const un =
      (authUser?.username && String(authUser.username).trim()) ||
      (user?.username && String(user.username).trim());
    if (un) return un;
    const id = authUser?.id ?? user?.id;
    if (id != null && String(id).trim() !== '') return String(id);
    return t.cancelAccountPlaceholder;
  }, [authUser, user, lang]);

  const storeSubscriptionsUrl = useMemo(
    () =>
      Platform.OS === 'ios'
        ? 'https://apps.apple.com/account/subscriptions'
        : `https://play.google.com/store/account/subscriptions?package=${ANDROID_PACKAGE}`,
    [],
  );

  const openStoreManageSubscriptions = useCallback(() => {
    void Linking.openURL(storeSubscriptionsUrl).catch(() => {});
  }, [storeSubscriptionsUrl]);

  const storeManageCta =
    Platform.OS === 'ios' ? texts.cancelOpenStoreCtaIos : texts.cancelOpenStoreCtaAndroid;
  const storeTag = Platform.OS === 'ios' ? texts.cancelStoreTagIos : texts.cancelStoreTagAndroid;

  const goMain = useCallback(async () => {
    const u = userRef.current;
    let cid = countryId;
    if (!cid) {
      cid = await getSavedCountryIdForUser(u);
    }
    navigation?.replace?.('HomeTabPager', {
      user: u,
      language: lang,
      tabIndex: 0,
      routeFinderExtras: {},
      ...(cid ? { countryId: cid } : {}),
    });
  }, [navigation, lang, countryId]);

  const leaveAfterFreeChoice = useCallback(async () => {
    if (fromSettings && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    await goMain();
  }, [fromSettings, navigation, goMain]);

  const applyDemoPro = async () => {
    await setPlanChoice(userRef.current, 'pro', { demoProDays: 30 });
    await goMain();
  };

  const applyDemoExplorer = async () => {
    await setPlanChoice(userRef.current, 'explorer', { demoExplorerDays: 30 });
    await goMain();
  };

  const [connected, setConnected] = useState(false);
  const [subscriptions, setSubscriptions] = useState([]);
  const iapRef = useRef(null);
  const iapModuleRef = useRef(null);
  const goMainRef = useRef(goMain);
  goMainRef.current = goMain;

  useEffect(() => {
    if (routeTheme === 'light' || routeTheme === 'dark') {
      setAppTheme(routeTheme);
      return;
    }
    let cancelled = false;
    (async () => {
      const t = await getAppTheme();
      if (!cancelled) setAppTheme(t === 'light' ? 'light' : 'dark');
    })();
    return () => {
      cancelled = true;
    };
  }, [routeTheme]);

  useFocusEffect(
    useCallback(() => {
      if (routeTheme === 'light' || routeTheme === 'dark') {
        return () => {};
      }
      let cancelled = false;
      (async () => {
        const t = await getAppTheme();
        if (!cancelled) setAppTheme(t === 'light' ? 'light' : 'dark');
      })();
      return () => {
        cancelled = true;
      };
    }, [routeTheme]),
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const u = userRef.current;
        if (isAppAdminUser(u)) {
          if (!cancelled) setPaidSnapshot({ isPaid: false, tier: null });
          return;
        }
        const s = await getSubscriptionState(u);
        if (cancelled) return;
        const tier =
          s.isPaidActive && (s.tier === 'explorer' || s.tier === 'pro' || s.tier === 'family') ? s.tier : null;
        setPaidSnapshot({ isPaid: !!tier, tier });
      })();
      return () => {
        cancelled = true;
      };
    }, [user?.id, user?.email, user?.firebaseUid]),
  );

  /** З Налаштувань / Архіву: одразу відкрити діалог скасування, якщо є платний тариф. */
  useFocusEffect(
    useCallback(() => {
      if (route?.params?.openCancelSubscription !== true) return undefined;
      let cancelled = false;
      (async () => {
        try {
          const u = userRef.current;
          if (isAppAdminUser(u)) return;
          const s = await getSubscriptionState(u);
          if (cancelled) return;
          const tier =
            s.isPaidActive && (s.tier === 'explorer' || s.tier === 'pro' || s.tier === 'family') ? s.tier : null;
          if (tier) {
            setShowCancelModal(true);
          }
        } finally {
          if (!cancelled) {
            navigation.setParams({ openCancelSubscription: false });
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [navigation, route?.params?.openCancelSubscription]),
  );

  useEffect(() => {
    let cancelled = false;
    let unsubPurchase;
    let unsubError;

    (async () => {
      const t = getChoosePlanTexts(lang);
      try {
        if (cancelled) return;
        const { ok, RNIap } = await safeInitIapConnection();
        if (cancelled) return;
        if (!ok || !RNIap) {
          iapRef.current = null;
          iapModuleRef.current = null;
          setConnected(false);
          return;
        }
        iapRef.current = RNIap;
        iapModuleRef.current = RNIap;
        setConnected(true);

        unsubPurchase = RNIap.purchaseUpdatedListener(async (purchase) => {
          try {
            const tier = tierFromSubscriptionProductId(purchase?.productId);
            const expiresIso = await resolveProExpirationIso(
              purchase,
              RNIap.getActiveSubscriptions,
              getSubscriptionIdsForFetch(),
            );
            await extendPaidSubscription(userRef.current, tier, expiresIso);
            const accessToken = useAuthStore.getState().accessToken;
            if (accessToken) {
              try {
                if (Platform.OS === 'ios' && typeof RNIap.getReceiptIOS === 'function') {
                  const receipt = await RNIap.getReceiptIOS();
                  if (receipt) {
                    const { subscription } = await postBillingVerify(accessToken, {
                      platform: 'ios',
                      productId: purchase?.productId,
                      appReceiptBase64: receipt,
                    });
                    await applyBackendSubscriptionToLocal(userRef.current, subscription);
                  }
                } else if (Platform.OS === 'android' && purchase?.purchaseToken) {
                  const { subscription } = await postBillingVerify(accessToken, {
                    platform: 'android',
                    productId: purchase.productId,
                    purchaseToken: purchase.purchaseToken,
                  });
                  await applyBackendSubscriptionToLocal(userRef.current, subscription);
                }
              } catch (be) {
                if (__DEV__) console.warn('[billing] verify after purchase', be?.message);
              }
            }
            await RNIap.finishTransaction({ purchase, isConsumable: false });
            await goMainRef.current?.();
          } catch (e) {
            if (__DEV__) console.warn('[IAP] onPurchaseSuccess', e?.message);
            Alert.alert(t.alertErrorTitle, t.alertApplyPurchaseFailed);
          } finally {
            setBusy(null);
          }
        });

        unsubError = RNIap.purchaseErrorListener((err) => {
          setBusy(null);
          const code = String(err?.code || '');
          if (code === 'user-cancelled' || code === 'UserCancelled') return;
          Alert.alert(t.alertPurchaseTitle, err?.message || t.alertTryLater);
        });

        const skus = getSubscriptionIdsForFetch();
        const result = await RNIap.fetchProducts({ skus, type: 'subs' });
        if (!cancelled) setSubscriptions(Array.isArray(result) ? result : []);
      } catch (e) {
        if (__DEV__) console.warn('[IAP] ChoosePlan init', e?.message);
        if (!cancelled) {
          iapRef.current = null;
          iapModuleRef.current = null;
          setConnected(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubPurchase?.remove?.();
      unsubError?.remove?.();
      iapRef.current = null;
      const mod = iapModuleRef.current;
      iapModuleRef.current = null;
      mod?.endConnection?.().catch(() => {});
    };
  }, [lang]);

  const onFree = async () => {
    setBusy('free');
    try {
      await setPlanChoice(user, 'free');
      await leaveAfterFreeChoice();
    } finally {
      setBusy(null);
    }
  };

  const requestSubPurchase = async (sku, platformAndroidSub) => {
    const RNIap = iapRef.current;
    if (Platform.OS === 'ios') {
      await RNIap.requestPurchase({
        type: 'subs',
        request: { ios: { sku } },
      });
      return;
    }
    const offers = platformAndroidSub?.subscriptionOfferDetailsAndroid;
    if (!offers?.length) {
      const t = getChoosePlanTexts(lang);
      Alert.alert(t.alertErrorTitle, t.alertNoBasePlan);
      return;
    }
    await RNIap.requestPurchase({
      type: 'subs',
      request: {
        android: {
          skus: [sku],
          subscriptionOffers: [{ sku, offerToken: offers[0].offerToken }],
        },
      },
    });
  };

  const onExplorer = async () => {
    setBusy('explorer');
    const t = getChoosePlanTexts(lang);
    try {
      const exSku = getExplorerSubscriptionIdForPlatform();
      if (!exSku) {
        if (__DEV__) await applyDemoExplorer();
        else Alert.alert(t.alertSetupTitle, t.alertSetupMessage);
        setBusy(null);
        return;
      }

      const RNIap = iapRef.current;
      if (!connected || !RNIap) {
        if (__DEV__) await applyDemoExplorer();
        else Alert.alert(t.alertPleaseWait, t.alertConnectingStore);
        setBusy(null);
        return;
      }

      const sub = findSubscriptionProduct(subscriptions, exSku);
      if (!sub) {
        if (__DEV__) await applyDemoExplorer();
        else Alert.alert(t.alertSetupTitle, t.alertSetupMessage);
        setBusy(null);
        return;
      }

      await requestSubPurchase(exSku, sub);
    } catch (e) {
      if (__DEV__) console.warn('[IAP] onExplorer', e?.message);
      setBusy(null);
      Alert.alert(t.alertErrorTitle, e?.message || 'IAP');
    }
  };

  const toggleCancelReason = useCallback((id) => {
    setCancelReasons((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const openCancelModal = useCallback(() => {
    setCancelReasons([]);
    setCancelComment('');
    setShowCancelModal(true);
  }, []);

  const onConfirmCancelSubscription = useCallback(async () => {
    const t = getChoosePlanTexts(lang);
    if (cancelReasons.length === 0) {
      Alert.alert(t.cancelModalTitle, t.cancelNeedReason);
      return;
    }
    const prev = paidSnapshot.tier;
    if (prev !== 'explorer' && prev !== 'pro' && prev !== 'family') return;

    setBusy('cancel');
    try {
      const token = useAuthStore.getState().accessToken;
      if (token) {
        await postBillingCancelFeedback(token, {
          previous_plan: prev,
          reason_codes: cancelReasons,
          comment: cancelComment.trim() || null,
          app_language: lang || null,
        });
      }
      await setPlanChoice(userRef.current, 'free');
      setShowCancelModal(false);
      setCancelReasons([]);
      setCancelComment('');
      setPaidSnapshot({ isPaid: false, tier: null });
      const successBody = token ? t.cancelSuccessBody : `${t.cancelSuccessBody}\n\n${t.cancelNoSessionBody}`;
      const storeCta = Platform.OS === 'ios' ? t.cancelOpenStoreCtaIos : t.cancelOpenStoreCtaAndroid;
      const storeUrl =
        Platform.OS === 'ios'
          ? 'https://apps.apple.com/account/subscriptions'
          : `https://play.google.com/store/account/subscriptions?package=${ANDROID_PACKAGE}`;
      Alert.alert(t.cancelSuccessTitle, successBody, [
        { text: t.cancelSuccessDismiss, style: 'cancel' },
        { text: storeCta, onPress: () => void Linking.openURL(storeUrl).catch(() => {}) },
      ]);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? JSON.stringify(e.payload || {}) || e.message
          : String(e?.message || '');
      Alert.alert(t.cancelErrorTitle, msg ? `${t.cancelErrorBody}\n${msg}` : t.cancelErrorBody);
    } finally {
      setBusy(null);
    }
  }, [cancelReasons, cancelComment, lang, paidSnapshot.tier]);

  const onPro = async () => {
    setBusy('pro');
    const t = getChoosePlanTexts(lang);
    try {
      const RNIap = iapRef.current;
      if (!connected || !RNIap) {
        if (__DEV__) await applyDemoPro();
        else Alert.alert(t.alertPleaseWait, t.alertConnectingStore);
        setBusy(null);
        return;
      }

      const sku = getSubscriptionIdForPlatform();
      const sub = findSubscriptionProduct(subscriptions, sku);

      if (!sub) {
        if (__DEV__) await applyDemoPro();
        else Alert.alert(t.alertSetupTitle, t.alertSetupMessage);
        setBusy(null);
        return;
      }

      await requestSubPurchase(sku, sub);
    } catch (e) {
      if (__DEV__) console.warn('[IAP] onPro', e?.message);
      setBusy(null);
      Alert.alert(t.alertErrorTitle, e?.message || 'IAP');
    }
  };

  const cardPad = Math.max(14, Math.round(16 * r.scale));
  const titleSize = r.titleFontSize || 22;

  const bullets = planTab === 'free' ? texts.freeBullets : planTab === 'explorer' ? texts.explorerBullets : texts.proBullets;

  const onPrimary = () => {
    if (planTab === 'free') return onFree();
    if (planTab === 'explorer') return onExplorer();
    return onPro();
  };

  const primaryBusy = busy === planTab;
  const primaryLabel =
    planTab === 'free' ? texts.chooseFree : planTab === 'explorer' ? texts.ctaExplorer : texts.ctaProUnlimited;

  const light = appTheme === 'light';
  const showBack = navigation.canGoBack();
  const showCancelCta = paidSnapshot.isPaid && paidSnapshot.tier && !isAppAdminUser(user);
  const pal = light
    ? {
        grad0: '#E8EDF7',
        grad1: LIGHT_BAR_BG,
        rootSolid: 'transparent',
        title: BRAND_BLUE,
        subtitle: '#3A3A3A',
        segmentBg: 'rgba(0, 0, 0, 0.05)',
        segmentLabel: '#1E1E1E',
        segmentLabelActive: '#101010',
        explorerOutline: 'rgba(98, 134, 228, 0.5)',
        badge: BRAND_BLUE,
        cardBorder: 'rgba(98, 134, 228, 0.4)',
        cardFill: 'rgba(98, 134, 228, 0.1)',
        cardHeading: BRAND_BLUE,
        textMain: '#1E1E1E',
        priceWas: '#888888',
        priceMuted: 'rgba(30,30,30,0.75)',
        hint: '#5C5C5C',
        divider: 'rgba(30,30,30,0.12)',
        bulletIcon: BRAND_BLUE,
        bullet: '#1E1E1E',
        proNote: '#666666',
        socialTag: '#2E7D32',
        footerTitle: BRAND_BLUE,
        footerBody: '#3A3A3A',
      }
    : {
        grad0: BG_TOP,
        grad1: BG_BOTTOM,
        rootSolid: 'transparent',
        title: ACCENT,
        subtitle: '#FFFFFF',
        segmentBg: 'rgba(42, 42, 42, 0.95)',
        segmentLabel: '#FFFFFF',
        segmentLabelActive: '#101010',
        explorerOutline: 'rgba(225, 255, 0, 0.35)',
        badge: ACCENT,
        cardBorder: 'rgba(225, 255, 0, 0.38)',
        cardFill: ACCENT_DIM,
        cardHeading: ACCENT,
        textMain: '#FFFFFF',
        priceWas: '#6B6B6B',
        priceMuted: 'rgba(255,255,255,0.85)',
        hint: '#AAAAAA',
        divider: 'rgba(255,255,255,0.2)',
        bulletIcon: ACCENT,
        bullet: '#FFFFFF',
        proNote: '#AAAAAA',
        socialTag: '#C8E86C',
        footerTitle: ACCENT,
        footerBody: '#FFFFFF',
      };

  return (
    <View style={[styles.root, { backgroundColor: pal.rootSolid }]}>
      <LinearGradient colors={[pal.grad0, pal.grad1]} style={StyleSheet.absoluteFillObject} />
      {showBack ? (
        <AppTopBar
          appTheme={light ? 'light' : 'dark'}
          leftMode="back"
          onBackPress={() => navigation.goBack()}
          replaceCenterTitle={texts.navTitle}
          hideSendButton
          transparentHeader
        />
      ) : null}
      <View
        style={[
          styles.safe,
          {
            paddingTop: showBack ? mainContentTopBelowTopBar(insets.top) : insets.top + 8,
            paddingBottom: insets.bottom + 12,
          },
        ]}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingHorizontal: r.horizontalPadding }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.title, { fontSize: titleSize, lineHeight: titleSize + 6, color: pal.title }]}>
            {texts.title}
          </Text>
          <Text style={[styles.subtitle, { fontSize: r.subtitleFontSize || 14, color: pal.subtitle }]}>
            {texts.subtitle}
          </Text>

          <View style={styles.segmentRow}>
            {['free', 'explorer', 'pro'].map((key) => (
              <Pressable
                key={key}
                style={[
                  styles.segmentBtn,
                  { backgroundColor: pal.segmentBg, borderColor: 'transparent' },
                  planTab === key && styles.segmentBtnActive,
                  key === 'explorer' &&
                    planTab !== key && {
                      borderWidth: 1,
                      borderColor: pal.explorerOutline,
                    },
                ]}
                onPress={() => setPlanTab(key)}
                accessibilityRole="button"
                accessibilityState={{ selected: planTab === key }}
              >
                <Text
                  style={[
                    styles.segmentLabel,
                    { color: pal.segmentLabel },
                    planTab === key && [styles.segmentLabelActive, { color: pal.segmentLabelActive }],
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {key === 'free' ? texts.freeTitle : key === 'explorer' ? texts.explorerTitle : texts.proTitle}
                </Text>
              </Pressable>
            ))}
          </View>

          {planTab === 'explorer' && texts.explorerBadge ? (
            <Text style={[styles.badgeHint, { color: pal.badge }]}>{texts.explorerBadge}</Text>
          ) : null}

          <View
            style={[
              styles.card,
              {
                padding: cardPad,
                borderColor: pal.cardBorder,
                backgroundColor: pal.cardFill,
              },
            ]}
          >
            <Text style={[styles.cardHeading, { color: pal.cardHeading }]}>{texts.cardHeading}</Text>

            <View style={styles.priceBlock}>
              {planTab === 'pro' ? (
                <>
                  <Text style={[styles.priceWas, { color: pal.priceWas }]}>${PRO_LIST_PRICE_USD.toFixed(2)}</Text>
                  <View style={styles.priceMainRow}>
                    <Text style={[styles.priceMain, { color: pal.textMain }]}>${PRO_PRICE_USD.toFixed(2)}</Text>
                    <Text style={[styles.priceSlash, { color: pal.priceMuted }]}> /</Text>
                    <Text style={[styles.pricePeriod, { color: pal.priceMuted }]}> {texts.proPricePeriod}</Text>
                  </View>
                </>
              ) : planTab === 'explorer' ? (
                <>
                  <View style={styles.priceMainRow}>
                    <Text style={[styles.priceMain, { color: pal.textMain }]}>${EXPLORER_PRICE_USD.toFixed(2)}</Text>
                    <Text style={[styles.priceSlash, { color: pal.priceMuted }]}> /</Text>
                    <Text style={[styles.pricePeriod, { color: pal.priceMuted }]}> {texts.explorerPricePeriod}</Text>
                  </View>
                  <Text style={[styles.hint, { color: pal.hint }]}>{texts.explorerHint}</Text>
                </>
              ) : (
                <>
                  <Text style={[styles.priceMain, { color: pal.textMain }]}>{texts.freePrice}</Text>
                  <Text style={[styles.hint, { color: pal.hint }]}>{texts.freeHint}</Text>
                </>
              )}
            </View>

            <View style={[styles.divider, { backgroundColor: pal.divider }]} />

            {bullets.map((line, i) => (
              <View key={i} style={styles.bulletRow}>
                <Ionicons name="checkmark-circle" size={18} color={pal.bulletIcon} style={styles.bulletIcon} />
                <Text style={[styles.bullet, { color: pal.bullet }]}>{line}</Text>
              </View>
            ))}

            {planTab === 'free' ? (
              <Text style={[styles.socialTag, { color: pal.socialTag }]}>{texts.socialTag}</Text>
            ) : planTab === 'explorer' ? (
              <Text style={[styles.proNote, { color: pal.proNote }]}>{texts.explorerNote}</Text>
            ) : (
              <Text style={[styles.proNote, { color: pal.proNote }]}>{texts.proNote}</Text>
            )}

            <Lemon3DButton
              label={primaryLabel}
              onPress={onPrimary}
              disabled={!!busy}
              loading={primaryBusy}
              minHeight={Math.max(47, Math.round(47 * r.scale))}
              textStyle={planTab === 'free' ? styles.btnSecondaryText : styles.btnPrimaryText}
              style={planTab === 'free' ? styles.btnSecondaryWrap : styles.btnPrimaryWrap}
            />
          </View>

          <View style={styles.footerPitch}>
            <Text style={[styles.footerPitchTitle, { color: pal.footerTitle }]}>{texts.footerPitchTitle}</Text>
            <Text style={[styles.footerPitchBody, { color: pal.footerBody, opacity: light ? 1 : 0.92 }]}>
              {texts.footerPitchBody}
            </Text>
          </View>

          {showCancelCta ? (
            <View style={styles.cancelWrap}>
              <Pressable
                onPress={openCancelModal}
                style={({ pressed }) => [styles.cancelCta, { opacity: pressed ? 0.82 : 1 }]}
                android_ripple={{ color: light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)' }}
              >
                <Text style={[styles.cancelCtaText, { color: light ? '#B3261E' : '#FF8A80' }]}>
                  {texts.cancelSubscriptionCta}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </View>

      <Modal
        visible={showCancelModal}
        animationType="fade"
        transparent
        onRequestClose={() => {
          if (busy !== 'cancel') setShowCancelModal(false);
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalKb}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalRoot}>
            <Pressable
              style={styles.modalBackdrop}
              onPress={() => {
                if (busy !== 'cancel') setShowCancelModal(false);
              }}
            />
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
            <View style={[styles.modalCard, light ? styles.modalCardLight : styles.modalCardDark]}>
            <Text style={[styles.modalTitle, { color: light ? BRAND_BLUE : ACCENT }]}>{texts.cancelModalTitle}</Text>
            <Text style={[styles.modalSub, { color: light ? '#4A4A4A' : 'rgba(255,255,255,0.82)' }]}>
              {texts.cancelModalSubtitle}
            </Text>

            <View
              style={[
                styles.modalAccountCard,
                {
                  borderColor: light ? 'rgba(98, 134, 228, 0.35)' : 'rgba(225, 255, 0, 0.28)',
                  backgroundColor: light ? 'rgba(98, 134, 228, 0.08)' : 'rgba(255,255,255,0.06)',
                },
              ]}
            >
              <View style={styles.modalAccountRow}>
                <View
                  style={[
                    styles.modalAccountAvatar,
                    { backgroundColor: light ? 'rgba(98, 134, 228, 0.2)' : 'rgba(225, 255, 0, 0.15)' },
                  ]}
                >
                  <Ionicons name="person" size={22} color={light ? BRAND_BLUE : ACCENT} />
                </View>
                <View style={styles.modalAccountTextCol}>
                  <Text
                    style={[styles.modalAccountHeading, { color: light ? '#5C5C5C' : 'rgba(255,255,255,0.65)' }]}
                    numberOfLines={1}
                  >
                    {texts.cancelAccountHeading}
                  </Text>
                  <Text
                    style={[styles.modalAccountEmail, { color: light ? '#1E1E1E' : '#FFFFFF' }]}
                    numberOfLines={2}
                  >
                    {accountDisplay}
                  </Text>
                  <Text
                    style={[styles.modalAccountStoreTag, { color: light ? BRAND_BLUE : ACCENT }]}
                    numberOfLines={2}
                  >
                    {storeTag}
                  </Text>
                </View>
              </View>
              <Text style={[styles.modalBillingExplainer, { color: light ? '#4A4A4A' : 'rgba(255,255,255,0.78)' }]}>
                {texts.cancelBillingExplainer}
              </Text>
              <Pressable
                onPress={openStoreManageSubscriptions}
                style={({ pressed }) => [
                  styles.modalStoreBtn,
                  {
                    borderColor: light ? BRAND_BLUE : ACCENT,
                    backgroundColor: light ? 'rgba(98, 134, 228, 0.12)' : 'rgba(225, 255, 0, 0.1)',
                    opacity: pressed ? 0.88 : 1,
                  },
                ]}
              >
                <Ionicons
                  name={Platform.OS === 'ios' ? 'logo-apple' : 'logo-google'}
                  size={20}
                  color={light ? BRAND_BLUE : ACCENT}
                />
                <Text style={[styles.modalStoreBtnTxt, { color: light ? BRAND_BLUE : ACCENT }]}>{storeManageCta}</Text>
              </Pressable>
            </View>

            <Text style={[styles.modalSectionLabel, { color: light ? '#1E1E1E' : '#FFFFFF' }]}>
              {texts.cancelReasonPrompt}
            </Text>
            <View style={styles.chipGrid}>
              {CANCEL_REASON_DEFS.map(({ id, labelKey }) => {
                const on = cancelReasons.includes(id);
                return (
                  <Pressable
                    key={id}
                    onPress={() => toggleCancelReason(id)}
                    style={[
                      styles.chip,
                      {
                        borderColor: on ? (light ? BRAND_BLUE : ACCENT) : light ? 'rgba(30,30,30,0.14)' : 'rgba(255,255,255,0.22)',
                        backgroundColor: on
                          ? light
                            ? 'rgba(98, 134, 228, 0.16)'
                            : 'rgba(225, 255, 0, 0.14)'
                          : light
                            ? 'rgba(255,255,255,0.7)'
                            : 'rgba(255,255,255,0.05)',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipLabel,
                        { color: light ? '#1E1E1E' : '#FFFFFF', fontWeight: on ? '600' : '400' },
                      ]}
                      numberOfLines={2}
                    >
                      {texts[labelKey]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              value={cancelComment}
              onChangeText={setCancelComment}
              placeholder={texts.cancelCommentPlaceholder}
              placeholderTextColor={light ? '#888888' : '#777777'}
              multiline
              style={[
                styles.commentInput,
                {
                  color: light ? '#1E1E1E' : '#FFFFFF',
                  borderColor: light ? 'rgba(30,30,30,0.12)' : 'rgba(255,255,255,0.18)',
                  backgroundColor: light ? '#F7F8FC' : 'rgba(0,0,0,0.2)',
                },
              ]}
              maxLength={2000}
            />

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setShowCancelModal(false)}
                disabled={busy === 'cancel'}
                style={({ pressed }) => [
                  styles.modalBtnGhost,
                  {
                    borderColor: light ? 'rgba(30,30,30,0.2)' : 'rgba(255,255,255,0.25)',
                    opacity: busy === 'cancel' ? 0.45 : pressed ? 0.88 : 1,
                  },
                ]}
              >
                <Text style={[styles.modalBtnGhostText, { color: light ? '#1E1E1E' : '#FFFFFF' }]}>
                  {texts.cancelBack}
                </Text>
              </Pressable>
              <Pressable
                onPress={onConfirmCancelSubscription}
                disabled={busy === 'cancel'}
                style={({ pressed }) => [
                  styles.modalBtnDanger,
                  {
                    backgroundColor: light ? '#B3261E' : '#C62828',
                    opacity: busy === 'cancel' ? 0.7 : pressed ? 0.9 : 1,
                  },
                ]}
              >
                {busy === 'cancel' ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalBtnDangerText}>{texts.cancelConfirm}</Text>
                )}
              </Pressable>
            </View>
            </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG_TOP },
  safe: { flex: 1 },
  title: {
    ...brandFontText,
    fontWeight: '700',
    color: ACCENT,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    ...brandFontText,
    fontWeight: '300',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
    opacity: 0.9,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40, gap: 10 },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderRadius: 14,
    backgroundColor: 'rgba(42, 42, 42, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segmentBtnExplorerOutline: {
    borderColor: 'rgba(225, 255, 0, 0.35)',
  },
  segmentBtnActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  segmentLabel: {
    ...brandFontText,
    fontWeight: '600',
    fontSize: 12,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  segmentLabelActive: {
    color: '#101010',
  },
  badgeHint: {
    ...brandFontText,
    fontWeight: '600',
    fontSize: 12,
    color: ACCENT,
    textAlign: 'center',
    marginBottom: 8,
    opacity: 0.95,
  },
  card: {
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(225, 255, 0, 0.38)',
    backgroundColor: ACCENT_DIM,
    marginTop: 4,
  },
  cardHeading: {
    ...brandFontText,
    fontWeight: '700',
    fontSize: 17,
    color: ACCENT,
    textAlign: 'center',
    marginBottom: 14,
  },
  priceBlock: {
    marginBottom: 14,
  },
  priceWas: {
    ...brandFontText,
    fontWeight: '400',
    fontSize: 14,
    color: '#6B6B6B',
    textDecorationLine: 'line-through',
    marginBottom: 4,
  },
  priceMainRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
  },
  priceMain: {
    ...brandFontText,
    fontWeight: '700',
    fontSize: 28,
    color: '#FFFFFF',
  },
  priceSlash: {
    ...brandFontText,
    fontWeight: '500',
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
  },
  pricePeriod: {
    ...brandFontText,
    fontWeight: '400',
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
  },
  hint: {
    ...brandFontText,
    fontWeight: '300',
    fontSize: 13,
    color: '#AAAAAA',
    marginTop: 8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 12,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    paddingRight: 4,
  },
  bulletIcon: {
    marginRight: 10,
    marginTop: 1,
  },
  socialTag: {
    ...brandFontText,
    fontWeight: '500',
    fontSize: 13,
    color: '#C8E86C',
    marginTop: 6,
    marginBottom: 6,
  },
  bullet: {
    flex: 1,
    ...brandFontText,
    fontWeight: '300',
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 22,
  },
  proNote: {
    ...brandFontText,
    fontWeight: '300',
    fontSize: 11,
    color: '#AAAAAA',
    lineHeight: 16,
    marginTop: 10,
    marginBottom: 12,
  },
  footerPitch: {
    marginTop: 22,
    paddingHorizontal: 4,
  },
  footerPitchTitle: {
    ...brandFontText,
    fontWeight: '700',
    fontSize: 18,
    color: ACCENT,
    textAlign: 'center',
    marginBottom: 10,
  },
  footerPitchBody: {
    ...brandFontText,
    fontWeight: '300',
    fontSize: 14,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 22,
    opacity: 0.92,
  },
  btnSecondaryWrap: {
    marginTop: 14,
  },
  btnSecondaryText: {
    ...brandFontText,
    fontWeight: '600',
    fontSize: 16,
    color: '#101010',
  },
  btnPrimaryWrap: {
    marginTop: 4,
  },
  btnPrimaryText: {
    ...brandFontText,
    fontWeight: '600',
    fontSize: 16,
    color: '#101010',
  },
  cancelWrap: {
    marginTop: 20,
    marginBottom: 8,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  cancelCta: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  cancelCtaText: {
    ...brandFontText,
    fontWeight: '600',
    fontSize: 15,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  modalKb: { flex: 1 },
  modalRoot: { flex: 1 },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  modalScroll: {
    flex: 1,
    zIndex: 1,
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 12,
  },
  modalCard: {
    borderRadius: 22,
    paddingVertical: 20,
    paddingHorizontal: 18,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  modalCardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(30,30,30,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  modalCardDark: {
    backgroundColor: '#16161E',
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    ...brandFontText,
    fontWeight: '700',
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 10,
  },
  modalSub: {
    ...brandFontText,
    fontWeight: '300',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 14,
  },
  modalAccountCard: {
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 18,
  },
  modalAccountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  modalAccountAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalAccountTextCol: {
    flex: 1,
    minWidth: 0,
  },
  modalAccountHeading: {
    ...brandFontText,
    fontWeight: '600',
    fontSize: 11,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  modalAccountEmail: {
    ...brandFontText,
    fontWeight: '700',
    fontSize: 16,
    lineHeight: 22,
  },
  modalAccountStoreTag: {
    ...brandFontText,
    fontWeight: '600',
    fontSize: 12,
    marginTop: 6,
  },
  modalBillingExplainer: {
    ...brandFontText,
    fontWeight: '300',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  modalStoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  modalStoreBtnTxt: {
    ...brandFontText,
    fontWeight: '700',
    fontSize: 15,
    flexShrink: 1,
    textAlign: 'center',
  },
  modalSectionLabel: {
    ...brandFontText,
    fontWeight: '600',
    fontSize: 14,
    marginBottom: 10,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  chip: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: '47%',
    flexGrow: 1,
    maxWidth: '100%',
  },
  chipLabel: {
    ...brandFontText,
    fontSize: 13,
    lineHeight: 18,
  },
  commentInput: {
    ...brandFontText,
    minHeight: 88,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    textAlignVertical: 'top',
    marginBottom: 18,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  modalBtnGhost: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnGhostText: {
    ...brandFontText,
    fontWeight: '600',
    fontSize: 15,
  },
  modalBtnDanger: {
    flex: 1.15,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  modalBtnDangerText: {
    ...brandFontText,
    fontWeight: '700',
    fontSize: 15,
    color: '#FFFFFF',
    textAlign: 'center',
  },
});

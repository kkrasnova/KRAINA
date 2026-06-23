import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  Platform,
  Alert,
  Pressable,
  ActivityIndicator,
  StatusBar as RNStatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import PagerView from 'react-native-pager-view';
import AppTopBar, { APP_SCREEN_BG, LIGHT_BAR_BG } from './AppTopBar';
import AuthHeroHeader, { WAVE_STROKE_PAD as PLAN_HERO_WAVE_PAD } from './AuthHeroHeader';
import { useAppTheme } from './useAppTheme';
import { useResponsive } from './useResponsive';
import Lemon3DButton from './Lemon3DButton';
import {
  setPlanChoice,
  extendPaidSubscription,
  applyBackendSubscriptionToLocal,
  PRO_PRICE_USD,
  PRO_LIST_PRICE_USD,
  EXPLORER_PRICE_USD,
} from './subscriptionStorage';
import { postBillingVerify } from './auth/endpoints';
import { useAuthStore } from './auth/authStore';
import {
  getSubscriptionIdForPlatform,
  getSubscriptionIdsForFetch,
  getExplorerSubscriptionIdForPlatform,
} from './iapConfig';
import { resolveProExpirationIso, findSubscriptionProduct, tierFromSubscriptionProductId } from './iapHelpers';
import { safeInitIapConnection } from './iapConnection';
import { getChoosePlanTexts } from './choosePlanI18n';
import { brandFontSansMedium, brandFontText } from './brandFont';
import { useAppLanguage } from './useAppLanguage';
import { getSavedCountryIdForUser } from './countryStorage';
import { errorToUserText } from './errorText';

const BG_TOP = '#0A0A0F';
const BG_BOTTOM = '#12121a';
const ACCENT = '#E1FF00';
const ACCENT_DIM = 'rgba(225, 255, 0, 0.14)';
const BRAND_BLUE = '#6286E4';

const PLAN_TABS = /** @type {const} */ (['free', 'explorer', 'pro']);

export default function ChoosePlanPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const lang = useAppLanguage(route);
  const user = route?.params?.user || {};
  const countryId = route?.params?.countryId;
  const fromSettings = !!route?.params?.fromSettings;
  const { savedAppTheme, isLight: light, screenBg } = useAppTheme(route?.params?.appTheme, route);
  const texts = getChoosePlanTexts(lang);
  const [busy, setBusy] = useState(null);
  const [planTab, setPlanTab] = useState('explorer');
  const userRef = useRef(user);
  userRef.current = user;
  const pagerRef = useRef(null);

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
          Alert.alert(t.alertPurchaseTitle, errorToUserText(err, lang));
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
      Alert.alert(t.alertErrorTitle, errorToUserText(e, lang));
    }
  };

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
      Alert.alert(t.alertErrorTitle, errorToUserText(e, lang));
    }
  };

  const compact = r.isShortScreen || r.isVeryShortScreen;
  const titleSize = compact ? 20 : Math.min(r.titleFontSize || 22, 22);
  const bulletSize = compact ? 11 : 12;
  const bulletLineHeight = compact ? 16 : 17;
  const priceMainSize = compact ? 19 : 21;
  const cardHeadingSize = compact ? 13 : 14;
  const bulletIconSize = compact ? 14 : 15;
  const btnMinHeight = compact ? 40 : Math.max(44, Math.round(44 * r.scale));
  const pageHeightsRef = useRef({ free: 0, explorer: 0, pro: 0 });
  const planPagerDefaultHeight = compact ? 210 : 250;
  const [pagerHeight, setPagerHeight] = useState(planPagerDefaultHeight);

  const syncPagerHeight = useCallback(() => {
    const heights = Object.values(pageHeightsRef.current).filter((h) => h > 0);
    const measuredMax = heights.length ? Math.max(...heights) : 0;
    setPagerHeight(Math.max(planPagerDefaultHeight, measuredMax));
  }, [planPagerDefaultHeight]);

  const planIndex = Math.max(0, PLAN_TABS.indexOf(planTab));
  const setPlanTabAndPage = useCallback(
    (nextKey) => {
      const k = nextKey === 'free' || nextKey === 'explorer' || nextKey === 'pro' ? nextKey : 'explorer';
      setPlanTab(k);
      const nextIndex = PLAN_TABS.indexOf(k);
      if (nextIndex >= 0) {
        try {
          pagerRef.current?.setPage?.(nextIndex);
        } catch {
          /* ignore */
        }
      }
    },
    [],
  );

  const bulletsFor = useCallback(
    (key) => (key === 'free' ? texts.freeBullets : key === 'explorer' ? texts.explorerBullets : texts.proBullets),
    [texts.freeBullets, texts.explorerBullets, texts.proBullets],
  );

  const onPrimary = () => {
    if (planTab === 'free') return onFree();
    if (planTab === 'explorer') return onExplorer();
    return onPro();
  };

  const primaryBusy = busy === planTab;
  const primaryLabel =
    planTab === 'free' ? texts.chooseFree : planTab === 'explorer' ? texts.ctaExplorer : texts.ctaProUnlimited;

  const planTabLabels = {
    free: texts.tabFree,
    explorer: texts.tabExplorer,
    pro: texts.tabPro,
  };

  const showBack = navigation.canGoBack();
  const onboardingAuthLayout = !showBack;
  const showAuthHeroLayout = true;
  const heroWaveFill = light ? screenBg : BG_TOP;
  const planHeroTopImage =
    planTab === 'explorer'
      ? require('./assets/choose-plan-explorer-hero-bottom.webp')
      : planTab === 'pro'
        ? require('./assets/choose-plan-pro-hero-bottom.webp')
        : require('./assets/choose-plan-hero-bottom.webp');
  const planHeroBottomImage =
    planTab === 'explorer'
      ? require('./assets/choose-plan-explorer-hero-top.webp')
      : planTab === 'pro'
        ? require('./assets/choose-plan-pro-hero-top.webp')
        : require('./assets/choose-plan-hero-top.webp');
  const planLayoutHeight = r.height;
  const planHeroTopInset = Math.max(
    r.insets.top,
    Platform.OS === 'android' ? Math.round(RNStatusBar.currentHeight ?? 28) : 0,
  );
  const planHeroHeight = Math.round(
    planLayoutHeight * (r.isVeryShortScreen ? 0.22 : r.isShortScreen ? 0.24 : 0.26),
  );
  const planHeroVisualBottom = planHeroHeight + PLAN_HERO_WAVE_PAD - planHeroTopInset;
  const planPhotoContentGapPx = Math.round(
    Math.min(28, Math.max(18, planLayoutHeight * 0.022)),
  );
  const planHeroSpacerHeight = Math.max(
    Math.round(planHeroHeight * (r.isVeryShortScreen ? 0.58 : r.isShortScreen ? 0.62 : 0.66)),
    planHeroVisualBottom + planPhotoContentGapPx,
  );
  const planFooterBottomBleedPx = Math.max(r.insets.bottom, 0);
  const planFooterHeroHeight = planHeroHeight;
  const planFooterHeroMinHeight = planFooterHeroHeight + PLAN_HERO_WAVE_PAD;
  const planFooterHeroMarginTopPx = Math.round(
    Math.max(10, planLayoutHeight * 0.018),
  );
  const planFooterHeroLiftPx = Math.round(
    Math.min(18, Math.max(10, planLayoutHeight * 0.016)),
  );
  const planFooterHeroImageNudgeUpPx = Math.round(
    Math.min(48, Math.max(24, planLayoutHeight * 0.032)),
  );
  const pal = light
    ? {
        grad0: '#E8EDF7',
        grad1: LIGHT_BAR_BG,
        rootSolid: screenBg,
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
        priceWas: '#B3261E',
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
        rootSolid: APP_SCREEN_BG,
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
        priceWas: '#FF6B6B',
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
    <View style={[styles.root, { backgroundColor: showAuthHeroLayout ? heroWaveFill : pal.rootSolid }]}>
      {showAuthHeroLayout ? null : (
        <LinearGradient colors={[pal.grad0, pal.grad1]} style={StyleSheet.absoluteFillObject} />
      )}
      {showAuthHeroLayout ? (
        <>
          {Platform.OS === 'android' ? (
            <RNStatusBar
              translucent
              backgroundColor="transparent"
              barStyle={light ? 'dark-content' : 'light-content'}
            />
          ) : null}
          <AuthHeroHeader
            source={planHeroTopImage}
            height={planHeroHeight}
            topInset={planHeroTopInset}
            imageContentPosition="bottom"
            waveFillColor={heroWaveFill}
            style={[
              styles.planHeroBackdrop,
              planHeroTopInset > 0 ? { top: -planHeroTopInset } : null,
            ]}
          />
        </>
      ) : null}
      {showAuthHeroLayout ? (
        <View style={{ height: planHeroSpacerHeight }} pointerEvents="none" />
      ) : null}
      {showBack && showAuthHeroLayout ? (
        <View style={styles.planTopBarOverHero} pointerEvents="box-none">
          <AppTopBar
            appTheme={light ? 'light' : 'dark'}
            leftMode="back"
            onBackPress={() => navigation.goBack()}
            hideSendButton
            transparentHeader
          />
        </View>
      ) : null}
      <View
        style={[
          styles.safe,
          showAuthHeroLayout && styles.safeOverHero,
          {
            paddingTop: showBack && !showAuthHeroLayout ? 6 : 0,
            paddingBottom: showAuthHeroLayout ? 0 : insets.bottom + (compact ? 8 : 12),
          },
        ]}
      >
        {showBack && !showAuthHeroLayout ? (
          <AppTopBar
            appTheme={light ? 'light' : 'dark'}
            leftMode="back"
            onBackPress={() => navigation.goBack()}
            replaceCenterTitle={texts.navTitle}
            hideSendButton
            transparentHeader
          />
        ) : null}
        <ScrollView
          style={[styles.scroll, showAuthHeroLayout && styles.scrollOverHero]}
          contentContainerStyle={[
            styles.scrollContent,
            (onboardingAuthLayout || showAuthHeroLayout) && styles.scrollContentOnboarding,
            compact && styles.scrollContentCompact,
            showAuthHeroLayout && styles.scrollContentHeroFooter,
            {
              paddingHorizontal: r.horizontalPadding,
              paddingTop: showAuthHeroLayout ? planPhotoContentGapPx : 0,
              flexGrow: showAuthHeroLayout ? 1 : undefined,
              alignItems: showAuthHeroLayout ? 'stretch' : undefined,
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!showAuthHeroLayout}
          bounces={showAuthHeroLayout ? false : !onboardingAuthLayout}
          alwaysBounceVertical={false}
          overScrollMode={showAuthHeroLayout ? 'never' : 'auto'}
        >
          <View
            style={
              onboardingAuthLayout
                ? styles.planCenterWrap
                : showAuthHeroLayout && showBack
                  ? styles.planSettingsBody
                  : null
            }
          >
          <Text
            style={[
              styles.cardHeading,
              styles.cardHeadingAbovePitch,
              { fontSize: cardHeadingSize, color: pal.cardHeading },
            ]}
          >
            {texts.cardHeading}
          </Text>
          {!showBack ? (
            <>
              <Text style={[styles.title, { fontSize: titleSize, lineHeight: titleSize + 4, color: pal.title }]}>
                {texts.title}
              </Text>
              <View style={[styles.headerPitch, compact && styles.headerPitchCompact]}>
                <Text
                  style={[
                    styles.headerPitchTitle,
                    compact && styles.headerPitchTitleCompact,
                    { color: pal.footerTitle },
                  ]}
                >
                  {texts.footerPitchTitle}
                </Text>
                <Text
                  style={[
                    styles.headerPitchBody,
                    compact && styles.headerPitchBodyCompact,
                    { color: pal.footerBody, opacity: light ? 1 : 0.92 },
                  ]}
                >
                  {texts.footerPitchBody}
                </Text>
              </View>
            </>
          ) : (
            <View style={[styles.headerPitch, compact && styles.headerPitchCompact]}>
              <Text
                style={[
                  styles.headerPitchTitle,
                  compact && styles.headerPitchTitleCompact,
                  { color: pal.footerTitle },
                ]}
              >
                {texts.footerPitchTitle}
              </Text>
              <Text
                style={[
                  styles.headerPitchBody,
                  compact && styles.headerPitchBodyCompact,
                  { color: pal.footerBody, opacity: light ? 1 : 0.92 },
                ]}
              >
                {texts.footerPitchBody}
              </Text>
            </View>
          )}

          <View style={[styles.segmentRow, texts.explorerBadge ? styles.segmentRowWithBadge : null]}>
            {PLAN_TABS.map((key) => {
              const isActive = planTab === key;
              const showExplorerBadge = key === 'explorer' && !!texts.explorerBadge;
              return (
              <View key={key} style={styles.segmentSlot}>
                {showExplorerBadge ? (
                  <View style={styles.explorerBadgeWrap} pointerEvents="none">
                    <View
                      style={[
                        styles.explorerBadgeChip,
                        {
                          backgroundColor: light ? BRAND_BLUE : ACCENT,
                          borderColor: light ? 'rgba(255,255,255,0.35)' : 'rgba(16,16,16,0.12)',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.explorerBadgeText,
                          { color: light ? '#FFFFFF' : '#101010' },
                        ]}
                        numberOfLines={1}
                      >
                        {texts.explorerBadge}
                      </Text>
                    </View>
                  </View>
                ) : null}
                <Pressable
                  style={[
                    styles.segmentBtn,
                    showExplorerBadge && styles.segmentBtnWithBadge,
                    {
                      backgroundColor: isActive ? ACCENT : pal.segmentBg,
                      borderColor: isActive
                        ? light
                          ? BRAND_BLUE
                          : ACCENT
                        : light
                          ? 'rgba(98, 134, 228, 0.22)'
                          : key === 'explorer'
                            ? pal.explorerOutline
                            : 'transparent',
                      borderWidth: light ? (isActive ? 2 : 1) : isActive ? 2 : key === 'explorer' ? 1 : 0,
                    },
                  ]}
                  onPress={() => setPlanTabAndPage(key)}
                  accessibilityRole="button"
                  accessibilityLabel={planTabLabels[key]}
                  accessibilityState={{ selected: isActive }}
                >
                  <Text
                    style={[
                      styles.segmentLabel,
                      { color: isActive ? pal.segmentLabelActive : pal.segmentLabel },
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    allowFontScaling={false}
                  >
                    {planTabLabels[key]}
                  </Text>
                </Pressable>
              </View>
            );
            })}
          </View>

          <View
            style={[
              showAuthHeroLayout && styles.planMainCenter,
            ]}
          >
          <View style={styles.planBodyWrap}>
            <PagerView
              ref={pagerRef}
              style={[
                styles.planPager,
                { height: pagerHeight },
              ]}
              initialPage={planIndex}
              onPageSelected={(e) => {
                const i = e?.nativeEvent?.position ?? 0;
                const key = PLAN_TABS[i] || 'explorer';
                setPlanTab(key);
              }}
            >
              {PLAN_TABS.map((key) => {
                const bullets = bulletsFor(key);
                return (
                  <View
                    key={key}
                    collapsable={false}
                    onLayout={(ev) => {
                      const h = Math.round(ev?.nativeEvent?.layout?.height || 0);
                      if (h > 0 && pageHeightsRef.current[key] !== h) {
                        pageHeightsRef.current[key] = h;
                        syncPagerHeight();
                      }
                    }}
                    style={[
                      styles.planPagerPage,
                      styles.planBody,
                      compact && styles.planBodyCompact,
                      key !== 'free' && styles.planBodyPaidTail,
                    ]}
                  >
                    <View style={[styles.priceBlock, compact && styles.priceBlockCompact]}>
                      {key === 'pro' ? (
                        <>
                          <View style={styles.priceMainRow}>
                            <Text style={[styles.priceMain, { fontSize: priceMainSize, color: pal.textMain }]}>
                              ${PRO_PRICE_USD.toFixed(2)}
                            </Text>
                            <Text style={[styles.priceSlash, { color: pal.priceMuted }]}> /</Text>
                            <Text style={[styles.pricePeriod, { color: pal.priceMuted }]}> {texts.proPricePeriod}</Text>
                            <Text style={[styles.priceWas, styles.priceWasInline, { color: pal.priceWas }]}>
                              ${PRO_LIST_PRICE_USD.toFixed(2)}
                            </Text>
                          </View>
                          {texts.proHint ? (
                            <Text style={[styles.hint, { color: pal.hint }]}>{texts.proHint}</Text>
                          ) : null}
                        </>
                      ) : key === 'explorer' ? (
                        <>
                          <View style={styles.priceMainRow}>
                            <Text style={[styles.priceMain, { fontSize: priceMainSize, color: pal.textMain }]}>
                              ${EXPLORER_PRICE_USD.toFixed(2)}
                            </Text>
                            <Text style={[styles.priceSlash, { color: pal.priceMuted }]}> /</Text>
                            <Text style={[styles.pricePeriod, { color: pal.priceMuted }]}> {texts.explorerPricePeriod}</Text>
                          </View>
                          {texts.explorerHint ? (
                            <Text style={[styles.hint, { color: pal.hint }]}>{texts.explorerHint}</Text>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <Text style={[styles.priceMain, { fontSize: priceMainSize, color: pal.textMain }]}>
                            {texts.freePrice}
                          </Text>
                          <Text style={[styles.hint, { color: pal.hint }]}>{texts.freeHint}</Text>
                        </>
                      )}
                    </View>

                    <View style={[styles.divider, compact && styles.dividerCompact, { backgroundColor: pal.divider }]} />

                    <View style={styles.bulletList}>
                      {bullets.map((line, i) => (
                        <View key={i} style={[styles.bulletItem, compact && styles.bulletItemCompact]}>
                          <Ionicons
                            name="checkmark-circle"
                            size={bulletIconSize}
                            color={pal.bulletIcon}
                            style={styles.bulletIcon}
                          />
                          <Text
                            style={[
                              styles.bullet,
                              { fontSize: bulletSize, lineHeight: bulletLineHeight, color: pal.bullet },
                            ]}
                          >
                            {line}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </PagerView>
          </View>

          <Lemon3DButton
            label={primaryLabel}
            onPress={onPrimary}
            disabled={!!busy}
            loading={primaryBusy}
            minHeight={btnMinHeight}
            textStyle={[
              planTab === 'free' ? styles.btnSecondaryText : styles.btnPrimaryText,
              compact && styles.btnTextCompact,
            ]}
            style={[
              styles.btnBelowCard,
              planTab === 'free' ? styles.btnSecondaryWrap : styles.btnPrimaryWrap,
            ]}
          />
          </View>

          </View>

          {showAuthHeroLayout ? (
            <View
              style={[
                styles.planFooterHeroFlow,
                {
                  marginTop: showAuthHeroLayout ? 'auto' : planFooterHeroMarginTopPx,
                  marginHorizontal: -r.horizontalPadding,
                  marginBottom: -(planFooterBottomBleedPx + planFooterHeroLiftPx),
                  transform: [{ translateY: -planFooterHeroLiftPx }],
                  width: r.width,
                  alignSelf: 'center',
                  minHeight: planFooterHeroMinHeight + planFooterBottomBleedPx,
                },
              ]}
              pointerEvents="none"
            >
              <AuthHeroHeader
                source={planHeroBottomImage}
                width={r.width}
                height={planFooterHeroHeight}
                waveEdge="top"
                imageContentPosition="bottom"
                imageNudgeY={-planFooterHeroImageNudgeUpPx}
                bottomBleedPx={planFooterBottomBleedPx}
                waveFillColor={heroWaveFill}
                style={styles.planFooterHeroHeader}
              />
            </View>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG_TOP, overflow: 'visible' },
  planHeroBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  planTopBarOverHero: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 3,
  },
  safeOverHero: {
    overflow: 'visible',
  },
  planSettingsBody: {
    width: '100%',
    flexGrow: 1,
  },
  planMainCenter: {
    flexGrow: 1,
    justifyContent: 'center',
    width: '100%',
  },
  planFooterHeroFlow: {
    overflow: 'visible',
  },
  planFooterHeroHeader: {
    width: '100%',
    alignSelf: 'stretch',
  },
  planCenterWrap: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    width: '100%',
  },
  safe: { flex: 1 },
  title: {
    ...brandFontText,
    fontWeight: '700',
    color: ACCENT,
    textAlign: 'center',
    marginBottom: 4,
  },
  headerPitch: {
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  headerPitchCompact: {
    marginBottom: 8,
  },
  headerPitchTitle: {
    ...brandFontText,
    fontWeight: '700',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 6,
  },
  headerPitchTitleCompact: {
    fontSize: 14,
    marginBottom: 4,
  },
  headerPitchBody: {
    ...brandFontText,
    fontWeight: '300',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  headerPitchBodyCompact: {
    fontSize: 11,
    lineHeight: 16,
  },
  scroll: { flex: 1, backgroundColor: 'transparent' },
  scrollOverHero: { overflow: 'visible' },
  scrollContent: { paddingBottom: 16, gap: 8 },
  scrollContentOnboarding: {
    flexGrow: 1,
    paddingBottom: 0,
  },
  scrollContentHeroFooter: {
    paddingBottom: 0,
  },
  scrollContentCompact: { paddingBottom: 8, gap: 6 },
  segmentRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  segmentRowWithBadge: {
    paddingTop: 11,
    marginBottom: 8,
  },
  segmentSlot: {
    flex: 1,
    position: 'relative',
  },
  explorerBadgeWrap: {
    position: 'absolute',
    top: -11,
    left: 0,
    right: 0,
    zIndex: 2,
    alignItems: 'center',
  },
  explorerBadgeChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '100%',
  },
  explorerBadgeText: {
    ...brandFontText,
    fontWeight: '700',
    fontSize: 9,
    letterSpacing: 0.35,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  segmentBtn: {
    width: '100%',
    minHeight: 42,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(42, 42, 42, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnWithBadge: {
    paddingTop: 14,
  },
  segmentLabel: {
    ...brandFontSansMedium,
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 16,
    textAlign: 'center',
  },
  planBodyWrap: {
    width: '100%',
    marginTop: 6,
    paddingTop: 2,
    paddingHorizontal: 0,
    alignItems: 'stretch',
  },
  planPager: {
    width: '100%',
  },
  planPagerPage: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
  },
  planBody: {
    width: '100%',
    paddingTop: 0,
    paddingHorizontal: 10,
  },
  planBodyPaidTail: {
    paddingBottom: 0,
  },
  planBodyCompact: {
    marginTop: 4,
  },
  cardHeading: {
    ...brandFontText,
    fontWeight: '600',
    fontSize: 11,
    color: ACCENT,
    textAlign: 'center',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 10,
    opacity: 0.88,
  },
  cardHeadingAbovePitch: {
    marginBottom: 6,
  },
  priceBlock: {
    alignItems: 'center',
    marginBottom: 12,
  },
  priceBlockCompact: {
    marginBottom: 10,
  },
  priceWas: {
    ...brandFontText,
    fontWeight: '400',
    fontSize: 14,
    color: '#FF6B6B',
    textDecorationLine: 'line-through',
    marginBottom: 4,
  },
  priceWasInline: {
    marginBottom: 0,
    marginLeft: 8,
    fontSize: 13,
  },
  priceMainRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  priceMain: {
    ...brandFontText,
    fontWeight: '700',
    fontSize: 21,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  priceSlash: {
    ...brandFontText,
    fontWeight: '500',
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
  },
  pricePeriod: {
    ...brandFontText,
    fontWeight: '400',
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
  },
  hint: {
    ...brandFontText,
    fontWeight: '300',
    fontSize: 11,
    color: '#AAAAAA',
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 15,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginTop: 2,
    marginBottom: 10,
    alignSelf: 'flex-start',
    width: '100%',
    maxWidth: 280,
  },
  dividerCompact: {
    marginBottom: 8,
  },
  bulletList: {
    alignSelf: 'flex-start',
    width: '100%',
    maxWidth: 280,
    alignItems: 'flex-start',
    paddingHorizontal: 0,
    marginBottom: 0,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    marginBottom: 7,
  },
  bulletItemCompact: {
    marginBottom: 5,
  },
  bulletIcon: {
    marginRight: 7,
    marginTop: 1,
    flexShrink: 0,
  },
  socialTag: {
    ...brandFontText,
    fontWeight: '500',
    fontSize: 11,
    color: '#C8E86C',
    marginTop: 10,
    marginBottom: 20,
    textAlign: 'center',
  },
  bullet: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    ...brandFontText,
    fontWeight: '300',
    fontSize: 12,
    color: '#FFFFFF',
    lineHeight: 17,
    textAlign: 'left',
  },
  proNote: {
    ...brandFontText,
    fontWeight: '300',
    fontSize: 10,
    color: '#AAAAAA',
    lineHeight: 14,
    marginTop: 8,
    marginBottom: 20,
    textAlign: 'center',
  },
  cardFootnote: {
    marginBottom: 0,
  },
  btnBelowCard: {
    marginTop: 2,
    marginBottom: 8,
    paddingTop: 0,
    alignSelf: 'center',
    width: '82%',
    maxWidth: 300,
  },
  btnSecondaryWrap: {
    marginTop: 0,
  },
  btnSecondaryText: {
    ...brandFontText,
    fontWeight: '600',
    fontSize: 15,
    color: '#101010',
  },
  btnPrimaryWrap: {
    marginTop: 0,
  },
  btnPrimaryText: {
    ...brandFontText,
    fontWeight: '600',
    fontSize: 15,
    color: '#101010',
  },
  btnTextCompact: {
    fontSize: 14,
  },
});

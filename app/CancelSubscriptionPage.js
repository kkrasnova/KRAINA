import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  Linking,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { LIGHT_BAR_BG } from './AppTopBar';
import { useAppTheme } from './useAppTheme';
import { useSyncedAppLanguage } from './useAppLanguage';
import { st } from './settingsI18n';
import { getChoosePlanTexts } from './choosePlanI18n';
import { lightTabBarExtraScrollPadding } from './LightBottomTabBar';
import { rippleOnDarkSurface, rippleOnLightSurface } from './androidFeedback';
import {
  getSubscriptionState,
  setPlanChoice,
  applyRetentionOffer,
  hasUsedRetentionOffer,
} from './subscriptionStorage';
import { postBillingCancelFeedback } from './auth/endpoints';
import { useAuthStore } from './auth/authStore';
import { ApiError } from './auth/types';
import { isAppAdminUser } from './adminGate';

const ANDROID_PACKAGE = 'com.kraina.app';
const BORDER_LIGHT = 'rgba(30, 30, 30, 0.12)';
const BRAND_BLUE = '#6286E4';
const ACCENT = '#E1FF00';
const FIGMA_TEXT = '#1E1E1E';
const FIGMA_ICON_MUTED = '#727272';
const FIGMA_LSP = -0.14;

const CANCEL_REASON_DEFS = [
  { id: 'too_expensive', labelKey: 'cancelReasonTooExpensive' },
  { id: 'rarely_use', labelKey: 'cancelReasonRarelyUse' },
  { id: 'missing_features', labelKey: 'cancelReasonMissingFeatures' },
  { id: 'bugs_crash', labelKey: 'cancelReasonBugs' },
  { id: 'switched_app', labelKey: 'cancelReasonOtherApp' },
  { id: 'other', labelKey: 'cancelReasonOther' },
];

function planLabel(texts, tier) {
  if (tier === 'explorer') return texts.tabExplorer;
  if (tier === 'pro') return texts.tabPro;
  if (tier === 'family') return 'Family';
  return texts.tabFree;
}

function retentionBody(texts, reasons, planName) {
  const tpl = reasons.includes('too_expensive')
    ? texts.cancelRetentionDiscountBody
    : reasons.includes('rarely_use')
      ? texts.cancelRetentionRarelyBody
      : texts.cancelRetentionGenericBody;
  return tpl.replace(/\{plan\}/g, planName);
}

export default function CancelSubscriptionPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const user = route?.params?.user || {};
  const { appTheme, isLight: light, screenBg } = useAppTheme(route?.params?.appTheme);
  const texts = getChoosePlanTexts(language);
  const authUser = useAuthStore((s) => s.user);

  const [paidTier, setPaidTier] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState('reason');
  const [cancelReasons, setCancelReasons] = useState([]);
  const [cancelComment, setCancelComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [retentionUsed, setRetentionUsed] = useState(false);

  const accountDisplay = useMemo(() => {
    const email =
      (authUser?.email && String(authUser.email).trim()) || (user?.email && String(user.email).trim());
    if (email) return email;
    const un =
      (authUser?.username && String(authUser.username).trim()) ||
      (user?.username && String(user.username).trim());
    if (un) return un;
    const id = authUser?.id ?? user?.id;
    if (id != null && String(id).trim() !== '') return String(id);
    return texts.cancelAccountPlaceholder;
  }, [authUser, user, texts.cancelAccountPlaceholder]);

  const storeSubscriptionsUrl = useMemo(
    () =>
      Platform.OS === 'ios'
        ? 'https://apps.apple.com/account/subscriptions'
        : `https://play.google.com/store/account/subscriptions?package=${ANDROID_PACKAGE}`,
    [],
  );

  const storeManageCta =
    Platform.OS === 'ios' ? texts.cancelOpenStoreCtaIos : texts.cancelOpenStoreCtaAndroid;
  const storeTag = Platform.OS === 'ios' ? texts.cancelStoreTagIos : texts.cancelStoreTagAndroid;

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        try {
          if (isAppAdminUser(user)) {
            if (!cancelled) {
              setPaidTier(null);
              setRetentionUsed(true);
            }
            return;
          }
          const s = await getSubscriptionState(user);
          const tier =
            s.isPaidActive && (s.tier === 'explorer' || s.tier === 'pro' || s.tier === 'family')
              ? s.tier
              : null;
          const used = tier ? await hasUsedRetentionOffer(user) : true;
          if (!cancelled) {
            setPaidTier(tier);
            setRetentionUsed(used);
            setStep('reason');
            setCancelReasons([]);
            setCancelComment('');
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [user?.id, user?.email, user?.firebaseUid]),
  );

  const toggleCancelReason = useCallback((id) => {
    setCancelReasons((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const onContinueFromReason = useCallback(() => {
    if (cancelReasons.length === 0) {
      Alert.alert(texts.cancelModalTitle, texts.cancelNeedReason);
      return;
    }
    if (retentionUsed) setStep('confirm');
    else setStep('offer');
  }, [cancelReasons.length, retentionUsed, texts]);

  const onStayWithBonus = useCallback(async () => {
    if (!paidTier) return;
    setBusy(true);
    try {
      const result = await applyRetentionOffer(user, 30);
      if (!result.ok) {
        Alert.alert(texts.cancelErrorTitle, texts.cancelErrorBody);
        return;
      }
      const planName = planLabel(texts, paidTier);
      Alert.alert(
        texts.cancelRetentionSuccessTitle,
        texts.cancelRetentionSuccessBody.replace(/\{plan\}/g, planName),
        [{ text: texts.cancelSuccessDismiss, onPress: () => navigation.goBack() }],
      );
    } catch {
      Alert.alert(texts.cancelErrorTitle, texts.cancelErrorBody);
    } finally {
      setBusy(false);
    }
  }, [navigation, paidTier, texts, user]);

  const onConfirmCancel = useCallback(async () => {
    if (cancelReasons.length === 0) {
      Alert.alert(texts.cancelModalTitle, texts.cancelNeedReason);
      return;
    }
    if (paidTier !== 'explorer' && paidTier !== 'pro' && paidTier !== 'family') return;

    setBusy(true);
    try {
      const token = useAuthStore.getState().accessToken;
      if (token) {
        await postBillingCancelFeedback(token, {
          previous_plan: paidTier,
          reason_codes: cancelReasons,
          comment: cancelComment.trim() || null,
          app_language: language || null,
        });
      }
      await setPlanChoice(user, 'free');
      setPaidTier(null);
      const successBody = token ? texts.cancelSuccessBody : `${texts.cancelSuccessBody}\n\n${texts.cancelNoSessionBody}`;
      Alert.alert(texts.cancelSuccessTitle, successBody, [
        { text: texts.cancelSuccessDismiss, style: 'cancel', onPress: () => navigation.goBack() },
        {
          text: storeManageCta,
          onPress: () => void Linking.openURL(storeSubscriptionsUrl).catch(() => {}),
        },
      ]);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? JSON.stringify(e.payload || {}) || e.message
          : String(e?.message || '');
      Alert.alert(texts.cancelErrorTitle, msg ? `${texts.cancelErrorBody}\n${msg}` : texts.cancelErrorBody);
    } finally {
      setBusy(false);
    }
  }, [
    cancelComment,
    cancelReasons,
    language,
    navigation,
    paidTier,
    storeManageCta,
    storeSubscriptionsUrl,
    texts,
    user,
  ]);

  const labelColor = light ? FIGMA_TEXT : '#FFFFFF';
  const mutedColor = light ? FIGMA_ICON_MUTED : 'rgba(255, 248, 235, 0.86)';
  const borderColor = light ? BORDER_LIGHT : 'rgba(255, 255, 255, 0.26)';
  const cardFill = light ? '#FFFFFF' : '#1E2128';
  const ripple = light ? rippleOnLightSurface : rippleOnDarkSurface;
  const pressedBg = light ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.11)';
  const hintRingColor = light ? 'rgba(98, 134, 228, 0.42)' : 'rgba(225, 255, 0, 0.42)';
  const hintFill = light ? 'rgba(98, 134, 228, 0.08)' : 'rgba(225, 255, 0, 0.14)';
  const heroStroke = light ? 'rgba(98, 134, 228, 0.28)' : 'rgba(225, 255, 0, 0.38)';
  const heroGradColors = light
    ? ['#C9D7FA', '#E8EEFF', '#F6F8FF']
    : ['#343A28', '#1E2218', '#12150E'];
  const heroGradEnd = light ? { x: 1, y: 1 } : { x: 1, y: 0.85 };
  const heroShadowStyle = light
    ? {
        shadowColor: BRAND_BLUE,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 22,
        elevation: 6,
      }
    : {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.65,
        shadowRadius: 28,
        elevation: 14,
      };
  const heroSubtitleColor = light ? 'rgba(30, 30, 30, 0.62)' : 'rgba(255, 255, 255, 0.82)';
  const geoIconWrap = [styles.notifIconWrap, light ? styles.notifIconWrapLight : styles.geoNotifIconWrapDark];

  const planName = planLabel(texts, paidTier);
  const stepLabels = [texts.cancelStepReasons, texts.cancelStepOffer, texts.cancelStepConfirm];
  const stepIndex = step === 'reason' ? 0 : step === 'offer' ? 1 : 2;

  const heroIcon =
    step === 'offer' ? 'gift-outline' : step === 'confirm' ? 'alert-circle-outline' : 'card-outline';
  const heroTitle =
    step === 'offer'
      ? texts.cancelRetentionTitle
      : step === 'confirm'
        ? texts.cancelFinalTitle
        : texts.cancelPageTitle;
  const heroSubtitle =
    step === 'offer'
      ? retentionBody(texts, cancelReasons, planName)
      : step === 'confirm'
        ? texts.cancelFinalBody
        : texts.cancelModalSubtitle;

  const renderStepIndicator = () => (
    <View style={styles.stepRow}>
      {stepLabels.map((label, i) => {
        const active = i === stepIndex;
        const done = i < stepIndex;
        return (
          <View key={label} style={styles.stepItem}>
            <View
              style={[
                styles.stepDot,
                {
                  backgroundColor: active || done ? (light ? BRAND_BLUE : ACCENT) : borderColor,
                },
              ]}
            />
            <Text
              style={[
                styles.stepLabel,
                { color: active ? labelColor : mutedColor, fontWeight: active ? '700' : '500' },
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );

  const renderReasonStep = () => (
    <>
      <Text style={[styles.geoSectionLabel, { color: mutedColor }]}>{texts.cancelCurrentPlan}</Text>
      <View style={[styles.geoRingOuterCard, { backgroundColor: borderColor }]}>
        <View style={[styles.geoRingInnerCard, { backgroundColor: cardFill }]} collapsable={false}>
          <View style={[styles.notifRow, styles.notifRowSingle]}>
            <View style={geoIconWrap}>
              <Ionicons name="person" size={22} color={light ? BRAND_BLUE : ACCENT} />
            </View>
            <View style={styles.notifRowTexts}>
              <Text style={[styles.notifRowTitle, { color: labelColor }]}>{texts.cancelAccountHeading}</Text>
              <Text style={[styles.notifRowSubtitle, { color: mutedColor }]} numberOfLines={2}>
                {accountDisplay}
              </Text>
              <Text style={[styles.storeTag, { color: light ? BRAND_BLUE : ACCENT }]} numberOfLines={2}>
                {storeTag}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <Text style={[styles.geoSectionLabel, { color: mutedColor }]}>{texts.cancelReasonPrompt}</Text>
      <View style={[styles.geoRingOuterCard, { backgroundColor: borderColor }]}>
        <View
          style={[styles.geoRingInnerCard, { backgroundColor: cardFill, paddingHorizontal: 14, paddingVertical: 14 }]}
          collapsable={false}
        >
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
                      borderColor: on ? (light ? BRAND_BLUE : ACCENT) : borderColor,
                      backgroundColor: on
                        ? light
                          ? 'rgba(98, 134, 228, 0.14)'
                          : 'rgba(225, 255, 0, 0.12)'
                        : light
                          ? '#FAFAFA'
                          : 'rgba(255,255,255,0.05)',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipLabel,
                      { color: labelColor, fontWeight: on ? '600' : '400' },
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
                color: labelColor,
                borderColor,
                backgroundColor: light ? '#F7F8FC' : 'rgba(0,0,0,0.2)',
              },
            ]}
            maxLength={2000}
          />
        </View>
      </View>
    </>
  );

  const renderOfferStep = () => (
    <>
      <Text style={[styles.geoSectionLabel, { color: mutedColor }]}>{texts.cancelRetentionDiscountTitle}</Text>
      <View style={[styles.geoRingOuterCard, { backgroundColor: borderColor }]}>
        <View
          style={[styles.geoRingInnerCard, { backgroundColor: cardFill, paddingHorizontal: 16, paddingVertical: 16 }]}
          collapsable={false}
        >
          <Text style={[styles.privacyRingSectionTitle, { color: labelColor }]}>{texts.cancelRetentionTitle}</Text>
          <Text style={[styles.geoHintText, { color: mutedColor }]}>{retentionBody(texts, cancelReasons, planName)}</Text>
        </View>
      </View>
    </>
  );

  const renderConfirmStep = () => (
    <>
      <Text style={[styles.geoSectionLabel, { color: mutedColor }]}>{texts.cancelFinalTitle}</Text>
      <View style={[styles.geoRingOuterCard, { backgroundColor: borderColor }]}>
        <View
          style={[styles.geoRingInnerCard, { backgroundColor: cardFill, paddingHorizontal: 16, paddingVertical: 16 }]}
          collapsable={false}
        >
          <Text style={[styles.privacyRingSectionTitle, { color: labelColor }]}>{planName}</Text>
          <Text style={[styles.geoHintText, { color: mutedColor, marginBottom: 12 }]}>{texts.cancelFinalBody}</Text>
          <View style={[styles.privacyProseDivider, { backgroundColor: borderColor }]} />
          <Text style={[styles.geoHintText, { color: mutedColor, marginBottom: 12 }]}>{texts.cancelBillingExplainer}</Text>
          <Pressable
            onPress={() => void Linking.openURL(storeSubscriptionsUrl).catch(() => {})}
            style={({ pressed }) => [
              styles.storeBtn,
              {
                borderColor: light ? BRAND_BLUE : ACCENT,
                backgroundColor: light ? 'rgba(98, 134, 228, 0.1)' : 'rgba(225, 255, 0, 0.1)',
                opacity: pressed ? 0.88 : 1,
              },
            ]}
            android_ripple={ripple}
          >
            <Ionicons
              name={Platform.OS === 'ios' ? 'logo-apple' : 'logo-google'}
              size={20}
              color={light ? BRAND_BLUE : ACCENT}
            />
            <Text style={[styles.storeBtnTxt, { color: light ? BRAND_BLUE : ACCENT }]}>{storeManageCta}</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.geoHintRingOuter, { backgroundColor: hintRingColor, marginTop: 4 }]}>
        <View style={[styles.geoHintRingInner, { backgroundColor: hintFill }]} collapsable={false}>
          <Ionicons
            name="information-circle-outline"
            size={22}
            color={light ? BRAND_BLUE : ACCENT}
            style={{ marginRight: 10, marginTop: 1 }}
          />
          <Text style={[styles.geoHintText, { color: labelColor, flex: 1 }]}>{texts.cancelFinalHint}</Text>
        </View>
      </View>
    </>
  );

  const renderEmptyState = () => (
    <View style={[styles.geoRingOuterCard, { backgroundColor: borderColor, marginTop: 8 }]}>
      <View
        style={[styles.geoRingInnerCard, { backgroundColor: cardFill, paddingHorizontal: 16, paddingVertical: 20 }]}
        collapsable={false}
      >
        <Text style={[styles.privacyRingSectionTitle, { color: labelColor, textAlign: 'center' }]}>
          {texts.cancelNoActiveTitle}
        </Text>
        <Text style={[styles.geoHintText, { color: mutedColor, textAlign: 'center', marginTop: 8 }]}>
          {texts.cancelNoActiveBody}
        </Text>
        <Pressable
          onPress={() => navigation.replace('ChoosePlan', { ...route?.params, fromSettings: true })}
          style={({ pressed }) => [
            styles.primaryBtn,
            {
              backgroundColor: light ? BRAND_BLUE : ACCENT,
              opacity: pressed ? 0.9 : 1,
              marginTop: 18,
            },
          ]}
        >
          <Text style={[styles.primaryBtnText, { color: light ? '#FFFFFF' : '#101010' }]}>{texts.cancelGoPlans}</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderActions = () => {
    if (!paidTier) return null;
    if (step === 'reason') {
      return (
        <View style={styles.actions}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [
              styles.ghostBtn,
              { borderColor, opacity: pressed ? 0.88 : 1 },
            ]}
          >
            <Text style={[styles.ghostBtnText, { color: labelColor }]}>{texts.cancelBack}</Text>
          </Pressable>
          <Pressable
            onPress={onContinueFromReason}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: light ? BRAND_BLUE : ACCENT, opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <Text style={[styles.primaryBtnText, { color: light ? '#FFFFFF' : '#101010' }]}>
              {texts.cancelContinue}
            </Text>
          </Pressable>
        </View>
      );
    }
    if (step === 'offer') {
      return (
        <View style={styles.actionsCol}>
          <Pressable
            onPress={onStayWithBonus}
            disabled={busy}
            style={({ pressed }) => [
              styles.primaryBtn,
              styles.primaryBtnWide,
              { backgroundColor: light ? BRAND_BLUE : ACCENT, opacity: busy ? 0.7 : pressed ? 0.9 : 1 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={light ? '#FFFFFF' : '#101010'} />
            ) : (
              <Text style={[styles.primaryBtnText, { color: light ? '#FFFFFF' : '#101010' }]}>
                {texts.cancelRetentionStayCta}
              </Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => setStep('confirm')}
            disabled={busy}
            style={({ pressed }) => [
              styles.ghostBtn,
              styles.primaryBtnWide,
              { borderColor, opacity: busy ? 0.5 : pressed ? 0.88 : 1 },
            ]}
          >
            <Text style={[styles.ghostBtnText, { color: mutedColor }]}>{texts.cancelRetentionDecline}</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.actions}>
        <Pressable
          onPress={() => setStep(retentionUsed ? 'reason' : 'offer')}
          disabled={busy}
          style={({ pressed }) => [
            styles.ghostBtn,
            { borderColor, opacity: busy ? 0.5 : pressed ? 0.88 : 1 },
          ]}
        >
          <Text style={[styles.ghostBtnText, { color: labelColor }]}>{texts.cancelBack}</Text>
        </Pressable>
        <Pressable
          onPress={onConfirmCancel}
          disabled={busy}
          style={({ pressed }) => [
            styles.dangerBtn,
            { opacity: busy ? 0.7 : pressed ? 0.9 : 1 },
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.dangerBtnText}>{texts.cancelConfirm}</Text>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      <AppTopBar
        appTheme={appTheme}
        leftMode="back"
        onBackPress={() => navigation.goBack()}
        centerSubtitle={st(language, 'cancelSubscriptionRow')}
        hideSendButton
        lightBarBackgroundColor={light ? LIGHT_BAR_BG : undefined}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(28, insets.bottom + 24) + lightTabBarExtraScrollPadding() },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={light ? styles.lightList : styles.darkListWrap}>
          {loading ? (
            <ActivityIndicator
              style={{ marginTop: 40 }}
              color={light ? BRAND_BLUE : ACCENT}
            />
          ) : !paidTier ? (
            renderEmptyState()
          ) : (
            <>
              <View collapsable={false} style={[styles.geoHeroShell, heroShadowStyle, { borderColor: heroStroke }]}>
                <LinearGradient
                  colors={heroGradColors}
                  locations={light ? [0, 0.55, 1] : [0, 0.45, 1]}
                  start={{ x: 0, y: 0 }}
                  end={heroGradEnd}
                  style={styles.geoHeroGradient}
                >
                  <View
                    style={[styles.geoHeroIconWrap, light ? styles.geoHeroIconWrapLight : styles.geoHeroIconWrapDark]}
                  >
                    <Ionicons name={heroIcon} size={30} color={light ? BRAND_BLUE : ACCENT} />
                  </View>
                  <Text style={[styles.geoHeroTitle, { color: labelColor }]}>{heroTitle}</Text>
                  <Text style={[styles.geoHeroSubtitle, { color: heroSubtitleColor }]}>{heroSubtitle}</Text>
                </LinearGradient>
              </View>

              {renderStepIndicator()}

              {step === 'reason' ? renderReasonStep() : null}
              {step === 'offer' ? renderOfferStep() : null}
              {step === 'confirm' ? renderConfirmStep() : null}

              {renderActions()}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 0, paddingTop: 4 },
  lightList: { alignSelf: 'stretch', backgroundColor: LIGHT_BAR_BG },
  darkListWrap: { alignSelf: 'stretch' },
  geoHeroShell: {
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  geoHeroGradient: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderRadius: 20,
    overflow: 'hidden',
  },
  geoHeroTitle: {
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.35,
    marginBottom: 8,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  geoHeroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: FIGMA_LSP,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  geoHeroIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  geoHeroIconWrapLight: {
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(98, 134, 228, 0.35)',
    ...Platform.select({
      ios: {
        shadowColor: BRAND_BLUE,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 10,
      },
      android: { elevation: 3 },
    }),
  },
  geoHeroIconWrapDark: {
    backgroundColor: 'rgba(225, 255, 0, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(225, 255, 0, 0.45)',
    ...Platform.select({
      ios: {
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
    }),
  },
  geoSectionLabel: {
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  geoRingOuterCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 15,
    padding: 1,
  },
  geoRingInnerCard: { borderRadius: 14 },
  geoHintRingOuter: {
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 4,
    borderRadius: 15,
    padding: 1,
  },
  geoHintRingInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  geoHintText: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: FIGMA_LSP,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  privacyRingSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: FIGMA_LSP,
    marginBottom: 6,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  privacyProseDivider: {
    height: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginVertical: 12,
  },
  notifIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  notifIconWrapLight: { backgroundColor: 'rgba(98, 134, 228, 0.14)' },
  geoNotifIconWrapDark: { backgroundColor: 'rgba(255, 255, 255, 0.2)' },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 58,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  notifRowSingle: { borderBottomWidth: 0 },
  notifRowTexts: { flex: 1, minWidth: 0, paddingRight: 8 },
  notifRowTitle: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: FIGMA_LSP,
    marginBottom: 2,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  notifRowSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: FIGMA_LSP,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  storeTag: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginBottom: 6,
    gap: 8,
  },
  stepItem: { flex: 1, alignItems: 'center', minWidth: 0 },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 6,
  },
  stepLabel: {
    fontSize: 11,
    textAlign: 'center',
    letterSpacing: 0.2,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    maxWidth: '100%',
  },
  chipLabel: {
    fontSize: 13,
    lineHeight: 18,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  commentInput: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: 'top',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  storeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  storeBtnTxt: {
    fontSize: 14,
    fontWeight: '600',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 8,
  },
  actionsCol: {
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 8,
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryBtnWide: { flex: 0, width: '100%' },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  ghostBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  ghostBtnText: {
    fontSize: 15,
    fontWeight: '600',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  dangerBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#B3261E',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  dangerBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
});

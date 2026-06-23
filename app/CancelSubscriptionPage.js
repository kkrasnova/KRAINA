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
import Ionicons from '@expo/vector-icons/Ionicons';
import AppTopBar, { LIGHT_BAR_BG } from './AppTopBar';
import { useAppTheme } from './useAppTheme';
import { useSyncedAppLanguage } from './useAppLanguage';
import { st } from './settingsI18n';
import { getChoosePlanTexts } from './choosePlanI18n';
import { lightTabBarScrollContentPadding } from './LightBottomTabBar';
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
import { brandFontHeadMedium, brandFontSans, brandFontSansSemibold } from './brandFont';
import {
  settingsCleanPalette,
  SettingsCleanHero,
  SettingsCleanPressRow,
  SettingsCleanFootnote,
} from './settingsCleanUi';

const ANDROID_PACKAGE = 'com.kraina.app';
const DARK_CARD_FILL = '#1A1D26';
const DARK_MUTED = 'rgba(255, 255, 255, 0.72)';
const ACCENT_DIM = 'rgba(225, 255, 0, 0.14)';
const BRAND_BLUE = '#6286E4';
const ACCENT = '#E1FF00';
const FIGMA_LSP = -0.14;

const CANCEL_REASON_DEFS = [
  { id: 'too_expensive', labelKey: 'cancelReasonTooExpensive', icon: 'wallet-outline' },
  { id: 'rarely_use', labelKey: 'cancelReasonRarelyUse', icon: 'time-outline' },
  { id: 'missing_features', labelKey: 'cancelReasonMissingFeatures', icon: 'sparkles-outline' },
  { id: 'bugs_crash', labelKey: 'cancelReasonBugs', icon: 'bug-outline' },
  { id: 'switched_app', labelKey: 'cancelReasonOtherApp', icon: 'swap-horizontal-outline' },
  { id: 'other', labelKey: 'cancelReasonOther', icon: 'ellipsis-horizontal-outline' },
];


function planLabel(texts, tier) {
  if (tier === 'explorer') return texts.tabExplorer;
  if (tier === 'pro') return texts.tabPro;
  if (tier === 'family') return 'Family';
  return texts.tabFree;
}

function retentionBody(texts, planName) {
  return texts.cancelRetentionDiscountBody.replace(/\{plan\}/g, planName);
}

export default function CancelSubscriptionPage({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const language = useSyncedAppLanguage(route, 'uk');
  const user = route?.params?.user || {};
  const { appTheme, isLight: light, screenBg } = useAppTheme(route?.params?.appTheme);
  const texts = getChoosePlanTexts(language);

  const [paidTier, setPaidTier] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState('reason');
  const [cancelReasons, setCancelReasons] = useState([]);
  const [cancelComment, setCancelComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [retentionUsed, setRetentionUsed] = useState(false);

  const storeSubscriptionsUrl = useMemo(
    () =>
      Platform.OS === 'ios'
        ? 'https://apps.apple.com/account/subscriptions'
        : `https://play.google.com/store/account/subscriptions?package=${ANDROID_PACKAGE}`,
    [],
  );

  const storeManageCta = texts.cancelOpenStoreCta;

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
      const result = await applyRetentionOffer(user);
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

  const palette = settingsCleanPalette(light);
  const labelColor = palette.textMain;
  const mutedColor = palette.textMuted;
  const borderColor = palette.hairline;
  const cardFill = light ? '#FFFFFF' : DARK_CARD_FILL;
  const ripple = light ? rippleOnLightSurface : rippleOnDarkSurface;
  const iconTint = palette.accent;

  const planName = planLabel(texts, paidTier);
  const stepLabels = [texts.cancelStepReasons, texts.cancelStepOffer, texts.cancelStepConfirm];
  const stepIndex = step === 'reason' ? 0 : step === 'offer' ? 1 : 2;

  const stepHero = useMemo(() => {
    if (step === 'offer') {
      return {
        icon: 'gift-outline',
        title: texts.cancelRetentionTitle,
        subtitle: texts.cancelRetentionDiscountTitle,
      };
    }
    if (step === 'confirm') {
      return {
        icon: null,
        title: texts.cancelFinalTitle,
        subtitle: texts.cancelFinalBody,
      };
    }
    return {
      icon: null,
      title: texts.cancelReasonPrompt,
      subtitle: null,
    };
  }, [step, texts]);

  const renderStepMeta = () => (
    <Text style={[styles.stepMeta, brandFontSans, { color: palette.textMuted }]}>
      {`${stepIndex + 1} / ${stepLabels.length} · ${stepLabels[stepIndex]}`}
    </Text>
  );

  const renderCurrentPlanNote = () => (
    <View style={[styles.planNote, { borderColor: palette.hairline, backgroundColor: cardFill }]}>
      <Text style={[styles.planNoteLabel, brandFontSans, { color: palette.textMuted }]}>
        {texts.cancelCurrentPlan}
      </Text>
      <Text style={[styles.planNoteValue, brandFontHeadMedium, { color: palette.textMain }]}>{planName}</Text>
    </View>
  );

  const renderReasonStep = () => (
    <>
      <View style={[styles.reasonGroup, { backgroundColor: cardFill, borderColor: palette.hairline }]}>
        {CANCEL_REASON_DEFS.map(({ id, labelKey, icon }, i) => {
          const on = cancelReasons.includes(id);
          return (
            <Pressable
              key={id}
              onPress={() => toggleCancelReason(id)}
              android_ripple={ripple}
              style={({ pressed }) => [
                styles.reasonRow,
                i < CANCEL_REASON_DEFS.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: palette.hairline,
                },
                pressed && { opacity: 0.88 },
              ]}
            >
              <View style={styles.reasonIconSlot}>
                <Ionicons name={icon} size={22} color={palette.accent} />
              </View>
              <Text
                style={[
                  styles.reasonLabel,
                  brandFontSans,
                  { color: palette.textMain, fontWeight: on ? '600' : '400' },
                ]}
                numberOfLines={2}
              >
                {texts[labelKey]}
              </Text>
              <Ionicons
                name={on ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={on ? palette.accent : palette.textMuted}
              />
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
            color: palette.textMain,
            borderColor: palette.hairline,
            backgroundColor: cardFill,
          },
        ]}
        maxLength={2000}
      />
    </>
  );

  const renderOfferStep = () => (
    <View style={[styles.bonusBlock, { borderLeftColor: palette.accent, backgroundColor: light ? 'rgba(98,134,228,0.07)' : ACCENT_DIM }]}>
      <Text style={[styles.bonusKicker, brandFontSansSemibold, { color: palette.accent }]}>−50%</Text>
      <Text style={[styles.bonusBody, brandFontSans, { color: palette.textMain }]}>
        {retentionBody(texts, planName)}
      </Text>
    </View>
  );

  const renderConfirmStep = () => (
    <>
      <SettingsCleanPressRow
        palette={palette}
        icon="card-outline"
        title={storeManageCta}
        titleStyle={brandFontSansSemibold}
        onPress={() => void Linking.openURL(storeSubscriptionsUrl).catch(() => {})}
        ripple={ripple}
        isLast
      />
      <SettingsCleanFootnote palette={palette} style={brandFontSans}>
        {texts.cancelBillingExplainer}
      </SettingsCleanFootnote>
    </>
  );

  const renderEmptyState = () => {
    const perks = (texts.freeBullets || []).slice(0, 3);
    const goPlans = () =>
      navigation.replace('ChoosePlan', { ...route?.params, fromSettings: true });

    return (
      <View style={styles.emptyWrap}>
        <View style={styles.emptyStage}>
          <Text style={[styles.emptyTitle, brandFontHeadMedium, { color: labelColor }]}>
            {texts.cancelNoActiveTitle}
          </Text>
          <Text style={[styles.emptyBody, { color: mutedColor }]}>{texts.cancelNoActiveBody}</Text>

          <Text style={[styles.emptySection, { color: mutedColor }]}>
            {texts.cancelNoActivePerksTitle.toUpperCase()}
          </Text>
          <View style={styles.emptyPerkCol}>
            {perks.map((line, i) => (
              <View key={i} style={styles.emptyPerkLine}>
                <Ionicons name="checkmark-circle" size={17} color={iconTint} style={styles.emptyPerkMark} />
                <Text style={[styles.emptyPerkText, { color: labelColor }]}>{line}</Text>
              </View>
            ))}
          </View>

          <Pressable
            onPress={goPlans}
            style={({ pressed }) => [
              styles.primaryBtn,
              styles.primaryBtnWide,
              {
                backgroundColor: light ? BRAND_BLUE : ACCENT,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <Text style={[styles.primaryBtnText, { color: light ? '#FFFFFF' : '#101010' }]}>
              {texts.cancelGoPlans}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.emptyBackLink, { opacity: pressed ? 0.72 : 1 }]}
            android_ripple={ripple}
          >
            <Text style={[styles.emptyBackLinkText, { color: mutedColor }]}>{texts.cancelBack}</Text>
          </Pressable>
        </View>
      </View>
    );
  };

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
              {
                backgroundColor: light ? BRAND_BLUE : ACCENT,
                opacity: pressed ? 0.9 : 1,
              },
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
              {
                backgroundColor: light ? BRAND_BLUE : ACCENT,
                opacity: busy ? 0.7 : pressed ? 0.9 : 1,
              },
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
          !loading && !paidTier && styles.scrollContentEmpty,
          {
            paddingBottom: Math.max(28, lightTabBarScrollContentPadding(insets.bottom, 24)),
            paddingHorizontal: 20,
            paddingTop: 8,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={!loading && !paidTier ? styles.emptyListFill : null}>
          {loading ? (
            <ActivityIndicator
              style={{ marginTop: 40 }}
              color={light ? BRAND_BLUE : ACCENT}
            />
          ) : !paidTier ? (
            renderEmptyState()
          ) : (
            <View style={styles.pagePad}>
              {renderStepMeta()}
              <SettingsCleanHero
                palette={palette}
                icon={stepHero.icon}
                iconPosition={step === 'offer' ? 'right' : 'left'}
                title={stepHero.title}
                titleStyle={[brandFontHeadMedium, styles.cancelHeroTitle]}
                subtitle={stepHero.subtitle}
                subtitleStyle={[brandFontSans, styles.cancelHeroSubtitle]}
              />
              {renderCurrentPlanNote()}
              {step === 'reason' ? renderReasonStep() : null}
              {step === 'offer' ? renderOfferStep() : null}
              {step === 'confirm' ? renderConfirmStep() : null}
              {renderActions()}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 16 },
  scrollContentEmpty: {
    flexGrow: 1,
  },
  emptyListFill: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  pagePad: {
    width: '100%',
  },
  cancelHeroTitle: {
    fontSize: 32,
    lineHeight: 40,
  },
  cancelHeroSubtitle: {
    fontSize: 17,
    lineHeight: 24,
  },
  stepMeta: {
    fontSize: 13,
    letterSpacing: 0.35,
    marginBottom: 4,
    textTransform: 'uppercase',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  planNote: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
  },
  planNoteLabel: {
    fontSize: 11,
    letterSpacing: 0.45,
    textTransform: 'uppercase',
    marginBottom: 4,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  planNoteValue: {
    fontSize: 24,
    letterSpacing: -0.3,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  reasonGroup: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 14,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 54,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  reasonIconSlot: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonLabel: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  bonusBlock: {
    borderLeftWidth: 3,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  bonusKicker: {
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.5,
    marginBottom: 6,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  bonusBody: {
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: FIGMA_LSP,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  commentInput: {
    minHeight: 88,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: 'top',
    marginBottom: 8,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    marginBottom: 8,
  },
  actionsCol: {
    marginTop: 8,
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
    fontSize: 16,
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
    fontSize: 16,
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
  emptyWrap: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 16,
  },
  emptyStage: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.45,
    textAlign: 'center',
    marginBottom: 10,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  emptyBody: {
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: FIGMA_LSP,
    textAlign: 'center',
    marginBottom: 22,
    paddingHorizontal: 4,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  emptySection: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.15,
    marginBottom: 10,
    textAlign: 'center',
    opacity: 0.72,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  emptyPerkCol: {
    width: '100%',
    maxWidth: 292,
    marginBottom: 22,
  },
  emptyPerkLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 5,
    gap: 10,
  },
  emptyPerkMark: {
    marginTop: 1,
  },
  emptyPerkText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: FIGMA_LSP,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  emptyBackLink: {
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: 'center',
  },
  emptyBackLinkText: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: FIGMA_LSP,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
});

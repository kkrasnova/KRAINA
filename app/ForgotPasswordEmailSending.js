import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { brandFontHeadLogo, brandFontText } from './brandFont';

const ACCENT = '#E1FF00';
const ACCENT_DARK = '#5A6600';
const TEXT_MUTED = 'rgba(255,255,255,0.66)';
const TEXT_MAIN = 'rgba(255,255,255,0.92)';
const BRAND_TEXT_FONT = brandFontText;
const BRAND_LOGO_FONT = brandFontHeadLogo;

function maskEmail(email) {
  const raw = String(email || '').trim();
  const at = raw.indexOf('@');
  if (at <= 1) return raw;
  const name = raw.slice(0, at);
  const domain = raw.slice(at);
  const visible = name.slice(0, 2);
  return `${visible}${'•'.repeat(Math.min(4, Math.max(1, name.length - 2)))}${domain}`;
}

function BrandLogoText({ compact = false }) {
  const size = compact ? 22 : 26;
  const spacing = compact ? 2.8 : 3.2;
  return (
    <View style={styles.logoRow}>
      <Text style={[styles.logoPart, styles.logoFont, { fontSize: size, letterSpacing: spacing }]}>KRA</Text>
      <Text style={[styles.logoPart, styles.logoFont, styles.logoAccent, { fontSize: size, letterSpacing: spacing }]}>
        Ï
      </Text>
      <Text style={[styles.logoPart, styles.logoFont, { fontSize: size, letterSpacing: spacing }]}>NA</Text>
    </View>
  );
}

function SentCodeMask({ compact = false }) {
  return (
    <View style={styles.codeDigitsRow}>
      {Array.from({ length: 6 }).map((_, index) => (
        <Text key={index} style={[styles.codeDigit, compact && styles.codeDigitCompact]}>
          •
        </Text>
      ))}
    </View>
  );
}

export default function ForgotPasswordEmailSending({
  email,
  title,
  subtitle,
  intro,
  codeLabel = 'Your code',
  compact = false,
  mode = 'sending',
}) {
  const shimmer = useRef(new Animated.Value(0)).current;
  const fly = useRef(new Animated.Value(0)).current;
  const isSent = mode === 'sent';

  useEffect(() => {
    if (isSent) return undefined;
    const shimmerLoop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const flyLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(fly, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fly, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    );
    shimmerLoop.start();
    flyLoop.start();
    return () => {
      shimmerLoop.stop();
      flyLoop.stop();
    };
  }, [fly, isSent, shimmer]);

  const slotOpacity = shimmer.interpolate({
    inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1],
    outputRange: [0.35, 0.85, 0.45, 0.9, 0.4, 0.35],
  });
  const planeX = fly.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 6],
  });

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]} accessibilityLiveRegion="polite">
      <View style={[styles.mailPreview, compact && styles.mailPreviewCompact]}>
        <View style={styles.mailStripe} />
        <View style={styles.mailBody}>
          <BrandLogoText compact={compact} />
          {isSent && intro ? <Text style={[styles.letterIntro, compact && styles.letterIntroCompact]}>{intro}</Text> : null}
          {isSent && email ? <Text style={[styles.letterTo, compact && styles.letterToCompact]}>{maskEmail(email)}</Text> : null}
          <Text style={[styles.codeLabel, compact && styles.codeLabelCompact]}>{codeLabel}</Text>
          <View style={styles.codeSlots}>
            {isSent ? (
              <SentCodeMask compact={compact} />
            ) : (
              Array.from({ length: 6 }).map((_, index) => (
                <Animated.View
                  key={index}
                  style={[
                    styles.codeSlot,
                    compact && styles.codeSlotCompact,
                    {
                      opacity: slotOpacity,
                      transform: [
                        {
                          translateY: shimmer.interpolate({
                            inputRange: [0, 0.5, 1],
                            outputRange: [0, index % 2 === 0 ? -1 : 1, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              ))
            )}
          </View>
          {isSent ? (
            <Text style={[styles.letterHint, compact && styles.letterHintCompact]}>{subtitle}</Text>
          ) : null}
        </View>
        <View style={[styles.planeFloat, isSent && styles.planeFloatSent]}>
          {isSent ? (
            <Ionicons name="checkmark-circle" size={compact ? 16 : 18} color="#EEFF66" />
          ) : (
            <Animated.View style={{ transform: [{ translateX: planeX }] }}>
              <Ionicons name="paper-plane" size={compact ? 14 : 16} color="#EEFF66" />
            </Animated.View>
          )}
        </View>
      </View>

      {!isSent && title ? <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text> : null}
      {!isSent && subtitle ? <Text style={[styles.subtitle, compact && styles.subtitleCompact]}>{subtitle}</Text> : null}
      {!isSent && email ? (
        <View style={styles.emailRow}>
          <Ionicons name="mail-outline" size={14} color={ACCENT} />
          <Text style={styles.email}>{maskEmail(email)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 12,
  },
  wrapCompact: {
    marginBottom: 10,
  },
  mailPreview: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#0F0F10',
    borderWidth: 1,
    borderColor: 'rgba(238, 255, 102, 0.18)',
    marginBottom: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 18,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  mailPreviewCompact: {
    maxWidth: 300,
    marginBottom: 10,
  },
  mailStripe: {
    height: 4,
    backgroundColor: ACCENT,
  },
  mailBody: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 20,
    alignItems: 'center',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  logoPart: {
    color: TEXT_MAIN,
    fontWeight: '700',
  },
  logoAccent: {
    color: ACCENT_DARK,
  },
  logoFont: {
    ...BRAND_LOGO_FONT,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  letterIntro: {
    fontSize: 14,
    lineHeight: 20,
    color: TEXT_MUTED,
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  letterIntroCompact: {
    fontSize: 13,
    lineHeight: 18,
  },
  letterTo: {
    ...BRAND_TEXT_FONT,
    fontSize: 13,
    color: 'rgba(238,255,102,0.82)',
    textAlign: 'center',
    marginBottom: 12,
    fontWeight: '600',
  },
  letterToCompact: {
    fontSize: 12,
    marginBottom: 10,
  },
  codeLabel: {
    ...BRAND_TEXT_FONT,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'rgba(238,255,102,0.72)',
    marginBottom: 10,
  },
  codeLabelCompact: {
    fontSize: 10,
    marginBottom: 8,
  },
  codeSlots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(225, 255, 0, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(238,255,102,0.28)',
    minWidth: '100%',
  },
  codeSlot: {
    width: 28,
    height: 34,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  codeSlotCompact: {
    width: 24,
    height: 30,
  },
  codeDigitsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
  },
  codeDigit: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: 2,
    color: TEXT_MAIN,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  codeDigitCompact: {
    fontSize: 26,
    lineHeight: 30,
  },
  letterHint: {
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 4,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  letterHintCompact: {
    fontSize: 11,
    marginTop: 10,
  },
  planeFloat: {
    position: 'absolute',
    right: 14,
    top: 18,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(225,255,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(238,255,102,0.28)',
  },
  planeFloatSent: {
    backgroundColor: 'rgba(225,255,0,0.14)',
  },
  title: {
    ...BRAND_TEXT_FONT,
    fontSize: 15,
    fontWeight: '600',
    color: ACCENT,
    textAlign: 'center',
    marginBottom: 6,
  },
  titleCompact: {
    fontSize: 14,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.62)',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 8,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  subtitleCompact: {
    fontSize: 12,
    marginBottom: 6,
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  email: {
    ...BRAND_TEXT_FONT,
    fontSize: 13,
    color: '#EEFF66',
    textAlign: 'center',
  },
});


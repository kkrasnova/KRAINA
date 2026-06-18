import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { brandFontText } from './brandFont';
import { rippleOnDarkSurface } from './androidFeedback';

const ACCENT = '#E1FF00';
const LEMON_BRIGHT = '#EEFF66';
const BRAND_TEXT_FONT = brandFontText;

function StepDot({ index, active, current, onPress, canPress }) {
  const dot = (
    <View style={[styles.dotWrap, current && styles.dotWrapCurrent]}>
      <View
        style={[
          styles.dot,
          active && styles.dotActive,
          current && styles.dotCurrent,
        ]}
      />
      {current ? <View style={styles.dotGlow} pointerEvents="none" /> : null}
    </View>
  );

  if (canPress && onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.dotPressable, pressed && styles.dotPressablePressed]}
        android_ripple={rippleOnDarkSurface}
        accessibilityRole="button"
        accessibilityLabel={`Step ${index + 1}`}
      >
        {dot}
      </Pressable>
    );
  }

  return dot;
}

export default function ForgotPasswordStepRail({ steps, currentIndex, onStepPress }) {
  return (
    <View style={styles.root} accessibilityRole="tablist">
      <View style={styles.trackRow}>
        {steps.map((step, index) => {
          const active = index <= currentIndex;
          const current = index === currentIndex;
          const canPress = index < currentIndex;
          return (
            <React.Fragment key={step.id}>
              {index > 0 ? (
                <View style={[styles.connector, active && styles.connectorActive]} />
              ) : null}
              <StepDot
                index={index}
                active={active}
                current={current}
                canPress={canPress}
                onPress={canPress ? () => onStepPress?.(index) : undefined}
              />
            </React.Fragment>
          );
        })}
      </View>
      <View style={styles.labelRow}>
        {steps.map((step, index) => {
          const active = index <= currentIndex;
          const current = index === currentIndex;
          return (
            <Text
              key={`${step.id}-label`}
              style={[
                styles.label,
                active && styles.labelActive,
                current && styles.labelCurrent,
              ]}
              numberOfLines={1}
            >
              {step.label}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    marginBottom: 28,
    paddingHorizontal: 4,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  connector: {
    flex: 1,
    maxWidth: 56,
    height: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginHorizontal: 6,
  },
  connectorActive: {
    backgroundColor: 'rgba(238, 255, 102, 0.55)',
  },
  dotPressable: {
    borderRadius: 999,
  },
  dotPressablePressed: {
    opacity: 0.82,
  },
  dotWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotWrapCurrent: {
    width: 22,
    height: 22,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  dotActive: {
    backgroundColor: 'rgba(238, 255, 102, 0.35)',
    borderColor: 'rgba(238, 255, 102, 0.5)',
  },
  dotCurrent: {
    width: 10,
    height: 10,
    backgroundColor: ACCENT,
    borderColor: LEMON_BRIGHT,
    ...Platform.select({
      ios: {
        shadowColor: LEMON_BRIGHT,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.85,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  dotGlow: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: 'rgba(225, 255, 0, 0.12)',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  label: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 14,
    color: 'rgba(255,255,255,0.38)',
    ...(Platform.OS === 'android'
      ? { fontFamily: 'sans-serif', includeFontPadding: false }
      : { ...BRAND_TEXT_FONT, fontWeight: '400' }),
  },
  labelActive: {
    color: 'rgba(238, 255, 102, 0.72)',
  },
  labelCurrent: {
    color: LEMON_BRIGHT,
    fontWeight: '600',
  },
});

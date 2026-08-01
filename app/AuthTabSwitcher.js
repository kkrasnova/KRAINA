import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { brandFontText } from './brandFont';
import { rippleOnDarkSurface } from './androidFeedback';
import FittingText from './FittingText';

const ACCENT = '#E1FF00';
const TEXT_DARK = '#121212';
const BORDER = 'rgba(255, 255, 255, 0.22)';
const INACTIVE_TEXT = '#FFFFFF';

const BRAND_TEXT_FONT = brandFontText;

function AuthTabButton({ label, selected, onPress, accessibilityLabel }) {
  return (
    <View style={styles.tabSlot}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          selected ? styles.buttonActive : styles.buttonInactive,
          pressed && styles.buttonPressed,
        ]}
        android_ripple={rippleOnDarkSurface}
        accessibilityRole="tab"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ selected }}
      >
        <FittingText
          style={[styles.buttonText, selected ? styles.buttonTextActive : styles.buttonTextInactive]}
          minimumFontScale={0.7}
        >
          {label}
        </FittingText>
      </Pressable>
    </View>
  );
}

export default function AuthTabSwitcher({
  activeTab,
  onChange,
  loginLabel,
  registerLabel,
  style,
}) {
  return (
    <View style={[styles.row, style]} accessibilityRole="tablist">
      <AuthTabButton
        label={loginLabel}
        selected={activeTab === 'login'}
        onPress={() => onChange('login')}
        accessibilityLabel={loginLabel}
      />
      <AuthTabButton
        label={registerLabel}
        selected={activeTab === 'register'}
        onPress={() => onChange('register')}
        accessibilityLabel={registerLabel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
    alignItems: 'stretch',
  },
  tabSlot: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  button: {
    width: '100%',
    minHeight: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  buttonInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: BORDER,
  },
  buttonActive: {
    backgroundColor: ACCENT,
    borderWidth: 1,
    borderColor: '#B8D600',
    ...Platform.select({
      ios: {
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonText: {
    fontSize: Platform.OS === 'ios' ? 11 : 13,
    lineHeight: Platform.OS === 'ios' ? 14 : 16,
    textAlign: 'center',
    width: '100%',
  },
  buttonTextInactive: {
    color: INACTIVE_TEXT,
    ...(Platform.OS === 'android'
      ? { fontFamily: 'sans-serif-medium', includeFontPadding: false }
      : { ...BRAND_TEXT_FONT, fontWeight: '500' }),
  },
  buttonTextActive: {
    color: TEXT_DARK,
    ...(Platform.OS === 'android'
      ? { fontFamily: 'sans-serif-medium', includeFontPadding: false }
      : { ...BRAND_TEXT_FONT, fontWeight: '700' }),
  },
});
